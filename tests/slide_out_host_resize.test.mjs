/**
 * ══ BUG-0017. A SLIDE-OUT FOLLOWS ITS HOST, NOT ONLY THE WINDOW ══════════
 *
 * An open SlideOutPanel is `position: fixed` at its host's bounding rect, and
 * that rect was re-read only on window scroll / resize. Dragging a tile
 * splitter or toggling a dock panel moves or resizes the host with no window
 * event at all, so the panel stayed at the old coordinates — overlapping the
 * neighbour tile or leaving a gap.
 *
 * jsdom computes no layout and has no ResizeObserver, so this suite installs a
 * recording ResizeObserver and gives the host a rect it controls; "the host
 * resized" is the observer delivering a notification, exactly what a browser
 * does after a splitter drag:
 *
 *   §1  the reproduction: host rect changes with no window event, the
 *       observer fires, and the panel is pinned to the new right edge
 *   §2  the host AND its ancestors are observed (a dock toggle shrinks an
 *       ancestor while a fixed-width tile only shifts)
 *   §3  window resize still re-tracks
 *   §4  close() and dispose() disconnect; a closed panel is not moved;
 *       a re-open observes again
 *
 *     node tests/slide_out_host_resize.test.mjs
 *
 * jsdom is borrowed from the sibling Tables checkout, as in every DOM suite
 * here; absent, this SKIPS loudly (and `tests/run.mjs` fails on the skip).
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';
import { existsSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SUITE = 'slide_out_host_resize';

let JSDOM = null;
try {
    ({ JSDOM } = await import('jsdom'));
} catch {
    for (const c of [
        resolvePath(HERE, '../../Tables/web/node_modules/jsdom/lib/api.js'),
        resolvePath(HERE, '../../Tables/node_modules/jsdom/lib/api.js'),
    ]) {
        if (!existsSync(c)) continue;
        ({ JSDOM } = createRequire(import.meta.url)(c));
        break;
    }
}
if (!JSDOM) {
    console.log(`${SUITE}: SKIPPED — needs jsdom `
        + '(`cd ../Tables/web && npm install`, or `npm i -D jsdom` here)');
    process.exit(0);
}

const dom = new JSDOM('<!doctype html><body></body>',
                      { url: 'http://localhost/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'Event',
                   'KeyboardEvent', 'getComputedStyle', 'navigator']) {
    if (dom.window[key] !== undefined && globalThis[key] === undefined) {
        globalThis[key] = dom.window[key];
    }
}

/** Every ResizeObserver the code under test creates, with what it watches. */
const observers = [];
globalThis.ResizeObserver = class {
    constructor(cb) { this.cb = cb; this.targets = new Set(); this.live = true; observers.push(this); }
    observe(el) { this.targets.add(el); }
    unobserve(el) { this.targets.delete(el); }
    disconnect() { this.targets.clear(); this.live = false; }
    /** What the browser does after layout when a watched box changed. */
    fire() { if (this.live && this.targets.size) this.cb([], this); }
};

const { SlideOutPanel } = await import('../widgets.js');

let failures = 0;
const check = (name, actual, expected) => {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) { failures++; console.error(`  FAIL ${name}\n    got      ${a}\n    expected ${e}`); }
    else console.log(`  ok   ${name}`);
};
const ok = (name, cond) => check(name, !!cond, true);
const section = (t) => console.log(`\n${t}`);

/** A tile inside a content area inside the shell, with a rect we control. */
function mountHost() {
    const shell = document.createElement('div');
    const content = document.createElement('div');
    const tile = document.createElement('div');
    shell.appendChild(content);
    content.appendChild(tile);
    document.body.appendChild(shell);
    let rect = { left: 0, top: 40, right: 800, bottom: 640, width: 800, height: 600 };
    tile.getBoundingClientRect = () => ({ ...rect, x: rect.left, y: rect.top });
    const setRect = (r) => { rect = { ...r, right: r.left + r.width, bottom: r.top + r.height }; };
    return { shell, content, tile, setRect };
}
const geometry = (panel) => {
    const s = panel.contentEl.parentElement.style;
    return { position: s.position, top: s.top, left: s.left, height: s.height };
};

