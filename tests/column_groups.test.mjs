/**
 * STORY-0066 `columnGroups` — A GROUP ROW OVER THE COLUMN HEADERS, AND AN
 * EMPTY GROUP'S PLACEHOLDER COLUMN.
 *
 *   §1  two groups of 3 and 2 columns draw a group row with spans 3 and 2,
 *       each over its own columns (after the row number), and a hidden column
 *       leaves its group's span
 *   §2  the group row takes the header's widths: after the fit, after a pin
 *       restored from the store, after a drag and after an auto-size — its
 *       `<col>`s, its table width and its layout are the header's
 *   §3  the add control on a group header calls onColumnAdd with that
 *       group's key, and does not sort; groupActions' buttons call
 *       onGroupAction
 *   §4  an empty group shows a placeholder column — header, filter cell and a
 *       cell in every row — with its add control; it is no data column
 *   §5  a table with no groups renders exactly as before: no group row, no
 *       module built, and `columnGroups: []` draws the same DOM as none
 *   §6  with STORY-0086's `columnOrder` the group row and the placeholder
 *       follow the order the columns are drawn in, and a `moveColumn` redraws
 *       them
 *
 * Against 0.16, every section but §5 fails (there are no groups).
 *
 *     node tests/column_groups.test.mjs
 */
import { dataTableEnv } from './dt_env.mjs';

const T = await dataTableEnv('column groups');
const { check, ok, section, mount, bodyRows, click, tick, done, document } = T;

const headers = ['Cash', 'Loans', 'Bonds', 'Deposits', 'Equity'];
const rows = [[1, 2, 3, 4, 5], [6, 7, 8, 9, 10]];
const groups = [
    { key: 'assets', label: 'Assets', columns: [0, 1, 2] },
    { key: 'liab', label: 'Liabilities', columns: [3, 4] },
];

const groupTable = (host) => host.querySelector('.twm-preview-table-header-wrap table.twm-dt-groups');
const groupCells = (host) => [...(groupTable(host)?.querySelectorAll('thead > tr > th') || [])];
const labelCells = (table) => [...table._headerTableEl.querySelector('thead > tr').children];
const spans = (host) => groupCells(host).map((th) => th.colSpan);
const texts = (host) => groupCells(host).map((th) => th.querySelector('.twm-dt-group__label')?.textContent ?? '');
const rightClick = async (el) => {
    const ev = new T.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 });
    el.dispatchEvent(ev);
    await tick();
    return ev;
};
const menuOf = () => [...document.querySelectorAll('.data-context-menu')].find((m) => m.style.display !== 'none') || null;
const entries = (menu) => [...(menu?.children || [])].map((el) => (
    el.classList.contains('twm-context-menu__separator') ? '---' : el.querySelector('.label')?.textContent));

/** The label-row cells each group cell sits over: [first, last] by DOM index. */
const coverage = (host) => {
    let at = 0;
    return groupCells(host).map((th) => {
        const range = [at, at + th.colSpan - 1];
        at += th.colSpan;
        return range;
    });
};

