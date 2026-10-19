/**
 * STORY-0003 `editable` / `editors` / `onCellCommit` — ONE CELL EDITED, AND
 * CLOSED EXACTLY ONCE.
 *
 *   §1  F2, Enter, a double-click and a printable key open the editor on the
 *       cursor cell (the default: a text box; a printable key starts it with
 *       that character)
 *   §2  Enter commits and moves down, Tab commits and moves right; a commit
 *       calls onCellCommit({rowIdx, colIdx, value, previous}) exactly once,
 *       and the cell shows the value
 *   §3  Escape restores the original value and calls nothing — not even after
 *       the blur its own repaint causes in a browser
 *   §4  `editors` by column index and by type; the factory's arguments; an
 *       editor that commits itself
 *   §5  onCellCommit resolving {ok:false, error}, or rejecting, leaves the
 *       typed value in the cell marked with the message; a later good commit
 *       clears the mark
 *   §6  a non-editable column (array or function `editable`) opens no editor
 *   §7  setData / render() while an editor is open do not destroy it: the
 *       redraw runs after the commit or the cancel
 *
 * Against 0.16, every section fails (there is no editing).
 *
 *     node tests/cell_editor.test.mjs
 */
import { dataTableEnv } from './dt_env.mjs';

const T = await dataTableEnv('cell editor');
const { check, ok, section, mount, bodyRows, click, doubleClick, key, tick, done, window } = T;

const headers = ['Name', 'Qty', 'Note'];
const fresh = () => [['apple', 3, 'red'], ['pear', 5, 'green'], ['plum', 7, 'blue']];
const cellAt = (host, r, c) => bodyRows(host)[r].children[c];
const editorIn = (host) => host.querySelector('td.twm-dt-cell--editing .twm-dt-editor');
const focusOf = (table) => {
    const f = table.getCellSelection().focus;
    return f ? [f.row, f.col] : null;
};
/** The table element of the newest table, read each time: a render replaces it. */
let current = null;
const tbl = () => current._tableEl;
const edit = (extra = {}) => {
    const commits = [];
    const rows = fresh();
    const m = mount({
        headers, rows, selectionMode: 'cells', editable: true, pagination: false,
        onCellCommit: (c) => { commits.push(c); },
        ...extra,
    });
    current = m.table;
    return { ...m, rows, commits };
};

section('§1 what opens the editor');
{
    const { host, table } = edit();
    click(cellAt(host, 0, 0));
    key(tbl(), 'F2');
    let input = editorIn(host);
    ok('F2 opens a text box in the cursor cell', input && cellAt(host, 0, 0).contains(input));
    check('…holding the value', input?.value, 'apple');
    ok('…and focused', T.document.activeElement === input);
    check('isEditing', table.isEditing(), true);
    key(input, 'Escape');
    ok('closed', !editorIn(host) && !table.isEditing());

    key(tbl(), 'Enter');
    ok('Enter opens it', !!editorIn(host));
    key(editorIn(host), 'Escape');

    doubleClick(cellAt(host, 1, 2));
    input = editorIn(host);
    ok('a double-click opens it on the cell double-clicked', input && cellAt(host, 1, 2).contains(input));
    check('…which is the cursor now', focusOf(table), [1, 2]);
    key(input, 'Escape');

    const ev = new window.KeyboardEvent('keydown', { key: 'q', bubbles: true, cancelable: true });
    tbl().dispatchEvent(ev);
    input = editorIn(host);
    ok('a printable key opens it', !!input);
    check('…starting with that character in place of the value', input?.value, 'q');
    ok('…and the key is not typed a second time', ev.defaultPrevented);
    key(input, 'Escape');
    key(tbl(), 'a', { ctrlKey: true });
    ok('Ctrl+A is not a printable key', !editorIn(host));
    table.dispose();
}

