/**
 * STORY-0003 `selectionMode: 'cells'` — A CURSOR CELL, A RANGE, AND THE KEYS
 * OVER CELLS.
 *
 *   §0  the model alone (`CellSelection`): set, extend, the edges, Ctrl+arrow
 *       over blocks of filled cells, Home/End, Tab's wrap, select all
 *   §1  a click selects one cell, Shift+click from (0,0) to (2,3) a 3×4 range;
 *       `getCellSelection()`; every cell in it is `twm-dt-cell--selected`;
 *       `getSelection()` still answers rows (the rows the range touches)
 *   §2  the keys on the focused table: arrows, Ctrl+arrow, Home/End, Tab and its
 *       wrap (not taken on the last cell, nor Shift+Tab on the first, so
 *       focus leaves the table), ArrowDown on the last row, Shift extends,
 *       Ctrl+A, Escape
 *   §3  the range follows the order SHOWN (a sort) and skips hidden columns
 *   §4  combining with selectToggle / selectMode / keyboardNav is ignored with
 *       a warning; `editable` without cell mode is ignored with a warning
 *   §5  a table without the option: no cell classes, no cell expandos, the
 *       row click selects rows as in 0.16
 *
 * Against 0.16, §1–§4 fail (there is no cell mode).
 *
 *     node tests/cell_selection.test.mjs
 */
import { dataTableEnv } from './dt_env.mjs';

const T = await dataTableEnv('cell selection');
const { check, ok, section, mount, bodyRows, click, key, done } = T;
const { CellSelection } = await import('../src/ui/components/cell_selection.js');
const { isFilledValue } = await import('../src/ui/components/cell_grid.js');

const headers = ['A', 'B', 'C', 'D', 'E'];
const rows = [
    [1, 'a', null, 'x', 10],
    [2, 'b', null, 'y', 20],
    [3, 'c', 'k', '', 30],
    [4, '', 'l', 'z', 40],
    [5, 'e', 'm', 'w', 50],
];
const cellAt = (host, r, c) => bodyRows(host)[r].children[c];
const lit = (host) => bodyRows(host).flatMap((tr, r) => [...tr.children]
    .map((td, c) => (td.classList.contains('twm-dt-cell--selected') ? `${r},${c}` : null))
    .filter(Boolean));
const cursorAt = (host) => {
    for (const [r, tr] of bodyRows(host).entries()) {
        for (const [c, td] of [...tr.children].entries()) {
            if (td.classList.contains('twm-dt-cell--cursor')) return [r, c];
        }
    }
    return null;
};
const focusOf = (table) => {
    const f = table.getCellSelection().focus;
    return f ? [f.row, f.col] : null;
};

