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
 * One sounding note, built out of Web Audio nodes.
 *
 * The suite ships no recorded instrument. A sampled piano is several megabytes of audio per
 * instrument, and this plugin installs on hosts where the 7 MB engraver is already the largest
 * thing in it; a synthesised tone costs nothing to download, works offline, and is enough for
 * what the scores here are for - hearing an exercise, checking an interval, following a line.
 * It is not a concert instrument and does not pretend to be one.
 *
 * The tone is two detuned oscillators through a lowpass whose cutoff falls with the note, which
 * is the cheapest arrangement that reads as struck rather than as a test tone: the beating
 * between the two oscillators gives it body, and the falling cutoff gives it an attack.
 *
 * @module     local_sheetmusic/playback/voice
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

/** @type {number} Seconds the envelope takes to reach full level. */
const ATTACK = 0.008;

/** @type {number} Seconds the envelope takes to fall to its held level. */
const DECAY = 0.28;

/** @type {number} Fraction of peak the note holds at while it is still down. */
const SUSTAIN = 0.62;

/** @type {number} Seconds the note takes to fall silent after it is released. */
const RELEASE = 0.14;

/** @type {number} Cents the second oscillator is detuned by. */
const DETUNE = 6;

/**
 * The frequency of a MIDI note number.
 *
 * @param {number} pitch The MIDI note number, where 69 is A above middle C.
 * @returns {number} Hertz.
 */
export const frequencyOf = (pitch) => 440 * Math.pow(2, (pitch - 69) / 12);

/**
 * Start one note, and return the handle that stops it.
 *
 * Both times are on the audio clock, which is the only clock accurate enough to place a note:
 * timers drift, and a note placed by a timer arrives audibly late.
 *
 * @param {AudioContext} context The audio context.
 * @param {AudioNode} destination What to play into.
 * @param {object} note {pitch, velocity, startAt, endAt} - the two times in context seconds.
 * @returns {object} {endAt, release, stop} - `release(at)` brings the note down early.
 */
export const createVoice = (context, destination, note) => {
    const frequency = frequencyOf(note.pitch);
    const peak = 0.28 * (0.35 + 0.65 * note.velocity);

    const gain = context.createGain();
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.connect(gain);
    gain.connect(destination);

    const oscillators = [0, DETUNE].map((cents) => {
        const oscillator = context.createOscillator();
        oscillator.type = cents ? 'triangle' : 'sawtooth';
        oscillator.frequency.value = frequency;
        oscillator.detune.value = cents;
        oscillator.connect(filter);
        return oscillator;
    });

    const start = note.startAt;
    // A cutoff that starts high and falls is what makes the onset read as a strike. It is
    // pinned above the note's own frequency so that the note never disappears under its filter.
    filter.frequency.setValueAtTime(Math.min(12000, frequency * 8), start);
    filter.frequency.exponentialRampToValueAtTime(Math.max(frequency * 2, 320), start + DECAY);
    filter.Q.value = 0.7;

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + ATTACK);
    gain.gain.exponentialRampToValueAtTime(Math.max(peak * SUSTAIN, 0.0002), start + ATTACK + DECAY);

    let stopAt = Math.max(note.endAt, start + ATTACK + 0.01);
    let stopped = false;

    /**
     * Bring the note down, from a moment onwards.
     *
     * @param {number} at When to begin the release, in context seconds.
     * @returns {void}
     */
    const release = (at) => {
        const from = Math.max(at, start + ATTACK);
        gain.gain.cancelScheduledValues(from);
        // Pinned to the value the ramp had reached, or the release starts from whatever the
        // last scheduled point was and the note jumps in level as it ends.
        gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0002), from);
        gain.gain.exponentialRampToValueAtTime(0.0001, from + RELEASE);
        stopAt = from + RELEASE;
        oscillators.forEach((oscillator) => oscillator.stop(stopAt + 0.02));
    };

    // Start before scheduling the release: stop() on an oscillator that has not been started
    // throws InvalidStateError, and the note is then lost rather than merely mistimed.
    oscillators.forEach((oscillator) => oscillator.start(start));
    release(stopAt);

    return {
        get endAt() {
            return stopAt;
        },
        startAt: start,
        release,
        /**
         * Stop the note now, whatever it was doing.
         *
         * @returns {void}
         */
        stop: () => {
            if (stopped) {
                return;
            }
            stopped = true;
            const now = context.currentTime;
            try {
                gain.gain.cancelScheduledValues(now);
                gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0002), now);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);
                oscillators.forEach((oscillator) => oscillator.stop(now + 0.05));
            } catch (error) {
                // A voice whose oscillators have already stopped throws on a second stop; the
                // note is silent either way, which is all the caller wanted.
                oscillators.forEach((oscillator) => oscillator.disconnect());
            }
        },
    };
};
