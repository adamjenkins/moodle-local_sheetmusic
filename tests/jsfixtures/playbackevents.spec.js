/**
 * Integration test: what the fixture corpus actually sounds like.
 *
 * This drives the real vendored Verovio engine, because everything that could go audibly wrong
 * with playback is decided by the engine before our code sees a byte: a tie struck twice, a key
 * signature ignored, a dotted rhythm evened out. Checking it against a fake would prove only
 * that the fake is consistent with itself.
 *
 * The expected pitches below were worked out from the ABC by hand, note by note, and are the
 * authority here - not whatever the engine currently emits.
 *
 * Run with: node tests/jsfixtures/playbackevents.spec.js
 *
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

import assert from 'node:assert';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
import './dom.js';
import './verovio.js';
import {renderWithAudio} from 'local_sheetmusic/engraver';
import {fromParsed} from 'local_sheetmusic/playback/events';
import {spansOf} from 'local_sheetmusic/playback/cursor';
import {setParser} from 'local_sheetmusic/midi';
import {finishes} from './spec.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, '..', 'fixtures', 'abc');

// The vendored parser is UMD and node's ESM loader gives it no CommonJS shape to latch onto,
// so it is given one here. These are the same bytes the browser loads over HTTP.
const midiSource = readFileSync(join(HERE, '..', '..', 'thirdparty', 'midi-file', 'midi-file.js'), 'utf8');
const shim = {exports: {}};
// eslint-disable-next-line no-new-func
new Function('module', 'exports', 'self', midiSource)(shim, shim.exports, undefined);
setParser((bytes) => shim.exports.parseMidi(bytes));

/**
 * What each fixture must sound like: MIDI note numbers, in the order they are struck.
 *
 * @type {object}
 */
const EXPECTED = {
    // K:G. No F occurs, so nothing is altered; sixteen plain eighth notes.
    'simple.abc': [67, 69, 71, 72, 74, 76, 74, 71, 74, 76, 74, 71, 74, 76, 74, 71],
    // ^F =G _A ^^c | __B =c ^d. Double accidentals, and =c cancelling the ^^c earlier in the bar.
    'accidentals.abc': [66, 67, 68, 74, 69, 72, 75],
    // A4-A4 must sound as ONE note. Six noteheads, four sounds. c is C# from K:D.
    'ties.abc': [69, 69, 71, 73],
    // K:Eb written in bass clef: the clef must not move the sounding pitch.
    'keymetre.abc': [51, 53, 55, 56, 58, 60, 50, 51],
    // K:Ddor is the D mode of C major, so nothing is flattened: the B stays natural.
    'modal.abc': [62, 64, 65, 67, 69, 71, 72, 74, 76, 74, 69, 65],
    // K:F, so B is Bb. Durations checked separately below.
    'dotted.abc': [69, 70, 72, 74, 72, 74, 76, 77],
    // c' and C,, are four octaves apart, with rests between that sound as nothing.
    'rests.abc': [84, 36],
};

const done = finishes('playbackevents');

/**
 * Engrave a fixture and read back what it sounds like.
 *
 * @param {string} name The fixture file name.
 * @returns {Promise<object>} {notes, durationMs, spans, svg}.
 */
const play = async (name) => {
    const source = readFileSync(join(FIXTURES, name), 'utf8');
    const {svg, midi, timemap} = await renderWithAudio(source, 'abc', {});
    const {notes, durationMs} = fromParsed(shim.exports.parseMidi(Buffer.from(midi, 'base64')));
    return {notes, durationMs, spans: spansOf(timemap), svg};
};

const run = async () => {
    for (const [name, pitches] of Object.entries(EXPECTED)) {
        const {notes, durationMs, spans, svg} = await play(name);

        assert.deepStrictEqual(
            notes.map((note) => note.pitch),
            pitches,
            `${name} sounds the pitches the notation says`
        );

        // Onsets must be strictly ordered and inside the piece.
        notes.forEach((note, at) => {
            assert.ok(note.endMs > note.startMs, `${name} note ${at} has a positive duration`);
            assert.ok(note.endMs <= durationMs + 1, `${name} note ${at} stops by the end of the piece`);
            if (at) {
                assert.ok(note.startMs >= notes[at - 1].startMs, `${name} notes are in start order`);
            }
        });

        // Every id the cursor will look for has to exist in the SVG that came out of the same
        // load, which is the whole reason the two are produced together.
        const ids = new Set([...svg.matchAll(/data-id="([^"]+)"/g)].map((m) => m[1]));
        assert.ok(spans.length > 0, `${name} produces a highlight schedule`);
        spans.forEach((span) => {
            assert.ok(ids.has(span.id), `${name}: the cursor's element ${span.id} is in the score`);
        });
    }

    // Ties: six noteheads to follow with the eye, four notes to hear. If these two ever agree,
    // one of them is wrong.
    const ties = await play('ties.abc');
    assert.strictEqual(ties.notes.length, 4, 'ties.abc sounds four notes');
    assert.strictEqual(ties.spans.length, 6, 'ties.abc highlights six noteheads');
    assert.ok(ties.notes[0].endMs - ties.notes[0].startMs > 1900,
        'the tied whole note sounds through both halves of the tie');

    // Dotted rhythms: onsets are exact multiples of the eighth note, and the durations hold
    // their 3:1:2:6:1.5:0.5:3:1 shape. Verovio releases every note one tick early so that a
    // repeated note retriggers, which is why durations are compared with a tolerance and
    // onsets are not.
    const dotted = await play('dotted.abc');
    const eighth = 250;
    assert.deepStrictEqual(
        dotted.notes.map((note) => Math.round(note.startMs / eighth)),
        [0, 3, 4, 6, 12, 13.5, 14, 17].map(Math.round),
        'dotted.abc places every onset on the grid the notation says'
    );
    [3, 1, 2, 6, 1.5, 0.5, 3, 1].forEach((eighths, at) => {
        const sounded = (dotted.notes[at].endMs - dotted.notes[at].startMs) / eighth;
        assert.ok(Math.abs(sounded - eighths) < 0.06,
            `dotted.abc note ${at} lasts ${eighths} eighths (sounded ${sounded.toFixed(3)})`);
    });

    // THE REGRESSION THAT MATTERS.
    //
    // Verovio's ABC importer keeps the last non-empty key signature it read in state that
    // outlives loadData() and is shared by every toolkit on one engine instance. Before
    // renderWithAudio() gave each render an engine of its own, a score whose key signature is
    // empty - C major, A minor, any dorian - was played in the previous score's key: measured,
    // K:C after K:Dlyd sounded with three sharps. Nothing else clears it, so if this test ever
    // fails, playback is silently transposing scores for real readers.
    const alone = await play('modal.abc');
    await play('keymetre.abc');                       // Three flats, into the same process.
    const after = await play('modal.abc');
    assert.deepStrictEqual(
        after.notes.map((note) => note.pitch),
        alone.notes.map((note) => note.pitch),
        'a score with an empty key signature sounds the same after a score that has one'
    );
    assert.deepStrictEqual(
        after.notes.map((note) => note.pitch),
        EXPECTED['modal.abc'],
        'and it is the key the notation actually shows'
    );

    done(`${Object.keys(EXPECTED).length} fixtures sound as written, ties included`);
};

run();
