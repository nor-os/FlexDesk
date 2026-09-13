/**
 * TWO NAVIGATION REQUESTS THE TILE TREE USED TO SILENTLY DISCARD.
 *
 * Both were found in BugDesk, which ran a fork of this tree, and fixed there
 * first. The fork has been retired in favour of this package, so the fixes are
 * upstream now and pinned here — without them, moving BugDesk onto FlexDesk
 * would have quietly reintroduced both bugs.
 *
 *   §1  BACKGROUND TABS. `appendLeafTab(…, { background: true })` must add the
 *       tab and leave the one you are reading in front. Before, `background` was
 *       not a thing the tree knew, so "open in a background tab" arrived and took
 *       the screen exactly as an ordinary click does — a setting that changed
 *       nothing, with nothing saying so.
 *
 *   §2  A PAGE REQUEST CARRYING PROPS. `swapToPage` decided whether to surface
 *       the target or restore the page's archived tabs with
 *       `props.id != null || kind !== targetTopNav`. A request for a list WITH a
 *       filter carries neither — no id, and the list is its own section — so it
 *       fell through to the restore and put back whatever the page last held.
 *       When that was an open record, the tile did not change at all and the
 *       click looked broken. A BARE page switch (no props) must still restore:
 *       that is the whole reason tabs are archived per page.
 *
 *     node tests/tab_navigation.test.mjs
 */

import { TileTree, makeLeaf } from '../src/tiling/tile_tree.js';

let failures = 0;
function check(name, actual, expected) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) { failures++; console.error(`  FAIL ${name}\n    got      ${a}\n    expected ${e}`); }
    else console.log(`  ok   ${name}`);
}

// ── §1 background tabs ──────────────────────────────────────────────────
console.log('\n§1 background tabs');
{
    const tree = new TileTree();
    const root = makeLeaf({ content: { kind: 'list', props: {} }, title: 'List' });
    tree.setRoot(root);

    const at = tree.appendLeafTab(root.id, { kind: 'record', props: { id: '1' } }, '#1', { background: true });
    check('the background tab is appended', root.tabs.length, 2);
    check('…and does NOT take the screen', root.activeTabIdx, 0);
    check('…so what you were reading is still in front', root.tabs[root.activeTabIdx].kind, 'list');
    check('the return value addresses the NEW tab, not the active one', at, 1);

    const at2 = tree.appendLeafTab(root.id, { kind: 'record', props: { id: '2' } }, '#2');
    check('an ordinary append still comes to the front', root.activeTabIdx, 2);
    check('…showing the tab it made', root.tabs[root.activeTabIdx].props.id, '2');
    check('…and returns its index', at2, 2);
}

// ── §2 swapToPage and props ─────────────────────────────────────────────
console.log('\n§2 a page request carrying props');

/** A leaf showing one page, with another page archived whose active tab is a
 *  RECORD rather than the list — the ordinary state after reading one. */
function leafWithArchivedRecord() {
    const tree = new TileTree();
    const root = makeLeaf({ content: { kind: 'home', props: {} }, title: 'Home' });
    tree.setRoot(root);
    tree.focusedLeafId = root.id;
    const leaf = tree.get(root.id);
    leaf.pageTabs = {
        list: {
            tabs: [
                { kind: 'list', props: { view: 'board' }, title: 'List', history: [] },
                { kind: 'record', props: { id: '7' }, title: 'Record 7', history: [] },
            ],
            activeTabIdx: 1,
        },
    };
    return { tree, id: root.id, leaf };
}

{
    const { tree, id, leaf } = leafWithArchivedRecord();
    tree.swapToPage(id, { kind: 'list', props: { expr: { q: 1 }, label: 'Filtered' }, title: 'Filtered' },
        'home', 'list');
    check('a list request WITH a filter lands on the list, not the archived record',
        leaf.tabs[leaf.activeTabIdx].kind, 'list');
}
{
    const { tree, id, leaf } = leafWithArchivedRecord();
    tree.swapToPage(id, { kind: 'list', props: {}, title: 'List' }, 'home', 'list');
    const active = leaf.tabs[leaf.activeTabIdx];
    check('a BARE page switch still restores the record you left open',
        [active.kind, active.props.id], ['record', '7']);
}
{
    const { tree, id, leaf } = leafWithArchivedRecord();
    tree.swapToPage(id, { kind: 'record', props: { id: '9' }, title: 'Record 9' }, 'home', 'list');
    const active = leaf.tabs[leaf.activeTabIdx];
    check('an entity request still wins', [active.kind, active.props.id], ['record', '9']);
}

console.log(failures ? `\n${failures} assertion(s) FAILED` : '\nall assertions passed');
process.exit(failures ? 1 : 0);
