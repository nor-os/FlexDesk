/**
 * STORY-0090 — DataTable pastes a block from Excel at the cursor cell
 * (`pasteable: true` beside `staged`, cell_paste.js), in jsdom.
 *
 *   §1  a 3×2 block lands at the cursor and stages 6 cells as ONE undo entry,
 *       each value read by its column's parse; Ctrl+V (the paste event) does
 *       the same
 *   §2  columns past the last one are dropped, with a warning naming how many
 *   §3  rows past the last loaded row call onPasteOverrun({rows: n}): false
 *       stages nothing, true passes the extra rows to onRowsAppend
 *   §4  a value that won't parse marks its cell and the rest still stages
 *   §5  a non-editable target cell is skipped and marked
 *   §6  each column's editor reads its text: locale numbers, dates, choices,
 *       an injected editor's own parse
 *   §7  a paste inside an open editor is the editor's; Excel's quoting and
 *       its newline after the last row
 *   §8  without the option (or without `staged`) the table does not take a
 *       paste: as in 0.16
 *   §9  the skipped mark's stylesheet rule
 *
 * Against main before STORY-0090 every section but §8 fails (no paste).
 *
 *     node tests/cell_paste.test.mjs
 */
import { dataTableEnv } from './dt_env.mjs';
import { ruleBody } from './css_rules.mjs';

const T = await dataTableEnv('cell paste');
const { check, ok, section, mount, bodyRows, click, key, tick, done, window, css } = T;

const cellAt = (host, r, c) => bodyRows(host)[r].children[c];
/** The table element the keys and the paste go to (the one `_tableEl` is). */
const tableEl = (host) => host.querySelector('tbody').closest('table');
const staged = (table) => table.getStagedEdits().map((e) => [e.rowIdx, e.colIdx, e.value]);
const base = { pagination: false, selectionMode: 'cells', editable: true, staged: true, pasteable: true };
const grid = (n, w = 3) => Array.from({ length: n }, (_, r) => Array.from({ length: w }, (_, c) => `r${r}c${c}`));

/** A paste event as a browser fires it on Ctrl+V, carrying `text`. */
const pasteEvent = (el, text) => {
    const ev = new window.Event('paste', { bubbles: true, cancelable: true });
    ev.clipboardData = { getData: (type) => (type === 'text/plain' ? text : '') };
    el.dispatchEvent(ev);
    return ev;
};

/** What console.warn says while `fn` runs. */
const warnings = async (fn) => {
    const said = [];
    const real = console.warn;
    console.warn = (...a) => said.push(a.join(' '));
    try { await fn(); } finally { console.warn = real; }
    return said;
};

