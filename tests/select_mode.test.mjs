/**
 * STORY-0016 `selectToggle` / `selectMode` / `setSelectMode` — A SELECT MODE.
 *
 * A list whose click opens a row made picking twenty rows a Ctrl-click
 * marathon, with only the highlight to say which were picked. With
 * `selectToggle` the table draws a narrow leading column whose header toggles
 * a select mode: checkboxes, a plain click that ticks, and nothing that opens.
 *
 *   §0  without the keys: no select column, the saved blob is 0.11's
 *   §1  the column: a toggle in its header, an (unshown) box per row; not a
 *       data column (copy, ctx.colIdx, filter row, resizers)
 *   §2  the mode: toggle / setSelectMode / isSelectMode / onSelectModeChange
 *   §3  in the mode: a click ticks, Shift-click adds a range, Space ticks,
 *       the arrows keep the ticks, nothing opens, a right-click keeps them
 *   §4  select-all: every row the filters let through; checked/mixed/clear
 *   §5  widths: remembered widths stay on their columns (a blob without the
 *       column is shifted onto it), and the column is never remembered
 *   §6  a single-select table ignores the keys
 *   §7  Escape: clears the ticks, then leaves the mode
 *   §8  new rows (setData) keep the ticks by getRowKey in the mode, and only there
 *
 * Against 0.11.0, §1–§7 fail.
 *
 *     node tests/select_mode.test.mjs
 */
import { dataTableEnv } from './dt_env.mjs';

const T = await dataTableEnv('select mode');
const { check, ok, section, done, mount, bodyRows, click, doubleClick, key, mouse, document } = T;

const headers = ['Id', 'Name', 'Score'];
const rows = [['b1', 'Alpha', 30], ['b2', 'Bravo', 10], ['b3', 'Charlie', 20], ['b4', 'Delta', 40]];

const headRow = (host) => host.querySelector('.twm-preview-table-header-wrap thead tr:first-child');
const toggle = (host) => host.querySelector('.twm-dt-select-toggle');
const selectAll = (host) => host.querySelector('.twm-dt-select-all');
const boxes = (host) => bodyRows(host).map((tr) => tr.querySelector('.twm-dt-select-box')?.checked);
const tableEl = (host) => host.querySelector('.twm-preview-table-wrap table');
function memoryStore(seed = {}) {
    const map = JSON.parse(JSON.stringify(seed));
    return { map, ready: () => Promise.resolve(map), get: (k) => map[k] || null,
             set: (k, s) => { map[k] = JSON.parse(JSON.stringify(s)); } };
}

section('§0 without the keys');
{
    const store = memoryStore();
    const { host, table } = mount({ headers, rows, sortable: true, stateStore: store, persistKey: 'q' });
    ok('no select column', !host.querySelector('.twm-dt-select-cell'));
    check('the first cell is data', bodyRows(host)[0].children[0].textContent, 'b1');
    table.sortBy(0);
    check('the blob is 0.11\'s', Object.keys(store.map.q), ['sortColumn', 'sortAscending', 'filters', 'colWidths']);
    check('isSelectMode', table.isSelectMode(), false);
    check('setSelectMode does nothing', table.setSelectMode(true), false);
    table.dispose();
}

section('§1 the column');
{
    const ctxs = [];
    const { host, table } = mount({
        headers, rows, selectToggle: true, filterable: true, showRowNumbers: true,
        contextMenuItems: (row, i, ctx) => { ctxs.push(ctx); return [{ label: 'X', action: 'x' }]; },
    });
    const ths = [...headRow(host).children];
    ok('the first header is the select column', ths[0].classList.contains('twm-dt-select-cell'));
    ok('…holding the toggle', ths[0].contains(toggle(host)));
    check('the toggle says what it does', toggle(host).title, 'Select multiple');
    check('aria-pressed off', toggle(host).getAttribute('aria-pressed'), 'false');
    ok('no select-all outside the mode', !selectAll(host));
    check('then the row number, then the data', ths.slice(1).map((th) => th.firstChild?.textContent ?? th.textContent), ['#', 'Id', 'Name', 'Score']);
    const r0 = bodyRows(host)[0];
    ok('every row has a box', bodyRows(host).every((tr) => tr.children[0].querySelector('.twm-dt-select-box')));
    check('…and its data after the number', [...r0.children].slice(1).map((td) => td.textContent), ['1', 'b1', 'Alpha', '30']);
    check('the filter row has a cell for it', host.querySelectorAll('.twm-data-table__filter-row > *').length, 5);
    ok('no resize grip on it', !ths[0].querySelector('.twm-dt-col-resizer'));
    ok('…but on the data columns', ths[2].querySelector('.twm-dt-col-resizer'));
    r0.children[0].dispatchEvent(new T.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    check('a right-click on it names no data column', ctxs.at(-1)?.colIdx, null);
    r0.children[2].dispatchEvent(new T.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    check('…and on the first data cell, column 0', ctxs.at(-1)?.colIdx, 0);
    let copied = null;
    const orig = navigator.clipboard;
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t) => { copied = t; } } });
    table.setSelection([1]);
    await table.copyToClipboard('tsv');
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: orig });
    check('a copy has the data only', copied, 'Id\tName\tScore\nb2\tBravo\t10');
    table.dispose();
}

