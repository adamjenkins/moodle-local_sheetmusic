# Changelog

All notable changes to `local_sheetmusic` are documented here.
The full history is in [`changelog.md`](changelog.md).

## [0.2.2] - 2026-10-04

### Changed

- **Maturity is now Beta.** The plugin was released as Alpha; it is now marked Beta
  (`$plugin->maturity = MATURITY_BETA`).
- **Composer accepts later Moodle releases.** The package now requires `moodle/moodle`
  `^4.5 || ^5.0` instead of stopping before 5.4. The supported range declared in `version.php`
  is unchanged (Moodle 4.5 to 5.3).
- **Tests run against the released Moodle 5.3.** The automated tests now use Moodle 5.3
  (`MOODLE_503_STABLE`) instead of Moodle's development branch, and those runs now count towards
  a pass.

No database or settings changes. No action is required after upgrading.
