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
 * The transport: what plays, when, and where the music has got to.
 *
 * Notes are placed on the audio clock, never on a timer. `setTimeout` is subject to the same
 * scheduling as everything else on the main thread, so a note fired from one arrives late by
 * however long the page was busy, and a page that engraves a score while playing another is
 * busy for hundreds of milliseconds. The loop here therefore does nothing but hand the audio
 * clock the notes falling due in the next fraction of a second - the standard Web Audio
 * lookahead - and the clock places them exactly.
 *
 * Position is derived from the same clock rather than counted, so the highlight cannot drift
 * away from the sound no matter how busy the page gets.
 *
 * @module     local_sheetmusic/playback/scheduler
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

/** @type {number} Milliseconds of music handed to the audio clock ahead of time. */
const LOOKAHEAD_MS = 150;

/** @type {number} Milliseconds between passes of the scheduling loop. */
const INTERVAL_MS = 25;

/** @type {number} Milliseconds of silence to sit through before declaring the piece over. */
const TAIL_MS = 250;

/**
 * Ask for the next redraw.
 *
 * requestAnimationFrame is the right way to drive a highlight - it stops when the tab is hidden,
 * which a timer does not - but it is absent from some embedded webviews, and the highlight
 * falling back to a timer is much better than the transport throwing. The position is read off
 * the audio clock either way, so a coarser redraw is less smooth and never wrong.
 *
 * @param {Function} draw What to run.
 * @returns {object} A handle to pass to `cancelFrame()`.
 */
const nextFrame = (draw) => (typeof window.requestAnimationFrame === 'function'
    ? {frame: window.requestAnimationFrame(draw)}
    : {timer: window.setTimeout(draw, 50)});

/**
 * Cancel a pending redraw.
 *
 * @param {object} handle What `nextFrame()` returned.
 * @returns {void}
 */
const cancelFrame = (handle) => {
    if (!handle) {
        return;
    }
    if ('frame' in handle && typeof window.cancelAnimationFrame === 'function') {
        window.cancelAnimationFrame(handle.frame);
    } else if ('timer' in handle) {
        window.clearTimeout(handle.timer);
    }
};

/**
 * Build a transport for one score.
 *
 * @param {object} spec {context, pool, notes, durationMs, cursor, onState, onProgress}.
 * @returns {object} The transport.
 */
export const createTransport = (spec) => {
    const {context, pool, notes, durationMs, cursor} = spec;
    const onState = spec.onState || (() => {
        // A caller that does not care what the transport is doing.
    });
    const onProgress = spec.onProgress || (() => {
        // A caller that does not draw a progress indicator.
    });

    /** @type {number} Playing speed as a multiple of the score's own tempo. */
    let rate = 1;
    /** @type {boolean} Whether the transport is running. */
    let playing = false;
    /** @type {number} Score position of the anchor, in milliseconds. */
    let originScore = 0;
    /** @type {number} Audio-clock time of the anchor, in seconds. */
    let originAudio = 0;
    /** @type {number} The next note that has not been handed to the clock. */
    let next = 0;
    /** @type {*} The scheduling loop's timer. */
    let timer = null;
    /** @type {object|null} The pending redraw of the highlight. */
    let frame = null;

    /** @returns {number} Where the music has got to, in score milliseconds. */
    const positionMs = () => originScore + (context.currentTime - originAudio) * 1000 * rate;

    /**
     * When a score position falls due on the audio clock.
     *
     * @param {number} ms The score position.
     * @returns {number} Context seconds.
     */
    const audioTimeOf = (ms) => originAudio + ((ms - originScore) / 1000) / rate;

    /**
     * Hand the audio clock everything falling due shortly.
     *
     * @returns {void}
     */
    const pump = () => {
        if (!playing) {
            return;
        }
        const horizon = positionMs() + LOOKAHEAD_MS * rate;
        while (next < notes.length && notes[next].startMs <= horizon) {
            const note = notes[next];
            const startAt = audioTimeOf(note.startMs);
            pool.play({
                pitch: note.pitch,
                velocity: note.velocity,
                // A note whose moment has already slipped past is started now rather than in
                // the past, which Web Audio would otherwise silently drop.
                startAt: Math.max(startAt, context.currentTime),
                endAt: Math.max(audioTimeOf(note.endMs), context.currentTime + 0.02),
            });
            next++;
        }
        if (positionMs() >= durationMs + TAIL_MS) {
            finish();
        }
    };

    /**
     * Redraw the highlight for wherever the music has got to.
     *
     * @returns {void}
     */
    const draw = () => {
        if (!playing) {
            return;
        }
        const at = positionMs();
        if (cursor) {
            cursor.at(at);
        }
        onProgress(Math.min(at, durationMs), durationMs);
        frame = nextFrame(draw);
    };

    /**
     * Stop the loops and let go of the notes still sounding.
     *
     * @param {string} state What to report having become.
     * @returns {void}
     */
    const halt = (state) => {
        playing = false;
        if (timer !== null) {
            window.clearInterval(timer);
            timer = null;
        }
        if (frame !== null) {
            cancelFrame(frame);
            frame = null;
        }
        pool.stopAll();
        if (cursor) {
            cursor.clear();
        }
        onProgress(0, durationMs);
        onState(state);
    };

    /**
     * Reach the end of the piece.
     *
     * @returns {void}
     */
    const finish = () => halt('ended');

    return {
        /**
         * Start playing from the beginning.
         *
         * @returns {void}
         */
        start: () => {
            if (playing) {
                return;
            }
            playing = true;
            next = 0;
            originScore = 0;
            originAudio = context.currentTime;
            if (cursor) {
                cursor.clear();
            }
            onState('playing');
            pump();
            timer = window.setInterval(pump, INTERVAL_MS);
            frame = nextFrame(draw);
        },
        /**
         * Stop, because someone asked.
         *
         * @returns {void}
         */
        stop: () => {
            if (playing) {
                halt('stopped');
            }
        },
        /**
         * Change the playing speed, taking effect from now.
         *
         * The moment is re-anchored first, so the music already played keeps the speed it was
         * played at and only what follows changes.
         *
         * @param {number} value A multiple of the score's own tempo.
         * @returns {void}
         */
        setRate: (value) => {
            const wanted = Math.min(2, Math.max(0.25, Number(value) || 1));
            if (playing) {
                originScore = positionMs();
                originAudio = context.currentTime;
            }
            rate = wanted;
        },
        /** @returns {number} The playing speed. */
        rate: () => rate,
        /** @returns {boolean} Whether the transport is running. */
        isPlaying: () => playing,
        /** @returns {number} Where the music has got to, in score milliseconds. */
        position: () => (playing ? positionMs() : 0),
        /**
         * Run one pass of the scheduling loop. The loop calls this; tests call it directly.
         *
         * @returns {void}
         */
        pump,
    };
};