section('§1 a group row with spans 3 and 2');
{
    const { host, table } = mount({ headers, rows, columnGroups: groups });
    ok('a group table is drawn in the header wrap, above the header table',
       groupTable(host) && groupTable(host).nextElementSibling === table._headerTableEl);
    check('two group cells, spans 3 and 2', spans(host), [3, 2]);
    check('…labelled', texts(host), ['Assets', 'Liabilities']);
    check('the spans cover the header row exactly', spans(host).reduce((a, b) => a + b, 0), labelCells(table).length);
    check('…and the body row', spans(host).reduce((a, b) => a + b, 0), bodyRows(host)[0].children.length);
    check('Assets is over Cash..Bonds, Liabilities over Deposits..Equity',
          coverage(host).map(([a, b]) => [labelCells(table)[a].title, labelCells(table)[b].title]),
          [['Cash', 'Bonds'], ['Deposits', 'Equity']]);
    check('the group table has one <col> a drawn column',
          groupTable(host).querySelectorAll('colgroup > col').length, labelCells(table).length);
    check('the header table itself still has one row', table._headerTableEl.querySelectorAll('thead > tr').length, 1);
    table.dispose();
}
{
    const { host, table } = mount({ headers, rows, columnGroups: groups, showRowNumbers: true });
    check('with row numbers: a blank lead cell, then 3 and 2', spans(host), [1, 3, 2]);
    ok('…the lead cell is blank', groupCells(host)[0].classList.contains('twm-dt-group--lead')
       && groupCells(host)[0].textContent === '');
    check('…still over the right columns',
          coverage(host).slice(1).map(([a, b]) => [labelCells(table)[a].title, labelCells(table)[b].title]),
          [['Cash', 'Bonds'], ['Deposits', 'Equity']]);
    table.dispose();
}
{
    const { host, table } = mount({
        headers, rows, columnGroups: [{ key: 'a', columns: [1, 2] }], hiddenColumns: [2],
    });
    check('a column in no group gets a blank cell, a hidden column leaves its span', spans(host), [1, 1, 2]);
    check('…the group\'s label defaults to its key', texts(host), ['', 'a', '']);
    ok('…blank cells are marked as none', groupCells(host)[0].classList.contains('twm-dt-group--none'));
    table.dispose();
}

section('§2 the group row takes the header\'s widths');
{
    const store = new Map();
    const stateStore = {
        ready: () => Promise.resolve(),
        get: (k) => store.get(k) ?? null,
        set: (k, v) => { store.set(k, JSON.parse(JSON.stringify(v))); },
    };
    store.set('g', { sortColumn: null, sortAscending: true, filters: [], colWidths: { 0: 101, 1: 102, 2: 103, 3: 104, 4: 105 } });
    const { host, table } = mount({ headers, rows, columnGroups: groups, persistKey: 'g', stateStore });
    const colWidths = () => [...groupTable(host).querySelectorAll('colgroup > col')].map((c) => c.style.width);
    const headWidths = () => labelCells(table).map((th) => th.style.width);
    table._syncHeaderWidths();                    // what the first frame does
    check('the header is pinned', headWidths(), ['101px', '102px', '103px', '104px', '105px']);
    check('the group row\'s columns are the header\'s', colWidths(), headWidths());
    check('…its table width is the header\'s', groupTable(host).style.width, table._headerTableEl.style.width);
    check('…and its layout', groupTable(host).style.tableLayout, 'fixed');

    // A drag on the third column's grip.
    const grip = labelCells(table)[2].querySelector('.twm-dt-col-resizer');
    grip.dispatchEvent(new T.window.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, clientX: 100 }));
    document.dispatchEvent(new T.window.MouseEvent('mousemove', { bubbles: true, clientX: 160 }));
    document.dispatchEvent(new T.window.MouseEvent('mouseup', { bubbles: true, clientX: 160 }));
    check('a drag widens the header column', headWidths()[2], '163px');
    check('…and the group row\'s with it', colWidths(), headWidths());
    check('…and the table width', groupTable(host).style.width, table._headerTableEl.style.width);

    table.resetColumnWidths();
    check('after a fit pass (the measure, jsdom\'s floor) the group row follows', colWidths(), headWidths());
    table.autoSizeColumn(1);
    check('after an auto-size too', colWidths(), headWidths());
    table.render();
    table._syncHeaderWidths();
    check('and after a render', colWidths(), headWidths());
    table.dispose();
}

