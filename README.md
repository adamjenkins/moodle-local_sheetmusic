# local_sheetmusic

The shared engine behind the **sheetmusic** Moodle plugin suite: a document model, ABC and
MusicXML serialisers, a MIDI importer, and a bundled [Verovio](https://www.verovio.org/)
engraver, all running client-side.

This plugin provides no user interface of its own. It exists so that its two consumers render
notation identically:

| Plugin | Role |
|---|---|
| `filter_sheetmusic` | Displays scores wherever Moodle renders text |
| `tiny_sheetmusic` | Authors scores in Moodle's editor |

## Requirements

Moodle 4.5 or later. Nothing else — the suite has no server-side dependencies.

## Licence

GPL v3 or later. Bundled third-party libraries are declared in `thirdpartylibs.xml`.
