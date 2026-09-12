/**
 * R15 — AERO SNAP TRIGGERS ON THE DRAGGED WINDOW'S BORDERS, NOT THE POINTER.
 *
 * The product owner, twice: *"snapping enables based on mouse position but
 * actually it needs to enable based on the dragged window bounds (e.g. window
 * right border distance from right snapping area)"*. The gesture that proves
 * it is §2 below — a wide window grabbed in the MIDDLE of its title bar and
 * shoved right until the clamp stops it. Its right border is on the pane's
 * right border; the pointer is 450px short of it, outside every band. Before
 * R15 that resolved to `null` and the window simply stopped dead against the
 * side of the screen.
 *
 * WHY THIS FILE IS NOT jsdom. The thing under test is a pure geometry
 * question — four rectangles in, one zone name out — and jsdom's answer to
 * every `getBoundingClientRect` is a zero box, which is exactly the input
 * `_snapSide` treats as "unmeasurable, fall back to the pointer". A DOM that
 * cannot lay anything out cannot exercise the branch that reads a layout. So
 * the leaves, the root and the window are plain objects with the four
 * properties the probe reads, `_snapProbe` is called on a hand-built `this`,
 * and the rectangles are stated rather than measured — which is also the only
 * way to say "the pointer is HERE while the window's border is THERE", the
 * relationship the whole ruling is about.
 *
 * Everything below `_snapSide` is the real thing: `_snapProbe`, `_leafElAt`,
 * `_homeDockTarget` and `_isStartTile` are the shipped methods, so the zone
 * MATRIX is asserted end to end and not just the new distance test.
 *
 *     node tests/snap_bounds.test.mjs
 *
 * The matrix itself is settled and is NOT re-decided here — it is asserted
 * unchanged, cell by cell, in §5. Tables' `web/js/shell/snap_zones.test.mjs`
 * is the other copy of it.
 */

import { WindowManager } from '../src/tiling/wm.js';

let failures = 0;
function check(name, actual, expected) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) { failures++; console.error(`  FAIL ${name}\n    got      ${a}\n    expected ${e}`); }
}
function ok(name, cond, detail = '') {
    if (!cond) { failures++; console.error(`  FAIL ${name}${detail ? '\n    ' + detail : ''}`); }
}

// ── the fake DOM, four properties deep ──────────────────────────────────
const rectOf = (r) => ({
    left: r.left, top: r.top, width: r.width, height: r.height,
    right: r.left + r.width, bottom: r.top + r.height,
});

function makeEl(cls, rect, { leafId = undefined } = {}) {
    const el = {
        className: cls,
        dataset: leafId ? { leafId } : {},
        rect,
        children: [],
        parent: null,
        isConnected: true,
        getBoundingClientRect() { return rectOf(this.rect); },
        closest(sel) {
            let n = this;
            while (n) {
                if (sel === `.${n.className}`) return n;
                n = n.parent;
            }
            return null;
        },
        contains(other) {
            let n = other;
            while (n) { if (n === this) return true; n = n.parent; }
            return false;
        },
        append(child) { child.parent = this; this.children.push(child); return child; },
    };
    return el;
}

// ── the layout ──────────────────────────────────────────────────────────
//
// Two panes side by side, 600 wide each, inside a 1200-wide layer. PANE_A is
// the pane the window's drag escaped (its "own" pane); PANE_B is next door.
const PANE_A = { left: 40,  top: 20, width: 600, height: 800 };   // 40..640
const PANE_B = { left: 640, top: 20, width: 600, height: 800 };   // 640..1240
const ROOT   = { left: 10,  top: 5,  width: 1280, height: 900 };

const rootEl = makeEl('twm-root', ROOT);
const leafA = rootEl.append(makeEl('twm-leaf', PANE_A, { leafId: 'A' }));
const leafB = rootEl.append(makeEl('twm-leaf', PANE_B, { leafId: 'B' }));
// The box a window promoted onto pane A is confined to: a CHILD of the leaf,
// not the leaf itself, because that is what a canvas ground is and `own` is a
// `contains` test rather than an equality one.
const groundA = leafA.append(makeEl('tbl-canvas-pane', PANE_A));

globalThis.document = {
    elementsFromPoint(x, y) {
        const hits = [];
        for (const el of [leafA, leafB]) {
            const r = rectOf(el.rect);
            if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) hits.push(el);
        }
        return hits;
    },
};

