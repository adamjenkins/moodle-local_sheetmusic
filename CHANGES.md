# Changelog

All notable changes to `local_sheetmusic` are documented here.
The full history is in [`changelog.md`](changelog.md).

## [0.3.0] - 2026-10-24

### Added

- **Each score can choose its own staff size and play button.** In the text editor
  (`tiny_sheetmusic` 0.2.0), an author can give a score a staff size (small, medium or large) and
  show or hide its play button. The site settings are now the defaults for scores that make no
  choice. Requested in tiny_sheetmusic issues #1 and #2.
- **New setting: "Let authors override the default"** (on by default). Turn it off to make the
  play-button default apply to every score on the site, for example to keep playback off
  everywhere. Anyone who can use the text editor can set a score's choice, students included.

### Changed

- **Scores are drawn at a fixed size.** A score used to be stretched to the width of the page, so
  a short exercise had huge notes and a long piece small ones, and the staff-size setting barely
  showed. Now every score is drawn at its staff size whatever its length, in units that follow
  the page's text size, and a score too wide for the page breaks onto more lines. **Scores will
  look a different size after upgrading**: short exercises get smaller, and the staff-size
  setting now has a visible effect. The editor preview shows the size readers will see.
- The "Allow scores to be played" setting is now called "Show a play button by default". Its
  stored value is unchanged.

### Format

- The stored-content format gains three optional class tokens: `sheetmusic-scale-s`, `-m` and `-l`,
  `sheetmusic-play` and `sheetmusic-noplay`. Scores without them render exactly as before. No
  content migration.
- `filter_sheetmusic` 0.3.0 and `tiny_sheetmusic` 0.2.0 require this version; upgrade all three
  together.

No database changes. After upgrading, check the staff size setting under *Site administration >
Plugins > Local plugins > Sheet music*.
