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
 * What every editing gesture means, as changes to the document model.
 *
 * The toolbar, the keyboard and the mouse all end up here, and nothing here touches the DOM, so
 * the whole edit vocabulary is unit testable under bare node. `apply()` is the only entry point.
 *
 * # Why an edit rewrites the bars
 *
 * The model appends events into bars and refuses to split one across a barline, which is right
 * for building a score up but not for editing one in the middle: inserting a crotchet into the
 * second bar of a full score would leave that bar a beat too long and every later bar unchanged.
 * So every edit that changes the sequence of events re-packs the whole sequence into bars for
 * the metre in force, as one `batch` command. The bar structure is therefore derived, never
 * authored, and one gesture is still exactly one undo step.
 *
 * # The selection
 *
 * A selection is one index into the flattened sequence of events, not a (bar, event) pair,
 * because re-packing moves events between bars. `null` means nothing is selected, and new notes
 * then go to the end. A new note is always inserted *after* the selection and becomes the
 * selection, so holding a note name types a phrase left to right.
 *
 * @module     local_sheetmusic/editor/actions
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

import {barTicks, DURATIONS, eventTicks, normaliseEvent} from 'local_sheetmusic/model';
import {clefBottom, diatonic, fromDiatonic} from 'local_sheetmusic/editor/surface-notes';

/** @type {object} What a fresh entry state looks like: a crotchet, no dots, no accidental, not a rest. */
export const DEFAULT_ENTRY = {duration: 4, dots: 0, alter: null, rest: false};

/** @type {number[]} The durations the toolbar offers, longest first. A breve is outside the model. */
export const TOOLBAR_DURATIONS = [1, 2, 4, 8, 16];

/** @type {string[]} The clefs the model can hold. */
export const CLEFS = ['treble', 'bass', 'alto', 'tenor', 'treble-8'];

/** @type {string[]} The metres the toolbar offers; any other is still readable from the source tab. */
export const METRES = ['2/4', '3/4', '4/4', '2/2', '3/8', '6/8', '9/8', '12/8', 'none'];

/** @type {string[]} The key signatures the toolbar offers, in ABC's own spelling, flats then sharps. */
export const KEYS = [
    'Cb', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'none',
];

/**
 * Every event in the score, in playing order.
 *
 * @param {object} score A Score.
 * @returns {object[]} Copies of the events, so a caller can rearrange them freely.
 */
export const flatten = (score) => score.bars.reduce(
    (all, bar) => all.concat(bar.events.map((event) => ({...event}))),
    []
);

/**
 * Where an event sits, for a human.
 *
 * @param {object} score A Score.
 * @param {number} index An index into flatten().
 * @returns {object|null} {bar, index} counting from one, or null when there is no such event.
 */
export const locate = (score, index) => {
    let seen = 0;
    for (let bar = 0; bar < score.bars.length; bar++) {
        const events = score.bars[bar].events.length;
        if (index < seen + events) {
            return {bar: bar + 1, index: index - seen + 1};
        }
        seen += events;
    }
    return null;
};

/**
 * Deal a sequence of events into bars of a metre.
 *
 * @param {object[]} events The events, in playing order.
 * @param {string} metre The metre.
 * @returns {object[][]} The bars.
 */
export const repack = (events, metre) => {
    const capacity = barTicks(metre);
    const bars = [];
    let bar = [];
    let used = 0;
    events.forEach((event) => {
        const ticks = eventTicks(event);
        if (bar.length && used + ticks > capacity) {
            bars.push(bar);
            bar = [];
            used = 0;
        }
        bar.push(event);
        used += ticks;
    });
    if (bar.length) {
        bars.push(bar);
    }
    return bars;
};

/**
 * The command that replaces a score's contents with a sequence of events.
 *
 * @param {object} score A Score.
 * @param {object[]} events The new sequence.
 * @param {string} metre The metre to pack them for.
 * @returns {object} One batch command, so the whole edit is one undo step.
 */
export const replaceAll = (score, events, metre) => {
    const commands = [];
    for (let index = score.bars.length - 1; index >= 0; index--) {
        commands.push({type: 'removeBar', index});
    }
    repack(events, metre).forEach((bar, at) => {
        commands.push({type: 'addBar', index: at});
        bar.forEach((event, index) => commands.push({type: 'insertEvent', bar: at, index, event}));
    });
    return {type: 'batch', commands};
};

