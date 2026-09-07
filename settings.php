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
 * Admin settings for local_sheetmusic.
 *
 * @package    local_sheetmusic
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

if ($hassiteconfig) {
    $settings = new admin_settingpage('local_sheetmusic', new lang_string('pluginname', 'local_sheetmusic'));
    $ADMIN->add('localplugins', $settings);

    $settings->add(new admin_setting_configselect(
        'local_sheetmusic/defaultscale',
        new lang_string('defaultscale', 'local_sheetmusic'),
        new lang_string('defaultscale_desc', 'local_sheetmusic'),
        'm',
        [
            's' => new lang_string('scalesmall', 'local_sheetmusic'),
            'm' => new lang_string('scalemedium', 'local_sheetmusic'),
            'l' => new lang_string('scalelarge', 'local_sheetmusic'),
        ]
    ));

    $settings->add(new admin_setting_configcheckbox(
        'local_sheetmusic/playback',
        new lang_string('playback', 'local_sheetmusic'),
        new lang_string('playback_desc', 'local_sheetmusic'),
        1
    ));
}
