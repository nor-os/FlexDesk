/**
 * THE MENU BAR (STORY-0030).
 *
 * `createMenuBar(el, { menus, onAction })` turns a declarative model into a
 * WAI-ARIA menubar, and `createShell({ chrome: { menuBar }, menuBar })` mounts
 * one and lists the same verbs in the palette. Mounted in jsdom:
 *
 *   §1  clicking a title opens its menu (and clicking it again closes it)
 *   §2  while a menu is open, hovering another title switches to it
 *   §3  Alt (on its own) or F10 focuses the bar; Alt+letter and Shift+F10 do not
 *   §4  Left/Right move across menus; Up/Down move within one
 *   §5  Right opens a submenu and Left closes it
 *   §6  Esc closes one level, and the last Esc gives focus back — to what had
 *       it when the bar was entered THIS time, even after focus dropped to nothing
 *   §7  a function-valued submenu is rebuilt each time it opens
 *   §8  setEnabled / setChecked patch an open menu without rebuilding the bar;
 *       a radio group in a closed function submenu keeps exactly one checked
 *   §9  disabled items and separators are skipped by the keyboard and never
 *       reach onAction
 *   §10 the roles, and the ARIA structure they must form
 *   §11 commands(): the model as palette rows
 *   §12 a bad model is a boot error; dispose() takes the document listeners off
 *   §13 createShell: chrome.menuBar mounts it, the palette lists its verbs
 *
 *     node tests/menu_bar.test.mjs
 */
import { dataTableEnv } from './dt_env.mjs';

const t = await dataTableEnv('menu bar');
const { check, ok, section, done, document, window, mouse, click, tick } = t;
const { createMenuBar, MenuBar } = await import('../src/ui/components/menu_bar.js');

const keydown = (el, key, init = {}) => el.dispatchEvent(new window.KeyboardEvent('keydown', {
    key, bubbles: true, cancelable: true, ...init,
}));
const keyup = (el, key, init = {}) => el.dispatchEvent(new window.KeyboardEvent('keyup', {
    key, bubbles: true, cancelable: true, ...init,
}));
const press = (key, init) => keydown(document.activeElement || document.body, key, init);
const alt = () => {
    keydown(document.activeElement || document.body, 'Alt', { altKey: true });
    keyup(document.activeElement || document.body, 'Alt');
};
const label = (el) => el?.querySelector?.('.twm-menubar__label')?.textContent ?? el?.textContent ?? null;
const focused = () => label(document.activeElement);

let recentCalls = 0;
let recent = ['alpha.txt', 'beta.txt'];
const MODEL = () => [
    { id: 'file', label: 'File', items: [
        { id: 'new', label: 'New', shortcut: 'Ctrl+N' },
        { id: 'open', label: 'Open…', shortcut: 'Ctrl+O' },
        { id: 'recent', label: 'Open recent', submenu: () => {
            recentCalls++;
            return recent.map((r) => ({ id: `recent:${r}`, label: r }));
        } },
        { separator: true },
        { id: 'save', label: 'Save', shortcut: 'Ctrl+S', disabled: true },
        { id: 'export', label: 'Export', submenu: [
            { id: 'export-csv', label: 'CSV' },
            { id: 'export-png', label: 'PNG', disabled: true },
            { id: 'export-svg', label: 'SVG' },
        ] },
        { id: 'quit', label: 'Quit' },
    ] },
    { id: 'edit', label: 'Edit', items: [
        { id: 'undo', label: 'Undo', shortcut: 'Ctrl+Z' },
        { id: 'redo', label: 'Redo', shortcut: 'Ctrl+Y' },
    ] },
    { id: 'view', label: 'View', items: [
        { id: 'grid', label: 'Show grid', checked: true },
        { separator: true },
        { id: 'light', label: 'Light', radio: 'theme', checked: true },
        { id: 'dark', label: 'Dark', radio: 'theme', checked: false },
    ] },
];

const outside = document.createElement('button');
outside.textContent = 'outside';
document.body.appendChild(outside);
const host = document.createElement('div');
document.body.appendChild(host);

const actions = [];
const bar = createMenuBar(host, {
    menus: MODEL(),
    onAction: (id, info) => actions.push({ id, checked: info.checked, focus: document.activeElement === outside }),
});
const titles = () => [...host.querySelectorAll('.twm-menubar__title')];
const title = (name) => titles().find((b) => b.textContent === name);
const openMenus = () => [...host.querySelectorAll('[role="menu"]')];
const itemIn = (menu, name) => [...menu.querySelectorAll('.twm-menubar__item')].find((b) => label(b) === name);
const reset = () => { bar.close(); outside.focus(); actions.length = 0; };

