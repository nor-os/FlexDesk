/**
 * PAGE SURFACES — `createShell({ pageSurfaces: true })`: A DESKTOP SHOWS ONE
 * TOP-NAV PAGE AT A TIME.
 *
 * Opening a kind of another page puts that page's whole surface on screen (its
 * tiles, splits and windows) and keeps the one left for when it comes back. A
 * split divides the page it is in. The panels are the desktop's, not a page's:
 * they stay open, and their mounted contents survive a page switch.
 *
 * Against a REAL `createShell` in jsdom; content factories count their live
 * mounts.
 *
 *   §1  a split on page A seeds the root; the page stays A, the rail lights A
 *   §2  opening page B leaves A's tiles behind; B is alone on screen; coming
 *       back to A restores its split; B's surface is kept the same way
 *   §3  the panels survive a page switch: one mount each, never remounted
 *   §4  a window of page A goes back into A's tiles when B opens; a window of
 *       no page (a window-only tool) stays open
 *   §5  every open verb with another page's kind switches the surface:
 *       navigate (origin, tab, split, window), openFromContext, openInLeaf
 *   §6  a reload keeps the surfaces: the page on screen and the other's split
 *   §7  a layout holding two pages on one desktop is separated on load
 *   §8  each desktop has its own surfaces; a `single: true` kind kept in
 *       another desktop's surface is revealed there
 *   §9  without the option nothing changes: a page opens in the focused tile
 *       only, beside the other page
 *   §10 a kind of no page (a welcome) opens in the surface on screen; a page
 *       opened from a surface left holding nothing of its page takes that
 *       surface when it has none, and lets it go when it has one; no tile
 *       keeps a page archive of its own
 *   §11 within a page, opening a kind keeps the tile's history (Back); props a
 *       content takes off its tab are gone from the surface saved for it
 *
 *     node tests/page_surfaces.test.mjs
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
    console.log('page surfaces: SKIPPED — needs jsdom '
        + '(`cd ../Tables/web && npm install`, or `npm i -D jsdom` here)');
    process.exit(0);
}

const dom = new JSDOM('<!doctype html><body><nav id="rail"></nav><div id="root"></div></body>',
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

const KINDS = {
    start: { label: 'Start', icon: 'apps' },
    alpha: { label: 'Alpha', icon: 'looks_one', isTopNav: true, order: 1, single: 'desktop' },
    beta:  { label: 'Beta', icon: 'looks_two', isTopNav: true, order: 2, single: 'desktop' },
    item:  { label: 'Item', icon: 'description', topNav: 'beta' },
    gamma: { label: 'Gamma', icon: 'looks_3', isTopNav: true, order: 3, single: true },
    tool:  { label: 'Tool', icon: 'build', single: true, windowOnly: true },
    welcome: { label: 'Welcome', icon: 'waving_hand', single: true },
};
const taxonomy = createTaxonomy({ root: 'start', kinds: KINDS });

const mounts = [];
const counted = (kind) => (hostEl, props, ctx) => {
    hostEl.textContent = kind;
    const m = { kind, props, leafId: ctx?.leafId ?? null, windowId: ctx?.windowId ?? null, alive: true };
    mounts.push(m);
    return { destroy() { m.alive = false; } };
};
const live = (kind) => mounts.filter((m) => m.alive && m.kind === kind);
const liveCount = (kind) => live(kind).length;
const content = {
    ...Object.fromEntries(Object.keys(KINDS).map((k) => [k, counted(k)])),
    'panel:left': counted('panel:left'),
    'panel:bottom': counted('panel:bottom'),
};

const store = new Map();
const host = createHost({ state: {
    read: async (k) => (store.has(k) ? JSON.parse(store.get(k)) : null),
    write: async (k, v) => { store.set(k, JSON.stringify(v)); return true; },
} });

async function build({ pageSurfaces = true } = {}) {
    for (const m of mounts) m.alive = false;
    mounts.length = 0;
    const root = dom.window.document.getElementById('root');
    root.replaceChildren();
    const rail = dom.window.document.getElementById('rail');
    rail.replaceChildren();
    return createShell({
        root, host, taxonomy, content,
        entities: createEntityCatalog({ sources: [] }),
        chrome: { rail },
        panels: { left: true, right: false, bottom: true },
        pageSurfaces,
    });
}

/** The kinds of the active tree's content tiles (not panels), in tree order. */
const tiles = (wm) => wm.desktops.active().tree.leaves()
    .map((l) => l.content?.kind)
    .filter((k) => k && !k.startsWith('panel:'));
