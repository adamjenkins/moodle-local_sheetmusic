/**
 * The editing surface, driven through the contract tiny_sheetmusic will use.
 *
 * Everything here goes through `local_sheetmusic/editor` - the module name in RELATIONS.md
 * section B1 - rather than through `editor/index`, so that the re-export that makes that name
 * resolve is exercised too.
 *
 * Run with: node tests/jsfixtures/editor.spec.js
 */

import assert from 'node:assert';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import './dom.js';
import './verovio.js';
import {parseMidi} from './midifile.js';
import {abcjs, parseOnly} from './abcjs.js';
import {open, setStrings, EVENT_CANCEL, EVENT_PREVIEW, EVENT_SAVE} from 'local_sheetmusic/editor';
import {detect, importBytes} from 'local_sheetmusic/editor/importing';
import {setParser as setAbcParser} from 'local_sheetmusic/abc';
import {setParser as setMidiParser} from 'local_sheetmusic/midi';

setAbcParser(parseOnly);
setMidiParser(parseMidi);
assert.ok(abcjs, 'the vendored ABC parser is loaded');

// English, as the language pack holds it; the surface never invents text of its own.
setStrings(Object.fromEntries(
    Object.entries({
        editorapply: 'Use this import', editorcannotshow: 'This score cannot be shown yet: {$a}',
        editordiscard: 'Discard this import', editorexport: 'Export',
        editorexportfailed: 'That export could not be produced: {$a}',
        editorexportmidi: 'MIDI file (.mid)', editorexportpdf: 'PDF page, as a picture (.pdf)',
        editorexportpng: 'PNG image (.png)', editorexportsvg: 'SVG image (.svg)',
        editorgrid: 'Snap notes to', editorgridvalue: '1/{$a} notes', editorimport: 'Import a file',
        editorimportfailed: 'That file could not be imported: {$a}',
        editorimportmidi: 'This came from a MIDI file, which does not contain sheet music.',
        editorimportreading: 'Reading {$a}...', editorkey: 'Key', editormetre: 'Time signature',
        editornotes: 'Please check these before you continue', editorpreview: 'Preview',
        editorsource: 'ABC source', editorsourcehelp: 'Type ABC notation here.',
        editortranspose: 'Transpose by semitones',
    })
));

const fixture = (path) => fs.readFileSync(fileURLToPath(new URL(path, import.meta.url)));

const container = () => {
    const element = document.createElement('div');
    document.body.appendChild(element);
    return element;
};

/** Wait for the surface to finish one preview attempt. */
const drawn = (element) => new Promise((resolve) => {
    element.addEventListener(EVENT_PREVIEW, (event) => resolve(event.detail), {once: true});
});

const SIMPLE = 'X:1\nM:4/4\nK:G\n|GABc dedB|';

