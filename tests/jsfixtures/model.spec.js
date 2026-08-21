/**
 * Unit tests for the document model.
 *
 * Pure data, so no DOM is imported here on purpose: if this file ever needs jsdom, the model
 * has grown a dependency it should not have.
 *
 * Run with: node tests/jsfixtures/model.spec.js
 */

import assert from 'node:assert';
import {barTicks, createScore, eventTicks, fromJSON, normaliseEvent} from 'local_sheetmusic/model';

const quarter = {duration: 4, dots: 0};

// --- Lengths -------------------------------------------------------------------------

assert.strictEqual(eventTicks({duration: 1, dots: 0}), 3840, 'a whole note is the whole bar unit');
assert.strictEqual(eventTicks({duration: 4, dots: 0}), 960, 'a quarter is a quarter of it');
assert.strictEqual(eventTicks({duration: 2, dots: 1}), 2880, 'a dotted half is three quarters');
assert.strictEqual(eventTicks({duration: 2, dots: 2}), 3360, 'a doubly dotted half is seven eighths');
assert.strictEqual(eventTicks({duration: 64, dots: 2}), 105, 'the shortest dotted note is still whole ticks');
assert.strictEqual(barTicks('4/4'), 3840);
assert.strictEqual(barTicks('6/8'), 2880);
assert.strictEqual(barTicks('3/4'), 2880);
assert.strictEqual(barTicks('none'), Infinity, 'an unmetred score has no bar capacity');

// --- Event normalisation -------------------------------------------------------------

assert.deepStrictEqual(
    normaliseEvent({step: 'g', octave: 4, duration: 4}),
    {kind: 'note', step: 'G', octave: 4, alter: null, duration: 4, dots: 0, tie: false},
    'a sparse note is completed into the canonical shape'
);
assert.deepStrictEqual(
    normaliseEvent({kind: 'rest', duration: 2, dots: 1}),
    {kind: 'rest', duration: 2, dots: 1},
    'a rest carries no pitch fields at all'
);
assert.strictEqual(normaliseEvent({step: 'C', alter: 0}).alter, 0, 'alter 0 is a written natural, not absent');
assert.throws(() => normaliseEvent({step: 'H'}), /unsupported step/, 'H is not a note name');
assert.throws(() => normaliseEvent({step: 'C', duration: 5}), /unsupported duration/, 'a fifth-note is not a thing');

// --- Adding notes and rests ------------------------------------------------------------

const s = createScore({key: 'G', metre: '4/4', clef: 'treble'});
assert.deepStrictEqual(s.bars, [], 'a new score has no bars until something is put in one');
s.addNote({step: 'g', octave: 4, duration: 4});
s.addNote({step: 'a', octave: 4, duration: 4});
assert.strictEqual(s.bars.length, 1, 'two quarters share one bar of four four');
assert.strictEqual(s.bars[0].events.length, 2);
s.addRest({duration: 4});
assert.strictEqual(s.bars[0].events[2].kind, 'rest');

// --- Bar overflow ----------------------------------------------------------------------

s.addNote({step: 'b', octave: 4, duration: 4});
assert.strictEqual(s.bars.length, 1, 'the fourth quarter exactly fills the bar');
s.addNote({step: 'c', octave: 5, duration: 4});
assert.strictEqual(s.bars.length, 2, 'the fifth quarter opens a new bar');
assert.strictEqual(s.bars[1].events.length, 1);

const three = createScore({key: 'C', metre: '3/4'});
three.addNote({step: 'c', octave: 4, duration: 2});
three.addNote({step: 'd', octave: 4, duration: 2});
assert.strictEqual(three.bars.length, 2, 'a half note that does not fit moves whole to the next bar');
assert.strictEqual(three.bars[0].events.length, 1, 'and is never split across the barline');

const unmetred = createScore({key: 'C', metre: 'none'});
for (let i = 0; i < 12; i++) {
    unmetred.addNote({step: 'c', octave: 4, duration: 1});
}
assert.strictEqual(unmetred.bars.length, 1, 'without a metre nothing overflows');

// --- Undo and redo ---------------------------------------------------------------------

const u = createScore({key: 'G', metre: '4/4', clef: 'treble'});
u.addNote({step: 'g', octave: 4, duration: 4});
u.addNote({step: 'a', octave: 4, duration: 4});
assert.strictEqual(u.bars[0].events.length, 2);
assert.strictEqual(u.undo(), true);
assert.strictEqual(u.bars[0].events.length, 1, 'undo removes the last note');
assert.strictEqual(u.redo(), true);
assert.strictEqual(u.bars[0].events.length, 2, 'redo restores it');

assert.strictEqual(u.undo(), true);
assert.strictEqual(u.undo(), true);
assert.deepStrictEqual(u.bars, [], 'undoing the first note removes the bar it opened');
assert.strictEqual(u.undo(), false, 'undo past the start reports that it did nothing');
assert.strictEqual(u.redo(), true);
assert.strictEqual(u.redo(), true);
assert.strictEqual(u.bars[0].events.length, 2, 'and both come back in order');
assert.strictEqual(u.redo(), false);

