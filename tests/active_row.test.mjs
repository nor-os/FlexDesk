/**
 * 0.5.0 `getRowKey` / `activeRow` / `setActiveRow` — WHICH ROW IS OPEN.
 *
 * A master-detail list has to say which row the detail beside it is showing.
 * The only mark DataTable had was the SELECTION, and the selection is the wrong
 * tool: `setData` clears it whenever the rows change (so every refresh lost the
 * mark), and the copy menu's right-click moves it to the row under the pointer
 * (so asking for a copy of another row moved "the open one"). The first
 * consumer painted the mark itself after every render, in two different ways.
 *
 *   §0  without the keys: no row carries the mark (0.4)
 *   §1  activeRow + getRowKey: the row whose key matches is marked
 *       (twm-dt-row--active, aria-current="true")
 *   §2  it survives setData with NEW rows (found by key, at a new index), a
 *       sort and a filter; a key that is gone marks nothing, and comes back
 *   §3  a right-click on another row moves the SELECTION, never the mark
 *   §4  setActiveRow moves it in place (no re-render), null clears it, and
 *       without getRowKey the key is the original index
 *
 * Against 0.4.7, §1–§4 fail.
 *
 *     node tests/active_row.test.mjs
 */
import { dataTableEnv } from './dt_env.mjs';

const T = await dataTableEnv('active row');
const { check, ok, section, mount, bodyRows, mouse, key, tick } = T;

const headers = ['Id', 'Name'];
const rows = [['p1', 'Alpha'], ['p2', 'Bravo'], ['p3', 'Charlie']];
const marked = (host) => bodyRows(host)
    .filter((tr) => tr.classList.contains('twm-dt-row--active'))
    .map((tr) => tr.children[0].textContent);

/** Type into a column's filter box, as a person does, and let the debounce run. */
async function typeFilter(host, colIdx, text) {
    const input = host.querySelectorAll('.twm-data-table__filter-input')[colIdx];
    input.value = text;
    input.dispatchEvent(new T.window.Event('input', { bubbles: true }));
    await tick(260);
}

section('§0 without the keys: no mark');
{
    const { host } = mount({ headers, rows });
    check('no row is marked', marked(host), []);
    ok('no aria-current anywhere', !host.querySelector('[aria-current]'));
}

section('§1 the open row is marked');
{
    const { host, table } = mount({ headers, rows, getRowKey: (r) => r[0], activeRow: 'p2' });
    check('the matching row carries the class', marked(host), ['p2']);
    check('…and aria-current="true"',
          bodyRows(host).find((tr) => tr.children[0].textContent === 'p2').getAttribute('aria-current'), 'true');
    check('getActiveRow says so', table.getActiveRow(), 'p2');
}

section('§2 it survives new rows, a sort and a filter');
{
    const { host, table } = mount({
        headers, rows, sortable: true, filterable: true,
        getRowKey: (r) => r[0], activeRow: 'p2',
    });
    table.setData({ rows: [['p0', 'Zulu'], ['p3', 'Charlie'], ['p2', 'Bravo (renamed)']] });
    check('setData with new rows: found again by key, at its new index', marked(host), ['p2']);
    table.sortBy(1, true);
    check('a sort: the mark goes with the row', marked(host), ['p2']);
    await typeFilter(host, 1, 'Zulu');
    check('filtered out: nothing marked', marked(host), []);
    await typeFilter(host, 1, '');
    check('filter cleared: marked again', marked(host), ['p2']);
    table.setData({ rows: [['p9', 'Other']] });
    check('a key no longer in the rows marks nothing', marked(host), []);
    check('…but is still the open row', table.getActiveRow(), 'p2');
    table.setData({ rows });
    check('and it comes back with its row', marked(host), ['p2']);
}

section('§3 a right-click moves the selection, never the mark');
{
    const { host, table } = mount({ headers, rows, getRowKey: (r) => r[0], activeRow: 'p1' });
    mouse('contextmenu', bodyRows(host)[2], { clientX: 4, clientY: 4 });
    await tick(5);
    check('the right-click selected its row (the copy menu\'s rule)', table.getSelection(), [2]);
    check('the open row is still p1', marked(host), ['p1']);
    key(document, 'Escape');
}

section('§4 setActiveRow');
{
    const { host, table } = mount({ headers, rows, getRowKey: (r) => r[0] });
    check('no activeRow: nothing marked', marked(host), []);
    const before = bodyRows(host)[2];
    table.setActiveRow('p3');
    check('marked', marked(host), ['p3']);
    ok('in place: the same <tr>', bodyRows(host)[2] === before);
    table.setActiveRow('p1');
    check('moved', marked(host), ['p1']);
    ok('the old row lost aria-current', !before.hasAttribute('aria-current'));
    table.setActiveRow(null);
    check('null clears it', marked(host), []);
    check('…and getActiveRow', table.getActiveRow(), null);
}
{
    const { host, table } = mount({ headers, rows });
    table.setActiveRow(1);
    check('without getRowKey the key is the original index', marked(host), ['p2']);
}

T.done();
