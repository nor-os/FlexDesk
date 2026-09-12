/**
 * ══ DOUBLE-CLICK A TILE HEADER TO FLOAT THE PANE ═════════════════════════
 *
 * *"double click on tile header needs to put the tile into floating window"*.
 *
 * The verb already existed and already had two doors — the `web_asset` button
 * in the chrome, and a deliberate DOWNWARD pull on the strip
 * (`tile_renderer.js`, `TILE_LIFT_PX`). What it did not have was the gesture
 * whose RETURN JOURNEY was already spelled: double-clicking a floating
 * window's title bar docks it back into a tile
 * (`../src/ui/components/managed_window.js:919` → `toggleMaximize` →
 * `onMaximize` → `wm.bringBackWindow`, the "maximise means back to tile"
 * ruling). Half a toggle is worse than none: the user learns that a
 * double-click on a header docks a pane, tries it on the pane, and nothing
 * happens.
 *
 * FOUR of the six sections below stand for a way this could be written and be
 * wrong while looking right:
 *
 *   §2  THE GUARD IS SHARED. The pull refuses `button, .twm-leaf__tab`; a
 *       double-click that did not would float the pane when you
 *       double-clicked Close. Both listeners now read one constant
 *       (`CHROME_NO_FLOAT`) and §2 drives the same press on a button through
 *       BOTH doors.
 *   §3  FOCUSING MUST NOT EAT THE GESTURE. The leaf wrap binds `mousedown` to
 *       focus the pane and a double-click is two of those, so the real event
 *       sequence is dispatched here — mousedown/mouseup/click twice, then
 *       dblclick — never `el.click()`, which synthesises one click and skips
 *       the presses that are the risk. The wrap's deferred `body.focus()` is
 *       then flushed AFTER the promote has destroyed the wrap it was going to
 *       focus, because that is the moment a promote-mid-focus would throw.
 *   §5  AN EMBEDDER WITHOUT `onLeafAction` MUST NOT BREAK. Additive and
 *       back-compatible is the rule (D6), and `ctx.onLeafAction?.()` is only
 *       load-bearing if something proves the `?.` is there.
 *   §6  THE ROUND TRIP. Out through the header, back through the window's
 *       title bar, against the REAL `WindowManager` and the REAL
 *       `ManagedWindow` — not a stub of either — landing on the same leaf id
 *       with the same content it left with.
 *
 * ── HOW TO RUN ───────────────────────────────────────────────────────────
 *
 *     node test/tile_header_dblclick.test.mjs        # from ../FlexDesk
 *
 * It imports `../src/tiling/tile_renderer.js` DIRECTLY, never `dist/` and
 * never Tables' `vendor/flexdesk/`: the change under test is upstream source
 * and the bundle is re-vendored later, so a test against the bundle would pass
 * for a week by testing the old code.
 *
 * jsdom is not a FlexDesk dependency (this package has zero runtime deps and
 * only esbuild as a dev one), so it is borrowed from the sibling Tables
 * checkout that already installs it. Absent, this SKIPS loudly rather than
 * passing.
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
    // Sibling checkouts, in the order they are likely to exist. `web/` is
    // where Tables declares its jsdom devDependency (`web/package.json`).
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
    console.log('tile header dblclick: SKIPPED — needs jsdom '
        + '(`cd ../Tables/web && npm install`, or `npm i -D jsdom` here)');
    process.exit(0);
}

// ── jsdom globals, installed before the modules under test are imported ──
const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>',
                      { url: 'http://localhost/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'Event',
                   'CustomEvent', 'MouseEvent', 'PointerEvent', 'KeyboardEvent',
                   'DragEvent', 'getComputedStyle', 'navigator', 'requestAnimationFrame',
                   'cancelAnimationFrame', 'MutationObserver', 'ResizeObserver',
                   'DOMRect', 'localStorage']) {
    if (dom.window[key] !== undefined && globalThis[key] === undefined) {
        globalThis[key] = dom.window[key];
    }
}
// jsdom 24 has no PointerEvent. The pull door listens for `pointerdown` /
// `pointermove`, which are ordinary events with mouse coordinates on them, so
// MouseEvent carries them faithfully enough to drive the gesture.
if (globalThis.PointerEvent === undefined) globalThis.PointerEvent = dom.window.MouseEvent;
if (globalThis.ResizeObserver === undefined) {
    globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
}

const { TileRenderer } = await import('../src/tiling/tile_renderer.js');
const { TileTree, makeLeaf } = await import('../src/tiling/tile_tree.js');
const { createContentRegistry } = await import('../src/tiling/content_registry.js');
const { createTaxonomy } = await import('../src/tiling/kind_taxonomy.js');
const { WindowManager } = await import('../src/tiling/wm.js');
const { createShell } = await import('../src/tiling/shell.js');
const { createEntityCatalog } = await import('../src/tiling/entity_sources.js');

// ── harness ─────────────────────────────────────────────────────────────
let failures = 0;
function ok(what, cond, why = '') {
    if (cond) { console.log(`  ok   ${what}`); return; }
    failures += 1;
    console.log(`  FAIL ${what}${why ? `\n       ${why}` : ''}`);
}
function check(what, actual, expected, why = '') {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    ok(what, a === e, `${why ? `${why}\n       ` : ''}expected ${e}, got ${a}`);
}
const tick = () => new Promise((r) => setTimeout(r, 0));

/**
 * THE REAL SEQUENCE, not `el.click()` and not a bare `dblclick`.
 *
 * A convenience method that synthesises one click skips the presses, and the
 * presses are where the hazard is: the leaf wrap binds `mousedown` to focus
 * the pane, so a double-click on a header runs that handler twice before the
 * `dblclick` ever arrives. A test that dispatches only the last event of the
 * sequence cannot see a focus handler eating the gesture — which is exactly
 * how a taskbar restore in the sibling repo passed four probes while being
 * broken.
 */
