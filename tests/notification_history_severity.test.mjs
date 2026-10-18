/**
 * ══ A HISTORY ENTRY IS COLOURED BY ITS SEVERITY (BUG-0019) ═════════════════
 *
 *   §1  each entry in the bell's popover carries
 *       `twm-notification-history__item--<severity>` — prefixed, like every
 *       other class FlexDesk emits (it used to be `notification-history__item--…`,
 *       which no stylesheet matched)
 *   §2  both stylesheets have a rule per severity: success green, warn amber,
 *       error and fatal red; info keeps the base blue
 *   §3  those rules win over the base item rule: same specificity, later in
 *       the sheet, and nothing after them resets the left border
 *
 *     node tests/notification_history_severity.test.mjs
 *
 * jsdom is borrowed from the sibling Tables checkout. Absent, this SKIPS loudly.
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { ruleBody, stripComments, specificity, compareSpecificity } from './css_rules.mjs';

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
    console.log('notification history severity: SKIPPED — needs jsdom '
        + '(`cd ../Tables/web && npm install`, or `npm i -D jsdom` here)');
    process.exit(0);
}

const dom = new JSDOM(`<!doctype html><body>
  <div class="twm-global-bottom-bar"><div class="twm-bar-right"></div></div></body>`,
  { url: 'http://localhost/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent']) {
    if (globalThis[key] === undefined) globalThis[key] = dom.window[key];
}

const { NotificationHistory } = await import('../src/ui/components/notification_history.js');
const { NotificationCenter } = await import('../src/ui/notification_center.js');
const { EventBus } = await import('../src/core/event_bus.js');

let failures = 0;
function ok(what, cond, why = '') {
    if (cond) { console.log(`  ok   ${what}`); return; }
    failures++;
    console.error(`  FAIL ${what}${why ? `\n       ${why}` : ''}`);
}
function realClick(el) {
    for (const type of ['mousedown', 'mouseup', 'click']) {
        el.dispatchEvent(new dom.window.MouseEvent(type, { bubbles: true, cancelable: true, button: 0 }));
    }
}

const ITEM = '.twm-notification-history__item';
const COLOURED = {
    success: 'var(--color-success, #3fb950)',
    warn: 'var(--color-warning, #ff9800)',
    error: 'var(--color-danger, #c74e4e)',
    fatal: 'var(--color-danger, #c74e4e)',
};

console.log('§1 the entries carry the prefixed severity class');
{
    const center = { history: [] };
    for (const severity of ['info', 'success', 'warn', 'error', 'fatal']) {
        center.history.push({ title: severity, message: `a ${severity}`, severity, timestamp: Date.now() });
    }
    center.history.push({ title: 'none', message: 'no severity', timestamp: Date.now() });
    const bell = new NotificationHistory({ notificationCenter: center, eventBus: new EventBus() });
    bell.mount();
    realClick(bell.triggerEl);
    const items = [...document.querySelectorAll(ITEM)];
    ok('one entry per notification', items.length === 6, `got ${items.length}`);
    for (const item of items) {
        const title = item.querySelector('.twm-notification-history__item-title').textContent;
        const want = title === 'none' ? 'info' : title;
        ok(`${title}: twm-notification-history__item--${want}`,
           item.classList.contains(`twm-notification-history__item--${want}`), item.className);
    }
    ok('no class without the twm- prefix', items.every((el) =>
        [...el.classList].every((c) => c.startsWith('twm-'))),
       items.map((el) => el.className).join(' | '));
    bell.unmount();
}

console.log('§1b from a real NotificationCenter: success, warn and error');
{
    const bus = new EventBus();
    const nc = new NotificationCenter({ eventBus: bus });
    nc.success('ok', 'saved');
    nc.warn('careful', 'slow');
    nc.error('broken', 'failed');
    ok('three in the history', nc.history.length === 3, String(nc.history.length));
    const bell = new NotificationHistory({ notificationCenter: nc, eventBus: bus });
    bell.mount();
    realClick(bell.triggerEl);
    const classes = [...document.querySelectorAll(ITEM)].map((el) => el.className);
    for (const severity of ['success', 'warn', 'error']) {
        ok(`a ${severity} toast is a --${severity} entry`,
           classes.some((c) => c.split(' ').includes(`twm-notification-history__item--${severity}`)),
           classes.join(' | '));
    }
    bell.unmount();
    nc.dispose();
}

for (const sheet of ['base.css', 'flexdesk.css']) {
    const css = readFileSync(resolvePath(HERE, '../css', sheet), 'utf8');
    console.log(`§2 ${sheet}: a border colour per severity`);
    const base = ruleBody(css, ITEM);
    ok('the base item rule is blue', !!base && /border-left:\s*3px solid #4fc1ff/.test(base), base);
    const bodies = {
        success: ruleBody(css, `${ITEM}--success`),
        warn: ruleBody(css, `${ITEM}--warn`),
        error: ruleBody(css, `${ITEM}--error, ${ITEM}--fatal`),
    };
    bodies.fatal = bodies.error;
    for (const [severity, colour] of Object.entries(COLOURED)) {
        const body = bodies[severity];
        ok(`--${severity}: border-left-color ${colour}`,
           !!body && body.replace(/\s+/g, ' ').includes(`border-left-color: ${colour}`), String(body));
    }
    ok('info has no rule of its own (keeps the base blue)', ruleBody(css, `${ITEM}--info`) === null);

    console.log(`§3 ${sheet}: the severity rules win`);
    const text = stripComments(css);
    const baseAt = text.search(/\.twm-notification-history__item\s*\{/);
    for (const severity of Object.keys(COLOURED)) {
        const sel = `${ITEM}--${severity}`;
        const at = text.indexOf(sel);
        ok(`--${severity} comes after the base rule`, baseAt >= 0 && at > baseAt, `${baseAt} / ${at}`);
        ok(`--${severity} is at least as specific`,
           compareSpecificity(specificity(sel), specificity(ITEM)) >= 0);
    }
    const later = text.slice(baseAt + 1);
    const reset = /\.twm-notification-history__item(?![-\w])[^{}]*\{[^{}]*border(-left)?(-color)?\s*:/g;
    ok('nothing later resets the item\'s left border', !reset.test(later));
}

const tokens = readFileSync(resolvePath(HERE, '../css/tokens.css'), 'utf8');
ok('tokens.css defines the three colours',
   ['--color-success', '--color-warning', '--color-danger'].every((t) => tokens.includes(`${t}:`)));

if (failures) {
    console.error(`\nnotification history severity: ${failures} FAILED`);
    process.exit(1);
}
console.log('\nnotification history severity: all passed');
