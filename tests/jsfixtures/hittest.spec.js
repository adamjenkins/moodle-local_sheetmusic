/**
 * Hit-testing, against a real engraved score.
 *
 * The engine is the vendored Verovio, as in engraver.spec.js, because the whole point of this
 * layer is that it reads geometry the engraver actually produced. Nothing here is asserted
 * against a hand-written SVG: the expected pitches come from the engine's own data-pname and
 * data-oct attributes, so the test proves the y-to-pitch inversion agrees with the engraver
 * rather than with itself.
 *
 * Run with: node tests/jsfixtures/hittest.spec.js
 */

import assert from 'node:assert';
import './dom.js';
import './verovio.js';
import {render} from 'local_sheetmusic/engraver';
import {
    clefBottom, clientToUser, diatonic, fromDiatonic, hitTest, measureAt, pitchAt, readGeometry,
} from 'local_sheetmusic/editor/surface-notes';
import {finishes} from './spec.js';

const FIXTURE = 'X:1\nM:4/4\nL:1/8\nK:G\n|GABc dedB|cBAG FGAB|';

/**
 * Read a viewBox the way a test may, independently of the module under test.
 *
 * @param {Element} element An svg element.
 * @returns {number[]} The four numbers.
 */
const viewBox = (element) => element.getAttribute('viewBox').trim().split(/[\s,]+/).map(Number);

const done = finishes('hittest');