const litRail = () => [...dom.window.document.querySelectorAll('#rail .twm-fl-item--on')]
    .map((b) => b.dataset.kind);
const flush = async (wm) => {
    if (wm._persistTimer) clearTimeout(wm._persistTimer);
    wm._persistTimer = null;
    await saveDesktops(host.state, wm.desktops.serialize());
};

let shell = await build();
let wm = shell.wm;
await tick();

// ── §1 a split stays on its page ────────────────────────────────────────
console.log('\n§1 a split divides the page it is in');
wm.openInPrimary('alpha');
check('alpha is the page', wm.activePage(), 'alpha');
wm.split('h');
check('the split seeds the root beside alpha', tiles(wm), ['alpha', 'start']);
check('focus is in the new pane, and the page is still alpha', wm.activePage(), 'alpha');
check('the rail lights alpha', litRail(), ['alpha']);

// ── §2 another page is another surface ─────────────────────────────────
console.log('\n§2 opening another page swaps the whole surface');
const panelsBefore = { left: live('panel:left')[0], bottom: live('panel:bottom')[0] };
wm.openInPrimary('beta');
check('beta is the page', wm.activePage(), 'beta');
check('beta is alone on screen', tiles(wm), ['beta']);
check("alpha's content is unmounted with its surface", liveCount('alpha'), 0);
check('the rail lights beta', litRail(), ['beta']);
wm.navigate('item', { id: 'i1' }, { newTab: true });
wm.split('v');
check("beta's own split (its tile showing the item tab)", tiles(wm), ['item', 'start']);
wm.openInPrimary('alpha');
check('back on alpha: its split comes back', tiles(wm), ['alpha', 'start']);
check('alpha is mounted again, once', liveCount('alpha'), 1);
check('beta is unmounted', liveCount('beta') + liveCount('item'), 0);
wm.openInPrimary('beta');
const betaLeaf = wm.desktops.active().tree.leaves().find((l) => l.content?.kind === 'item'
    || (l.tabs || []).some((t) => t.kind === 'item'));
check("back on beta: its tiles, and the item tab in beta's tile",
    [tiles(wm).length, (betaLeaf?.tabs || []).map((t) => t.kind)], [2, ['beta', 'item']]);

// ── §3 the panels are the desktop's ────────────────────────────────────
console.log('\n§3 the panels survive a page switch');
check('one live navigator and one console, the same mounts as before',
    [liveCount('panel:left'), liveCount('panel:bottom'),
     live('panel:left')[0] === panelsBefore.left, live('panel:bottom')[0] === panelsBefore.bottom],
    [1, 1, true, true]);
check('the panels are still open', [wm.isPanelOpen('left'), wm.isPanelOpen('bottom')], [true, true]);

// ── §4 windows ─────────────────────────────────────────────────────────
console.log('\n§4 windows stand on a surface');
wm.openInPrimary('alpha');
const alphaLeaf = wm.desktops.active().tree.leaves().find((l) => l.content?.kind === 'alpha');
wm.floatPane(alphaLeaf.id);
await tick();
check('alpha floats in a window', [wm._windowToLeaf.size, live('alpha')[0]?.windowId != null], [1, true]);
wm.navigate('tool');
await tick();
check('a tool window opens beside it', wm._windowToLeaf.size, 2);
wm.openInPrimary('beta');
await tick();
const windowKinds = () => [...wm._windowToLeaf.values()].map((r) => r.original?.kind);
check("alpha's window went back with its surface; the tool stays", windowKinds(), ['tool']);
wm.openInPrimary('alpha');
await tick();
check('alpha is back in a tile of its page', tiles(wm).includes('alpha'), true);
check('still one live alpha', liveCount('alpha'), 1);
for (const [id, rec] of [...wm._windowToLeaf]) rec.window.close({ force: true });
await tick();