const run = async () => {
    // ---- file sniffing, which decides which importer runs ----
    assert.strictEqual(detect('anything', new TextEncoder().encode('MThd\0')), 'midi',
        'magic bytes beat the file name for MIDI');
    assert.strictEqual(detect('score.xml', new Uint8Array([0x50, 0x4B, 0x03, 0x04])), 'mxl',
        'a zip called .xml is still a .mxl');
    assert.strictEqual(detect('score.musicxml', new TextEncoder().encode('<?xml')), 'musicxml',
        'a MusicXML extension is honoured');
    assert.strictEqual(detect('tune.abc', new TextEncoder().encode('X:1')), 'abc', 'an ABC extension');
    assert.strictEqual(detect('', new TextEncoder().encode('X:1\nK:C\n|CDEF|')), 'abc',
        'with no name and no magic, text is treated as ABC');
    assert.strictEqual(detect('', new TextEncoder().encode('<score-partwise>')), 'musicxml',
        'with no name and no magic, markup is treated as MusicXML');

    // ---- the importers reached through the surface's own entry point ----
    const asAbc = await importBytes('tune.abc', new TextEncoder().encode(SIMPLE));
    assert.strictEqual(asAbc.source, SIMPLE, 'ABC is kept as the author wrote it, not round-tripped');

    const asXml = await importBytes('scale.musicxml', fixture('../fixtures/musicxml/scale.musicxml'));
    assert.ok(asXml.source.startsWith('X:1'), 'MusicXML arrives as ABC');
    assert.strictEqual(asXml.kind, 'musicxml', 'and is reported as such');

    const asMidi = await importBytes(
        'played.mid',
        fixture('../../../../dev-docs/music_education_suite/fixtures/midi/human-played.mid')
    );
    assert.strictEqual(asMidi.kind, 'midi', 'MIDI is reported as such, so the adjust panel can open');
    assert.ok(asMidi.warnings.length >= 3, 'and it arrives with its assumptions attached');

    // ---- the contract: a container in, a promise out ----
    await assert.rejects(() => open({}), /needs a container/, 'the container is required');

    const first = container();
    const session = open({source: SIMPLE, format: 'abc', container: first, debounce: 0});
    await drawn(first);

    const surface = first.querySelector('.sheetmusic-editor');
    assert.ok(surface, 'the editor rendered into the container it was given');
    assert.strictEqual(first.children.length, 1, 'and appended exactly one child');
    assert.strictEqual(surface.querySelector('textarea').value, SIMPLE, 'the source opened in the textarea');
    assert.ok(surface.querySelector('.sheetmusic-editor-preview svg'), 'and the preview engraved it');
    assert.ok(surface.querySelector('.sheetmusic-editor-alert').hidden, 'with nothing to complain about');
    assert.strictEqual(
        surface.querySelectorAll('.sheetmusic-editor-midi option').length,
        4,
        'the MIDI adjust panel offers every grid'
    );
    assert.ok(surface.querySelector('.sheetmusic-editor-midi').hidden, 'and stays out of the way until needed');
    assert.strictEqual(document.querySelectorAll('.modal').length, 0, 'the editor builds no modal of its own');

    // Editing re-engraves.
    const textarea = surface.querySelector('textarea');
    const engraved = surface.querySelector('.sheetmusic-editor-preview').innerHTML;
    textarea.value = 'X:1\nM:4/4\nK:D\n|defg abag|';
    textarea.dispatchEvent(new window.Event('input'));
    await drawn(first);
    assert.notStrictEqual(
        surface.querySelector('.sheetmusic-editor-preview').innerHTML,
        engraved,
        'typing changes what is engraved'
    );

    // A broken score must be reported in the surface and must not blank the preview.
    const good = surface.querySelector('.sheetmusic-editor-preview').innerHTML;
    textarea.value = 'this is not a tune at all';
    textarea.dispatchEvent(new window.Event('input'));
    const failure = await drawn(first);
    assert.ok(failure.error, 'the failure is reported through the preview event');
    const alert = surface.querySelector('.sheetmusic-editor-alert');
    assert.strictEqual(alert.hidden, false, 'and shown in the surface, not only in the console');
    assert.ok(alert.textContent.includes('cannot be shown'), 'in the language string, not a raw exception');
    assert.ok(
        !alert.textContent.includes('null function'),
        `the engine's WebAssembly abort never reaches the author; got ${JSON.stringify(alert.textContent)}`
    );
    assert.strictEqual(alert.getAttribute('role'), 'alert', 'in a region a screen reader will announce');
    assert.strictEqual(
        surface.querySelector('.sheetmusic-editor-preview').innerHTML,
        good,
        'and the last good engraving is still on screen'
    );

    // Saving a broken score is refused, and the refusal is visible to the caller.
    const vetoed = first.dispatchEvent(new window.CustomEvent(EVENT_SAVE, {cancelable: true}));
    assert.strictEqual(vetoed, false, 'the save event is vetoed while the score does not engrave');

    // Fixing it and saving again resolves.
    textarea.value = SIMPLE;
    textarea.dispatchEvent(new window.Event('input'));
    await drawn(first);
    first.dispatchEvent(new window.CustomEvent(EVENT_SAVE, {cancelable: true}));
    const saved = await session;
    assert.deepStrictEqual(saved, {source: SIMPLE, format: 'abc'}, 'save resolves with the source and its format');
    assert.strictEqual(first.children.length, 0, 'and the editor takes its DOM back out again');

    // Cancel resolves null.
    const second = container();
    const cancelled = open({source: SIMPLE, container: second, debounce: 0});
    await drawn(second);
    second.dispatchEvent(new window.CustomEvent(EVENT_CANCEL));
    assert.strictEqual(await cancelled, null, 'cancel resolves null');
    assert.strictEqual(second.children.length, 0, 'and cleans up too');

    // A cancel after a save is ignored rather than settling the promise twice.
    const third = container();
    const once = open({source: SIMPLE, container: third, debounce: 0});
    await drawn(third);
    third.dispatchEvent(new window.CustomEvent(EVENT_SAVE, {cancelable: true}));
    const result = await once;
    third.dispatchEvent(new window.CustomEvent(EVENT_CANCEL));
    assert.deepStrictEqual(result, {source: SIMPLE, format: 'abc'}, 'the first outcome is the one that stands');

    window.console.log('editor.spec: OK (contract, live preview, error surfacing, save veto, cancel)');
};

run();
