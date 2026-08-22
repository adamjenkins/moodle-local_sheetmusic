/**
 * MusicXML import: the real Verovio reader, the real MEI mapping, both file shapes.
 *
 * Run with: node tests/jsfixtures/musicxml.spec.js
 *
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

import assert from 'node:assert';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import './dom.js';
import './verovio.js';
import {fromMei, fromMusicXml, importMusicXml} from 'local_sheetmusic/musicxml';
import {MAX_IMPORT_BYTES} from 'local_sheetmusic/limits';
import {fifthsOf, keyAlteration, keyName} from 'local_sheetmusic/keys';
import {toAbc} from 'local_sheetmusic/abc';
import {finishes} from './spec.js';

const fixture = (name) => fileURLToPath(new URL(`../fixtures/musicxml/${name}`, import.meta.url));

const done = finishes('musicxml');

const run = async () => {
    // The pure mappings first: they are what every wrong key signature would come from.
    assert.strictEqual(fifthsOf('3f'), -3, 'three flats');
    assert.strictEqual(fifthsOf('2s'), 2, 'two sharps');
    assert.strictEqual(fifthsOf('0'), 0, 'no accidentals');
    assert.strictEqual(keyName(-3, 'major').key, 'Eb', 'three flats major is E flat');
    assert.strictEqual(keyName(1, 'minor').key, 'Em', 'one sharp minor is E minor');
    assert.strictEqual(keyName(0, 'dorian').key, 'Ddor', 'no accidentals dorian is D dorian');
    assert.strictEqual(keyName(2, 'mixolydian').key, 'Amix', 'two sharps mixolydian is A mixolydian');
    assert.strictEqual(keyAlteration('F', 1), 1, 'one sharp sharpens F');
    assert.strictEqual(keyAlteration('C', 1), 0, 'one sharp leaves C alone');
    assert.strictEqual(keyAlteration('E', -3), -1, 'three flats flatten E');

    // Plain MusicXML.
    const text = fs.readFileSync(fixture('scale.musicxml'), 'utf8');
    const {score, warnings} = await importMusicXml(text);
    assert.strictEqual(score.key, 'G', 'the key signature came through');
    assert.strictEqual(score.metre, '4/4', 'the time signature came through');
    assert.strictEqual(score.clef, 'treble', 'the clef came through');
    assert.strictEqual(score.bars.length, 3, 'three bars');
    assert.deepStrictEqual(warnings, [], 'a clean single-staff file warns about nothing');

    const first = score.bars[0].events;
    assert.strictEqual(first.length, 8, 'eight notes in the first bar');
    assert.deepStrictEqual(
        first.map((e) => `${e.step}${e.octave}/${e.duration}`),
        ['G4/8', 'A4/8', 'B4/8', 'C5/8', 'D5/8', 'E5/8', 'D5/8', 'B4/8'],
        'pitches and note values'
    );
    assert.ok(first.every((e) => e.alter === null), 'nothing in the key signature is respelled');

    const second = score.bars[1].events;
    assert.strictEqual(second[0].alter, 1, 'the written sharp survives');
    assert.strictEqual(second[0].dots, 1, 'the dot survives');
    assert.strictEqual(second[1].alter, 0, 'the written natural survives as a natural, not as null');
    assert.strictEqual(second[2].tie, true, 'the tie is recorded on the note that starts it');
    assert.strictEqual(score.bars[2].events[1].kind, 'rest', 'the rest survives');

    // The import is only useful if it round-trips into the format we store.
    assert.strictEqual(
        toAbc(score),
        'X:1\nM:4/4\nL:1/8\nK:G\n|GABcdedB|^f3=fG4-|G4z4|',
        'the imported score serialises to the ABC that is actually stored'
    );

    // Compressed MusicXML: same tune, same result, different container.
    const zipped = fs.readFileSync(fixture('scale.mxl'));
    assert.deepStrictEqual(
        [zipped[0], zipped[1], zipped[2], zipped[3]],
        [0x50, 0x4B, 0x03, 0x04],
        'the .mxl fixture really is a ZIP'
    );
    const fromZip = await fromMusicXml(zipped.buffer.slice(
        zipped.byteOffset,
        zipped.byteOffset + zipped.byteLength
    ));
    assert.deepStrictEqual(
        fromZip.toJSON(),
        score.toJSON(),
        'a .mxl imports to exactly the same score as the .musicxml inside it'
    );

    // Multi-staff files must say what they dropped rather than dropping it quietly.
    const grand = text
        .replace('<score-part id="P1"><part-name>Melody</part-name></score-part>',
            '<score-part id="P1"><part-name>Melody</part-name></score-part>'
            + '<score-part id="P2"><part-name>Bass</part-name></score-part>')
        .replace('</part>\n</score-partwise>',
            '</part>\n  <part id="P2"><measure number="1"><attributes><divisions>2</divisions>'
            + '<key><fifths>1</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time>'
            + '<clef><sign>F</sign><line>4</line></clef></attributes>'
            + '<note><pitch><step>G</step><octave>2</octave></pitch><duration>8</duration>'
            + '<type>whole</type></note></measure></part>\n</score-partwise>');
    const two = await importMusicXml(grand);
    assert.ok(
        two.warnings.some((w) => w.includes('only the first was imported')),
        `a two-staff file warns; got ${JSON.stringify(two.warnings)}`
    );

    // Notation the model cannot hold is refused, not approximated.
    const chorded = text.replace(
        '<note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><type>eighth</type></note>',
        '<note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><type>eighth</type></note>'
        + '<note><chord/><pitch><step>C</step><octave>5</octave></pitch><duration>1</duration>'
        + '<type>eighth</type></note>'
    );
    await assert.rejects(
        () => importMusicXml(chorded),
        /chord/,
        'a chord is refused by name rather than silently flattened'
    );

    await assert.rejects(
        () => importMusicXml('<nonsense/>'),
        /local_sheetmusic: /,
        'rubbish input fails loudly with a message of ours'
    );

    // fromMei is the seam the whole importer rests on, so it is exercised directly too.
    const bare = await fromMei(
        '<mei xmlns="http://www.music-encoding.org/ns/mei"><music><body><mdiv><score>'
        + '<scoreDef><staffGrp><staffDef n="1"><clef shape="F" line="4"/>'
        + '<keySig sig="1s" mode="minor"/><meterSig count="6" unit="8"/></staffDef></staffGrp></scoreDef>'
        + '<section><measure n="1"><staff n="1"><layer n="1">'
        + '<note xml:id="n1" dur="4" oct="3" pname="e"/><rest dur="8"/>'
        + '</layer></staff></measure></section></score></mdiv></body></music></mei>'
    );
    assert.strictEqual(bare.score.key, 'Em', 'MEI keySig sig+mode read');
    assert.strictEqual(bare.score.metre, '6/8', 'MEI meterSig read');
    assert.strictEqual(bare.score.clef, 'bass', 'MEI clef read');
    // A .mxl is a ZIP whose decompressed size and entry count are unknowable from here, and it is
    // base64-encoded before the engine sees it, so the archive itself is what gets bounded.
    const oversized = new Uint8Array(MAX_IMPORT_BYTES + 1024);
    oversized.set([0x50, 0x4b, 0x03, 0x04]);
    await assert.rejects(
        () => importMusicXml(oversized),
        (error) => /past the \d+MB this importer will read/.test(error.message),
        'an archive past the size bound is refused before it is decompressed'
    );

    await assert.rejects(
        () => importMusicXml('<score-partwise>' + 'x'.repeat(MAX_IMPORT_BYTES)),
        (error) => /past the \d+MB this importer will read/.test(error.message),
        'plain MusicXML past the size bound is refused too'
    );


    done('plain XML, .mxl, warnings, refusals, MEI seam');
};

run();
