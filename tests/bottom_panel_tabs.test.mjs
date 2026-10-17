/**
 * ══ THE BOTTOM PANEL'S TAB HOST (STORY-0018) ══════════════════════════════
 *
 *   §1  the markup is the `.twm-bp*` CSS's: one strip, one body, a pane each
 *   §2  a pane mounts on first show, or at once when `eager`; it is handed its
 *       own store and told `onShow` each time it comes to the front
 *   §3  setBadge: a count, coloured by level, gone at zero, 99+ above 99
 *   §4  `bottompanel:show {tab}` on the embedder's bus selects that tab
 *   §5  the remembered tab comes back — unless a caller chose first, or it is
 *       no longer offered; one already in front is shown again (onShow,
 *       onSelect), as it always was, and is not written back
 *   §6  a click keeps its target while a tab is being selected; a click on the
 *       tab already in front is a select all the same (onShow, onSelect, write)
 *   §7  destroy: panes save, then go; the bus is let go
 *   §7b a pane that throws; the api during construction (`root` set in `mount`)
 *   §8  the badge's CSS exists for every level setBadge writes
 *
 *     node tests/bottom_panel_tabs.test.mjs
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
    console.log('bottom panel tabs: SKIPPED — needs jsdom '
        + '(`cd ../Tables/web && npm install`, or `npm i -D jsdom` here)');
    process.exit(0);
}

const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>',
                      { url: 'http://localhost/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'Node', 'Event', 'MouseEvent']) {
    if (globalThis[key] === undefined) globalThis[key] = dom.window[key];
}

const { createBottomPanelTabs, BADGE_LEVELS } = await import('../src/tiling/bottom_panel_tabs.js');
const { EventBus } = await import('../src/core/event_bus.js');

let failures = 0;
function ok(what, cond, why = '') {
    if (cond) { console.log(`  ok   ${what}`); return; }
    failures++;
    console.error(`  FAIL ${what}${why ? `\n       ${why}` : ''}`);
}
const tick = () => new Promise((r) => setTimeout(r, 0));
function realClick(el) {
    const opts = { bubbles: true, cancelable: true, button: 0 };
    el.dispatchEvent(new dom.window.MouseEvent('mousedown', opts));
    el.dispatchEvent(new dom.window.MouseEvent('mouseup', opts));
    el.dispatchEvent(new dom.window.MouseEvent('click', opts));
}

function fresh() {
    const host = document.createElement('div');
    document.getElementById('root').replaceChildren(host);
    return host;
}

/** Panes that record what happened to them. */
function recordingPanes(log) {
    const pane = (id, label, extra = {}) => ({
        id, label, ...extra,
        mount(el, store, api) {
            log.push(`mount ${id}`);
            el.textContent = `${label} body`;
            return {
                store, api,
                onShow: () => log.push(`show ${id}`),
                persist: async () => { log.push(`persist ${id}`); },
                destroy: () => log.push(`destroy ${id}`),
            };
        },
    });
    return [pane('alerts', 'Alerts', { eager: true }), pane('changes', 'Changes'), pane('sql', 'SQL')];
}

console.log('§1 markup');
{
    const host = fresh();
    const tabs = createBottomPanelTabs(host, { panes: recordingPanes([]) });
    const root = host.querySelector(':scope > .twm-bp');
    ok('one .twm-bp root', !!root && tabs.root === root);
    ok('a strip and a body, in that order',
       [...root.children].map((c) => c.className).join(' ') === 'twm-bp__tabs twm-bp__body');
    const buttons = [...root.querySelectorAll('.twm-bp__tabs > button.twm-bp__tab')];
    ok('a tab per pane, in order', buttons.map((b) => b.dataset.pane).join() === 'alerts,changes,sql');
    ok('the first is on', buttons[0].classList.contains('twm-bp__tab--on')
       && buttons[0].getAttribute('aria-selected') === 'true' && tabs.active() === 'alerts');
    ok('a label each', buttons.map((b) => b.querySelector('.twm-bp__label').textContent).join() === 'Alerts,Changes,SQL');
    ok('panes are .twm-bp-pane in the body',
       [...root.querySelectorAll('.twm-bp__body > .twm-bp-pane')].every((p) => p.getAttribute('role') === 'tabpanel'));
    await tabs.destroy();
}