// The undo stack holds inverse commands, not snapshots: an inverse of an addEvent that had
// to open a bar is a two-command batch, which is what this asserts is being stored.
assert.strictEqual(u.undoStack[0].type, 'batch', 'the first note stored a compound inverse');
assert.strictEqual(u.undoStack[1].type, 'removeEvent', 'the second stored a single inverse');

u.undo();
u.addNote({step: 'b', octave: 4, duration: 4});
assert.strictEqual(u.redoStack.length, 0, 'a fresh edit discards the redo branch');
assert.strictEqual(u.bars[0].events[1].step, 'B');

// --- Overflow is undone as a unit --------------------------------------------------------

const o = createScore({key: 'C', metre: '4/4'});
[1, 2, 3, 4, 5].forEach(() => o.addNote({step: 'c', octave: 4, duration: 4}));
assert.strictEqual(o.bars.length, 2);
o.undo();
assert.strictEqual(o.bars.length, 1, 'undoing the overflowing note also closes the bar it opened');
assert.strictEqual(o.bars[0].events.length, 4);

// --- Other commands ------------------------------------------------------------------------

const c = createScore({key: 'C', metre: '4/4'});
c.addNote({step: 'c', octave: 4, duration: 4});
c.addNote({step: 'e', octave: 4, duration: 4});
c.apply({type: 'insertEvent', bar: 0, index: 1, event: {step: 'd', octave: 4, duration: 4}});
assert.deepStrictEqual(c.bars[0].events.map((e) => e.step), ['C', 'D', 'E']);
c.undo();
assert.deepStrictEqual(c.bars[0].events.map((e) => e.step), ['C', 'E'], 'insert undoes cleanly');
c.redo();
c.apply({type: 'removeEvent', bar: 0, index: 0});
assert.deepStrictEqual(c.bars[0].events.map((e) => e.step), ['D', 'E']);
c.undo();
assert.deepStrictEqual(c.bars[0].events.map((e) => e.step), ['C', 'D', 'E'], 'remove undoes with its event');

c.apply({type: 'setHeader', field: 'key', value: 'Eb'});
assert.strictEqual(c.key, 'Eb');
c.undo();
assert.strictEqual(c.key, 'C', 'a header change undoes to the previous value');
assert.throws(() => c.apply({type: 'setHeader', field: 'title', value: 'x'}), /not a header/);
assert.throws(() => c.apply({type: 'nonsense'}), /unknown command/);
assert.throws(() => c.apply({type: 'removeEvent', bar: 9, index: 0}), /no bar 9/);

// Removing a bar that still holds events must restore all of them.
c.apply({type: 'removeBar', index: 0});
assert.deepStrictEqual(c.bars, []);
c.undo();
assert.deepStrictEqual(c.bars[0].events.map((e) => e.step), ['C', 'D', 'E'], 'a removed bar comes back full');

// --- JSON round trip -------------------------------------------------------------------------

const j = createScore({key: 'Eb', metre: '6/8', clef: 'bass'});
j.addNote({step: 'e', octave: 3, alter: -1, duration: 8, tie: true});
j.addNote({step: 'e', octave: 3, alter: null, duration: 8});
j.addRest({duration: 4, dots: 1});
assert.deepStrictEqual(createScore(j.toJSON()).toJSON(), j.toJSON(), 'createScore round-trips its own JSON');
assert.deepStrictEqual(fromJSON(j.toJSON()).toJSON(), j.toJSON(), 'so does the explicit alias');
assert.deepStrictEqual(
    JSON.parse(JSON.stringify(j)).bars[0].events[0],
    {kind: 'note', step: 'E', octave: 3, alter: -1, duration: 8, dots: 0, tie: true},
    'the serialised shape is the canonical one'
);
assert.strictEqual(fromJSON(j.toJSON()).undoStack.length, 0, 'history is session state and is not serialised');

// toJSON() is a snapshot, not a window: a caller that edits what it got back - an importer
// preview, a diff view - must not be editing the live score.
const snapshot = j.toJSON();
snapshot.bars[0].events[0].step = 'X';
snapshot.bars[0].events.push({kind: 'rest', duration: 4, dots: 0});
snapshot.bars.push({events: []});
assert.strictEqual(j.bars[0].events[0].step, 'E', 'toJSON hands out copies of its events');
assert.strictEqual(j.bars[0].events.length, 3, 'and of the arrays holding them');
assert.strictEqual(j.bars.length, 1, 'and of the bar list');

// A rehydrated score keeps editing correctly, which is the point of round-tripping at all.
const again = createScore(j.toJSON());
again.addNote({step: 'f', octave: 3, duration: 8});
assert.strictEqual(again.bars[0].events.length, 4);
again.undo();
assert.deepStrictEqual(again.toJSON(), j.toJSON(), 'edit-then-undo on a rehydrated score is a no-op');

process.stdout.write('model.spec OK\n');
