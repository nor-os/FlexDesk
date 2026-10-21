/**
 * STORY-0087 — DataTable's SIX BUILT-IN CELL EDITORS, in the table.
 *
 *   §1  each opens on its column type and commits a value of that type:
 *       text, multitext (Enter is a new line, Ctrl+Enter commits), number ->
 *       Number, bool -> true/false, choice -> the option's value, datetime ->
 *       Date; a value left as it was commits nothing
 *   §2  number reads '1.234,56' and '1,234.56' by the `locale` option, and
 *       opens in it; datetime reads '31/12/2026' and ISO
 *   §3  'abc' in a number is refused with a message on the cell and nothing
 *       is committed — on Enter (the editor stays open), and when the focus
 *       leaves (the cell keeps the text, marked)
 *   §4  choice offers the column's `options` through AutocompleteField; a
 *       value not in them is refused unless `allowOther`
 *   §5  an injected editor for a type replaces the built-in one for that
 *       type only
 *   §6  under `staged` (STORY-0088) a refused text stages nothing, and a
 *       value staged in the cell afterwards ends the refusal
 *
 * Against 0.16 every section fails (there is no editing); against STORY-0003
 * alone every column opens the text box and commits text.
 *
 *     node tests/cell_editors.test.mjs
 */
import { dataTableEnv } from './dt_env.mjs';

const T = await dataTableEnv('cell editors');
const { check, ok, section, mount, bodyRows, click, key, tick, done, window, document } = T;
const { AutocompleteField } = await import('../src/ui/components/autocomplete_field.js');

const headers = ['Name', 'Notes', 'Qty', 'Done', 'Colour', 'When'];
const COLOURS = [{ value: 'r', label: 'Red' }, { value: 'g', label: 'Green' }, { value: 'b', label: 'Blue' }];
const fresh = () => [
    ['apple', 'crisp', 3, false, 'r', new Date(2026, 0, 15)],
    ['pear', 'soft', 1234.5, true, 'g', new Date(2026, 5, 1, 9, 30)],
    ['plum', '', 7, false, null, null],
];
const cellAt = (host, r, c) => bodyRows(host)[r].children[c];
const editing = (host) => host.querySelector('td.twm-dt-cell--editing');
let current = null;
const tbl = () => current._tableEl;
const focusOf = () => {
    const f = current.getCellSelection().focus;
    return f ? [f.row, f.col] : null;
};
const type = (el, text) => {
    el.value = text;
    el.dispatchEvent(new window.Event('input', { bubbles: true }));
};
const edit = (extra = {}) => {
    const commits = [];
    const rows = fresh();
    const m = mount({
        headers, rows, selectionMode: 'cells', editable: true, pagination: false,
        columnTypes: [null, null, null, null, null, 'date'],
        editTypes: [null, 'multitext', null, 'bool', { type: 'choice', options: COLOURS }, null],
        onCellCommit: (c) => { commits.push(c); },
        ...extra,
    });
    current = m.table;
    return { ...m, rows, commits };
};
const open = (host, r, c) => {
    current.setCellSelection({ row: r, col: c });
    key(tbl(), 'F2');
    return editing(host);
};

