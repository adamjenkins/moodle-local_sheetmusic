# Changelog

All notable changes to `local_sheetmusic` are documented here.

## [Unreleased]

- Initial development. Nothing released yet.
- Added the document model (`local_sheetmusic/model`) and the ABC serialiser
  (`local_sheetmusic/abc`), with abcjs 6.7.0 vendored under `thirdparty/abcjs/` as the ABC
  parser. `toAbc()` emits the canonical stored form: no leading newline, LF endings, and
  minimal escaping via `escapeSource()` (RELATIONS.md section A2 rules 5–7).
- Added the editing surface (`local_sheetmusic/editor`), the engine's second public module.
  `open({source, format, container})` renders into a container the caller supplies and settles
  when the caller dispatches `local_sheetmusic/editor:save` (cancelable — a vetoed dispatch
  means the score does not engrave and the modal must stay open) or
  `local_sheetmusic/editor:cancel`. It owns no Moodle chrome. v1 offers an ABC source pane, a
  debounced live preview, file import and file export; point-and-click note entry is Phase 3.
- Added MusicXML import (`local_sheetmusic/musicxml`), for plain `.musicxml` and compressed
  `.mxl` alike, by way of Verovio's own reader and its MEI output rather than an XML parser of
  our own.
- Added MIDI import (`local_sheetmusic/midi`), with midi-file 1.2.4 vendored under
  `thirdparty/midi-file/`. The quantiser snaps **onsets only** and derives each duration from
  the gap to the next onset; `fromMidi()` returns a `warnings` array naming every assumption
  (defaulted metre, defaulted tempo, guessed key, merged simultaneous notes) and the import
  surface shows all of them.
- Added export (`local_sheetmusic/export`): MIDI and SVG from Verovio, PNG and a one-page PDF
  written by the plugin itself rather than by a vendored SVG-to-PDF stack. The PDF holds a
  picture of the score rather than vector notation — `amd/src/export/pdf.js` records the trade.
- `local_sheetmusic/engraver` now folds Verovio's WebAssembly aborts on unreadable input into
  one message of ours, and can emit MEI (`toMei()`) and read compressed MusicXML.