section('§2 the mode');
{
    const seen = [];
    const { host, table } = mount({ headers, rows, selectToggle: true, onSelectModeChange: (on) => seen.push(on) });
    click(toggle(host));
    check('the toggle turns it on', table.isSelectMode(), true);
    check('onSelectModeChange', seen, [true]);
    check('aria-pressed on', toggle(host).getAttribute('aria-pressed'), 'true');
    check('…and says how to leave', toggle(host).title, 'Stop selecting');
    ok('select-all shown', selectAll(host));
    ok('the column is marked on', headRow(host).children[0].classList.contains('twm-dt-select-head--on'));
    check('setSelectMode(true) again: no change', table.setSelectMode(true), false);
    table.setSelection([0, 2]);
    click(toggle(host));
    check('the toggle turns it off', [table.isSelectMode(), seen], [false, [true, false]]);
    check('the ticks are kept', table.getSelection(), [0, 2]);
    table.dispose();
}
{
    const { host, table } = mount({ headers, rows, selectMode: true });
    ok('selectMode alone: in the mode', table.isSelectMode());
    ok('…with the column', host.querySelector('.twm-dt-select-cell'));
    ok('…and no toggle', !toggle(host));
    table.setSelectMode(false);
    ok('setSelectMode(false) leaves it', !table.isSelectMode());
    table.dispose();
}

