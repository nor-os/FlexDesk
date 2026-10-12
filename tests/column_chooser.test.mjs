/**
 * STORY-0012 `hiddenColumns` / `columnChooser` / `setColumnVisible` — COLUMNS
 * NOT SHOWN UNTIL SOMEBODY ASKS FOR THEM.
 *
 * A list with a dozen optional columns (BugDesk's custom fields) had two
 * choices in 0.9.1: draw every one, or leave them out of the rows. Now a column
 * can be in the row data and not drawn, the person picks the ones they see
 * from the header's right-click, and finds them still picked tomorrow.
 *
 *   §0  without the keys: every column drawn, and the saved blob is 0.9.1's
 *   §1  hiddenColumns: no header, no filter box, no cell, not in a copy or the
 *       CSV — and still in the row data (renderCell, the right-click ctx)
 *   §2  setColumnVisible / getHiddenColumns / onColumnsChange; the last column
 *       shown stays; the widths of the other columns are carried
 *   §3  columnChooser: the header's right-click lists every column, checked
 *       when shown; choosing one toggles it; the last one shown is disabled
 *   §4  persistKey: the set is saved with the sort and filters, and a saved
 *       set wins over hiddenColumns
 *   §5  a hidden column still sorts and filters through the API; sorted while
 *       hidden it has no arrow and keeps the order
 *
 * Against 0.9.1, §1–§5 fail.
 *
 *     node tests/column_chooser.test.mjs
 */
import { dataTableEnv } from './dt_env.mjs';

const T = await dataTableEnv('column chooser');
const { check, ok, section, mount, bodyRows, click, tick, document } = T;

const headers = ['Id', 'Name', 'Custom A', 'Custom B'];
const rows = [['b1', 'Alpha', 30, 'x'], ['b2', 'Bravo', 10, 'y'], ['b3', 'Charlie', 20, 'z']];

const heads = (host) => [...host.querySelectorAll('.twm-preview-table-header-wrap thead tr:first-child th')]
    .map((th) => th.firstChild?.textContent ?? th.textContent);
const cells = (host, i = 0) => [...bodyRows(host)[i].children].map((td) => td.textContent);
const filterCells = (host) => host.querySelectorAll('.twm-data-table__filter-row > *').length;
const menuOf = () => [...document.querySelectorAll('.data-context-menu')].find((m) => m.style.display !== 'none') || null;
function memoryStore(seed = {}) {
    const map = { ...seed };
    return { map, ready: () => Promise.resolve(map), get: (k) => map[k] || null,
             set: (k, s) => { map[k] = JSON.parse(JSON.stringify(s)); } };
}

section('§0 without the keys');
{
    const store = memoryStore();
    const { host, table } = mount({ headers, rows, sortable: true, stateStore: store, persistKey: 'q' });
    check('every column drawn', heads(host), headers);
    table.sortBy(0);
    check('the blob is 0.9.1\'s', Object.keys(store.map.q), ['sortColumn', 'sortAscending', 'filters', 'colWidths']);
    check('nothing hidden', table.getHiddenColumns(), []);
    table.dispose();
}