function realDoubleClick(el) {
    const opts = { bubbles: true, cancelable: true, button: 0, clientX: 40, clientY: 8 };
    for (const detail of [1, 2]) {
        el.dispatchEvent(new dom.window.MouseEvent('mousedown', { ...opts, detail }));
        el.dispatchEvent(new dom.window.MouseEvent('mouseup', { ...opts, detail }));
        el.dispatchEvent(new dom.window.MouseEvent('click', { ...opts, detail }));
    }
    el.dispatchEvent(new dom.window.MouseEvent('dblclick', { ...opts, detail: 2 }));
}

/** The pull door, driven the same way: a press, then real movement. */
function pullDown(el, dy) {
    el.dispatchEvent(new dom.window.MouseEvent('pointerdown', {
        bubbles: true, cancelable: true, button: 0, clientX: 40, clientY: 8 }));
    dom.window.dispatchEvent(new dom.window.MouseEvent('pointermove', {
        bubbles: true, clientX: 40, clientY: 8 + dy }));
    dom.window.dispatchEvent(new dom.window.MouseEvent('pointerup', { bubbles: true }));
}

// ── fixture: a renderer over a two-tab leaf, no WM ──────────────────────
function mountRenderer({ ctx } = {}) {
    const root = dom.window.document.createElement('div');
    dom.window.document.getElementById('root').appendChild(root);
    const tree = new TileTree();
    const leafId = tree.setRoot(makeLeaf({
        content: { kind: 'table', props: { id: 't1' } }, title: 'Customer' }));
    const calls = [];
    const renderer = new TileRenderer({
        root,
        tree,
        content: createContentRegistry({ table: (host) => { host.textContent = 'grid'; return {}; } }),
        ctx: ctx === undefined
            ? { onLeafAction: (id, action) => calls.push([id, action]) }
            : ctx,
    });
    renderer.render();
    const wrap = root.querySelector('.twm-leaf');
    return { root, tree, leafId, calls, renderer, wrap,
             chrome: wrap.querySelector('.twm-leaf__chrome') };
}

console.log('\ntile header double-click → float the pane\n');