section('§1 a 3×2 block lands at the cursor, 6 cells as one undo entry');
{
    const headers = ['Name', 'Qty', 'Price', 'Note'];
    const rows = [
        ['a', 1, 1.5, ''], ['b', 2, 2.5, ''], ['c', 3, 3.5, ''], ['d', 4, 4.5, ''], ['e', 5, 5.5, ''],
    ];
    const changes = [];
    const { host, table } = mount({ ...base, headers, rows, sortable: true, onStagedChange: (s) => changes.push(s) });
    click(cellAt(host, 1, 1));
    const r = await table.paste('10\t1.25\n20\t2.25\n30\t3.25\n');
    check('the paste reports 3 rows, 2 columns, 6 cells staged',
          r && [r.rows, r.cols, r.staged, r.skipped.length, r.refused.length, r.droppedColumns], [3, 2, 6, 0, 0, 0]);
    check('the six cells, from the cursor right and down, read by the number parse',
          staged(table), [[1, 1, 10], [1, 2, 1.25], [2, 1, 20], [2, 2, 2.25], [3, 1, 30], [3, 2, 3.25]]);
    ok('…each drawn staged', [1, 2, 3].every((p) => [1, 2].every((c) => cellAt(host, p, c).classList.contains('twm-dt-cell--staged'))));
    check('…and drawn with their values', [1, 2, 3].map((p) => cellAt(host, p, 1).textContent), ['10', '20', '30']);
    check('the cells around it are untouched', [cellAt(host, 0, 1).textContent, cellAt(host, 4, 1).textContent, cellAt(host, 1, 0).textContent], ['1', '5', 'b']);
    check('the listener heard ONE change for the paste', changes.length, 1);
    check('…six staged, one undo step', [changes[0].count, changes[0].canUndo], [6, true]);
    check('the range covers the block, the cursor where it began',
          (() => { const s = table.getCellSelection(); return [s.focus.row, s.focus.col, s.range.top, s.range.bottom, s.range.left, s.range.right]; })(),
          [1, 1, 1, 3, 1, 2]);
    key(tableEl(host), 'z', { ctrlKey: true });
    check('one Ctrl+Z takes the whole block back', staged(table), []);
    check('…the cells show the rows\' values again', [1, 2, 3].map((p) => cellAt(host, p, 1).textContent), ['2', '3', '4']);
    key(tableEl(host), 'y', { ctrlKey: true });
    check('one Ctrl+Y puts all six back', staged(table).length, 6);
    key(tableEl(host), 'z', { ctrlKey: true });
    check('…and nothing is left after one more undo', table.undo(), false);
    table.discard();

    // A 2-row × 3-column block too, and Ctrl+V: the browser's paste event.
    click(cellAt(host, 0, 0));
    const ev = pasteEvent(tableEl(host), 'x\t7\t7.5\ny\t8\t8.5');
    await tick();
    ok('the paste event is taken (default prevented)', ev.defaultPrevented);
    check('Ctrl+V stages the 2×3 block at the cursor',
          staged(table), [[0, 0, 'x'], [0, 1, 7], [0, 2, 7.5], [1, 0, 'y'], [1, 1, 8], [1, 2, 8.5]]);
    key(tableEl(host), 'z', { ctrlKey: true });
    check('…as one undo entry', staged(table), []);
    table.discard();

    // After a sort the block lands on the rows SHOWN.
    table.sortBy(0, false);   // e d c b a
    click(cellAt(host, 0, 0));
    await table.paste('E\nD');
    check('after a sort, the rows shown at the cursor and below (e, d)', staged(table), [[3, 0, 'D'], [4, 0, 'E']]);
    table.discard();
    table.sortBy(0, true);

    // Pasting the values the rows hold is no change.
    click(cellAt(host, 0, 1));
    const same = await table.paste('1\n2');
    check('a block equal to what the rows hold stages nothing', [same?.staged, staged(table).length, table.undo()], [0, 0, false]);
}

section('§2 columns past the last one are dropped, with a warning naming how many');
{
    const headers = ['A', 'B', 'C', 'D'];
    const toasts = [];
    const eventBus = { emit(name, d) { if (name === 'toast:show') toasts.push(d); } };
    const { host, table } = mount({ ...base, headers, rows: grid(4, 4), services: { eventBus } });
    click(cellAt(host, 0, 2));
    let r;
    const said = await warnings(async () => { r = await table.paste('1\t2\t3\t4\t5\n6\t7\t8\t9\t10'); });
    check('the paste reports 3 columns dropped', r?.droppedColumns, 3);
    check('only the columns that exist (C, D) are staged', staged(table), [[0, 2, '1'], [0, 3, '2'], [1, 2, '6'], [1, 3, '7']]);
    ok('a console warning names how many', said.some((s) => /3 column\(s\)/.test(s)));
    check('…and a warn toast names how many', toasts.map((t) => [t.title, t.type, /\b3 column\(s\)/.test(t.message)]), [['Paste', 'warn', true]]);
    table.discard();

    // A hidden column is stepped over: the block goes over the columns SHOWN.
    const h = mount({ ...base, headers, rows: grid(2, 4), hiddenColumns: [1] });
    click(cellAt(h.host, 0, 0));
    let r2;
    const said2 = await warnings(async () => { r2 = await h.table.paste('p\tq\tr'); });
    check('with B hidden, a 3-wide block lands on A, C and D', staged(h.table), [[0, 0, 'p'], [0, 2, 'q'], [0, 3, 'r']]);
    check('…and nothing is dropped, nor warned', [r2?.droppedColumns, said2.length], [0, 0]);
}

