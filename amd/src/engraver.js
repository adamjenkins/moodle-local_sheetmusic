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
 * Adapter around the bundled Verovio engraver.
 *
 * Everything that knows how Verovio is loaded and called lives here, so that the rest of the
 * suite depends only on the small contract below. The WASM artifact is never touched at page
 * load: it is fetched on the first render and reused afterwards.
 *
 * @module     local_sheetmusic/engraver
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

/** @type {Promise<object>|null} Resolves to a ready Verovio toolkit. */
let toolkitPromise = null;

/** @type {Function|null} Test seam: overrides how the toolkit is obtained. */
let toolkitFactory = null;

/**
 * Replace the toolkit factory. Intended for unit tests, which have no WASM available.
 *
 * @param {Function|null} factory A function returning a promise for a toolkit, or null to reset.
 * @returns {void}
 */
export const setToolkitFactory = (factory) => {
    toolkitFactory = factory;
    toolkitPromise = null;
};

/**
 * Default render options. Kept small and explicit rather than relying on engine defaults.
 *
 * @type {object}
 */
const DEFAULT_OPTIONS = {
    adjustPageHeight: true,
    breaks: 'auto',
    footer: 'none',
    header: 'none',
    scale: 40,
};

/**
 * Map a stored format token to the input format name the engraver expects.
 *
 * @param {string} format A stored format token such as abc or musicxml.
 * @returns {string} The engraver's input format name.
 */
const inputFormat = (format) => {
    switch (format) {
        case 'abc':
            return 'abc';
        case 'musicxml':
        case 'mxl':
            return 'musicxml';
        default:
            return 'auto';
    }
};

/**
 * Obtain a ready toolkit, loading the engine on first use.
 *
 * @returns {Promise<object>} The toolkit.
 */
const getToolkit = () => {
    if (!toolkitPromise) {
        if (!toolkitFactory) {
            toolkitPromise = Promise.reject(new Error('local_sheetmusic: no engraver available'));
        } else {
            toolkitPromise = Promise.resolve(toolkitFactory());
        }
    }
    return toolkitPromise;
};

/**
 * Engrave a score source.
 *
 * @param {string} source The score source.
 * @param {string} format The stored format token.
 * @param {object} options Engraver options, merged over the defaults.
 * @returns {Promise<{svg: string, idMap: object}>} The rendered SVG and its element map.
 */
export const render = async (source, format, options = {}) => {
    const toolkit = await getToolkit();
    toolkit.setOptions({...DEFAULT_OPTIONS, ...options, inputFrom: inputFormat(format)});
    if (!toolkit.loadData(source)) {
        throw new Error('local_sheetmusic: the engraver could not read this score');
    }
    const svg = toolkit.renderToSVG(1);
    return {svg, idMap: buildIdMap(toolkit)};
};

/**
 * Build the map from rendered element ids back to note identity.
 *
 * This is what makes a rendered score clickable without a layout engine of our own.
 *
 * @param {object} toolkit A toolkit that has already loaded a score.
 * @returns {object} A map of element id to note description.
 */
const buildIdMap = (toolkit) => {
    const map = {};
    const mei = toolkit.getMEI({});
    const pattern = /<note\b[^>]*\bxml:id="([^"]+)"[^>]*>/g;
    let match = pattern.exec(mei);
    while (match !== null) {
        const tag = match[0];
        const pname = /\bpname="([a-g])"/.exec(tag);
        const oct = /\boct="(\d)"/.exec(tag);
        map[match[1]] = {
            pitch: pname ? pname[1] : null,
            octave: oct ? Number(oct[1]) : null,
        };
        match = pattern.exec(mei);
    }
    return map;
};
