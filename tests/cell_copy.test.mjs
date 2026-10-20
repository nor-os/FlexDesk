/**
 * STORY-0085 — CELL MODE COPIES THE CELLS SELECTED, AS TSV.
 *
 *   §1  a 3×4 range copies 3 lines of 4 tab-separated values, in the order
 *       shown after a sort and a filter; no header line
 *   §2  with no range beyond the cursor, the cursor cell's value alone
 *   §3  a hidden column inside the range is left out; a value holding a tab,
 *       a newline or a quote is quoted the way Excel quotes it; an empty cell
 *       is empty; a refused value copies as the cell shows it
 *   §4  the copy menu's items copy the range too (TSV, and CSV); Ctrl+Shift+C
 *       copies CSV; `copyable: false` copies nothing
 *   §5  row mode: Ctrl+C and the copy menu copy the selected rows with a
 *       header line, as in 0.16
 *
 * Against main before STORY-0085, §1–§4 fail (cell mode copied whole rows with
 * a header line).
 *
 *     node tests/cell_copy.test.mjs
 */
import { dataTableEnv } from './dt_env.mjs';

const T = await dataTableEnv('cell copy');
const { check, ok, section, mount, bodyRows, click, key, tick, done } = T;

let copied = [];
Object.defineProperty(navigator, 'clipboard', {
    configurable: true, value: { writeText: async (t) => { copied.push(t); } },
});
const take = async () => { await tick(); const out = copied; copied = []; return out; };

const headers = ['N', 'Name', 'Kind', 'Qty', 'Note'];
const rows = [
    [1, 'Alpha', 'x', 10, 'one'],
    [2, 'Bravo', 'y', 20, 'two'],
    [3, 'Charlie', 'x', 30, 'three'],
    [4, 'Delta', 'x', 40, 'four'],
    [5, 'Echo', 'y', 50, 'five'],
    [6, 'Foxtrot', 'x', 60, 'six'],
];
const cellAt = (host, r, c) => bodyRows(host)[r].children[c];
const ctrlC = (table, init = {}) => key(table._tableEl, 'c', { ctrlKey: true, ...init });
const menuItem = (action) => document.querySelector(`.twm-context-menu-item[data-action="${action}"]`);

section('§1 a 3×4 range, in the order shown after sort and filter');
{
    const { host, table } = mount({
        headers, rows, selectionMode: 'cells', pagination: false, sortable: true, filterable: true,
    });
    table.sortBy(0, false);        // 6,5,4,3,2,1
    table.setFilter(2, 'x');       // 6,4,3,1
    await tick(50);
    check('the rows shown', table.getDisplayedRows().map((r) => r[0]), [6, 4, 3, 1]);
    click(cellAt(host, 0, 0));
    click(cellAt(host, 2, 3), { shiftKey: true });
    ctrlC(table);
    const [text] = await take();
    const lines = text.split('\n');
    check('3 lines', lines.length, 3);
    check('of 4 tab-separated values each', lines.map((l) => l.split('\t').length), [4, 4, 4]);
    check('in the order shown, no header line', text,
          '6\tFoxtrot\tx\t60\n4\tDelta\tx\t40\n3\tCharlie\tx\t30');
    // The range from the bottom right to the top left copies the same.
    table.setCellSelection({ row: 0, col: 0 }, { row: 2, col: 3 });
    ctrlC(table);
    check('a range drawn backwards copies top to bottom, left to right', (await take())[0], text);
    table.dispose();
}

section('§2 with no range, the cursor cell alone');
{
    const { host, table } = mount({ headers, rows, selectionMode: 'cells', pagination: false });
    click(cellAt(host, 1, 1));
    ctrlC(table);
    check('the cursor cell\'s value, nothing more', await take(), ['Bravo']);
    key(table._tableEl, 'ArrowRight');
    key(table._tableEl, 'ArrowRight');
    ctrlC(table);
    check('a number as the cell shows it', await take(), ['20']);
    key(table._tableEl, 'ArrowRight', { shiftKey: true });
    key(table._tableEl, 'Escape');
    ctrlC(table);
    check('Escape collapses the range onto the cursor: that cell alone', await take(), ['two']);
    table.dispose();
}
{
    const { table } = mount({ headers, rows, selectionMode: 'cells', pagination: false });
    const notes = [];
    table._notify = (title, msg) => notes.push(msg);
    ctrlC(table);
    check('nothing selected: nothing copied', await take(), []);
    ok('…and the table says so', notes.some((m) => /No cells selected/.test(m)));
    table.dispose();
}

