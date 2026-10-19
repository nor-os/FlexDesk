/**
 * STORY-0003 `headerMenu` / `onHeaderMenuAction` — THE CONSUMER'S ITEMS IN THE
 * HEADER'S RIGHT-CLICK MENU.
 *
 *   §1  `headerMenu(colIdx, ctx) => items` puts those items in the menu, and
 *       choosing one calls `onHeaderMenuAction(action, colIdx)`
 *   §2  with `columnChooser` the chooser's items follow behind a separator, and
 *       still show and hide columns
 *   §3  returning `[]` or `null` shows only what would show without the hook:
 *       the chooser alone, or no menu of the table's at all (the page's own)
 *   §4  the hook is asked for the data column under the pointer — after a
 *       hidden column too — and not for the row number; a throw shows no item
 *
 * Against 0.16, §1, §2 and §4 fail (there is no hook).
 *
 *     node tests/header_menu.test.mjs
 */
import { dataTableEnv } from './dt_env.mjs';

const T = await dataTableEnv('header menu');
const { check, ok, section, mount, click, tick, done, document } = T;

const headers = ['Id', 'Name', 'Score'];
const rows = [['a', 'Alpha', 1], ['b', 'Bravo', 2]];

const headCell = (host, i) => host.querySelectorAll('.twm-preview-table-header-wrap thead tr:first-child th')[i];
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

section('§1 the consumer\'s items');
{
    const asked = [];
    const actions = [];
    const { host, table } = mount({
        headers, rows,
        headerMenu: (colIdx, ctx) => {
            asked.push([colIdx, ctx.header, ctx.table === table]);
            return [{ label: `Sort by ${ctx.header}`, action: 'sort', icon: 'sort' },
                    { separator: true },
                    { label: 'Rename', action: 'rename', disabled: colIdx === 0 }];
        },
        onHeaderMenuAction: (action, colIdx) => actions.push([action, colIdx]),
    });
    const ev = await rightClick(headCell(host, 1));
    const menu = menuOf();
    ok('a right-click on the header opens the table\'s menu', !!menu && ev.defaultPrevented);
    check('the hook was asked for that column', asked, [[1, 'Name', true]]);
    check('…and its items are in the menu', entries(menu), ['Sort by Name', '---', 'Rename']);
    choose(menu, 'Sort by Name');
    check('choosing one calls onHeaderMenuAction(action, colIdx)', actions, [['sort', 1]]);
    ok('…and closes the menu', !menuOf());
    await rightClick(headCell(host, 0));
    const first = [...menuOf().children].find((el) => el.querySelector('.label')?.textContent === 'Rename');
    ok('a disabled item is drawn disabled', first.classList.contains('disabled'));
    check('there are no copy items in the header menu', entries(menuOf()).includes('Copy Row(s)'), false);
    table.dispose();
}

section('§2 with the column chooser');
{
    const actions = [];
    const { host, table } = mount({
        headers, rows, columnChooser: true,
        headerMenu: () => [{ label: 'Freeze', action: 'freeze' }],
        onHeaderMenuAction: (action, colIdx) => actions.push([action, colIdx]),
    });
    await rightClick(headCell(host, 2));
    check('the hook\'s items, a separator, then the chooser',
          entries(menuOf()), ['Freeze', '---', 'Id', 'Name', 'Score']);
    choose(menuOf(), 'Name');
    check('a chooser item still hides its column', table.getHiddenColumns(), [1]);
    check('…and is not a consumer action', actions, []);
    await rightClick(headCell(host, 1));   // now 'Score'
    choose(menuOf(), 'Freeze');
    check('the column after a hidden one is its data index', actions, [['freeze', 2]]);
    table.dispose();
}

section('§3 nothing from the hook');
{
    for (const nothing of [[], null]) {
        const { host, table } = mount({ headers, rows, columnChooser: true, headerMenu: () => nothing });
        await rightClick(headCell(host, 0));
        check(`${JSON.stringify(nothing)} with the chooser: the chooser alone, no separator`,
              entries(menuOf()), ['Id', 'Name', 'Score']);
        table.dispose();
    }
    for (const nothing of [[], null]) {
        const { host, table } = mount({ headers, rows, headerMenu: () => nothing });
        const ev = await rightClick(headCell(host, 0));
        ok(`${JSON.stringify(nothing)} without the chooser: no menu of the table's`, !menuOf());
        ok('…and the page\'s own menu is not prevented', !ev.defaultPrevented);
        table.dispose();
    }
    {
        const { host, table } = mount({ headers, rows, columnChooser: true });
        await rightClick(headCell(host, 0));
        check('without the hook the chooser is as in 0.16', entries(menuOf()), ['Id', 'Name', 'Score']);
        table.dispose();
    }
}

section('§4 which column');
{
    const asked = [];
    const err = console.error;
    console.error = () => {};
    try {
        const { host, table } = mount({
            headers, rows, showRowNumbers: true, hiddenColumns: [0], columnChooser: true,
            headerMenu: (colIdx) => {
                asked.push(colIdx);
                if (colIdx === 2) throw new Error('boom');
                return [{ label: 'X', action: 'x' }];
            },
        });
        await rightClick(headCell(host, 0));
        check('the row number is no column: the hook is not asked', asked, []);
        check('…and the chooser still shows', entries(menuOf()), ['Id', 'Name', 'Score']);
        await rightClick(headCell(host, 1));
        check('the first column shown is data column 1 (0 is hidden)', asked, [1]);
        await rightClick(headCell(host, 2));
        check('a hook that throws adds nothing', entries(menuOf()), ['Id', 'Name', 'Score']);
        table.dispose();
    } finally {
        console.error = err;
    }
}

done();
