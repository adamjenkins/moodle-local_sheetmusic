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
 * The editing surface's own DOM: two tabs over one score, plus import and export.
 *
 * No modal, no buttons bar, no Moodle chrome of any kind - see `editor/index.js` for the
 * contract that keeps it that way. Nothing here reaches outside the container it is given.
 *
 * # The two tabs
 *
 * **Notes** is the default view, because the editor is for teachers who read music and not
 * necessarily ABC. It is `editor/notes.js`: click a staff to place a note, or type one.
 * **Source** is the ABC itself with a live preview beside it. They are two views of one
 * document and neither is authoritative: a note placed on the staff is serialised to ABC and
 * appears in the source tab, and ABC typed in the source tab is parsed back into the model the
 * notes tab edits. The textarea holds the score that will be saved either way.
 *
 * Three further behaviours are requirements rather than choices:
 *
 * - a score that does not parse **never blanks the preview**; the last good engraving stays on
 *   screen under the error, because an author correcting a typo needs to see what they had;
 * - every failure is shown **in the surface**, in a live region, and not only logged;
 * - a MIDI import opens its adjust panel and cannot be accepted without passing through it,
 *   because RELATIONS.md section B3 rule 2 forbids presenting a quantised result as a faithful
 *   transcription.
 *
 * @module     local_sheetmusic/editor/surface
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

import {ensureParser, fromAbc} from 'local_sheetmusic/abc';
import {attach as attachPlayback, stopAll as stopPlayback} from 'local_sheetmusic/playback';
import {render as engrave} from 'local_sheetmusic/engraver';
import {EXPORTS} from 'local_sheetmusic/export';
import {ACCEPT, importBytes, readFile} from 'local_sheetmusic/editor/importing';
import {buildMidiPanel} from 'local_sheetmusic/editor/midipanel';
import {createNotes} from 'local_sheetmusic/editor/notes';
import {fill, make, offer} from 'local_sheetmusic/editor/dom';
import {buildTabs} from 'local_sheetmusic/editor/tabs';

/** @type {string} Fired on the container after every preview attempt, good or bad. */
export const EVENT_PREVIEW = 'local_sheetmusic/editor:preview';

/** @type {number} Milliseconds of quiet typing before the preview is re-engraved. */
const DEBOUNCE = 250;

/** @type {number} How many identifiers have been handed out, so labels can be tied to fields. */
let sequence = 0;

/**
 * Build the editing surface inside a container.
 *
 * @param {object} spec {container, source, strings, debounce}.
 * @returns {object} The surface's controls: source(), validate(), destroy().
 */
