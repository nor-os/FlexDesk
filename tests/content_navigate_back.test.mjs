/**
 * C37 — A CONTENT'S OWN LEVELS COME FIRST: Backspace climbs inside the page
 * before it walks the tile, and the breadcrumb markup is there to draw them.
 *
 * The report (Tables, 2026-10-01): *"when navigating in organization settings to
 * a page like a project (via projects) there must be breadcrumbs used and it
 * must be possible to trigger this with backspace. If flexdesk does not already
 * support it - it should."* An organization's page opens a member, a group or a
 * project IN PLACE of a section's list — levels that are not tabs. Backspace
 * walked the TILE instead: with no tab history it rewrote the page into its
 * taxonomy parent, beside the list it was opened from. The embedder had to bind
 * Backspace itself and guess which tile the window manager would have picked.
 *
 * Now the content factory returns `navigateBack()` from its mount and the WM
 * asks it first, in the scope Backspace acts on.
 *
 * Pinned against the REAL `navigateBack` and `canNavigateBack`, the REAL
 * `TileTree`, on a hand-built `this` — back_to_open_list.test.mjs's harness.
 *
 *   §1  a content with a level above it climbs, and nothing else happens
 *   §2  a content at its top (`false`), with no such function, or that throws:
 *       the walk runs exactly as before
 *   §3  the scope is `_backScope`'s: the focused tile's content, the primary
 *       one behind a panel, and a floating window's `mountInfo`
 *   §4  `canNavigateBack` hears the content too
 *   §5  `renderBreadcrumb` draws the tile breadcrumb's markup with segments the
 *       caller routes (needs jsdom; skipped, loudly, without it)
 *
 *     node tests/content_navigate_back.test.mjs
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

/** Administration, an organization page beside it, and a table section. */
const taxonomy = createTaxonomy({
    root: 'home',
    kinds: {
        home:           { label: 'Home', icon: 'home', isTopNav: true, order: 0 },
        administration: { label: 'Administration', icon: 'shield', isTopNav: true, order: 10 },
        organization:   { label: 'Organization', icon: 'corporate_fare', topNav: 'administration' },
    },
});

/** A window manager in everything but its DOM, whose renderer hands back the
 *  content each leaf "mounted". */
function makeWm({ tabs, active, contents = {}, windows = new Map(), focus = null }) {
    const tree = new TileTree();
    const root = makeLeaf({ content: tabs[0], title: 'x' });
    tree.setRoot(root);
    const leaf = tree.get(root.id);
    leaf.tabs = tabs.map((t) => ({ ...t, title: t.kind, history: t.history || [] }));
    leaf.activeTabIdx = active;
    tree.setActiveLeafTab(root.id, active);
    tree.focus(focus ?? root.id);
    const wm = Object.create(WindowManager.prototype);
    Object.assign(wm, {
        taxonomy,
        backToOpenList: false,
        _windowToLeaf: windows,
        _backWindowId: null,
        renderer: { render() {}, contentOf: (id) => contents[id] ?? null },
        _persist() {},
        _notifyChange() {},
        _tree: () => tree,
    });
    const state = () => ({
        tabs: leaf.tabs.map((t) => t.kind + (t.props?.id ? '#' + t.props.id : '')),
        active: leaf.tabs[leaf.activeTabIdx]?.kind,
    });
    return { wm, state, leafId: root.id };
}

const page = (levels) => {
    let at = levels;
    return {
        get at() { return at; },
        navigateBack() { if (at === 0) return false; at -= 1; return true; },
        canNavigateBack() { return at > 0; },
    };
};
const tabs = [{ kind: 'administration', props: {} }, { kind: 'organization', props: { id: 'acme' } }];

// ── §1 ──────────────────────────────────────────────────────────────────
console.log('\n§1 the content climbs first, and nothing else happens');
{
    const content = page(2);
    const { wm, state, leafId } = makeWm({ tabs, active: 1, contents: {} });
    wm.renderer.contentOf = (id) => (id === leafId ? content : null);
    const before = state();
    wm.navigateBack();
    check('one level of the page is climbed', content.at, 1);
    check('and the tile is untouched — no taxonomy walk, no tab rewritten', state(), before);
    wm.navigateBack();
    check('again: the next level', [content.at, state()], [0, before]);
}

