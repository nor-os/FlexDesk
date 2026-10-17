/**
 * ══ THE PUBLIC TAB STRIP: createTabs (STORY-0048) ═════════════════════════
 *
 *   §1  markup and ARIA: a tablist of buttons, one in the tab order, the
 *       item's icon/label/title/badge/indicator/dirty drawn; strip-only has no body
 *   §2  keys: ArrowLeft/Right move the selection (and focus), wrapping; Home and
 *       End jump to the ends; a click selects, and onReselect hears a click on
 *       the tab already in front
 *   §3  update(items, activeId): the tab in front stays when its id is still
 *       there, the first is selected otherwise; activeId wins when present;
 *       kept tabs keep their button
 *   §4  panes: mounted on first selection only (the one in front at creation
 *       counts), onShow each time, destroyed when their item goes; eager opts in,
 *       at creation and for an item an update adds
 *   §5  the bus: no subscription unless an event name is passed
 *   §6  setBadge / setIndicator
 *   §7  close (mark, Delete, middle click), context menu, reorder wiring
 *   §8  overflow: a vertical wheel scrolls the strip; compact variant
 *   §9  destroy
 *   §10 CSS exists for every class the strip writes under its default block
 *
 *     node tests/tabs.test.mjs
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
    console.log('tabs: SKIPPED — needs jsdom '
        + '(`cd ../Tables/web && npm install`, or `npm i -D jsdom` here)');
    process.exit(0);
}

const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>',
                      { url: 'http://localhost/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'Event',
                   'MouseEvent', 'KeyboardEvent', 'requestAnimationFrame']) {
    if (globalThis[key] === undefined) globalThis[key] = dom.window[key];
}

const { createTabs, TAB_LEVELS } = await import('../src/ui/components/tabs.js');
const widgets = await import('../widgets.js');
const { EventBus } = await import('../src/core/event_bus.js');

let failures = 0;
function ok(what, cond, why = '') {
    if (cond) { console.log(`  ok   ${what}`); return; }
    failures++;
    console.error(`  FAIL ${what}${why ? `\n       ${why}` : ''}`);
}

function fresh() {
    const host = document.createElement('div');
    document.getElementById('root').replaceChildren(host);
    return host;
}
const ITEMS = [
    { id: 'a', label: 'Alpha', icon: 'tune', title: 'The first' },
    { id: 'b', label: 'Beta', badge: 3 },
    { id: 'c', label: 'Gamma', indicator: 'warning', dirty: true, closable: true },
    { id: 'd', label: 'Delta' },
];
const buttons = (host) => [...host.querySelectorAll('.twm-tabs__tabs > button.twm-tabs__tab')];
const key = (el, k, extra = {}) => el.dispatchEvent(new dom.window.KeyboardEvent('keydown',
    { key: k, bubbles: true, cancelable: true, ...extra }));
function realClick(el, button = 0) {
    const opts = { bubbles: true, cancelable: true, button };
    el.dispatchEvent(new dom.window.MouseEvent('mousedown', opts));
    el.dispatchEvent(new dom.window.MouseEvent('mouseup', opts));
    el.dispatchEvent(new dom.window.MouseEvent(button === 1 ? 'auxclick' : 'click', opts));
}

console.log('§0 the entry point');
{
    ok('widgets exports createTabs and TAB_LEVELS',
       widgets.createTabs === createTabs && widgets.TAB_LEVELS === TAB_LEVELS);
    ok('…and the shared strip scrolling', typeof widgets.revealInStrip === 'function'
       && typeof widgets.wheelStripSideways === 'function');
}

console.log('§1 markup and ARIA');
{
    const host = fresh();
    const tabs = createTabs(host, { items: ITEMS, label: 'Views', onClose: () => {} });
    const root = host.querySelector(':scope > .twm-tabs');
    ok('one .twm-tabs root, answered as root', !!root && tabs.root === root);
    ok('strip only: no body without mountPane',
       [...root.children].map((c) => c.className).join() === 'twm-tabs__tabs');
    const strip = root.querySelector('.twm-tabs__tabs');
    ok('a labelled horizontal tablist', strip.getAttribute('role') === 'tablist'
       && strip.getAttribute('aria-label') === 'Views'
       && strip.getAttribute('aria-orientation') === 'horizontal');
    const bs = buttons(host);
    ok('a tab button per item, in order, keyed by data-tab-id',
       bs.map((b) => b.dataset.tabId).join() === 'a,b,c,d');
    ok('every one is role=tab', bs.every((b) => b.getAttribute('role') === 'tab'));
    ok('the first is in front by default', tabs.active() === 'a'
       && bs[0].classList.contains('twm-tabs__tab--on') && bs[0].getAttribute('aria-selected') === 'true');
    ok('only the tab in front is in the tab order',
       bs.map((b) => b.tabIndex).join() === '0,-1,-1,-1');
    ok('icon and title', bs[0].querySelector('.twm-tabs__icon').textContent === 'tune'
       && bs[0].title === 'The first');
    ok('label', bs.map((b) => b.querySelector('.twm-tabs__label').textContent).join() === 'Alpha,Beta,Gamma,Delta');
    ok('a badge from the item', !bs[1].querySelector('.twm-tabs__badge').hidden
       && bs[1].querySelector('.twm-tabs__badge').textContent === '3');
    ok('no badge where none was given', bs[0].querySelector('.twm-tabs__badge').hidden === true);
    ok('an indicator by level', !bs[2].querySelector('.twm-tabs__indicator').hidden
       && bs[2].querySelector('.twm-tabs__indicator').classList.contains('twm-tabs__indicator--warning'));
    ok('dirty: the dot and the modifier', !!bs[2].querySelector('.twm-tabs__dirty')
       && bs[2].classList.contains('twm-tabs__tab--dirty'));
    ok('closable: a close mark; others none', !!bs[2].querySelector('.twm-tabs__close')
       && !bs[0].querySelector('.twm-tabs__close'));
    const t2 = createTabs(fresh(), { items: ITEMS, active: 'c' });
    ok('active picks the tab in front', t2.active() === 'c');
    ok('closable without onClose draws no close mark', !t2.root.querySelector('.twm-tabs__close'));
    ok('an unknown active falls back to the first', createTabs(fresh(), { items: ITEMS, active: 'zz' }).active() === 'a');
    ok('no items: nothing in front', createTabs(fresh(), { items: [] }).active() === null);
}

console.log('§2 keys');
{
    const host = fresh();
    const log = [];
    const tabs = createTabs(host, { items: ITEMS, onSelect: (id, item) => log.push(`${id}:${item.label}`) });
    const bs = () => buttons(host);
    bs()[0].focus();
    key(bs()[0], 'ArrowRight');
    ok('ArrowRight selects the next tab', tabs.active() === 'b');
    ok('…and focuses it', document.activeElement === bs()[1]);
    ok('…and moves the tab order with it', bs().map((b) => b.tabIndex).join() === '-1,0,-1,-1');
    key(bs()[1], 'ArrowLeft');
    ok('ArrowLeft selects the previous', tabs.active() === 'a' && document.activeElement === bs()[0]);
    key(bs()[0], 'ArrowLeft');
    ok('ArrowLeft on the first wraps to the last', tabs.active() === 'd');
    key(bs()[3], 'ArrowRight');
    ok('ArrowRight on the last wraps to the first', tabs.active() === 'a');
    key(bs()[0], 'End');
    ok('End jumps to the last', tabs.active() === 'd' && document.activeElement === bs()[3]);
    key(bs()[3], 'Home');
    ok('Home jumps to the first', tabs.active() === 'a' && document.activeElement === bs()[0]);
    ok('each move told onSelect with the item',
       log.join() === 'b:Beta,a:Alpha,d:Delta,a:Alpha,d:Delta,a:Alpha', log.join());
    const ev = new dom.window.KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true });
    bs()[0].dispatchEvent(ev);
    ok('a handled key is not the page\'s (default prevented)', ev.defaultPrevented);
    key(bs()[3], 'ArrowRight', { ctrlKey: true });
    ok('Ctrl+Arrow is left alone', tabs.active() === 'd');
    key(bs()[3], 'x');
    ok('other keys are left alone', tabs.active() === 'd');
    realClick(bs()[1].querySelector('.twm-tabs__badge'));
    ok('a click (even on the badge) selects', tabs.active() === 'b');
    log.length = 0;
    realClick(bs()[1]);
    ok('a click on the tab in front tells no one', log.length === 0);

    const re = [];
    const t2 = createTabs(fresh(), { items: ITEMS, active: 'b',
        onSelect: (id) => re.push(`select ${id}`), onReselect: (id, item) => re.push(`reselect ${id}:${item.label}`) });
    const b2 = buttons(t2.root);
    realClick(b2[1]);
    ok('onReselect hears a click on the tab already in front, with its item', re.join('|') === 'reselect b:Beta', re.join('|'));
    re.length = 0;
    realClick(b2[2]);
    t2.select('c');
    ok('…and nothing else: a click on another tab is onSelect, select() of the one in front is silent',
       re.join('|') === 'select c', re.join('|'));
    t2.destroy();
}

console.log('§3 update(items, activeId)');
{
    const host = fresh();
    const log = [];
    const tabs = createTabs(host, { items: ITEMS, active: 'c', onSelect: (id) => log.push(id) });
    const before = buttons(host);
    tabs.update([ITEMS[3], ITEMS[2], { id: 'e', label: 'Epsilon' }]);
    ok('the active id still exists: it stays in front', tabs.active() === 'c');
    ok('…and no one is told of a change that did not happen', log.length === 0);
    ok('order follows the items', buttons(host).map((b) => b.dataset.tabId).join() === 'd,c,e');
    ok('a kept tab keeps its button', buttons(host)[1] === before[2] && buttons(host)[0] === before[3]);
    ok('a removed tab\'s button is gone', !host.querySelector('[data-tab-id="a"]'));
    ok('the new button is painted off',
       !buttons(host)[2].classList.contains('twm-tabs__tab--on') && buttons(host)[2].tabIndex === -1);
    tabs.update([{ id: 'x', label: 'X' }, { id: 'y', label: 'Y' }]);
    ok('the active id is gone: the first is selected', tabs.active() === 'x');
    ok('…and that is told', log.join() === 'x');
    tabs.update([{ id: 'x', label: 'X' }, { id: 'y', label: 'Y renamed' }], 'y');
    ok('activeId selects when present', tabs.active() === 'y');
    ok('a kept tab is redrawn', buttons(host)[1].querySelector('.twm-tabs__label').textContent === 'Y renamed');
    tabs.update([{ id: 'x', label: 'X' }, { id: 'y', label: 'Y' }], 'nope');
    ok('an activeId not present: the current one stays', tabs.active() === 'y');
    tabs.update([{ id: 'p', label: 'P' }, { id: 'q', label: 'Q' }], 'nope');
    ok('neither present: the first', tabs.active() === 'p');
    tabs.update([]);
    ok('no items: nothing in front', tabs.active() === null && buttons(host).length === 0);
    tabs.update([{ id: 'r', label: 'R' }]);
    ok('items again: the first', tabs.active() === 'r');
    tabs.update([{ id: 'r', label: 'R' }, { id: 'r', label: 'dup' }]);
    ok('a duplicate id is drawn once', buttons(host).length === 1);
}

console.log('§4 panes');
{
    const log = [];
    const mountPane = (item, el, api) => {
        log.push(`mount ${item.id}`);
        el.textContent = `${item.label} body`;
        return { api, onShow: () => log.push(`show ${item.id}`), destroy: () => log.push(`destroy ${item.id}`) };
    };
    const host = fresh();
    const tabs = createTabs(host, { items: ITEMS, active: 'b', mountPane });
    const root = host.querySelector('.twm-tabs');
    ok('a strip and a body', [...root.children].map((c) => c.className).join(' ') === 'twm-tabs__tabs twm-tabs__body');
    ok('only the tab in front is mounted at creation', log.join('|') === 'mount b|show b', log.join('|'));
    ok('…its pane a tabpanel labelled by its tab', (() => {
        const pane = host.querySelector('.twm-tabs-pane[data-tab-id="b"]');
        const tab = host.querySelector('button[data-tab-id="b"]');
        return pane.getAttribute('role') === 'tabpanel' && pane.getAttribute('aria-labelledby') === tab.id
            && tab.getAttribute('aria-controls') === pane.id;
    })());
    ok('a pane never selected has no instance and no element',
       tabs.instance('c') === null && !host.querySelector('.twm-tabs-pane[data-tab-id="c"]'));
    ok('the pane gets the strip api, inside the call', tabs.instance('b').api === tabs);
    log.length = 0;
    tabs.select('c');
    ok('first selection mounts, then shows', log.join('|') === 'mount c|show c', log.join('|'));
    tabs.select('b');
    tabs.select('c');
    ok('later selections only show — mounted once', log.join('|') === 'mount c|show c|show b|show c', log.join('|'));
    ok('only the pane in front is visible',
       host.querySelector('.twm-tabs-pane[data-tab-id="b"]').hidden === true
       && host.querySelector('.twm-tabs-pane[data-tab-id="c"]').hidden === false);
    log.length = 0;
    tabs.update([ITEMS[0], ITEMS[2]]);
    ok('an item that goes has its pane destroyed', log.join('|') === 'destroy b', log.join('|'));
    ok('…and its element removed', !host.querySelector('.twm-tabs-pane[data-tab-id="b"]'));
    ok('instances() lists the mounted ones', tabs.instances().length === 1);

    const eagerLog = [];
    createTabs(fresh(), {
        items: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B', eager: true }, { id: 'c', label: 'C' }],
        mountPane: (item) => { eagerLog.push(item.id); return null; },
    });
    ok('eager opts a pane into mounting at once, before the one in front', eagerLog.join() === 'b,a', eagerLog.join());

    const addLog = [];
    const t4 = createTabs(fresh(), {
        items: [{ id: 'a', label: 'A' }],
        mountPane: (item) => { addLog.push(`mount ${item.id}`); return { onShow: () => addLog.push(`show ${item.id}`) }; },
        onSelect: (id) => addLog.push(`select ${id}`),
    });
    addLog.length = 0;
    t4.update([{ id: 'a', label: 'A' }, { id: 'x', label: 'X', eager: true }, { id: 'y', label: 'Y' },
               { id: 'z', label: 'Z', eager: true }]);
    ok('an eager item an update adds mounts in that update, in order; a lazy one does not',
       addLog.join('|') === 'mount x|mount z', addLog.join('|'));
    ok('…hidden behind the tab in front', t4.active() === 'a' && t4.instance('x') && t4.instance('z')
       && t4.instance('y') === null);
    addLog.length = 0;
    t4.update([{ id: 'w', label: 'W', eager: true }, { id: 'x', label: 'X', eager: true }], 'x');
    ok('…before the tab in front is settled, and a mounted one is not mounted again',
       addLog.join('|') === 'mount w|show x|select x', addLog.join('|'));
    addLog.length = 0;
    t4.update([{ id: 'w', label: 'W', eager: true }, { id: 'x', label: 'X', eager: true }]);
    ok('an update that adds nothing mounts nothing', addLog.length === 0, addLog.join('|'));

    const err = console.error; console.error = () => {};
    const t3 = createTabs(fresh(), { items: ITEMS, mountPane: (item) => { if (item.id === 'a') throw new Error('boom'); return {}; } });
    console.error = err;
    ok('a pane that throws leaves the strip working', t3.select('b') && t3.active() === 'b');
}

console.log('§5 the bus is opt-in');
{
    let ons = 0;
    const spy = { on: (...args) => { ons++; return bus.on(...args); } };
    const bus = new EventBus();
    createTabs(fresh(), { items: ITEMS, eventBus: spy });
    ok('a bus without an event name: no subscription', ons === 0);
    createTabs(fresh(), { items: ITEMS, selectEvent: 'x:show' });
    ok('an event name without a bus: nothing to subscribe to, nothing thrown', true);
    const tabs = createTabs(fresh(), { items: ITEMS, eventBus: spy, selectEvent: 'views:show' });
    ok('an event name: exactly one subscription', ons === 1);
    bus.emit('views:show', { id: 'c' });
    ok('the event selects by payload.id', tabs.active() === 'c');
    bus.emit('views:show', { id: 'nope' });
    ok('an unknown id changes nothing', tabs.active() === 'c');
    const t2 = createTabs(fresh(), { items: ITEMS, eventBus: bus, selectEvent: 'other:show', selectFrom: (p) => p?.tab });
    bus.emit('other:show', { tab: 'd' });
    ok('selectFrom maps the payload', t2.active() === 'd');
    t2.destroy();
    bus.emit('other:show', { tab: 'a' });
    ok('a destroyed strip lets the bus go', t2.active() === 'd' && bus.listenerCount('other:show') === 0);
}

console.log('§6 setBadge / setIndicator');
{
    const host = fresh();
    const tabs = createTabs(host, { items: ITEMS });
    const badge = () => host.querySelector('[data-tab-id="a"] .twm-tabs__badge');
    tabs.setBadge('a', 4, 'alert');
    ok('a count, coloured', !badge().hidden && badge().textContent === '4'
       && badge().className === 'twm-tabs__badge twm-tabs__badge--alert');
    tabs.setBadge('a', 120);
    ok('99+ above 99, neutral without a level', badge().textContent === '99+' && badge().className === 'twm-tabs__badge');
    tabs.setBadge('a', 0);
    ok('zero removes it', badge().hidden === true);
    tabs.update(ITEMS.map((i) => (i.id === 'b' ? { ...i, badge: { count: 2, level: 'info' } } : i)));
    ok('an item badge {count, level}', host.querySelector('[data-tab-id="b"] .twm-tabs__badge').className
       === 'twm-tabs__badge twm-tabs__badge--info');
    const dot = () => host.querySelector('[data-tab-id="a"] .twm-tabs__indicator');
    ok('no indicator to begin with', dot().hidden === true);
    tabs.setIndicator('a', true);
    ok('true: the neutral dot', !dot().hidden && dot().className === 'twm-tabs__indicator');
    tabs.setIndicator('a', 'alert');
    ok('a level: coloured', dot().classList.contains('twm-tabs__indicator--alert'));
    tabs.setIndicator('a', null);
    ok('falsy: gone', dot().hidden === true);
    tabs.setBadge('nope', 3); tabs.setIndicator('nope', true);
    ok('an unknown tab is ignored', true);
}

console.log('§7 close, context menu, reorder');
{
    const host = fresh();
    const closed = [];
    const menus = [];
    const tabs = createTabs(host, {
        items: ITEMS, onClose: (id) => closed.push(id),
        onContextMenu: (id, e, item) => menus.push(`${id}:${item.label}:${e.type}`),
    });
    realClick(host.querySelector('[data-tab-id="c"] .twm-tabs__close'));
    ok('the close mark closes, and does not select', closed.join() === 'c' && tabs.active() === 'a');
    key(host.querySelector('[data-tab-id="c"]'), 'Delete');
    ok('Delete closes a closable tab', closed.join() === 'c,c');
    key(host.querySelector('[data-tab-id="a"]'), 'Delete');
    ok('…and not one that is not', closed.join() === 'c,c');
    realClick(host.querySelector('[data-tab-id="c"]'), 1);
    ok('a middle click closes a closable tab', closed.join() === 'c,c,c');
    const ev = new dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    host.querySelector('[data-tab-id="b"] .twm-tabs__label').dispatchEvent(ev);
    ok('right-click asks the caller, with the item', menus.join() === 'b:Beta:contextmenu' && ev.defaultPrevented);
    const plain = createTabs(fresh(), { items: ITEMS });
    const ev2 = new dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    plain.root.querySelector('[data-tab-id="b"]').dispatchEvent(ev2);
    ok('no onContextMenu: the browser\'s menu is left alone', !ev2.defaultPrevented);
    ok('no onReorder: tabs are not draggable', !plain.root.querySelector('[draggable="true"]'));
    const order = [];
    const re = createTabs(fresh(), { items: ITEMS, onReorder: (ids) => order.push(ids.join()) });
    ok('onReorder: every tab is draggable',
       [...re.root.querySelectorAll('.twm-tabs__tab')].every((b) => b.getAttribute('draggable') === 'true'));
    re.update([...ITEMS, { id: 'e', label: 'E' }]);
    ok('…including one added by update', re.root.querySelector('[data-tab-id="e"]').getAttribute('draggable') === 'true');
}

console.log('§8 overflow and compact');
{
    const host = fresh();
    const tabs = createTabs(host, { items: ITEMS });
    const strip = host.querySelector('.twm-tabs__tabs');
    Object.defineProperty(strip, 'scrollWidth', { configurable: true, get: () => 600 });
    Object.defineProperty(strip, 'clientWidth', { configurable: true, get: () => 200 });
    const wheel = new dom.window.WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true });
    strip.dispatchEvent(wheel);
    ok('a vertical wheel scrolls the strip sideways', strip.scrollLeft === 100 && wheel.defaultPrevented);
    const horiz = new dom.window.WheelEvent('wheel', { deltaX: 50, deltaY: 0, bubbles: true, cancelable: true });
    strip.dispatchEvent(horiz);
    ok('a horizontal gesture is the browser\'s', !horiz.defaultPrevented);
    const css = readFileSync(resolvePath(HERE, '../css/flexdesk.css'), 'utf8');
    ok('the strip scrolls rather than wraps', /\.twm-tabs__tabs\s*\{[^}]*overflow-x:\s*auto[^}]*white-space:\s*nowrap/s.test(css));
    ok('compact: the modifier on the root',
       createTabs(fresh(), { items: ITEMS, compact: true }).root.className === 'twm-tabs twm-tabs--compact'
       && tabs.root.className === 'twm-tabs');
    ok('compact is styled', /\.twm-tabs--compact\s+\.twm-tabs__tabs\s*\{/.test(css));
}

console.log('§9 destroy');
{
    const log = [];
    const host = fresh();
    const tabs = createTabs(host, { items: ITEMS, mountPane: (item) => ({ destroy: () => log.push(item.id) }) });
    tabs.select('c');
    tabs.destroy();
    ok('every mounted pane is destroyed', log.join() === 'a,c', log.join());
    ok('the markup is gone', host.children.length === 0);
    tabs.destroy();
    ok('a second destroy is harmless', log.length === 2);
    ok('select after destroy does nothing', tabs.select('b') === false);
}

console.log('§10 CSS');
{
    const css = readFileSync(resolvePath(HERE, '../css/flexdesk.css'), 'utf8');
    const classes = ['twm-tabs', 'twm-tabs--compact', 'twm-tabs__tabs', 'twm-tabs__tab', 'twm-tabs__tab--on',
        'twm-tabs__tab--dirty', 'twm-tabs__icon', 'twm-tabs__label', 'twm-tabs__badge', 'twm-tabs__indicator',
        'twm-tabs__dirty', 'twm-tabs__close', 'twm-tabs__body', 'twm-tabs-pane',
        ...TAB_LEVELS.flatMap((l) => [`twm-tabs__badge--${l}`, `twm-tabs__indicator--${l}`])];
    for (const c of classes) ok(`.${c} is styled`, new RegExp(`\\.${c}[\\s{\\[:,.]`).test(css));
}

console.log(failures ? `\n${failures} FAILED` : '\ntabs: all assertions passed');
process.exit(failures ? 1 : 0);
