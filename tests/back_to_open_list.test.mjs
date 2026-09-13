/**
 * C32 — BACK FROM AN OPENED RECORD RETURNS TO THE LIST; IT DOES NOT MAKE ONE.
 *
 * The report, verbatim in spirit: open a record from a list — it arrives in a
 * new tab — press Backspace in it, and the tile now shows the list TWICE. The
 * record tab had no history of its own, so `navigateBack` walked the taxonomy up
 * and rewrote the record into its parent, beside the list it was opened from.
 *
 * Pinned here against the REAL `navigateBack` and the REAL `TileTree`, on a
 * hand-built `this` — the renderer is the only thing stubbed, for the reason
 * snap_bounds.test.mjs gives: nothing below is a question about pixels.
 *
 *   §1  the reported gesture: list, record opened beside it, Back → one list
 *   §2  the rule's edges: nearest list to the LEFT wins; a record with no list
 *       open still walks up in place (no tab closed into nothing); a tab that
 *       is itself a list is never closed; history is still popped first
 *   §3  a flattened taxonomy, where the list the record came from is NOT its
 *       taxonomy parent — which is why matching is by section, not by kind
 *   §4  off by default: an embedder that did not ask keeps the old behaviour
 *
 *     node tests/back_to_open_list.test.mjs
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

/** A section-based taxonomy shaped like a bug tracker: `home` is the root and
 *  renders the queue section; `queues` and `backlog` are top-nav lists;
 *  `ticket` and `item` are records filed under them. */
const trackerLike = createTaxonomy({
    root: 'home',
    kinds: {
        home:    { label: 'Home', icon: 'home', topNav: 'queues' },
        queues:  { label: 'Bugs', icon: 'bug_report', isTopNav: true, order: 10 },
        backlog: { label: 'Backlog', icon: 'workspaces', isTopNav: true, order: 20 },
        ticket:  { label: 'Bug', icon: 'bug_report', topNav: 'queues' },
        item:    { label: 'Item', icon: 'article', topNav: 'backlog' },
    },
});

/** The same records under a FLATTENED taxonomy: one top-nav section holds both
 *  the list (`tickets`) and the record, side by side rather than parent and
 *  child. The list a record is opened from is not its taxonomy parent here. */
const flattened = createTaxonomy({
    root: 'home',
    kinds: {
        home:    { label: 'Home', icon: 'home', topNav: 'tracker' },
        tracker: { label: 'Tracker', icon: 'dashboard', isTopNav: true, order: 10 },
        tickets: { label: 'Tickets', icon: 'list', topNav: 'tracker' },
        item:    { label: 'Item', icon: 'article', topNav: 'tracker' },
    },
});

/** A window manager in everything but its DOM: the real methods under test, a
 *  real tree, and a renderer that only counts. */
function makeWm({ taxonomy = trackerLike, backToOpenList = true, tabs, active }) {
    const tree = new TileTree();
    const root = makeLeaf({ content: tabs[0], title: 'x' });
    tree.setRoot(root);
    const leaf = tree.get(root.id);
    leaf.tabs = tabs.map((t) => ({ ...t, title: t.kind, history: t.history || [] }));
    leaf.activeTabIdx = active;
    tree.setActiveLeafTab(root.id, active);
    tree.focus(root.id);

    const wm = Object.create(WindowManager.prototype);
    Object.assign(wm, {
        taxonomy,
        backToOpenList,
        renderer: { render() {} },
        _persist() {},
        _notifyChange() {},
        _tree: () => tree,
    });
    const state = () => ({
        tabs: leaf.tabs.map((t) => t.kind + (t.props?.id ? '#' + t.props.id : '')),
        active: leaf.tabs[leaf.activeTabIdx]
            ? leaf.tabs[leaf.activeTabIdx].kind + (leaf.tabs[leaf.activeTabIdx].props?.id ? '#' + leaf.tabs[leaf.activeTabIdx].props.id : '')
            : null,
    });
    return { wm, state };
}

const list = (kind, props = {}) => ({ kind, props });
const rec = (kind, id, extra = {}) => ({ kind, props: { id, ...extra } });

