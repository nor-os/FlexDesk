/**
 * PANEL TILE SIZES SURVIVE LOAD, DESKTOP SWITCH AND PANEL TOGGLE.
 *
 * The report (BUG-0007): `_canonicalize` detached every panel leaf, collapsing
 * its split, and `wrap()` built a new split with hard-coded 1:4 / 4:1 sizes.
 * Every reload, desktop switch and panel toggle runs it, so a Navigator dragged
 * wide or a Console dragged tall snapped back each time. And a splitter drag
 * never saved the layout at all, so a reload restored whatever had been saved
 * before the drag.
 *
 * Now the end of a splitter drag saves the layout (the renderer's
 * `onSplitResized`, wired by the WM to `_persist`), and each panel's share of
 * the WM area along its axis is kept on the desktop record (`panelShares`,
 * serialized with it) and given back when it is wrapped. Only a panel that has
 * never had a share on its desktop takes the default. A share is only ever
 * measured from a canonical tree (§6: the structural paths that spawn a
 * content leaf around the whole root measure nothing), and every share is
 * clamped to the range a splitter drag allows (§7).
 *
 * §1 drives the REAL path through a real `createShell` in jsdom: a mouse drag
 * on the splitter, the WM's own debounced save, and a cold start on the same
 * store. jsdom computes no layout, so the split container's size is the one
 * thing stubbed (`getBoundingClientRect`), exactly what the drag reads.
 *
 *     node tests/panel_sizes_kept.test.mjs
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
    console.log('panel sizes kept: SKIPPED — needs jsdom '
        + '(`cd ../Tables/web && npm install`, or `npm i -D jsdom` here)');
    process.exit(0);
}

const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>',
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

const { WindowManager } = await import('../src/tiling/wm.js');
const { TileRenderer } = await import('../src/tiling/tile_renderer.js');
const { DesktopManager } = await import('../src/tiling/desktops.js');
const { createTaxonomy } = await import('../src/tiling/kind_taxonomy.js');
const { createShell } = await import('../src/tiling/shell.js');
const { createEntityCatalog } = await import('../src/tiling/entity_sources.js');

let failures = 0;
function near(name, actual, expected, eps = 1e-9) {
    const ok = typeof actual === 'number' && Math.abs(actual - expected) < eps;
    if (!ok) { failures++; console.error(`  FAIL ${name}\n    got      ${actual}\n    expected ${expected}`); }
    else console.log(`  ok   ${name}`);
}
function check(name, actual, expected) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) { failures++; console.error(`  FAIL ${name}\n    got      ${a}\n    expected ${e}`); }
    else console.log(`  ok   ${name}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Longer than the WM's 500 ms save debounce. */
const SETTLE_MS = 700;

const taxonomy = () => createTaxonomy({
    root: 'home',
    kinds: { home: { label: 'Home', icon: 'home', isTopNav: true, order: 1 } },
});
const seed = () => ({ content: { kind: 'home', props: {} }, title: 'Home' });

const panelLeaf = (tree, side) => tree.leaves().find((l) => l.content?.kind === `panel:${side}`);

/** What the user sees: the fraction of the WM area along the panel's axis,
 *  read straight from the tree geometry. */
function areaShare(tree, side) {
    const axis = side === 'bottom' ? 'v' : 'h';
    let node = panelLeaf(tree, side);
    if (!node) return null;
    let frac = 1;
    while (node.parentId) {
        const p = tree.get(node.parentId);
        if (p.dir === axis) {
            const total = p.sizes.reduce((a, b) => a + b, 0);
            frac *= p.sizes[p.children.indexOf(node.id)] / total;
        }
        node = p;
    }
    return frac;
}

/** A host whose `state` is an in-memory map, counting the layout writes. */
function makeHost(store) {
    const host = { writes: 0, state: {
        read: async (k) => (store.has(k) ? JSON.parse(store.get(k)) : null),
        write: async (k, v) => {
            if (k === 'desktops') host.writes++;
            store.set(k, JSON.stringify(v));
        },
    } };
    return host;
}