// ── §1 ───────────────────────────────────────────────────────────────────
section('§1 clicking a title opens its menu');
{
    ok('a MenuBar instance', bar instanceof MenuBar);
    check('the titles', titles().map((b) => b.textContent), ['File', 'Edit', 'View']);
    check('nothing open at first', openMenus().length, 0);
    click(title('Edit'));
    check('one menu open', openMenus().length, 1);
    check('it is the Edit menu', openMenus()[0].getAttribute('aria-label'), 'Edit');
    check('its items', [...openMenus()[0].querySelectorAll('.twm-menubar__label')].map((s) => s.textContent), ['Undo', 'Redo']);
    check('the title says it is expanded', title('Edit').getAttribute('aria-expanded'), 'true');
    ok('bar.isOpen()', bar.isOpen());
    click(title('Edit'));
    check('clicking it again closes it', openMenus().length, 0);
    check('…and the title says so', title('Edit').getAttribute('aria-expanded'), 'false');
    click(title('File'));
    mouse('mousedown', outside);
    check('a press outside the bar closes it', openMenus().length, 0);
    reset();
}

// ── §2 ───────────────────────────────────────────────────────────────────
section('§2 while a menu is open, hovering another title switches to it');
{
    mouse('mouseover', title('View'));
    check('hovering with nothing open opens nothing', openMenus().length, 0);
    click(title('File'));
    mouse('mouseover', title('View'));
    check('one menu open', openMenus().length, 1);
    check('it switched to View', openMenus()[0].getAttribute('aria-label'), 'View');
    check('File is no longer expanded', title('File').getAttribute('aria-expanded'), 'false');
    check('View is', title('View').getAttribute('aria-expanded'), 'true');
    mouse('mouseover', title('Edit'));
    check('and on to Edit', openMenus()[0].getAttribute('aria-label'), 'Edit');
    reset();
}

// ── §3 ───────────────────────────────────────────────────────────────────
section('§3 Alt or F10 focuses the bar');
{
    outside.focus();
    alt();
    check('Alt on its own focuses the first title', focused(), 'File');
    alt();
    check('Alt again gives focus back', document.activeElement === outside, true);
    press('F10');
    check('F10 focuses the bar', focused(), 'File');
    press('F10');
    check('F10 again gives focus back', document.activeElement === outside, true);
    keydown(outside, 'Alt', { altKey: true });
    keydown(outside, 'h', { altKey: true });
    keyup(outside, 'h', { altKey: true });
    keyup(outside, 'Alt');
    check('Alt+H is a chord, not the bar', document.activeElement === outside, true);
    // Alt+Tab away and back: the Tab goes to the OS, the window blurs, and the
    // Alt keyup arrives on return with nothing between it and the keydown.
    keydown(outside, 'Alt', { altKey: true });
    window.dispatchEvent(new window.Event('blur'));
    keyup(outside, 'Alt');
    check('Alt, the window losing focus, then Alt up is not the bar', document.activeElement === outside, true);
    press('F10', { shiftKey: true });
    check('Shift+F10 is the context menu, not the bar', document.activeElement === outside, true);
    const ev = new window.KeyboardEvent('keydown', { key: 'F10', bubbles: true, cancelable: true });
    let reached = false;
    const later = () => { reached = true; };
    document.addEventListener('keydown', later);
    outside.dispatchEvent(ev);
    document.removeEventListener('keydown', later);
    ok('F10 is default-prevented', ev.defaultPrevented);
    check('…and does not also reach the page\'s own F-key bindings', reached, false);
    reset();
}

// ── §4 ───────────────────────────────────────────────────────────────────
section('§4 Left and Right move across menus; Up and Down move within one');
{
    press('F10');
    press('ArrowRight');
    check('Right on a title: the next title', focused(), 'Edit');
    press('ArrowRight'); press('ArrowRight');
    check('Right wraps to the first', focused(), 'File');
    press('ArrowLeft');
    check('Left wraps to the last', focused(), 'View');
    check('moving across titles opens nothing', openMenus().length, 0);
    check('the roving tab stop follows', titles().map((b) => b.tabIndex), [-1, -1, 0]);
    press('ArrowRight');                 // File
    press('ArrowDown');
    check('Down opens the menu on its first item', focused(), 'New');
    press('ArrowDown');
    check('Down moves within it', focused(), 'Open…');
    press('ArrowUp'); press('ArrowUp');
    check('Up wraps to the last item', focused(), 'Quit');
    press('Home');
    check('Home', focused(), 'New');
    press('End');
    check('End', focused(), 'Quit');
    press('ArrowRight');
    check('Right on a plain item moves to the next menu', openMenus()[0].getAttribute('aria-label'), 'Edit');
    check('…on its first item', focused(), 'Undo');
    press('ArrowLeft');
    check('Left in a top menu moves to the previous menu', openMenus()[0].getAttribute('aria-label'), 'File');
    check('…on its first item', focused(), 'New');
    press('ArrowLeft');
    check('Left wraps across menus', openMenus()[0].getAttribute('aria-label'), 'View');
    check('only one menu is open at a time', openMenus().length, 1);
    press('Escape');
    press('ArrowUp');
    check('Up on a title opens on the last item', focused(), 'Dark');
    reset();
}

