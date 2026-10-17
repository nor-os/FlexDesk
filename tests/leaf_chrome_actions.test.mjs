/**
 * ══ C42. A CONTENT CAN REPLACE ITS OWN CHROME ACTIONS ════════════════════
 *
 * A factory's returned `chromeActions` were read once, after the mount, and
 * drawn icon-only: a toggle could not show it was on, an action that did not
 * apply yet could not say so, and changing the offer meant re-mounting.
 *
 * `ctx.setChromeActions(specs)` is the per-leaf answer, built like
 * `ctx.setTitle` (C41) and driven here against the REAL `WindowManager`:
 *
 *   §1  specs of only {icon, title, onClick} render exactly as before
 *   §2  set after the mount, it repaints the buttons without a re-mount
 *   §3  pressed: aria-pressed and a pressed style
 *   §4  disabled: inert, tooltip kept
 *   §5  label and separator
 *   §6  it survives repaints, and null / [] clear it
 *   §7  set DURING the mount, it wins over the returned list
 *   §8  a ctx whose leaf was rebuilt changes nothing
 *
 *     node tests/leaf_chrome_actions.test.mjs
 *
 * jsdom is borrowed from the sibling Tables checkout, as in every DOM suite
 * here; absent, this SKIPS loudly (and `tests/run.mjs` fails on the skip).
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { ruleBody } from './css_rules.mjs';

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
    console.log('leaf chrome actions: SKIPPED — needs jsdom '
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

const clicks = [];
const settings = { icon: 'settings', title: 'Settings', onClick: () => clicks.push('settings') };

// The bottom panel: what it does at mount is set per test through `mode`.
let mode = 'returned';
let panelCtx = null;
let mounts = 0;
let marker = null;
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
            marker = dom.window.document.createElement('div');
            marker.textContent = 'panel';
            host.appendChild(marker);
            if (mode === 'during') {
                ctx.setChromeActions([{ icon: 'bolt', title: 'Set during mount', onClick() {} }]);
            }
            return { chromeActions: [settings] };
        },
    }),
    panelDefaults: { left: false, right: false, bottom: true },
});
await wm.load();

const panelLeafEl = () => {
    const leaf = [...wm.desktops.active().tree.nodes.values()]
        .find((n) => n.kind === 'leaf' && n.content?.kind === 'panel:bottom');
    return root.querySelector(`.twm-leaf[data-leaf-id="${leaf?.id}"]`);
};
const strip = () => panelLeafEl()?.querySelector('.twm-leaf__actions--content');
const buttons = () => [...(strip()?.querySelectorAll('button') || [])];
const click = (el) => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));

console.log('§1 {icon, title, onClick} only — exactly as before');
ok('the per-leaf ctx carries setChromeActions', typeof panelCtx?.setChromeActions === 'function');
// The markup the pre-C42 `_paintContentActions` produced for this spec,
// attribute for attribute.
check('the returned list renders the same markup as before', strip()?.innerHTML,
    '<button type="button" class="twm-leaf__btn" title="Settings" aria-label="Settings">'
    + '<span class="material-symbols-outlined">settings</span></button>');
check('the strip is shown', strip()?.hidden, false);
click(buttons()[0]);
check('clicking it calls onClick', clicks.join(), 'settings');
panelCtx.setChromeActions([settings]);
check('the same spec through setChromeActions renders the same markup', strip()?.innerHTML,
    '<button type="button" class="twm-leaf__btn" title="Settings" aria-label="Settings">'
    + '<span class="material-symbols-outlined">settings</span></button>');

console.log('§2 set after the mount');
const bodyBefore = panelLeafEl().querySelector('.twm-leaf__body');
panelCtx.setChromeActions([
    { icon: 'width_wide', title: 'Page width', onClick: () => clicks.push('width') },
    settings,
]);
check('it repaints the buttons at once', buttons().map((b) => b.title).join(), 'Page width,Settings');
click(buttons()[0]);
check('the new button works', clicks.at(-1), 'width');
check('the content was not re-mounted', mounts, 1);
ok('the body and what the content put in it are the same nodes',
    panelLeafEl().querySelector('.twm-leaf__body') === bodyBefore && bodyBefore.contains(marker));

console.log('§3 pressed');
panelCtx.setChromeActions([
    { icon: 'width_wide', title: 'Page width', pressed: true, onClick() {} },
    { icon: 'grid_on', title: 'Grid', pressed: false, onClick() {} },
    settings,
]);
let [on, off, plain] = buttons();
check('pressed:true renders aria-pressed="true"', on.getAttribute('aria-pressed'), 'true');
ok('…and the pressed class', on.classList.contains('twm-leaf__btn--pressed'));
check('pressed:false renders aria-pressed="false"', off.getAttribute('aria-pressed'), 'false');
ok('…without the pressed class', !off.classList.contains('twm-leaf__btn--pressed'));
ok('no pressed key: not a toggle, no aria-pressed', !plain.hasAttribute('aria-pressed'));
for (const sheet of ['flexdesk.css', 'base.css']) {
    const css = readFileSync(resolvePath(HERE, '../css', sheet), 'utf8');
    const body = ruleBody(css, '.twm-leaf__btn--pressed');
    ok(`${sheet} styles .twm-leaf__btn--pressed with a background`, /background\s*:/.test(body || ''),
        `rule: ${body}`);
}

console.log('§4 disabled');
let hits = 0;
panelCtx.setChromeActions([
    { icon: 'publish', title: 'Nothing to publish yet', disabled: true, onClick: () => { hits += 1; } },
]);
const [dis] = buttons();
click(dis);
dis.click();
check('clicking it does not call onClick', hits, 0);
check('it keeps its tooltip', dis.title, 'Nothing to publish yet');
check('aria-disabled="true"', dis.getAttribute('aria-disabled'), 'true');
ok('…and the disabled class', dis.classList.contains('twm-leaf__btn--disabled'));
ok('not the disabled attribute, which would take the pointer events a tooltip needs', !dis.disabled);
for (const sheet of ['flexdesk.css', 'base.css']) {
    const css = readFileSync(resolvePath(HERE, '../css', sheet), 'utf8');
    ok(`${sheet} greys .twm-leaf__btn--disabled`,
        /opacity/.test(ruleBody(css, '.twm-leaf__btn--disabled, .twm-leaf__btn:disabled') || ''));
    ok(`${sheet} gives it no hover highlight`,
        ruleBody(css, '.twm-leaf__btn:hover:not(:disabled):not(.twm-leaf__btn--disabled)') !== null);
}

console.log('§5 label and separator');
panelCtx.setChromeActions([
    { icon: 'add', label: 'New <b>page</b>', title: 'Add a page', onClick() {} },
    { separator: true },
    { label: 'Text only', onClick() {} },
]);
const kids = [...strip().children];
check('three children', kids.length, 3);
check('the label is text, never markup', kids[0].querySelector('.twm-leaf__btn-label')?.textContent, 'New <b>page</b>');
ok('…and nothing was parsed from it', !kids[0].querySelector('b'));
ok('the glyph is still there', kids[0].querySelector('.material-symbols-outlined')?.textContent === 'add');
ok('a labelled button is marked so it can grow', kids[0].classList.contains('twm-leaf__btn--labelled'));
ok('{separator:true} is a divider', kids[1].matches('span.twm-leaf__sep[role="separator"]'));
check('a label-only spec renders, with the label as its accessible name',
    kids[2].getAttribute('aria-label'), 'Text only');
ok('…and no glyph', !kids[2].querySelector('.material-symbols-outlined'));

console.log('§6 it survives repaints; null and [] clear');
panelCtx.setChromeActions([{ icon: 'width_wide', title: 'Page width', pressed: true, onClick() {} }]);
wm.renderer.render();
check('a plain repaint keeps it', buttons().map((b) => b.title).join(), 'Page width');
wm.togglePanel('left');
wm.togglePanel('left');
check('a canonicalising panel toggle round trip keeps it', buttons()[0]?.getAttribute('aria-pressed'), 'true');
check('still one mount', mounts, 1);
panelCtx.setChromeActions(null);
check('null clears the strip', buttons().length, 0);
check('…and hides it', strip()?.hidden, true);
panelCtx.setChromeActions([settings]);
panelCtx.setChromeActions([]);
check('[] clears it too', buttons().length, 0);
wm.renderer.render();
check('and a repaint agrees', buttons().length, 0);

console.log('§7 set during the mount');
mode = 'during';
const stale = panelCtx;
// The strip the stale ctx belonged to. Detached once the leaf is rebuilt, so a
// write into it would not show in the live chrome — which is exactly why it is
// checked: without the guard the dead content would still be painting.
const staleStrip = strip();
const staleStripBefore = staleStrip.innerHTML;
wm.togglePanel('bottom');
wm.togglePanel('bottom');
ok('closing and reopening the panel mounted it afresh', mounts === 2 && panelCtx !== stale, `mounts ${mounts}`);
check('the list set during the mount wins over the returned one',
    buttons().map((b) => b.title).join(), 'Set during mount');

console.log('§8 a stale ctx');
const before = strip().innerHTML;
stale.setChromeActions([{ icon: 'skull', title: 'From a dead content', onClick() {} }]);
check('the old ctx changes nothing', strip().innerHTML, before);
ok('the rebuilt leaf has a new strip', staleStrip !== strip() && !staleStrip.isConnected);
check('and the old ctx does not paint into its own dead strip either',
    staleStrip.innerHTML, staleStripBefore);
stale.setChromeActions(null);
check('not even a clear', strip().innerHTML, before);

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
