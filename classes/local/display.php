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
 * The site settings that decide how a score is shown.
 *
 * @package    local_sheetmusic
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace local_sheetmusic\local;

/**
 * The site settings that decide how a score is shown.
 *
 * Both consumers - the filter and the editor - ask this class rather than reading configuration
 * for themselves, so that a setting has one meaning and one default across the suite.
 *
 * The values are carried to the browser as attributes on the score placeholder rather than
 * fetched by the client. The suite has no web service and no AJAX (`RELATIONS.md` section B3),
 * and a score is rendered wherever `format_text()` runs, which includes places no request of
 * the client's own could be made from.
 *
 * @package    local_sheetmusic
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class display {
    /** @var string The staff size used when the site has expressed no preference. */
    public const DEFAULT_SCALE = 'm';

    /** @var string[] The staff sizes the setting offers. The client maps these to engraver scales. */
    public const SCALES = ['s', 'm', 'l'];

    /**
     * The staff size scores are engraved at on this site.
     *
     * @return string One of the tokens in SCALES.
     */
    public static function scale(): string {
        $value = get_config('local_sheetmusic', 'defaultscale');
        return in_array($value, self::SCALES, true) ? $value : self::DEFAULT_SCALE;
    }

    /**
     * Whether readers may play the scores on this site.
     *
     * Defaults to on for a site that has never visited the setting page: playback is the
     * behaviour the plugin is being installed for, and an unset value means "not yet asked",
     * not "no".
     *
     * @return bool True if the transport should be offered.
     */
    public static function playback_enabled(): bool {
        $value = get_config('local_sheetmusic', 'playback');
        return $value === false || $value === null || (bool) $value;
    }

    /**
     * The data attributes a score placeholder carries so the client needs no round trip.
     *
     * @return array Attribute name to value.
     */
    public static function attributes(): array {
        return [
            'data-sheetmusic-scale' => self::scale(),
            'data-sheetmusic-play' => self::playback_enabled() ? '1' : '0',
        ];
    }
}
