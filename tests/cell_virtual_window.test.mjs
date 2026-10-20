/**
 * STORY-0003 — CELL MODE OVER THE VIRTUAL WINDOW (C10), and the cells as drawn.
 *
 * The generic behaviour Tables' `grid/render.test.mjs` and
 * `grid/virtual_window.test.mjs` check of ITS grid, ported to DataTable's cell
 * mode (written here, not imported from Tables):
 *
 *   §1  cell rendering: a data cell is a `<td>` per shown column, after the row
 *       number; a click selects the CELL, and the cursor is drawn on it — the
 *       row is not lit; the paint follows the model, never a stale class
 *   §2  the keyboard keeps the cursor drawn: moved to a row the window has not
 *       drawn, that row is brought in, drawn and in view (row 900 of 1,000)
 *   §3  a row ARRIVING in the window carries the selection paint
 *   §4  an editor whose row scrolls out of the window commits what was typed —
 *       not lost, not orphaned — and the table answers the keyboard again;
 *       an editor with no getValue (nothing the table can read) is CANCELLED
 *       by its row leaving, and Enter or the focus leaving does not close it,
 *       but its own commit(value) is committed
 *   §5  an open editor holds a redraw back; Escape commits nothing, even after
 *       the blur its repaint causes
 *   §6  a refused commit's mark reaches the row when it is drawn later, and
 *       survives a round trip out of the window and back; a later good commit
 *       clears that mark and no other
 *   §7  the scroll survives a re-render with a range selected
 *
 * jsdom lays nothing out, so the viewport is given a height and `scrollTop` a
 * real value; which rows are drawn is the window's arithmetic, not a layout.
 *
 *     node tests/cell_virtual_window.test.mjs
 */
import { dataTableEnv } from './dt_env.mjs';

const T = await dataTableEnv('cell virtual window');
const { check, ok, section, mount, bodyRows, click, key, tick, done, window } = T;

// jsdom's `scrollTop` is a no-op that reads 0; the window reads and writes it.
{
    const tops = new WeakMap();
    Object.defineProperty(window.Element.prototype, 'scrollTop', {
        configurable: true,
        get() { return tops.get(this) || 0; },
        set(v) { tops.set(this, Math.max(0, Number(v) || 0)); },
    });
}

const VIEW = 300;
const ROW_H = 24;
const headers = ['Title', 'Status', 'Amount'];
const makeRows = (n) => Array.from({ length: n }, (_, i) => [`row ${i}`, `s${Math.floor(i / 100)}`, i]);

function virtual(n, extra = {}) {
    const commits = [];
    const rows = makeRows(n);
    const m = mount({
        headers, rows, selectionMode: 'cells', editable: true, pagination: false,
        virtualize: { rowHeight: ROW_H, overscan: 10 },
        onCellCommit: (c) => { commits.push(c); },
        ...extra,
    });
    const wrap = m.table.scrollElement;
    Object.defineProperty(wrap, 'clientHeight', { configurable: true, value: VIEW });
    m.table.refreshVirtualLayout();
    return { ...m, rows, commits };
}
const drawn = (host) => bodyRows(host).map((tr) => tr.__rowIndex);
const rowEl = (table, i) => table.getRowElement(i);
const td = (table, r, c) => rowEl(table, r)?.children[c] || null;
const tbl = (table) => table._tableEl;
const inView = (table, i) => {
    const top = table.scrollElement.scrollTop;
    const at = i * ROW_H;
    return at >= top && at + ROW_H <= top + VIEW;
};
const scroll = (table, top) => {
    table.scrollElement.scrollTop = top;
    table.scrollElement.dispatchEvent(new window.Event('scroll'));
};

section('§1 the cells as drawn');
{
    const { host, table } = virtual(20, { virtualize: false, showRowNumbers: true });
    const tr = bodyRows(host)[1];
    check('one cell per column, after the row number', [...tr.children].map((c) => c.textContent),
          ['2', 'row 1', 's0', '1']);
    click(tr.children[2]);
    ok('a click selects the CELL', tr.children[2].classList.contains('twm-dt-cell--selected')
        && tr.children[2].classList.contains('twm-dt-cell--cursor'));
    ok('the row number is not part of it', !tr.children[0].classList.contains('twm-dt-cell--selected'));
    check('getCellSelection', table.getCellSelection().focus, { row: 1, col: 1, rowIdx: 1 });
    click(tr.children[0]);
    check('a click on the row number moves nothing', table.getCellSelection().focus, { row: 1, col: 1, rowIdx: 1 });
    key(tbl(table), 'ArrowRight');
    ok('the old cell lets go of its paint', !tr.children[2].classList.contains('twm-dt-cell--cursor')
        && tr.children[3].classList.contains('twm-dt-cell--cursor'));
    check('one cursor in the whole table', host.querySelectorAll('.twm-dt-cell--cursor').length, 1);
    table.updateRow(1, ['ROW 1', 's0', 1]);
    ok('a row redrawn (updateRow) is painted again',
       rowEl(table, 1).children[3].classList.contains('twm-dt-cell--cursor'));
    table.dispose();
}

