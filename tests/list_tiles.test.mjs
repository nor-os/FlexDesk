/**
 * ══ THE LIST AND PEOPLE TILES, AND THE BOARD'S SCOPE (0.16.1) ══
 *
 * `src/tiles/list_tiles.js` and `src/tiles/scope_picker.js`, and the scope half
 * of `TileGrid`. BugDesk's Tracker home (BugDesk STORY-0047) is the first user:
 * lists of late work with a right-click menu per row, who has what, and one
 * "Everyone / Assigned by me / Out with others" switch every tile follows.
 * What this suite pins:
 *
 *   §1  nothing registers at import; registerListTiles() is idempotent; the barrel
 *   §2  a list: lead, title, cells, tones, the embedder's classes, the count
 *   §3  an empty list keeps its bar and says what empty means; null is the empty state
 *   §4  click, Enter and Space activate with the event; arrows move; the bar's button
 *   §5  right-click, Shift+F10: the row's menu, and the choice reaches the hook
 *   §6  the people tile: names, nobody, pills, the count
 *   §7  groupByPerson's order
 *   §8  the scope picker: one pressed, onChange only on a change, setValue silent
 *   §9  TileGrid.setScope reaches every tile, new ones too, and the data source
 *   §10 the config round-trips through getLayout()/setLayout(); text is text
 *   §11 dispose takes the listeners with it
 *
 *     node tests/list_tiles.test.mjs              # from ../FlexDesk
 *
 * jsdom is borrowed from the sibling Tables checkout; absent, this SKIPS loudly.
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
    console.log('list tiles: SKIPPED — needs jsdom '
        + '(`cd ../Tables/web && npm install`, or `npm i -D jsdom` here)');
    process.exit(0);
}

const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>',
                      { url: 'http://localhost/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'Event',
                   'CustomEvent', 'MouseEvent', 'PointerEvent', 'KeyboardEvent',
                   'getComputedStyle', 'navigator', 'requestAnimationFrame',
                   'cancelAnimationFrame', 'MutationObserver', 'ResizeObserver',
                   'DOMRect', 'localStorage']) {
    if (dom.window[key] !== undefined && globalThis[key] === undefined) {
        globalThis[key] = dom.window[key];
    }
}
globalThis.Event = dom.window.Event;
globalThis.CustomEvent = dom.window.CustomEvent;
if (globalThis.PointerEvent === undefined) globalThis.PointerEvent = dom.window.MouseEvent;
if (globalThis.ResizeObserver === undefined) {
    globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
}

const registry = await import('../src/tiles/tile_registry.js');
const { TileGrid } = await import('../src/tiles/tile_grid.js');
const { ListTile, PeopleTile, registerListTiles, groupByPerson, normalizeListData } =
    await import('../src/tiles/list_tiles.js');
const { createScopePicker } = await import('../src/tiles/scope_picker.js');
const { hideContextMenu } = await import('../src/ui/components/context_menu.js');
const barrel = await import('../tiles.js');

// ── harness ─────────────────────────────────────────────────────────────
let failures = 0;
function ok(what, cond, why = '') {
    if (cond) { console.log(`  ok   ${what}`); return; }
    failures += 1;
    console.log(`  FAIL ${what}${why ? `\n       ${why}` : ''}`);
}
function check(what, actual, expected, why = '') {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    ok(what, a === e, `${why ? `${why}\n       ` : ''}expected ${e}, got ${a}`);
}

function mountTile(Tile, config = {}, extra = {}) {
    const container = document.createElement('div');
    document.getElementById('root').appendChild(container);
    const tile = new Tile({ id: `t-${Math.random().toString(36).slice(2, 7)}`, grid: null, config, ...extra });
    tile.mount(container);
    return tile;
}
const rowsOf = (tile) => [...tile.contentElement.querySelectorAll('[data-row-key]')];
/** The text of every text node, each trimmed, joined by one space: what a reader sees, word by word. */
const text = (e) => {
    if (!e) return '';
    const out = [];
    const walk = document.createTreeWalker(e, window.NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) if (n.nodeValue.trim()) out.push(n.nodeValue.trim());
    return out.join(' ').replace(/\s+/g, ' ');
};
const key = (target, k, init = {}) => target.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }));
const click = (target, init = {}) => target.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true, ...init }));
const menuEvent = (target) => {
    const e = new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 50 });
    target.dispatchEvent(e);
    return e;
};

