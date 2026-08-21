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
 * Hit-testing an engraved score: which note was clicked, or where would a new one go.
 *
 * This is the layer DESIGN.md section 8.1 calls the one technical assumption the whole editor
 * rests on, and P0-FINDINGS-T2 section 5 proved it in a real browser. Everything here reads the
 * geometry **out of the rendered SVG** rather than assuming any constant: Verovio moves the
 * staff down the page as soon as a note needs ledger lines above it (measured - the same
 * fixture engraves its bottom staff line at y=1260 with no ledger lines and at y=1629 with
 * them), so a hard-coded staff position would mis-read every pitch in a score with a high note
 * in it.
 *
 * Two properties make the mapping back to the document model exact rather than approximate:
 *
 * - Verovio emits one `data-class="staff"` element **per measure**, carrying that measure's own
 *   five staff-line paths as its only direct `path` children (ledger lines are `g` groups, so
 *   they never join the five). Reading them gives the line spacing and the bottom line, which
 *   is all a pitch needs.
 * - `data-class="note"` and `data-class="rest"` elements appear in document order, which is the
 *   order of the events in the model. The nth of them is the model's nth event, so nothing here
 *   has to persist a Verovio id - and it must not, because ids are regenerated on every
 *   loadData() (P0-FINDINGS-T2 section 3.1).
 *
 * Coordinates: everything is computed in the SVG's own user space, the space the `page-margin`
 * group establishes, because that is the space the file's own numbers are written in and it is
 * the one space that exists without a browser layout. `clientToUser()` is the only function
 * that needs a laid-out document.
 *
 * @module     local_sheetmusic/editor/surface-notes
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

/** @type {string} The diatonic steps, ascending from C. */
const STEPS = 'CDEFGAB';

/**
 * The diatonic number of the pitch the bottom staff line carries, by clef.
 *
 * Measured on the engine rather than looked up: engraving a C4 under each clef puts it 2 half
 * spaces below the bottom line in treble, 10 above in bass, 4 above in alto and 6 above in
 * tenor, which is exactly this table.
 *
 * @type {object}
 */
const CLEF_BOTTOM = {
    alto: 24,
    bass: 18,
    perc: 30,
    tenor: 22,
    treble: 30,
    'treble-8': 23,
};

/** @type {number} How far, in staff spaces, a notehead's centre sits right of its origin. */
const HEAD_CENTRE = 0.6;

/** @type {number} How far, in staff spaces, a click may miss a note horizontally and still hit it. */
const HIT_X = 1.1;

/** @type {number} How far, in staff spaces, a click may miss a note vertically and still hit it. */
const HIT_Y = 1;

/** @type {number} Lowest staff position a click is allowed to mean, in half spaces below the bottom line. */
const LOWEST = -11;

/** @type {number} Highest staff position a click is allowed to mean, in half spaces above the bottom line. */
const HIGHEST = 19;

/**
 * The diatonic number of a pitch: its step and octave collapsed into one countable integer.
 *
 * @param {string} step A note name, A to G.
 * @param {number} octave The octave, in scientific pitch notation.
 * @returns {number} The diatonic number.
 */
export const diatonic = (step, octave) => Number(octave) * 7 + STEPS.indexOf(String(step).toUpperCase());

/**
 * Split a diatonic number back into a step and an octave.
 *
 * @param {number} value The diatonic number.
 * @returns {object} {step, octave}.
 */
export const fromDiatonic = (value) => ({
    step: STEPS[((value % 7) + 7) % 7],
    octave: Math.floor(value / 7),
});

/**
 * The pitch a clef's bottom staff line carries.
 *
 * @param {string} clef A clef name.
 * @returns {number} Its diatonic number.
 */
export const clefBottom = (clef) => (clef in CLEF_BOTTOM ? CLEF_BOTTOM[clef] : CLEF_BOTTOM.treble);

/**
 * Read the two endpoints of a straight-line path.
 *
 * @param {Element} path A path element.
 * @returns {object|null} {x1, y1, x2, y2}, or null if it is not a straight line.
 */
const readLine = (path) => {
    const match = /^M\s*(-?[\d.]+)[\s,]+(-?[\d.]+)\s*L\s*(-?[\d.]+)[\s,]+(-?[\d.]+)/
        .exec(path.getAttribute('d') || '');
    return match
        ? {x1: Number(match[1]), y1: Number(match[2]), x2: Number(match[3]), y2: Number(match[4])}
        : null;
};

