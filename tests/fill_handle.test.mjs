/**
 * STORY-0089 — DataTable's fill handle (`fillHandle: true`, fill_handle.js),
 * in jsdom.
 *
 *   §1  one cell repeats; 1,2 filled three further gives 3,4,5; dates a week
 *       apart continue a week apart; any other block cycles; Ctrl held at
 *       release repeats the block
 *   §2  up, down, left and right
 *   §3  a target cell that is not editable is skipped and marked, never
 *       overwritten
 *   §4  a whole fill is one undo entry
 *   §5  the handle and the drag: on the corner cell, the preview, Escape,
 *       a press on the handle is no click, nor is the click a browser makes
 *       of a drag (on the corner cell, the row or the body)
 *   §6  without the option (or without `staged`) there is no handle
 *
 * Against 0.16, every section fails (there is no fill handle).
 *
 *     node tests/fill_handle.test.mjs
 */
import { dataTableEnv } from './dt_env.mjs';

const T = await dataTableEnv('fill handle');
const { check, ok, section, mount, bodyRows, click, mouse, key, done, document } = T;

const cellAt = (host, r, c) => bodyRows(host)[r].children[c];
const handleIn = (host) => host.querySelector('.twm-dt-fill-handle');
const staged = (table) => table.getStagedEdits().map((e) => [e.rowIdx, e.colIdx, e.value]);
const column = (table, col) => table.getStagedEdits().filter((e) => e.colIdx === col).map((e) => e.value);
const select = (host, [r0, c0], [r1, c1]) => {
    click(cellAt(host, r0, c0));
    if (r1 !== r0 || c1 !== c0) click(cellAt(host, r1, c1), { shiftKey: true });
};
const base = { pagination: false, selectionMode: 'cells', editable: true, staged: true, fillHandle: true };
/** The element a browser clicks after a press on `a` and a release on `b`. */
const under = (a, b) => { let n = a; while (!n.contains(b)) n = n.parentNode; return n; };
/** A drag of the handle to a cell, released with `up` (e.g. `{ctrlKey: true}`),
 *  and the click the browser makes of it (on the host when a re-draw took
 *  the element it was under away). */
const drag = (host, [r, c], up = {}) => {
    const h = handleIn(host);
    const to = cellAt(host, r, c);
    const target = under(h, to);
    mouse('pointerdown', h);
    mouse('pointermove', to);
    mouse('pointerup', to, up);
    click(target.isConnected ? target : host);
};

