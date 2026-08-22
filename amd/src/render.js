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
import {MAX_SOURCE_BYTES} from 'local_sheetmusic/limits';

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
 * The length of a string in bytes rather than in UTF-16 code units.
 *
 * The server measures bytes, so the client has to as well or the two guards disagree on any
 * score carrying a non-ASCII title.
 *
 * @param {string} text The string to measure.
 * @returns {number} Its length in bytes.
 */
const byteLength = (text) => (typeof TextEncoder === 'function'
    ? new TextEncoder().encode(text).length
    : unescape(encodeURIComponent(text)).length);

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

    // The filter refuses an oversized source server-side, so in filtered content this never
    // fires. It fires for markup that reached the page without passing the filter, which is the
    // only route by which a reader can be handed a score costing seconds of their main thread.
    // Leaving the readable source in place is the same degradation as a failed render.
    if (byteLength(source) > MAX_SOURCE_BYTES) {
        element.dataset.sheetmusicError = 'toolarge';
        return;
    }

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

    // The container is the labelled image. Without this the engraved <svg> shows up in the
    // accessibility tree as a second, unnamed image, which a screen reader announces as a
    // bare "image" straight after the real description.
    const svgel = figure.querySelector('svg');
    if (svgel) {
        svgel.setAttribute('aria-hidden', 'true');
        svgel.setAttribute('focusable', 'false');
    }

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
export const hydrateAll = async (root) => {
    const blocks = [...root.querySelectorAll('.sheetmusic-block')];
    const results = [];
    for (const block of blocks) {
        results.push(await hydrate(block));
        // Engraving is synchronous WebAssembly, so a page of scores would otherwise hold the
        // main thread for the sum of all of them without ever yielding. Handing control back
        // between scores keeps the page responsive while they appear one after another.
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
    return results;
};

/**
 * Render the scores in a subtree as the reader reaches them.
 *
 * Engraving is the expensive part and most pages show more scores than fit on a screen, so the
 * work is deferred until a score is near the viewport. Where IntersectionObserver is missing
 * this degrades to rendering everything at once, which is what the filter did before.
 *
 * @param {ParentNode} root The subtree to search.
 * @returns {Promise<void>}
 */
export const observe = async (root) => {
    if (typeof window.IntersectionObserver !== 'function') {
        await hydrateAll(root);
        return;
    }

    const blocks = [...root.querySelectorAll('.sheetmusic-block')]
        .filter((block) => !block.dataset[RENDERED]);
    if (!blocks.length) {
        return;
    }

    const observer = new window.IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) {
                return;
            }
            // Unobserved before rendering, so a score that scrolls in and out during a slow
            // engrave is not queued twice. hydrate() is idempotent anyway; this keeps the
            // observer's own bookkeeping small on a long page.
            observer.unobserve(entry.target);
            hydrate(entry.target);
        });
    }, {rootMargin: '200px'});

    blocks.forEach((block) => observer.observe(block));
};