async function mountShell(store) {
    const root = dom.window.document.createElement('div');
    dom.window.document.getElementById('root').append(root);
    const host = makeHost(store);
    const shell = await createShell({
        root, host,
        entities: createEntityCatalog({ sources: [] }),
        taxonomy: taxonomy(),
        content: { home: (el) => { el.textContent = 'ground'; return {}; } },
    });
    return { shell, wm: shell.wm, root, host };
}

/** A real mouse drag on the splitter of the split that holds `side`'s panel:
 *  mousedown on the splitter, one mousemove of `deltaPx`, mouseup. The split
 *  container is given `sizePx` along the split's axis, since jsdom lays
 *  nothing out. */
function mouseDrag({ wm, root }, side, sizePx, deltaPx) {
    const tree = wm._tree();
    const split = tree.get(panelLeaf(tree, side).parentId);
    const splitter = root.querySelector(`.twm-splitter[data-split-id="${split.id}"]`);
    const horizontal = split.dir === 'h';
    splitter.parentElement.getBoundingClientRect = () => ({
        left: 0, top: 0, x: 0, y: 0,
        width: horizontal ? sizePx : 100, height: horizontal ? 100 : sizePx,
        right: horizontal ? sizePx : 100, bottom: horizontal ? 100 : sizePx,
    });
    const at = (v) => (horizontal ? { clientX: v, clientY: 0 } : { clientX: 0, clientY: v });
    const opts = (v) => ({ bubbles: true, cancelable: true, button: 0, ...at(v) });
    splitter.dispatchEvent(new dom.window.MouseEvent('mousedown', opts(500)));
    if (deltaPx) dom.window.document.dispatchEvent(new dom.window.MouseEvent('mousemove', opts(500 + deltaPx)));
    dom.window.document.dispatchEvent(new dom.window.MouseEvent('mouseup', opts(500 + deltaPx)));
}

// ── §1 A Navigator dragged to 40% width is 40% after a reload ───────────
//    The real path: splitter drags, the WM's own debounced save, cold start.
{
    const store = new Map();
    const s1 = await mountShell(store);
    let tree = s1.wm._tree();
    check('(setup) all three panels open',
          ['left', 'right', 'bottom'].map((s) => !!panelLeaf(tree, s)), [true, true, true]);
    await sleep(SETTLE_MS);

    // A press on the splitter without moving changes nothing and saves nothing.
    const before = s1.host.writes;
    mouseDrag(s1, 'left', 1004, 0);
    await sleep(SETTLE_MS);
    check('a splitter clicked without dragging saves nothing', s1.host.writes, before);

    // The right panel first: its splitter moves the Navigator's width too
    // (the Navigator sits inside the right panel's split). Each split is
    // its slots plus one 4 px splitter.
    mouseDrag(s1, 'right', 1004, -50);              // 20% -> 25%
    near('(setup) right panel dragged to 25%', areaShare(tree, 'right'), 0.25);
    mouseDrag(s1, 'left', 1504, 500);               // inner 20% -> 53.3% of 75%
    near('(setup) Navigator dragged to 40%', areaShare(tree, 'left'), 0.4);
    mouseDrag(s1, 'bottom', 1004, -300);            // 20% -> 50%
    near('(setup) Console dragged to 50%', areaShare(tree, 'bottom'), 0.5);
    check('(setup) nothing saved yet: the save is debounced', s1.host.writes, before);
    await sleep(SETTLE_MS);
    check('the end of the drags saved the layout, once', s1.host.writes, before + 1);
    s1.shell.dispose();

    // A cold start on the same store.
    const s2 = await mountShell(store);
    tree = s2.wm._tree();
    check('(setup) load rebuilt the panels',
          ['left', 'right', 'bottom'].map((s) => !!panelLeaf(tree, s)), [true, true, true]);
    near('a Navigator dragged to 40% width is 40% after a reload', areaShare(tree, 'left'), 0.4);
    near('...and the Console keeps its 50% height', areaShare(tree, 'bottom'), 0.5);
    near('...and the right panel its 25% width', areaShare(tree, 'right'), 0.25);

    // Closed, reloaded while closed, reopened: the panel's last share was
    // saved with the desktop.
    s2.wm.togglePanel('right');
    near('closing the right panel keeps the Navigator at 40%', areaShare(tree, 'left'), 0.4);
    await sleep(SETTLE_MS);
    s2.shell.dispose();
    const s3 = await mountShell(store);
    tree = s3.wm._tree();
    check('(setup) the right panel is still closed after a reload', panelLeaf(tree, 'right'), undefined);
    near('...and the Navigator still 40%', areaShare(tree, 'left'), 0.4);
    s3.wm.togglePanel('right');
    near('a right panel closed across a reload reopens at its 25%', areaShare(tree, 'right'), 0.25);
    near('...with the Navigator kept at 40%', areaShare(tree, 'left'), 0.4);
    near('...and the Console at 50%', areaShare(tree, 'bottom'), 0.5);
    s3.shell.dispose();
}

