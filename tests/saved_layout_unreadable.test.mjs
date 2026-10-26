/**
 * BUG-0048 — A SAVED LAYOUT THAT CANNOT BE READ IS IGNORED, WITH ONE WARNING,
 * AND THE SHELL OPENS WITH ITS DEFAULT LAYOUT.
 *
 * `WindowManager.load()` handed the stored `desktops` blob to
 * `DesktopManager.deserialize`, canonicalized it and rendered it with nothing
 * between it and `createShell`. The host catches INVALID JSON (it logs `[host]
 * bad JSON for state key desktops` and answers null), but valid JSON of the
 * wrong shape got through: a split whose `sizes` was a number threw
 * `sizes.slice is not a function`, one whose `sizes` was a string threw
 * `node.sizes.reduce is not a function` from inside the renderer, half way
 * through painting, and a null desktop threw on its `id`. `createShell` never
 * resolved, on every start, until someone deleted the file by hand. A truncated
 * or hand-edited `desktops` file is enough.
 *
 * Now `deserialize` reads the blob strictly and throws before it has built
 * anything the WM holds, and `load()` treats a throw as nothing saved: one
 * `[wm] bad layout for state key desktops` warning, the default layout, and no
 * exception. The bad blob is left in the store.
 *
 *   §1  the report, end to end: a real `createShell` over a saved layout with a
 *       split whose `sizes` is a number, a string, and a desktop without a tree;
 *       it mounts, in the default layout, and is usable
 *   §2  every shape of structurally broken, valid JSON gives the default
 *       layout, exactly one warning that names the state key and the path,
 *       no exception, and the same DOM, mounts, listeners and timers as a
 *       shell with nothing saved: the bad layout is never painted, not even in
 *       part
 *   §3  layouts that ARE readable still restore: a real save and cold start,
 *       and the older shapes the loader has always defaulted. Nothing here may
 *       fall back
 *   §4  `DesktopManager.deserialize` and `TileTree.deserialize` on their own:
 *       the error says where and what, input is never written to, nothing saved
 *       is still nothing saved
 *   §5  the bad blob is left alone until the shell next saves, which
 *       overwrites it; each boot over it warns once
 *   §6  the warning goes to `createShell`'s `logger`, else `console`, as ONE
 *       string; through a real `LoggingService` (scoped and not) the recorded
 *       message still names the key and the cause; a failed read and a host
 *       with no state are as they were
 *
 * jsdom is borrowed from the sibling Tables checkout; without it this SKIPS,
 * and tests/run.mjs counts a SKIPPED suite as a failure.
 *
 *     node tests/saved_layout_unreadable.test.mjs
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
    console.log('saved layout unreadable: SKIPPED — needs jsdom '
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
if (globalThis.CSS === undefined) {
    globalThis.CSS = { escape: (s) => String(s).replace(/["\\]/g, '\\$&') };
}

const { createShell } = await import('../src/tiling/shell.js');
const { createTaxonomy } = await import('../src/tiling/kind_taxonomy.js');
const { createEntityCatalog } = await import('../src/tiling/entity_sources.js');
const desktopsModule = await import('../src/tiling/desktops.js');
const { DesktopManager } = desktopsModule;
const { TileTree } = await import('../src/tiling/tile_tree.js');
const { WindowManager } = await import('../src/tiling/wm.js');
const { createContentRegistry } = await import('../src/tiling/content_registry.js');
const { LoggingService } = await import('../src/core/logging.js');

/** The logical state key the layout is saved under: what the warning names, and
 *  what the host's own `bad JSON for state key` line names. */
const DESKTOPS_KEY = 'desktops';
/** What every warning for an unreadable layout starts with; the cause follows. It
 *  is ONE string: the keymap's warnings are, and it is the only form that
 *  survives the embedder's loggers (§6). */
const WARN_PREFIX = `[wm] bad layout for state key ${DESKTOPS_KEY} (opening the default layout): `;

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

/** One section of the suite. A section that dies (the shell threw where it
 *  should not have) is a FAILURE of that section, not the end of the run, so
 *  the rest still report. */
