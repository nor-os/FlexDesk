/**
 * ══ C38. THE TABS ARE THE TITLE — `tabLayout: 'header'` ═════════════════
 *
 * *"Merge the tab bars into the header … the title is always in the tabs and
 * we always can create more tabs. This is a more compact layout."*
 *
 *   §1  one tab is enough: the strip is drawn INSIDE the chrome, the title and
 *       glyph are hidden by the wrap class, and a `+` follows the last tab
 *   §2  `+` asks for `new`, and the REAL `wm.newTab` appends the taxonomy root
 *   §3  a panel has no tabs to draw and keeps its title
 *   §4  switching layout live moves the strip and takes the `+` with it, and
 *       never re-mounts the content
 *   §5  the chrome's gestures: a tab is not a grip, a drag begun on a tab is
 *       the strip's, and the empty chrome still floats the pane
 *   §6  a renamed tab is a renamed title; an unchanged repaint leaves the tab
 *       elements alone (a rebuild would drop a tab mid-drag)
 *
 *     node tests/tab_layout_header.test.mjs
 *
 * jsdom is borrowed from the sibling Tables checkout, as in
 * `tile_header_dblclick.test.mjs`. Absent, this SKIPS loudly.
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
    const candidates = [
        resolvePath(HERE, '../../Tables/web/node_modules/jsdom/lib/api.js'),
        resolvePath(HERE, '../../Tables/node_modules/jsdom/lib/api.js'),
    ];
    for (const c of candidates) {
        if (!existsSync(c)) continue;
        ({ JSDOM } = createRequire(import.meta.url)(c));
        break;
    }
}
if (!JSDOM) {
    console.log('tab layout header: SKIPPED — needs jsdom '
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
// jsdom has no `CSS.escape`; a browser does, and `NotebookTabBar`'s rename
// reads it on a double-click before refusing a `builtin://` tab.
if (globalThis.CSS === undefined) {
    globalThis.CSS = { escape: (s) => String(s).replace(/["\\]/g, '\\$&') };
}

const { TileRenderer } = await import('../src/tiling/tile_renderer.js');
const { TileTree, makeLeaf } = await import('../src/tiling/tile_tree.js');
const { createContentRegistry } = await import('../src/tiling/content_registry.js');
const { createTaxonomy } = await import('../src/tiling/kind_taxonomy.js');
const { WindowManager } = await import('../src/tiling/wm.js');

let failures = 0;
function ok(what, cond, why = '') {
    if (cond) { console.log(`  ok   ${what}`); return; }
    failures += 1;
    console.log(`  FAIL ${what}${why ? `\n       ${why}` : ''}`);
}
function check(what, actual, expected, why = '') {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    ok(what, a === e, `${why ? `${why}\n       ` : ''}expected ${e}, got ${a}`);
}

function realDoubleClick(el) {
    const opts = { bubbles: true, cancelable: true, button: 0, clientX: 40, clientY: 8 };
    for (const detail of [1, 2]) {
        el.dispatchEvent(new dom.window.MouseEvent('mousedown', { ...opts, detail }));
        el.dispatchEvent(new dom.window.MouseEvent('mouseup', { ...opts, detail }));
        el.dispatchEvent(new dom.window.MouseEvent('click', { ...opts, detail }));
    }
    el.dispatchEvent(new dom.window.MouseEvent('dblclick', { ...opts, detail: 2 }));
}
function realClick(el) {
    const opts = { bubbles: true, cancelable: true, button: 0 };
    el.dispatchEvent(new dom.window.MouseEvent('mousedown', opts));
    el.dispatchEvent(new dom.window.MouseEvent('mouseup', opts));
    el.dispatchEvent(new dom.window.MouseEvent('click', opts));
}
function pullDown(el, dy) {
    el.dispatchEvent(new dom.window.MouseEvent('pointerdown', {
        bubbles: true, cancelable: true, button: 0, clientX: 40, clientY: 8 }));
    dom.window.dispatchEvent(new dom.window.MouseEvent('pointermove', {
        bubbles: true, clientX: 40, clientY: 8 + dy }));
    dom.window.dispatchEvent(new dom.window.MouseEvent('pointerup', { bubbles: true }));
}
function dragStart(el) {
    const ev = new dom.window.Event('dragstart', { bubbles: true, cancelable: true });
    const data = {};
    const dt = { types: [], effectAllowed: 'none', dropEffect: 'none',
                 setData(t, v) { data[t] = v; if (!this.types.includes(t)) this.types.push(t); },
                 getData(t) { return data[t] ?? ''; }, setDragImage() {} };
    Object.defineProperty(ev, 'dataTransfer', { value: dt, configurable: true });
    el.dispatchEvent(ev);
    return ev;
}

const taxonomy = createTaxonomy({
    root: 'home',
    kinds: {
        home:  { label: 'Home', icon: 'home' },
        table: { label: 'Table', icon: 'table', topNav: 'home' },
    },
});

/** A renderer over one leaf, under `layout`. `tabs` adds tabs after the first.
 *  `mounts` counts content mounts, so a test can prove nothing re-mounted. */
