/**
 * BUG-0040 — EVERY FLEXDESK CONTEXT MENU STAYS INSIDE THE WINDOW.
 *
 * EcoSim's steady-state row menu has 101 items. The DataTable placed it at
 * `innerHeight - height - 8` with no clamp, so it opened at y=-2153 in a 761 px
 * window and its first items could not be reached; `.twm-context-menu` had no
 * max-height and no overflow, so it could not scroll either. `showContextMenu`
 * clamped the top at 0 and ran off the bottom instead.
 *
 *   §1  DataTable `contextMenuItems`, 100 items, right-clicked near the bottom:
 *       capped at the window's height less a margin, top >= 0, bottom inside
 *   §2  …and the keyboard reaches every item: the first has focus, End / Home /
 *       the wrapping arrows move and scroll the item into view, Enter chooses
 *   §3  showContextMenu, 100 items near the bottom: the same cap and placement;
 *       scrolling inside the menu does not close it; End scrolls into view
 *   §4  NotebookTabBar's tab menu in a short window: the same
 *   §5  flexdesk.css (and base.css): the menus scroll inside, border-box
 *
 * jsdom computes no layout, so a menu's box is stubbed: 24 px a row, capped by
 * its inline max-height, as a browser with flexdesk.css lays it out.
 *
 *     node tests/context_menu_viewport.test.mjs
 */
import { dataTableEnv } from './dt_env.mjs';
import { ruleBody } from './css_rules.mjs';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const T = await dataTableEnv('context menu viewport');
const { check, ok, section, mount, bodyRows, tick, document, window } = T;

const VH = 760;
const VW = 1200;
Object.defineProperty(window, 'innerHeight', { value: VH, configurable: true });
Object.defineProperty(window, 'innerWidth', { value: VW, configurable: true });

const ROW = 24;
const isMenu = (el) => el.classList?.contains('twm-context-menu') || el.classList?.contains('nb-context-menu');
const proto = window.Element.prototype;
const realRect = proto.getBoundingClientRect;
proto.getBoundingClientRect = function () {
    if (!isMenu(this)) return realRect.call(this);
    const natural = this.children.length * ROW + 10;
    const cap = parseFloat(this.style.maxHeight);
    const height = Number.isFinite(cap) ? Math.min(natural, cap) : natural;
    const top = parseFloat(this.style.top) || 0;
    const left = parseFloat(this.style.left) || 0;
    return { x: left, y: top, left, top, width: 200, height, right: left + 200, bottom: top + height };
};
const scrolledIntoView = [];
proto.scrollIntoView = function (opts) { scrolledIntoView.push({ el: this, opts }); };

const key = (k) => document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown', {
    key: k, bubbles: true, cancelable: true,
}));
/** An item's label: its icon ligature and text, whitespace dropped. */
const labelOf = (el) => (el?.textContent || '').replace(/\s+/g, '');

/** Top, bottom and cap of a placed menu. */
function geometry(menu) {
    const r = menu.getBoundingClientRect();
    return { top: parseFloat(menu.style.top), bottom: parseFloat(menu.style.top) + r.height,
             maxHeight: parseFloat(menu.style.maxHeight), natural: menu.children.length * ROW + 10 };
}
function inWindow(name, menu) {
    const g = geometry(menu);
    ok(`${name}: the menu is longer than the window (${g.natural} px)`, g.natural > VH);
    ok(`${name}: capped at the window's height less a margin (${g.maxHeight})`,
       g.maxHeight > 0 && g.maxHeight <= VH - 8);
    ok(`${name}: its top is at or below the window's top (${g.top})`, g.top >= 0);
    ok(`${name}: its bottom is at or above the window's bottom (${g.bottom})`, g.bottom <= VH);
}

const items100 = Array.from({ length: 100 }, (_, i) => ({ label: `Item ${i}`, icon: 'bolt', action: `a${i}` }));

section('§1 DataTable contextMenuItems: 100 items stay inside the window');
const chosen = [];
const { host, table } = mount({
    headers: ['Id', 'Name'],
    rows: [['r1', 'Alpha'], ['r2', 'Bravo']],
    copyable: false,
    contextMenuItems: items100,
    onContextMenuAction: (action) => chosen.push(action),
});
const cell = bodyRows(host)[1].children[1];
cell.focus?.();
cell.dispatchEvent(new window.MouseEvent('contextmenu', {
    bubbles: true, cancelable: true, button: 2, clientX: 300, clientY: 700,
}));
await tick();
const dtMenu = [...document.querySelectorAll('.data-context-menu')].find((m) => m.style.display !== 'none');
ok('the menu is up', !!dtMenu);
inWindow('DataTable', dtMenu);

