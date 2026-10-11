/**
 * 0.7.0 `rowDetail` (#26) — a row's detail, folded open under it.
 *
 * The first consumer's audit log drew one `<details>` per entry (its trace id,
 * its project and the JSON of what happened); every other list that wanted the
 * same had nowhere to put it. A detail is a DataTable option now: a toggle per
 * row, a full-width row under it drawn by the consumer's callback, kept by KEY
 * through a sort, a filter, a page, a `setData` and the virtual window.
 *
 *   §0  without `rowDetail`: no toggle, no extra row (0.6)
 *   §1  a toggle per row (only where `hasRowDetail` says); pressing it opens
 *       the detail under its row — drawn by the callback, named by
 *       `aria-controls` — and neither selects nor opens the row
 *   §2  pressed again, it closes
 *   §3  the stripe: rows under an open detail keep their parity
 *   §4  kept by key through a sort, a filter and a `setData`
 *   §5  the keyboard: ArrowRight / ArrowLeft on the table and on a toggle
 *   §6  `expandedRows`, `setRowExpanded`, `isRowExpanded`, `getExpandedRows`,
 *       `collapseAllRows`, `onRowDetailToggle`
 *   §7  `virtualize`: the detail is part of its row's height, leaves the
 *       window with its row and comes back with it
 *   §8  `updateRow` draws an open detail again from the new data
 *   §9  inside a detail: a click selects nothing, a right-click is the page's
 *   §10 a row's index (no `getRowKey`) is its key
 *
 * Against 0.6.0 every section but §0 fails: there is no toggle to press.
 *
 *     node tests/row_detail.test.mjs
 */
import { dataTableEnv } from './dt_env.mjs';

const T = await dataTableEnv('row detail');
const { check, ok, section, mount, bodyRows, click, key, tick } = T;

const headers = ['Name', 'Level', 'Note'];
const rows = [
    ['ann', 'info', 'signed in'],
    ['bob', 'warn', 'key paused'],
    ['cy', 'error', 'grant refused'],
    ['dee', 'info', 'signed out'],
];
const keyed = { getRowKey: (row) => row[0] };
const detailOf = (row) => {
    const pre = document.createElement('pre');
    pre.className = 'probe';
    pre.textContent = `detail of ${row[0]}`;
    return pre;
};
const toggles = (host) => [...host.querySelectorAll('.twm-dt-detail-toggle')];
const toggleOf = (host, name) => bodyRows(host)
    .find((tr) => tr.children[0].textContent === name)?.querySelector('.twm-dt-detail-toggle');
const bodyChildren = (host) => [...host.querySelector('.twm-preview-table-wrap tbody').children];
/** What the body holds, in order: a row's name, `+detail`, `.filler`. */
const shape = (host) => bodyChildren(host).map((tr) => {
    if (tr.classList.contains('twm-dt-detail-row')) return '+' + tr.querySelector('.twm-dt-detail').textContent;
    if (tr.classList.contains('twm-dt-detail-filler')) return '.';
    if (tr.classList.contains('twm-dt-spacer')) return '~';
    return tr.children[0].textContent;
});

section('§0 without rowDetail: nothing new');
{
    const { host, table } = mount({ headers, rows });
    check('no toggle', toggles(host).length, 0);
    check('the body is the rows', shape(host), ['ann', 'bob', 'cy', 'dee']);
    ok('no row is marked as having a detail', !host.querySelector('.twm-dt-row--has-detail'));
    table.dispose();
}

