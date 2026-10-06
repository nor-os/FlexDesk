/**
 * 0.5.0 `onRowActivate` + `activateOn`, the `twm-dt--clickable` class, and the
 * landing helper folded onto the same rule.
 *
 * Opening a row was `onRowClick` — bound on the `<tr>`, so it ran BEFORE the
 * selection — or `attachLandingTableBehavior`, or a consumer's own delegated
 * listener (six lists and four private copies in the first consumer). The
 * consumer's copies carried two guards the others did not: a drag that ends by
 * selecting a cell's text does not open the row, and the second click of a
 * double-click does nothing. One rule now (`row_activation.js`), used by both.
 *
 *   §0  without the keys: no clickable class, and onRowClick still runs
 *       BEFORE the selection, as in 0.4
 *   §1  twm-dt--clickable follows onRowActivate; `clickable` overrides it
 *   §2  a click opens the row ONCE, after the selection, with the original
 *       index and the row
 *   §3  the guards: a control in the row, the second click of a double-click,
 *       a drag that selected text in the table (one elsewhere does not count)
 *   §4  activateOn 'dblclick': one click opens nothing; a double-click opens once
 *   §5  activateOn 'enter': the active row, else the one selected row; never
 *       from a field inside a cell
 *   §6  modifiers: a selection gesture in a multi-select table, the
 *       consumer's in a table that does not select
 *   §7  attachLandingTableBehavior opens by the same rule
 *
 * Against 0.4.7, §1–§7 fail.
 *
 *     node tests/row_activation.test.mjs
 */
import { dataTableEnv } from './dt_env.mjs';

const T = await dataTableEnv('row activation');
const { check, ok, section, mount, bodyRows, click, doubleClick, mouse, key, tick } = T;

const headers = ['Name', 'Value'];
const rows = [['c', 3], ['a', 1], ['b', 2]];
const bodyTable = (host) => host.querySelector('.twm-preview-table-wrap table');

/** Select the text of one cell, as a drag across it would. */
function selectTextOf(el) {
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = document.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
}
const clearText = () => document.getSelection().removeAllRanges();

section('§0 without the keys: 0.4');
{
    const seen = [];
    let table;
    ({ table } = mount({
        headers, rows,
        onRowClick: (idx) => seen.push({ idx, selected: table.getSelection() }),
    }));
    const host = table.container;
    ok('no clickable class', !bodyTable(host).classList.contains('twm-dt--clickable'));
    click(bodyRows(host)[1]);
    check('onRowClick ran before the selection (it saw none)', seen, [{ idx: 1, selected: [] }]);
    check('…and the row was selected after it', table.getSelection(), [1]);
}

section('§1 the clickable class');
{
    let { host } = mount({ headers, rows, onRowActivate: () => {} });
    ok('onRowActivate → twm-dt--clickable on the body table', bodyTable(host).classList.contains('twm-dt--clickable'));
    ({ host } = mount({ headers, rows, onRowActivate: () => {}, clickable: false }));
    ok('clickable:false takes it off', !bodyTable(host).classList.contains('twm-dt--clickable'));
    ({ host } = mount({ headers, rows, onRowClick: () => {}, clickable: true }));
    ok('clickable:true puts it on without onRowActivate', bodyTable(host).classList.contains('twm-dt--clickable'));
    ({ host } = mount({ headers, rows: [], onRowActivate: () => {} }));
    ok('an empty table carries it too', host.querySelector('table.twm-dt--clickable'));
}

section('§2 a click opens once, after the selection');
{
    const seen = [];
    let table;
    ({ table } = mount({
        headers, rows, sortable: true,
        onRowActivate: (idx, row, ev) => seen.push({ idx, row, type: ev.type, selected: table.getSelection() }),
    }));
    table.sortBy(0, true);                       // a, b, c on screen
    const host = table.container;
    click(bodyRows(host)[0].children[1]);        // the "a" row, original index 1
    check('opened once, after the selection, with the ORIGINAL index and the row',
          seen, [{ idx: 1, row: ['a', 1], type: 'click', selected: [1] }]);
}

section('§3 the guards');
{
    const seen = [];
    const { host } = mount({
        headers, rows, selectable: false,
        renderCell: (td, value, colIdx) => {
            if (colIdx !== 1) return false;
            td.innerHTML = `<span>${value}</span> <button type="button">Delete</button>`;
            return true;
        },
        onRowActivate: (idx) => seen.push(idx),
    });
    click(bodyRows(host)[0].querySelector('button'));
    check('a button in the row opens nothing', seen, []);
    click(bodyRows(host)[0].children[0], { detail: 2 });
    check('the second click of a double-click opens nothing', seen, []);
    selectTextOf(bodyRows(host)[0].children[0]);
    click(bodyRows(host)[0].children[0]);
    check('a click that ends a text selection in the table opens nothing', seen, []);
    const elsewhere = document.createElement('p');
    elsewhere.textContent = 'somewhere else on the page';
    document.body.appendChild(elsewhere);
    selectTextOf(elsewhere);
    click(bodyRows(host)[2].children[0]);
    check('a selection elsewhere on the page does not count', seen, [2]);
    clearText();
    click(bodyRows(host)[1].children[0], { detail: 0 });
    check('a synthetic click (detail 0) is a single click', seen, [2, 1]);
}

