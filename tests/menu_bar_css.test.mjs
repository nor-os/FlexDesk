/**
 * THE MENU BAR IS STYLED BY FLEXDESK ITSELF (STORY-0030).
 *
 * `MenuBar` sets `twm-menubar`, `twm-menubar__title`, `twm-menubar__menu` and
 * the rest. jsdom applies no stylesheet, so this holds the contract on the
 * sheet's TEXT:
 *
 *   §1  a menu is `position: fixed` (the JS places it, so a clipped chrome strip
 *       does not cut it off), draws over managed windows, is opaque and scrolls
 *       when it is taller than the viewport; a checked item draws its mark
 *   §2  every class the bar sets — titles, menus, submenus, check and radio
 *       items, disabled items, separators, shortcuts, an empty submenu — has a
 *       rule in the MENU BAR section
 *   §3  every class a MENU BAR rule names is one the bar sets
 *   §4  base.css's MENU BAR section is flexdesk.css's (the hand-mirror)
 *
 *     node tests/menu_bar_css.test.mjs
 */
import { dataTableEnv } from './dt_env.mjs';
import { ruleBody, stripComments } from './css_rules.mjs';

const t = await dataTableEnv('menu bar — css');
const { check, ok, section, done, document, click, mouse } = t;
const { createMenuBar } = await import('../src/ui/components/menu_bar.js');

const OPEN = '/* ══ MENU BAR ';
const CLOSE = '/* ══ end MENU BAR ══ */';
const barSection = (sheet) => {
    const start = sheet.indexOf(OPEN);
    const end = sheet.indexOf(CLOSE);
    return start >= 0 && end > start ? sheet.slice(start, end + CLOSE.length) : null;
};
const FLEX = barSection(t.css('flexdesk.css'));
const BASE = barSection(t.css('base.css'));
ok('flexdesk.css has a MENU BAR section', FLEX);
ok('base.css has a MENU BAR section', BASE);
const CSS = stripComments(FLEX || '');

const decl = (body, prop) => {
    const m = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`).exec(body || '');
    return m ? m[1].trim() : null;
};

// ── §1 the menu surface ───────────────────────────────────────────────────
section('§1 a fixed, opaque menu over the windows');
const menuRule = ruleBody(CSS, '.twm-menubar__menu');
ok('.twm-menubar__menu has a rule', menuRule);
check('menu position', decl(menuRule, 'position'), 'fixed');
check('menu draws over managed windows', decl(menuRule, 'z-index'), 'var(--z-over-windows)');
ok('menu is opaque', /^var\(--surface-/.test(decl(menuRule, 'background') || ''));
check('menu scrolls when it is too tall', decl(menuRule, 'overflow-y'), 'auto');
ok('menu height is bounded by the viewport', /100vh/.test(decl(menuRule, 'max-height') || ''));
check('the bar is a row', decl(ruleBody(CSS, '.twm-menubar'), 'display'), 'flex');
ok('a checked check item draws a mark',
   decl(ruleBody(CSS, '.twm-menubar__item--check[aria-checked="true"] .twm-menubar__check::before'), 'content'));
ok('a checked radio item draws a mark',
   decl(ruleBody(CSS, '.twm-menubar__item--radio[aria-checked="true"] .twm-menubar__check::before'), 'content'));
ok('a disabled item is dimmed', decl(ruleBody(CSS, '.twm-menubar__item--disabled'), 'opacity'));

// ── mount the bar in every state, collecting each class it sets ───────────
const host = document.createElement('div');
document.body.appendChild(host);
const bar = createMenuBar(host, {
    menus: [
        { id: 'file', label: 'File', items: [
            { id: 'open', label: 'Open', shortcut: 'Ctrl+O' },
            { separator: true },
            { id: 'save', label: 'Save', disabled: true },
            { id: 'recent', label: 'Recent', submenu: () => [] },
            { id: 'export', label: 'Export', submenu: [{ id: 'csv', label: 'CSV' }] },
        ] },
        { id: 'view', label: 'View', items: [
            { id: 'grid', label: 'Grid', checked: true },
            { id: 'light', label: 'Light', radio: 'theme', checked: true },
            { id: 'dark', label: 'Dark', radio: 'theme', checked: false },
        ] },
    ],
});
const seen = new Set();
const harvest = () => {
    for (const n of [host, ...host.querySelectorAll('*')]) for (const c of n.classList) seen.add(c);
};
const item = (name) => [...host.querySelectorAll('.twm-menubar__item')]
    .find((b) => b.querySelector('.twm-menubar__label')?.textContent === name);
harvest();                                           // the bar, closed
click(host.querySelector('.twm-menubar__title'));
harvest();                                           // File open
mouse('mouseover', item('Recent'));
harvest();                                           // an empty function submenu
mouse('mouseover', item('Export'));
harvest();                                           // a static submenu
click(host.querySelectorAll('.twm-menubar__title')[1]);
harvest();                                           // View: check and radio items
bar.dispose();

const set = [...seen].filter((c) => c.startsWith('twm-menubar'));
const ruled = new Set();
for (const m of CSS.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
    for (const c of m[1].matchAll(/\.(-?[A-Za-z_][A-Za-z0-9_-]*)/g)) ruled.add(c[1]);
}

// ── §2 every class the bar sets has a rule ────────────────────────────────
section('§2 every class the bar sets has a rule');
ok('the harvest found the bar\'s classes', set.length >= 15);
for (const c of set.sort()) ok(`.${c} has a rule`, ruled.has(c));

// ── §3 every class a rule names is one the bar sets ───────────────────────
section('§3 every class a MENU BAR rule names is one the bar sets');
for (const c of [...ruled].sort()) ok(`.${c} is set by the bar`, seen.has(c));

// ── §4 the hand-mirror ────────────────────────────────────────────────────
section('§4 the hand-mirror');
check('base.css carries the same MENU BAR section, byte for byte', BASE, FLEX);

done();