/**
 * The pitch a new note takes when only its letter is known.
 *
 * Musicians expect the note they type to land near the one before it rather than in a fixed
 * octave, so the octave is whichever puts it closest to the reference pitch; a tie goes upwards,
 * which is what makes typing an ascending scale work without touching the octave keys.
 *
 * @param {string} step The note name.
 * @param {number} reference The diatonic number to stay near.
 * @returns {object} {step, octave}.
 */
export const nearestOctave = (step, reference) => {
    const base = diatonic(step, 0);
    const octave = Math.round((reference - base) / 7);
    const candidates = [octave - 1, octave, octave + 1]
        .map((value) => base + value * 7)
        .sort((a, b) => Math.abs(a - reference) - Math.abs(b - reference) || b - a);
    return fromDiatonic(candidates[0]);
};

/**
 * The pitch a new note starts from when the score is empty.
 *
 * @param {string} clef The clef in force.
 * @returns {number} The diatonic number of the middle line.
 * @private
 */
const middleLine = (clef) => clefBottom(clef) + 4;

/**
 * The event the entry settings describe.
 *
 * @param {object} entry The entry settings.
 * @param {object} pitch {step, octave}, ignored for a rest.
 * @returns {object} A model event.
 * @private
 */
const buildEvent = (entry, pitch) => normaliseEvent(entry.rest
    ? {kind: 'rest', duration: entry.duration, dots: entry.dots}
    : {kind: 'note', ...pitch, alter: entry.alter, duration: entry.duration, dots: entry.dots});

/**
 * Apply one editing gesture.
 *
 * @param {object} context {score, selection, entry}. The score is edited in place; the selection
 *                         and the entry settings are returned rather than mutated.
 * @param {object} action {type, ...}, as `keymap.js` and `toolbar.js` build them.
 * @returns {object} {selection, entry, changed, announce}. `changed` is true when the document
 *                   changed, which is what makes the caller re-serialise and re-engrave.
 *                   `announce` names what to say: {key, index}.
 */