// ── §1 ────────────────────────────────────────────────────────────────────
section('§1  the host resizes with no window event (tile splitter drag)');
{
    const { tile, setRect } = mountHost();
    const panel = new SlideOutPanel({ width: 300 });
    panel.mount(tile);
    panel.open('Config', 'tune');
    check('opened: pinned to the host right edge',
          geometry(panel), { position: 'fixed', top: '40px', left: '500px', height: '600px' });

    // Splitter dragged: the tile is now narrower and shorter. No window event.
    setRect({ left: 0, top: 40, width: 520, height: 450 });
    const ro = observers.at(-1);
    ok('an observer is watching the host while open', ro && ro.live && ro.targets.has(tile));
    ro.fire();
    check('after the host resize the panel follows the new right edge and height',
          geometry(panel), { position: 'fixed', top: '40px', left: '220px', height: '450px' });

    // Host shifted without resizing (dock panel toggled beside it).
    setRect({ left: 260, top: 40, width: 520, height: 450 });
    ro.fire();
    check('a shifted host moves the panel with it',
          geometry(panel), { position: 'fixed', top: '40px', left: '480px', height: '450px' });
    panel.dispose();
}

// ── §2 ────────────────────────────────────────────────────────────────────
section('§2  the host and every ancestor are observed');
{
    const { shell, content, tile } = mountHost();
    const panel = new SlideOutPanel({ width: 300 });
    panel.mount(tile);
    panel.open('Config');
    const ro = observers.at(-1);
    ok('host observed', ro.targets.has(tile));
    ok('content area (the dock toggle resizes it) observed', ro.targets.has(content));
    ok('shell observed', ro.targets.has(shell));
    ok('body observed', ro.targets.has(document.body));
    ok('documentElement observed', ro.targets.has(document.documentElement));
    panel.dispose();
}

// ── §3 ────────────────────────────────────────────────────────────────────
section('§3  a window resize still re-tracks');
{
    const { tile, setRect } = mountHost();
    const panel = new SlideOutPanel({ width: 300 });
    panel.mount(tile);
    panel.open('Config');
    setRect({ left: 10, top: 50, width: 700, height: 500 });
    window.dispatchEvent(new window.Event('resize'));
    check('window resize applies the new rect',
          geometry(panel), { position: 'fixed', top: '50px', left: '410px', height: '500px' });
    panel.dispose();
}

// ── §4 ────────────────────────────────────────────────────────────────────
section('§4  close / dispose disconnect; re-open observes again');
{
    const { tile, setRect } = mountHost();
    const panel = new SlideOutPanel({ width: 300 });
    panel.mount(tile);
    const before = observers.length;
    panel.open('Config');
    check('one observer per open', observers.length - before, 1);
    panel.open('Other');
    check('re-open while open adds no observer', observers.length - before, 1);
    const first = observers.at(-1);
    panel.close();
    ok('close() disconnects', !first.live && first.targets.size === 0);
    setRect({ left: 0, top: 0, width: 100, height: 100 });
    first.cb([], first);   // a late notification already queued
    check('a closed panel is not moved by a late notification',
          geometry(panel).left, '500px');

    panel.open('Again');
    const second = observers.at(-1);
    ok('re-open observes the host with a fresh observer', second !== first && second.live && second.targets.has(tile));
    // The 100px host is narrower than the 300px panel, which is capped to it
    // and starts at the host's left edge (BUG-0035), not at -200px.
    check('re-open re-reads the rect', geometry(panel).left, '0px');
    panel.dispose();
    ok('dispose() disconnects', !second.live);
}

if (failures) {
    console.error(`\n${SUITE}: ${failures} assertion(s) FAILED`);
    process.exit(1);
}
console.log('\nall assertions passed');
