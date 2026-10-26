/**
 * STORY-0130 — A SINGLE-INSTANCE KIND CAN BE SINGLE PER DESKTOP: OPENING IT
 * OPENS OR REVEALS IT ON THE ACTIVE DESKTOP.
 *
 * A virtual desktop is the tiles and panels the user arranged on it. A KindDef
 * with `single: 'desktop'` has at most one instance per desktop: every open
 * path looks only at the active desktop (its tiles, their archived pages and
 * the windows on it), reveals the instance there, or opens one there when the
 * desktop has none. `single: true` stays app-wide.
 *
 * Against a REAL `createShell` in jsdom; content factories count their live
 * mounts.
 *
 *   §0  createTaxonomy: `single: 'desktop'` is accepted, `isSinglePerDesktop`,
 *       `instanceKey` ignores props
 *   §1  navigate and the top-nav button on desktop 2 open a second instance
 *       there; desktop 1 keeps its own; opening again reveals the one on the
 *       ACTIVE desktop, from a live tab or an archived page, never switching
 *   §2  the copy verbs stay refused; a window contained to a pane on the
 *       desktop is its instance; `single: true` still switches desktop
 *   §3  a reload keeps one per desktop, and drops a second on one desktop
 *
 *     node tests/single_per_desktop.test.mjs
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
    console.log('single per desktop: SKIPPED — needs jsdom '
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
const { createHost } = await import('../src/host/host.js');
const { saveDesktops } = await import('../src/tiling/desktops.js');

let failures = 0;
function check(name, actual, expected) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) { failures++; console.error(`  FAIL ${name}\n    got      ${a}\n    expected ${e}`); }
    else console.log(`  ok   ${name}`);
}
const tick = () => new Promise((r) => setTimeout(r, 0));
const chord = (key, mods = {}) => dom.window.document.body.dispatchEvent(new dom.window.KeyboardEvent(
    'keydown', { key, altKey: true, bubbles: true, cancelable: true, ...mods }));

const KINDS = {
    home:     { label: 'Home', icon: 'home', isTopNav: true, order: 0 },
    model:    { label: 'Model', icon: 'hub', isTopNav: true, order: 1, single: 'desktop' },
    notebook: { label: 'Notebook', icon: 'book', isTopNav: true, order: 2, single: true },
    sheet:    { label: 'Sheet', icon: 'table', topNav: 'home' },
};
const taxonomy = createTaxonomy({ root: 'home', kinds: KINDS });

// ── §0 the taxonomy ─────────────────────────────────────────────────────
console.log('\n§0 createTaxonomy single: \'desktop\'');
check('isSingle and isSinglePerDesktop',
    ['model', 'notebook', 'sheet'].map((k) => [taxonomy.isSingle(k), taxonomy.isSinglePerDesktop(k)]),
    [[true, true], [true, false], [false, false]]);
check('instanceKey is one per kind, whatever the props',
    taxonomy.instanceKey('model', { desktop: 1 }) === taxonomy.instanceKey('model', { desktop: 2 }), true);

// ── the shell ───────────────────────────────────────────────────────────
const mounts = [];
const counted = (kind) => (hostEl, props, ctx) => {
    hostEl.textContent = kind;
    const m = { kind, leafId: ctx?.leafId ?? null, windowId: ctx?.windowId ?? null, alive: true };
    mounts.push(m);
    return { destroy() { m.alive = false; } };
};
const live = (kind) => mounts.filter((m) => m.alive && m.kind === kind);
const content = Object.fromEntries(Object.keys(KINDS).map((k) => [k, counted(k)]));

const store = new Map();
const host = createHost({ state: {
    read: async (k) => (store.has(k) ? JSON.parse(store.get(k)) : null),
    write: async (k, v) => { store.set(k, JSON.stringify(v)); return true; },
} });

async function build() {
    return createShell({
        root: dom.window.document.getElementById('root'), host, taxonomy, content,
        entities: createEntityCatalog({ sources: [] }),
        chrome: { topNav: dom.window.document.getElementById('nav') },
        panels: { left: false, right: false, bottom: false },
        promoteInPlace: true,
    });
}

let shell = await build();
let wm = shell.wm;
await tick();

/** How many tabs of `kind` each desktop's tiles hold. */
const perDesktop = (kind) => wm.desktops.desktops.map((d) => d.tree.leaves()
    .reduce((n, l) => n + (l.tabs || []).filter((t) => t.kind === kind).length, 0));
const activeKind = (d) => {
    const tree = wm.desktops.desktops[d].tree;
    const leaf = tree.get(tree.primaryLeafId());
    return leaf?.tabs?.[leaf.activeTabIdx]?.kind;
};
const navBtn = (kind) => dom.window.document.querySelector(`#nav [data-kind="${kind}"]`);