section('§0 the model');
{
    const m = new CellSelection();
    m.setBounds(0, 4, [0, 1, 2, 3]);
    m.setCursor(1, 1);
    check('a cursor is a one-cell range', m.range(), { top: 1, bottom: 1, left: 1, right: 1, columns: [1] });
    m.extendTo(3, 3);
    check('extend keeps the anchor', [m.anchor, m.focus], [{ row: 1, col: 1 }, { row: 3, col: 3 }]);
    ok('contains inside', m.contains(2, 2) && !m.contains(0, 2) && !m.contains(2, 0));
    m.setCursor(4, 3);
    m.move(1, 0);
    check('down on the last row stays', m.focus, { row: 4, col: 3 });
    m.move(0, 1);
    check('right on the last column stays', m.focus, { row: 4, col: 3 });
    m.setCursor(0, 3);
    m.tab();
    check('Tab on the last column wraps to the next row', m.focus, { row: 1, col: 0 });
    m.tab(true);
    check('Shift+Tab wraps back', m.focus, { row: 0, col: 3 });
    m.setCursor(4, 3);
    m.tab();
    check('Tab on the last cell stays', m.focus, { row: 4, col: 3 });
    ok('tabEnds on the last cell', m.tabEnds() && !m.tabEnds(true));
    m.setCursor(0, 0);
    ok('tabEnds(back) on the first cell', m.tabEnds(true) && !m.tabEnds());
    m.setCursor(2, 1);
    ok('tabEnds is false inside the grid', !m.tabEnds() && !m.tabEnds(true));
    m.setCursor(2, 2);
    m.lineEnd(false);
    check('Home: the row\'s first column', m.focus, { row: 2, col: 0 });
    m.lineEnd(true);
    check('End: the row\'s last column', m.focus, { row: 2, col: 3 });
    m.lineEnd(false, { corner: true });
    check('Ctrl+Home: the first cell', m.focus, { row: 0, col: 0 });
    m.selectAll();
    check('select all', m.range(), { top: 0, bottom: 4, left: 0, right: 3, columns: [0, 1, 2, 3] });
    m.setBounds(0, 1, [0, 2]);
    check('new bounds pull a selection in (a hidden column: the shown one before it)',
          m.focus, { row: 1, col: 2 });

    // Ctrl+arrow, a column of: filled filled filled empty empty filled filled empty
    const col = [1, 1, 1, 0, 0, 1, 1, 0];
    const filled = (r) => !!col[r];
    const j = new CellSelection();
    j.setBounds(0, 7, [0]);
    j.setCursor(0, 0);
    j.jump(1, 0, filled);
    check('Ctrl+Down in a block: to its last filled cell', j.focus.row, 2);
    j.jump(1, 0, filled);
    check('Ctrl+Down at a block\'s end: to the next filled cell', j.focus.row, 5);
    j.jump(1, 0, filled);
    check('…and through that block', j.focus.row, 6);
    j.jump(1, 0, filled);
    check('no filled cell left: the edge', j.focus.row, 7);
    j.jump(-1, 0, filled);
    check('Ctrl+Up from an empty cell: the next filled one', j.focus.row, 6);
    j.setCursor(3, 0);
    j.jump(-1, 0, filled, { extend: true });
    check('Ctrl+Shift+Up extends', [j.anchor.row, j.focus.row], [3, 2]);
    check('isFilledValue', [null, undefined, '', 0, 'x', NaN, false].map(isFilledValue),
          [false, false, false, true, true, false, true]);
}

section('§1 the pointer, and what it answers');
{
    const seen = [];
    const cellSeen = [];
    const { host, table } = mount({
        headers, rows, selectionMode: 'cells', pagination: false,
        onSelectionChange: (s) => seen.push(s),
        onCellSelectionChange: (s) => cellSeen.push(s),
    });
    ok('the table says it is in cell mode', table._tableEl.classList.contains('twm-dt--cells'));
    click(cellAt(host, 0, 0));
    check('a click selects one cell', lit(host), ['0,0']);
    check('…and puts the cursor on it', cursorAt(host), [0, 0]);
    ok('no row is lit as a row', !bodyRows(host).some((tr) => tr.classList.contains('selected')));
    click(cellAt(host, 2, 3), { shiftKey: true });
    const sel = table.getCellSelection();
    check('getCellSelection after Shift+click to (2,3)', {
        anchor: sel.anchor, focus: sel.focus,
        range: { top: sel.range.top, bottom: sel.range.bottom, left: sel.range.left, right: sel.range.right },
    }, {
        anchor: { row: 0, col: 0, rowIdx: 0 }, focus: { row: 2, col: 3, rowIdx: 2 },
        range: { top: 0, bottom: 2, left: 0, right: 3 },
    });
    check('the range lists its rows and columns', [sel.range.rows, sel.range.columns], [[0, 1, 2], [0, 1, 2, 3]]);
    const expected = [];
    for (let r = 0; r <= 2; r++) for (let c = 0; c <= 3; c++) expected.push(`${r},${c}`);
    check('every cell of the 3×4 range carries twm-dt-cell--selected', lit(host), expected);
    check('…which is 12 cells', lit(host).length, 12);
    check('getSelection() still returns rows: the ones the range touches', table.getSelection(), [0, 1, 2]);
    check('onSelectionChange heard the rows', seen.at(-1), [0, 1, 2]);
    check('onCellSelectionChange heard the range', cellSeen.at(-1)?.range?.bottom, 2);
    click(cellAt(host, 4, 4));
    check('a plain click collapses to one cell again', lit(host), ['4,4']);
    table.setSelection([1, 3]);
    check('setSelection in cell mode: the rows\' cells, first to last', lit(host).length, 15);
    check('…getSelection agrees', table.getSelection(), [1, 2, 3]);
    table.clearSelection();
    check('clearSelection clears the cells', [lit(host), table.getCellSelection().focus], [[], null]);
    table.setCellSelection({ row: 1, col: 2 }, { row: 0, col: 1 });
    check('setCellSelection', lit(host), ['0,1', '0,2', '1,1', '1,2']);
    table.render();
    check('a render keeps the selection painted', lit(host), ['0,1', '0,2', '1,1', '1,2']);
    table.dispose();
}