section('§1 each opens on its column type and commits that type');
{
    const { host, table, commits, rows } = edit();
    // text
    let td = open(host, 0, 0);
    let input = td.querySelector('input');
    ok('Name (text) opens the text box', input && input.type === 'text' && input.classList.contains('twm-dt-editor'));
    type(input, 'kiwi');
    key(input, 'Enter');
    check('…and commits text', commits.at(-1), { rowIdx: 0, colIdx: 0, value: 'kiwi', previous: 'apple' });

    // multitext
    td = open(host, 0, 1);
    const area = td.querySelector('textarea.twm-dt-editor--multitext');
    ok('Notes (multitext) opens a text area', !!area);
    type(area, 'line one');
    const enter = new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    area.dispatchEvent(enter);
    ok('Enter is a new line there: not taken, not committed', !enter.defaultPrevented && table.isEditing());
    type(area, 'line one\nline two');
    key(area, 'Enter', { ctrlKey: true });
    check('Ctrl+Enter commits the text', commits.at(-1), { rowIdx: 0, colIdx: 1, value: 'line one\nline two', previous: 'crisp' });
    check('…and moves down', focusOf(), [1, 1]);

    // number
    td = open(host, 0, 2);
    input = td.querySelector('input.twm-dt-editor--number');
    ok('Qty (detected num) opens the number editor, a text box', input && input.type === 'text');
    type(input, '42');
    key(input, 'Enter');
    check('…and commits a Number', [commits.at(-1).value, typeof commits.at(-1).value], [42, 'number']);
    check('the row holds the Number', rows[0][2], 42);

    // bool
    td = open(host, 0, 3);
    const box = td.querySelector('input[type="checkbox"].twm-dt-editor--bool');
    ok('Done (bool) opens a checkbox', !!box);
    check('…showing the value', box.checked, false);
    box.click();
    check('ticking it commits true', commits.at(-1), { rowIdx: 0, colIdx: 3, value: true, previous: false });
    ok('…and closes it', !table.isEditing());
    td = open(host, 1, 3);
    key(td.querySelector('input'), 'Enter');
    check('left as it was, Enter commits nothing', commits.length, 4);
    current.setCellSelection({ row: 2, col: 3 });
    key(tbl(), ' ');
    const spaced = editing(host)?.querySelector('input[type="checkbox"]');
    check('a space opens it ticked over', spaced?.checked, true);
    key(spaced, 'Enter');
    check('…and Enter commits true', [commits.at(-1).value, commits.at(-1).rowIdx], [true, 2]);
    td = open(host, 1, 3);
    td.querySelector('input').click();
    check('unticking commits false', [commits.at(-1).value, typeof commits.at(-1).value], [false, 'boolean']);

    // choice
    td = open(host, 0, 4);
    const acInput = td.querySelector('.twm-autocomplete-field__input');
    ok('Colour (choice) opens an AutocompleteField', !!acInput && td.querySelector('.twm-autocomplete-field'));
    check('…showing the option\'s label', acInput.value, 'Red');
    const items = [...document.querySelectorAll('.twm-autocomplete-field__dropdown.visible .twm-autocomplete-field__item')];
    check('…with every option offered', items.map((i) => i.querySelector('.twm-autocomplete-field__label').textContent), ['Red', 'Green', 'Blue']);
    items[2].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    check('picking one commits its value', commits.at(-1), { rowIdx: 0, colIdx: 4, value: 'b', previous: 'r' });
    ok('…closes the editor and takes the list off the page', !table.isEditing()
        && !document.querySelector('.twm-autocomplete-field__dropdown'));

    // datetime
    td = open(host, 0, 5);
    input = td.querySelector('input.twm-dt-editor--datetime');
    ok('When (date) opens the datetime editor, a text box', input && input.type === 'text');
    check('…showing the date as ISO', input.value, '2026-01-15');
    type(input, '2026-12-31');
    key(input, 'Enter');
    const d = commits.at(-1).value;
    ok('…and commits a Date', d instanceof Date);
    check('…that day', [d.getFullYear(), d.getMonth() + 1, d.getDate()], [2026, 12, 31]);
    const before = commits.length;
    td = open(host, 1, 5);
    check('a date with a time shows it', td.querySelector('input').value, '2026-06-01 09:30');
    key(td.querySelector('input'), 'Enter');
    check('left as it was, nothing is committed (not a new Date)', commits.length, before);
    table.dispose();
}

section('§2 number by `locale`; datetime as 31/12/2026 and ISO');
{
    let { host, table, commits } = edit({ locale: 'de-DE' });
    let input = open(host, 1, 2).querySelector('input');
    check('de-DE opens 1234.5 as 1234,5', input.value, '1234,5');
    type(input, '1.234,56');
    key(input, 'Enter');
    check("de-DE reads '1.234,56' as 1234.56", commits.at(-1).value, 1234.56);
    input = open(host, 0, 5).querySelector('input');
    type(input, '31.12.2026');
    key(input, 'Enter');
    const d = commits.at(-1).value;
    check("de-DE reads '31.12.2026'", [d instanceof Date, d.getFullYear(), d.getMonth() + 1, d.getDate()], [true, 2026, 12, 31]);
    table.dispose();

    ({ host, table, commits } = edit({ locale: 'en-US' }));
    input = open(host, 1, 2).querySelector('input');
    check('en-US opens 1234.5 as 1234.5', input.value, '1234.5');
    type(input, '1,234.56');
    key(input, 'Enter');
    check("en-US reads '1,234.56' as 1234.56", commits.at(-1).value, 1234.56);
    input = open(host, 0, 2).querySelector('input');
    type(input, '1.234,56');
    key(input, 'Enter');
    ok("…and refuses '1.234,56'", table.isEditing() && commits.length === 1);
    key(editing(host).querySelector('input'), 'Escape');
    table.dispose();

    ({ host, table, commits } = edit({ locale: 'en-GB' }));
    for (const [text, want] of [['31/12/2026', [2026, 12, 31, 0, 0]], ['2026-12-31T08:30', [2026, 12, 31, 8, 30]]]) {
        input = open(host, 0, 5).querySelector('input');
        type(input, text);
        key(input, 'Enter');
        const v = commits.at(-1)?.value;
        check(`datetime reads '${text}'`, v instanceof Date
            ? [v.getFullYear(), v.getMonth() + 1, v.getDate(), v.getHours(), v.getMinutes()] : v, want);
    }
    table.dispose();

    ({ host, table, commits } = edit({ dateTimeZone: 'UTC' }));
    input = open(host, 2, 5).querySelector('input');
    type(input, '2026-12-31');
    key(input, 'Enter');
    check('under dateTimeZone UTC a date is UTC midnight', commits.at(-1).value.toISOString(), '2026-12-31T00:00:00.000Z');
    table.dispose();
}

