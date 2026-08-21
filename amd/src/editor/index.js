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
 * The score editing surface: the engine's second public module.
 *
 * # The contract
 *
 * ```
 * open({source, format, container}) -> Promise<{source, format}|null>
 * ```
 *
 * `local_sheetmusic/editor` is one of the two modules consumers may depend on (RELATIONS.md
 * section B1) and its shape may not change without a coordinated release. **`tiny_sheetmusic`
 * is written against exactly what follows.**
 *
 * ## What the caller provides
 *
 * | Field | Required | Meaning |
 * |---|---|---|
 * | `container` | yes | An `HTMLElement`, already in the document, that the editor fills. |
 * | `source` | no | The score to open, as text. Absent or empty opens an empty score. |
 * | `format` | no | The stored format token of `source`. Only `abc` is editable in v1. |
 * | `debounce` | no | Milliseconds of quiet typing before the preview re-engraves. |
 *
 * **The editor renders into a container the caller passes; it does not return an element.**
 * That is the decision, and it is made this way because the caller owns the modal: Moodle's
 * `ModalSaveCancel` builds its body from a string or a template long before this module could
 * hand anything back, so an element returned here would have to be re-parented into a body that
 * already exists. Passing the body in inverts that and leaves the modal's lifecycle entirely
 * with its owner. The editor appends exactly one child to the container and removes it again
 * when the promise settles; it never touches anything else in the document, and it creates,
 * styles, opens and closes nothing.
 *
 * ## How the caller finishes the session
 *
 * The editor owns no buttons, so it cannot know when the author has pressed Save. The caller
 * says so by dispatching one of two events **on the same container**:
 *
 * | Event | Effect |
 * |---|---|
 * | `local_sheetmusic/editor:save` | Resolves `{source, format}`. |
 * | `local_sheetmusic/editor:cancel` | Resolves `null`. |
 *
 * Dispatch the save event as `cancelable: true` and **check the return value of
 * `dispatchEvent()`**. It is `false` when the score does not currently engrave: the editor has
 * shown the author why, the promise has *not* settled, and the modal must stay open. This is
 * the whole reason the save path is an event rather than a callback - it needs a way to say no.
 *
 * ```js
 * const container = modal.getBody()[0];
 * const result = open({source, format: 'abc', container});
 * modal.getRoot().on(ModalEvents.save, (e) => {
 *     if (!container.dispatchEvent(new CustomEvent(EVENT_SAVE, {cancelable: true}))) {
 *         e.preventDefault();
 *     }
 * });
 * modal.getRoot().on(ModalEvents.hidden, () => container.dispatchEvent(new CustomEvent(EVENT_CANCEL)));
 * const saved = await result;
 * ```
 *
 * Dispatching cancel after save, as the example does, is harmless: the promise settles once and
 * later events are ignored.
 *
 * A third event travels the other way. `local_sheetmusic/editor:preview` fires on the container
 * after every preview attempt, with `detail.error` set to a message or to `null`. Callers may
 * ignore it; the tests use it to know when an engraving has finished.
 *
 * ## The two tabs
 *
 * The surface opens on **Notes**, the point-and-click and keyboard note-entry view
 * (`editor/notes.js`), with **Source** - the ABC itself and a live preview - beside it. Both edit
 * one document: a note placed on the staff is serialised to ABC, and ABC typed in the source tab
 * is parsed back into the model. Neither tab changes this contract, and `source()` still returns
 * the ABC whichever tab the author last used.
 *
 * ## What is not here
 *
 * One staff and one voice. Grand staff, chords, tuplets and lyrics are Tier 2 in `DESIGN.md`
 * section 8.3: the document model has no voice or staff dimension, so they are model work first
 * and editor work second.
 *
 * @module     local_sheetmusic/editor
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

import {createSurface, EVENT_PREVIEW} from 'local_sheetmusic/editor/surface';

/** @type {string} Dispatch this on the container to accept the score. Cancelable. */
export const EVENT_SAVE = 'local_sheetmusic/editor:save';

/** @type {string} Dispatch this on the container to abandon the score. */
export const EVENT_CANCEL = 'local_sheetmusic/editor:cancel';

export {EVENT_PREVIEW};

/**
 * The language strings the surface needs, in the order get_strings wants.
 *
 * Every `editor` string in the language pack is fetched, in one request, because the note-entry
 * pane names note values, accidentals and positions out loud and picks the string by computed key.
 *
 * @type {string[]}
 */