console.log('§2 mounting, stores, onShow');
{
    const log = [];
    const stores = [];
    const host = fresh();
    const tabs = createBottomPanelTabs(host, {
        panes: recordingPanes(log), initial: 'changes',
        store: (pane) => { const s = { read: () => null, write: () => {}, for: pane.id }; stores.push(s); return s; },
    });
    ok('the eager pane mounts at once, the chosen one on show; sql not yet',
       log.join('|') === 'mount alerts|mount changes|show changes', log.join('|'));
    ok('the eager pane is hidden behind the one in front',
       host.querySelector('.twm-bp-pane[data-pane="alerts"]').hidden === true
       && host.querySelector('.twm-bp-pane[data-pane="changes"]').hidden === false);
    ok('each pane gets its own store', tabs.instance('changes').store.for === 'changes'
       && tabs.instance('alerts').store.for === 'alerts');
    ok('…and the host api', tabs.instance('changes').api === tabs);
    log.length = 0;
    tabs.select('sql');
    tabs.select('changes');
    ok('first show mounts; every show tells onShow',
       log.join('|') === 'mount sql|show sql|show changes', log.join('|'));
    ok('instance() of a pane never shown is null', createBottomPanelTabs(fresh(), { panes: recordingPanes([]) }).instance('sql') === null);
    tabs.reshow();
    ok('reshow tells the pane in front', log.at(-1) === 'show changes');
    let titled = null;
    const t2 = createBottomPanelTabs(fresh(), { panes: recordingPanes([]), onSelect: (id, pane) => { titled = pane.label; } });
    t2.select('sql');
    ok('onSelect hears the pane (the tile title)', titled === 'SQL');
    ok('selecting an unknown tab changes nothing', (t2.select('nope'), t2.active()) === 'sql');
}

console.log('§3 badges');
{
    const host = fresh();
    const tabs = createBottomPanelTabs(host, { panes: recordingPanes([]) });
    const badge = () => host.querySelector('[data-pane="alerts"] .twm-bp__badge');
    ok('no badge to begin with', badge().hidden === true);
    tabs.setBadge('alerts', 3, 'warning');
    ok('a count, coloured', !badge().hidden && badge().textContent === '3'
       && badge().className === 'twm-bp__badge twm-bp__badge--warning');
    tabs.setBadge('alerts', 250, 'alert');
    ok('99+ above 99, the worse level', badge().textContent === '99+' && badge().classList.contains('twm-bp__badge--alert'));
    tabs.setBadge('alerts', 5);
    ok('no level: the neutral badge', badge().className === 'twm-bp__badge');
    tabs.setBadge('alerts', 2, 'bogus');
    ok('an unknown level is neutral, not a class', badge().className === 'twm-bp__badge');
    tabs.setBadge('alerts', 0, 'alert');
    ok('zero removes it', badge().hidden === true);
    tabs.setBadge('nope', 4);
    ok('an unknown tab is ignored', true);
}

console.log('§4 bottompanel:show');
{
    const bus = new EventBus();
    const tabs = createBottomPanelTabs(fresh(), { panes: recordingPanes([]), eventBus: bus });
    bus.emit('bottompanel:show', { tab: 'sql' });
    ok('the bus selects the named tab', tabs.active() === 'sql');
    bus.emit('bottompanel:show', {});
    ok('…and the first with no tab named', tabs.active() === 'alerts');
    await tabs.destroy();
    bus.emit('bottompanel:show', { tab: 'sql' });
    ok('a destroyed host no longer hears it', tabs.active() === 'alerts');
}

console.log('§5 the remembered tab');
{
    const writes = [];
    const later = (v) => ({ read: () => new Promise((r) => setTimeout(() => r(v), 5)), write: (id) => writes.push(id) });
    const a = createBottomPanelTabs(fresh(), { panes: recordingPanes([]), remember: later('sql') });
    await new Promise((r) => setTimeout(r, 20));
    ok('it comes back when the read answers', a.active() === 'sql');
    ok('…and coming back is not a write', writes.length === 0);

    const b = createBottomPanelTabs(fresh(), { panes: recordingPanes([]), remember: later('sql') });
    b.select('changes');
    await new Promise((r) => setTimeout(r, 20));
    ok('a tab a caller chose first wins over the remembered one', b.active() === 'changes');
    ok('the choice is remembered', writes.at(-1) === 'changes');

    const c = createBottomPanelTabs(fresh(), { panes: recordingPanes([]), remember: { read: () => 'gone', write() {} } });
    await tick(); await tick();
    ok('a remembered tab no longer offered: the first', c.active() === 'alerts');

    const d = createBottomPanelTabs(fresh(), { panes: recordingPanes([]),
        remember: { read: () => { throw new Error('no storage'); }, write: () => { throw new Error('quota'); } } });
    await tick();
    d.select('sql');
    ok('a storage that throws costs nothing', d.active() === 'sql');

    // The remembered tab is the one in front already: it is shown again, as
    // it was before the panel was built on createTabs.
    const log = [];
    const e = createBottomPanelTabs(fresh(), { panes: recordingPanes(log),
        remember: { read: () => 'alerts', write: (id) => log.push(`write ${id}`) },
        onSelect: (id) => log.push(`onSelect ${id}`) });
    await tick(); await tick();
    ok('a remembered tab already in front: onShow and onSelect again, nothing written',
       e.active() === 'alerts'
       && log.join('|') === 'mount alerts|show alerts|onSelect alerts|show alerts|onSelect alerts', log.join('|'));
    log.length = 0;
    const f = createBottomPanelTabs(fresh(), { panes: recordingPanes(log),
        remember: { read: () => 'sql', write: (id) => log.push(`write ${id}`) },
        onSelect: (id) => log.push(`onSelect ${id}`) });
    await tick(); await tick();
    ok('a remembered tab behind: mounted, shown, onSelect, nothing written',
       f.active() === 'sql'
       && log.join('|') === 'mount alerts|show alerts|onSelect alerts|mount sql|show sql|onSelect sql', log.join('|'));
    await e.destroy(); await f.destroy();
}

