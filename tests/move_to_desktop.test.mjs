/**
 * ══ BUG-0046 (SECOND HALF). ALT+SHIFT+N MUST NOT DESTROY OR MOVE WHAT THE MENU WOULD NOT ═══
 *
 * Making Alt+Shift+1..9 fire from a real keyboard (tests/keymap_digit_row.test.mjs)
 * put `wm.moveFocusedToDesktop` behind a key every layout can press, and that
 * method had only ever been reached through the tile menu, which hides three
 * things the method did not refuse:
 *
 *   - THE DESKTOP YOU ARE ON. Source and target are one tree, so the method
 *     appended the focused tile's tabs to the tree's primary tile and then
 *     closed the focused tile: the tile and its content were destroyed. A stray
 *     Shift on Alt+N is enough. (AZERTY's Alt+Shift+1, `key: "1"`, did it before
 *     BUG-0046 too; the keymap fix made it every layout's.)
 *   - A PANEL. The Navigator (or a right or bottom panel) was moved onto the
 *     target desktop and replaced that desktop's home ground with itself.
 *   - A FIXED DESKTOP, already refused (tests/desktop_groups.test.mjs §3).
 *
 * Every press here carries the `key` AND `code` a real keyboard sends (US
 * Alt+Shift+1 is key "!" on Digit1), in a real `createShell`.
 *
 *   §1  Alt+Shift+N on the desktop you are on changes nothing: one tile, the
 *       US and AZERTY spellings, and a desktop that is not the first
 *   §2  …with a|b split and b focused, b is not lost
 *   §3  …and the method itself refuses: it answers what any refused move does
 *   §4  a focused panel (left, right, bottom) is not moved and nothing on any
 *       desktop changes
 *   §5  a move to another desktop works as it did: every tab, a split, onto a
 *       desktop with work on it, back again, and onto a desktop not made yet
 *   §6  the tile menu still moves a tile, and does not offer the desktop you are on
 *   §7  the menu and the keyboard agree: for a content tile and each panel, over
 *       every desktop, a "Move to desktop N" row is offered exactly when the
 *       Alt+Shift+N press moves anything
 *
 *     node tests/move_to_desktop.test.mjs
 *
 * jsdom is borrowed from the sibling Tables checkout; without it this SKIPS,
 * and tests/run.mjs counts a SKIPPED suite as a failure.
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
    console.log('move to desktop: SKIPPED — needs jsdom '
        + '(`cd ../Tables/web && npm install`, or `npm i -D jsdom` here)');
    process.exit(0);
}

const dom = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/', pretendToBeVisual: true });
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
if (globalThis.CSS === undefined) {
    globalThis.CSS = { escape: (s) => String(s).replace(/["\\]/g, '\\$&') };
}

let failures = 0;
function ok(what, cond, why = '') {
    if (cond) { console.log(`  ok   ${what}`); return; }
    failures++;
    console.log(`  FAIL ${what}${why ? ` — ${why}` : ''}`);
}
function check(what, actual, expected) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    ok(what, a === e, `expected ${e}, got ${a}`);
}

const { createShell } = await import('../src/tiling/shell.js');
const { createTaxonomy } = await import('../src/tiling/kind_taxonomy.js');
const { createEntityCatalog } = await import('../src/tiling/entity_sources.js');

/** A keydown as a keyboard sends it: the character AND the key's position. */
const press = (init, target = document.body) => {
    const e = new window.KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(e);
    return e;
};
/** Alt+Shift+<n> as a US keyboard sends it: Shift turns the digit into a symbol. */
const US = (n) => ({ key: '!@#$%^&*('[n - 1], code: `Digit${n}`, altKey: true, shiftKey: true });
/** …and as a French AZERTY one does: Shift is what types the digit. */
const AZERTY = (n) => ({ key: String(n), code: `Digit${n}`, altKey: true, shiftKey: true });

