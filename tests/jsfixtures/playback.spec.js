/**
 * Unit tests for the transport, the cursor and the voice pool, with a fake audio device.
 *
 * No sound is made here and none is asserted: a headless machine has no audio device, and a
 * test that claimed to hear something would be lying. What is asserted is everything that
 * decides whether the sound would be right - which notes are handed to the clock, at what times,
 * at what speed, how many may sound at once, and which notehead is marked while they do.
 *
 * Run with: node tests/jsfixtures/playback.spec.js
 *
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

import assert from 'node:assert';
import './dom.js';
import {PLAYING_CLASS, createCursor, spansOf} from 'local_sheetmusic/playback/cursor';
import {createTransport} from 'local_sheetmusic/playback/scheduler';
import {createVoicePool, isSupported, setContextFactory} from 'local_sheetmusic/playback/audio';
import {frequencyOf} from 'local_sheetmusic/playback/voice';
import {MAX_VOICES} from 'local_sheetmusic/limits';
import {fromParsed} from 'local_sheetmusic/playback/events';
import {finishes} from './spec.js';

const done = finishes('playback');

/** A stand-in for the audio device, with a clock the test drives by hand. */
const fakeContext = () => {
    const param = () => ({
        value: 1,
        setValueAtTime() {},
        exponentialRampToValueAtTime() {},
        cancelScheduledValues() {},
    });
    return {
        currentTime: 0,
        state: 'running',
        destination: {},
        started: [],
        createGain() {
            return {gain: param(), connect() {}, disconnect() {}};
        },
        createBiquadFilter() {
            return {type: '', frequency: param(), Q: {value: 0}, connect() {}, disconnect() {}};
        },
        createOscillator() {
            const context = this;
            // Enforces what the real API enforces. A permissive fake here let a bug through to
            // the browser once: the voice scheduled its release before starting the oscillator,
            // which throws InvalidStateError in Chromium and silenced every note.
            let started = false;
            return {
                type: '', frequency: {value: 0}, detune: {value: 0},
                connect() {}, disconnect() {},
                start(at) {
                    started = true;
                    context.started.push(at);
                },
                stop() {
                    if (!started) {
                        throw new Error("cannot call stop without calling start first");
                    }
                },
            };
        },
        resume() {
            return Promise.resolve();
        },
        suspend() {
            return Promise.resolve();
        },
    };
};

/** A pool that records what it was asked to play instead of playing it. */
const fakePool = () => {
    const played = [];
    return {
        played,
        play: (note) => {
            played.push(note);
            return {startAt: note.startAt, endAt: note.endAt, stop() {}};
        },
        stopAll: () => {},
        size: () => played.length,
    };
};

