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
 * The point-and-click note-entry pane: the editor's default view.
 *
 * It owns a `local_sheetmusic/model` score, and that score is the only thing it edits. Every
 * gesture - a click on the staff, a toolbar button, a key - becomes an action for
 * `editor/actions.js`, which changes the model; the model is then serialised by
 * `local_sheetmusic/abc` and engraved by `local_sheetmusic/engraver`, and the SVG that comes back
 * is what the author sees. Nothing here edits ABC text and nothing here reads the SVG for
 * anything but geometry, so the source tab and this tab cannot drift apart: they are two views
 * of one document.
 *
 * # Accessibility
 *
 * Keyboard entry is not a shortcut for the mouse, it is the other way of doing everything, so:
 * the score is one focus stop with a visible focus ring and a visible caret at the insertion
 * point; every key in `editor/keymap.js` works on it; every change is announced in an
 * `aria-live` region; and the score is also published as an ordinary hidden list, which is what
 * a screen reader can actually read, since the engraved SVG itself is `aria-hidden`.
 *
 * # What it does not do
 *
 * One staff, one voice. Grand staff, chords, tuplets and lyrics are Tier 2 in DESIGN.md section
 * 8.3 and would need the document model to grow a voice and staff dimension first; a pane that
 * pretended otherwise would produce scores the model cannot hold.
 *
 * @module     local_sheetmusic/editor/notes
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

import {barTicks, createScore} from 'local_sheetmusic/model';
import {fromAbc, toAbc} from 'local_sheetmusic/abc';
import {render as engrave} from 'local_sheetmusic/engraver';
import {apply, flatten, DEFAULT_ENTRY} from 'local_sheetmusic/editor/actions';
import {announce, describeEvent} from 'local_sheetmusic/editor/describe';
import {clientToUser, hitTest, readGeometry} from 'local_sheetmusic/editor/surface-notes';
import {createToolbar} from 'local_sheetmusic/editor/toolbar';
import {fill, make, makeSvg} from 'local_sheetmusic/editor/dom';
import {mapKey} from 'local_sheetmusic/editor/keymap';

/** @type {string} Fired on the pane's element after every engraving, so tests can wait for one. */
export const EVENT_DRAWN = 'local_sheetmusic/editor:notes-drawn';

/** @type {number} Ticks in the eighth note that ABC's L:1/8 makes the unit of every length. */
const UNIT_TICKS = 480;

/** @type {number} Eighths in the placeholder bar when the metre does not say. */
const FREE_BAR = 8;

/**
 * The source to engrave for a score with nothing in it.
 *
 * An empty score's ABC is a bare barline, which Verovio renders as an eight-pixel nothing: there
 * is no staff to click on, so the pane would open with no way in. A bar of invisible rests
 * engraves as an empty staff of the right width instead. It is never stored - `source()` returns
 * the score's own ABC - and it exists only so that the first click has somewhere to land.
 *
 * @param {object} score A Score with no events.
 * @returns {string} ABC for one empty bar.
 */
const emptyBar = (score) => {
    const capacity = barTicks(score.metre);
    const eighths = Number.isFinite(capacity) ? Math.max(1, Math.round(capacity / UNIT_TICKS)) : FREE_BAR;
    return `${toAbc(score)}x${eighths}|`;
};

/**
 * Build the note-entry pane.
 *
 * @param {object} spec {container, strings, id, source, onChange}.
 * @returns {object} The pane's controls.
 */