section('§3 in the mode');
{
    const opened = [];
    const clicks = [];
    const sel = [];
    const { host, table } = mount({
        headers, rows, selectToggle: true, keyboardNav: true, activateOn: ['click', 'dblclick', 'enter'],
        onRowActivate: (i) => opened.push(i), onRowClick: (i) => clicks.push(i),
        onSelectionChange: (s) => sel.push(s),
        contextMenuItems: () => [{ label: 'X', action: 'x' }],
    });
    click(bodyRows(host)[0].children[1]);
    check('outside the mode a click opens (and selects)', [opened, table.getSelection()], [[0], [0]]);
    table.clearSelection();
    table.setSelectMode(true);
    opened.length = 0;
    click(bodyRows(host)[0].children[1]);
    click(bodyRows(host)[2].children[1]);
    check('a plain click ticks, and keeps the others', table.getSelection(), [0, 2]);
    check('the boxes say so', boxes(host), [true, false, true, false]);
    click(bodyRows(host)[0].children[1]);
    check('a click on a ticked row unticks it', table.getSelection(), [2]);
    click(bodyRows(host)[1].children[0].querySelector('input'));
    check('a click on the box ticks it', table.getSelection(), [1, 2]);
    check('…and the box shows it (its own toggle undone)', boxes(host), [false, true, true, false]);
    click(bodyRows(host)[3].children[1], { shiftKey: true });
    check('Shift-click adds the range from the last tick', table.getSelection(), [1, 2, 3]);
    doubleClick(bodyRows(host)[0].children[1]);
    key(tableEl(host), 'Enter');
    check('nothing opened: click, double-click or Enter', opened, []);
    ok('onRowClick still fires', clicks.length > 0);
    ok('onSelectionChange told', sel.length > 0);
    table.setSelection([1]);
    const before = table.getSelection();
    key(tableEl(host), 'ArrowDown');
    check('the arrows keep the ticks', table.getSelection(), before);
    ok('…and mark the cursor row', bodyRows(host).some((tr) => tr.classList.contains('twm-dt-row--cursor')));
    const cursor = bodyRows(host).find((tr) => tr.classList.contains('twm-dt-row--cursor')).__rowIndex;
    const flipped = before.includes(cursor) ? before.filter((i) => i !== cursor) : [...before, cursor].sort();
    key(tableEl(host), ' ');
    check('Space flips the cursor row', table.getSelection(), flipped);
    key(tableEl(host), ' ');
    check('Space again flips it back', table.getSelection(), before);
    table.setSelection([]);
    key(tableEl(host), 'ArrowDown');
    key(tableEl(host), 'ArrowDown', { shiftKey: true });
    check('Shift+arrow ticks the rows passed over', table.getSelection().length, 2);
    table.setSelection([0, 1]);
    bodyRows(host)[3].children[1].dispatchEvent(new T.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    check('a right-click on an unticked row keeps the ticks', table.getSelection(), [0, 1]);
    table.dispose();
}

section('§4 select-all');
{
    const { host, table } = mount({ headers, rows, selectMode: true, selectToggle: true, filterable: true, pageSize: 2 });
    table.setFilter(2, '>15');
    click(selectAll(host));
    check('every row the filters let through, on every page', table.getSelection(), [0, 2, 3]);
    ok('checked', selectAll(host).checked && !selectAll(host).indeterminate);
    click(selectAll(host));
    check('again: none', table.getSelection(), []);
    table.setSelection([0]);
    ok('mixed', selectAll(host).indeterminate);
    click(selectAll(host));
    check('from mixed: all', table.getSelection(), [0, 2, 3]);
    table.dispose();
}

section('§5 widths');
{
    // A blob written by a table WITHOUT the column (or a consumer's seed).
    const store = memoryStore({ q: { sortColumn: null, sortAscending: true, filters: [], colWidths: { 0: 48, 2: 90 } } });
    const { host, table } = mount({ headers, rows, selectToggle: true, stateStore: store, persistKey: 'q' });
    check('shifted onto the same columns', table._colWidths, { 1: 48, 3: 90 });
    table.sortBy(0);
    check('saved with where they start', [store.map.q.colWidthsLead, store.map.q.colWidths], [1, { 1: 48, 3: 90 }]);
    table.setSelectMode(true);
    table.setSelectMode(false);
    check('the mode never moves them', table._colWidths, { 1: 48, 3: 90 });
    ok('the column is never remembered', store.map.q.colWidths[0] == null);
    table.dispose();
    const again = mount({ headers, rows, selectToggle: true, stateStore: store, persistKey: 'q' });
    check('read back by the same table: unchanged', again.table._colWidths, { 1: 48, 3: 90 });
    again.table.dispose();
    const plain = mount({ headers, rows, stateStore: store, persistKey: 'q' });
    check('read by a table without it: back where they were', plain.table._colWidths, { 0: 48, 2: 90 });
    plain.table.dispose();
    void host;
}

section('§6 single-select');
{
    const warn = console.warn;
    const warned = [];
    console.warn = (...a) => warned.push(a.join(' '));
    const { host, table } = mount({ headers, rows, selectable: 'single', selectToggle: true });
    console.warn = warn;
    ok('no select column', !host.querySelector('.twm-dt-select-cell'));
    ok('a warning', warned.some((w) => /selectToggle/.test(w)));
    check('setSelectMode does nothing', table.setSelectMode(true), false);
    table.dispose();
}

section('§7 Escape');
{
    const { host, table } = mount({ headers, rows, selectToggle: true });
    table.setSelectMode(true);
    table.setSelection([1, 2]);
    key(tableEl(host), 'Escape');
    check('first the ticks go', [table.getSelection(), table.isSelectMode()], [[], true]);
    key(tableEl(host), 'Escape');
    check('then the mode', table.isSelectMode(), false);
    table.dispose();
}

section('§8 new rows');
{
    const seen = [];
    const { table } = mount({ headers, rows, selectToggle: true, getRowKey: (r) => r[0], onSelectionChange: (s) => seen.push(s) });
    table.setSelectMode(true);
    table.setSelection([1, 3]);
    table.setData({ rows: [['b4', 'Delta', 40], ['b0', 'New', 1], ['b2', 'Bravo', 11]] });
    check('the ticked records are still ticked, where they now are', table.getSelection(), [0, 2]);
    check('…and the consumer told', seen.at(-1), [0, 2]);
    table.setSelectMode(false);
    table.setSelection([0]);
    table.setData({ rows });
    check('outside the mode new rows clear the selection, as before', table.getSelection(), []);
    table.dispose();
}

void mouse; void document;
done();
