/**
 * STORY-0088 `staged` / `onCommit` / `historyLimit` — CELL EDITS STAGED, TAKEN
 * BACK AND PUT BACK, AND COMMITTED IN ONE BATCH.
 *
 *   §1  a staged cell is drawn `twm-dt-cell--staged` and nothing is sent;
 *       Ctrl+Z takes it back, Ctrl+Y (and Ctrl+Shift+Z) puts it back; a cell
 *       staged as null undoes to no change, not to a staged null; typing the
 *       row's own value back is no change
 *   §2  commit() calls onCommit({edits}) once with every staged cell; per-cell
 *       errors mark every failing cell (7 and 190 of 200) and the staged
 *       values stay; a success writes the rows and clears the cells and the
 *       ring; a rejection marks every cell; discard() clears them
 *   §3  while cells are staged, sort, filter and paging are frozen and every
 *       blocked control says why (`data-refusal`); afterwards they are as
 *       they were
 *   §4  the ring keeps the last `historyLimit` entries (default 100), each a
 *       before/after delta
 *   §5  without `staged`, nothing of this: commits go to onCellCommit
 *
 * Against 0.16, every section fails (there is no staging).
 *
 *     node tests/staged_edits.test.mjs
 */
import { dataTableEnv } from './dt_env.mjs';

const T = await dataTableEnv('staged edits');
const { check, ok, section, mount, bodyRows, click, key, tick, done, document } = T;

const headers = ['Name', 'Qty', 'Note'];
const fresh = () => [['apple', 3, 'red'], ['pear', 5, 'green'], ['plum', 7, 'blue']];
const cellAt = (host, r, c) => bodyRows(host)[r].children[c];
const editorIn = (host) => host.querySelector('td.twm-dt-cell--editing .twm-dt-editor');

/** Type `value` into a cell (position, data column) and press Enter. */
const type = (table, host, row, col, value) => {
    ok(`an editor opens on (${row},${col})`, table.editCell(row, col));
    const input = editorIn(host);
    input.value = value;
    key(input, 'Enter');
};
const ctrl = (table, k, init = {}) => key(table._tableEl, k, { ctrlKey: true, ...init });

const quiet = (fn) => {
    const warn = console.warn;
    const seen = [];
    console.warn = (...a) => { seen.push(a.join(' ')); };
    try { return [fn(), seen]; } finally { console.warn = warn; }
};

