/**
 * ══ THE BELL ON AN ALERT LOG (STORY-0020) ═════════════════════════════════
 *
 *   §1  without the new options it is the bell it was: FlexDesk's own bottom
 *       bar, a seen-count badge, the popover on a click
 *   §2  mountPoint: the bell goes where the embedder says
 *   §3  alertLog: the badge is the log's unread count, coloured by the worst
 *       unread level, and gone when all is read
 *   §4  a click opens the Alerts tab (`bottompanel:show`), and so does "+N more"
 *   §5  onOpen replaces the bus event; unmount lets the log go
 *   §6  a bell and a tab host on one bus: the click brings Alerts to the front
 *
 *     node tests/notification_bell.test.mjs
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
    console.log('notification bell: SKIPPED — needs jsdom '
        + '(`cd ../Tables/web && npm install`, or `npm i -D jsdom` here)');
    process.exit(0);
}

const dom = new JSDOM(`<!doctype html><body>
  <div class="twm-global-bottom-bar"><div class="twm-bar-right"></div></div>
  <div id="mine"></div><div id="panel"></div></body>`,
  { url: 'http://localhost/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent']) {
    if (globalThis[key] === undefined) globalThis[key] = dom.window[key];
}

const { NotificationHistory } = await import('../src/ui/components/notification_history.js');
const { createAlertLog } = await import('../src/ui/components/alert_log.js');
const { createBottomPanelTabs } = await import('../src/tiling/bottom_panel_tabs.js');
const { EventBus } = await import('../src/core/event_bus.js');

let failures = 0;
function ok(what, cond, why = '') {
    if (cond) { console.log(`  ok   ${what}`); return; }
    failures++;
    console.error(`  FAIL ${what}${why ? `\n       ${why}` : ''}`);
}
const tick = () => new Promise((r) => setTimeout(r, 0));
function realClick(el) {
    for (const type of ['mousedown', 'mouseup', 'click']) {
        el.dispatchEvent(new dom.window.MouseEvent(type, { bubbles: true, cancelable: true, button: 0 }));
    }
}
const badgeOf = (bell) => bell.triggerEl.querySelector('.twm-notification-history__badge');
const shown = (el) => el.style.display !== 'none';

console.log('§1 as before, without the new options');
{
    const bus = new EventBus();
    const center = { history: [{ title: 'old', message: 'seen at boot', timestamp: Date.now() }] };
    const bell = new NotificationHistory({ notificationCenter: center, eventBus: bus });
    bell.mount();
    ok('in FlexDesk\'s own bottom bar', bell.triggerEl.parentElement === document.querySelector('.twm-bar-right'));
    ok('what was there at mount is not unread', !shown(badgeOf(bell)));
    center.history.push({ title: 'new', message: 'x', timestamp: Date.now() });
    bus.emit('toast:show', {});
    await tick();
    ok('a new toast is a seen-count delta', shown(badgeOf(bell)) && badgeOf(bell).textContent === '1');
    ok('…in the plain badge', badgeOf(bell).className === 'twm-notification-history__badge');
    let asked = 0;
    const sub = bus.on('bottompanel:show', () => { asked++; });
    realClick(bell.triggerEl);
    ok('a click opens the popover', !!document.querySelector('.twm-notification-history__panel') && asked === 0);
    ok('…and marks seen', !shown(badgeOf(bell)));
    sub.dispose();
    bell.unmount();
    ok('unmount removes the bell and the popover', !document.querySelector('.twm-notification-history__trigger')
       && !document.querySelector('.twm-notification-history__panel'));
}

console.log('§2 mountPoint');
{
    const mine = document.getElementById('mine');
    const bell = new NotificationHistory({ notificationCenter: { history: [] }, mountPoint: mine });
    bell.mount();
    ok('the bell is in the embedder\'s element', bell.triggerEl.parentElement === mine
       && !document.querySelector('.twm-bar-right .twm-notification-history__trigger'));
    bell.unmount();
}

console.log('§3 the badge reads the alert log');
const bus = new EventBus();
const log = createAlertLog();
const bell = new NotificationHistory({ notificationCenter: { history: [] }, eventBus: bus, alertLog: log,
                                      mountPoint: document.getElementById('mine') });
{
    log.add({ id: 'r', title: 'read already', read: true });
    bell.mount();
    ok('nothing unread: no badge', !shown(badgeOf(bell)));
    ok('…and the bell is not lit', !bell.triggerEl.classList.contains('twm-notification-history__trigger--unread'));
    log.add({ id: 'i', title: 'info', level: 'info' });
    ok('one unread: 1, info', shown(badgeOf(bell)) && badgeOf(bell).textContent === '1'
       && badgeOf(bell).classList.contains('twm-notification-history__badge--info'));
    log.add({ id: 'a', title: 'contract broken', level: 'error' });
    ok('the worst unread level colours it', badgeOf(bell).textContent === '2'
       && badgeOf(bell).classList.contains('twm-notification-history__badge--alert'));
    ok('…and lights the bell', bell.triggerEl.classList.contains('twm-notification-history__trigger--unread'));
    ok('labelled Alerts', bell.triggerEl.getAttribute('aria-label') === 'Alerts');
    log.markRead(['a']);
    ok('reading the alert: back to info', badgeOf(bell).textContent === '1'
       && badgeOf(bell).classList.contains('twm-notification-history__badge--info'));
    for (let i = 0; i < 120; i++) log.add({ title: `n${i}` });
    ok('99+ past 99', badgeOf(bell).textContent === '99+');
    log.markRead();
    ok('all read: nothing', !shown(badgeOf(bell)) && badgeOf(bell).className === 'twm-notification-history__badge');
    bus.emit('toast:show', {});
    await tick();
    ok('a toast does not bring back a seen-count badge', !shown(badgeOf(bell)));
}

console.log('§4 a click opens the Alerts tab');
{
    const asked = [];
    const sub = bus.on('bottompanel:show', (p) => asked.push(p?.tab));
    realClick(bell.triggerEl);
    ok('bottompanel:show { tab: "alerts" }', asked.join() === 'alerts');
    ok('…not the popover', !document.querySelector('.twm-notification-history__panel'));
    bus.emit('notification:summary', { held: [] });
    ok('"+N more" opens it too', asked.join() === 'alerts,alerts');
    sub.dispose();
}

console.log('§5 onOpen, unmount');
{
    let opened = 0;
    const asked = [];
    const sub = bus.on('bottompanel:show', (p) => asked.push(p?.tab));
    const own = new NotificationHistory({ notificationCenter: { history: [] }, eventBus: bus, alertLog: log,
                                          mountPoint: document.getElementById('mine'), onOpen: () => { opened++; } });
    own.mount();
    realClick(own.triggerEl);
    ok('onOpen instead of the bus event', opened === 1 && asked.length === 0);
    own.unmount();
    bell.unmount();
    log.add({ title: 'after unmount', level: 'alert' });
    bus.emit('notification:summary', { held: [] });
    ok('unmounted bells hear neither the log nor the summary', opened === 1 && asked.length === 0);
    sub.dispose();
}

console.log('§6 a bell and a tab host on one bus');
{
    const bus2 = new EventBus();
    const log2 = createAlertLog();
    const tabs = createBottomPanelTabs(document.getElementById('panel'), {
        eventBus: bus2,
        panes: [{ id: 'sql', label: 'SQL', mount() {} }, { id: 'alerts', label: 'Alerts', mount() {} }],
    });
    const b = new NotificationHistory({ notificationCenter: { history: [] }, eventBus: bus2, alertLog: log2,
                                        mountPoint: document.getElementById('mine') });
    b.mount();
    ok('the panel starts on its first tab', tabs.active() === 'sql');
    realClick(b.triggerEl);
    ok('the bell brings Alerts to the front', tabs.active() === 'alerts');
    b.unmount();
    await tabs.destroy();
}

console.log('§7 CSS');
{
    const css = readFileSync(resolvePath(HERE, '../css/flexdesk.css'), 'utf8');
    for (const cls of ['twm-notification-history__badge--info', 'twm-notification-history__badge--warning',
                       'twm-notification-history__badge--alert', 'twm-notification-history__trigger--unread']) {
        ok(`.${cls} is styled`, new RegExp(`\\.${cls}(?![\\w-])`).test(css));
    }
}

console.log(failures ? `\n${failures} FAILED` : '\nnotification bell: all assertions passed');
process.exit(failures ? 1 : 0);
