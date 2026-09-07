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
 * Verovio's MIDI into a list of notes the transport can schedule.
 *
 * This module is where playback's correctness lives, and it is pure: bytes in, notes out, no
 * Web Audio and no DOM. Everything a listener would notice going wrong - a tie struck twice, a
 * key signature ignored, a dotted rhythm evened out, a repeat dropped - is decided by Verovio
 * before this module sees anything, and is therefore checked here against the fixture corpus
 * rather than by ear.
 *
 * Two details of the engine's output are not obvious and are relied on:
 *
 * 1. **A tie is already one note.** `ties.abc` is six noteheads and four sounding notes, and
 *    the MIDI carries four. Driving audio from the timemap instead would strike the second
 *    half of every tie.
 * 2. **Every note is released one tick early.** At the 120 ticks per beat Verovio writes, that
 *    is about 4 ms at 120 bpm. It is deliberate - it is what lets a repeated note retrigger -
 *    so durations are faithful to within that tick and are not rounded back up here.
 *
 * @module     local_sheetmusic/playback/events
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

import {MAX_PLAYBACK_NOTES} from 'local_sheetmusic/limits';
import {ensureParser} from 'local_sheetmusic/midi';
import {fromBase64} from 'local_sheetmusic/export/binary';

/** @type {number} Microseconds per quarter note at 120 bpm, which MIDI assumes until told. */
const DEFAULT_TEMPO = 500000;

/**
 * Merge every track into one absolute-tick event list.
 *
 * Format 0 files put everything on one track and format 1 files split the meta events onto a
 * track of their own; playback should not care which it was handed.
 *
 * @param {object} parsed What midi-file's parseMidi returned.
 * @returns {object[]} Events with an absolute `tick`, in tick order.
 */
const absolute = (parsed) => {
    const events = [];
    parsed.tracks.forEach((track) => {
        let tick = 0;
        track.forEach((event) => {
            tick += event.deltaTime;
            events.push({...event, tick});
        });
    });
    // A stable sort keeps a note-off ahead of the note-on that shares its tick, which is what
    // lets a repeated note close before it reopens.
    return events
        .map((event, at) => ({event, at}))
        .sort((a, b) => a.event.tick - b.event.tick || a.at - b.at)
        .map((entry) => entry.event);
};

/**
 * Build the function that converts a tick position into milliseconds.
 *
 * A score may change tempo part way through - a rallentando written as a tempo mark, or a
 * repeat taken at a different speed - so the conversion cannot be a single multiplication. The
 * tempo map is walked once and the elapsed time is accumulated across each segment.
 *
 * @param {object[]} events Absolute-tick events.
 * @param {number} ticksPerBeat The file's division.
 * @returns {Function} Takes a tick, returns milliseconds.
 */
const clockOf = (events, ticksPerBeat) => {
    const changes = events
        .filter((event) => event.meta && event.type === 'setTempo')
        .map((event) => ({tick: event.tick, tempo: event.microsecondsPerBeat || DEFAULT_TEMPO}));

    // Segments of constant tempo, each carrying the time elapsed before it began.
    const segments = [{tick: 0, ms: 0, tempo: changes.length && changes[0].tick === 0
        ? changes[0].tempo
        : DEFAULT_TEMPO}];
    changes.forEach((change) => {
        if (change.tick === 0) {
            segments[0].tempo = change.tempo;
            return;
        }
        const last = segments[segments.length - 1];
        const ms = last.ms + ((change.tick - last.tick) / ticksPerBeat) * (last.tempo / 1000);
        segments.push({tick: change.tick, ms, tempo: change.tempo});
    });

    return (tick) => {
        let segment = segments[0];
        for (let at = 1; at < segments.length && segments[at].tick <= tick; at++) {
            segment = segments[at];
        }
        return segment.ms + ((tick - segment.tick) / ticksPerBeat) * (segment.tempo / 1000);
    };
};

/**
 * Turn a parsed MIDI file into notes.
 *
 * Exported separately from `notesOf()` so the fixture tests can drive it without a parser.
 *
 * @param {object} parsed What midi-file's parseMidi returned.
 * @returns {object} {notes, durationMs} - notes are {pitch, velocity, startMs, endMs}, in
 *                   start order, and durationMs is where the last of them stops sounding.
 * @throws {Error} If the score carries more notes than may be played.
 */
export const fromParsed = (parsed) => {
    const ticksPerBeat = (parsed.header && parsed.header.ticksPerBeat) || 480;
    const events = absolute(parsed);
    const clock = clockOf(events, ticksPerBeat);

    // Keyed by channel and pitch together: the same pitch sounding on two channels at once is
    // two notes, and closing the wrong one silently shortens whichever was opened first.
    const open = new Map();
    const notes = [];
    const keyOf = (event) => `${event.channel || 0}:${event.noteNumber}`;

    events.forEach((event) => {
        if (event.meta) {
            return;
        }
        const starting = event.type === 'noteOn' && event.velocity > 0;
        const stopping = event.type === 'noteOff' || (event.type === 'noteOn' && !event.velocity);
        if (starting) {
            // A second note-on for a pitch already sounding closes the first: nothing in a
            // score should do this, but a malformed file should not leak a note that never ends.
            if (open.has(keyOf(event))) {
                open.get(keyOf(event)).endMs = clock(event.tick);
            }
            const note = {
                pitch: event.noteNumber,
                velocity: (event.velocity || 64) / 127,
                startMs: clock(event.tick),
                endMs: null,
            };
            open.set(keyOf(event), note);
            notes.push(note);
            if (notes.length > MAX_PLAYBACK_NOTES) {
                throw new Error('local_sheetmusic: this score has too many notes to play');
            }
        } else if (stopping && open.has(keyOf(event))) {
            open.get(keyOf(event)).endMs = clock(event.tick);
            open.delete(keyOf(event));
        }
    });

    // A note left open by a truncated file still has to stop, or it sounds for ever.
    let last = 0;
    notes.forEach((note) => {
        last = Math.max(last, note.startMs, note.endMs === null ? 0 : note.endMs);
    });
    notes.forEach((note) => {
        if (note.endMs === null || note.endMs <= note.startMs) {
            note.endMs = Math.max(note.startMs + 1, last);
        }
    });

    notes.sort((a, b) => a.startMs - b.startMs || a.pitch - b.pitch);
    return {notes, durationMs: notes.reduce((end, note) => Math.max(end, note.endMs), 0)};
};

/**
 * Read base64 MIDI into notes.
 *
 * @param {string} base64 What the engraver returned.
 * @returns {Promise<object>} {notes, durationMs}.
 */
export const notesOf = async(base64) => {
    const parse = await ensureParser();
    return fromParsed(parse(fromBase64(base64)));
};
