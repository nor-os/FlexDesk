/**
 * ══ THE NAV PANEL CAN BE DRIVEN FROM OUTSIDE ═════════════════════════════════
 *
 * STORY-0033. `mountNavPanel` switched modes only on a strip click and always
 * rendered one shared filter. An embedder that follows the page on screen has
 * to switch the panel itself, may want no strip at all, and has panes with
 * controls of their own that the shared filter only gets in the way of:
 *
 *   §1  `select(id)` mounts the mode on first use, runs its `activate()` and
 *       resolves only after `activate()` has run; `active()` names it.
 *   §2  `select()` of an unknown id is ignored and returns a resolved promise.
 *   §3  `showModeStrip: false` renders no strip; `select()` still switches.
 *   §4  A mode with `filter: false` hides the filter box while active, and the
 *       next mode with a filter shows its own saved text.
 *   §5  A caller passing none of the new options renders exactly as before
 *       (the markup is the pre-0033 implementation's, captured verbatim), and
 *       the strip click and the filter still work. `showFilter: false` and
 *       `initialMode` round it off.
 *
 *     node tests/nav_panel_select.test.mjs
 *
 * It imports `../src/tiling/nav_panel.js` DIRECTLY, never `dist/`. jsdom is
 * borrowed from the sibling Tables checkout; absent, this SKIPS loudly.
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
    console.log('nav panel select: SKIPPED — needs jsdom '
        + '(`cd ../Tables/web && npm install`, or `npm i -D jsdom` here)');
    process.exit(0);
}

const dom = new JSDOM('<!doctype html><body></body>',
                      { url: 'http://localhost/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'Event',
                   'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'getComputedStyle',
                   'navigator', 'requestAnimationFrame', 'cancelAnimationFrame']) {
    if (dom.window[key] !== undefined && globalThis[key] === undefined) {
        globalThis[key] = dom.window[key];
    }
}

const { mountNavPanel } = await import('../src/tiling/nav_panel.js');

// ── harness ─────────────────────────────────────────────────────────────
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
const section = (t) => console.log(`\n${t}`);
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

/** A mode that records what the panel did to it in `log`. */
function mode(id, log, { filter, label = id, icon = 'circle', slowActivate = 0 } = {}) {
    const def = {
        id, icon, label,
        mount(el) {
            log.push(`mount:${id}`);
            el.textContent = id.toUpperCase();
            return {
                async activate() {
                    log.push(`activate:${id}`);
                    if (slowActivate) await tick(slowActivate);
                    log.push(`activated:${id}`);
                },
                filter(q) { log.push(`filter:${id}:${q}`); },
            };
        },
    };
    if (filter !== undefined) def.filter = filter;
    return def;
}
const shown = (host) => [...host.querySelectorAll('.twm-nav__pane')]
    .filter((p) => p.style.display === 'flex')
    .map((p) => p.className.replace('twm-nav__pane twm-nav__pane--', ''));
const filterBox = (host) => host.querySelector('.twm-nav__filter');
const filterInput = (host) => host.querySelector('.twm-nav__filter-input');
const type = (host, text) => {
    filterInput(host).value = text;
    filterInput(host).dispatchEvent(new dom.window.Event('input', { bubbles: true }));
};

// ── §1 ──────────────────────────────────────────────────────────────────
section('§1 select() mounts on first use, activates, resolves after activate');
{
    const log = [];
    const host = document.createElement('div');
    const nav = mountNavPanel(host, { modes: [mode('a', log), mode('b', log, { slowActivate: 20 })] });
    await tick();
    check('only the first mode is mounted at start', log.filter((l) => l.startsWith('mount')), ['mount:a']);
    check('active() names the first mode', nav.active(), 'a');

    log.length = 0;
    const p = nav.select('b');
    ok('select() returns a promise', p instanceof Promise);
    check('select() mounts b synchronously on first use', log.slice(0, 2), ['mount:b', 'activate:b']);
    check('active() names b at once', nav.active(), 'b');
    ok('activate has not finished yet', !log.includes('activated:b'));
    await p;
    ok('the promise resolves only after activate ran', log.includes('activated:b'),
       JSON.stringify(log));
    check('b is the pane shown', shown(host), ['b']);
    check('the strip marks b', [...host.querySelectorAll('.twm-nav__mode--on')].map((b) => b.dataset.mode), ['b']);

    log.length = 0;
    await nav.select('a');
    await nav.select('b');
    check('a second visit activates without mounting again',
          log.filter((l) => l.startsWith('mount') || l.startsWith('activate:')),
          ['activate:a', 'activate:b']);
}

