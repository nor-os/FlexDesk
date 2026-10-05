/**
 * C37 AGAINST A MOUNTED TILE AND A REAL FLOATED WINDOW.
 *
 * content_navigate_back.test.mjs pins the rule on a hand-built `this` whose
 * renderer is a stub — `contentOf: (id) => contents[id]` — so the REAL
 * `TileRenderer.contentOf` (`this._leafCache.get(leafId)?.content`) and a real
 * floated window's `mountInfo` were never reached by a test: a renamed cache
 * field, or a renderer that stored a wrapper instead of what the factory
 * returned, would have passed that whole suite (the 0.4.7 review). Here
 * nothing is stubbed: `createShell` builds the WindowManager, the renderer and
 * the keymap, a content FACTORY returns `navigateBack` / `canNavigateBack`
 * from its mount, and Backspace is a real `keydown` on the document.
 *
 *   §1  `contentOf(leafId)` is the very object the leaf's factory returned
 *   §2  Backspace — a keydown through `installKeymap` — climbs the tile's
 *       content, one level per press, and leaves the tile alone; at its top
 *       the walk runs as before
 *   §3  a tile floated into a real managed window: a press inside it makes
 *       Backspace climb the WINDOW's content (its `mountInfo`, mounted with
 *       the window's id), and `canNavigateBack` answers for the window too;
 *       a press outside it hands Backspace back to the tile
 *
 * jsdom is borrowed from the sibling Tables checkout, as in
 * tile_header_dblclick.test.mjs; without it this SKIPS, and tests/run.mjs
 * counts a SKIPPED suite as a failure unless it is run with --allow-skips.
 *
 *     node tests/content_navigate_back_mounted.test.mjs
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
    console.log('content navigate back (mounted): SKIPPED — needs jsdom '
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

const { createShell } = await import('../src/tiling/shell.js');
const { createTaxonomy } = await import('../src/tiling/kind_taxonomy.js');
const { createEntityCatalog } = await import('../src/tiling/entity_sources.js');

let failures = 0;
function check(name, actual, expected) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) { failures++; console.error(`  FAIL ${name}\n    got      ${a}\n    expected ${e}`); }
    else console.log(`  ok   ${name}`);
}
function ok(name, cond, why = '') {
    if (cond) { console.log(`  ok   ${name}`); return; }
    failures++;
    console.error(`  FAIL ${name}${why ? `\n    ${why}` : ''}`);
}
const tick = () => new Promise((r) => setTimeout(r, 0));

/** Backspace as the browser delivers it: a keydown on the page, not a call. */
const backspace = () => dom.window.document.body.dispatchEvent(new dom.window.KeyboardEvent(
    'keydown', { key: 'Backspace', bubbles: true, cancelable: true }));
/** A press: what `_backScope` reads to know which surface you are in. */
const press = (el) => el.dispatchEvent(new dom.window.MouseEvent(
    'pointerdown', { bubbles: true, cancelable: true, button: 0 }));

/** Every object the `home` factory returned, in mount order, with where it
 *  was mounted — a tile's leaf, or a window's id. */
const mounted = [];
const page = (levels, ctx) => {
    let at = levels;
    return {
        leafId: ctx.leafId ?? null,
        windowId: ctx.windowId ?? null,
        get at() { return at; },
        navigateBack() { if (at === 0) return false; at -= 1; return true; },
        canNavigateBack() { return at > 0; },
    };
};

const root = dom.window.document.getElementById('root');
const shell = await createShell({
    root,
    entities: createEntityCatalog({ sources: [] }),
    // `home` is the ROOT: no taxonomy parent, so at its top the only thing that
    // could make Back do anything is the content.
    taxonomy: createTaxonomy({
        root: 'home',
        kinds: { home: { label: 'Home', isTopNav: true } },
    }),
    content: {
        home: (host, props, ctx) => {
            host.textContent = 'home';
            const p = page(props.levels ?? 0, ctx || {});
            mounted.push(p);
            return p;
        },
    },
    panels: { left: false, right: false, bottom: false },
    promoteInPlace: true,
});
const wm = shell.wm;
const tree = wm.desktops.active().tree;
const leafId = tree.primaryLeafId();
tree.setLeafContent(leafId, { kind: 'home', props: { levels: 2 } }, 'Home');
wm.renderer.render();
await tick();

