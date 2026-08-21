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
     * The inline size threshold is the documented 50 KB.
     *
     * @return void
     */
    public function test_inline_threshold(): void {
        $this->assertSame(51200, source::MAX_INLINE_BYTES);
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
