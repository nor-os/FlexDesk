/**
 * A SHELL'S MENU BAR IN ITS OWN ROW UNDER THE TOP BAR (STORY-0119, 0.17.13).
 *
 * `.twm-global-menu-bar` is a full-width strip in body.twm-body's column:
 * top bar, menu row, host, bottom bar. It holds `chrome.menuBar` (the
 * `.twm-menubar` keeps its own styles). jsdom computes no layout, so this
 * holds the rules on the sheet's TEXT and the cascade jsdom does apply:
 *
 *   §1  the row's rules: a flex strip on FlexDesk tokens, in normal flow (no
 *       `position`, no `z-index`), and a fixed-size item of body.twm-body's
 *       column, so the host (flex 1 1 auto) shrinks by its height; base.css
 *       and overrides.css carry the same rules as flexdesk.css
 *   §2  in jsdom with flexdesk.css loaded: the markup the docs show, the row a
 *       sibling after the top bar and not inside it, and the cascade applied
 *   §3  the row is not part of the drag region: WindowChromeController bound
 *       to the top bar starts no drag from it, and its menus open on a click
 *   §4  a window on document.body is maximised below the row, not under it;
 *       with no row it is exactly where it was (under the 35px top bar)
 *
 *     node tests/menu_row_layout.test.mjs
 */
import { dataTableEnv } from './dt_env.mjs';
import { ruleBody, stripComments } from './css_rules.mjs';

const t = await dataTableEnv('menu row — layout');
const { check, ok, section, done, document, window, tick } = t;

const FLEX = t.css('flexdesk.css');
const BASE = t.css('base.css');
const OVER = t.css('overrides.css');
const TOKENS = t.css('tokens.css');