section('§3 the add control on a group header');
{
    const added = [];
    const acted = [];
    const { host, table } = mount({
        headers, rows, sortable: true, columnGroups: groups,
        onColumnAdd: (key) => added.push(key),
        groupActions: (group, ctx) => [{ action: 'del', icon: 'delete', title: `Delete ${group.label}`, disabled: ctx.key === 'liab' }],
        onGroupAction: (action, key) => acted.push([action, key]),
    });
    const addOf = (i) => groupCells(host)[i].querySelector('.twm-dt-group__add');
    ok('every group header has an add control', addOf(0) && addOf(1));
    check('…named for its group', addOf(1).getAttribute('aria-label'), 'Add column to Liabilities');
    click(addOf(1));
    check('clicking it calls onColumnAdd with that group\'s key', added, ['liab']);
    click(groupCells(host)[0].querySelector('.twm-dt-group__add'));
    check('…and the other group\'s', added, ['liab', 'assets']);
    check('no column was sorted', table._state.sortColumn ?? null, null);
    const del = groupCells(host)[0].querySelector('.twm-dt-group__action');
    ok('groupActions\' button is drawn', del && del.title === 'Delete Assets');
    click(del);
    check('…and calls onGroupAction(action, key)', acted, [['del', 'assets']]);
    ok('a disabled one is disabled', groupCells(host)[1].querySelector('.twm-dt-group__action').disabled);
    table.dispose();
}
{
    // A label-only item shows its label; a groupActions that throws is
    // logged and the group row is still drawn.
    const { host, table } = mount({
        headers, rows, columnGroups: groups,
        groupActions: (group) => {
            if (group.key === 'liab') throw new Error('boom');
            return [{ action: 'x', label: 'Drop' }];
        },
    });
    const b = groupCells(host)[0].querySelector('.twm-dt-group__action');
    check('a label-only action shows its label', b?.textContent, 'Drop');
    check('…named by it', b?.getAttribute('aria-label'), 'Drop');
    check('a groupActions that throws draws no button there, and the row is drawn',
          [spans(host), groupCells(host)[1].querySelectorAll('.twm-dt-group__action').length], [[3, 2], 0]);
    table.dispose();
}
{
    const { host, table } = mount({ headers, rows, columnGroups: groups });
    check('without onColumnAdd there is no add control', host.querySelectorAll('.twm-dt-group__add').length, 0);
    table.dispose();
}
{
    // setData with new group objects whose key, label and columns are the
    // same but another field changed: groupActions is asked with the new
    // object and its button is redrawn from it.
    const asked = [];
    const first = { key: 'a', label: 'A', columns: [0, 1], locked: false };
    const { host, table } = mount({
        headers, rows, columnGroups: [first],
        groupActions: (group) => {
            asked.push(group);
            return [{ action: 'lock', label: group.locked ? 'Unlock' : 'Lock' }];
        },
    });
    const label = () => groupCells(host).find((th) => th.title === 'A')?.querySelector('.twm-dt-group__action')?.textContent;
    check('the first draw asks with the given object', [asked.at(-1) === first, label()], [true, 'Lock']);
    const next = { key: 'a', label: 'A', columns: [0, 1], locked: true };
    const before = asked.length;
    table.setData({ columnGroups: [next] });
    await tick();
    ok('setData with only another field changed asks groupActions again', asked.length > before);
    ok('…with the new group object', asked.slice(before).every((g) => g === next));
    check('…and its button is redrawn from it', label(), 'Unlock');
    table.dispose();
}