// ── §2 ──────────────────────────────────────────────────────────────────
console.log('\n§2 at its top, without the function, or throwing: the walk as before');
{
    const content = page(0);
    const { wm, state, leafId } = makeWm({ tabs, active: 1 });
    wm.renderer.contentOf = (id) => (id === leafId ? content : null);
    wm.navigateBack();
    check('a page at its top lets the WM walk the tile (here, to its parent in place)',
        state(), { tabs: ['administration', 'administration'], active: 'administration' });
}
{
    const { wm, state } = makeWm({ tabs, active: 1, contents: {} });
    wm.navigateBack();
    check('a content with no navigateBack: exactly the old walk',
        state(), { tabs: ['administration', 'administration'], active: 'administration' });
}
{
    const { wm, state, leafId } = makeWm({ tabs, active: 1 });
    wm.renderer.contentOf = (id) => (id === leafId
        ? { navigateBack() { throw new Error('boom'); } } : null);
    const warn = console.warn;
    console.warn = () => {};
    wm.navigateBack();
    console.warn = warn;
    check('a content that throws is treated as having nowhere to go',
        state(), { tabs: ['administration', 'administration'], active: 'administration' });
}
{
    const content = page(1);
    const { wm, state, leafId } = makeWm({ tabs, active: 1 });
    wm.renderer.contentOf = (id) => (id === leafId ? content : null);
    const leaf = wm._tree().get(leafId);
    leaf.tabs[1].history = [{ kind: 'organization', props: { id: 'beta' }, title: 'Beta' }];
    wm.navigateBack();
    check('the page\'s own level comes BEFORE the tab\'s history', [content.at, state().tabs],
        [0, ['administration', 'organization#acme']]);
    wm.navigateBack();
    check('…and the history after it', state().tabs, ['administration', 'organization#beta']);
}

// ── §3 ──────────────────────────────────────────────────────────────────
console.log('\n§3 the scope is _backScope\'s');
{
    // A floating window last pressed in: ITS content is asked, not the tile's.
    const inWindow = page(1);
    const inTile = page(1);
    const windows = new Map([['w1', { mountInfo: inWindow, original: tabs[1] }]]);
    const { wm, leafId } = makeWm({ tabs, active: 1, windows });
    wm.renderer.contentOf = (id) => (id === leafId ? inTile : null);
    wm._backWindowId = 'w1';
    wm.navigateBack();
    check('the window\'s content climbs, the tile\'s does not', [inWindow.at, inTile.at], [0, 1]);
    wm._backWindowId = null;
    wm.navigateBack();
    check('no window pressed: the focused tile\'s content', inTile.at, 0);
}

// ── §4 ──────────────────────────────────────────────────────────────────
console.log('\n§4 canNavigateBack hears the content');
{
    const content = page(1);
    const { wm, leafId } = makeWm({ tabs: [{ kind: 'home', props: {} }], active: 0 });
    check('a root tab with no history and no parent: nowhere to go', wm.canNavigateBack(), false);
    wm.renderer.contentOf = (id) => (id === leafId ? content : null);
    check('with a level of its own above it: somewhere', wm.canNavigateBack(), true);
    content.navigateBack();
    check('at its top again: nowhere', wm.canNavigateBack(), false);
}

// ── §5 ──────────────────────────────────────────────────────────────────
// No jsdom here, for snap_bounds.test.mjs's reason: the question is which
// elements, classes and handlers the renderer builds, and a recording document
// answers that with nothing to install.
console.log('\n§5 renderBreadcrumb');
{
    const make = (tag) => {
        const el = {
            tagName: tag.toUpperCase(), className: '', type: '', children: [], listeners: {}, html: '',
            classList: { add(c) { el.className = `${el.className} ${c}`.trim(); } },
            appendChild(child) { el.children.push(child); return child; },
            addEventListener(type, fn) { (el.listeners[type] ||= []).push(fn); },
            set innerHTML(v) { el.html = v; el.children = []; },
            get innerHTML() { return el.html; },
        };
        return el;
    };
    globalThis.document = { createElement: make };
    globalThis.setTimeout ||= (fn) => fn();
    const { renderBreadcrumb } = await import('../src/tiling/tile_breadcrumb.js');
    const went = [];
    const nav = make('nav');
    renderBreadcrumb(nav, [
        { label: 'Acme', icon: 'corporate_fare', onClick: () => went.push('Acme') },
        { label: 'Projects', icon: 'folder', onClick: () => went.push('Projects') },
        { label: 'Alpha', icon: 'folder', onClick: () => went.push('Alpha') },
    ]);
    const [ol] = nav.children;
    const items = ol?.children || [];
    check('the tile breadcrumb\'s markup: one list, one item per segment',
        [ol?.className, items.map((li) => li.className.split(' ')[0])],
        ['twm-topbar-breadcrumb__list', ['twm-topbar-breadcrumb__item', 'twm-topbar-breadcrumb__item',
                                          'twm-topbar-breadcrumb__item']]);
    const links = items.map((li) => li.children.find((c) => c.tagName === 'BUTTON'));
    check('every segment but the last is a link', links.map((b) => b?.className ?? null),
        ['twm-topbar-breadcrumb__link', 'twm-topbar-breadcrumb__link', null]);
    check('the last is the current one, as text',
        [items[2].className.includes('--current'), /__current">Alpha</.test(items[2].innerHTML)], [true, true]);
    links[1].listeners.click[0]();
    check('a segment\'s click is the caller\'s, not the WM\'s', went, ['Projects']);
    renderBreadcrumb(nav, []);
    check('an empty trail draws nothing', nav.children.length, 0);
}

console.log(failures ? `\n${failures} assertion(s) FAILED` : '\nall assertions passed');
process.exit(failures ? 1 : 0);