// ════════════════════════════════════════════════════════════════════════
// 1. THE GESTURE
// ════════════════════════════════════════════════════════════════════════
{
    const f = mountRenderer();
    ok('the tile has a chrome strip to double-click', !!f.chrome);
    realDoubleClick(f.chrome);
    check('double-clicking it asks for `promote`, the same verb the pull asks for',
          f.calls, [[f.leafId, 'promote']],
          'this is the outward half of the toggle whose return journey — '
        + 'double-click a floating window title bar to dock it — already existed');
}

// ════════════════════════════════════════════════════════════════════════
// 2. ONE GUARD, BOTH DOORS
// ════════════════════════════════════════════════════════════════════════
//
// `CHROME_NO_FLOAT` is a single constant read by the `pointerdown` listener
// and the `dblclick` one. The assertion that matters is not that each door
// refuses a button — it is that they refuse THE SAME THINGS, because two
// copies of a selector are how a chrome grows a button that floats the pane
// under one gesture and not the other.
{
    const f = mountRenderer();
    const closeBtn = f.chrome.querySelector('button[data-action="close"]');
    ok('the chrome carries controls that are not grips', !!closeBtn);

    realDoubleClick(closeBtn);
    check('double-clicking a chrome BUTTON does not float the pane',
          f.calls.filter(([, a]) => a === 'promote').length, 0,
          'the close button would otherwise float the pane on its way to closing it');

    f.calls.length = 0;
    pullDown(closeBtn, 60);
    check('and pulling one down does not either — the same rule, from the same constant',
          f.calls.filter(([, a]) => a === 'promote').length, 0);

    // The strip is a SIBLING of the chrome today, so a real tab never bubbles
    // through this listener. The guard names it anyway and the guard is what
    // is under test, so the target is put where the listener will see it.
    const tab = dom.window.document.createElement('span');
    tab.className = 'twm-leaf__tab';
    f.chrome.appendChild(tab);
    f.calls.length = 0;
    realDoubleClick(tab);
    check('double-clicking a `.twm-leaf__tab` does not float the pane',
          f.calls.filter(([, a]) => a === 'promote').length, 0);
    f.calls.length = 0;
    pullDown(tab, 60);
    check('and neither does pulling one down',
          f.calls.filter(([, a]) => a === 'promote').length, 0);
}

// ════════════════════════════════════════════════════════════════════════
// 3. FOCUSING THE PANE MUST NOT EAT THE DOUBLE-CLICK
// ════════════════════════════════════════════════════════════════════════
//
// `tile_renderer.js` binds `mousedown` on the leaf WRAP to focus the pane, and
// a double-click is two of those. Two things could go wrong and neither is a
// syntax error: the focus handler could swallow the sequence (it must not
// `preventDefault` or detach anything — the C28 lesson in
// `managed_window.js:1305`, where a pointerdown that re-parented the element
// meant a title bar's `dblclick` never fired once in a real browser), and the
// deferred `body.focus()` it schedules could run after the promote has thrown
// away the body it was going to focus.
{
    const f = mountRenderer();
    let threw = null;
    const onErr = (err) => { threw = err; };
    dom.window.addEventListener('error', onErr);

    realDoubleClick(f.chrome);
    check('the wrap\'s mousedown still focused the pane…', f.tree.focusedLeafId, f.leafId);
    check('…and the dblclick still arrived',
          f.calls, [[f.leafId, 'promote']],
          'a focus handler that preventDefaulted, or that detached the wrap, '
        + 'would leave this empty while every line of the listener read correctly');

    // The promote a real WM performs re-seeds the leaf, which rebuilds the
    // wrap — so the pending focus timer now points at a body that has left the
    // document. Reproduce that and flush.
    f.wrap.remove();
    await tick();
    dom.window.removeEventListener('error', onErr);
    ok('and flushing the deferred focus after the wrap is gone does not throw',
       threw === null, threw ? String(threw?.error || threw) : '');
}

// ════════════════════════════════════════════════════════════════════════
// 4. THE PULL STILL WORKS, AND STILL ONLY DOWNWARD
// ════════════════════════════════════════════════════════════════════════
//
// The constant was extracted out from under the existing listener. If that
// went wrong the pull would break silently, and nothing else checks it.
{
    const f = mountRenderer();
    pullDown(f.chrome, 60);
    check('pulling the chrome down past the threshold still floats the pane',
          f.calls, [[f.leafId, 'promote']]);

    const g = mountRenderer();
    pullDown(g.chrome, 6);
    check('and a few pixels of movement is still a click, not a lift', g.calls, []);
}

