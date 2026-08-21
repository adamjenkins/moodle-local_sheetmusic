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
 * The tab strip over the editing surface's two views.
 *
 * @module     local_sheetmusic/editor/tabs
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

import {make} from 'local_sheetmusic/editor/dom';

/**
 * Build the tab strip.
 *
 * The pattern is the ARIA authoring practices one: one tab stop for the whole strip, the arrow
 * keys moving between tabs inside it, so that reaching the source tab never means tabbing
 * through the note-entry toolbar first.
 *
 * @param {object[]} tabs [{name, label, panel}].
 * @param {string} id A unique prefix for this surface's element ids.
 * @param {Function} onSelect Called with the name of the tab that has just been shown.
 * @returns {object} {element, select}.
 */
export const buildTabs = (tabs, id, onSelect) => {
    const buttons = tabs.map((tab) => make('button', {
        type: 'button',
        role: 'tab',
        id: `${id}-tab-${tab.name}`,
        className: 'nav-link',
        'aria-controls': `${id}-panel-${tab.name}`,
        'aria-selected': 'false',
        tabindex: '-1',
        textContent: tab.label,
    }));
    tabs.forEach((tab, at) => {
        tab.panel.setAttribute('id', `${id}-panel-${tab.name}`);
        tab.panel.setAttribute('role', 'tabpanel');
        tab.panel.setAttribute('aria-labelledby', buttons[at].id);
        tab.panel.hidden = true;
    });

    const select = (name, focus = false) => {
        tabs.forEach((tab, at) => {
            const chosen = tab.name === name;
            buttons[at].classList.toggle('active', chosen);
            buttons[at].setAttribute('aria-selected', String(chosen));
            buttons[at].tabIndex = chosen ? 0 : -1;
            tab.panel.hidden = !chosen;
            if (chosen && focus) {
                buttons[at].focus();
            }
        });
        onSelect(name);
    };

    buttons.forEach((button, at) => {
        button.addEventListener('click', () => select(tabs[at].name));
        button.addEventListener('keydown', (event) => {
            const step = {ArrowLeft: -1, ArrowRight: 1}[event.key];
            if (step) {
                event.preventDefault();
                select(tabs[(at + step + tabs.length) % tabs.length].name, true);
            }
        });
    });

    return {
        select,
        element: make('ul', {className: 'nav nav-tabs sheetmusic-editor-tabs', role: 'tablist'},
            buttons.map((button) => make('li', {className: 'nav-item', role: 'presentation'}, [button]))),
    };
};