section('§2 the keyboard keeps the cursor drawn');
{
    const { host, table } = virtual(1000);
    ok('a window, not the whole page', drawn(host).length < 100);
    ok('row 900 is not drawn to begin with', !drawn(host).includes(900));
    table.setCellSelection({ row: 899, col: 0 });
    ok('the cursor set on row 899 brings it in', drawn(host).includes(899));
    table.scrollToRow(0, { block: 'start' });
    ok('scrolled back: 899 and 900 are out', !drawn(host).includes(899) && !drawn(host).includes(900));
    // The cursor is still on 899; the arrow moves it to 900.
    key(tbl(table), 'ArrowDown');
    check('ArrowDown moved the cursor to row 900', table.getCellSelection().focus, { row: 900, col: 0, rowIdx: 900 });
    ok('row 900 is drawn', drawn(host).includes(900));
    ok('…and in view', inView(table, 900), `scrollTop ${table.scrollElement.scrollTop}`);
    ok('…and its cell carries the cursor', td(table, 900, 0)?.classList.contains('twm-dt-cell--cursor'));
    key(tbl(table), 'ArrowDown', { ctrlKey: true });
    check('Ctrl+Down: the last row', table.getCellSelection().focus.row, 999);
    ok('drawn and in view', drawn(host).includes(999) && inView(table, 999));
    key(tbl(table), 'ArrowDown');
    check('ArrowDown on the last row stays put', table.getCellSelection().focus.row, 999);
    key(tbl(table), 'Home', { ctrlKey: true });
    ok('Ctrl+Home: row 0, drawn and in view', table.getCellSelection().focus.row === 0
        && drawn(host).includes(0) && inView(table, 0));
    table.dispose();
}

section('§3 an arriving row is painted');
{
    const { host, table } = virtual(1000);
    table.setCellSelection({ row: 2, col: 0 });
    // A range down to 600, then scroll back to the top: the rows of the range
    // between are drawn by the window as it slides, and must come painted.
    table.setCellSelection({ row: 600, col: 1 }, { row: 2, col: 0 });
    scroll(table, 0);
    scroll(table, 450 * ROW_H);
    const tr = rowEl(table, 450);
    ok('row 450 arrived with the scroll', !!tr && drawn(host).includes(450));
    ok('…carrying the range\'s paint', tr.children[0].classList.contains('twm-dt-cell--selected')
        && tr.children[1].classList.contains('twm-dt-cell--selected'));
    ok('…only on the range\'s columns', !tr.children[2].classList.contains('twm-dt-cell--selected'));
    check('getSelection answers every row the range touches', table.getSelection().length, 599);
    table.dispose();
}

section('§4 an editor whose row leaves the window');
{
    const { host, table, commits, rows } = virtual(1000);
    table.setCellSelection({ row: 5, col: 0 });
    key(tbl(table), 'F2');
    const input = host.querySelector('.twm-dt-editor');
    ok('an editor is open in row 5', !!input && rowEl(table, 5).contains(input));
    input.value = 'kept';
    table.scrollToRow(900);
    ok('row 5 has left the window', !drawn(host).includes(5));
    check('what was typed was committed, not lost', commits, [{ rowIdx: 5, colIdx: 0, value: 'kept', previous: 'row 5' }]);
    check('…into the row', rows[5][0], 'kept');
    check('the table is not left editing', table.isEditing(), false);
    ok('no editor is left anywhere', !T.document.querySelector('.twm-dt-editor'));
    table.scrollToRow(5);
    check('row 5 comes back with the value', td(table, 5, 0)?.textContent, 'kept');
    table.dispose();
}
{
    // A redraw that was waiting for the editor, when the window is what closes it.
    const { host, table, commits } = virtual(1000);
    table.setCellSelection({ row: 5, col: 0 });
    key(tbl(table), 'F2');
    const input = host.querySelector('.twm-dt-editor');
    input.value = 'typed';
    table.setData({ rows: makeRows(1000).map((r) => [r[0].toUpperCase(), r[1], r[2]]) });
    ok('new rows wait for the editor', input.isConnected);
    table.scrollToRow(900);
    check('the window taking the row out commits it', commits.length, 1);
    ok('…and the waiting redraw does not run inside the window\'s own', !table.isEditing());
    await tick();
    check('it runs right after: the new rows are drawn', td(table, 900, 0)?.textContent, 'ROW 900');
    table.dispose();
}
{
    // An editor with no getValue: a `{el}` around an element that is not a
    // form field. The table cannot read it, so its row leaving the window
    // cancels it (as documented), and the focus leaving it does nothing.
    let destroyed = 0;
    const box = () => {
        const el = T.document.createElement('div');
        el.className = 'twm-dt-editor custom-box';
        el.tabIndex = 0;
        el.textContent = 'typed into a box';
        return { el, destroy: () => { destroyed++; } };
    };
    const { host, table, commits, rows } = virtual(1000, { editors: { 0: box } });
    table.setCellSelection({ row: 5, col: 0 });
    key(tbl(table), 'F2');
    const el = host.querySelector('.custom-box');
    ok('a custom editor with no getValue is open in row 5', !!el && rowEl(table, 5).contains(el));
    key(el, 'Enter');
    ok('Enter does not close it: there is no value to commit', el.isConnected && table.isEditing());
    el.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true, relatedTarget: tbl(table) }));
    ok('the focus leaving does not close it either', el.isConnected && table.isEditing());
    table.scrollToRow(900);
    ok('row 5 has left the window', !drawn(host).includes(5));
    check('the row leaving CANCELS it: nothing is committed', commits, []);
    check('…and the row keeps its value', rows[5][0], 'row 5');
    check('the editor was destroyed once', destroyed, 1);
    check('the table is not left editing', table.isEditing(), false);
    ok('no editor is left anywhere', !T.document.querySelector('.custom-box'));
    table.scrollToRow(5);
    check('row 5 comes back as it was', td(table, 5, 0)?.textContent, 'row 5');
    table.dispose();
}
{
    // The same kind of editor calling commit(value) itself is committed.
    let api = null;
    const box = (o) => {
        api = o;
        const el = T.document.createElement('div');
        el.className = 'twm-dt-editor custom-box';
        el.tabIndex = 0;
        return { el };
    };
    const { table, commits, rows } = virtual(1000, { editors: { 0: box } });
    table.setCellSelection({ row: 5, col: 0 });
    key(tbl(table), 'F2');
    api.commit('from the box');
    check('an editor without getValue commits by calling commit(value)', commits, [{ rowIdx: 5, colIdx: 0, value: 'from the box', previous: 'row 5' }]);
    check('…into the row', rows[5][0], 'from the box');
    table.scrollToRow(900);
    check('and its row leaving afterwards calls nothing more', commits.length, 1);
    table.dispose();
}