// ════════════════════════════════════════════════════════════════════════
// 5. AN EMBEDDER WITH NO `onLeafAction`
// ════════════════════════════════════════════════════════════════════════
//
// D6: upstream changes are ADDITIVE and BACK-COMPATIBLE. An embedder that
// drives the renderer itself and implements no leaf actions must not acquire a
// TypeError on a gesture it never asked for.
{
    const f = mountRenderer({ ctx: {} });
    let threw = null;
    try { realDoubleClick(f.chrome); } catch (err) { threw = err; }
    ok('double-clicking the header of a shell with no `onLeafAction` does nothing, quietly',
       threw === null, threw ? String(threw) : '');

    // …and one that passes no `ctx` at all, which the constructor normalises
    // to `{}`. Same door, same silence.
    const g = mountRenderer({ ctx: null });
    threw = null;
    try { realDoubleClick(g.chrome); } catch (err) { threw = err; }
    ok('and with no `ctx` at all', threw === null, threw ? String(threw) : '');
}

// ════════════════════════════════════════════════════════════════════════
// 6. THE ROUND TRIP, AGAINST THE REAL WM AND THE REAL WINDOW
// ════════════════════════════════════════════════════════════════════════
//
// Out through the tile header, back through the floating window's title bar.
// `promoteInPlace: true` is the configuration Tables ships
// (`web/js/shell/tables_shell.js:285`), and it is the one where "back" has a
// destination to be exact about: `_promote` records `homeLeafId` and
// `bringBackWindow` docks there, filling the start tile the promote re-seeded
// (`wm.js:1230`). So the pane comes back to the leaf it left, not merely to
// some leaf.
{
    const root = dom.window.document.createElement('div');
    dom.window.document.getElementById('root').appendChild(root);
    const wm = new WindowManager({
        rootEl: root,
        taxonomy: createTaxonomy({
            kinds: { home: { label: 'Home' }, table: { label: 'Table' } }, root: 'home' }),
        content: createContentRegistry({
            home: (host) => { host.textContent = 'home'; return {}; },
            table: (host, props) => { host.textContent = `grid ${props.id}`;
                                      return { title: 'Customer' }; },
        }),
        panelDefaults: { left: false, right: false, bottom: false },
        promoteInPlace: true,
    });
    const tree = wm.desktops.active().tree;
    const leafId = tree.primaryLeafId();
    tree.setLeafContent(leafId, { kind: 'table', props: { id: 't1' } }, 'Customer');
    wm.renderer.render();

    const chrome = root.querySelector(`.twm-leaf[data-leaf-id="${leafId}"] .twm-leaf__chrome`);
    ok('the pane is on screen with a header', !!chrome);

    realDoubleClick(chrome);
    await tick();
    const wins = [...root.querySelectorAll('.twm-managed-window')];
    check('double-clicking the header floats the pane into a managed window',
          wins.length, 1);
    check('and the tile it left is re-seeded rather than destroyed — never an empty pane',
          tree.get(leafId)?.content?.kind, 'home');

    const topbar = wins[0]?.querySelector('.twm-managed-window__topbar');
    ok('the floated window has a title bar to double-click back', !!topbar);

    // GUARDED, AND THE GUARD IS NOT DEFENSIVE PROGRAMMING. With the outward
    // gesture removed the pane never leaves, so every "it came back" assertion
    // below would hold VACUOUSLY — the table is still in the leaf because it
    // never went anywhere. A return journey with no outward leg is a failure,
    // and it has to say so rather than reporting `ok`.
    if (!topbar) {
        ok('double-clicking THAT docks it back into the very leaf it came from',
           false, 'no window was floated, so the return journey could not be driven');
        ok('and the window is gone rather than sitting maximised over the tile', false);
        ok('the round trip landed on the same leaf id, not a new one', false);
    } else {
        topbar.dispatchEvent(new dom.window.MouseEvent('dblclick', { bubbles: true }));
        await tick();
        check('double-clicking THAT docks it back into the very leaf it came from',
              [tree.get(leafId)?.content?.kind, tree.get(leafId)?.content?.props?.id],
              ['table', 't1'],
              'the symmetry is the whole point: one gesture on one strip, both directions');
        check('and the window is gone rather than sitting maximised over the tile',
              [...root.querySelectorAll('.twm-managed-window')].length, 0);
        check('the round trip landed on the same leaf id, not a new one',
              tree.primaryLeafId(), leafId);
    }
}