section('§4 an empty group keeps a placeholder column');
{
    const added = [];
    const spec = [
        { key: 'assets', label: 'Assets', columns: [0, 1, 2] },
        { key: 'liab', label: 'Liabilities', columns: [] },
        { key: 'eq', label: 'Equity', columns: [3, 4] },
    ];
    const { host, table } = mount({
        headers, rows, columnGroups: spec, filterable: true, copyable: true,
        onColumnAdd: (key) => added.push(key),
    });
    const head = labelCells(table);
    check('six drawn columns: five data columns and one placeholder', head.length, 6);
    check('the placeholder stands after the groups listed before it',
          head.map((th) => (th.classList.contains('twm-dt-col--placeholder') ? '+' : th.title)),
          ['Cash', 'Loans', 'Bonds', '+', 'Deposits', 'Equity']);
    check('the group row spans 3, 1, 2', spans(host), [3, 1, 2]);
    ok('…the empty group\'s cell is marked empty', groupCells(host)[1].classList.contains('twm-dt-group--empty'));
    const add = head[3].querySelector('.twm-dt-group__add');
    ok('the placeholder\'s header holds the add control', !!add);
    click(add);
    check('…which calls onColumnAdd with the empty group\'s key', added, ['liab']);
    click(groupCells(host)[1].querySelector('.twm-dt-group__add'));
    check('…as does the group header\'s', added, ['liab', 'liab']);
    const filter = table._headerTableEl.querySelector('tr.twm-data-table__filter-row');
    check('the filter row has a cell for it too', filter.children.length, 6);
    ok('…an empty one', filter.children[3].classList.contains('twm-dt-col--placeholder')
       && !filter.children[3].querySelector('input'));
    check('every body row has an empty placeholder cell',
          bodyRows(host).map((tr) => [tr.children.length, tr.children[3].className, tr.children[3].textContent]),
          [[6, 'twm-dt-cell--placeholder', ''], [6, 'twm-dt-cell--placeholder', '']]);
    check('the data cells after it are the right ones', bodyRows(host)[0].children[4].textContent, '4');
    check('it is no data column', table._dataIdxOfDom(3), null);
    check('…and the data columns map past it', [0, 1, 2, 3, 4].map((c) => table._domIdxOf(c)), [0, 1, 2, 4, 5]);
    table.setFilter(3, '9');
    check('a filter on a column after it lands on that column', bodyRows(host).map((tr) => tr.__rowIndex), [1]);
    check('…and its box is drawn in that column',
          table._headerTableEl.querySelector('tr.twm-data-table__filter-row').children[4].querySelector('input')?.value, '9');
    table.dispose();
}
{
    // With no rows at all the empty group is still reachable.
    const added = [];
    const { host, table } = mount({
        headers: ['A'], rows: [],
        columnGroups: [{ key: 'x', label: 'X', columns: [0] }, { key: 'y', label: 'Y', columns: [] }],
        onColumnAdd: (key) => added.push(key),
    });
    check('an empty table draws the group row', spans(host), [1, 1]);
    const ph = labelCells(table)[1];
    ok('…and the placeholder column', ph?.classList.contains('twm-dt-col--placeholder'));
    check('…the empty row spans it', host.querySelector('.twm-preview-table-wrap tbody td').colSpan, 2);
    click(ph.querySelector('.twm-dt-group__add'));
    check('…and its add control works', added, ['y']);
    table.dispose();
}
{
    // Cell mode skips it.
    const { host, table } = mount({
        headers, rows, selectionMode: 'cells',
        columnGroups: [{ key: 'a', columns: [0, 1] }, { key: 'b', columns: [] }, { key: 'c', columns: [2, 3, 4] }],
    });
    const tr = bodyRows(host)[0];
    ok('the placeholder is the third drawn column', tr.children[2].classList.contains('twm-dt-cell--placeholder'));
    T.mouse('mousedown', tr.children[2]);
    click(tr.children[2]);
    check('a click on the placeholder selects no cell', table.getCellSelection()?.focus ?? null, null);
    T.mouse('mousedown', tr.children[3]);
    click(tr.children[3]);
    check('a click on the column after it selects that column', table.getCellSelection()?.focus?.col, 2);
    table.dispose();
}
{
    // Under `virtualize` the body's column track counts it.
    const { host, table } = mount({
        headers, rows, virtualize: true, pagination: false,
        columnGroups: [{ key: 'a', columns: [0, 1, 2, 3, 4] }, { key: 'b', columns: [] }],
    });
    check('the body <colgroup> has a <col> for the placeholder',
          table._tableEl.querySelectorAll('colgroup > col').length, 6);
    check('…and every drawn row its cell, last',
          bodyRows(host).map((tr) => [tr.children.length, tr.lastElementChild.className]),
          [[6, 'twm-dt-cell--placeholder'], [6, 'twm-dt-cell--placeholder']]);
    table.updateRow(1, [11, 12, 13, 14, 15]);
    check('a row drawn again by updateRow keeps it', bodyRows(host)[1].lastElementChild.className, 'twm-dt-cell--placeholder');
    table.dispose();
}
{
    // The groups change with setData.
    const { host, table } = mount({ headers, rows });
    ok('no group row to start', !groupTable(host));
    table.setData({ columnGroups: groups });
    check('setData({columnGroups}) draws them', spans(host), [3, 2]);
    const gone = groupTable(host);
    gone.style.width = '1px';
    table.setData({ columnGroups: null });
    ok('…and null takes them away', !groupTable(host));
    check('…with no placeholder left behind', bodyRows(host)[0].children.length, 5);
    table._headerTableEl.style.width = '321px';
    table._syncHeaderScroll();
    check('…and the scroll sync no longer writes into the detached group table', gone.style.width, '1px');
    table.setData({ columnGroups: groups });
    table._syncHeaderScroll();
    check('groups set again draw a new group table that follows the header',
          groupTable(host) !== gone && groupTable(host).style.width, table._headerTableEl.style.width);
    table.dispose();
}