section('§2 Enter, Tab, and exactly one commit');
{
    const { host, table, commits, rows } = edit();
    click(cellAt(host, 0, 0));
    key(tbl(), 'F2');
    let input = editorIn(host);
    input.value = 'apricot';
    key(input, 'Enter');
    check('Enter commits once, with the value and what it was',
          commits, [{ rowIdx: 0, colIdx: 0, value: 'apricot', previous: 'apple' }]);
    check('…and moves the cursor down', focusOf(table), [1, 0]);
    check('the cell shows the value', cellAt(host, 0, 0).textContent, 'apricot');
    check('the row holds it', rows[0][0], 'apricot');
    ok('the editor is gone', !editorIn(host));
    // What a browser does next: the input taken out of the document blurs.
    input.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true }));
    key(input, 'Enter');
    check('a late blur and a second Enter commit nothing more', commits.length, 1);
    ok('the keyboard is the table\'s again', T.document.activeElement === tbl());

    key(tbl(), 'F2');
    input = editorIn(host);
    input.value = '6';
    key(input, 'Tab');
    check('Tab commits', commits.at(-1), { rowIdx: 1, colIdx: 0, value: '6', previous: 'pear' });
    check('…and moves right', focusOf(table), [1, 1]);

    key(tbl(), 'F2');
    key(editorIn(host), 'Enter');
    check('an editor left as it was commits nothing', commits.length, 2);
    check('…and Enter still moves down', focusOf(table), [2, 1]);
    check('a number cell left alone keeps its number', rows[1][1], 5);

    key(tbl(), 'F2');
    input = editorIn(host);
    input.value = 'seven';
    input.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true, relatedTarget: T.document.body }));
    check('focus leaving the editor commits, once', commits.at(-1)?.value, 'seven');
    check('…without moving', focusOf(table), [2, 1]);
    check('three commits in all', commits.length, 3);

    key(tbl(), 'F2');
    input = editorIn(host);
    key(input, 'ArrowDown');
    key(input, 'a', { ctrlKey: true });
    ok('the table\'s keys are not the editor\'s', table.isEditing() && focusOf(table)[0] === 2);
    key(input, 'Escape');
    table.dispose();
}

section('§3 Escape');
{
    const { host, table, commits, rows } = edit();
    click(cellAt(host, 2, 2));
    key(tbl(), 'F2');
    const input = editorIn(host);
    input.value = 'something else';
    key(input, 'Escape');
    input.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true }));
    check('Escape calls nothing, even after the blur its repaint causes', commits, []);
    check('the cell shows its original value', cellAt(host, 2, 2).textContent, 'blue');
    check('the row is untouched', rows[2][2], 'blue');
    ok('the cell is no longer marked editing', !cellAt(host, 2, 2).classList.contains('twm-dt-cell--editing'));
    check('the cursor stays', focusOf(table), [2, 2]);
    table.dispose();
}

section('§4 editors');
{
    const asked = [];
    const made = [];
    const { host, table, commits } = edit({
        columnTypes: [null, 'num', null],
        editors: {
            2: (a) => {
                asked.push({ ...a, commit: typeof a.commit, cancel: typeof a.cancel });
                const sel = T.document.createElement('select');
                for (const v of ['red', 'green', 'blue']) {
                    const o = T.document.createElement('option');
                    o.value = v; o.textContent = v; sel.appendChild(o);
                }
                sel.value = a.value;
                sel.className = 'my-editor';
                made.push(sel);
                return sel;
            },
            num: ({ value, commit }) => {
                const b = T.document.createElement('button');
                b.className = 'num-editor';
                b.textContent = String(value);
                b.addEventListener('click', () => commit(Number(value) + 1));
                return { el: b };
            },
        },
    });
    click(cellAt(host, 0, 2));
    key(tbl(), 'F2');
    const sel = host.querySelector('select.my-editor');
    ok('the editor for column 2 is the consumer\'s', !!sel && cellAt(host, 0, 2).contains(sel));
    check('it is asked with the cell', {
        value: asked[0].value, rowIdx: asked[0].rowIdx, colIdx: asked[0].colIdx,
        row: asked[0].row, column: asked[0].column, initialText: asked[0].initialText,
        commit: asked[0].commit, cancel: asked[0].cancel,
    }, {
        value: 'red', rowIdx: 0, colIdx: 2, row: ['apple', 3, 'red'],
        column: { index: 2, header: 'Note', type: 'text' }, initialText: null,
        commit: 'function', cancel: 'function',
    });
    sel.value = 'green';
    key(sel, 'Enter');
    check('Enter commits the element\'s value', commits.at(-1), { rowIdx: 0, colIdx: 2, value: 'green', previous: 'red' });

    table.setCellSelection({ row: 0, col: 1 });
    key(tbl(), 'F2');
    const btn = host.querySelector('button.num-editor');
    ok('the editor for the type is used for a column of that type', !!btn);
    key(btn, 'Enter');
    ok('an editor with no value is not committed by Enter', table.isEditing());
    click(btn);
    check('it commits itself', commits.at(-1), { rowIdx: 0, colIdx: 1, value: 4, previous: 3 });
    ok('…and is closed', !table.isEditing());
    check('the cursor did not move', focusOf(table), [0, 1]);

    table.setCellSelection({ row: 0, col: 0 });
    key(tbl(), 'F2');
    ok('a column with no editor of its own gets the text box', !!editorIn(host));
    key(editorIn(host), 'Escape');
    table.dispose();
}