section('§1 the series rules');
{
    const headers = ['N', 'Date', 'Tag', 'Label', 'One'];
    const rows = [
        [1, '2026-10-05', 'a', 'Item 1', 'x'],
        [2, '2026-10-12', 'b', 'Item 2', ''],
        [4, '2026-10-13', 'c', '', ''],
        ['', '', '', '', ''],
        ['', '', '', '', ''],
        ['', '', '', '', ''],
        ['', '', '', '', ''],
    ];
    const { host, table } = mount({ ...base, headers, rows });

    // One cell repeats its value.
    select(host, [0, 4], [0, 4]);
    const one = table.fill({ row: 3, col: 4 });
    check('one cell filled three down: three cells staged', one && [one.direction, one.count, one.staged], ['down', 3, 3]);
    check('…each repeating its value', column(table, 4), ['x', 'x', 'x']);
    table.discard();

    // 1,2 filled three further down gives 3,4,5.
    select(host, [0, 0], [1, 0]);
    table.fill({ row: 4, col: 0 });
    check('1,2 filled three further down: rows 2, 3 and 4', table.getStagedEdits().map((e) => e.rowIdx), [2, 3, 4]);
    check('…values 3, 4, 5', column(table, 0), [3, 4, 5]);
    check('…drawn in the cells', [2, 3, 4].map((r) => cellAt(host, r, 0).textContent), ['3', '4', '5']);
    ok('…drawn staged', [2, 3, 4].every((r) => cellAt(host, r, 0).classList.contains('twm-dt-cell--staged')));
    table.discard();

    // Dates a week apart continue a week apart.
    select(host, [0, 1], [1, 1]);
    table.fill({ row: 5, col: 1 });
    check('dates a week apart continue a week apart', column(table, 1),
          ['2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09']);
    table.discard();

    // Any other block repeats in a cycle.
    select(host, [0, 2], [2, 2]);
    table.fill({ row: 6, col: 2 });
    check('a,b,c repeats in a cycle', column(table, 2), ['a', 'b', 'c', 'a']);
    table.discard();
    select(host, [0, 0], [2, 0]);
    table.fill({ row: 6, col: 0 });
    check('1,2,4 (no constant step) repeats in a cycle', column(table, 0), [1, 2, 4, 1]);
    table.discard();

    // "Item 1", "Item 2" continue; several columns at once, each its own seed.
    select(host, [0, 0], [1, 3]);
    table.fill({ row: 3, col: 3 });
    check('a 2×4 block fills each column from its own seed', staged(table), [
        [2, 0, 3], [2, 1, '2026-10-19'], [2, 2, 'a'], [2, 3, 'Item 3'],
        [3, 0, 4], [3, 1, '2026-10-26'], [3, 2, 'b'], [3, 3, 'Item 4'],
    ]);
    table.discard();

    // Holding Ctrl repeats the block instead of continuing the series.
    select(host, [0, 0], [1, 1]);
    drag(host, [4, 1], { ctrlKey: true });
    check('Ctrl held at release repeats the numbers', column(table, 0), [1, 2, 1]);
    check('…and the dates', column(table, 1), ['2026-10-05', '2026-10-12', '2026-10-05']);
    table.discard();
    select(host, [0, 0], [1, 0]);
    drag(host, [4, 0], { metaKey: true });
    check('Cmd does the same', column(table, 0), [1, 2, 1]);
    table.discard();
    select(host, [0, 0], [1, 0]);
    check('fill(…, {forceCopy}) is Ctrl from code', (table.fill({ row: 3, col: 0 }, { forceCopy: true }), column(table, 0)), [1, 2]);
    table.discard();
    select(host, [0, 0], [1, 0]);
    drag(host, [4, 0]);
    check('without Ctrl the same drag continues the series', column(table, 0), [3, 4, 5]);
}

section('§2 up, down, left and right');
{
    const headers = ['A', 'B', 'C', 'D', 'E', 'F'];
    const blank = () => ['', '', '', '', '', ''];
    const rows = [blank(), blank(), blank(), ['', '', 1, 2, '', ''], ['', '', 2, 4, '', ''], blank(), blank()];
    const { host, table } = mount({ ...base, headers, rows });

    select(host, [3, 2], [4, 3]);
    const down = table.fill({ row: 6, col: 3 });
    check('down', [down.direction, staged(table)], ['down', [[5, 2, 3], [5, 3, 6], [6, 2, 4], [6, 3, 8]]]);
    table.discard();

    select(host, [3, 2], [4, 3]);
    const up = table.fill({ row: 0, col: 2 });
    check('up: the series runs away from the block (the cell next to it first)',
          [up.direction, staged(table)], ['up', [[0, 2, -2], [0, 3, -4], [1, 2, -1], [1, 3, -2], [2, 2, 0], [2, 3, 0]]]);
    table.discard();

    select(host, [3, 2], [4, 3]);
    const right = table.fill({ row: 4, col: 5 });
    check('right', [right.direction, staged(table)], ['right', [[3, 4, 3], [3, 5, 4], [4, 4, 6], [4, 5, 8]]]);
    table.discard();

    select(host, [3, 2], [4, 3]);
    const left = table.fill({ row: 3, col: 0 });
    check('left', [left.direction, staged(table)], ['left', [[3, 0, -1], [3, 1, 0], [4, 0, -2], [4, 1, 0]]]);
    table.discard();

    // The drag reaches the same fills.
    select(host, [3, 2], [4, 3]);
    drag(host, [1, 3]);
    check('a drag up', staged(table), [[1, 2, -1], [1, 3, -2], [2, 2, 0], [2, 3, 0]]);
    table.discard();
    select(host, [3, 2], [4, 3]);
    drag(host, [3, 5]);
    check('a drag right', staged(table), [[3, 4, 3], [3, 5, 4], [4, 4, 6], [4, 5, 8]]);
    table.discard();
    select(host, [3, 2], [4, 3]);
    drag(host, [4, 1]);
    check('a drag left', staged(table), [[3, 1, 0], [4, 1, 0]]);
    table.discard();

    // The direction is the one furthest out; up and down win a tie.
    select(host, [3, 2], [4, 3]);
    check('a diagonal cell fills down when it is further down', table.fill({ row: 6, col: 4 }).direction, 'down');
    table.discard();
    select(host, [3, 2], [4, 3]);
    check('…and right when it is further right', table.fill({ row: 5, col: 5 }).direction, 'right');
    table.discard();
    select(host, [3, 2], [4, 3]);
    check('a cell inside the range fills nothing', table.fill({ row: 4, col: 2 }), null);
    check('…and stages nothing', staged(table), []);
    select(host, [3, 2], [4, 3]);
    check('a fill past the last row stops at the last row', table.fill({ row: 99, col: 2 }).count, 2);
    table.discard();

    // The range then covers what was filled.
    select(host, [3, 2], [4, 3]);
    table.fill({ row: 6, col: 3 });
    const sel = table.getCellSelection();
    check('the range covers the block and the filled cells',
          [sel.range.top, sel.range.bottom, sel.range.left, sel.range.right], [3, 6, 2, 3]);
    table.discard();
}
{
    // A hidden column is no part of a sideways fill.
    const rows = [[1, 'h', 2, '', '']];
    const { host, table } = mount({ ...base, headers: ['A', 'Hidden', 'B', 'C', 'D'], rows, hiddenColumns: [1] });
    const td = (c) => [...bodyRows(host)[0].children].find((x) => x.__colIdx === c);
    click(td(0));
    click(td(2), { shiftKey: true });
    table.fill({ row: 0, col: 4 });
    check('a sideways fill steps over a hidden column', staged(table), [[0, 3, 3], [0, 4, 4]]);
}

