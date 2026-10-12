/**
 * STORY-0010 `contextMenuItems` / `onContextMenuAction` — THE CONSUMER'S OWN
 * ITEMS IN THE TABLE'S RIGHT-CLICK MENU.
 *
 * `onRowContextMenu` hands the event over and leaves the menu to the consumer,
 * so every consumer that wanted "Open", "Delete…", "Copy reference" on a row
 * drew a second menu of its own beside the table's copy menu — or, BugDesk,
 * shipped a private copy of the whole DataTable to get one.
 *
 *   §0  without the keys: the menu is the 0.9.1 copy menu, item for item
 *   §1  an array of items: drawn first, then a separator and the copy items;
 *       a separator, a disabled item and a danger item draw as the menu's own
 *   §2  a function is asked on every right-click with (row, rowIdx, ctx): the
 *       row under the pointer, the cell (colIdx/value), and the selection
 *   §3  choosing an item hides the menu and calls
 *       onContextMenuAction(action, rowIdx, row, ctx); a disabled one does
 *       nothing, and the copy items never come here
 *   §4  without `copyable` the items alone install the menu, with no copy
 *       items; no items then means the page's own menu (default not prevented)
 *   §5  a right-click without custom items after one with them draws the copy
 *       menu again
 *
 * Against 0.9.1, §1–§5 fail.
 *
 *     node tests/context_menu_items.test.mjs
 */
import { dataTableEnv } from './dt_env.mjs';

const T = await dataTableEnv('context menu items');
const { check, ok, section, mount, bodyRows, mouse, click, tick, document } = T;

const headers = ['Id', 'Name', 'State'];
const rows = [['b1', 'Alpha', 'open'], ['b2', 'Bravo', 'closed'], ['b3', 'Charlie', 'open']];

const menuOf = () => [...document.querySelectorAll('.data-context-menu')]
    .find((m) => m.style.display !== 'none') || null;
const itemsOf = (menu) => [...menu.children].map((el) => (
    el.classList.contains('twm-context-menu__separator') ? '---'
        : el.querySelector('.label').textContent
            + (el.classList.contains('disabled') ? ' [disabled]' : '')
            + (el.classList.contains('twm-delete-node') ? ' [danger]' : '')));
/** Right-click a cell the way a browser reports one; resolves once the menu is up. */
async function rightClick(el) {
    const ev = new T.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 5, clientY: 5 });
    el.dispatchEvent(ev);
    await tick();
    return ev;
}
const closeMenus = () => document.querySelectorAll('.data-context-menu').forEach((m) => { m.style.display = 'none'; });

section('§0 without the keys: the 0.9.1 copy menu');
{
    const { host, table } = mount({ headers, rows });
    await rightClick(bodyRows(host)[1].children[1]);
    const menu = menuOf();
    ok('the menu is up', !!menu);
    check('exactly the two copy items', itemsOf(menu), ['Copy Row(s)', 'Copy as CSV']);
    check('…with their actions', [...menu.children].map((el) => el.getAttribute('data-action')), ['copy-tsv', 'copy-csv']);
    check('the right-clicked row is selected', table.getSelection(), [1]);
    table.dispose();
}

section('§1 an array of items, drawn before the copy items');
{
    const { host, table } = mount({
        headers, rows,
        contextMenuItems: [
            { label: 'Open', icon: 'open_in_new', action: 'open' },
            { separator: true },
            { label: 'Archive', icon: 'archive', action: 'archive', disabled: true, title: 'Closed already' },
            { label: 'Delete…', icon: 'delete', action: 'delete', danger: true },
            null,
        ],
    });
    await rightClick(bodyRows(host)[0].children[0]);
    const menu = menuOf();
    check('items, a separator, then the copy items behind one',
          itemsOf(menu), ['Open', '---', 'Archive [disabled]', 'Delete… [danger]', '---', 'Copy Row(s)', 'Copy as CSV']);
    const archive = [...menu.children].find((el) => el.textContent.includes('Archive'));
    check('a disabled item cannot be pressed and says why',
          [archive.style.pointerEvents, archive.getAttribute('aria-disabled'), archive.title], ['none', 'true', 'Closed already']);
    check('the icon is the item\'s', archive.querySelector('.material-symbols-outlined').textContent, 'archive');
    ok('the copy items are enabled (a row is selected)',
       [...menu.querySelectorAll('[data-action^="copy-"]')].every((el) => !el.classList.contains('disabled')));
    table.dispose();
}