section('§5 a refused commit');
{
    let answer = { ok: false, error: 'Too long' };
    const commits = [];
    const { host, table, rows } = edit({
        onCellCommit: (c) => { commits.push(c); return Promise.resolve(answer); },
    });
    click(cellAt(host, 0, 0));
    key(tbl(), 'F2');
    let input = editorIn(host);
    input.value = 'apple pie with cream';
    key(input, 'Enter');
    const td = () => cellAt(host, 0, 0);
    check('while it is out the typed value is drawn', td().textContent, 'apple pie with cream');
    ok('…marked pending', td().classList.contains('twm-dt-cell--pending'));
    await tick();
    check('refused ({ok:false}): the typed value stays in the cell', td().textContent, 'apple pie with cream');
    ok('…marked as refused', td().classList.contains('twm-dt-cell--error'));
    check('…with the message', [td().title, td().getAttribute('data-error')], ['Too long', 'Too long']);
    check('the row was not changed', rows[0][0], 'apple');
    table.render();
    ok('the mark survives a render', td().classList.contains('twm-dt-cell--error')
        && td().textContent === 'apple pie with cream');
    check('one call', commits.length, 1);

    // A rejection is a refusal too.
    table.setCellSelection({ row: 1, col: 2 });
    table.config.onCellCommit = () => Promise.reject(new Error('Server down'));
    key(tbl(), 'F2');
    input = editorIn(host);
    input.value = 'teal';
    key(input, 'Enter');
    await tick();
    const td2 = cellAt(host, 1, 2);
    check('a rejection leaves the typed value', td2.textContent, 'teal');
    check('…marked with its message', td2.getAttribute('data-error'), 'Server down');

    // A synchronous throw, the same.
    table.config.onCellCommit = () => { throw new Error('No'); };
    table.setCellSelection({ row: 2, col: 2 });
    key(tbl(), 'F2');
    input = editorIn(host);
    input.value = 'navy';
    key(input, 'Enter');
    check('a throw is refused at once', cellAt(host, 2, 2).getAttribute('data-error'), 'No');

    // Fixing the first cell clears its mark, and only its mark.
    answer = { ok: true };
    table.config.onCellCommit = (c) => { commits.push(c); return Promise.resolve(answer); };
    table.setCellSelection({ row: 0, col: 0 });
    key(tbl(), 'F2');
    input = editorIn(host);
    input.value = 'apple pie';
    key(input, 'Enter');
    await tick();
    ok('a good commit clears the cell\'s mark', !td().classList.contains('twm-dt-cell--error')
        && !td().hasAttribute('data-error'));
    check('…draws the value', td().textContent, 'apple pie');
    check('…and writes it into the row', rows[0][0], 'apple pie');
    ok('the other marks stay', cellAt(host, 1, 2).classList.contains('twm-dt-cell--error'));
    table.setData({ rows: fresh() });
    ok('new rows: the marks were about the old ones', !host.querySelector('.twm-dt-cell--error'));
    table.dispose();
}

section('§6 a column that is not editable');
{
    const { host, table, commits } = edit({ editable: [1] });
    click(cellAt(host, 0, 0));
    key(tbl(), 'F2');
    key(tbl(), 'Enter');
    key(tbl(), 'x');
    doubleClick(cellAt(host, 0, 2));
    ok('editable: [1] — column 0 and 2 open no editor', !editorIn(host) && !table.isEditing());
    check('…and nothing was committed', commits, []);
    check('table.editCell refuses too', table.editCell(0, 0), false);
    check('column 1 opens', table.editCell(0, 1), true);
    key(editorIn(host), 'Escape');
    table.dispose();

    const fn = edit({ editable: (colIdx, row) => row[0] !== 'pear' });
    click(cellAt(fn.host, 1, 0));
    key(tbl(), 'F2');
    ok('a function decides per cell: the pear row is read-only', !editorIn(fn.host));
    click(cellAt(fn.host, 0, 0));
    key(tbl(), 'F2');
    ok('…the apple row is not', !!editorIn(fn.host));
    fn.table.dispose();
}