async function mountShell({ panels = false, desktops = 2 } = {}) {
    document.body.innerHTML = '';
    const root = document.createElement('div');
    document.body.append(root);
    const shell = await createShell({
        root,
        entities: createEntityCatalog({ sources: [] }),
        taxonomy: createTaxonomy({
            kinds: { home: { label: 'Home' }, table: { label: 'Table', topNav: 'home' } },
            root: 'home' }),
        content: {
            home: (host) => { host.textContent = 'ground'; return {}; },
            table: (host, ctx) => { host.textContent = `table ${ctx?.props?.id ?? ''}`; return {}; },
        },
        panels: { left: panels, right: panels, bottom: panels },
    });
    const { wm } = shell;
    while (wm.desktops.desktops.length < desktops) wm.addDesktop();
    return { shell, wm, root };
}

const isPanel = (l) => String(l.content?.kind || '').startsWith('panel:');
const contentLeaves = (tree) => tree.leaves().filter((l) => !isPanel(l));
/** Make desktop `i`'s primary tile a table called `id`, and focus it. */
function fill(wm, i, id) {
    const tree = wm.desktops.desktops[i].tree;
    const leaf = tree.primaryLeafId();
    tree.setLeafContent(leaf, { kind: 'table', props: { id } }, id.toUpperCase());
    tree.focus(leaf);
    return leaf;
}
/** Everything the window manager would persist, plus which desktop is on screen. */
const snap = (wm) => JSON.stringify([wm.desktops.activeIdx, wm.desktops.serialize()]);
/** What each desktop shows, content tiles only: `a+b` is one tile with two tabs. */
const where = (wm) => wm.desktops.desktops.map((d) => contentLeaves(d.tree)
    .map((l) => (Array.isArray(l.tabs) && l.tabs.length ? l.tabs : [l.content])
        .map((t) => t.props?.id ?? t.kind).join('+')).join('|'));

const rightClick = (el) => el.dispatchEvent(new window.MouseEvent('contextmenu',
    { bubbles: true, cancelable: true, button: 2, clientX: 10, clientY: 10 }));
const menuRows = () => [...document.querySelectorAll('.twm-context-menu-item')];
const closeMenus = () => document.querySelectorAll('.twm-context-menu').forEach((m) => m.remove());
const chromeOf = (root, leafId) => root.querySelector(`[data-leaf-id="${leafId}"] .twm-leaf__chrome`);
const moveRows = () => menuRows().map((r) => r.textContent.trim().replace(/^\S+\s+/, ''))
    .filter((l) => l.startsWith('Move to desktop'));

// ── §1 ───────────────────────────────────────────────────────────────────
console.log('§1 Alt+Shift+N on the desktop you are on changes nothing');
{
    const { shell, wm } = await mountShell();
    const leaf = fill(wm, 0, 'a');
    wm.renderer.render();
    const before = snap(wm);
    ok('before: desktop 1 shows the table, desktop 2 shows none', where(wm).join(' / ') === 'a / home',
       where(wm).join(' / '));

    press(US(1));
    ok('US Alt+Shift+1 (key "!") on desktop 1: nothing changed', snap(wm) === before);
    check('…the tile is still on desktop 1', where(wm), ['a', 'home']);
    ok('…and is still the focused one', wm.desktops.desktops[0].tree.focusedLeafId === leaf);

    press(AZERTY(1));
    ok('AZERTY Alt+Shift+1 (key "1"): nothing changed', snap(wm) === before);
    check('…the tile is still on desktop 1', where(wm), ['a', 'home']);
    shell.dispose();
}
{
    const { shell, wm } = await mountShell({ desktops: 3 });
    fill(wm, 2, 'c');
    wm.switchDesktop(2);
    const before = snap(wm);
    press(US(3));
    ok('US Alt+Shift+3 (key "#") on desktop 3: nothing changed', snap(wm) === before);
    check('…the tile is still on desktop 3', where(wm), ['home', 'home', 'c']);
    shell.dispose();
}

