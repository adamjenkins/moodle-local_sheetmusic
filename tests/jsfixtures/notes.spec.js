/**
 * The note-entry pane, driven the way a person drives it: clicks, keys, and what comes back.
 *
 * The engine is the real vendored Verovio, so the SVG that gets clicked is the SVG an author
 * would see. jsdom has no layout, so the one thing that cannot be real is the element's position
 * on screen: the test supplies a rectangle for it and computes the viewport coordinates of a
 * click itself, which is exactly the path a browser takes through clientToUser().
 *
 * Run with: node tests/jsfixtures/notes.spec.js
 */

import assert from 'node:assert';
import './dom.js';
import './verovio.js';
import {parseOnly} from './abcjs.js';
import {strings} from './strings.js';
import {setParser} from 'local_sheetmusic/abc';
import {createNotes, EVENT_DRAWN} from 'local_sheetmusic/editor/notes';
import {readGeometry} from 'local_sheetmusic/editor/surface-notes';
import {finishes} from './spec.js';

setParser(parseOnly);

const SIMPLE = 'X:1\nM:4/4\nL:1/8\nK:G\n|GABcdedB|';

/** @type {object} A pretend position on screen for the engraved SVG. */
const RECT = {left: 40, top: 24, width: 900, height: 320};

/**
 * Build a pane in a fresh container.
 *
 * @returns {object} {pane, element, board, changes}.
 */
const build = () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const changes = [];
    const pane = createNotes({
        container,
        strings,
        id: 'test',
        onChange: (source) => changes.push(source),
    });
    return {pane, changes, element: container.firstChild, board: container.querySelector('.sheetmusic-editor-score')};
};

/**
 * Wait for the pane to finish one engraving.
 *
 * @param {Element} element The pane's element.
 * @returns {Promise<object>} The event detail.
 */
const drawn = (element) => new Promise((resolve) => {
    element.addEventListener(EVENT_DRAWN, (event) => resolve(event.detail), {once: true});
});

/**
 * Give the engraved SVG a position on screen, and return a viewport-coordinate mapper for it.
 *
 * @param {Element} board The score element.
 * @returns {Function} Turns a point in the score's user coordinates into viewport coordinates.
 */
