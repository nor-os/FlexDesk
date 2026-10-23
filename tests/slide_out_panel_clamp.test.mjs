/**
 * ══ BUG-0035. A SLIDE-OUT NEVER LEAVES ITS HOST, AND ITS ICONS ARE SIZED ══
 *
 * `SlideOutPanel` pins its right edge to its host's right edge and placed its
 * left edge at `right - width`, with nothing holding that left edge inside the
 * host. Its default width is 700px and `.twm-slide-out-panel` has
 * `min-width: 400px`, so in a tile narrower than the panel it spilled across
 * the neighbouring pane. And no rule sized the header icon or the close icon,
 * so both rendered at whatever the page's global icon size happened to be
 * (Google's 24px, or a consumer's own).
 *
 * jsdom computes no layout and knows no `zoom`, so this suite plays the browser
 * as slide_out_panel_zoom.test.mjs does: the host's rect is what a browser would
 * report on screen, `currentCSSZoom` the panel's effective zoom, and the
 * panel's on-screen box its CSS lengths times that zoom.
 *
 *   §1  a host narrower than the panel: the panel's left edge is the host's,
 *       its right edge the host's, at 100% and under a CSS zoom
 *   §2  the width cap reaches the stylesheet: the panel carries the host's
 *       width as `--twm-slide-out-host-w`, and the panel rule caps `max-width`
 *       and lowers the 400px `min-width` to it (base.css and flexdesk.css)
 *   §3  a host wider than the panel: unchanged, the requested width
 *   §4  the cap follows a host that narrows while open
 *   §5  the header icon and the close icon have 18px rules that beat
 *       `.material-symbols-outlined` on specificity, in both sheets
 *
 *     node tests/slide_out_panel_clamp.test.mjs
 *
 * jsdom is borrowed from the sibling Tables checkout. Absent, this SKIPS loudly.
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { ruleBody, specificity, compareSpecificity } from './css_rules.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SUITE = 'slide_out_panel_clamp';

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
    console.log(`${SUITE}: SKIPPED — needs jsdom `
        + '(`cd ../Tables/web && npm install`, or `npm i -D jsdom` here)');
    process.exit(0);
}

const dom = new JSDOM('<!doctype html><body></body>',
                      { url: 'http://localhost/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'Event',
                   'KeyboardEvent', 'getComputedStyle', 'navigator']) {
    if (dom.window[key] !== undefined && globalThis[key] === undefined) {
        globalThis[key] = dom.window[key];
    }
}

/** Host resizes reach the panel through this observer; `fire()` is the browser
 *  delivering a notification after layout. */
const observers = [];
globalThis.ResizeObserver = class {
    constructor(cb) { this.cb = cb; this.live = true; observers.push(this); }
    observe() {}
    unobserve() {}
    disconnect() { this.live = false; }
    fire() { if (this.live) this.cb([], this); }
};

const { SlideOutPanel } = await import('../src/ui/components/slide_out_panel.js');

let failures = 0;
const check = (name, actual, expected) => {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) { failures++; console.error(`  FAIL ${name}\n    got      ${a}\n    expected ${e}`); }
    else console.log(`  ok   ${name}`);
};
const ok = (name, cond) => check(name, !!cond, true);
const section = (t) => console.log(`\n${t}`);
const r3 = (n) => Math.round(n * 1000) / 1000;

function setup({ rect, zoom, width = 700 }) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    let current = { ...rect };
    host.getBoundingClientRect = () => ({
        top: current.top, left: current.left, right: current.right, bottom: current.top + current.height,
        width: current.right - current.left, height: current.height, x: current.left, y: current.top,
    });
    const panel = new SlideOutPanel({ width });
    panel.mount(host);
    const el = host.querySelector('.twm-slide-out-panel');
    if (zoom !== undefined) Object.defineProperty(el, 'currentCSSZoom', { get: () => zoom });
    return { host, panel, el, move: (r) => { current = { ...r }; } };
}

/** The width a browser lays the panel out at: the inline width, capped by the
 *  host width the panel carries (what `max-width: var(--twm-slide-out-host-w)`
 *  does), in CSS pixels. */
function laidOutWidth(el) {
    const w = parseFloat(el.style.width);
    const cap = parseFloat(el.style.getPropertyValue('--twm-slide-out-host-w'));
    return Number.isFinite(cap) ? Math.min(w, cap) : w;
}

