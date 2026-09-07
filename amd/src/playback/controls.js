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
 * The transport a reader operates.
 *
 * Ordinary buttons and a range input, not controls drawn over the score: the score itself is an
 * `aria-hidden` image inside a labelled container, so anything drawn on it is invisible to a
 * screen reader and unreachable from a keyboard. Everything here is in the page's own tab order
 * with a name of its own.
 *
 * State is spoken through a live region rather than by rewriting the score's label, because the
 * label describes the music and is what a reader hears when they arrive at it; overwriting it
 * with "Playing" would take that description away.
 *
 * @module     local_sheetmusic/playback/controls
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

import {fill, make} from 'local_sheetmusic/editor/dom';

/**
 * The language strings the transport needs.
 *
 * @type {string[]}
 */
const KEYS = [
    'playbackfailed', 'playbackgroup', 'playbackplay', 'playbackplaying', 'playbackpreparing',
    'playbackstop', 'playbackstopped', 'playbacktempo', 'playbacktempovalue',
];

/** @type {Promise<object>|null} The resolved strings, fetched once per page. */
let stringsPromise = null;

/**
 * Install the language strings directly, instead of fetching them.
 *
 * The seam exists for the unit tests, which run under bare node with no Moodle behind them.
 *
 * @param {object|null} map String id to text, or null to go back to fetching.
 * @returns {void}
 */
export const setStrings = (map) => {
    stringsPromise = map ? Promise.resolve(map) : null;
};

/**
 * Fetch the transport's language strings.
 *
 * `core/str` is reached through RequireJS rather than imported, for the same reason the editing
 * surface does it: a static import would make this module unloadable outside Moodle.
 *
 * @returns {Promise<object>} String id to text.
 */
export const loadStrings = () => {
    if (!stringsPromise) {
        stringsPromise = new Promise((resolve, reject) => {
            window.require(['core/str'], (Str) => {
                Str.get_strings(KEYS.map((key) => ({key, component: 'local_sheetmusic'})))
                    .then((values) => {
                        const map = {};
                        KEYS.forEach((key, at) => {
                            map[key] = values[at];
                        });
                        resolve(map);
                        return map;
                    })
                    .catch(reject);
            }, reject);
        });
    }
    return stringsPromise;
};

/**
 * Build the transport for one score.
 *
 * @param {object} spec {strings, id, onToggle, onRate}.
 * @returns {object} {element, setState, setTempo, say}.
 */
export const createControls = (spec) => {
    const strings = spec.strings;
    const id = spec.id;

    const toggle = make('button', {
        type: 'button',
        className: 'btn btn-secondary btn-sm sheetmusic-playback-toggle',
        textContent: strings.playbackplay,
        'aria-pressed': 'false',
    });

    const slider = make('input', {
        type: 'range',
        id: `${id}-tempo`,
        className: 'form-range sheetmusic-playback-tempo',
        min: '25',
        max: '200',
        step: '5',
        value: '100',
    });

    const readout = make('span', {
        className: 'sheetmusic-playback-tempovalue',
        textContent: fill(strings.playbacktempovalue, 100),
    });

    // Politely announced, and off screen: the button's own pressed state already tells a
    // screen-reader user what happened when they pressed it, so this is for the transitions
    // they did not cause - the piece reaching its end.
    const status = make('span', {
        className: 'sheetmusic-playback-status accesshide',
        role: 'status',
        'aria-live': 'polite',
    });

    const element = make('div', {
        className: 'sheetmusic-playback',
        role: 'group',
        'aria-label': strings.playbackgroup,
    }, [
        toggle,
        make('label', {'for': slider.id, className: 'sheetmusic-playback-label', textContent: strings.playbacktempo}),
        slider,
        readout,
        status,
    ]);

    toggle.addEventListener('click', () => spec.onToggle());
    slider.addEventListener('input', () => {
        const percent = Number(slider.value) || 100;
        readout.textContent = fill(strings.playbacktempovalue, percent);
        spec.onRate(percent / 100);
    });

    return {
        element,
        /**
         * Show what the transport is doing.
         *
         * @param {string} state One of playing, stopped, ended, preparing, failed.
         * @returns {void}
         */
        setState: (state) => {
            const playing = state === 'playing';
            toggle.setAttribute('aria-pressed', playing ? 'true' : 'false');
            toggle.textContent = playing ? strings.playbackstop : strings.playbackplay;
            toggle.disabled = state === 'preparing';
            element.classList.toggle('sheetmusic-playback-active', playing);
            if (state === 'preparing') {
                status.textContent = strings.playbackpreparing;
            } else if (playing) {
                status.textContent = strings.playbackplaying;
            } else if (state === 'failed') {
                status.textContent = strings.playbackfailed;
            } else {
                status.textContent = strings.playbackstopped;
            }
        },
        /**
         * Say something in the live region.
         *
         * @param {string} message What to say.
         * @returns {void}
         */
        say: (message) => {
            status.textContent = message;
        },
        /** @returns {number} The chosen speed, as a multiple of the score's tempo. */
        rate: () => (Number(slider.value) || 100) / 100,
    };
};
