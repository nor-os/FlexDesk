/**
 * STORY-0032 — A TAXONOMY KIND CAN BE SINGLE-INSTANCE: OPENING IT REVEALS THE
 * ONE THAT EXISTS.
 *
 * Some content holds heavy app-wide state and must exist once. A KindDef takes
 * `single: true` (one instance of the kind) or `single: '<prop>'` (one per value
 * of that prop). Every open path reveals the instance that exists; the copy
 * verbs refuse; the move verbs carry the one instance; a restored layout with
 * duplicates keeps the first.
 *
 * Against a REAL `createShell` (WindowManager, renderer, keymap, context menu)
 * in jsdom; content factories count their live mounts.
 *
 *   §0  createTaxonomy: `single` is validated, the root cannot be single,
 *       `isSingle` / `instanceKey` / `singleReason`
 *   §1  navigating to a single kind open on another desktop switches to that
 *       desktop and focuses it, with no second mount — from a live tab, from a
 *       top-nav page the tile switched away from, and per prop (`single: 'id'`)
 *   §2  the tile menu greys 'Open a copy in a window' and 'Open in new tab',
 *       each with the reason as its tooltip; a plain kind keeps both
 *   §3  Alt+T opens no new tab; Alt+N no window; Alt+Shift+H/V no split
 *   §4  floating the instance into a window and docking it back keeps one;
 *       opening it while it floats raises the window
 *   §5  a persisted layout with duplicates restores with the first: the other
 *       leaf shows its next tab, or closes
 *   §6  the palette draws split/window refused with the reason, and
 *       Ctrl/Shift+Enter on a single row does nothing
 *   §7  a page-archive restore never brings back a copy of an instance that
 *       moved to another tile while its page was archived (stale archive)
 *   §8  one reveal is one change notification, also when it switches desktop
 *
 * jsdom is borrowed from the sibling Tables checkout; without it this SKIPS,
 * and tests/run.mjs counts a SKIPPED suite as a failure.
 *
 *     node tests/single_instance_kinds.test.mjs
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
    console.log('single instance kinds: SKIPPED — needs jsdom '
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
    home:     { label: 'Home', icon: 'home', isTopNav: true, order: 0 },
    notebook: { label: 'Notebook', icon: 'book', isTopNav: true, order: 1, single: true },
    sheet:    { label: 'Sheet', icon: 'table', topNav: 'home' },
    record:   { label: 'Record', icon: 'article', topNav: 'home', single: 'id' },
    board:    { label: 'Board', icon: 'dashboard', isTopNav: true, order: 2 },
};
const taxonomy = createTaxonomy({ root: 'home', kinds: KINDS });

// ── §0 the taxonomy ─────────────────────────────────────────────────────
console.log('\n§0 createTaxonomy single');
throws('a single that is neither true nor a prop name is refused',
    () => createTaxonomy({ root: 'home', kinds: { home: {}, x: { single: 3 } } }), /single must be true or a prop name/);
throws('an empty prop name is refused',
    () => createTaxonomy({ root: 'home', kinds: { home: {}, x: { single: '' } } }), /single must be true or a prop name/);
throws('the root kind cannot be single',
    () => createTaxonomy({ root: 'home', kinds: { home: { single: true } } }), /root kind 'home' cannot be single/);
check('isSingle: true, prop name, absent',
    ['notebook', 'record', 'sheet', 'nope'].map((k) => taxonomy.isSingle(k)), [true, true, false, false]);
check('instanceKey: one per kind, one per prop value, null for a plain kind',
    [taxonomy.instanceKey('notebook', { id: 1 }) === taxonomy.instanceKey('notebook', { id: 2 }),
     taxonomy.instanceKey('record', { id: 1 }) === taxonomy.instanceKey('record', { id: '1' }),
     taxonomy.instanceKey('record', { id: 1 }) === taxonomy.instanceKey('record', { id: 2 }),
     taxonomy.instanceKey('sheet', { id: 1 })],
    [true, true, false, null]);
ok('singleReason names the kind', /Notebook/.test(taxonomy.singleReason('notebook')));

// ── the shell ───────────────────────────────────────────────────────────
/** Every mount, with whether it is still alive. */
const mounts = [];
const counted = (kind) => (hostEl, props, ctx) => {
    hostEl.textContent = `${kind} ${props?.id ?? ''}`;
    const m = { kind, id: props?.id ?? null, leafId: ctx?.leafId ?? null,
                windowId: ctx?.windowId ?? null, alive: true };
    mounts.push(m);
    return { destroy() { m.alive = false; } };
};
const live = (kind, id = null) => mounts.filter((m) => m.alive && m.kind === kind
    && (id == null || String(m.id) === String(id)));
