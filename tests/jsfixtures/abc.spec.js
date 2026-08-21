/**
 * Unit tests for the ABC serialiser.
 *
 * No DOM here either: abcjs parses without one, which is what lets the source tab's parse
 * step be tested in node. The parser under test is the vendored file itself, loaded off
 * disk, not a separate copy from npm - it is those bytes that ship.
 *
 * Run with: node tests/jsfixtures/abc.spec.js
 */

import assert from 'node:assert';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {parseOnly} from './abcjs.js';
import {decomposeValue, escapeSource, fromAbc, normaliseSource, setParser, toAbc} from 'local_sheetmusic/abc';
import {createScore} from 'local_sheetmusic/model';

// --- Before a parser is installed ------------------------------------------------------

assert.throws(() => fromAbc('X:1\nK:C\n|CDEF|'), /ensureParser/, 'fromAbc says what is missing');

setParser(parseOnly);

// --- The storage-contract properties of toAbc ------------------------------------------

const contract = createScore({key: 'G', metre: '4/4', clef: 'treble'});
contract.addNote({step: 'g', octave: 4, duration: 8});
assert.ok(!toAbc(contract).startsWith('\n'), 'output never opens with a newline (RELATIONS A2 rule 6)');
assert.ok(!/\r/.test(toAbc(contract)), 'output is LF only');
assert.strictEqual(
    escapeSource('a & b < c > d "e" \'f\' é'),
    'a &amp; b &lt; c &gt; d "e" \'f\' é',
    'exactly three characters are escaped (RELATIONS A2 rule 7)'
);
assert.strictEqual(escapeSource('&amp;'), '&amp;amp;', 'escaping is not idempotent, so it is applied once');

// --- The tune from the storage contract --------------------------------------------------

