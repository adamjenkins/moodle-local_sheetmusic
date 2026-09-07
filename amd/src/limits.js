/**
 * The numeric bounds the engine refuses to work beyond.
 *
 * These exist because every one of them guards an unbounded cost that somebody else pays.
 * MAX_SOURCE_BYTES is paid by every reader of a page; the import bounds are paid by the author
 * doing the importing, on a file they may not have authored themselves. None of them is a
 * matter of taste, so none of them is a setting: a site administrator raising one would be
 * raising it on behalf of readers who never consented to the cost.
 *
 * @module      local_sheetmusic/limits
 * @copyright   2026 Adam Jenkins <adam@wisecat.net>
 * @license     http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

/**
 * The largest score source that may be engraved, in bytes.
 *
 * Mirrors `\local_sheetmusic\local\source::MAX_INLINE_BYTES`, which is the authority: the filter
 * refuses anything larger server-side, so in a normal page this guard never fires. It fires when
 * markup reaches the hydrator without passing the filter - hand-authored `.sheetmusic-block`
 * HTML from an author with raw-HTML rights, or content injected by another plugin.
 *
 * @type {number}
 */
export const MAX_SOURCE_BYTES = 51200;

/**
 * The most bars a single import may produce.
 *
 * MIDI carries no barlines, so bar count is derived from timing, and a delta time is a
 * variable-length quantity reaching 0x0FFFFFFF. A 37-byte file with one such gap expands to
 * 139,811 bars; a handful of them exhausts a gigabyte of heap. Exercise-level notation is tens
 * of bars, so this is three orders of magnitude of headroom.
 *
 * @type {number}
 */
export const MAX_IMPORT_BARS = 2000;

/**
 * The most notes that may sound at once during playback.
 *
 * Each voice is an oscillator pair, a filter and a gain node, and Web Audio gives no back
 * pressure: a score asking for more voices than the device can mix does not slow down, it
 * distorts. Twenty-four is far above anything exercise-level notation reaches - a four-part
 * chorale needs four - and well below where mixing costs become audible. Beyond it the oldest
 * sounding voice is released early, which is what a hardware synthesiser does.
 *
 * @type {number}
 */
export const MAX_VOICES = 24;

/**
 * The most notes a score may carry before it is refused for playback.
 *
 * Playback holds every note of the score in memory as a scheduling record, and the transport
 * walks that list. `MAX_SOURCE_BYTES` already bounds what may be engraved, but a small source
 * can expand into a large number of notes - a repeat with many voices - so the note count is
 * bounded where the notes actually appear rather than inferred from the source length.
 *
 * @type {number}
 */
export const MAX_PLAYBACK_NOTES = 20000;

/**
 * The largest import file that may be read, in bytes.
 *
 * Applies to MIDI and to both flavours of MusicXML. A compressed `.mxl` is a ZIP, and it is
 * base64-encoded before the engine sees it, so the byte count is multiplied by 4/3 in memory
 * before decompression has even started.
 *
 * @type {number}
 */
export const MAX_IMPORT_BYTES = 5242880;