export const createSurface = (spec) => {
    const {container, strings} = spec;
    const id = `sheetmusic-editor-${++sequence}`;
    const wait = spec.debounce === undefined ? DEBOUNCE : Number(spec.debounce);

    const alert = make('div', {className: 'sheetmusic-editor-alert alert alert-danger', role: 'alert', hidden: true});
    const noteList = make('ul');
    const notes = make('div', {className: 'sheetmusic-editor-notes alert alert-warning', hidden: true}, [
        make('p', {textContent: strings.editornotes}),
        noteList,
    ]);
    const textarea = make('textarea', {
        id: `${id}-source`, className: 'form-control sheetmusic-editor-source',
        rows: '10', spellcheck: 'false', 'aria-describedby': `${id}-sourcehelp`,
    });
    const preview = make('div', {
        className: 'sheetmusic-editor-preview', role: 'img', 'aria-label': strings.editorpreview,
    });
    // The transport goes in the pane, never inside `preview`: that element is the labelled
    // image, and a button inside a role="img" is not reachable.
    const previewPane = make('div', {className: 'sheetmusic-editor-pane'}, [
        make('span', {className: 'sheetmusic-editor-legend', textContent: strings.editorpreview}),
        preview,
    ]);
    const file = make('input', {type: 'file', id: `${id}-file`, className: 'sheetmusic-editor-file', accept: ACCEPT});
    const chooser = make('select', {id: `${id}-export`, className: 'form-select'});
    EXPORTS.forEach((entry) => {
        chooser.appendChild(make('option', {
            value: entry.format, textContent: strings[`editorexport${entry.format}`] || entry.format,
        }));
    });
    const exporter = make('button', {
        type: 'button', className: 'btn btn-secondary', textContent: strings.editorexport,
    });
    const midi = buildMidiPanel(strings, id);

    const notesPanel = make('div', {className: 'sheetmusic-editor-panel'});
    const sourcePanel = make('div', {className: 'sheetmusic-editor-panel'}, [
        make('div', {className: 'sheetmusic-editor-panes'}, [
            make('div', {className: 'sheetmusic-editor-pane'}, [
                make('label', {'for': textarea.id, textContent: strings.editorsource}),
                textarea,
                make('p', {id: `${id}-sourcehelp`, className: 'form-text', textContent: strings.editorsourcehelp}),
            ]),
            previewPane,
        ]),
    ]);

    const state = {error: null, timer: null, token: 0, imported: null, previous: '', synced: null,
        tab: 'notes', playback: null};

    /**
     * Show a message in the surface, or clear it.
     *
     * @param {string|null} message What to say, or null to say nothing.
     * @returns {void}
     */
    const say = (message) => {
        alert.textContent = message || '';
        alert.hidden = !message;
    };

    /**
     * List everything an import had to assume.
     *
     * @param {string[]} warnings The messages.
     * @returns {void}
     */
    const listNotes = (warnings) => {
        noteList.textContent = '';
        (warnings || []).forEach((warning) => noteList.appendChild(make('li', {textContent: warning})));
        notes.hidden = !(warnings || []).length;
    };

    /**
     * Engrave what is in the textarea, keeping the last good preview if it fails.
     *
     * @returns {Promise<void>}
     */
    const draw = async() => {
        const token = ++state.token;

        // The score is about to change under it, so the transport that was playing the old one
        // goes first. Re-attaching after a successful engrave gives the new score its own.
        if (state.playback) {
            state.playback.detach();
            state.playback = null;
        }

        // An empty surface is not a broken score. Opening the editor with nothing in it used to
        // engrave '' and immediately show the red "this cannot be shown" alert, which reads as a
        // failure before the author has typed anything.
        if (textarea.value.trim() === '') {
            preview.innerHTML = '';
            state.error = null;
            say(null);
            container.dispatchEvent(new window.CustomEvent(EVENT_PREVIEW, {detail: {error: null}}));
            return;
        }

        try {
            // Setting xmlIdChecksum keeps element ids stable between keystrokes, which is what the
            // note-entry pane's hit-testing needs (P0-FINDINGS-T2 decision 6).
            const {svg} = await engrave(textarea.value, 'abc', {xmlIdChecksum: true});
            if (token !== state.token) {
                return;
            }
            preview.innerHTML = svg;
            const engraved = preview.querySelector('svg');
            if (engraved) {
                engraved.setAttribute('aria-hidden', 'true');
                engraved.setAttribute('focusable', 'false');
            }
            state.error = null;
            say(null);
            const attached = await attachPlayback(previewPane, {
                source: textarea.value,
                format: 'abc',
                options: {xmlIdChecksum: true},
                figure: preview,
            });
            if (token === state.token) {
                state.playback = attached;
            } else if (attached) {
                attached.detach();
            }
        } catch (error) {
            if (token !== state.token) {
                return;
            }
            state.error = error && error.message ? error.message : String(error);
            say(fill(strings.editorcannotshow, state.error));
        }
        container.dispatchEvent(new window.CustomEvent(EVENT_PREVIEW, {detail: {error: state.error}}));
    };

    /**
     * Re-engrave once typing has stopped.
     *
     * @returns {void}
     */
    const schedule = () => {
        window.clearTimeout(state.timer);
        state.timer = window.setTimeout(draw, wait);
    };

    const pane = createNotes({
        container: notesPanel,
        strings,
        id,
        onChange: (source) => {
            // The note-entry pane has just re-serialised the model; the textarea is the same
            // document in the other notation, so it is updated without being re-parsed back.
            state.synced = source;
            textarea.value = source;
            draw();
        },
    });

    /**
     * Hand the textarea's ABC to the note-entry pane, if it has changed hands since last time.
     *
     * @returns {Promise<void>}
     */
    const syncNotes = async() => {
        if (state.synced === textarea.value) {
            return;
        }
        state.synced = textarea.value;
        await ensureParser();
        await pane.setSource(textarea.value);
    };

    const tabs = buildTabs([
        {name: 'notes', label: strings.editortabnotes, panel: notesPanel},
        {name: 'source', label: strings.editortabsource, panel: sourcePanel},
    ], id, (name) => {
        state.tab = name;
        if (name === 'notes') {
            syncNotes();
        } else {
            draw();
        }
    });

    const root = make('div', {className: 'sheetmusic-editor'}, [
        make('div', {className: 'sheetmusic-editor-toolbar'}, [
            make('div', {className: 'sheetmusic-editor-field'}, [
                make('label', {'for': file.id, textContent: strings.editorimport}),
                file,
            ]),
            make('div', {className: 'sheetmusic-editor-field'}, [
                make('label', {'for': chooser.id, textContent: strings.editorexport}),
                chooser,
                exporter,
            ]),
        ]),
        alert,
        notes,
        midi.panel,
        tabs.element,
        notesPanel,
        sourcePanel,
    ]);

    textarea.value = String(spec.source || '');
    container.appendChild(root);

    file.addEventListener('change', async() => {
        const chosen = file.files && file.files[0];
        if (!chosen) {
            return;
        }
        say(fill(strings.editorimportreading, chosen.name));
        state.previous = textarea.value;
        try {
            const {name, bytes} = await readFile(chosen);
            const result = await importBytes(name, bytes, {});
            textarea.value = result.source;
            listNotes(result.warnings);
            state.imported = result.kind === 'midi' ? {name, bytes} : null;
            midi.panel.hidden = !state.imported;
            say(null);
            await draw();
            await syncNotes();
            if (state.imported) {
                midi.grid.focus();
            }
        } catch (error) {
            say(fill(strings.editorimportfailed, error && error.message ? error.message : error));
        } finally {
            file.value = '';
        }
    });

    /**
     * Re-run a MIDI import with whatever the adjust panel currently says.
     *
     * @returns {Promise<void>}
     */
    const requantise = async() => {
        if (!state.imported) {
            return;
        }
        try {
            const result = await importBytes(state.imported.name, state.imported.bytes, {
                grid: Number(midi.grid.value),
                metre: midi.metre.value.trim() || null,
                key: midi.key.value.trim() || null,
                transpose: Number(midi.transpose.value) || 0,
            });
            textarea.value = result.source;
            listNotes(result.warnings);
            await draw();
            await syncNotes();
        } catch (error) {
            say(fill(strings.editorimportfailed, error && error.message ? error.message : error));
        }
    };

    [midi.grid, midi.metre, midi.key, midi.transpose].forEach((control) => {
        control.addEventListener('change', requantise);
    });

    midi.apply.addEventListener('click', () => {
        state.imported = null;
        midi.panel.hidden = true;
        textarea.focus();
    });

    midi.discard.addEventListener('click', async() => {
        state.imported = null;
        midi.panel.hidden = true;
        textarea.value = state.previous;
        listNotes([]);
        await draw();
        await syncNotes();
    });

    exporter.addEventListener('click', async() => {
        const entry = EXPORTS.find((candidate) => candidate.format === chooser.value);
        try {
            // The exporters need the model, and the model comes from parsing what is on screen.
            await ensureParser();
            offer(await entry.build(fromAbc(textarea.value)), `sheetmusic.${entry.extension}`);
        } catch (error) {
            say(fill(strings.editorexportfailed, error && error.message ? error.message : error));
        }
    });

    textarea.addEventListener('input', schedule);
    tabs.select('notes');
    draw();

    return {
        /**
         * The ABC currently in the surface.
         *
         * @returns {string} The source.
         */
        source: () => textarea.value,

        /**
         * Whether the surface holds something that can be saved, engraving it to find out.
         *
         * @returns {Promise<string|null>} An error message, or null when all is well.
         */
        validate: async() => {
            window.clearTimeout(state.timer);
            await draw();
            return state.error;
        },

        /**
         * Take the surface back out of the container.
         *
         * @returns {void}
         */
        destroy: () => {
            window.clearTimeout(state.timer);
            state.token++;
            // A dialogue that closes while a score is playing must not leave it playing.
            if (state.playback) {
                state.playback.detach();
                state.playback = null;
            } else {
                stopPlayback();
            }
            root.remove();
        },
    };
};
