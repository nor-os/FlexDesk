/**
 * BUG-0004 — TEARDOWNS TAKE THEIR BUS LISTENERS WITH THEM.
 *
 * `EventBus.off()` takes the handle `on()` returned (or its id), not
 * `(eventName, fn)`: a string removes nothing. Three teardowns called it the
 * second way, so every one of them left its listener behind:
 *
 *   §1  `createShell().dispose()` left `wm:changed -> syncChrome` on the bus,
 *       so a disposed shell went on syncing chrome against its dead wm, and a
 *       rebuilt shell on the same bus added a second listener
 *   §2  `createPageFactories({ refreshOn })`: a torn-down tab went on getting
 *       `refresh(reason)` for every refresh event
 *   §3  `NotificationHistory.unmount()` left one listener per badge event.
 *       Since 0.17.3 (BUG-0034) the bell puts no badge listener on the bus
 *       at all: it subscribes to the centre, and unmount lets that go
 *
 * Each section counts `listenerCount()` before subscribing, after, and after
 * teardown, and the count must come back to where it started.
 *
 * jsdom is borrowed from the sibling Tables checkout; without it this SKIPS,
 * and tests/run.mjs counts a SKIPPED suite as a failure.
 *
 *     node tests/bus_listener_teardown.test.mjs
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
    console.log('bus listener teardown: SKIPPED — needs jsdom '
        + '(`cd ../Tables/web && npm install`, or `npm i -D jsdom` here)');
    process.exit(0);
}

const dom = new JSDOM(`<!doctype html><body>
  <div id="root"></div><div id="topnav"></div>
  <div class="twm-global-bottom-bar"><div class="twm-bar-right"></div></div>
  <div id="slot"></div></body>`,
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

const { EventBus } = await import('../src/core/event_bus.js');
const { createShell } = await import('../src/tiling/shell.js');
const { createTaxonomy } = await import('../src/tiling/kind_taxonomy.js');
const { createEntityCatalog } = await import('../src/tiling/entity_sources.js');
const { createPageFactories } = await import('../src/tiling/page_factory.js');
const { NotificationHistory } = await import('../src/ui/components/notification_history.js');

let failures = 0;
function check(name, actual, expected) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) { failures++; console.error(`  FAIL ${name}\n    got      ${a}\n    expected ${e}`); }
    else console.log(`  ok   ${name}`);
}
const tick = () => new Promise((r) => setTimeout(r, 0));

// ── §1 ──────────────────────────────────────────────────────────────────
console.log('\n§1 createShell().dispose() removes its wm:changed listener');
{
    const bus = new EventBus();
    const root = dom.window.document.getElementById('root');
    const build = () => createShell({
        root,
        eventBus: bus,
        entities: createEntityCatalog({ sources: [] }),
        taxonomy: createTaxonomy({
            root: 'home',
            kinds: { home: { label: 'Home', isTopNav: true } },
        }),
        content: { home: (host) => { host.textContent = 'home'; return {}; } },
        panels: { left: false, right: false, bottom: false },
        // A top nav makes syncChrome read the wm (syncTopNav), so §1 can see
        // whether a disposed shell's syncChrome still runs.
        chrome: { topNav: dom.window.document.getElementById('topnav') },
    });

    const before = bus.listenerCount('wm:changed');
    const first = await build();
    const withOne = bus.listenerCount('wm:changed');
    check('building a shell subscribes wm:changed', withOne > before, true);

    // The disposed shell's syncChrome must not run any more: watch the wm it
    // would read from.
    let deadReads = 0;
    const deadWm = first.wm;
    const realActive = deadWm.desktops.active.bind(deadWm.desktops);
    first.dispose();
    check('dispose: wm:changed back to the pre-shell count',
          bus.listenerCount('wm:changed'), before);
    deadWm.desktops.active = (...a) => { deadReads++; return realActive(...a); };
    bus.emit('wm:changed');
    check('dispose: a wm:changed no longer reaches the dead shell', deadReads, 0);

    const second = await build();
    check('a second shell on the same bus: one shell\'s worth of listeners',
          bus.listenerCount('wm:changed'), withOne);
    second.dispose();
    check('the second dispose: back to the pre-shell count',
          bus.listenerCount('wm:changed'), before);
}

// ── §2 ──────────────────────────────────────────────────────────────────
console.log('\n§2 createPageFactories: a torn-down tab is not refreshed');
{
    const bus = new EventBus();
    const factories = createPageFactories({
        eventBus: bus,
        refreshOn: { 'run:tick': 'tick', 'run:done': 'done' },
    });
    const refreshed = [];
    const tabOf = (name) => () => ({
        mount() {},
        refresh(reason) { refreshed.push(`${name}:${reason}`); },
        dispose() {},
    });

    for (const [label, wrap, ctx] of [
        ['tabFactory', factories.tabFactory, { windowId: 'w1' }],
        ['bareTabFactory', factories.bareTabFactory, {}],
    ]) {
        refreshed.length = 0;
        const counts = () => [bus.listenerCount('run:tick'), bus.listenerCount('run:done')];
        const before = counts();
        const slot = dom.window.document.createElement('div');
        const mounted = wrap('page', tabOf(label))(slot, { id: 'e1' }, ctx);
        check(`${label}: mounting subscribes each refresh event`,
              counts(), before.map((n) => n + 1));
        bus.emit('run:tick');
        check(`${label}: a live tab is refreshed`, refreshed, [`${label}:tick`]);

        mounted.destroy();
        check(`${label}: teardown puts the counts back`, counts(), before);
        refreshed.length = 0;
        bus.emit('run:tick');
        bus.emit('run:done');
        check(`${label}: a torn-down tab gets no refresh()`, refreshed, []);
    }

    // mountTabBody is the shared piece, and its teardown is what both call.
    const before = bus.listenerCount('run:tick');
    const teardown = factories.mountTabBody(tabOf('body'), dom.window.document.createElement('div'),
                                            {}, {});
    check('mountTabBody: subscribes', bus.listenerCount('run:tick'), before + 1);
    teardown();
    check('mountTabBody teardown: back to the pre-mount count',
          bus.listenerCount('run:tick'), before);
}

// ── §3 ──────────────────────────────────────────────────────────────────
console.log('\n§3 NotificationHistory.unmount() removes its badge listeners');
{
    const bus = new EventBus();
    const events = ['toast:show', 'notification:show', 'log:entry',
                    'workspace:save:failed', 'workspace:import:failed'];
    const counts = () => events.map((e) => bus.listenerCount(e));
    const before = counts();
    const listeners = new Set();
    const center = {
        history: [],
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    };

    for (let i = 0; i < 3; i++) {
        const bell = new NotificationHistory({
            notificationCenter: center, eventBus: bus,
            logger: { warn() {}, info() {}, error() {}, debug() {} },
        });
        bell.mount();
        check(`bell ${i + 1}: mounted, no badge listener on the bus`, counts(), before);
        check(`bell ${i + 1}: mounted, one subscription to the centre`, listeners.size, 1);
        bell.unmount();
        check(`bell ${i + 1}: unmounted, back to the pre-mount counts`, counts(), before);
        check(`bell ${i + 1}: unmounted, the centre is let go`, listeners.size, 0);
    }
    await tick();
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall ok');
process.exit(failures ? 1 : 0);
