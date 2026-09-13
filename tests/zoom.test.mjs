/**
 * C31 — THE CONTENT ZOOM.
 *
 * Three things are pinned here, in order of how badly they fail when wrong:
 *
 *   §4  THE GEOMETRY INVARIANT. The zoom may scale a tile's body and a window's
 *       content and NOTHING a window is dragged across — not the root, not a leaf
 *       wrap, not a window frame. CSS `zoom` establishes a scaled coordinate
 *       space; a contained window (C21) lives in a leaf wrap and is re-parented to
 *       the root for a drag (R1), so zooming either drifts every drag and every
 *       C15 snap probe by the zoom factor. That is the failure that looks like
 *       "snapping is broken" with nothing pointing at the zoom, so it is asserted
 *       against the shipped stylesheet rather than trusted to a comment.
 *   §1  THE NUMBERS. A range that disagreed with its own slider is a track whose
 *       last notch does nothing, and `null`/`''` reading as 0 is a shell that
 *       silently opens at 50%.
 *   §2-3 THE CONTROL. Mounts only when given an element, drives the root through
 *       a variable and a class, persists through the host port, restores, resets,
 *       and disposes back to 100%.
 *
 * WHY THIS FILE IS NOT jsdom, for the reason snap_bounds.test.mjs gives and one of
 * its own: the control needs `createElement`, `classList`, `style.setProperty`
 * and event dispatch — a dozen properties — and the thing most worth asserting
 * about it (§4) is a fact about a CSS file, which no DOM would check anyway.
 *
 *     node tests/zoom.test.mjs
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    ZOOM_MIN, ZOOM_MAX, ZOOM_STEP, ZOOM_NUDGE, ZOOM_DEFAULT, ZOOM_STATE_KEY,
    clampZoom, applyZoom, mountZoomControl,
} from '../src/tiling/zoom.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

let failures = 0;
function check(name, actual, expected) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) { failures++; console.error(`  FAIL ${name}\n    got      ${a}\n    expected ${e}`); }
    else console.log(`  ok   ${name}`);
}
function ok(name, cond, detail = '') {
    if (!cond) { failures++; console.error(`  FAIL ${name}${detail ? '\n    ' + detail : ''}`); }
    else console.log(`  ok   ${name}`);
}

// ── a DOM exactly as deep as the control reads ──────────────────────────
function makeDoc() {
    const doc = {
        createElement(tag) {
            const listeners = {};
            const classes = new Set();
            const props = {};
            const el = {
                tagName: tag.toUpperCase(), ownerDocument: doc, children: [], parent: null,
                attributes: {}, textContent: '', value: '', title: '', type: '',
                min: '', max: '', step: '',
                get className() { return [...classes].join(' '); },
                set className(v) { classes.clear(); String(v).split(/\s+/).filter(Boolean).forEach((c) => classes.add(c)); },
                classList: {
                    add: (...c) => c.forEach((x) => classes.add(x)),
                    remove: (...c) => c.forEach((x) => classes.delete(x)),
                    contains: (c) => classes.has(c),
                    toggle: (c, force) => {
                        const on = force === undefined ? !classes.has(c) : !!force;
                        if (on) classes.add(c); else classes.delete(c);
                        return on;
                    },
                },
                style: { setProperty: (k, v) => { props[k] = v; }, getPropertyValue: (k) => props[k] ?? '' },
                setAttribute(k, v) { this.attributes[k] = String(v); },
                addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
                dispatch(type) { (listeners[type] || []).forEach((fn) => fn({ type, target: el })); },
                appendChild(child) { child.parent = el; el.children.push(child); return child; },
                append(...kids) { kids.forEach((k) => el.appendChild(k)); },
                remove() {
                    if (!el.parent) return;
                    el.parent.children = el.parent.children.filter((c) => c !== el);
                    el.parent = null;
                },
                find(cls) {
                    for (const c of el.children) {
                        if (c.classList.contains(cls)) return c;
                        const deep = c.find(cls);
                        if (deep) return deep;
                    }
                    return null;
                },
            };
            return el;
        },
    };
    return doc;
}

/** A host port whose `state` is a Map, recording every write. */
function makeHost(initial = {}) {
    const store = new Map(Object.entries(initial));
    const writes = [];
    return {
        writes,
        store,
        state: {
            read: async (k) => (store.has(k) ? store.get(k) : null),
            write: async (k, v) => { writes.push([k, v]); store.set(k, v); return true; },
        },
    };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── §1 the numbers ──────────────────────────────────────────────────────
console.log('\n§1 the range');

check('the range is 50–200', [ZOOM_MIN, ZOOM_MAX], [50, 200]);
check('the default is 100', ZOOM_DEFAULT, 100);
ok('the default sits ON a notch', ZOOM_DEFAULT % ZOOM_STEP === 0,
    'off a notch, neither the track nor the buttons could ever return to it');
ok('a button step is a whole number of track steps', ZOOM_NUDGE % ZOOM_STEP === 0,
    'otherwise a button press quantises somewhere it did not ask for, and presses drift');
check('below the floor clamps up', clampZoom(10), 50);
check('above the ceiling clamps down', clampZoom(9999), 200);
check('a notch is kept', clampZoom(125), 125);
check('between notches quantises', clampZoom(97), 95);
for (const junk of [null, undefined, '', 'wat', NaN, Infinity]) {
    // null and '' are the regression: Number() makes both 0, which clamps to 50.
    // String(), not JSON.stringify: JSON renders NaN and Infinity as `null`, which
    // would label three different inputs identically.
    const label = typeof junk === 'string' ? JSON.stringify(junk) : String(junk);
    check(`${label} reads as the default, not the floor`, clampZoom(junk), 100);
}
{
    let v = ZOOM_DEFAULT;
    for (let i = 0; i < 20; i++) v = clampZoom(v - ZOOM_NUDGE);
    check('nudging down bottoms out at the floor', v, ZOOM_MIN);
    for (let i = 0; i < 40; i++) v = clampZoom(v + ZOOM_NUDGE);
    check('nudging up tops out at the ceiling', v, ZOOM_MAX);
}

// ── §2 applying it to a root ────────────────────────────────────────────
console.log('\n§2 the root');
{
    const doc = makeDoc();
    const root = doc.createElement('div');
    applyZoom(root, 150);
    check('the variable carries the factor', root.style.getPropertyValue('--twm-zoom'), '1.5');
    ok('away from 100% the class is on', root.classList.contains('twm-zoomed'));
    applyZoom(root, 100);
    ok('AT 100% the class is off — so no `zoom` applies anywhere', !root.classList.contains('twm-zoomed'));
    applyZoom(null, 150);   // must not throw
    ok('a missing root is a no-op, not a crash', true);
}

// ── §3 the control ──────────────────────────────────────────────────────
console.log('\n§3 the control');
{
    const doc = makeDoc();
    const root = doc.createElement('div');
    check('no element, no control', mountZoomControl(null, { root }), null);
    check('no root, no control', mountZoomControl(doc.createElement('div'), {}), null);
}
{
    const doc = makeDoc();
    const root = doc.createElement('div');
    const bar = doc.createElement('div');
    const host = makeHost();
    const changes = [];
    const z = mountZoomControl(bar, { root, host, onChange: (p) => changes.push(p) });
    await z.ready;

    const slider = bar.find('twm-zoom__slider');
    const readout = bar.find('twm-zoom__value');
    const [out, inn] = bar.find('twm-zoom').children.filter((c) => c.classList.contains('twm-zoom__step'));

    check('the track advertises the same range clampZoom enforces',
        [slider.min, slider.max, slider.step], ['50', '200', '5']);
    check('it opens at 100%', [z.get(), readout.textContent], [100, '100%']);
    ok('an unzoomed shell carries no class', !root.classList.contains('twm-zoomed'));

    slider.value = '150';
    slider.dispatch('input');
    check('dragging the track zooms the root', [z.get(), readout.textContent,
        root.style.getPropertyValue('--twm-zoom'), root.classList.contains('twm-zoomed')],
        [150, '150%', '1.5', true]);

    inn.dispatch('click');
    check('+ steps by the nudge', z.get(), 160);
    out.dispatch('click'); out.dispatch('click');
    check('− steps by the nudge', z.get(), 140);

    readout.dispatch('click');
    check('the readout is the reset', [z.get(), root.classList.contains('twm-zoomed')], [100, false]);

    z.set(120);
    slider.dispatch('dblclick');
    check('a double-click on the track resets', z.get(), 100);

    check('onChange heard every real change, once each', changes, [150, 160, 150, 140, 100, 120, 100]);

    z.set(175);
    await sleep(450);
    check('the zoom is persisted through the host port, debounced to the last value',
        host.writes.at(-1), [ZOOM_STATE_KEY, 175]);
    const writesBefore = host.writes.length;
    z.set(175);
    await sleep(450);
    check('an unchanged value is not written again', host.writes.length, writesBefore);

    z.dispose();
    ok('dispose removes the control', bar.find('twm-zoom') === null);
    ok('dispose puts the root back to 100%', !root.classList.contains('twm-zoomed'));
}
{
    const doc = makeDoc();
    const root = doc.createElement('div');
    const bar = doc.createElement('div');
    const z = mountZoomControl(bar, { root, host: makeHost({ [ZOOM_STATE_KEY]: 137 }) });
    const restored = await z.ready;
    check('a saved zoom is restored, quantised onto the track', [restored, z.get()], [135, 135]);
    ok('and applied to the root before anything waits on it', root.classList.contains('twm-zoomed'));
}
{
    const doc = makeDoc();
    const z = mountZoomControl(doc.createElement('div'), { root: doc.createElement('div'), host: null });
    const v = await z.ready;
    check('a host with no `state` is legal — the control works, nothing persists', v, 100);
    z.set(150);
    check('and it still zooms', z.get(), 150);
}
{
    const doc = makeDoc();
    const failing = { state: { read: async () => { throw new Error('disk gone'); }, write: async () => {} } };
    const originalWarn = console.warn;
    console.warn = () => {};
    const z = mountZoomControl(doc.createElement('div'), { root: doc.createElement('div'), host: failing });
    const v = await z.ready;
    console.warn = originalWarn;
    check('a failed read costs the default, not the shell', v, 100);
}

// ── §4 the geometry invariant, against the SHIPPED stylesheet ───────────
console.log('\n§4 nothing a window is dragged across is zoomed');
for (const file of ['css/flexdesk.css', 'css/base.css']) {
    const css = readFileSync(join(ROOT, file), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '');   // comments name the forbidden selectors on purpose
    // Every rule whose declarations set `zoom`.
    const zoomRules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
        .filter(([, , body]) => /(^|;|\s)zoom\s*:/.test(body))
        .map(([, sel]) => sel.split(',').map((s) => s.trim()).filter(Boolean))
        .flat();
    const zoomed = zoomRules.filter((s) => s.includes('twm-zoomed'));

    check(`${file}: the zoom reaches exactly the two content surfaces`,
        zoomed.sort(), ['.twm-zoomed .twm-leaf__body', '.twm-zoomed .twm-window-content']);

    // The selectors the drag and snap maths depend on staying in real pixels.
    // `.twm-leaf__body` and `.twm-window-content` are allowed; every name here is a
    // box a window is contained in, dragged across, or is.
    const FORBIDDEN = /(^|[\s>+~])\.twm-(leaf|managed-window|slot|root|host)(?![\w-])/;
    const offenders = zoomed.filter((s) => FORBIDDEN.test(s.replace('.twm-zoomed', '')));
    check(`${file}: no zoom on a leaf wrap, slot, root or window frame`, offenders, []);
}

console.log(failures ? `\n${failures} assertion(s) FAILED` : '\nall assertions passed');
process.exit(failures ? 1 : 0);