section('§3 a target cell that is not editable is skipped and marked');
{
    const headers = ['N', 'Lock', 'M'];
    const rows = [[1, '', 10], [2, '', 20], [7, 'locked', 70], [8, '', 80], [9, 'locked', 90], [0, '', 0]];
    const { host, table } = mount({
        ...base, headers, rows,
        // The value column of a locked row cannot be edited; nor can column 1.
        editable: (col, row) => col !== 1 && row[1] !== 'locked',
    });
    select(host, [0, 0], [1, 2]);
    const r = table.fill({ row: 5, col: 2 });
    check('the locked cells are skipped, column by column', r.skipped.map((s) => [s.rowIdx, s.col]),
          [[2, 0], [4, 0], [2, 1], [3, 1], [4, 1], [5, 1], [2, 2], [4, 2]]);
    check('…eight of them (2 locked rows × 2 columns, and the read-only column\'s 4)', r.skipped.length, 8);
    check('the editable targets are staged with the series as if nothing were skipped', staged(table), [
        [3, 0, 4], [3, 2, 40], [5, 0, 6], [5, 2, 60],
    ]);
    check('the skipped cells are never overwritten: the rows hold what they held',
          [rows[2][0], rows[2][2], rows[4][0], rows[4][2], rows[3][1]], [7, 70, 9, 90, '']);
    check('…and still show it', [cellAt(host, 2, 0).textContent, cellAt(host, 4, 2).textContent], ['7', '90']);
    ok('…not drawn staged', !cellAt(host, 2, 0).classList.contains('twm-dt-cell--staged'));
    const marked = [...host.querySelectorAll('td.twm-dt-cell--fill-skipped')]
        .map((td) => [td.parentNode.__rowIndex, td.__colIdx]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    check('each skipped cell is marked twm-dt-cell--fill-skipped', marked,
          [[2, 0], [2, 1], [2, 2], [3, 1], [4, 0], [4, 1], [4, 2], [5, 1]]);
    ok('a staged cell is not marked skipped', !cellAt(host, 3, 0).classList.contains('twm-dt-cell--fill-skipped'));
    table.render();
    check('the marks survive a redraw', host.querySelectorAll('td.twm-dt-cell--fill-skipped').length, 8);
    click(cellAt(host, 0, 0));
    check('…and end when the selection moves', host.querySelectorAll('td.twm-dt-cell--fill-skipped').length, 0);

    // A fill onto nothing but locked cells stages nothing and still marks.
    select(host, [1, 0], [1, 0]);
    const r2 = table.fill({ row: 2, col: 0 });
    check('a fill onto one locked cell stages nothing', [r2.staged, r2.skipped.length], [0, 1]);
    ok('…and marks it', cellAt(host, 2, 0).classList.contains('twm-dt-cell--fill-skipped'));
    check('…and the row still holds its value', rows[2][0], 7);
}

section('§4 a whole fill is one undo entry');
{
    const headers = ['A', 'B', 'C'];
    const rows = Array.from({ length: 12 }, (_, i) => (i < 2 ? [i + 1, `Item ${i + 1}`, 'q'] : ['', '', '']));
    const changes = [];
    const { host, table } = mount({ ...base, headers, rows, onStagedChange: (s) => changes.push(s) });
    table.editCell(11, 2);
    const input = host.querySelector('td.twm-dt-cell--editing .twm-dt-editor');
    input.value = 'typed';
    key(input, 'Enter');
    check('an edit before the fill is staged', staged(table), [[11, 2, 'typed']]);
    changes.length = 0;
    select(host, [0, 0], [1, 2]);
    const r = table.fill({ row: 10, col: 2 });
    check('the fill staged 27 cells', [r.staged, table.getStagedEdits().length], [27, 28]);
    check('the listeners are told once for the whole fill', changes.length, 1);
    check('…which can be undone', changes[0].canUndo, true);
    table._tableEl.focus();
    key(table._tableEl, 'z', { ctrlKey: true });
    check('ONE Ctrl+Z takes the whole fill back', staged(table), [[11, 2, 'typed']]);
    ok('…the filled cells are drawn unstaged again', !cellAt(host, 5, 0).classList.contains('twm-dt-cell--staged'));
    check('…and show the rows\' values', cellAt(host, 5, 0).textContent, '');
    key(table._tableEl, 'y', { ctrlKey: true });
    check('ONE Ctrl+Y puts the whole fill back', table.getStagedEdits().length, 28);
    check('…the values as filled', [cellAt(host, 10, 0).textContent, cellAt(host, 10, 1).textContent], ['11', 'Item 11']);
    table.undo();
    table.undo();
    check('the undo after it takes back the edit before the fill', staged(table), []);
    ok('nothing more to undo', !table.undo());

    // A fill that changes nothing costs no undo step.
    const rowsQ = [['q', 'q'], ['q', 'q']];
    const { host: h2, table: t2 } = mount({ ...base, headers: ['A', 'B'], rows: rowsQ });
    select(h2, [0, 0], [0, 0]);
    const nothing = t2.fill({ row: 1, col: 0 });
    check('a fill whose values are already there stages nothing', [nothing.staged, t2.getStagedEdits().length], [0, 0]);
    ok('…and leaves nothing to undo', !t2.undo());
}

{
    // Under `virtualize`, a fill over rows that are not drawn is still one entry.
    const rows = Array.from({ length: 1000 }, (_, i) => [`row ${i}`, i < 2 ? i * 10 : null]);
    const { table } = mount({ ...base, headers: ['Title', 'Amount'], rows, virtualize: { rowHeight: 24, overscan: 10 } });
    table.setCellSelection({ row: 1, col: 1 }, { row: 0, col: 1 });
    const t0 = Date.now();
    const r = table.fill({ row: 999, col: 1 });
    const ms = Date.now() - t0;
    check('a virtual table fills 998 rows, drawn or not', [r.staged, table.getStagedEdits().at(-1)], [998, { rowIdx: 999, colIdx: 1, value: 9990, previous: null }]);
    ok(`…in well under a second (${ms} ms)`, ms < 1000);
    table.undo();
    check('…and one undo takes it all back', table.getStagedEdits().length, 0);
}

section('§5 the handle and the drag');
{
    const headers = ['A', 'B', 'C'];
    const rows = [[1, 'a', 'x'], [2, 'b', 'y'], ['', '', ''], ['', '', ''], ['', '', '']];
    const { host, table } = mount({ ...base, headers, rows });
    check('no range, no handle', handleIn(host), null);
    select(host, [0, 0], [1, 1]);
    const h = handleIn(host);
    ok('the handle is drawn in the range\'s bottom-right cell', h && h.parentNode === cellAt(host, 1, 1));
    ok('…which is marked as the corner', cellAt(host, 1, 1).classList.contains('twm-dt-cell--fill-corner'));
    check('there is one handle', host.querySelectorAll('.twm-dt-fill-handle').length, 1);
    check('…and it adds no text to its cell', cellAt(host, 1, 1).textContent, 'b');
    click(cellAt(host, 0, 2));
    ok('the handle follows the selection', handleIn(host).parentNode === cellAt(host, 0, 2));
    ok('…the old corner is no longer marked', !cellAt(host, 1, 1).classList.contains('twm-dt-cell--fill-corner'));
    table.render();
    ok('a redraw draws the handle on the new corner cell', handleIn(host)?.parentNode === cellAt(host, 0, 2));

    // The preview while dragging.
    select(host, [0, 0], [1, 1]);
    mouse('pointerdown', handleIn(host));
    mouse('pointermove', cellAt(host, 3, 0));
    const previewed = () => [...host.querySelectorAll('td.twm-dt-cell--fill-preview')]
        .map((td) => [td.parentNode.__rowIndex, td.__colIdx]);
    check('the cells the drag covers are previewed', previewed(), [[2, 0], [2, 1], [3, 0], [3, 1]]);
    check('…nothing is staged yet', staged(table), []);
    mouse('pointermove', cellAt(host, 0, 2));
    check('dragging sideways previews sideways', previewed(), [[0, 2], [1, 2]]);
    mouse('pointermove', cellAt(host, 1, 0));
    check('back inside the range previews nothing', previewed(), []);
    mouse('pointermove', cellAt(host, 4, 1));
    key(document.body, 'Escape');
    check('Escape cancels the drag: no preview', previewed(), []);
    mouse('pointerup', cellAt(host, 4, 1));
    check('…and the release fills nothing', staged(table), []);
    const r = table.getCellSelection().range;
    check('…and the range is as it was', [r.top, r.bottom, r.left, r.right], [0, 1, 0, 1]);

    mouse('pointerdown', handleIn(host));
    mouse('pointermove', cellAt(host, 3, 1));
    mouse('pointercancel', cellAt(host, 3, 1));
    check('a cancelled pointer fills nothing', [previewed(), staged(table)], [[], []]);

    // A press and release on the handle is no click on its cell.
    mouse('pointerdown', handleIn(host));
    mouse('pointerup', handleIn(host));
    click(handleIn(host));
    const r2 = table.getCellSelection().range;
    check('a click on the handle keeps the range', [r2.top, r2.bottom, r2.left, r2.right], [0, 1, 0, 1]);
    check('…and fills nothing', staged(table), []);

    // The drag fills, and the table has the focus for Ctrl+Z after it.
    drag(host, [3, 1]);
    check('the release fills the cells previewed', staged(table), [[2, 0, 3], [2, 1, 'a'], [3, 0, 4], [3, 1, 'b']]);
    check('…and leaves no preview', previewed(), []);
    ok('…and the table has the focus', document.activeElement === table._tableEl);
    ok('the handle moved to the new corner', handleIn(host).parentNode === cellAt(host, 3, 1));

    // No handle while an editor is open, nor a fill.
    table.editCell(0, 2);
    ok('fill() does nothing while an editor is open', table.fill({ row: 4, col: 1 }) === null);
    key(host.querySelector('.twm-dt-editor'), 'Escape');

    // While a commit is out, nothing fills.
    const { host: h3, table: t3 } = mount({ ...base, headers, rows: [[1, 'a', 'x'], [2, 'b', 'y'], ['', '', '']],
        onCommit: () => new Promise(() => {}) });
    select(h3, [0, 0], [0, 0]);
    t3.fill({ row: 1, col: 0 });
    t3.commit();
    select(h3, [0, 0], [1, 0]);
    check('fill() does nothing while a commit is out', t3.fill({ row: 2, col: 0 }), null);
    check('…and no handle is drawn', handleIn(h3), null);
}

{
    // A browser ends a handle drag in a click of its own, on the element
    // under both the press and the release: the corner cell, the row, or the
    // body. That click is no click on the table, filled or not.
    const headers = ['A', 'B', 'C'];
    const rows = [[1, 'a', 'x'], [2, 'b', 'y'], ['', '', ''], ['', '', ''], ['', '', '']];
    const calls = [];
    const { host, table } = mount({ ...base, headers, rows,
        onRowClick: (i) => calls.push(['click', i]), onRowActivate: (i) => calls.push(['activate', i]) });
    const range = () => { const r = table.getCellSelection().range; return [r.top, r.bottom, r.left, r.right]; };
    const rowEl = (r) => bodyRows(host)[r];
    select(host, [0, 0], [1, 1]);
    calls.length = 0;

    mouse('pointerdown', handleIn(host));
    mouse('pointermove', cellAt(host, 3, 1));
    mouse('pointermove', cellAt(host, 1, 1));
    mouse('pointerup', cellAt(host, 1, 1));
    click(cellAt(host, 1, 1));
    check('a drag released back on the corner keeps the range', range(), [0, 1, 0, 1]);
    check('…fills nothing and clicks no row', [staged(table), calls], [[], []]);

    mouse('pointerdown', handleIn(host));
    mouse('pointermove', cellAt(host, 3, 0));
    mouse('pointermove', cellAt(host, 1, 0));
    mouse('pointerup', cellAt(host, 1, 0));
    click(rowEl(1));
    check('a drag released on another cell of the bottom row keeps the range', range(), [0, 1, 0, 1]);
    check('…fills nothing and neither clicks nor opens the row', [staged(table), calls], [[], []]);

    mouse('pointerdown', handleIn(host));
    mouse('pointermove', cellAt(host, 1, 2));
    key(document.body, 'Escape');
    mouse('pointerup', cellAt(host, 1, 2));
    click(rowEl(1));
    check('a drag ended by Escape and released beside the corner keeps the range', range(), [0, 1, 0, 1]);
    check('…fills nothing and neither clicks nor opens the row', [staged(table), calls], [[], []]);

    drag(host, [3, 1]);
    click(host.querySelector('.twm-preview-table-wrap tbody'));
    check('a drag that fills ends on the range it filled', range(), [0, 3, 0, 1]);
    check('…staged, and the click after it clicks no row', [staged(table).length, calls], [4, []]);

    await T.tick();
    click(cellAt(host, 4, 2));
    check('the next task\'s click is a click again', [range(), calls], [[4, 4, 2, 2], [['click', 4], ['activate', 4]]]);
}

section('§6 without the option there is no handle');
{
    const headers = ['A', 'B'];
    const rows = [[1, 'a'], [2, 'b'], ['', '']];
    const plain = mount({ pagination: false, selectionMode: 'cells', editable: true, staged: true, headers, rows });
    select(plain.host, [0, 0], [1, 0]);
    check('cell mode with staged and no fillHandle draws no handle', handleIn(plain.host), null);
    check('…and fill() fills nothing', plain.table.fill({ row: 2, col: 0 }), null);

    const warn = console.warn;
    const seen = [];
    console.warn = (...a) => seen.push(a.join(' '));
    let noStage;
    let rowsMode;
    try {
        noStage = mount({ pagination: false, selectionMode: 'cells', editable: true, fillHandle: true, headers, rows });
        rowsMode = mount({ pagination: false, fillHandle: true, headers, rows });
    } finally { console.warn = warn; }
    ok('fillHandle without staged warns', seen.some((s) => s.includes('`fillHandle` needs `staged`')));
    check('…twice: in cell mode and in row mode', seen.filter((s) => s.includes('`fillHandle`')).length, 2);
    select(noStage.host, [0, 0], [1, 0]);
    check('…and draws no handle', handleIn(noStage.host), null);
    check('…and fill() fills nothing', noStage.table.fill({ row: 2, col: 0 }), null);
    check('a row-mode table with fillHandle has no handle and fill() is null',
          [handleIn(rowsMode.host), rowsMode.table.fill({ row: 2, col: 0 })], [null, null]);
}

done();