/** Where a browser draws the panel: its CSS lengths times its effective zoom. */
function onScreen(el, zoom) {
    const left = parseFloat(el.style.left) * zoom;
    return { left: r3(left), right: r3(left + laidOutWidth(el) * zoom) };
}

// ── §1 ────────────────────────────────────────────────────────────────────
for (const zoom of [1, 1.5, 2]) {
    section(`§1 a 700px panel in a 360px host at ${zoom * 100}% stays inside it`);
    const rect = { top: 50, left: 500, right: 860, height: 400 };
    const { el, panel } = setup({ rect, zoom });
    panel.open('Config', 'tune');
    const box = onScreen(el, zoom);
    ok(`left edge ${box.left} >= the host's left edge ${rect.left}`, box.left >= rect.left - 0.001);
    check('right edge is the host\'s', box.right, rect.right);
    check('the panel spans the host exactly', r3(box.right - box.left), rect.right - rect.left);
    panel.dispose();
}

// ── §2 ────────────────────────────────────────────────────────────────────
section('§2 the cap reaches the stylesheet');
{
    const { el, panel } = setup({ rect: { top: 0, left: 100, right: 400, height: 300 }, zoom: 1.5 });
    panel.open('Config');
    check('the panel carries the host width in CSS px',
          el.style.getPropertyValue('--twm-slide-out-host-w'), '200px');
    panel.dispose();
}
for (const sheet of ['base.css', 'flexdesk.css']) {
    const css = readFileSync(resolvePath(HERE, '../css', sheet), 'utf8');
    const body = ruleBody(css, '.twm-slide-out-panel') || '';
    const decl = (prop) => (new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`).exec(body) || [])[1]?.trim() ?? null;
    check(`${sheet}: max-width is the host width`, decl('max-width'), 'var(--twm-slide-out-host-w, none)');
    check(`${sheet}: min-width gives way to a narrower host`, decl('min-width'),
          'min(400px, var(--twm-slide-out-host-w, 400px))');
}

// ── §3 ────────────────────────────────────────────────────────────────────
section('§3 a host wider than the panel: the requested width, flush right');
{
    const rect = { top: 0, left: 0, right: 1200, height: 500 };
    const { el, panel } = setup({ rect, zoom: 1 });
    panel.open('Config');
    check('width is the requested one', laidOutWidth(el), 700);
    check('on screen', onScreen(el, 1), { left: 500, right: 1200 });
    panel.dispose();
}

// ── §4 ────────────────────────────────────────────────────────────────────
section('§4 a host that narrows while open re-caps the panel');
{
    const { el, panel, move } = setup({ rect: { top: 0, left: 0, right: 1200, height: 500 }, zoom: 1 });
    panel.open('Config');
    move({ top: 0, left: 800, right: 1200, height: 500 });
    observers.at(-1).fire();
    check('on screen inside the narrowed host', onScreen(el, 1), { left: 800, right: 1200 });
    panel.dispose();
}

// ── §5 ────────────────────────────────────────────────────────────────────
section('§5 the header and close icons are 18px');
{
    const { host, panel } = setup({ rect: { top: 0, left: 0, right: 1200, height: 500 } });
    panel.open('Config', 'tune');
    const icon = host.querySelector('.twm-slide-out-panel__header > .material-symbols-outlined');
    ok('the header icon carries twm-slide-out-panel__icon', icon?.classList.contains('twm-slide-out-panel__icon'));
    ok('the close icon is inside .twm-slide-out-panel__close',
       host.querySelector('.twm-slide-out-panel__close .material-symbols-outlined'));
    panel.dispose();
    const google = specificity('.material-symbols-outlined');
    for (const sheet of ['base.css', 'flexdesk.css']) {
        const css = readFileSync(resolvePath(HERE, '../css', sheet), 'utf8');
        for (const sel of ['.twm-slide-out-panel__icon.material-symbols-outlined',
                           '.twm-slide-out-panel__close .material-symbols-outlined']) {
            const body = ruleBody(css, sel);
            ok(`${sheet}: ${sel} has a rule`, body);
            check(`${sheet}: ${sel} font-size`, (/font-size\s*:\s*([^;]+)/.exec(body || '') || [])[1]?.trim() ?? null, '18px');
            ok(`${sheet}: ${sel} outranks .material-symbols-outlined`,
               compareSpecificity(specificity(sel), google) > 0);
        }
    }
}

if (failures) {
    console.error(`\n${SUITE}: ${failures} assertion(s) FAILED`);
    process.exit(1);
}
console.log('\nall assertions passed');