// ── §5 ───────────────────────────────────────────────────────────────────
section('§5 Right opens a submenu and Left closes it');
{
    press('F10');
    press('ArrowDown');                  // New
    press('End'); press('ArrowUp');      // Export
    check('on the submenu item', focused(), 'Export');
    check('it says it has a popup', document.activeElement.getAttribute('aria-haspopup'), 'menu');
    press('ArrowRight');
    check('Right opens the submenu', openMenus().length, 2);
    check('…on its first item', focused(), 'CSV');
    check('…and the parent says it is expanded', itemIn(openMenus()[0], 'Export').getAttribute('aria-expanded'), 'true');
    press('ArrowDown');
    check('Down in the submenu skips its disabled PNG', focused(), 'SVG');
    press('ArrowLeft');
    check('Left closes the submenu', openMenus().length, 1);
    check('…and focus is back on its item', focused(), 'Export');
    check('…which is no longer expanded', document.activeElement.getAttribute('aria-expanded'), 'false');
    press('Enter');
    check('Enter on a submenu item also opens it', [openMenus().length, focused()], [2, 'CSV']);
    press('Enter');
    check('Enter on a leaf runs it', actions.map((a) => a.id), ['export-csv']);
    check('…and closes every menu', openMenus().length, 0);
    reset();
    click(title('File'));
    mouse('mouseover', itemIn(openMenus()[0], 'Export'));
    check('hovering a submenu item opens it', openMenus().length, 2);
    mouse('mouseover', itemIn(openMenus()[0], 'Quit'));
    check('hovering a sibling closes it', openMenus().length, 1);
    reset();
    // An empty function submenu: Right opens it, but its only row ('Empty')
    // is disabled, so focus stays on its item; Left then closes only it.
    const saved = recent;
    recent = [];
    press('F10');
    press('ArrowDown'); press('ArrowDown'); press('ArrowDown');
    check('on the function submenu item', focused(), 'Open recent');
    press('ArrowRight');
    check('Right opens the empty submenu', openMenus().length, 2);
    check('…and focus stays on its item', focused(), 'Open recent');
    press('ArrowLeft');
    check('Left closes only the submenu', openMenus().length, 1);
    check('…the open menu is still File', title('File').getAttribute('aria-expanded'), 'true');
    check('…and focus is still on its item', focused(), 'Open recent');
    check('…which is no longer expanded', document.activeElement.getAttribute('aria-expanded'), 'false');
    recent = saved;
    reset();
}

// ── §6 ───────────────────────────────────────────────────────────────────
section('§6 Esc closes one level and the last Esc returns focus to where it was');
{
    outside.focus();
    alt();
    press('ArrowDown'); press('End'); press('ArrowUp'); press('ArrowRight');
    check('three levels: bar, File, Export', [openMenus().length, focused()], [2, 'CSV']);
    press('Escape');
    check('Esc 1 closes the submenu', [openMenus().length, focused()], [1, 'Export']);
    press('Escape');
    check('Esc 2 closes the menu, focus on its title', [openMenus().length, focused()], [0, 'File']);
    press('Escape');
    check('Esc 3 gives focus back to where it was', document.activeElement === outside, true);
    // By pointer: the click remembers what had focus before it.
    outside.focus();
    mouse('mousedown', title('Edit'));
    title('Edit').focus();
    click(title('Edit'));
    press('Escape');
    check('after a click, Esc closes the menu', openMenus().length, 0);
    press('Escape');
    check('…and the next Esc gives focus back', document.activeElement === outside, true);
    // A submenu the pointer opened, with focus still on its item: one Esc
    // closes only the submenu.
    outside.focus();
    mouse('mousedown', title('File'));
    click(title('File'));
    const exportItem = itemIn(openMenus()[0], 'Export');
    exportItem.focus();
    mouse('mouseover', exportItem);
    check('hover opens the submenu, focus on its item', [openMenus().length, focused()], [2, 'Export']);
    press('Escape');
    check('one Esc closes only the submenu', [openMenus().length, focused()], [1, 'Export']);
    press('Escape');
    check('the next Esc closes the menu, focus on its title', [openMenus().length, focused()], [0, 'File']);
    press('Escape');
    check('…and the last Esc gives focus back', document.activeElement === outside, true);
    // Moving focus by keyboard within a menu closes a submenu open below it,
    // as hovering another item does, so each Esc still closes one level.
    for (const [key, to] of [['ArrowDown', 'Quit'], ['ArrowUp', 'Open recent'], ['Home', 'New'], ['End', 'Quit']]) {
        outside.focus();
        mouse('mousedown', title('File'));
        click(title('File'));
        mouse('mouseover', itemIn(openMenus()[0], 'Export'));
        check(`hover Export opens its submenu (${key})`, [openMenus().length, focused()], [2, 'Export']);
        press(key);
        check(`${key} closes the submenu and moves focus`,
            [openMenus().length, focused(), itemIn(openMenus()[0], 'Export').getAttribute('aria-expanded')],
            [1, to, 'false']);
        press('Escape');
        check(`…then one Esc closes the menu (${key})`, [openMenus().length, focused()], [0, 'File']);
        press('Escape');
    }
    // Running an item gives focus back BEFORE onAction runs.
    actions.length = 0;
    press('F10'); press('ArrowDown');
    press('Enter');
    check('the action ran', actions.map((a) => a.id), ['new']);
    check('…with focus already back where it was', actions[0].focus, true);
    // Focus leaving on its own (Tab, a click into a field) closes the menus.
    press('F10'); press('ArrowDown');
    outside.focus();
    check('focus moving out of the bar closes its menus', openMenus().length, 0);
    // Keys the bar uses do not reach the page's own bindings.
    let leaked = [];
    const spy = (e) => leaked.push(e.key);
    document.addEventListener('keydown', spy);
    press('F10'); press('ArrowDown'); press('Backspace'); press('Escape'); press('Escape');
    document.removeEventListener('keydown', spy);
    check('only F10 reached the document\'s bubble listeners — none did', leaked, []);
    // Focus leaving the bar to NOTHING (a press on a non-focusable area, the
    // window losing focus) also ends the bar's activation: the next Alt
    // remembers what has focus then, not what had it the time before.
    const fieldX = document.createElement('input');
    const fieldY = document.createElement('input');
    document.body.append(fieldX, fieldY);
    fieldX.focus();
    alt();
    check('Alt from field X focuses the bar', focused(), 'File');
    document.activeElement.blur();
    check('the title blurs to nothing', document.activeElement === document.body, true);
    fieldY.focus();
    alt();
    check('Alt from field Y focuses the bar again', focused(), 'File');
    press('Escape');
    ok('Esc gives focus back to Y, not to the stale X', document.activeElement === fieldY);
    // The same with a menu open when focus drops to nothing.
    fieldX.focus();
    alt(); press('ArrowDown');
    document.activeElement.blur();
    check('focus dropping to nothing closes the open menu', openMenus().length, 0);
    fieldY.focus();
    press('F10');
    press('Escape');
    ok('…and the next F10, Esc returns to Y', document.activeElement === fieldY);
    // A press in the bar never moves focus by itself, so it never drops to
    // nothing on the way (the bar moves focus to the title on click).
    fieldX.focus();
    const pressed = mouse('mousedown', title('Edit'));
    ok('mousedown on a title is default-prevented', pressed === false);
    ok('…and focus has not moved yet', document.activeElement === fieldX);
    click(title('Edit'));
    check('the click opens the menu and focuses its title', [openMenus().length, focused()], [1, 'Edit']);
    ok('mousedown on an item is default-prevented', mouse('mousedown', itemIn(openMenus()[0], 'Undo')) === false);
    press('Escape'); press('Escape');
    ok('Esc, Esc returns to X', document.activeElement === fieldX);
    fieldX.remove(); fieldY.remove();
    reset();
}