async function section(title, body) {
    console.log(`\n${title}`);
    try { await body(); }
    catch (err) { failures++; console.error(`  FAIL the section threw: ${err?.stack ?? err}`); }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Longer than the WM's 500 ms save debounce. */
const SETTLE_MS = 700;

// Listeners and timers a boot arms are counted by wrapping the two doors they
// come through, so "the bad layout cost nothing" is a number, not a hope.
let listenerAdds = 0;
{
    const proto = dom.window.EventTarget.prototype;
    const add = proto.addEventListener;
    proto.addEventListener = function (...a) { listenerAdds++; return add.apply(this, a); };
}
let timersSet = 0;
{
    const set = globalThis.setTimeout;
    globalThis.setTimeout = (...a) => { timersSet++; return set(...a); };
}

const taxonomy = () => createTaxonomy({
    root: 'home',
    kinds: {
        home: { label: 'Home', icon: 'home', isTopNav: true, order: 1 },
        docs: { label: 'Docs', icon: 'description', isTopNav: true, order: 2 },
    },
});

// ── A real shell over an in-memory store ───────────────────────────────

/** The state a host keeps: text, as a file would be, so what is read back is
 *  VALID JSON of whatever shape was put there. `saved` undefined is nothing
 *  saved. */
function makeStore(saved) {
    const files = new Map();
    if (saved !== undefined) files.set(DESKTOPS_KEY, JSON.stringify(saved));
    const store = { files, writes: 0,
        read: async (k) => (files.has(k) ? JSON.parse(files.get(k)) : null),
        write: async (k, v) => { store.writes++; files.set(k, JSON.stringify(v)); return true; },
    };
    return store;
}

ok('(setup) the key the warning names is the one the module saves under',
   desktopsModule.DESKTOPS_KEY === DESKTOPS_KEY, String(desktopsModule.DESKTOPS_KEY));

/** Boot a shell over `store` and report what happened, whatever happened. The
 *  app's content factories count their mounts and unmounts: a layout painted
 *  even in part leaves a mount behind. console.warn / console.error are
 *  captured for the length of the boot. */
async function boot(store, { logger = null, host = { state: store } } = {}) {
    const seen = { warns: [], errors: [] };
    const counts = { mounted: {}, destroyed: {} };
    const content = Object.fromEntries(['home', 'docs'].map((kind) => [kind, (el) => {
        counts.mounted[kind] = (counts.mounted[kind] || 0) + 1;
        el.textContent = `${kind} content`;
        return { destroy() { counts.destroyed[kind] = (counts.destroyed[kind] || 0) + 1; } };
    }]));
    const root = dom.window.document.createElement('div');
    dom.window.document.getElementById('root').append(root);
    const warn = console.warn, error = console.error;
    console.warn = (...a) => { seen.warns.push(a); };
    console.error = (...a) => { seen.errors.push(a); };
    const listeners = listenerAdds, timers = timersSet;
    let shell = null, threw = null;
    try {
        shell = await createShell({
            root, host, logger, taxonomy: taxonomy(), content,
            entities: createEntityCatalog({ sources: [] }),
        });
    } catch (err) { threw = err; }
    finally { console.warn = warn; console.error = error; }
    return {
        shell, threw, root, store, counts, ...seen,
        listeners: listenerAdds - listeners,
        timers: timersSet - timers,
        wm: shell?.wm ?? null,
    };
}

/** Ids are random or counted and differ between two boots of the same layout. */
const dropIds = (v) => JSON.stringify(v, (k, x) => (k === 'id' ? undefined : x));
const kindsOf = (b) => b.wm.desktops.active().tree.leaves().map((l) => l.content?.kind);
const layoutOf = (b) => dropIds(b.wm.desktops.serialize());
/** The tile DOM with the ids that count up between boots taken out. */
const domOf = (b) => b.root.innerHTML.replace(/\b(leaf|split)-[\w-]+/g, '$1');

/** What a shell with nothing saved looks like: the default every broken layout
 *  below has to equal. */
const clean = await boot(makeStore(undefined));
const DEFAULT_KINDS = ['panel:left', 'home', 'panel:right', 'panel:bottom'];
check('(setup) a shell with nothing saved opens the default layout, silently',
      [clean.threw, kindsOf(clean), clean.warns.length, clean.errors.length],
      [null, DEFAULT_KINDS, 0, 0]);
ok('(setup) ...and its counters are real: it painted and attached listeners, and the timer counter counts',
   clean.listeners > 0 && clean.counts.mounted.home === 1 && ((n) => { setTimeout(() => {}, 0); return timersSet === n + 1; })(timersSet),
   `listeners ${clean.listeners}, mounted ${JSON.stringify(clean.counts.mounted)}`);
{
    const again = await boot(makeStore(undefined));
    check('(setup) two boots of the default layout have the same DOM, so the comparison below can fail',
          [domOf(again) === domOf(clean), layoutOf(again) === layoutOf(clean)], [true, true]);
    again.shell.dispose();
}
const CLEAN = {
    layout: layoutOf(clean), dom: domOf(clean), mounted: clean.counts.mounted,
    listeners: clean.listeners, timers: clean.timers,
};
clean.shell.dispose();

// ── Saved layouts, built by hand ───────────────────────────────────────

const tab = (kind, props = {}, title = kind) => ({ kind, props, title });
const leaf = (kind, extra = {}) => ({
    kind: 'leaf', title: kind, content: { kind, props: {} }, tabs: [tab(kind)],
    activeTabIdx: 0, pageTabs: {}, ...extra,
});
const split = (dir, children, sizes = children.map(() => 1)) => ({ kind: 'split', dir, sizes, children });
const desktop = (root, extra = {}) => ({
    id: 'd1', label: '1', tree: { root, focusedTitle: 'Home' },
    panels: { left: true, right: true, bottom: true }, ...extra,
});
/** Two desktops. The first is two docs tiles and a home tile, docs FIRST: a
 *  layout painted before it was found broken would leave a docs mount behind,
 *  and the default layout has none. */
const good = () => ({
    activeIdx: 0,
    desktops: [
        desktop(split('h', [leaf('docs'), split('v', [leaf('home'), leaf('docs')])])),
        desktop(leaf('home'), { id: 'd2', label: '2' }),
    ],
});
// Paths into good(), for the table below.
const D0 = (b) => b.desktops[0];
const D1 = (b) => b.desktops[1];
const ROOT = (b) => b.desktops[0].tree.root;
const DOCS = (b) => ROOT(b).children[0];            // a leaf, the first mounted
const INNER = (b) => ROOT(b).children[1];           // a split inside the root

/** Boot over `blob` and compare with the shell that had nothing saved. */
async function facts(blob, { where = null } = {}) {
    const b = await boot(makeStore(blob));
    const w = b.warns[0] || [];
    const out = {
        resolved: b.threw === null,
        ...(b.threw ? { threw: String(b.threw.message) } : {}),
        warnings: b.warns.length,
        errors: b.errors.length,
        named: w.length === 1 && typeof w[0] === 'string' && w[0].startsWith(WARN_PREFIX),
        said: typeof w[0] === 'string' ? w[0].slice(WARN_PREFIX.length) : '',
    };
    if (b.shell) {
        out.defaultLayout = layoutOf(b) === CLEAN.layout;
        out.sameDom = domOf(b) === CLEAN.dom;
        out.sameMounts = JSON.stringify(b.counts.mounted) === JSON.stringify(CLEAN.mounted);
        out.nothingUnmounted = Object.keys(b.counts.destroyed).length === 0;
        out.sameListeners = b.listeners === CLEAN.listeners;
        out.sameTimers = b.timers === CLEAN.timers;
        b.shell.dispose();
    }
    // The path the message names is what lets a person find the damage.
    if (where !== null) out.path = out.said.startsWith(`${where}: `);
    return { ...out, b };
}
const HEALTHY = {
    resolved: true, warnings: 1, errors: 0, named: true,
    defaultLayout: true, sameDom: true, sameMounts: true, nothingUnmounted: true,
    sameListeners: true, sameTimers: true, path: true,
};
const verdict = (f) => Object.fromEntries(Object.keys(HEALTHY).map((k) => [k, f[k]]));

// ── §1 The report, end to end ──────────────────────────────────────────
await section('§1 a saved layout with the wrong shape no longer stops createShell', async () => {
    // The report's own example: a split whose `sizes` is not an array. As a
    // number it threw in `makeSplit`; as a string it got to the renderer and
    // threw `node.sizes.reduce is not a function` after mounting the tile before
    // it.
    for (const [name, sizes] of [['a number', 5], ['a string', 'wide']]) {
        const blob = good();
        INNER(blob).sizes = sizes;
        const f = await facts(blob, { where: 'desktops[0].tree.root.children[1].sizes' });
        check(`a split whose sizes is ${name}: createShell resolves in the default layout, one warning`,
              verdict(f), HEALTHY);
        const w = f.b.warns[0] || [];
        check(`  the warning is one string: [wm] ... state key desktops (opening the default layout): why`,
              [w.length, typeof w[0], String(w[0]).startsWith(WARN_PREFIX)], [1, 'string', true]);
        ok(`  it says where and what: ${f.said}`,
           f.said === `desktops[0].tree.root.children[1].sizes: expected 2 non-negative numbers, one per child, found ${JSON.stringify(sizes)}`);
    }

    // The report's second step: a desktop's `tree` removed.
    const blob = good();
    delete D1(blob).tree;
    const f = await facts(blob, { where: 'desktops[1].tree' });
    check('a desktop with its tree removed: the default layout, one warning, the whole layout set aside',
          verdict(f), HEALTHY);
    check('  (the first desktop was fine and is not kept: a half-trusted layout is no layout)',
          f.b.wm.desktops.desktops.length, 1);

    // And the shell that opened is a working one, not a husk.
    const b = await boot(makeStore((() => { const g = good(); INNER(g).sizes = 5; return g; })()));
    ok('(setup) it mounted: the default content is on screen', b.root.textContent.includes('home content'),
       b.root.textContent);
    b.wm.openInPrimary('docs', { id: 'x' });
    ok('it takes a new tab as any shell does', b.root.textContent.includes('docs content'), b.root.textContent);
    b.wm.addDesktop({ switchTo: true });
    check('...and a new desktop', [b.wm.desktops.desktops.length, b.wm.desktops.activeIdx], [2, 1]);
    b.shell.dispose();
});

// ── §2 Every shape ─────────────────────────────────────────────────────
// [what is wrong, how to break good(), the path the warning must name]. A
// mutate that RETURNS a value replaces the whole blob.
const BROKEN = [
    // the blob itself
    ['the blob is a number', () => 5, 'desktops'],
    ['the blob is a string', () => 'oops', 'desktops'],
    ['the blob is an empty string', () => '', 'desktops'],
    ['the blob is zero', () => 0, 'desktops'],
    ['the blob is true', () => true, 'desktops'],
    ['the blob is an array', () => [], 'desktops'],
    ['the blob is an empty object', () => ({}), 'desktops'],
    ['desktops is an object', (b) => { b.desktops = {}; }, 'desktops'],
    ['desktops is an object keyed like an array', (b) => { b.desktops = { 0: D0(b) }; }, 'desktops'],
    ['desktops is a string', (b) => { b.desktops = 'd1'; }, 'desktops'],
    ['desktops is null', (b) => { b.desktops = null; }, 'desktops'],
    ['desktops is missing', (b) => { delete b.desktops; }, 'desktops'],
    ['desktops is empty', (b) => { b.desktops = []; }, 'desktops'],
    // a desktop
    ['a desktop is null', (b) => { b.desktops[1] = null; }, 'desktops[1]'],
    ['a desktop is a number', (b) => { b.desktops[0] = 3; }, 'desktops[0]'],
    ['a desktop is a string', (b) => { b.desktops[1] = 'd2'; }, 'desktops[1]'],
    ['a desktop is an array', (b) => { b.desktops[0] = []; }, 'desktops[0]'],
    ['a desktop has no tree', (b) => { delete D0(b).tree; }, 'desktops[0].tree'],
    ['a desktop tree is a string', (b) => { D1(b).tree = 'root'; }, 'desktops[1].tree'],
    ['a desktop tree is a number', (b) => { D0(b).tree = 1; }, 'desktops[0].tree'],
    ['a desktop tree is an array', (b) => { D0(b).tree = []; }, 'desktops[0].tree'],
    ['a desktop tree is an empty object', (b) => { D0(b).tree = {}; }, 'desktops[0].tree'],
    ['a desktop tree has a null root', (b) => { D1(b).tree = { root: null }; }, 'desktops[1].tree'],
    ['a desktop tree has a string root', (b) => { D0(b).tree.root = 'leaf'; }, 'desktops[0].tree'],
    ['a desktop panels is a number', (b) => { D0(b).panels = 1; }, 'desktops[0].panels'],
    ['a desktop panels is a string', (b) => { D0(b).panels = 'all'; }, 'desktops[0].panels'],
    ['a desktop panels is an array', (b) => { D0(b).panels = []; }, 'desktops[0].panels'],
    ['panelShares is a number', (b) => { D0(b).panelShares = 0.2; }, 'desktops[0].panelShares'],
    ['panelShares is an array', (b) => { D0(b).panelShares = [0.2]; }, 'desktops[0].panelShares'],
    // a node
    ['the root node is null', (b) => { D0(b).tree.root = null; }, 'desktops[0].tree'],
    ['the root node is an array', (b) => { D0(b).tree.root = [leaf('home')]; }, 'desktops[0].tree'],
    ['a child node is null', (b) => { ROOT(b).children[1] = null; }, 'desktops[0].tree.root.children[1]'],
    ['a child node is a number', (b) => { INNER(b).children[0] = 4; }, 'desktops[0].tree.root.children[1].children[0]'],
    ['a child node is a string', (b) => { ROOT(b).children[0] = 'docs'; }, 'desktops[0].tree.root.children[0]'],
    ['a node of an unknown kind', (b) => { INNER(b).kind = 'banana'; }, 'desktops[0].tree.root.children[1].kind'],
    ['a node with no kind', (b) => { delete INNER(b).kind; }, 'desktops[0].tree.root.children[1].kind'],
    ['a node kind in the wrong case', (b) => { DOCS(b).kind = 'Leaf'; }, 'desktops[0].tree.root.children[0].kind'],
    ['a node kind that is a number', (b) => { ROOT(b).kind = 2; }, 'desktops[0].tree.root.kind'],
    // a split
    ['a split with no dir', (b) => { delete ROOT(b).dir; }, 'desktops[0].tree.root.dir'],
    ['a split dir that is not h or v', (b) => { INNER(b).dir = 'x'; }, 'desktops[0].tree.root.children[1].dir'],
    ['a split dir in the wrong case', (b) => { ROOT(b).dir = 'H'; }, 'desktops[0].tree.root.dir'],
    ['a split with no children', (b) => { delete INNER(b).children; }, 'desktops[0].tree.root.children[1].children'],
    ['a split whose children is null', (b) => { ROOT(b).children = null; }, 'desktops[0].tree.root.children'],
    ['a split whose children is a string', (b) => { ROOT(b).children = 'ab'; }, 'desktops[0].tree.root.children'],
    ['a split whose children is an object', (b) => { INNER(b).children = {}; }, 'desktops[0].tree.root.children[1].children'],
    ['a split whose children is empty', (b) => { INNER(b).children = []; INNER(b).sizes = []; }, 'desktops[0].tree.root.children[1].children'],
    ['a split with no sizes', (b) => { delete INNER(b).sizes; }, 'desktops[0].tree.root.children[1].sizes'],
    ['a split whose sizes is null', (b) => { ROOT(b).sizes = null; }, 'desktops[0].tree.root.sizes'],
    ['a split whose sizes is a number', (b) => { ROOT(b).sizes = 5; }, 'desktops[0].tree.root.sizes'],
    ['a split whose sizes is a string', (b) => { INNER(b).sizes = '11'; }, 'desktops[0].tree.root.children[1].sizes'],
    ['a split whose sizes is an object', (b) => { ROOT(b).sizes = { 0: 1, 1: 1 }; }, 'desktops[0].tree.root.sizes'],
    ['a split with fewer sizes than children', (b) => { ROOT(b).sizes = [1]; }, 'desktops[0].tree.root.sizes'],
    ['a split with more sizes than children', (b) => { INNER(b).sizes = [1, 1, 1]; }, 'desktops[0].tree.root.children[1].sizes'],
    ['a size that is a string', (b) => { ROOT(b).sizes = [1, '1']; }, 'desktops[0].tree.root.sizes'],
    ['a size that is null', (b) => { ROOT(b).sizes = [null, 1]; }, 'desktops[0].tree.root.sizes'],
    ['a size that is negative', (b) => { INNER(b).sizes = [1, -1]; }, 'desktops[0].tree.root.children[1].sizes'],
    ['a size that is an object', (b) => { ROOT(b).sizes = [1, {}]; }, 'desktops[0].tree.root.sizes'],
    // a leaf
    ['a leaf content that is a string', (b) => { DOCS(b).content = 'docs'; }, 'desktops[0].tree.root.children[0].content'],
    ['a leaf content with no kind', (b) => { DOCS(b).content = { props: {} }; }, 'desktops[0].tree.root.children[0].content'],
    ['a leaf content kind that is a number', (b) => { DOCS(b).content.kind = 9; }, 'desktops[0].tree.root.children[0].content'],
    ['a leaf tabs that is a string', (b) => { DOCS(b).tabs = 'docs'; }, 'desktops[0].tree.root.children[0].tabs'],
    ['a leaf tabs that is an object', (b) => { DOCS(b).tabs = {}; }, 'desktops[0].tree.root.children[0].tabs'],
    ['a tab that is null', (b) => { DOCS(b).tabs = [null]; }, 'desktops[0].tree.root.children[0].tabs[0]'],
    ['a tab that is a number', (b) => { DOCS(b).tabs.push(6); }, 'desktops[0].tree.root.children[0].tabs[1]'],
    ['a tab with no kind', (b) => { DOCS(b).tabs = [{ props: {} }]; }, 'desktops[0].tree.root.children[0].tabs[0]'],
    ['a tab kind that is a number', (b) => { DOCS(b).tabs[0].kind = 6; }, 'desktops[0].tree.root.children[0].tabs[0]'],
    ['an activeTabIdx that is a string', (b) => { DOCS(b).activeTabIdx = '0'; }, 'desktops[0].tree.root.children[0].activeTabIdx'],
    ['an activeTabIdx that is an object', (b) => { INNER(b).children[0].activeTabIdx = {}; }, 'desktops[0].tree.root.children[1].children[0].activeTabIdx'],
    ['a pageTabs that is a string', (b) => { DOCS(b).pageTabs = 'docs'; }, 'desktops[0].tree.root.children[0].pageTabs'],
    ['a pageTabs that is an array', (b) => { DOCS(b).pageTabs = []; }, 'desktops[0].tree.root.children[0].pageTabs'],
    ['a page archive that is null', (b) => { DOCS(b).pageTabs = { docs: null }; }, 'desktops[0].tree.root.children[0].pageTabs["docs"]'],
    ['a page archive with no tabs', (b) => { DOCS(b).pageTabs = { docs: {} }; }, 'desktops[0].tree.root.children[0].pageTabs["docs"]'],
    ['a page archive whose tabs is a string', (b) => { DOCS(b).pageTabs = { docs: { tabs: 'x' } }; }, 'desktops[0].tree.root.children[0].pageTabs["docs"]'],
    ['a tab in a page archive that is null', (b) => { DOCS(b).pageTabs = { docs: { tabs: [null] } }; }, 'desktops[0].tree.root.children[0].pageTabs["docs"].tabs[0]'],
    ['a page archive activeTabIdx that is a string', (b) => { DOCS(b).pageTabs = { docs: { tabs: [], activeTabIdx: 'x' } }; }, 'desktops[0].tree.root.children[0].pageTabs["docs"].activeTabIdx'],
    // where it is
    ['the damage is in the second desktop, the first being fine',
        (b) => { D1(b).tree.root = split('h', [leaf('home'), leaf('home')], 'x'); }, 'desktops[1].tree.root.sizes'],
    ['the damage is in the last of four desktops',
        (b) => { b.desktops.push(desktop(leaf('docs'), { id: 'd3', label: '3' }),
                                 desktop(split('h', [leaf('home'), leaf('docs')], [1]), { id: 'd4', label: '4' })); },
        'desktops[3].tree.root.sizes'],
    ['the damage is deep in the tree',
        (b) => { INNER(b).children[1] = split('h', [split('v', [leaf('home'), leaf('docs')], [1])], [1]); },
        'desktops[0].tree.root.children[1].children[1].children[0].sizes'],
];

await section('§2 each broken shape: the default layout, one warning naming the key, nothing painted', async () => {
    for (const [name, mutate, where] of BROKEN) {
        let blob = good();
        const replaced = mutate(blob);
        if (replaced !== undefined) blob = replaced;
        const f = await facts(blob, { where });
        check(`${name}: the default layout, one warning, nothing painted`, verdict(f), HEALTHY);
        if (f.b.shell === null) console.error(`    createShell threw: ${f.threw}`);
    }
});

// ── §3 What is readable still restores ─────────────────────────────────
await section('§3 a readable layout is restored, with no warning', async () => {
    /** Boot over `blob`; the layout must have come back, not the default. */
    async function restored(name, blob, expectKinds, extra = null) {
        const b = await boot(makeStore(blob));
        const kinds = b.wm ? kindsOf(b) : null;
        check(`${name}: restored, no warning`,
              [b.threw === null, b.warns.length, b.errors.length, kinds], [true, 0, 0, expectKinds]);
        if (b.wm && extra) extra(b);
        b.shell?.dispose();
        return b;
    }

    {
        // The real path: a shell saves what the user did, a cold shell reads it.
        const store = makeStore(undefined);
        const s1 = await boot(store);
        const wm = s1.wm;
        wm.openInPrimary('docs', { id: 'a' });
        wm.newTab();
        wm.split('h');
        wm.addDesktop();
        Object.assign(wm.desktops.desktops[1], { group: 'Pages', fixed: true });
        wm.togglePanel('bottom');
        wm.switchDesktop(1);
        wm.split('v');
        await sleep(SETTLE_MS);
        const saved = JSON.parse(store.files.get(DESKTOPS_KEY));
        const savedKinds = kindsOf(s1);
        s1.shell.dispose();
        ok('(setup) the shell saved two desktops, the second grouped and fixed, the first without a Console',
           saved.desktops.length === 2 && saved.desktops[1].group === 'Pages' && saved.desktops[1].fixed === true
           && saved.desktops[0].panels.bottom === false && saved.activeIdx === 1,
           JSON.stringify(saved).slice(0, 300));

        const s2 = await boot(store);
        // (`focusedTitle` is written for a person reading the file; nothing reads it
        // back, and a cold shell has not focused anything yet.)
        const noFocus = (v) => JSON.stringify(v, (k, x) => (k === 'focusedTitle' ? undefined : x));
        check('a layout the shell saved comes back whole on a cold start: no warning, same layout, same desktop',
              [s2.threw, s2.warns.length, s2.errors.length, noFocus(s2.wm.desktops.serialize()) === noFocus(saved),
               s2.wm.desktops.activeIdx, kindsOf(s2)],
              [null, 0, 0, true, 1, savedKinds]);
        check('...and it is the saved layout, not the default',
              [s2.wm.desktops.desktops.length, layoutOf(s2) === CLEAN.layout], [2, false]);
        s2.shell.dispose();
    }

    // Layouts older shapes of the format wrote, and shapes the loader defaults.
    await restored('a pre-tabs leaf (content, no tabs, no pageTabs)',
        { desktops: [{ id: 'old', label: '1', tree: { root: { kind: 'leaf', title: 'Docs', content: { kind: 'docs', props: {} } } } }] },
        ['panel:left', 'docs', 'panel:right', 'panel:bottom']);
    await restored('a desktop with nothing but its tree (no id, label, panels, panelShares, group, fixed)',
        { desktops: [{ tree: { root: leaf('docs') } }] },
        ['panel:left', 'docs', 'panel:right', 'panel:bottom'],
        (b) => check('  its panels take the defaults, its label the placeholder',
                     [b.wm.desktops.active().panels, b.wm.desktops.active().label],
                     [{ left: true, right: true, bottom: true }, '?']));
    await restored('an empty desktop (tree: null, which is how the shell saves one)',
        { activeIdx: 0, desktops: [{ id: 'e', label: '1', tree: null, panels: { left: false, right: false, bottom: false } }] },
        ['home']);
    await restored('a tab of a kind nobody registered',
        { desktops: [desktop(leaf('ghost'), { panels: { left: false, right: false, bottom: false } })] },
        ['ghost']);
    await restored('an empty tile (no tabs, no content)',
        { desktops: [desktop(leaf('home', { tabs: [], content: null, title: '' }), { panels: { left: false, right: false, bottom: false } })] },
        [undefined]);
    await restored('an activeIdx past the last desktop (clamped), a negative activeTabIdx, a tab with no props or title',
        { activeIdx: 9, desktops: [
            desktop(leaf('home'), { panels: { left: false, right: false, bottom: false } }),
            desktop(leaf('docs', { activeTabIdx: -3, tabs: [{ kind: 'docs' }] }), { id: 'd2', label: '2', panels: { left: false, right: false, bottom: false } }),
        ] },
        ['docs'],
        (b) => check('  the clamp kept the last desktop active', b.wm.desktops.activeIdx, 1));
    await restored('keys it does not know, at every level (a later release wrote them)',
        { future: 1, desktops: [{ ...desktop(split('h', [leaf('docs', { more: [] }), leaf('home')]), { panels: { left: false, right: false, bottom: false } }),
            pinned: true, tree: { focusedTitle: 'Docs', zoom: 2, root: { ...split('h', [leaf('docs', { more: [] }), leaf('home')]), tint: 'red' } } }] },
        ['docs', 'home']);
    await restored('a share that is not a share (dropped, the panel takes its default)',
        { desktops: [desktop(leaf('home'), { panelShares: { left: 'wide', right: 7, bottom: null } })] },
        ['panel:left', 'home', 'panel:right', 'panel:bottom']);
    await restored('values that are only drawn, of other types: a number for a title, label, id and group, a truthy fixed, a flag of 0, props that are a string',
        { activeIdx: '0', desktops: [{ id: 9, label: 7, group: 3, fixed: 'yes',
            panels: { left: 0, right: false, bottom: false },
            tree: { root: leaf('docs', { title: 4, content: { kind: 'docs', props: 'x' },
                tabs: [{ kind: 'docs', props: 'x', title: 12 }] }) } }] },
        ['docs'],
        (b) => check('  they are taken as they are',
                     [b.wm.desktops.active().label, b.wm.desktops.active().group, b.wm.desktops.active().fixed,
                      b.wm.desktops.active().tree.leaves()[0].tabs[0].title],
                     [7, 3, true, 12]));
await restored('a page archive, a group and a fixed desktop',
        { desktops: [desktop(leaf('home', { pageTabs: { docs: { tabs: [tab('docs', { id: 3 })], activeTabIdx: 0 } } }),
            { group: 'Pages', fixed: true, panels: { left: false, right: false, bottom: false } })] },
        ['home'],
        (b) => check('  the archive and the group came back',
                     [Object.keys(b.wm.desktops.active().tree.leaves()[0].pageTabs), b.wm.desktops.active().group, b.wm.desktops.active().fixed],
                     [['docs'], 'Pages', true]));
});

// ── §4 The deserializers on their own ──────────────────────────────────
await section('§4 DesktopManager.deserialize and TileTree.deserialize', async () => {
    const seed = () => ({ content: { kind: 'home', props: {} }, title: 'Home' });
    const fresh = DesktopManager.deserialize(undefined, { seed });
    check('nothing saved (undefined) is a fresh manager with one desktop',
          [fresh.desktops.length, fresh.activeIdx], [1, 0]);
    check('...and null the same', DesktopManager.deserialize(null, { seed }).desktops.length, 1);

    const tryRead = (blob) => {
        try { DesktopManager.deserialize(blob, { seed }); return null; } catch (err) { return err; }
    };
    const err = tryRead((() => { const b = good(); INNER(b).sizes = 5; return b; })());
    check('a split whose sizes is a number throws a TypeError that says where and what',
          [err instanceof TypeError, err?.message],
          [true, 'desktops[0].tree.root.children[1].sizes: expected 2 non-negative numbers, one per child, found 5']);
    check('a value too long to show is cut',
          tryRead((() => { const b = good(); ROOT(b).sizes = Array(40).fill('x'); return b; })())?.message
              .endsWith('found ["x","x","x","x","x","x","x","x","x",...'), true);
    check('a missing value is "nothing", not "undefined"',
          tryRead((() => { const b = good(); delete D1(b).tree; return b; })())?.message,
          'desktops[1].tree: expected { root }, or null for an empty desktop, found nothing');

    // Reading never writes to what it reads: a frozen blob reads, and a frozen
    // broken blob still fails with the TypeError that names the damage, not
    // with a complaint about assigning to it.
    const freeze = (v) => { if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };
    check('a frozen readable blob reads', tryRead(freeze(good())), null);
    check('a frozen broken blob fails on the damage',
          tryRead(freeze((() => { const b = good(); DOCS(b).tabs = [null]; return b; })()))?.message.startsWith('desktops[0].tree.root.children[0].tabs[0]: '), true);

    // TileTree.deserialize keeps its own contract for an empty blob and names
    // its own path.
    check('TileTree.deserialize of nothing, or of a blob with no root, is the empty tree',
          [TileTree.deserialize(null).rootId, TileTree.deserialize({}).rootId, TileTree.deserialize(undefined).root()],
          [null, null, null]);
    const t = TileTree.deserialize({ root: split('h', [leaf('home'), leaf('docs')]) });
    check('a readable tree comes back', t.leaves().map((l) => l.content.kind), ['home', 'docs']);
    const unreadable = (...args) => {
        try { TileTree.deserialize({ root: { kind: 'leaf', tabs: 'x' } }, ...args); return null; }
        catch (e) { return e.message; }
    };
    check('a tree that is unreadable says so under the name it was given, `tree` by default',
          [unreadable(), unreadable('wanted')],
          ['tree.root.tabs: expected an array of tabs, found "x"', 'wanted.root.tabs: expected an array of tabs, found "x"']);
});

// ── §5 The bad blob is left alone; the next save overwrites it ─────────
await section('§5 the bad blob stays until the shell saves', async () => {
    const bad = good();
    INNER(bad).sizes = 5;
    const badText = JSON.stringify(bad);
    const store = makeStore(bad);

    const s1 = await boot(store);
    check('boot over the bad blob: one warning', [s1.threw, s1.warns.length], [null, 1]);
    await sleep(SETTLE_MS);
    check('...the store still holds the bad blob byte for byte, and nothing was written',
          [store.files.get(DESKTOPS_KEY) === badText, store.writes], [true, 0]);

    // Every boot over it says so, once.
    const s1b = await boot(store);
    check('a second boot over the same blob warns once more, not twice', [s1b.threw, s1b.warns.length], [null, 1]);
    s1b.shell.dispose();

    // A layout change saves the default layout's descendant over it.
    s1.wm.newTab();
    await sleep(SETTLE_MS);
    check('the first layout change writes, once, over the bad blob', [store.writes, store.files.get(DESKTOPS_KEY) !== badText], [1, true]);
    const savedKinds = kindsOf(s1);
    s1.shell.dispose();

    const s2 = await boot(store);
    check('the next boot reads what was saved: no warning, the layout of the shell that saved it',
          [s2.threw, s2.warns.length, s2.errors.length, kindsOf(s2), s2.wm.desktops.active().tree.leaves().map((l) => l.tabs.length)],
          [null, 0, 0, savedKinds, s1.wm.desktops.active().tree.leaves().map((l) => l.tabs.length)]);
    s2.shell.dispose();
});

// ── §6 Where the warning goes; the rest of the load path ───────────────
await section('§6 the logger, and the paths that were already safe', async () => {
    const bad = good();
    delete D0(bad).tree;

    // `logger` is createShell's own option: told instead of the console.
    const told = [];
    const b = await boot(makeStore(bad), { logger: { warn: (...a) => told.push(a), info() {}, error() {} } });
    check('with a logger, the warning goes to logger.warn and not to console.warn, as one string',
          [b.threw, told.length, b.warns.length, told[0]?.length, typeof told[0]?.[0],
           String(told[0]?.[0]).startsWith(WARN_PREFIX + 'desktops[0].tree: ')],
          [null, 1, 0, 1, 'string', true]);
    b.shell.dispose();

    // The loggers an embedder really passes. A LoggingService's `scoped()` logger
    // reads two leading strings as (subcategory, message) and records only the
    // second; its own warn(message, metadata) records the first string and files
    // the rest as metadata. A warning spread over several arguments therefore
    // recorded "desktops" (scoped) or "[wm] bad layout for state key" (not): the
    // key was the whole message, or the cause was lost. The recorded message must
    // carry the key, the default-layout promise and the path, through both.
    let cause = null;
    try { DesktopManager.deserialize(JSON.parse(JSON.stringify(bad)), { seed: () => ({ content: { kind: 'home', props: {} }, title: 'Home' }) }); }
    catch (err) { cause = err.message; }
    for (const [label, pick, namespace] of [
        ['scoped(\'shell\')', (svc) => svc.scoped('shell'), 'shell'],
        ['the service itself', (svc) => svc, 'app'],
    ]) {
        const svc = new LoggingService({ minLevel: 'trace' });
        const viaService = await boot(makeStore(bad), { logger: pick(svc) });
        const recorded = svc.getHistory().filter((e) => e.level === 'warn');
        check(`through a LoggingService logger (${label}): one warning recorded, message and nothing but the message`,
              [viaService.threw, recorded.length, viaService.warns.length, recorded[0]?.namespace, recorded[0]?.data],
              [null, 1, 0, namespace, null]);
        ok(`  its message is the prefix and the TypeError's text, path included: ${recorded[0]?.message}`,
           recorded[0]?.message === WARN_PREFIX + cause && cause.startsWith('desktops[0].tree: '), cause);
        viaService.shell.dispose();
    }

    // A logger that cannot warn must not turn a bad layout back into a crash.
    const mute = await boot(makeStore(bad), { logger: {} });
    check('a logger with no warn: the shell still opens, quietly', [mute.threw, kindsOf(mute), mute.warns.length],
          [null, DEFAULT_KINDS, 0]);
    mute.shell.dispose();

    // Not changed: a read that throws, and a host that cannot persist.
    const failing = { state: { read: async () => { throw new Error('disk gone'); }, write: async () => true } };
    const r = await boot(null, { host: failing });
    check('a state read that throws: one warning (the old one), the default layout',
          [r.threw, r.warns.map((w) => w[0]), kindsOf(r)], [null, ['[desktops] load failed'], DEFAULT_KINDS]);
    r.shell.dispose();
    const none = await boot(null, { host: null });
    check('a host with no state: the default layout, no warning', [none.threw, none.warns.length, kindsOf(none)], [null, 0, DEFAULT_KINDS]);
    none.shell.dispose();

    // load() on a bare window manager, with no shell around it: it does not throw,
    // and the desktops it had are still the ones it has (nothing was assigned
    // from the bad blob, so there is nothing half-built to find).
    {
        const bareRoot = dom.window.document.createElement('div');
        dom.window.document.getElementById('root').append(bareRoot);
        const wm = new WindowManager({
            rootEl: bareRoot, taxonomy: taxonomy(), host: { state: makeStore(bad) },
            content: createContentRegistry({ home: (el) => { el.textContent = 'home'; return {}; } }),
        });
        const desktops = wm.desktops, tree = desktops.active().tree;
        const w = console.warn; const heard = [];
        console.warn = (...a) => heard.push(a);
        let thrown = null;
        try { await wm.load(); } catch (err) { thrown = err; } finally { console.warn = w; }
        check('WindowManager.load() over a bad blob does not throw, warns once, and assigns nothing from it',
              [thrown, heard.length, wm.desktops === desktops, wm.desktops.desktops.length, wm.renderer.tree === tree],
              [null, 1, true, 1, true]);
        check('...and what it painted is the default layout',
              wm.desktops.active().tree.leaves().map((l) => l.content?.kind), DEFAULT_KINDS);
        wm.renderer.destroy();
    }

    // load() itself, called again on a live shell over a blob that has since gone bad,
    // keeps what is on screen, as it does for nothing saved.
    const store = makeStore(undefined);
    const live = await boot(store);
    live.wm.openInPrimary('docs', { id: 'k' });
    await live.wm.load();                 // nothing saved: settles the panel shares a load measures
    const before = layoutOf(live);
    store.files.set(DESKTOPS_KEY, JSON.stringify({ desktops: 'gone' }));
    const w = console.warn; const heard = [];
    console.warn = (...a) => heard.push(a);
    let again = null;
    try { await live.wm.load(); } catch (err) { again = err; } finally { console.warn = w; }
    check('load() called again over a blob that has gone bad does not throw, warns once, and keeps the live layout',
          [again, heard.length, layoutOf(live) === before], [null, 1, true]);
    live.shell.dispose();
});

console.log(failures ? `\n${failures} FAILED` : '\nall assertions passed');
process.exit(failures ? 1 : 0);