const content = Object.fromEntries(Object.keys(KINDS).map((k) => [k, counted(k)]));

const store = new Map();
const host = createHost({ state: {
    read: async (k) => (store.has(k) ? JSON.parse(store.get(k)) : null),
    write: async (k, v) => { store.set(k, JSON.stringify(v)); return true; },
} });

async function build() {
    const root = dom.window.document.getElementById('root');
    const nav = dom.window.document.getElementById('nav');
    return createShell({
        root, host, taxonomy, content,
        entities: createEntityCatalog({ sources: [] }),
        chrome: { topNav: nav },
        panels: { left: false, right: false, bottom: false },
        promoteInPlace: true,
    });
}

let shell = await build();
let wm = shell.wm;
await tick();

/** Every tab of `kind` across every desktop's tree and every window. */
function tabsOf(kind) {
    const out = [];
    for (const [d, desk] of wm.desktops.desktops.entries()) {
        for (const leaf of desk.tree.leaves()) {
            (leaf.tabs || []).forEach((t, i) => { if (t.kind === kind) out.push({ d, leafId: leaf.id, i }); });
        }
    }
    for (const [winId, rec] of wm._windowToLeaf) {
        const tabs = rec.tabs?.length ? rec.tabs : (rec.original ? [rec.original] : []);
        tabs.forEach((t, i) => { if (t.kind === kind) out.push({ winId, i }); });
    }
    return out;
}
const activeTab = (tree, leafId) => {
    const leaf = tree.get(leafId);
    return leaf?.tabs?.[leaf.activeTabIdx]?.kind;
};

// ── §1 ──────────────────────────────────────────────────────────────────
console.log('\n§1 navigate reveals the instance on another desktop');
let nbLeaf = null;
{
    wm.openInPrimary('notebook');
    await tick();
    const t0 = wm.desktops.active().tree;
    nbLeaf = t0.primaryLeafId();
    check('the notebook is open once, on desktop 1', [live('notebook').length, wm.desktops.activeIdx], [1, 0]);

    wm.switchDesktop(1);
    await tick();
    check('on desktop 2 the notebook is not mounted', [wm.desktops.activeIdx, live('notebook').length], [1, 0]);
    const before = mounts.length;
    wm.navigate('notebook', {});
    await tick();
    check('navigate switched back to desktop 1', wm.desktops.activeIdx, 0);
    check('…and focused the notebook\'s tile, on its tab',
        [t0.focusedLeafId, activeTab(t0, nbLeaf)], [nbLeaf, 'notebook']);
    check('one live notebook, mounted once by the switch, in that tile',
        [live('notebook').length, mounts.length - before, live('notebook')[0]?.leafId], [1, 1, nbLeaf]);
    check('the tree holds one notebook tab, and desktop 2 got none', tabsOf('notebook'), [{ d: 0, leafId: nbLeaf, i: 0 }]);

    // The top-nav button and every other open path take the same door.
    wm.switchDesktop(1);
    await tick();
    dom.window.document.querySelector('#nav [data-kind="notebook"]').click();
    await tick();
    check('the top-nav button reveals it too', [wm.desktops.activeIdx, live('notebook').length, tabsOf('notebook').length], [0, 1, 1]);
    wm.switchDesktop(1);
    wm.openInTabInPrimary('notebook');
    wm.switchDesktop(1);
    wm.splitLeafWith(wm.desktops.active().tree.primaryLeafId(), 'h', 'notebook');
    wm.switchDesktop(1);
    wm.navigate('notebook', {}, { dest: 'window' });
    await tick();
    check('open-in-tab, split-with and a window open all reveal, never copy',
        [wm.desktops.activeIdx, tabsOf('notebook').length, wm._windowToLeaf.size, live('notebook').length], [0, 1, 0, 1]);
}
{
    // The tile has switched away to another top-nav page: the notebook lives in
    // its archived page tabs, and is brought back from there.
    wm.openInPrimary('home');
    await tick();
    const t0 = wm.desktops.active().tree;
    check('the tile left the notebook page', [activeTab(t0, nbLeaf), live('notebook').length], ['home', 0]);
    wm.switchDesktop(1);
    wm.navigate('notebook', {});
    await tick();
    check('an archived notebook is restored where it was, on desktop 1',
        [wm.desktops.activeIdx, activeTab(t0, nbLeaf), live('notebook').length], [0, 'notebook', 1]);
}
{
    // single: 'id' — one instance per id.
    wm.openInTabInPrimary('record', { id: 7 });
    await tick();
    const t0 = wm.desktops.active().tree;
    wm.switchDesktop(1);
    wm.navigate('record', { id: 8 });
    await tick();
    check('another id is another instance: it opens here', [wm.desktops.activeIdx, live('record', 8).length], [1, 1]);
    wm.navigate('record', { id: '7' });
    await tick();
    check('the same id is revealed on desktop 1, not mounted again',
        [wm.desktops.activeIdx, activeTab(t0, t0.focusedLeafId), live('record', 7).length, tabsOf('record').length],
        [0, 'record', 1, 2]);
    // Put desktop 1 back to the notebook for the next sections.
    wm.navigate('notebook', {});
    await tick();
}