section('§3 rows past the last loaded row ask onPasteOverrun');
{
    const headers = ['Name', 'Qty'];
    const asked = [];
    const appended = [];
    let answer = false;
    const { host, table } = mount({
        ...base, headers, rows: [['a', 1], ['b', 2], ['c', 3]],
        onPasteOverrun: (o) => { asked.push(o); return answer; },
        onRowsAppend: (o) => { appended.push(o); },
    });
    click(cellAt(host, 1, 0));
    const block = 'x\t10\ny\t20\nz\t30\nw\tabc';
    const declined = await table.paste(block);
    check('a 4-row block from row 1 of 3: onPasteOverrun({rows: 2})', asked, [{ rows: 2 }]);
    check('resolving false stages nothing', [declined, staged(table), table.undo()], [null, [], false]);
    check('…and appends nothing', appended.length, 0);

    answer = Promise.resolve(false);
    await table.paste(block);
    check('a Promise of false stages nothing either', staged(table), []);

    answer = Promise.resolve(true);
    const r = await table.paste(block);
    check('resolving true stages the rows that fit', staged(table), [[1, 0, 'x'], [1, 1, 10], [2, 0, 'y'], [2, 1, 20]]);
    check('…and passes the extra rows to onRowsAppend, read by their columns\' parse',
          appended.map((a) => a.rows), [[['z', 30], ['w', null]]]);
    check('…with the value that did not read listed', appended[0].errors.map((e) => [e.row, e.colIdx, e.text, e.error]), [[1, 1, 'abc', 'Not a number']]);
    check('the paste reports 2 rows appended', r && [r.staged, r.appended], [4, 2]);
    key(tableEl(host), 'z', { ctrlKey: true });
    check('the staged part is one undo entry', staged(table), []);
    table.discard();

    // A consumer that adds the rows with setData keeps the staged part.
    const held = [['a', 1], ['b', 2]];
    let grow = null;
    grow = mount({
        ...base, headers, rows: held,
        onPasteOverrun: () => true,
        onRowsAppend: ({ rows: extraRows }) => { grow.table.setData({ rows: [...held, ...extraRows] }); },
    });
    click(cellAt(grow.host, 1, 0));
    await grow.table.paste('x\t10\ny\t20\nz\t30');
    check('rows added by setData in onRowsAppend: the table holds them', bodyRows(grow.host).length, 4);
    check('…and the rows that fit are still staged', staged(grow.table), [[1, 0, 'x'], [1, 1, 10]]);
    grow.table.discard();

    // Without onPasteOverrun, an overrun stages nothing.
    const bare = mount({ ...base, headers, rows: [['a', 1]] });
    click(cellAt(bare.host, 0, 0));
    let none;
    const said = await warnings(async () => { none = await bare.table.paste('x\ny'); });
    check('without onPasteOverrun an overrun stages nothing', [none, staged(bare.table)], [null, []]);
    ok('…and says so on the console', said.some((s) => /1 row\(s\) past the last loaded row/.test(s)));

    // A block that fits asks nothing.
    asked.length = 0;
    click(cellAt(host, 0, 0));
    await table.paste('q\nr\ns');
    check('a block that fits in the loaded rows asks nothing', [asked.length, staged(table).length], [0, 3]);
    table.discard();

    // The last loaded row is in the order shown: with a filter hiding rows,
    // the rows past the last one SHOWN overrun.
    const f = mount({ ...base, headers, rows: [['a', 1], ['b', 2], ['c', 3]], filterable: true,
        onPasteOverrun: (o) => { asked.push(o); return false; } });
    f.table.setFilter(0, 'a');
    click(cellAt(f.host, 0, 0));
    asked.length = 0;
    await f.table.paste('x\ny');
    check('filtered to one row, a 2-row paste overruns by 1', asked, [{ rows: 1 }]);
}

