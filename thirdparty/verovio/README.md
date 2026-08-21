# Verovio (vendored)

- **Upstream:** https://github.com/rism-digital/verovio — https://www.verovio.org/
- **Version:** 6.3.0 (`tk.getVersion()` reports `6.3.0-425dd7b`)
- **Licence:** LGPL-3.0-or-later (`COPYING.LESSER`)
- **Obtained with:** `npm pack verovio@6.3.0`

Only two files from the upstream `dist/` are vendored, because they are the only ones the
suite loads:

| File | Bytes | Purpose |
|---|---|---|
| `verovio-module.mjs` | 7,296,807 | The WASM engraving engine |
| `verovio.mjs` | 14,478 | The toolkit wrapper |

**Do not minify or reformat these files.** They are build artifacts; `.gitattributes` marks
them binary so diffs stay readable and so Moodle's grunt does not process them.
