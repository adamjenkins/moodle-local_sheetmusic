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
 * A single-page PDF writer, for exporting a rendered score as a printable page.
 *
 * **Why this is written by hand rather than vendored.** The usual answer is
 * `svg2pdf.js` on top of `jsPDF`. Together those unpack to about 33 MB, against the whole of
 * this plugin's 7 MB Verovio artifact, and the plugin is already up against moodle.org's
 * upload limit (P0-FINDINGS-T2 section 7 measures 7,311,285 bytes on disk for Verovio alone).
 * They would also be doing a job they are not especially good at here: Verovio's SVG draws
 * every notehead and clef as a `<use>` of a `<symbol>` from a private glyph table, which is
 * exactly the construct a generic SVG-to-PDF converter handles least reliably.
 *
 * So this file writes the PDF itself: one page, one image, no fonts, about a hundred lines and
 * no dependency at all. **The cost is honest and should be stated in the UI: the PDF is a
 * picture of the score, not vector notation.** It is written at twice the engraved size by
 * default, so it prints cleanly, and the page is sized in points so it prints at the size it
 * was engraved. If vector output is wanted later, the place to add it is here, behind the same
 * function, and the trade to reconsider is the 33 MB.
 *
 * @module     local_sheetmusic/export/pdf
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

import {ascii, concat, deflate} from 'local_sheetmusic/export/binary';

/** @type {number} PDF points per inch. */
const POINTS_PER_INCH = 72;

/** @type {number} CSS pixels per inch, which is what a rasteriser scale of 1 means. */
const CSS_DPI = 96;

/**
 * Drop the alpha channel, compositing over white.
 *
 * PDF's DeviceRGB colour space has no alpha, and a score is drawn on paper, so white is the
 * right thing to composite onto rather than an arbitrary choice.
 *
 * @param {Uint8Array} data RGBA pixels.
 * @returns {Uint8Array} RGB pixels.
 */
const flatten = (data) => {
    const out = new Uint8Array((data.length / 4) * 3);
    for (let at = 0, to = 0; at < data.length; at += 4, to += 3) {
        const alpha = data[at + 3] / 255;
        out[to] = Math.round(data[at] * alpha + 255 * (1 - alpha));
        out[to + 1] = Math.round(data[at + 1] * alpha + 255 * (1 - alpha));
        out[to + 2] = Math.round(data[at + 2] * alpha + 255 * (1 - alpha));
    }
    return out;
};

/**
 * Escape a string for a PDF literal string object.
 *
 * @param {string} text The text.
 * @returns {string} The escaped text, without its delimiters.
 */
const literal = (text) => String(text).replace(/[\\()]/g, '\\$&').replace(/[^\x20-\x7E]/g, '');

/**
 * Write a one-page PDF holding one image.
 *
 * @param {object} image {width, height, data} - data is RGBA bytes, row-major, top row first.
 * @param {object} options {scale, title} - scale is the rasteriser's device pixels per CSS
 *                         pixel, and sizes the page so the score prints as engraved.
 * @returns {Promise<Uint8Array>} The PDF file.
 * @throws {Error} If the pixel data is not the size the dimensions claim.
 */
export const encodePdf = async(image, options = {}) => {
    const {width, height, data} = image;
    if (!width || !height || data.length !== width * height * 4) {
        throw new Error(`local_sheetmusic: ${width}x${height} needs ${width * height * 4} bytes `
            + `of pixel data, got ${data.length}`);
    }
    const scale = Number(options.scale) || 1;
    const pageWidth = ((width / scale) * POINTS_PER_INCH) / CSS_DPI;
    const pageHeight = ((height / scale) * POINTS_PER_INCH) / CSS_DPI;
    const pixels = await deflate(flatten(data));
    const content = ascii(`q ${pageWidth.toFixed(2)} 0 0 ${pageHeight.toFixed(2)} 0 0 cm /Im0 Do Q\n`);

    // Objects are assembled in order and their byte offsets recorded as they go, because the
    // cross-reference table at the end of a PDF is a list of exactly those offsets and a reader
    // that finds a wrong one rejects the file.
    const objects = [
        [ascii('<< /Type /Catalog /Pages 2 0 R >>')],
        [ascii('<< /Type /Pages /Kids [3 0 R] /Count 1 >>')],
        [ascii(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth.toFixed(2)} `
            + `${pageHeight.toFixed(2)}] /Resources << /XObject << /Im0 5 0 R >> >> `
            + '/Contents 4 0 R >>')],
        [ascii(`<< /Length ${content.length} >>\nstream\n`), content, ascii('\nendstream')],
        [
            ascii(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} `
                + '/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode '
                + `/Length ${pixels.length} >>\nstream\n`),
            pixels,
            ascii('\nendstream'),
        ],
        [ascii(`<< /Title (${literal(options.title || 'Sheet music')}) `
            + '/Producer (local_sheetmusic) >>')],
    ];

    const chunks = [ascii('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')];
    let offset = chunks[0].length;
    const offsets = [];
    objects.forEach((body, index) => {
        offsets.push(offset);
        const parts = [ascii(`${index + 1} 0 obj\n`), ...body, ascii('\nendobj\n')];
        parts.forEach((part) => {
            chunks.push(part);
            offset += part.length;
        });
    });

    const xref = [`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`]
        .concat(offsets.map((at) => `${String(at).padStart(10, '0')} 00000 n \n`))
        .join('');
    chunks.push(ascii(xref));
    chunks.push(ascii(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info `
        + `${objects.length} 0 R >>\nstartxref\n${offset}\n%%EOF\n`));

    return concat(chunks);
};