section('§4 a value that won\'t parse marks its cell and the rest still stages');
{
    const headers = ['Name', 'Qty', 'When'];
    const rows = [['a', 1, null], ['b', 2, null], ['c', 3, null]];
    const { host, table } = mount({ ...base, headers, rows, editTypes: [null, 'number', 'datetime'] });
    click(cellAt(host, 0, 0));
    const r = await table.paste('x\tabc\t2026-12-31\ny\t5\tnot a date\nz\t6\t2026-01-02');
    check('two values refused, with their text and message',
          r.refused.map((f) => [f.row, f.col, f.text, f.error]), [[0, 1, 'abc', 'Not a number'], [1, 2, 'not a date', 'Not a date']]);
    check('the rest of the block still stages (7 cells)', table.getStagedEdits().map((e) => [e.rowIdx, e.colIdx]),
          [[0, 0], [0, 2], [1, 0], [1, 1], [2, 0], [2, 1], [2, 2]]);
    ok('a pasted date is a Date', table.getStagedEdits().find((e) => e.rowIdx === 0 && e.colIdx === 2).value instanceof Date);
    const bad = cellAt(host, 0, 1);
    ok('the refused cell is marked twm-dt-cell--error', bad.classList.contains('twm-dt-cell--error'));
    check('…with the message as title and data-error', [bad.title, bad.getAttribute('data-error')], ['Not a number', 'Not a number']);
    check('…and keeps the pasted text', bad.textContent, 'abc');
    ok('…and is not staged', !bad.classList.contains('twm-dt-cell--staged'));
    ok('the other refused cell is marked too', cellAt(host, 1, 2).classList.contains('twm-dt-cell--error'));
    // Anything staged into the cell ends the refusal.
    click(cellAt(host, 0, 1));
    await table.paste('9');
    ok('pasting a number into the refused cell ends its mark', !cellAt(host, 0, 1).classList.contains('twm-dt-cell--error'));
    check('…and stages it', table.getStagedEdits().find((e) => e.rowIdx === 0 && e.colIdx === 1)?.value, 9);
}

section('§5 a non-editable target cell is skipped and marked');
{
    const headers = ['Id', 'Name', 'Qty'];
    const rows = [[1, 'a', 1], [2, 'b', 2], [3, 'c', 3]];
    const { host, table } = mount({
        ...base, headers, rows,
        editable: (col, row) => col !== 0 && !(row[0] === 2 && col === 2),   // Id never; row 2's Qty locked
    });
    click(cellAt(host, 0, 0));
    const r = await table.paste('10\tx\t7\n20\ty\t8\n30\tz\t9');
    check('the Id column and the locked Qty are skipped',
          r.skipped.map((s) => [s.row, s.col]), [[0, 0], [1, 0], [1, 2], [2, 0]]);
    check('…the other cells stage', staged(table), [[0, 1, 'x'], [0, 2, 7], [1, 1, 'y'], [2, 1, 'z'], [2, 2, 9]]);
    ok('each skipped cell is drawn twm-dt-cell--paste-skipped',
       [[0, 0], [1, 0], [1, 2], [2, 0]].every(([p, c]) => cellAt(host, p, c).classList.contains('twm-dt-cell--paste-skipped')));
    ok('…and no other cell is', !cellAt(host, 0, 1).classList.contains('twm-dt-cell--paste-skipped'));
    check('…the skipped cells keep their values', [cellAt(host, 1, 0).textContent, cellAt(host, 1, 2).textContent], ['2', '2']);
    check('…and their rows are untouched', [rows[1][0], rows[1][2]], [2, 2]);
    click(cellAt(host, 2, 2));
    ok('the marks go when the selection moves', !host.querySelector('.twm-dt-cell--paste-skipped'));
}