// This is a dispatch table: the complexity score counts the switch arms, one per editing command,
// and splitting fourteen three-line cases into fourteen named functions would add indirection
// without making any of them easier to follow. Moodle core takes the same exemption in
// lib/amd/src/chartjs-lazy.js.
// eslint-disable-next-line complexity
export const apply = (context, action) => {
    const {score} = context;
    // The model's undo stack holds the document, not where the author was looking, so the two
    // selection stacks kept here shadow it one for one: undoing an insertion puts the selection
    // back where it was before the note went in, and redoing it puts it back on the note.
    const history = context.selections || (context.selections = {undo: [], redo: []});

    /**
     * Keep a selection inside a score that has just changed size.
     *
     * @param {number|null} at The selection.
     * @returns {number|null} A selection that exists.
     */
    const clampSelection = (at) => {
        const total = flatten(score).length;
        return at === null || total === 0 ? null : Math.max(0, Math.min(total - 1, at));
    };
    const entry = {...DEFAULT_ENTRY, ...context.entry};
    const events = flatten(score);
    const selection = context.selection === null || context.selection === undefined
        ? null
        : Math.max(0, Math.min(events.length - 1, context.selection));
    const selected = selection === null ? null : events[selection];
    const still = (announce = null) => ({selection, entry, changed: false, announce});

    /**
     * Put a changed sequence of events back into the score, as one undoable step.
     *
     * @param {object[]} next The new sequence.
     * @param {object} extra A command to run before the replacement, such as a header change.
     * @returns {void}
     */
    const commit = (next, extra = null) => {
        const metre = extra && extra.field === 'metre' ? extra.value : score.metre;
        const replacement = replaceAll(score, next, metre);
        score.apply(extra ? {type: 'batch', commands: [extra, replacement]} : replacement);
        history.undo.push(selection);
        history.redo.length = 0;
    };
    const reference = selected && selected.kind === 'note'
        ? diatonic(selected.step, selected.octave)
        : middleLine(score.clef);

    switch (action.type) {
        case 'select': {
            const at = action.index === null ? null : Math.max(0, Math.min(events.length - 1, action.index));
            return {selection: at, entry, changed: false, announce: at === null ? null : {key: 'selected', index: at}};
        }

        case 'move': {
            if (!events.length) {
                return still();
            }
            // With nothing selected, step in from whichever end the movement is heading away
            // from, so the first press lands on the first or last event rather than the second.
            let from = selection;
            if (from === null) {
                from = action.by > 0 ? -1 : events.length;
            }
            const at = Math.max(0, Math.min(events.length - 1, from + action.by));
            return {selection: at, entry, changed: false, announce: {key: 'selected', index: at}};
        }

        case 'insert':
        case 'insertAt': {
            // A typed note name always means a note, whatever the rest button says; a click, and
            // the rest key, take the mode as it stands.
            const mode = action.rest === undefined ? entry : {...entry, rest: action.rest};
            const pitch = action.octave === undefined
                ? nearestOctave(action.step || 'C', reference)
                : {step: action.step, octave: action.octave};
            let at;
            if (action.type === 'insertAt') {
                at = Math.max(0, Math.min(events.length, action.at));
            } else if (selection === null) {
                at = events.length;
            } else {
                at = selection + 1;
            }
            events.splice(at, 0, buildEvent(mode, pitch));
            commit(events);
            return {selection: at, entry: {...entry, alter: null}, changed: true, announce: {key: 'added', index: at}};
        }

        case 'delete': {
            if (selection === null) {
                return still({key: 'nothing'});
            }
            events.splice(selection, 1);
            commit(events);
            return {
                selection: clampSelection(selection - 1),
                entry,
                changed: true,
                announce: {key: 'deleted'},
            };
        }

        case 'setDuration':
        case 'setDots': {
            const next = action.type === 'setDuration'
                ? {duration: DURATIONS.includes(action.duration) ? action.duration : entry.duration}
                : {dots: Math.max(0, Math.min(2, action.dots === undefined ? (entry.dots + 1) % 3 : action.dots))};
            if (selection === null) {
                return {selection, entry: {...entry, ...next}, changed: false, announce: {key: 'entry'}};
            }
            events[selection] = normaliseEvent({...selected, ...next});
            commit(events);
            return {
                selection: clampSelection(selection),
                entry: {...entry, ...next},
                changed: true,
                announce: {key: 'changed', index: selection},
            };
        }

        case 'setAlter': {
            if (selection === null || selected.kind !== 'note') {
                const alter = entry.alter === action.alter ? null : action.alter;
                return {selection, entry: {...entry, alter}, changed: false, announce: {key: 'entry'}};
            }
            const alter = selected.alter === action.alter ? null : action.alter;
            events[selection] = normaliseEvent({...selected, alter});
            commit(events);
            return {selection, entry, changed: true, announce: {key: 'changed', index: selection}};
        }

        case 'toggleTie': {
            if (selection === null || selected.kind !== 'note') {
                return still({key: 'nothing'});
            }
            events[selection] = normaliseEvent({...selected, tie: !selected.tie});
            commit(events);
            return {selection, entry, changed: true, announce: {key: 'changed', index: selection}};
        }

        case 'toggleRest': {
            if (selection === null) {
                return {selection, entry: {...entry, rest: !entry.rest}, changed: false, announce: {key: 'entry'}};
            }
            events[selection] = selected.kind === 'rest'
                ? normaliseEvent({
                    kind: 'note', ...fromDiatonic(middleLine(score.clef)),
                    duration: selected.duration, dots: selected.dots,
                })
                : normaliseEvent({kind: 'rest', duration: selected.duration, dots: selected.dots});
            commit(events);
            return {selection, entry, changed: true, announce: {key: 'changed', index: selection}};
        }

        case 'nudge': {
            if (selection === null || selected.kind !== 'note') {
                return still({key: 'nothing'});
            }
            const moved = fromDiatonic(diatonic(selected.step, selected.octave) + action.by);
            events[selection] = normaliseEvent({...selected, ...moved});
            commit(events);
            return {selection, entry, changed: true, announce: {key: 'changed', index: selection}};
        }

        case 'setHeader': {
            if (!['key', 'metre', 'clef'].includes(action.field)) {
                return still();
            }
            if (String(score[action.field]) === String(action.value)) {
                return still();
            }
            commit(events, {type: 'setHeader', field: action.field, value: action.value});
            return {
                selection: clampSelection(selection),
                entry,
                changed: true,
                announce: {key: 'header', field: action.field, value: action.value},
            };
        }

        case 'undo':
        case 'redo': {
            const undoing = action.type === 'undo';
            const moved = undoing ? score.undo() : score.redo();
            const from = undoing ? history.undo : history.redo;
            const to = undoing ? history.redo : history.undo;
            let at = selection;
            if (moved) {
                to.push(selection);
                at = from.length ? from.pop() : selection;
            }
            return {
                selection: clampSelection(at),
                entry,
                changed: moved,
                announce: {key: moved ? action.type : 'nothing'},
            };
        }

        default:
            return still();
    }
};