section('§7 a redraw waits for the editor');
{
    const rendered = [];
    const { host, table, commits } = edit({ onRender: () => rendered.push(1) });
    click(cellAt(host, 1, 0));
    key(tbl(), 'F2');
    const input = editorIn(host);
    input.value = 'half-typ';
    const before = rendered.length;
    table.setData({ rows: [['fig', 1, 'x'], ['kiwi', 2, 'y'], ['lime', 3, 'z'], ['date', 4, 'w']] });
    ok('setData while editing: the editor is still in the document', input.isConnected && editorIn(host) === input);
    check('…the typed text is still there', input.value, 'half-typ');
    check('…and nothing was drawn yet', rendered.length, before);
    table.render();
    ok('render() while editing does not destroy it either', input.isConnected);
    input.value = 'half-typed';
    key(input, 'Enter');
    check('the commit is the cell that was opened', commits.at(-1), { rowIdx: 1, colIdx: 0, value: 'half-typed', previous: 'pear' });
    check('the redraw ran once the editor closed', rendered.length, before + 1);
    check('…drawing the new rows', bodyRows(host).length, 4);
    check('…without the old commit written into them', cellAt(host, 1, 0).textContent, 'kiwi');

    key(tbl(), 'F2');
    const again = editorIn(host);
    table.render();
    ok('again open across a render', again.isConnected);
    key(again, 'Escape');
    check('a cancel runs the waiting redraw too', rendered.length, before + 2);
    table.dispose();
    ok('dispose with an editor open leaves nothing behind', !host.querySelector('.twm-dt-editor'));
}
{
    // A commit that settles while the NEXT editor is open in the same row —
    // save, Tab, type: the spreadsheet's own rhythm. The settle must not
    // rebuild the row out from under the open editor.
    const settle = [];
    const commits = [];
    const { host, table, rows } = edit({
        onCellCommit: (c) => {
            commits.push(c);
            return new Promise((resolve) => settle.push(resolve));
        },
    });
    click(cellAt(host, 0, 1));
    key(tbl(), 'F2');
    const first = editorIn(host);
    first.value = 'NEW';
    key(first, 'Tab');
    check('Tab moved the cursor right', focusOf(table), [0, 2]);
    ok('the first commit is out', cellAt(host, 0, 1).classList.contains('twm-dt-cell--pending'));
    key(tbl(), 'F2');
    const second = editorIn(host);
    second.value = 'typing';
    settle.shift()({ ok: true });
    await tick();
    ok('the first commit settling leaves the open editor in the document',
        second.isConnected && editorIn(host) === second);
    check('…with its text', second.value, 'typing');
    ok('…while the settled cell loses its pending mark', !cellAt(host, 0, 1).classList.contains('twm-dt-cell--pending'));
    check('…and the value is in the row', rows[0][1], 'NEW');
    key(second, 'Enter');
    check('the open editor commits once, its own cell', commits.slice(1),
        [{ rowIdx: 0, colIdx: 2, value: 'typing', previous: 'red' }]);
    settle.shift()({ ok: true });
    await tick();
    check('both cells drawn', [cellAt(host, 0, 1).textContent, cellAt(host, 0, 2).textContent], ['NEW', 'typing']);
    ok('no mark left', !host.querySelector('.twm-dt-cell--pending, .twm-dt-cell--error'));
    ok('the table is not left editing', !table.isEditing());
    table.setData({ rows: fresh() });
    check('…and still draws new rows', cellAt(host, 0, 1).textContent, '3');
    table.dispose();
}
{
    // Refused while the next editor is open in the row: the mark is painted
    // on the refused cell at once, and the editor stays.
    let settle = null;
    const { host, table } = edit({
        onCellCommit: () => new Promise((resolve) => { settle = resolve; }),
    });
    click(cellAt(host, 1, 0));
    key(tbl(), 'F2');
    const first = editorIn(host);
    first.value = 'bad';
    key(first, 'Tab');
    key(tbl(), 'F2');
    const second = editorIn(host);
    second.value = 'keep';
    settle({ ok: false, error: 'Nope' });
    await tick();
    ok('a refusal settling leaves the open editor in place', second.isConnected && second.value === 'keep');
    check('…and marks the refused cell now', cellAt(host, 1, 0).getAttribute('data-error'), 'Nope');
    key(second, 'Escape');
    check('after the cancel the row is drawn, the mark still on',
        [cellAt(host, 1, 0).textContent, cellAt(host, 1, 0).getAttribute('data-error'), cellAt(host, 1, 1).textContent],
        ['bad', 'Nope', '5']);
    table.dispose();
}

done();
