/**
 * Unit tests for local_sheetmusic/render, using a fake engraver toolkit.
 *
 * Run with: node tests/jsfixtures/render.spec.js
 *
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

import assert from 'node:assert';
import './dom.js';
import {setToolkitFactory} from 'local_sheetmusic/engraver';
import {hydrate, hydrateAll, observe} from 'local_sheetmusic/render';
import {MAX_SOURCE_BYTES} from 'local_sheetmusic/limits';
import {finishes} from './spec.js';

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

const done = finishes('render');

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

    // A source past the shared size bound must not be engraved, however it reached the page.
    // The filter refuses these server-side, so this guard exists for markup that never went
    // through the filter at all - hand-authored HTML, or another plugin's injected content.
    const huge = placeholder();
    huge.querySelector('.sheetmusic-source').textContent =
        'X:1\nK:G\n' + '|GABc dedB'.repeat(Math.ceil(MAX_SOURCE_BYTES / 10) + 8);
    const beforeHuge = renderCalls;
    await hydrate(huge);
    assert.strictEqual(renderCalls, beforeHuge, 'an oversized source is never engraved');
    assert.strictEqual(huge.dataset.sheetmusicError, 'toolarge', 'and says why it was refused');
    assert.ok(huge.querySelector('.sheetmusic-source').textContent.includes('K:G'),
        'the readable source survives being refused');

    // Put a working engraver back for the observer tests.
    setToolkitFactory(() => ({
        setOptions() {},
        loadData() {
            return true;
        },
        renderToSVG() {
            renderCalls++;
            return '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
        },
    }));

    // Without IntersectionObserver, observe() has to behave exactly as hydrateAll() did.
    delete window.IntersectionObserver;
    const eager = placeholder();
    const beforeEager = renderCalls;
    await observe(document);
    assert.strictEqual(renderCalls, beforeEager + 1, 'observe falls back to rendering everything');
    assert.strictEqual(eager.dataset.sheetmusicRendered, '1', 'the fallback really did render it');

    // With it, nothing is engraved until the score is actually reached.
    let observed = [];
    let fire = null;
    window.IntersectionObserver = function (callback) {
        fire = callback;
        this.observe = (el) => observed.push(el);
        this.unobserve = (el) => {
            observed = observed.filter((each) => each !== el);
        };
    };
    const lazy = placeholder();
    const beforeLazy = renderCalls;
    await observe(document);
    assert.strictEqual(renderCalls, beforeLazy, 'nothing is engraved on load');
    assert.ok(observed.includes(lazy), 'the unrendered score is being watched');

    fire([{target: lazy, isIntersecting: false}]);
    assert.strictEqual(renderCalls, beforeLazy, 'a score still off screen is not engraved');

    fire([{target: lazy, isIntersecting: true}]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.strictEqual(renderCalls, beforeLazy + 1, 'reaching the score engraves it');
    assert.ok(!observed.includes(lazy), 'and it stops being watched');

    done('read-only rendering, size guard and lazy hydration');
};

run();