const KEYS = [
    'editoracciddblflat', 'editoracciddblsharp', 'editoraccidentals', 'editoraccidflat',
    'editoraccidnatural', 'editoraccidsharp', 'editorapply', 'editorcannotshow', 'editorclef',
    'editorclefalto', 'editorclefbass', 'editorcleftenor', 'editorcleftreble', 'editorcleftreble8',
    'editordelete', 'editordiscard', 'editordot', 'editordur1', 'editordur16', 'editordur2',
    'editordur32', 'editordur4', 'editordur64', 'editordur8', 'editordurdotted',
    'editordurdoubledotted', 'editorentryduration', 'editorentryedit', 'editorentryhelp',
    'editorentryhistory', 'editorentrytoolbar', 'editorexport', 'editorexportfailed',
    'editorexportmidi', 'editorexportpdf', 'editorexportpng', 'editorexportsvg', 'editorflat',
    'editorgrid', 'editorgridvalue', 'editorimport', 'editorimportfailed', 'editorimportmidi',
    'editorimportreading', 'editorkey', 'editorkeybackspace', 'editorlisting', 'editormetre',
    'editornatural', 'editornokey', 'editornometre', 'editornoteentryunavailable', 'editornotename',
    'editornotes', 'editorpitchaltered', 'editorposition', 'editorpreview', 'editorredo', 'editorrest',
    'editorrestname', 'editorsaidadded', 'editorsaidchanged', 'editorsaidclef', 'editorsaiddeleted',
    'editorsaidentry', 'editorsaidkey', 'editorsaidmetre', 'editorsaidnothing', 'editorsaidredone',
    'editorsaidselected', 'editorsaidundone', 'editorscorelabel', 'editorscoreroledescription',
    'editorsharp', 'editorshortcut', 'editorsource', 'editorsourcehelp', 'editortabnotes',
    'editortabsource', 'editortie', 'editortiedname', 'editortranspose', 'editorundo'
];

/** @type {Promise<object>|null} The resolved strings, fetched once per page. */
let stringsPromise = null;

/**
 * Install the language strings directly, instead of fetching them.
 *
 * The seam exists for the unit tests, which run under bare node with no Moodle behind them.
 *
 * @param {object|null} map String id to text, or null to go back to fetching.
 * @returns {void}
 */
export const setStrings = (map) => {
    stringsPromise = map ? Promise.resolve(map) : null;
};

/**
 * Fetch the surface's language strings.
 *
 * `core/str` is reached through RequireJS rather than imported, for the same reason the
 * vendored libraries are: a static import would make this module unloadable outside Moodle, and
 * the unit tests would then be testing a copy of the surface rather than the surface.
 *
 * @returns {Promise<object>} String id to text.
 */
const loadStrings = () => new Promise((resolve, reject) => {
    window.require(['core/str'], (Str) => {
        Str.get_strings(KEYS.map((key) => ({key, component: 'local_sheetmusic'})))
            .then((values) => {
                const map = {};
                KEYS.forEach((key, at) => {
                    map[key] = values[at];
                });
                resolve(map);
                return map;
            })
            .catch(reject);
    }, reject);
});

/**
 * Open the editing surface.
 *
 * @param {object} spec {container, source, format, debounce} - see the module comment, which is
 *                      the normative description of every one of them.
 * @returns {Promise<object|null>} {source, format} when the caller dispatches the save event,
 *                                 null when it dispatches the cancel event.
 * @throws {Error} If no container was passed, which is a programming error rather than a
 *                 runtime one and should not be caught.
 */
export const open = async (spec = {}) => {
    const container = spec.container;
    if (!container || typeof container.appendChild !== 'function') {
        throw new Error('local_sheetmusic: editor.open() needs a container element to render into');
    }
    if (!stringsPromise) {
        stringsPromise = loadStrings();
    }
    const strings = await stringsPromise;
    const surface = createSurface({
        container,
        strings,
        source: spec.source || '',
        debounce: spec.debounce,
    });

    return new Promise((resolve) => {
        let settled = false;
        const finish = (value) => {
            if (settled) {
                return;
            }
            settled = true;
            container.removeEventListener(EVENT_SAVE, onSave);
            container.removeEventListener(EVENT_CANCEL, onCancel);
            surface.destroy();
            resolve(value);
        };
        /**
         * Accept the score, unless it does not engrave.
         *
         * @param {Event} event The save event.
         * @returns {void}
         */
        function onSave(event) {
            if (settled) {
                return;
            }
            // The check is asynchronous and preventDefault() is not, so the veto is applied
            // first and lifted only if the score turns out to be fine. A caller that dispatched
            // a non-cancelable event gets the same answer through the promise, one tick later.
            event.preventDefault();
            surface.validate().then((error) => {
                if (!error) {
                    finish({source: surface.source(), format: 'abc'});
                }
                return error;
            }).catch(() => null);
        }
        /**
         * Abandon the score.
         *
         * @returns {void}
         */
        function onCancel() {
            finish(null);
        }
        container.addEventListener(EVENT_SAVE, onSave);
        container.addEventListener(EVENT_CANCEL, onCancel);
    });
};
