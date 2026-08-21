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
 * Getting a score out of Moodle: MIDI, SVG, PNG and PDF.
 *
 * Every one of them runs in the browser with no server involved, which RELATIONS.md section B3
 * makes a contract rather than a preference. MIDI and SVG are Verovio's own output. PNG and PDF
 * are drawn from that SVG through a canvas and written by `export/png.js` and `export/pdf.js`.
 *
 * The rasteriser is behind a seam. That is not only for the unit tests - although it is what
 * lets them assert real magic bytes under bare node, which has no canvas - it is also the one
 * place a future vector PDF writer would slot in without any caller changing.
 *
 * @module     local_sheetmusic/export
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

import {toAbc} from 'local_sheetmusic/abc';
import {render, toMidi as engraveMidi} from 'local_sheetmusic/engraver';
import {fromBase64} from 'local_sheetmusic/export/binary';
import {encodePdf} from 'local_sheetmusic/export/pdf';
import {encodePng} from 'local_sheetmusic/export/png';

/**
 * CSS pixels per unit of Verovio's SVG coordinate system.
 *
 * Verovio's viewBox counts in tenths of a millimetre - a default page is 2100 units across,
 * which is A4's 210 mm - so a unit is 96/254 of a CSS pixel. Getting this right is what makes
 * an exported PDF print at the size the score was engraved instead of an arbitrary one.
 *
 * @type {number}
 */
const PX_PER_UNIT = 96 / 254;

/** @type {number} Device pixels drawn per CSS pixel, so exports are crisp in print. */
const DEFAULT_SCALE = 2;

/** @type {Function|null} Test seam: overrides how an SVG becomes pixels. */
let rasteriser = null;

/**
 * Replace the rasteriser.
 *
 * @param {Function|null} fn (svg, {width, height}) resolving to {width, height, data}, where
 *                          data is RGBA bytes; or null to restore the canvas one.
 * @returns {void}
 */
export const setRasteriser = (fn) => {
    rasteriser = fn;
};

/**
 * Read an SVG's drawn size, in CSS pixels.
 *
 * @param {string} svg The SVG.
 * @returns {object} {width, height}.
 * @throws {Error} If the SVG carries no viewBox to measure.
 */
export const measure = (svg) => {
    const match = /viewBox="([\d.\-\s]+)"/.exec(svg);
    if (!match) {
        throw new Error('local_sheetmusic: this score cannot be measured for export');
    }
    const box = match[1].trim().split(/\s+/).map(Number);
    return {width: box[2] * PX_PER_UNIT, height: box[3] * PX_PER_UNIT};
};

/**
 * Give an SVG explicit dimensions.
 *
 * Verovio emits a viewBox and no width or height, which is right for a page that sizes the
 * score with CSS and wrong for an `Image` that has to decide how large to draw it.
 *
 * @param {string} svg The SVG.
 * @param {object} size {width, height} in CSS pixels.
 * @returns {string} The SVG with width and height attributes.
 */
const sized = (svg, size) => svg.replace(
    /^(\s*<svg)\b/,
    `$1 width="${size.width.toFixed(2)}" height="${size.height.toFixed(2)}"`
);

/**
 * Draw an SVG onto a canvas and read the pixels back.
 *
 * @param {string} svg The SVG, already carrying width and height.
 * @param {object} target {width, height} in device pixels.
 * @returns {Promise<object>} {width, height, data}.
 */
const rasteriseOnCanvas = (svg, target) => new Promise((resolve, reject) => {
    const image = new window.Image();
    image.addEventListener('load', () => {
        const canvas = document.createElement('canvas');
        canvas.width = target.width;
        canvas.height = target.height;
        const context = canvas.getContext('2d');
        // Paper, not transparency: a score exported onto a dark background is unreadable, and
        // the PDF writer has to composite onto something in any case.
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, target.width, target.height);
        context.drawImage(image, 0, 0, target.width, target.height);
        resolve(context.getImageData(0, 0, target.width, target.height));
    });
    image.addEventListener('error', () => reject(new Error('local_sheetmusic: the score could not be drawn')));
    // A blob: URL would be tainted-canvas-free too, but has to be revoked, and an inline SVG is
    // small enough that the data: URL is simpler and has no lifetime to manage.
    image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
});

/**
 * Turn an SVG into pixels.
 *
 * @param {string} svg The SVG.
 * @param {object} options {scale}.
 * @returns {Promise<object>} {width, height, data} - data is RGBA bytes.
 */
export const rasterise = async (svg, options = {}) => {
    const scale = Number(options.scale) || DEFAULT_SCALE;
    const size = measure(svg);
    const target = {
        width: Math.max(1, Math.round(size.width * scale)),
        height: Math.max(1, Math.round(size.height * scale)),
    };
    const pixels = await (rasteriser || rasteriseOnCanvas)(sized(svg, size), target);
    return {width: pixels.width, height: pixels.height, data: new Uint8Array(pixels.data)};
};

/**
 * Engrave a score, ready for export.
 *
 * The score is serialised to ABC first, because ABC is what the suite stores and an export
 * that engraved from anything else could disagree with what the page shows.
 *
 * @param {object} score A Score.
 * @returns {Promise<string>} The SVG.
 */
const engrave = async (score) => (await render(toAbc(score), 'abc', {})).svg;

/**
 * Export a score as SVG.
 *
 * @param {object} score A Score.
 * @returns {Promise<string>} The SVG document, as text.
 */
export const toSvg = async (score) => await engrave(score);

/**
 * Export a score as a Standard MIDI File.
 *
 * @param {object} score A Score.
 * @returns {Promise<Blob>} The MIDI file.
 */
export const toMidi = async (score) => new Blob(
    // Verovio hands MIDI back base64-encoded rather than as bytes (P0-FINDINGS-T2 decision 9).
    [fromBase64(await engraveMidi(toAbc(score), 'abc'))],
    {type: 'audio/midi'}
);

/**
 * Export a score as a PNG image.
 *
 * @param {object} score A Score.
 * @param {object} options {scale}.
 * @returns {Promise<Blob>} The image.
 */
export const toPng = async (score, options = {}) => {
    const scale = Number(options.scale) || DEFAULT_SCALE;
    const pixels = await rasterise(await engrave(score), {scale});
    return new Blob([await encodePng(pixels, scale)], {type: 'image/png'});
};

/**
 * Export a score as a one-page PDF.
 *
 * The page holds a picture of the score rather than vector notation; `export/pdf.js` records
 * why, and any caller offering this to an author should say so.
 *
 * @param {object} score A Score.
 * @param {object} options {scale, title}.
 * @returns {Promise<Blob>} The PDF.
 */
export const toPdf = async (score, options = {}) => {
    const scale = Number(options.scale) || DEFAULT_SCALE;
    const pixels = await rasterise(await engrave(score), {scale});
    return new Blob([await encodePdf(pixels, {scale, title: options.title})], {type: 'application/pdf'});
};

/**
 * Every export this module offers, in the order a menu should list them.
 *
 * Keeping the list here rather than in the editor means a new format is one entry and no UI
 * change, and it is what stops the surface from hard-coding file extensions.
 *
 * @type {object[]}
 */
export const EXPORTS = [
    {format: 'midi', extension: 'mid', build: toMidi},
    {format: 'svg', extension: 'svg', build: async (score) => new Blob([await toSvg(score)], {type: 'image/svg+xml'})},
    {format: 'png', extension: 'png', build: toPng},
    {format: 'pdf', extension: 'pdf', build: toPdf},
];