// ── §2 ───────────────────────────────────────────────────────────────────
console.log('§2 …with a|b split and b focused, b is not lost');
{
    const { shell, wm } = await mountShell();
    const tree = wm.desktops.desktops[0].tree;
    fill(wm, 0, 'a');
    wm.split('h');
    const second = tree.leaves().find((l) => l.content?.kind !== 'table');
    tree.setLeafContent(second.id, { kind: 'table', props: { id: 'b' } }, 'B');
    tree.focus(second.id);
    wm.renderer.render();
    check('before: a and b share desktop 1', where(wm), ['a|b', 'home']);
    const before = snap(wm);

    press(US(1));
    ok('Alt+Shift+1 on desktop 1: nothing changed', snap(wm) === before);
    check('…a and b are both still on desktop 1', where(wm), ['a|b', 'home']);
    ok('…and b is still focused', tree.focusedLeafId === second.id);
    shell.dispose();
}

// ── §3 ───────────────────────────────────────────────────────────────────
console.log('§3 …and the method itself refuses, as any refused move does');
{
    const { shell, wm } = await mountShell();
    fill(wm, 0, 'a');
    const before = snap(wm);
    const sameDesktop = wm.moveFocusedToDesktop(0);
    ok('moveFocusedToDesktop(the active desktop) changes nothing', snap(wm) === before);
    check('…and answers undefined, like the refusal of a fixed target', sameDesktop, undefined);

    wm.desktops.desktops[1].fixed = true;
    const fixedBefore = snap(wm);
    const toFixed = wm.moveFocusedToDesktop(1);
    ok('a fixed target is refused the same way', snap(wm) === fixedBefore && toFixed === sameDesktop);
    shell.dispose();
}

// ── §4 ───────────────────────────────────────────────────────────────────
console.log('§4 a focused panel is not moved, whichever panel it is');
for (const side of ['left', 'right', 'bottom']) {
    const { shell, wm } = await mountShell({ panels: true });
    fill(wm, 0, 'a');
    const tree = wm.desktops.desktops[0].tree;
    const panel = tree.leaves().find((l) => l.content?.kind === `panel:${side}`);
    ok(`panel:${side} is on desktop 1`, !!panel);
    if (!panel) { shell.dispose(); continue; }
    tree.focus(panel.id);
    const before = snap(wm);
    const target = wm.desktops.desktops[1].tree.leaves().map((l) => l.content?.kind);

    const e = press(US(2));
    ok(`Alt+Shift+2 with panel:${side} focused: nothing on any desktop changed`, snap(wm) === before);
    check('…desktop 2 still shows only its own ground',
          wm.desktops.desktops[1].tree.leaves().map((l) => l.content?.kind), target);
    ok('…and the press was still the keymap\'s (prevented, not left to the page)', e.defaultPrevented);

    wm.switchDesktop(1);
    check('…and once shown, desktop 2 still has its home ground',
          contentLeaves(wm.desktops.active().tree).map((l) => l.content?.kind), ['home']);
    shell.dispose();
}
{
    const { shell, wm } = await mountShell({ panels: true });
    const tree = wm.desktops.desktops[0].tree;
    tree.focus(tree.leaves().find((l) => isPanel(l)).id);
    const before = snap(wm);
    check('the method answers undefined for a panel', wm.moveFocusedToDesktop(1), undefined);
    ok('…and changes nothing', snap(wm) === before);
    shell.dispose();
}