// ── §5 every open verb ─────────────────────────────────────────────────
console.log('\n§5 every open verb switches the surface');
const leafOf = (kind) => wm.desktops.active().tree.leaves().find((l) => l.content?.kind === kind);
wm.openInPrimary('alpha');
wm.navigate('item', { id: 'i2' }, { ctx: { leafId: leafOf('alpha').id } });
check('navigate from inside alpha: item opens on beta', [wm.activePage(), tiles(wm).includes('alpha')], ['beta', false]);
wm.openInPrimary('alpha');
wm.navigate('item', { id: 'i3' }, { dest: 'split-h', ctx: { leafId: leafOf('alpha').id } });
check('a split to another page opens it on its own surface', [wm.activePage(), tiles(wm).includes('alpha')], ['beta', false]);
wm.openInPrimary('alpha');
wm.openFromContext({ leafId: leafOf('alpha').id }, 'beta');
check('openFromContext', [wm.activePage(), tiles(wm).includes('alpha')], ['beta', false]);
wm.openInPrimary('alpha');
wm.openInLeaf(leafOf('alpha').id, 'item', { id: 'i4' });
check('openInLeaf', [wm.activePage(), tiles(wm).includes('alpha')], ['beta', false]);
wm.openInPrimary('alpha');
wm.navigate('item', { id: 'i5' }, { dest: 'window' });
await tick();
check('a window of another page opens over that page', [wm.activePage(), windowKinds()], ['beta', ['item']]);
for (const [, rec] of [...wm._windowToLeaf]) rec.window.close({ force: true });
await tick();

// ── §6 reload ──────────────────────────────────────────────────────────
console.log('\n§6 a reload keeps the surfaces');
wm.openInPrimary('alpha');
const alphaTilesBefore = tiles(wm);
wm.openInPrimary('beta');
const betaTilesBefore = tiles(wm);
await flush(wm);
shell.dispose();
shell = await build();
wm = shell.wm;
await tick();
check('the page on screen is beta, as it was', [wm.activePage(), tiles(wm)], ['beta', betaTilesBefore]);
check('only beta is mounted', [liveCount('beta') + liveCount('item') > 0, liveCount('alpha')], [true, 0]);
wm.openInPrimary('alpha');
check("alpha's surface came back from the saved layout", tiles(wm), alphaTilesBefore);

// ── §7 a mixed layout is separated ─────────────────────────────────────
console.log('\n§7 two pages on one desktop are separated on load');
await flush(wm);
const blob = JSON.parse(store.get('desktops'));
blob.desktops = [{
    id: 'mixed', label: '1',
    panels: { left: true, right: false, bottom: true },
    tree: { root: { kind: 'split', dir: 'h', sizes: [1, 1], children: [
        { kind: 'leaf', title: 'Alpha', tabs: [{ kind: 'alpha', props: {}, title: 'Alpha' }], activeTabIdx: 0 },
        { kind: 'leaf', title: 'Beta', tabs: [{ kind: 'beta', props: {}, title: 'Beta' },
                                               { kind: 'item', props: { id: 'x' }, title: 'x' }], activeTabIdx: 0 },
    ] } },
}];
blob.activeIdx = 0;
store.set('desktops', JSON.stringify(blob));
shell.dispose();
shell = await build();
wm = shell.wm;
await tick();
check('one page on screen', [wm.activePage(), tiles(wm)], [wm.activePage(), [wm.activePage()]]);
const other = wm.activePage() === 'alpha' ? 'beta' : 'alpha';
wm.openInPrimary(other);
const otherLeaf = wm.desktops.active().tree.leaves().find((l) => l.content?.kind === other);
check('the other page has its own surface, with its tabs',
    (otherLeaf?.tabs || []).map((t) => t.kind), other === 'beta' ? ['beta', 'item'] : ['alpha']);

