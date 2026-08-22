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
 * The panel that reopens the assumptions a MIDI import had to make.
 *
 * RELATIONS.md section B3 rule 2 forbids presenting a quantised performance as a faithful
 * transcription, so an imported MIDI file arrives with this panel open and the author passes
 * through it before the score can be accepted.
 *
 * @module     local_sheetmusic/editor/midipanel
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

import {fill, make} from 'local_sheetmusic/editor/dom';
import {GRIDS} from 'local_sheetmusic/midi';

/**
 * Build the MIDI adjust panel.
 *
 * @param {object} strings The language strings.
 * @param {string} id A unique prefix for this surface's element ids.
 * @returns {object} The panel and its controls.
 */
export const buildMidiPanel = (strings, id) => {
    const field = (key, control) => make('div', {className: 'sheetmusic-editor-field'}, [
        make('label', {'for': control.id, textContent: strings[key]}),
        control,
    ]);
    const grid = make('select', {id: `${id}-grid`, className: 'form-select'});
    GRIDS.forEach((value) => {
        grid.appendChild(make('option', {value: String(value), textContent: fill(strings.editorgridvalue, value)}));
    });
    grid.value = '16';
    const metre = make('input', {id: `${id}-metre`, type: 'text', className: 'form-control', size: '5'});
    const key = make('input', {id: `${id}-key`, type: 'text', className: 'form-control', size: '5'});
    const transpose = make('input', {
        id: `${id}-transpose`, type: 'number', className: 'form-control', value: '0', min: '-24', max: '24',
    });
    const apply = make('button', {type: 'button', className: 'btn btn-primary', textContent: strings.editorapply});
    const discard = make('button', {
        type: 'button', className: 'btn btn-secondary', textContent: strings.editordiscard,
    });
    const panel = make('div', {className: 'sheetmusic-editor-midi', hidden: true}, [
        make('p', {textContent: strings.editorimportmidi}),
        field('editorgrid', grid),
        field('editormetre', metre),
        field('editorkey', key),
        field('editortranspose', transpose),
        make('div', {className: 'sheetmusic-editor-actions'}, [apply, discard]),
    ]);
    return {panel, grid, metre, key, transpose, apply, discard};
};