section('§1 a toggle per row; pressing it opens the detail under its row');
{
    const calls = [];
    const toggled = [];
    let activated = 0;
    const { host, table } = mount({
        headers, rows, ...keyed,
        rowDetail: (row, idx, ctx) => { calls.push([row[0], idx, ctx.key, ctx.host?.className]); return detailOf(row); },
        hasRowDetail: (row) => row[0] !== 'dee',
        onRowDetailToggle: (idx, row, open, k) => toggled.push([idx, row[0], open, k]),
        onRowActivate: () => { activated++; },
    });
    check('a toggle on every row with a detail, none on the one without', toggles(host).length, 3);
    ok('…in front of the first cell\'s text', toggleOf(host, 'ann')?.parentElement === bodyRows(host)[0].children[0]
        && bodyRows(host)[0].children[0].firstChild === toggleOf(host, 'ann'));
    check('the first cell\'s text is still only the name (glyph drawn by CSS)', bodyRows(host)[0].children[0].textContent, 'ann');
    const dee = bodyRows(host)[3].children[0];
    ok('a row with no detail keeps the toggle\'s room (its text lines up)',
       dee.firstChild?.classList.contains('twm-dt-detail-toggle-gap') && dee.textContent === 'dee');
    const t = toggleOf(host, 'bob');
    check('closed: aria-expanded', t.getAttribute('aria-expanded'), 'false');
    check('it is a button', [t.tagName, t.type], ['BUTTON', 'button']);
    check('its name', t.getAttribute('aria-label'), 'Details');
    check('nothing drawn before it is opened', calls.length, 0);
    click(t);
    check('opened: the detail is the row after bob, then the filler', shape(host),
          ['ann', 'bob', '+detail of bob', '.', 'cy', 'dee']);
    check('the callback was given the row, its index, its key and the host', calls, [['bob', 1, 'bob', 'twm-dt-detail']]);
    check('aria-expanded', t.getAttribute('aria-expanded'), 'true');
    const region = host.querySelector('.twm-dt-detail');
    ok('aria-controls names the detail', region.id && t.getAttribute('aria-controls') === region.id);
    check('the detail cell spans every column', host.querySelector('.twm-dt-detail-cell').colSpan, 3);
    ok('the filler is hidden', host.querySelector('.twm-dt-detail-filler').hidden);
    check('onRowDetailToggle', toggled, [[1, 'bob', true, 'bob']]);
    check('the press selected nothing', table.getSelection(), []);
    check('…and opened nothing', activated, 0);
    table.dispose();
}

section('§2 pressed again, it closes');
{
    const { host, table } = mount({ headers, rows, ...keyed, rowDetail: detailOf });
    click(toggleOf(host, 'cy'));
    click(toggleOf(host, 'cy'));
    check('closed again: the rows alone', shape(host), ['ann', 'bob', 'cy', 'dee']);
    check('aria-expanded false', toggleOf(host, 'cy').getAttribute('aria-expanded'), 'false');
    ok('no aria-controls while closed', !toggleOf(host, 'cy').hasAttribute('aria-controls'));
    check('no key open', table.getExpandedRows(), []);
    table.dispose();
}

section('§3 the stripe keeps its parity under an open detail');
{
    const { host, table } = mount({ headers, rows, ...keyed, rowDetail: detailOf });
    click(toggleOf(host, 'ann'));
    click(toggleOf(host, 'cy'));
    const children = bodyChildren(host);
    const parity = bodyRows(host).map((tr, k) => (children.indexOf(tr) % 2) === (k % 2));
    check('every data row stands at a position of its own parity', parity, [true, true, true, true]);
    table.dispose();
}

section('§4 kept by key through a sort, a filter and setData');
{
    const { host, table } = mount({ headers, rows, ...keyed, rowDetail: detailOf, sortable: true, filterable: true });
    click(toggleOf(host, 'bob'));
    table.sortBy(0, false);
    check('sorted descending: bob\'s detail is still under bob', shape(host),
          ['dee', 'cy', 'bob', '+detail of bob', '.', 'ann']);
    table.setFilter(0, 'ann');
    check('filtered away: no detail drawn', shape(host), ['ann']);
    ok('…but bob is still open', table.isRowExpanded('bob'));
    table.clearFilters();
    check('back: its detail with it', shape(host), ['dee', 'cy', 'bob', '+detail of bob', '.', 'ann']);
    table.setData({ rows: [['zed', 'info', 'x'], ['bob', 'warn', 'changed']] });
    check('new rows holding bob: still open', shape(host), ['zed', 'bob', '+detail of bob', '.']);
    table.dispose();
}

section('§5 the keyboard');
{
    const { host, table } = mount({ headers, rows, ...keyed, rowDetail: detailOf });
    click(bodyRows(host)[2]);                        // select cy
    const tableEl = host.querySelector('.twm-preview-table-wrap table');
    tableEl.focus();
    key(tableEl, 'ArrowRight');
    check('ArrowRight on the table opens the current row', shape(host),
          ['ann', 'bob', 'cy', '+detail of cy', '.', 'dee']);
    key(tableEl, 'ArrowLeft');
    check('ArrowLeft closes it', shape(host), ['ann', 'bob', 'cy', 'dee']);
    key(toggleOf(host, 'ann'), 'ArrowRight');
    check('ArrowRight on a toggle opens ITS row', table.getExpandedRows(), ['ann']);
    const ev = new T.window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true, shiftKey: true });
    toggleOf(host, 'ann').dispatchEvent(ev);
    check('with a modifier the arrows are not the detail\'s', table.getExpandedRows(), ['ann']);
    table.dispose();
}

