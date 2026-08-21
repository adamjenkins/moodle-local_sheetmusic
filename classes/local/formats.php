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
 * The authority on which score formats this suite can read and write.
 *
 * @package    local_sheetmusic
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace local_sheetmusic\local;

/**
 * The authority on which score formats this suite can read and write.
 *
 * Both consumer plugins ask this class rather than hard-coding format lists, so that adding
 * a format is a one-file change. See RELATIONS.md section B2.
 *
 * @package    local_sheetmusic
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class formats {
    /** @var string[] Formats the suite can import or render. */
    public const READ = ['abc', 'musicxml', 'mxl', 'midi'];

    /** @var string[] Formats the suite can produce. */
    public const WRITE = ['abc', 'musicxml', 'midi', 'svg', 'png', 'pdf'];

    /** @var string[] Formats that may be stored inline as a score source. */
    public const STORABLE = ['abc', 'musicxml'];

    /**
     * Whether a format can be read.
     *
     * @param string $format The format name, lower case.
     * @return bool
     */
    public static function is_readable(string $format): bool {
        return in_array($format, self::READ, true);
    }

    /**
     * Whether a format can be written.
     *
     * @param string $format The format name, lower case.
     * @return bool
     */
    public static function is_writable(string $format): bool {
        return in_array($format, self::WRITE, true);
    }

    /**
     * Whether a format may appear as a stored score source in Moodle content.
     *
     * @param string $format The format name, lower case.
     * @return bool
     */
    public static function is_storable(string $format): bool {
        return in_array($format, self::STORABLE, true);
    }
}