section('§1 hiddenColumns');
{
    const seen = [];
    const { host, table } = mount({
        headers, rows, hiddenColumns: [2, 3], filterable: true, showRowNumbers: true,
        renderCell: (td, value, colIdx, rowIdx, row) => { seen.push([colIdx, row.length]); return false; },
    });
    check('no header for a hidden column', heads(host), ['#', 'Id', 'Name']);
    check('no cell', cells(host), ['1', 'b1', 'Alpha']);
    check('no filter box', filterCells(host), 3);
    ok('renderCell is never asked for a hidden column', seen.every(([c]) => c < 2));
    check('…and the row it is given is whole', seen[0][1], 4);
    check('getHiddenColumns', table.getHiddenColumns(), [2, 3]);
    let copied = null;
    const orig = navigator.clipboard;
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t) => { copied = t; } } });
    table.setSelection([1]);
    await table.copyToClipboard('tsv');
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: orig });
    check('a copy has the columns shown', copied, 'Id\tName\nb2\tBravo');
    table.dispose();
}
{
    const ctxs = [];
    const { host, table } = mount({ headers, rows, hiddenColumns: [1],
                                    contextMenuItems: (row, i, ctx) => { ctxs.push(ctx); return []; } });
    bodyRows(host)[0].children[1].dispatchEvent(new T.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    check('a right-click on the cell drawn second is column 2, Name being hidden',
          [ctxs[0].colIdx, ctxs[0].value, ctxs[0].row], [2, 30, rows[0]]);
    await tick();                              // the copy menu it opened, then gone with the table
    table.dispose();
}
{
    const { host, table } = mount({ headers, rows, hiddenColumns: [0, 1, 2, 3] });
    check('every column asked hidden: the first stays', heads(host), ['Id']);
    table.dispose();
}

section('§2 setColumnVisible');
{
    const changes = [];
    const { host, table } = mount({ headers, rows, hiddenColumns: [2, 3], onColumnsChange: (h) => changes.push(h) });
    table._colWidths = { 0: 77, 1: 88 };     // as dragged
    table._colWidthsSig = table._colSig();
    ok('showing a column says it changed', table.setColumnVisible(2, true));
    check('it is drawn, in its place', heads(host), ['Id', 'Name', 'Custom A']);
    check('onColumnsChange(hidden)', changes, [[3]]);
    check('the dragged widths stay with their columns', [table._colWidths[0], table._colWidths[1], table._colWidths[2]], [77, 88, undefined]);
    table.setColumnVisible(0, false);
    check('hiding the first moves the rest left, with their widths', [table._colWidths[0], table._colWidths[1]], [88, undefined]);
    check('…drawn', heads(host), ['Name', 'Custom A']);
    ok('no change: false, and nobody told', !table.setColumnVisible(0, false) && changes.length === 2);
    table.setColumnVisible(1, false);
    ok('the last column shown cannot be hidden', !table.setColumnVisible(2, false));
    check('…it is still there', heads(host), ['Custom A']);
    ok('an index that is no column: false', !table.setColumnVisible(9, true));
    table.dispose();
}

section('§3 columnChooser');
{
    const { host, table } = mount({ headers, rows, hiddenColumns: [3], columnChooser: true });
    const th = host.querySelector('.twm-preview-table-header-wrap th');
    const ev = new T.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 4, clientY: 4 });
    th.dispatchEvent(ev);
    await tick();
    ok('the header\'s right-click is the table\'s', ev.defaultPrevented);
    const items = [...menuOf().children];
    check('every column, checked when shown',
          items.map((el) => [el.querySelector('.label').textContent, el.getAttribute('aria-checked')]),
          [['Id', 'true'], ['Name', 'true'], ['Custom A', 'true'], ['Custom B', 'false']]);
    ok('no copy items in it', !menuOf().querySelector('[data-action^="copy-"]'));
    click(items[3]);
    check('choosing a hidden one shows it', heads(host), headers);
    ok('…and the menu is closed', !menuOf());
    for (const c of [0, 1, 2]) table.setColumnVisible(c, false);
    host.querySelector('.twm-preview-table-header-wrap th').dispatchEvent(
        new T.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    await tick();
    const last = [...menuOf().children][3];
    ok('the last column shown is disabled, and says why',
       last.classList.contains('disabled') && /last column/.test(last.title));
    table.dispose();
}
{
    const { host, table } = mount({ headers, rows });
    const ev = new T.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    host.querySelector('.twm-preview-table-header-wrap th').dispatchEvent(ev);
    await tick();
    ok('without columnChooser the header keeps the page\'s menu', !ev.defaultPrevented && !menuOf());
    table.dispose();
}

section('§4 remembered');
{
    const store = memoryStore();
    const cfg = { headers, rows, sortable: true, hiddenColumns: [2, 3], stateStore: store, persistKey: 'q' };
    const a = mount(cfg);
    a.table.setColumnVisible(3, true);
    a.table.sortBy(1, false);
    check('saved with the sort', [store.map.q.hidden, store.map.q.sortColumn], [[2], 1]);
    a.table.dispose();
    const b = mount(cfg);
    check('a saved set wins over hiddenColumns', heads(b.host), ['Id', 'Name', 'Custom B']);
    check('…with the sort', cells(b.host)[0], 'b3');
    b.table.dispose();
}
{
    const store = memoryStore();
    const { table } = mount({ headers, rows, columnChooser: true, stateStore: store, persistKey: 'q' });
    table.sortBy(0);
    check('a chooser with nothing hidden saves the empty set', store.map.q.hidden, []);
    table.dispose();
}

section('§5 a hidden column still sorts and filters');
{
    const { host, table } = mount({ headers, rows, sortable: true, filterable: true, hiddenColumns: [2] });
    table.sortBy(2);
    check('sorted by the hidden Custom A', bodyRows(host).map((tr) => tr.children[0].textContent), ['b2', 'b3', 'b1']);
    check('no header shows an arrow', [...host.querySelectorAll('.twm-sort-icon')].map((i) => i.textContent),
          ['unfold_more', 'unfold_more', 'unfold_more']);
    table.setFilter(2, '>15');
    check('filtered by it', bodyRows(host).map((tr) => tr.children[0].textContent), ['b3', 'b1']);
    table.setColumnVisible(2, true);
    check('shown again: the order kept', bodyRows(host).map((tr) => tr.children[0].textContent), ['b3', 'b1']);
    check('…and its arrow back', [...host.querySelectorAll('.twm-sort-icon')][2].textContent, 'arrow_upward');
    table.dispose();
}

T.done();