// ── §7 ───────────────────────────────────────────────────────────────────
section('§7 a function-valued submenu is rebuilt each time it opens');
{
    recentCalls = 0;
    click(title('File'));
    check('opening the menu does not call it', recentCalls, 0);
    mouse('mouseover', itemIn(openMenus()[0], 'Open recent'));
    check('opening the submenu calls it', recentCalls, 1);
    check('its rows', [...openMenus()[1].querySelectorAll('.twm-menubar__label')].map((s) => s.textContent), ['alpha.txt', 'beta.txt']);
    mouse('mouseover', itemIn(openMenus()[0], 'Quit'));
    recent = ['gamma.txt', 'alpha.txt', 'beta.txt'];
    mouse('mouseover', itemIn(openMenus()[0], 'Open recent'));
    check('opening it again calls it again', recentCalls, 2);
    check('…and shows what it returns now', [...openMenus()[1].querySelectorAll('.twm-menubar__label')].map((s) => s.textContent), ['gamma.txt', 'alpha.txt', 'beta.txt']);
    click(itemIn(openMenus()[1], 'gamma.txt'));
    check('a row it returned runs', actions.map((a) => a.id), ['recent:gamma.txt']);
    recent = [];
    click(title('File'));
    mouse('mouseover', itemIn(openMenus()[0], 'Open recent'));
    const empty = openMenus()[1];
    check('an empty list shows one disabled row', [...empty.querySelectorAll('.twm-menubar__item')].map((b) => [label(b), b.getAttribute('aria-disabled')]), [['Empty', 'true']]);
    click(empty.querySelector('.twm-menubar__item'));
    check('…which runs nothing', actions.length, 1);
    recent = ['alpha.txt'];
    reset();
}