export const createNotes = (spec) => {
    const {strings, id} = spec;
    const state = {
        score: createScore({}),
        selection: null,
        entry: {...DEFAULT_ENTRY},
        token: 0,
        usable: true,
    };

    const status = make('p', {
        id: `${id}-status`, className: 'sheetmusic-editor-status', role: 'status', 'aria-live': 'polite',
    });
    const alert = make('div', {
        className: 'sheetmusic-editor-notealert alert alert-warning', role: 'alert', hidden: true,
    });
    const help = make('p', {id: `${id}-notehelp`, className: 'form-text', textContent: strings.editorentryhelp});
    const board = make('div', {
        id: `${id}-board`,
        className: 'sheetmusic-editor-score',
        tabindex: '0',
        role: 'application',
        'aria-label': strings.editorscorelabel,
        'aria-roledescription': strings.editorscoreroledescription,
        'aria-describedby': `${id}-notehelp ${id}-status`,
    });
    const listing = make('ol', {className: 'sheetmusic-editor-listing sr-only visually-hidden'});
    const toolbar = createToolbar({
        strings,
        id,
        onAction: (action, event) => {
            act(action);
            // A mouse click has moved focus to the button; a keyboard activation has not, and
            // stealing focus from someone who is tabbing through the toolbar would trap them.
            if (event && event.detail > 0) {
                board.focus();
            }
        },
    });

    const element = make('div', {className: 'sheetmusic-editor-notespane'}, [
        toolbar.element,
        alert,
        board,
        help,
        status,
        make('h6', {className: 'sr-only visually-hidden', textContent: strings.editorlisting}),
        listing,
    ]);

    /**
     * The event the selection points at.
     *
     * @returns {object|null} The event, or null when nothing is selected.
     */
    const selected = () => (state.selection === null ? null : flatten(state.score)[state.selection] || null);

    /**
     * Say something in the live region.
     *
     * @param {string} message What to say.
     * @returns {void}
     */
    const say = (message) => {
        status.textContent = message || '';
    };

    /**
     * Rewrite the hidden list that a screen reader reads the score from.
     *
     * @returns {void}
     */
    const relist = () => {
        const events = flatten(state.score);
        listing.textContent = '';
        events.forEach((event, index) => {
            listing.appendChild(make('li', {
                textContent: describeEvent(strings, event),
                'aria-current': index === state.selection ? 'true' : null,
            }));
        });
    };

    /**
     * Mark the selection and the insertion point on the engraved score.
     *
     * The marks are drawn as an overlay group in the SVG's own coordinates rather than by
     * restyling Verovio's elements, so nothing depends on how the engine happens to fill a
     * notehead, and the marks scale with the notation.
     *
     * The engine injects a stylesheet of its own into every rendered SVG, `#<root id> rect,
     * path, polygon, polyline, ellipse {stroke: currentColor}`, and an id-scoped rule beats any
     * rule this plugin's stylesheet can write. So the selection box is painted with `fill`,
     * which that rule does not touch, and the caret is a `line`, which it does not match.
     *
     * @param {object} geometry What readGeometry() returned.
     * @returns {void}
     */
    const decorate = (geometry) => {
        const svg = board.querySelector('svg');
        const margin = svg && svg.querySelector('.page-margin');
        if (!margin || !geometry.measures.length) {
            return;
        }
        const overlay = makeSvg('g', {class: 'sheetmusic-editor-overlay'});
        const event = state.selection === null ? null : geometry.events[state.selection];
        const home = geometry.measures[event ? event.measure : geometry.measures.length - 1];
        const space = home.spacing;
        if (event) {
            overlay.appendChild(makeSvg('rect', {
                class: 'sheetmusic-editor-selected',
                x: event.x - space * 0.45,
                y: event.y - space * 0.95,
                width: space * 2,
                height: space * 1.9,
                rx: space * 0.25,
            }));
        }
        const last = geometry.events.filter((candidate) => candidate.measure === home.index).pop();
        const caret = event
            ? event.x + space * 2
            : (last ? last.x + space * 2 : home.contentX);
        overlay.appendChild(makeSvg('line', {
            class: 'sheetmusic-editor-caret',
            x1: Math.min(caret, home.x2 - space * 0.2),
            x2: Math.min(caret, home.x2 - space * 0.2),
            y1: home.top - space,
            y2: home.bottom + space,
            'stroke-width': space / 8,
        }));
        margin.appendChild(overlay);
    };

    /**
     * Engrave the score as it now stands.
     *
     * @returns {Promise<void>}
     */
    const draw = async () => {
        const token = ++state.token;
        const events = flatten(state.score);
        const source = events.length ? toAbc(state.score) : emptyBar(state.score);
        let error = null;
        try {
            const {svg} = await engrave(source, 'abc', {xmlIdChecksum: true});
            if (token !== state.token) {
                return;
            }
            board.innerHTML = svg;
            const engraved = board.querySelector('svg');
            if (engraved) {
                engraved.setAttribute('aria-hidden', 'true');
                engraved.setAttribute('focusable', 'false');
            }
            decorate(readGeometry(board));
        } catch (failure) {
            if (token !== state.token) {
                return;
            }
            error = failure && failure.message ? failure.message : String(failure);
            board.textContent = '';
        }
        relist();
        toolbar.setEnabled(state.usable);
        toolbar.update({
            score: state.score,
            selection: state.selection,
            event: selected(),
            entry: state.entry,
            canUndo: state.score.undoStack.length > 0,
            canRedo: state.score.redoStack.length > 0,
        });
        element.dispatchEvent(new window.CustomEvent(EVENT_DRAWN, {bubbles: true, detail: {error}}));
    };

    /**
     * Run one action and show what it did.
     *
     * @param {object|null} action What to do.
     * @returns {void}
     */
    const act = (action) => {
        if (!action || !state.usable) {
            return;
        }
        const result = apply(state, action);
        state.selection = result.selection;
        state.entry = result.entry;
        const about = result.announce && result.announce.index !== undefined
            ? flatten(state.score)[result.announce.index]
            : selected();
        say(announce(strings, state, result.announce, about));
        if (result.changed) {
            spec.onChange(toAbc(state.score));
        }
        draw();
    };

    board.addEventListener('keydown', (event) => {
        const action = mapKey(event);
        if (action) {
            event.preventDefault();
            act(action);
        }
    });

    board.addEventListener('click', (event) => {
        if (!state.usable) {
            return;
        }
        board.focus();
        const svg = board.querySelector('svg');
        if (!svg) {
            return;
        }
        // The clicked element is what elementFromPoint() would have returned, so a click that
        // landed on a glyph needs no geometry at all; geometry answers the rest.
        const hit = event.target.closest && event.target.closest('[data-class="note"], [data-class="rest"]');
        const geometry = readGeometry(board);
        if (hit) {
            const at = geometry.events.findIndex((candidate) => candidate.id === hit.getAttribute('data-id'));
            if (at >= 0) {
                act({type: 'select', index: at});
                return;
            }
        }
        const point = clientToUser(svg, event.clientX, event.clientY);
        const answer = point && hitTest(geometry, point, {clef: state.score.clef});
        if (!answer) {
            return;
        }
        act(answer.type === 'event'
            ? {type: 'select', index: answer.index}
            : {type: 'insertAt', at: answer.at, step: answer.step, octave: answer.octave});
    });

    spec.container.appendChild(element);

    return {
        element,

        /**
         * Take a score in as ABC, replacing whatever the pane held.
         *
         * @param {string} text ABC source, or an empty string for an empty score.
         * @returns {Promise<void>}
         */
        setSource: (text) => {
            const previous = state.score;
            try {
                state.score = String(text || '').trim()
                    ? fromAbc(text)
                    : createScore({key: previous.key, metre: previous.metre, clef: previous.clef});
                state.usable = true;
                alert.hidden = true;
            } catch (error) {
                state.usable = false;
                alert.hidden = false;
                alert.textContent = fill(strings.editornoteentryunavailable,
                    error && error.message ? error.message : error);
            }
            state.selection = null;
            return draw();
        },

        /**
         * The score the pane holds, as ABC.
         *
         * @returns {string} The source.
         */
        source: () => toAbc(state.score),

        /**
         * Whether the pane can edit what it was given.
         *
         * @returns {boolean} False when the source was outside what the model can hold.
         */
        usable: () => state.usable,

        /**
         * Put the keyboard in the score.
         *
         * @returns {void}
         */
        focus: () => board.focus(),
    };
};