// ── §8 desktops ────────────────────────────────────────────────────────
console.log('\n§8 each desktop has its own surfaces');
wm.openInPrimary('gamma');
check('gamma (single: true) opens on desktop 1', [wm.activePage(), liveCount('gamma')], ['gamma', 1]);
wm.openInPrimary('alpha');
wm.switchDesktop(1);
check('desktop 2 shows no page yet', wm.activePage(), null);
wm.openInPrimary('beta');
check('desktop 2 takes beta without a switch', [wm.activePage(), tiles(wm)], ['beta', ['beta']]);
wm.openInPrimary('gamma');
check("gamma is revealed on desktop 1's surface where it is kept",
    [wm.desktops.activeIdx, wm.activePage(), liveCount('gamma')], [0, 'gamma', 1]);
wm.switchDesktop(1);
check('desktop 2 is still on beta', wm.activePage(), 'beta');

// ── §10 kinds of no page ───────────────────────────────────────────────
console.log('\n§10 a kind of no page, and surfaces left with nothing of their page');
wm.navigate('welcome');
check('the welcome opens on the surface on screen', [wm.activePage(), tiles(wm)], ['beta', ['welcome']]);
wm.openInPrimary('alpha');
check('alpha, which desktop 2 had not shown, takes that surface',
    [wm.activePage(), tiles(wm), Object.keys(wm.desktops.active().surfaces)], ['alpha', ['alpha'], []]);
wm.navigate('welcome');
wm.openInPrimary('alpha');
wm.switchDesktop(0);
wm.openInPrimary('gamma');
wm.navigate('welcome');
check('on desktop 1 the welcome replaces gamma', [wm.activePage(), tiles(wm)], ['gamma', ['welcome']]);
wm.openInPrimary('beta');
check('beta has a surface already: the empty gamma surface is let go, and the welcome with it',
    [wm.activePage(), Object.keys(wm.desktops.active().surfaces).includes('gamma'), liveCount('welcome')],
    ['beta', false, 0]);
const archives = wm.desktops.desktops.flatMap((d) => [d.tree, ...Object.values(d.surfaces)])
    .flatMap((t) => t.leaves()).filter((l) => Object.keys(l.pageTabs || {}).length);
check('no tile keeps a page archive of its own', archives.length, 0);
shell.dispose();

// ── §11 within a page a tile navigates as before ──────────────────────
console.log('\n§11 within a page, opening keeps the tile\'s history');
store.clear();
shell = await build();
wm = shell.wm;
await tick();
wm.openInPrimary('beta');
wm.openInPrimary('item', { id: 'q' });
check('the item replaces beta in its tile', tiles(wm), ['item']);
wm.navigateBack();
check('Backspace returns to beta', tiles(wm), ['beta']);
wm.openInPrimary('item', { id: 'q', filePath: 'a.txt' });
const itemLeaf = wm.desktops.active().tree.leaves().find((l) => l.content?.kind === 'item');
wm.updateActiveTabProps(itemLeaf.id, { filePath: null });
wm.openInPrimary('alpha');
check('a prop the content took off its tab is not in the saved surface',
    JSON.stringify(wm.desktops.serialize()).includes('a.txt'), false);
shell.dispose();

// ── §9 the option off ──────────────────────────────────────────────────
console.log('\n§9 without pageSurfaces nothing changes');
store.clear();
shell = await build({ pageSurfaces: false });
wm = shell.wm;
await tick();
wm.openInPrimary('alpha');
wm.split('h');
wm.openInPrimary('beta');
check('beta opens in the focused tile, beside alpha', tiles(wm), ['alpha', 'beta']);
check('activePage is the primary tile\'s page', wm.activePage(), 'beta');
check('no surfaces kept', Object.keys(wm.desktops.active().surfaces), []);
shell.dispose();

if (failures) {
    console.error(`\npage surfaces: ${failures} failure(s)`);
    process.exit(1);
}
console.log('\npage surfaces: all checks passed');