check('the renderer\'s minimum slot share is the 5% a drag leaves', TileRenderer.MIN_SLOT_FRACTION, 0.05);

/** A WM with real desktops, canonicalize, switch and toggle, and nothing
 *  rendered: what the remaining sections need. */
function makeWm(panelDefaults = null) {
    const wm = Object.create(WindowManager.prototype);
    const renderer = { tree: null, render() {} };
    Object.assign(wm, {
        taxonomy: taxonomy(), renderer, _rootLeaf: seed, panelDefaults,
        _persist() {}, _notifyChange() {}, _windowToLeaf: new Map(),
        desktops: new DesktopManager({ seed, panelDefaults }),
    });
    for (const d of wm.desktops.desktops) wm._canonicalize(d.tree, d);
    renderer.tree = wm.desktops.active().tree;
    return wm;
}

/** Set the panel's own parent split so the panel takes `target` of the area,
 *  keeping the split's total — what a splitter drag writes to the tree. */
function drag(tree, side, target) {
    const leaf = panelLeaf(tree, side);
    const parent = tree.get(leaf.parentId);
    const idx = parent.children.indexOf(leaf.id);
    const total = parent.sizes.reduce((a, b) => a + b, 0);
    const outer = areaShare(tree, side) / (parent.sizes[idx] / total);
    const own = target / outer;
    const sizes = parent.sizes.slice();
    sizes[idx] = own * total;
    sizes[1 - idx] = (1 - own) * total;
    tree.setSplitSizes(parent.id, sizes);
    near(`(setup) ${side} dragged to ${target * 100}%`, areaShare(tree, side), target);
}

// ── §2 A panel opened for the first time uses the default ratio ─────────
{
    const wm = makeWm();
    const tree = wm._tree();
    const sizesOf = (side) => tree.get(panelLeaf(tree, side).parentId).sizes;
    check('a fresh Navigator takes the default 1:4 of its split', sizesOf('left'), [1, 4]);
    check('a fresh right panel takes the default 4:1', sizesOf('right'), [4, 1]);
    check('a fresh Console takes the default 4:1', sizesOf('bottom'), [4, 1]);

    // A desktop that boots with the Console closed has never sized it.
    const closed = makeWm({ bottom: false });
    const t2 = closed._tree();
    check('(setup) Console closed at boot', panelLeaf(t2, 'bottom'), undefined);
    check('(setup) ...and never measured', closed.desktops.active().panelShares.bottom, undefined);
    closed.togglePanel('bottom');
    check('a Console opened for the first time takes the default 4:1',
          t2.get(panelLeaf(t2, 'bottom').parentId).sizes, [4, 1]);
}

