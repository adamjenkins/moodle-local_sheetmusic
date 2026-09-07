# Changelog

All notable changes to `local_sheetmusic` are documented here.

## [Unreleased]

- Initial development. Nothing released yet.
- Added playback (`local_sheetmusic/playback`). Any rendered score gains a transport: play and
  stop, a cursor marking the note being heard, and a speed control from 25% to 200% of the
  score's own tempo. The sound is synthesised with Web Audio — no samples, no soundfont, no
  download, no server — so the plugin gains no assets and works offline. Nothing is built until
  the reader presses play: a page of examples engraves as it is scrolled and stops there. One
  score plays at a time per page, playback never starts on its own, and where the browser has no
  Web Audio no control is offered rather than a dead button. The editor's preview gets the same
  transport, and closing the dialogue or editing the score silences it.
- Added `engraver.renderWithAudio()`, which returns the SVG, the MIDI and the timemap from one
  load. Playback takes what sounds from the MIDI and what is highlighted from the timemap: the
  SVG does not carry sounding accidentals, and a tie is two noteheads but one sound.
- **Fixed: MIDI export could carry the wrong key signature.** Verovio's ABC importer keeps the
  last non-empty key signature it read in state shared across an engine instance, so a score
  whose key signature is empty — C major, A minor, any dorian — was exported and played in the
  previous score's key. Everything that produces MIDI now runs on a private, single-use engine,
  which is the only thing measured to clear it (dev-docs `P4-FINDINGS.md` section 2).
- Added the `local_sheetmusic/playback` site setting (on by default) to turn playback off, and
  `\local_sheetmusic\local\display` to carry it and the staff size to the client on the
  placeholder. **`local_sheetmusic/defaultscale` now actually does something** — it was
  previously declared in `settings.php` and read by nothing.
- Added the document model (`local_sheetmusic/model`) and the ABC serialiser
  (`local_sheetmusic/abc`), with abcjs 6.7.0 vendored under `thirdparty/abcjs/` as the ABC
  parser. `toAbc()` emits the canonical stored form: no leading newline, LF endings, and
  minimal escaping via `escapeSource()` (RELATIONS.md section A2 rules 5–7).
- Added the editing surface (`local_sheetmusic/editor`), the engine's second public module.
  `open({source, format, container})` renders into a container the caller supplies and settles
  when the caller dispatches `local_sheetmusic/editor:save` (cancelable — a vetoed dispatch
  means the score does not engrave and the modal must stay open) or
  `local_sheetmusic/editor:cancel`. It owns no Moodle chrome. It offers file import and file
  export, and two tabs over one document: note entry and an ABC source pane with a debounced
  live preview.
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
- Added point-and-click and keyboard note entry, which is now the editing surface's **default**
  tab. Clicking the staff places a note at the pitch clicked; clicking a note selects it, with
  the selection and the insertion point drawn on the engraving. The toolbar offers note lengths
  from semibreve to semiquaver, dots, accidentals, rests, ties, delete, undo and redo, plus key
  signature, time signature and clef. Every gesture goes through the document model and is
  re-serialised by `toAbc()`, so the two tabs never disagree.
  - Hit-testing (`editor/surface-notes.js`) reads the staff geometry out of the rendered SVG
    rather than assuming it: Verovio moves the staff down the page as soon as a note needs
    ledger lines, so a fixed staff position would mis-read every pitch in a score with a high
    note in it.
  - Keyboard entry is the whole editor, not a shortcut for part of it: `a`–`g` place a note,
    `1`–`7` set its length, `.` dots it, `^ _ =` add a sharp, flat or natural, `r` places a
    rest, `t` ties, the arrows nudge the pitch (with Ctrl, the octave) and move the selection,
    Backspace deletes, and Ctrl+Z / Ctrl+Shift+Z drive the model's undo stack. Every change is
    announced in an `aria-live` region and the score is published as a hidden list, because the
    engraved SVG is `aria-hidden` and unreadable to a screen reader. The button bar is a single
    tab stop with arrow-key navigation, so reaching the staff by Tab does not mean passing
    fourteen buttons first.
  - Editing re-flows the bars for the metre in force, as one undoable step, so inserting or
    deleting in the middle of a score cannot leave a bar a beat too long.