// ── §5 ───────────────────────────────────────────────────────────────────
console.log('§5 a move to another desktop works as it did');
{
    const { shell, wm } = await mountShell();
    fill(wm, 0, 'a');
    const e = press(US(2));
    ok('US Alt+Shift+2 is prevented', e.defaultPrevented);
    check('the tile is on desktop 2 and desktop 1 has its ground back', where(wm), ['home', 'a']);
    check('the move did not switch desktops', wm.desktops.activeIdx, 0);
    shell.dispose();
}
{
    const { shell, wm } = await mountShell();
    const tree = wm.desktops.desktops[0].tree;
    const leaf = fill(wm, 0, 'a');
    tree.appendLeafTab(leaf, { kind: 'table', props: { id: 'b' } }, 'B');
    tree.setActiveLeafTab(leaf, 1);
    tree.focus(leaf);
    press(US(2));
    const t1 = wm.desktops.desktops[1].tree;
    const dest = t1.get(t1.primaryLeafId());
    check('a pane with two tabs arrives with both, in order', dest.tabs.map((t) => t.props.id), ['a', 'b']);
    check('…the active tab still active', dest.activeTabIdx, 1);
    shell.dispose();
}
{
    const { shell, wm } = await mountShell();
    const tree = wm.desktops.desktops[0].tree;
    fill(wm, 0, 'a');
    wm.split('h');
    const second = tree.leaves().find((l) => l.content?.kind !== 'table');
    tree.setLeafContent(second.id, { kind: 'table', props: { id: 'b' } }, 'B');
    tree.focus(second.id);
    press(US(2));
    check('b of a|b moves, a stays', where(wm), ['a', 'b']);
    shell.dispose();
}
{
    const { shell, wm } = await mountShell();
    fill(wm, 0, 'a');
    fill(wm, 1, 'z');
    wm.desktops.desktops[0].tree.focus(wm.desktops.desktops[0].tree.primaryLeafId());
    press(US(2));
    check('onto a desktop with work: its tab stays and the pane\'s joins it', where(wm), ['home', 'z+a']);

    wm.switchDesktop(1);
    press(AZERTY(1));
    check('…and Alt+Shift+1 from desktop 2 brings the pane back to desktop 1', where(wm), ['z+a', 'home']);
    shell.dispose();
}
{
    const { shell, wm } = await mountShell();
    fill(wm, 0, 'a');
    press(US(3));
    check('onto a desktop that does not exist yet: it is made and gets the tile (unchanged)',
          [wm.desktops.desktops.length, where(wm)[2]], [3, 'a']);
    shell.dispose();
}

// ── §6 ───────────────────────────────────────────────────────────────────
console.log('§6 the tile menu still moves a tile');
{
    const { shell, wm, root } = await mountShell({ desktops: 3 });
    const leaf = fill(wm, 0, 'a');
    wm.renderer.render();
    rightClick(chromeOf(root, leaf));
    check('on desktop 1 the menu offers desktops 2 and 3, not the one it is on',
          moveRows(), ['Move to desktop 2', 'Move to desktop 3']);
    const row = menuRows().find((r) => r.textContent.includes('Move to desktop 3'));
    row.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
    closeMenus();
    check('picking desktop 3 moves the tile there', where(wm), ['home', 'home', 'a']);
    shell.dispose();
}

// ── §7 ───────────────────────────────────────────────────────────────────
console.log('§7 the menu and the keyboard agree about what can be moved');
{
    const DESKTOPS = 3;
    const ACTIVE = 1;
    for (const what of ['a content tile', 'panel:left', 'panel:right', 'panel:bottom']) {
        const row = [];
        for (let n = 1; n <= DESKTOPS; n++) {
            const { shell, wm, root } = await mountShell({ panels: true, desktops: DESKTOPS });
            wm.switchDesktop(ACTIVE);
            const tree = wm.desktops.active().tree;
            const leaf = what === 'a content tile'
                ? contentLeaves(tree)[0]
                : tree.leaves().find((l) => l.content?.kind === what);
            if (what === 'a content tile') {
                tree.setLeafContent(leaf.id, { kind: 'table', props: { id: 'a' } }, 'A');
            }
            wm.renderer.render();
            rightClick(chromeOf(root, leaf.id));               // focuses it, as the user does
            const offered = moveRows().includes(`Move to desktop ${n}`);
            closeMenus();
            const before = snap(wm);
            press(US(n));
            row.push([n, offered, snap(wm) !== before]);
            shell.dispose();
        }
        ok(`${what}: "Move to desktop N" is offered exactly when Alt+Shift+N moves something`,
           row.every(([, offered, moved]) => offered === moved),
           row.map(([n, o, m]) => `${n}: offered=${o} moved=${m}`).join('; '));
        if (what === 'a content tile') {
            check('…for the tile that is every desktop but the one it is on',
                  row.map(([, offered]) => offered), [true, false, true]);
        } else {
            check('…for a panel that is no desktop at all', row.map(([, offered]) => offered), [false, false, false]);
        }
    }
}

if (failures) {
    console.log(`\nmove to desktop: ${failures} FAILED`);
    process.exit(1);
}
console.log('\nmove to desktop: all passed');
process.exit(0);