section('§1 staged, undone, redone');
{
    const sent = [];
    const changes = [];
    const rows = fresh();
    const { host, table } = mount({
        headers, rows, pagination: false, selectionMode: 'cells', editable: true, staged: true,
        onCellCommit: (c) => { sent.push(c); },
        onStagedChange: (s) => { changes.push(s); },
    });
    click(cellAt(host, 0, 2));
    type(table, host, 0, 2, 'crimson');
    let td = cellAt(host, 0, 2);
    ok('the cell is drawn staged', td.classList.contains('twm-dt-cell--staged'));
    check('…showing the value typed', td.textContent, 'crimson');
    check('onCellCommit is not called under `staged`', sent.length, 0);
    check('the row is not written yet', rows[0][2], 'red');
    check('getStagedEdits', table.getStagedEdits(), [{ rowIdx: 0, colIdx: 2, value: 'crimson', previous: 'red' }]);
    check('onStagedChange heard it', changes.at(-1), { count: 1, canUndo: true, canRedo: false, committing: false });

    ok('Enter moved the cursor down', table.getCellSelection().focus.row === 1);
    ctrl(table, 'z');
    td = cellAt(host, 0, 2);
    ok('Ctrl+Z takes it back: not staged', !td.classList.contains('twm-dt-cell--staged'));
    check('…the cell shows the row\'s value again', td.textContent, 'red');
    check('…nothing staged', table.getStagedEdits(), []);
    ctrl(table, 'y');
    td = cellAt(host, 0, 2);
    ok('Ctrl+Y puts it back', td.classList.contains('twm-dt-cell--staged') && td.textContent === 'crimson');
    ctrl(table, 'z');
    ctrl(table, 'z', { shiftKey: true });
    ok('Ctrl+Shift+Z puts it back too', cellAt(host, 0, 2).classList.contains('twm-dt-cell--staged'));

    // An edit of a staged cell is one more entry, from the staged value.
    type(table, host, 0, 2, 'scarlet');
    check('editing a staged cell starts from its staged value and restages it',
          table.getStagedEdits().map((e) => e.value), ['scarlet']);
    ctrl(table, 'z');
    check('one Ctrl+Z goes back to the value staged before', cellAt(host, 0, 2).textContent, 'crimson');
    ctrl(table, 'z');
    check('another to no change', table.getStagedEdits(), []);

    // Typed back to what the row holds: no change.
    type(table, host, 1, 0, 'quince');
    type(table, host, 1, 0, 'pear');
    check('typing the row\'s own value back leaves nothing staged', table.getStagedEdits(), []);
    ok('…and the cell is not drawn staged', !cellAt(host, 1, 0).classList.contains('twm-dt-cell--staged'));
    ctrl(table, 'z');
    check('Ctrl+Z after it brings the typed value back as staged', cellAt(host, 1, 0).textContent, 'quince');
    table.discard();

    // Ctrl+Z inside an open editor is the editor's.
    table.editCell(2, 0);
    const input = editorIn(host);
    input.value = 'x';
    key(input, 'z', { ctrlKey: true });
    ok('Ctrl+Z in the editor does not close it or undo', !!editorIn(host) && table.isEditing());
    key(input, 'Escape');
}
{
    // A cell staged AS NULL undoes to no change.
    const { host, table } = mount({
        headers, rows: fresh(), pagination: false, selectionMode: 'cells', editable: true, staged: true,
        editors: { 2: ({ commit }) => { const b = document.createElement('button'); b.className = 'clear-it'; b.addEventListener('click', () => commit(null)); return { el: b }; } },
    });
    table.editCell(0, 2);
    host.querySelector('.clear-it').click();
    check('the cell is staged as null', table.getStagedEdits(), [{ rowIdx: 0, colIdx: 2, value: null, previous: 'red' }]);
    ok('…and drawn staged', cellAt(host, 0, 2).classList.contains('twm-dt-cell--staged'));
    table.undo();
    check('undoing it restores no change: nothing staged, not a staged null', table.getStagedEdits(), []);
    ok('…the cell is not drawn staged', !cellAt(host, 0, 2).classList.contains('twm-dt-cell--staged'));
    check('…and shows the row\'s value', cellAt(host, 0, 2).textContent, 'red');
    table.redo();
    check('redo stages the null again', table.getStagedEdits().map((e) => e.value), [null]);
}