const ROWS = [
    { key: '7', icon: 'task', iconTitle: 'Task', lead: 'TASK-0007', title: 'Migration sign-off',
      className: 'app-row', cells: [{ text: 'priya' }, { text: '9 days late', tone: 'danger', title: '2026-10-08' },
          { text: 'In progress', className: 'app-pill app-pill--wip' }] },
    { key: '8', lead: 'STORY-0008', title: 'Second', cells: [{ text: 'nobody', tone: 'muted' }] },
    { key: '9', lead: 'STORY-0009', title: 'Third' },
];

console.log('\ntiles: the list and people tiles, and the board\'s scope\n');

// §1 ────────────────────────────────────────────────────────────────────
{
    ok('nothing registers at import', !registry.getWidget('flexdesk.list') && !registry.getWidget('flexdesk.people'));
    registerListTiles();
    registerListTiles();
    ok('registerListTiles() registers both', registry.getWidget('flexdesk.list') === ListTile
        && registry.getWidget('flexdesk.people') === PeopleTile);
    ok('a second call registers nothing new',
        registry.getWidgetCatalog().filter((w) => w.type === 'flexdesk.list').length === 1);
    ok('the barrel exports the tiles, the helper and the picker', barrel.ListTile === ListTile
        && barrel.PeopleTile === PeopleTile && barrel.registerListTiles === registerListTiles
        && barrel.groupByPerson === groupByPerson && barrel.createScopePicker === createScopePicker);
}

// §2 ────────────────────────────────────────────────────────────────────
{
    const t = mountTile(ListTile, { title: 'Overdue' });
    ok('the header reads config.title', text(t.element.querySelector('.tile-title')) === 'Overdue');
    t.setData({ rows: ROWS, total: 5, action: { label: 'Open as a list', icon: 'list' } });
    const rows = rowsOf(t);
    check('one row per item, keyed', rows.map((r) => r.dataset.rowKey), ['7', '8', '9']);
    const first = rows[0];
    check('a row is a button with a tab stop', [first.getAttribute('role'), first.tabIndex], ['button', 0]);
    ok('the lead, the title and the cells are there in order',
        text(first) === 'task TASK-0007 Migration sign-off priya 9 days late In progress', text(first));
    ok('a tone is a class', first.querySelector('.fd-list-tile__cell--danger')?.title === '2026-10-08');
    ok('the embedder\'s classes are kept', first.classList.contains('app-row')
        && !!first.querySelector('.app-pill.app-pill--wip'));
    ok('the icon carries its title', first.querySelector('.fd-list-tile__icon')?.title === 'Task');
    check('the count says how many of how many', text(t.contentElement.querySelector('.fd-list-tile__count')), '3 of 5');
    ok('the bar has the button', text(t.contentElement.querySelector('[data-list-action]')) === 'list Open as a list');
    ok('the header is not rewritten by the count', text(t.element.querySelector('.tile-title')) === 'Overdue');

    t.update(undefined, { max_rows: 2 });
    check('max_rows cuts the list and the count says so', [rowsOf(t).length,
        text(t.contentElement.querySelector('.fd-list-tile__count'))], [2, '2 of 5']);
    t.setData(ROWS);
    t.update(undefined, { max_rows: 0 });
    check('an array is {rows}; total defaults to the rows', text(t.contentElement.querySelector('.fd-list-tile__count')), '3');
    t.setData({ rows: [ROWS[0], { ...ROWS[0], title: 'again' }, { title: 'no key' }] });
    check('a repeated key and a keyless row are left out', rowsOf(t).map((r) => r.dataset.rowKey), ['7']);
    check('normalizeListData answers null for nothing', [normalizeListData(null), normalizeListData({})], [null, null]);
}