function mountRenderer({ layout = 'header', tabs = [], content = null, ctx = null } = {}) {
    const root = dom.window.document.createElement('div');
    dom.window.document.getElementById('root').appendChild(root);
    const tree = new TileTree();
    const leafId = tree.setRoot(makeLeaf({
        content: content ?? { kind: 'table', props: { id: 't1' } }, title: 'Customer' }));
    for (const t of tabs) tree.appendLeafTab(leafId, { kind: 'table', props: { id: t } }, t);
    if (tabs.length) tree.setActiveLeafTab(leafId, 0);
    const calls = [];
    const mounts = { n: 0 };
    const renderer = new TileRenderer({
        root, tree, tabLayout: layout,
        content: createContentRegistry({
            table: (host) => { mounts.n += 1; host.textContent = 'grid'; return {}; },
            'panel:left': (host) => { host.textContent = 'nav'; return {}; },
        }),
        ctx: ctx ?? {
            taxonomy,
            onLeafAction: (id, action) => calls.push(['leaf', id, action]),
            onLeafTabAction: (id, action, data) => calls.push(['tab', id, action, data]),
        },
    });
    renderer.render();
    const wrap = () => root.querySelector('.twm-leaf');
    const chrome = () => wrap().querySelector('.twm-leaf__chrome');
    return { root, tree, leafId, calls, mounts, renderer, wrap, chrome };
}

console.log('\ntabLayout: header — the tabs are the title\n');

// ════════════════════════════════════════════════════════════════════════
// 1. ONE TAB IS ENOUGH
// ════════════════════════════════════════════════════════════════════════
{
    const f = mountRenderer();
    const bar = f.chrome().querySelector('.twm-leaf__tabbar');
    ok('the strip is INSIDE the chrome', !!bar);
    ok('…and not hidden, though the leaf has one tab',
       bar && !bar.classList.contains('twm-leaf__tabbar--hidden'));
    ok('it carries the `--header` modifier, not `--top`',
       bar?.classList.contains('twm-leaf__tabbar--header')
       && !bar.classList.contains('twm-leaf__tabbar--top'));
    check('it sits where the title was — right after it, before the actions',
          [...f.chrome().children].map((el) => el.className.split(' ')[0]),
          ['twm-leaf__icon', 'twm-leaf__title', 'twm-leaf__tabbar',
           'twm-leaf__actions', 'twm-leaf__actions']);
    ok('the wrap is marked, so the stylesheet hides the title and glyph',
       f.wrap().classList.contains('twm-leaf--tabs-in-header'));
    check('the one tab is named as the title was',
          [...bar.querySelectorAll('.tab .twm-tab-title')].map((e) => e.textContent),
          ['Customer']);
    ok('a `+` follows the strip', !!bar.querySelector(':scope > .twm-leaf__tab-new'));
    ok('the root reads `data-twm-tabs="header"`', f.root.dataset.twmTabs === 'header');
    ok('the chrome is NOT a drag source — the tab is',
       !f.chrome().hasAttribute('draggable'));
    check('and the root still took the layout from the attribute name, not a fallback',
          f.renderer.tabLayout, 'header');
}

// ════════════════════════════════════════════════════════════════════════
// 2. `+` OPENS A NEW TAB — THROUGH THE REAL `wm.newTab`
// ════════════════════════════════════════════════════════════════════════
{
    const f = mountRenderer();
    const add = f.chrome().querySelector('.twm-leaf__tab-new');
    realClick(add);
    check('`+` asks the WM for `new` on its own leaf',
          f.calls.map(([k, id, a]) => [k, id, a]), [['tab', f.leafId, 'new']]);
    check('…and is not a grip: the click floated nothing',
          f.calls.filter(([k]) => k === 'leaf').length, 0);

    // The WM half, on a hand-built `this`: only `newTab` and its tree are real.
    const notes = [];
    const wm = Object.create(WindowManager.prototype);
    Object.assign(wm, {
        taxonomy,
        _tree: () => f.tree,
        _rootLeaf: () => ({ content: { kind: 'home', props: {} }, title: 'Home' }),
        renderer: f.renderer,
        _persist() { notes.push('persist'); },
        _notifyChange(r) { notes.push(r); },
    });
    const idx = wm.newTab(f.leafId);
    const leaf = f.tree.get(f.leafId);
    check('the new tab is appended and shown', [idx, leaf.activeTabIdx], [1, 1]);
    check('it holds the taxonomy root, as a split\'s new pane does',
          leaf.tabs.map((t) => t.kind), ['table', 'home']);
    check('the WM persisted and said why', notes, ['persist', 'tab-new']);
    check('the strip now draws both', [...f.chrome().querySelectorAll('.tab .twm-tab-title')]
        .map((e) => e.textContent), ['Customer', 'Home']);
    check('the `+` is still there, once', f.chrome().querySelectorAll('.twm-leaf__tab-new').length, 1);

    // A panel grows no tabs, and `newTab` says so rather than pretending.
    const p = mountRenderer({ content: { kind: 'panel:left', props: {} } });
    Object.assign(wm, { _tree: () => p.tree, renderer: p.renderer });
    check('`newTab` on a panel does nothing and answers -1', wm.newTab(p.leafId), -1);
}

