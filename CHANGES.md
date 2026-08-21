# Changelog

All notable changes to `local_sheetmusic` are documented here.

## [Unreleased]

- Initial development. Nothing released yet.
- Added the document model (`local_sheetmusic/model`) and the ABC serialiser
  (`local_sheetmusic/abc`), with abcjs 6.7.0 vendored under `thirdparty/abcjs/` as the ABC
  parser. `toAbc()` emits the canonical stored form: no leading newline, LF endings, and
  minimal escaping via `escapeSource()` (RELATIONS.md section A2 rules 5–7).
