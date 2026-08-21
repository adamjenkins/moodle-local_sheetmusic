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
 * Key signatures: naming them, and spelling pitches inside them.
 *
 * Both importers need this and neither owns it. MusicXML arrives with a key signature and
 * needs to know which written accidentals the signature already accounts for; MIDI arrives
 * with bare pitch numbers and needs a signature guessed before a single note can be spelled at
 * all, because MIDI note 66 is F sharp and G flat with nothing in the file to separate them
 * (P0-FINDINGS-T3 section B4).
 *
 * Everything here is pure arithmetic on the circle of fifths. No DOM, no engine, no model.
 *
 * @module     local_sheetmusic/keys
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

/** @type {string[]} Major keys by position on the circle of fifths, from 7 flats to 7 sharps. */
export const MAJOR_KEYS = ['Cb', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'];

/** @type {object} How far each mode's tonic sits from the major tonic, in fifths. */
const MODE_FIFTHS = {
    aeolian: 3, dorian: 2, ionian: 0, locrian: 5, lydian: -1,
    major: 0, minor: 3, mixolydian: 1, phrygian: 4,
};

/** @type {object} How ABC spells each mode after the tonic. */
const MODE_SUFFIX = {
    aeolian: 'm', dorian: 'dor', ionian: '', locrian: 'loc', lydian: 'lyd',
    major: '', minor: 'm', mixolydian: 'mix', phrygian: 'phr',
};

/** @type {string} Which pitches a sharp key signature alters, in order. */
const SHARP_ORDER = 'FCGDAEB';

/** @type {string} Which pitches a flat key signature alters, in order. */
const FLAT_ORDER = 'BEADGCF';

/** @type {string} The diatonic letters, in the order the semitone table below counts them. */
const STEPS = 'CDEFGAB';

/** @type {number[]} Semitones above C for each letter of STEPS. */
const NATURALS = [0, 2, 4, 5, 7, 9, 11];

/**
 * Reduce a semitone count to a pitch class.
 *
 * @param {number} value Any semitone count.
 * @returns {number} 0..11.
 */
const pitchClass = (value) => ((value % 12) + 12) % 12;

/**
 * Read a signed count of sharps or flats out of an MEI key signature token.
 *
 * MEI writes `3f` for three flats, `2s` for two sharps and `0` for none.
 *
 * @param {string} token The MEI key signature token.
 * @returns {number} Fifths: negative for flats, positive for sharps.
 */
export const fifthsOf = (token) => {
    const match = /^(\d+)([sf])?$/.exec(String(token === 0 ? '0' : token || '0').trim());
    if (!match) {
        return 0;
    }
    return match[2] === 'f' ? -Number(match[1]) : Number(match[1]);
};

/**
 * Name a key signature the way ABC spells it.
 *
 * @param {number} fifths Sharps positive, flats negative.
 * @param {string} mode The mode name, or empty for major.
 * @returns {object} {key, warning} - warning is null unless something had to be dropped.
 */
export const keyName = (fifths, mode) => {
    const name = String(mode || 'major').toLowerCase();
    const offset = MODE_FIFTHS[name];
    if (offset === undefined) {
        return {key: MAJOR_KEYS[fifths + 7] || 'C', warning: `unrecognised mode "${mode}"`};
    }
    const tonic = MAJOR_KEYS[fifths + offset + 7];
    if (!tonic) {
        // A mode whose tonic falls off the circle of fifths - E lydian written with six sharps,
        // say - has no ABC spelling. Keeping the signature and losing the modal label is the
        // lesser loss: every note still sounds right.
        return {
            key: MAJOR_KEYS[fifths + 7] || 'C',
            warning: `the ${name} mode of this key cannot be written here, so the key signature is kept alone`,
        };
    }
    return {key: `${tonic}${MODE_SUFFIX[name]}`, warning: null};
};

/** @type {object} ABC's mode suffixes, mapped back to the mode names MODE_FIFTHS uses. */
const SUFFIX_MODES = {
    '': 'major', dor: 'dorian', loc: 'locrian', lyd: 'lydian',
    m: 'minor', mix: 'mixolydian', phr: 'phrygian',
};

/**
 * Read a key signature back off an ABC key name.
 *
 * The inverse of keyName(), and it has to exist: an import dialogue that lets the author
 * choose "E minor" must turn that back into one sharp, not into the four sharps of E major.
 *
 * @param {string} name A key name such as C, Eb, F#m or Ddor.
 * @returns {number} Fifths: negative for flats, positive for sharps.
 */
export const fifthsOfKeyName = (name) => {
    const match = /^([A-G][b#]?)(m|dor|phr|lyd|mix|loc)?$/.exec(String(name || 'C').trim());
    if (!match) {
        return 0;
    }
    const major = MAJOR_KEYS.indexOf(match[1]);
    if (major < 0) {
        return 0;
    }
    return major - 7 - MODE_FIFTHS[SUFFIX_MODES[match[2] || '']];
};

/**
 * The alteration a key signature applies to one pitch letter.
 *
 * @param {string} step A pitch letter, upper case.
 * @param {number} fifths Sharps positive, flats negative.
 * @returns {number} -1, 0 or 1.
 */
export const keyAlteration = (step, fifths) => {
    if (fifths > 0) {
        return SHARP_ORDER.slice(0, fifths).includes(step) ? 1 : 0;
    }
    if (fifths < 0) {
        return FLAT_ORDER.slice(0, -fifths).includes(step) ? -1 : 0;
    }
    return 0;
};

/**
 * Build the table that spells every pitch class inside one key signature.
 *
 * Three passes, in order of how a musician would write the note:
 *
 * 1. the seven notes the signature already covers, written with no accidental at all;
 * 2. a natural sign, for a letter the signature alters but this pitch does not want altered;
 * 3. one step further in the signature's own direction - a sharp in a sharp key, a flat in a
 *    flat key - for whatever is left.
 *
 * Pass 2 is what stops F major spelling B natural as C flat, which is what a naive two-pass
 * table does and what makes an imported melody unreadable.
 *
 * @param {number} fifths Sharps positive, flats negative.
 * @returns {object[]} Twelve {step, alter} entries indexed by pitch class.
 */
export const spellingTable = (fifths) => {
    const table = [];
    const place = (index, entry) => {
        if (table[index] === undefined) {
            table[index] = entry;
        }
    };
    STEPS.split('').forEach((step, index) => {
        place(pitchClass(NATURALS[index] + keyAlteration(step, fifths)), {step, alter: null});
    });
    STEPS.split('').forEach((step, index) => {
        if (keyAlteration(step, fifths) !== 0) {
            place(pitchClass(NATURALS[index]), {step, alter: 0});
        }
    });
    const direction = fifths >= 0 ? 1 : -1;
    STEPS.split('').forEach((step, index) => {
        const alter = keyAlteration(step, fifths) + direction;
        if (alter >= -2 && alter <= 2) {
            place(pitchClass(NATURALS[index] + alter), {step, alter});
        }
    });
    return table;
};

/**
 * Spell one MIDI note number inside a key.
 *
 * @param {number} note A MIDI note number, 0..127.
 * @param {object[]} table The output of spellingTable().
 * @returns {object} {step, octave, alter}.
 */
export const spellPitch = (note, table) => {
    const entry = table[pitchClass(note)];
    // Octave numbers follow scientific pitch notation, where MIDI 60 is C4. A note spelled
    // with a letter from the octave below - B sharp for pitch class 0, C flat for 11 - belongs
    // to the neighbouring octave on the page, or a B sharp would be drawn an octave too high.
    const written = NATURALS[STEPS.indexOf(entry.step)] + (entry.alter || 0);
    const shift = Math.round((pitchClass(note) - pitchClass(written)) / 12);
    return {
        step: entry.step,
        octave: Math.floor(note / 12) - 1 + shift,
        alter: entry.alter,
    };
};

/**
 * The pitch class of a major key's tonic.
 *
 * @param {string} name A key name from MAJOR_KEYS.
 * @returns {number} 0..11.
 */
const tonicPitchClass = (name) => {
    const accidental = name.length > 1 ? (name.charAt(1) === '#' ? 1 : -1) : 0;
    return pitchClass(NATURALS[STEPS.indexOf(name.charAt(0))] + accidental);
};

/**
 * Lexicographic comparison of two rank vectors.
 *
 * @param {number[]} candidate The rank being considered.
 * @param {number[]} incumbent The best rank so far.
 * @returns {boolean} True when the candidate sorts first.
 */
const isBefore = (candidate, incumbent) => {
    for (let at = 0; at < candidate.length; at++) {
        if (candidate[at] !== incumbent[at]) {
            return candidate[at] < incumbent[at];
        }
    }
    return false;
};

/**
 * Guess a key signature from the pitches a piece uses.
 *
 * MIDI carries no spelling, so something has to choose between F sharp and G flat before a
 * single note can be drawn. This scores every major key by how many notes fall outside it,
 * then breaks ties towards the key the music ends in, then the key it starts in, then the
 * smallest signature. It is a heuristic and the caller is contractually required to say so.
 *
 * Minor keys are not searched separately: a minor key has the same signature as its relative
 * major and therefore spells every pitch identically, so the only thing a minor search would
 * change is the name shown on the control - which the author can set.
 *
 * @param {number[]} notes MIDI note numbers, in playing order.
 * @returns {number} Fifths: negative for flats, positive for sharps.
 */
export const guessFifths = (notes) => {
    if (!notes.length) {
        return 0;
    }
    const counts = new Array(12).fill(0);
    notes.forEach((note) => {
        counts[pitchClass(note)]++;
    });
    const first = pitchClass(notes[0]);
    const last = pitchClass(notes[notes.length - 1]);

    let best = null;
    for (let fifths = -7; fifths <= 7; fifths++) {
        const inKey = new Array(12).fill(false);
        STEPS.split('').forEach((step, index) => {
            inKey[pitchClass(NATURALS[index] + keyAlteration(step, fifths))] = true;
        });
        const outside = counts.reduce((total, count, index) => total + (inKey[index] ? 0 : count), 0);
        const tonic = tonicPitchClass(MAJOR_KEYS[fifths + 7]);
        const rank = [outside, tonic === last ? 0 : 1, tonic === first ? 0 : 1, Math.abs(fifths)];
        if (!best || isBefore(rank, best.rank)) {
            best = {fifths, rank};
        }
    }
    return best.fifths;
};