section('§3 hidden columns, Excel quoting, empty and refused cells');
{
    const { table } = mount({
        headers, rows, selectionMode: 'cells', pagination: false, hiddenColumns: [1, 3],
    });
    table.setCellSelection({ row: 1, col: 4 }, { row: 0, col: 0 });
    ctrlC(table);
    check('the hidden columns inside the range are left out', await take(), ['1\tx\tone\n2\ty\ttwo']);
    table.dispose();
}
{
    const odd = [
        ['tab\there', 'line1\nline2', 'say "hi"', 'plain'],
        [null, '', 'cr\rhere', 0],
    ];
    const { table } = mount({ headers: ['A', 'B', 'C', 'D'], rows: odd, selectionMode: 'cells', pagination: false });
    table.setCellSelection({ row: 1, col: 3 }, { row: 0, col: 0 });
    ctrlC(table);
    check('a tab, a newline, a quote, a CR: quoted as Excel quotes; null and "" are empty',
          await take(), ['"tab\there"\t"line1\nline2"\t"say ""hi"""\tplain\n\t\t"cr\rhere"\t0']);
    table.dispose();
}
{
    const { table } = mount({
        headers: ['A', 'B'], rows: [[null, 'b']], selectionMode: 'cells', pagination: false, nullDisplay: 'NULL',
    });
    table.setCellSelection({ row: 0, col: 1 }, { row: 0, col: 0 });
    ctrlC(table);
    check('nullDisplay named: an empty cell copies as the cell shows it', await take(), ['NULL\tb']);
    table.dispose();
}
{
    const { host, table } = mount({
        headers: ['A', 'B'], rows: [['a', 'b']], selectionMode: 'cells', pagination: false,
        editable: true, onCellCommit: () => ({ ok: false, error: 'no' }),
    });
    click(cellAt(host, 0, 1));
    key(table._tableEl, 'Z');
    const input = host.querySelector('td input');
    input.value = 'typed';
    key(input, 'Enter');
    await tick();
    table.setCellSelection({ row: 0, col: 1 }, { row: 0, col: 0 });
    ctrlC(table);
    check('a refused value copies as the cell shows it', await take(), ['a\ttyped']);
    table.dispose();
}

section('§4 the copy menu in cell mode; CSV; copyable: false');
{
    const { host, table } = mount({ headers, rows, selectionMode: 'cells', pagination: false });
    table.setCellSelection({ row: 1, col: 1 }, { row: 0, col: 0 });
    cellAt(host, 0, 0).dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
    await tick(5);
    check('a right-click inside the range keeps it', table.getCellSelection().range.columns, [0, 1]);
    check('in cell mode the copy item says it copies cells', menuItem('copy-tsv').querySelector('.label').textContent, 'Copy Cells');
    check('"Copy as CSV" keeps its label in cell mode', menuItem('copy-csv').querySelector('.label').textContent, 'Copy as CSV');
    menuItem('copy-tsv').dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
    check('the copy menu copies the range as TSV', await take(), ['1\tAlpha\n2\tBravo']);
    cellAt(host, 0, 0).dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
    await tick(5);
    menuItem('copy-csv').dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
    check('"Copy as CSV" copies the range as CSV', await take(), ['1,Alpha\n2,Bravo']);
    ctrlC(table, { shiftKey: true });
    check('Ctrl+Shift+C copies the range as CSV', await take(), ['1,Alpha\n2,Bravo']);
    table.dispose();
}
{
    const { table } = mount({ headers, rows, selectionMode: 'cells', pagination: false, copyable: false });
    table.setCellSelection({ row: 1, col: 1 }, { row: 0, col: 0 });
    ctrlC(table);
    check('copyable: false — Ctrl+C copies nothing', await take(), []);
    table.dispose();
}

section('§5 row mode, as in 0.16');
{
    const { host, table } = mount({ headers: ['A', 'B'], rows: [['a\tx', 1], ['b', 2], ['c', 3]], pagination: false, selectable: 'multi' });
    table.setSelection([0, 2]);
    ctrlC(table);
    check('Ctrl+C copies the selected rows with a header line (values as before, unquoted)',
          await take(), ['A\tB\na\tx\t1\nc\t3']);
    bodyRows(host)[0].children[0].dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
    await tick(5);
    check('in row mode the copy item still says "Copy Row(s)"', menuItem('copy-tsv').querySelector('.label').textContent, 'Copy Row(s)');
    menuItem('copy-tsv').dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
    check('the copy menu copies the rows', await take(), ['A\tB\na\tx\t1\nc\t3']);
    ok('no cell classes in row mode', !host.querySelector('.twm-dt-cell--selected, .twm-dt-cell--cursor'));
    table.dispose();
}

done();
