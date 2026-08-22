/**
 * The editing vocabulary: every toolbar action, every key, and what each one says out loud.
 *
 * All three layers are pure, so this test needs no DOM and no engine: it drives
 * `editor/actions.js` exactly as the pane does, and checks the ABC that falls out. The English
 * comes from the shipped language pack rather than from a table written here, so a string the
 * editor asks for and the pack does not have fails this test.
 *
 * Run with: node tests/jsfixtures/actions.spec.js
 *
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

import assert from 'node:assert';
import './dom.js';
import {parseOnly} from './abcjs.js';
import {strings} from './strings.js';
import {createScore} from 'local_sheetmusic/model';
import {fromAbc, setParser, toAbc} from 'local_sheetmusic/abc';
import {apply, flatten, locate, nearestOctave, repack, DEFAULT_ENTRY} from 'local_sheetmusic/editor/actions';
import {announce, describeEntry, describeEvent, lengthName} from 'local_sheetmusic/editor/describe';
import {mapKey} from 'local_sheetmusic/editor/keymap';
import {finishes} from './spec.js';

setParser(parseOnly);

/**
 * A little editor: a score, a selection and the entry settings, driven by actions.
 *
 * @param {object} headers Key, metre and clef for the new score.
 * @returns {object} The harness.
 */
const editor = (headers = {}) => {
    const context = {score: createScore(headers), selection: null, entry: {...DEFAULT_ENTRY}};
    let last = null;
    return {
        context,
        /**
         * Run one action.
         *
         * @param {object} action The action.
         * @returns {object} What actions.apply() returned.
         */
        act(action) {
            const result = apply(context, action);
            context.selection = result.selection;
            context.entry = result.entry;
            last = result;
            return result;
        },
        /**
         * Run one key.
         *
         * @param {object} event A key event's fields.
         * @returns {object|null} What actions.apply() returned, or null for an unmapped key.
         */
        press(event) {
            const action = mapKey(event);
            return action ? this.act(action) : null;
        },
        /** @returns {string} The score as ABC. */
        abc: () => toAbc(context.score),
        /** @returns {string} What the last action announced. */
        said: () => announce(
            strings,
            context,
            last && last.announce,
            last && last.announce && last.announce.index !== undefined
                ? flatten(context.score)[last.announce.index]
                : null
        ),
    };
};

const type = (session, letters) => letters.split('').forEach((letter) => session.press({key: letter}));

const done = finishes('actions');

