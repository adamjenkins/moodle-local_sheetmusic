# abcjs (vendored)

- **Upstream:** https://github.com/paulrosen/abcjs — https://abcjs.net/
- **Version:** 6.7.0 (`abcjs.signature` reports `abcjs-basic v6.7.0`)
- **Licence:** MIT (`LICENSE.md`), © 2009–2026 Paul Rosen and Gregory Dyke
- **Obtained with:** `npm pack abcjs@6.7.0`, then the two files below copied out of the
  tarball unmodified. `sha256(dist/abcjs-basic-min.js)` =
  `b0cde4bc52bb33949181683a245005fff8a024a8c1f07ec6ce3222cd4bd72e51`, in the tarball and
  in this directory alike.

| File | Bytes | Purpose |
|---|---:|---|
| `abcjs-basic-min.js` | 511,903 | The whole library; only `parseOnly()` is used |
| `LICENSE.md` | 1,135 | The MIT text, as shipped upstream |

## Why this file and not a smaller one

The suite only needs abcjs's **parser**: ABC is read back into the document model for the
source tab and for pasted tunes, while every *rendered* note on the page comes from Verovio.
A parse-only bundle built with esbuild is 187 KB raw against this file's 512 KB — but esbuild
cannot emit AMD, so shipping it would mean hand-wrapping a self-generated blob in an AMD shim
and vendoring a file that exists nowhere upstream. The upstream build is UMD, already carries
`define.amd`, and is byte-checkable against npm, so that is what is here. Over the wire it is
148 KB gzipped, and it is lazy-loaded: nothing fetches it until a source tab opens.

## How it is loaded

`amd/src/abc.js` asks RequireJS for it by absolute URL. RequireJS treats a module id ending
in `.js` as a plain URL and skips its baseUrl/paths mapping, which is the only way to reach a
file outside `amd/build/`. It has to go through RequireJS rather than a `<script>` tag,
because abcjs registers an *anonymous* `define()` and an anonymous define that RequireJS did
not ask for is a mismatched-define error.

The node unit tests load the same bytes off disk through a CommonJS shim
(`tests/jsfixtures/abcjs.js`), so the tests exercise the file that ships rather than a
separate copy from npm.

**Vendor `.js` only, never `.mjs`.** nginx's default `mime.types` has no `.mjs` entry and
serves unknown extensions as `application/octet-stream`, which browsers refuse to execute.
This bit us once already — see `thirdparty/verovio/README.md`.

**Do not minify or reformat.** `.gitattributes` marks the file binary so diffs stay readable
and Moodle's grunt does not process it.