// ── §1 ──────────────────────────────────────────────────────────────────
console.log('\n§1 contentOf is what the factory returned');
const tilePage = mounted.filter((p) => p.leafId === leafId).at(-1);
ok('the factory mounted the tile with its levels', tilePage?.at === 2,
    `mounted: ${JSON.stringify(mounted.map((p) => [p.leafId, p.windowId, p.at]))}`);
ok('wm.renderer.contentOf(leafId) IS that object — not a copy, not a wrapper',
    wm.renderer.contentOf(leafId) === tilePage);
check('and a leaf the renderer has never drawn has none', wm.renderer.contentOf('no-such-leaf'), null);

// ── §2 ──────────────────────────────────────────────────────────────────
console.log('\n§2 Backspace through the keymap climbs the mounted content');
{
    const tabsBefore = JSON.stringify(tree.get(leafId).tabs.map((t) => [t.kind, t.props]));
    check('there is somewhere to go', wm.canNavigateBack(), true);
    backspace();
    check('one press, one level', tilePage.at, 1);
    check('and the tile is untouched', JSON.stringify(tree.get(leafId).tabs.map((t) => [t.kind, t.props])),
        tabsBefore);
    backspace();
    check('a second press, the next level', tilePage.at, 0);
    check('at its top, on the root kind with no history: nowhere', wm.canNavigateBack(), false);
    backspace();
    check('and a press there changes nothing',
        [tilePage.at, JSON.stringify(tree.get(leafId).tabs.map((t) => [t.kind, t.props]))],
        [0, tabsBefore]);
}

// ── §3 ──────────────────────────────────────────────────────────────────
console.log('\n§3 a real floated window: its mountInfo is asked');
{
    tree.setLeafContent(leafId, { kind: 'home', props: { levels: 1 } }, 'Home');
    wm.renderer.render();
    await tick();
    const winId = wm.floatPane(leafId);
    await tick();
    ok('the pane floated into a managed window', !!winId);
    const winPage = mounted.find((p) => p.windowId === winId);
    ok('the window mounted the content itself, with the window\'s id', winPage?.at === 1,
        `mounted: ${JSON.stringify(mounted.map((p) => [p.leafId, p.windowId, p.at]))}`);
    const behind = wm.renderer.contentOf(leafId);
    ok('and the tile behind holds a content of its own, at its top',
        !!behind && behind !== winPage && behind.at === 0);
    const winEl = root.querySelector(`[data-window-id="${winId}"]`);
    ok('the window is in the document, carrying its id', !!winEl);

    if (winEl && winPage) {
        press(winEl.querySelector('.twm-window-body') || winEl);
        check('a press inside it: canNavigateBack answers for the WINDOW', wm.canNavigateBack(), true);
        backspace();
        check('Backspace climbs the window\'s content, not the tile\'s',
            [winPage.at, behind?.at], [0, 0]);
        check('at the window content\'s top: nowhere', wm.canNavigateBack(), false);

        // A press anywhere else hands Back to the tile again.
        winPage.navigateBack = () => { throw new Error('the window was asked'); };
        if (behind) {
            const level = page(1, { leafId });
            behind.navigateBack = level.navigateBack.bind(level);
            behind.canNavigateBack = level.canNavigateBack.bind(level);
            press(root.querySelector(`.twm-leaf[data-leaf-id="${leafId}"] .twm-leaf__body`)
                || dom.window.document.body);
            check('a press on the tile: the tile\'s answer', wm.canNavigateBack(), true);
            const warn = console.warn;
            const warned = [];
            console.warn = (...a) => warned.push(String(a[1] ?? a[0]));
            backspace();
            console.warn = warn;
            check('and Backspace climbs the tile\'s content; the window is not asked',
                [level.at, warned], [0, []]);
        }
    }
}

shell.dispose?.();
console.log(failures ? `\n${failures} assertion(s) FAILED` : '\nall assertions passed');
process.exit(failures ? 1 : 0);
