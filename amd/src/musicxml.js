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
 * MusicXML into the document model.
 *
 * There is no XML parser of our own here, and that is the whole design. Verovio already reads
 * MusicXML and compressed MusicXML (`.mxl`) natively and re-emits both as MEI, so the import
 * path is Verovio -> MEI -> model. MEI is one small regular shape - `measure/staff/layer` with
 * `note` and `rest` elements carrying `@dur`, `@dots`, `@oct` and `@pname` - whereas MusicXML
 * is a large irregular one with divisions arithmetic, backup/forward, and two different places
 * to write an accidental. Mapping the small shape is a few dozen lines; parsing the large one
 * is a library. Measured in P0-FINDINGS-T2 section 6.1 and decision 8.
 *
 * One consequence worth stating plainly: an import is only as good as Verovio's own MusicXML
 * reader, and anything it drops is dropped here too.
 *
 * @module     local_sheetmusic/musicxml
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

import {createScore, DURATIONS} from 'local_sheetmusic/model';
import {fifthsOf, keyAlteration, keyName} from 'local_sheetmusic/keys';
import {toMei} from 'local_sheetmusic/engraver';
import {MAX_IMPORT_BYTES} from 'local_sheetmusic/limits';

/** @type {object} MEI accidental tokens to the model's written alteration. */
const ACCIDENTALS = {f: -1, ff: -2, n: 0, s: 1, ss: 2, x: 2};

/**
 * Read a duration and dot count off an MEI element.
 *
 * @param {Element} element A note or rest.
 * @returns {object} {duration, dots}.
 * @throws {Error} On a note value the model cannot hold.
 */
const lengthOf = (element) => {
    const duration = Number(element.getAttribute('dur'));
    if (!DURATIONS.includes(duration)) {
        throw new Error(
            `local_sheetmusic: this editor cannot hold a note of length "${element.getAttribute('dur')}"`
        );
    }
    return {duration, dots: Math.min(2, Math.max(0, Number(element.getAttribute('dots')) || 0))};
};

/**
 * Map one MEI accidental token onto the model's alteration.
 *
 * @param {string} token The MEI token.
 * @returns {number} -2..2.
 * @throws {Error} On a token the model cannot hold, such as a quarter tone.
 */
const alterationOf = (token) => {
    if (!(token in ACCIDENTALS)) {
        throw new Error(`local_sheetmusic: unsupported accidental "${token}"`);
    }
    return ACCIDENTALS[token];
};

/**
 * The written accidental of one MEI note.
 *
 * MEI separates the accidental that is *printed* (`accid`, on the note or on a child element)
 * from the one that is merely *sounded* (`accid.ges`, which is usually the key signature doing
 * its work). The model stores the printed one. But a sounding accidental that the key
 * signature does not account for has to become a printed one, or the note comes out at the
 * wrong pitch: MusicXML files often carry `<alter>` with no `<accidental>` element, and
 * Verovio faithfully turns that into `accid.ges` alone.
 *
 * @param {Element} note An MEI note.
 * @param {number} fifths The key signature in force.
 * @returns {number|null} The model's alter field.
 */
const alterOf = (note, fifths) => {
    const child = note.getElementsByTagName('accid')[0];
    const written = note.getAttribute('accid') || (child ? child.getAttribute('accid') : null);
    if (written) {
        return alterationOf(written);
    }
    const sounded = note.getAttribute('accid.ges');
    if (!sounded) {
        return null;
    }
    const alter = alterationOf(sounded);
    const step = String(note.getAttribute('pname') || 'c').toUpperCase();
    return alter === keyAlteration(step, fifths) ? null : alter;
};

/**
 * Walk one MEI layer, appending its events to a bar.
 *
 * Beams are transparent: they are engraving, and the model does not store them. Chords and
 * tuplets are refused rather than flattened, for the same reason `abc.js` refuses them - a
 * silently dropped tuplet leaves a bar that looks right and is the wrong length, which is
 * worse than a refused import.
 *
 * @param {Element} node The element to walk.
 * @param {object} context {fifths, events, measure}.
 * @returns {void}
 * @throws {Error} On notation the model cannot hold.
 */