section('§3 a value that will not parse');
{
    const { host, table, commits, rows } = edit({ editorMessages: { datetime: 'Kein Datum' } });
    let td = open(host, 0, 2);
    let input = td.querySelector('input');
    type(input, 'abc');
    key(input, 'Enter');
    ok('Enter on \'abc\' in a number keeps the editor open', table.isEditing() && input.isConnected);
    ok('…the cell carries the message', td.classList.contains('twm-dt-cell--error')
        && td.getAttribute('data-error') === 'Not a number' && td.title === 'Not a number');
    check('…nothing is committed', commits.length, 0);
    check('…and the cursor stays', focusOf(), [0, 2]);
    key(input, 'Tab');
    ok('Tab is refused the same way', table.isEditing() && commits.length === 0 && focusOf().join() === '0,2');
    type(input, 'abc4');
    ok('typing takes the message off', !td.classList.contains('twm-dt-cell--error') && !td.hasAttribute('data-error'));
    key(input, 'Escape');
    check('Escape then restores the cell, and nothing was committed', [cellAt(host, 0, 2).textContent, commits.length, rows[0][2]], ['3', 0, 3]);
    ok('…unmarked', !cellAt(host, 0, 2).classList.contains('twm-dt-cell--error'));

    td = open(host, 1, 2);
    input = td.querySelector('input');
    type(input, 'abc');
    input.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true, relatedTarget: document.body }));
    ok('the focus leaving with \'abc\' closes the editor', !table.isEditing());
    check('…commits nothing', [commits.length, rows[1][2]], [0, 1234.5]);
    td = cellAt(host, 1, 2);
    check('…and the cell keeps the text, marked', [td.textContent, td.classList.contains('twm-dt-cell--error'), td.getAttribute('data-error')],
        ['abc', true, 'Not a number']);
    input = open(host, 1, 2).querySelector('input');
    check('opening it again edits what it shows', input.value, 'abc');
    type(input, '5');
    key(input, 'Enter');
    check('a good value commits, and the mark goes', [commits.at(-1)?.value, cellAt(host, 1, 2).classList.contains('twm-dt-cell--error')], [5, false]);

    input = open(host, 0, 5).querySelector('input');
    type(input, '31/02/2026');
    key(input, 'Enter');
    check('no 31 February, in the words given', [table.isEditing(), editing(host).getAttribute('data-error'), commits.length], [true, 'Kein Datum', 1]);
    key(editing(host).querySelector('input'), 'Escape');
    table.dispose();
}

section('§4 choice: the options through AutocompleteField; others refused unless allowOther');
{
    const made = [];
    const Orig = AutocompleteField.prototype.render;
    AutocompleteField.prototype.render = function render() { made.push(this); return Orig.call(this); };
    let { host, table, commits } = edit();
    let td = open(host, 2, 4);
    AutocompleteField.prototype.render = Orig;
    ok('the editor is an AutocompleteField', made.length === 1 && td.contains(made[0].root));
    let input = td.querySelector('input');
    check('an empty cell opens empty', input.value, '');
    type(input, 'gr');
    const shown = () => [...document.querySelectorAll('.twm-autocomplete-field__dropdown.visible .twm-autocomplete-field__label')].map((e) => e.textContent);
    check('typing filters the options', shown(), ['Green']);
    key(input, 'Enter');
    check('Enter on the list picks it and commits its value', commits.at(-1), { rowIdx: 2, colIdx: 4, value: 'g', previous: null });
    check('…moving down as Enter does', focusOf(), [2, 4]);   // the last row: it stays

    td = open(host, 0, 4);
    input = td.querySelector('input');
    type(input, 'Purple');
    check('a value in no option offers nothing', shown(), []);
    key(input, 'Enter');
    ok('…and Enter refuses it, the editor open', table.isEditing() && td.getAttribute('data-error') === 'Not one of the options');
    check('…nothing committed', commits.length, 1);
    type(input, 'blue');
    key(input, 'Escape');
    ok('Escape with the list open closes the list only', table.isEditing() && shown().length === 0);
    key(input, 'Enter');
    check('typed, the label (any case) commits its value', commits.at(-1), { rowIdx: 0, colIdx: 4, value: 'b', previous: 'r' });
    check('…and Enter moved down', focusOf(), [1, 4]);
    td = open(host, 1, 4);
    input = td.querySelector('input');
    type(input, '');
    key(input, 'Enter');
    check('an emptied box commits null', commits.at(-1).value, null);
    table.dispose();

    ({ host, table, commits } = edit({
        editTypes: { 4: { type: 'choice', options: COLOURS, allowOther: true } },
    }));
    td = open(host, 0, 4);
    input = td.querySelector('input');
    type(input, 'Purple');
    key(input, 'Enter');
    check('with allowOther the text is the value', commits.at(-1), { rowIdx: 0, colIdx: 4, value: 'Purple', previous: 'r' });
    table.dispose();
    ok('no list left on the page', !document.querySelector('.twm-autocomplete-field__dropdown'));
}