// §3 ────────────────────────────────────────────────────────────────────
{
    const t = mountTile(ListTile, { empty_text: 'Nothing is late.' });
    t.setData({ rows: [], action: { label: 'Open as a list' } });
    ok('an empty list keeps its bar and its button', !!t.contentElement.querySelector('[data-list-action]')
        && text(t.contentElement.querySelector('.fd-list-tile__count')) === '0');
    check('…and says config.empty_text', text(t.contentElement.querySelector('.fd-list-tile__empty')), 'Nothing is late.');
    t.setData({ rows: [], empty: 'Nobody owes you anything.' });
    check('the data\'s own empty line wins', text(t.contentElement.querySelector('.fd-list-tile__empty')), 'Nobody owes you anything.');
    t.setData(null);
    ok('null is the empty state', !!t.contentElement.querySelector('.tile-empty'));
    t.showEmpty('Open its settings.');
    ok('showEmpty is how an embedder says "not set up"', text(t.contentElement.querySelector('.tile-empty')).includes('Open its settings.'));
}

// §4 ────────────────────────────────────────────────────────────────────
{
    const seen = [];
    const actions = [];
    const t = mountTile(ListTile, {}, {
        onRowActivate: ({ row, event }) => seen.push([row.key, event.type, !!event.ctrlKey, event.key || '']),
        onAction: ({ event }) => actions.push(event.type),
    });
    t.setData({ rows: ROWS, action: { label: 'All' } });
    let rows = rowsOf(t);
    click(rows[0].querySelector('.fd-list-tile__title'));
    click(rows[1], { ctrlKey: true });
    key(rows[2], 'Enter');
    key(rows[2], ' ');
    key(rows[2], 'Enter', { altKey: true });
    check('click, Ctrl-click, Enter and Space activate with the event; Alt+Enter does not',
        seen, [['7', 'click', false, ''], ['8', 'click', true, ''], ['9', 'keydown', false, 'Enter'], ['9', 'keydown', false, ' ']]);
    rows[0].focus();
    key(rows[0], 'ArrowDown');
    ok('Down moves to the next row', document.activeElement === rows[1]);
    key(rows[1], 'End');
    ok('End to the last', document.activeElement === rows[2]);
    key(rows[2], 'ArrowDown');
    ok('Down on the last stays', document.activeElement === rows[2]);
    key(rows[2], 'Home');
    ok('Home to the first', document.activeElement === rows[0]);
    click(t.contentElement.querySelector('[data-list-action]'));
    check('the bar\'s button calls onAction', actions, ['click']);
    t.setData({ rows: ROWS.slice(1) });
    rows = rowsOf(t);
    seen.length = 0;
    click(rows[0]);
    check('the listeners survive a render', seen.map((s) => s[0]), ['8']);
    const thrower = mountTile(ListTile, {}, { onRowActivate: () => { throw new Error('boom'); } });
    thrower.setData(ROWS);
    const err = console.error; let logged = 0; console.error = () => { logged += 1; };
    try { click(rowsOf(thrower)[0]); } finally { console.error = err; }
    ok('a hook that throws is reported, not thrown into the click', logged === 1);
}

// §5 ────────────────────────────────────────────────────────────────────
{
    const chosen = [];
    const asked = [];
    const t = mountTile(ListTile, {}, {
        rowMenu: ({ row }) => { asked.push(row.key); return row.key === '9' ? [] : [
            { label: 'Open', icon: 'open_in_new', action: 'open' },
            { separator: true },
            { label: 'Delete…', icon: 'delete', action: 'delete', danger: true },
        ]; },
        onRowMenuAction: ({ action, row }) => chosen.push([action, row.key]),
    });
    t.setData(ROWS);
    const rows = rowsOf(t);
    const e = menuEvent(rows[0].querySelector('.fd-list-tile__lead'));
    ok('right-click on a row stops the browser\'s menu', e.defaultPrevented);
    const menu = document.querySelector('.twm-context-menu');
    check('…and shows the row\'s', [...(menu?.querySelectorAll('[role="menuitem"]') || [])].map(text),
        ['open_in_new Open', 'delete Delete…']);
    [...menu.querySelectorAll('[role="menuitem"]')][1].click();
    check('the choice reaches onRowMenuAction with the row', chosen, [['delete', '7']]);
    hideContextMenu();
    menuEvent(rows[2]);
    ok('no items: no menu', !document.querySelector('.twm-context-menu'));
    key(rows[1], 'F10', { shiftKey: true });
    ok('Shift+F10 opens the row\'s menu', !!document.querySelector('.twm-context-menu'));
    hideContextMenu();
    key(rows[1], 'ContextMenu');
    ok('so does the context-menu key', !!document.querySelector('.twm-context-menu'));
    hideContextMenu();
    check('rowMenu was asked for each row', asked, ['7', '9', '8', '8']);
    const plain = mountTile(ListTile);
    plain.setData(ROWS);
    menuEvent(rowsOf(plain)[0]);
    ok('no rowMenu: no menu', !document.querySelector('.twm-context-menu'));
    const drag = mountTile(ListTile, {}, { rowsDraggable: true });
    drag.setData(ROWS);
    ok('rowsDraggable makes rows draggable', rowsOf(drag).every((r) => r.draggable) && !rowsOf(plain)[0].draggable);
}

