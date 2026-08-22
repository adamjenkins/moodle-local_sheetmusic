/**
 * Regenerates the two MIDI fixtures the quantiser tests read.
 *
 * Run with: node make-fixtures.js <output-directory>
 *
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

const { writeMidi } = require('midi-file');
const fs = require('fs');
const path = require('path');
const OUT = process.argv[2];

const TPB = 480;                 // ticks per beat (quarter note)
// Melody: two bars of 4/4 in G major -- the ABC "|G2A2 Bc d2|e3 d B4|" shape.
// [midi, ticks]
const MEL = [
  [67, 480], [69, 480], [71, 240], [72, 240], [74, 480],   // bar 1: G A B c d  = 1920
  [76, 720], [74, 240], [71, 960],                          // bar 2: e. d B    = 1920
];

// ---- absolute-time event list -> delta-time track -------------------------
function toTrack(abs) {
  abs.sort((a, b) => a.t - b.t || (a.ev.type === 'noteOff' ? -1 : 1));
  let last = 0;
  return abs.map(({ t, ev }) => {
    const e = Object.assign({}, ev, { deltaTime: t - last });
    last = t;
    return e;
  });
}

// ---- fixture 1: "step-entered" (what a notation program exports) ----------
// Exact grid. Explicit timeSignature, keySignature and setTempo on a meta track.
function stepEntered() {
  const meta = [
    { deltaTime: 0, meta: true, type: 'trackName', text: 'sheetmusic fixture: step-entered' },
    { deltaTime: 0, meta: true, type: 'timeSignature', numerator: 4, denominator: 4, metronome: 24, thirtyseconds: 8 },
    { deltaTime: 0, meta: true, type: 'keySignature', key: 1, scale: 1 },   // 1 sharp, major = G
    { deltaTime: 0, meta: true, type: 'setTempo', microsecondsPerBeat: 500000 }, // 120 bpm
    { deltaTime: 3840, meta: true, type: 'endOfTrack' },
  ];
  const abs = [];
  let t = 0;
  abs.push({ t: 0, ev: { type: 'programChange', channel: 0, programNumber: 0 } });
  for (const [note, dur] of MEL) {
    abs.push({ t, ev: { type: 'noteOn', channel: 0, noteNumber: note, velocity: 80 } });
    abs.push({ t: t + dur, ev: { type: 'noteOff', channel: 0, noteNumber: note, velocity: 0 } });
    t += dur;                                  // exact, gapless, on the grid
  }
  const track = toTrack(abs);
  track.push({ deltaTime: 0, meta: true, type: 'endOfTrack' });
  return { header: { format: 1, numTracks: 2, ticksPerBeat: TPB }, tracks: [meta, track] };
}

// ---- fixture 2: "human-played" (keyboard capture, no notation metadata) ---
// Deterministic pseudo-random jitter so the fixture is byte-stable in git.
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function humanPlayed() {
  const rnd = mulberry32(20260821);
  const jitter = () => Math.round((rnd() * 2 - 1) * 40);   // +/- 40 ticks
  const abs = [];
  let nominal = 0;
  abs.push({ t: 0, ev: { type: 'programChange', channel: 0, programNumber: 0 } });
  // NOTE: no trackName, NO timeSignature, NO keySignature. setTempo only.
  abs.push({ t: 0, ev: { meta: true, type: 'setTempo', microsecondsPerBeat: 500000 } });
  for (const [note, dur] of MEL) {
    const onset = Math.max(0, nominal + jitter());
    // Human durations are short of nominal (detached) or long (overlapping legato).
    const played = Math.max(60, dur + jitter() - 25);
    abs.push({ t: onset, ev: { type: 'noteOn', channel: 0, noteNumber: note, velocity: 60 + Math.round(rnd() * 40) } });
    abs.push({ t: onset + played, ev: { type: 'noteOff', channel: 0, noteNumber: note, velocity: 0 } });
    nominal += dur;
  }
  const track = toTrack(abs);
  track.push({ deltaTime: 40, meta: true, type: 'endOfTrack' });
  return { header: { format: 0, numTracks: 1, ticksPerBeat: TPB }, tracks: [track] };
}

for (const [name, data] of [['step-entered', stepEntered()], ['human-played', humanPlayed()]]) {
  const bytes = Buffer.from(writeMidi(data));
  const p = path.join(OUT, name + '.mid');
  fs.writeFileSync(p, bytes);
  console.log('wrote', p, bytes.length, 'bytes');
}