section('§2 commit() in one batch');
{
    const N = 200;
    const rows = Array.from({ length: N }, (_, i) => [`r${i}`, i, '']);
    const calls = [];
    let answer = null;
    const { host, table } = mount({
        headers, rows, pagination: false, selectionMode: 'cells', editable: true, staged: true,
        onCommit: (arg) => { calls.push(arg); return answer(arg); },
    });
    for (let i = 0; i < N; i++) type(table, host, i, 2, `n${i}`);
    check('200 cells staged', table.getStagedEdits().length, N);

    answer = () => Promise.resolve({ errors: [
        { rowIdx: 7, colIdx: 2, error: 'Row 7 is locked' },
        { rowIdx: 190, colIdx: 2, error: 'Row 190 is gone' },
    ] });
    const r1 = await table.commit();
    check('onCommit is called once', calls.length, 1);
    check('…with every staged cell', calls[0].edits.length, N);
    check('…each {rowIdx, colIdx, value, previous}', calls[0].edits[7], { rowIdx: 7, colIdx: 2, value: 'n7', previous: '' });
    check('commit() resolves the refusal', [r1.ok, r1.errors.map((e) => e.rowIdx)], [false, [7, 190]]);
    const c7 = cellAt(host, 7, 2);
    const c190 = cellAt(host, 190, 2);
    ok('cell 7 is marked', c7.classList.contains('twm-dt-cell--error') && c7.getAttribute('data-error') === 'Row 7 is locked');
    ok('cell 190 is marked too', c190.classList.contains('twm-dt-cell--error') && c190.getAttribute('data-error') === 'Row 190 is gone');
    check('…with the message as its title', c190.title, 'Row 190 is gone');
    check('no other cell is marked', host.querySelectorAll('td.twm-dt-cell--error').length, 2);
    check('every staged value stays', table.getStagedEdits().length, N);
    ok('…drawn staged, the failing ones included', c7.classList.contains('twm-dt-cell--staged')
        && host.querySelectorAll('td.twm-dt-cell--staged').length === N);
    check('…and the rows are not written', rows[7][2], '');

    // Staging a refused cell again clears its mark.
    type(table, host, 7, 2, 'n7b');
    ok('a refused cell staged again is no longer marked', !cellAt(host, 7, 2).classList.contains('twm-dt-cell--error'));
    ok('…the other mark stays', cellAt(host, 190, 2).classList.contains('twm-dt-cell--error'));

    // A rejection marks every staged cell.
    answer = () => Promise.reject(new Error('Offline'));
    const r2 = await table.commit();
    check('a rejection resolves the refusal', r2.ok, false);
    check('…every staged cell marked with its message', host.querySelectorAll('td[data-error="Offline"]').length, N);
    check('…still staged', table.getStagedEdits().length, N);

    // While a commit is out, no editor opens and the ring does not move.
    let release;
    answer = () => new Promise((res) => { release = res; });
    const pending = table.commit();
    check('a second commit() while one is out is the same commit', table.commit() === pending, true);
    ok('no editor opens while a commit is out', !table.editCell(0, 0));
    ok('undo does nothing while a commit is out', !table.undo());
    ok('discard does nothing while a commit is out', !table.discard());
    release({ ok: true });
    const r3 = await pending;
    check('a success resolves {ok, committed}', r3, { ok: true, committed: N });
    check('onCommit was called once per commit()', calls.length, 3);
    check('the values are written into the rows', [rows[0][2], rows[7][2], rows[199][2]], ['n0', 'n7b', 'n199']);
    check('nothing is staged', table.getStagedEdits().length, 0);
    check('no cell is drawn staged or marked', host.querySelectorAll('td.twm-dt-cell--staged, td.twm-dt-cell--error').length, 0);
    check('the cells show the committed values', cellAt(host, 199, 2).textContent, 'n199');
    ok('the ring is empty: Ctrl+Z after a commit does nothing', !table.undo() && !table.redo());
    check('…and stages nothing', table.getStagedEdits().length, 0);
    check('commit() with nothing staged calls nothing', [await table.commit(), calls.length], [{ ok: true, committed: 0 }, 3]);

    // discard()
    type(table, host, 3, 0, 'gone');
    type(table, host, 4, 0, 'too');
    ok('discard() reports it dropped something', table.discard());
    check('discard() clears every staged cell', table.getStagedEdits(), []);
    check('…and the cells show their rows again', [cellAt(host, 3, 0).textContent, cellAt(host, 4, 0).textContent], ['r3', 'r4']);
    ok('…and the ring', !table.undo());
}
{
    // An open editor's value is part of the batch; an onCommit that throws refuses.
    const rows = fresh();
    let got = null;
    const { host, table } = mount({
        headers, rows, pagination: false, selectionMode: 'cells', editable: true, staged: true,
        onCommit: ({ edits }) => { got = edits; },
    });
    table.editCell(0, 0);
    editorIn(host).value = 'apricot';
    const r = await table.commit();
    check('commit() stages the open editor\'s value first and sends it', [r.ok, got?.map((e) => e.value)], [true, ['apricot']]);
    check('a synchronous success writes the row', rows[0][0], 'apricot');

    const { host: h2, table: t2 } = mount({
        headers, rows: fresh(), pagination: false, selectionMode: 'cells', editable: true, staged: true,
        onCommit: () => { throw new Error('boom'); },
    });
    type(t2, h2, 0, 0, 'x');
    const r2 = await t2.commit();
    ok('a throw is a refusal that marks the cells', !r2.ok && cellAt(h2, 0, 0).getAttribute('data-error') === 'boom');
    t2.setData({ rows: fresh() });
    t2.render();
    check('new rows drop the staged cells', t2.getStagedEdits(), []);
    ok('…and the ring', !t2.undo());
}

