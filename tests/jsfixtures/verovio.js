/**
 * Installs the real vendored Verovio engine as the engraver's toolkit, under node.
 *
 * The browser fetches the engine over HTTP from a wwwroot-based URL, which node cannot
 * resolve; everything downstream of this factory is the production code path. Importing this
 * module has no cost until something actually engraves, because the engraver only calls the
 * factory on first use.
 *
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

import {setToolkitFactory} from 'local_sheetmusic/engraver';

setToolkitFactory(async () => {
    const [{default: createVerovioModule}, {VerovioToolkit, enableLog, LOG_OFF}] = await Promise.all([
        import('../../thirdparty/verovio/verovio-module.js'),
        import('../../thirdparty/verovio/verovio.js'),
    ]);
    const module = await createVerovioModule();
    const toolkit = new VerovioToolkit(module);
    enableLog(LOG_OFF, module);
    return toolkit;
});
