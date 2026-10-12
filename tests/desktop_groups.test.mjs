/**
 * ══ C40. DESKTOP GROUPS AND FIXED DESKTOPS ═════════════════════════════════
 *
 * An embedder that keeps desktops of its own (Tables: one per page, under a
 * "Workbench" group) beside the ones a user makes:
 *
 *   §1  ungrouped, the bar's markup is what it always was
 *   §2  a group is one chip, labelled by the group, that goes back to the
 *       member last on screen; a user's desktops are a chip each
 *   §3  a fixed desktop: no rename, no delete, never a "Move to" target, and
 *       `removeDesktop` / `moveFocusedToDesktop` refuse it
 *   §4  `+` numbers among the user's desktops; `switchOnAdd` puts it on screen
 *   §5  Ctrl+Left/Right steps between chips, a group being one stop
 *   §6  group and fixed survive serialize → deserialize
 *   §7  moving a pane carries all its tabs and joins the target's, replacing
 *       only a target still holding its seed
 *   §8  dispose removes the bar, so a rebuilt shell paints a fresh one
 *
 *     node tests/desktop_groups.test.mjs
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
    console.log('desktop groups: SKIPPED — needs jsdom '
        + '(`cd ../Tables/web && npm install`, or `npm i -D jsdom` here)');
    process.exit(0);
}

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
if (globalThis.PointerEvent === undefined) globalThis.PointerEvent = dom.window.MouseEvent;
if (globalThis.ResizeObserver === undefined) {
    globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
}
// jsdom has no `CSS.escape`; a browser does, and `NotebookTabBar`'s rename
// reads it on a double-click.
if (globalThis.CSS === undefined) {
    globalThis.CSS = { escape: (s) => String(s).replace(/["\\]/g, '\\$&') };
}


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

const { createTaxonomy } = await import('../src/tiling/kind_taxonomy.js');
const { createShell } = await import('../src/tiling/shell.js');
const { createEntityCatalog } = await import('../src/tiling/entity_sources.js');
const { DesktopManager } = await import('../src/tiling/desktops.js');

function realClick(el) {
    const opts = { bubbles: true, cancelable: true, button: 0 };
    el.dispatchEvent(new dom.window.MouseEvent('mousedown', opts));
    el.dispatchEvent(new dom.window.MouseEvent('mouseup', opts));
    el.dispatchEvent(new dom.window.MouseEvent('click', opts));
}
function rightClick(el) {
    el.dispatchEvent(new dom.window.MouseEvent('contextmenu',
        { bubbles: true, cancelable: true, button: 2, clientX: 10, clientY: 10 }));
}
const menuLabels = () => [...dom.window.document.querySelectorAll('.twm-context-menu-item')]
    .map((row) => row.textContent.trim().replace(/^\S+\s+/, ''));
const closeMenus = () => dom.window.document.querySelectorAll('.twm-context-menu')
    .forEach((m) => m.remove());

async function mount({ desktopBar } = {}) {
    const sroot = dom.window.document.createElement('div');
    const bar = dom.window.document.createElement('div');
    dom.window.document.getElementById('root').append(bar, sroot);
    const shell = await createShell({
        root: sroot,
        entities: createEntityCatalog({ sources: [] }),
        taxonomy: createTaxonomy({
            kinds: { home: { label: 'Home' }, table: { label: 'Table', topNav: 'home' } },
            root: 'home' }),
        content: {
            home: (host) => { host.textContent = 'ground'; return {}; },
            table: (host, ctx) => { host.textContent = `table ${ctx?.props?.id ?? ''}`; return {}; },
        },
        panels: { left: false, right: false, bottom: false },
        chrome: { desktops: bar },
        ...(desktopBar ? { desktopBar } : {}),
    });
    const chips = () => [...bar.querySelectorAll('[data-desktop]')]
        .filter((b) => b.dataset.desktop !== '+');
    return { shell, wm: shell.wm, bar, chips,
             plus: () => bar.querySelector('[data-desktop="+"]') };
}

/** Three "pages" under a fixed Workbench group, the way Tables marks them. */
function makeWorkbench(wm) {
    wm.desktops.ensureCount(3);
    wm.desktops.desktops.forEach((d, i) => {
        d.label = `Page ${i + 1}`; d.group = 'Workbench'; d.fixed = true;
    });
    wm._notifyChange();
}

// ── §1 ──────────────────────────────────────────────────────────────────
{
    const { shell, wm, chips } = await mount();
    wm.addDesktop();
    wm._notifyChange();
    check('§1 ungrouped: a chip per desktop', chips().map((c) => c.textContent.trim()), ['1', '2']);
    check('§1 …with the Alt+N title it always had', chips()[1].title,
          'Desktop 2 (Alt+2) · right-click to delete');
    check('§1 …and no fixed marks', chips().filter((c) => c.dataset.desktopFixed).length, 0);
    shell.dispose();
}