// ── §2 ──────────────────────────────────────────────────────────────────
console.log('\n§2 the tile menu refuses the copy verbs, with a reason');
const menuRow = (label) => [...dom.window.document.querySelectorAll('.twm-context-menu .twm-context-menu-item')]
    .find((b) => b.querySelector('span:last-child')?.textContent.trim() === label);
{
    wm.ctx.onTileContextMenu(nbLeaf, 10, 10);
    const copy = menuRow('Open a copy in a window');
    const tab = menuRow('Open in new tab');
    ok('the menu has the row', !!copy);
    check('\'Open a copy in a window\' is greyed, with a tooltip',
        [copy?.disabled, copy?.classList.contains('disabled'), copy?.getAttribute('aria-disabled'), copy?.title],
        [true, true, 'true', taxonomy.singleReason('notebook')]);
    check('\'Open in new tab\' likewise', [tab?.disabled, tab?.title], [true, taxonomy.singleReason('notebook')]);
    check('the move verbs stay offered: float, and move to another desktop',
        [menuRow('Float this pane as a window')?.disabled, menuRow(`Move to desktop ${wm.desktops.desktops[1].label}`)?.disabled],
        [false, false]);
    hideContextMenu();

    const tree = wm.desktops.active().tree;
    const sheetLeaf = wm.splitLeafWith(nbLeaf, 'h', 'sheet', { id: 's1' });
    await tick();
    wm.ctx.onTileContextMenu(sheetLeaf, 10, 10);
    check('a plain kind keeps both, with no tooltip',
        [menuRow('Open a copy in a window')?.disabled, menuRow('Open in new tab')?.disabled,
         menuRow('Open a copy in a window')?.title],
        [false, false, '']);
    hideContextMenu();
    tree.focus(sheetLeaf);
    wm.closeFocused();
    await tick();
    tree.focus(nbLeaf);
    wm.renderer.render();
}

// ── §3 ──────────────────────────────────────────────────────────────────
console.log('\n§3 the copy chords do nothing on a single kind');
{
    const tree = wm.desktops.active().tree;
    tree.focus(nbLeaf);
    const leaves = tree.leaves().length;
    const tabs = tree.get(nbLeaf).tabs.length;
    const before = mounts.length;
    chord('t');
    await tick();
    check('Alt+T opens no new tab', [tree.get(nbLeaf).tabs.length, tabsOf('notebook').length, mounts.length - before],
        [tabs, 1, 0]);
    chord('n');
    await tick();
    check('Alt+N opens no window', [wm._windowToLeaf.size, mounts.length - before], [0, 0]);
    chord('H', { shiftKey: true });
    chord('V', { shiftKey: true });
    await tick();
    check('Alt+Shift+H / V split nothing', [tree.leaves().length, mounts.length - before], [leaves, 0]);

    // The same chord on a plain kind still copies.
    wm.openInTabInPrimary('sheet', { id: 's2' });
    await tick();
    const n = tree.get(nbLeaf).tabs.length;
    chord('t');
    await tick();
    check('Alt+T on a plain kind still opens a tab', tree.get(nbLeaf).tabs.length, n + 1);
    // Back to the notebook tab alone.
    tree.closeOtherTabs(nbLeaf, tree.get(nbLeaf).tabs.findIndex((t) => t.kind === 'notebook'));
    wm.renderer.render();
    await tick();
}