// ── §2 ──────────────────────────────────────────────────────────────────
section('§2 select() of an unknown id is ignored');
{
    const log = [];
    const host = document.createElement('div');
    const nav = mountNavPanel(host, { modes: [mode('a', log), mode('b', log)] });
    await tick();
    log.length = 0;
    const p = nav.select('nope');
    ok('it returns a promise', p instanceof Promise);
    let settled = false;
    p.then(() => { settled = true; });
    await tick();
    ok('which resolves', settled);
    check('to undefined', await p, undefined);
    check('nothing was mounted or activated', log, []);
    check('the active mode is unchanged', nav.active(), 'a');
    check('the pane shown is unchanged', shown(host), ['a']);
    check('no pane host was added for it', host.querySelectorAll('.twm-nav__pane').length, 2);
}

// ── §3 ──────────────────────────────────────────────────────────────────
section('§3 showModeStrip: false renders no strip; select() still switches');
{
    const log = [];
    const host = document.createElement('div');
    const nav = mountNavPanel(host, { modes: [mode('a', log), mode('b', log)], showModeStrip: false });
    await tick();
    check('no strip element', host.querySelector('.twm-nav__modes'), null);
    check('no mode buttons', host.querySelectorAll('[data-mode]').length, 0);
    ok('the filter is still there', !!filterInput(host));
    check('a is shown', shown(host), ['a']);
    await nav.select('b');
    check('select(b) shows b', shown(host), ['b']);
    check('active() is b', nav.active(), 'b');
    ok('b was mounted', log.includes('mount:b'));
    await nav.select('a');
    check('select(a) shows a again', shown(host), ['a']);
}

// ── §4 ──────────────────────────────────────────────────────────────────
section('§4 filter: false hides the box; the next filtering mode shows its own text');
{
    const log = [];
    const host = document.createElement('div');
    const nav = mountNavPanel(host, {
        modes: [mode('a', log), mode('b', log, { filter: false }), mode('c', log)],
    });
    await tick();
    type(host, 'foo');
    check('a\'s pane was filtered', log.at(-1), 'filter:a:foo');

    log.length = 0;
    await nav.select('b');
    check('the box is hidden while b is active', filterBox(host).style.display, 'none');
    ok('b\'s pane is never handed a filter', !log.some((l) => l.startsWith('filter:b')),
       JSON.stringify(log));
    ok('a\'s text does not show in the hidden box', filterInput(host).value === '');

    await nav.select('c');
    check('c shows the box again', filterBox(host).style.display, '');
    check('with c\'s own saved text (none yet)', filterInput(host).value, '');
    type(host, 'bar');
    check('c\'s pane was filtered', log.at(-1), 'filter:c:bar');

    await nav.select('b');
    check('b hides it again', filterBox(host).style.display, 'none');
    await nav.select('a');
    check('a shows the box', filterBox(host).style.display, '');
    check('with a\'s saved text', filterInput(host).value, 'foo');
    check('and re-applies it to a\'s pane', log.at(-1), 'filter:a:foo');
    await nav.select('c');
    check('c still has its own text', filterInput(host).value, 'bar');
}
{
    const log = [];
    const host = document.createElement('div');
    mountNavPanel(host, { modes: [mode('a', log, { filter: false }), mode('b', log)] });
    await tick();
    check('a filter: false first mode hides the box from mount', filterBox(host).style.display, 'none');
}