// ── the tree ────────────────────────────────────────────────────────────
const TREE = {
    A: { id: 'A', kind: 'leaf', content: { kind: 'tables', props: { canvas: true } }, tabs: [] },
    B: { id: 'B', kind: 'leaf', content: { kind: 'table', props: { id: 't1' } }, tabs: [] },
};
const tree = {
    get: (id) => TREE[id] || null,
    primaryLeafId: () => 'A',
};

// ── the window manager, only as deep as the probe reaches ───────────────
const wm = Object.create(WindowManager.prototype);
wm.rootEl = rootEl;
wm.taxonomy = { root: 'tables' };
wm.desktops = { activeIdx: 0, desktops: [{ tree }] };
wm.renderer = { leafEl: (id) => (id === 'A' ? leafA : id === 'B' ? leafB : null) };
wm._windowToLeaf = new Map();
wm._tree = () => tree;

/** A window being dragged: an element with a rectangle, the container its drag
 *  escaped, and the pointer position the press happened at. */
function makeWin(rect, { origin = groundA, press = null } = {}) {
    const el = makeEl('twm-managed-window', rect);
    const win = { element: el, dragOrigin: origin };
    if (press) win._dragState = { startX: press[0], startY: press[1] };
    return win;
}

const EDGE = WindowManager.SNAP_EDGE_PX;
const zone = (win, x, y) => {
    const p = wm._snapProbe({ clientX: x, clientY: y }, win);
    return p ? `${p.mode}${p.side ? ':' + p.side : ''}` : null;
};
const rectAt = (win, x, y) => {
    const p = wm._snapProbe({ clientX: x, clientY: y }, win);
    return p ? { left: p.rect.left, top: p.rect.top,
                 width: p.rect.width, height: p.rect.height } : null;
};

// A record, so the own-pane top edge has a tile to promise.
const ADOPT = (win) => wm._windowToLeaf.set('w', {
    window: win, desktopIdx: 0, homeLeafId: 'A', leafId: null,
    original: { kind: 'table', props: { id: 't1' }, title: 'Customer' },
    tabs: [], activeTabIdx: 0, adopted: true,
});

console.log(`snap bounds: SNAP_EDGE_PX = ${EDGE}`);

// ════════════════════════════════════════════════════════════════════════
// 1. THE CONSTANT IS THE ONLY THRESHOLD
// ════════════════════════════════════════════════════════════════════════
ok('the band is one named constant', typeof EDGE === 'number' && EDGE > 0);

// ════════════════════════════════════════════════════════════════════════
// 2. THE MOTIVATING CASE — the whole reason R15 exists
// ════════════════════════════════════════════════════════════════════════
//
// A 900px window in a 600px pane, grabbed at the middle of its title bar and
// shoved right until `dragBounds` stops it with its right border ON the layer's
// right edge (1240, which is pane B's right edge). The pointer is at 790 —
// 450px short of that edge, and 150px inside pane B. Every band is hundreds of
// pixels away from it.
//
// BEFORE R15 THIS WAS `null`: no zone, no preview, and the window just stopped.
// The press was at x=400 and the pointer is now at x=790: the drag carried the
// window 390px to the right, which is what a shove looks like.
const WIDE = { left: 340, top: 300, width: 900, height: 400 };  // right border = 1240
const wide = makeWin(WIDE, { press: [400, 300] });
const POINTER = [790, 500];

check('THE MOTIVATING CASE: window right border on the pane\'s right border, '
    + 'pointer 450px away → right split',
      zone(wide, ...POINTER), 'split:right');
ok('and the pointer really is nowhere near the band it used to have to be in',
   PANE_B.left + PANE_B.width - POINTER[0] > EDGE * 10,
   `pointer is ${PANE_B.left + PANE_B.width - POINTER[0]}px from the pane's right edge`);

// THE SAME PROBE WITH NO WINDOW TO MEASURE is the pre-R15 answer, and it is
// the assertion that says this test would fail against the old code: the
// pointer-only reading of these exact coordinates is `tab`, not `split:right`.
const ghost = { element: null, dragOrigin: groundA };
check('the POINTER-ONLY reading of the identical gesture — what shipped before '
    + 'R15 — arms nothing at that edge',
      zone(ghost, ...POINTER), 'tab');