// ── §4 ──────────────────────────────────────────────────────────────────
console.log('\n§4 float and dock carry the one instance');
{
    const tree = wm.desktops.active().tree;
    check('start: one notebook tab, one live mount', [tabsOf('notebook').length, live('notebook').length], [1, 1]);
    const winId = wm.floatPane(nbLeaf);
    await tick();
    ok('the pane floated into a window', !!winId && wm._windowToLeaf.has(winId));
    check('floated: one notebook, in the window', [tabsOf('notebook'), live('notebook').length, live('notebook')[0]?.windowId],
        [[{ winId, i: 0 }], 1, winId]);

    const before = mounts.filter((m) => m.kind === 'notebook').length;
    let shown = 0;
    const win = wm._windowToLeaf.get(winId).window;
    const show = win.show.bind(win);
    win.show = (...a) => { shown++; return show(...a); };
    wm.switchDesktop(1);
    wm.navigate('notebook', {});
    await tick();
    check('opening it while it floats raises the window and mounts nothing',
        [shown > 0, wm._windowToLeaf.size, mounts.filter((m) => m.kind === 'notebook').length - before,
         tabsOf('notebook').length, wm.desktops.activeIdx], [true, 1, 0, 1, 0]);
    wm.switchDesktop(0);
    await tick();

    ok('bringBackWindow docks it', wm.bringBackWindow(winId));
    await tick();
    check('docked: no window, one notebook tab in a tile, one live mount',
        [wm._windowToLeaf.size, tabsOf('notebook').length, live('notebook').length, !!live('notebook')[0]?.leafId],
        [0, 1, 1, true]);
    nbLeaf = tabsOf('notebook')[0]?.leafId;

    // Alt+F both ways.
    tree.focus(nbLeaf);
    chord('f');
    await tick();
    const w2 = [...wm._windowToLeaf.keys()][0];
    check('Alt+F floats it: one notebook', [wm._windowToLeaf.size, live('notebook').length, tabsOf('notebook').length], [1, 1, 1]);
    wm.bringBackWindow(w2);
    await tick();
    check('…and back: one notebook', [wm._windowToLeaf.size, live('notebook').length, tabsOf('notebook').length], [0, 1, 1]);
    nbLeaf = tabsOf('notebook')[0]?.leafId;
}

