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
 * Validation and description of a stored score source.
 *
 * @package    local_sheetmusic
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace local_sheetmusic\local;

/**
 * Validation and description of a stored score source.
 *
 * Every path that accepts a score from a client passes through this class. Score sources are
 * never trusted: a client-declared format is a claim, not a fact.
 *
 * @package    local_sheetmusic
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class source {
    /** @var int Sources larger than this are stored as a file rather than inline. */
    public const MAX_INLINE_BYTES = 51200;

    /** @var int The accessible description must stay below the Brickfield alt-text limit. */
    public const MAX_DESCRIPTION_CHARS = 750;

    /**
     * Normalise a raw score source for storage.
     *
     * Line endings become LF and trailing whitespace is stripped from each line. Nothing else
     * is touched: whitespace inside an ABC body is significant, so no reflowing happens here.
     *
     * @param string $raw The source as submitted.
     * @return string The normalised source.
     */
    public static function normalise(string $raw): string {
        $lines = preg_split('/\r\n|\r|\n/', $raw);
        $lines = array_map(static fn(string $line): string => rtrim($line), $lines);
        return rtrim(implode("\n", $lines), "\n");
    }

    /**
     * Whether a source is plausibly the format it claims to be.
     *
     * @param string $raw The source as submitted.
     * @param string $format The claimed format.
     * @return bool
     */
    public static function validate(string $raw, string $format): bool {
        $raw = self::normalise($raw);
        if ($raw === '' || !formats::is_storable($format)) {
            return false;
        }
        if ($format === 'abc') {
            return self::header($raw, 'X') !== null
                && self::header($raw, 'K') !== null
                && preg_match('/[A-Ga-gz]/', self::body($raw)) === 1;
        }
        return str_contains($raw, '<score-partwise') || str_contains($raw, '<score-timewise');
    }

    /**
     * Build a short human description of a score, for use as an accessible label.
     *
     * This is deliberately a description and not a transcription: a screen-reader user needs
     * to know what the score is, while the source itself stays in the page for anyone who
     * wants to read the notation.
     *
     * @param string $raw The score source.
     * @param string $format The source format.
     * @return string A description of at most MAX_DESCRIPTION_CHARS characters.
     */
    public static function describe(string $raw, string $format): string {
        $raw = self::normalise($raw);
        $parts = [];

        if ($format === 'abc') {
            $title = self::header($raw, 'T');
            $key = self::header($raw, 'K');
            $metre = self::header($raw, 'M');
            $bars = self::count_bars($raw);

            $parts[] = ($title !== null && $title !== '')
                ? $title
                : get_string('scoredefaulttitle', 'local_sheetmusic');
            if ($key !== null && $key !== '') {
                $parts[] = get_string('scorekey', 'local_sheetmusic', $key);
            }
            if ($metre !== null && $metre !== '') {
                $parts[] = get_string('scoremetre', 'local_sheetmusic', $metre);
            }
            if ($bars > 0) {
                $parts[] = get_string('scorebars', 'local_sheetmusic', $bars);
            }
        } else {
            $parts[] = get_string('scoredefaulttitle', 'local_sheetmusic');
        }

        $description = implode(', ', $parts);
        return \core_text::strlen($description) > self::MAX_DESCRIPTION_CHARS
            ? \core_text::substr($description, 0, self::MAX_DESCRIPTION_CHARS)
            : $description;
    }

    /**
     * Read a single ABC header field.
     *
     * @param string $normalised A source already passed through normalise().
     * @param string $letter The header letter, for example T for title.
     * @return string|null The header value, or null when the header is absent.
     */
    private static function header(string $normalised, string $letter): ?string {
        $pattern = '/^' . preg_quote($letter, '/') . ':(.*)$/m';
        if (preg_match($pattern, $normalised, $matches) === 1) {
            return trim($matches[1]);
        }
        return null;
    }

    /**
     * Everything in an ABC source that is not a header line.
     *
     * @param string $normalised A source already passed through normalise().
     * @return string The tune body.
     */
    private static function body(string $normalised): string {
        $lines = explode("\n", $normalised);
        $body = array_filter($lines, static fn(string $line): bool => preg_match('/^[A-Za-z]:/', $line) !== 1);
        return implode("\n", $body);
    }

    /**
     * Count the bars in an ABC tune body.
     *
     * @param string $normalised A source already passed through normalise().
     * @return int The number of bars found.
     */
    private static function count_bars(string $normalised): int {
        $body = trim(self::body($normalised));
        if ($body === '') {
            return 0;
        }
        $bars = array_filter(
            preg_split('/\|+/', $body),
            static fn(string $bar): bool => trim($bar) !== ''
        );
        return count($bars);
    }
}