// ════════════════════════════════════════════════════════════════════════
// 3. A PANEL KEEPS ITS TITLE
// ════════════════════════════════════════════════════════════════════════
{
    const f = mountRenderer({ content: { kind: 'panel:left', props: {} } });
    ok('a panel is not marked tabs-in-header',
       !f.wrap().classList.contains('twm-leaf--tabs-in-header'));
    ok('…and its strip is hidden',
       f.wrap().querySelector('.twm-leaf__tabbar').classList.contains('twm-leaf__tabbar--hidden'));
    ok('…and has no `+`', !f.wrap().querySelector('.twm-leaf__tab-new'));
}

// ════════════════════════════════════════════════════════════════════════
// 4. SWITCHING LAYOUT LIVE
// ════════════════════════════════════════════════════════════════════════
{
    const f = mountRenderer();
    const body = f.wrap().querySelector('.twm-leaf__body');
    const mounted = f.mounts.n;

    f.root.setAttribute('data-twm-tabs', 'top');
    await new Promise((r) => setTimeout(r, 0));    // the observer is a microtask
    const bar = f.wrap().querySelector('.twm-leaf__tabbar');
    ok('under `top` the strip leaves the chrome and sits above the body',
       bar.parentElement === f.wrap() && bar.nextElementSibling === body);
    ok('…hidden again, because `top` draws one tab as no strip',
       bar.classList.contains('twm-leaf__tabbar--hidden'));
    ok('…the wrap mark is gone, so the title shows',
       !f.wrap().classList.contains('twm-leaf--tabs-in-header'));
    ok('…and the `+` went with the `header` strip', !f.wrap().querySelector('.twm-leaf__tab-new'));
    ok('…and the chrome is the single tab\'s drag source again (C33)',
       f.chrome().getAttribute('draggable') === 'true');

    f.renderer.setTabLayout('header');
    ok('back to `header`: the strip is in the chrome again',
       bar.parentElement === f.chrome() && !bar.classList.contains('twm-leaf__tabbar--hidden'));
    check('…with one `+`', f.chrome().querySelectorAll('.twm-leaf__tab-new').length, 1);
    ok('the body is the same element throughout', f.wrap().querySelector('.twm-leaf__body') === body);
    check('and the content was never re-mounted', f.mounts.n, mounted);

    f.renderer.setTabLayout('bottom');
    ok('under `bottom` the strip is the wrap\'s last child', f.wrap().lastElementChild === bar);
}

// ════════════════════════════════════════════════════════════════════════
// 5. THE CHROME'S GESTURES
// ════════════════════════════════════════════════════════════════════════
{
    const f = mountRenderer({ tabs: ['Orders'] });
    const tab = f.chrome().querySelector('.notebook-tabs .tab');
    ok('the chrome holds a real tab', !!tab);

    realDoubleClick(tab);
    check('double-clicking a tab does not float the pane',
          f.calls.filter(([k, , a]) => k === 'leaf' && a === 'promote').length, 0);
    f.calls.length = 0;
    pullDown(tab, 60);
    check('pulling a tab down does not either',
          f.calls.filter(([k, , a]) => k === 'leaf' && a === 'promote').length, 0);

    const ev = dragStart(tab);
    ok('a drag begun on a tab is not refused by the chrome it bubbles through',
       !ev.defaultPrevented);
    check('…and is the tab\'s own drag: the tile-tab marker went on it',
          ev.dataTransfer.types.includes(TileRenderer.TAB_MIME), true);
    dom.window.document.dispatchEvent(new dom.window.Event('dragend', { bubbles: true }));
    f.root.dispatchEvent(new dom.window.Event('dragend', { bubbles: true }));

    f.calls.length = 0;
    realDoubleClick(f.chrome());
    check('the empty chrome still floats the pane on a double-click',
          f.calls.filter(([k, , a]) => k === 'leaf' && a === 'promote').length, 1);
}

// ════════════════════════════════════════════════════════════════════════
// 6. A RENAMED TAB IS A RENAMED TITLE; NOTHING ELSE REBUILDS THE STRIP
// ════════════════════════════════════════════════════════════════════════
{
    const f = mountRenderer();
    const before = f.chrome().querySelector('.notebook-tabs .tab');
    f.renderer.render();
    ok('a repaint that changed no label keeps the tab element',
       f.chrome().querySelector('.notebook-tabs .tab') === before,
       'rebuilding the tabs on every repaint would detach one mid-drag');

    // A title written without touching props leaves the cache key alone, so
    // the leaf is NOT rebuilt — only the label refresh can carry it.
    const mounted = f.mounts.n;
    f.tree.get(f.leafId).tabs[0].title = 'Clients';
    f.renderer.render();
    check('a retitled tab shows its new name…',
          f.chrome().querySelector('.notebook-tabs .tab .twm-tab-title')?.textContent, 'Clients');
    check('…without a re-mount', f.mounts.n, mounted);
}

console.log(failures === 0
    ? '\nall assertions passed\n'
    : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
