/**
 * Unit tests for local_sheetmusic/render, using a fake engraver toolkit.
 *
 * Run with: node tests/jsfixtures/render.spec.js
 */

import assert from 'node:assert';
import './dom.js';
import {setToolkitFactory} from '../../amd/src/engraver.js';
import {hydrate, hydrateAll} from '../../amd/src/render.js';

let renderCalls = 0;

setToolkitFactory(() => ({
    setOptions() {},
    loadData() {
        return true;
    },
    renderToSVG() {
        renderCalls++;
        return '<svg xmlns="http://www.w3.org/2000/svg">'
            + '<g data-class="note" data-id="n1" data-pname="g" data-oct="4" data-dur="4"/>'
            + '<g data-class="note" data-id="n2" data-pname="a" data-oct="4" data-dur="4"/>'
            + '</svg>';
    },
}));

/**
 * Build a placeholder shaped like the one the filter emits.
 *
 * @returns {HTMLElement} The placeholder.
 */
const placeholder = () => {
    const el = document.createElement('div');
    el.className = 'sheetmusic-block';
    el.dataset.sheetmusicFormat = 'abc';
    el.dataset.sheetmusicLabel = 'Scale study, key G, 4/4 time, 1 bar';
    const pre = document.createElement('pre');
    pre.className = 'sheetmusic-source';
    pre.textContent = 'X:1\nM:4/4\nK:G\n|GABc dedB|';
    el.appendChild(pre);
    document.body.appendChild(el);
    return el;
};

const run = async () => {
    const el = placeholder();

    await hydrate(el);
    assert.strictEqual(el.dataset.sheetmusicRendered, '1', 'placeholder is marked rendered');
    assert.ok(el.querySelector('.sheetmusic-render svg'), 'svg injected');

    const figure = el.querySelector('.sheetmusic-render');
    assert.strictEqual(figure.getAttribute('role'), 'img', 'accessible role set');
    assert.ok(figure.getAttribute('aria-label').includes('Scale study'), 'accessible label set');
    assert.ok(el.querySelector('.sheetmusic-source.accesshide'), 'source kept in the a11y tree');

    const before = renderCalls;
    await hydrate(el);
    assert.strictEqual(renderCalls, before, 'hydrate is idempotent');

    placeholder();
    placeholder();
    await hydrateAll(document);
    assert.strictEqual(renderCalls, before + 2, 'hydrateAll renders only the new placeholders');

    // A score the engraver rejects must keep its readable source rather than blanking.
    setToolkitFactory(() => ({
        setOptions() {},
        loadData() {
            return false;
        },
        renderToSVG() {
            return '';
        },
        getMEI() {
            return '';
        },
    }));
    const bad = placeholder();
    await hydrate(bad);
    assert.strictEqual(bad.dataset.sheetmusicError, '1', 'render failure is recorded');
    assert.ok(bad.querySelector('.sheetmusic-source').textContent.includes('K:G'), 'source survives');

    window.console.log('render.spec: OK');
};

run();