// §6 ────────────────────────────────────────────────────────────────────
{
    const seen = [];
    const t = mountTile(PeopleTile, { title: 'Who has what' }, { onRowActivate: ({ row }) => seen.push(row.key) });
    ok('the people tile reads its title', text(t.element.querySelector('.tile-title')) === 'Who has what');
    t.setData({ people: [
        { key: 'priya', name: 'priya', count: 4, pills: [{ text: '2 overdue', tone: 'danger' }, { text: 'next 2026-10-20' }] },
        { key: '', name: 'Nobody', muted: true, count: 1, pills: [{ text: '1 undated', tone: 'muted' }], title: 'Show it' },
        { key: 'bob_agent', name: 'bob_agent', icon: 'smart_toy', count: 2, countLabel: 'items' },
    ] });
    const rows = rowsOf(t);
    check('one row per person', rows.map((r) => r.dataset.rowKey), ['priya', '', 'bob_agent']);
    check('name, pills and "N open"', text(rows[0]), 'person priya 2 overdue next 2026-10-20 4 open');
    ok('nobody is muted, with its own icon and title', rows[1].querySelector('.fd-people-tile__name--muted')
        && text(rows[1].querySelector('.fd-list-tile__icon')) === 'person_off' && rows[1].title === 'Show it');
    ok('a tone on a pill', !!rows[0].querySelector('.fd-people-tile__pill--danger'));
    check('an icon and a count label of its own', text(rows[2]), 'smart_toy bob_agent 2 items');
    click(rows[1]);
    check('a click activates the person, nobody included', seen, ['']);
    t.update(undefined, { count_label: '' });
    check('count_label can be empty', text(rowsOf(t)[0].querySelector('.fd-people-tile__count')), '4');
}

// §7 ────────────────────────────────────────────────────────────────────
{
    const g = groupByPerson([{ a: 'x' }, { a: 'y' }, { a: '' }, { a: 'y' }, { a: null }, { a: 'x' }, { a: 'z' }], (i) => i.a);
    check('most first, then by key, nobody last among equals', g.map((p) => [p.key, p.items.length]),
        [['x', 2], ['y', 2], ['', 2], ['z', 1]]);
    check('nothing is no groups', groupByPerson(null, () => ''), []);
}

// §8 ────────────────────────────────────────────────────────────────────
{
    const changes = [];
    const p = createScopePicker({
        label: 'Scope', value: 'byme',
        options: [{ value: 'all', label: 'Everyone' }, { value: 'byme', label: 'Assigned by me', hint: 'reporter is me' },
            { value: 'others', label: 'Out with others' }],
        onChange: (v) => changes.push(v),
    });
    document.getElementById('root').append(p.element);
    const btns = [...p.element.querySelectorAll('button')];
    check('a labelled group of buttons', [p.element.getAttribute('role'), p.element.getAttribute('aria-label'), btns.map(text)],
        ['group', 'Scope', ['Everyone', 'Assigned by me', 'Out with others']]);
    check('one pressed', btns.map((b) => b.getAttribute('aria-pressed')), ['false', 'true', 'false']);
    ok('the hint is the tooltip', btns[1].title === 'reporter is me');
    btns[1].click();
    check('pressing the pressed one calls nothing', changes, []);
    btns[2].click();
    check('pressing another calls onChange', [changes, p.value], [['others'], 'others']);
    p.setValue('all');
    check('setValue presses without calling', [changes.length, btns.map((b) => b.classList.contains('fd-scope-picker__btn--on'))],
        [1, [true, false, false]]);
    p.setValue('nonsense');
    ok('an unknown value is ignored', p.value === 'all');
    btns[0].focus();
    key(btns[0], 'ArrowRight');
    ok('Right moves the focus along', document.activeElement === btns[1]);
    ok('an unknown starting value presses the first', createScopePicker({ options: [{ value: 'a' }, { value: 'b' }], value: 'q' }).value === 'a');
    p.dispose();
    ok('dispose removes it', !p.element.isConnected);
}