// The preview has to move with the hit-test or the feature becomes a liar.
check('and the preview is the right half of THAT PANE, which is what the drop '
    + 'delivers', rectAt(wide, ...POINTER),
      { left: 940, top: 20, width: 300, height: 800 });

// ── the same failure on the bottom edge, which a title bar can never reach ──
//
// A tall window is dragged by its top; the pointer cannot get near the pane's
// bottom band without the window being pushed most of the way off the screen.
const TALL = { left: 700, top: 420, width: 300, height: 400 };  // bottom = 820 = pane bottom
const tall = makeWin(TALL, { press: [800, 100] });
check('a tall window pushed down until its bottom border meets the pane\'s → '
    + 'bottom split', zone(tall, 800, 450), 'split:bottom');
check('…where the pointer alone would have said `tab`', zone(ghost, 800, 450), 'tab');

// ════════════════════════════════════════════════════════════════════════
// 3. THE DIRECTION GUARD — R2's nudge, under edge testing
// ════════════════════════════════════════════════════════════════════════
//
// A window PARKED at the left of its own pane is inside the left band before
// the hand touches it. Without the guard, picking it up would arm a left split
// on the first millimetre of any drag — the "every move looked like a dock"
// failure arriving from the other direction.
const PARKED = { left: 44, top: 300, width: 300, height: 300 };  // 4px from pane A's left
const nudged = makeWin(PARKED, { press: [200, 400] });
check('a window parked at its own pane\'s left edge, NUDGED 3px, arms nothing',
      zone(nudged, 203, 402), null);

const shoved = makeWin(PARKED, { press: [400, 400] });   // pointer now 200px left of the press
check('the same window SHOVED left arms the left split',
      zone(shoved, 200, 400), 'split:left');

// A window that fills its own pane is in all four bands at once. Only the
// direction the drag went may arm.
const FILLS = { left: 40, top: 20, width: 600, height: 800 };
const filled = makeWin(FILLS, { press: [300, 400] });
check('a window that fills its own pane, nudged, arms nothing',
      zone(filled, 302, 401), null);
check('shoved right, it arms right and only right',
      zone(filled, 500, 400), 'split:right');

// AND THE GUARD IS OFF IN A FOREIGN PANE, deliberately: arriving in the pane to
// your right always means travelling right, so a guard there would make the
// left half of it unaimable.
const ENTERING = { left: 650, top: 300, width: 300, height: 300 };  // left border 10px into B
const entering = makeWin(ENTERING, { press: [300, 400] });
check('a window carried rightwards INTO the pane next door still arms that '
    + 'pane\'s left edge', zone(entering, 800, 400), 'split:left');

// ════════════════════════════════════════════════════════════════════════
// 4. CORNERS, AND THE PRECEDENCE THAT KEEPS BOTH ZONES REACHABLE
// ════════════════════════════════════════════════════════════════════════
//
// Shoved into pane B's top-right corner the clamp puts BOTH borders at exactly
// zero. Rule 1 (nearest) cannot separate them; rule 2 does — the axis the drag
// pushed furthest wins, so the same corner gives either zone depending on how
// it was aimed.
const CORNER = { left: 940, top: 20, width: 300, height: 300 };  // right AND top on pane B's
const mostlyRight = makeWin(CORNER, { origin: null, press: [500, 130] });
const mostlyUp    = makeWin(CORNER, { origin: null, press: [1090, 500] });
check('corner, pushed mostly RIGHTWARDS → right', zone(mostlyRight, 1090, 130), 'split:right');
check('corner, pushed mostly UPWARDS → top',      zone(mostlyUp,    1090, 130), 'split:top');

// Rule 1 still holds when the distances differ: nearest wins regardless of the
// push. 20px from the top border, 0px from the right one.
const NEARER_RIGHT = { left: 940, top: 40, width: 300, height: 300 };
const nearerRight = makeWin(NEARER_RIGHT, { origin: null, press: [1090, 500] });
check('nearest still wins over the tie-break', zone(nearerRight, 1090, 130), 'split:right');

// Rule 3: no drag state at all → the fixed order left, right, top, bottom.
const noState = makeWin(CORNER, { origin: null });
check('a perfect tie with no gesture to read falls to the fixed order',
      zone(noState, 1090, 130), 'split:right');

