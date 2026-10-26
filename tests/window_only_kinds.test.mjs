/**
 * STORY-0127 — A CONTENT KIND CAN LIVE IN A WINDOW ONLY, WITH ITS OWN WINDOW SIZE.
 *
 *   §0  createTaxonomy validates `window` and `windowOnly`; the root and a
 *       top-nav page cannot be window-only; isWindowOnly / windowSize answer
 *   §1  every open path opens a window-only kind in its window (once, being
 *       single), never in a tile, at the kind's window size
 *   §2  a kind with only a `window` size opens in a window of that size when
 *       asked to, and in tiles otherwise
 *   §3  a restored layout drops its tile tabs, with one warning; asked for
 *       again it opens in a window
 *
 *     node tests/window_only_kinds.test.mjs
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';
import { existsSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));

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
    console.log('window-only kinds: SKIPPED — needs jsdom '
        + '(`cd ../Tables/web && npm install`, or `npm i -D jsdom` here)');
    process.exit(0);
}

const dom = new JSDOM('<!doctype html><body><nav id="nav"></nav><div id="root"></div></body>',
                      { url: 'http://localhost/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'Event',
                   'CustomEvent', 'MouseEvent', 'PointerEvent', 'KeyboardEvent',
                   'DragEvent', 'getComputedStyle', 'navigator', 'requestAnimationFrame',
                   'cancelAnimationFrame', 'MutationObserver', 'ResizeObserver',
                   'DOMRect', 'localStorage']) {
    if (dom.window[key] !== undefined && globalThis[key] === undefined) {
        globalThis[key] = dom.window[key];
    }
}
if (globalThis.PointerEvent === undefined) globalThis.PointerEvent = dom.window.MouseEvent;
if (globalThis.ResizeObserver === undefined) {
    globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
}
if (globalThis.CSS === undefined) {
    globalThis.CSS = { escape: (s) => String(s).replace(/["\\]/g, '\\$&') };
}

const { createShell } = await import('../src/tiling/shell.js');
const { createTaxonomy } = await import('../src/tiling/kind_taxonomy.js');
const { createEntityCatalog } = await import('../src/tiling/entity_sources.js');
const { createCommandPalette } = await import('../src/tiling/command_palette.js');
const { createHost } = await import('../src/host/host.js');
const { hideContextMenu } = await import('../src/ui/components/context_menu.js');
const { saveDesktops } = await import('../src/tiling/desktops.js');
const { TileTree } = await import('../src/tiling/tile_tree.js');

let failures = 0;
function check(name, actual, expected) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) { failures++; console.error(`  FAIL ${name}\n    got      ${a}\n    expected ${e}`); }
    else console.log(`  ok   ${name}`);
}
function ok(name, cond, why = '') {
    if (cond) { console.log(`  ok   ${name}`); return; }
    failures++;
    console.error(`  FAIL ${name}${why ? `\n    ${why}` : ''}`);
}
function throws(name, fn, re) {
    try { fn(); } catch (err) { ok(name, re.test(String(err?.message)), String(err?.message)); return; }
    failures++;
    console.error(`  FAIL ${name}\n    did not throw`);
}
const tick = () => new Promise((r) => setTimeout(r, 0));
const chord = (key, mods = {}) => dom.window.document.body.dispatchEvent(new dom.window.KeyboardEvent(
    'keydown', { key, altKey: true, bubbles: true, cancelable: true, ...mods }));


const KINDS = {
    home:  { label: 'Home', icon: 'home', isTopNav: true, order: 0 },
    sheet: { label: 'Sheet', icon: 'table', topNav: 'home' },
    tool:  { label: 'Estimation', icon: 'tune', single: true, windowOnly: true, window: { width: 1100, height: 700 } },
    sized: { label: 'Sized', icon: 'crop', window: { width: 900 } },
};
const taxonomy = createTaxonomy({ root: 'home', kinds: KINDS });

console.log('\n§0 createTaxonomy window / windowOnly');
throws('windowOnly must be a boolean',
    () => createTaxonomy({ root: 'home', kinds: { home: {}, x: { windowOnly: 'yes' } } }), /windowOnly must be true or false/);
throws('window must be positive px',
    () => createTaxonomy({ root: 'home', kinds: { home: {}, x: { window: { width: -1 } } } }), /window must be \{ width\?, height\? \}/);
throws('the root cannot be window-only',
    () => createTaxonomy({ root: 'home', kinds: { home: { windowOnly: true } } }), /root kind 'home' cannot be windowOnly/);
throws('a top-nav page cannot be window-only',
    () => createTaxonomy({ root: 'home', kinds: { home: {}, p: { isTopNav: true, windowOnly: true } } }), /cannot be windowOnly/);
check('isWindowOnly', ['tool', 'sheet', 'nope'].map((k) => taxonomy.isWindowOnly(k)), [true, false, false]);
check('windowSize', [taxonomy.windowSize('tool'), taxonomy.windowSize('sized'), taxonomy.windowSize('sheet')],
    [{ width: 1100, height: 700 }, { width: 900, height: null }, null]);

const mounts = [];
const counted = (kind) => (hostEl, props, ctx) => {
    hostEl.textContent = kind;
    const m = { kind, leafId: ctx?.leafId ?? null, windowId: ctx?.windowId ?? null, alive: true };
    mounts.push(m);
    return { destroy() { m.alive = false; } };
};
const content = Object.fromEntries(Object.keys(KINDS).map((k) => [k, counted(k)]));
const store = new Map();
const host = createHost({ state: {
    read: async (k) => (store.has(k) ? JSON.parse(store.get(k)) : null),
    write: async (k, v) => { store.set(k, JSON.stringify(v)); return true; },
} });
const warnings = [];
const logger = { warn: (msg) => warnings.push(String(msg)), info() {}, debug() {}, error() {} };
async function build() {
    return createShell({
        root: dom.window.document.getElementById('root'), host, taxonomy, content, logger,
        entities: createEntityCatalog({ sources: [] }),
        chrome: { topNav: dom.window.document.getElementById('nav') },
        panels: { left: false, right: false, bottom: false },
    });
}
let shell = await build();
let wm = shell.wm;
await tick();
const tileKinds = () => wm.desktops.desktops.flatMap((d) => d.tree.leaves().flatMap((l) => (l.tabs || []).map((t) => t.kind)));
const windows = (kind) => [...wm._windowToLeaf.values()].filter((r) => r.original?.kind === kind);

console.log('\n§1 every open path opens a window-only kind in its window');
for (const [name, open] of [
    ['navigate (main)', () => wm.navigate('tool')],
    ['navigate (origin, new tab)', () => wm.navigate('tool', {}, { dest: 'origin', newTab: true })],
    ['openInPrimary', () => wm.openInPrimary('tool')],
    ['openInLeaf', () => wm.openInLeaf(wm.desktops.active().tree.primaryLeafId(), 'tool')],
    ['openInTabInPrimary', () => wm.openInTabInPrimary('tool')],
    ['splitLeafWith', () => wm.splitLeafWith(wm.desktops.active().tree.primaryLeafId(), 'h', 'tool')],
]) {
    open();
    await tick();
    check(`${name}: one window, no tile tab`, [windows('tool').length, tileKinds().includes('tool')], [1, false]);
}
check('it was mounted once, in a window', mounts.filter((m) => m.kind === 'tool').map((m) => !!m.windowId), [true]);
const toolWin = windows('tool')[0].window;
check('the window takes the kind\'s size', [toolWin.defaultWidth, toolWin.defaultHeight], [1100, 700]);

console.log('\n§2 a kind with a window size but not window-only');
wm.navigate('sized', {}, { dest: 'window' });
await tick();
check('opens in a window of its width when asked to', windows('sized')[0]?.window.defaultWidth, 900);
wm.navigate('sized');
await tick();
ok('…and in a tile otherwise', tileKinds().includes('sized'));

console.log('\n§3 a restored layout drops a window-only kind\'s tile tabs');
{
    const t0 = wm.desktops.active().tree;
    const leaf = t0.primaryLeafId();
    t0.appendLeafTab(leaf, { kind: 'tool', props: {} }, 'Estimation');
    const second = t0.split(leaf, 'h');
    t0.setLeafContent(second, { kind: 'tool', props: {} }, 'Estimation');
    const blob = wm.desktops.serialize();
    shell.dispose();
    await tick();
    await saveDesktops(host.state, blob);
    mounts.length = 0;
    warnings.length = 0;
    shell = await build();
    wm = shell.wm;
    await tick();
    check('no tile holds it after the restore', tileKinds().includes('tool'), false);
    check('nothing of it was mounted', mounts.filter((m) => m.kind === 'tool').length, 0);
    ok('one warning names it', warnings.filter((w) => /window-only/.test(w)).length === 1, JSON.stringify(warnings));
    ok('the rest of the layout stays', tileKinds().includes('sized'));
    wm.navigate('tool');
    await tick();
    check('asked for again, it opens in a window', windows('tool').length, 1);
}

shell.dispose();
console.log(failures === 0 ? '\nwindow-only kinds: all passed' : `\nwindow-only kinds: ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
