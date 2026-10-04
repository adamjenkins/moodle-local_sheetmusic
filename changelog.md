# Changelog

All notable changes to `local_sheetmusic` are documented here.
This project adheres to [Semantic Versioning](https://semver.org/).

## [0.2.1] - 2026-10-04

### Added

- `composer.json` (package `adamjenkins/moodle-local_sheetmusic`, type `moodle-local`), requiring
  `moodle/moodle` `>=4.5 <5.4` to match `$plugin->supported`.

### Changed

- Declare Moodle 5.3 support: `$plugin->supported = [405, 503]`.

### Fixed

- A rendered score keeps a white background under Boost's dark colour mode (Moodle 5.3), where
  the black notation was otherwise drawn on a dark page.
- The staff editor's keyboard focus ring uses Boost's dark-mode focus colour under the dark
  colour mode (Moodle 5.3), where Moodle blue only just met the 3:1 contrast minimum on the dark modal surface.

## [0.2.0] - 2026-09-07

### Added

- Playback (`local_sheetmusic/playback`): play and stop, a cursor marking the note being heard,
  and a speed control from 25% to 200% of the score's own tempo, on the filter's scores and in
  the editor's preview alike.
- Sound is synthesised in the browser with Web Audio — no samples, no soundfont, no download and
  no server, so the plugin ships no audio files and works offline.
- `engraver.renderWithAudio()`, returning the SVG, the MIDI and the timemap from a single load,
  so the note highlighted and the note heard cannot describe different scores.
- Site setting `local_sheetmusic/playback` (default on) to turn playback off site-wide, and
  `\local_sheetmusic\local\display` to carry the display settings to the client.

### Changed

- Nothing is prepared for playback until the reader presses play, so a page of scores costs no
  more to open than before. Only one score plays at a time, and playback never starts on its own.
- Where a browser has no Web Audio, no transport is offered rather than one that does nothing.

### Fixed

- MIDI export could carry the wrong key signature. Verovio's ABC importer keeps the last
  non-empty key signature it read in state shared across an engine instance, so a score whose key
  signature is empty — C major, A minor, any dorian — was exported and played in the previous
  score's key. Everything producing MIDI now runs on a private, single-use engine.
- `local_sheetmusic/defaultscale` now takes effect; it was previously read by nothing.

## [0.1.0] - 2026-08-22

### Added

- Initial release: the shared engine behind the sheetmusic suite. No user interface of its own —
  `filter_sheetmusic` and `tiny_sheetmusic` are its consumers, and it exists so that both render
  notation identically.
- Document model and undo stack (`local_sheetmusic/model`), and the ABC serialiser
  (`local_sheetmusic/abc`) with abcjs 6.7.0 vendored as the parser. `toAbc()` emits the canonical
  stored form: no leading newline, LF endings, minimal escaping.
- Engraving (`local_sheetmusic/engraver`) by a bundled Verovio 6.3.0 compiled to WebAssembly,
  loaded on the first score a reader reaches rather than at page load. Verovio's WebAssembly
  aborts on unreadable input are folded into one message of ours.
- The editing surface (`local_sheetmusic/editor`): two tabs over one document — point-and-click
  and keyboard note entry (the default), and an ABC source pane with a debounced live preview.
  It owns no Moodle chrome; the modal belongs to the caller.
  - Hit-testing reads the staff geometry out of the rendered SVG rather than assuming it, because
    Verovio moves the staff down the page as soon as a note needs ledger lines.
  - Keyboard entry is the whole editor, not a shortcut for part of it: letters place notes,
    digits set lengths, `.` dots, `^ _ =` alter, arrows nudge pitch and move the selection, and
    Ctrl+Z / Ctrl+Shift+Z drive the undo stack. Every change is announced in a live region and
    the score is published as a hidden list, because the engraved SVG is `aria-hidden`.
  - Editing re-flows the bars for the metre in force as one undoable step, so an insertion in the
    middle of a score cannot leave a bar a beat too long.
- MusicXML import (`local_sheetmusic/musicxml`) for plain `.musicxml` and compressed `.mxl`, via
  Verovio's own reader and its MEI output rather than an XML parser of our own.
- MIDI import (`local_sheetmusic/midi`), with midi-file 1.2.4 vendored. MIDI carries no notation,
  so the quantiser snaps onsets only and derives each duration from the gap to the next onset;
  `fromMidi()` returns the assumptions it had to make and the import step shows all of them.
- Export (`local_sheetmusic/export`): MIDI and SVG from Verovio, plus PNG and a one-page PDF
  written by the plugin itself rather than by a vendored SVG-to-PDF stack.
- Accessible rendering: an engraved score is a labelled image describing key, metre and length,
  with the source kept in the accessibility tree rather than removed from the page.
