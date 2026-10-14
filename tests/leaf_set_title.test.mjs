/**
 * ══ C41. A CONTENT CAN RENAME ITS OWN PANE ═══════════════════════════════
 *
 * A bottom panel with tabs of its own (BugDesk's Alerts and Changes) could not
 * say which one it showed: a factory's returned `title` is read once, the next
 * repaint puts `leaf.title` back, and for a `panel:*` leaf that is
 * PANEL_TITLES, which `wm._canonicalize` rewrites on every pass.
 *
 * `ctx.setTitle(text)` is the per-leaf answer. This suite drives it against the
 * REAL `WindowManager` and its real panel canonicalisation — a stubbed tree
 * would never rewrite the title, so the thing that broke it would be absent:
 *
 *   §1  set DURING the mount, it wins over the returned `title`
 *   §2  set later, it paints at once
 *   §3  it survives a repaint, and a panel toggle round trip that canonicalises
 *   §4  `setTitle(null)` gives the title back to the tree
 *   §5  a ctx whose leaf was rebuilt writes into nobody's chrome
 *
 *     node tests/leaf_set_title.test.mjs
 *
 * jsdom is borrowed from the sibling Tables checkout, as in every DOM suite
 * here; absent, this SKIPS loudly (and `tests/run.mjs` fails on the skip).
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
    console.log('leaf set title: SKIPPED — needs jsdom '
        + '(`cd ../Tables/web && npm install`, or `npm i -D jsdom` here)');
    process.exit(0);
}

const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>',
                      { url: 'http://localhost/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'Event',
                   'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'getComputedStyle',
                   'navigator', 'requestAnimationFrame', 'cancelAnimationFrame',
                   'MutationObserver', 'ResizeObserver', 'DOMRect', 'localStorage']) {
    if (dom.window[key] !== undefined && globalThis[key] === undefined) {
        globalThis[key] = dom.window[key];
    }
}
if (globalThis.PointerEvent === undefined) globalThis.PointerEvent = dom.window.MouseEvent;
if (globalThis.ResizeObserver === undefined) {
    globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
}

const { createContentRegistry } = await import('../src/tiling/content_registry.js');
const { createTaxonomy } = await import('../src/tiling/kind_taxonomy.js');
const { WindowManager } = await import('../src/tiling/wm.js');

let failures = 0;
function ok(what, cond, why = '') {
    if (cond) { console.log(`  ok   ${what}`); return; }
    failures += 1;
    console.log(`  FAIL ${what}${why ? `\n       ${why}` : ''}`);
}
function check(what, actual, expected) {
    ok(what, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// The bottom panel: it names itself at mount, and keeps its ctx for later.
let panelCtx = null;
let mounts = 0;
const root = dom.window.document.createElement('div');
dom.window.document.getElementById('root').appendChild(root);
const wm = new WindowManager({
    rootEl: root,
    taxonomy: createTaxonomy({ kinds: { home: { label: 'Home' } }, root: 'home' }),
    content: createContentRegistry({
        home: (host) => { host.textContent = 'home'; return {}; },
        'panel:bottom': (host, props, ctx) => {
            mounts += 1;
            panelCtx = ctx;
            host.textContent = 'panel';
            ctx.setTitle?.('Alerts');
            return { title: 'Returned title' };
        },
    }),
    panelDefaults: { left: false, right: false, bottom: true },
});
// `load()` is what materialises the panels (canonicalise), with no saved state.
await wm.load();

// By the bottom panel's leaf id: a panel with no factory draws a placeholder
// naming its kind, so matching on text would find the wrong pane.
const panelTitle = () => {
    const leaf = [...wm.desktops.active().tree.nodes.values()]
        .find((n) => n.kind === 'leaf' && n.content?.kind === 'panel:bottom');
    return root.querySelector(`.twm-leaf[data-leaf-id="${leaf?.id}"] .twm-leaf__title`)?.textContent;
};

console.log('§1 set during the mount');
ok('the per-leaf ctx carries setTitle', typeof panelCtx?.setTitle === 'function');
check('it wins over the returned title', panelTitle(), 'Alerts');

console.log('§2 set later');
panelCtx.setTitle('Changes');
check('it paints at once', panelTitle(), 'Changes');

console.log('§3 it survives repaints');
wm.renderer.render();
check('a plain repaint keeps it', panelTitle(), 'Changes');
const panelLeaf = [...wm.desktops.active().tree.nodes.values()]
    .find((n) => n.kind === 'leaf' && n.content?.kind === 'panel:bottom');
check('the tree still holds the framework title (nothing persisted)', panelLeaf?.title, 'Console');
wm.togglePanel('left');
check('a canonicalising panel toggle keeps it', panelTitle(), 'Changes');
wm.togglePanel('left');
check('and toggling back keeps it', panelTitle(), 'Changes');
check('the panel was not re-mounted by any of it', mounts, 1);

console.log('§4 cleared');
panelCtx.setTitle(null);
check('null gives the title back to the tree', panelTitle(), 'Console');
panelCtx.setTitle('Alerts');
panelCtx.setTitle('');
check('so does the empty string', panelTitle(), 'Console');
wm.renderer.render();
check('and a repaint agrees', panelTitle(), 'Console');

console.log('§5 a stale ctx');
const stale = panelCtx;
wm.togglePanel('bottom');
wm.togglePanel('bottom');
ok('closing and reopening the panel mounted it afresh', mounts === 2 && panelCtx !== stale, `mounts ${mounts}`);
check('the new mount named itself', panelTitle(), 'Alerts');
stale.setTitle('From a dead content');
check('the old ctx writes into nobody\'s chrome', panelTitle(), 'Alerts');

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
