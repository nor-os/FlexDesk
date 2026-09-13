/**
 * A PANEL IS NEVER SPLIT.
 *
 * The report: with the left or right panel focused, Alt+Shift+H (and Alt+H)
 * split the panel itself, putting a second pane inside the navigator.
 * `splitFocusedWith` found no content to duplicate in a panel and fell back to
 * a plain `split`, and neither split path looked at what it was splitting.
 *
 * The rule now lives in `TileTree.split`, where every split path meets, and
 * the WM's chords read a focused panel as "the content area", as Backspace does.
 *
 *     node tests/panel_split.test.mjs
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
    kinds: { home: { label: 'Home', icon: 'home', isTopNav: true, order: 1 }, ticket: { label: 'Bug', icon: 'bug_report', topNav: 'home' } },
});

/** [panel:left | home | panel:right], the left panel focused. */
function layout() {
    const tree = new TileTree();
    const content = makeLeaf({ content: { kind: 'home', props: {} }, title: 'Home' });
    tree.setRoot(content);
    const leftId = tree.split(content.id, 'h');
    tree.setLeafContent(leftId, { kind: 'panel:left', props: {} }, 'Navigator');
    const rightId = tree.split(content.id, 'h');
    tree.setLeafContent(rightId, { kind: 'panel:right', props: {} }, 'Inspector');
    tree.focus(content.id);
    tree.focus(leftId);
    const wm = Object.create(WindowManager.prototype);
    Object.assign(wm, {
        taxonomy, renderer: { render() {} }, _persist() {}, _notifyChange() {},
        _tree: () => tree, _rootLeaf: () => ({ content: { kind: 'home', props: {} }, title: 'Home' }),
        desktops: { active: () => ({ tree }) },
    });
    const kinds = () => tree.leaves().map((l) => l.content?.kind || null);
    return { tree, wm, leftId, rightId, contentId: content.id, kinds };
}

{
    const { tree, leftId, rightId, kinds } = layout();
    const before = kinds();
    check('the tree refuses to split the left panel', tree.split(leftId, 'h'), null);
    check('...or the right one', tree.split(rightId, 'v'), null);
    check('...and nothing changed', kinds(), before);
}
{
    const { wm, kinds } = layout();
    wm.split('h');
    check('Alt+H from a focused panel splits the content area, not the panel',
        kinds().filter((k) => k === 'panel:left').length === 1 && kinds().filter((k) => k === 'home').length === 2, true);
}
{
    const { wm, kinds } = layout();
    wm.splitFocusedWith('v');
    check('Alt+Shift+V from a focused panel does too', kinds().filter((k) => String(k).startsWith('panel:')).length, 2);
    check('...and adds a content tile', kinds().length, 4);
}
{
    const { wm, leftId, kinds } = layout();
    wm.splitLeafWith(leftId, 'h', 'ticket', { id: '#1' });
    check('opening a record in a split "of" a panel splits the content area', [kinds().includes('ticket'), kinds().filter((k) => k === 'panel:left').length], [true, 1]);
}

console.log(failures ? `\n${failures} assertion(s) FAILED` : '\nall assertions passed');
process.exit(failures ? 1 : 0);
