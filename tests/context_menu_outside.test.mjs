/**
 * ══ A PRESS OUTSIDE CLOSES A CONTEXT MENU, HOWEVER MANY CAME BEFORE (0.18.1) ══
 *
 * `showContextMenu` armed its outside-press listener with `{ once: true }`. A press
 * inside the menu (a separator, the padding, a disabled row) used it up without
 * closing anything, and from then on a press outside was ignored until Escape.
 *
 *   §1  a press on a separator or a disabled row leaves the menu open, and the next
 *       press outside closes it
 *   §2  closed, the listener is gone: nothing is left on the document, and a menu
 *       closed before its listener was armed never arms one
 *
 *     node tests/context_menu_outside.test.mjs
 */
import { dataTableEnv } from './dt_env.mjs';

const T = await dataTableEnv('context menu outside');
const { check, ok, section, done, mouse, tick, document } = T;

const { showContextMenu, hideContextMenu } = await import('../src/ui/components/context_menu.js');

const ITEMS = [
    { label: 'Open', action: 'open' },
    { separator: true },
    { label: 'Locked', action: 'locked', disabled: true },
];
const menu = () => document.querySelector('.twm-context-menu');
const outside = document.body.appendChild(document.createElement('div'));

section('§1 presses inside, then one outside');
{
    showContextMenu(10, 10, ITEMS, () => {});
    await tick();
    mouse('mousedown', menu().querySelector('.twm-context-menu__separator'));
    ok('a press on the separator leaves it open', !!menu());
    mouse('mousedown', menu().querySelector('[role="menuitem"]:disabled'));
    ok('as does a press on a disabled row', !!menu());
    mouse('mousedown', outside);
    ok('the next press outside closes it', !menu());
}

section('§2 nothing outlives the menu');
{
    const added = [];
    const removed = [];
    const realAdd = document.addEventListener.bind(document);
    const realRemove = document.removeEventListener.bind(document);
    document.addEventListener = (type, ...rest) => {
        if (type === 'mousedown') added.push(type);
        realAdd(type, ...rest);
    };
    document.removeEventListener = (type, ...rest) => {
        if (type === 'mousedown') removed.push(type);
        realRemove(type, ...rest);
    };

    showContextMenu(10, 10, ITEMS, () => {});
    hideContextMenu();
    await tick();
    check('closed in the tick it opened: never armed', added, []);

    showContextMenu(10, 10, ITEMS, () => {});
    await tick();
    check('open: armed once', added.length, 1);
    showContextMenu(20, 20, ITEMS, () => {});
    await tick();
    check('a second menu replaces the first and arms its own', [added.length, removed.length >= 2], [2, true]);
    hideContextMenu();
    delete document.addEventListener;
    delete document.removeEventListener;

    let closes = 0;
    const observed = () => { closes += 1; };
    showContextMenu(10, 10, ITEMS, observed);
    await tick();
    mouse('mousedown', outside);
    mouse('mousedown', outside);
    check('a press after it closed is nobody\'s', [menu(), closes], [null, 0]);
}

done();