const decl = (body, prop) => {
    const m = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`).exec(body || '');
    return m ? m[1].trim() : null;
};
const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();

// ── §1 the rules ─────────────────────────────────────────────────────────
section('§1 the row is a strip on FlexDesk tokens in body.twm-body\'s column');
const ROW = '.twm-global-menu-bar';
const ITEM = 'body.twm-body > .twm-global-menu-bar';
const row = ruleBody(FLEX, ROW);
ok('flexdesk.css has a .twm-global-menu-bar rule', row);
check('it is a row', decl(row, 'display'), 'flex');
check('its bar is centred in it', decl(row, 'align-items'), 'center');
check('full width', decl(row, 'width'), '100%');
check('border-box, so its padding is inside the strip', decl(row, 'box-sizing'), 'border-box');
for (const prop of ['padding', 'background-color', 'color', 'border-top', 'border-bottom']) {
    const v = decl(row, prop);
    ok(`${prop} is on FlexDesk tokens (${v})`, v && /var\(--[\w-]+\)/.test(v) && !/#[0-9a-f]{3,8}\b|rgba?\(/i.test(v));
}
const used = [...(row || '').matchAll(/var\((--[\w-]+)\)/g)].map((m) => m[1]);
ok(`every token it reads is defined in tokens.css (${used.join(', ')})`,
   used.length && used.every((name) => new RegExp(`^\\s*${name}\\s*:`, 'm').test(TOKENS)));
check('in normal flow: no position (the top bar\'s legacy fixed does not apply)', decl(row, 'position'), null);
check('no z-index, so the top bar\'s dropdowns draw over it', decl(row, 'z-index'), null);
ok('no fixed height: it is the bar\'s height plus its padding and borders', !decl(row, 'height'));
// STORY-0122: a band of its own, set off from the top bar above and the host below
check('a band darker than the top bar', decl(row, 'background-color'), 'var(--surface-0)');
check('a border above it', decl(row, 'border-top'), '1px solid var(--border-strong)');
check('and one below it', decl(row, 'border-bottom'), '1px solid var(--border-strong)');
const item = ruleBody(FLEX, ITEM);
ok('body.twm-body places it', item);
check('…as a fixed-size item of the column', decl(item, 'flex'), '0 0 auto');
check('the host still takes the rest, so it shrinks by the row\'s height',
      decl(ruleBody(FLEX, 'body.twm-body > .twm-host'), 'flex'), '1 1 auto');
check('the body is still a column', decl(ruleBody(FLEX, 'body.twm-body'), 'flex-direction'), 'column');
check('base.css has the row rule, word for word', norm(ruleBody(BASE, ROW)), norm(row));
check('overrides.css has the column rule, word for word', norm(ruleBody(OVER, ITEM)), norm(item));
ok('no rule puts the row inside the top bar',
   !/\.twm-global-top-bar[^{},]*\.twm-global-menu-bar/.test(stripComments(FLEX)));
check('the top bar\'s rule is untouched (35px)', decl(ruleBody(FLEX, '.twm-global-top-bar'), 'height'), '35px');

// ── §2 the markup, with the stylesheet loaded ────────────────────────────
section('§2 the markup: top bar, then the menu row, then the host');
const style = document.createElement('style');
style.textContent = TOKENS + FLEX;
document.head.appendChild(style);
document.body.className = 'twm-body';
document.body.innerHTML = `
  <div class="twm-global-top-bar">
    <div class="twm-bar-left"><span class="brand">App</span></div>
    <div class="twm-bar-right"></div>
  </div>
  <div class="twm-global-menu-bar"><div id="menus"></div></div>
  <div class="twm-host"></div>
  <div class="twm-global-bottom-bar"><div class="twm-bar-right"></div></div>`;
const topBar = document.querySelector('.twm-global-top-bar');
const menuRow = document.querySelector('.twm-global-menu-bar');
const hostEl = document.querySelector('.twm-host');
check('the row comes right after the top bar', menuRow.previousElementSibling, topBar);
check('…and right before the host', menuRow.nextElementSibling, hostEl);
check('it is a child of the body, like the bars', menuRow.parentElement, document.body);
ok('it is not inside the top bar', !topBar.contains(menuRow));
const cs = window.getComputedStyle(menuRow);
check('the cascade makes it a flex row', cs.display, 'flex');
check('…a fixed-size item of the column', [cs.flexGrow, cs.flexShrink, cs.flexBasis].join(' '), '0 0 auto');
ok('…not positioned (static)', ['static', ''].includes(cs.position));
check('the top bar is still taken out of fixed positioning in the column',
      window.getComputedStyle(topBar).position, 'relative');

// ── §3 not part of the drag region; its menus work ──────────────────────
section('§3 the row is outside the top bar\'s drag region and its menus open');
const { createMenuBar } = await import('../src/ui/components/menu_bar.js');
const { WindowChromeController } = await import('../src/ui/controllers/window_chrome_controller.js');
const picked = [];
const bar = createMenuBar(document.getElementById('menus'), {
    menus: [{ id: 'file', label: 'File', items: [{ id: 'open', label: 'Open…' }] }],
    onAction: (id) => picked.push(id),
});
const calls = [];
const fakeWin = {
    chrome: () => Promise.resolve('custom'),
    minimize() {}, close() {},
    isMaximized: async () => false,
    setMaximized: async (on) => { calls.push(`setMaximized:${on}`); return on; },
    isFullscreen: async () => false,
    toggleFullscreen: async () => false,
    getBounds: async () => ({ x: 0, y: 0, width: 800, height: 600 }),
    setBounds() {},
    startNativeDrag: async () => { calls.push('startNativeDrag'); return true; },
    startNativeResize: async () => true,
};
const chrome = new WindowChromeController({ host: { window: fakeWin }, logger: { info() {}, warn() {} } });
check('custom chrome bound to the default top bar', await chrome.initialize(), true);
const POINTER = 'onpointerdown' in window;
const press = (el, init = {}) => el.dispatchEvent(new window.MouseEvent(POINTER ? 'pointerdown' : 'mousedown',
    { bubbles: true, cancelable: true, button: 0, clientX: 300, clientY: 10, ...init }));
press(topBar.querySelector('.brand'));
await tick(); await tick();
check('a press on the top bar drags the window', calls.splice(0), ['startNativeDrag']);
press(menuRow);
menuRow.dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true, cancelable: true }));
await tick(); await tick();
check('a press or double-click on the menu row\'s blank surface does not', calls.splice(0), []);
const title = menuRow.querySelector('.twm-menubar__title');
press(title);
title.click();
await tick(); await tick();
check('a click on a title opens its menu', title.getAttribute('aria-expanded'), 'true');
check('…and starts no drag', calls.splice(0), []);
const item0 = document.querySelector('.twm-menubar__menu .twm-menubar__item');
item0.click();
check('an item takes the click', picked, ['open']);
bar.dispose();
chrome.dispose?.();

// ── §4 a window on document.body stays below the row ─────────────────────
section('§4 a maximised window on the page stops under the row, not under the top bar');
const { ManagedWindow } = await import('../src/ui/components/managed_window.js');
Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 });
Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
globalThis.innerWidth = 1200;
globalThis.innerHeight = 800;
globalThis.localStorage ||= window.localStorage;
const ROW_H = 30;   // the bar (24) + padding (2 + 2) + the two borders (1 + 1)
menuRow.getBoundingClientRect = () => ({ x: 0, y: 35, left: 0, top: 35, right: 1200, bottom: 35 + ROW_H, width: 1200, height: ROW_H });
const maximised = (id) => {
    const w = new ManagedWindow({ id, title: id, content: document.createElement('div'),
                                  defaultWidth: 400, defaultHeight: 300 });
    w.show();
    w.toggleMaximize();
    const g = [w.y, w.height];
    w.close({ force: true });
    return g;
};
check('with the row: top at 35 + the row\'s height, height the rest above the bottom bar',
      maximised('with-row'), [35 + ROW_H, 800 - 35 - ROW_H - 22]);
menuRow.remove();
check('without a row: exactly as before (35, innerHeight - 35 - 22)', maximised('no-row'), [35, 800 - 35 - 22]);

done();
process.exit(0);
