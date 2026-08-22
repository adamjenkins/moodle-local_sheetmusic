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

## What the note editor can and cannot do

The editing surface opens on a staff you can click on and type into. It is deliberately a
**Tier 1** editor, and the limits are worth knowing before you plan a lesson around it:

| Can | Cannot |
|---|---|
| One staff, one voice | Grand staff, several voices, chords |
| Note lengths from semibreve to semiquaver, with one or two dots | Breves, tuplets |
| Rests, ties, sharps, flats and naturals | Slurs, articulations, dynamics |
| Key signature, time signature and clef | Lyrics, repeats, layout breaks |

Anything the model cannot hold is refused rather than approximated. A score with chords or
tuplets in it still opens, still engraves and can still be edited as ABC in the source tab; the
note-entry tab says plainly that it cannot place notes on that score instead of quietly dropping
what it has no room for. Double sharps and double flats are kept and displayed if an import
brings them in, but the toolbar and the keyboard offer only single accidentals.

## Requirements

Moodle 4.5 or later. Nothing else — the suite has no server-side dependencies.

## Design documents

Comments in this plugin refer to `DESIGN.md`, `RELATIONS.md` and the `P0-FINDINGS-*` notes by
bare name. Those are the sheet music suite's development records and are deliberately not shipped
inside the plugin: they cover all three plugins together and change on a different rhythm from the
code. `RELATIONS.md` in particular is the normative contract between the plugins - the stored
`<pre class="sheetmusic sheetmusic-abc">` format, the engine's public module API, and the editor
and filter coupling - and is the document to read before changing either side of a boundary.

They are kept with the suite's development documentation alongside the source repositories rather
than in this one.

## Licence

GPL v3 or later. Bundled third-party libraries are declared in `thirdpartylibs.xml`.
