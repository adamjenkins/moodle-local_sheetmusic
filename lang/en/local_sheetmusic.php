<?php
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
 * Language strings for local_sheetmusic.
 *
 * @package    local_sheetmusic
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

$string['defaultscale'] = 'Default staff size';
$string['defaultscale_desc'] = 'The staff size used for scores that do not specify one.';
$string['editoracciddblflat'] = 'double flat';
$string['editoracciddblsharp'] = 'double sharp';
$string['editoraccidentals'] = 'Accidentals';
$string['editoraccidflat'] = 'flat';
$string['editoraccidnatural'] = 'natural';
$string['editoraccidsharp'] = 'sharp';
$string['editorapply'] = 'Use this import';
$string['editorcannotshow'] = 'This score cannot be shown yet: {$a}';
$string['editorclef'] = 'Clef';
$string['editorclefalto'] = 'Alto clef';
$string['editorclefbass'] = 'Bass clef';
$string['editorcleftenor'] = 'Tenor clef';
$string['editorcleftreble'] = 'Treble clef';
$string['editorcleftreble8'] = 'Treble clef, sounding an octave lower';
$string['editordelete'] = 'Delete';
$string['editordiscard'] = 'Discard this import';
$string['editordot'] = 'Dot';
$string['editordur1'] = 'Semibreve';
$string['editordur16'] = 'Semiquaver';
$string['editordur2'] = 'Minim';
$string['editordur32'] = 'Demisemiquaver';
$string['editordur4'] = 'Crotchet';
$string['editordur64'] = 'Hemidemisemiquaver';
$string['editordur8'] = 'Quaver';
$string['editordurdotted'] = 'dotted {$a}';
$string['editordurdoubledotted'] = 'double dotted {$a}';
$string['editorentryduration'] = 'Note length';
$string['editorentryedit'] = 'Edit';
$string['editorentryhelp'] = 'Click the staff to place a note, or click a note to select it. From the keyboard: a to g place a note, 1 to 7 set its length, . adds a dot, ^ _ = add a sharp, flat or natural, r places a rest, t ties, the up and down arrows move a note by a step and Ctrl with them by an octave, the left and right arrows move the selection, Backspace deletes, and Ctrl+Z undoes.';
$string['editorentryhistory'] = 'History';
$string['editorentrytoolbar'] = 'Note entry';
$string['editorexport'] = 'Export';
$string['editorexportfailed'] = 'That export could not be produced: {$a}';
$string['editorexportmidi'] = 'MIDI file (.mid)';
$string['editorexportpdf'] = 'PDF page, as a picture (.pdf)';
$string['editorexportpng'] = 'PNG image (.png)';
$string['editorexportsvg'] = 'SVG image (.svg)';
$string['editorflat'] = 'Flat';
$string['editorgrid'] = 'Snap notes to';
$string['editorgridvalue'] = '1/{$a} notes';
$string['editorimport'] = 'Import a file';
$string['editorimportfailed'] = 'That file could not be imported: {$a}';
$string['editorimportmidi'] = 'This came from a MIDI file, which does not contain sheet music. Check the settings below, then use the import.';
$string['editorimportreading'] = 'Reading {$a}...';
$string['editorkey'] = 'Key';
$string['editorkeybackspace'] = 'Backspace';
$string['editorlisting'] = 'Score contents';
$string['editormetre'] = 'Time signature';
$string['editornatural'] = 'Natural';
$string['editornokey'] = 'No key signature';
$string['editornometre'] = 'Free time';
$string['editornoteentryunavailable'] = 'Notes cannot be placed on this score: {$a} You can still edit it in the source tab.';
$string['editornotename'] = '{$a->pitch} {$a->length}';
$string['editornotes'] = 'Please check these before you continue';
$string['editorpitchaltered'] = '{$a->pitch} {$a->accidental}';
$string['editorposition'] = 'bar {$a->bar}, note {$a->index}';
$string['editorpreview'] = 'Preview';
$string['editorredo'] = 'Redo';
$string['editorrest'] = 'Rest';
$string['editorrestname'] = '{$a} rest';
$string['editorsaidadded'] = 'Added {$a->event}, {$a->where}';
$string['editorsaidchanged'] = 'Now {$a->event}, {$a->where}';
$string['editorsaidclef'] = 'Clef: {$a}';
$string['editorsaiddeleted'] = 'Deleted';
$string['editorsaidentry'] = 'Next: {$a}';
$string['editorsaidkey'] = 'Key signature {$a}';
$string['editorsaidmetre'] = 'Time signature {$a}';
$string['editorsaidnothing'] = 'Nothing is selected';
$string['editorsaidredone'] = 'Redone';
$string['editorsaidselected'] = 'Selected {$a->event}, {$a->where}';
$string['editorsaidundone'] = 'Undone';
$string['editorscorelabel'] = 'Score';
$string['editorscoreroledescription'] = 'Music staff editor';
$string['editorsharp'] = 'Sharp';
$string['editorshortcut'] = '{$a->name} ({$a->key})';
$string['editorsource'] = 'ABC source';
$string['editorsourcehelp'] = 'Type ABC notation here. The preview updates as you type.';
$string['editortabnotes'] = 'Notes';
$string['editortabsource'] = 'Source';
$string['editortie'] = 'Tie';
$string['editortiedname'] = '{$a}, tied';
$string['editortranspose'] = 'Transpose by semitones';
$string['editorundo'] = 'Undo';
$string['pluginname'] = 'Sheet music engine';
$string['privacy:metadata'] = 'The Sheet music engine plugin does not store any personal data.';
$string['scalelarge'] = 'Large';
$string['scalemedium'] = 'Medium';
$string['scalesmall'] = 'Small';
$string['scorebar'] = '1 bar';
$string['scorebars'] = '{$a} bars';
$string['scoredefaulttitle'] = 'Sheet music';
$string['scorekey'] = 'key {$a}';
$string['scoremetre'] = '{$a} time';