const walk = (node, context) => {
    [...node.children].forEach((child) => {
        switch (child.localName) {
            case 'note':
                context.events.push({
                    kind: 'note',
                    step: String(child.getAttribute('pname') || 'c').toUpperCase(),
                    octave: Number(child.getAttribute('oct')),
                    alter: alterOf(child, context.fifths),
                    ...lengthOf(child),
                    tie: context.ties.has(child.getAttribute('xml:id')),
                });
                break;
            case 'rest':
            case 'space':
                context.events.push({kind: 'rest', ...lengthOf(child)});
                break;
            case 'beam':
            case 'graceGrp':
                walk(child, context);
                break;
            case 'chord':
                throw new Error(
                    `local_sheetmusic: bar ${context.measure} has a chord, which this editor cannot yet hold`
                );
            case 'tuplet':
                throw new Error(
                    `local_sheetmusic: bar ${context.measure} has a tuplet, which this editor cannot yet hold`
                );
            default:
                // Slurs, dynamics, fermatas, clef changes mid-bar: nothing the model stores.
                break;
        }
    });
};

/**
 * Collect the ids of every note that starts a tie.
 *
 * MEI puts ties beside the notes rather than on them, as `tie` elements pointing at a start
 * and an end id. Verovio writes those ids with a leading `#` on one route and without it on
 * another, so both are normalised here.
 *
 * @param {Document} doc The MEI document.
 * @returns {Set<string>} The xml:ids of tied-from notes.
 */
