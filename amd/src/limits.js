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
 * The largest import file that may be read, in bytes.
 *
 * Applies to MIDI and to both flavours of MusicXML. A compressed `.mxl` is a ZIP, and it is
 * base64-encoded before the engine sees it, so the byte count is multiplied by 4/3 in memory
 * before decompression has even started.
 *
 * @type {number}
 */
export const MAX_IMPORT_BYTES = 5242880;
