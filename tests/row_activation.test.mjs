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
 *   §5  activateOn 'enter': the SELECTED row (the one a double-click on it
 *       would open), the active row only when nothing is selected; never from
 *       a field inside a cell
 *   §6  modifiers: a selection gesture in a multi-select table, the
 *       consumer's in a table that does not select
 *   §7  attachLandingTableBehavior opens by the same rule
 *   §8  a press whose selection callback RE-DRAWS the table still opens the
 *       pressed row (onSelectionChange → setData, onRowClick → render), on
 *       click and on dblclick; one that DISPOSES it opens nothing
 *   §9  'single': the Ctrl click that takes the row off the selection does
 *       not also open it; a Ctrl click that selects a row opens it, saying so
 *
 * Against 0.4.7, §1–§9 fail; against the first 0.5.0 build, §5's selected-
 * over-active case, §8 and §9.
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
    check('a row selected and ANOTHER active: Enter opens the selected one', seen, ['1:keydown', '1:keydown']);
    table.clearSelection();
    key(tbl, 'Enter');
    check('nothing selected: Enter opens the active row', seen, ['1:keydown', '1:keydown', '2:keydown']);
}
{
    // The pick list of a master-detail screen: what opened is marked active,
    // the person picks another row, and Enter must open THAT row — as a
    // double-click on it would.
    const seen = [];
    let table;
    ({ table } = mount({
        headers, rows, selectable: 'single', activateOn: ['dblclick', 'enter'],
        getRowKey: (r) => r[0],
        onRowActivate: (_idx, row, ev) => { seen.push(`${row[0]}:${ev.type}`); table.setActiveRow(row[0]); },
    }));
    const host = table.container;
    doubleClick(bodyRows(host)[0].children[0]);
    click(bodyRows(host)[2].children[0]);
    key(bodyTable(host), 'Enter');
    check('dblclick opens c; picking b and pressing Enter opens b', seen, ['c:dblclick', 'b:keydown']);
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
{
    // The README lists these as the helper's changes that need no option.
    const { attachLandingTableBehavior } = await import('../src/tiling/landing_table.js');
    const opened = [];
    const { host } = mount({
        headers, rows, selectable: false, copyable: false,
        renderCell: (td, value, colIdx) => {
            if (colIdx !== 1) return false;
            td.innerHTML = `<label>${value}</label><span contenteditable="true">x</span>`;
            return true;
        },
    });
    const off = attachLandingTableBehavior(host, (i) => rows[i], { open: (row) => opened.push(row[0]) });
    click(bodyRows(host)[0].querySelector('label'));
    click(bodyRows(host)[0].querySelector('[contenteditable]'));
    check('a label or editable text in a row opens nothing', opened, []);
    off();
}

section('§8 a press that re-draws the table still opens the row');
{
    const seen = [];
    let table;
    ({ table } = mount({
        headers, rows,
        onSelectionChange: () => table.setData({ rows: rows.map((r) => r.slice()) }),
        onRowActivate: (idx, row, ev) => seen.push(`${idx}:${row[0]}:${ev.type}`),
    }));
    const host = table.container;
    const pressed = bodyRows(host)[1];
    click(pressed.children[0]);
    check('onSelectionChange → setData: the pressed row opened, once', seen, ['1:a:click']);
    ok('…and the table was re-drawn under it', !pressed.isConnected);
    click(bodyRows(host)[2].children[0]);
    check('…and the re-drawn table opens too', seen, ['1:a:click', '2:b:click']);
    await tick(5);
    click(pressed.children[0]);
    check('a task later the replaced body has let go: its old row opens nothing',
          seen, ['1:a:click', '2:b:click']);
}
{
    const seen = [];
    let table;
    ({ table } = mount({
        headers, rows, selectable: false,
        onRowClick: () => table.render(),
        onRowActivate: (idx) => seen.push(idx),
    }));
    click(bodyRows(table.container)[0].children[0]);
    check('onRowClick → render: it opened', seen, [0]);
}
{
    // A double-click on a list whose every click re-draws: the second click
    // lands on the re-drawn row and re-draws again, and the dblclick goes to
    // the row the second click landed on.
    const seen = [];
    let table;
    ({ table } = mount({
        headers, rows, selectable: 'single', activateOn: 'dblclick',
        onSelectionChange: () => table.setData({ rows }),
        onRowActivate: (idx, _row, ev) => seen.push(`${idx}:${ev.type}`),
    }));
    const host = table.container;
    click(bodyRows(host)[2].children[0], { detail: 1 });
    const second = bodyRows(host)[2].children[0];
    click(second, { detail: 2 });
    mouse('dblclick', second, { detail: 2 });
    check('dblclick: it opened', seen, ['2:dblclick']);
}
{
    const seen = [];
    let table;
    ({ table } = mount({
        headers, rows,
        onSelectionChange: () => table.dispose(),
        onRowActivate: (idx) => seen.push(idx),
    }));
    click(bodyRows(table.container)[0].children[0]);
    check('onSelectionChange → dispose(): a disposed table opens nothing', seen, []);
}

section('§9 single: the Ctrl click that takes the row off does not open it');
{
    const seen = [];
    let table;
    ({ table } = mount({
        headers, rows, selectable: 'single',
        onRowActivate: (idx, _row, ev) => seen.push({ idx, ctrl: ev.ctrlKey, selected: table.getSelection() }),
    }));
    const host = table.container;
    click(bodyRows(host)[1].children[0]);
    click(bodyRows(host)[1].children[0], { ctrlKey: true });
    check('the plain click opened; the Ctrl click that took the row off did not',
          seen, [{ idx: 1, ctrl: false, selected: [1] }]);
    check('…and it is off', table.getSelection(), []);
    click(bodyRows(host)[2].children[0], { ctrlKey: true });
    check('a Ctrl click that SELECTS a row opens it, and says Ctrl',
          seen.at(-1), { idx: 2, ctrl: true, selected: [2] });
}
{
    // The same rule when the selection callback re-draws with new rows (which
    // clears the selection before the activation listener runs).
    const seen = [];
    let table;
    let redraw = false;
    ({ table } = mount({
        headers, rows, selectable: 'single',
        onSelectionChange: () => { if (redraw) table.setData({ rows: rows.map((r) => r.slice()) }); },
        onRowActivate: (idx) => seen.push(idx),
    }));
    const host = table.container;
    click(bodyRows(host)[0].children[0]);
    check('a plain click opens', seen, [0]);
    redraw = true;
    click(bodyRows(host)[0].children[0], { ctrlKey: true });
    check('re-drawn by the callback: the un-selecting Ctrl click still opens nothing', seen, [0]);
}

await tick();
T.done();
