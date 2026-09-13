/**
 * AUTO SCROLLBARS — the thumb's size and place.
 *
 * The overlay layer, the hover and the fade need a browser and are checked in
 * one (BugDesk's browser check). What can go wrong without one is arithmetic:
 * a thumb that overshoots its track, vanishes on a long list, or sits in the
 * wrong place at either end.
 *
 *     node tests/auto_scrollbars.test.mjs
 */
import { thumbGeometry } from '../src/ui/utils/auto_scrollbars.js';

let failures = 0;
function check(name, actual, expected) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) { failures++; console.error(`  FAIL ${name}\n    got      ${a}\n    expected ${e}`); }
    else console.log(`  ok   ${name}`);
}
const r = (g) => (g ? { size: Math.round(g.size), pos: Math.round(g.pos) } : g);

check('nothing overflows: no bar', thumbGeometry(500, 500, 0, 500), null);
check('one pixel of overflow is rounding, not scrolling', thumbGeometry(501, 500, 0, 500), null);
check('half the content visible: a half-length thumb at the top', r(thumbGeometry(1000, 500, 0, 500)), { size: 250, pos: 0 });
check('...and at the bottom when scrolled to the end', r(thumbGeometry(1000, 500, 500, 500)), { size: 250, pos: 250 });
check('a very long list still has a thumb you can grab', r(thumbGeometry(1e6, 500, 0, 500)), { size: 30, pos: 0 });
check('...which reaches the end of the track exactly', r(thumbGeometry(1e6, 500, 1e6 - 500, 500)), { size: 30, pos: 470 });
check('an over-scroll (elastic, rounding) never pushes the thumb past the track', r(thumbGeometry(1000, 500, 900, 500)), { size: 250, pos: 250 });
check('a zero-length track shows nothing', thumbGeometry(1000, 500, 0, 0), null);

console.log(failures ? `\n${failures} assertion(s) FAILED` : '\nall assertions passed');
process.exit(failures ? 1 : 0);
