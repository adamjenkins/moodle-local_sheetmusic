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
 * Playback, under the module name the rest of the suite uses.
 *
 * The same reason `editor.js` exists: Moodle resolves an AMD module name to
 * `amd/build/<name>.min.js` and to nothing else - `core_requirejs::find_one_amd_module()`
 * appends `.min.js` with no index-file fallback (`lib/classes/requirejs.php:47-65`). A
 * directory named `playback` is therefore invisible to consumers, so this file makes
 * `local_sheetmusic/playback` resolve while the transport itself lives in `playback/index.js`
 * beside the pieces it is built from.
 *
 * @module     local_sheetmusic/playback
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

export {attach, stopAll} from 'local_sheetmusic/playback/index';