// §9 ────────────────────────────────────────────────────────────────────
{
    registerListTiles();
    const container = document.createElement('div');
    document.getElementById('root').append(container);
    const told = [];
    const grid = new TileGrid({ container, showToolbar: false, scope: 'all', onScopeChange: (s) => told.push(s) });
    const a = grid.addTile('flexdesk.list', { x: 0, y: 0, w: 6, h: 4 }, {}, 'a');
    const hooked = [];
    a.onScopeChange = (s) => hooked.push([s, a.scope]);
    ok('a tile gets the grid\'s scope when it is added', a.scope === 'all');
    ok('setting it changes it', grid.setScope('byme') === true);
    check('every tile has it, through scope and onScopeChange', [a.scope, hooked], ['byme', [['byme', 'byme']]]);
    check('the grid\'s onScopeChange is told', told, ['byme']);
    ok('the same scope again does nothing', grid.setScope('byme') === false && told.length === 1);
    const b = grid.addTile('flexdesk.people', { x: 6, y: 0, w: 6, h: 4 }, {}, 'b');
    ok('a tile added later starts with the current scope', b.scope === 'byme');
    ok('the scope is not part of the layout', !JSON.stringify(grid.getLayout()).includes('byme'));
    grid.setScope({ who: 'me' });
    ok('a scope may be an object, compared by value', grid.setScope({ who: 'me' }) === false);

    const loads = [];
    const c2 = document.createElement('div');
    document.getElementById('root').append(c2);
    const g2 = new TileGrid({ container: c2, showToolbar: false, dataSource: { resolve: async () => null } });
    const lt = g2.addTile('flexdesk.list', { x: 0, y: 0, w: 6, h: 4 }, {}, 'l');
    lt.loadData = (opts) => { loads.push([lt.scope, !!opts?.force]); return Promise.resolve(); };
    g2.setScope('others');
    check('a grid with a data source reloads its tiles, past the cache', loads, [['others', true]]);
    grid.dispose(); g2.dispose();
}

// §10 ───────────────────────────────────────────────────────────────────
{
    const container = document.createElement('div');
    document.getElementById('root').append(container);
    const grid = new TileGrid({ container, showToolbar: false });
    grid.addTile('flexdesk.list', { x: 0, y: 0, w: 6, h: 4 }, { title: 'Soon', max_rows: 5, binding: { any: 'thing' } }, 'l1');
    const layout = grid.getLayout();
    grid.setLayout(JSON.parse(JSON.stringify(layout)));
    const back = grid.getLayout()[0];
    check('the config round-trips, an embedder\'s keys included', [back.type, back.config.title, back.config.max_rows, back.config.binding],
        ['flexdesk.list', 'Soon', 5, { any: 'thing' }]);
    const t = grid.tiles.get('l1');
    t.setData([{ key: 'x', title: '<img src=x onerror=alert(1)>', lead: '<b>', cells: [{ text: '<i>' }] }]);
    ok('titles, leads and cells are text, never markup', !t.contentElement.querySelector('img,b,i')
        && text(rowsOf(t)[0]).includes('<img src=x onerror=alert(1)>'));
    grid.dispose();
}

// §11 ───────────────────────────────────────────────────────────────────
{
    const seen = [];
    const t = mountTile(ListTile, {}, { onRowActivate: ({ row }) => seen.push(row.key) });
    t.setData(ROWS);
    const content = t.contentElement;
    const row = rowsOf(t)[0];
    t.dispose();
    content.append(row);
    click(row);
    check('after dispose a click reaches nothing', seen, []);
    ok('and the tile forgets its rows', t.itemFor('7') === null);
}

console.log(failures === 0
    ? '\nall assertions passed\n'
    : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
