/**
 * ══ A SLIDE-OUT PANEL UNDER THE CONTENT ZOOM (BUG-0018) ══════════════════
 *
 * `SlideOutPanel` pins itself to its host with `position: fixed`, copying the
 * host's `getBoundingClientRect()` into its own `top` / `left` / `height`. The
 * shell's content zoom (C31) puts `zoom: var(--twm-zoom)` on a tile body, so a
 * panel mounted in a tile sits inside a zoomed subtree. There the rect is in
 * SCREEN pixels, which already carry the zoom, while the panel's lengths are
 * CSS pixels that the same zoom multiplies again. Copied across unchanged,
 * every length was scaled twice: at 150% the panel landed right of and below
 * its host, often off-screen; at 50% it was half the host's height.
 *
 * jsdom computes no layout and knows no `zoom`, so this suite plays the browser:
 * the host's rect is what a browser would report on screen, `currentCSSZoom` is
 * the effective zoom a browser would give the panel, and the panel's on-screen
 * box is its CSS lengths times that zoom — the arithmetic standardised CSS
 * `zoom` performs. What is asserted is that on-screen box: flush with the
 * host's right edge, at the host's top, at the host's height.
 *
 *   §1  100% — the output is byte-for-byte what it was before the fix.
 *   §2  150% and 50% — flush, top-aligned, full height.
 *   §3  `min-width` holds the panel wider than asked — still flush.
 *   §4  a resize while open re-pins under the zoom.
 *   §5  an engine without `currentCSSZoom` behaves as 100%.
 *
 *     node tests/slide_out_panel_zoom.test.mjs
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
    console.log('slide-out panel zoom: SKIPPED — needs jsdom '
        + '(`cd ../Tables/web && npm install`, or `npm i -D jsdom` here)');
    process.exit(0);
}

const dom = new JSDOM('<!doctype html><body></body>',
                      { url: 'http://localhost/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'Event',
                   'CustomEvent', 'KeyboardEvent', 'getComputedStyle', 'navigator',
                   'requestAnimationFrame', 'cancelAnimationFrame', 'MutationObserver']) {
    if (dom.window[key] !== undefined && globalThis[key] === undefined) {
        globalThis[key] = dom.window[key];
    }
}

/** jsdom has no ResizeObserver, and an open panel observes its host
 *  (BUG-0017). Host resizes are slide_out_host_resize.test.mjs's subject;
 *  here the observer only has to exist, so it never fires. */
globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
};

const { SlideOutPanel } = await import('../src/ui/components/slide_out_panel.js');

let failures = 0;
function check(name, actual, expected) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) { failures++; console.error(`  FAIL ${name}\n    got      ${a}\n    expected ${e}`); }
    else console.log(`  ok   ${name}`);
}
const section = (title) => console.log(`\n${title}`);

/**
 * A host whose on-screen rect is `rect`, and a panel mounted in it whose
 * effective zoom is `zoom` (omitted: the property does not exist) and whose
 * laid-out width is `laidOut` (omitted: jsdom's 0, i.e. unknown).
 */
function setup({ rect, zoom, width = 700, laidOut }) {
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
    if (laidOut !== undefined) Object.defineProperty(el, 'offsetWidth', { get: () => laidOut });
    return { host, panel, el, move: (r) => { current = { ...r }; } };
}

/** Where a browser draws the panel: its CSS lengths times its effective zoom. */
function onScreen(el, zoom, cssWidth) {
    const top = parseFloat(el.style.top) * zoom;
    const left = parseFloat(el.style.left) * zoom;
    return {
        top: Math.round(top * 1000) / 1000,
        right: Math.round((left + cssWidth * zoom) * 1000) / 1000,
        height: Math.round(parseFloat(el.style.height) * zoom * 1000) / 1000,
    };
}

// ── §1 ────────────────────────────────────────────────────────────────────
section('§1 at 100% the geometry is unchanged');
{
    const { el, panel } = setup({ rect: { top: 120.4, left: 300, right: 1300.6, height: 600.2 }, zoom: 1 });
    panel.open('Config', 'tune');
    check('position', el.style.position, 'fixed');
    check('top is the rounded rect top', el.style.top, '120px');
    check('left is right edge minus width', el.style.left, `${Math.round(1300.6 - 700)}px`);
    check('height is the rounded rect height', el.style.height, '600px');
    check('right is released', el.style.right, 'auto');
    panel.dispose();
}

// ── §2 ────────────────────────────────────────────────────────────────────
for (const zoom of [1.5, 0.5, 2]) {
    section(`§2 at ${zoom * 100}% the panel is flush with its host`);
    const rect = { top: 150, left: 200, right: 1500, height: 600 };
    const { el, panel } = setup({ rect, zoom });
    panel.open('Config', 'tune');
    // At 200% the 1300px host is 650 CSS px, under the panel's 700: the
    // panel is capped to the host's width (BUG-0035).
    const cssWidth = Math.min(700, (rect.right - rect.left) / zoom);
    check('on screen: top, right edge, height = the host\'s',
          onScreen(el, zoom, cssWidth), { top: rect.top, right: rect.right, height: rect.height });
    panel.dispose();
}

// ── §3 ────────────────────────────────────────────────────────────────────
section('§3 a panel min-width holds wider than asked stays flush');
{
    const rect = { top: 40, left: 0, right: 900, height: 500 };
    const { el, panel } = setup({ rect, zoom: 1.5, width: 300, laidOut: 400 });
    panel.open('Config');
    check('on screen at the laid-out width',
          onScreen(el, 1.5, 400), { top: rect.top, right: rect.right, height: rect.height });
    panel.dispose();
}

// ── §4 ────────────────────────────────────────────────────────────────────
section('§4 a resize while open re-pins under the zoom');
{
    const { el, panel, move } = setup({ rect: { top: 150, left: 0, right: 1500, height: 600 }, zoom: 1.5 });
    panel.open('Config');
    const after = { top: 90, left: 0, right: 1200, height: 450 };
    move(after);
    window.dispatchEvent(new window.Event('resize'));
    check('on screen follows the moved host',
          onScreen(el, 1.5, 700), { top: after.top, right: after.right, height: after.height });
    panel.close();
    move({ top: 0, left: 0, right: 600, height: 300 });
    const leftBefore = el.style.left;
    window.dispatchEvent(new window.Event('resize'));
    check('closed: no longer tracks', el.style.left, leftBefore);
    panel.dispose();
}

// ── §5 ────────────────────────────────────────────────────────────────────
section('§5 an engine without currentCSSZoom is treated as 100%');
{
    const { el, panel } = setup({ rect: { top: 10, left: 0, right: 1000, height: 400 } });
    panel.open('Config');
    check('top', el.style.top, '10px');
    check('left', el.style.left, '300px');
    check('height', el.style.height, '400px');
    panel.dispose();
}

if (failures) {
    console.error(`\nslide-out panel zoom: ${failures} assertion(s) FAILED`);
    process.exit(1);
}
console.log('\nall assertions passed');