// ── §5 ──────────────────────────────────────────────────────────────────
section('§5 none of the new options: the panel renders exactly as before');
{
    // The pre-STORY-0033 implementation's outerHTML for these two modes,
    // captured verbatim after mount.
    const BEFORE = "<div class=\"twm-nav\">\n        <div class=\"twm-nav__modes\" data-role=\"modes\">\n        <button class=\"twm-nav__mode twm-has-tooltip twm-nav__mode--on\" data-mode=\"a\" data-tooltip=\"Files\">\n            <span class=\"material-symbols-outlined\">folder</span>\n            <span>Files</span>\n        </button>\n    \n        <button class=\"twm-nav__mode twm-has-tooltip\" data-mode=\"b\" data-tooltip=\"Outline <x>\">\n            <span class=\"material-symbols-outlined\">list</span>\n            <span>Outline &lt;x&gt;</span>\n        </button>\n    </div>\n        <div class=\"twm-sidebar-controls twm-nav__filter\">\n            <span class=\"material-symbols-outlined twm-sidebar-search-icon\">search</span>\n            <input class=\"twm-data-page__search twm-nav__filter-input\" type=\"search\" placeholder=\"Filter…\" autocomplete=\"off\">\n        </div>\n        <div class=\"twm-nav__body\" data-role=\"body\"><div class=\"twm-nav__pane twm-nav__pane--a\" style=\"display: flex;\">A</div><div class=\"twm-nav__pane twm-nav__pane--b\" style=\"display: none;\"></div></div>\n    </div>";
    const host = document.createElement('div');
    const nav = mountNavPanel(host, { modes: [
        { id: 'a', icon: 'folder', label: 'Files', mount: (el) => { el.textContent = 'A'; return {}; } },
        { id: 'b', icon: 'list', label: 'Outline <x>', mount: (el) => { el.textContent = 'B'; return {}; } },
    ] });
    await tick();
    check('the markup is byte-for-byte the old markup', host.outerHTML, BEFORE);

    host.querySelector('[data-mode="b"]').dispatchEvent(
        new dom.window.MouseEvent('click', { bubbles: true }));
    await tick();
    check('a strip click still switches', shown(host), ['b']);
    check('and active() follows it', nav.active(), 'b');
}
{
    const log = [];
    const host = document.createElement('div');
    mountNavPanel(host, { modes: [mode('a', log), mode('b', log)] });
    await tick();
    type(host, 'q');
    check('the filter still reaches the pane', log.at(-1), 'filter:a:q');
}
{
    const log = [];
    const host = document.createElement('div');
    const nav = mountNavPanel(host, { modes: [mode('a', log), mode('b', log)], showFilter: false });
    await tick();
    check('showFilter: false renders no filter box', filterBox(host), null);
    ok('the strip is still there', !!host.querySelector('.twm-nav__modes'));
    ok('no pane is handed a filter', !log.some((l) => l.startsWith('filter:')), JSON.stringify(log));
    await nav.select('b');
    check('select() works without a filter', shown(host), ['b']);
}
{
    const log = [];
    const host = document.createElement('div');
    const nav = mountNavPanel(host, { modes: [mode('a', log), mode('b', log)], initialMode: 'b' });
    await tick();
    check('initialMode: b mounts b only', log.filter((l) => l.startsWith('mount')), ['mount:b']);
    check('and shows it', shown(host), ['b']);
    check('active() is b', nav.active(), 'b');

    const log2 = [];
    const host2 = document.createElement('div');
    const nav2 = mountNavPanel(host2, { modes: [mode('a', log2), mode('b', log2)], initialMode: 'nope' });
    await tick();
    check('an unknown initialMode falls back to the first mode', nav2.active(), 'a');
}

if (failures) {
    console.log(`\nnav panel select: ${failures} assertion(s) FAILED`);
    process.exit(1);
}
console.log('\nall assertions passed');
