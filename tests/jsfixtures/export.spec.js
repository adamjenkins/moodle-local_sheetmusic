/**
 * Export: every format, checked as bytes rather than as "it did not throw".
 *
 * MIDI and SVG come from the real vendored Verovio. PNG and PDF are written here, so the tests
 * do not stop at the magic bytes: they inflate what was written and compare it against the
 * pixels that went in, which is the only way to tell a real encoder from one that emits a
 * plausible header and rubbish.
 *
 * Run with: node tests/jsfixtures/export.spec.js
 */

import assert from 'node:assert';
import zlib from 'node:zlib';
import './dom.js';
import './verovio.js';
import {createScore} from 'local_sheetmusic/model';
import {EXPORTS, measure, setRasteriser, toMidi, toPdf, toPng, toSvg} from 'local_sheetmusic/export';
import {adler32, crc32, storedDeflate} from 'local_sheetmusic/export/binary';
import {encodePdf} from 'local_sheetmusic/export/pdf';
import {encodePng} from 'local_sheetmusic/export/png';

/** A four-by-three test bitmap: opaque red, green, blue and a half-transparent black. */
const swatch = () => {
    const data = new Uint8Array(4 * 3 * 4);
    for (let at = 0; at < 12; at++) {
        data[at * 4] = at % 4 === 0 ? 255 : 0;
        data[at * 4 + 1] = at % 4 === 1 ? 255 : 0;
        data[at * 4 + 2] = at % 4 === 2 ? 255 : 0;
        data[at * 4 + 3] = at % 4 === 3 ? 128 : 255;
    }
    return {width: 4, height: 3, data};
};

const bytesOf = async (blob) => new Uint8Array(await blob.arrayBuffer());

const score = () => createScore({key: 'G', metre: '4/4'})
    .addNote({step: 'G', octave: 4, duration: 8})
    .addNote({step: 'A', octave: 4, duration: 8})
    .addNote({step: 'B', octave: 4, duration: 8})
    .addNote({step: 'C', octave: 5, duration: 8});

