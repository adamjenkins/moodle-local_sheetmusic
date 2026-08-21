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
 * The note-entry toolbar.
 *
 * Every control here produces one action for `actions.js` and knows nothing else: no engraver,
 * no serialiser, no DOM outside its own element. What a control means is therefore decided in
 * one place for the mouse, the keyboard and a click alike.
 *
 * A duration, a dot or an accidental button does double duty, which is the MuseScore behaviour
 * musicians expect: with something selected it changes that note, and with nothing selected it
 * sets what the next note will be. `update()` shows which state each control is in through
 * `aria-pressed`, so the toolbar reads correctly to a screen reader as well as to an eye.
 *
 * @module     local_sheetmusic/editor/toolbar
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

import {CLEFS, KEYS, METRES, TOOLBAR_DURATIONS} from 'local_sheetmusic/editor/actions';
import {fillNamed, make} from 'local_sheetmusic/editor/dom';

/** @type {object} How each offered duration is written on its button. */
const DURATION_TEXT = {1: '1', 2: '1/2', 4: '1/4', 8: '1/8', 16: '1/16'};

/** @type {object} The keyboard digit that sets each offered duration. */
const DURATION_KEY = {1: '1', 2: '2', 4: '3', 8: '4', 16: '5'};

/** @type {object[]} The accidental buttons: the mark shown, the alteration, and the string and key. */
const ACCIDENTALS = [
    {mark: '♭', alter: -1, string: 'editorflat', key: '_'},
    {mark: '♮', alter: 0, string: 'editornatural', key: '='},
    {mark: '♯', alter: 1, string: 'editorsharp', key: '^'},
];

/**
 * Build one toolbar button.
 *
 * @param {object} spec {text, label, hint, action, toggle}.
 * @param {Function} fire What to call with the action.
 * @returns {Element} The button.
 */
const button = (spec, fire) => {
    const element = make('button', {
        type: 'button',
        className: 'btn btn-outline-secondary sheetmusic-editor-key',
        textContent: spec.text,
        title: spec.hint || spec.label,
        'aria-label': spec.label,
        'aria-pressed': spec.toggle ? 'false' : null,
    });
    element.addEventListener('click', (event) => fire(spec.action, event));
    return element;
};

/**
 * Build a labelled select.
 *
 * @param {object} spec {id, label, values, text}.
 * @param {Function} fire What to call with the action.
 * @param {Function} build Turns a value into an action.
 * @returns {object} {field, select}.
 */
const chooser = (spec, fire, build) => {
    const select = make('select', {id: spec.id, className: 'custom-select form-select form-select-sm'});
    spec.values.forEach((value) => {
        select.appendChild(make('option', {value, textContent: spec.text(value)}));
    });
    select.addEventListener('change', (event) => fire(build(select.value), event));
    return {
        select,
        field: make('div', {className: 'sheetmusic-editor-field'}, [
            make('label', {for: spec.id, textContent: spec.label}),
            select,
        ]),
    };
};

/**
 * Show a value in a select, adding an option for it when it is not one of the offered ones.
 *
 * An imported tune may be in A dorian or in 7/8, and a control that silently showed the first
 * option instead would be telling the author something untrue about their own score.
 *
 * @param {Element} select The select.
 * @param {string} value The value to show.
 * @returns {void}
 */
const pick = (select, value) => {
    const text = String(value);
    if (!Array.from(select.options).some((option) => option.value === text)) {
        select.appendChild(make('option', {value: text, textContent: text}));
    }
    select.value = text;
};

/**
 * Build the note-entry toolbar.
 *
 * @param {object} spec {strings, id, onAction}.
 * @returns {object} {element, update}.
 */