// ════════════════════════════════════════════════════════════════════════
// 5. THE MATRIX, UNCHANGED — this is the part R15 may not move
// ════════════════════════════════════════════════════════════════════════
//
//     zone    | the window's OWN pane | any OTHER pane
//     --------|-----------------------|--------------------------
//     top     | BACK TO TILE          | split, top half
//     left    | split, left half      | split, left half
//     right   | split, right half     | split, right half
//     bottom  | split, bottom half    | split, bottom half
//     centre  | NOTHING — a nudge     | tab, or fill if the pane is ground
//
// A small window, moved a long way toward each edge in turn.
const SMALL = (l, t) => ({ left: l, top: t, width: 200, height: 200 });
const at = (rect, press, pointer) => {
    const w = makeWin(rect, { press });
    ADOPT(w);
    return zone(w, ...pointer);
};
// own pane: pushed at each of its four borders. The press is 300px away in the
// direction travelled, so the guard is satisfied every time.
check('OWN pane, top border → BACK TO TILE',
      at(SMALL(240, 20), [340, 420], [340, 200]), 'home:top');
check('OWN pane, left border → split left',
      at(SMALL(40, 300), [440, 400], [140, 400]), 'split:left');
check('OWN pane, right border → split right',
      at(SMALL(440, 300), [240, 400], [540, 400]), 'split:right');
check('OWN pane, bottom border → split bottom',
      at(SMALL(240, 620), [340, 420], [340, 720]), 'split:bottom');
check('OWN pane, centre → NOTHING AT ALL',
      at(SMALL(240, 400), [640, 400], [340, 500]), null);

// other pane: the same four, with the origin still pane A so every pane B hit
// is foreign.
const other = (rect, pointer) => zone(makeWin(rect, { press: [340, 400] }), ...pointer);
check('OTHER pane, top border → split top',    other(SMALL(840, 20),  [940, 200]), 'split:top');
check('OTHER pane, left border → split left',  other(SMALL(640, 300), [740, 400]), 'split:left');
check('OTHER pane, right border → split right', other(SMALL(1040, 300), [1140, 400]), 'split:right');
check('OTHER pane, bottom border → split bottom', other(SMALL(840, 620), [940, 720]), 'split:bottom');
check('OTHER pane, centre, holding content → a TAB',
      other(SMALL(840, 400), [940, 500]), 'tab');

// the centre's other half: a pane that is ground is FILLED rather than tabbed.
TREE.B.content = { kind: 'tables', props: { canvas: true } };
check('OTHER pane, centre, when the pane is ground → a FILL',
      other(SMALL(840, 400), [940, 500]), 'fill');
TREE.B.content = { kind: 'table', props: { id: 't1' } };

// a window with no origin has no inside to be in: pane A is foreign to it too,
// and its own top edge splits rather than docking.
const stray = makeWin(SMALL(240, 20), { origin: null, press: [340, 420] });
check('a window with NO origin gets the foreign answer in pane A too',
      zone(stray, 340, 200), 'split:top');
check('and its centre is a tab or a fill, never silence',
      zone(makeWin(SMALL(240, 400), { origin: null, press: [340, 400] }), 340, 500), 'fill');

// and a window the WM never adopted arms nothing at its own top edge, because
// there is no tile to promise.
wm._windowToLeaf.clear();
const unadopted = makeWin(SMALL(240, 20), { press: [340, 420] });
check('a window the WM never adopted arms NOTHING at its own top edge',
      zone(unadopted, 340, 200), null);
check('…while its other edges are unaffected',
      zone(makeWin(SMALL(40, 300), { press: [440, 400] }), 140, 400), 'split:left');

// ════════════════════════════════════════════════════════════════════════
// 6. THE FALLBACK — a window with no measurable box is still hit-tested
// ════════════════════════════════════════════════════════════════════════
//
// The path every headless consumer takes, `web/js/shell/snap_zones.test.mjs`
// included: no element, or an element whose box has zero area, leaves the
// pointer as the only information there is.
const zeroBox = makeWin({ left: 0, top: 0, width: 0, height: 0 }, { press: [340, 400] });
check('a zero-area window falls back to the pointer', zone(zeroBox, 640 - 10, 400), 'split:right');
check('and so does a window with no element at all', zone(ghost, 50, 420), 'split:left');
// The historical corner tie-break, which the fallback must still answer the
// same way: nearest wins, and `left` before `top` when they are equal.
check('pointer fallback, nearer the top → back to tile (adopted)',
      (ADOPT(ghost), zone(ghost, 50, 25)), 'home:top');
