/**
 * BUG-0036: a window's resize handles do not hide an overlay scrollbar.
 *
 * WindowChromeController lays fixed 6px `.twm-resize-handle` strips (z-index
 * 9999) along the edges of a non-maximized window. A pane flush against the
 * right edge has its overlay bar exactly under the right strip, and
 * `barCovered()` used to read the strip as a popover over the track and hide
 * the bar. The handles are window chrome, not cover; a real overlay still is.
 *
 * BUG-0059: the same for a ManagedWindow's own `.twm-managed-window__resize`
 * handles, which lie over the content of the floating window they resize.
 *
 *     node tests/autoscroll_resize_handle_not_cover.test.mjs
 */
import { barCovered } from '../src/ui/utils/auto_scrollbars.js';

let failures = 0;
function check(name, actual, expected) {
    if (actual !== expected) { failures++; console.error(`  FAIL ${name}\n    got      ${actual}\n    expected ${expected}`); }
    else console.log(`  ok   ${name}`);
}

// A stand-in element: `closest(sel)` answers for the classes on it and its parents.
const node = (classes = [], parent = null) => {
    const n = {
        classes, parent,
        contains: (o) => { for (let x = o; x; x = x.parent) if (x === n) return true; return false; },
        closest: (sel) => {
            const wanted = sel.split(',').map((s) => s.trim().replace(/^\./, ''));
            for (let x = n; x; x = x.parent) if (x.classes.some((c) => wanted.includes(c))) return x;
            return null;
        },
    };
    return n;
};

const scroller = node(['pane-body']);
const row = node(['row'], scroller);
const rightHandle = node(['twm-resize-handle', 'right']);
const cornerHandle = node(['twm-resize-handle', 'corner', 'bottom-right']);
const popover = node(['popover']);
const bar = node(['twm-autoscroll-bar'], node(['twm-autoscroll-layer']));

check('the right resize handle over the whole track: drawn',
    barCovered(scroller, [[rightHandle, row, scroller], [rightHandle, scroller], [rightHandle, row]]), false);
check('a corner handle at the end of the track: drawn',
    barCovered(scroller, [[row, scroller], [cornerHandle, scroller]]), false);
check('the handle and the bar itself above the pane: drawn',
    barCovered(scroller, [[bar, rightHandle, row, scroller]]), false);
check('a popover under the handle still covers the track: not drawn',
    barCovered(scroller, [[rightHandle, popover, row], [rightHandle, row]]), true);
check('a popover with no handle in the way: not drawn',
    barCovered(scroller, [[row], [popover, row]]), true);

// BUG-0059: a ManagedWindow's own handles (`.twm-managed-window__resize`, 6px
// edges and 12px corners laid over the window's content) are chrome too. A
// content that fills the window has its bar's lower end under the south-east
// corner, and its right edge under the east strip.
const floating = node(['twm-managed-window']);
const content = node(['twm-managed-window__content'], floating);
const body = node(['job-progress'], content);
const bodyRow = node(['row'], body);
const eastStrip = node(['twm-managed-window__resize', 'twm-managed-window__resize--e'], floating);
const seCorner = node(['twm-managed-window__resize', 'twm-managed-window__resize--se'], floating);
const southStrip = node(['twm-managed-window__resize', 'twm-managed-window__resize--s'], floating);
const menu = node(['menu']);

check('a managed window\'s south-east corner at the end of the track: drawn',
    barCovered(body, [[bodyRow, body], [bodyRow, body], [seCorner, southStrip, body, content]]), false);
check('a managed window\'s east strip along the whole track: drawn',
    barCovered(body, [[eastStrip, bodyRow, body], [eastStrip, body], [eastStrip, seCorner, body]]), false);
check('a menu under a managed window\'s handle still covers the track: not drawn',
    barCovered(body, [[eastStrip, menu, bodyRow], [bodyRow, body]]), true);

console.log(failures ? `\n${failures} assertion(s) FAILED` : '\nall assertions passed');
process.exit(failures ? 1 : 0);