section('§4 activateOn: dblclick');
{
    const seen = [];
    const { host } = mount({
        headers, rows, selectable: 'single', activateOn: 'dblclick',
        onRowActivate: (idx, _row, ev) => seen.push(`${idx}:${ev.type}`),
    });
    click(bodyRows(host)[0].children[0]);
    check('one click opens nothing', seen, []);
    doubleClick(bodyRows(host)[2].children[0]);
    check('a double-click opens once, on the dblclick', seen, ['2:dblclick']);
    doubleClick(bodyRows(host)[1].querySelector('td'));
    check('…every time', seen, ['2:dblclick', '1:dblclick']);
}

section('§5 activateOn: enter');
{
    const seen = [];
    const { host, table } = mount({
        headers, rows, selectable: 'single', activateOn: ['dblclick', 'enter'],
        renderCell: (td, value, colIdx) => {
            if (colIdx !== 1) return false;
            td.innerHTML = `<input value="${value}">`;
            return true;
        },
        onRowActivate: (idx, _row, ev) => seen.push(`${idx}:${ev.type}`),
    });
    const tbl = bodyTable(host);
    key(tbl, 'Enter');
    check('nothing selected, nothing active: Enter opens nothing', seen, []);
    click(bodyRows(host)[1].children[0]);
    key(tbl, 'Enter');
    check('Enter opens the one selected row', seen, ['1:keydown']);
    key(bodyRows(host)[2].querySelector('input'), 'Enter');
    check('Enter in a field inside a cell is the field\'s', seen, ['1:keydown']);
    key(tbl, 'Enter', { ctrlKey: true });
    check('Ctrl+Enter is not this key', seen, ['1:keydown']);
    table.setActiveRow(2);
    key(tbl, 'Enter');
    check('with an active row, Enter opens THAT row', seen, ['1:keydown', '2:keydown']);
}

section('§6 modifiers');
{
    const seen = [];
    let { host, table } = mount({
        headers, rows, selectable: true,
        onRowActivate: (idx, _row, ev) => seen.push({ idx, ctrl: ev.ctrlKey }),
    });
    click(bodyRows(host)[0].children[0]);
    click(bodyRows(host)[2].children[0], { ctrlKey: true });
    click(bodyRows(host)[1].children[0], { shiftKey: true });
    check('multi-select: Ctrl and Shift clicks only select', seen, [{ idx: 0, ctrl: false }]);
    check('…and they did select (Shift ranges from the Ctrl anchor)', table.getSelection(), [1, 2]);
    seen.length = 0;
    ({ host, table } = mount({
        headers, rows, selectable: false,
        onRowActivate: (idx, _row, ev) => seen.push({ idx, ctrl: ev.ctrlKey }),
    }));
    click(bodyRows(host)[2].children[0], { ctrlKey: true });
    check('no selection: a Ctrl click opens, and says so', seen, [{ idx: 2, ctrl: true }]);
    mouse('click', bodyRows(host)[1].children[0], { detail: 1, button: 1 });
    check('a middle click is not a row click', seen, [{ idx: 2, ctrl: true }]);
}

section('§7 the landing helper opens by the same rule');
{
    const { attachLandingTableBehavior } = await import('../src/tiling/landing_table.js');
    const opened = [];
    const edited = [];
    const { host } = mount({
        headers, rows, selectable: false, copyable: false,
        renderCell: (td, value, colIdx) => {
            if (colIdx !== 1) return false;
            td.innerHTML = `<span>${value}</span><button data-twm-action="edit">e</button>`;
            return true;
        },
    });
    const off = attachLandingTableBehavior(host, (i) => rows[i], {
        open: (row) => opened.push(row[0]),
        edit: (row) => edited.push(row[0]),
    });
    doubleClick(bodyRows(host)[0].children[0]);
    check('a double-click opens ONCE (0.4.7 opened twice)', opened, ['c']);
    selectTextOf(bodyRows(host)[1].children[0]);
    click(bodyRows(host)[1].children[0]);
    check('a drag that selected text opens nothing', opened, ['c']);
    clearText();
    click(bodyRows(host)[2].querySelector('button'));
    check('a row verb still dispatches', edited, ['b']);
    check('…and does not open the row', opened, ['c']);
    click(bodyRows(host)[2].children[0]);
    check('a plain click opens', opened, ['c', 'b']);
    off();
}

await tick();
T.done();