// ── §8 ───────────────────────────────────────────────────────────────────
section('§8 setEnabled and setChecked update an open menu without rebuilding the bar');
{
    const titleNodes = titles();
    click(title('File'));
    const menu = openMenus()[0];
    const save = itemIn(menu, 'Save');
    const quit = itemIn(menu, 'Quit');
    check('Save starts disabled', save.getAttribute('aria-disabled'), 'true');
    bar.setEnabled('save', true);
    ok('the same menu element is still open', openMenus()[0] === menu);
    ok('the same Save element', itemIn(openMenus()[0], 'Save') === save);
    ok('the same title elements', titles().every((b, i) => b === titleNodes[i]));
    check('Save is enabled in place', save.hasAttribute('aria-disabled'), false);
    check('…and its class says so', save.classList.contains('twm-menubar__item--disabled'), false);
    ok('bar.isEnabled(save)', bar.isEnabled('save'));
    quit.focus();
    bar.setEnabled('quit', false);
    check('Quit is disabled in place', quit.getAttribute('aria-disabled'), 'true');
    ok('focus did not move', document.activeElement === quit);
    click(save);
    check('a re-enabled item runs', actions.map((a) => a.id), ['save']);
    bar.setEnabled('quit', true);

    click(title('View'));
    const view = openMenus()[0];
    const grid = itemIn(view, 'Show grid');
    const light = itemIn(view, 'Light');
    const dark = itemIn(view, 'Dark');
    check('Show grid is a check item, checked', [grid.getAttribute('role'), grid.getAttribute('aria-checked')], ['menuitemcheckbox', 'true']);
    bar.setChecked('grid', false);
    ok('the View menu was not rebuilt', openMenus()[0] === view && itemIn(view, 'Show grid') === grid);
    check('Show grid is unchecked in place', grid.getAttribute('aria-checked'), 'false');
    bar.setChecked('grid', true);
    check('…and checked again', grid.getAttribute('aria-checked'), 'true');
    bar.setChecked('dark', true);
    check('checking Dark unchecks Light (one radio group)', [light.getAttribute('aria-checked'), dark.getAttribute('aria-checked')], ['false', 'true']);
    ok('still the same elements', itemIn(openMenus()[0], 'Light') === light && itemIn(openMenus()[0], 'Dark') === dark);
    check('isChecked agrees', [bar.isChecked('light'), bar.isChecked('dark')], [false, true]);
    actions.length = 0;
    click(grid);
    check('clicking a check item flips it and reports the new state', actions.map((a) => [a.id, a.checked]), [['grid', false]]);
    click(title('View'));
    click(itemIn(openMenus()[0], 'Light'));
    check('clicking a radio item checks it', actions.map((a) => [a.id, a.checked]).at(-1), ['light', true]);
    click(title('View'));
    check('the group follows on the next open', [itemIn(openMenus()[0], 'Light').getAttribute('aria-checked'), itemIn(openMenus()[0], 'Dark').getAttribute('aria-checked')], ['true', 'false']);
    // An override also holds for the items a function submenu returns.
    bar.setEnabled('recent:alpha.txt', false);
    click(title('File'));
    mouse('mouseover', itemIn(openMenus()[0], 'Open recent'));
    check('setEnabled on an id a function submenu returns', itemIn(openMenus()[1], 'alpha.txt').getAttribute('aria-disabled'), 'true');
    bar.setEnabled('recent:alpha.txt', true);
    check('…patched in place while open', itemIn(openMenus()[1], 'alpha.txt').hasAttribute('aria-disabled'), false);
    bar.setEnabled('save', false);
    reset();

    // A radio group that lives in a FUNCTION submenu, set while it is closed.
    const winHost = document.createElement('div');
    document.body.appendChild(winHost);
    const winActions = [];
    const win = createMenuBar(winHost, {
        menus: [{ id: 'window', label: 'Window', items: [
            { id: 'pick', label: 'Pick', submenu: () => [
                { id: 'w1', label: 'W1', radio: 'win', checked: true },
                { id: 'w2', label: 'W2', radio: 'win', checked: false },
                { id: 'w3', label: 'W3', radio: 'win', checked: false },
            ] },
        ] }],
        onAction: (id, info) => winActions.push([id, info.checked]),
    });
    const winRadios = () => {
        win.open('window');
        mouse('mouseover', [...winHost.querySelectorAll('.twm-menubar__item')].find((b) => label(b) === 'Pick'));
        const sub = [...winHost.querySelectorAll('[role="menu"]')][1];
        const out = [...sub.querySelectorAll('.twm-menubar__item')].map((b) => b.getAttribute('aria-checked'));
        win.close();
        return out;
    };
    check('the function submenu\'s group starts as its model says', winRadios(), ['true', 'false', 'false']);
    check('isChecked reads a closed function submenu', [win.isChecked('w1'), win.isChecked('w2')], [true, false]);
    win.setChecked('w2', true);
    check('setChecked while closed: isChecked agrees', [win.isChecked('w1'), win.isChecked('w2'), win.isChecked('w3')], [false, true, false]);
    check('…and opening it shows exactly one checked radio', winRadios(), ['false', 'true', 'false']);
    win.setChecked('w2', false);
    check('unchecking the selected radio leaves none checked', winRadios(), ['false', 'false', 'false']);
    win.setChecked('w3', true);
    win.open('window');
    mouse('mouseover', [...winHost.querySelectorAll('.twm-menubar__item')].find((b) => label(b) === 'Pick'));
    const open1 = [...winHost.querySelectorAll('[role="menu"]')][1];
    const [b1, , b3] = open1.querySelectorAll('.twm-menubar__item');
    win.setChecked('w1', true);
    check('setChecked while open patches the group in place', [b1.getAttribute('aria-checked'), b3.getAttribute('aria-checked')], ['true', 'false']);
    ok('…in the same submenu', [...winHost.querySelectorAll('[role="menu"]')][1] === open1);
    win.close();
    win.dispose();
    winHost.remove();
}

