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
 * The editing surface, under the module name the cross-plugin contract uses.
 *
 * RELATIONS.md section B1 names this module `local_sheetmusic/editor`, and Moodle resolves that
 * name to `amd/build/editor.min.js` and to nothing else: `core_requirejs::find_one_amd_module()`
 * appends `.min.js` to the module name with no index-file fallback of any kind
 * (`lib/classes/requirejs.php:47-65`, read on the test site). A directory named `editor` is
 * therefore invisible to consumers, however the sources are laid out inside it.
 *
 * So this file exists to make the contract's name resolve, and the surface itself lives in
 * `editor/index.js` beside the pieces it is built from. Consumers require
 * `local_sheetmusic/editor`; nothing else in the suite should reference `editor/index` directly.
 *
 * @module     local_sheetmusic/editor
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

export {open, setStrings, EVENT_CANCEL, EVENT_PREVIEW, EVENT_SAVE} from 'local_sheetmusic/editor/index';