// ── §3 A Console dragged to 50% height is 50% after switching desktop and back ──
{
    const wm = makeWm();
    drag(wm._tree(), 'bottom', 0.5);
    wm.switchDesktop(1);
    check('(setup) on desktop 2', wm.desktops.activeIdx, 1);
    near('desktop 2 gets its own default Console', areaShare(wm._tree(), 'bottom'), 0.2);
    wm.switchDesktop(0);
    near('a Console dragged to 50% height is 50% after switching desktop and back', areaShare(wm._tree(), 'bottom'), 0.5);
    wm._canonicalize(wm._tree(), wm.desktops.active());
    near('...and re-canonicalizing an already canonical tree changes nothing', areaShare(wm._tree(), 'bottom'), 0.5);
}

// ── §4 Toggling the right panel keeps the left and bottom panel sizes ───
{
    const wm = makeWm();
    const tree = wm._tree();
    drag(tree, 'right', 0.25);
    drag(tree, 'left', 0.4);
    drag(tree, 'bottom', 0.5);
    wm.togglePanel('right');
    check('(setup) right panel closed', panelLeaf(tree, 'right'), undefined);
    near('closing the right panel keeps the Navigator at 40% width', areaShare(tree, 'left'), 0.4);
    near('...and the Console at 50% height', areaShare(tree, 'bottom'), 0.5);
    wm.togglePanel('right');
    check('(setup) right panel open again', !!panelLeaf(tree, 'right'), true);
    near('reopening the right panel keeps the Navigator at 40% width', areaShare(tree, 'left'), 0.4);
    near('...and the Console at 50% height', areaShare(tree, 'bottom'), 0.5);
    near('...and the reopened right panel comes back at the 25% it was dragged to', areaShare(tree, 'right'), 0.25);
}

// ── §5 Shares taken at different times never squeeze the content out ───
{
    const wm = makeWm();
    const tree = wm._tree();
    drag(tree, 'left', 0.4);
    wm.togglePanel('left');                     // left closed at 40%
    drag(tree, 'right', 0.7);                   // right dragged wide meanwhile
    wm.togglePanel('left');
    const inner = tree.get(panelLeaf(tree, 'left').parentId);
    const total = inner.sizes.reduce((a, b) => a + b, 0);
    near('the Navigator\'s inner share is capped at 1 - the drag minimum',
         inner.sizes[0] / total, 1 - TileRenderer.MIN_SLOT_FRACTION);
    near('...and the right panel keeps its 70%', areaShare(tree, 'right'), 0.7);
}

// ── §6 Structural changes never re-measure a tree that is not canonical ──
//    closeFocused, moveFocusedToDesktop and openInPrimary all spawn a content
//    leaf that wraps the WHOLE root (panels included) and only then
//    canonicalize; closing the last content tile also collapses the
//    Navigator's own split first. Neither tree holds the user's sizes, so
//    neither may be measured: what is on screen and what is saved in
//    `panelShares` both stay what they were.
const SIDES = ['left', 'right', 'bottom'];
/** Both halves of a panel's size: its share on screen, read from the tree,
 *  and the share saved on the desktop record (absent for a panel that has
 *  never been measured, which therefore still opens at the default). */
function panelSizes(wm) {
    const tree = wm._tree();
    return {
        screen: Object.fromEntries(SIDES.map((s) => [s, areaShare(tree, s)])),
        saved: { ...wm.desktops.active().panelShares },
    };
}
function samePanels(label, wm, before, savedBefore = before.saved) {
    const now = panelSizes(wm);
    for (const side of SIDES) {
        near(`${label}: ${side} panel on screen`, now.screen[side], before.screen[side]);
        if (savedBefore[side] === undefined) check(`${label}: ${side} panel still unmeasured in panelShares`, now.saved[side], undefined);
        else near(`${label}: ${side} panel in panelShares`, now.saved[side], savedBefore[side]);
        if (now.saved[side] !== undefined) near(`${label}: ${side} panel saved as it is on screen`, now.saved[side], now.screen[side]);
    }
}
const contentLeaf = (tree) => tree.leaves().find((l) => !String(l.content?.kind || '').startsWith('panel:'));
const DEFAULTS = { left: 0.16, right: 0.2, bottom: 0.2 };
const DRAGGED = { left: 0.4, right: 0.25, bottom: 0.5 };
/** A WM at the default sizes, or with the panels dragged to DRAGGED (each
 *  drag ending the way the renderer ends one: `_onSplitResized`), and the
 *  panel sizes it starts from. */
