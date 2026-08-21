/**
 * The English language pack, read out of the PHP file the plugin ships.
 *
 * The surface fetches its strings through core/str in a browser and is handed them directly in
 * these tests, and a test that invented its own English would not notice a string the surface
 * asks for and the language pack does not have. So the pack itself is the fixture: every key the
 * editor names has to exist here or the test that reads it fails.
 */

import fs from 'node:fs';
import {fileURLToPath} from 'node:url';

const path = fileURLToPath(new URL('../../lang/en/local_sheetmusic.php', import.meta.url));
const source = fs.readFileSync(path, 'utf8');

/** @type {object} Every string in the pack, by key. */
export const strings = {};

source.split('\n').forEach((line) => {
    const match = /^\$string\['([^']+)'\] = '(.*)';$/.exec(line);
    if (match) {
        strings[match[1]] = match[2].replace(/\\'/g, "'").replace(/\\\\/g, '\\');
    }
});

/**
 * The strings whose keys start with a prefix.
 *
 * @param {string} prefix The prefix.
 * @returns {object} The matching strings.
 */
export const withPrefix = (prefix) => Object.fromEntries(
    Object.entries(strings).filter(([key]) => key.startsWith(prefix))
);