// ════════════════════════════════════════════════════════════════════════
// 7. A CONTENT THAT REFUSED TO BE FLOATED IS NOT FLOATED BY THIS GESTURE
// ════════════════════════════════════════════════════════════════════════
//
// C20 let a content factory return `chrome: { promote: false }`, and the
// renderer honoured it by not PAINTING the float button. The double-click is a
// door the renderer does not draw, and so were the tile's right-click menu and
// the chrome pull-down — all three reach `WindowManager.floatPane` without
// passing the button. So the veto was enforced on the one door that had a
// button and on none of the doors that did not.
//
// What that costs, reproduced before the guard existed: an embedder's MASTER
// tile — the ground its floating windows stand on — floats. Every window
// standing on it is force-closed, and the pane is re-seeded WITHOUT the props
// that made it a ground, so the surface does not come back either.
//
// The guard is now in `_floatableLeaf`, which is where all four doors already
// converge. This section drives the two that have no button.
{
    const root = dom.window.document.createElement('div');
    dom.window.document.getElementById('root').appendChild(root);
    const wm = new WindowManager({
        rootEl: root,
        taxonomy: createTaxonomy({
            kinds: { home: { label: 'Home' }, table: { label: 'Table' } }, root: 'home' }),
        content: createContentRegistry({
            // The ground: it says once, at mount, that it may not be floated.
            home: (host) => { host.textContent = 'ground';
                              return { chrome: { promote: false } }; },
            table: (host, props) => { host.textContent = `grid ${props.id}`;
                                      return { title: 'Customer' }; },
        }),
        panelDefaults: { left: false, right: false, bottom: false },
        promoteInPlace: true,
    });
    const tree = wm.desktops.active().tree;
    const leafId = tree.primaryLeafId();
    wm.renderer.render();

    const chrome = root.querySelector(`.twm-leaf[data-leaf-id="${leafId}"] .twm-leaf__chrome`);
    ok('the ground pane is on screen with a header', !!chrome);
    // The button really is absent — C20's original half still works, and this
    // is what made the hole invisible: the surface looked correctly guarded.
    ok('and the renderer painted no float button on it',
       !chrome?.querySelector('[data-action="promote"], .twm-leaf__action--promote'));

    realDoubleClick(chrome);
    await tick();
    check('DOUBLE-CLICKING IT FLOATS NOTHING', 
          [...root.querySelectorAll('.twm-managed-window')].length, 0,
          'the veto is stated by the content once and must hold for every door');
    check('and the ground is still the ground — not re-seeded out from under itself',
          tree.get(leafId)?.content?.kind, 'home');

    // The pull-down asks for the same verb through the same function.
    pullDown(chrome, 60);
    await tick();
    check('and PULLING it down floats nothing either',
          [...root.querySelectorAll('.twm-managed-window')].length, 0);

    // And the WM-level verb itself, which is what the right-click menu calls.
    check('`floatPane` on a vetoing leaf returns null rather than a window id',
          wm.floatPane(leafId), null);

    // ══ AND THE MENU ROW THAT CALLS IT — THE DOOR THIS SECTION NAMED AND
    //    NEVER OPENED ═════════════════════════════════════════════════════
    //
    // The line above asserts the VERB refuses. It says in its own comment that
    // this is "what the right-click menu calls", and then never asked the menu
    // anything — so `_tileContextMenu` drew *Float this pane as a window*
    // enabled on the one pane in the framework that cannot be floated, and
    // clicking it did nothing at all. The `Close tile` row three lines below it
    // in `shell.js` had been fixed for exactly this and carried a paragraph
    // about dead controls; the `promote` row beside it had not.
    //
    // Driven as a REAL `contextmenu` on the chrome through `createShell`,
    // because the menu is the shell's and a bare `WindowManager` has no
    // `onTileContextMenu` at all — asking the WM would assert nothing while
    // passing.
    {
        const sroot = dom.window.document.createElement('div');
        dom.window.document.getElementById('root').appendChild(sroot);
        //  is async — it awaits  before it returns.
        const shell = await createShell({
            root: sroot,
            entities: createEntityCatalog({ sources: [] }),
            taxonomy: createTaxonomy({
                kinds: { home: { label: 'Home' }, table: { label: 'Table' } }, root: 'home' }),
            // A PLAIN MAP, not a registry: `createShell` calls
            // `createContentRegistry(content)` itself. Handing it one already
            // built double-wraps, and the fallback factory that results mounts
            // `{title: kind}` — so every `chrome` veto the real factories state
            // silently disappears, which is what this section is about.
            content: {
                home: (host) => { host.textContent = 'ground';
                                  return { chrome: { promote: false } }; },
                table: (host) => { host.textContent = 'grid'; return { title: 'T' }; },
            },
            panels: { left: false, right: false, bottom: false },
            promoteInPlace: true,
        });
        const swm = shell.wm;
        const stree = swm.desktops.active().tree;
        const sleaf = stree.primaryLeafId();
        swm.renderer.render();
        const schrome = sroot.querySelector(
            `.twm-leaf[data-leaf-id="${sleaf}"] .twm-leaf__chrome`);
        schrome?.dispatchEvent(new dom.window.MouseEvent('contextmenu', {
            bubbles: true, cancelable: true, clientX: 20, clientY: 20 }));
        await tick();
        const rows = [...dom.window.document.querySelectorAll('.twm-context-menu-item')];
        const float = rows.find((r) => /Float this pane/i.test(r.textContent || ''));
        ok('the tile context menu drew a "Float this pane as a window" row', !!float,
           `rows: ${rows.map((r) => r.textContent.trim()).join(' | ') || '(none)'}`);
        ok('…and it is DISABLED on a pane whose content vetoed `promote`',
           !!float && (float.classList.contains('disabled')
                       || float.getAttribute('aria-disabled') === 'true'),
           'a row that calls a verb the verb will refuse is a dead control');
        dom.window.document.querySelector('.twm-context-menu')?.remove();

        // …and NOT disabled once the same pane holds ordinary content, so the
        // guard is an explicit refusal rather than a new default.
        stree.setLeafContent(sleaf, { kind: 'table', props: {} }, 'T');
        swm.renderer.render();
        await tick();
        sroot.querySelector(`.twm-leaf[data-leaf-id="${sleaf}"] .twm-leaf__chrome`)
            ?.dispatchEvent(new dom.window.MouseEvent('contextmenu', {
                bubbles: true, cancelable: true, clientX: 20, clientY: 20 }));
        await tick();
        const float2 = [...dom.window.document.querySelectorAll('.twm-context-menu-item')]
            .find((r) => /Float this pane/i.test(r.textContent || ''));
        ok('a pane that vetoed nothing still offers the row, enabled',
           !!float2 && !float2.classList.contains('disabled'));
        dom.window.document.querySelector('.twm-context-menu')?.remove();
        shell.dispose?.();
    }

    // A leaf whose content vetoed NOTHING is unaffected — the guard is an
    // explicit refusal, not a new default. D6: additive and back-compatible.
    tree.setLeafContent(leafId, { kind: 'table', props: { id: 't9' } }, 'Customer');
    wm.renderer.render();
    const ordinary = root.querySelector(`.twm-leaf[data-leaf-id="${leafId}"] .twm-leaf__chrome`);
    realDoubleClick(ordinary);
    await tick();
    check('while a content that vetoed nothing still floats exactly as before',
          [...root.querySelectorAll('.twm-managed-window')].length, 1);
}