function wmAt(sizes) {
    const wm = makeWm();
    if (sizes === DRAGGED) {
        const tree = wm._tree();
        for (const side of ['right', 'left', 'bottom']) {
            drag(tree, side, DRAGGED[side]);
            wm._onSplitResized();
        }
    }
    const before = panelSizes(wm);
    for (const side of SIDES) near(`(setup) ${side} panel at ${sizes[side]}`, before.screen[side], sizes[side]);
    if (sizes === DRAGGED) check('(setup) the drags were recorded in panelShares', before.saved, DRAGGED);
    return { wm, before };
}

for (const [name, sizes] of [['default', DEFAULTS], ['dragged', DRAGGED]]) {
    // (a) closeFocused on the last content tile, twice over.
    {
        const { wm, before } = wmAt(sizes);
        for (const round of [1, 2]) {
            const tree = wm._tree();
            tree.focus(contentLeaf(tree).id);
            wm.closeFocused();
            check(`(setup) ${name}, close ${round}: a content tile came back`, !!contentLeaf(wm._tree()), true);
            samePanels(`${name} panels after closing the last content tile (${round})`, wm, before);
        }
    }
    // (b) moveFocusedToDesktop of the last content tile.
    {
        const { wm, before } = wmAt(sizes);
        const tree = wm._tree();
        tree.focus(contentLeaf(tree).id);
        wm.moveFocusedToDesktop(1);
        check(`(setup) ${name}: still on desktop 1, with a content tile`,
              [wm.desktops.activeIdx, !!contentLeaf(wm._tree())], [0, true]);
        samePanels(`${name} panels after moving the last content tile to another desktop`, wm, before);
    }
    // (c) openInPrimary when no content leaf exists.
    {
        const { wm, before } = wmAt(sizes);
        const tree = wm._tree();
        tree.close(contentLeaf(tree).id);
        wm._canonicalize(tree, wm.desktops.active());
        check(`(setup) ${name}: no content leaf left`, contentLeaf(tree), undefined);
        // The Navigator fills the content slot meanwhile (it is the seed
        // root), so only the saved shares are carried from this tree.
        const panelOnly = panelSizes(wm);
        wm.openInPrimary('home');
        check(`(setup) ${name}: openInPrimary spawned a content leaf`, !!contentLeaf(tree), true);
        samePanels(`${name} panels after openInPrimary spawned the content leaf`, wm, before, panelOnly.saved);
    }
}

// ── §7 Every share is held to the range a splitter drag allows ──────────
{
    const min = TileRenderer.MIN_SLOT_FRACTION;
    // Stored values reach the WM only through a desktop whose panels are
    // closed (an open panel is re-measured from its tree).
    const closed = makeWm({ left: false, right: false, bottom: false });
    const cd = closed.desktops.active();
    cd.panelShares = { left: 'wide', right: 0.008, bottom: 5 };
    closed._canonicalize(closed._tree(), cd);
    check('a share that is not a number is dropped', cd.panelShares.left, undefined);
    near('a stored share below the drag minimum is saved at the minimum', cd.panelShares.right, min);
    near('a stored share above 1 - the minimum is saved at 1 - the minimum', cd.panelShares.bottom, 1 - min);
    closed.togglePanel('right'); closed.togglePanel('bottom');
    const ct = closed._tree();
    near('...and opens at the minimum on screen', areaShare(ct, 'right'), min);
    near('...and the too-tall one at 1 - the minimum', areaShare(ct, 'bottom'), 1 - min);
}

console.log(failures ? `\n${failures} assertion(s) FAILED` : '\nall assertions passed');
process.exit(failures ? 1 : 0);