// ── §9 ───────────────────────────────────────────────────────────────────
section('§9 disabled items and separators are skipped by the keyboard and never reach onAction');
{
    press('F10'); press('ArrowDown');
    const seen = [];
    for (let i = 0; i < 7; i++) { seen.push(focused()); press('ArrowDown'); }
    check('Down visits every enabled item once, then wraps', seen, ['New', 'Open…', 'Open recent', 'Export', 'Quit', 'New', 'Open…']);
    ok('the separator is never focused', !seen.includes(''));
    const back = [];
    press('Home');
    for (let i = 0; i < 6; i++) { press('ArrowUp'); back.push(focused()); }
    check('Up skips them too', back, ['Quit', 'Export', 'Open recent', 'Open…', 'New', 'Quit']);
    const menu = openMenus()[0];
    const save = itemIn(menu, 'Save');
    click(save);
    check('clicking a disabled item runs nothing', actions.length, 0);
    ok('…and leaves the menu open', openMenus().length === 1);
    save.focus();
    press('Enter');
    press(' ');
    check('Enter and Space on a disabled item run nothing', actions.length, 0);
    click(menu.querySelector('.twm-menubar__separator'));
    check('clicking a separator runs nothing', actions.length, 0);
    // A press the bar does not default-prevent moves focus in a real browser:
    // to <body>, as nothing between the target and the bar is focusable.
    // jsdom does not, so the press does it here, the way a browser would.
    const pressOn = (el) => {
        const notPrevented = mouse('mousedown', el);
        if (notPrevented) document.activeElement?.blur();
        return notPrevented;
    };
    itemIn(menu, 'New').focus();
    check('a press on a separator is default-prevented', pressOn(menu.querySelector('.twm-menubar__separator')), false);
    ok('…and the menu stays open', openMenus().length === 1 && openMenus()[0] === menu);
    check('…and focus stays in it', focused(), 'New');
    check('a press on the menu itself (its padding) is default-prevented', pressOn(menu), false);
    ok('…and the menu stays open', openMenus().length === 1 && openMenus()[0] === menu);
    check('…and focus stays in it', focused(), 'New');
    check('a press on the bar\'s empty space is default-prevented', pressOn(host), false);
    ok('…and the menu stays open', openMenus().length === 1 && openMenus()[0] === menu);
    click(itemIn(menu, 'Export'));
    check('clicking a submenu item opens it rather than running', [actions.length, openMenus().length], [0, 2]);
    click(itemIn(openMenus()[1], 'PNG'));
    check('a disabled submenu row runs nothing', actions.length, 0);
    bar.setEnabled('export', false);
    itemIn(openMenus()[0], 'Open…').focus();
    press('ArrowDown'); press('ArrowDown');
    check('a disabled submenu item is skipped as well', focused(), 'Quit');
    bar.setEnabled('export', true);
    // setEnabled(id, false) leaves focus on the item it disables (§8): the
    // keys still step from that item's own place in the menu.
    itemIn(openMenus()[0], 'Open…').focus();
    bar.setEnabled('open', false);
    check('focus stays on an item disabled under it', focused(), 'Open…');
    press('ArrowDown');
    check('Down from it goes to the next enabled item', focused(), 'Open recent');
    itemIn(openMenus()[0], 'Open…').focus();
    press('ArrowUp');
    check('Up from it goes to the previous enabled item', focused(), 'New');
    itemIn(openMenus()[0], 'Export').focus();
    bar.setEnabled('export', false);
    press('ArrowUp');
    check('Up from a disabled Export skips the disabled Save and the separator', focused(), 'Open recent');
    itemIn(openMenus()[0], 'Export').focus();
    press('ArrowDown');
    check('Down from a disabled Export goes to Quit', focused(), 'Quit');
    bar.setEnabled('open', true);
    bar.setEnabled('export', true);
    reset();
}