section('§6 the programmatic surface');
{
    const toggled = [];
    const { host, table } = mount({
        headers, rows, ...keyed, rowDetail: detailOf, expandedRows: ['dee'],
        onRowDetailToggle: (idx, row, open) => toggled.push([row[0], open]),
    });
    check('expandedRows: open from the start', shape(host), ['ann', 'bob', 'cy', 'dee', '+detail of dee', '.']);
    ok('setRowExpanded opens', table.setRowExpanded('ann', true));
    ok('…and says when nothing changed', !table.setRowExpanded('ann', true));
    ok('isRowExpanded', table.isRowExpanded('ann') && !table.isRowExpanded('bob'));
    check('getExpandedRows', table.getExpandedRows().sort(), ['ann', 'dee']);
    check('onRowDetailToggle heard it', toggled, [['ann', true]]);
    table.collapseAllRows();
    check('collapseAllRows', shape(host), ['ann', 'bob', 'cy', 'dee']);
    ok('a key not on screen is remembered', table.setRowExpanded('nobody', true) && table.isRowExpanded('nobody'));
    table.dispose();
}

section('§7 virtualize: part of its row\'s height, in and out of the window with it');
{
    const many = Array.from({ length: 400 }, (_, i) => [`r${i}`, 'info', `n${i}`]);
    const { host, table } = mount({
        headers, rows: many, ...keyed, pagination: false, rowDetail: detailOf,
        virtualize: { overscan: 5, rowHeight: 20 },
    });
    const v = () => table._virt;
    const before = v().offsets[many.length];
    ok('opened while drawn', table.setRowExpanded('r2', true));
    ok('the detail is in the window, after its row',
       shape(host).join(' ').includes('r2 +detail of r2 . r3'));
    check('the table grew by the detail\'s (estimated) height', v().offsets[many.length] - before, 60);
    check('rows after it start lower by that much', v().offsets[3] - v().offsets[2], 80);
    table.scrollToRow(380, { block: 'start' });
    ok('scrolled away: the row and its detail left the window',
       !shape(host).includes('r2') && !host.querySelector('.twm-dt-detail-row'));
    table.scrollToRow(2, { block: 'start' });
    ok('scrolled back: drawn again with its detail', shape(host).join(' ').includes('r2 +detail of r2 . r3'));
    table.setRowExpanded('r2', false);
    check('closed: the height is the row\'s again', v().offsets[many.length], before);
    table.dispose();
}

section('§8 updateRow draws an open detail again');
{
    const { host, table } = mount({ headers, rows: rows.map((r) => [...r]), ...keyed,
                                    rowDetail: (row) => `note: ${row[2]}` });
    table.setRowExpanded('bob', true);
    table.updateRow(1, ['bob', 'warn', 'key resumed']);
    check('the detail reads the new data', host.querySelector('.twm-dt-detail').textContent, 'note: key resumed');
    check('one detail, still under bob', shape(host), ['ann', 'bob', '+note: key resumed', '.', 'cy', 'dee']);
    table.dispose();
}

section('§9 inside a detail');
{
    const { host, table } = mount({ headers, rows, ...keyed, rowDetail: detailOf });
    table.setRowExpanded('ann', true);
    const pre = host.querySelector('.twm-dt-detail pre');
    click(pre);
    check('a click in the detail selects nothing', table.getSelection(), []);
    const ev = new T.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 4, clientY: 4 });
    pre.dispatchEvent(ev);
    ok('a right-click is the page\'s (not prevented)', !ev.defaultPrevented);
    await tick(5);
    const menu = document.querySelector('.data-context-menu');
    ok('…and the copy menu did not open', !menu || menu.style.display !== 'block');
    table.dispose();
}

section('§10 without getRowKey, the row\'s index is its key');
{
    const { host, table } = mount({ headers, rows, rowDetail: detailOf });
    click(toggles(host)[3]);
    check('index 3 open', table.getExpandedRows(), ['3']);
    check('drawn under dee', shape(host), ['ann', 'bob', 'cy', 'dee', '+detail of dee', '.']);
    table.dispose();
}

T.done();
