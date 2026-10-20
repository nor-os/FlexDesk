/**
 * STORY-0086 `reorderable` / `columnOrder` / `moveColumn` / `getColumnOrder` —
 * COLUMNS DRAWN IN THE ORDER SOMEBODY PUT THEM IN, AND KEPT THAT WAY.
 *
 *   §0  without the options: the natural order, and the saved blob is 0.16's
 *   §1  dragging header 3 onto header 1 draws 0,3,1,2, body cells to match;
 *       moveColumn, getColumnOrder and columnOrder do the same from code, and
 *       onColumnsChange hears every change; a columnOrder that is no order of
 *       the columns warns once, also when the headers come later
 *   §2  the order is kept by data index: hiddenColumns, the sort, the filters,
 *       renderCell's colIdx and the cell mode's columns stay on their columns
 *   §3  persistKey saves and restores the order; a saved order for another
 *       number of columns is ignored and columnOrder drawn (or the natural
 *       order), whether the headers are known when the blob is read or not
 *   §4  a drag that starts on a resize grip resizes and does not reorder; the
 *       row-number and select columns do not move and take no drop
 *   §5  a copy and the CSV follow the order shown
 *   §6  a blob saved before this story still loads
 *   §7  the header menu's Move left / Move right
 *
 * Against 0.16, §1–§7 fail (there is no order).
 *
 *     node tests/column_reorder.test.mjs
 */
import { dataTableEnv } from './dt_env.mjs';

const T = await dataTableEnv('column reorder');
const { check, ok, section, mount, bodyRows, click, mouse, tick, done, document } = T;

const headers = ['A', 'B', 'C', 'D'];
const rows = [['a1', 'b1', 3, 'd1'], ['a2', 'b2', 1, 'd2'], ['a3', 'b3', 2, 'd3']];

const headRow = (host) => host.querySelector('.twm-preview-table-header-wrap thead tr:first-child');
const headCells = (host) => [...headRow(host).children];
const heads = (host) => headCells(host).map((th) => th.firstChild?.textContent ?? th.textContent);
const cells = (host, i = 0) => [...bodyRows(host)[i].children].map((td) => td.textContent);
const menuOf = () => [...document.querySelectorAll('.data-context-menu')].find((m) => m.style.display !== 'none') || null;
const entries = (menu) => [...(menu?.children || [])].map((el) => (
    el.classList.contains('twm-context-menu__separator') ? '---' : el.querySelector('.label')?.textContent));
function memoryStore(seed = {}) {
    const map = JSON.parse(JSON.stringify(seed));
    return { map, ready: () => Promise.resolve(map), get: (k) => map[k] || null,
             set: (k, s) => { map[k] = JSON.parse(JSON.stringify(s)); } };
}
const drag = (type, el) => {
    const ev = new T.window.Event(type, { bubbles: true, cancelable: true });
    el.dispatchEvent(ev);
    return ev;
};
/** A whole HTML5 drag of header cell `from` onto header cell `to`. */
const dragHeader = (host, from, to) => {
    const src = headCells(host)[from];
    const dst = headCells(host)[to];
    mouse('mousedown', src.firstChild?.nodeType === 1 ? src.firstChild : src);
    const start = drag('dragstart', src);
    const over = drag('dragover', dst);
    drag('drop', dst);
    drag('dragend', src);
    return { start, over };
};
async function captureClipboard(fn) {
    let copied = null;
    const orig = navigator.clipboard;
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t) => { copied = t; } } });
    try { await fn(); } finally {
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: orig });
    }
    return copied;
}

section('§0 without the options');
{
    const store = memoryStore();
    const { host, table } = mount({ headers, rows, sortable: true, stateStore: store, persistKey: 'q' });
    check('the natural order', heads(host), headers);
    check('getColumnOrder', table.getColumnOrder(), [0, 1, 2, 3]);
    ok('no header cell is draggable', headCells(host).every((th) => !th.draggable));
    table.sortBy(0);
    check('the blob is 0.16\'s', Object.keys(store.map.q), ['sortColumn', 'sortAscending', 'filters', 'colWidths']);
    table.dispose();
}

