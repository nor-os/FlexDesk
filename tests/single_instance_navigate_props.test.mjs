/**
 * STORY-0098 — AN ALREADY-OPEN SINGLE-INSTANCE KIND RECEIVES NEW PROPS WHEN
 * NAVIGATED TO AGAIN.
 *
 * Revealing a `single` instance used to drop the props the open named. A
 * content that returns `navigate(props)` from its mount is now handed them once
 * per open, and they are recorded on its tab, so a page restore or a reload
 * mounts it with the latest.
 *
 * Against a REAL `createShell` in jsdom; content factories count their mounts
 * and their `navigate` calls.
 *
 *   §1  navigate on an open instance (another desktop, then this one) reveals
 *       it and calls the hook once with the new props; no second mount, and
 *       the props write does not rebuild the tile
 *   §2  the props are on the tab: a top-nav page restore and a reload mount
 *       with the latest; an archived instance is restored, then handed them
 *   §3  a content without the hook is revealed unchanged, nothing throws; a
 *       hook that throws is a warning
 *   §4  the same props twice are two calls and one instance
 *   §5  an open that names no props (top-nav button) only reveals
 *   §6  a floated instance: its window tab records the props
 *
 * jsdom is borrowed from the sibling Tables checkout; without it this SKIPS,
 * and tests/run.mjs counts a SKIPPED suite as a failure.
 *
 *     node tests/single_instance_navigate_props.test.mjs
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
    console.log('single instance navigate props: SKIPPED — needs jsdom '
        + '(`cd ../Tables/web && npm install`, or `npm i -D jsdom` here)');
    process.exit(0);
}

const dom = new JSDOM('<!doctype html><body><nav id="nav"></nav><div id="root"></div></body>',
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
const { createHost } = await import('../src/host/host.js');
const { saveDesktops } = await import('../src/tiling/desktops.js');

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

const KINDS = {
    home:     { label: 'Home', icon: 'home', isTopNav: true, order: 0 },
    notebook: { label: 'Notebook', icon: 'book', isTopNav: true, order: 1, single: true },
    board:    { label: 'Board', icon: 'dashboard', isTopNav: true, order: 2 },
    plain:    { label: 'Plain', icon: 'article', topNav: 'home', single: true },
    brittle:  { label: 'Brittle', icon: 'warning', topNav: 'home', single: true },
};
const taxonomy = createTaxonomy({ root: 'home', kinds: KINDS });

/** Every mount (kind, the props it was mounted with, alive), and every
 *  `navigate` call (kind, props). */
const mounts = [];
const calls = [];
const factory = (kind, { hook = true, throws = false } = {}) => (hostEl, props, ctx) => {
    hostEl.textContent = kind;
    const m = { kind, props: { ...(props || {}) }, windowId: ctx?.windowId ?? null, alive: true };
    mounts.push(m);
    const out = { destroy() { m.alive = false; } };
    if (hook) {
        out.navigate = (next) => {
            calls.push({ kind, props: next });
            if (throws) throw new Error('boom');
        };
    }
    return out;
};
const content = {
    home: factory('home', { hook: false }),
    board: factory('board', { hook: false }),
    notebook: factory('notebook'),
    plain: factory('plain', { hook: false }),
    brittle: factory('brittle', { throws: true }),
};
const live = (kind) => mounts.filter((m) => m.alive && m.kind === kind);
const callsOf = (kind) => calls.filter((c) => c.kind === kind).map((c) => c.props);

const store = new Map();
const host = createHost({ state: {
    read: async (k) => (store.has(k) ? JSON.parse(store.get(k)) : null),
    write: async (k, v) => { store.set(k, JSON.stringify(v)); return true; },
} });

async function build() {
    const root = dom.window.document.getElementById('root');
    const nav = dom.window.document.getElementById('nav');
    return createShell({
        root, host, taxonomy, content,
        entities: createEntityCatalog({ sources: [] }),
        chrome: { topNav: nav },
        panels: { left: false, right: false, bottom: false },
        promoteInPlace: true,
    });
}

let shell = await build();
let wm = shell.wm;
await tick();

