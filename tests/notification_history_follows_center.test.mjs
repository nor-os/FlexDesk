/**
 * ══ THE BELL FOLLOWS THE CENTRE'S OWN HISTORY (BUG-0034, 0.17.3) ══════════
 *
 *   §1  a toast raised through the API (show, warn, error, info, success)
 *       raises the bell's unread badge — no bus event is needed
 *   §2  a toast raised on the bus ('toast:show', 'notification:show') is one
 *       entry in the history and one unread
 *   §3  a toast that leaves (timeout, ×, overflow) marks its own entry and
 *       adds none: two warns are two entries, whatever became of them
 *   §4  subscribe(): one call per entry, after it is in `history`; skipHistory
 *       toasts call nobody; the unsubscribe and dispose() stop the calls
 *   §5  past `historyLimit` the badge still counts every new toast; opening
 *       the popover marks all seen; unmount lets the centre go
 *
 *     node tests/notification_history_follows_center.test.mjs
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
    console.log('notification history follows centre: SKIPPED — needs jsdom '
        + '(`cd ../Tables/web && npm install`, or `npm i -D jsdom` here)');
    process.exit(0);
}

const dom = new JSDOM(`<!doctype html><body>
  <div class="twm-global-bottom-bar"><div class="twm-bar-right"></div></div></body>`,
  { url: 'http://localhost/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent']) {
    if (globalThis[key] === undefined) globalThis[key] = dom.window[key];
}
// The centre logs warn/error toasts to the console; keep the output readable.
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
function realClick(el) {
    for (const type of ['mousedown', 'mouseup', 'click']) {
        el.dispatchEvent(new dom.window.MouseEvent(type, { bubbles: true, cancelable: true, button: 0 }));
    }
}
const badgeOf = (bell) => bell.triggerEl.querySelector('.twm-notification-history__badge');
const badge = (bell) => (badgeOf(bell).style.display === 'none' ? null : badgeOf(bell).textContent);

function fresh(options = {}) {
    document.getElementById('notification-center-root')?.remove();
    const bus = new EventBus();
    const nc = new NotificationCenter({ eventBus: bus, ...options });
    nc.mount(document.body);
    const bell = new NotificationHistory({ notificationCenter: nc, eventBus: bus });
    bell.mount();
    const done = () => { bell.unmount(); nc.dispose(); };
    return { bus, nc, bell, done };
}

console.log('§1 a toast raised through the API raises the badge');
{
    const { nc, bell, done } = fresh();
    ok('nothing unread at mount', badge(bell) === null);
    nc.warn('x');
    ok('warn(): one entry', nc.history.length === 1, String(nc.history.length));
    ok('warn(): the badge says 1, at once', badge(bell) === '1', String(badge(bell)));
    nc.error('Broken', 'failed');
    nc.info('fyi');
    nc.success('saved');
    nc.show({ message: 'plain', severity: 'info' });
    ok('error/info/success/show: five in all', nc.history.length === 5 && badge(bell) === '5',
       `${nc.history.length} / ${badge(bell)}`);
    done();
}

console.log('§2 a toast raised on the bus counts once');
{
    const { bus, nc, bell, done } = fresh();
    bus.emit('toast:show', { message: 'y', severity: 'warn' });
    ok('toast:show: one entry', nc.history.length === 1, String(nc.history.length));
    ok('toast:show: one unread', badge(bell) === '1', String(badge(bell)));
    await wait();
    ok('…and still one once the bus has settled', badge(bell) === '1', String(badge(bell)));
    bus.emit('notification:show', { message: 'z', severity: 'warn' });
    await wait();
    ok('notification:show: one more of each', nc.history.length === 2 && badge(bell) === '2',
       `${nc.history.length} / ${badge(bell)}`);
    done();
}

console.log('§3 a toast that leaves marks its own entry');
{
    const { bus, nc, bell, done } = fresh({ defaultDurationMs: 20 });
    nc.warn('first');
    await wait(60);
    ok('the first warn timed out', !document.querySelector('.twm-notification'));
    bus.emit('toast:show', { message: 'second', severity: 'warn', durationMs: 20 });
    await wait(60);
    ok('two warns are two entries', nc.history.length === 2, JSON.stringify(nc.history.map((h) => h.message)));
    ok('…and two unread', badge(bell) === '2', String(badge(bell)));
    ok('each entry says it timed out', nc.history.every((h) => h.dismissed === true && h.reason === 'timeout'),
       JSON.stringify(nc.history.map((h) => [h.dismissed, h.reason])));

    const id = nc.show({ message: 'sticky', persistent: true });
    nc.dismiss(id, 'dismissed');
    ok('×: still one entry for it', nc.history.filter((h) => h.id === id).length === 1
       && nc.history.at(-1).reason === 'dismissed', JSON.stringify(nc.history.at(-1)));
    done();
}
{
    const { nc, bell, done } = fresh({ maxVisible: 2 });
    for (const m of ['a', 'b', 'c']) nc.show({ message: m, persistent: true });
    ok('overflow: three toasts, three entries', nc.history.map((h) => h.message).join() === 'a,b,c',
       JSON.stringify(nc.history.map((h) => h.message)));
    ok('…the one pushed off says why', nc.history[0].reason === 'overflow', String(nc.history[0].reason));
    ok('…and three unread', badge(bell) === '3', String(badge(bell)));
    done();
}

console.log('§4 subscribe()');
{
    document.getElementById('notification-center-root')?.remove();
    const nc = new NotificationCenter({ eventBus: new EventBus() });
    nc.mount(document.body);
    const heard = [];
    const off = nc.subscribe((entry, center) => heard.push([entry.message, center === nc, center.history.includes(entry)]));
    nc.warn('one');
    ok('one call per entry, with the entry and the centre, after it is recorded',
       JSON.stringify(heard) === JSON.stringify([['one', true, true]]), JSON.stringify(heard));
    nc.show({ message: 'quiet', skipHistory: true });
    ok('a skipHistory toast calls nobody', heard.length === 1, String(heard.length));
    nc.dismiss(nc.history[0].id);
    ok('a dismissal is not a new entry', heard.length === 1, String(heard.length));
    nc.subscribe(() => { throw new Error('broken'); });
    nc.info('two');
    ok('a listener that throws stops neither the others nor the toast',
       heard.length === 2 && nc.history.length === 2, `${heard.length} / ${nc.history.length}`);
    off();
    nc.info('three');
    ok('the unsubscribe stops the calls', heard.length === 2, String(heard.length));
    const again = [];
    nc.subscribe(() => again.push(1));
    nc.dispose();
    nc.show({ message: 'after' });
    ok('dispose() lets every listener go', again.length === 0, String(again.length));
    ok('subscribe() without a function answers a no-op', typeof nc.subscribe(null) === 'function');
}

console.log('§5 the limit, the popover and unmount');
{
    const { nc, bell } = fresh({ historyLimit: 3 });
    for (const m of ['a', 'b', 'c', 'd', 'e']) nc.show({ message: m, persistent: true });
    ok('the history keeps its limit', nc.history.length === 3, String(nc.history.length));
    ok('…and the badge is what the popover can list', badge(bell) === '3', String(badge(bell)));
    realClick(bell.triggerEl);
    ok('opening the popover marks all seen', badge(bell) === null, String(badge(bell)));
    realClick(bell.triggerEl);
    nc.show({ message: 'f', persistent: true });
    ok('a toast past the limit is still one unread', badge(bell) === '1', String(badge(bell)));
    bell.unmount();
    nc.show({ message: 'g', persistent: true });
    ok('unmount unsubscribes the bell', bell.unreadCount === 1, String(bell.unreadCount));
    nc.dispose();
}

console.log(failures ? `\n${failures} FAILED` : '\nnotification history follows centre: all assertions passed');
process.exit(failures ? 1 : 0);
