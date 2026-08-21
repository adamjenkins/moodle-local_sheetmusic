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
 * The score document model.
 *
 * Pure data: no DOM, no engraver, no Moodle. Everything the editor and the serialisers
 * agree about lives here, so both can be unit tested under bare node.
 *
 * Two decisions shape the whole file:
 *
 * 1. A duration is the *denominator* of the note value (1 whole, 2 half, 4 quarter, ...
 *    64 hemidemisemiquaver), matching MusicXML/MEI and Verovio's data-dur, never a
 *    fraction of a whole note. Fractions are computed internally in integer ticks so
 *    that bar arithmetic never depends on floating point.
 * 2. `alter` is the accidental as *written on the page*, not the sounding one: null for
 *    "nothing written", and -2..2 where 0 means an explicit natural sign. Resolving a
 *    written accidental against the key signature and the rest of the bar is the job of
 *    whichever exporter needs pitch (MIDI, MusicXML), not of the document.
 *
 * @module     local_sheetmusic/model
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

/**
 * Ticks in a whole note.
 *
 * 3840 = 2^8 x 15, so every duration down to a 64th, singly or doubly dotted, is a whole
 * number of ticks (a doubly dotted 64th is 105). Bar capacity comparisons are therefore
 * exact integer comparisons.
 *
 * @type {number}
 */
const WHOLE = 3840;

/** @type {string} The diatonic steps, in the order ABC's pitch integers count them from C. */
const STEPS = 'CDEFGAB';

/** @type {number[]} Durations the model accepts, as note-value denominators. */
export const DURATIONS = [1, 2, 4, 8, 16, 32, 64];

/**
 * Clamp a number into a range.
 *
 * @param {number} value The value.
 * @param {number} low Lowest allowed.
 * @param {number} high Highest allowed.
 * @returns {number} The clamped value.
 */
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/**
 * The length of an event in ticks.
 *
 * @param {object} event A normalised event.
 * @returns {number} Ticks.
 */
export const eventTicks = (event) => {
    const scale = Math.pow(2, event.dots);
    return (WHOLE / event.duration) * (2 * scale - 1) / scale;
};

/**
 * How many ticks fit in one bar of a metre.
 *
 * @param {string} metre A metre such as 4/4, 6/8, or none for an unmetred score.
 * @returns {number} Ticks per bar, or Infinity when the metre does not constrain bars.
 */
export const barTicks = (metre) => {
    const match = /^(\d+)\/(\d+)$/.exec(String(metre || '').trim());
    if (!match) {
        return Infinity;
    }
    const num = Number(match[1]);
    const den = Number(match[2]);
    return den > 0 && num > 0 ? (num * WHOLE) / den : Infinity;
};

/**
 * Validate and complete a duration/dots pair.
 *
 * @param {object} source Anything carrying duration and dots.
 * @returns {object} The pair, defaulted and checked.
 * @throws {Error} If the duration is not a note value the model can hold.
 */
const normaliseLength = (source) => {
    const duration = source.duration === undefined ? 4 : Number(source.duration);
    if (!DURATIONS.includes(duration)) {
        throw new Error(`local_sheetmusic: unsupported duration ${source.duration}`);
    }
    return {duration, dots: clamp(Math.trunc(Number(source.dots) || 0), 0, 2)};
};

/**
 * Turn loose input into a canonical event.
 *
 * Canonical means every field is present in a fixed order, so that two models built by
 * different routes compare equal through toJSON().
 *
 * @param {object} source A note or rest description.
 * @returns {object} A frozen-shape event object.
 * @throws {Error} If the step is not a note name.
 */
