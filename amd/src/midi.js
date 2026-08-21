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
 * MIDI into the document model: a quantiser, not a converter.
 *
 * A MIDI file holds key presses on a tick grid. It has no barlines, no note values, no
 * spelling of sharps against flats and no marking of which notes belong to which voice, so
 * every one of those has to be *guessed* here. That is why `fromMidi()` returns warnings
 * beside the score and why RELATIONS.md section B3 rule 2 forbids any caller from presenting
 * the result as a faithful transcription.
 *
 * The one decision that matters more than the rest:
 *
 * **Onsets are snapped to the grid; durations are not.** Each note runs to the next onset.
 * Snapping durations independently - which is what DESIGN.md section 7.2 originally said -
 * was measured to turn every detached note into a note plus a sixteenth rest, because a
 * quarter note released a sixteenth early rounds to a dotted eighth. With onsets alone, a
 * performance jittered by plus or minus 40 ticks transcribes byte-identically to the same
 * melody entered by hand in a notation program, and holds to about plus or minus 60 ms at a
 * 1/16 grid. Measured in P0-FINDINGS-T3 section B3; DESIGN.md section 7.2 step 3 carries the
 * correction.
 *
 * @module     local_sheetmusic/midi
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

import {barTicks, createScore, eventTicks} from 'local_sheetmusic/model';
import {intoBars} from 'local_sheetmusic/barring';
import {fifthsOf, fifthsOfKeyName, guessFifths, keyName, MAJOR_KEYS, spellPitch, spellingTable}
    from 'local_sheetmusic/keys';

/** @type {string} Where the vendored parser lives, relative to wwwroot. */
const VENDOR_URL = '/local/sheetmusic/thirdparty/midi-file/midi-file.js';

/** @type {number} The model's ticks in a whole note, asked of the model rather than restated. */
const WHOLE = eventTicks({duration: 1, dots: 0});

/** @type {number[]} Grids the import dialogue offers, as note-value denominators. */
export const GRIDS = [4, 8, 16, 32];

/** @type {Function|null} The parse function in use. */
let parser = null;

/** @type {Promise|null} An in-flight load of the vendored parser. */
let loading = null;

/**
 * Install the parse function.
 *
 * The seam exists because the browser loads the vendored file over the network and node loads
 * the same bytes off disk, and neither belongs inside the quantiser.
 *
 * @param {Function|null} fn Takes bytes, returns midi-file's parsed structure.
 * @returns {void}
 */
export const setParser = (fn) => {
    parser = fn;
    loading = null;
};

/**
 * Load the vendored midi-file build through RequireJS.
 *
 * RequireJS treats a module id ending in `.js` as a plain URL, bypassing baseUrl and paths,
 * which is the only way to reach a file outside amd/build. See thirdparty/midi-file/README.md.
 *
 * @returns {Promise<Function>} The parse function.
 */
const loadVendored = () => new Promise((resolve, reject) => {
    const wwwroot = (window.M && window.M.cfg && window.M.cfg.wwwroot) || '';
    window.require([wwwroot + VENDOR_URL], (lib) => {
        if (!lib || typeof lib.parseMidi !== 'function') {
            reject(new Error('local_sheetmusic: the MIDI parser loaded but is not usable'));
            return;
        }
        resolve((bytes) => lib.parseMidi(bytes));
    }, reject);
});

/**
 * Make sure a parser is available, fetching it on first use.
 *
 * @returns {Promise<Function>} The parse function.
 */
export const ensureParser = () => {
    if (parser) {
        return Promise.resolve(parser);
    }
    if (!loading) {
        loading = loadVendored().then((fn) => {
            parser = fn;
            loading = null;
            return fn;
        });
    }
    return loading;
};

/**
 * Flatten a parsed MIDI file into note-on events with absolute ticks, plus its meta events.
 *
 * Every track is walked and merged: format 0 files put everything on one track and format 1
 * files split the meta events onto a track of their own, and the quantiser should not care
 * which it was given.
 *
 * @param {object} parsed What midi-file's parseMidi returned.
 * @returns {object} {notes, meta} - notes are {note, onset, off} sorted by onset.
 */