const run = async () => {
    const {svg} = await render(FIXTURE, 'abc', {xmlIdChecksum: true});
    const board = document.createElement('div');
    document.body.appendChild(board);
    board.innerHTML = svg;

    const geometry = readGeometry(board);

    // ---- the geometry is read, not assumed ----
    assert.strictEqual(geometry.measures.length, 2, 'both bars were found');
    assert.strictEqual(geometry.events.length, 16, 'and all sixteen events');
    assert.strictEqual(geometry.measures[0].first, 0, 'the first bar starts at event 0');
    assert.strictEqual(geometry.measures[1].first, 8, 'and the second at event 8');
    assert.ok(geometry.measures[0].spacing > 0, 'the staff spacing came off the page');
    assert.strictEqual(
        geometry.measures[0].spacing,
        (geometry.measures[0].bottom - geometry.measures[0].top) / 4,
        'five staff lines, evenly spaced'
    );

    const engraved = Array.from(board.querySelectorAll('[data-class="note"]'));
    assert.strictEqual(engraved.length, 16, 'the engine engraved sixteen notes');

    // ---- every note is hit at its own position, and reads back as the pitch the engine says ----
    geometry.events.forEach((event, index) => {
        const measure = geometry.measures[event.measure];
        const point = {x: event.x + measure.spacing * 0.6, y: event.y};
        const hit = hitTest(geometry, point, {clef: 'treble'});
        assert.strictEqual(hit.type, 'event', `event ${index} is hit at its own centre`);
        assert.strictEqual(hit.index, index, `and identified as event ${index}, not ${hit.index}`);

        const pitch = pitchAt(measure, event.y, 'treble');
        const element = engraved[index];
        assert.strictEqual(
            `${pitch.step}${pitch.octave}`,
            `${element.getAttribute('data-pname').toUpperCase()}${element.getAttribute('data-oct')}`,
            `the pitch read off the staff at y=${event.y} matches what the engine labelled note ${index}`
        );
    });

    // ---- a click on empty staff is an insertion, at the right place and pitch ----
    const first = geometry.measures[0];
    const before = hitTest(geometry, {x: first.x1 + first.spacing * 0.2, y: first.bottom}, {clef: 'treble'});
    assert.strictEqual(before.type, 'insert', 'the space before the first note is not a note');
    assert.strictEqual(before.at, 0, 'and inserts at the very beginning');
    assert.strictEqual(`${before.step}${before.octave}`, 'E4', 'the bottom line of a treble staff is E4');

    const above = hitTest(
        geometry,
        {x: geometry.events[3].x + first.spacing * 1.2, y: first.top - first.spacing * 2},
        {clef: 'treble'}
    );
    assert.strictEqual(above.type, 'insert', 'a click two spaces above the staff is not the note below it');
    assert.strictEqual(above.at, 4, 'and lands after the four notes to its left');
    assert.strictEqual(`${above.step}${above.octave}`, 'C6', 'two spaces above the top line is C6');

    // Straight above a notehead, the new note goes in front of it: the rule is that a note counts
    // as being to the left only when its centre is, so a click level with a centre is not.
    const level = hitTest(
        geometry,
        {x: geometry.events[3].x + first.spacing * 0.6, y: first.top - first.spacing * 2},
        {clef: 'treble'}
    );
    assert.strictEqual(level.at, 3, 'a click directly above a note inserts in front of it');

    assert.ok(first.contentX > first.x1 + first.spacing,
        'the first bar reports where its music starts, past the clef, key signature and metre');
    assert.strictEqual(geometry.measures[1].contentX, geometry.measures[1].x1,
        'and a bar with no clef of its own starts where its staff does');

    const after = hitTest(
        geometry,
        {x: first.x2 - first.spacing * 0.1, y: first.bottom - first.spacing},
        {clef: 'treble'}
    );
    assert.strictEqual(after.at, 8, 'a click at the end of the first bar inserts after all eight of its notes');

    // ---- the same click, read through a real clef ----
    const bass = pitchAt(first, first.bottom, 'bass');
    assert.strictEqual(`${bass.step}${bass.octave}`, 'G2', 'the bottom line of a bass staff is G2');
    assert.strictEqual(clefBottom('alto'), diatonic('F', 3), 'and of an alto staff, F3');
    assert.strictEqual(clefBottom('nonsense'), clefBottom('treble'), 'an unknown clef is read as treble');
    assert.deepStrictEqual(fromDiatonic(diatonic('B', 4)), {step: 'B', octave: 4}, 'diatonic numbers round trip');

    // ---- the measure a point belongs to ----
    assert.strictEqual(measureAt(geometry, {x: geometry.events[10].x, y: first.bottom}).index, 1,
        'a point inside the second bar belongs to it');

    // ---- a click at a viewport position, mapped back through both viewBoxes ----
    const root = board.querySelector('svg');
    const outer = viewBox(root);
    const definition = viewBox(root.querySelector('svg.definition-scale'));
    const margin = /translate\(\s*(-?[\d.]+)[\s,]+(-?[\d.]+)/.exec(
        root.querySelector('.page-margin').getAttribute('transform')
    ).slice(1).map(Number);
    // The forward transform, written out here rather than borrowed from the module: the outer
    // viewBox is drawn into the element's box, the definition-scale viewBox into the outer one,
    // and the page margin shifts everything inside that.
    const rect = {left: 37, top: 11, width: outer[2] * 3, height: outer[3] * 3};
    const inner = Math.min(outer[2] / definition[2], outer[3] / definition[3]);
    const innerDx = (outer[2] - definition[2] * inner) / 2;
    const innerDy = (outer[3] - definition[3] * inner) / 2;
    const toClient = (point) => ({
        x: rect.left + ((point.x + margin[0]) * inner + innerDx) * 3,
        y: rect.top + ((point.y + margin[1]) * inner + innerDy) * 3,
    });

    geometry.events.forEach((event, index) => {
        const measure = geometry.measures[event.measure];
        const target = {x: event.x + measure.spacing * 0.6, y: event.y};
        const client = toClient(target);
        const back = clientToUser(root, client.x, client.y, rect);
        assert.ok(Math.abs(back.x - target.x) < 1e-6 && Math.abs(back.y - target.y) < 1e-6,
            `a viewport click over note ${index} maps back to (${target.x}, ${target.y}), got (${back.x}, ${back.y})`);
        assert.strictEqual(hitTest(geometry, back, {clef: 'treble'}).index, index,
            `and hit-tests as note ${index}`);
    });

    assert.strictEqual(clientToUser(null, 0, 0), null, 'nothing in, nothing out');

    done('2 bars, 16 notes, every one hit and every pitch read back');
};

run();