section('§1 by drag and from code');
{
    const changes = [];
    const { host, table } = mount({ headers, rows, reorderable: true,
                                    onColumnsChange: (hidden, info) => changes.push([hidden, info.order]) });
    ok('every header cell is draggable', headCells(host).every((th) => th.draggable));
    const { start, over } = dragHeader(host, 3, 1);
    ok('the drag starts and the drop is welcome', !start.defaultPrevented && over.defaultPrevented);
    check('header 3 dropped on header 1: 0,3,1,2', heads(host), ['A', 'D', 'B', 'C']);
    check('…the body cells to match', cells(host), ['a1', 'd1', 'b1', '3']);
    check('getColumnOrder', table.getColumnOrder(), [0, 3, 1, 2]);
    check('onColumnsChange heard it', changes, [[[], [0, 3, 1, 2]]]);
    dragHeader(host, 1, 3);
    check('dragged right, it takes the target\'s place', table.getColumnOrder(), [0, 1, 2, 3]);
    check('…heard', changes.length, 2);
    dragHeader(host, 2, 2);
    check('dropped on itself: nothing', changes.length, 2);

    ok('moveColumn(3, 1) changes the order', table.moveColumn(3, 1));
    check('…drawn 0,3,1,2', heads(host), ['A', 'D', 'B', 'C']);
    check('…with the cells', cells(host, 2), ['a3', 'd3', 'b3', '2']);
    check('…and heard', changes.at(-1), [[], [0, 3, 1, 2]]);
    ok('no move: false, nobody told', !table.moveColumn(1, 1) && !table.moveColumn(0, 9) && changes.length === 3);
    ok('getColumnOrder is a copy', (table.getColumnOrder().push(9), table.getColumnOrder().length === 4));
    table.setData({ columnOrder: [3, 2, 1, 0] });
    check('setData({columnOrder})', heads(host), ['D', 'C', 'B', 'A']);
    check('…heard', changes.at(-1), [[], [3, 2, 1, 0]]);
    const warn = console.warn; let warned = 0; console.warn = () => { warned++; };
    table.setData({ columnOrder: [0, 0, 1, 2] });
    console.warn = warn;
    ok('an order that is no permutation is refused, out loud', warned === 1 && heads(host).join() === 'D,C,B,A');
    table.setData({ columnOrder: null });
    check('null: the natural order again', heads(host), headers);
    table.dispose();
}
{
    const { host, table } = mount({ headers, rows, columnOrder: [0, 3, 1, 2] });
    check('columnOrder: [...] draws that order', heads(host), ['A', 'D', 'B', 'C']);
    check('…cells too', cells(host), ['a1', 'd1', 'b1', '3']);
    ok('without reorderable nothing drags', headCells(host).every((th) => !th.draggable));
    table.dispose();
}
{
    const warn = console.warn; let warned = 0; console.warn = () => { warned++; };
    const { host, table } = mount({ headers, rows, columnOrder: [0, 1] });
    console.warn = warn;
    ok('a columnOrder of the wrong length: natural, with a warning', warned === 1 && heads(host).join() === 'A,B,C,D');
    table.dispose();
}
for (const order of [[0, 0], [0, 1]]) {
    const warn = console.warn; let warned = 0; console.warn = () => { warned++; };
    const { host, table } = mount({ headers: [], rows: [], columnOrder: order });
    const before = warned;
    table.setData({ headers, rows });
    table.setData({ headers, rows });
    console.warn = warn;
    ok(`columnOrder ${JSON.stringify(order)} before any headers: no warning yet`, before === 0);
    ok('…the headers it does not fit: natural, with one warning', warned === 1 && heads(host).join() === 'A,B,C,D');
    table.dispose();
}
{
    const warn = console.warn; let warned = 0; console.warn = () => { warned++; };
    const { host, table } = mount({ headers: [], rows: [], columnOrder: [0, 3, 1, 2] });
    table.setData({ headers, rows });
    console.warn = warn;
    ok('columnOrder before the headers it fits: drawn, no warning', warned === 0 && heads(host).join() === 'A,D,B,C');
    table.dispose();
}