// ── §2, §3, §4 ──────────────────────────────────────────────────────────
{
    const { shell, wm, chips, plus } = await mount({ desktopBar: { switchOnAdd: true } });
    makeWorkbench(wm);
    check('§2 one chip for the group', chips().map((c) => c.textContent.trim()), ['Workbench']);

    realClick(plus());
    check('§4 `+` numbers among the user\'s desktops', wm.desktops.active().label, '1');
    check('§4 switchOnAdd: the new desktop is on screen', wm.desktops.activeIdx, 3);
    check('§2 …and has a chip of its own', chips().map((c) => c.textContent.trim()), ['Workbench', '1']);
    check('§2 its chip is the lit one', chips()[1].classList.contains('twm-desk__btn--on'), true);

    wm.switchDesktop(2);
    wm.switchDesktop(3);
    check('§2 the group chip goes back to the member last on screen', chips()[0].dataset.desktop, '2');
    realClick(chips()[0]);
    check('§2 …and clicking it lands there', wm.desktops.activeIdx, 2);

    rightClick(chips()[0]);
    check('§3 a group chip offers no rename and no delete', menuLabels(),
          ['Switch to Workbench', 'New desktop']);
    closeMenus();
    rightClick(chips()[1]);
    check('§3 a user\'s chip offers both', menuLabels(),
          ['Switch to 1', 'Rename…', 'New desktop', 'Delete desktop']);
    closeMenus();

    check('§3 removeDesktop refuses a fixed desktop', wm.removeDesktop(0), false);
    check('§3 …and leaves it', wm.desktops.desktops.length, 4);

    // The tile menu, on a page: only the user's desktop is a destination.
    wm.switchDesktop(1);
    const leafId = wm.desktops.active().tree.primaryLeafId();
    shell.wm.renderer.render();
    const chrome = shell.root.querySelector(`[data-leaf-id="${leafId}"] .twm-leaf__chrome`)
        || shell.root.querySelector('.twm-leaf__chrome');
    rightClick(chrome);
    const moves = menuLabels().filter((l) => l.startsWith('Move to desktop'));
    check('§3 the tile menu never offers a fixed desktop', moves, ['Move to desktop 1']);
    closeMenus();

    wm.moveFocusedToDesktop(0);
    check('§3 moveFocusedToDesktop refuses a fixed target',
          wm.desktops.desktops[1].tree.leaves().length > 0
          && wm.desktops.desktops[0].tree.leaves().every((l) => l.content?.kind === 'home'), true);

    // ── §5 ──
    wm.switchDesktop(0);
    wm.cycleDesktop(1);
    check('§5 Ctrl+Right from the group steps to the next chip', wm.desktops.activeIdx, 3);
    wm.cycleDesktop(1);
    check('§5 …and wraps to the group, at its member last on screen', wm.desktops.activeIdx, 0);
    shell.dispose();
}

// ── §8: a rebuilt shell does not inherit the old bar's listeners ────────
{
    const first = await mount();
    const host = first.bar;
    first.shell.dispose();
    check('§8 dispose takes the bar away', host.querySelector('#twm-desktops'), null);
}

// ── §6 ──────────────────────────────────────────────────────────────────
{
    const seed = () => ({ content: { kind: 'home', props: {} }, title: 'Home' });
    const m = new DesktopManager({ seed });
    m.ensureCount(2);
    m.desktops[0].group = 'Workbench'; m.desktops[0].fixed = true;
    const blob = m.serialize();
    check('§6 an ungrouped desktop serializes as it always did',
          Object.keys(blob.desktops[1]).sort(), ['id', 'label', 'panels', 'tree']);
    const back = DesktopManager.deserialize(JSON.parse(JSON.stringify(blob)), { seed });
    check('§6 group and fixed come back', [back.desktops[0].group, back.desktops[0].fixed,
                                          back.desktops[1].group, back.desktops[1].fixed],
          ['Workbench', true, null, false]);
}

// ── §7 ──────────────────────────────────────────────────────────────────
{
    const { shell, wm } = await mount();
    wm.addDesktop();                                  // 1: a blank desktop
    wm.addDesktop();                                  // 2: one with work on it
    const t0 = wm.desktops.desktops[0].tree;
    const p0 = t0.primaryLeafId();
    t0.setLeafContent(p0, { kind: 'table', props: { id: 'a' } }, 'A');
    t0.appendLeafTab(p0, { kind: 'table', props: { id: 'b' } }, 'B');
    t0.focus(p0);
    const t2 = wm.desktops.desktops[2].tree;
    t2.setLeafContent(t2.primaryLeafId(), { kind: 'table', props: { id: 'z' } }, 'Z');

    wm.moveFocusedToDesktop(1);
    const dest1 = wm.desktops.desktops[1].tree.get(wm.desktops.desktops[1].tree.primaryLeafId());
    check('§7 onto a blank desktop: every tab, the seed replaced',
          dest1.tabs.map((t) => t.props.id), ['a', 'b']);
    check('§7 …the active tab still active', dest1.activeTabIdx, 1);

    wm.switchDesktop(1);
    wm.desktops.active().tree.focus(dest1.id);
    wm.moveFocusedToDesktop(2);
    const dest2 = t2.get(t2.primaryLeafId());
    check('§7 onto a desktop with work: its tabs stay and the pane\'s join them',
          dest2.tabs.map((t) => t.props.id), ['z', 'a', 'b']);
    shell.dispose();
}

console.log(failures === 0
    ? '\nall assertions passed\n'
    : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