const place = (board) => {
    const svg = board.querySelector('svg');
    svg.getBoundingClientRect = () => RECT;
    const numbers = (element) => element.getAttribute('viewBox').trim().split(/[\s,]+/).map(Number);
    const outer = numbers(svg);
    const definition = numbers(svg.querySelector('svg.definition-scale'));
    const margin = /translate\(\s*(-?[\d.]+)[\s,]+(-?[\d.]+)/
        .exec(svg.querySelector('.page-margin').getAttribute('transform')).slice(1).map(Number);
    const outerScale = Math.min(RECT.width / outer[2], RECT.height / outer[3]);
    const outerDx = (RECT.width - outer[2] * outerScale) / 2;
    const outerDy = (RECT.height - outer[3] * outerScale) / 2;
    const inner = Math.min(outer[2] / definition[2], outer[3] / definition[3]);
    const innerDx = (outer[2] - definition[2] * inner) / 2;
    const innerDy = (outer[3] - definition[3] * inner) / 2;
    return (point) => ({
        clientX: RECT.left + outerDx + ((point.x + margin[0]) * inner + innerDx) * outerScale,
        clientY: RECT.top + outerDy + ((point.y + margin[1]) * inner + innerDy) * outerScale,
        bubbles: true,
    });
};

const key = (board, init) => board.dispatchEvent(new window.KeyboardEvent('keydown', {bubbles: true, ...init}));

const done = finishes('notes');

const run = async () => {
    const {pane, changes, element, board} = build();
    await pane.setSource(SIMPLE);

    // ---- what the pane puts on the page ----
    assert.ok(board.querySelector('svg'), 'the score is engraved into the pane');
    assert.strictEqual(board.getAttribute('role'), 'application', 'the staff is a widget, not a picture');
    assert.strictEqual(board.getAttribute('tabindex'), '0', 'and is one focus stop');
    assert.strictEqual(board.querySelector('svg').getAttribute('aria-hidden'), 'true',
        'the engraving itself is hidden from a screen reader, which cannot read notation');
    const status = element.querySelector('.sheetmusic-editor-status');
    assert.strictEqual(status.getAttribute('aria-live'), 'polite', 'changes are announced politely');
    assert.ok(board.getAttribute('aria-describedby').includes(status.id), 'and the widget points at them');
    assert.strictEqual(element.querySelectorAll('.sheetmusic-editor-listing li').length, 8,
        'the score is also published as a list, which a screen reader can read');
    assert.strictEqual(element.querySelector('.sheetmusic-editor-listing li').textContent, 'G4 Quaver',
        'each entry naming one event');
    assert.ok(element.querySelector('[role="toolbar"]'), 'the toolbar is a toolbar');
    assert.strictEqual(pane.usable(), true, 'and the score can be edited');

    // The toolbar is one focus stop between all its buttons, so that reaching the staff by Tab
    // does not mean passing every button in the bar first.
    const bar = element.querySelector('[role="toolbar"]');
    const keys = Array.from(bar.querySelectorAll('button'));
    assert.ok(keys.length > 10, 'the toolbar has a button for every length, accidental and edit');
    assert.strictEqual(keys.filter((button) => button.tabIndex === 0).length, 1,
        'and exactly one of them is in the tab order');
    bar.dispatchEvent(new window.KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}));
    assert.strictEqual(keys[1].tabIndex, 0, 'the right arrow moves the stop along the bar');
    assert.strictEqual(keys[0].tabIndex, -1, 'and takes it off the one before');
    assert.strictEqual(document.activeElement, keys[1], 'and moves the focus with it');
    bar.dispatchEvent(new window.KeyboardEvent('keydown', {key: 'End', bubbles: true}));
    const usable = keys.filter((button) => !button.disabled);
    assert.strictEqual(document.activeElement, usable[usable.length - 1],
        'End goes to the last button that currently does anything, skipping the disabled ones');

    // ---- clicking a notehead selects that note ----
    const glyph = board.querySelectorAll('[data-class="note"]')[2].querySelector('use');
    let wait = drawn(element);
    glyph.dispatchEvent(new window.MouseEvent('click', {bubbles: true}));
    await wait;
    assert.strictEqual(status.textContent, 'Selected B4 Quaver, bar 1, note 3',
        'the third note is selected, and said');
    assert.strictEqual(element.querySelectorAll('.sheetmusic-editor-listing [aria-current="true"]').length, 1,
        'the selection is marked in the accessible listing too');
    assert.ok(board.querySelector('.sheetmusic-editor-selected'), 'and drawn on the score');
    assert.ok(board.querySelector('.sheetmusic-editor-caret'), 'with the insertion point beside it');
    assert.strictEqual(changes.length, 0, 'selecting a note is not an edit');

    // ---- clicking empty staff places a note there, at the pitch that was clicked ----
    const geometry = readGeometry(board);
    const measure = geometry.measures[0];
    const at = place(board)({
        x: geometry.events[3].x + measure.spacing * 1.2,
        y: measure.bottom + measure.spacing,
    });
    wait = drawn(element);
    board.querySelector('svg').dispatchEvent(new window.MouseEvent('click', at));
    await wait;
    assert.strictEqual(changes.length, 1, 'placing a note is an edit');
    assert.strictEqual(status.textContent, 'Added C4 Crotchet, bar 1, note 5',
        'a crotchet goes in after the fourth note, one space below the staff, which is C4');
    assert.strictEqual(changes[0], 'X:1\nM:4/4\nL:1/8\nK:G\n|GABcC2de|dB|',
        'and the bars re-flow around it rather than one of them ending up a beat too long');
    assert.strictEqual(element.querySelectorAll('.sheetmusic-editor-listing li').length, 9, 'the listing grew');

    // ---- a phrase entered with the keyboard alone ----
    const typed = build();
    await typed.pane.setSource('');
    for (const stroke of [{key: '4'}, {key: 'c'}, {key: 'd'}, {key: 'e'}, {key: 'f'}, {key: 'g'}]) {
        const drawing = drawn(typed.element);
        key(typed.board, stroke);
        await drawing;
    }
    assert.strictEqual(typed.changes[typed.changes.length - 1], 'X:1\nM:4/4\nL:1/8\nK:C\n|cdefg|',
        'five quavers, typed by name, with no mouse anywhere near it');
    assert.strictEqual(typed.element.querySelector('.sheetmusic-editor-status').textContent,
        'Added G5 Quaver, bar 1, note 5', 'each one announced as it lands');

    wait = drawn(typed.element);
    key(typed.board, {key: 'z', ctrlKey: true});
    await wait;
    assert.strictEqual(typed.changes[typed.changes.length - 1], 'X:1\nM:4/4\nL:1/8\nK:C\n|cdef|',
        'ctrl+z takes the last one back out');
    wait = drawn(typed.element);
    key(typed.board, {key: 'z', ctrlKey: true, shiftKey: true});
    await wait;
    assert.strictEqual(typed.changes[typed.changes.length - 1], 'X:1\nM:4/4\nL:1/8\nK:C\n|cdefg|',
        'and ctrl+shift+z puts it back');

    // ---- the toolbar acts on the same model ----
    const sharp = Array.from(typed.element.querySelectorAll('button'))
        .find((button) => button.getAttribute('aria-label') === 'Sharp');
    wait = drawn(typed.element);
    sharp.dispatchEvent(new window.MouseEvent('click', {bubbles: true}));
    await wait;
    assert.strictEqual(typed.changes[typed.changes.length - 1], 'X:1\nM:4/4\nL:1/8\nK:C\n|cdef^g|',
        'the sharp button sharpens the selected note');
    assert.strictEqual(sharp.getAttribute('aria-pressed'), 'true', 'and shows itself as pressed');

    // ---- an empty score still has a staff to click on ----
    const fresh = build();
    await fresh.pane.setSource('');
    assert.ok(fresh.board.querySelector('svg'), 'an empty score engraves an empty bar');
    const empty = readGeometry(fresh.board);
    assert.strictEqual(empty.measures.length, 1, 'one bar');
    assert.strictEqual(empty.events.length, 0, 'with nothing in it');
    const first = empty.measures[0];
    const target = place(fresh.board)({x: first.x1 + first.spacing * 2, y: first.bottom});
    wait = drawn(fresh.element);
    fresh.board.querySelector('svg').dispatchEvent(new window.MouseEvent('click', target));
    await wait;
    assert.strictEqual(fresh.changes[0], 'X:1\nM:4/4\nL:1/8\nK:C\n|E2|',
        'the first click on an empty score puts an E4 crotchet on the bottom line');

    // ---- a score the model cannot hold is shown, and says why it cannot be edited here ----
    const hard = build();
    await hard.pane.setSource('X:1\nM:4/4\nK:C\n|[CEG]4|');
    assert.strictEqual(hard.pane.usable(), false, 'a chord is outside what the model holds');
    const alert = hard.element.querySelector('.sheetmusic-editor-notealert');
    assert.strictEqual(alert.hidden, false, 'so the pane says so');
    assert.ok(alert.textContent.includes('source tab'), 'and points at the tab that can still edit it');
    assert.ok(Array.from(hard.element.querySelectorAll('button')).every((b) => b.disabled),
        'every control is inert rather than quietly throwing the chord away');
    hard.board.dispatchEvent(new window.KeyboardEvent('keydown', {key: 'c', bubbles: true}));
    assert.strictEqual(hard.changes.length, 0, 'and the keyboard cannot edit it either');

    done('click to select, click to place, keyboard entry, undo, toolbar, empty, refusal');
};

run();