/** Every tab of `kind` across every desktop's tree and every window, with its props. */
function tabsOf(kind) {
    const out = [];
    for (const [d, desk] of wm.desktops.desktops.entries()) {
        for (const leaf of desk.tree.leaves()) {
            (leaf.tabs || []).forEach((t) => { if (t.kind === kind) out.push({ d, props: t.props }); });
        }
    }
    for (const [, rec] of wm._windowToLeaf) {
        const tabs = rec.tabs?.length ? rec.tabs : (rec.original ? [rec.original] : []);
        tabs.forEach((t) => { if (t.kind === kind) out.push({ win: true, props: t.props }); });
    }
    return out;
}

// ── §1 ──────────────────────────────────────────────────────────────────
console.log('\n§1 navigate hands an open instance the new props');
{
    wm.navigate('notebook', { file: 'a' });
    await tick();
    check('opened once, with its props, and no hook call for a fresh mount',
        [live('notebook').map((m) => m.props), callsOf('notebook')], [[{ file: 'a' }], []]);

    wm.switchDesktop(1);
    await tick();
    wm.navigate('notebook', { file: 'b' });
    await tick();
    check('revealed on desktop 1', wm.desktops.activeIdx, 0);
    check('the hook was called once, with the new props', callsOf('notebook'), [{ file: 'b' }]);
    check('one live instance, one notebook tab', [live('notebook').length, tabsOf('notebook').length], [1, 1]);

    const before = mounts.length;
    wm.navigate('notebook', { file: 'c' });
    await tick();
    check('on this desktop: one more call, nothing mounted',
        [callsOf('notebook').at(-1), mounts.length - before], [{ file: 'c' }, 0]);
    wm.renderer.render();
    wm.desktops.active().tree.focus(wm.desktops.active().tree.primaryLeafId());
    wm.renderer.render();
    await tick();
    check('the props write did not rebuild the tile on the next repaints',
        [mounts.length - before, live('notebook').length], [0, 1]);
}

// ── §2 ──────────────────────────────────────────────────────────────────
console.log('\n§2 the props are recorded on the tab');
{
    check('the tab holds the latest props', tabsOf('notebook').map((t) => t.props), [{ file: 'c' }]);

    // The tile switches to another top-nav page, archiving the notebook.
    wm.openInPrimary('board');
    await tick();
    check('the notebook page was left', live('notebook').length, 0);
    wm.openInPrimary('notebook');
    await tick();
    check('a page restore mounts it with the latest props',
        live('notebook').map((m) => m.props), [{ file: 'c' }]);

    // Archived, then navigated to with new props: restored, then handed them.
    wm.openInPrimary('board');
    await tick();
    const n = callsOf('notebook').length;
    wm.navigate('notebook', { file: 'd' });
    await tick();
    check('an archived instance is restored once and handed the new props',
        [live('notebook').length, callsOf('notebook').slice(n), tabsOf('notebook').map((t) => t.props)],
        [1, [{ file: 'd' }], [{ file: 'd' }]]);

    // Reload: what was saved is the latest.
    await new Promise((r) => setTimeout(r, 700));
    const blob = wm.desktops.serialize();
    shell.dispose();
    await tick();
    await saveDesktops(host.state, blob);
    mounts.length = 0;
    shell = await build();
    wm = shell.wm;
    await tick();
    check('a reload mounts it with the latest props', live('notebook').map((m) => m.props), [{ file: 'd' }]);
}

