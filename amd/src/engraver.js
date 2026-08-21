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
 * Everything that knows how Verovio is loaded and called lives here, so the rest of the suite
 * depends only on the small contract below. The 7 MB WASM artifact is never touched at page
 * load: it is imported on the first render and reused for the life of the page.
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
 * @param {Function|null} factory Returns a promise for a toolkit, or null to reset.
 * @returns {void}
 */
export const setToolkitFactory = (factory) => {
    toolkitFactory = factory;
    toolkitPromise = null;
};

/**
 * Options applied to every render.
 *
 * svgHtml5 is not cosmetic: it moves Verovio's ids to data-id, so several scores on one page
 * cannot collide in the document id namespace. Every selector below relies on it.
 *
 * @type {object}
 */
const DEFAULT_OPTIONS = {
    adjustPageHeight: true,
    // Without adjustPageWidth a four-bar exercise is laid out across a full page, so the
    // notation ends up a third of the size it could be in the same container. Measured on the
    // reference fixture: viewBox 840x112 becomes 536x80.
    adjustPageWidth: true,
    breaks: 'auto',
    footer: 'none',
    header: 'none',
    pageMarginBottom: 10,
    pageMarginLeft: 10,
    pageMarginRight: 10,
    pageMarginTop: 10,
    scale: 40,
    svgHtml5: true,
    svgAdditionalAttribute: ['note@pname', 'note@oct', 'note@dur'],
    svgViewBox: true,
};

/**
 * Map a stored format token to Verovio's input format name.
 *
 * @param {string} format A stored format token such as abc or musicxml.
 * @returns {string} Verovio's input format name.
 */
const inputFormat = (format) => {
    switch (format) {
        case 'abc':
            return 'abc';
        case 'musicxml':
            return 'musicxml';
        case 'mxl':
            // The zip entry point unpacks to MusicXML, so this is the format Verovio then sees.
            return 'musicxml';
        default:
            return 'auto';
    }
};

/**
 * Load Verovio and build a toolkit.
 *
 * The engine is an ES module, and a dynamic import() written here would be rewritten by
 * Moodle's grunt build into a RequireJS call that cannot load one. So the actual import lives
 * in js/verovio-bootstrap.js, outside amd/, and is pulled in with a real module script. See
 * that file for the full reasoning.
 *
 * @returns {Promise<object>} A ready toolkit.
 */
const loadToolkit = () => new Promise((resolve, reject) => {
    const wwwroot = (window.M && window.M.cfg && window.M.cfg.wwwroot) || '';

    window.addEventListener('local_sheetmusic/verovio-ready', (event) => {
        if (event.detail && event.detail.toolkit) {
            resolve(event.detail.toolkit);
        } else {
            reject((event.detail && event.detail.error) || new Error('local_sheetmusic: engine failed to load'));
        }
    }, {once: true});

    const script = document.createElement('script');
    script.type = 'module';
    script.src = `${wwwroot}/local/sheetmusic/js/verovio-bootstrap.js`;
    script.addEventListener('error', () => reject(new Error('local_sheetmusic: could not fetch the engine')));
    document.head.appendChild(script);
});

/**
 * Obtain a ready toolkit, loading the engine on first use.
 *
 * @returns {Promise<object>} The toolkit.
 */
const getToolkit = () => {
    if (!toolkitPromise) {
        toolkitPromise = Promise.resolve((toolkitFactory || loadToolkit)());
    }
    return toolkitPromise;
};

/**
 * Build the map from rendered element ids back to note identity.
 *
 * This is what makes a rendered score clickable without a layout engine of our own. It is
 * rebuilt on every render, because Verovio ids are regenerated on each loadData() unless
 * xmlIdChecksum is set, and are never safe to persist.
 *
 * @param {string} svg The rendered SVG.
 * @returns {object} A map of element id to note description.
 */
