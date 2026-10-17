/**
 * PANEL TILE SIZES SURVIVE LOAD, DESKTOP SWITCH AND PANEL TOGGLE.
 *
 * The report (BUG-0007): `_canonicalize` detached every panel leaf, collapsing
 * its split, and `wrap()` built a new split with hard-coded 1:4 / 4:1 sizes.
 * Every reload, desktop switch and panel toggle runs it, so a Navigator dragged
 * wide or a Console dragged tall snapped back each time.
 *
 * Each panel's share of the WM area along its axis is now measured before
 * anything is detached and given back when it is wrapped; only a panel opened
 * for the first time takes the default.
 *
 *     node tests/panel_sizes_kept.test.mjs
 */

import { WindowManager } from '../src/tiling/wm.js';
import { DesktopManager, saveDesktops } from '../src/tiling/desktops.js';
import { createTaxonomy } from '../src/tiling/kind_taxonomy.js';

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

const taxonomy = createTaxonomy({
    root: 'home',
    kinds: { home: { label: 'Home', icon: 'home', isTopNav: true, order: 1 } },
});
const seed = () => ({ content: { kind: 'home', props: {} }, title: 'Home' });

/** A WM with real desktops, canonicalize, load, switch and toggle — and an
 *  in-memory state store standing in for the host. */
function makeWm(store = new Map()) {
    const wm = Object.create(WindowManager.prototype);
    const renderer = { tree: null, render() {} };
    Object.assign(wm, {
        taxonomy, renderer, _rootLeaf: seed, panelDefaults: null,
        _persist() {}, _notifyChange() {},
        host: { state: {
            read: async (k) => (store.has(k) ? JSON.parse(store.get(k)) : null),
            write: async (k, v) => { store.set(k, JSON.stringify(v)); },
        } },
        desktops: new DesktopManager({ seed }),
    });
    for (const d of wm.desktops.desktops) wm._canonicalize(d.tree, d);
    renderer.tree = wm.desktops.active().tree;
    return { wm, store };
}

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

/** The user drags the panel's splitter until it takes `target` of the area:
 *  what the renderer's drag does — rewrite the sizes of the panel's own
 *  parent split, keeping its total. */
function drag(tree, side, target) {
    const leaf = panelLeaf(tree, side);
    const parent = tree.get(leaf.parentId);
    const idx = parent.children.indexOf(leaf.id);
    const outer = areaShare(tree, side) / (parent.sizes[idx] / parent.sizes.reduce((a, b) => a + b, 0));
    const own = target / outer;
    const total = parent.sizes.reduce((a, b) => a + b, 0);
    const sizes = parent.sizes.slice();
    sizes[idx] = own * total;
    sizes[1 - idx] = (1 - own) * total;
    tree.setSplitSizes(parent.id, sizes);
    near(`(setup) ${side} dragged to ${target * 100}%`, areaShare(tree, side), target);
}

// ── A panel opened for the first time uses the default ratio ────────────
{
    const { wm } = makeWm();
    const tree = wm._tree();
    const sizesOf = (side) => tree.get(panelLeaf(tree, side).parentId).sizes;
    check('a fresh Navigator takes the default 1:4 of its split', sizesOf('left'), [1, 4]);
    check('a fresh right panel takes the default 4:1', sizesOf('right'), [4, 1]);
    check('a fresh Console takes the default 4:1', sizesOf('bottom'), [4, 1]);

    // Closed at boot, opened later: still the default.
    const d = wm.desktops.active();
    wm.togglePanel('bottom');
    check('(setup) Console closed', panelLeaf(tree, 'bottom'), undefined);
    wm.togglePanel('bottom');
    check('a Console opened for the first time on this tree takes the default 4:1', sizesOf('bottom'), [4, 1]);
    check('...on the desktop that asked for it', d.panels.bottom, true);
}

// ── A Navigator dragged to 40% width is 40% after a reload ──────────────
{
    const { wm, store } = makeWm();
    drag(wm._tree(), 'left', 0.4);
    drag(wm._tree(), 'bottom', 0.3);
    // What _persist writes, without its debounce.
    check('(setup) layout persisted', await saveDesktops(wm.host.state, wm.desktops.serialize()), true);
    // A cold start: a new WM on the same store.
    const { wm: wm2 } = makeWm(store);
    await wm2.load();
    const tree = wm2._tree();
    check('(setup) load rebuilt the panels', ['left', 'right', 'bottom'].map((s) => !!panelLeaf(tree, s)), [true, true, true]);
    near('a Navigator dragged to 40% width is 40% after a reload', areaShare(tree, 'left'), 0.4);
    near('...and the Console keeps its 30% height', areaShare(tree, 'bottom'), 0.3);
    near('...and the untouched right panel keeps the default', areaShare(tree, 'right'), 0.2);
}

// ── A Console dragged to 50% height is 50% after switching desktop and back ──
{
    const { wm } = makeWm();
    drag(wm._tree(), 'bottom', 0.5);
    wm.switchDesktop(1);
    check('(setup) on desktop 2', wm.desktops.activeIdx, 1);
    near('desktop 2 gets its own default Console', areaShare(wm._tree(), 'bottom'), 0.2);
    wm.switchDesktop(0);
    near('a Console dragged to 50% height is 50% after switching desktop and back', areaShare(wm._tree(), 'bottom'), 0.5);
    wm._canonicalize(wm._tree(), wm.desktops.active());
    near('...and re-canonicalizing an already canonical tree changes nothing', areaShare(wm._tree(), 'bottom'), 0.5);
}

// ── Toggling the right panel keeps the left and bottom panel sizes ──────
{
    const { wm } = makeWm();
    const tree = wm._tree();
    // Right first: dragging the right splitter afterwards would move the
    // Navigator's width too (it lives inside the right panel's split).
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
    near('...and the reopened right panel takes the default', areaShare(tree, 'right'), 0.2);
}

console.log(failures ? `\n${failures} assertion(s) FAILED` : '\nall assertions passed');
process.exit(failures ? 1 : 0);