// ── §10 ──────────────────────────────────────────────────────────────────
section('§10 roles: menubar, menu, menuitem, menuitemcheckbox, menuitemradio');
{
    click(title('View'));
    check('the bar is a menubar', host.getAttribute('role'), 'menubar');
    ok('…with an accessible name', host.getAttribute('aria-label'));
    ok('each title is a menuitem with a popup', titles().every((b) => b.getAttribute('role') === 'menuitem' && b.getAttribute('aria-haspopup') === 'menu'));
    const view = openMenus()[0];
    check('an open menu is a menu', view.getAttribute('role'), 'menu');
    check('the roles of View\'s items', [...view.querySelectorAll('.twm-menubar__item')].map((b) => b.getAttribute('role')), ['menuitemcheckbox', 'menuitemradio', 'menuitemradio']);
    ok('every check and radio item has aria-checked', [...view.querySelectorAll('[role=menuitemcheckbox],[role=menuitemradio]')].every((b) => /^(true|false)$/.test(b.getAttribute('aria-checked'))));
    check('a separator is a separator', view.querySelector('.twm-menubar__separator').getAttribute('role'), 'separator');
    const roles = new Set([host, ...host.querySelectorAll('[role]')].map((n) => n.getAttribute('role')));
    click(title('File'));
    mouse('mouseover', itemIn(openMenus()[0], 'Export'));
    for (const n of host.querySelectorAll('[role]')) roles.add(n.getAttribute('role'));
    for (const r of ['menubar', 'menu', 'menuitem', 'menuitemcheckbox', 'menuitemradio']) {
        ok(`role="${r}" is present`, roles.has(r));
    }
    // The structure the ARIA rules require (axe's aria-required-children and
    // aria-required-parent): a menubar/menu owns only menu items and
    // separators, through role="none" wrappers; every menu item sits in one.
    const ITEM = /^menuitem(checkbox|radio)?$/;
    const owned = (container) => {
        const out = [];
        const walk = (n) => {
            for (const c of n.children) {
                const r = c.getAttribute('role');
                if (r === 'none' || r === 'presentation' || !r) walk(c);
                else out.push(c);
            }
        };
        walk(container);
        return out;
    };
    for (const c of [host, ...openMenus()]) {
        const kids = owned(c).filter((k) => k.getAttribute('role') !== 'menu');
        ok(`${c.getAttribute('aria-label')}: owns only items and separators`,
           kids.length && kids.every((k) => ITEM.test(k.getAttribute('role')) || k.getAttribute('role') === 'separator'));
    }
    const parentRole = (n) => {
        let p = n.parentElement;
        while (p && (p.getAttribute('role') === 'none' || !p.getAttribute('role'))) p = p.parentElement;
        return p?.getAttribute('role');
    };
    ok('every menu item\'s owner is a menu or the menubar',
       [...host.querySelectorAll('[role^=menuitem]')].every((n) => ['menu', 'menubar'].includes(parentRole(n))));
    ok('every open menu hangs from an expanded item',
       openMenus().every((m) => m.parentElement.querySelector(':scope > [aria-haspopup]')?.getAttribute('aria-expanded') === 'true'));
    ok('every item has text', [...host.querySelectorAll('[role^=menuitem]')].every((n) => n.textContent.trim()));
    ok('one title is in the tab order', titles().filter((b) => b.tabIndex === 0).length === 1);
    ok('no menu item is', [...host.querySelectorAll('.twm-menubar__item')].every((b) => b.tabIndex === -1));
    reset();
}

// ── §11 ──────────────────────────────────────────────────────────────────
section('§11 commands(): the same model as palette rows');
{
    recent = ['alpha.txt'];
    const rows = bar.commands();
    check('one row per enabled leaf, labelled as in the menu', rows.map((r) => r.label),
          ['New', 'Open…', 'alpha.txt', 'CSV', 'SVG', 'Quit', 'Undo', 'Redo', 'Show grid', 'Light', 'Dark']);
    check('the shortcut rides along', rows.find((r) => r.label === 'Open…').shortcut, 'Ctrl+O');
    check('the menu path is the context', rows.find((r) => r.label === 'CSV').context, 'File › Export');
    check('a function submenu is read now', rows.find((r) => r.label === 'alpha.txt').context, 'File › Open recent');
    ok('ids do not collide with the palette\'s own', rows.every((r) => r.id.startsWith('menubar:')));
    actions.length = 0;
    rows.find((r) => r.label === 'Undo').action();
    check('a row runs its item', actions.map((a) => a.id), ['undo']);
    const before = bar.isChecked('grid');
    rows.find((r) => r.label === 'Show grid').action();
    check('…flipping a check item like a click does', [actions.at(-1).checked, bar.isChecked('grid')], [!before, !before]);
    bar.setEnabled('undo', false);
    ok('a disabled item has no row', !bar.commands().some((r) => r.label === 'Undo'));
    rows.find((r) => r.label === 'Undo').action();
    check('…and a stale row for it runs nothing', actions.length, 2);
    bar.setEnabled('undo', true);
    reset();

    // A palette row for a radio item of a closed FUNCTION submenu checks it
    // and unchecks the rest of its group, which the bar cannot see.
    const winHost = document.createElement('div');
    document.body.appendChild(winHost);
    const winActions = [];
    const win = createMenuBar(winHost, {
        menus: [{ id: 'window', label: 'Window', items: [
            { id: 'pick', label: 'Pick', submenu: () => [
                { id: 'w1', label: 'W1', radio: 'win', checked: true },
                { id: 'w2', label: 'W2', radio: 'win', checked: false },
            ] },
        ] }],
        onAction: (id, info) => winActions.push([id, info.checked]),
    });
    win.commands().find((r) => r.id === 'menubar:w2').action();
    check('the palette row ran W2 as checked', winActions, [['w2', true]]);
    check('isChecked: W2 alone', [win.isChecked('w1'), win.isChecked('w2')], [false, true]);
    win.open('window');
    mouse('mouseover', [...winHost.querySelectorAll('.twm-menubar__item')].find((b) => label(b) === 'Pick'));
    const sub = [...winHost.querySelectorAll('[role="menu"]')][1];
    check('opening the submenu shows exactly one checked radio',
          [...sub.querySelectorAll('.twm-menubar__item')].map((b) => [label(b), b.getAttribute('aria-checked')]),
          [['W1', 'false'], ['W2', 'true']]);
    win.close();
    win.commands().find((r) => r.id === 'menubar:w1').action();
    check('running W1 from the palette moves the selection back', [win.isChecked('w1'), win.isChecked('w2')], [true, false]);
    win.dispose();
    winHost.remove();
}

