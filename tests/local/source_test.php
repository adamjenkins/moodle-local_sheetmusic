<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// Moodle is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Moodle.  If not, see <https://www.gnu.org/licenses/>.

/**
 * Tests for the score source helper.
 *
 * @package    local_sheetmusic
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace local_sheetmusic\local;

/**
 * Tests for the score source helper.
 *
 * @package    local_sheetmusic
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 * @covers     \local_sheetmusic\local\source
 */
final class source_test extends \advanced_testcase {
    /**
     * Line endings are normalised without altering anything else.
     *
     * @return void
     */
    public function test_normalise_converts_crlf_only(): void {
        $this->assertSame("X:1\nK:G\n|GABc|", source::normalise("X:1\r\nK:G\r\n|GABc|"));
        $this->assertSame("X:1\nK:G", source::normalise("X:1  \nK:G\t"));
    }

    /**
     * A plausible ABC tune validates and junk does not.
     *
     * @return void
     */
    public function test_validate_abc(): void {
        $this->assertTrue(source::validate("X:1\nM:4/4\nK:G\n|GABc dedB|", 'abc'));
        $this->assertFalse(source::validate('not a tune at all', 'abc'));
        $this->assertFalse(source::validate('', 'abc'));
    }

    /**
     * The description is human readable, short, and names the title, key and metre.
     *
     * @return void
     */
    public function test_describe_is_short_and_human(): void {
        $description = source::describe("X:1\nT:Scale study\nM:4/4\nK:G\n|GABc dedB|", 'abc');
        $this->assertStringContainsString('Scale study', $description);
        $this->assertStringContainsString('G', $description);
        $this->assertStringContainsString('4/4', $description);
        $this->assertLessThanOrEqual(750, strlen($description));
    }

    /**
     * A single bar is described in the singular.
     *
     * @return void
     */
    public function test_describe_uses_singular_for_one_bar(): void {
        $one = source::describe("X:1\nM:4/4\nK:G\n|GABc dedB|", 'abc');
        $this->assertStringContainsString('1 bar', $one);
        $this->assertStringNotContainsString('1 bars', $one);

        $two = source::describe("X:1\nM:4/4\nK:G\n|GABc|dedB|", 'abc');
        $this->assertStringContainsString('2 bars', $two);
    }

    /**
     * A score with no title still produces a usable description.
     *
     * @return void
     */
    public function test_describe_without_title(): void {
        $description = source::describe("X:1\nK:C\n|CDEF|", 'abc');
        $this->assertNotEmpty($description);
        $this->assertLessThanOrEqual(750, strlen($description));
    }

    /**
     * The inline size threshold is the documented 50 KB, and it is actually enforced.
     *
     * Asserting the constant alone proved nothing: it was dead code for the whole of the first
     * implementation while this test passed. The enforcement assertions below are the point.
     *
     * @return void
     */
    public function test_inline_threshold(): void {
        $this->assertSame(51200, source::MAX_INLINE_BYTES);

        $header = "X:1\nK:G\n";
        $inside = $header . str_repeat('|GABc dedB', (int) ((source::MAX_INLINE_BYTES - strlen($header) - 16) / 10));
        $outside = $header . str_repeat('|GABc dedB', (int) (source::MAX_INLINE_BYTES / 10) + 64);

        $this->assertLessThanOrEqual(source::MAX_INLINE_BYTES, strlen($inside));
        $this->assertGreaterThan(source::MAX_INLINE_BYTES, strlen($outside));

        $this->assertTrue(source::validate($inside, 'abc'), 'a source inside the limit is accepted');
        $this->assertFalse(source::validate($outside, 'abc'), 'a source past the limit is refused');
    }

    /**
     * validate() refuses hostile and malformed input rather than merely mis-describing it.
     *
     * It is a plausibility check, not a sanitiser - escaping happens at the output sink - but it
     * is the gate that decides whether arbitrary text gets wrapped up and presented as a score,
     * so what it lets through matters.
     *
     * @return void
     */
    public function test_validate_refuses_hostile_input(): void {
        // No X: header and no K: header, whatever else is in it.
        $this->assertFalse(source::validate('<script>alert(1)</script>', 'abc'));
        $this->assertFalse(source::validate("K:G\n|GABc|", 'abc'), 'X: header is required');
        $this->assertFalse(source::validate("X:1\n|GABc|", 'abc'), 'K: header is required');

        // A format outside the storable allowlist is refused however well formed the source is.
        $this->assertFalse(source::validate("X:1\nK:G\n|GABc|", 'midi'));
        $this->assertFalse(source::validate("X:1\nK:G\n|GABc|", 'mxl'));
        $this->assertFalse(source::validate("X:1\nK:G\n|GABc|", 'klingon'));
        $this->assertFalse(source::validate("X:1\nK:G\n|GABc|", ''));

        // MusicXML has to actually declare itself.
        $this->assertFalse(source::validate('<html><body>not music</body></html>', 'musicxml'));
        $this->assertTrue(source::validate('<score-partwise version="4.0"/>', 'musicxml'));

        // Whitespace-only content is not a score.
        $this->assertFalse(source::validate("   \n\t\n  ", 'abc'));
    }

    /**
     * describe() keeps its length promise even when handed a hostile title.
     *
     * The result becomes an aria-label, so it is attacker-authored text heading for an attribute.
     * Escaping is the caller's job; staying inside the length bound is this function's.
     *
     * @return void
     */
    public function test_describe_bounds_a_hostile_title(): void {
        $title = str_repeat('very long title ', 400);
        $description = source::describe("X:1\nT:{$title}\nK:G\n|GABc|", 'abc');

        $this->assertLessThanOrEqual(source::MAX_DESCRIPTION_CHARS, \core_text::strlen($description));
        $this->assertNotEmpty($description);
    }

    /**
     * The format authority agrees with the documented format vocabulary.
     *
     * @return void
     */
    public function test_formats(): void {
        $this->assertTrue(formats::is_readable('abc'));
        $this->assertTrue(formats::is_readable('musicxml'));
        $this->assertTrue(formats::is_readable('midi'));
        $this->assertFalse(formats::is_readable('mscz'));
        $this->assertTrue(formats::is_writable('pdf'));
    }
}
