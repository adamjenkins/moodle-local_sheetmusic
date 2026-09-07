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

/** @type {Function|null} Test seam: overrides how a private engine is obtained. */
let engineFactory = null;

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
 * Replace the private-engine factory. Intended for unit tests.
 *
 * Every call must return a toolkit on an engine instance of its own; handing back a shared one
 * would silently reintroduce the key-signature leak `renderWithAudio()` exists to avoid.
 *
 * @param {Function|null} factory Returns a promise for a fresh toolkit, or null to reset.
 * @returns {void}
 */
export const setEngineFactory = (factory) => {
    engineFactory = factory;
};

/**
 * Staff sizes the site setting offers, as Verovio scale percentages.
 *
 * @type {object}
 */
const SCALES = {s: 30, m: 40, l: 55};

/**
 * The engraver scale a stored staff-size token asks for.
 *
 * @param {string} token The token from the site setting: s, m or l.
 * @returns {number} The Verovio scale percentage, defaulting to medium.
 */
export const scaleFor = (token) => SCALES[token] || SCALES.m;

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
const loadBootstrap = () => new Promise((resolve, reject) => {
    const wwwroot = (window.M && window.M.cfg && window.M.cfg.wwwroot) || '';

    window.addEventListener('local_sheetmusic/verovio-ready', (event) => {
        if (event.detail && event.detail.toolkit) {
            resolve(event.detail);
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

/** @type {Promise<object>|null} Resolves to what the bootstrap handed over. */
let bootstrapPromise = null;

/**
 * Obtain what the bootstrap exports, loading it on first use.
 *
 * @returns {Promise<object>} {toolkit, create}.
 */
const getBootstrap = () => {
    if (!bootstrapPromise) {
        bootstrapPromise = loadBootstrap();
    }
    return bootstrapPromise;
};

/**
 * The shared toolkit, for rendering.
 *
 * @returns {Promise<object>} A ready toolkit.
 */
const loadToolkit = async() => (await getBootstrap()).toolkit;

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
 * Build a toolkit on an engine instance of its own.
 *
 * @returns {Promise<object>} A toolkit nothing has loaded into yet.
 */
const createEngine = async() => {
    if (engineFactory) {
        return engineFactory();
    }
    const {create} = await getBootstrap();
    if (typeof create !== 'function') {
        throw new Error('local_sheetmusic: this engine build cannot create a private instance');
    }
    return create();
};

/**
 * Run one job on a private engine, and take the engine down afterwards.
 *
 * The engine is single-use on purpose. Verovio's ABC importer remembers the last non-empty key
 * signature it read, in state that survives loadData() and is shared by every toolkit built on
 * the same engine instance, so a score in C major rendered to MIDI after a score in G major
 * sounds in G major - the notation stays correct, only the MIDI is wrong. Nothing clears that
 * state: not resetOptions(), not a fresh toolkit, not reloading, not priming with an explicit
 * empty key signature in ABC, MEI or MusicXML. Destroying the engine does, and building one
 * costs about 50 ms, which is paid once per playback or export and never on page load.
 * Measured against Verovio 6.3.0; the evidence is in P4-FINDINGS.md.
 *
 * @param {Function} job Receives the engine, returns the result.
 * @returns {Promise<*>} Whatever the job returned.
 */
const withEngine = async(job) => {
    const engine = await createEngine();
    try {
        return await job(engine);
    } finally {
        if (engine && typeof engine.destroy === 'function') {
            engine.destroy();
        }
    }
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
export const render = async(source, format, options = {}) => {
    const toolkit = await getToolkit();
    toolkit.setOptions({...DEFAULT_OPTIONS, ...options, inputFrom: inputFormat(format)});
    loadInto(toolkit, source, format);
    const svg = toolkit.renderToSVG(1);
    return {svg, idMap: buildIdMap(svg)};
};

/**
 * Engrave a score and produce everything playback needs, from one load.
 *
 * The three outputs have to come from the same load or they do not describe the same score:
 * Verovio regenerates element ids on every loadData(), so a timemap fetched separately points
 * at ids that are not in the SVG on the page. Callers therefore replace the rendered score
 * with the SVG returned here before using the timemap against it.
 *
 * Which output is authoritative for what is not interchangeable:
 *
 * - **The MIDI says what sounds.** The SVG carries the written note, not the sounding one -
 *   `@accid.ges` is not among the attributes Verovio emits - so a key signature cannot be read
 *   back off the page, and tied notes appear there as two noteheads for one sound.
 * - **The timemap says what is seen.** It gives each notehead its own entry, including the
 *   second half of a tie, which is what a cursor should follow.
 *
 * @param {string} source The score source.
 * @param {string} format The stored format token.
 * @param {object} options Engraver options, merged over the defaults.
 * @returns {Promise<{svg: string, idMap: object, midi: string, timemap: object[]}>} The
 *          rendered SVG, its element map, base64 MIDI, and the timemap for that same SVG.
 */
export const renderWithAudio = async(source, format, options = {}) => withEngine((engine) => {
    engine.setOptions({...DEFAULT_OPTIONS, ...options, inputFrom: inputFormat(format)});
    loadInto(engine, source, format);
    const svg = engine.renderToSVG(1);
    const midi = engine.renderToMIDI();
    // The bundled build hands back an array; older ones hand back JSON text.
    const timemap = engine.renderToTimemap({includeMeasures: true, includeRests: true});
    return {
        svg,
        idMap: buildIdMap(svg),
        midi,
        timemap: typeof timemap === 'string' ? JSON.parse(timemap) : timemap,
    };
});

/**
 * Render a score to a MIDI file.
 *
 * Runs on a private engine for the reason `withEngine()` gives: on the shared toolkit, the MIDI
 * of a score whose key signature is empty carries the previous score's key.
 *
 * @param {string} source The score source.
 * @param {string} format The stored format token.
 * @returns {Promise<string>} Base64-encoded MIDI.
 */
export const toMidi = async(source, format) => withEngine((engine) => {
    engine.setOptions({...DEFAULT_OPTIONS, inputFrom: inputFormat(format)});
    loadInto(engine, source, format);
    return engine.renderToMIDI();
});

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
export const toMei = async(source, format) => {
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
export const version = async() => (await getToolkit()).getVersion();
