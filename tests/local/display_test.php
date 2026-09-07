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
 * Tests for the display settings.
 *
 * @package    local_sheetmusic
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace local_sheetmusic\local;

/**
 * Tests for the display settings.
 *
 * @package    local_sheetmusic
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 * @covers     \local_sheetmusic\local\display
 */
final class display_test extends \advanced_testcase {
    /**
     * Start each test from a site that has never been configured.
     *
     * @return void
     */
    protected function setUp(): void {
        parent::setUp();
        $this->resetAfterTest();
    }

    /**
     * An unconfigured site gets the documented defaults.
     *
     * @return void
     */
    public function test_defaults(): void {
        $this->assertSame(display::DEFAULT_SCALE, display::scale());
        $this->assertTrue(display::playback_enabled(), 'playback is on until an admin turns it off');
    }

    /**
     * Each staff size the setting offers is passed through.
     *
     * @return void
     */
    public function test_every_offered_scale_is_accepted(): void {
        foreach (display::SCALES as $token) {
            set_config('defaultscale', $token, 'local_sheetmusic');
            $this->assertSame($token, display::scale());
        }
    }

    /**
     * A value that is not one of the offered sizes is not passed to the client.
     *
     * The setting is an admin_setting_configselect, so this cannot happen through the settings
     * page; it can happen through a site's config.php or an upgrade from a future version, and
     * the value ends up in an HTML attribute either way.
     *
     * @return void
     */
    public function test_unknown_scale_falls_back(): void {
        set_config('defaultscale', 'enormous', 'local_sheetmusic');
        $this->assertSame(display::DEFAULT_SCALE, display::scale());
    }

    /**
     * Playback follows the setting.
     *
     * @return void
     */
    public function test_playback_setting(): void {
        set_config('playback', 0, 'local_sheetmusic');
        $this->assertFalse(display::playback_enabled());
        set_config('playback', 1, 'local_sheetmusic');
        $this->assertTrue(display::playback_enabled());
    }

    /**
     * The attributes are the ones the client reads, spelled the way it reads them.
     *
     * @return void
     */
    public function test_attributes(): void {
        set_config('defaultscale', 's', 'local_sheetmusic');
        set_config('playback', 0, 'local_sheetmusic');
        $this->assertSame([
            'data-sheetmusic-scale' => 's',
            'data-sheetmusic-play' => '0',
        ], display::attributes());
    }
}
