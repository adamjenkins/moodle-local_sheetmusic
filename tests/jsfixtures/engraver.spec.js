/**
 * Integration test: drives the real vendored Verovio engine.
 *
 * This is the test that proves the engraver contract end to end — real WASM, real engraving,
 * real element ids — rather than trusting a fake toolkit. It is the only JS test that loads
 * the 7 MB artifact, so it is slower than the rest by design.
 *
 * Run with: node tests/jsfixtures/engraver.spec.js
 */

import assert from 'node:assert';
import './dom.js';
import {render, toMidi, version, setToolkitFactory} from '../../amd/src/engraver.js';

const FIXTURE = 'X:1\nM:4/4\nK:G\n|GABc dedB|';
const EXPECTED = ['g4', 'a4', 'b4', 'c5', 'd5', 'e5', 'd5', 'b4'];

// Node cannot resolve the browser's wwwroot-based URL, so the vendored files are imported
// by path here. Everything downstream of this is the production code path.
setToolkitFactory(async () => {
    const [{default: createVerovioModule}, {VerovioToolkit, enableLog, LOG_OFF}] = await Promise.all([
        import('../../thirdparty/verovio/verovio-module.mjs'),
        import('../../thirdparty/verovio/verovio.mjs'),
    ]);
    const module = await createVerovioModule();
    const toolkit = new VerovioToolkit(module);
    enableLog(LOG_OFF, module);
    return toolkit;
});

const run = async () => {
    const engine = await version();
    assert.ok(engine.startsWith('6.3.0'), `expected Verovio 6.3.0, got ${engine}`);

    const {svg, idMap} = await render(FIXTURE, 'abc', {});
    assert.ok(svg.includes('<svg'), 'an SVG was produced');

    const notes = Object.values(idMap);
    assert.strictEqual(notes.length, 8, `expected 8 notes in the id map, got ${notes.length}`);

    const pitches = notes.map((n) => `${n.pitch}${n.octave}`);
    assert.deepStrictEqual(pitches, EXPECTED, 'the id map carries the right pitches in order');

    // svgHtml5 must keep note ids out of the document id namespace, so that two scores on one
    // page cannot collide. Verovio keeps a handful of plain ids (the svg root and its glyph
    // symbols) but suffixes them per render, which is checked below.
    assert.ok(svg.includes('data-id="'), 'note ids live on data-id');
    assert.strictEqual(
        (svg.match(/data-class="note"[^>]* id="/g) || []).length,
        0,
        'no note element carries a plain id'
    );

    const second = await render(FIXTURE, 'abc', {});
    const idsOf = (s) => (s.match(/ id="([^"]*)"/g) || []).sort();
    assert.notDeepStrictEqual(
        idsOf(svg),
        idsOf(second.svg),
        'the remaining plain ids are namespaced per render, so two scores cannot collide'
    );

    // MusicXML is read natively, which is what makes import work without a server.
    const mxl = '<?xml version="1.0"?><score-partwise version="4.0"><part-list>'
        + '<score-part id="P1"><part-name>Music</part-name></score-part></part-list>'
        + '<part id="P1"><measure number="1"><attributes><divisions>1</divisions>'
        + '<key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time>'
        + '<clef><sign>G</sign><line>2</line></clef></attributes>'
        + '<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration>'
        + '<type>whole</type></note></measure></part></score-partwise>';
    const fromXml = await render(mxl, 'musicxml', {});
    assert.strictEqual(Object.keys(fromXml.idMap).length, 1, 'MusicXML renders one note');
    assert.strictEqual(Object.values(fromXml.idMap)[0].pitch, 'c', 'MusicXML pitch read');

    // MIDI export needs no server either.
    const midi = await toMidi(FIXTURE, 'abc');
    assert.ok(typeof midi === 'string' && midi.length > 0, 'MIDI produced');
    assert.ok(Buffer.from(midi, 'base64').subarray(0, 4).toString() === 'MThd', 'valid MIDI header');

    window.console.log(`engraver.spec: OK (Verovio ${engine}, 8 notes, MusicXML in, MIDI out)`);
};

run();
