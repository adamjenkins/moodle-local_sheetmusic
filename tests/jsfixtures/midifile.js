/**
 * Loads the vendored midi-file build under node.
 *
 * The browser gets this file through RequireJS (see amd/src/midi.js). Node cannot: the
 * vendored file is a UMD bundle, and this package is type=module, so an import() of it would
 * be parsed as an ES module and fail. Wrapping it in the CommonJS function signature by hand
 * is the smallest way to run the real vendored bytes rather than a separately installed copy
 * from npm - which is the point, since it is those bytes that ship.
 *
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

import fs from 'node:fs';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const path = fileURLToPath(new URL('../../thirdparty/midi-file/midi-file.js', import.meta.url));
const shim = {exports: {}};
vm.runInThisContext(`(function (exports, module) {${fs.readFileSync(path, 'utf8')}\n})`, {filename: path})(
    shim.exports,
    shim
);

/** @type {object} The midi-file API object, from the vendored file. */
export const midiFile = shim.exports;

/** @type {Function} A parse function of the shape midi.js's setParser() expects. */
export const parseMidi = (bytes) => shim.exports.parseMidi(bytes);