// ════════════════════════════════════════════════════════════════════════
// 8. THE PULL AND C33's NATIVE DRAG SHARE ONE ELEMENT, AND §4 SAID SO WRONGLY
// ════════════════════════════════════════════════════════════════════════
//
// §4 above has asserted "pulling the chrome down past the threshold still
// floats the pane" since the pull was written, and it went on passing for the
// entire life of a defect that made the gesture impossible in every browser.
// C33 gave the SAME element `draggable="true"` (`_syncChromeDragSource`); a
// native drag begins at ~3-5px of travel and fires `pointercancel`, which is
// one of the three listeners the pull registers, so the pull was torn down at
// roughly 8px and could never reach 24. Reported downstream, 2026-09-03:
// *"pulling down a tile at title bar does not anymore turn it into a managed
// window (used to work)."*
//
// §4 could not see it and still cannot: `pullDown` synthesises `pointerdown`
// + `pointermove` in a jsdom that honours `draggable` not at all, starts no
// drag and fires no `pointercancel` — a world in which the two mechanisms do
// not touch. What follows pins the guard that separates them BY DIRECTION.
// That a cancelled `dragstart` really does hand the pointer back is HTML LS
// §6.11.5 (step 9 returns before step 10's `pointercancel`), and was measured
// over CDP against Edge 152; no assertion here reaches it.
{
    const f = mountRenderer({ });
    const chrome = f.chrome;
    const dt = { effectAllowed: '', dropEffect: '', types: [],
                 setData() {}, getData() { return ''; } };
    const drag = () => {
        const ev = new dom.window.Event('dragstart', { bubbles: true, cancelable: true });
        Object.defineProperty(ev, 'dataTransfer', { value: dt, configurable: true });
        chrome.dispatchEvent(ev);
        return ev;
    };
    const press = (x, y) => chrome.dispatchEvent(new dom.window.MouseEvent('pointerdown', {
        bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y }));
    const move = (x, y) => dom.window.dispatchEvent(new dom.window.MouseEvent('pointermove', {
        bubbles: true, clientX: x, clientY: y }));
    const release = () => dom.window.dispatchEvent(
        new dom.window.MouseEvent('pointerup', { bubbles: true }));

    press(40, 8); move(40, 16);
    check('a DOWNWARD grab refuses the native drag, so the pull keeps the pointer',
          drag().defaultPrevented, true);
    release();

    press(40, 8); move(70, 10);
    check('a SIDEWAYS grab still starts the tab drag — C33 is untouched',
          drag().defaultPrevented, false);
    chrome.dispatchEvent(new dom.window.Event('dragend', { bubbles: true }));
    release();

    check('a dragstart with no press behind it is left alone',
          drag().defaultPrevented, false);
    chrome.dispatchEvent(new dom.window.Event('dragend', { bubbles: true }));

    // A COALESCED MOVE, which is the case the first version of the guard got
    // wrong. One `pointermove` may carry the whole 60px, and Blink delivers it
    // to script BEFORE starting the drag it crossed the threshold for — so a
    // `dragstart` still arrives after the promote has already fired. Clearing
    // the record on lift left that `dragstart` unrefused and began a tab drag
    // on the pane that had just floated out of the tile.
    const g = mountRenderer();
    g.chrome.dispatchEvent(new dom.window.MouseEvent('pointerdown', {
        bubbles: true, cancelable: true, button: 0, clientX: 40, clientY: 8 }));
    dom.window.dispatchEvent(new dom.window.MouseEvent('pointermove', {
        bubbles: true, clientX: 40, clientY: 68 }));
    check('a single coalesced move past the threshold still promotes',
          g.calls, [[g.leafId, 'promote']]);
    const after = new dom.window.Event('dragstart', { bubbles: true, cancelable: true });
    Object.defineProperty(after, 'dataTransfer', { value: dt, configurable: true });
    g.chrome.dispatchEvent(after);
    check('…and the dragstart that follows the promote is refused too',
          after.defaultPrevented, true);
    dom.window.dispatchEvent(new dom.window.MouseEvent('pointerup', { bubbles: true }));
}

console.log(failures === 0
    ? '\nall assertions passed\n'
    : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