section('§5 a table with no groups renders exactly as before');
{
    const cfg = { headers, rows, sortable: true, filterable: true, showRowNumbers: true, copyable: true };
    const plain = mount(cfg);
    const empty = mount({ ...cfg, columnGroups: [] });
    ok('no group table', !groupTable(plain.host) && !groupTable(empty.host));
    ok('no group module is built', plain.table._columnGroups === null && empty.table._columnGroups === null);
    ok('no structure module is built', plain.table._tableStructure === null);
    check('the header has its one label row and its filter row',
          plain.table._headerTableEl.querySelectorAll('thead > tr').length, 2);
    check('columnGroups: [] draws the same DOM as no option',
          empty.host.innerHTML, plain.host.innerHTML);
    check('the drawn columns are the data columns and the row number',
          bodyRows(plain.host)[0].children.length, 6);
    await rightClick(plain.table._headerTableEl.querySelector('thead > tr').children[1]);
    ok('a right-click on the header opens no table menu', !menuOf() || entries(menuOf()).length === 0);
    plain.table.dispose();
    empty.table.dispose();
}

section('§6 the groups follow the drawn column order (STORY-0086)');
{
    const { host, table } = mount({ headers, rows, columnGroups: groups, columnOrder: [3, 0, 1, 2, 4] });
    check('Deposits drawn first splits Liabilities: spans 1, 3, 1', spans(host), [1, 3, 1]);
    check('…labelled', texts(host), ['Liabilities', 'Assets', 'Liabilities']);
    check('…each over its own columns',
          coverage(host).map(([a, b]) => [labelCells(table)[a].title, labelCells(table)[b].title]),
          [['Deposits', 'Deposits'], ['Cash', 'Bonds'], ['Equity', 'Equity']]);
    table.moveColumn(0, 3);
    check('a moveColumn back to the natural order redraws the group row: 3 and 2', spans(host), [3, 2]);
    table.dispose();
}
{
    const spec = [
        { key: 'assets', label: 'Assets', columns: [0, 1, 2] },
        { key: 'liab', label: 'Liabilities', columns: [] },
        { key: 'eq', label: 'Equity', columns: [3, 4] },
    ];
    const { host, table } = mount({ headers, rows, columnGroups: spec, columnOrder: [0, 1, 3, 2, 4] });
    const head = labelCells(table);
    check('the placeholder stands before the first drawn column of a group listed after it',
          head.map((th) => (th.classList.contains('twm-dt-col--placeholder') ? '+' : th.title)),
          ['Cash', 'Loans', '+', 'Deposits', 'Bonds', 'Equity']);
    check('the group row spans 2, 1, 1, 1, 1', spans(host), [2, 1, 1, 1, 1]);
    check('the body cells line up under their headers',
          [...bodyRows(host)[0].children].map((td) => td.textContent), ['1', '2', '', '4', '3', '5']);
    check('the data columns map to their drawn places', [0, 1, 2, 3, 4].map((c) => table._domIdxOf(c)), [0, 1, 4, 3, 5]);
    check('…and back', [0, 1, 2, 3, 4, 5].map((d) => table._dataIdxOfDom(d)), [0, 1, null, 3, 2, 4]);
    table.dispose();
}

done();