export const createToolbar = (spec) => {
    const {strings, id} = spec;
    const fire = (action, event) => spec.onAction(action, event);
    const hint = (name, key) => fillNamed(strings.editorshortcut, {name, key});

    const durations = TOOLBAR_DURATIONS.map((duration) => button({
        text: DURATION_TEXT[duration],
        label: strings[`editordur${duration}`],
        hint: hint(strings[`editordur${duration}`], DURATION_KEY[duration]),
        action: {type: 'setDuration', duration},
        toggle: true,
    }, fire));
    const dot = button({
        text: '.', label: strings.editordot, hint: hint(strings.editordot, '.'),
        action: {type: 'setDots'}, toggle: true,
    }, fire);
    const rest = button({
        text: strings.editorrest, label: strings.editorrest, hint: hint(strings.editorrest, 'R'),
        action: {type: 'toggleRest'}, toggle: true,
    }, fire);
    const accidentals = ACCIDENTALS.map((accidental) => button({
        text: accidental.mark,
        label: strings[accidental.string],
        hint: hint(strings[accidental.string], accidental.key),
        action: {type: 'setAlter', alter: accidental.alter},
        toggle: true,
    }, fire));
    const tie = button({
        text: strings.editortie, label: strings.editortie, hint: hint(strings.editortie, 'T'),
        action: {type: 'toggleTie'},
    }, fire);
    const remove = button({
        text: strings.editordelete, label: strings.editordelete,
        hint: hint(strings.editordelete, strings.editorkeybackspace),
        action: {type: 'delete'},
    }, fire);
    const undo = button({
        text: strings.editorundo, label: strings.editorundo, hint: hint(strings.editorundo, 'Ctrl+Z'),
        action: {type: 'undo'},
    }, fire);
    const redo = button({
        text: strings.editorredo, label: strings.editorredo, hint: hint(strings.editorredo, 'Ctrl+Shift+Z'),
        action: {type: 'redo'},
    }, fire);

    const key = chooser({
        id: `${id}-keysig`, label: strings.editorkey, values: KEYS,
        text: (value) => (value === 'none' ? strings.editornokey : value),
    }, fire, (value) => ({type: 'setHeader', field: 'key', value}));
    const metre = chooser({
        id: `${id}-timesig`, label: strings.editormetre, values: METRES,
        text: (value) => (value === 'none' ? strings.editornometre : value),
    }, fire, (value) => ({type: 'setHeader', field: 'metre', value}));
    const clef = chooser({
        id: `${id}-clef`, label: strings.editorclef, values: CLEFS,
        text: (value) => strings[`editorclef${value.replace('-', '')}`] || value,
    }, fire, (value) => ({type: 'setHeader', field: 'clef', value}));

    const group = (label, children) => make('div', {
        className: 'btn-group btn-group-sm sheetmusic-editor-group', role: 'group', 'aria-label': label,
    }, children);

    // The buttons are one focus stop between them and the arrow keys move inside it, which is the
    // ARIA toolbar pattern and is not cosmetic here: measured in Chromium before it was done, the
    // staff was the twentieth tab stop in the dialogue, so a keyboard user had to pass every
    // button in this bar before they could type a note. The three selects stay ordinary focus
    // stops, outside the toolbar element, because a select of its own reads left and right arrows
    // as a change of value and cannot share them with a toolbar.
    const buttons = durations.concat([dot], accidentals, [rest, tie, remove, undo, redo]);
    const bar = make('div', {
        className: 'sheetmusic-editor-buttons', role: 'toolbar', 'aria-label': strings.editorentrytoolbar,
    }, [
        group(strings.editorentryduration, durations.concat([dot])),
        group(strings.editoraccidentals, accidentals),
        group(strings.editorentryedit, [rest, tie, remove]),
        group(strings.editorentryhistory, [undo, redo]),
    ]);
    const element = make('div', {className: 'sheetmusic-editor-notetoolbar'}, [
        bar,
        make('div', {className: 'sheetmusic-editor-settings'}, [key.field, metre.field, clef.field]),
    ]);

    /** @type {Element[]} Every control, for the times the whole toolbar has to go inert. */
    const controls = buttons.concat([key.select, metre.select, clef.select]);

    /** @type {boolean} Whether the pane behind the toolbar can be edited at all. */
    let enabled = true;

    /**
     * Make one button the toolbar's focus stop.
     *
     * @param {Element} chosen The button, or null to pick the first usable one.
     * @returns {void}
     */
    const stopAt = (chosen) => {
        const usable = buttons.filter((button) => !button.disabled);
        const target = chosen && !chosen.disabled ? chosen : usable[0];
        buttons.forEach((button) => {
            button.tabIndex = button === target ? 0 : -1;
        });
    };

    buttons.forEach((button) => button.addEventListener('focus', () => stopAt(button)));
    bar.addEventListener('keydown', (event) => {
        const usable = buttons.filter((button) => !button.disabled);
        const step = {ArrowRight: 1, ArrowLeft: -1}[event.key];
        const jump = {Home: 0, End: usable.length - 1}[event.key];
        if (!usable.length || (step === undefined && jump === undefined)) {
            return;
        }
        event.preventDefault();
        // Where the arrows count from is the focused button, or the one holding the tab stop when
        // the keystroke arrived before anything in the bar had focus.
        const from = usable.indexOf(document.activeElement);
        const at = from >= 0 ? from : usable.findIndex((button) => button.tabIndex === 0);
        const next = usable[step === undefined ? jump : (at + step + usable.length) % usable.length];
        stopAt(next);
        next.focus();
    });
    stopAt(null);

    return {
        element,

        /**
         * Turn the whole toolbar on or off.
         *
         * A score the model cannot hold is still shown, but editing it would silently throw away
         * whatever the model has no room for, so every control goes inert rather than misleading.
         *
         * @param {boolean} flag Whether the controls work.
         * @returns {void}
         */
        setEnabled: (flag) => {
            enabled = Boolean(flag);
            controls.forEach((control) => {
                control.disabled = !enabled;
            });
            stopAt(null);
        },

        /**
         * Show the state the editor is in.
         *
         * @param {object} state {entry, event, score, selection, canUndo, canRedo}.
         * @returns {void}
         */
        update: (state) => {
            if (!enabled) {
                return;
            }
            const selected = state.selection === null || state.selection === undefined
                ? null
                : (state.event || null);
            const length = selected || state.entry;
            durations.forEach((element, at) => {
                element.setAttribute('aria-pressed', String(length.duration === TOOLBAR_DURATIONS[at]));
            });
            dot.setAttribute('aria-pressed', String(Boolean(length.dots)));
            rest.setAttribute('aria-pressed', String(selected ? selected.kind === 'rest' : state.entry.rest));
            accidentals.forEach((element, at) => {
                const alter = selected && selected.kind === 'note' ? selected.alter : state.entry.alter;
                element.setAttribute('aria-pressed', String(alter === ACCIDENTALS[at].alter));
            });
            tie.disabled = !(selected && selected.kind === 'note');
            remove.disabled = selected === null;
            undo.disabled = !state.canUndo;
            redo.disabled = !state.canRedo;
            // A disabled button is not a focus stop, so the one the toolbar offers has to move off
            // it or the whole bar drops out of the tab order.
            stopAt(buttons.find((button) => button.tabIndex === 0 && !button.disabled));
            pick(key.select, state.score.key);
            pick(metre.select, state.score.metre);
            pick(clef.select, state.score.clef);
        },
    };
};
