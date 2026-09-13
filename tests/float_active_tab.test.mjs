/**
 * C34 — A FLOATED RECORD IS ONE TAB, AND BACK IN A WINDOW ACTS ON THE WINDOW.
 *
 * Two reports from an embedder whose tabs are separate records (a queue, then
 * a bug opened beside it), not one pane's views:
 *
 *   - Floating the tile took EVERY tab into the window, strip and all (R8),
 *     where the user meant the bug on screen.
 *   - Backspace while reading a floating window walked the tile BEHIND it,
 *     because the tree's focus never moves to a window.
 *
 * Pinned against the REAL `toggleManagedFocused`, `navigateBack` (`_returnToOpenList`),
 * `_windowTabAction`, `showWindowTab` and `TileTree` on a hand-built `this`.
 * Mounting and window chrome are stubbed: nothing below is about pixels. The
 * pointerdown listener that sets `_backWindowId` needs a DOM and is exercised
 * end to end by the embedder's browser check instead.
 *
 *   §1  floatActiveTab: the gesture floats the active tab, or the whole pane
 *   §2  Back in a window, record beside an open list in a tile: window closes
 *   §3  Back in a window: its own list tab wins; no list walks up in place
 *   §4  no window under the pointer: the tile path runs as before
 *
 *     node tests/float_active_tab.test.mjs
 */

import { readFileSync } from 'node:fs';
import { WindowManager } from '../src/tiling/wm.js';
import { TileTree, makeLeaf } from '../src/tiling/tile_tree.js';
import { createTaxonomy } from '../src/tiling/kind_taxonomy.js';

let failures = 0;
function check(name, actual, expected) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) { failures++; console.error(`  FAIL ${name}\n    got      ${a}\n    expected ${e}`); }
    else console.log(`  ok   ${name}`);
}

const taxonomy = createTaxonomy({
    root: 'home',
    kinds: {
        home:    { label: 'Home', icon: 'home', topNav: 'queues' },
        queues:  { label: 'Bugs', icon: 'bug_report', isTopNav: true, order: 10 },
        backlog: { label: 'Backlog', icon: 'workspaces', isTopNav: true, order: 20 },
        ticket:  { label: 'Bug', icon: 'bug_report', topNav: 'queues' },
        item:    { label: 'Item', icon: 'article', topNav: 'backlog' },
    },
});

const list = (kind, props = {}) => ({ kind, props, title: kind });
const rec = (kind, id) => ({ kind, props: { id }, title: `${kind}#${id}` });
const label = (t) => t.kind + (t.props?.id ? '#' + t.props.id : '');

/** A WM with one tile of `tileTabs` and, optionally, one window of `winTabs`. */
function makeWm({ tileTabs, tileActive = 0, winTabs = null, winActive = 0,
                  backToOpenList = true, floatActiveTab = true, pointerInWindow = true }) {
    const tree = new TileTree();
    const root = makeLeaf({ content: tileTabs[0], title: 'x' });
    tree.setRoot(root);
    const leaf = tree.get(root.id);
    leaf.tabs = tileTabs.map((t) => ({ ...t, history: [] }));
    tree.setActiveLeafTab(root.id, tileActive);
    tree.focus(root.id);

    const calls = [];
    const wm = Object.create(WindowManager.prototype);
    Object.assign(wm, {
        taxonomy, backToOpenList, floatActiveTab,
        renderer: { render() {} },
        desktops: { desktops: [{ tree }], active: () => ({ tree }), activeIdx: 0 },
        _windowToLeaf: new Map(),
        _backWindowId: null,
        _persist() {}, _notifyChange() {},
        _tree: () => tree,
        _mountWindowTab() {}, _syncWindowTabs() {},
        floatPane: (id) => { calls.push(['floatPane', id]); return 'w'; },
        floatTabAsWindow: (id, idx) => { calls.push(['floatTabAsWindow', id, idx]); return 'w'; },
        openInWindow: (id, kind, props) => { calls.push(['openInWindow', id, kind, props]); },
    });
    let closed = false;
    if (winTabs) {
        wm._windowToLeaf.set('win1', {
            desktopIdx: 0,
            tabs: winTabs.map((t) => ({ ...t })),
            activeTabIdx: winActive,
            window: { close: () => { closed = true; wm._windowToLeaf.delete('win1'); } },
        });
        if (pointerInWindow) wm._backWindowId = 'win1';
    }
    const state = () => {
        const w = wm._windowToLeaf.get('win1');
        return {
            tile: leaf.tabs.map(label), tileActive: label(leaf.tabs[leaf.activeTabIdx]),
            window: w ? w.tabs.map(label) : (closed ? 'closed' : null),
            windowActive: w ? label(w.tabs[w.activeTabIdx]) : null,
        };
    };
    return { wm, tree, leafId: root.id, calls, state };
}