section('§2 a function, asked with the row under the pointer, the cell and the selection');
{
    const calls = [];
    const { host, table } = mount({
        headers, rows, showRowNumbers: true,
        contextMenuItems: (row, rowIdx, ctx) => {
            calls.push({ row, rowIdx, colIdx: ctx.colIdx, value: ctx.value, selection: ctx.selection, selectedRows: ctx.selectedRows });
            return [{ label: `Open ${row[0]}`, action: 'open' },
                    { label: '<b>not markup</b>', action: 'x' }];
        },
    });
    await rightClick(bodyRows(host)[2].children[2]);   // DOM 2 = data column 1 behind the gutter
    check('asked with (row, rowIdx) and the cell under the pointer',
          calls.at(-1), { row: rows[2], rowIdx: 2, colIdx: 1, value: 'Charlie', selection: [2], selectedRows: [rows[2]] });
    check('…and its items follow the row', itemsOf(menuOf()).slice(0, 2), ['Open b3', '<b>not markup</b>']);
    ok('a label is text, never markup', !menuOf().querySelector('b'));
    closeMenus();

    await rightClick(bodyRows(host)[0].children[0]);   // the row-number gutter
    check('the gutter is no data column', [calls.at(-1).rowIdx, calls.at(-1).colIdx, calls.at(-1).value], [0, null, null]);
    closeMenus();

    // A right-click INSIDE a multi-row selection keeps it, and ctx says so.
    table.setSelection([0, 2]);
    await rightClick(bodyRows(host)[2].children[1]);
    check('a right-click inside the selection sees all of it',
          [calls.at(-1).selection, calls.at(-1).selectedRows.map((r) => r[0])], [[0, 2], ['b1', 'b3']]);
    table.dispose();
}

section('§3 choosing an item');
{
    const actions = [];
    const { host, table } = mount({
        headers, rows,
        contextMenuItems: (row) => [
            { label: 'Open', action: 'open' },
            { label: 'Disabled', action: 'nope', disabled: true },
            { label: 'Named like a copy', action: 'copy-tsv' },
        ],
        onContextMenuAction: (action, rowIdx, row, ctx) => actions.push([action, rowIdx, row, ctx.colIdx, !!menuOf()]),
    });
    await rightClick(bodyRows(host)[1].children[2]);
    click([...menuOf().children].find((el) => el.textContent.includes('Open')));
    check('onContextMenuAction(action, rowIdx, row, ctx), the menu already hidden',
          actions, [['open', 1, rows[1], 2, false]]);

    await rightClick(bodyRows(host)[1].children[2]);
    click([...menuOf().children].find((el) => el.textContent.includes('Disabled')));
    check('a disabled item calls nothing', actions.length, 1);
    closeMenus();

    await rightClick(bodyRows(host)[0].children[0]);
    click([...menuOf().children].find((el) => el.textContent.includes('Named like a copy')));
    check('an action called "copy-tsv" is the consumer\'s', actions.at(-1).slice(0, 2), ['copy-tsv', 0]);

    let copied = 0;
    table.copyToClipboard = async () => { copied++; };
    await rightClick(bodyRows(host)[0].children[0]);
    const cp = [...menuOf().querySelectorAll('[data-action="copy-tsv"]')].find((el) => el.textContent.includes('Copy Row(s)'));
    click(cp);
    check('a copy item copies, and never reaches onContextMenuAction', [copied, actions.length], [1, 2]);
    closeMenus();
    table.dispose();
}

section('§4 without copyable');
{
    const { host, table } = mount({
        headers, rows, copyable: false,
        contextMenuItems: (row) => (row[2] === 'open' ? [{ label: 'Close', action: 'close' }] : []),
    });
    const ev = await rightClick(bodyRows(host)[0].children[0]);
    check('the items alone install the menu, with no copy items', itemsOf(menuOf()), ['Close']);
    ok('…and the page\'s own menu is held back', ev.defaultPrevented);
    closeMenus();
    const none = await rightClick(bodyRows(host)[1].children[0]);
    ok('no items for this row: no table menu', !menuOf());
    ok('…and the page\'s own menu opens', !none.defaultPrevented);
    table.dispose();
}
{
    const { host, table } = mount({ headers, rows, copyable: false });
    const ev = await rightClick(bodyRows(host)[0].children[0]);
    ok('without either key: no menu, as in 0.9.1', !menuOf() && !ev.defaultPrevented);
    table.dispose();
}

section('§5 the copy menu comes back after a custom one');
{
    let offer = true;
    const { host, table } = mount({
        headers, rows,
        contextMenuItems: () => (offer ? [{ label: 'Open', action: 'open' }] : []),
    });
    await rightClick(bodyRows(host)[0].children[0]);
    check('custom first', itemsOf(menuOf()), ['Open', '---', 'Copy Row(s)', 'Copy as CSV']);
    closeMenus();
    offer = false;
    await rightClick(bodyRows(host)[0].children[0]);
    check('no items: the copy items alone, no stray separator', itemsOf(menuOf()), ['Copy Row(s)', 'Copy as CSV']);
    table.dispose();
}

T.done();
