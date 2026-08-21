/**
 * A guard against the failure mode an asynchronous test has and a synchronous one does not.
 *
 * A spec built as `const run = async () => {...}; run();` that stops half way - an await on a
 * promise nothing will ever settle, typically a wait for an event that is not going to fire -
 * does not fail. Node runs out of work and exits 0, the runner sees a clean exit, and the test
 * has proven nothing while reporting success. Measured, not theorised: it happened while writing
 * the note-entry tests.
 *
 * So every asynchronous spec announces its own end through the function this returns, and
 * anything that exits cleanly without having announced it turns into a failure.
 */

/**
 * Register a spec, and get back the function that ends it.
 *
 * @param {string} name The spec's name, without the .spec suffix.
 * @returns {Function} Call it with a one-line summary when the spec has run to its end.
 */
export const finishes = (name) => {
    let finished = false;
    process.on('exit', (code) => {
        if (code === 0 && !finished) {
            process.stderr.write(`${name}.spec: DID NOT FINISH - it stopped part way, so it proved nothing.\n`);
            process.exitCode = 1;
        }
    });
    return (message) => {
        finished = true;
        process.stdout.write(`${name}.spec: OK (${message})\n`);
    };
};
