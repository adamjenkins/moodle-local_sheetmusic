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
 * Turning spans of time into written note values, and laying them into bars.
 *
 * This is the arithmetic that sits between "this note lasts 2,880 ticks" and "this is a dotted
 * half note, and it starts a bar". It has nothing to do with MIDI - the MIDI importer is
 * simply its first caller, and Phase 3's note entry will be its second - so it lives on its
 * own rather than inside either.
 *
 * @module     local_sheetmusic/barring
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

import {DURATIONS, eventTicks} from 'local_sheetmusic/model';

/**
 * Every note value the model can hold, longest first, with its length in ticks.
 *
 * @type {object[]}
 */
const LENGTHS = DURATIONS
    .flatMap((duration) => [0, 1, 2].map((dots) => ({duration, dots, ticks: eventTicks({duration, dots})})))
    .sort((a, b) => b.ticks - a.ticks);

/**
 * Express a span of ticks as note values, to be tied together when it takes more than one.
 *
 * Greedy from the longest value down. A span that no combination reaches exactly - anything
 * finer than a doubly dotted 64th - keeps whatever was matched and drops the remainder, which
 * is a rounding error of under a 64th note.
 *
 * @param {number} ticks The span.
 * @returns {object[]} {duration, dots} in order; every one but the last is tied to the next.
 */
export const splitTicks = (ticks) => {
    const parts = [];
    let left = ticks;
    while (left > 0) {
        const remaining = left;
        const part = LENGTHS.find((candidate) => candidate.ticks <= remaining);
        if (!part) {
            break;
        }
        parts.push({duration: part.duration, dots: part.dots});
        left -= part.ticks;
    }
    return parts;
};

/**
 * Lay a run of timed events out into bars, splitting anything that crosses a barline.
 *
 * A note split across a barline is tied; a rest is not, because a tied rest is not notation.
 *
 * @param {object[]} spans {event, ticks} in playing order, starting at tick 0 of bar 1. The
 *                        event is a partial model event: kind, and for a note its pitch.
 * @param {number} capacity Ticks in one bar, or Infinity for an unmetred score.
 * @returns {object[]} Bars of model events.
 */
export const intoBars = (spans, capacity) => {
    const bars = [{events: []}];
    let used = 0;
    spans.forEach((span) => {
        let left = span.ticks;
        while (left > 0) {
            if (capacity !== Infinity && used >= capacity) {
                bars.push({events: []});
                used = 0;
            }
            const remaining = left;
            const room = capacity === Infinity ? remaining : Math.min(remaining, capacity - used);
            const parts = splitTicks(room);
            parts.forEach((part, index) => {
                const last = index === parts.length - 1 && room === remaining;
                bars[bars.length - 1].events.push(
                    span.event.kind === 'rest'
                        ? {kind: 'rest', ...part}
                        : {...span.event, ...part, tie: !last}
                );
            });
            used += room;
            left -= room;
        }
    });
    return bars.filter((bar, index) => index === 0 || bar.events.length);
};