// ── §3 ──────────────────────────────────────────────────────────────────
console.log('\n§3 a content without the hook is revealed unchanged');
{
    wm.openInTabInPrimary('plain', { id: 'x' });
    await tick();
    wm.openInTabInPrimary('home');
    await tick();
    const before = mounts.length;
    const warns = [];
    const warn = console.warn;
    console.warn = (...a) => { warns.push(a.map(String).join(' ')); };
    let threw = null;
    try { wm.navigate('plain', { id: 'y' }); } catch (err) { threw = err; }
    await tick();
    console.warn = warn;
    const tree = wm.desktops.active().tree;
    const leaf = tree.get(tree.focusedLeafId);
    check('revealed: its tab is active again', leaf?.tabs?.[leaf.activeTabIdx]?.kind, 'plain');
    check('nothing threw, nothing warned', [threw, warns], [null, []]);
    check('its tab keeps its props; the reveal mounts it once, with them',
        [tabsOf('plain').map((t) => t.props), live('plain').length,
         mounts.slice(before).filter((m) => m.kind === 'plain').map((m) => m.props)],
        [[{ id: 'x' }], 1, [{ id: 'x' }]]);

    // A hook that throws is a warning, never a crash.
    wm.openInTabInPrimary('brittle', { v: 1 });
    await tick();
    console.warn = (...a) => { warns.push(a.map(String).join(' ')); };
    threw = null;
    try { wm.navigate('brittle', { v: 2 }); } catch (err) { threw = err; }
    console.warn = warn;
    check('a throwing hook: no throw, one warning, props still recorded',
        [threw, warns.length, /content navigate threw/.test(warns[0] || ''), tabsOf('brittle').map((t) => t.props)],
        [null, 1, true, [{ v: 2 }]]);
}

// ── §4 ──────────────────────────────────────────────────────────────────
console.log('\n§4 the same props twice: two calls, one instance');
{
    const n = callsOf('notebook').length;
    const before = mounts.filter((m) => m.kind === 'notebook').length;
    wm.navigate('notebook', { file: 'e' });
    await tick();
    wm.navigate('notebook', { file: 'e' });
    await tick();
    const mounted = mounts.filter((m) => m.kind === 'notebook').length - before;
    check('the hook was called twice with the same props', callsOf('notebook').slice(n), [{ file: 'e' }, { file: 'e' }]);
    check('one notebook tab and one live instance', [tabsOf('notebook').length, live('notebook').length], [1, 1]);
    check('mounted once, by the first reveal (its tab was behind another)', mounted, 1);
}

// ── §5 ──────────────────────────────────────────────────────────────────
console.log('\n§5 an open that names no props only reveals');
{
    wm.openInPrimary('board');
    await tick();
    const n = callsOf('notebook').length;
    dom.window.document.querySelector('#nav [data-kind="notebook"]').click();
    await tick();
    check('the top-nav button revealed it with its props, and called nothing',
        [live('notebook').map((m) => m.props), callsOf('notebook').length - n, tabsOf('notebook').map((t) => t.props)],
        [[{ file: 'e' }], 0, [{ file: 'e' }]]);
    wm.navigate('notebook');
    await tick();
    check('navigate(kind) with no props likewise', [callsOf('notebook').length - n, tabsOf('notebook').map((t) => t.props)],
        [0, [{ file: 'e' }]]);
}

// ── §6 ──────────────────────────────────────────────────────────────────
console.log('\n§6 a floated instance records the props on its window tab');
{
    const tree = wm.desktops.active().tree;
    const leafId = tree.leaves().find((l) => (l.tabs || []).some((t) => t.kind === 'notebook'))?.id;
    const winId = wm.floatPane(leafId);
    await tick();
    ok('the notebook floated into a window', !!winId && wm._windowToLeaf.has(winId));
    const n = callsOf('notebook').length;
    wm.switchDesktop(1);
    await tick();
    const before = mounts.filter((m) => m.kind === 'notebook').length;
    wm.navigate('notebook', { file: 'f' });
    await tick();
    check('the window\'s content was handed the props, nothing mounted',
        [callsOf('notebook').slice(n), mounts.filter((m) => m.kind === 'notebook').length - before], [[{ file: 'f' }], 0]);
    check('the window tab records them', tabsOf('notebook').map((t) => [!!t.win, t.props]), [[true, { file: 'f' }]]);
    ok('bringBackWindow docks it', wm.bringBackWindow(winId));
    await tick();
    check('docked, it mounts with the latest props', live('notebook').map((m) => m.props), [{ file: 'f' }]);
}

shell.dispose();
console.log(failures ? `\n${failures} assertion(s) FAILED` : '\nall assertions passed');
process.exit(failures ? 1 : 0);
