/**
 * 0.7.0 — `autoDispose` across a DETACH and a RE-ATTACH: `keepWhileDetached`.
 *
 * 0.5.0's `autoDispose` gives a table taken out of the page one task's grace:
 * a renderer that re-appends its subtree in the same turn keeps it. The first
 * consumer's dashboards do something else — they DETACH a board's DOM when its
 * tab is switched away and put the very same nodes back when it is switched
 * to, any number of tasks later. A table with `autoDispose` came back from
 * that EMPTY, so the dashboard grid tile kept its own loading override rather
 * than use it. And a table out, back and out again was judged by the first
 * departure's clock.
 *
 *   §0  without `keepWhileDetached`: still disposed a task after it is taken
 *       out (0.5)
 *   §1  `keepWhileDetached: 300`: out across many tasks and back inside the
 *       grace — not disposed, still drawn, still answers
 *   §2  THE CLOCK STARTS AT THE LAST DEPARTURE: out, back, out again — kept
 *       past the first departure's grace, disposed after the second's
 *   §3  `keepWhileDetached: true`: kept however long it is out; `dispose()`
 *       still empties its host
 *   §4  the dashboard shape: the board's element detached, the table given new
 *       rows while out, the same element put back in a new parent tasks later
 *       — drawn, with the new rows
 *   §5  out past its grace and never back: disposed, and the host's next
 *       content is left alone
 *
 * Against 0.6.0 §1–§4 fail: the option does not exist, so every table is
 * disposed one task after it leaves.
 *
 *     node tests/auto_dispose_detach.test.mjs
 */
import { dataTableEnv } from './dt_env.mjs';

const T = await dataTableEnv('auto dispose detach');
const { check, ok, section, mount, bodyRows, tick } = T;

const headers = ['Name', 'Value'];
const rows = [['a', 1], ['b', 2], ['c', 3]];
/** Several separate tasks, then `ms` more — a tab switched away for a while. */
async function tasks(n, ms = 0) {
    for (let i = 0; i < n; i++) await tick(0);
    if (ms) await tick(ms);
}

section('§0 without keepWhileDetached: disposed a task after it leaves (0.5)');
{
    const { host, table } = mount({ headers, rows, autoDispose: true });
    const parent = host.parentNode;
    host.remove();
    await tasks(3);
    ok('disposed', table._wrapperEl === null);
    parent.appendChild(host);
    check('…and comes back empty', bodyRows(host).length, 0);
    host.remove();
}

section('§1 keepWhileDetached: 300 — out across many tasks, back inside the grace');
{
    const { host, table } = mount({ headers, rows, autoDispose: true, keepWhileDetached: 300 });
    const parent = host.parentNode;
    host.remove();
    await tasks(8, 120);
    ok('still held while out', table._wrapperEl);
    parent.appendChild(host);
    await tasks(2);
    check('back: drawn', bodyRows(host).length, 3);
    await tick(350);
    ok('in the page past the grace: never disposed', table._wrapperEl?.isConnected);
    table.setData({ rows: [['z', 9]] });
    check('…and still answers', bodyRows(host).map((tr) => tr.children[0].textContent), ['z']);
    table.dispose();
    host.remove();
}

section('§2 the clock starts at the LAST departure');
{
    const { host, table } = mount({ headers, rows, autoDispose: true, keepWhileDetached: 200 });
    const parent = host.parentNode;
    host.remove();                         // out at t0
    await tick(120);
    parent.appendChild(host);              // back at ~t120
    await tasks(2);
    host.remove();                         // out again at ~t125
    await tick(130);                       // t0 + ~255: past the FIRST grace
    ok('not disposed by the first departure\'s clock', table._wrapperEl);
    await tick(150);                       // ~t405: past the second
    ok('disposed after the second departure\'s grace', table._wrapperEl === null);
}

section('§3 keepWhileDetached: true — kept however long it is out');
{
    const { host, table } = mount({ headers, rows, autoDispose: true, keepWhileDetached: true });
    const parent = host.parentNode;
    host.remove();
    await tasks(5, 400);
    ok('still held after 400 ms out', table._wrapperEl);
    parent.appendChild(host);
    await tasks(2);
    check('back: drawn', bodyRows(host).length, 3);
    host.appendChild(document.createElement('p'));
    table.dispose();
    check('dispose() still empties its host (0.4)', host.children.length, 0);
    host.remove();
}

section('§4 the dashboard shape: a board detached, fed, and put back elsewhere');
{
    const board = document.createElement('div');
    board.className = 'board';
    const tileA = document.createElement('div');
    tileA.className = 'tile';
    document.body.appendChild(tileA);
    tileA.appendChild(board);
    const host = document.createElement('div');
    board.appendChild(host);
    const table = T.DataTable.mount(host, { headers, rows, autoDispose: true, keepWhileDetached: true });
    board.remove();                                           // the tab is switched away
    await tasks(4, 120);
    const tileB = document.createElement('div');              // the tile renderer's new wrap
    document.body.appendChild(tileB);
    tileB.appendChild(board);                                 // the tab is switched back
    await tasks(3);
    check('back with nothing done to it: drawn as it was',
          bodyRows(host).map((tr) => tr.children[0].textContent), ['a', 'b', 'c']);
    ok('not disposed', table._wrapperEl?.isConnected);
    board.remove();                                           // away again
    await tasks(4, 60);
    table.setData({ rows: [['x', 7], ['y', 8]] });            // a live update while away
    await tasks(4, 60);
    tileA.appendChild(board);                                 // back again
    await tasks(3);
    check('drawn, with the rows it was given while away',
          bodyRows(host).map((tr) => tr.children[0].textContent), ['x', 'y']);
    ok('still not disposed', table._wrapperEl?.isConnected);
    table.dispose();
    tileA.remove();
    tileB.remove();
}

section('§5 out past its grace and never back: disposed; the host\'s next content stays');
{
    const { host, table } = mount({ headers, rows, autoDispose: true, keepWhileDetached: 60 });
    host.remove();
    host.innerHTML = '<p class="next">next</p>';
    await tick(120);
    ok('disposed', table._wrapperEl === null);
    check('what the pane put in the host is left alone', host.innerHTML, '<p class="next">next</p>');
}

T.done();