export const flatten = (parsed) => {
    const notes = [];
    const meta = {};
    const open = new Map();

    parsed.tracks.forEach((track) => {
        let at = 0;
        track.forEach((event) => {
            at += event.deltaTime;
            if (event.meta) {
                // The first of each kind wins: a tempo change part way through a piece cannot
                // be written in a score this model can hold, and taking the last one would
                // silently rewrite the opening.
                if (!(event.type in meta)) {
                    meta[event.type] = event;
                }
                return;
            }
            const key = `${event.channel}:${event.noteNumber}`;
            if (event.type === 'noteOn' && event.velocity > 0) {
                notes.push({note: event.noteNumber, onset: at, off: null});
                open.set(key, notes[notes.length - 1]);
            } else if (event.type === 'noteOff' || (event.type === 'noteOn' && event.velocity === 0)) {
                const started = open.get(key);
                if (started && started.off === null) {
                    started.off = at;
                    open.delete(key);
                }
            }
        });
    });

    notes.sort((a, b) => a.onset - b.onset || a.note - b.note);
    return {notes, meta};
};

/**
 * Decide the metre, saying so whenever it had to be assumed.
 *
 * A missing time signature is the most dangerous thing in the whole import path: the note
 * values still come out right, so a piece in 3/4 read as 4/4 looks like a valid score with
 * every barline in the wrong place (P0-FINDINGS-T3 section B4).
 *
 * @param {object} meta The meta events found.
 * @param {object} options The caller's overrides.
 * @param {string[]} warnings Collects what was assumed.
 * @returns {string} The metre as num/den.
 */
const decideMetre = (meta, options, warnings) => {
    if (options.metre) {
        return String(options.metre);
    }
    const signature = meta.timeSignature;
    if (signature && signature.numerator && signature.denominator) {
        return `${signature.numerator}/${signature.denominator}`;
    }
    warnings.push('The file has no time signature, so 4/4 was assumed. '
        + 'The note values are still right, but the barlines may fall in the wrong places.');
    return '4/4';
};

/**
 * Decide the key, saying so whenever it had to be guessed.
 *
 * @param {object} meta The meta events found.
 * @param {object} options The caller's overrides.
 * @param {number[]} pitches The MIDI note numbers, in playing order.
 * @param {string[]} warnings Collects what was assumed.
 * @returns {object} {key, fifths}.
 */
const decideKey = (meta, options, pitches, warnings) => {
    if (options.key) {
        return {key: String(options.key), fifths: fifthsOfKeyName(options.key)};
    }
    const signature = meta.keySignature;
    if (signature && signature.key !== undefined) {
        // MIDI writes the signature as a signed count of sharps or flats plus a major/minor
        // flag, where 0 is major and 1 is minor (Standard MIDI File spec, meta event 0x59).
        const fifths = fifthsOf(signature.key < 0 ? `${-signature.key}f` : `${signature.key}s`);
        return {key: keyName(fifths, signature.scale === 1 ? 'minor' : 'major').key, fifths};
    }
    const fifths = guessFifths(pitches);
    const key = MAJOR_KEYS[fifths + 7];
    warnings.push(`The file has no key signature. The notes look like ${key} major, so that is `
        + 'how the sharps and flats are spelled. Set the key below if the spelling looks wrong.');
    return {key, fifths};
};

/**
 * Group notes that land on the same grid point, keeping one line of music.
 *
 * A MIDI file cannot tell a chord from two independent parts - they are the same bytes
 * (P0-FINDINGS-T3 section B4) - and the document model holds one voice per staff in any case.
 * The top note is kept because that is the melody in nearly every teaching example, and the
 * caller is told how many notes went.
 *
 * @param {object[]} notes Notes with a snapped onset.
 * @param {string[]} warnings Collects what was dropped.
 * @returns {object[]} One note per onset, in order.
 */
const oneVoice = (notes, warnings) => {
    const byOnset = new Map();
    notes.forEach((note) => {
        const kept = byOnset.get(note.onset);
        if (!kept || note.note > kept.note) {
            byOnset.set(note.onset, note);
        }
    });
    const dropped = notes.length - byOnset.size;
    if (dropped > 0) {
        warnings.push(`${dropped} note${dropped === 1 ? '' : 's'} sounded at the same moment as `
            + 'another and could not be kept: only the top line was imported. Import each part '
            + 'separately if you need them kept apart.');
    }
    return [...byOnset.values()].sort((a, b) => a.onset - b.onset);
};

