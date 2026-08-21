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
 * ABC notation in and out of the document model.
 *
 * Reading is delegated to the vendored abcjs parser: ABC 2.1 is a real language, and a
 * bespoke subset parser would mis-read pasted real-world tunes rather than reject them.
 * Writing is ours, because abcjs has no model-to-ABC serialiser.
 *
 * Two properties of toAbc() are storage-contract requirements, not stylistic choices
 * (RELATIONS.md section A2 rules 6 and 7):
 *
 * - the returned string never begins with a newline, because a newline placed straight
 *   after a `<pre>` start tag is discarded by the HTML parser, silently and permanently;
 * - escapeSource() escapes `&`, `<` and `>` and nothing else, because HTMLPurifier decodes
 *   every non-essential entity, so over-escaping shows a spurious diff on every first save.
 *
 * @module     local_sheetmusic/abc
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

import {createScore, DURATIONS, eventTicks} from 'local_sheetmusic/model';

/** @type {number} Ticks in the eighth note that L:1/8 makes the unit of every emitted length. */
const UNIT_TICKS = 480;

/** @type {string} The diatonic steps in the order abcjs counts them from C. */
const STEPS = 'CDEFGAB';

/** @type {string} Where the vendored parser lives, relative to wwwroot. */
const VENDOR_URL = '/local/sheetmusic/thirdparty/abcjs/abcjs-basic-min.js';

/** @type {object} Written accidental, as abcjs names it, to the model's -2..2. */
const ALTERS = {dblflat: -2, flat: -1, natural: 0, sharp: 1, dblsharp: 2};

/** @type {string[]} Accidental marks in ABC, indexed by alter + 2. */
const ALTER_MARKS = ['__', '_', '=', '^', '^^'];

/** @type {Function|null} The parse function in use. */
let parser = null;

/** @type {Promise|null} An in-flight load of the vendored parser. */
let loading = null;

/**
 * Install the parse function.
 *
 * The seam exists because the browser loads a 512 KB vendored file over the network and
 * node loads the same bytes off disk, and neither belongs inside the mapping code.
 *
 * @param {Function|null} fn Takes ABC source, returns abcjs's array of tunes.
 * @returns {void}
 */
export const setParser = (fn) => {
    parser = fn;
    loading = null;
};

/**
 * Load the vendored abcjs build through RequireJS.
 *
 * RequireJS treats a module id ending in `.js` as a plain URL, bypassing baseUrl and paths,
 * which is the only way to reach a file outside amd/build. It has to be RequireJS rather
 * than a bare script tag: abcjs registers an anonymous define(), and an anonymous define()
 * that RequireJS did not ask for is a mismatched-define error.
 *
 * @returns {Promise<Function>} The parse function.
 */
const loadVendored = () => new Promise((resolve, reject) => {
    const wwwroot = (window.M && window.M.cfg && window.M.cfg.wwwroot) || '';
    window.require([wwwroot + VENDOR_URL], (abcjs) => {
        if (!abcjs || typeof abcjs.parseOnly !== 'function') {
            reject(new Error('local_sheetmusic: the ABC parser loaded but is not usable'));
            return;
        }
        resolve((source) => abcjs.parseOnly(source));
    }, reject);
});

/**
 * Make sure a parser is available, fetching it on first use.
 *
 * Callers await this once; fromAbc() itself stays synchronous so that the source tab can
 * reparse on every keystroke without a promise in the loop.
 *
 * @returns {Promise<Function>} The parse function.
 */
export const ensureParser = () => {
    if (parser) {
        return Promise.resolve(parser);
    }
    if (!loading) {
        loading = loadVendored().then((fn) => {
            parser = fn;
            loading = null;
            return fn;
        });
    }
    return loading;
};

/**
 * Escape a score source for storage as the text content of a `<pre>`.
 *
 * Exactly three characters, in this order. See the module comment.
 *
 * @param {string} text The score source.
 * @returns {string} The escaped source.
 */
export const escapeSource = (text) => String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

/**
 * Normalise a score source's line endings to LF.
 *
 * Moodle's form submission rewrites every LF to CRLF exactly once on save, so server-side
 * code sees CRLF where the browser saw LF (P0-FINDINGS-T1), and RELATIONS.md section A2
 * rule 5 makes LF the form both sides read. abcjs happens to parse either - measured - but
 * its startChar/endChar offsets are counted against the LF form regardless, so a caller that
 * used them to index back into un-normalised CRLF text would be wrong by one per preceding
 * line. Normalise first and the offsets are true.
 *
 * @param {string} text A score source.
 * @returns {string} The same source with LF line endings.
 */
