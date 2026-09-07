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
 * Marking the notes being heard, on the score being looked at.
 *
 * The timemap is the right source for this and the MIDI is not: a tie is one sound but two
 * noteheads, and a reader following the music expects the second notehead to light up when the
 * player reaches it. So the cursor follows the timemap while the sound follows the MIDI, and
 * the two agree because the engraver produces them from a single load - `renderWithAudio()`.
 *
 * The highlight is decorative. The engraved SVG is `aria-hidden` inside a labelled `role="img"`
 * container, so nothing here reaches the accessibility tree, and the transport announces state
 * in words instead.
 *
 * @module     local_sheetmusic/playback/cursor
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

/** @type {string} Put on each element while the note it draws is sounding. */
export const PLAYING_CLASS = 'sheetmusic-playing';

/**
 * Turn a timemap into the spans a cursor can walk.
 *
 * @param {object[]} timemap What the engraver returned.
 * @returns {object[]} {id, startMs, endMs}, in start order.
 */
export const spansOf = (timemap) => {
    const started = new Map();
    const spans = [];
    (timemap || []).forEach((entry) => {
        const at = Number(entry.tstamp) || 0;
        (entry.off || []).forEach((id) => {
            if (started.has(id)) {
                started.get(id).endMs = at;
                started.delete(id);
            }
        });
        (entry.on || []).forEach((id) => {
            const span = {id, startMs: at, endMs: null};
            started.set(id, span);
            spans.push(span);
        });
    });

    // Anything the timemap never closes runs to the end of the last entry it does.
    const last = (timemap || []).reduce((end, entry) => Math.max(end, Number(entry.tstamp) || 0), 0);
    spans.forEach((span) => {
        if (span.endMs === null || span.endMs <= span.startMs) {
            span.endMs = Math.max(span.startMs + 1, last);
        }
    });

    return spans.sort((a, b) => a.startMs - b.startMs);
};

/**
 * Build a cursor over one rendered score.
 *
 * @param {Element} root The element the engraved SVG lives in.
 * @param {object[]} spans What `spansOf()` returned.
 * @returns {object} {at, clear} - `at(ms)` shows the moment, `clear()` unmarks everything.
 */
export const createCursor = (root, spans) => {
    /** @type {Map<string, Element|null>} Resolved once each; the SVG does not change while playing. */
    const elements = new Map();
    /** @type {object[]} Spans currently marked. */
    let active = [];
    /** @type {number} The next span that has not started yet. */
    let next = 0;
    /** @type {number} Where the last call was, so going backwards can be detected. */
    let previous = -1;

    const elementFor = (id) => {
        if (!elements.has(id)) {
            let found = null;
            try {
                // Escaped, because these ids are not always the engine's own: Verovio keeps the
                // xml:id it finds in MusicXML and MEI input, so a score can carry an id with a
                // quote or a bracket in it. Unescaped, that is a thrown SyntaxError part way
                // through building the cursor, and the score becomes unplayable.
                const selector = `[data-id="${window.CSS && window.CSS.escape ? window.CSS.escape(id) : id}"]`;
                found = root ? root.querySelector(selector) : null;
            } catch (error) {
                found = null;
            }
            elements.set(id, found);
        }
        return elements.get(id);
    };

    const mark = (span, on) => {
        const element = elementFor(span.id);
        if (element && element.classList) {
            element.classList.toggle(PLAYING_CLASS, on);
        }
    };

    const clear = () => {
        active.forEach((span) => mark(span, false));
        active = [];
        next = 0;
        previous = -1;
    };

    return {
        /**
         * Mark whatever is sounding at a moment.
         *
         * @param {number} ms Milliseconds from the start of the score.
         * @returns {void}
         */
        at: (ms) => {
            // Restarting, or being dragged backwards, invalidates the walk.
            if (ms < previous) {
                clear();
            }
            previous = ms;
            while (next < spans.length && spans[next].startMs <= ms) {
                mark(spans[next], true);
                active.push(spans[next]);
                next++;
            }
            active = active.filter((span) => {
                if (span.endMs > ms) {
                    return true;
                }
                mark(span, false);
                return false;
            });
        },
        clear,
    };
};