section('§5 an injected editor replaces the built-in one for its type only');
{
    const asked = [];
    const { host, table, commits } = edit({
        headers: [...headers, 'Price'],
        rows: fresh().map((r, i) => [...r, i + 0.5]),
        editors: {
            number: (a) => {
                asked.push(a.colIdx);
                const el = document.createElement('input');
                el.className = 'my-number';
                el.value = 'x';
                return { el, getValue: () => `mine:${el.value}` };
            },
        },
    });
    let td = open(host, 0, 2);
    ok('Qty (number) gets the consumer\'s editor', !!td.querySelector('input.my-number'));
    key(td.querySelector('input'), 'Enter');
    check('…which commits what it says', commits.at(-1).value, 'mine:x');
    td = open(host, 0, 6);
    ok('so does every number column (Price)', !!td.querySelector('input.my-number'));
    key(td.querySelector('input'), 'Escape');
    check('the factory was asked for both', asked, [2, 6]);
    td = open(host, 0, 5);
    ok('the datetime column keeps the built-in editor', !!td.querySelector('input.twm-dt-editor--datetime'));
    key(td.querySelector('input'), 'Escape');
    td = open(host, 0, 3);
    ok('…and so does the bool column', !!td.querySelector('input.twm-dt-editor--bool'));
    key(td.querySelector('input'), 'Escape');
    td = open(host, 0, 0);
    ok('…and the text column', !!td.querySelector('input.twm-dt-editor') && !td.querySelector('.my-number'));
    key(td.querySelector('input'), 'Escape');
    table.dispose();

    const byIdx = edit({ editors: { 4: () => { const s = document.createElement('select'); s.className = 'my-select'; return s; } } });
    td = open(byIdx.host, 0, 4);
    ok('by column index it replaces that column\'s only', !!td.querySelector('select.my-select'));
    key(td.querySelector('select'), 'Escape');
    td = open(byIdx.host, 0, 2);
    ok('…a number column still gets the built-in number editor', !!td.querySelector('input.twm-dt-editor--number'));
    key(td.querySelector('input'), 'Escape');
    byIdx.table.dispose();
}

section('§6 under `staged`: a refusal stages nothing, and a later value ends it');
{
    const { host, table, commits, rows } = edit({ staged: true, onCommit: () => ({ ok: true }) });
    let input = open(host, 0, 2).querySelector('input');
    type(input, 'abc');
    input.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true, relatedTarget: document.body }));
    let td = cellAt(host, 0, 2);
    check('the focus leaving with \'abc\' stages nothing', [table.getStagedEdits().length, commits.length, rows[0][2]], [0, 0, 3]);
    check('…and the cell keeps the text, marked', [td.textContent, td.classList.contains('twm-dt-cell--error')], ['abc', true]);
    input = open(host, 0, 2).querySelector('input');
    type(input, '5');
    key(input, 'Enter');
    td = cellAt(host, 0, 2);
    check('a good value is staged, and shown', [table.getStagedEdits().map((e) => e.value), td.textContent], [[5], '5']);
    ok('…and the mark goes', !td.classList.contains('twm-dt-cell--error') && !td.hasAttribute('data-error'));

    input = open(host, 1, 2).querySelector('input');
    type(input, 'abc');
    input.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true, relatedTarget: document.body }));
    input = open(host, 1, 2).querySelector('input');
    type(input, '1234.5');
    key(input, 'Enter');
    td = cellAt(host, 1, 2);
    check('the value the row holds, typed over a refusal, stages nothing and ends it',
        [table.getStagedEdits().length, td.classList.contains('twm-dt-cell--error'), td.textContent !== 'abc'], [1, false, true]);
    table.dispose();
}

await tick();
done();
