// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// Moodle is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Moodle.  If not, see <https://www.gnu.org/licenses/>.

/**
 * The one audio context the page uses, and the voices playing on it.
 *
 * A context is created on the first press of a play button and never before. That is not
 * tidiness: browsers refuse to start audio outside a user gesture, and a context created at
 * page load would sit suspended holding an audio device open on every page that happens to
 * show a score. Between pieces the context is suspended again for the same reason.
 *
 * @module     local_sheetmusic/playback/audio
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

import {MAX_VOICES} from 'local_sheetmusic/limits';
import {createVoice} from 'local_sheetmusic/playback/voice';

/** @type {AudioContext|null} The shared context, once something has played. */
let context = null;

/** @type {GainNode|null} Everything plays through this. */
let master = null;

/** @type {Function|null} Test seam: overrides how a context is obtained. */
let contextFactory = null;

/**
 * Replace the context factory. Intended for unit tests, which have no audio device.
 *
 * @param {Function|null} factory Returns an AudioContext, or null to reset.
 * @returns {void}
 */
export const setContextFactory = (factory) => {
    contextFactory = factory;
    context = null;
    master = null;
};

/**
 * Whether this browser can play anything at all.
 *
 * Checked before a control is offered, so that a browser without Web Audio - and the headless
 * ones used for acceptance testing - get no button rather than a button that does nothing.
 *
 * @returns {boolean} True if audio can be started.
 */
export const isSupported = () => Boolean(
    contextFactory || (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext))
);

/**
 * Get the context, creating it on first use.
 *
 * Must be called from inside a user gesture the first time, or the context is born suspended.
 *
 * @returns {Promise<AudioContext|null>} The context, or null if audio is unavailable.
 */
export const getContext = async() => {
    if (!context) {
        if (!isSupported()) {
            return null;
        }
        const Ctor = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
        context = contextFactory ? contextFactory() : new Ctor();
        master = context.createGain();
        // Headroom: a dozen voices at full level sum past 1.0 and clip, which is heard as a
        // crackle rather than as loudness.
        master.gain.value = 0.7;
        master.connect(context.destination);
    }
    if (context.state === 'suspended' && typeof context.resume === 'function') {
        await context.resume();
    }
    return context;
};

/**
 * Let the audio device go, until something plays again.
 *
 * @returns {Promise<void>}
 */
export const idle = async() => {
    if (context && context.state === 'running' && typeof context.suspend === 'function') {
        await context.suspend();
    }
};

/**
 * A pool of sounding notes, with a ceiling on how many may sound at once.
 *
 * @param {AudioContext} audioContext The context to play on.
 * @returns {object} {play, stopAll, size}.
 */
export const createVoicePool = (audioContext) => {
    /** @type {object[]} Voices that have been scheduled and not yet finished. */
    let voices = [];

    /**
     * Forget voices whose sound has already ended.
     *
     * @returns {void}
     */
    const reap = () => {
        const now = audioContext.currentTime;
        voices = voices.filter((voice) => voice.endAt > now);
    };

    return {
        /**
         * Schedule one note.
         *
         * @param {object} note {pitch, velocity, startAt, endAt} in context seconds.
         * @returns {object} The voice.
         */
        play: (note) => {
            reap();
            if (voices.length >= MAX_VOICES) {
                // Steal the voice that started longest ago: releasing it early is far less
                // noticeable than refusing the note that is being asked for now.
                const oldest = voices.reduce((worst, voice) => (voice.startAt < worst.startAt ? voice : worst), voices[0]);
                oldest.stop();
                voices = voices.filter((voice) => voice !== oldest);
            }
            const voice = createVoice(audioContext, master || audioContext.destination, note);
            voices.push(voice);
            return voice;
        },
        /**
         * Silence everything at once.
         *
         * @returns {void}
         */
        stopAll: () => {
            voices.forEach((voice) => voice.stop());
            voices = [];
        },
        /**
         * How many voices are sounding.
         *
         * @returns {number} The count.
         */
        size: () => {
            reap();
            return voices.length;
        },
    };
};
