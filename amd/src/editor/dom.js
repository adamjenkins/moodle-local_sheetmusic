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
 * The small DOM helpers every part of the editing surface builds its markup with.
 *
 * They live here rather than in `surface.js` because the note-entry pane, the toolbar and the
 * MIDI adjust panel all build elements the same way, and three copies of `make()` would drift.
 *
 * @module     local_sheetmusic/editor/dom
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

/** @type {string} The namespace every element of an SVG overlay has to be created in. */
export const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Fill a string's {$a} placeholder.
 *
 * @param {string} template The language string.
 * @param {*} value What to put in it.
 * @returns {string} The filled string.
 */
export const fill = (template, value) => String(template || '').replace('{$a}', String(value));

/**
 * Fill a string's named {$a->name} placeholders.
 *
 * Moodle resolves these server side when get_string() is given an object, but the surface
 * fetches its strings once and fills them as the score changes, so it does the same job here.
 *
 * @param {string} template The language string.
 * @param {object} values Placeholder name to value.
 * @returns {string} The filled string.
 */
export const fillNamed = (template, values) => String(template || '')
    .replace(/\{\$a->(\w+)\}/g, (match, name) => (name in (values || {}) ? String(values[name]) : match));

/**
 * Build an element.
 *
 * @param {string} tag The tag name.
 * @param {object} attributes Attributes to set; className, textContent and value are handled as
 *                            properties so that none of them has to be spelled the DOM way here.
 * @param {Element[]} children Elements to append.
 * @returns {Element} The element.
 */
export const make = (tag, attributes = {}, children = []) => {
    const element = document.createElement(tag);
    Object.entries(attributes).forEach(([name, value]) => {
        if (name === 'className' || name === 'textContent' || name === 'value') {
            element[name] = value;
        } else if (value !== null && value !== false) {
            element.setAttribute(name, value === true ? '' : value);
        }
    });
    children.forEach((child) => element.appendChild(child));
    return element;
};

/**
 * Build an SVG element.
 *
 * document.createElement() would produce an HTML element of the same name, which the browser
 * lays out as an unknown inline element rather than as notation, so the namespace is not
 * optional.
 *
 * @param {string} tag The tag name.
 * @param {object} attributes Attributes to set.
 * @returns {Element} The element.
 */
export const makeSvg = (tag, attributes = {}) => {
    const element = document.createElementNS(SVG_NS, tag);
    Object.entries(attributes).forEach(([name, value]) => {
        if (value !== null && value !== false && value !== undefined) {
            element.setAttribute(name, value === true ? '' : value);
        }
    });
    return element;
};

/**
 * Offer a blob to the browser as a download.
 *
 * @param {Blob} blob The file.
 * @param {string} filename What to call it.
 * @returns {void}
 */
export const offer = (blob, filename) => {
    const url = window.URL.createObjectURL(blob);
    const link = make('a', {href: url, download: filename});
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
};
