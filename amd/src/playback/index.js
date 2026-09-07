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
 * Playing an engraved score.
 *
 * The one entry point the rest of the suite uses: give it a rendered score and it gains a
 * transport. The filter attaches to every score on the page, and the editor attaches to its
 * preview; neither knows anything about audio.
 *
 * Nothing is prepared until the reader presses play. A page of worked examples engraves the
 * scores as they are scrolled to and stops there; the MIDI, the timemap, the audio context and
 * the second engine are all built on the first press, for that one score.
 *
 * **The score is re-engraved when it is first played, and the fresh SVG replaces the one on the
 * page.** Verovio regenerates element ids on every load, so a timemap obtained later describes
 * a score whose ids are not the ones in the page; rendering both together and swapping is what
 * keeps the highlight pointing at the right notes. The output is identical apart from the ids,
 * so nothing moves.
 *
 * @module     local_sheetmusic/playback
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

import {createControls, loadStrings} from 'local_sheetmusic/playback/controls';
import {createCursor, spansOf} from 'local_sheetmusic/playback/cursor';
import {createTransport} from 'local_sheetmusic/playback/scheduler';
import {createVoicePool, getContext, idle, isSupported} from 'local_sheetmusic/playback/audio';
import {notesOf} from 'local_sheetmusic/playback/events';
import {renderWithAudio} from 'local_sheetmusic/engraver';

/** @type {string} Marks a score as already carrying a transport. */
const ATTACHED = 'sheetmusicPlayback';

/** @type {object|null} The player currently sounding, if any. */
let current = null;

/** @type {number} Distinguishes the controls of one score from another's. */
let counter = 0;

/**
 * Stop whatever is playing.
 *
 * One score at a time, per page: a reader who presses play on a second example is asking to
 * hear that one, not both at once.
 *
 * @returns {void}
 */
export const stopAll = () => {
    if (current) {
        current.stop();
    }
};

/**
 * Put the freshly engraved score on the page in place of the one already there.
 *
 * @param {Element} figure The element the notation lives in.
 * @param {string} svg The new SVG.
 * @returns {Element|null} The element the notation now lives in.
 */
const swapRendering = (figure, svg) => {
    if (!figure) {
        return null;
    }
    figure.innerHTML = svg;
    const element = figure.querySelector('svg');
    if (element) {
        // The container is the labelled image; the SVG must stay out of the accessibility tree
        // or a screen reader announces a second, unnamed image after the real description.
        element.setAttribute('aria-hidden', 'true');
        element.setAttribute('focusable', 'false');
    }
    return figure;
};

/**
 * Give one rendered score a transport.
 *
 * Does nothing where audio is unavailable - an old browser, or a headless one - so that a
 * reader is never shown a button that cannot work.
 *
 * @param {Element} block The element the transport is added to.
 * @param {object} spec {source, format, options, figure} - the source to play, how to engrave
 *                      it, and the element holding the engraved SVG. `figure` defaults to the
 *                      `.sheetmusic-render` inside the block, which is what the filter emits;
 *                      the editor passes its preview pane instead.
 * @returns {Promise<object|null>} A handle with `detach()`, or null if nothing was attached.
 */
export const attach = async(block, spec) => {
    if (!block || block.dataset[ATTACHED] || !isSupported() || !spec || !spec.source) {
        return null;
    }
    block.dataset[ATTACHED] = '1';

    let strings;
    try {
        strings = await loadStrings();
    } catch (error) {
        // Without strings there is nothing to label a button with, so the score simply stays
        // as it was rather than growing an unlabelled control.
        delete block.dataset[ATTACHED];
        return null;
    }

    counter++;
    const id = `sheetmusic-playback-${counter}`;
    const figureOf = () => spec.figure || block.querySelector('.sheetmusic-render');

    /** @type {object|null} Everything the first press builds, kept for later presses. */
    let prepared = null;
    /** @type {object|null} The transport, once there is something to play. */
    let transport = null;

    const controls = createControls({
        strings,
        id,
        onToggle: () => {
            // eslint-disable-next-line no-use-before-define
            toggle();
        },
        onRate: (rate) => {
            if (transport) {
                transport.setRate(rate);
            }
        },
    });

    /**
     * Build everything needed to play this score, once.
     *
     * @returns {Promise<object>} {notes, durationMs, spans}.
     */
    const prepare = async() => {
        if (prepared) {
            return prepared;
        }
        const {svg, midi, timemap} = await renderWithAudio(spec.source, spec.format, spec.options || {});
        swapRendering(figureOf(), svg);
        const {notes, durationMs} = await notesOf(midi);
        prepared = {notes, durationMs, spans: spansOf(timemap)};
        return prepared;
    };

    /**
     * Start or stop, depending on what is happening now.
     *
     * @returns {Promise<void>}
     */
    const toggle = async() => {
        if (transport && transport.isPlaying()) {
            transport.stop();
            return;
        }
        stopAll();
        controls.setState('preparing');
        try {
            const {notes, durationMs, spans} = await prepare();
            if (!notes.length) {
                controls.setState('stopped');
                controls.say(strings.playbackfailed);
                return;
            }
            // Created inside the gesture that asked for sound, which is what browsers require.
            const context = await getContext();
            if (!context) {
                controls.setState('failed');
                return;
            }
            transport = createTransport({
                context,
                pool: createVoicePool(context),
                notes,
                durationMs,
                cursor: createCursor(figureOf(), spans),
                onState: (state) => {
                    controls.setState(state);
                    if (state !== 'playing') {
                        if (current === transport) {
                            current = null;
                        }
                        idle();
                    }
                },
            });
            transport.setRate(controls.rate());
            current = transport;
            transport.start();
        } catch (error) {
            controls.setState('failed');
            window.console.error('local_sheetmusic: unable to play score', error);
        }
    };

    block.appendChild(controls.element);

    return {
        /**
         * Take the transport away, silencing it first.
         *
         * Called when the score leaves the page - a dialogue closing, a preview being
         * re-engraved - because a transport whose score has gone would otherwise play on.
         *
         * @returns {void}
         */
        detach: () => {
            if (transport) {
                transport.stop();
                if (current === transport) {
                    current = null;
                }
            }
            if (controls.element.parentNode) {
                controls.element.parentNode.removeChild(controls.element);
            }
            delete block.dataset[ATTACHED];
        },
    };
};