section('§2 DataTable: the keyboard reaches every item');
check('the first item has focus', labelOf(document.activeElement), 'boltItem0');
scrolledIntoView.length = 0;
key('End');
check('End: the last item', labelOf(document.activeElement), 'boltItem99');
ok('…scrolled into view in the menu',
   scrolledIntoView.some((c) => c.el === document.activeElement && c.opts?.block === 'nearest'));
key('Home');
check('Home: the first item', labelOf(document.activeElement), 'boltItem0');
key('ArrowUp');
check('ArrowUp from the first wraps to the last', labelOf(document.activeElement), 'boltItem99');
key('ArrowDown');
key('ArrowDown');
check('ArrowDown wraps and moves on', labelOf(document.activeElement), 'boltItem1');
key('Enter');
check('Enter chooses the focused item', chosen, ['a1']);
ok('…and the menu is hidden', dtMenu.style.display === 'none');
table.dispose();

section('§3 showContextMenu: 100 items near the bottom stay inside the window');
const { showContextMenu, hideContextMenu } = await import('../src/ui/components/context_menu.js');
showContextMenu(300, 700, items100, () => {});
let menu = document.querySelector('.ea-context-menu');
ok('the menu is up', !!menu);
inWindow('showContextMenu', menu);
menu.dispatchEvent(new window.Event('scroll'));
ok('scrolling inside the menu does not close it', menu.isConnected);
scrolledIntoView.length = 0;
key('End');
check('End: the last item', labelOf(document.activeElement), 'boltItem99');
ok('…scrolled into view in the menu',
   scrolledIntoView.some((c) => c.el === document.activeElement && c.opts?.block === 'nearest'));
document.dispatchEvent(new window.Event('scroll'));
ok('a scroll elsewhere still closes it', !menu.isConnected);
hideContextMenu();

section('§4 NotebookTabBar: the tab menu in a short window');
Object.defineProperty(window, 'innerHeight', { value: 120, configurable: true });
const { NotebookTabBar } = await import('../src/editor/notebook_tab_bar.js');
const strip = document.createElement('div');
document.body.appendChild(strip);
const bar = new NotebookTabBar();
bar.mount(strip, {});
bar.update([{ filePath: 'a.md', name: 'a.md' }, { filePath: 'b.md', name: 'b.md' }], 'a.md');
const tab = strip.querySelector('.tab');
tab.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 50, clientY: 100 }));
menu = document.querySelector('.nb-context-menu');
ok('the menu is up', !!menu);
{
    const g = geometry(menu);
    ok(`the menu is longer than the window (${g.natural} px)`, g.natural > 120);
    ok(`capped at the window's height less a margin (${g.maxHeight})`, g.maxHeight > 0 && g.maxHeight <= 112);
    ok(`its top is at or below the window's top (${g.top})`, g.top >= 0);
    ok(`its bottom is at or above the window's bottom (${g.bottom})`, g.bottom <= 120);
}
ok('the first item has focus', menu.contains(document.activeElement));
scrolledIntoView.length = 0;
key('End');
check('End: the last item', labelOf(document.activeElement).includes('RevealinExplorer'), true);
ok('…scrolled into view in the menu',
   scrolledIntoView.some((c) => c.el === document.activeElement && c.opts?.block === 'nearest'));
key('Escape');
ok('Escape closes it', !menu.isConnected);
bar.dispose();

section('§5 flexdesk.css: the menus scroll inside');
const sheets = [resolvePath(HERE, '../css/flexdesk.css'), resolvePath(HERE, '../css/base.css')];
if (existsSync(resolvePath(HERE, '../dist/flexdesk.css'))) sheets.push(resolvePath(HERE, '../dist/flexdesk.css'));
for (const file of sheets) {
    const body = ruleBody(readFileSync(file, 'utf8'), '.twm-context-menu, .nb-context-menu') || '';
    const name = file.slice(resolvePath(HERE, '..').length + 1);
    ok(`${name}: overflow-y: auto`, /overflow-y:\s*auto/.test(body));
    ok(`${name}: box-sizing: border-box`, /box-sizing:\s*border-box/.test(body));
    ok(`${name}: a max-height from a spacing token`, /max-height:\s*calc\(100vh - 2 \* var\(--space-md\)\)/.test(body));
}

T.done();