export const normaliseEvent = (source) => {
    const src = source || {};
    const length = normaliseLength(src);
    if (src.kind === 'rest' || src.rest === true) {
        return {kind: 'rest', duration: length.duration, dots: length.dots};
    }
    const step = String(src.step === undefined ? 'C' : src.step).trim().charAt(0).toUpperCase();
    if (!STEPS.includes(step)) {
        throw new Error(`local_sheetmusic: unsupported step ${src.step}`);
    }
    const alter = src.alter === null || src.alter === undefined
        ? null
        : clamp(Math.trunc(Number(src.alter)), -2, 2);
    return {
        kind: 'note',
        step,
        octave: Number.isFinite(Number(src.octave)) ? Math.trunc(Number(src.octave)) : 4,
        alter,
        duration: length.duration,
        dots: length.dots,
        tie: src.tie === true,
    };
};

/**
 * A score: headers, bars of events, and an undo history.
 */
class Score {
    /**
     * Build a score.
     *
     * @param {object} spec Headers, and optionally bars when rehydrating from JSON.
     */
    constructor(spec) {
        /** @type {string} The key signature, in ABC's spelling (G, Eb, F#m, none). */
        this.key = String(spec.key === undefined ? 'C' : spec.key);
        /** @type {string} The metre, as num/den, or none. */
        this.metre = String(spec.metre === undefined ? '4/4' : spec.metre);
        /** @type {string} The clef name (treble, bass, alto, tenor, treble-8, perc). */
        this.clef = String(spec.clef === undefined ? 'treble' : spec.clef);
        /** @type {object[]} The bars. */
        this.bars = (spec.bars || []).map((bar) => ({
            events: (bar.events || []).map(normaliseEvent),
        }));
        /** @type {object[]} Inverse commands, newest last. */
        this.undoStack = [];
        /** @type {object[]} Commands to replay, newest last. */
        this.redoStack = [];
    }

    /**
     * Ticks already used in a bar.
     *
     * @param {number} index Bar index.
     * @returns {number} Ticks.
     */
    used(index) {
        return this.bars[index].events.reduce((total, event) => total + eventTicks(event), 0);
    }

    /**
     * Apply an edit command, recording its inverse for undo.
     *
     * Commands are plain objects so that the editor, the importers and the tests all speak
     * the same vocabulary: addEvent, insertEvent, removeEvent, addBar, removeBar,
     * setHeader, batch.
     *
     * @param {object} command The command.
     * @returns {Score} This score, for chaining.
     */
    apply(command) {
        this.undoStack.push(this.execute(command));
        this.redoStack = [];
        return this;
    }

    /**
     * Undo the last applied command.
     *
     * The stack holds inverse commands rather than snapshots, so memory is proportional to
     * the edits made and not to the size of the score.
     *
     * @returns {boolean} False when there was nothing to undo.
     */
    undo() {
        if (!this.undoStack.length) {
            return false;
        }
        this.redoStack.push(this.execute(this.undoStack.pop()));
        return true;
    }

    /**
     * Redo the last undone command.
     *
     * @returns {boolean} False when there was nothing to redo.
     */
    redo() {
        if (!this.redoStack.length) {
            return false;
        }
        this.undoStack.push(this.execute(this.redoStack.pop()));
        return true;
    }

    /**
     * Run one command and return the command that undoes it.
     *
     * @param {object} command The command.
     * @returns {object} Its inverse.
     * @throws {Error} On an unknown command or an out-of-range target.
     */
    execute(command) {
        switch (command.type) {
            case 'batch': {
                const inverses = command.commands.map((child) => this.execute(child));
                inverses.reverse();
                return {type: 'batch', commands: inverses};
            }
            case 'addEvent':
                return this.executeAddEvent(command);
            case 'insertEvent': {
                const bar = this.bar(command.bar);
                const index = clamp(Math.trunc(command.index), 0, bar.events.length);
                bar.events.splice(index, 0, normaliseEvent(command.event));
                return {type: 'removeEvent', bar: command.bar, index};
            }
            case 'removeEvent': {
                const bar = this.bar(command.bar);
                const [event] = bar.events.splice(command.index, 1);
                if (!event) {
                    throw new Error(`local_sheetmusic: no event at ${command.bar}/${command.index}`);
                }
                return {type: 'insertEvent', bar: command.bar, index: command.index, event};
            }
            case 'addBar': {
                const index = command.index === undefined ? this.bars.length : command.index;
                this.bars.splice(index, 0, {events: []});
                return {type: 'removeBar', index};
            }
            case 'removeBar': {
                const [bar] = this.bars.splice(command.index, 1);
                if (!bar) {
                    throw new Error(`local_sheetmusic: no bar ${command.index}`);
                }
                return {
                    type: 'batch',
                    commands: [{type: 'addBar', index: command.index}].concat(
                        bar.events.map((event, index) => ({
                            type: 'insertEvent', bar: command.index, index, event,
                        }))
                    ),
                };
            }
            case 'setHeader': {
                if (!['key', 'metre', 'clef'].includes(command.field)) {
                    throw new Error(`local_sheetmusic: not a header: ${command.field}`);
                }
                const previous = this[command.field];
                this[command.field] = String(command.value);
                return {type: 'setHeader', field: command.field, value: previous};
            }
            default:
                throw new Error(`local_sheetmusic: unknown command ${command.type}`);
        }
    }