console.log('§6 a click keeps its target');
{
    const host = fresh();
    const tabs = createBottomPanelTabs(host, { panes: recordingPanes([]) });
    const button = host.querySelector('[data-pane="sql"]');
    realClick(button);
    ok('mousedown/mouseup/click selects', tabs.active() === 'sql');
    ok('…on the same node: the strip is not rebuilt', host.querySelector('button[data-pane="sql"]') === button);
    realClick(button.querySelector('.twm-bp__badge'));
    ok('a click on the badge is the tab\'s', tabs.active() === 'sql');
}
{
    const log = [];
    const host = fresh();
    const tabs = createBottomPanelTabs(host, {
        panes: recordingPanes(log),
        remember: { read: () => null, write: (id) => log.push(`write ${id}`) },
        onSelect: (id) => log.push(`onSelect ${id}`),
    });
    await tick(); await tick();
    log.length = 0;
    realClick(host.querySelector('button[data-pane="alerts"]'));
    ok('a click on the tab in front re-shows it, tells onSelect, and is remembered',
       log.join('|') === 'show alerts|onSelect alerts|write alerts', log.join('|'));
    log.length = 0;
    tabs.select('alerts');
    ok('…exactly as select() of the tab in front does',
       log.join('|') === 'show alerts|onSelect alerts|write alerts', log.join('|'));
    log.length = 0;
    realClick(host.querySelector('button[data-pane="changes"]'));
    ok('a click on another tab: mount, show, onSelect, write',
       log.join('|') === 'mount changes|show changes|onSelect changes|write changes', log.join('|'));
    await tabs.destroy();
}

console.log('§7 destroy');
{
    const log = [];
    const host = fresh();
    const tabs = createBottomPanelTabs(host, { panes: recordingPanes(log) });
    tabs.select('changes');
    log.length = 0;
    await tabs.destroy();
    ok('every mounted pane saves, then is destroyed',
       log.join('|') === 'persist alerts|persist changes|destroy alerts|destroy changes', log.join('|'));
    ok('the markup is gone', host.children.length === 0);
    await tabs.destroy();
    ok('a second destroy is harmless', log.length === 4);
}

console.log('§7b a pane that throws, and the api during construction');
{
    const host = fresh();
    const roots = {};
    const err = console.error; console.error = () => {};
    const tabs = createBottomPanelTabs(host, { panes: [
        { id: 'bad', label: 'Bad', mount(el, store, api) { roots.bad = api.root; throw new Error('boom'); } },
        { id: 'alerts', label: 'Alerts', eager: true, mount(el, store, api) {
            roots.alerts = api.root; api.setBadge('alerts', 2, 'alert'); return {}; } },
        { id: 'later', label: 'Later', mount(el, store, api) { roots.later = api.root; return {}; } },
    ] });
    console.error = err;
    ok('a pane that throws leaves the host working', tabs.active() === 'bad' && (tabs.select('alerts'), tabs.active()) === 'alerts');
    ok('an eager pane sets its badge through api, inside the call',
       host.querySelector('[data-pane="alerts"] .twm-bp__badge').textContent === '2');
    const bp = host.querySelector(':scope > .twm-bp');
    ok('api.root is the .twm-bp element inside an eager pane\'s mount', !!bp && roots.alerts === bp);
    ok('…and inside the mount of the tab in front at creation', roots.bad === bp);
    tabs.select('later');
    ok('…and of a pane mounted later', roots.later === bp && tabs.root === bp);
}

console.log('§8 CSS');
{
    const css = readFileSync(resolvePath(HERE, '../css/flexdesk.css'), 'utf8');
    for (const cls of ['twm-bp__badge', ...BADGE_LEVELS.map((l) => `twm-bp__badge--${l}`)]) {
        ok(`.${cls} is styled`, new RegExp(`\\.${cls}[\\s{\\[]`).test(css));
    }
}

console.log(failures ? `\n${failures} FAILED` : '\nbottom panel tabs: all assertions passed');
process.exit(failures ? 1 : 0);
