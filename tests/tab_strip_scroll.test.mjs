/**
 * 1.5 — THE TOP TAB STRIP SCROLLS, and a mouse can reach every tab in it.
 *
 * `.tabs.notebook-tabs` overflows sideways and hides its scrollbar, so it owes
 * a mouse user every other way in. jsdom has no layout, so the geometry is
 * faked here (scroll width, client width, tab rectangles) and what is checked
 * is the arithmetic and the event handling; the real gesture — a wheel over an
 * overflowing strip, a tab dragged to its edge — is checked in headless Edge.
 *
 *   §1  a vertical wheel scrolls the strip sideways, and only while it can move
 *   §2  a render keeps the strip's scroll (it used to reset it to the first tab)
 *   §3  a tab that has just become active is scrolled into view; other renders
 *       leave the strip where the reader put it
 *
 *     node tests/tab_strip_scroll.test.mjs
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
    console.log('tab strip scroll: SKIPPED — needs jsdom');
    process.exit(0);
}

const dom = new JSDOM('<!doctype html><body></body>',
                      { url: 'http://localhost/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'Event',
                   'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'DragEvent', 'CSS',
                   'getComputedStyle', 'navigator', 'requestAnimationFrame',
                   'cancelAnimationFrame']) {
    if (dom.window[key] !== undefined && globalThis[key] === undefined) {
        globalThis[key] = dom.window[key];
    }
}

const { NotebookTabBar } = await import('../src/editor/notebook_tab_bar.js');

let failures = 0;
function check(name, actual, expected) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) { failures++; console.error(`  FAIL ${name}\n    got      ${a}\n    expected ${e}`); }
    else console.log(`  ok   ${name}`);
}

// Twelve 100px tabs in a 300px strip.
const TAB_W = 100;
const VIEW = 300;
const host = document.createElement('div');
document.body.appendChild(host);
let left = 0;
Object.defineProperty(host, 'scrollLeft', {
    configurable: true,
    get: () => left,
    // Clamped, as a browser clamps it — and to 0 while the strip is empty,
    // which is what made a render forget where it was.
    set: (v) => { left = Math.max(0, Math.min(v, Math.max(0, host.scrollWidth - VIEW))); },
});
Object.defineProperty(host, 'scrollWidth', {
    configurable: true, get: () => host.querySelectorAll('.tab').length * TAB_W,
});
Object.defineProperty(host, 'clientWidth', { configurable: true, get: () => VIEW });
// EMPTYING THE STRIP CLAMPS ITS SCROLL TO 0, as a browser's next layout does —
// the defect §2 pins. jsdom lays nothing out, so the clamp is applied here.
const htmlDesc = Object.getOwnPropertyDescriptor(dom.window.Element.prototype, 'innerHTML');
Object.defineProperty(host, 'innerHTML', {
    configurable: true,
    get() { return htmlDesc.get.call(this); },
    set(v) { htmlDesc.set.call(this, v); left = Math.min(left, Math.max(0, host.scrollWidth - VIEW)); },
});
Object.defineProperty(host, 'offsetWidth', { configurable: true, get: () => VIEW });
host.getBoundingClientRect = () => ({ left: 0, right: VIEW, top: 0, bottom: 26, width: VIEW, height: 26 });
// Each tab's rectangle follows its position and the strip's scroll, as a
// laid-out one would — on the prototype, because the strip measures a tab in
// the same render that creates it.
const realRect = dom.window.HTMLElement.prototype.getBoundingClientRect;
dom.window.HTMLElement.prototype.getBoundingClientRect = function rect() {
    if (!this.classList?.contains('tab') || this.parentElement !== host) return realRect.call(this);
    const i = [...host.querySelectorAll('.tab')].indexOf(this);
    const x = i * TAB_W - left;
    return { left: x, right: x + TAB_W, top: 0, bottom: 26, width: TAB_W, height: 26 };
};
const layOut = () => {};

const bar = new NotebookTabBar();
bar.mount(host, {});
const tabs = Array.from({ length: 12 }, (_, i) => ({ filePath: `builtin://tab/${i}`, fileType: 'x', label: `T${i}` }));
const update = (active) => { bar.update(tabs, `builtin://tab/${active}`); layOut(); };
update(0);

const wheel = (init) => {
    const ev = new dom.window.WheelEvent('wheel', { bubbles: true, cancelable: true, ...init });
    host.dispatchEvent(ev);
    return ev;
};

console.log('\n§1 wheel');
{
    let ev = wheel({ deltaY: 120 });
    check('a vertical wheel moves the strip sideways', left, 120);
    check('…and takes the wheel from the page', ev.defaultPrevented, true);
    ev = wheel({ deltaY: 3, deltaMode: 1 });
    check('line-mode deltas are converted to pixels', left, 168);
    wheel({ deltaY: 10000 });
    check('clamped at the end', left, 12 * TAB_W - VIEW);
    ev = wheel({ deltaY: 120 });
    check('at the end the wheel is left for the page', ev.defaultPrevented, false);
    ev = wheel({ deltaY: 120, shiftKey: true });
    check('Shift+wheel is the browser’s own horizontal scroll', ev.defaultPrevented, false);
    ev = wheel({ deltaY: 120, ctrlKey: true });
    check('Ctrl+wheel is zoom, untouched', ev.defaultPrevented, false);
    ev = wheel({ deltaX: -50, deltaY: 5 });
    check('a gesture that is already horizontal is the browser’s', ev.defaultPrevented, false);
}

console.log('\n§2 a render keeps the scroll');
{
    left = 0;
    wheel({ deltaY: 250 });
    check('scrolled to 250', left, 250);
    bar.markDirty('builtin://tab/0', true);      // a render that activates nothing
    layOut();
    check('a render that changes no active tab leaves the strip where it was', left, 250);
}

console.log('\n§3 the active tab is brought into view');
{
    update(10);
    check('activating tab 10 scrolls it fully into view at the right edge', left, 11 * TAB_W - VIEW);
    update(1);
    check('activating tab 1 scrolls back to show it at the left edge', left, 1 * TAB_W);
    update(2);
    check('a tab already in view moves nothing', left, 1 * TAB_W);
    wheel({ deltaY: 500 });
    const parked = left;
    bar.markDirty('builtin://tab/2', true);
    layOut();
    check('a later render of the SAME active tab does not yank the strip back', left, parked);
    tabs.push({ filePath: 'builtin://tab/12', fileType: 'x', label: 'T12' });
    update(12);
    check('a newly opened tab at the end is scrolled into view', left, 13 * TAB_W - VIEW);
}

bar.dispose();
console.log(failures ? `\n${failures} assertion(s) FAILED` : '\nall assertions passed');
process.exit(failures ? 1 : 0);
