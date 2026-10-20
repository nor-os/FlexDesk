/**
 * STORY-0066 — STRUCTURAL EDITS FROM THE HEADERS: rename a column in place,
 * delete a column, add and delete rows, and the consumer's column action
 * buttons. The consumer owns the data: every edit is a call.
 *
 *   §1  renaming a column header calls onColumnRename with the new name
 *       (from the header menu, `renameColumn`, or a double-click on a table
 *       that does not sort), once
 *   §2  Escape cancels: nothing is called and the header is restored; so does
 *       a name left as it was, an empty one, or `{ok: false}`; the renamer's
 *       keys do not reach the page
 *   §3  "Delete column" calls onColumnDelete; "Add row" in the header menu
 *       calls onRowAdd(null); a row's menu inserts below and deletes it, after
 *       the consumer's own items
 *   §4  columnActions' buttons call onColumnAction and do not sort
 *   §5  with a placeholder column drawn, a rename lands on the right column
 *
 * Against 0.16, every section fails (there are no such options).
 *
 *     node tests/table_structure.test.mjs
 */
import { dataTableEnv } from './dt_env.mjs';

const T = await dataTableEnv('table structure');
const { check, ok, section, mount, bodyRows, click, doubleClick, key, tick, done, document } = T;

const headers = ['Id', 'Name', 'Score'];
const rows = [['a', 'Alpha', 1], ['b', 'Bravo', 2]];

const labelCells = (table) => [...table._headerTableEl.querySelector('thead > tr').children];
const menuOf = () => [...document.querySelectorAll('.data-context-menu')].find((m) => m.style.display !== 'none') || null;
const entries = (menu) => [...(menu?.children || [])].map((el) => (
    el.classList.contains('twm-context-menu__separator') ? '---' : el.querySelector('.label')?.textContent));
const rightClick = async (el) => {
    const ev = new T.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 });
    el.dispatchEvent(ev);
    await tick();
    return ev;
};
const choose = (menu, label) => {
    const item = [...menu.children].find((el) => el.querySelector('.label')?.textContent === label);
    click(item.querySelector('.label'));
};
const inputOf = (th) => th.querySelector('input.twm-dt-col-rename');
const labelText = (th) => th.querySelector('.twm-dt-col-label')?.textContent;
const settle = () => tick(5);

section('§1 renaming calls onColumnRename with the new name');
{
    const renamed = [];
    const { table } = mount({ headers, rows, sortable: true, onColumnRename: (c, name) => renamed.push([c, name]) });
    await rightClick(labelCells(table)[1]);
    check('the header menu offers the rename', entries(menuOf()), ['Rename column']);
    choose(menuOf(), 'Rename column');
    const th = labelCells(table)[1];
    const input = inputOf(th);
    ok('choosing it opens the inline renamer in that header', !!input);
    check('…holding the column\'s name', input?.value, 'Name');
    input.value = 'Label';
    key(input, 'Enter');
    await settle();
    check('Enter calls onColumnRename(colIdx, name) once', renamed, [[1, 'Label']]);
    ok('…the input is gone', !inputOf(th));
    check('…and the header shows the new name', labelText(th), 'Label');
    ok('the sort icon is still in the header', !!th.querySelector('.twm-sort-icon'));
    check('no column was sorted', table._state.sortColumn ?? null, null);

    check('renameColumn(colIdx) opens it from code', table.renameColumn(2), true);
    const score = inputOf(labelCells(table)[2]);
    score.value = 'Points';
    score.dispatchEvent(new T.window.Event('blur'));
    await settle();
    check('…and the focus leaving commits', renamed, [[1, 'Label'], [2, 'Points']]);
    check('renameColumn on a hidden or unknown column opens nothing', table.renameColumn(9), false);
    table.dispose();
}
{
    const renamed = [];
    const { table } = mount({ headers, rows, onColumnRename: (c, name) => renamed.push([c, name]) });
    doubleClick(labelCells(table)[0].querySelector('.twm-dt-col-label'));
    const input = inputOf(labelCells(table)[0]);
    ok('on a table that does not sort, a double-click on the label opens the renamer', !!input);
    input.value = 'Key';
    key(input, 'Enter');
    await settle();
    check('…and Enter renames', renamed, [[0, 'Key']]);
    table.dispose();
}
{
    const { table } = mount({ headers, rows, sortable: true, onColumnRename: () => {} });
    doubleClick(table._headerTableEl.querySelector('thead > tr').children[0].querySelector('.twm-dt-col-label'));
    ok('on a sortable table a double-click sorts, and opens no renamer',
       !table._headerTableEl.querySelector('input.twm-dt-col-rename'));
    table.dispose();
}