section('§2 the keys');
{
    const { host, table } = mount({ headers, rows, selectionMode: 'cells', pagination: false });
    const t = table._tableEl;
    click(cellAt(host, 0, 0));
    key(t, 'ArrowRight');
    check('ArrowRight', focusOf(table), [0, 1]);
    key(t, 'ArrowDown');
    check('ArrowDown', focusOf(table), [1, 1]);
    key(t, 'ArrowLeft');
    key(t, 'ArrowUp');
    check('ArrowLeft, ArrowUp', focusOf(table), [0, 0]);
    key(t, 'ArrowUp');
    check('ArrowUp on the first row stays', focusOf(table), [0, 0]);
    key(t, 'ArrowDown', { ctrlKey: true });
    check('Ctrl+Down: the edge of the filled block (column A, all filled)', focusOf(table), [4, 0]);
    key(t, 'ArrowDown');
    check('ArrowDown on the last row stays put', focusOf(table), [4, 0]);
    // Column B: 'a','b','c','',  'e' — from row 0 the block ends at row 2.
    table.setCellSelection({ row: 0, col: 1 });
    key(t, 'ArrowDown', { ctrlKey: true });
    check('Ctrl+Down in column B stops at the block\'s end', focusOf(table), [2, 1]);
    key(t, 'ArrowDown', { ctrlKey: true });
    check('…then jumps the gap to the next filled cell', focusOf(table), [4, 1]);
    // Row 2: 3, 'c', 'k', '', 30 — Ctrl+Right from (2,0).
    table.setCellSelection({ row: 2, col: 0 });
    key(t, 'ArrowRight', { ctrlKey: true });
    check('Ctrl+Right stops at the end of the filled run', focusOf(table), [2, 2]);
    key(t, 'ArrowRight', { ctrlKey: true });
    check('…then to the next filled cell', focusOf(table), [2, 4]);
    key(t, 'Home');
    check('Home: the row\'s first cell', focusOf(table), [2, 0]);
    key(t, 'End');
    check('End: the row\'s last cell', focusOf(table), [2, 4]);
    key(t, 'Tab');
    check('Tab on the last column wraps to the next row', focusOf(table), [3, 0]);
    key(t, 'Tab');
    check('Tab moves right', focusOf(table), [3, 1]);
    key(t, 'Tab', { shiftKey: true });
    key(t, 'Tab', { shiftKey: true });
    check('Shift+Tab wraps back to the row before', focusOf(table), [2, 4]);
    const tabEv = (opts = {}) => {
        const e = new T.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true, ...opts });
        t.dispatchEvent(e);
        return e;
    };
    ok('Tab inside the grid is taken', tabEv().defaultPrevented);
    check('…and moves right', focusOf(table), [3, 0]);
    table.setCellSelection({ row: 4, col: 4 });
    ok('Tab on the last cell is not prevented: focus moves out of the table', !tabEv().defaultPrevented);
    check('…and the cursor stays', focusOf(table), [4, 4]);
    table.setCellSelection({ row: 0, col: 0 });
    ok('Shift+Tab on the first cell is not prevented', !tabEv({ shiftKey: true }).defaultPrevented);
    check('…and the cursor stays', focusOf(table), [0, 0]);
    ok('Shift+Tab elsewhere is taken', (table.setCellSelection({ row: 0, col: 1 }), tabEv({ shiftKey: true }).defaultPrevented));
    check('…and moves left', focusOf(table), [0, 0]);
    table.setCellSelection({ row: 1, col: 1 });
    key(t, 'ArrowDown', { shiftKey: true });
    key(t, 'ArrowRight', { shiftKey: true });
    check('Shift+arrows grow the range from the anchor', lit(host), ['1,1', '1,2', '2,1', '2,2']);
    key(t, 'Escape');
    check('Escape collapses the range onto the cursor', lit(host), ['2,2']);
    key(t, 'a', { ctrlKey: true });
    check('Ctrl+A selects every cell', lit(host).length, 25);
    check('…and getSelection every row', table.getSelection(), [0, 1, 2, 3, 4]);
    const ev = new T.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
    t.dispatchEvent(ev);
    ok('a key the cell mode takes is prevented', ev.defaultPrevented);
    table.dispose();
}

