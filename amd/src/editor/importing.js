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
 * Working out what an uploaded file is, and turning it into ABC.
 *
 * Kept apart from the surface because it is the half with no DOM in it, and because the file
 * sniffing is worth testing on its own: a `.mxl` renamed to `.xml` and a MIDI file with no
 * extension at all are both things authors do, and both are recognisable from their first four
 * bytes with certainty rather than from a filename with none.
 *
 * @module     local_sheetmusic/editor/importing
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

import {ensureParser, normaliseSource, toAbc} from 'local_sheetmusic/abc';
import {fromMidi} from 'local_sheetmusic/midi';
import {importMusicXml} from 'local_sheetmusic/musicxml';

/** @type {string} What a file picker should offer, as an accept attribute. */
export const ACCEPT = '.abc,.txt,.xml,.musicxml,.mxl,.mid,.midi';

/**
 * Whether a byte sequence starts with the given ASCII marker.
 *
 * @param {Uint8Array} bytes The file's start.
 * @param {string} marker The magic string.
 * @returns {boolean} True on a match.
 */
const startsWith = (bytes, marker) => bytes.length >= marker.length
    && marker.split('').every((character, at) => bytes[at] === character.charCodeAt(0));

/**
 * Decide what an uploaded file is.
 *
 * Magic bytes win over the file name, because they cannot be wrong. The name is consulted only
 * for the two formats that have no magic at all: MusicXML is XML, which anything could be, and
 * ABC has no signature whatsoever.
 *
 * @param {string} name The file name, which may be empty.
 * @param {Uint8Array} bytes The file's bytes.
 * @returns {string} One of abc, musicxml, mxl, midi.
 */
export const detect = (name, bytes) => {
    if (startsWith(bytes, 'MThd')) {
        return 'midi';
    }
    if (startsWith(bytes, 'PK\x03\x04')) {
        return 'mxl';
    }
    const extension = (/\.([a-z0-9]+)$/i.exec(String(name || '')) || [])[1];
    switch (String(extension || '').toLowerCase()) {
        case 'mid':
        case 'midi':
            return 'midi';
        case 'mxl':
            return 'mxl';
        case 'musicxml':
        case 'xml':
            return 'musicxml';
        case 'abc':
            return 'abc';
        default:
            // Left to the content: an XML declaration or a root element means MusicXML, and
            // everything else is treated as ABC, which is what a plain text paste will be.
            return startsWith(bytes, '<') || startsWith(bytes, '﻿<') ? 'musicxml' : 'abc';
    }
};

/**
 * Read one file from a file input.
 *
 * @param {File} file The chosen file.
 * @returns {Promise<object>} {name, bytes}.
 */
export const readFile = (file) => new Promise((resolve, reject) => {
    const reader = new window.FileReader();
    reader.addEventListener('load', () => resolve({
        name: file.name,
        bytes: new Uint8Array(reader.result),
    }));
    reader.addEventListener('error', () => reject(new Error('local_sheetmusic: that file could not be read')));
    reader.readAsArrayBuffer(file);
});

/**
 * Turn an uploaded file into ABC source.
 *
 * @param {string} name The file name.
 * @param {Uint8Array} bytes The file's bytes.
 * @param {object} options The MIDI quantiser's controls; ignored for every other format.
 * @returns {Promise<object>} {kind, source, warnings}.
 * @throws {Error} If the file cannot be read as a score.
 */
export const importBytes = async(name, bytes, options = {}) => {
    const kind = detect(name, bytes);
    if (kind === 'abc') {
        // ABC is stored as it was written, not round-tripped through the model: a tune with a
        // tuplet in it would not survive that, and the author is entitled to see their own text.
        await ensureParser();
        return {kind, source: normaliseSource(new TextDecoder().decode(bytes)), warnings: []};
    }
    if (kind === 'midi') {
        const {score, warnings} = await fromMidi(bytes, options);
        return {kind, source: toAbc(score), warnings};
    }
    const {score, warnings} = await importMusicXml(bytes);
    return {kind, source: toAbc(score), warnings};
};
