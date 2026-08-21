# midi-file (vendored)

- **Upstream:** https://github.com/carter-thaxton/midi-file
- **Version:** 1.2.4
- **Licence:** MIT (`LICENSE.md`), (c) 2016 Carter Thaxton
- **Obtained with:** `npm pack midi-file@1.2.4`.
  `sha256(midi-file-1.2.4.tgz)` =
  `a8980f145105c566a03577702a692e2a5db317237804f048d88734c97a21b984`
- **Upstream file hashes** (as extracted from that tarball, before wrapping):
  `sha256(lib/midi-parser.js)` = `2dcbf8aa98cda9b822a241d7e9aed7251ac19afa96568a200ae1f93d8ae1511f`,
  `sha256(lib/midi-writer.js)` = `9d10a69ec6ff6cbd8a3db3a5bfdb7249e4beb4a620a36a5c79be334bcb0c0e02`

| File | Bytes | Purpose |
|---|---:|---|
| `midi-file.js` | 20351 | UMD bundle of the whole library; only `parseMidi()` is used |
| `LICENSE.md` | 1,112 | The MIT text, as shipped upstream |

`sha256(midi-file.js)` = `b604e968a9c78edaa0a17cb4fc0bab21628571ef95290ae19fc73e8f4c1f198e`

## Why this file is generated rather than copied

Unlike abcjs and Verovio, midi-file publishes **no browser build at all**: the package is
three CommonJS files (`index.js` requiring `lib/midi-parser.js` and `lib/midi-writer.js`).
A top-level `require()` cannot run in the browser, and RequireJS's simplified-CommonJS
wrapper only applies inside a `define()`, so the upstream files cannot be shipped as-is.

`midi-file.js` is therefore the two upstream library files **byte-for-byte**, each inside a
function that hands it the `module`/`exports` pair it expects, all inside a UMD shell that
registers an anonymous `define()` for RequireJS. Nothing upstream is edited; the delimiters
`BEGIN upstream lib/...` / `END upstream lib/...` mark exactly which lines are theirs.

## Regenerating it

```sh
npm pack midi-file@1.2.4 && tar xzf midi-file-1.2.4.tgz
# head.js / mid.js / tail.js are the three fragments delimited in midi-file.js:
#   head.js = everything up to and including the BEGIN midi-parser marker
#   mid.js  = the END midi-parser marker through the BEGIN midi-writer marker
#   tail.js = the END midi-writer marker to the end of the file
cat head.js package/lib/midi-parser.js mid.js package/lib/midi-writer.js tail.js > midi-file.js
cp package/LICENSE.md .
```

## How it is loaded

`amd/src/midi.js` asks RequireJS for it by absolute URL, exactly as `amd/src/abc.js` does for
abcjs: RequireJS treats a module id ending in `.js` as a plain URL and skips its
baseUrl/paths mapping, which is the only way to reach a file outside `amd/build/`. The node
unit tests load the same bytes off disk through a CommonJS shim
(`tests/jsfixtures/midifile.js`), so the tests exercise the file that ships.

**Vendor `.js` only, never `.mjs`** — this server has no `.mjs` MIME mapping and serves such
a file as `application/octet-stream`, which browsers refuse to execute.

## Only the parser is used

`writeMidi()` ships because it is half of the library and dropping it would mean shipping a
modified upstream file. Nothing in the suite calls it: MIDI **export** comes from Verovio's
`renderToMIDI()` (`amd/src/export.js`), which engraves the score first and therefore knows
about ties, key signatures and metre in a way a raw writer would not.
