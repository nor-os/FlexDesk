/**
 * ══ PANELS OFFERED OR WITHHELD PER CONTENT KIND ═══════════════════════════
 *
 * A kind says which panels it offers while it is primary (`KindDef.panels`:
 * `true | false | { reason }` per side), content can say so at runtime
 * (`wm.setPanelAvailability`), and a withheld panel is not inserted, cannot be
 * toggled, and its toggles say why. Driven against the REAL `createShell`, its
 * WindowManager, its toggles and its palette:
 *
 *   §1  with no declarations every panel is available, as before
 *   §2  a primary kind withholding `bottom`: the panel goes, the toggle is
 *       disabled with the reason as its tooltip, the open state is remembered
 *   §3  togglePanel('bottom') answers false and changes no persisted state;
 *       the toggle's click and a keyboard shortcut bound to it do nothing
 *   §4  the palette's chip is disabled with the reason and does nothing
 *   §5  switching back brings the panel back, open, and the tooltip back
 *   §6  a kind inherits its top-nav kind's offer unless it declares its own
 *   §7  one notification per change, on the WM and on the bus
 *   §8  wm.setPanelAvailability overrides the kind and is cleared with null
 *   §9  bad declarations are boot errors
 *
 *     node tests/panel_availability.test.mjs
 *
 * jsdom is borrowed from the sibling Tables checkout. Absent, this SKIPS loudly.
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
    console.log('panel availability: SKIPPED — needs jsdom '
        + '(`cd ../Tables/web && npm install`, or `npm i -D jsdom` here)');
    process.exit(0);
}

const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>',
                      { url: 'http://localhost/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'Event',
                   'CustomEvent', 'MouseEvent', 'PointerEvent', 'KeyboardEvent',
                   'getComputedStyle', 'navigator', 'requestAnimationFrame',
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

let failures = 0;
function ok(what, cond, why = '') {
    if (cond) { console.log(`  ok   ${what}`); return; }
    failures += 1;
    console.log(`  FAIL ${what}${why ? `\n       ${why}` : ''}`);
}
function check(what, actual, expected) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    ok(what, a === e, `expected ${e}, got ${a}`);
}
function throws(what, fn, pattern) {
    try { fn(); } catch (err) {
        ok(what, pattern.test(String(err?.message)), `threw "${err?.message}"`);
        return;
    }
    ok(what, false, 'did not throw');
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const click = (el) => el.dispatchEvent(
    new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));

const { createTaxonomy } = await import('../src/tiling/kind_taxonomy.js');
const { createShell } = await import('../src/tiling/shell.js');
const { createEntityCatalog } = await import('../src/tiling/entity_sources.js');
const { createHost } = await import('../src/host/host.js');

// ── The embedder: a "work" page with a console, a "paper" page without ──
const REASON = 'No console here';
const taxonomy = createTaxonomy({
    root: 'home',
    kinds: {
        home:  { label: 'Home' },
        work:  { label: 'Work', isTopNav: true },
        paper: { label: 'Paper', isTopNav: true, panels: { bottom: { reason: REASON } } },
        sheet: { label: 'Sheet', topNav: 'paper' },
        slide: { label: 'Slide', topNav: 'paper', panels: { bottom: true } },
    },
});

let bottomMounts = 0;
const pane = (text) => (host) => { host.textContent = text; return {}; };
const content = {
    home: pane('home'), work: pane('work'), paper: pane('paper'),
    sheet: pane('sheet'), slide: pane('slide'),
    'panel:left': pane('nav'), 'panel:right': pane('inspector'),
    'panel:bottom': (host) => { bottomMounts += 1; host.textContent = 'console'; return {}; },
};

const store = new Map();
let writes = 0;
const host = createHost({
    state: {
        read: async (k) => store.get(k) ?? null,
        write: async (k, v) => { writes += 1; store.set(k, v); return true; },
    },
});

const handlers = new Map();
const eventBus = {
    on(ev, fn) {
        if (!handlers.has(ev)) handlers.set(ev, new Set());
        handlers.get(ev).add(fn);
        return { dispose: () => handlers.get(ev).delete(fn) };
    },
    emit(ev, payload) { for (const fn of [...(handlers.get(ev) || [])]) fn(payload); },
};

const doc = dom.window.document;
const button = (cls, attrs) => {
    const b = doc.createElement('button');
    b.className = cls;
    for (const [k, v] of Object.entries(attrs)) b.setAttribute(k, v);
    return b;
};
const bar = doc.createElement('div');
bar.append(
    button('twm-panel-toggle-btn', { title: 'Navigator' }),
    button('twm-panel-toggle-btn', { title: 'Inspector' }),
    button('twm-panel-toggle-btn twm-has-tooltip', { 'data-tooltip': 'Toggle console' }),
);
const sroot = doc.createElement('div');
doc.getElementById('root').append(bar, sroot);
const [leftBtn, rightBtn, bottomBtn] = bar.children;

const shell = await createShell({
    root: sroot,
    taxonomy,
    entities: createEntityCatalog({ sources: [] }),
    content,
    host,
    eventBus,
    panels: { left: true, right: false, bottom: true },
    chrome: { panelToggles: { left: leftBtn, right: rightBtn, bottom: bottomBtn } },
});
const { wm } = shell;
const toggle = shell.chrome.panelToggles;
const desk = () => wm.desktops.active();
const bottomLeaf = () => desk().tree.leaves().find((l) => l.content?.kind === 'panel:bottom');
const bottomDom = () => sroot.querySelector(`.twm-leaf[data-leaf-id="${bottomLeaf()?.id}"]`);

const heard = [];
wm.onPanelAvailabilityChange((p) => heard.push(p));
const onBus = [];
eventBus.on('wm:panels:availability', (p) => onBus.push(p));

// ── §1 ──────────────────────────────────────────────────────────────────
console.log('§1 no declarations: every panel available, as today');
wm.openInPrimary('work');
for (const side of ['left', 'right', 'bottom']) {
    check(`${side} is available`, wm.isPanelAvailable(side), true);
    check(`${side} availability reads offered`, wm.getPanelAvailability(side),
          { available: true, reason: null });
}
ok('the bottom panel is in the tree and on screen', !!bottomLeaf() && !!bottomDom());
check('isPanelOpen(bottom)', wm.isPanelOpen('bottom'), true);
ok('no toggle is disabled', [toggle.left, toggle.right, toggle.bottom]
    .every((b) => !b.hasAttribute('aria-disabled') && !b.disabled));
check('togglePanel(right) answers true', wm.togglePanel('right'), true);
check('and opened it', wm.isPanelOpen('right'), true);
check('togglePanel(right) again answers true', wm.togglePanel('right'), true);
check('and closed it', wm.isPanelOpen('right'), false);
check('nothing was announced', heard.length + onBus.length, 0);

// ── §2 ──────────────────────────────────────────────────────────────────
console.log('§2 the primary kind withholds the bottom panel');
const mountsBefore = bottomMounts;
wm.openInPrimary('paper');
check('bottom is unavailable', wm.isPanelAvailable('bottom'), false);
check('with the declared reason', wm.getPanelAvailability('bottom'),
      { available: false, reason: REASON });
ok('the bottom panel left the tree', !bottomLeaf());
ok('and the screen', !sroot.textContent.includes('console'));
check('isPanelOpen(bottom) is false', wm.isPanelOpen('bottom'), false);
check('the remembered open state is kept', desk().panels.bottom, true);
check('the bottom toggle is disabled', toggle.bottom.getAttribute('aria-disabled'), 'true');
check('its tooltip is the reason', toggle.bottom.getAttribute('data-tooltip'), REASON);
ok('and it is not shown as on', !toggle.bottom.classList.contains('twm-panel-toggle-btn--on'));
ok('the left toggle is not disabled', !toggle.left.hasAttribute('aria-disabled'));
check('left is still open', wm.isPanelOpen('left'), true);

// ── §3 ──────────────────────────────────────────────────────────────────
console.log('§3 toggling a withheld panel does nothing');
await wait(700);                       // let the navigation's own persist land
const writesBefore = writes;
const savedBefore = JSON.stringify(wm.desktops.serialize());
check('togglePanel(bottom) answers false', wm.togglePanel('bottom'), false);
click(toggle.bottom);
// A bottom-panel shortcut, bound the way an embedder binds one.
const shortcut = (e) => { if (e.altKey && e.key === 'j') wm.togglePanel('bottom'); };
doc.addEventListener('keydown', shortcut);
doc.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'j', altKey: true, bubbles: true }));
doc.removeEventListener('keydown', shortcut);
await wait(700);
check('the remembered state is unchanged', desk().panels.bottom, true);
check('the serialized desktops are unchanged', JSON.stringify(wm.desktops.serialize()), savedBefore);
check('nothing was written to the host', writes, writesBefore);
ok('no bottom panel appeared', !bottomLeaf());
check('the toggle is still disabled with the reason',
      [toggle.bottom.getAttribute('aria-disabled'), toggle.bottom.getAttribute('data-tooltip')],
      ['true', REASON]);

// ── §4 ──────────────────────────────────────────────────────────────────
console.log('§4 the palette chip');
await shell.palette.open();
const chip = doc.querySelector('#twm-cmdpal [data-toggle="bottom"]');
ok('the palette draws a bottom chip', !!chip);
check('it is disabled', chip?.getAttribute('aria-disabled'), 'true');
check('with the reason', chip?.getAttribute('title'), REASON);
click(chip);
ok('clicking it opens nothing', !bottomLeaf());
check('nor changes the remembered state', desk().panels.bottom, true);
check('and it stays disabled', chip?.getAttribute('aria-disabled'), 'true');
const leftChip = doc.querySelector('#twm-cmdpal [data-toggle="left"]');
ok('the left chip is not disabled', leftChip && !leftChip.hasAttribute('aria-disabled'));
shell.palette.close();

// ── §5 ──────────────────────────────────────────────────────────────────
console.log('§5 switching back');
wm.openInPrimary('work');
ok('the bottom panel is back in the tree and on screen', !!bottomLeaf() && !!bottomDom());
ok('mounted afresh', bottomMounts === mountsBefore + 1, `mounts ${bottomMounts}`);
check('isPanelOpen(bottom)', wm.isPanelOpen('bottom'), true);
ok('the toggle is enabled again', !toggle.bottom.hasAttribute('aria-disabled'));
check('and its own tooltip is back', toggle.bottom.getAttribute('data-tooltip'), 'Toggle console');
ok('and it shows on', toggle.bottom.classList.contains('twm-panel-toggle-btn--on'));
// A panel the user CLOSED stays closed through a withheld stretch.
wm.togglePanel('bottom');
wm.openInPrimary('paper');
wm.openInPrimary('work');
check('a closed panel stays closed when offered again', wm.isPanelOpen('bottom'), false);
wm.togglePanel('bottom');
// A button without the framework tooltip says it in `title`, and gets its own back.
wm.setPanelAvailability('left', { reason: 'Not here' });
check('a plain toggle shows the reason as its title', toggle.left.getAttribute('title'), 'Not here');
wm.setPanelAvailability('left', null);
check('and gets its own title back', toggle.left.getAttribute('title'), 'Navigator');

// ── §6 ──────────────────────────────────────────────────────────────────
console.log('§6 a kind inherits its page\'s offer');
wm.openInPrimary('sheet', { id: 's1' });
check('an entity under paper withholds bottom too', wm.getPanelAvailability('bottom'),
      { available: false, reason: REASON });
wm.openInPrimary('slide', { id: 'd1' });
check('unless it declares its own', wm.isPanelAvailable('bottom'), true);
ok('so the panel shows', !!bottomLeaf());
wm.openInPrimary('work');

// ── §7 ──────────────────────────────────────────────────────────────────
console.log('§7 one notification per change');
heard.length = 0; onBus.length = 0;
// `paper` would bring back the page's archived tab — the `slide` §6 left
// active, which offers the panel — so open a sheet of it by id.
wm.openInPrimary('sheet', { id: 's2' });
check('one call on the WM', heard.length, 1);
check('one event on the bus', onBus.length, 1);
check('naming the side that changed', heard[0]?.changed, ['bottom']);
check('carrying every side', Object.keys(heard[0]?.panels || {}), ['left', 'right', 'bottom']);
check('with the reason', heard[0]?.panels.bottom, { available: false, reason: REASON });
ok('the same payload on the bus', onBus[0] === heard[0]);
wm.openInPrimary('sheet', { id: 's3' });
wm.renderer.render();
wm._notifyChange();
check('no call while availability holds', heard.length, 1);
wm.openInPrimary('work');
check('one call when it changes back', heard.length, 2);
check('saying bottom is offered', heard[1]?.panels.bottom, { available: true, reason: null });
const off = wm.onPanelAvailabilityChange(() => heard.push('late'));
off();
wm.openInPrimary('sheet', { id: 's2' });
ok('an unsubscribed listener hears nothing', !heard.includes('late'));
wm.openInPrimary('work');

// ── §8 ──────────────────────────────────────────────────────────────────
console.log('§8 runtime override');
heard.length = 0;
wm.setPanelAvailability('bottom', { reason: 'Busy' });
check('content can withhold a panel the kind offers', wm.getPanelAvailability('bottom'),
      { available: false, reason: 'Busy' });
ok('which leaves the tree', !bottomLeaf());
check('announced once', heard.length, 1);
check('the tooltip follows', toggle.bottom.getAttribute('data-tooltip'), 'Busy');
wm.setPanelAvailability('bottom', null);
check('null clears it', wm.isPanelAvailable('bottom'), true);
ok('and the panel is back', !!bottomLeaf());
wm.openInPrimary('sheet', { id: 's2' });
check('(a sheet withholds it)', wm.isPanelAvailable('bottom'), false);
wm.setPanelAvailability('bottom', true);
check('content can offer a panel the kind withholds', wm.isPanelAvailable('bottom'), true);
ok('which shows it', !!bottomLeaf());
wm.setPanelAvailability('bottom', false);
check('false withholds with no reason', wm.getPanelAvailability('bottom'),
      { available: false, reason: null });
check('and the toggle keeps its own tooltip', toggle.bottom.getAttribute('data-tooltip'), 'Toggle console');
wm.setPanelAvailability('bottom', null);
wm.openInPrimary('work');

// ── §9 ──────────────────────────────────────────────────────────────────
console.log('§9 bad declarations are boot errors');
throws('an unknown side', () => createTaxonomy({ root: 'a',
    kinds: { a: { label: 'A', panels: { top: false } } } }), /unknown side 'top'/);
throws('an offer that is not true, false or { reason }', () => createTaxonomy({ root: 'a',
    kinds: { a: { label: 'A', panels: { bottom: 'no' } } } }), /true, false or \{ reason \}/);
throws('a reason that is not a string', () => createTaxonomy({ root: 'a',
    kinds: { a: { label: 'A', panels: { bottom: { reason: 3 } } } } }), /must be a string/);
throws('setPanelAvailability on an unknown side', () => wm.setPanelAvailability('top', false),
       /unknown panel side/);

shell.dispose();
console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
