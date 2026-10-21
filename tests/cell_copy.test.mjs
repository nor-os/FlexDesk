/**
 * STORY-0085 — CELL MODE COPIES THE CELLS SELECTED, AS TSV.
 *
 *   §1  a 3×4 range copies 3 lines of 4 tab-separated values, in the order
 *       shown after a sort and a filter; no header line
 *   §2  with no range beyond the cursor, the cursor cell's value alone
 *   §3  a hidden column inside the range is left out; a value holding a tab,
 *       a newline or a quote is quoted the way Excel quotes it; an empty cell
 *       is empty (`nullDisplay` or not); a refused value copies as the value
 *       the cell holds
 *   §3b a copied cell is its RAW value, not the text it shows: a Price drawn
 *       `1,234.50` (value 1234.5) copies `1234.5`; numbers are not rounded;
 *       dates copy as ISO whatever `dateFormat` draws
 *   §4  the copy menu in cell mode offers "Copy Cells" (the same TSV as
 *       Ctrl+C) and no "Copy as CSV"; Ctrl+Shift+C is not bound;
 *       `copyToClipboard('csv')` copies nothing; `copyable: false` copies
 *       nothing
 *   §5  row mode: Ctrl+C, Ctrl+Shift+C and the copy menu copy the selected
 *       rows with a header line, as in 0.16
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
    check('a number, its value', await take(), ['20']);
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
    check('nullDisplay named: an empty cell still copies empty, not as drawn', await take(), ['\tb']);
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
    check('a refused value copies as the value the cell holds', await take(), ['a\ttyped']);
    table.dispose();
}

section('§3b raw values, not the text shown');
{
    const money = (v) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const { host, table } = mount({
        headers: ['Item', 'Price', 'Ratio', 'Flag'],
        rows: [['Widget', 1234.5, 1.23456789, true], ['Gadget', 7, 0.5, false]],
        selectionMode: 'cells', pagination: false,
        formatValue: (v, col) => (col === 1 && typeof v === 'number' ? money(v) : String(v)),
    });
    check('the Price cell shows 1,234.50', cellAt(host, 0, 1).textContent, '1,234.50');
    click(cellAt(host, 0, 1));
    ctrlC(table);
    check('…and copies as 1234.5', await take(), ['1234.5']);
    table.setCellSelection({ row: 1, col: 3 }, { row: 0, col: 0 });
    ctrlC(table);
    check('a range copies raw values: no formatValue, no rounding to 4 decimals',
          await take(), ['Widget\t1234.5\t1.23456789\ttrue\nGadget\t7\t0.5\tfalse']);
    table.dispose();
}
{
    const day = new Date(2026, 9, 5);                       // local 2026-10-05 00:00
    const moment = new Date(Date.UTC(2026, 9, 5, 14, 30));
    const { host, table } = mount({
        headers: ['Day', 'DayText', 'At', 'Epoch', 'Plain'],
        rows: [[day, '2026-10-05', moment, moment.getTime(), moment]],
        columnTypes: ['date', 'date', 'datetime', 'datetime', 'text'],
        dateFormat: 'DD.MM.YYYY', dateTimeFormat: 'DD.MM.YYYY HH:mm',
        selectionMode: 'cells', pagination: false,
    });
    check('a date column draws its own format', cellAt(host, 0, 1).textContent, '05.10.2026');
    table.setCellSelection({ row: 0, col: 4 }, { row: 0, col: 0 });
    ctrlC(table);
    check('dates copy as ISO: a Date in a date column as its day, ISO text as it is, '
          + 'a Date or epoch ms in a datetime column (and a Date anywhere) as toISOString()',
          await take(), [['2026-10-05', '2026-10-05', moment.toISOString(), moment.toISOString(),
                          moment.toISOString()].join('\t')]);
    table.dispose();
}
{
    const { table } = mount({
        headers: ['Day'], rows: [[new Date(Date.UTC(2026, 9, 5, 23, 30))]], columnTypes: ['date'],
        dateTimeZone: 'UTC', selectionMode: 'cells', pagination: false,
    });
    table.setCellSelection({ row: 0, col: 0 });
    ctrlC(table);
    check("a date column copies the day in the table's zone (dateTimeZone: UTC)", await take(), ['2026-10-05']);
    table.dispose();
}

section('§4 the copy menu in cell mode: "Copy Cells" only; no CSV; copyable: false');
{
    const { host, table } = mount({ headers, rows, selectionMode: 'cells', pagination: false });
    table.setCellSelection({ row: 1, col: 1 }, { row: 0, col: 0 });
    cellAt(host, 0, 0).dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
    await tick(5);
    check('a right-click inside the range keeps it', table.getCellSelection().range.columns, [0, 1]);
    check('in cell mode the copy item says it copies cells', menuItem('copy-tsv').querySelector('.label').textContent, 'Copy Cells');
    check('…and it is the only copy item: no "Copy as CSV"', menuItem('copy-csv'), null);
    menuItem('copy-tsv').dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
    check('"Copy Cells" copies the range as TSV', await take(), ['1\tAlpha\n2\tBravo']);
    ctrlC(table);
    check('…the same text Ctrl+C copies', await take(), ['1\tAlpha\n2\tBravo']);
    const notPrevented = ctrlC(table, { shiftKey: true });
    check('Ctrl+Shift+C is not bound: nothing copied', await take(), []);
    ok('…and the key is left to the page (not prevented)', notPrevented);
    const warned = [];
    const warn = console.warn;
    console.warn = (...a) => warned.push(a.join(' '));
    await table.copyToClipboard('csv');
    console.warn = warn;
    check("copyToClipboard('csv') in cell mode copies nothing", await take(), []);
    ok('…and warns', warned.some((m) => /no CSV copy/.test(m)));
    await table.copyToClipboard();
    check('copyToClipboard() copies the range as TSV', await take(), ['1\tAlpha\n2\tBravo']);
    table.dispose();
}
{
    const { host, table } = mount({
        headers: ['A', 'P'], rows: [['a', 1234.5]], selectionMode: 'cells', pagination: false,
        formatValue: (v, col) => (col === 1 ? '1,234.50' : String(v)),
        contextMenuItems: [{ label: 'Mine', action: 'mine' }], onContextMenuAction: () => {},
    });
    table.setCellSelection({ row: 0, col: 1 }, { row: 0, col: 0 });
    cellAt(host, 0, 0).dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
    await tick(5);
    check('with contextMenuItems the copy tail is "Copy Cells" alone',
          [...document.querySelectorAll('.twm-context-menu-item[data-action^="copy-"]')].map((el) => el.dataset.action),
          ['copy-tsv']);
    menuItem('copy-tsv').dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
    check('…and copies raw values', await take(), ['a\t1234.5']);
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
    bodyRows(host)[0].children[0].dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
    await tick(5);
    check('row mode keeps "Copy as CSV"', menuItem('copy-csv')?.querySelector('.label').textContent, 'Copy as CSV');
    menuItem('copy-csv').dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
    check('…which copies the rows as CSV', await take(), ['A,B\na\tx,1\nc,3']);
    ok('row mode still binds Ctrl+Shift+C (prevented)', !ctrlC(table, { shiftKey: true }));
    check('…to the CSV copy, as in 0.16', await take(), ['A,B\na\tx,1\nc,3']);
    ok('no cell classes in row mode', !host.querySelector('.twm-dt-cell--selected, .twm-dt-cell--cursor'));
    table.dispose();
}

done();