export const normaliseSource = (text) => String(text).replace(/\r\n?/g, '\n');

/**
 * Greatest common divisor.
 *
 * @param {number} a First number.
 * @param {number} b Second number.
 * @returns {number} Their GCD.
 */
const gcd = (a, b) => (b ? gcd(b, a % b) : a);

/**
 * The length suffix an event takes when the unit note length is an eighth.
 *
 * @param {object} event A model event.
 * @returns {string} An ABC length suffix, empty for the unit length itself.
 */
const lengthSuffix = (event) => {
    const ticks = eventTicks(event);
    const divisor = gcd(ticks, UNIT_TICKS);
    const num = ticks / divisor;
    const den = UNIT_TICKS / divisor;
    if (den === 1) {
        return num === 1 ? '' : String(num);
    }
    return num === 1 ? `/${den}` : `${num}/${den}`;
};

/**
 * Write one event as ABC.
 *
 * @param {object} event A model event.
 * @returns {string} Its ABC text.
 */
const eventToAbc = (event) => {
    if (event.kind === 'rest') {
        return `z${lengthSuffix(event)}`;
    }
    const mark = event.alter === null ? '' : ALTER_MARKS[event.alter + 2];
    const pitch = event.octave >= 5
        ? event.step.toLowerCase() + '\''.repeat(event.octave - 5)
        : event.step.toUpperCase() + ','.repeat(Math.max(0, 4 - event.octave));
    return `${mark}${pitch}${lengthSuffix(event)}${event.tie ? '-' : ''}`;
};

/**
 * Serialise a score to ABC.
 *
 * The output is deliberately plain: one tune, headers then a single music line, no beam
 * grouping and no line breaks inside the body. Beams and line breaks carry no model state,
 * so re-emitting them would be invention, and their absence is what makes the round trip a
 * fixed point rather than merely stable-ish.
 *
 * A music line is emitted even for an empty score, as a bare barline. That is not
 * decoration: abcjs discards the headers of a tune that has no music line at all, so a
 * headers-only tune loses its metre and key on the way back in.
 *
 * @param {object} score A Score.
 * @returns {string} ABC source, never starting or ending with a newline.
 */
export const toAbc = (score) => {
    const lines = ['X:1', `M:${score.metre}`, 'L:1/8'];
    const clef = score.clef && score.clef !== 'treble' ? ` clef=${score.clef}` : '';
    lines.push(`K:${score.key}${clef}`);
    // An empty bar has no ABC spelling of its own - `||` is a double barline - so it is dropped.
    const bars = score.bars.filter((bar) => bar.events.length);
    lines.push(`|${bars.map((bar) => bar.events.map(eventToAbc).join('')).join('|')}${bars.length ? '|' : ''}`);
    return lines.join('\n');
};

/**
 * Split a note value into a duration and a number of dots.
 *
 * abcjs reports a note as a fraction of a whole note and never reports dots, so this is the
 * inverse: try no dots, then one, then two, and accept the first that lands on a power of
 * two. Anything else - a tuplet, a broken rhythm - is outside what the model can hold, and
 * saying so is better than storing a note of the wrong length.
 *
 * @param {number} value The note value as a fraction of a whole note.
 * @returns {object} {duration, dots}.
 * @throws {Error} When no duration and dot count produce this value.
 */
export const decomposeValue = (value) => {
    for (let dots = 0; dots <= 2; dots++) {
        const scale = Math.pow(2, dots);
        const exact = ((2 * scale - 1) / scale) / value;
        const duration = Math.round(exact);
        if (Math.abs(exact - duration) < 1e-9 && DURATIONS.includes(duration)) {
            return {duration, dots};
        }
    }
    throw new Error(`local_sheetmusic: note length ${value} is not one this editor can hold`);
};

/**
 * Read the key signature off a parsed staff.
 *
 * @param {object} staff An abcjs staff.
 * @returns {string} The key in ABC's own spelling.
 */
const keyOf = (staff) => {
    const key = staff.key;
    if (!key || !key.root) {
        return 'C';
    }
    if (key.root === 'none') {
        return 'none';
    }
    // abcjs capitalises modal names (Dor, Mix); ABC's own spelling is lower case, and the
    // stored source is read by musicians when the filter is off.
    const mode = String(key.mode || '');
    return `${key.root}${key.acc || ''}${mode.length > 1 ? mode.toLowerCase() : mode}`;
};

