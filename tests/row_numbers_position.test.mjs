/**
 * 0.5.0 `showRowNumbers: 'position'` — ROW NUMBERS COUNT WHAT IS SHOWN.
 *
 * `showRowNumbers: true` numbers a row by its ORIGINAL index, so a sorted list
 * reads 2, 3, 4, 1 down its left edge and a filtered one 3, 7, 12 — numbers
 * nobody can use to say "the fifth row". Every list in the first consumer
 * switched the column off rather than show them.
 *
 *   §0  showRowNumbers: true is unchanged — the original index, through a sort
 *   §1  'position': 1, 2, 3… after a sort
 *   §2  'position': 1, 2, 3… after a filter
 *   §3  'position': the page's own range on page 2 of a paged table
 *   §4  'position' under virtualize: the window's rows count from where they
 *       stand, and updateRow keeps a row's number
 *
 * Against 0.4.7, §1–§4 fail.
 *
 *     node tests/row_numbers_position.test.mjs
 */
import { dataTableEnv } from './dt_env.mjs';

const T = await dataTableEnv('row numbers position');
const { check, section, mount, bodyRows, tick } = T;

const headers = ['Name', 'Value'];
const rows = [['d', 4], ['b', 2], ['c', 3], ['a', 1]];
const numbers = (host) => bodyRows(host).map((tr) => tr.children[0].textContent);
const names = (host) => bodyRows(host).map((tr) => tr.children[1].textContent);

async function typeFilter(host, colIdx, text) {
    // The number column has no filter cell content, so the inputs are per data column.
    const input = host.querySelectorAll('.twm-data-table__filter-input')[colIdx];
    input.value = text;
    input.dispatchEvent(new T.window.Event('input', { bubbles: true }));
    await tick(260);
}

section('§0 showRowNumbers: true — the original index, as in 0.4');
{
    const { host, table } = mount({ headers, rows, sortable: true, showRowNumbers: true });
    table.sortBy(0, true);
    check('a, b, c, d', names(host), ['a', 'b', 'c', 'd']);
    check('numbered by where they CAME from', numbers(host), ['4', '2', '3', '1']);
}

section('§1 position: after a sort');
{
    const { host, table } = mount({ headers, rows, sortable: true, showRowNumbers: 'position' });
    table.sortBy(0, true);
    check('1, 2, 3, 4 down the edge', numbers(host), ['1', '2', '3', '4']);
    table.sortBy(1, false);
    check('…whatever the order', numbers(host), ['1', '2', '3', '4']);
}

section('§2 position: after a filter');
{
    const { host } = mount({ headers, rows, filterable: true, showRowNumbers: 'position' });
    await typeFilter(host, 1, '>1');
    check('three rows left', names(host), ['d', 'b', 'c']);
    check('numbered 1, 2, 3', numbers(host), ['1', '2', '3']);
}

section('§3 position: a later page');
{
    const many = Array.from({ length: 25 }, (_, i) => [`n${i}`, i]);
    const { host, table } = mount({ headers, rows: many, pageSize: 10, showRowNumbers: 'position' });
    table.goToPage(1);
    check('page 2 counts 11–20', [numbers(host)[0], numbers(host).at(-1)], ['11', '20']);
}

section('§4 position under virtualize, and updateRow');
{
    const many = Array.from({ length: 300 }, (_, i) => [`n${String(i).padStart(3, '0')}`, 300 - i]);
    const { host, table } = mount({
        headers, rows: many, sortable: true, showRowNumbers: 'position', pagination: false,
        virtualize: { overscan: 5, rowHeight: 20 },
    });
    table.sortBy(1, true);                       // reversed: n299 first
    check('the first drawn row is position 1', numbers(host)[0], '1');
    table.scrollToRow(149, { block: 'start' });  // original index 149 holds 151: the 151st row up
    const tr = table.getRowElement(149);
    check('a row drawn by a window slide counts from where it stands', tr?.children[0].textContent, '151');
    table.updateRow(149, ['n149*', 151]);
    check('updateRow keeps the row\'s number', table.getRowElement(149)?.children[0].textContent, '151');
}

T.done();