section('§6 each column\'s editor reads its text');
{
    const headers = ['Amount', 'When', 'Colour', 'Done', 'Code'];
    const rows = [[0, null, null, false, ''], [0, null, null, false, '']];
    const codeParse = (text) => (/^[A-Z]{3}$/.test(text) ? { ok: true, value: `code:${text}` } : { ok: false, error: 'Three capitals' });
    const codeEditor = Object.assign(() => document.createElement('input'), { parse: codeParse });
    const { host, table } = mount({
        ...base, headers, rows, locale: 'de-DE', utc: true, dateTimeZone: 'UTC',
        editTypes: ['number', 'datetime', { type: 'choice', options: [{ value: 'r', label: 'Red' }, { value: 'g', label: 'Green' }] }, 'bool', 'code'],
        editors: { code: codeEditor },
    });
    click(cellAt(host, 0, 0));
    const r = await table.paste('1.234,56\t31.12.2026\tred\ttrue\tABC\n7\t2026-01-02\tblue\tfalse\tabc');
    const at = (row, col) => table.getStagedEdits().find((e) => e.rowIdx === row && e.colIdx === col)?.value;
    check('a de-DE number reads 1.234,56 as 1234.56', at(0, 0), 1234.56);
    check('a de-DE date 31.12.2026 is that day', at(0, 1) instanceof Date && at(0, 1).toISOString().slice(0, 10), '2026-12-31');
    check('an ISO date reads too', at(1, 1) instanceof Date && at(1, 1).toISOString().slice(0, 10), '2026-01-02');
    check('a choice reads its label (any case) as its value', at(0, 2), 'r');
    check('…a value outside the options is refused', r.refused.filter((f) => f.col === 2).map((f) => [f.text, f.error]), [['blue', 'Not one of the options']]);
    check('a bool reads true', at(0, 3), true);
    check('an injected editor\'s own parse reads its column', at(0, 4), 'code:ABC');
    check('…and refuses with its own message', r.refused.filter((f) => f.col === 4).map((f) => f.error), ['Three capitals']);
}

section('§7 a paste in an open editor is the editor\'s; Excel\'s quoting');
{
    const headers = ['Name', 'Note'];
    const { host, table } = mount({ ...base, headers, rows: [['a', ''], ['b', ''], ['c', '']] });
    click(cellAt(host, 0, 0));
    key(tableEl(host), 'F2');
    const input = host.querySelector('td input');
    ok('an editor is open', !!input);
    const ev = pasteEvent(input, 'x\ty');
    await tick();
    ok('a paste into the editor is left to it (not prevented)', !ev.defaultPrevented);
    check('…and stages nothing', staged(table), []);
    key(input, 'Escape');

    click(cellAt(host, 0, 0));
    await table.paste('"a\tb"\t"line1\nline2"\r\n"say ""hi"""\tplain\r\n');
    check('quoted cells land as one cell each; Excel\'s last newline is no row',
          staged(table), [[0, 0, 'a\tb'], [0, 1, 'line1\nline2'], [1, 0, 'say "hi"'], [1, 1, 'plain']]);
    table.discard();

    const empty = await table.paste('');
    check('empty text pastes nothing', [empty, staged(table)], [null, []]);
}

section('§8 without the option the table does not take a paste, as in 0.16');
{
    const headers = ['A', 'B'];
    const plain = mount({ headers, rows: grid(2, 2), pagination: false });
    const ev = pasteEvent(tableEl(plain.host), 'x');
    ok('a table with none of the options leaves the paste event alone', !ev.defaultPrevented);
    check('…and paste() does nothing', await plain.table.paste('x'), null);

    const noOpt = mount({ headers, rows: grid(2, 2), pagination: false, selectionMode: 'cells', editable: true, staged: true });
    click(cellAt(noOpt.host, 0, 0));
    const ev2 = pasteEvent(tableEl(noOpt.host), 'x');
    await tick();
    ok('a staged table without `pasteable` leaves it alone too', !ev2.defaultPrevented);
    check('…nothing staged', staged(noOpt.table), []);

    let w;
    const said = await warnings(async () => {
        w = mount({ headers, rows: grid(2, 2), pagination: false, selectionMode: 'cells', editable: true, pasteable: true });
    });
    ok('`pasteable` without `staged` is ignored with a warning', said.some((s) => /`pasteable` needs `staged`/.test(s)));
    click(cellAt(w.host, 0, 0));
    check('…and pastes nothing', await w.table.paste('x'), null);
}

section('§9 the skipped mark\'s stylesheet');
{
    const sheet = css('flexdesk.css');
    const body = ruleBody(sheet, '.twm-preview-table.twm-dt--cells tbody td.twm-dt-cell--paste-skipped');
    ok('a skipped cell is hatched like a fill\'s skipped cell', body && body.includes('repeating-linear-gradient(45deg'));
    const pin = ruleBody(sheet, '.twm-preview-table.twm-dt-crosstab.twm-dt--cells tbody td.twm-dt-pin.twm-dt-cell--paste-skipped');
    ok('…and a pinned crosstab cell lays the same mark as its layer', pin && pin.includes('--twm-dt-pin-mark'));
}

done();
