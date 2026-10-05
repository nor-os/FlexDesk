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
 * The renderer here is a stub whose `contentOf` hands back what a test put in
 * it; the REAL `TileRenderer.contentOf`, a real floated window's `mountInfo`
 * and a real Backspace through the keymap are content_navigate_back_mounted
 * .test.mjs's, under jsdom.
 *
 *   §1  a content with a level above it climbs, and nothing else happens
 *   §2  a content at its top (`false`), with no such function, or that throws:
 *       the walk runs exactly as before
 *   §3  the scope is `_backScope`'s: the focused tile's content, the primary
 *       one behind a panel, and a floating window's `mountInfo`
 *   §4  `canNavigateBack` hears the content too — and a content whose
 *       `canNavigateBack` throws falls through to the history and the taxonomy
 *   §4b `canNavigateBack` answers for `_backScope`'s scope, as Backspace acts:
 *       after a press in a floating window, the WINDOW's content, not the
 *       tile's behind it (the 0.4.7 review)
 *   §5  `renderBreadcrumb` draws the tile breadcrumb's markup with segments the
 *       caller routes — against a recording `document`, with no jsdom, so it
 *       always runs
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
{
    // A content whose question THROWS has said nothing: the answer is the one
    // the history and the taxonomy give, exactly as `navigateBack` treats a
    // `navigateBack` that throws (§2).
    const throwing = { canNavigateBack() { throw new Error('boom'); } };
    const { wm, leafId } = makeWm({ tabs: [{ kind: 'home', props: {} }], active: 0 });
    wm.renderer.contentOf = (id) => (id === leafId ? throwing : null);
    const warned = [];
    const warn = console.warn;
    console.warn = (...args) => warned.push(args[0]);
    let threw = null;
    let answer;
    try { answer = wm.canNavigateBack(); } catch (err) { threw = err; }
    check('a throwing canNavigateBack, nothing else to go to: nowhere (and no throw)',
        [answer, threw && String(threw)], [false, null]);
    wm._tree().get(leafId).tabs[0].history = [{ kind: 'home', props: { id: 'x' }, title: 'X' }];
    try { answer = wm.canNavigateBack(); } catch (err) { threw = err; }
    console.warn = warn;
    check('…with tab history behind it: somewhere, from the history',
        [answer, threw && String(threw)], [true, null]);
    check('and the throw is reported, not swallowed silently', warned.length, 2);
}

// ── §4b ─────────────────────────────────────────────────────────────────
// The 0.4.7 review: `canNavigateBack` picked the focused or primary TILE and
// never a window, while `navigateBack` acts on `_backScope` — the window last
// pressed in, when there is one. So after a press inside a floating window it
// answered for the tile behind it while Backspace climbed the window's content.
// Both kinds here are the taxonomy ROOT (no parent) and neither tile nor window
// has history, so the only thing that can say "somewhere" is the content.
console.log('\n§4b canNavigateBack answers for the scope Backspace acts on');
{
    const root = { kind: 'home', props: {} };
    const inWindow = page(1);
    const inTile = page(0);
    const windows = new Map([['w1', { mountInfo: inWindow, original: root }]]);
    const { wm, leafId } = makeWm({ tabs: [root], active: 0, windows });
    wm.renderer.contentOf = (id) => (id === leafId ? inTile : null);
    wm._backWindowId = 'w1';
    check('a press in the window whose content has a level: somewhere (the tile has none)',
        wm.canNavigateBack(), true);
    wm.navigateBack();
    check('and that is the level Backspace climbs', [inWindow.at, inTile.at], [0, 0]);
    check('at the window content\'s top: nowhere', wm.canNavigateBack(), false);
}
{
    const root = { kind: 'home', props: {} };
    const inWindow = page(0);
    const inTile = page(1);
    const windows = new Map([['w1', { mountInfo: inWindow, original: root }]]);
    const { wm, leafId } = makeWm({ tabs: [root], active: 0, windows });
    wm.renderer.contentOf = (id) => (id === leafId ? inTile : null);
    wm._backWindowId = 'w1';
    check('the window at its top while the tile behind has a level: nowhere — not the tile\'s answer',
        wm.canNavigateBack(), false);
    wm._backWindowId = null;
    check('no window pressed: the tile\'s answer, exactly as before', wm.canNavigateBack(), true);
    wm._backWindowId = 'gone';
    check('a pressed window that has since closed: the tile\'s answer', wm.canNavigateBack(), true);
}
{
    // A window whose kind HAS a taxonomy parent still says so with no content.
    const windows = new Map([['w1', { mountInfo: {}, original: tabs[1] }]]);
    const { wm } = makeWm({ tabs: [{ kind: 'home', props: {} }], active: 0, windows });
    wm._backWindowId = 'w1';
    check('a window on a kind with a parent: somewhere, from the taxonomy', wm.canNavigateBack(), true);
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