// ── §5 ──────────────────────────────────────────────────────────────────
console.log('\n§5 a restored layout with duplicates keeps the first');
{
    // Hand-build the duplicates straight into the trees — the WM refuses to.
    const t0 = wm.desktops.desktops[0].tree;
    const first = nbLeaf;
    const second = t0.split(first, 'h');
    t0.setLeafContent(second, { kind: 'notebook', props: {} }, 'Notebook');
    t0.appendLeafTab(second, { kind: 'sheet', props: { id: 'next' } }, 'Sheet');
    t0.setActiveLeafTab(second, 0);
    const third = t0.split(second, 'v');
    t0.setLeafContent(third, { kind: 'notebook', props: {} }, 'Notebook');
    const t1 = wm.desktops.desktops[1].tree;
    t1.setLeafContent(t1.primaryLeafId(), { kind: 'notebook', props: {} }, 'Notebook');
    check('the saved layout holds four notebooks', tabsOf('notebook').length, 4);
    // Leaf ids are minted afresh on restore, so leaves are compared in order.
    const kindsOf = (tree) => tree.leaves().filter((l) => !String(l.content?.kind || '').startsWith('panel:'))
        .map((l) => ({ tabs: (l.tabs || []).map((t) => t.kind), active: l.tabs?.[l.activeTabIdx]?.kind }));
    const firstLeaf = kindsOf(t0)[0];
    check('…the first in the first leaf', firstLeaf.tabs.filter((k) => k === 'notebook').length, 1);
    const blob = wm.desktops.serialize();
    shell.dispose();
    await tick();
    await saveDesktops(host.state, blob);

    mounts.length = 0;
    shell = await build();
    wm = shell.wm;
    await tick();
    const r0 = wm.desktops.desktops[0].tree;
    const after = kindsOf(r0);
    check('restored: the first leaf is as it was, holding the one notebook', after[0], firstLeaf);
    check('the second leaf shows its next tab', after[1], { tabs: ['sheet'], active: 'sheet' });
    check('the third leaf, holding nothing else, closed', after.length, 2);
    check('one notebook tab in the whole layout, in the first leaf',
        tabsOf('notebook').map((t) => [t.d, t.leafId]), [[0, r0.leaves().find((l) => (l.tabs || []).some((t) => t.kind === 'notebook'))?.id]]);
    check('no window was restored', wm._windowToLeaf.size, 0);
    const r1 = wm.desktops.desktops[1].tree;
    check('desktop 2\'s only leaf held only the duplicate: it is the home seed now',
        r1.leaves().filter((l) => !String(l.content?.kind || '').startsWith('panel:')).map((l) => l.content?.kind), ['home']);
    check('one live notebook mount', live('notebook').length, 1);
    // And the deduplicated layout is what is saved next.
    await new Promise((r) => setTimeout(r, 700));
    const saved = JSON.parse(store.get('desktops') || '{}');
    const savedTrees = (saved.desktops || []).map((d) => TileTree.deserialize?.(d.tree)).filter(Boolean);
    const savedCount = savedTrees.reduce((n, t) =>
        n + t.leaves().reduce((m, l) => m + (l.tabs || []).filter((x) => x.kind === 'notebook').length, 0), 0);
    check('the deduplicated layout is persisted', savedCount, 1);
}

// ── §6 ──────────────────────────────────────────────────────────────────
console.log('\n§6 the palette refuses split and window for a single row');
{
    const picks = [];
    const catalog = createEntityCatalog({ sources: [
        { navKind: 'record', list: async () => [{ id: 'r1', n: 'Ledger record' }],
          shape: (r) => ({ id: r.id, label: r.n, modes: ['split', 'window'] }) },
        { navKind: 'sheet', list: async () => [{ id: 's1', n: 'Ledger sheet' }],
          shape: (r) => ({ id: r.id, label: r.n, modes: ['split', 'window'] }) },
    ] });
    const stub = { openInPrimary: () => {}, isPanelOpen: () => false, togglePanel: () => {}, content: { has: () => true } };
    const p = createCommandPalette({ wm: stub, api: {}, taxonomy, catalog, layout: 'grouped',
        chrome: { pages: false, panels: false }, onPick: (pick, how) => { picks.push([pick.kind, how.mode]); return true; } });
    const input = () => dom.window.document.querySelector('.twm-cmdpal__input');
    const type = (t) => { input().value = t; input().dispatchEvent(new dom.window.Event('input', { bubbles: true })); };
    const key = (k, mods = {}) => input().dispatchEvent(new dom.window.KeyboardEvent('keydown',
        { key: k, bubbles: true, cancelable: true, ...mods }));

    await p.open(); await tick();
    type('ledger record');
    await tick();
    const refused = [...dom.window.document.querySelectorAll('.twm-cmdpal__item--active .twm-cmdpal__act--disabled')];
    check('split and window are drawn refused, with the reason',
        refused.map((s) => [s.textContent.replace(/\s+/g, ' ').trim(), s.title]),
        [['Ctrl Enter split', taxonomy.singleReason('record')], ['Shift Enter window', taxonomy.singleReason('record')]]);
    key('Enter', { ctrlKey: true });
    key('Enter', { shiftKey: true });
    check('Ctrl/Shift+Enter pick nothing, and the palette stays open', [picks, p.isOpen?.() ?? !!input()], [[], true]);
    key('Enter');
    check('Enter still opens it', picks, [['record', 'open']]);

    await p.open(); await tick();
    type('ledger sheet');
    await tick();
    check('a plain row draws no refused hint',
        dom.window.document.querySelectorAll('.twm-cmdpal__item--active .twm-cmdpal__act--disabled').length, 0);
    key('Enter', { ctrlKey: true });
    check('…and splits', picks.at(-1), ['sheet', 'split']);
}