section('§2 kept by data index');
{
    const seen = [];
    const { host, table } = mount({
        headers, rows, sortable: true, filterable: true, reorderable: true, hiddenColumns: [1],
        renderCell: (td, v, colIdx) => { seen.push(colIdx); return false; },
    });
    table.moveColumn(3, 0);
    check('D moved first; B stays hidden', heads(host), ['D', 'A', 'C']);
    check('getColumnOrder still lists the hidden one', table.getColumnOrder(), [3, 0, 1, 2]);
    check('getHiddenColumns unchanged', table.getHiddenColumns(), [1]);
    seen.length = 0;
    table.render();
    check('renderCell is asked by data index, in the order drawn', seen.slice(0, 3), [3, 0, 2]);
    table.sortBy(2);
    check('the sort is on C wherever it is', bodyRows(host).map((tr) => tr.children[0].textContent), ['d2', 'd3', 'd1']);
    ok('…and C\'s header has the arrow', headCells(host)[2].querySelector('.twm-sort-icon').textContent === 'arrow_upward');
    table.setFilter(3, 'd3');
    check('a filter on D', bodyRows(host).map((tr) => tr.children[0].textContent), ['d3']);
    const filterRow = host.querySelector('.twm-data-table__filter-row');
    check('…its box is drawn over D', filterRow.children[0].querySelector('input')?.value, 'd3');
    table.setColumnVisible(1, true);
    check('B shown again, in its place in the order', heads(host), ['D', 'A', 'B', 'C']);
    table.dispose();
}
{
    const { host, table } = mount({ headers, rows, reorderable: true, selectionMode: 'cells' });
    table.moveColumn(3, 1);
    table.setCellSelection({ row: 0, col: 0 });
    T.key(host.querySelector('.twm-preview-table-wrap table'), 'ArrowRight');
    check('the cursor moves right in the order shown: A then D', table.getCellSelection().focus.col, 3);
    table.setCellSelection({ row: 0, col: 2 }, { row: 0, col: 0 });
    check('a range covers the columns drawn between its edges', table.getCellSelection().range.columns, [0, 3, 1, 2]);
    table.dispose();
}

section('§3 persistKey');
{
    const store = memoryStore();
    const cfg = { headers, rows, reorderable: true, sortable: true, stateStore: store, persistKey: 'q' };
    const a = mount(cfg);
    a.table.moveColumn(3, 1);
    check('the order is saved', store.map.q.order, [0, 3, 1, 2]);
    a.table.dispose();
    const b = mount(cfg);
    check('…and restored', heads(b.host), ['A', 'D', 'B', 'C']);
    check('…cells too', cells(b.host), ['a1', 'd1', 'b1', '3']);
    b.table.dispose();
    const c = mount({ ...cfg, columnOrder: [1, 0, 2, 3] });
    check('a saved order wins over columnOrder', heads(c.host), ['A', 'D', 'B', 'C']);
    c.table.dispose();
}
{
    const store = memoryStore({ q: { sortColumn: null, sortAscending: true, filters: [], colWidths: {}, order: [2, 1, 0] } });
    const { host, table } = mount({ headers, rows, reorderable: true, stateStore: store, persistKey: 'q' });
    check('a saved order for 3 columns on a table of 4: natural', heads(host), headers);
    check('getColumnOrder', table.getColumnOrder(), [0, 1, 2, 3]);
    table.dispose();
}
{
    const store = memoryStore({ q: { sortColumn: null, sortAscending: true, filters: [], colWidths: {}, order: [4, 3, 2, 1, 0] } });
    const { host, table } = mount({ headers, rows, reorderable: true, stateStore: store, persistKey: 'q' });
    check('…and one for 5: natural', heads(host), headers);
    table.dispose();
}
{
    // A saved order of the wrong length never displaces columnOrder.
    const store = memoryStore({ q: { sortColumn: null, sortAscending: true, filters: [], colWidths: {}, order: [2, 1, 0] } });
    const { host, table } = mount({ headers, rows, reorderable: true, columnOrder: [3, 2, 1, 0], stateStore: store, persistKey: 'q' });
    check('a saved order for 3 columns with columnOrder: columnOrder is drawn', heads(host), ['D', 'C', 'B', 'A']);
    check('…getColumnOrder', table.getColumnOrder(), [3, 2, 1, 0]);
    table.dispose();
}
{
    // The same rule when the blob is read before the headers are known.
    const blob = { sortColumn: null, sortAscending: true, filters: [], colWidths: {}, order: [2, 1, 0] };
    const a = mount({ headers: [], rows: [], reorderable: true, columnOrder: [3, 2, 1, 0],
                      stateStore: memoryStore({ q: blob }), persistKey: 'q' });
    a.table.setData({ headers, rows });
    check('headers after the blob, with columnOrder: columnOrder is drawn', heads(a.host), ['D', 'C', 'B', 'A']);
    check('…getColumnOrder', a.table.getColumnOrder(), [3, 2, 1, 0]);
    a.table.dispose();
    const b = mount({ headers: [], rows: [], reorderable: true, stateStore: memoryStore({ q: blob }), persistKey: 'q' });
    b.table.setData({ headers, rows });
    check('…without columnOrder: natural', heads(b.host), headers);
    b.table.dispose();
    const c = mount({ headers: [], rows: [], reorderable: true, columnOrder: [3, 2, 1, 0],
                      stateStore: memoryStore({ q: { ...blob, order: [0, 3, 1, 2] } }), persistKey: 'q' });
    c.table.setData({ headers, rows });
    check('…a saved order that fits still wins over columnOrder', heads(c.host), ['A', 'D', 'B', 'C']);
    c.table.dispose();
}
{
    // The blob arrives after the first paint (the store's on-disk load).
    const map = {};
    let release;
    const late = new Promise((r) => { release = r; });
    const store = { ready: () => late, get: (k) => map[k] || null, set: (k, s) => { map[k] = s; } };
    const { host, table } = mount({ headers, rows, reorderable: true, stateStore: store, persistKey: 'q' });
    check('nothing saved yet: natural', heads(host), headers);
    map.q = { sortColumn: null, sortAscending: true, filters: [], colWidths: {}, order: [3, 2, 1, 0] };
    release();
    await tick();
    check('a late blob\'s order is drawn', heads(host), ['D', 'C', 'B', 'A']);
    table.dispose();
}