section('§5 an editor holds a redraw back; Escape commits nothing');
{
    const { host, table, commits } = virtual(1000);
    table.setCellSelection({ row: 7, col: 0 });
    key(tbl(table), 'F2');
    const input = host.querySelector('.twm-dt-editor');
    input.value = 'half-typ';
    table.setData({ rows: makeRows(1000) });
    ok('new rows while editing: the editor is still there', input.isConnected);
    check('…with what was typed', input.value, 'half-typ');
    key(input, 'Escape');
    input.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true }));
    check('Escape commits nothing, even after the blur', commits, []);
    ok('the redraw ran once the editor closed', !input.isConnected && drawn(host).includes(7));
    check('the cursor survived the redraw', table.getCellSelection().focus.row, 7);
    ok('…and is painted', td(table, 7, 0)?.classList.contains('twm-dt-cell--cursor'));
    table.dispose();
}

section('§6 a refused commit\'s mark reaches a row drawn later');
{
    let refuse = true;
    const { table } = virtual(1000, {
        onCellCommit: async ({ value }) => (refuse && String(value).length > 5
            ? { ok: false, error: 'too long' } : { ok: true }),
    });
    const editTo = async (r, c, text) => {
        table.setCellSelection({ row: r, col: c });
        key(tbl(table), 'F2');
        const input = T.document.querySelector('.twm-dt-editor');
        input.value = text;
        key(input, 'Enter');
        await tick();
    };
    await editTo(2, 0, 'x'.repeat(10));
    await editTo(900, 2, '123456');
    ok('row 900 is marked', td(table, 900, 2)?.classList.contains('twm-dt-cell--error'));
    check('…with its message', td(table, 900, 2)?.title, 'too long');
    table.scrollToRow(0, { block: 'start' });
    ok('row 2 drawn again is still marked', td(table, 2, 0)?.classList.contains('twm-dt-cell--error'));
    check('…showing what was typed', td(table, 2, 0)?.textContent, 'x'.repeat(10));
    table.scrollToRow(900);
    ok('and row 900, gone and back, is still marked', td(table, 900, 2)?.classList.contains('twm-dt-cell--error'));
    refuse = false;
    await editTo(2, 0, 'short');
    ok('a good commit clears ITS mark', !td(table, 2, 0)?.classList.contains('twm-dt-cell--error'));
    table.scrollToRow(900);
    ok('…and no other', td(table, 900, 2)?.classList.contains('twm-dt-cell--error'));
    table.dispose();
}

section('§7 the scroll survives a re-render');
{
    const { host, table } = virtual(1000);
    table.setCellSelection({ row: 801, col: 1 }, { row: 800, col: 0 });
    const top = table.scrollElement.scrollTop;
    ok('the wrap is scrolled', top > 0);
    table.render();
    Object.defineProperty(table.scrollElement, 'clientHeight', { configurable: true, value: VIEW });
    check('a render keeps the scroll', table.scrollElement.scrollTop, top);
    ok('…draws the rows that were on screen', drawn(host).includes(800));
    ok('…painted', td(table, 800, 0)?.classList.contains('twm-dt-cell--selected')
        && td(table, 801, 1)?.classList.contains('twm-dt-cell--cursor'));
    table.dispose();
}

done();
