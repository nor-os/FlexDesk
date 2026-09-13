/**
 * C35 — A FILTER CLICK SHOWS THE FILTER; THE PARENT CRUMB DOES WHAT BACK DOES.
 *
 * Two reports from an embedder with lists and records (a bug queue, a backlog):
 *
 *   - Clicking a saved filter, a work package or a person's name while that
 *     list was already showing did nothing. `swapToPage` matched the open list
 *     tab by kind + props.id, a list has no id, so the tab was re-activated
 *     with its OLD props. The embedder's old tiling fork corrected this in
 *     `openInPrimary`; the correction did not survive the move upstream.
 *   - A breadcrumb crumb in a record opened beside its list rewrote the record
 *     into a second copy of the list, where Backspace (C32) closes the record
 *     onto the list already open. A first fix flagged only the crumb directly
 *     above the page, which is the epic for a backlog item, so "Backlog" still
 *     duplicated the board. Crumbs now CLIMB with `navigateUp`, and Backspace
 *     and `navigateUp` share one rule, `_returnToOpenList`.
 *
 * Pinned against the REAL `openInPrimary`, `navigateUp`, `navigateBack`,
 * `_returnToOpenList` and `TileTree` on a hand-built `this`; only the renderer
 * and window chrome are stubbed.
 *
 *   §1  openInPrimary: new props on the open list replace them; a bare open keeps them
 *   §2  navigateUp in a tile: closes onto an open list, else navigates in place
 *   §3  navigateUp in a floating window
 *   §4  Backspace and the list's crumb leave the same state, case by case
 *
 *     node tests/crumb_and_filter_navigation.test.mjs
 */

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

const label = (t) => t.kind + (t.props?.id ? '#' + t.props.id : '')
    + (t.props?.filter ? `[${t.props.filter}]` : '') + (t.props?.expr ? `{${t.props.expr}}` : '');

function makeWm({ tabs, active = 0, winTabs = null, backToOpenList = true }) {
    const tree = new TileTree();
    const root = makeLeaf({ content: tabs[0], title: 'x' });
    tree.setRoot(root);
    const leaf = tree.get(root.id);
    leaf.tabs = tabs.map((t) => ({ ...t, title: t.kind, history: [] }));
    tree.setActiveLeafTab(root.id, active);
    tree.focus(root.id);

    const wm = Object.create(WindowManager.prototype);
    let closed = false;
    const calls = [];
    Object.assign(wm, {
        taxonomy, backToOpenList,
        renderer: { render() {} },
        desktops: { desktops: [{ tree }], active: () => ({ tree }), activeIdx: 0 },
        _windowToLeaf: new Map(),
        _backWindowId: null,
        _persist() {}, _notifyChange() {}, _canonicalize() {},
        _tree: () => tree,
        _mountWindowTab() {}, _syncWindowTabs() {},
        openInWindow: (id, kind, props) => calls.push(['openInWindow', id, kind, props]),
    });
    if (winTabs) {
        wm._windowToLeaf.set('win1', {
            desktopIdx: 0, tabs: winTabs.map((t) => ({ ...t })), activeTabIdx: 0,
            window: { close: () => { closed = true; wm._windowToLeaf.delete('win1'); } },
        });
    }
    const state = () => ({
        tabs: leaf.tabs.map(label), active: label(leaf.tabs[leaf.activeTabIdx]),
        ...(winTabs ? { window: wm._windowToLeaf.has('win1') ? 'open' : (closed ? 'closed' : null) } : {}),
    });
    return { wm, leafId: root.id, state, calls };
}

// ── §1 filter clicks ────────────────────────────────────────────────────
console.log('\n§1 a filter click on the list that is showing');
{
    const { wm, state } = makeWm({ tabs: [{ kind: 'queues', props: { filter: 'active' } }] });
    wm.openInPrimary('queues', { filter: 'all' });
    check('the open list takes the new filter', state(), { tabs: ['queues[all]'], active: 'queues[all]' });
}
{
    const { wm, state } = makeWm({ tabs: [{ kind: 'queues', props: { filter: 'active' } }, { kind: 'ticket', props: { id: '7' } }], active: 1 });
    wm.openInPrimary('queues', { filter: 'open' });
    check('from a record beside it, the list comes forward with the new filter', state(),
        { tabs: ['queues[open]', 'ticket#7'], active: 'queues[open]' });
}
{
    const { wm, state } = makeWm({ tabs: [{ kind: 'queues', props: { filter: 'active' } }] });
    wm.openInPrimary('queues', {});
    check('a bare open (a top-nav click) keeps the filter you left', state(), { tabs: ['queues[active]'], active: 'queues[active]' });
}
{
    // A person's name on another page: cross-page restore, then the new props.
    const { wm, leafId, state } = makeWm({ tabs: [{ kind: 'queues', props: {} }] });
    wm.openInPrimary('backlog', { expr: 'bob' });
    wm.openInPrimary('queues', {});
    wm.openInPrimary('backlog', { expr: 'alice' });
    check('a list restored from another page still takes the new props', state(),
        { tabs: ['backlog{alice}'], active: 'backlog{alice}' });
    void leafId;
}

