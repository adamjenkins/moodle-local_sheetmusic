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

    /** @var string Prefix of the stored class token that sets one score's staff size (RELATIONS.md A3). */
    public const TOKEN_SCALE = 'sheetmusic-scale-';

    /** @var string Stored class token asking for one score's play button to be shown. */
    public const TOKEN_PLAY = 'sheetmusic-play';

    /** @var string Stored class token asking for one score's play button to be hidden. */
    public const TOKEN_NOPLAY = 'sheetmusic-noplay';

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
     * Whether a score's own play-button token may override the site default.
     *
     * Defaults to on for a site that has never visited the setting page, for the same reason as
     * playback_enabled(). The setting exists because any user of the text editor can type a class
     * token, students included, so it is the only way an admin can make "off" mean off.
     *
     * @return bool True if sheetmusic-play and sheetmusic-noplay are honoured.
     */
    public static function playback_overridable(): bool {
        $value = get_config('local_sheetmusic', 'playbackoverride');
        return $value === false || $value === null || (bool) $value;
    }

    /**
     * The data attributes a score placeholder carries so the client needs no round trip.
     *
     * A score's own class tokens win over the site settings: `sheetmusic-scale-{s,m,l}` always,
     * and `sheetmusic-play` / `sheetmusic-noplay` only while playback_overridable() allows it. If
     * a score carries both play tokens, `sheetmusic-noplay` wins. Tokens that are not recognised
     * are ignored, as RELATIONS.md section A3 requires.
     *
     * @param string[] $tokens The class tokens of the stored score, if the caller has them.
     * @return array Attribute name to value.
     */
    public static function attributes(array $tokens = []): array {
        $scale = self::scale();
        foreach ($tokens as $token) {
            if (str_starts_with($token, self::TOKEN_SCALE)) {
                $candidate = substr($token, strlen(self::TOKEN_SCALE));
                if (in_array($candidate, self::SCALES, true)) {
                    $scale = $candidate;
                    break;
                }
            }
        }

        $play = self::playback_enabled();
        if (self::playback_overridable()) {
            if (in_array(self::TOKEN_NOPLAY, $tokens, true)) {
                $play = false;
            } else if (in_array(self::TOKEN_PLAY, $tokens, true)) {
                $play = true;
            }
        }

        return [
            'data-sheetmusic-scale' => $scale,
            'data-sheetmusic-play' => $play ? '1' : '0',
        ];
    }
}
