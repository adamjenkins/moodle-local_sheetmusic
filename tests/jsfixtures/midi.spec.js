/**
 * The MIDI quantiser, over the two fixtures measured in P0-FINDINGS-T3.
 *
 * The load-bearing assertion is the one that runs a clean notation-program export and a
 * jittered keyboard capture of the same melody through the same grid and demands byte-identical
 * bars. That single check is what pins the onset-only design in place: a quantiser that snaps
 * durations as well as onsets fails it, and fails it by producing rest confetti rather than by
 * producing nothing (P0-FINDINGS-T3 section B3, and section B6 item 4 asks for exactly this).
 *
 * Run with: node tests/jsfixtures/midi.spec.js
 *
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

import assert from 'node:assert';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import './dom.js';
import {midiFile, parseMidi} from './midifile.js';
import {fromMidi, quantise, setParser, flatten} from 'local_sheetmusic/midi';
import {MAX_IMPORT_BARS} from 'local_sheetmusic/limits';
import {intoBars, splitTicks} from 'local_sheetmusic/barring';
import {fifthsOfKeyName, guessFifths, spellPitch, spellingTable} from 'local_sheetmusic/keys';
import {toAbc} from 'local_sheetmusic/abc';
import {finishes} from './spec.js';

setParser(parseMidi);

const fixture = (name) => fs.readFileSync(fileURLToPath(
    new URL(`../fixtures/midi/${name}`, import.meta.url)
));

/** The melody both fixtures encode: G4 A4 B4 c5 d5 | e5. d5 B4, in two bars of 4/4. */
const EXPECTED_MUSIC = '|G2A2Bcd2|e3dB4|';

const done = finishes('midi');