section('§3 sort, filter and paging are frozen while cells are staged');
{
    const rows = Array.from({ length: 30 }, (_, i) => [`n${String(i).padStart(2, '0')}`, 30 - i, 'x']);
    const { host, table } = mount({
        headers, rows, pagination: true, pageSize: 10, sortable: true, filterable: true,
        showExportButton: true, selectionMode: 'cells', editable: true, staged: true,
        stagedRefusal: (n) => `Held: ${n} unsaved`,
    });
    const shown = () => table.getDisplayedRows().slice(0, 3).map((r) => r[0]);
    const before = shown();
    const prev = () => host.querySelector('.twm-pagination-controls button[data-tooltip="Previous page"]');
    ok('before staging no control is refused', !host.querySelector('[data-refusal]'));
    ok('…Previous is off on the first page, as always', prev().disabled);

    type(table, host, 0, 0, 'edited');
    const ths = [...host.querySelectorAll('th.sortable')];
    ok('every sortable header says why', ths.length === 3 && ths.every((th) => th.getAttribute('data-refusal') === 'Held: 1 unsaved'));
    const filterInputs = [...host.querySelectorAll('.twm-data-table__filter-input')];
    ok('every filter box is disabled with the reason', filterInputs.length === 3
        && filterInputs.every((i) => i.disabled && i.getAttribute('data-refusal') === 'Held: 1 unsaved'));
    ok('…and its filter buttons', [...host.querySelectorAll('.twm-data-table__filter-dropdown-btn')].every((b) => b.disabled && b.dataset.refusal));
    const pagerButtons = [...host.querySelectorAll('.twm-pagination-controls button:not(.twm-pagination-btn--export)')];
    ok('every pager button is disabled with the reason', pagerButtons.length >= 5
        && pagerButtons.every((b) => b.disabled && b.getAttribute('data-refusal') === 'Held: 1 unsaved'));
    ok('…and Next says why on its tooltip', host.querySelector('.twm-pagination-controls button[data-tooltip="Held: 1 unsaved"]'));
    const exportBtn = host.querySelector('.twm-pagination-controls .twm-pagination-btn--export');
    ok('the export button moves no rows and is not held', exportBtn && !exportBtn.disabled && !exportBtn.dataset.refusal);
    ok('the wrapper is marked frozen', host.querySelector('.twm-data-table-component.twm-dt--frozen'));

    quiet(() => click(ths[1]));
    check('a click on a header does not sort', shown(), before);
    const [, warned] = quiet(() => {
        table.sortBy(1, true);
        table.setFilter(0, 'n1');
        table.clearFilters();
        table.goToPage(2);
        table.goToRow(25);
    });
    check('sortBy, setFilter, clearFilters, goToPage and goToRow all refuse', shown(), before);
    check('…on the first page still', table._state.offset, 0);
    ok('…each out loud', warned.length === 5 && warned.every((w) => w.includes('Held: 1 unsaved')));
    const next = host.querySelector('.twm-pagination-controls button[data-tooltip="Held: 1 unsaved"]');
    quiet(() => next.dispatchEvent(new T.window.MouseEvent('click', { bubbles: true })));
    check('a synthetic click on a held pager button turns no page', table._state.offset, 0);

    type(table, host, 1, 0, 'more');
    ok('the reason follows the count', host.querySelector('th.sortable').getAttribute('data-refusal') === 'Held: 2 unsaved');
    table.undo();
    table.undo();
    ok('undone to nothing staged: no control is refused', !host.querySelector('[data-refusal]'));
    ok('…the filter boxes are back', [...host.querySelectorAll('.twm-data-table__filter-input')].every((i) => !i.disabled));
    ok('…Previous is off again on the first page, as it was', prev().disabled);
    const nextBtn = host.querySelector('.twm-pagination-controls button[data-tooltip="Next page"]');
    ok('…and Next is on again', nextBtn && !nextBtn.disabled && !nextBtn.hasAttribute('aria-disabled'));
    check('…with its own title back', nextBtn.getAttribute('title'), null);
    table.sortBy(1, true);
    check('sorting works again', table.getDisplayedRows()[0][1], 1);

    // A render while frozen draws the new controls held.
    type(table, host, 0, 2, 'y');
    table.render();
    ok('a render while cells are staged draws its controls held',
       [...host.querySelectorAll('th.sortable')].every((th) => th.dataset.refusal));
    table.discard();
    ok('discard lifts the freeze', !host.querySelector('[data-refusal]'));
}
{
    // The default reason, and the `paging` strip.
    const rows = Array.from({ length: 20 }, (_, i) => [`n${i}`, i, 'x']);
    const pages = [];
    const { host, table } = mount({
        headers, rows, selectionMode: 'cells', editable: true, staged: true,
        paging: { mode: 'pages', pageSize: 20, total: 100, offset: 0, hasMore: true, onPage: (o) => { pages.push(o); } },
    });
    type(table, host, 0, 0, 'z');
    const strip = [...host.querySelectorAll('.twm-dt-paging button')];
    ok('the paging strip\'s buttons are held', strip.length > 0 && strip.every((b) => b.disabled && b.dataset.refusal));
    check('the default reason', strip[0].dataset.refusal,
          'Sorting, filtering and paging are held while 1 change is not committed. Commit or discard them first.');
    quiet(() => table._pagingCall('page', (o) => pages.push(o), 20));
    check('a paging call refuses', pages, []);
    table.setPaging({ offset: 0 });
    ok('a strip drawn again is held too', [...host.querySelectorAll('.twm-dt-paging button')].every((b) => b.dataset.refusal));
    table.discard();
    ok('discard lifts it', [...host.querySelectorAll('.twm-dt-paging button')].every((b) => !b.dataset.refusal));
}