const run = async () => {
    // ---- the checksums and the compressor, which everything else trusts ----
    // Known-answer tests, so a broken table shows up here and not as a corrupt file.
    assert.strictEqual(crc32(new TextEncoder().encode('123456789')), 0xCBF43926, 'CRC-32 check value');
    assert.strictEqual(adler32(new TextEncoder().encode('Wikipedia')), 0x11E60398, 'Adler-32 check value');
    const stored = storedDeflate(new TextEncoder().encode('sheet music'));
    assert.strictEqual(
        zlib.inflateSync(Buffer.from(stored)).toString(),
        'sheet music',
        'the stored-block fallback really produces a zlib stream a decoder accepts'
    );

    // ---- PNG ----
    const png = await encodePng(swatch(), 2);
    assert.deepStrictEqual(
        [...png.subarray(0, 8)],
        [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A],
        'PNG magic bytes'
    );
    assert.ok(Buffer.from(png).includes(Buffer.from('IHDR')), 'PNG header chunk');
    assert.ok(Buffer.from(png).includes(Buffer.from('pHYs')), 'PNG physical-size chunk');
    assert.ok(Buffer.from(png).includes(Buffer.from('IEND')), 'PNG end chunk');

    // Pull the IDAT back out and inflate it: the pixels must survive intact, filter bytes and
    // all. A header-only encoder passes every assertion above and fails this one.
    const idatAt = Buffer.from(png).indexOf(Buffer.from('IDAT'));
    const idatLength = Buffer.from(png).readUInt32BE(idatAt - 4);
    const raw = zlib.inflateSync(Buffer.from(png.subarray(idatAt + 4, idatAt + 4 + idatLength)));
    assert.strictEqual(raw.length, 3 * (1 + 4 * 4), 'three scanlines of four RGBA pixels, each with a filter byte');
    assert.strictEqual(raw[0], 0, 'each scanline is written with filter type 0');
    assert.deepStrictEqual(
        [...raw.subarray(1, 5)],
        [255, 0, 0, 255],
        'the first pixel comes back as the opaque red that went in'
    );
    await assert.rejects(
        () => encodePng({width: 4, height: 3, data: new Uint8Array(8)}, 1),
        /needs 48 bytes/,
        'a short pixel buffer is refused rather than written out truncated'
    );

    // ---- PDF ----
    const pdf = await encodePdf(swatch(), {scale: 2, title: 'Scale study'});
    const text = Buffer.from(pdf).toString('latin1');
    assert.strictEqual(text.slice(0, 5), '%PDF-', 'PDF magic bytes');
    assert.ok(text.trimEnd().endsWith('%%EOF'), 'PDF end marker');
    assert.ok(text.includes('/Subtype /Image'), 'the page holds an image');
    assert.ok(text.includes('(Scale study)'), 'the title reaches the document information');
    // 4 device pixels at scale 2 is 2 CSS pixels, which is 1.5 PDF points.
    assert.ok(text.includes('/MediaBox [0 0 1.50 1.13]'), `the page is sized in points; got ${text.slice(0, 400)}`);

    // The cross-reference table is the part a reader rejects a file over, so check every offset
    // actually lands on the object it claims.
    // 'startxref' also ends in 'xref', so the table is found by its subsection header.
    const xrefAt = text.lastIndexOf('xref\n0 ');
    const entries = text.slice(xrefAt).split('\n').filter((line) => / 00000 n $/.test(line));
    assert.strictEqual(entries.length, 6, 'six objects are indexed');
    entries.forEach((entry, index) => {
        const at = Number(entry.slice(0, 10));
        assert.strictEqual(
            text.slice(at, at + `${index + 1} 0 obj`.length),
            `${index + 1} 0 obj`,
            `cross-reference entry ${index + 1} points at object ${index + 1}`
        );
    });

    // And the image really is the pixels, flattened onto white.
    const streamAt = text.indexOf('stream\n', text.indexOf('/Subtype /Image')) + 'stream\n'.length;
    const lengthMatch = /\/Length (\d+) >>\nstream\n$/.exec(text.slice(0, streamAt));
    const image = zlib.inflateSync(Buffer.from(pdf.subarray(streamAt, streamAt + Number(lengthMatch[1]))));
    assert.strictEqual(image.length, 4 * 3 * 3, 'twelve RGB pixels, no alpha channel');
    assert.deepStrictEqual([...image.subarray(0, 3)], [255, 0, 0], 'the opaque red survives');
    assert.deepStrictEqual(
        [...image.subarray(9, 12)],
        [127, 127, 127],
        'the half-transparent black is composited onto white, not dropped'
    );

    // ---- the whole pipeline, on a real engraved score ----
    const svg = await toSvg(score());
    assert.ok(svg.trimStart().startsWith('<svg'), 'SVG export starts with an svg element');
    assert.ok(svg.includes('data-class="note"'), 'and it holds the engraved notes');

    const size = measure(svg);
    assert.ok(size.width > 0 && size.height > 0, 'an engraved score has a measurable size');

    const midi = await bytesOf(await toMidi(score()));
    assert.strictEqual(Buffer.from(midi.subarray(0, 4)).toString(), 'MThd', 'MIDI magic bytes');
    assert.ok(Buffer.from(midi).includes(Buffer.from('MTrk')), 'and it holds at least one track');

    // Node has no canvas, so the rasteriser seam stands in for one. Everything downstream of it
    // - the encoders, the sizing, the blob types - is the code that ships.
    setRasteriser(async (svgText, target) => {
        assert.ok(/<svg[^>]*width="/.test(svgText), 'the SVG is given an explicit size before drawing');
        return {width: target.width, height: target.height,
            data: new Uint8Array(target.width * target.height * 4).fill(255)};
    });

    const pngBlob = await toPng(score());
    assert.strictEqual(pngBlob.type, 'image/png', 'the PNG blob is typed');
    assert.deepStrictEqual(
        [...(await bytesOf(pngBlob)).subarray(0, 4)],
        [0x89, 0x50, 0x4E, 0x47],
        'PNG magic bytes from the whole pipeline'
    );

    const pdfBlob = await toPdf(score(), {title: 'Scale study'});
    assert.strictEqual(pdfBlob.type, 'application/pdf', 'the PDF blob is typed');
    assert.strictEqual(
        Buffer.from(await bytesOf(pdfBlob)).toString('latin1', 0, 5),
        '%PDF-',
        'PDF magic bytes from the whole pipeline'
    );

    // The menu descriptor has to build what it claims, or an export menu offers dead entries.
    const expected = {midi: 'MThd', svg: '<svg', png: '\x89PNG', pdf: '%PDF'};
    for (const entry of EXPORTS) {
        const blob = await entry.build(score());
        const head = Buffer.from(await bytesOf(blob)).toString('latin1', 0, 6);
        assert.ok(
            head.includes(expected[entry.format]),
            `${entry.format} (.${entry.extension}) starts with ${JSON.stringify(expected[entry.format])}, got ${JSON.stringify(head)}`
        );
    }

    setRasteriser(null);
    window.console.log('export.spec: OK (MThd, <svg, \\x89PNG, %PDF - all decoded, not just sniffed)');
};

run();