section('§4 the grip, and the columns in front');
{
    const changes = [];
    const { host, table } = mount({ headers, rows, reorderable: true,
                                    onColumnsChange: (h, info) => changes.push(info.order) });
    const th = headCells(host)[1];
    const grip = th.querySelector('.twm-dt-col-resizer');
    ok('the header has its resize grip', !!grip);
    mouse('mousedown', grip, { clientX: 100 });
    const start = drag('dragstart', th);
    ok('a drag that starts on the grip is refused', start.defaultPrevented);
    drag('dragover', headCells(host)[3]);
    drag('drop', headCells(host)[3]);
    mouse('mousemove', document, { clientX: 160 });
    mouse('mouseup', document, { clientX: 160 });
    check('…nothing reordered', [heads(host), changes.length], [headers, 0]);
    check('…and the column was resized', table._colWidths[1], 60);
    const after = dragHeader(host, 1, 3);
    ok('a press off the grip drags again', !after.start.defaultPrevented);
    check('…and reorders', table.getColumnOrder(), [0, 2, 3, 1]);
    check('…the width went with its column', table._colWidths[3], 60);
    table.dispose();
}
{
    const changes = [];
    const { host, table } = mount({ headers, rows, reorderable: true, showRowNumbers: true,
                                    selectable: true, selectToggle: true,
                                    onColumnsChange: (h, info) => changes.push(info.order) });
    const [sel, num, a] = headCells(host);
    ok('the select and row-number columns are not draggable', !sel.draggable && !num.draggable && a.draggable);
    check('…they are first', heads(host).slice(1), ['#', ...headers]);
    for (const front of [sel, num]) {
        mouse('mousedown', front);
        drag('dragstart', front);
        drag('dragover', headCells(host)[4]);
        drag('drop', headCells(host)[4]);
    }
    check('dragging them moves nothing', changes.length, 0);
    for (const front of [0, 1]) {
        mouse('mousedown', headCells(host)[4]);
        drag('dragstart', headCells(host)[4]);
        const over = drag('dragover', headCells(host)[front]);
        ok(`a column held over the ${front ? 'row-number' : 'select'} column may not drop there`, !over.defaultPrevented);
        drag('drop', headCells(host)[front]);
        drag('dragend', headCells(host)[4]);
    }
    check('nothing landed in front of them', [changes.length, heads(host).slice(1)], [0, ['#', ...headers]]);
    dragHeader(host, 5, 2);
    check('dropped on the first data column it goes first among the data', heads(host).slice(1), ['#', 'D', 'A', 'B', 'C']);
    check('…cells to match, behind the number', [...bodyRows(host)[0].children].slice(1).map((td) => td.textContent),
          ['1', 'd1', 'a1', 'b1', '3']);
    table.dispose();
}

