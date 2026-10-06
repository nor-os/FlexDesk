/**
 * 0.5.0 `autoDispose`, and the copy menu's document listeners ONLY WHILE IT IS
 * OPEN.
 *
 * `dispose()` was manual. A consumer that threw a host away without calling it
 * — a pane re-drawn by `innerHTML`, a dashboard tile's loading state writing
 * over its box — kept the instance alive with its ResizeObserver, its disposers
 * and, once anybody had right-clicked a row, a copy menu on `document.body` and
 * four listeners on the document. The first consumer carried `dispose()`
 * bookkeeping in about twenty panes for it.
 *
 * Half of that is not an option at all: the copy menu's click/scroll/keydown/
 * resize listeners exist to CLOSE the menu, and a closed menu has nothing for
 * them to do — so they are now added when it opens and removed when it closes,
 * for every table.
 *
 *   §0  without autoDispose: a table taken out of the page is left alone (0.4)
 *   §1  autoDispose: taken out, it disposes itself — its box emptied, its copy
 *       menu gone from the body
 *   §2  taken out and put back in the same task (a renderer re-appending in
 *       tree order) it is NOT disposed
 *   §3  a table never attached is never disposed; one attached later is
 *       watched from then on
 *   §4  an ANCESTOR written over by innerHTML (a tile's loading state) counts
 *   §5  after an automatic dispose, setData into a re-attached host draws again
 *       and is watched again
 *   §6  the copy menu's document listeners exist only while it is open
 *
 * Against 0.4.7, §1 and §3–§6 fail.
 *
 *     node tests/auto_dispose.test.mjs
 */
import { dataTableEnv } from './dt_env.mjs';

const T = await dataTableEnv('auto dispose');
const { check, ok, section, mount, bodyRows, mouse, key, tick } = T;

// Every listener anything adds to the document or the window, live.
const live = new Set();
for (const target of [document, window]) {
    const add = target.addEventListener.bind(target);
    const remove = target.removeEventListener.bind(target);
    target.addEventListener = (type, fn, opts) => {
        live.add(`${target === document ? 'document' : 'window'}:${type}:${!!(opts === true || opts?.capture)}:${fnId(fn)}`);
        return add(type, fn, opts);
    };
    target.removeEventListener = (type, fn, opts) => {
        live.delete(`${target === document ? 'document' : 'window'}:${type}:${!!(opts === true || opts?.capture)}:${fnId(fn)}`);
        return remove(type, fn, opts);
    };
}
const ids = new WeakMap();
let nextId = 0;
function fnId(fn) {
    if (!ids.has(fn)) ids.set(fn, ++nextId);
    return ids.get(fn);
}
const listening = () => [...live].filter((k) => /:(click|scroll|keydown|resize):/.test(k)).length;

const headers = ['Name', 'Value'];
const rows = [['a', 1], ['b', 2], ['c', 3]];
const menus = () => document.querySelectorAll('.data-context-menu').length;

section('§0 without autoDispose: left alone');
{
    const { host, table } = mount({ headers, rows });
    host.remove();
    await tick(5);
    check('its box keeps its rows', bodyRows(host).length, 3);
    ok('the instance still holds its wrapper', table._wrapperEl);
    table.dispose();
}

section('§1 autoDispose: taken out, it disposes itself');
{
    const { host, table } = mount({ headers, rows, autoDispose: true });
    mouse('contextmenu', bodyRows(host)[0], { clientX: 5, clientY: 5 });
    await tick(5);
    check('the right-click built a copy menu on the body', menus(), 1);
    key(document, 'Escape');
    host.remove();
    await tick(5);
    check('its box is emptied', host.children.length, 0);
    ok('the instance let go of its wrapper', table._wrapperEl === null);
    check('its copy menu left the body', menus(), 0);
}

section('§2 out and back in, in one task: not disposed');
{
    const { host, table } = mount({ headers, rows, autoDispose: true });
    const parent = host.parentNode;
    host.remove();
    parent.appendChild(host);
    await tick(5);
    check('still drawn', bodyRows(host).length, 3);
    ok('still holds its wrapper', table._wrapperEl);
    table.dispose();
}

section('§3 never attached: never disposed; attached later: watched');
{
    const { host, table } = mount({ headers, rows, autoDispose: true }, { attach: false });
    await tick(5);
    check('a detached-from-birth table is left drawn', bodyRows(host).length, 3);
    document.body.appendChild(host);
    await tick(5);
    check('attached: still drawn', bodyRows(host).length, 3);
    host.remove();
    await tick(5);
    ok('…and taken out again, it is disposed', table._wrapperEl === null);
}

section('§4 an ancestor written over (a tile\'s loading state)');
{
    const tile = document.createElement('div');
    tile.className = 'tile-content';
    document.body.appendChild(tile);
    const host = document.createElement('div');
    tile.appendChild(host);
    const table = new T.DataTable(host, { headers, rows, autoDispose: true });
    table.render();
    tile.innerHTML = '<div class="spinner"></div>';
    await tick(5);
    ok('disposed with nothing calling dispose()', table._wrapperEl === null);
    tile.remove();
}

section('§5 drawn again after an automatic dispose');
{
    const { host, table } = mount({ headers, rows, autoDispose: true });
    host.remove();
    await tick(5);
    ok('disposed', table._wrapperEl === null);
    document.body.appendChild(host);
    table.setData({ rows: [['x', 9]] });
    await tick(5);
    check('setData draws into the re-attached host', bodyRows(host).length, 1);
    host.remove();
    await tick(5);
    ok('and it is watched again', table._wrapperEl === null);
}

// NOT TESTED HERE: that the watch holds its tables weakly, so a table that
// never reaches the page is not pinned by it. Under jsdom not even a plain
// table, autoDispose off, is ever collected (measured with --expose_gc), so a
// collection assertion here could not tell the two apart.

section('§6 the copy menu listens to the document only while open');
{
    const before = listening();
    const { host, table } = mount({ headers, rows });
    check('rendering adds no document listener', listening(), before);
    mouse('contextmenu', bodyRows(host)[1], { clientX: 5, clientY: 5 });
    await tick(5);
    const menu = [...document.querySelectorAll('.data-context-menu')].at(-1);   // this table's: the newest
    check('the menu is open', menu?.style.display, 'block');
    check('open: click, scroll, keydown and resize are listened for', listening() - before, 4);
    key(document, 'Escape');
    check('Escape closes it', menu?.style.display, 'none');
    check('closed: every one of them is gone', listening(), before);
    mouse('contextmenu', bodyRows(host)[0], { clientX: 5, clientY: 5 });
    await tick(5);
    check('opened again: listening again', listening() - before, 4);
    T.click(document.body);
    check('a click elsewhere closes it', menu?.style.display, 'none');
    check('…and they are gone again', listening(), before);
    mouse('contextmenu', bodyRows(host)[0], { clientX: 5, clientY: 5 });
    await tick(5);
    table.dispose();
    check('dispose() while open removes them too', listening(), before);
    check('…and the menu', menus(), 0);
}

T.done();
