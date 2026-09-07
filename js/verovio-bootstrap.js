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
 * Loads the vendored Verovio engine and hands the ready toolkit to the AMD layer.
 *
 * This shim exists because of a build-chain collision. Verovio ships as ES modules, but a
 * dynamic import() written inside amd/src is rewritten by Moodle's grunt build into a
 * RequireJS require() call, which then tries to load an ES module as a classic script and
 * fails. Loading the engine from a real `<script type="module">` sidesteps RequireJS
 * altogether, and unlike `new Function('return import(u)')` it needs no 'unsafe-eval', so it
 * still works on sites that set a Content Security Policy.
 *
 * It is deliberately NOT under amd/, so that the build never transforms it.
 *
 * @module     local_sheetmusic/verovio-bootstrap
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

import createVerovioModule from '../thirdparty/verovio/verovio-module.js';
import {VerovioToolkit, enableLog, LOG_OFF} from '../thirdparty/verovio/verovio.js';

const EVENT = 'local_sheetmusic/verovio-ready';

/**
 * Build a toolkit on an engine instance of its own.
 *
 * Playback needs this. Verovio's ABC importer keeps the last non-empty key signature it read
 * in state that outlives loadData() and is shared by every toolkit built on one engine
 * instance, so a score whose key signature is empty - C major, A minor, any dorian - is
 * rendered to MIDI in whatever key the previous ABC score was in. Measured against Verovio
 * 6.3.0 in P4-FINDINGS.md: only renderToMIDI() is affected, and destroying the engine is the
 * only thing that clears it.
 *
 * @returns {Promise<object>} A toolkit nothing has loaded into yet.
 */
const create = async () => {
    const instance = await createVerovioModule();
    enableLog(LOG_OFF, instance);
    return new VerovioToolkit(instance);
};

(async () => {
    try {
        const instance = await createVerovioModule();
        const toolkit = new VerovioToolkit(instance);
        // Verovio warns about missing ABC title fields; silence it rather than filling the
        // console on every page that shows a score.
        enableLog(LOG_OFF, instance);
        window.dispatchEvent(new CustomEvent(EVENT, {detail: {toolkit, create}}));
    } catch (error) {
        window.dispatchEvent(new CustomEvent(EVENT, {detail: {error}}));
    }
})();
