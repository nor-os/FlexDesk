/**
 * BUG-0036: a window's resize handles do not hide an overlay scrollbar.
 *
 * WindowChromeController lays fixed 6px `.twm-resize-handle` strips (z-index
 * 9999) along the edges of a non-maximized window. A pane flush against the
 * right edge has its overlay bar exactly under the right strip, and
 * `barCovered()` used to read the strip as a popover over the track and hide
 * the bar. The handles are window chrome, not cover; a real overlay still is.
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

console.log(failures ? `\n${failures} assertion(s) FAILED` : '\nall assertions passed');
process.exit(failures ? 1 : 0);