/**
 * Read the metre off a parsed staff.
 *
 * @param {object} staff An abcjs staff.
 * @returns {string} The metre as num/den, or none.
 */
const metreOf = (staff) => {
    const meter = staff.meter;
    if (!meter) {
        return 'none';
    }
    if (meter.type === 'common_time') {
        return '4/4';
    }
    if (meter.type === 'cut_time') {
        return '2/2';
    }
    const value = (meter.value || [])[0];
    return value ? `${value.num}/${value.den}` : 'none';
};

/**
 * Read the clef off a parsed staff.
 *
 * abcjs reports a tenor clef as an alto clef sitting two staff positions higher, so the
 * type alone is not enough to tell them apart.
 *
 * @param {object} staff An abcjs staff.
 * @returns {string} The clef name.
 */
const clefOf = (staff) => {
    const clef = staff.clef;
    if (!clef || !clef.type) {
        return 'treble';
    }
    return clef.type === 'alto' && clef.clefPos === 8 ? 'tenor' : clef.type;
};

/**
 * Map one parsed note or rest onto a model event.
 *
 * Anything the model cannot hold is refused rather than approximated. A tuplet in
 * particular parses into notes whose written duration is right and whose sounding duration
 * is two thirds of it, so dropping the tuplet quietly would produce a bar that looks correct
 * and is a beat too long. Tuplets and chords are Tier 2 (DESIGN.md section 8.3).
 *
 * @param {object} element An abcjs element with el_type note.
 * @returns {object|null} A model event, or null for an element the model does not hold.
 * @throws {Error} On notation outside the model's range.
 */
const elementToEvent = (element) => {
    if (element.startTriplet) {
        throw new Error('local_sheetmusic: this editor cannot yet hold tuplets');
    }
    const length = decomposeValue(element.duration);
    if (element.rest) {
        return ['rest', 'invisible'].includes(element.rest.type)
            ? {kind: 'rest', ...length}
            : null;
    }
    const pitches = element.pitches || [];
    if (pitches.length > 1) {
        throw new Error('local_sheetmusic: this editor cannot yet hold chords');
    }
    const pitch = pitches[0];
    if (!pitch) {
        return null;
    }
    let alter = null;
    if (pitch.accidental) {
        if (!(pitch.accidental in ALTERS)) {
            throw new Error(`local_sheetmusic: unsupported accidental ${pitch.accidental}`);
        }
        alter = ALTERS[pitch.accidental];
    }
    return {
        kind: 'note',
        step: STEPS[(((pitch.pitch % 7) + 7) % 7)],
        octave: 4 + Math.floor(pitch.pitch / 7),
        alter,
        ...length,
        tie: Boolean(pitch.startTie),
    };
};

/**
 * Parse ABC into a score.
 *
 * Tolerates CRLF: Moodle's form submission rewrites every LF to CRLF exactly once on save,
 * so server-side code sees CRLF where the browser saw LF (P0-FINDINGS-T1). Neither ending
 * is a difference as far as this function is concerned.
 *
 * @param {string} text ABC source.
 * @returns {object} A Score.
 * @throws {Error} If no parser has been installed, or the source holds notation the model
 *                 cannot represent.
 */
export const fromAbc = (text) => {
    if (!parser) {
        throw new Error('local_sheetmusic: call ensureParser() before fromAbc()');
    }
    const tunes = parser(normaliseSource(text));
    if (!tunes || !tunes.length) {
        throw new Error('local_sheetmusic: that is not a tune');
    }
    // deline() flattens abcjs's per-source-line structure; without it a tune broken over two
    // text lines parses as two independent staves.
    const lines = tunes[0].deline({}).filter((line) => line.staff && line.staff.length);
    const first = lines.length ? lines[0].staff[0] : {};

    const bars = [];
    let current = {events: []};
    lines.forEach((line) => {
        (line.staff[0].voices[0] || []).forEach((element) => {
            if (element.el_type === 'bar') {
                if (current.events.length) {
                    bars.push(current);
                    current = {events: []};
                }
                return;
            }
            if (element.el_type !== 'note') {
                return;
            }
            const event = elementToEvent(element);
            if (event) {
                current.events.push(event);
            }
        });
    });
    if (current.events.length) {
        bars.push(current);
    }

    return createScore({key: keyOf(first), metre: metreOf(first), clef: clefOf(first), bars});
};