// ── §12 ──────────────────────────────────────────────────────────────────
section('§12 a bad model is a boot error; dispose() takes its listeners off');
{
    const throws = (fn) => { try { fn(); return false; } catch (e) { return e instanceof TypeError; } };
    const el = document.createElement('div');
    ok('no element', throws(() => createMenuBar(null, { menus: MODEL() })));
    ok('no menus', throws(() => createMenuBar(el, { menus: [] })));
    ok('an item without an id', throws(() => createMenuBar(el, { menus: [{ id: 'a', label: 'A', items: [{ label: 'x' }] }] })));
    ok('a menu without items', throws(() => createMenuBar(el, { menus: [{ id: 'a', label: 'A' }] })));
    bar.dispose();
    check('the bar is emptied', [host.children.length, host.hasAttribute('role')], [0, false]);
    outside.focus();
    press('F10');
    alt();
    ok('F10 and Alt no longer reach it', document.activeElement === outside);
}

// ── §13 ──────────────────────────────────────────────────────────────────
section('§13 createShell mounts it from chrome.menuBar, and the palette lists its verbs');
{
    const { createShell } = await import('../src/tiling/shell.js');
    /** Open the palette, type `>`, and read the command rows it draws. */
    const paletteCommands = async (shell) => {
        shell.palette.open();
        await tick(10);
        const input = document.querySelector('#twm-cmdpal input');
        input.value = '>';
        input.dispatchEvent(new window.Event('input', { bubbles: true }));
        await tick(10);
        const rows = [...document.querySelectorAll('#twm-cmdpal .twm-cmdpal__item')].map((r) => ({
            label: r.querySelector('.twm-cmdpal__label')?.textContent.trim(),
            shortcut: r.querySelector('.twm-cmdpal__shortcut')?.textContent.trim() ?? null,
        }));
        shell.palette.close();
        await tick(10);
        return rows;
    };
    const { createTaxonomy } = await import('../src/tiling/kind_taxonomy.js');
    const { createEntityCatalog } = await import('../src/tiling/entity_sources.js');
    const root = document.createElement('div');
    const barEl = document.createElement('div');
    document.body.append(barEl, root);
    const ran = [];
    const base = () => ({
        root,
        entities: createEntityCatalog({ sources: [] }),
        taxonomy: createTaxonomy({ root: 'home', kinds: { home: { label: 'Home', isTopNav: true } } }),
        content: { home: (h) => { h.textContent = 'home'; return {}; } },
        panels: { left: false, right: false, bottom: false },
    });
    let threw = false;
    try { await createShell({ ...base(), chrome: { menuBar: barEl } }); } catch (e) { threw = e instanceof TypeError; }
    ok('chrome.menuBar without a model is a boot error', threw);
    threw = false;
    try { await createShell({ ...base(), menuBar: { menus: MODEL() } }); } catch (e) { threw = e instanceof TypeError; }
    ok('a menuBar model without chrome.menuBar is a boot error too', threw);
    const shell = await createShell({
        ...base(),
        palette: { layout: 'grouped', commands: () => [{ id: 'own', label: 'Own command', action: () => ran.push('own') }] },
        menuBar: { menus: MODEL(), onAction: (id) => ran.push(id) },
        chrome: { menuBar: barEl },
    });
    ok('shell.chrome.menuBar is the bar', shell.chrome.menuBar instanceof MenuBar);
    check('it is painted into the element', [barEl.getAttribute('role'), [...barEl.querySelectorAll('.twm-menubar__title')].map((b) => b.textContent)],
          ['menubar', ['File', 'Edit', 'View']]);
    const listed = await paletteCommands(shell);
    const row = (name) => listed.find((r) => r.label === name);
    ok('the palette lists the embedder\'s own command', row('Own command'));
    for (const name of ['New', 'Undo', 'Show grid', 'alpha.txt']) ok(`…and the menu's "${name}"`, row(name));
    check('…with the same shortcut', row('Undo')?.shortcut, 'Ctrl+Z');
    shell.chrome.menuBar.setEnabled('undo', false);
    ok('a disabled item leaves the palette on its next open', !(await paletteCommands(shell)).some((r) => r.label === 'Undo'));
    shell.dispose();
    check('dispose() empties the bar', barEl.children.length, 0);
    const quiet = await createShell({
        ...base(),
        palette: { layout: 'grouped', commands: () => [] },
        menuBar: { menus: MODEL(), palette: false },
        chrome: { menuBar: barEl },
    });
    ok('menuBar.palette: false keeps the menu out of the palette', !(await paletteCommands(quiet)).some((r) => r.label === 'Undo'));
    quiet.dispose();

    const barrel = await import('../widgets.js');
    ok('@flexdesk/widgets exports createMenuBar and MenuBar', barrel.createMenuBar === createMenuBar && barrel.MenuBar === MenuBar);
}

done();
process.exit(0);
