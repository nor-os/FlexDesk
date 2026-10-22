/**
 * STORY-0099 — `wm.navigate` TO A KIND THAT IS NOT REGISTERED WARNS ONCE AND
 * CHANGES NOTHING.
 *
 * A link to a kind the shell's content registry has no factory for used to
 * land a "no factory registered yet" placeholder tile in the destination. It is
 * now refused: exactly one `console.warn` naming the kind, every tile, tab,
 * window, desktop and per-tab history as it was, `false` back to the caller,
 * and no exception. A navigation to a registered kind returns `true`.
 *
 * Against a REAL `createShell` in jsdom.
 *
 *   §1  every destination (main, origin, new tab, window, split, legacy
 *       `target`) refuses an unknown kind: one warn, nothing changed, false
 *   §2  odd kinds (undefined, null, '') are refused the same way, no throw
 *   §3  a registered kind returns true on each destination, with no warning
 *
 * jsdom is borrowed from the sibling Tables checkout; without it this SKIPS,
 * and tests/run.mjs counts a SKIPPED suite as a failure.
 *
 *     node tests/navigate_unknown_kind.test.mjs
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
    console.log('navigate unknown kind: SKIPPED — needs jsdom '
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
    home:  { label: 'Home', icon: 'home', isTopNav: true, order: 0 },
    sheet: { label: 'Sheet', icon: 'table', topNav: 'home' },
    board: { label: 'Board', icon: 'dashboard', isTopNav: true, order: 1 },
};
const taxonomy = createTaxonomy({ root: 'home', kinds: KINDS });

let mounted = 0;
const factory = (kind) => (hostEl, props) => {
    mounted++;
    hostEl.textContent = `${kind} ${props?.id ?? ''}`;
    return {};
};
const content = Object.fromEntries(Object.keys(KINDS).map((k) => [k, factory(k)]));

const store = new Map();
const host = createHost({ state: {
    read: async (k) => (store.has(k) ? JSON.parse(store.get(k)) : null),
    write: async (k, v) => { store.set(k, JSON.stringify(v)); return true; },
} });

const shell = await createShell({
    root: dom.window.document.getElementById('root'),
    host, taxonomy, content,
    entities: createEntityCatalog({ sources: [] }),
    chrome: { topNav: dom.window.document.getElementById('nav') },
    panels: { left: false, right: false, bottom: false },
});
const wm = shell.wm;
await tick();
// Every change the WM announces goes through `_notifyChange`.
let changes = 0;
{
    const orig = wm._notifyChange.bind(wm);
    wm._notifyChange = (...a) => { changes++; return orig(...a); };
}

// Some state to leave alone: two tabs, the second with a history entry.
wm.navigate('sheet', { id: 1 });
wm.navigate('sheet', { id: 2 }, { dest: 'main', newTab: true });
await tick();
const primary = wm.desktops.active().tree.primaryLeafId();
wm.navigate('board', {}, { dest: 'origin', ctx: { leafId: primary } });
await tick();

/** Everything a navigation could change: every desktop's tree (tiles, tabs,
 *  page archives), which desktop is active, focus, each leaf's active-tab
 *  history, the managed windows, the live mounts, the change notifications
 *  and the tile DOM. */
function snapshot() {
    const desks = wm.desktops.desktops.map((d) => ({
        tree: d.tree.serialize(),
        focused: d.tree.focusedLeafId,
        history: d.tree.leaves().map((l) => [l.id, d.tree.activeTabHistory?.(l.id) || []]),
    }));
    return JSON.stringify({
        activeIdx: wm.desktops.activeIdx,
        desks,
        windows: [...wm._windowToLeaf.keys()],
        mounted,
        changes,
        dom: dom.window.document.getElementById('root').innerHTML,
    });
}

/** Run `fn` with console.warn captured; returns { result, warns, threw }. */
function capture(fn) {
    const warns = [];
    const orig = console.warn;
    console.warn = (...a) => { warns.push(a.map(String).join(' ')); };
    let result; let threw = null;
    try { result = fn(); } catch (err) { threw = err; } finally { console.warn = orig; }
    return { result, warns, threw };
}

ok('setup: the change notifications are being counted', changes > 0);
ok('setup: the second tab has a history entry to protect',
    (wm.desktops.active().tree.activeTabHistory?.(primary) || []).length > 0);

// ── §1 ──────────────────────────────────────────────────────────────────
console.log('\n§1 an unknown kind is refused on every destination');
const DESTS = [
    ['default (main)', {}],
    ['main, new tab', { dest: 'main', newTab: true }],
    ['origin', { dest: 'origin', ctx: { leafId: primary } }],
    ['origin, new tab', { dest: 'origin', newTab: true, ctx: { leafId: primary } }],
    ['window', { dest: 'window' }],
    ['split-h', { dest: 'split-h', ctx: { leafId: primary } }],
    ['legacy target: tab', { target: 'tab', ctx: { leafId: primary } }],
    ['legacy target: window', { target: 'window' }],
];
for (const [name, opts] of DESTS) {
    const before = snapshot();
    const { result, warns, threw } = capture(() => wm.navigate('no-such-kind', { id: 9 }, opts));
    await tick();
    ok(`${name}: no exception`, threw === null, String(threw));
    check(`${name}: returns false`, result, false);
    check(`${name}: exactly one warning`, warns.length, 1);
    ok(`${name}: the warning names the kind`, /no-such-kind/.test(warns[0] || ''), warns[0]);
    ok(`${name}: every tile, tab, window and the history unchanged`, snapshot() === before);
}

// ── §2 ──────────────────────────────────────────────────────────────────
console.log('\n§2 odd kinds are refused the same way');
for (const kind of [undefined, null, '']) {
    const before = snapshot();
    const { result, warns, threw } = capture(() => wm.navigate(kind));
    await tick();
    check(`${JSON.stringify(kind) ?? 'undefined'}: no throw, false, one warning, nothing changed`,
        [threw === null, result, warns.length, snapshot() === before], [true, false, 1, true]);
}

// ── §3 ──────────────────────────────────────────────────────────────────
console.log('\n§3 a registered kind returns true');
for (const [name, opts] of DESTS) {
    const { result, warns, threw } = capture(() => wm.navigate('sheet', { id: name }, opts));
    await tick();
    check(`${name}: true, no warning, no throw`, [result, warns.length, threw === null], [true, 0, true]);
}
check('navigateUp outside any scope passes the result through',
    capture(() => wm.navigateUp('no-such-kind', {})).result, false);

console.log(failures ? `\n${failures} FAILED` : '\nall ok');
process.exit(failures ? 1 : 0);
