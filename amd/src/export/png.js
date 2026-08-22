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
 * A PNG writer, for exporting a rendered score as a picture.
 *
 * Writing the file rather than calling `canvas.toBlob('image/png')` buys two things worth
 * roughly sixty lines. It puts a physical resolution in the file - a `pHYs` chunk, which is
 * what makes a score paste into a word processor at the size it was engraved rather than
 * enormous - and it makes the exporter testable without a browser, because the pixels can be
 * handed in from a test instead of coming out of a canvas that node does not have.
 *
 * @module     local_sheetmusic/export/png
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

import {ascii, concat, crc32, deflate, uint32} from 'local_sheetmusic/export/binary';

/** @type {number[]} The eight bytes every PNG starts with. */
const SIGNATURE = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

/** @type {number} CSS pixels per inch, which is what a canvas scale of 1 means. */
const CSS_DPI = 96;

/** @type {number} Metres per inch, for the pHYs chunk, which counts in pixels per metre. */
const INCHES_PER_METRE = 39.3701;

/**
 * Assemble one PNG chunk: length, type, data, checksum.
 *
 * @param {string} type The four-character chunk type.
 * @param {Uint8Array} data The chunk payload.
 * @returns {Uint8Array} The chunk.
 */
const chunk = (type, data) => {
    const body = concat([ascii(type), data]);
    return concat([uint32(data.length), body, uint32(crc32(body))]);
};

/**
 * Prefix every scanline with a filter byte.
 *
 * Filter 0 means "no filtering": the row is stored as it is. Choosing a filter per row the way
 * a real encoder does would make the file smaller and the code much larger, and a score is
 * mostly flat white, which deflate already handles well.
 *
 * @param {Uint8Array} data RGBA pixels, row-major.
 * @param {number} width Pixels per row.
 * @param {number} height Rows.
 * @returns {Uint8Array} The raw PNG image data.
 */
const scanlines = (data, width, height) => {
    const stride = width * 4;
    const out = new Uint8Array((stride + 1) * height);
    for (let row = 0; row < height; row++) {
        out[row * (stride + 1)] = 0;
        out.set(data.subarray(row * stride, (row + 1) * stride), row * (stride + 1) + 1);
    }
    return out;
};

/**
 * Write a PNG.
 *
 * @param {object} image {width, height, data} - data is RGBA bytes, row-major, top row first.
 * @param {number} scale How many device pixels the rasteriser drew per CSS pixel, so that the
 *                       file can record the size the score was engraved at.
 * @returns {Promise<Uint8Array>} The PNG file.
 * @throws {Error} If the pixel data is not the size the dimensions claim.
 */
export const encodePng = async(image, scale = 1) => {
    const {width, height, data} = image;
    if (!width || !height || data.length !== width * height * 4) {
        throw new Error(`local_sheetmusic: ${width}x${height} needs ${width * height * 4} bytes `
            + `of pixel data, got ${data.length}`);
    }
    const perMetre = Math.round((CSS_DPI * scale) * INCHES_PER_METRE);
    return concat([
        new Uint8Array(SIGNATURE),
        chunk('IHDR', concat([
            uint32(width),
            uint32(height),
            // 8 bits per channel, colour type 6 (RGB with alpha), no compression, filter or
            // interlace options beyond the only ones PNG defines.
            new Uint8Array([8, 6, 0, 0, 0]),
        ])),
        chunk('pHYs', concat([uint32(perMetre), uint32(perMetre), new Uint8Array([1])])),
        chunk('IDAT', await deflate(scanlines(data, width, height))),
        chunk('IEND', new Uint8Array(0)),
    ]);
};