// ── §1 the float gesture ────────────────────────────────────────────────
console.log('\n§1 floatActiveTab');
{
    const { wm, calls, leafId } = makeWm({ tileTabs: [list('queues'), rec('ticket', '2')], tileActive: 1 });
    wm.toggleManagedFocused();
    check('a multi-tab tile floats only the tab on screen', calls, [['floatTabAsWindow', leafId, 1]]);
}
{
    const { wm, calls, leafId } = makeWm({ tileTabs: [rec('ticket', '2')] });
    wm.toggleManagedFocused();
    check('a single-tab tile floats as a pane, which is the same thing', calls, [['floatPane', leafId]]);
}
{
    const { wm, calls, leafId } = makeWm({ floatActiveTab: false, tileTabs: [list('queues'), rec('ticket', '2')], tileActive: 1 });
    wm.toggleManagedFocused();
    check('without the option the whole pane floats, as R8 has it', calls, [['floatPane', leafId]]);
}
{
    const src = readFileSync(new URL('../src/tiling/wm.js', import.meta.url), 'utf8');
    const sig = /constructor\(\{([^}]*)\}\)/.exec(src)?.[1] || '';
    check('the constructor defaults floatActiveTab to false', /floatActiveTab\s*=\s*false/.test(sig), true);
}

// ── §2 Back in a window, list open in a tile ────────────────────────────
console.log('\n§2 a floating record beside an open list');
{
    const { wm, state } = makeWm({ tileTabs: [list('queues')], winTabs: [rec('ticket', '2')] });
    wm.navigateBack();
    check('the window closes and the tile keeps its one list', state(),
        { tile: ['queues'], tileActive: 'queues', window: 'closed', windowActive: null });
}
{
    // The list is open, but not the tab showing: it is brought forward.
    const { wm, state } = makeWm({ tileTabs: [list('home'), list('backlog')], tileActive: 1, winTabs: [rec('ticket', '2')] });
    wm.navigateBack();
    check('a list of the section behind another tab is activated', state(),
        { tile: ['home', 'backlog'], tileActive: 'home', window: 'closed', windowActive: null });
}
{
    // A list of ANOTHER section is not where a bug goes back to.
    const { wm, state, calls } = makeWm({ tileTabs: [list('backlog')], winTabs: [rec('ticket', '2')] });
    wm.navigateBack();
    check('a list of another section is not a target — the window walks up instead',
        { ...state(), calls }, { tile: ['backlog'], tileActive: 'backlog', window: ['ticket#2'], windowActive: 'ticket#2',
                                 calls: [['openInWindow', 'win1', 'queues', {}]] });
}

// ── §3 the window's own tabs, and walking up ────────────────────────────
console.log('\n§3 inside the window');
{
    const { wm, state } = makeWm({ tileTabs: [list('backlog')], winTabs: [list('queues'), rec('ticket', '2')], winActive: 1 });
    wm.navigateBack();
    check('a list among the window\'s own tabs wins, and the window stays', state(),
        { tile: ['backlog'], tileActive: 'backlog', window: ['queues'], windowActive: 'queues' });
}
{
    const { wm, state, calls } = makeWm({ backToOpenList: false, tileTabs: [list('queues')], winTabs: [rec('ticket', '2')] });
    wm.navigateBack();
    check('without backToOpenList a window still gets the Back, walking up in place',
        { ...state(), calls }, { tile: ['queues'], tileActive: 'queues', window: ['ticket#2'], windowActive: 'ticket#2',
                                 calls: [['openInWindow', 'win1', 'queues', {}]] });
}
{
    // The root has no parent: the window stays as it is, and so does the tile.
    const { wm, state, calls } = makeWm({ tileTabs: [rec('item', '9')], winTabs: [list('home')] });
    wm.navigateBack();
    check('a window with nowhere to go consumes the press — the tile behind does not move',
        { ...state(), calls }, { tile: ['item#9'], tileActive: 'item#9', window: ['home'], windowActive: 'home', calls: [] });
}

// ── §4 no window under the pointer ──────────────────────────────────────
console.log('\n§4 the tile path');
{
    const { wm, state } = makeWm({ tileTabs: [list('queues'), rec('ticket', '2')], tileActive: 1,
                                   winTabs: [rec('ticket', '5')], pointerInWindow: false });
    wm.navigateBack();
    check('the last click was in a tile: the tile goes back, the window is untouched', state(),
        { tile: ['queues'], tileActive: 'queues', window: ['ticket#5'], windowActive: 'ticket#5' });
}
{
    const { wm, state } = makeWm({ tileTabs: [list('queues'), rec('ticket', '2')], tileActive: 1, winTabs: [rec('ticket', '5')] });
    wm._windowToLeaf.delete('win1');
    wm.navigateBack();
    check('a window closed since the click no longer claims the press', state().tile, ['queues']);
}

console.log(failures ? `\n${failures} assertion(s) FAILED` : '\nall assertions passed');
process.exit(failures ? 1 : 0);