const tieStarts = (doc) => {
    const ids = new Set();
    [...doc.getElementsByTagName('tie')].forEach((tie) => {
        const start = tie.getAttribute('startid');
        if (start) {
            ids.add(start.replace(/^#/, ''));
        }
    });
    return ids;
};

/**
 * Read the clef off an MEI document.
 *
 * @param {Document} doc The MEI document.
 * @param {string[]} warnings Collects anything that had to be approximated.
 * @returns {string} The model's clef name.
 */
const clefOf = (doc, warnings) => {
    const clef = doc.getElementsByTagName('clef')[0];
    if (!clef) {
        return 'treble';
    }
    const shape = clef.getAttribute('shape');
    const line = Number(clef.getAttribute('line'));
    if (shape === 'G' && line === 2) {
        return clef.getAttribute('dis') === '8' ? 'treble-8' : 'treble';
    }
    if (shape === 'F' && line === 4) {
        return 'bass';
    }
    if (shape === 'C' && line === 3) {
        return 'alto';
    }
    if (shape === 'C' && line === 4) {
        return 'tenor';
    }
    if (shape === 'perc') {
        return 'perc';
    }
    warnings.push(`the ${shape}-clef on line ${line} is shown as a treble clef`);
    return 'treble';
};

/**
 * Read the headers off an MEI document.
 *
 * @param {Document} doc The MEI document.
 * @returns {object} {key, metre, clef, fifths, warnings}.
 */
const headersOf = (doc) => {
    const warnings = [];
    const scoreDef = doc.getElementsByTagName('scoreDef')[0];
    const staffDef = doc.getElementsByTagName('staffDef')[0];
    const attr = (name) => (staffDef && staffDef.getAttribute(name))
        || (scoreDef && scoreDef.getAttribute(name))
        || null;

    const keySig = doc.getElementsByTagName('keySig')[0];
    const signature = (keySig && keySig.getAttribute('sig')) || attr('keysig') || attr('key.sig') || '0';
    const mode = (keySig && keySig.getAttribute('mode')) || attr('key.mode') || 'major';
    const fifths = fifthsOf(signature);
    const {key, warning} = keyName(fifths, mode);
    if (warning) {
        warnings.push(warning);
    }

    const meterSig = doc.getElementsByTagName('meterSig')[0];
    const count = (meterSig && meterSig.getAttribute('count')) || attr('meter.count');
    const unit = (meterSig && meterSig.getAttribute('unit')) || attr('meter.unit');
    const symbol = (meterSig && meterSig.getAttribute('sym')) || attr('meter.sym');
    let metre = 'none';
    if (count && unit) {
        metre = `${count}/${unit}`;
    } else if (symbol === 'common') {
        metre = '4/4';
    } else if (symbol === 'cut') {
        metre = '2/2';
    } else {
        warnings.push('the file carries no time signature, so the barlines are taken as they came');
    }

    return {key, metre, clef: clefOf(doc, warnings), fifths, warnings};
};

/**
 * Turn MEI into a score.
 *
 * @param {string} mei An MEI document.
 * @returns {object} {score, warnings}.
 * @throws {Error} If the document is not MEI, or holds notation the model cannot represent.
 */
export const fromMei = (mei) => {
    const doc = new DOMParser().parseFromString(String(mei), 'application/xml');
    if (!doc.getElementsByTagName('music').length) {
        throw new Error('local_sheetmusic: that is not a score this engine could read');
    }
    const headers = headersOf(doc);
    const warnings = headers.warnings.slice();
    const ties = tieStarts(doc);

    const staves = new Set();
    const bars = [];
    [...doc.getElementsByTagName('measure')].forEach((measure, index) => {
        [...measure.getElementsByTagName('staff')].forEach((staff) => {
            staves.add(staff.getAttribute('n') || '1');
        });
        const layer = measure.getElementsByTagName('layer')[0];
        if (!layer) {
            return;
        }
        const context = {fifths: headers.fifths, events: [], measure: index + 1, ties};
        walk(layer, context);
        bars.push({events: context.events});
    });

    if (staves.size > 1) {
        warnings.push(`the file has ${staves.size} staves; only the first was imported`);
    }
    if ([...doc.getElementsByTagName('layer')].some((layer) => (layer.getAttribute('n') || '1') !== '1')) {
        warnings.push('the file has more than one voice per staff; only the first was imported');
    }
    if (!bars.length) {
        throw new Error('local_sheetmusic: that file holds no notes');
    }

    return {
        score: createScore({key: headers.key, metre: headers.metre, clef: headers.clef, bars}),
        warnings,
    };
};

/**
 * Whether a byte sequence is a ZIP archive, which is what a `.mxl` is.
 *
 * @param {Uint8Array} bytes The first bytes of the file.
 * @returns {boolean} True for a ZIP local file header.
 */
const isZip = (bytes) => bytes.length > 3
    && bytes[0] === 0x50 && bytes[1] === 0x4B && bytes[2] === 0x03 && bytes[3] === 0x04;

/**
 * Base64-encode bytes without a data: prefix.
 *
 * @param {Uint8Array} bytes The bytes.
 * @returns {string} Base64.
 */
const toBase64 = (bytes) => {
    let binary = '';
    // Chunked, because String.fromCharCode.apply on a whole multi-megabyte score overflows the
    // argument stack in every browser.
    for (let at = 0; at < bytes.length; at += 0x8000) {
        binary += String.fromCharCode.apply(null, bytes.subarray(at, at + 0x8000));
    }
    return window.btoa(binary);
};

/**
 * Import MusicXML, reporting everything that had to be assumed or dropped.
 *
 * @param {string|ArrayBuffer|Uint8Array} input Plain MusicXML text, or the bytes of either a
 *                                              `.musicxml` or a compressed `.mxl` file.
 * @returns {Promise<object>} {score, warnings}.
 * @throws {Error} If the file cannot be read, or holds notation the model cannot represent.
 */
export const importMusicXml = async(input) => {
    if (typeof input === 'string') {
        if (input.length > MAX_IMPORT_BYTES) {
            throw new Error('local_sheetmusic: that MusicXML is past the '
                + `${Math.round(MAX_IMPORT_BYTES / 1048576)}MB this importer will read`);
        }
        return fromMei(await toMei(input, 'musicxml'));
    }
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    // Checked before base64, which is itself a 4/3 memory multiplier, and well before the engine
    // decompresses anything: a .mxl is a ZIP, and neither its decompressed size nor its entry
    // count is knowable from here. Bounding the archive bounds all three.
    if (bytes.length > MAX_IMPORT_BYTES) {
        throw new Error(`local_sheetmusic: that file is ${Math.round(bytes.length / 1048576)}MB, `
            + `which is past the ${Math.round(MAX_IMPORT_BYTES / 1048576)}MB this importer will read`);
    }
    if (isZip(bytes)) {
        return fromMei(await toMei(toBase64(bytes), 'mxl'));
    }
    return fromMei(await toMei(new TextDecoder().decode(bytes), 'musicxml'));
};

/**
 * Import MusicXML.
 *
 * The contract in RELATIONS.md section B1 names this function; it is a promise rather than a
 * plain return because the engine is lazy-loaded on first use and cannot be waited on
 * synchronously. Callers that need to tell the author what was assumed - and the import
 * dialogue is contractually one of them - should call importMusicXml() instead.
 *
 * @param {string|ArrayBuffer|Uint8Array} input Plain MusicXML text, or file bytes.
 * @returns {Promise<object>} The Score.
 */
export const fromMusicXml = async(input) => (await importMusicXml(input)).score;
