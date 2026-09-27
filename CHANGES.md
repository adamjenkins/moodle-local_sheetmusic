# Changelog

All notable changes to `local_sheetmusic` are documented here.
The full history is in [`changelog.md`](changelog.md).

## [Unreleased]

### Changed

- **Declare Moodle 5.3 support.** `version.php` now states the supported range as Moodle 4.5 to
  5.3 (`$plugin->supported = [405, 503]`).

### Fixed

- **Scores stay readable in Boost's dark colour mode (Moodle 5.3).** The engine engraves in
  black, so on a dark page a rendered score was black notation on a dark background. A rendered
  score now keeps a white paper background in dark mode; nothing changes in light mode or on
  earlier Moodle versions.
- **The staff editor's focus ring is clearer in dark colour mode (Moodle 5.3).** The ring is
  drawn on the modal around the score, where Moodle blue only just met the 3:1 contrast minimum; in
  dark mode it now uses Boost's own dark-mode focus colour. Light mode is unchanged.

## [0.2.0] - 2026-09-07

Scores can be played.

### Added

- **Playback.** Every rendered score gains a transport: play and stop, a cursor marking the note
  being heard, and a speed control from 25% to 200% of the score's own tempo. The filter's scores
  and the editor's preview both get it.
- **The sound is synthesised in the browser with Web Audio.** No samples, no soundfont, nothing
  downloaded and nothing sent to a server, so the plugin still ships no audio files and still
  works offline. It is a clean synthesised tone, not a recorded instrument — enough to hear an
  exercise, check an interval or follow a line.
- Nothing is prepared until the reader presses play, so a page of worked examples costs no more
  to open than before. One score plays at a time, playback never starts on its own, and a browser
  without Web Audio is offered no control rather than one that does nothing.
- The transport is ordinary buttons in the page's own tab order, with state announced through a
  live region. The sounding note is marked by colour **and** weight, so it does not rely on
  colour alone, and it is honoured in forced-colours mode.
- New site setting `local_sheetmusic/playback` (on by default) turns playback off site-wide.
- New `engraver.renderWithAudio()`, returning the SVG, the MIDI and the timemap from one load,
  and a new public AMD module `local_sheetmusic/playback`.

### Fixed

- **MIDI export could carry the wrong key signature.** Verovio's ABC importer keeps the last
  non-empty key signature it read in state that outlives `loadData()` and is shared by every
  toolkit on one engine instance, so a score whose key signature is empty — C major, A minor, any
  dorian — was exported and played in the *previous* score's key. Everything that produces MIDI
  now runs on a private, single-use engine, which is the only measure found to clear it.
- `local_sheetmusic/defaultscale` now takes effect. It was declared in `settings.php` and read by
  nothing, so the staff-size setting had never done anything.

## [0.1.0] - 2026-08-22

Initial release: the shared engine — document model, ABC and MusicXML serialisers, MIDI
quantiser, bundled Verovio engraver, editing surface, and MIDI/SVG/PNG/PDF export.
