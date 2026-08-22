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
 * The byte-level pieces the PNG and PDF writers share.
 *
 * PNG and PDF both wrap deflate-compressed data in a container with checksums, so the
 * checksums, the compressor and the small conversion helpers live here rather than being
 * written twice.
 *
 * Bitwise operators are switched on for this file, following the precedent core sets in
 * `lib/amd/src/storagewrapper.js:113`. The rule exists to catch `&` written where `&&` was
 * meant; a CRC table, an Adler sum and a big-endian length field are all bit manipulation by
 * definition, and writing them with arithmetic would be slower and much easier to get wrong.
 *
 * @module     local_sheetmusic/export/binary
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

/* eslint no-bitwise: "off" */

/** @type {Uint32Array|null} The CRC-32 table, built on first use. */
let crcTable = null;

/**
 * Build the CRC-32 lookup table.
 *
 * @returns {Uint32Array} 256 entries.
 */
const table = () => {
    if (!crcTable) {
        crcTable = new Uint32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) {
                c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
            }
            crcTable[n] = c >>> 0;
        }
    }
    return crcTable;
};

/**
 * CRC-32, as PNG chunks carry it.
 *
 * @param {Uint8Array} bytes The bytes to sum.
 * @returns {number} The checksum, unsigned.
 */
export const crc32 = (bytes) => {
    const lookup = table();
    let crc = 0xFFFFFFFF;
    for (let at = 0; at < bytes.length; at++) {
        crc = lookup[(crc ^ bytes[at]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
};

/**
 * Adler-32, as a zlib stream carries it.
 *
 * @param {Uint8Array} bytes The bytes to sum.
 * @returns {number} The checksum, unsigned.
 */
export const adler32 = (bytes) => {
    let a = 1;
    let b = 0;
    for (let at = 0; at < bytes.length; at++) {
        a = (a + bytes[at]) % 65521;
        b = (b + a) % 65521;
    }
    return ((b << 16) | a) >>> 0;
};

/**
 * Join byte arrays.
 *
 * @param {Uint8Array[]} chunks The pieces.
 * @returns {Uint8Array} One array.
 */
export const concat = (chunks) => {
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const out = new Uint8Array(total);
    let at = 0;
    chunks.forEach((chunk) => {
        out.set(chunk, at);
        at += chunk.length;
    });
    return out;
};

/**
 * A 32-bit unsigned integer, big-endian, as both formats write their lengths.
 *
 * @param {number} value The number.
 * @returns {Uint8Array} Four bytes.
 */
export const uint32 = (value) => new Uint8Array([
    (value >>> 24) & 0xFF, (value >>> 16) & 0xFF, (value >>> 8) & 0xFF, value & 0xFF,
]);

/**
 * The bytes of an ASCII string.
 *
 * Both formats are byte-oriented and neither wants UTF-8 here: PNG chunk types are ASCII by
 * specification, and the PDF skeleton this plugin writes is deliberately ASCII-only so that
 * every byte offset in the cross-reference table is also a character offset.
 *
 * @param {string} text The string.
 * @returns {Uint8Array} Its bytes.
 */
export const ascii = (text) => {
    const out = new Uint8Array(text.length);
    for (let at = 0; at < text.length; at++) {
        out[at] = text.charCodeAt(at) & 0xFF;
    }
    return out;
};

/**
 * Deflate bytes into a zlib stream, the wrapping both PNG's IDAT and PDF's FlateDecode want.
 *
 * CompressionStream does the work where it exists, which is every browser this plugin
 * supports and node 18 and up. The fallback emits *stored* deflate blocks: a valid, entirely
 * legal zlib stream that happens to compress nothing. It exists so that an export can never
 * fail outright on an older engine - a larger file is a much better outcome than no file - and
 * it is exercised by the unit tests rather than left as untested insurance.
 *
 * @param {Uint8Array} bytes The data.
 * @returns {Promise<Uint8Array>} A zlib stream.
 */
export const deflate = async(bytes) => {
    const Compressor = (typeof CompressionStream === 'undefined') ? null : CompressionStream;
    if (!Compressor) {
        return storedDeflate(bytes);
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new Compressor('deflate'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
};

/**
 * Wrap bytes in a zlib stream of stored (uncompressed) deflate blocks.
 *
 * @param {Uint8Array} bytes The data.
 * @returns {Uint8Array} A zlib stream.
 */
export const storedDeflate = (bytes) => {
    const chunks = [new Uint8Array([0x78, 0x01])];
    const limit = 0xFFFF;
    for (let at = 0; at < bytes.length || at === 0; at += limit) {
        const slice = bytes.subarray(at, at + limit);
        const final = at + limit >= bytes.length ? 1 : 0;
        chunks.push(new Uint8Array([
            final,
            slice.length & 0xFF, (slice.length >>> 8) & 0xFF,
            ~slice.length & 0xFF, (~slice.length >>> 8) & 0xFF,
        ]));
        chunks.push(slice);
    }
    chunks.push(uint32(adler32(bytes)));
    return concat(chunks);
};

/**
 * Decode base64 into bytes.
 *
 * @param {string} text Base64, with no data: prefix.
 * @returns {Uint8Array} The bytes.
 */
export const fromBase64 = (text) => {
    const binary = window.atob(text);
    const out = new Uint8Array(binary.length);
    for (let at = 0; at < binary.length; at++) {
        out[at] = binary.charCodeAt(at);
    }
    return out;
};
