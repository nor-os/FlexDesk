/**
 * ══ A NOTIFICATION CAN BE COPIED (STORY-0131) ═══════════════════════════════
 *
 *   §1  right-clicking a toast opens the context menu with "Copy message" and
 *       takes the right-click (no native menu); the item copies the title, the
 *       message and the description, one per line, through the clipboard API
 *   §2  a toast without a title or description copies what it has
 *   §3  right-clicking a history entry does the same, the popover stays
 *       open while the menu is used, and Escape closes the menu alone
 *   §4  the text is selectable: the sheets give it `user-select: text`, a
 *       click that ends a selection in a toast does not close it, and neither
 *       does a click or double-click on its text; a click on its chrome does
 *
 *     node tests/notification_copy.test.mjs
 *
 * jsdom is borrowed from the sibling Tables checkout. Absent, this SKIPS loudly.
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

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
    console.log('notification copy: SKIPPED — needs jsdom '
        + '(`cd ../Tables/web && npm install`, or `npm i -D jsdom` here)');
    process.exit(0);
}

const dom = new JSDOM(`<!doctype html><body>
  <div class="twm-global-bottom-bar"><div class="twm-bar-right"></div></div></body>`,
  { url: 'http://localhost/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent']) {
    if (globalThis[key] === undefined) globalThis[key] = dom.window[key];
}
const copied = [];
Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { clipboard: { writeText: (text) => { copied.push(text); return Promise.resolve(); } } },
});
console.warn = () => {};
console.error = ((orig) => (...args) => { if (String(args[0]).startsWith('  FAIL')) orig(...args); })(console.error);

const { NotificationCenter } = await import('../src/ui/notification_center.js');
const { NotificationHistory } = await import('../src/ui/components/notification_history.js');
const { EventBus } = await import('../src/core/event_bus.js');

let failures = 0;
function ok(what, cond, why = '') {
    if (cond) { console.log(`  ok   ${what}`); return; }
    failures++;
    console.error(`  FAIL ${what}${why ? `\n       ${why}` : ''}`);
}
const wait = (ms = 0) => new Promise((r) => setTimeout(r, ms));
function rightClick(el) {
    const ev = new dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 40, clientY: 40 });
    el.dispatchEvent(ev);
    return ev;
}
function realClick(el, detail = 1) {
    for (const type of ['mousedown', 'mouseup', 'click']) {
        el.dispatchEvent(new dom.window.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, detail }));
    }
}
const escape = () => document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
const menu = () => document.querySelector('.twm-context-menu');
const menuLabels = () => [...(menu()?.querySelectorAll('[role="menuitem"]') ?? [])].map((b) => b.lastElementChild.textContent);

function fresh() {
    document.getElementById('notification-center-root')?.remove();
    const bus = new EventBus();
    const nc = new NotificationCenter({ eventBus: bus });
    nc.mount(document.body);
    return { bus, nc };
}

console.log('§1 right-click a toast > Copy message');
{
    const { nc } = fresh();
    copied.length = 0;
    nc.show({ title: 'Run failed', message: 'Solver diverged', description: 'at t = 12.5', persistent: true });
    const toast = document.querySelector('.twm-notification');
    const ev = rightClick(toast.querySelector('.twm-notification__body'));
    ok('the right-click is taken (no native menu)', ev.defaultPrevented);
    ok('the context menu opens with "Copy message"', JSON.stringify(menuLabels()) === '["Copy message"]',
       JSON.stringify(menuLabels()));
    realClick(menu().querySelector('[role="menuitem"]'));
    await wait();
    ok('title, message and description are copied, one per line',
       copied[0] === 'Run failed\nSolver diverged\nat t = 12.5', JSON.stringify(copied));
    ok('the menu closes', !menu());
    ok('the toast stays', document.querySelector('.twm-notification') === toast);
    nc.dispose();
}

console.log('§2 what a toast has is what is copied');
{
    const { nc } = fresh();
    copied.length = 0;
    nc.show({ message: 'Saved', persistent: true });
    rightClick(document.querySelector('.twm-notification'));
    realClick(menu().querySelector('[role="menuitem"]'));
    await wait();
    ok('a message alone is copied alone', copied[0] === 'Saved', JSON.stringify(copied));
    nc.dispose();
}

console.log('§3 right-click a history entry > Copy message');
{
    const { bus, nc } = fresh();
    copied.length = 0;
    const bell = new NotificationHistory({ notificationCenter: nc, eventBus: bus });
    bell.mount();
    nc.warn('Disk', 'Almost full');
    nc.dismiss(nc.history[0].id);
    realClick(bell.triggerEl);
    const item = document.querySelector('.twm-notification-history__item');
    ok('the popover lists the entry', !!item);
    const ev = rightClick(item.querySelector('.twm-notification-history__item-body'));
    ok('the right-click is taken (no native menu)', ev.defaultPrevented);
    ok('the context menu opens with "Copy message"', JSON.stringify(menuLabels()) === '["Copy message"]',
       JSON.stringify(menuLabels()));
    realClick(menu().querySelector('[role="menuitem"]'));
    await wait();
    ok('the entry\'s title and message are copied', copied[0] === 'Disk\nAlmost full', JSON.stringify(copied));
    ok('the popover stays open while its menu is used', !!document.querySelector('.twm-notification-history__panel'));
    rightClick(item.querySelector('.twm-notification-history__item-body'));
    escape();
    ok('Escape closes the open menu', !menu());
    ok('... and leaves the popover open', !!document.querySelector('.twm-notification-history__panel'));
    escape();
    ok('the next Escape closes the popover', !document.querySelector('.twm-notification-history__panel'));
    bell.unmount();
    nc.dispose();
}

console.log('§4 the text is selectable');
{
    const { nc } = fresh();
    nc.show({ title: 'T', message: 'Select me', persistent: true });
    const toast = document.querySelector('.twm-notification');
    const body = toast.querySelector('.twm-notification__body');
    const sel = document.getSelection();
    sel.removeAllRanges();
    const range = document.createRange();
    range.selectNodeContents(body);
    sel.addRange(range);
    realClick(body);
    ok('a click that ends a selection does not close the toast', document.querySelector('.twm-notification') === toast);
    sel.removeAllRanges();
    realClick(body, 1);
    realClick(body, 2);
    ok('a click and a double-click on the text do not close it', document.querySelector('.twm-notification') === toast);
    realClick(toast.querySelector('.twm-notification__title'));
    ok('... nor does a click on the title', document.querySelector('.twm-notification') === toast);
    realClick(toast);
    ok('a plain click on the chrome still closes it', !document.querySelector('.twm-notification'));
    nc.dispose();

    for (const sheet of ['base.css', 'flexdesk.css']) {
        const css = readFileSync(resolvePath(HERE, '../css', sheet), 'utf8');
        const rule = css.match(/([^{}]*)\{\s*user-select: text;\s*cursor: text;\s*\}/g)
            ?.find((r) => r.includes('.twm-notification__body')) ?? '';
        const selectors = ['.twm-notification__title', '.twm-notification__body', '.twm-notification__description',
            '.twm-notification-history__item-title', '.twm-notification-history__item-body'];
        ok(`${sheet}: the toast and history text is user-select: text`, selectors.every((s) => rule.includes(s)), rule);
    }
}

console.log(failures ? `\n${failures} FAILED` : '\nnotification copy: all assertions passed');
process.exit(failures ? 1 : 0);
