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
 * The keyboard map: one key event in, one editing action out.
 *
 * Keyboard entry is the accessible path, not a convenience, so the map is complete rather than a
 * subset of the toolbar, and it is a pure function of the event's own fields so that every
 * binding can be asserted under node without a browser.
 *
 * The letters and digits follow the convention musicians already have from MuseScore and
 * Sibelius - a to g place that note name, the arrows nudge the selection - and the three
 * accidental keys are ABC's own marks (`^` sharp, `_` flat, `=` natural), so that the two tabs
 * of this editor teach the same vocabulary.
 *
 * A digit sets the duration by its power of two: 1 is a semibreve, 2 a minim, 3 a crotchet, and
 * so on down to 7, a hemidemisemiquaver. A breve has no place in the map because the model's
 * durations start at the semibreve.
 *
 * @module     local_sheetmusic/editor/keymap
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

import {DURATIONS} from 'local_sheetmusic/model';

/** @type {object} The accidental keys, as ABC spells them, and the alteration each means. */
const ACCIDENTALS = {'^': 1, '_': -1, '=': 0};

/**
 * Turn a keyboard event into an editing action.
 *
 * @param {object} event Anything carrying key, ctrlKey, metaKey, shiftKey and altKey. A real
 *                       KeyboardEvent is one such thing; so is an object literal, which is what
 *                       the tests pass.
 * @returns {object|null} An action for `actions.apply()`, or null when the key is not ours and
 *                        must be left to the browser.
 */
export const mapKey = (event) => {
    const key = String(event.key || '');
    const command = Boolean(event.ctrlKey || event.metaKey);

    if (event.altKey) {
        return null;
    }

    if (command) {
        const lower = key.toLowerCase();
        if (lower === 'z') {
            return {type: event.shiftKey ? 'redo' : 'undo'};
        }
        if (lower === 'y') {
            return {type: 'redo'};
        }
        if (key === 'ArrowUp' || key === 'ArrowDown') {
            return {type: 'nudge', by: key === 'ArrowUp' ? 7 : -7};
        }
        return null;
    }

    if (/^[a-gA-G]$/.test(key)) {
        return {type: 'insert', step: key.toUpperCase(), rest: false};
    }
    if (/^[1-7]$/.test(key)) {
        return {type: 'setDuration', duration: DURATIONS[Number(key) - 1]};
    }
    if (key in ACCIDENTALS) {
        return {type: 'setAlter', alter: ACCIDENTALS[key]};
    }

    switch (key) {
        case 'ArrowUp':
            return {type: 'nudge', by: 1};
        case 'ArrowDown':
            return {type: 'nudge', by: -1};
        case 'ArrowLeft':
            return {type: 'move', by: -1};
        case 'ArrowRight':
            return {type: 'move', by: 1};
        case 'Home':
            return {type: 'select', index: 0};
        case 'End':
            return {type: 'select', index: Number.MAX_SAFE_INTEGER};
        case 'Backspace':
        case 'Delete':
            return {type: 'delete'};
        case 'r':
        case 'R':
            return {type: 'insert', rest: true};
        case 't':
        case 'T':
            return {type: 'toggleTie'};
        case '.':
            return {type: 'setDots'};
        case 'Escape':
            return {type: 'select', index: null};
        default:
            return null;
    }
};