const run = async () => {
    // --- the cursor's schedule --------------------------------------------------------------
    const timemap = [
        {tstamp: 0, on: ['a']},
        {tstamp: 500, on: ['b'], off: ['a']},
        {tstamp: 1000, on: ['c'], off: ['b']},
        {tstamp: 1500, off: ['c']},
    ];
    assert.deepStrictEqual(spansOf(timemap), [
        {id: 'a', startMs: 0, endMs: 500},
        {id: 'b', startMs: 500, endMs: 1000},
        {id: 'c', startMs: 1000, endMs: 1500},
    ], 'a timemap becomes one span per notehead');

    // A note the timemap never closes still has to stop, or it stays lit for ever.
    const unclosed = spansOf([{tstamp: 0, on: ['x']}, {tstamp: 900, on: ['y'], off: ['y']}]);
    assert.ok(unclosed[0].endMs >= 900, 'an unclosed span runs to the end of the timemap');

    // --- the cursor on a real DOM -----------------------------------------------------------
    const figure = document.createElement('div');
    figure.innerHTML = ['a', 'b', 'c'].map((id) => `<span data-id="${id}"></span>`).join('');
    const marked = () => [...figure.querySelectorAll(`.${PLAYING_CLASS}`)].map((el) => el.dataset.id);
    const cursor = createCursor(figure, spansOf(timemap));

    cursor.at(0);
    assert.deepStrictEqual(marked(), ['a'], 'the first note is marked at the start');
    cursor.at(600);
    assert.deepStrictEqual(marked(), ['b'], 'the mark moves on, and the note before it is cleared');
    cursor.at(1200);
    assert.deepStrictEqual(marked(), ['c'], 'and again');
    cursor.at(2000);
    assert.deepStrictEqual(marked(), [], 'nothing is marked after the end');
    // Restarting must not leave the walk half way through the piece.
    cursor.at(0);
    assert.deepStrictEqual(marked(), ['a'], 'going backwards restarts the walk');
    cursor.clear();
    assert.deepStrictEqual(marked(), [], 'clearing unmarks everything');

    // An id from a crafted MusicXML or MEI score can carry a quote or a bracket, because Verovio
    // keeps the xml:id it is given. That must not throw part way through building the cursor.
    const hostile = document.createElement('div');
    hostile.innerHTML = '<span data-id=\'a"]b\'></span><span data-id="ok"></span>';
    const hostileCursor = createCursor(hostile, spansOf([
        {tstamp: 0, on: ['a"]b']},
        {tstamp: 100, on: ['ok'], off: ['a"]b']},
        {tstamp: 200, off: ['ok']},
    ]));
    hostileCursor.at(0);
    hostileCursor.at(150);
    assert.strictEqual(hostile.querySelectorAll(`.${PLAYING_CLASS}`).length, 1,
        'an id containing a quote does not stop the cursor reaching the notes after it');
    hostileCursor.clear();

    // --- the transport ----------------------------------------------------------------------
    const context = fakeContext();
    const pool = fakePool();
    const notes = [
        {pitch: 60, velocity: 0.8, startMs: 0, endMs: 400},
        {pitch: 62, velocity: 0.8, startMs: 500, endMs: 900},
        {pitch: 64, velocity: 0.8, startMs: 4000, endMs: 4400},
    ];
    const states = [];
    const transport = createTransport({
        context, pool, notes, durationMs: 4400,
        cursor: createCursor(figure, []),
        onState: (state) => states.push(state),
    });

    transport.start();
    assert.strictEqual(states[0], 'playing', 'starting reports that it is playing');
    // Only what falls inside the lookahead is handed to the clock; the note four seconds away
    // is not, or a long score would be scheduled in its entirety up front.
    assert.deepStrictEqual(pool.played.map((note) => note.pitch), [60],
        'only the notes falling due shortly are scheduled');

    context.currentTime = 0.5;
    transport.pump();
    assert.deepStrictEqual(pool.played.map((note) => note.pitch), [60, 62],
        'the next note is scheduled as its moment approaches');

    // Times are on the audio clock, in seconds, and are absolute.
    assert.ok(Math.abs(pool.played[1].startAt - 0.5) < 0.001, 'a note at 500ms is placed at 0.5s');
    assert.ok(pool.played[1].endAt > pool.played[1].startAt, 'and it is given an end');

    transport.stop();
    assert.strictEqual(states[states.length - 1], 'stopped', 'stopping is reported');
    assert.strictEqual(transport.isPlaying(), false, 'and it is no longer playing');

    // --- speed ------------------------------------------------------------------------------
    const slowContext = fakeContext();
    const slowPool = fakePool();
    const slow = createTransport({
        context: slowContext, pool: slowPool, notes, durationMs: 4400, cursor: null,
        onState: () => {},
    });
    slow.setRate(0.5);
    slow.start();
    slowContext.currentTime = 1.0;
    slow.pump();
    // At half speed, one second of real time is half a second of music, so the note written at
    // 500ms is placed a full second in.
    const second = slowPool.played.find((note) => note.pitch === 62);
    assert.ok(second && Math.abs(second.startAt - 1.0) < 0.001,
        'at half speed a note written at 500ms sounds at 1.0s');
    slow.stop();

    assert.strictEqual(slow.rate(), 0.5, 'the speed is reported');
    slow.setRate(99);
    assert.ok(slow.rate() <= 2, 'the speed is bounded above');
    slow.setRate(0);
    assert.ok(slow.rate() >= 0.25, 'and below');

    // --- the voice pool -------------------------------------------------------------------
    setContextFactory(fakeContext);
    assert.strictEqual(isSupported(), true, 'a context factory means audio is available');
    const voiceContext = fakeContext();
    const voices = createVoicePool(voiceContext);
    for (let at = 0; at < MAX_VOICES + 6; at++) {
        voices.play({pitch: 60 + (at % 12), velocity: 1, startAt: 0, endAt: 10});
    }
    assert.ok(voices.size() <= MAX_VOICES,
        `no more than ${MAX_VOICES} voices sound at once (got ${voices.size()})`);
    assert.ok(voiceContext.started.length > 0,
        'the voices actually started their oscillators, in an order the real API accepts');
    voices.stopAll();
    assert.strictEqual(voices.size(), 0, 'stopping all of them empties the pool');
    setContextFactory(null);

    // --- pitch ------------------------------------------------------------------------------
    assert.strictEqual(frequencyOf(69), 440, 'A above middle C is 440 Hz');
    assert.ok(Math.abs(frequencyOf(60) - 261.6256) < 0.001, 'middle C is 261.63 Hz');
    assert.ok(Math.abs(frequencyOf(81) - 880) < 0.001, 'an octave up doubles the frequency');

    // --- tempo changes in the MIDI ----------------------------------------------------------
    // A score that changes tempo part way through cannot be timed by one multiplication, so the
    // conversion is checked against a file that does.
    const parsed = {
        header: {ticksPerBeat: 100},
        tracks: [[
            {deltaTime: 0, meta: true, type: 'setTempo', microsecondsPerBeat: 500000},
            {deltaTime: 0, type: 'noteOn', noteNumber: 60, velocity: 100, channel: 0},
            {deltaTime: 100, type: 'noteOff', noteNumber: 60, velocity: 0, channel: 0},
            {deltaTime: 0, meta: true, type: 'setTempo', microsecondsPerBeat: 250000},
            {deltaTime: 0, type: 'noteOn', noteNumber: 62, velocity: 100, channel: 0},
            {deltaTime: 100, type: 'noteOff', noteNumber: 62, velocity: 0, channel: 0},
        ]],
    };
    const timed = fromParsed(parsed);
    assert.strictEqual(timed.notes[0].startMs, 0, 'the first note starts at zero');
    assert.strictEqual(timed.notes[0].endMs, 500, 'a beat at 120bpm lasts 500ms');
    assert.strictEqual(timed.notes[1].startMs, 500, 'the second note follows it');
    assert.strictEqual(timed.notes[1].endMs, 750, 'and a beat at 240bpm lasts 250ms');

    // The same pitch on two channels at once is two notes, not one closing the other.
    const overlapping = fromParsed({
        header: {ticksPerBeat: 100},
        tracks: [[
            {deltaTime: 0, type: 'noteOn', noteNumber: 60, velocity: 100, channel: 0},
            {deltaTime: 0, type: 'noteOn', noteNumber: 60, velocity: 100, channel: 1},
            {deltaTime: 100, type: 'noteOff', noteNumber: 60, velocity: 0, channel: 0},
            {deltaTime: 100, type: 'noteOff', noteNumber: 60, velocity: 0, channel: 1},
        ]],
    });
    assert.strictEqual(overlapping.notes.length, 2, 'one pitch on two channels is two notes');
    assert.strictEqual(overlapping.notes[0].endMs, 500, 'the first ends when its own channel says');
    assert.strictEqual(overlapping.notes[1].endMs, 1000, 'and the second when its own does');

    done('cursor, transport, speed, voice limit and tempo map all behave');
};

run();