section('§3 the order shown, and hidden columns');
{
    const { host, table } = mount({
        headers, rows, selectionMode: 'cells', pagination: false, sortable: true, hiddenColumns: [1],
    });
    table.sortBy(0, false);   // 5,4,3,2,1
    click(cellAt(host, 0, 0));
    click(cellAt(host, 1, 2), { shiftKey: true });
    const sel = table.getCellSelection();
    check('the range is a rectangle on the screen: shown rows 0–1 are rows 4 and 3',
          sel.range.rows, [4, 3]);
    check('…over the columns shown (B is hidden)', sel.range.columns, [0, 2, 3]);
    check('getSelection is ascending', table.getSelection(), [3, 4]);
    key(table._tableEl, 'ArrowRight');
    check('ArrowRight steps over the hidden column', table.getCellSelection().focus.col, 4);
    table.dispose();
}
{
    // A page: the cursor moves over the rows drawn.
    const many = Array.from({ length: 25 }, (_, i) => [i, `r${i}`]);
    const { table } = mount({ headers: ['N', 'S'], rows: many, selectionMode: 'cells', pageSize: 10 });
    table.goToPage(1);
    table.setCellSelection({ row: 10, col: 0 });
    key(table._tableEl, 'ArrowUp');
    check('the cursor stays on the page drawn', table.getCellSelection().focus.row, 10);
    key(table._tableEl, 'ArrowDown', { ctrlKey: true });
    check('Ctrl+Down stops at the page\'s last row', table.getCellSelection().focus.rowIdx, 19);
    table.dispose();
}

section('§4 what cell mode cannot be combined with');
{
    const warned = [];
    const warn = console.warn;
    console.warn = (...a) => warned.push(a.join(' '));
    try {
        const { host, table } = mount({
            headers, rows, selectionMode: 'cells', selectToggle: true, keyboardNav: true, pagination: false,
        });
        ok('a console warning names what is ignored',
           warned.some((w) => /selectToggle/.test(w) && /keyboardNav/.test(w)));
        ok('no select column is drawn', !host.querySelector('.twm-dt-select-cell'));
        click(cellAt(host, 0, 0));
        key(table._tableEl, 'ArrowDown');
        check('the arrows are the cell mode\'s, not keyboardNav\'s', [focusOf(table), lit(host)], [[1, 0], ['1,0']]);
        table.dispose();
        warned.length = 0;
        const plain = mount({ headers, rows, editable: true, pagination: false });
        ok('editable without cell mode: a warning', warned.some((w) => /editable/.test(w)));
        check('…and no cell mode', plain.table.getCellSelection(), null);
        plain.table.dispose();
        warned.length = 0;
        const quiet = mount({ headers, rows, selectionMode: 'cells', pagination: false });
        check('cell mode alone warns nothing', warned, []);
        quiet.table.dispose();
    } finally {
        console.warn = warn;
    }
}

section('§5 a table without the option');
{
    const { host, table } = mount({ headers, rows, pagination: false });
    click(cellAt(host, 1, 1));
    check('a click selects the row', table.getSelection(), [1]);
    ok('the row is lit', bodyRows(host)[1].classList.contains('selected'));
    ok('no cell class anywhere', !host.querySelector('.twm-dt-cell--selected, .twm-dt-cell--cursor'));
    ok('no cell expando', bodyRows(host).every((tr) => tr.__cellPos === undefined
        && [...tr.children].every((td) => td.__colIdx === undefined)));
    ok('the table class is 0.16\'s', !table._tableEl.classList.contains('twm-dt--cells'));
    check('getCellSelection is null', table.getCellSelection(), null);
    check('isEditing is false', table.isEditing(), false);
    table.dispose();
}

done();