section('§2 Escape cancels');
{
    const renamed = [];
    let answer;
    const { host, table } = mount({ headers, rows, onColumnRename: (c, name) => { renamed.push([c, name]); return answer; } });
    const heard = [];
    document.addEventListener('keydown', (ev) => heard.push(ev.key));
    table.renameColumn(1);
    let input = inputOf(labelCells(table)[1]);
    input.value = 'Typed';
    key(input, 'Escape');
    await settle();
    check('Escape calls nothing', renamed, []);
    check('…restores the header', labelText(labelCells(table)[1]), 'Name');
    ok('…and closes the renamer', !inputOf(labelCells(table)[1]));
    check('…and the key did not reach the page', heard, []);

    table.renameColumn(1);
    input = inputOf(labelCells(table)[1]);
    key(input, 'Enter');
    await settle();
    check('the name left as it was calls nothing', renamed, []);
    check('…and the header keeps it', labelText(labelCells(table)[1]), 'Name');

    table.renameColumn(1);
    input = inputOf(labelCells(table)[1]);
    input.value = '   ';
    key(input, 'Enter');
    await settle();
    check('an empty name calls nothing', renamed, []);
    check('…and the header keeps its name', labelText(labelCells(table)[1]), 'Name');

    answer = { ok: false };
    table.renameColumn(1);
    input = inputOf(labelCells(table)[1]);
    input.value = 'Refused';
    key(input, 'Enter');
    await settle();
    check('a refusal was asked once', renamed, [[1, 'Refused']]);
    check('…and restores the old name', labelText(labelCells(table)[1]), 'Name');

    table.renameColumn(0);
    table.renameColumn(2);
    ok('opening a second renamer cancels the first',
       !inputOf(labelCells(table)[0]) && labelText(labelCells(table)[0]) === 'Id' && !!inputOf(labelCells(table)[2]));
    ok('the config\'s headers are the consumer\'s, untouched', table.config.headers.join() === headers.join());
    table.dispose();
    void host;
}

section('§3 deleting a column, adding and deleting rows');
{
    const calls = [];
    const { host, table } = mount({
        headers, rows, copyable: true,
        onColumnDelete: (c) => calls.push(['delCol', c]),
        onRowAdd: (r) => calls.push(['addRow', r]),
        onRowDelete: (r) => calls.push(['delRow', r]),
        contextMenuItems: [{ label: 'Open', action: 'open' }],
    });
    await rightClick(labelCells(table)[2]);
    check('the header menu: delete the column, add a row', entries(menuOf()), ['Delete column', 'Add row']);
    choose(menuOf(), 'Delete column');
    check('"Delete column" calls onColumnDelete(colIdx)', calls, [['delCol', 2]]);
    await rightClick(labelCells(table)[0]);
    choose(menuOf(), 'Add row');
    check('"Add row" calls onRowAdd(null)', calls.at(-1), ['addRow', null]);

    await rightClick(bodyRows(host)[1].children[1]);
    check('a row\'s menu: the consumer\'s items, then insert and delete, then copy',
          entries(menuOf()), ['Open', '---', 'Insert row below', 'Delete row', '---', 'Copy Row(s)', 'Copy as CSV']);
    choose(menuOf(), 'Insert row below');
    check('"Insert row below" calls onRowAdd(rowIdx)', calls.at(-1), ['addRow', 1]);
    await rightClick(bodyRows(host)[0].children[0]);
    choose(menuOf(), 'Delete row');
    check('"Delete row" calls onRowDelete(rowIdx)', calls.at(-1), ['delRow', 0]);
    check('the data is the consumer\'s, untouched', table.config.rows.length, 2);
    table.dispose();
}
{
    const calls = [];
    const { host, table } = mount({ headers, rows: [], onRowAdd: (r) => calls.push(r) });
    await rightClick(labelCells(table)[0]);
    choose(menuOf(), 'Add row');
    check('a table with no rows gets its first from the header', calls, [null]);
    table.dispose();
    void host;
}
{
    const { host, table } = mount({ headers, rows, copyable: false, onRowDelete: () => {} });
    await rightClick(bodyRows(host)[0].children[0]);
    check('without copy items or contextMenuItems, the row menu is just the delete', entries(menuOf()), ['Delete row']);
    table.dispose();
}

section('§4 the consumer\'s column action buttons');
{
    const acted = [];
    const { table } = mount({
        headers, rows, sortable: true,
        columnActions: (colIdx, ctx) => (colIdx === 0 ? [] : [{ action: 'pin', icon: 'push_pin', title: `Pin ${ctx.header}` }]),
        onColumnAction: (action, colIdx) => acted.push([action, colIdx]),
    });
    const buttons = labelCells(table).map((th) => th.querySelectorAll('.twm-dt-col-action').length);
    check('one button on each column that asked for one', buttons, [0, 1, 1]);
    const pin = labelCells(table)[2].querySelector('.twm-dt-col-action');
    check('…named by its title', pin.getAttribute('aria-label'), 'Pin Score');
    click(pin);
    check('a click calls onColumnAction(action, colIdx)', acted, [['pin', 2]]);
    check('…and does not sort', table._state.sortColumn ?? null, null);
    table.dispose();
}

section('§5 with a placeholder column drawn');
{
    const renamed = [];
    const { table } = mount({
        headers, rows,
        columnGroups: [{ key: 'a', columns: [0] }, { key: 'b', columns: [] }, { key: 'c', columns: [1, 2] }],
        onColumnRename: (c, name) => renamed.push([c, name]),
    });
    await rightClick(labelCells(table)[1]);
    ok('the placeholder\'s header offers no rename (it is no column)', !menuOf() || !entries(menuOf()).includes('Rename column'));
    document.body.click();
    await rightClick(labelCells(table)[2]);
    choose(menuOf(), 'Rename column');
    const input = inputOf(labelCells(table)[2]);
    check('the column after it opens with its own name', input?.value, 'Name');
    input.value = 'Title';
    key(input, 'Enter');
    await settle();
    check('…and renames data column 1', renamed, [[1, 'Title']]);
    table.dispose();
}

done();