/**
 * Turn a parsed MIDI file into a score.
 *
 * @param {object} parsed What midi-file's parseMidi returned.
 * @param {object} options {grid, metre, key, transpose}.
 * @returns {object} {score, warnings}.
 * @throws {Error} On a file with no musical time base, or no notes at all.
 */
export const quantise = (parsed, options = {}) => {
    const warnings = [];
    const perBeat = parsed.header && parsed.header.ticksPerBeat;
    if (!perBeat) {
        // An SMPTE-timed file measures in frames of wall-clock video, not in beats, so there is
        // no musical grid to snap to at all. midi-file leaves ticksPerBeat undefined for these
        // rather than failing, so the check has to be here (P0-FINDINGS-T3 section B2).
        throw new Error('local_sheetmusic: this MIDI file is timed in video frames rather than '
            + 'beats, so it carries no musical timing to read');
    }

    const grid = GRIDS.includes(Number(options.grid)) ? Number(options.grid) : 16;
    const gridTicks = (perBeat * 4) / grid;
    const transpose = Math.trunc(Number(options.transpose) || 0);

    const {notes, meta} = flatten(parsed);
    if (!notes.length) {
        throw new Error('local_sheetmusic: this MIDI file has no notes in it');
    }
    if (!meta.setTempo) {
        warnings.push('The file has no tempo, so 120 beats per minute was assumed. '
            + 'This affects playback only, not the notation.');
    }

    const pitches = notes.map((note) => note.note + transpose);
    const {key, fifths} = decideKey(meta, options, pitches, warnings);
    const metre = decideMetre(meta, options, warnings);
    const table = spellingTable(fifths);

    const snapped = oneVoice(
        notes.map((note) => ({
            note: note.note + transpose,
            onset: Math.round(note.onset / gridTicks) * gridTicks,
            off: note.off === null ? null : Math.round(note.off / gridTicks) * gridTicks,
        })),
        warnings
    );

    const spans = [];
    if (snapped[0].onset > 0) {
        spans.push({event: {kind: 'rest'}, ticks: (snapped[0].onset / (perBeat * 4)) * WHOLE});
    }
    snapped.forEach((note, index) => {
        // Onset-only quantisation: the note runs to the next onset. The last note has no next
        // onset, so its own release is used, rounded up to at least one grid unit.
        const next = index + 1 < snapped.length
            ? snapped[index + 1].onset
            : Math.max(note.onset + gridTicks, note.off === null ? 0 : note.off);
        spans.push({
            event: {kind: 'note', ...spellPitch(note.note, table)},
            ticks: ((next - note.onset) / (perBeat * 4)) * WHOLE,
        });
    });

    const bars = intoBars(spans, barTicks(metre));
    warnings.push('MIDI files do not contain sheet music, so the note values, barlines and '
        + 'spelling above are a reading of the timing rather than a transcription. '
        + 'Triplets and other tuplets are not detected and will come out as the nearest '
        + 'ordinary notes. Check it before you accept it.');

    return {score: createScore({key, metre, clef: 'treble', bars}), warnings};
};

/**
 * Import a MIDI file.
 *
 * @param {ArrayBuffer|Uint8Array} buffer The file's bytes.
 * @param {object} options {grid, metre, key, transpose} - every one of them optional, and
 *                         every one of them a control the import dialogue must expose,
 *                         because each is a guess the author may need to correct.
 * @returns {Promise<object>} {score, warnings} - warnings names every assumption made, and
 *                            the caller is contractually required to show them.
 * @throws {Error} On a file this quantiser cannot read.
 */
export const fromMidi = async (buffer, options = {}) => {
    const parse = await ensureParser();
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    let parsed;
    try {
        parsed = parse(bytes);
    } catch (error) {
        throw new Error(`local_sheetmusic: that file is not readable as MIDI (${error})`);
    }
    return quantise(parsed, options);
};