    /**
     * Append an event to the end of the score, opening a bar when this one is full.
     *
     * The event is never split across the barline: an event that does not fit starts the
     * next bar whole. Splitting-and-tying is an editor decision, not a model one, because
     * it changes what the author sees.
     *
     * @param {object} command An addEvent command.
     * @returns {object} Its inverse.
     */
    executeAddEvent(command) {
        const event = normaliseEvent(command.event);
        const capacity = barTicks(this.metre);
        const last = this.bars.length - 1;
        const overflows = last < 0
            || (this.bars[last].events.length > 0 && this.used(last) + eventTicks(event) > capacity);
        if (!overflows) {
            const index = this.bars[last].events.length;
            this.bars[last].events.push(event);
            return {type: 'removeEvent', bar: last, index};
        }
        this.bars.push({events: [event]});
        return {
            type: 'batch',
            commands: [
                {type: 'removeEvent', bar: this.bars.length - 1, index: 0},
                {type: 'removeBar', index: this.bars.length - 1},
            ],
        };
    }

    /**
     * Fetch a bar, or fail loudly.
     *
     * @param {number} index Bar index.
     * @returns {object} The bar.
     * @throws {Error} If there is no such bar.
     */
    bar(index) {
        const bar = this.bars[index];
        if (!bar) {
            throw new Error(`local_sheetmusic: no bar ${index}`);
        }
        return bar;
    }

    /**
     * Append a note at the end of the score.
     *
     * @param {object} note {step, octave, alter, duration, dots, tie}.
     * @returns {Score} This score, for chaining.
     */
    addNote(note) {
        return this.apply({type: 'addEvent', event: {...note, kind: 'note'}});
    }

    /**
     * Append a rest at the end of the score.
     *
     * @param {object} rest {duration, dots}.
     * @returns {Score} This score, for chaining.
     */
    addRest(rest) {
        return this.apply({type: 'addEvent', event: {...rest, kind: 'rest'}});
    }

    /**
     * The score as plain JSON.
     *
     * The undo history is deliberately absent: it is session state, not document state, and
     * including it would make two identical documents compare unequal.
     *
     * @returns {object} A structure that createScore() accepts back unchanged.
     */
    toJSON() {
        return {
            version: 1,
            key: this.key,
            metre: this.metre,
            clef: this.clef,
            bars: this.bars.map((bar) => ({events: bar.events.map((event) => ({...event}))})),
        };
    }
}

/**
 * Create a score, either empty from headers or rehydrated from toJSON() output.
 *
 * @param {object} input {key, metre, clef} for a new score, or the object toJSON() returned.
 * @returns {Score} The score.
 */
export const createScore = (input = {}) => new Score(input);

/**
 * Rehydrate a score from toJSON() output. An explicit alias for readability at call sites.
 *
 * @param {object} json The object toJSON() returned.
 * @returns {Score} The score.
 */
export const fromJSON = (json) => new Score(json || {});
