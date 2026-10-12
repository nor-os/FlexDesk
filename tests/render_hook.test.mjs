/**
 * STORY-0010 `onRender` / `getDisplayedRows()` — WHAT THE TABLE SHOWS, FOR
 * WHOEVER SHOWS A COUNT BESIDE IT.
 *
 * A consumer that says "12 of 40 open bugs shown" in a status bar has to hear
 * every time the table draws (a filter typed, a sort, a page, new rows) and
 * then ask which rows survived the filter. 0.9.1 had neither: no hook after a
 * render, and only `getFilteredRowCount()`, a number.
 *
 *   §0  without `onRender` nothing is called and the table draws as before
 *   §1  onRender(table) runs at the end of EVERY render: the first, setData,
 *       sortBy, a page, a filter typed, a header click — and reads the new state
 *   §2  a hook that throws is reported and the table still draws
 *   §3  getDisplayedRows() is the filtered, sorted rows across EVERY page, a
 *       copy; server-side paging gives the page held
 *
 * Against 0.9.1, §1–§3 fail.
 *
 *     node tests/render_hook.test.mjs
 */
import { dataTableEnv } from './dt_env.mjs';

const T = await dataTableEnv('render hook');
const { check, ok, section, mount, bodyRows, click, tick, document } = T;

const headers = ['Id', 'Value'];
// Thirty rows, Value a permutation of 0–29; Ids r0..r29.
const rows = Array.from({ length: 30 }, (_, i) => [`r${i}`, (i * 7) % 30]);

async function typeFilter(host, colIdx, text) {
    const input = host.querySelectorAll('.twm-data-table__filter-input')[colIdx];
    input.value = text;
    input.dispatchEvent(new T.window.Event('input', { bubbles: true }));
    await tick(260);
}

section('§0 without onRender');
{
    const { host, table } = mount({ headers, rows, pageSize: 10 });
    check('it draws its first page', bodyRows(host).length, 10);
    table.sortBy(1);
    check('…and sorts as before', bodyRows(host)[0].children[1].textContent, '0');
    table.dispose();
}

section('§1 after every render');
{
    const seen = [];
    const host = document.createElement('div');
    document.body.appendChild(host);
    const table = new T.DataTable(host, {
        headers, rows, pageSize: 10, sortable: true, filterable: true,
        onRender: (t) => seen.push([t === table, t.getDisplayedRows().length, bodyRows(host).length]),
    });
    check('nothing before the first render', seen, []);
    table.render();
    check('the first render, with the table drawn', seen, [[true, 30, 10]]);
    seen.length = 0;
    table.setData({ rows: rows.slice(0, 25) });
    table.sortBy(1);
    table.goToPage(2);
    check('setData, sortBy, goToPage: one call each, with the table and what it now shows',
          seen, [[true, 25, 10], [true, 25, 10], [true, 25, 5]]);
    seen.length = 0;
    await typeFilter(host, 1, '>19');
    const over19 = rows.slice(0, 25).filter((r) => r[1] > 19).length;
    check('a filter typed: called with the filtered rows', seen.at(-1), [true, over19, over19]);
    seen.length = 0;
    click(host.querySelectorAll('th.sortable')[0]);
    check('a header click', seen.length, 1);
    table.dispose();
}

section('§2 a hook that throws');
{
    const errors = [];
    const orig = console.error;
    console.error = (...a) => errors.push(a.join(' '));
    let host;
    try {
        ({ host } = mount({ headers, rows, pageSize: 10, onRender: () => { throw new Error('boom'); } }));
    } finally { console.error = orig; }
    check('the table still draws', bodyRows(host).length, 10);
    ok('…and the error is reported', errors.some((e) => e.includes('[DataTable] onRender threw')));
}

section('§3 getDisplayedRows');
{
    const { table } = mount({ headers, rows, pageSize: 10, sortable: true, filterable: true });
    check('unfiltered: every row, every page', table.getDisplayedRows().length, 30);
    table.setFilter(1, '<15');
    table.sortBy(1, false);
    const shown = table.getDisplayedRows();
    check('filtered and sorted, across pages (15 rows on a 10-row page)',
          shown.map((r) => r[1]), [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
    ok('the row arrays themselves', shown[0] === rows.find((r) => r[1] === 14));
    shown.length = 0;
    check('a copy: changing it changes nothing', table.getDisplayedRows().length, 15);
    table.dispose();
}
{
    const page = rows.slice(10, 20);
    const { table } = mount({ headers, rows: page, totalCount: 30, offset: 10, pageSize: 10, onPageChange: () => {} });
    check('server-side: the page held', table.getDisplayedRows(), page);
    table.dispose();
}

T.done();