check('pointer fallback, nearer the left → a left split', zone(ghost, 45, 30), 'split:left');

// ════════════════════════════════════════════════════════════════════════
// 7. R16 — THE TWO WAYS R15's ARITHMETIC ANSWERED THE WRONG QUESTION
// ════════════════════════════════════════════════════════════════════════
//
// R15 shipped the right idea with two sign errors in it. Neither is visible
// from §2–§6: every one of those assertions passes byte-identically with R15's
// `Math.abs` restored in both places, which is why they are asserted here and
// why each case below states what R15 answered.

// ── 7a. THE BAND THAT OPENED AND THEN CLOSED AGAIN ──────────────────────
//
// `Math.abs(r.right - w.right)` counts DOWN as the window's border approaches
// the pane's border and back UP again once it passes. So the zone armed for a
// 55px window of pointer travel and then went dark, and **the harder you
// shoved the less likely it was to snap** — a hesitant push landed inside the
// band, a committed one sailed through it.
//
// A 300px window in PANE_A whose right border starts 200px short of the pane's
// right edge (640), grabbed 150px left of that border, and pushed right. The
// pointer stays inside PANE_A until delta 350, so every probe below is one
// continuous gesture in one pane.
const CREEP = (d) => makeWin({ left: 140 + d, top: 300, width: 300, height: 200 },
                             { press: [290, 400] });
check('R16: the shove ARMS as the border reaches the band',
      zone(CREEP(180), 290 + 180, 400), 'split:right');
// R15 answered `null` here: |200 - 300| = 100, out of band, nothing armed.
check('R16: and STAYS armed when the border goes PAST the edge — R15 said null',
      zone(CREEP(300), 290 + 300, 400), 'split:right');
check('R16: still armed at the far end of the gesture — R15 said null',
      zone(CREEP(345), 290 + 345, 400), 'split:right');
// The band's near side is unmoved: before the border reaches it, nothing arms.
check('R16: and it does NOT arm before the border reaches the band',
      zone(CREEP(160), 290 + 160, 400), null);
// The preview must still be the half it will deliver — the C15 rule R15 kept.
check('R16: the preview is still the right half of the pane it armed on',
      rectAt(CREEP(300), 290 + 300, 400),
      { left: 40 + 300, top: 20, width: 300, height: 800 });

// ── 7b. THE SAME-AXIS TIE THAT NEVER BROKE ──────────────────────────────
//
// `along` was `Math.abs(push.x)` for BOTH 'left' and 'right', so the two
// members of a same-axis pair scored identically, `p > best.p` was never true,
// and the tie fell to the loop's fixed order: **'left' won every time, however
// the window was shoved.**
//
// It is not a corner curiosity. A window whose width equals the pane's is at
// distance zero on both edges at once — and a floated canvas pane's window is
// sized to exactly that, so this is the ordinary gesture of pushing a floated
// pane at the pane next door. PANE_B is foreign, so the direction guard is off
// and the tie-break is the only thing deciding.
const COVER = (press) => makeWin({ ...PANE_B }, { press });
check('R16: a pane-wide window shoved RIGHT arms right — R15 said left',
      zone(COVER([440, 420]), 940, 420), 'split:right');
check('R16: the same window shoved LEFT still arms left',
      zone(COVER([1440, 420]), 940, 420), 'split:left');
// The vertical pair, for the same reason and by the same rule.
const R16_TALL_UP = makeWin({ left: 700, top: 20, width: 200, height: 800 }, { press: [800, 900] });
check('R16: a pane-tall window shoved UP arms top', zone(R16_TALL_UP, 800, 420), 'split:top');
const R16_TALL_DOWN = makeWin({ left: 700, top: 20, width: 200, height: 800 }, { press: [800, 60] });
check('R16: and shoved DOWN arms bottom — R15 said top for both',
      zone(R16_TALL_DOWN, 800, 420), 'split:bottom');

console.log(failures === 0 ? 'snap bounds: OK' : `snap bounds: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