// ── §1 ──────────────────────────────────────────────────────────────────
console.log('\n§1 opening a per-desktop kind opens it on the active desktop');
{
    wm.navigate('model', {});
    await tick();
    check('navigate on desktop 1 opens the model there', [wm.desktops.activeIdx, perDesktop('model')[0]], [0, 1]);

    wm.switchDesktop(1);
    await tick();
    wm.navigate('model', {});
    await tick();
    check('navigate on desktop 2 opens a second model there, staying on desktop 2',
        [wm.desktops.activeIdx, perDesktop('model').slice(0, 2), live('model').length], [1, [1, 1], 1]);
    check('findInstance answers the active desktop\'s', wm.findInstance('model')?.desktopIdx, 1);

    wm.switchDesktop(0);
    await tick();
    check('desktop 1 keeps its own', [activeKind(0), live('model').length], ['model', 1]);

    // The top-nav button, on a desktop whose tile shows another page.
    wm.switchDesktop(1);
    wm.openInPrimary('home');
    await tick();
    check('desktop 2 left the model page: it is archived', [activeKind(1), live('model').length], ['home', 0]);
    const before = mounts.length;
    navBtn('model').click();
    await tick();
    check('the top-nav button brings back desktop 2\'s own model, on desktop 2',
        [wm.desktops.activeIdx, activeKind(1), perDesktop('model').slice(0, 2), mounts.length - before],
        [1, 'model', [1, 1], 1]);
    navBtn('model').click();
    wm.navigate('model', {});
    wm.openInTabInPrimary('model');
    await tick();
    check('opening it again on desktop 2 reveals it there, with no new mount',
        [wm.desktops.activeIdx, perDesktop('model').slice(0, 2), mounts.length - before], [1, [1, 1], 1]);

    // A desktop that never had one: the top-nav button opens one there.
    while (wm.desktops.desktops.length < 3) wm.addDesktop();
    wm.switchDesktop(2);
    await tick();
    navBtn('model').click();
    await tick();
    check('the top-nav button on a third desktop opens a third model there',
        [wm.desktops.activeIdx, activeKind(2), perDesktop('model').slice(0, 3)], [2, 'model', [1, 1, 1]]);
    wm.switchDesktop(1);
    await tick();
}

// ── §2 ──────────────────────────────────────────────────────────────────
console.log('\n§2 copy verbs refuse; a window on the desktop is its instance; single: true is app-wide');
{
    const tree = wm.desktops.active().tree;
    const leafId = tree.primaryLeafId();
    tree.focus(leafId);
    const before = mounts.length;
    chord('t');
    chord('n');
    await tick();
    check('Alt+T and Alt+N copy nothing on desktop 2',
        [perDesktop('model')[1], wm._windowToLeaf.size, mounts.length - before], [1, 0, 0]);

    // Float desktop 2's model into a window contained to its pane.
    const winId = wm.floatPane(leafId);
    await tick();
    check('desktop 2\'s model floated into a window on desktop 2',
        [!!winId, perDesktop('model')[1], wm.findInstance('model')?.where], [true, 0, 'window']);
    wm.navigate('model', {});
    await tick();
    check('navigate on desktop 2 reveals that window: no tile copy', [wm.desktops.activeIdx, perDesktop('model')[1]], [1, 0]);
    wm.switchDesktop(0);
    await tick();
    check('on desktop 1 the window is not desktop 1\'s instance', wm.findInstance('model')?.where, 'tab');
    wm.navigate('model', {});
    await tick();
    check('…and navigate there reveals desktop 1\'s tab', [wm.desktops.activeIdx, activeKind(0)], [0, 'model']);
    wm.switchDesktop(1);
    await tick();
    wm.bringBackWindow(winId);
    await tick();
    check('docked back, desktop 2 holds its one model again', [wm._windowToLeaf.size, perDesktop('model')[1]], [0, 1]);

    // single: true is unchanged: open on desktop 1, asked for on desktop 2.
    wm.switchDesktop(0);
    wm.openInTabInPrimary('notebook');
    await tick();
    wm.switchDesktop(1);
    await tick();
    navBtn('notebook').click();
    await tick();
    check('single: true still switches to the desktop that has it',
        [wm.desktops.activeIdx, perDesktop('notebook').slice(0, 2)], [0, [1, 0]]);
}

// ── §3 ──────────────────────────────────────────────────────────────────
console.log('\n§3 a reload keeps one per desktop');
{
    // Hand-build a second model on desktop 2 — the WM refuses to.
    const t1 = wm.desktops.desktops[1].tree;
    const extra = t1.split(t1.primaryLeafId(), 'h');
    t1.setLeafContent(extra, { kind: 'model', props: {} }, 'Model');
    const counts = perDesktop('model');
    check('the saved layout holds two models on desktop 2', counts[1], 2);
    const blob = wm.desktops.serialize();
    shell.dispose();
    await tick();
    await saveDesktops(host.state, blob);

    mounts.length = 0;
    shell = await build();
    wm = shell.wm;
    await tick();
    check('restored: one model on each desktop that had one',
        perDesktop('model'), counts.map((n) => Math.min(n, 1)));
    check('…and the one notebook stays', perDesktop('notebook').reduce((a, b) => a + b, 0), 1);
    wm.switchDesktop(1);
    await tick();
    navBtn('model').click();
    await tick();
    check('after the reload, the top-nav button on desktop 2 reveals desktop 2\'s',
        [wm.desktops.activeIdx, perDesktop('model')[1], live('model').length], [1, 1, 1]);
}

shell.dispose();
console.log(failures ? `\n${failures} assertion(s) FAILED` : '\nall assertions passed');
process.exit(failures ? 1 : 0);