// ── §7 ──────────────────────────────────────────────────────────────────
console.log('\n§7 a page-archive restore never copies an instance that moved away');
shell.dispose();
store.clear();
shell = await build();
wm = shell.wm;
await tick();
{
    const tree = wm.desktops.active().tree;
    wm.openInPrimary('home');
    const A = tree.primaryLeafId();
    wm.openInTabInPrimary('record', { id: 7 });
    wm.openInPrimary('board');
    wm.openInPrimary('home');
    await tick();
    check('leaf A holds home and record 7, on the home page',
        tree.get(A).tabs.map((t) => t.kind), ['home', 'record']);
    // Moving record 7 to its own tile is a move verb: allowed. The tile's
    // home archive still lists it.
    const idx = tree.get(A).tabs.findIndex((t) => t.kind === 'record');
    const B = wm.moveTabInto(A, idx, { leafId: A, mode: 'split', dir: 'h' });
    await tick();
    ok('record 7 moved into a new leaf', B && B !== A, `got ${B}`);
    // A leaves the home page by a path other than swapToPage …
    wm.navigateActiveTab(A, 'board');
    // … and comes back to it, restoring the home archive.
    tree.focus(A);
    wm.openInPrimary('home');
    await tick();
    check('record 7 has one tab, in leaf B', tabsOf('record').map((t) => t.leafId), [B]);
    check('…and one live mount', live('record', 7).length, 1);
    check('leaf A came back to its home page without it', tree.get(A).tabs.map((t) => t.kind), ['home']);
    // Back takes the same door: walk A away and back with history.
    wm.openInPrimary('board');
    wm._popTabHistory(A);
    await tick();
    check('Back to the home page restores no copy either',
        [tabsOf('record').map((t) => t.leafId), live('record', 7).length], [[B], 1]);
}

// ── §8 ──────────────────────────────────────────────────────────────────
console.log('\n§8 one reveal, one notification');
{
    const reasons = [];
    const prev = wm.onChange;
    wm.onChange = (r) => { reasons.push(r); prev?.(r); };
    const d0 = wm.desktops.activeIdx;
    wm.switchDesktop(d0 === 0 ? 1 : 0);
    reasons.length = 0;
    wm.navigate('record', { id: 7 });
    await tick();
    check('a reveal that switches desktop notifies once', [wm.desktops.activeIdx, reasons], [d0, ['single-reveal']]);
    reasons.length = 0;
    wm.navigate('record', { id: 7 });
    await tick();
    check('a reveal on this desktop notifies once', [reasons, live('record', 7).length], [['single-reveal'], 1]);
    // Floated, on a window that is not showing that tab, on another desktop:
    // showWindowTab and the desktop switch would each notify.
    const recLeaf = tabsOf('record')[0]?.leafId;
    const winId = wm.floatPane(recLeaf);
    await tick();
    ok('record 7 floated into a window', !!winId && wm._windowToLeaf.has(winId));
    const rec = wm._windowToLeaf.get(winId);
    if (Array.isArray(rec.tabs) && rec.tabs.length < 2) {
        rec.tabs.push({ kind: 'sheet', props: {}, title: 'Sheet', history: [] });
    }
    wm.showWindowTab(winId, rec.tabs.length - 1);
    wm.switchDesktop(1);
    await tick();
    reasons.length = 0;
    wm.navigate('record', { id: 7 });
    await tick();
    check('a window reveal across desktops notifies once',
        [wm.desktops.activeIdx, rec.tabs[rec.activeTabIdx]?.kind, reasons], [0, 'record', ['single-reveal']]);
    wm.onChange = prev;
}

shell.dispose();
console.log(failures ? `\n${failures} assertion(s) FAILED` : '\nall assertions passed');
process.exit(failures ? 1 : 0);
