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
 * Renders a stored score placeholder into accessible notation.
 *
 * This module deliberately knows nothing about the engraving engine: it asks the engraver
 * for an SVG and is responsible only for putting that into the page accessibly. Swapping
 * engines is therefore a one-file change.
 *
 * @module     local_sheetmusic/render
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

import {render as engrave} from 'local_sheetmusic/engraver';

/** @type {string} Marks a placeholder as already rendered. */
const RENDERED = 'sheetmusicRendered';

/**
 * Read the score source out of a placeholder.
 *
 * @param {HTMLElement} element The placeholder emitted by the filter.
 * @returns {string} The score source.
 */
const sourceOf = (element) => {
    const pre = element.querySelector('.sheetmusic-source');
    return pre ? pre.textContent : '';
};

/**
 * Render one placeholder into notation.
 *
 * Idempotent: a placeholder that has already been rendered is left alone, which matters
 * because filtered content can be inserted into the page more than once.
 *
 * @param {HTMLElement} element The placeholder to hydrate.
 * @returns {Promise<void>}
 */
export const hydrate = async (element) => {
    if (!element || element.dataset[RENDERED]) {
        return;
    }
    // Claim the element before any await, so two concurrent calls cannot both render it.
    element.dataset[RENDERED] = '1';

    const source = sourceOf(element);
    const format = element.dataset.sheetmusicFormat || 'abc';
    const label = element.dataset.sheetmusicLabel || '';

    let svg;
    try {
        ({svg} = await engrave(source, format, {}));
    } catch (error) {
        // Leave the readable source in place: a failed render must never blank the content.
        element.dataset.sheetmusicError = '1';
        window.console.error('local_sheetmusic: unable to render score', error);
        return;
    }

    const figure = document.createElement('div');
    figure.className = 'sheetmusic-render';
    figure.setAttribute('role', 'img');
    figure.setAttribute('aria-label', label);
    figure.innerHTML = svg;

    // Keep the source in the accessibility tree rather than removing it from the page.
    const pre = element.querySelector('.sheetmusic-source');
    if (pre) {
        pre.classList.add('accesshide');
    }
    element.insertBefore(figure, element.firstChild);
};

/**
 * Render every unrendered placeholder inside a root element.
 *
 * @param {ParentNode} root The subtree to search.
 * @returns {Promise<void[]>}
 */
export const hydrateAll = (root) =>
    Promise.all([...root.querySelectorAll('.sheetmusic-block')].map(hydrate));