// ── §2 navigateUp in a tile ─────────────────────────────────────────────
console.log('\n§2 a crumb in a tile');
{
    const { wm, leafId, state } = makeWm({ tabs: [{ kind: 'queues', props: {} }, { kind: 'ticket', props: { id: '7' } }], active: 1 });
    wm.navigateUp('queues', {}, { ctx: { leafId } });
    check('a bug\'s list crumb closes it onto the open queue — one list, not two', state(), { tabs: ['queues'], active: 'queues' });
}
{
    // THE REPORT. The crumb above a story is its epic, not the board; the board
    // crumb must return all the same.
    const { wm, leafId, state } = makeWm({ tabs: [{ kind: 'backlog', props: { filter: 'all' } }, { kind: 'item', props: { id: '5' } }], active: 1 });
    wm.navigateUp('backlog', {}, { ctx: { leafId } });
    check('an item\'s Backlog crumb closes it onto the open board, whatever its filter', state(), { tabs: ['backlog[all]'], active: 'backlog[all]' });
}
{
    const { wm, leafId, state } = makeWm({ tabs: [{ kind: 'backlog', props: {} }, { kind: 'item', props: { id: '5' } }], active: 1 });
    wm.navigateUp('item', { id: '2' }, { ctx: { leafId } });
    check('an entity crumb (the epic) opens that entity in place', state(), { tabs: ['backlog', 'item#2'], active: 'item#2' });
}
{
    const { wm, leafId, state } = makeWm({ tabs: [{ kind: 'ticket', props: { id: '7' } }] });
    wm.navigateUp('queues', {}, { ctx: { leafId } });
    check('with no list open, the crumb navigates there in place', state(), { tabs: ['queues'], active: 'queues' });
}
{
    const { wm, leafId, state } = makeWm({ tabs: [{ kind: 'queues', props: {} }, { kind: 'backlog', props: {} }], active: 1 });
    wm.navigateUp('home', {}, { ctx: { leafId } });
    check('a crumb from a list (not a record) navigates in place', state(), { tabs: ['queues', 'home'], active: 'home' });
}
{
    const { wm, leafId, state } = makeWm({ backToOpenList: false, tabs: [{ kind: 'queues', props: {} }, { kind: 'ticket', props: { id: '7' } }], active: 1 });
    wm.navigateUp('queues', {}, { ctx: { leafId } });
    check('without backToOpenList the crumb navigates in place as it always has', state(), { tabs: ['queues', 'queues'], active: 'queues' });
}

// ── §3 navigateUp in a floating window ──────────────────────────────────
console.log('\n§3 a crumb in a window');
{
    const { wm, state, calls } = makeWm({ tabs: [{ kind: 'queues', props: {} }], winTabs: [{ kind: 'ticket', props: { id: '7' } }] });
    wm.navigateUp('queues', {}, { ctx: { windowId: 'win1' } });
    check('a floating record closes onto the list open in the tile', { ...state(), calls }, { tabs: ['queues'], active: 'queues', window: 'closed', calls: [] });
}
{
    const { wm, state, calls } = makeWm({ tabs: [{ kind: 'backlog', props: {} }], winTabs: [{ kind: 'ticket', props: { id: '7' } }] });
    wm.navigateUp('queues', {}, { ctx: { windowId: 'win1' } });
    check('with no list open, the window navigates in place', { ...state(), calls },
        { tabs: ['backlog'], active: 'backlog', window: 'open', calls: [['openInWindow', 'win1', 'queues', {}]] });
}

// ── §4 the two routes agree ─────────────────────────────────────────────
console.log('\n§4 Backspace and the list crumb, side by side');
{
    const cases = [
        ['bug beside its queue',        [{ kind: 'queues', props: { filter: 'active' } }, { kind: 'ticket', props: { id: '7' } }], 1, 'queues'],
        ['bug beside home',             [{ kind: 'home', props: {} }, { kind: 'ticket', props: { id: '7' } }], 1, 'queues'],
        ['item beside its board',       [{ kind: 'backlog', props: {} }, { kind: 'item', props: { id: '5' } }], 1, 'backlog'],
        ['item, board to the right',    [{ kind: 'item', props: { id: '5' } }, { kind: 'backlog', props: {} }], 0, 'backlog'],
        ['two items beside the board',  [{ kind: 'backlog', props: {} }, { kind: 'item', props: { id: '4' } }, { kind: 'item', props: { id: '5' } }], 2, 'backlog'],
    ];
    for (const [name, tabs, active, crumb] of cases) {
        const a = makeWm({ tabs, active });
        a.wm.navigateBack();
        const b = makeWm({ tabs, active });
        b.wm.navigateUp(crumb, {}, { ctx: { leafId: b.leafId } });
        check(`${name}: same result`, b.state(), a.state());
    }
}

console.log(failures ? `\n${failures} assertion(s) FAILED` : '\nall assertions passed');
process.exit(failures ? 1 : 0);