const run = async () => {
    // Pure pieces first.
    assert.deepStrictEqual(splitTicks(3840), [{duration: 1, dots: 0}], 'a whole note is one value');
    assert.deepStrictEqual(
        splitTicks(3840 + 960),
        [{duration: 1, dots: 0}, {duration: 4, dots: 0}],
        'five quarters is a whole tied to a quarter'
    );
    assert.deepStrictEqual(splitTicks(2880), [{duration: 2, dots: 1}], 'three quarters is one dotted half');
    assert.deepStrictEqual(
        intoBars([{event: {kind: 'note', step: 'C', octave: 4}, ticks: 3840}], 1920)
            .map((bar) => bar.events.map((e) => `${e.duration}${e.tie ? '-' : ''}`)),
        [['2-'], ['2']],
        'a whole note in 2/4 is split at the barline and tied across it'
    );
    assert.strictEqual(fifthsOfKeyName('Em'), 1, 'E minor is one sharp, not four');
    assert.strictEqual(fifthsOfKeyName('Eb'), -3, 'E flat major is three flats');
    assert.strictEqual(fifthsOfKeyName('Ddor'), 0, 'D dorian has no accidentals');

    // Spelling: the same pitch class, spelled by the key it sits in.
    assert.deepStrictEqual(spellPitch(66, spellingTable(2)), {step: 'F', octave: 4, alter: null},
        'in D major, MIDI 66 is an F needing no accidental');
    assert.deepStrictEqual(spellPitch(66, spellingTable(-3)), {step: 'G', octave: 4, alter: -1},
        'in E flat major, the same pitch is a written G flat');
    assert.deepStrictEqual(spellPitch(60, spellingTable(0)), {step: 'C', octave: 4, alter: null},
        'MIDI 60 is middle C');
    assert.strictEqual(guessFifths([67, 69, 71, 72, 74, 76, 74, 71]), 1,
        'a G major melody with no F at all is still guessed as G, not C');

    // The fixture measured as a clean notation-program export.
    const clean = await fromMidi(fixture('step-entered.mid'));
    assert.strictEqual(clean.score.metre, '4/4', 'the time signature meta was read');
    assert.strictEqual(clean.score.bars.length, 2, 'two bars');
    assert.strictEqual(
        clean.score.bars.reduce((total, bar) => total + bar.events.length, 0),
        8,
        'eight events, one per note played'
    );
    assert.ok(
        !clean.warnings.some((w) => w.includes('no time signature')),
        'a file that carries a time signature is not warned about for one'
    );
    assert.ok(
        !clean.warnings.some((w) => w.includes('no key signature')),
        'a file that carries a key signature is not warned about for one'
    );
    assert.ok(
        clean.warnings.some((w) => w.includes('do not contain sheet music')),
        'every import says plainly that it is a reading, not a transcription'
    );

    // The fixture measured as a jittered keyboard capture of the same melody.
    const played = await fromMidi(fixture('human-played.mid'));

    // ---- the assertion the whole design rests on ----
    assert.deepStrictEqual(
        played.score.bars,
        clean.score.bars,
        'a performance jittered by +/-40 ticks transcribes identically to the clean export'
    );

    // And it is not merely self-consistent: it is the melody a musician would have written.
    assert.ok(toAbc(clean.score).endsWith(EXPECTED_MUSIC),
        `the clean export is the intended melody; got ${JSON.stringify(toAbc(clean.score))}`);
    assert.ok(toAbc(played.score).endsWith(EXPECTED_MUSIC),
        `so is the jittered performance; got ${JSON.stringify(toAbc(played.score))}`);

    // The two files disagree about one thing only, and it is not the music: step-entered.mid
    // carries a key signature meta event of one sharp with the minor flag set, which the
    // Standard MIDI File spec (meta 0x59, mi=1) makes E minor. human-played.mid carries no key
    // signature at all, so its key is guessed from the pitches and comes out G major. Same one
    // sharp, same spelling of every note, different name on the control - which is exactly the
    // sort of thing the author is being asked to check.
    assert.strictEqual(clean.score.key, 'Em', 'the key signature meta is read as written');
    assert.strictEqual(played.score.key, 'G', 'with no meta, the key is guessed from the notes');

    // The jittered file carries neither time nor key signature, and must say so.
    assert.ok(
        played.warnings.some((w) => w.includes('no time signature') && w.includes('4/4')),
        `a file with no metre says which metre was assumed; got ${JSON.stringify(played.warnings)}`
    );
    assert.ok(
        played.warnings.some((w) => w.includes('no key signature')),
        'a file with no key signature says the spelling is a guess'
    );

    // Options are the preview-and-adjust controls; each has to reach the result.
    const inThree = await fromMidi(fixture('human-played.mid'), {metre: '3/4'});
    assert.strictEqual(inThree.score.metre, '3/4', 'the metre override is honoured');
    assert.ok(inThree.score.bars.length > 2, 'and it really re-bars the music');
    assert.ok(
        !inThree.warnings.some((w) => w.includes('no time signature')),
        'once the author has set the metre it is no longer an assumption'
    );

    const up = await fromMidi(fixture('step-entered.mid'), {transpose: 2});
    assert.strictEqual(up.score.bars[0].events[0].step, 'A', 'transposing up a tone moves G to A');

    const coarse = await fromMidi(fixture('step-entered.mid'), {grid: 4});
    assert.notDeepStrictEqual(coarse.score.bars, clean.score.bars,
        'a quarter-note grid really is coarser: the eighth notes cannot survive it');

    const inFlats = await fromMidi(fixture('step-entered.mid'), {key: 'Eb'});
    assert.strictEqual(inFlats.score.key, 'Eb', 'the key override is honoured');

    // The onset-only rule, pinned directly rather than through a fixture that happens to
    // agree: a staccato quarter note - held for a thirty-second and then silent until the next
    // beat - is a quarter note, not a thirty-second followed by a heap of rests.
    const staccato = midiFile.writeMidi({
        header: {format: 0, numTracks: 1, ticksPerBeat: 480},
        tracks: [[
            {deltaTime: 0, meta: true, type: 'timeSignature',
                numerator: 4, denominator: 4, metronome: 24, thirtyseconds: 8},
            {deltaTime: 0, type: 'noteOn', channel: 0, noteNumber: 60, velocity: 80},
            {deltaTime: 60, type: 'noteOff', channel: 0, noteNumber: 60, velocity: 0},
            {deltaTime: 420, type: 'noteOn', channel: 0, noteNumber: 62, velocity: 80},
            {deltaTime: 480, type: 'noteOff', channel: 0, noteNumber: 62, velocity: 0},
            {deltaTime: 0, meta: true, type: 'endOfTrack'},
        ]],
    });
    const detached = await fromMidi(new Uint8Array(staccato), {key: 'C'});
    assert.deepStrictEqual(
        detached.score.bars[0].events.map((e) => `${e.kind}:${e.step || ''}${e.duration}`),
        ['note:C4', 'note:D4'],
        'a note released early still runs to the next onset: two quarter notes, and no rests'
    );

    // Simultaneous notes cannot be held by a one-voice model, and must be reported.
    const chord = midiFile.writeMidi({
        header: {format: 0, numTracks: 1, ticksPerBeat: 480},
        tracks: [[
            {deltaTime: 0, type: 'noteOn', channel: 0, noteNumber: 60, velocity: 80},
            {deltaTime: 0, type: 'noteOn', channel: 0, noteNumber: 64, velocity: 80},
            {deltaTime: 480, type: 'noteOff', channel: 0, noteNumber: 60, velocity: 0},
            {deltaTime: 0, type: 'noteOff', channel: 0, noteNumber: 64, velocity: 0},
            {deltaTime: 0, meta: true, type: 'endOfTrack'},
        ]],
    });
    const merged = await fromMidi(new Uint8Array(chord));
    assert.ok(
        merged.warnings.some((w) => w.includes('same moment')),
        `simultaneous notes are reported, not silently dropped; got ${JSON.stringify(merged.warnings)}`
    );
    assert.strictEqual(merged.score.bars[0].events[0].step, 'E', 'the top note is the one kept');

    // A file with no musical time base has to fail by name rather than divide by undefined.
    assert.throws(
        () => quantise({header: {format: 0, numTracks: 1, framesPerSecond: 25, ticksPerFrame: 40}, tracks: [[]]}),
        /video frames/,
        'an SMPTE-timed file is refused with a specific message'
    );
    assert.throws(
        () => quantise({header: {format: 0, numTracks: 1, ticksPerBeat: 480}, tracks: [[]]}),
        /no notes/,
        'an empty file is refused with a specific message'
    );

    // flatten() must merge tracks, because format 0 and format 1 both reach it.
    const both = flatten(parseMidi(fixture('step-entered.mid')));
    assert.strictEqual(both.notes.length, 8, 'notes are collected across every track');
    assert.ok(both.meta.timeSignature, 'meta events are collected from the track they sit on');
    // A delta time is a variable-length quantity reaching 0x0FFFFFFF, and onset-only quantisation
    // turns the gap into bars. Before this was bounded, the 37-byte file below produced 139,811
    // bars and five of them exhausted a gigabyte of heap.
    const vlq = (n) => {
        const out = [n & 0x7f];
        let rest = n >> 7;
        while (rest > 0) {
            out.unshift((rest & 0x7f) | 0x80);
            rest >>= 7;
        }
        return out;
    };
    const bomb = (pairs, delta) => {
        const events = [];
        for (let i = 0; i < pairs; i++) {
            events.push(0x00, 0x90, 0x3c, 0x40, ...vlq(delta), 0x80, 0x3c, 0x40);
        }
        events.push(0x00, 0xff, 0x2f, 0x00);
        const len = events.length;
        return new Uint8Array([
            0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0x01, 0xe0,
            0x4d, 0x54, 0x72, 0x6b,
            (len >>> 24) & 255, (len >>> 16) & 255, (len >>> 8) & 255, len & 255,
            ...events,
        ]);
    };

    const tiny = bomb(1, 0x0FFFFFFF);
    assert.ok(tiny.length < 64, `the whole hostile file is ${tiny.length} bytes`);
    await assert.rejects(
        () => fromMidi(tiny.buffer, {}),
        (error) => /past the \d+ this importer will read/.test(error.message),
        'a file whose timing works out past the bar bound is refused'
    );

    // The bound is a ceiling, not a blanket refusal: ordinary files still import.
    const {score} = await fromMidi(fixture('step-entered.mid'), {});
    assert.ok(score.bars.length > 0 && score.bars.length <= MAX_IMPORT_BARS,
        'a real fixture is well inside the bound');


    done('clean == jittered, options, chords reported, SMPTE refused');
};

run();