const run = () => {
    // ---- typing a phrase: the octave follows the previous note, as a musician expects ----
    const one = editor({key: 'G', metre: '4/4', clef: 'treble'});
    one.press({key: '4'});
    type(one, 'gabcdedb');
    assert.strictEqual(one.abc(), 'X:1\nM:4/4\nL:1/8\nK:G\n|GABcdedB|',
        'eight quavers typed by name become the reference fixture, G4 up to E5 and back');
    assert.strictEqual(one.context.selection, 7, 'the last note typed is the selected one');
    assert.strictEqual(flatten(one.context.score).length, 8, 'and there are eight of them');
    assert.deepStrictEqual(nearestOctave('C', 34), {step: 'C', octave: 5}, 'C nearest B4 is C5, not C4');
    assert.deepStrictEqual(nearestOctave('B', 35), {step: 'B', octave: 4}, 'and B nearest C5 is the B just below it');

    // ---- durations: on the selection, and as the mode for the next note ----
    const two = editor({key: 'C', metre: '4/4'});
    two.press({key: '3'});
    type(two, 'c');
    two.press({key: '2'});
    assert.strictEqual(two.abc().split('\n').pop(), '|c4|', 'a duration key changes the selected note');
    assert.strictEqual(two.context.entry.duration, 2, 'and becomes the length of the next one');
    type(two, 'd');
    assert.strictEqual(two.abc().split('\n').pop(), '|c4d4|', 'so the next note is a minim too');
    two.act({type: 'select', index: null});
    two.act({type: 'setDuration', duration: 16});
    assert.strictEqual(two.abc().split('\n').pop(), '|c4d4|', 'with nothing selected the score is untouched');
    assert.strictEqual(two.context.entry.duration, 16, 'and only the entry length changes');
    assert.strictEqual(two.said(), 'Next: Semiquaver', 'which is what it says');

    // ---- dots ----
    const three = editor({key: 'C', metre: '4/4'});
    three.press({key: '3'});
    type(three, 'c');
    three.press({key: '.'});
    assert.strictEqual(three.abc().split('\n').pop(), '|c3|', 'a dot makes the crotchet three quavers long');
    three.press({key: '.'});
    assert.strictEqual(three.abc().split('\n').pop(), '|c7/2|', 'a second dot adds half as much again');
    three.press({key: '.'});
    assert.strictEqual(three.abc().split('\n').pop(), '|c2|', 'and a third takes both away');

    // ---- accidentals, which toggle off when pressed twice ----
    const four = editor({key: 'C', metre: '4/4'});
    four.press({key: '4'});
    type(four, 'f');
    four.press({key: '^'});
    assert.strictEqual(four.abc().split('\n').pop(), '|^F|', 'a sharp is written on the selected note');
    assert.strictEqual(four.said(), 'Now F4 sharp Quaver, bar 1, note 1', 'and said out loud');
    four.press({key: '^'});
    assert.strictEqual(four.abc().split('\n').pop(), '|F|', 'pressing it again takes it off');
    four.press({key: '_'});
    assert.strictEqual(four.abc().split('\n').pop(), '|_F|', 'and a flat replaces a sharp');
    four.press({key: '='});
    assert.strictEqual(four.abc().split('\n').pop(), '|=F|', 'as a natural replaces a flat');

    // An accidental chosen with nothing selected applies to the next note only.
    const five = editor({key: 'C', metre: '4/4'});
    five.act({type: 'setDuration', duration: 4});
    five.act({type: 'setAlter', alter: 1});
    assert.strictEqual(five.context.entry.alter, 1, 'the entry accidental is armed');
    type(five, 'ff');
    assert.strictEqual(five.abc().split('\n').pop(), '|^F2F2|', 'it is written on the next note and then forgotten');

    // ---- rests and ties ----
    const six = editor({key: 'C', metre: '4/4'});
    six.press({key: '3'});
    type(six, 'c');
    six.press({key: 'r'});
    assert.strictEqual(six.abc().split('\n').pop(), '|c2z2|', 'r places a rest of the entry length');
    six.act({type: 'select', index: 0});
    six.press({key: 't'});
    assert.strictEqual(six.abc().split('\n').pop(), '|c2-z2|', 't ties the selected note to the next');
    six.press({key: 't'});
    assert.strictEqual(six.abc().split('\n').pop(), '|c2z2|', 'and unties it');
    six.act({type: 'select', index: 1});
    six.act({type: 'toggleRest'});
    assert.strictEqual(six.abc().split('\n').pop(), '|c2B2|', 'the rest button turns a rest back into a note');
    six.act({type: 'toggleRest'});
    assert.strictEqual(six.abc().split('\n').pop(), '|c2z2|', 'and back again');

    // ---- moving a note by step and by octave ----
    const seven = editor({key: 'C', metre: '4/4'});
    seven.press({key: '3'});
    type(seven, 'c');
    seven.press({key: 'ArrowUp'});
    assert.strictEqual(seven.abc().split('\n').pop(), '|d2|', 'the up arrow moves the note one step');
    seven.press({key: 'ArrowDown'});
    seven.press({key: 'ArrowDown'});
    assert.strictEqual(seven.abc().split('\n').pop(), '|B2|', 'and down again, across the octave');
    seven.press({key: 'ArrowUp', ctrlKey: true});
    assert.strictEqual(seven.abc().split('\n').pop(), '|b2|', 'ctrl and an arrow moves it by an octave');
    seven.press({key: 'ArrowDown', metaKey: true});
    assert.strictEqual(seven.abc().split('\n').pop(), '|B2|', 'and the command key does the same on a Mac');

    // ---- selection, deletion and where the caret lands ----
    const eight = editor({key: 'C', metre: '4/4'});
    eight.press({key: '4'});
    type(eight, 'cdef');
    eight.press({key: 'ArrowLeft'});
    assert.strictEqual(eight.context.selection, 2, 'the left arrow moves the selection back');
    assert.strictEqual(eight.said(), 'Selected E5 Quaver, bar 1, note 3', 'and says what is selected and where');
    eight.press({key: 'Home'});
    assert.strictEqual(eight.context.selection, 0, 'Home selects the first event');
    eight.press({key: 'End'});
    assert.strictEqual(eight.context.selection, 3, 'End selects the last');
    eight.press({key: 'Backspace'});
    assert.strictEqual(eight.abc().split('\n').pop(), '|cde|', 'Backspace deletes the selected note');
    assert.strictEqual(eight.context.selection, 2, 'and the selection steps back onto the one before it');
    assert.strictEqual(eight.said(), 'Deleted', 'which is announced');
    eight.press({key: 'Escape'});
    assert.strictEqual(eight.context.selection, null, 'Escape selects nothing');
    eight.act({type: 'delete'});
    assert.strictEqual(eight.said(), 'Nothing is selected', 'and deleting nothing says so rather than throwing');

    // ---- undo and redo, through the model's own stack ----
    const nine = editor({key: 'C', metre: '4/4'});
    nine.press({key: '4'});
    type(nine, 'cde');
    nine.press({key: 'z', ctrlKey: true});
    assert.strictEqual(nine.abc().split('\n').pop(), '|cd|', 'ctrl+z undoes the last note');
    assert.strictEqual(nine.said(), 'Undone', 'and says so');
    nine.press({key: 'z', ctrlKey: true, shiftKey: true});
    assert.strictEqual(nine.abc().split('\n').pop(), '|cde|', 'ctrl+shift+z puts it back');
    nine.press({key: 'y', ctrlKey: true});
    assert.strictEqual(nine.said(), 'Nothing is selected', 'and a redo with nothing to redo says so');

    // One gesture is one undo step even when it re-packs every bar in the score.
    const ten = editor({key: 'C', metre: '4/4'});
    ten.press({key: '3'});
    type(ten, 'cdefgabc');
    assert.strictEqual(ten.abc().split('\n').pop(), "|c2d2e2f2|g2a2b2c'2|", 'eight crotchets fill two bars');
    ten.act({type: 'setHeader', field: 'metre', value: '3/4'});
    assert.strictEqual(ten.abc().split('\n').pop(), "|c2d2e2|f2g2a2|b2c'2|", 'changing the metre re-bars the score');
    assert.strictEqual(ten.said(), 'Time signature 3/4', 'and says so');
    ten.act({type: 'undo'});
    assert.strictEqual(ten.abc(), "X:1\nM:4/4\nL:1/8\nK:C\n|c2d2e2f2|g2a2b2c'2|",
        'one undo puts back both the metre and the bars');

    // Deleting in the middle re-flows the bars rather than leaving one short.
    ten.act({type: 'select', index: 0});
    ten.act({type: 'delete'});
    assert.strictEqual(ten.abc().split('\n').pop(), "|d2e2f2g2|a2b2c'2|", 'the bars close up behind a deletion');

    // ---- key and clef ----
    const eleven = editor({key: 'C', metre: '4/4'});
    eleven.act({type: 'setHeader', field: 'key', value: 'Eb'});
    assert.ok(eleven.abc().includes('K:Eb'), 'the key signature is a header change');
    assert.strictEqual(eleven.said(), 'Key signature Eb', 'announced by name');
    eleven.act({type: 'setHeader', field: 'clef', value: 'bass'});
    assert.ok(eleven.abc().includes('K:Eb clef=bass'), 'and so is the clef');
    assert.strictEqual(eleven.said(), 'Clef: Bass clef', 'announced from the language pack');
    eleven.act({type: 'setHeader', field: 'nonsense', value: 'x'});
    assert.strictEqual(eleven.said(), '', 'a field that is not a header does nothing at all');
    type(eleven, 'c');
    assert.strictEqual(eleven.abc().split('\n').pop(), '|C,2|',
        'a note typed under a bass clef lands near the middle of that staff, not of a treble one');

    // ---- placing a note where a click said, rather than after the selection ----
    const twelve = editor({key: 'C', metre: '4/4'});
    twelve.press({key: '4'});
    type(twelve, 'cde');
    twelve.act({type: 'insertAt', at: 1, step: 'G', octave: 4});
    assert.strictEqual(twelve.abc().split('\n').pop(), '|cGde|', 'the note goes exactly where the click was');
    assert.strictEqual(twelve.context.selection, 1, 'and is what is now selected');
    assert.strictEqual(twelve.said(), 'Added G4 Quaver, bar 1, note 2', 'and is announced with its place');

    // ---- what the keyboard map does and does not claim ----
    assert.deepStrictEqual(mapKey({key: 'c'}), {type: 'insert', step: 'C', rest: false}, 'c places a C');
    assert.deepStrictEqual(mapKey({key: 'G'}), {type: 'insert', step: 'G', rest: false}, 'and shift does not matter');
    assert.deepStrictEqual(mapKey({key: '1'}), {type: 'setDuration', duration: 1}, '1 is a semibreve');
    assert.deepStrictEqual(mapKey({key: '7'}), {type: 'setDuration', duration: 64}, '7 is a hemidemisemiquaver');
    assert.strictEqual(mapKey({key: '8'}), null, 'and there is no 8');
    assert.strictEqual(mapKey({key: 'h'}), null, 'a letter that is not a note name is left to the browser');
    assert.strictEqual(mapKey({key: 'c', altKey: true}), null, 'alt is left to the browser');
    assert.strictEqual(mapKey({key: 'a', ctrlKey: true}), null, 'so is select-all');
    assert.strictEqual(mapKey({key: 'v', metaKey: true}), null, 'and paste');
    assert.deepStrictEqual(mapKey({key: 'r'}), {type: 'insert', rest: true}, 'r is a rest');
    assert.deepStrictEqual(mapKey({key: 'Delete'}), {type: 'delete'}, 'Delete deletes');
    assert.deepStrictEqual(mapKey({key: 'ArrowRight'}), {type: 'move', by: 1}, 'the right arrow moves on');

    // ---- naming things ----
    assert.strictEqual(lengthName(strings, {duration: 4, dots: 0}), 'Crotchet', 'a plain note value');
    assert.strictEqual(lengthName(strings, {duration: 4, dots: 1}), 'dotted Crotchet', 'a dotted one');
    assert.strictEqual(lengthName(strings, {duration: 4, dots: 2}), 'double dotted Crotchet', 'and a double dotted one');
    assert.strictEqual(
        describeEvent(strings, {kind: 'note', step: 'B', octave: 4, alter: -1, duration: 2, dots: 0, tie: false}),
        'B4 flat Minim',
        'a note is named by pitch, accidental and length'
    );
    assert.strictEqual(
        describeEvent(strings, {kind: 'rest', duration: 8, dots: 0}), 'Quaver rest', 'and a rest by length alone'
    );
    assert.strictEqual(describeEntry(strings, {duration: 8, dots: 1, alter: null, rest: true}),
        'dotted Quaver rest', 'the next-note settings read as one phrase');
    assert.strictEqual(announce(strings, {score: createScore({})}, null, null), '',
        'an action with nothing to announce announces nothing');

    // ---- the plumbing under all of it ----
    assert.strictEqual(repack([], '4/4').length, 0, 'no events, no bars');
    assert.deepStrictEqual(locate(createScore({}), 0), null, 'and nowhere to be');
    assert.strictEqual(
        repack(Array(9).fill({kind: 'rest', duration: 4, dots: 0}), '4/4').map((bar) => bar.length).join(','),
        '4,4,1',
        'nine crotchets fall into three bars of four four'
    );
    assert.strictEqual(
        repack([{kind: 'rest', duration: 1, dots: 0}], '3/4').map((bar) => bar.length).join(','),
        '1',
        'an event too long for the metre still gets a bar of its own rather than vanishing'
    );

    // ---- and the round trip that all of this exists to keep ----
    const abc = one.abc();
    assert.strictEqual(toAbc(fromAbc(abc)), abc, 'what the editor writes, the parser reads back unchanged');

    done('entry, durations, accidentals, ties, rests, headers, undo, keymap');
};

run();