const src = 'X:1\nM:4/4\nK:G\n|GABc dedB|';
const score = fromAbc(src);
assert.strictEqual(score.key, 'G');
assert.strictEqual(score.metre, '4/4');
assert.strictEqual(score.clef, 'treble');
// The space in "GABc dedB" is a beam break, not a barline: this is one bar of eight eighths.
assert.strictEqual(score.bars.length, 1, 'a beam break is not a barline');
assert.strictEqual(score.bars[0].events.length, 8);
assert.deepStrictEqual(
    score.bars[0].events.map((e) => `${e.step}${e.octave}`),
    ['G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'D5', 'B4'],
    'pitch and octave come off abcjs pitch integers, which are clef-independent'
);
assert.strictEqual(toAbc(score), 'X:1\nM:4/4\nL:1/8\nK:G\n|GABcdedB|');

// --- Line endings --------------------------------------------------------------------------

// Moodle rewrites every LF to CRLF exactly once on form submission (P0-FINDINGS-T1), so
// server-side code hands us CRLF where the browser saw LF. Neither is a difference.
assert.deepStrictEqual(
    fromAbc(src.replace(/\n/g, '\r\n')).toJSON(),
    score.toJSON(),
    'CRLF input parses to the same model'
);
assert.deepStrictEqual(fromAbc(src.replace(/\n/g, '\r')).toJSON(), score.toJSON(), 'so does bare CR');

// abcjs parses either ending, but counts its startChar offsets against the LF form either
// way, so the source tab's caret sync depends on this normalisation and not on abcjs.
assert.strictEqual(normaliseSource('a\r\nb\rc\nd'), 'a\nb\nc\nd', 'every ending becomes LF');
assert.strictEqual(normaliseSource('a\r\r\nb'), 'a\n\nb', 'a blank CRLF line stays one blank line');

// --- Lengths, dots, accidentals, octaves, ties -----------------------------------------------

assert.deepStrictEqual(decomposeValue(0.125), {duration: 8, dots: 0});
assert.deepStrictEqual(decomposeValue(0.375), {duration: 4, dots: 1}, 'three eighths is a dotted quarter');
assert.deepStrictEqual(decomposeValue(0.875), {duration: 2, dots: 2}, 'seven eighths is a doubly dotted half');
assert.deepStrictEqual(decomposeValue(0.09375), {duration: 16, dots: 1});
assert.throws(() => decomposeValue(1 / 3), /not one this editor can hold/, 'a third of a whole note is refused, not rounded');

const spelling = fromAbc('X:1\nM:4/4\nL:1/8\nK:C\n|^F=G_A__B^^c z2|C,,4c\'\'4|');
assert.deepStrictEqual(
    spelling.bars[0].events.slice(0, 5).map((e) => e.alter),
    [1, 0, -1, -2, 2],
    'a written accidental maps straight onto alter, natural included'
);
assert.strictEqual(spelling.bars[0].events[5].kind, 'rest');
assert.strictEqual(spelling.bars[1].events[0].octave, 2, 'C,, is two octaves below middle C');
assert.strictEqual(spelling.bars[1].events[1].octave, 7, "c'' is three above it");
assert.strictEqual(toAbc(spelling), 'X:1\nM:4/4\nL:1/8\nK:C\n|^F=G_A__B^^cz2|C,,4c\'\'4|');

const tied = fromAbc('X:1\nM:4/4\nL:1/8\nK:D\n|A4-A4|');
assert.strictEqual(tied.bars[0].events[0].tie, true, 'the tie sits on the note that starts it');
assert.strictEqual(tied.bars[0].events[1].tie, false, 'and not on the one that ends it');
assert.strictEqual(toAbc(tied), 'X:1\nM:4/4\nL:1/8\nK:D\n|A4-A4|', 'and is written back out');

// --- Key, metre and clef spellings -------------------------------------------------------------

assert.strictEqual(fromAbc('X:1\nM:C\nK:C\n|CDEF|').metre, '4/4', 'common time is written out');
assert.strictEqual(fromAbc('X:1\nM:C|\nK:C\n|CDEF|').metre, '2/2', 'and so is cut time');
assert.strictEqual(fromAbc('X:1\nM:none\nK:C\n|CDEF|').metre, 'none', 'an unmetred tune stays unmetred');
assert.strictEqual(fromAbc('X:1\nM:4/4\nK:F#m\n|FGAB|').key, 'F#m');
assert.strictEqual(fromAbc('X:1\nM:4/4\nK:Ddor\n|DEFG|').key, 'Ddor', 'modal names keep ABC spelling');
assert.strictEqual(fromAbc('X:1\nM:4/4\nK:none\n|CDEF|').key, 'none');
assert.strictEqual(fromAbc('X:1\nM:4/4\nK:C clef=bass\n|CDEF|').clef, 'bass');
assert.strictEqual(
    fromAbc('X:1\nM:4/4\nK:C clef=tenor\n|CDEF|').clef,
    'tenor',
    'tenor is told from alto by staff position, because abcjs reports both as alto'
);

// --- What the model refuses to hold ---------------------------------------------------------------

assert.throws(() => fromAbc('X:1\nM:4/4\nL:1/8\nK:C\n|(3ABc d2e2|'), /tuplets/, 'a tuplet is refused');
assert.throws(() => fromAbc('X:1\nM:4/4\nL:1/8\nK:C\n|[CEG]4z4|'), /chords/, 'a chord is refused');

// A broken rhythm is not refused: it is exactly a dotted pair, which the model does hold.
const broken = fromAbc('X:1\nM:4/4\nL:1/8\nK:C\n|A>Bc2d2e2|');
assert.deepStrictEqual(
    broken.bars[0].events.slice(0, 2).map((e) => `${e.duration}.${e.dots}`),
    ['8.1', '16.0'],
    'A>B is a dotted eighth and a sixteenth'
);

// --- An empty score still carries its headers --------------------------------------------------------

const empty = createScore({key: 'Eb', metre: '6/8', clef: 'bass'});
assert.strictEqual(toAbc(empty), 'X:1\nM:6/8\nL:1/8\nK:Eb clef=bass\n|');
assert.deepStrictEqual(fromAbc(toAbc(empty)).toJSON(), empty.toJSON(), 'an empty score round-trips');

// --- The fixture corpus -----------------------------------------------------------------------------

const dir = fileURLToPath(new URL('../fixtures/abc/', import.meta.url));
const fixtures = fs.readdirSync(dir).filter((name) => name.endsWith('.abc')).sort();
assert.ok(fixtures.length >= 5, `expected a corpus, found ${fixtures.length} fixtures`);

fixtures.forEach((name) => {
    const text = fs.readFileSync(dir + name, 'utf8');
    const first = fromAbc(text);
    assert.ok(first.bars.length > 0, `${name}: parsed to something`);

    const written = toAbc(first);
    const second = fromAbc(written);
    assert.deepStrictEqual(second.toJSON(), first.toJSON(), `${name}: ABC to model to ABC is the same model`);
    assert.strictEqual(toAbc(second), written, `${name}: and the same text, so the round trip is a fixed point`);

    // The same, entering through the line endings Moodle actually stores.
    assert.deepStrictEqual(
        fromAbc(text.replace(/\n/g, '\r\n')).toJSON(),
        first.toJSON(),
        `${name}: CRLF makes no difference`
    );

    // And the same again through the model's own JSON, which is what the editor persists.
    assert.deepStrictEqual(
        toAbc(createScore(first.toJSON())),
        written,
        `${name}: JSON round trip does not change the ABC`
    );
});

process.stdout.write(`abc.spec OK (${fixtures.length} fixtures)\n`);