section('§4 the ring: historyLimit entries, each a delta');
{
    const { host, table } = mount({
        headers, rows: fresh(), pagination: false, selectionMode: 'cells', editable: true, staged: true,
        historyLimit: 3,
    });
    const values = ['a', 'b', 'c', 'd', 'e'];
    values.forEach((v) => type(table, host, 0, 0, v));
    let undone = 0;
    while (table.undo()) undone++;
    check('historyLimit: 3 keeps the last 3 entries', undone, 3);
    check('…so the cell stands at the value staged before them', cellAt(host, 0, 0).textContent, 'b');

    const { host: h2, table: t2 } = mount({
        headers, rows: Array.from({ length: 120 }, (_, i) => [`r${i}`, i, '']),
        pagination: false, selectionMode: 'cells', editable: true, staged: true,
    });
    for (let i = 0; i < 120; i++) type(t2, h2, i, 2, `v${i}`);
    const ring = t2._cellGrid.staged.history;
    check('the default keeps 100', ring.depth, 100);
    const entry = ring.undoStack.at(-1);
    check('an entry is one cell\'s before/after delta', entry,
          { action: 'cell:stage', row: 119, col: 2, before: { has: false, value: null }, after: { has: true, value: 'v119' } });
    ok('no entry is a snapshot of the staged cells', ring.undoStack.every((e) => JSON.stringify(e).length < 200));
    let n = 0;
    while (t2.undo()) n++;
    check('100 undos, then none', n, 100);
    check('the 20 edits past the limit stay staged', t2.getStagedEdits().map((e) => e.rowIdx), [...Array(20).keys()]);
}

section('§5 without `staged`');
{
    const sent = [];
    const { host, table } = mount({
        headers, rows: fresh(), pagination: true, pageSize: 2, sortable: true,
        selectionMode: 'cells', editable: true, onCellCommit: (c) => { sent.push(c); },
    });
    type(table, host, 0, 0, 'apricot');
    check('a commit goes to onCellCommit, as in STORY-0003', sent.length, 1);
    ok('no cell is drawn staged', !host.querySelector('.twm-dt-cell--staged'));
    ok('no control is refused', !host.querySelector('[data-refusal]'));
    ctrl(table, 'z');
    check('Ctrl+Z changes nothing', cellAt(host, 0, 0).textContent, 'apricot');
    check('commit() has nothing to commit', await table.commit(), { ok: false, errors: [] });
    check('getStagedEdits is empty', table.getStagedEdits(), []);
    ok('undo, redo, discard do nothing', !table.undo() && !table.redo() && !table.discard());

    const [, warned] = quiet(() => mount({ headers, rows: fresh(), staged: true }));
    ok('`staged` without cell mode is ignored with a warning', warned.some((w) => w.includes('`staged` needs `editable`')));
    const [, warned2] = quiet(() => mount({ headers, rows: fresh(), selectionMode: 'cells', staged: true }));
    ok('…and without `editable`', warned2.some((w) => w.includes('`staged` needs `editable`')));
}

await tick();
done();
