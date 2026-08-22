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
 * Saying, in words, what is on the staff.
 *
 * A WYSIWYG editor that only shows its state is unusable without sight, so every gesture the
 * note-entry pane accepts also produces a sentence: what was added, what is selected, where it
 * is. Those sentences go to an `aria-live` region and into a hidden running list of the score,
 * and they are built here, from the language pack, so that the pane holds no English of its own.
 *
 * @module     local_sheetmusic/editor/describe
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

import {fill, fillNamed} from 'local_sheetmusic/editor/dom';
import {locate} from 'local_sheetmusic/editor/actions';

/** @type {object} The language string naming each written accidental. */
const ACCIDENTALS = {
    '-2': 'editoracciddblflat',
    '-1': 'editoraccidflat',
    '0': 'editoraccidnatural',
    '1': 'editoraccidsharp',
    '2': 'editoracciddblsharp',
};

/**
 * Name a note value, dots included.
 *
 * @param {object} strings The language strings.
 * @param {object} length Anything carrying duration and dots.
 * @returns {string} Its name, such as "dotted crotchet".
 */
export const lengthName = (strings, length) => {
    const base = strings[`editordur${length.duration}`] || String(length.duration);
    if (length.dots === 1) {
        return fill(strings.editordurdotted, base);
    }
    if (length.dots >= 2) {
        return fill(strings.editordurdoubledotted, base);
    }
    return base;
};

/**
 * Name a pitch, accidental included.
 *
 * @param {object} strings The language strings.
 * @param {object} event A note event.
 * @returns {string} Its name, such as "G4" or "F5 sharp".
 */
export const pitchName = (strings, event) => {
    const pitch = `${event.step}${event.octave}`;
    return event.alter === null || event.alter === undefined
        ? pitch
        : fillNamed(strings.editorpitchaltered, {pitch, accidental: strings[ACCIDENTALS[String(event.alter)]]});
};

/**
 * Name one event.
 *
 * @param {object} strings The language strings.
 * @param {object} event A model event.
 * @returns {string} Its name, such as "G4 quaver" or "crotchet rest".
 */
export const describeEvent = (strings, event) => {
    if (!event) {
        return '';
    }
    const length = lengthName(strings, event);
    if (event.kind === 'rest') {
        return fill(strings.editorrestname, length);
    }
    const name = fillNamed(strings.editornotename, {pitch: pitchName(strings, event), length});
    return event.tie ? fill(strings.editortiedname, name) : name;
};

/**
 * Name what the next note will be.
 *
 * @param {object} strings The language strings.
 * @param {object} entry The entry settings.
 * @returns {string} Its name.
 */
export const describeEntry = (strings, entry) => {
    const length = lengthName(strings, entry);
    const base = entry.rest ? fill(strings.editorrestname, length) : length;
    return entry.alter === null || entry.alter === undefined
        ? base
        : fillNamed(strings.editorpitchaltered, {pitch: base, accidental: strings[ACCIDENTALS[String(entry.alter)]]});
};

/**
 * Say where an event sits.
 *
 * @param {object} strings The language strings.
 * @param {object} score A Score.
 * @param {number} index An index into the flattened events.
 * @returns {string} Such as "bar 2, note 3".
 */
export const describePosition = (strings, score, index) => {
    const at = locate(score, index);
    return at ? fillNamed(strings.editorposition, at) : '';
};

/**
 * Turn what an action reported into a sentence for the live region.
 *
 * @param {object} strings The language strings.
 * @param {object} context {score, entry} after the action.
 * @param {object|null} said What actions.apply() returned as its announce field.
 * @param {object|null} event The event the announcement is about, when there is one.
 * @returns {string} The sentence, or an empty string when there is nothing to say.
 */
export const announce = (strings, context, said, event) => {
    if (!said) {
        return '';
    }
    const where = said.index === undefined
        ? ''
        : describePosition(strings, context.score, said.index);
    const named = {event: describeEvent(strings, event), where};
    switch (said.key) {
        case 'added':
            return fillNamed(strings.editorsaidadded, named);
        case 'selected':
            return fillNamed(strings.editorsaidselected, named);
        case 'changed':
            return fillNamed(strings.editorsaidchanged, named);
        case 'deleted':
            return strings.editorsaiddeleted;
        case 'entry':
            return fill(strings.editorsaidentry, describeEntry(strings, context.entry));
        case 'undo':
            return strings.editorsaidundone;
        case 'redo':
            return strings.editorsaidredone;
        case 'nothing':
            return strings.editorsaidnothing;
        case 'header':
            return fill(strings[`editorsaid${said.field}`], said.field === 'clef'
                ? (strings[`editorclef${String(said.value).replace('-', '')}`] || said.value)
                : said.value);
        default:
            return '';
    }
};