/**
 * Read the translation out of a transform attribute.
 *
 * @param {Element} element Anything carrying a transform.
 * @returns {object} {x, y}, zeroed when there is no translation.
 */
export const readTranslate = (element) => {
    const match = /translate\(\s*(-?[\d.]+)[\s,]+(-?[\d.]+)/.exec((element && element.getAttribute('transform')) || '');
    return match ? {x: Number(match[1]), y: Number(match[2])} : {x: 0, y: 0};
};

/**
 * The glyph that fixes where an engraved event sits on the page.
 *
 * @param {Element} element A note or rest group.
 * @returns {Element|null} The `use` element that carries its position.
 */
const anchorOf = (element) => element.querySelector('[data-class="notehead"] use') || element.querySelector('use');

/**
 * Read the geometry of an engraved score.
 *
 * @param {Element} root The rendered `svg` element, or anything containing it.
 * @returns {object} {measures, events}, both in document order and in SVG user coordinates.
 */
export const readGeometry = (root) => {
    const measures = [];
    const events = [];
    (root ? root.querySelectorAll('[data-class="measure"]') : []).forEach((element) => {
        const staff = element.querySelector('[data-class="staff"]');
        if (!staff) {
            return;
        }
        const lines = Array.from(staff.children)
            .filter((child) => child.tagName === 'path')
            .map(readLine)
            .filter(Boolean)
            .sort((a, b) => a.y1 - b.y1);
        if (lines.length < 2) {
            return;
        }
        const index = measures.length;
        const spacing = (lines[lines.length - 1].y1 - lines[0].y1) / (lines.length - 1);
        const measure = {
            index,
            first: events.length,
            x1: Math.min(...lines.map((line) => Math.min(line.x1, line.x2))),
            x2: Math.max(...lines.map((line) => Math.max(line.x1, line.x2))),
            top: lines[0].y1,
            bottom: lines[lines.length - 1].y1,
            spacing,
            count: 0,
        };
        // Where the music starts, as opposed to where the staff does: a bar that opens a system
        // spends its first third on a clef, a key signature and a metre, and an insertion point
        // drawn at the left of the staff would sit through the clef rather than where the next
        // note is going to land.
        measure.contentX = measure.x1;
        staff.querySelectorAll('[data-class="clef"] use, [data-class="keySig"] use, [data-class="meterSig"] use')
            .forEach((glyph) => {
                measure.contentX = Math.max(measure.contentX, readTranslate(glyph).x + spacing * 2);
            });
        element.querySelectorAll('[data-class="note"], [data-class="rest"]').forEach((event) => {
            const anchor = anchorOf(event);
            if (!anchor) {
                return;
            }
            const at = readTranslate(anchor);
            events.push({
                index: events.length,
                measure: index,
                id: event.getAttribute('data-id'),
                kind: event.getAttribute('data-class'),
                x: at.x,
                y: at.y,
            });
            measure.count++;
        });
        measures.push(measure);
    });
    return {measures, events};
};

/**
 * How far a point falls outside a range.
 *
 * @param {number} value The value.
 * @param {number} low The bottom of the range.
 * @param {number} high The top of the range.
 * @returns {number} Zero inside the range, the distance to the nearer end outside it.
 */
const outside = (value, low, high) => Math.max(0, low - value, value - high);

/**
 * The measure a point belongs to.
 *
 * Systems stack vertically, so a vertical miss has to outrank a horizontal one: a click past the
 * end of the last measure of a system means that system, not the measure below it.
 *
 * @param {object} geometry What readGeometry() returned.
 * @param {object} point {x, y} in user coordinates.
 * @returns {object|null} The measure, or null when nothing is engraved.
 */
export const measureAt = (geometry, point) => {
    let best = null;
    geometry.measures.forEach((measure) => {
        const reach = measure.spacing * 3;
        const distance = outside(point.y, measure.top - reach, measure.bottom + reach) * 10
            + outside(point.x, measure.x1, measure.x2);
        if (!best || distance < best.distance) {
            best = {measure, distance};
        }
    });
    return best ? best.measure : null;
};

/**
 * The pitch a vertical position on a staff means.
 *
 * @param {object} measure A measure from readGeometry().
 * @param {number} y The vertical position, in user coordinates.
 * @param {string} clef The clef in force.
 * @returns {object} {step, octave, position}, where position counts half spaces from the bottom line.
 */
export const pitchAt = (measure, y, clef) => {
    const half = measure.spacing / 2;
    const position = Math.max(LOWEST, Math.min(HIGHEST, Math.round((measure.bottom - y) / half)));
    return {...fromDiatonic(clefBottom(clef) + position), position};
};

/**
 * Answer what a point in an engraved score means.
 *
 * @param {object} geometry What readGeometry() returned.
 * @param {object} point {x, y} in user coordinates.
 * @param {object} options {clef}, the clef in force.
 * @returns {object|null} `{type: 'event', index, id, kind}` when a note or rest was hit,
 *                        `{type: 'insert', at, measure, step, octave, position}` when empty
 *                        staff was, or null when nothing is engraved at all.
 */
export const hitTest = (geometry, point, options = {}) => {
    const measure = measureAt(geometry, point);
    if (!measure) {
        return null;
    }
    const space = measure.spacing;
    const own = geometry.events.filter((event) => event.measure === measure.index);
    const centre = (event) => event.x + HEAD_CENTRE * space;

    let nearest = null;
    own.forEach((event) => {
        const dx = Math.abs(point.x - centre(event));
        if (!nearest || dx < nearest.dx) {
            nearest = {event, dx};
        }
    });
    if (nearest && nearest.dx <= HIT_X * space && Math.abs(point.y - nearest.event.y) <= HIT_Y * space) {
        return {type: 'event', index: nearest.event.index, id: nearest.event.id, kind: nearest.event.kind};
    }

    const before = own.filter((event) => centre(event) < point.x).length;
    return {
        type: 'insert',
        at: measure.first + before,
        measure: measure.index,
        ...pitchAt(measure, point.y, options.clef),
    };
};

/**
 * Read a viewBox attribute.
 *
 * @param {Element} element An svg element.
 * @returns {object|null} {x, y, width, height}.
 */
const readViewBox = (element) => {
    const parts = String((element && element.getAttribute('viewBox')) || '').trim().split(/[\s,]+/).map(Number);
    return parts.length === 4 && parts.every((value) => Number.isFinite(value))
        ? {x: parts[0], y: parts[1], width: parts[2], height: parts[3]}
        : null;
};

/**
 * How a viewBox is fitted into a viewport under the default preserveAspectRatio.
 *
 * @param {object} box The viewBox.
 * @param {number} width The viewport width.
 * @param {number} height The viewport height.
 * @returns {object} {scale, dx, dy}.
 */
const fitViewBox = (box, width, height) => {
    const scale = Math.min(width / box.width, height / box.height);
    return {scale, dx: (width - box.width * scale) / 2, dy: (height - box.height * scale) / 2};
};

/**
 * Turn a viewport point into the score's own user coordinates.
 *
 * The browser answers this exactly through getScreenCTM(), which accounts for every transform
 * and for whatever the page has done to the element. The arithmetic below it is the fallback for
 * an SVG that has not been laid out - it walks the same two nested viewBoxes and the page margin
 * by hand, and it is what the unit tests exercise, since jsdom has no layout engine.
 *
 * @param {Element} svg The rendered `svg` element.
 * @param {number} clientX A viewport x, as an event reports it.
 * @param {number} clientY A viewport y.
 * @param {object} rect The element's bounding rectangle, for callers that already have one.
 * @returns {object|null} {x, y} in user coordinates, or null if the SVG cannot be read.
 */
export const clientToUser = (svg, clientX, clientY, rect = null) => {
    if (!svg) {
        return null;
    }
    const margin = svg.querySelector('.page-margin');
    if (!rect && margin && typeof margin.getScreenCTM === 'function') {
        const ctm = margin.getScreenCTM();
        if (ctm) {
            const inverse = ctm.inverse();
            return {
                x: clientX * inverse.a + clientY * inverse.c + inverse.e,
                y: clientX * inverse.b + clientY * inverse.d + inverse.f,
            };
        }
    }
    const outer = readViewBox(svg);
    const box = rect || (typeof svg.getBoundingClientRect === 'function' ? svg.getBoundingClientRect() : null);
    if (!outer || !box || !box.width || !box.height) {
        return null;
    }
    const inner = svg.querySelector('svg.definition-scale');
    const first = fitViewBox(outer, box.width, box.height);
    let x = (clientX - box.left - first.dx) / first.scale + outer.x;
    let y = (clientY - box.top - first.dy) / first.scale + outer.y;
    const definition = readViewBox(inner);
    if (definition) {
        const second = fitViewBox(definition, outer.width, outer.height);
        x = (x - second.dx) / second.scale + definition.x;
        y = (y - second.dy) / second.scale + definition.y;
    }
    const shift = readTranslate(margin);
    return {x: x - shift.x, y: y - shift.y};
};