section('§5 copy and CSV');
{
    const { table } = mount({ headers, rows, reorderable: true, selectable: true, hiddenColumns: [2] });
    table.moveColumn(3, 0);
    table.setSelection([1]);
    const tsv = await captureClipboard(() => table.copyToClipboard('tsv'));
    check('a copy follows the order shown', tsv, 'D\tA\tB\nd2\ta2\tb2');
    const csv = await captureClipboard(() => table.copyToClipboard('csv'));
    check('…as CSV too', csv, 'D,A,B\nd2,a2,b2');
    let saved = null;
    table.config.host = { dialogs: { saveFile: async ({ data }) => { saved = data; return { ok: true }; } } };
    await table.downloadCSV('x.csv');
    check('downloadCSV follows it', saved, 'D,A,B\nd1,a1,b1\nd2,a2,b2\nd3,a3,b3');
    table.dispose();
}

section('§6 a blob saved before this story');
{
    const store = memoryStore({ q: { sortColumn: 2, sortAscending: false, filters: [[1, 'b']],
                                     colWidths: { 0: 90, 1: 70 }, hidden: [3] } });
    const { host, table } = mount({ headers, rows, reorderable: true, sortable: true, filterable: true,
                                    columnChooser: true, stateStore: store, persistKey: 'q' });
    check('it loads: natural order, the hidden set', heads(host), ['A', 'B', 'C']);
    check('…the sort', bodyRows(host).map((tr) => tr.children[0].textContent), ['a1', 'a3', 'a2']);
    check('…the filter', table._state.filters.get(1), 'b');
    check('…the widths', [table._colWidths[0], table._colWidths[1]], [90, 70]);
    table.moveColumn(0, 2);
    check('the next save adds the order', store.map.q.order, [1, 2, 0, 3]);
    check('…and keeps the widths with their columns', [store.map.q.colWidths[0], store.map.q.colWidths[2]], [70, 90]);
    table.dispose();
}

section('§7 Move left / Move right');
{
    const actions = [];
    const { host, table } = mount({ headers, rows, reorderable: true, columnChooser: true,
                                    headerMenu: () => [{ label: 'Mine', action: 'mine' }],
                                    onHeaderMenuAction: (a) => actions.push(a) });
    const open = async (i) => {
        headCells(host)[i].dispatchEvent(new T.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
        await tick();
        return menuOf();
    };
    let menu = await open(1);
    check('the menu: the hook\'s, the moves, the chooser',
          entries(menu), ['Mine', '---', 'Move left', 'Move right', '---', 'A', 'B', 'C', 'D']);
    click([...menu.children][2].querySelector('.label'));
    check('Move left on B', heads(host), ['B', 'A', 'C', 'D']);
    ok('…not an action of the consumer\'s', actions.length === 0);
    menu = await open(0);
    ok('the first column cannot move left', [...menu.children][2].classList.contains('disabled'));
    click([...menu.children][2].querySelector('.label'));
    check('…and does not', heads(host), ['B', 'A', 'C', 'D']);
    T.document.body.click();
    menu = await open(3);
    ok('the last cannot move right', [...menu.children][3].classList.contains('disabled'));
    menu = await open(2);
    click([...menu.children][3].querySelector('.label'));
    check('Move right on C', heads(host), ['B', 'A', 'D', 'C']);
    table.setColumnVisible(3, false);
    menu = await open(1);
    click([...menu.children][3].querySelector('.label'));
    check('Move right passes the hidden column, to the next one shown', [heads(host), table.getColumnOrder()],
          [['B', 'C', 'A'], [1, 3, 2, 0]]);
    table.dispose();
}
{
    const { host, table } = mount({ headers, rows, reorderable: true });
    const ev = new T.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    headCells(host)[0].dispatchEvent(ev);
    await tick();
    check('reorderable alone: the moves are the menu', entries(menuOf()), ['Move left', 'Move right']);
    table.dispose();
}

done();