// ── §1 the reported gesture ─────────────────────────────────────────────
console.log('\n§1 list, record opened beside it, Back');
{
    const { wm, state } = makeWm({ tabs: [list('home'), rec('ticket', '6', { filter: 'active' })], active: 1 });
    wm.navigateBack();
    check('the record closes and the list it came from is what you see', state(), { tabs: ['home'], active: 'home' });
}
{
    const { wm, state } = makeWm({ tabs: [list('backlog'), rec('item', '7')], active: 1 });
    wm.navigateBack();
    check('same for a backlog item beside the backlog', state(), { tabs: ['backlog'], active: 'backlog' });
}

// ── §2 the edges ────────────────────────────────────────────────────────
console.log('\n§2 the edges of the rule');
{
    // Several lists of the section: the nearest on the LEFT is where it came from.
    const { wm, state } = makeWm({
        tabs: [list('home'), list('queues', { filter: 'open' }), rec('ticket', '3')], active: 2,
    });
    wm.navigateBack();
    check('the nearest list to the left wins', state(), { tabs: ['home', 'queues'], active: 'queues' });
}
{
    // Only a list to the RIGHT: it is still an open list of the section.
    const { wm, state } = makeWm({ tabs: [rec('ticket', '3'), list('queues')], active: 0 });
    wm.navigateBack();
    check('a list to the right is used when the left has none', state(), { tabs: ['queues'], active: 'queues' });
}
{
    // A list of ANOTHER section does not count — landing on the backlog after
    // leaving a bug is not "back".
    const { wm, state } = makeWm({ tabs: [list('backlog'), rec('ticket', '3')], active: 1 });
    wm.navigateBack();
    check('a list of a different section is not a return target — the record walks up in place',
        state(), { tabs: ['backlog', 'queues'], active: 'queues' });
}
{
    // The record is the tile's only tab: nothing to close INTO, so it walks up.
    const { wm, state } = makeWm({ tabs: [rec('ticket', '3')], active: 0 });
    wm.navigateBack();
    check('a lone record walks up in place rather than closing the tile empty',
        state(), { tabs: ['queues'], active: 'queues' });
}
{
    // A list is never closed by Back, even with another list beside it.
    const { wm, state } = makeWm({ tabs: [list('home'), list('queues')], active: 1 });
    const before = state();
    wm._backToOpenList(wm._tree().primaryLeafId());
    check('a tab that is itself a list is not closed', state(), before);
}
{
    // History first: a record tab that got here by navigating inside itself
    // goes back through that history, exactly as before C32.
    const { wm, state } = makeWm({
        tabs: [list('home'), rec('ticket', '9', {}), ],
        active: 1,
    });
    const leaf = wm._tree().get(wm._tree().primaryLeafId());
    leaf.tabs[1].history = [{ kind: 'ticket', props: { id: '8' }, title: '#8' }];
    wm.navigateBack();
    check('per-tab history is still popped before anything closes', state(), { tabs: ['home', 'ticket#8'], active: 'ticket#8' });
}

// ── §3 a flattened taxonomy ─────────────────────────────────────────────
console.log('\n§3 a flattened taxonomy');
{
    // `tickets` and `item` sit side by side under `tracker`. Matching by kind, or
    // by taxonomy parent, would find nothing and duplicate the list; matching by
    // SECTION finds the list the record came from.
    const { wm, state } = makeWm({ taxonomy: flattened, tabs: [list('tickets'), rec('item', '4')], active: 1 });
    wm.navigateBack();
    check('the list beside the record, not above it, is found by section', state(), { tabs: ['tickets'], active: 'tickets' });
}

// ── §4 off by default ───────────────────────────────────────────────────
console.log('\n§4 opt-in');
{
    const { wm, state } = makeWm({ backToOpenList: false, tabs: [list('home'), rec('ticket', '6')], active: 1 });
    wm.navigateBack();
    check('without the option, Back still walks up in place as it always has',
        state(), { tabs: ['home', 'queues'], active: 'queues' });
}
{
    // The DEFAULT, read from the constructor itself: building a real
    // WindowManager needs a DOM, and a default is exactly the kind of fact a
    // test that only passes `false` explicitly would never notice changing.
    const src = readFileSync(new URL('../src/tiling/wm.js', import.meta.url), 'utf8');
    const sig = /constructor\(\{([^}]*)\}\)/.exec(src)?.[1] || '';
    check('the constructor defaults backToOpenList to false', /backToOpenList\s*=\s*false/.test(sig), true);
}

console.log(failures ? `\n${failures} assertion(s) FAILED` : '\nall assertions passed');
process.exit(failures ? 1 : 0);