const buildIdMap = (svg) => {
    const map = {};
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    doc.querySelectorAll('[data-class="note"]').forEach((note) => {
        const id = note.getAttribute('data-id');
        if (!id) {
            return;
        }
        map[id] = {
            pitch: note.getAttribute('data-pname'),
            octave: Number(note.getAttribute('data-oct')),
            duration: Number(note.getAttribute('data-dur')),
        };
    });
    return map;
};

/**
 * Load a source into a toolkit, choosing the entry point the format needs.
 *
 * Compressed MusicXML is the one format that cannot go through loadData(): a `.mxl` is a ZIP,
 * and handing ZIP bytes to loadData() fails cleanly rather than unpacking them, so it has its
 * own entry point and its own source type. Measured in P0-FINDINGS-T2 section 6.1.
 *
 * @param {object} toolkit A ready toolkit.
 * @param {string} source The score source: text, or base64 for the mxl format.
 * @param {string} format The stored format token.
 * @returns {void}
 * @throws {Error} If the engine cannot read the source.
 */
const loadInto = (toolkit, source, format) => {
    let loaded = false;
    try {
        loaded = format === 'mxl'
            ? toolkit.loadZipDataBase64(source)
            : toolkit.loadData(source);
    } catch (error) {
        // Verovio's ABC importer does not return false on unreadable input: it aborts inside
        // WebAssembly, and the exception that escapes says "null function or function signature
        // mismatch" (measured on 6.3.0 in node and in Chromium alike, for "not a tune", for an
        // empty string, and for a header with no music line). Letting that reach an author would
        // be meaningless, so every failure route is folded into one message here. The toolkit
        // itself survives the abort - the next valid render works - so nothing is torn down.
        loaded = false;
    }
    if (!loaded) {
        throw new Error('local_sheetmusic: the engraver could not read this score');
    }
};

/**
 * Engrave a score source.
 *
 * @param {string} source The score source.
 * @param {string} format The stored format token.
 * @param {object} options Engraver options, merged over the defaults. The editor passes
 *                         xmlIdChecksum so ids stay stable across re-renders; the filter must
 *                         not, because identical scores on one page would then collide.
 * @returns {Promise<{svg: string, idMap: object}>} The rendered SVG and its element map.
 */
export const render = async (source, format, options = {}) => {
    const toolkit = await getToolkit();
    toolkit.setOptions({...DEFAULT_OPTIONS, ...options, inputFrom: inputFormat(format)});
    loadInto(toolkit, source, format);
    const svg = toolkit.renderToSVG(1);
    return {svg, idMap: buildIdMap(svg)};
};

/**
 * Render a score to a MIDI file.
 *
 * @param {string} source The score source.
 * @param {string} format The stored format token.
 * @returns {Promise<string>} Base64-encoded MIDI.
 */
export const toMidi = async (source, format) => {
    const toolkit = await getToolkit();
    toolkit.setOptions({...DEFAULT_OPTIONS, inputFrom: inputFormat(format)});
    loadInto(toolkit, source, format);
    return toolkit.renderToMIDI();
};

/**
 * Convert a score source to MEI.
 *
 * This is what makes importing MusicXML a mapping job rather than a parsing job: Verovio
 * reads MusicXML and compressed MusicXML natively, and its MEI output is a single regular
 * shape that every input format collapses onto. See P0-FINDINGS-T2 decision 8.
 *
 * @param {string} source The score source: text, or base64 for the mxl format.
 * @param {string} format The stored format token, including mxl for compressed MusicXML.
 * @returns {Promise<string>} The score as MEI.
 */
export const toMei = async (source, format) => {
    const toolkit = await getToolkit();
    toolkit.setOptions({...DEFAULT_OPTIONS, inputFrom: inputFormat(format)});
    loadInto(toolkit, source, format);
    return toolkit.getMEI({});
};

/**
 * The engine version, for diagnostics.
 *
 * @returns {Promise<string>} The Verovio version string.
 */
export const version = async () => (await getToolkit()).getVersion();
