/**
 * ══ THE ALERT LOG AND THE ALERTS PANE (STORY-0019) ═══════════════════════
 *
 *   §1  helpers: levels normalised, the worst level, relative times, day labels
 *   §2  the log: add, mark read, dismiss, unread count, the limit, listeners
 *   §3  a local source: saved on every change, read back by a new log
 *   §4  a paged remote source: pages, the server's unread count, no dismiss,
 *       a refusal re-reads
 *   §5  the pane is the same layout on both sources
 *   §6  chips and the text filter narrow; days are grouped; times are relative
 *   §7  Open hands the entry over, read; Dismiss and Mark all read move the badge
 *   §8  a click on a row survives an update between mousedown and mouseup
 *   §9  rules and "still matches", for an embedder with rules (bugdesk)
 *   §10 every class the pane sets is styled
 *
 *     node tests/alerts_pane.test.mjs
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
    console.log('alerts pane: SKIPPED — needs jsdom '
        + '(`cd ../Tables/web && npm install`, or `npm i -D jsdom` here)');
    process.exit(0);
}

const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>',
                      { url: 'http://localhost/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'Node', 'Event', 'MouseEvent']) {
    if (globalThis[key] === undefined) globalThis[key] = dom.window[key];
}

const {
    createAlertLog, localSource, worstLevel, normalizeLevel, ago, dayLabel, ALERT_LEVELS,
} = await import('../src/ui/components/alert_log.js');
const { mountAlertsPane } = await import('../src/ui/components/alerts_pane.js');

let failures = 0;
function ok(what, cond, why = '') {
    if (cond) { console.log(`  ok   ${what}`); return; }
    failures++;
    console.error(`  FAIL ${what}${why ? `\n       ${why}` : ''}`);
}
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const fire = (el, type) => el.dispatchEvent(new dom.window.MouseEvent(type, { bubbles: true, cancelable: true, button: 0 }));
function realClick(el) { fire(el, 'mousedown'); fire(el, 'mouseup'); fire(el, 'click'); }
const fresh = () => {
    const host = document.createElement('div');
    document.getElementById('root').replaceChildren(host);
    return host;
};

const NOW = new Date();
const minutesAgo = (m) => new Date(NOW.getTime() - m * 60000);
const yesterday = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - 1, 12, 0);
const SEED = () => [
    { id: 'a1', at: minutesAgo(2), level: 'alert', title: 'Contract broken', body: 'Award panel decision', ref: 'P-1' },
    { id: 'w1', at: minutesAgo(90), level: 'warn', title: 'Review due', ref: 'P-2' },
    { id: 'i1', at: yesterday, level: 'info', title: 'Version retiring', ref: 'P-3', read: true },
];

console.log('§1 helpers');
ok('levels: warn → warning, error/danger → alert, unknown → info',
   [normalizeLevel('warn'), normalizeLevel('error'), normalizeLevel('danger'), normalizeLevel('x'), normalizeLevel('alert')].join()
   === 'warning,alert,alert,info,alert');
ok('worstLevel', worstLevel([{ level: 'info' }, { level: 'warn' }]) === 'warning'
   && worstLevel([{ level: 'info' }, { level: 'error' }]) === 'alert' && worstLevel([]) === null);
ok('ago', ago(minutesAgo(0.2), NOW) === 'just now' && ago(minutesAgo(5), NOW) === '5 min ago'
   && ago(minutesAgo(180), NOW) === '3 h ago');
ok('dayLabel', dayLabel(minutesAgo(1), NOW) === 'TODAY' && dayLabel(yesterday, NOW) === 'YESTERDAY'
   && /20\d\d/.test(dayLabel(new Date(2020, 0, 3), NOW)));
ok('three levels, each with a label and an icon',
   Object.keys(ALERT_LEVELS).join() === 'info,warning,alert' && Object.values(ALERT_LEVELS).every((l) => l.label && l.icon));

console.log('§2 the log, in memory');
{
    const log = createAlertLog({ limit: 3 });
    let heard = 0;
    const off = log.subscribe(() => { heard++; });
    for (const e of SEED()) log.add(e);
    ok('newest first, levels normalised', log.entries().map((e) => `${e.id}:${e.level}`).join() === 'i1:info,w1:warning,a1:alert',
       log.entries().map((e) => e.id).join());
    ok('unread count and worst unread', log.unreadCount() === 2 && log.worstUnread() === 'alert');
    log.markRead(['a1']);
    ok('mark one read', log.unreadCount() === 1 && log.worstUnread() === 'warning');
    log.add({ id: 'x', title: 'four' });
    ok('the limit drops the oldest', log.entries().length === 3 && !log.get('a1'));
    log.dismiss(['x']);
    ok('dismiss one', !log.get('x') && log.entries().length === 2);
    log.markRead();
    ok('mark all read', log.unreadCount() === 0 && log.worstUnread() === null);
    log.dismiss();
    ok('dismiss all', log.entries().length === 0);
    ok('listeners heard every change', heard === 8, String(heard));
    off();
    log.add({ title: 'after' });
    ok('…and an unsubscribed one hears no more', heard === 8);
    ok('an entry without an id gets one, and a Date', typeof log.entries()[0].id === 'string' && log.entries()[0].at instanceof Date);
}

console.log('§3 a local source');
{
    let stored = SEED().map((e) => ({ ...e, at: e.at.toISOString() }));
    const writes = [];
    const source = localSource({ read: async () => stored, write: (v) => { writes.push(v); stored = v; } });
    const log = createAlertLog({ source });
    await log.load();
    ok('read once, newest first', log.entries().map((e) => e.id).join() === 'a1,w1,i1');
    log.markRead(['w1']);
    log.add({ id: 'n1', title: 'New', level: 'warning' });
    log.dismiss(['i1']);
    await tick();
    ok('every change is written', writes.length === 3);
    ok('…as ISO strings', typeof stored[0].at === 'string');
    const again = createAlertLog({ source: localSource({ read: () => stored, write() {} }) });
    await again.load();
    ok('a new log reads back what was written', again.entries().map((e) => `${e.id}${e.read ? '·' : ''}`).join() === 'n1,a1,w1·');
    ok('a local log can dismiss', again.canDismiss());
}

console.log('§4 a paged remote source');
{
    const server = Array.from({ length: 7 }, (_, i) => ({
        id: `s${i}`, at: minutesAgo(i * 10).toISOString(), level: i % 2 ? 'warning' : 'info', title: `n${i}`, read: i >= 5,
    }));
    const calls = [];
    let refuse = false;
    const source = {
        async load({ offset, limit }) {
            calls.push(`load ${offset}+${limit}`);
            return { entries: server.slice(offset, offset + limit), more: offset + limit < server.length,
                     unread: server.filter((e) => !e.read).length };
        },
        async markRead(ids) {
            calls.push(`read ${ids ? ids.join('|') : 'all'}`);
            if (refuse) throw new Error('403');
            for (const e of server) if (!ids || ids.includes(e.id)) e.read = true;
        },
    };
    const log = createAlertLog({ source, limit: 3 });
    await log.load();
    ok('the first page', log.entries().map((e) => e.id).join() === 's0,s1,s2' && log.hasMore());
    ok('the server\'s unread count, beyond the page', log.unreadCount() === 5);
    await log.loadMore();
    ok('the next page, appended', log.entries().length === 6 && log.entries()[3].id === 's3');
    ok('no dismiss without the source\'s', !log.canDismiss() && (log.dismiss(['s0']), log.entries().length === 6));
    log.markRead(['s0']);
    await tick();
    ok('mark read: applied here at once, the server told', log.unreadCount() === 4 && calls.includes('read s0'));
    refuse = true;
    log.markRead();
    ok('mark all read is immediate', log.unreadCount() === 0);
    await tick(5);
    ok('a refusal re-reads the log from the source', calls.at(-1) === 'load 0+3' && log.unreadCount() === 4,
       `${calls.at(-1)} ${log.unreadCount()}`);
    log.receive({ id: 'push', at: new Date().toISOString(), level: 'alert', title: 'pushed' });
    ok('a pushed entry is shown first and counted', log.entries()[0].id === 'push' && log.unreadCount() === 5);
}

function layout(host) {
    return [...host.querySelectorAll('.twm-alerts *')].filter((n) => /twm-alerts__(bar|chips|chip|q|btn|log|day|row|unread|icon|time|ref|text|title|acts|icon-btn)\b/.test(n.className))
        .map((n) => n.className.split(' ').find((c) => c.startsWith('twm-alerts__')))
        .filter((c, i, a) => a.indexOf(c) === i).sort().join();
}

console.log('§5 one layout, two sources');
let localHost;
{
    localHost = fresh();
    const local = createAlertLog({ source: localSource({ read: () => SEED().map((e) => ({ ...e, at: e.at.toISOString() })), write() {} }) });
    mountAlertsPane(localHost, { log: local, onOpen() {} });
    await tick();
    const remoteHost = document.createElement('div');
    document.getElementById('root').append(remoteHost);
    const remote = createAlertLog({ source: { load: async () => ({ entries: SEED(), more: true, unread: 2 }), markRead() {} } });
    mountAlertsPane(remoteHost, { log: remote, onOpen() {} });
    await tick();
    ok('the same parts, on a local and a remote log', layout(localHost) === layout(remoteHost), `${layout(localHost)}\n       ${layout(remoteHost)}`);
    ok('a row per entry on each', localHost.querySelectorAll('.twm-alerts__row').length === 3
       && remoteHost.querySelectorAll('.twm-alerts__row').length === 3);
    ok('the remote one offers older entries', !!remoteHost.querySelector('[data-act="more"]') && !localHost.querySelector('[data-act="more"]'));
    ok('Clear only where entries can be dismissed', !localHost.querySelector('[data-act="clear"]').hidden
       && remoteHost.querySelector('[data-act="clear"]').hidden);
    ok('Dismiss only where entries can be dismissed', !!localHost.querySelector('[data-dismiss]') && !remoteHost.querySelector('[data-dismiss]'));
}

console.log('§6 chips, the filter, days, times');
{
    const host = fresh();
    const log = createAlertLog();
    for (const e of SEED().reverse()) log.add(e);
    mountAlertsPane(host, { log });
    const rows = () => [...host.querySelectorAll('.twm-alerts__row')].map((r) => r.dataset.id).join();
    const count = (k) => host.querySelector(`[data-level="${k}"] .twm-alerts__count`).textContent;
    ok('chips count by level', [count('all'), count('alert'), count('warning'), count('info')].join() === '3,1,1,1');
    realClick(host.querySelector('[data-level="warning"]'));
    await tick();
    ok('a chip narrows to its level', rows() === 'w1');
    ok('…and is on', host.querySelector('[data-level="warning"]').classList.contains('twm-alerts__chip--on'));
    realClick(host.querySelector('[data-level="all"]'));
    await tick();
    const input = host.querySelector('.twm-alerts__q');
    input.focus();
    input.value = 'award';
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    ok('the filter reads the body too', rows() === 'a1');
    ok('…and typing keeps the same input, focused', host.querySelector('.twm-alerts__q') === input && document.activeElement === input);
    input.value = 'zzz';
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    ok('nothing matching says so', host.querySelector('.twm-alerts__none')?.textContent === 'No alerts match.');
    input.value = '';
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    ok('grouped by day', [...host.querySelectorAll('.twm-alerts__day')].map((d) => d.textContent).join() === 'TODAY,YESTERDAY');
    ok('times are relative', host.querySelector('[data-id="a1"] .twm-alerts__time').textContent === '2 min ago');
    ok('unread rows are marked', host.querySelectorAll('.twm-alerts__row--unread').length === 2);
}

console.log('§7 Open, Dismiss, Mark all read');
{
    const host = fresh();
    const log = createAlertLog();
    for (const e of SEED().reverse()) log.add(e);
    const opened = [];
    const badges = [];
    mountAlertsPane(host, { log, onOpen: (e) => opened.push(e), onBadge: (b) => badges.push(b) });
    ok('the badge starts at the unread count, worst level', badges.at(-1).unread === 2 && badges.at(-1).level === 'alert');
    realClick(host.querySelector('[data-id="a1"] [data-open]'));
    await tick();
    ok('Open hands over the entry', opened.length === 1 && opened[0].id === 'a1' && opened[0].title === 'Contract broken');
    ok('…marked read', opened[0].read === true && badges.at(-1).unread === 1 && badges.at(-1).level === 'warning');
    realClick(host.querySelector('[data-id="w1"] [data-dismiss]'));
    await tick();
    ok('Dismiss removes it and the badge follows', !host.querySelector('[data-id="w1"]') && badges.at(-1).unread === 0
       && badges.at(-1).level === null);
    log.add({ id: 'n', title: 'new', level: 'info' });
    await tick();
    ok('a new entry moves the badge', badges.at(-1).unread === 1);
    realClick(host.querySelector('[data-act="read-all"]'));
    await tick();
    ok('Mark all read', badges.at(-1).unread === 0 && !host.querySelector('.twm-alerts__row--unread'));
    ok('…and is then disabled', host.querySelector('[data-act="read-all"]').disabled);
    realClick(host.querySelector('[data-act="clear"]'));
    await tick();
    ok('Clear empties it', host.querySelectorAll('.twm-alerts__row').length === 0
       && host.querySelector('.twm-alerts__none').textContent === 'Nothing yet.');
}

console.log('§8 a click survives an update under the pointer');
{
    const host = fresh();
    const log = createAlertLog();
    for (const e of SEED().reverse()) log.add(e);
    const opened = [];
    mountAlertsPane(host, { log, onOpen: (e) => opened.push(e.id) });
    const button = host.querySelector('[data-id="w1"] [data-open]');
    fire(button, 'mousedown');
    log.receive({ id: 'late', at: new Date(), level: 'alert', title: 'arrived mid-click' });
    log.markRead(['i1']);
    ok('the row under the pointer is the same node', host.querySelector('[data-id="w1"] [data-open]') === button
       && button.isConnected);
    fire(button, 'mouseup');
    fire(button, 'click');
    ok('the click lands', opened.join() === 'w1');
    await tick();
    ok('the update is drawn once the button is up', !!host.querySelector('[data-id="late"]'));
}

console.log('§9 rules and "still matches"');
{
    const host = fresh();
    const log = createAlertLog();
    log.add({ id: 'r1', title: 'BUG-1 opened', ruleId: 'crit', rule: 'Critical bugs', level: 'alert' });
    log.add({ id: 'r2', title: 'STORY-2 stalled', ruleId: 'stale', rule: 'Stalled', level: 'warning' });
    let edits = 0;
    mountAlertsPane(host, {
        log,
        rules: { list: () => [{ id: 'crit', name: 'Critical bugs', level: 'alert', meta: '1 now' },
                              { id: 'stale', name: 'Stalled', level: 'warning', off: true }],
                 onEdit: () => { edits++; }, foot: 'Counts are records matching now.' },
        stillMatches: (e) => (e.id === 'r1' ? true : false),
        describe: (e) => (e.id === 'r1' ? 'Bugs' : 'Backlog'),
    });
    ok('a rules column: All, then each rule', [...host.querySelectorAll('.twm-alerts__rulename')].map((n) => n.textContent).join()
       === 'All alerts,Critical bugs,Stalled');
    ok('an off rule is drawn off', host.querySelector('[data-rule="stale"]').classList.contains('twm-alerts__rulebtn--off'));
    realClick(host.querySelector('[data-rule="crit"]'));
    await tick();
    ok('a rule narrows the log', [...host.querySelectorAll('.twm-alerts__row')].map((r) => r.dataset.id).join() === 'r1');
    ok('still matches', host.querySelector('[data-id="r1"] .twm-alerts__state').textContent === 'still matches');
    ok('the row carries the rule and the tag', host.querySelector('[data-id="r1"] .twm-alerts__rule').textContent === 'Critical bugs'
       && host.querySelector('[data-id="r1"] .twm-alerts__tag').textContent === 'Bugs');
    realClick(host.querySelector('[data-rule=""]'));
    await tick();
    ok('no longer matches', host.querySelector('[data-id="r2"] .twm-alerts__state--gone')?.textContent === 'no longer matches');
    realClick(host.querySelector('[data-act="edit-rules"]'));
    ok('Edit rules is the embedder\'s', edits === 1);
    ok('the foot', host.querySelector('.twm-alerts__foot').textContent === 'Counts are records matching now.');
}

console.log('§10 CSS');
{
    const css = readFileSync(resolvePath(HERE, '../css/flexdesk.css'), 'utf8');
    const src = readFileSync(resolvePath(HERE, '../src/ui/components/alerts_pane.js'), 'utf8');
    const classes = new Set(src.match(/twm-alerts(__[a-z-]+)?(--[a-z-]+)?/g));
    for (const level of Object.keys(ALERT_LEVELS)) {
        classes.add(`twm-alerts__row--${level}`);
        classes.add(`twm-alerts__dot--${level}`);
    }
    // A template's prefix (`twm-alerts__row--${level}`) is matched as written; its levels are added above.
    const missing = [...classes].filter((c) => !/(__|--)$/.test(c) && !new RegExp(`\\.${c}(?![\\w-])`).test(css));
    ok('every twm-alerts class the pane sets is styled', missing.length === 0, missing.join(', '));
}

console.log('§9 older entries load as you scroll');
{
    const server = Array.from({ length: 9 }, (_, i) => ({ id: `p${i}`, at: minutesAgo(i).toISOString(), title: `n${i}` }));
    const loads = [];
    const log = createAlertLog({ limit: 3, source: {
        async load({ offset, limit }) {
            loads.push(offset);
            return { entries: server.slice(offset, offset + limit), more: offset + limit < server.length };
        },
        async markRead() {},
    } });
    const host = document.createElement('div');
    document.getElementById('root').replaceChildren(host);
    const pane = mountAlertsPane(host, { log });
    await tick(3);
    const list = host.querySelector('.twm-alerts__log');
    // jsdom has no layout: the box says what a browser would.
    const box = { scrollHeight: 300, clientHeight: 100 };
    Object.defineProperty(list, 'scrollHeight', { get: () => box.scrollHeight, configurable: true });
    Object.defineProperty(list, 'clientHeight', { get: () => box.clientHeight, configurable: true });
    const scrollTo = (top) => { list.scrollTop = top; list.dispatchEvent(new dom.window.Event('scroll')); };
    scrollTo(50);
    await tick(3);
    ok('a scroll far from the end loads nothing', loads.join() === '0', loads.join());
    scrollTo(200);
    scrollTo(205);
    await tick(3);
    ok('near the end, the next page — once, however many scrolls', loads.join() === '0,3', loads.join());
    ok('…and its rows are drawn', host.querySelectorAll('.twm-alerts__row').length === 6);
    scrollTo(200);
    await tick(3);
    scrollTo(200);
    await tick(3);
    ok('to the last page, then no more', loads.join() === '0,3,6' && !log.hasMore(), loads.join());
    ok('Load older is gone with nothing left', !host.querySelector('.twm-alerts__more'));
    pane.destroy();
}

console.log(failures ? `\n${failures} FAILED` : '\nalerts pane: all assertions passed');
process.exit(failures ? 1 : 0);
