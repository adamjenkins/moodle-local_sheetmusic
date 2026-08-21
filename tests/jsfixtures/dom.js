/**
 * Minimal DOM bootstrap so amd/src modules can be unit tested under node.
 *
 * Importing this module installs document and window as globals, matching what the modules
 * see in a browser. It exists because the engine's model and serialiser layers are pure data
 * but its render layer is not, and the render layer is worth testing without a browser.
 */

import {JSDOM} from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');

global.window = dom.window;
global.document = dom.window.document;
global.Node = dom.window.Node;

export default dom;
