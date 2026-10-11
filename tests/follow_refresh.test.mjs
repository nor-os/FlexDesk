/**
 * 0.7.0 `refresh()` and `follow` (#36) — read the page again in place, and
 * keep reading the newest one.
 *
 * The first consumer's audit log re-queried every ten seconds behind a Follow
 * toggle, only while the reader was on the newest page, and turned itself off
 * the moment the reader paged back — so an old page being read is never yanked
 * away by the next tick. It replaced the page wholesale, so a reader scrolled
 * half-way down was thrown to the top and lost their row. The table does it
 * now, and keeps what a reader has: the selection (by key), the open row, the
 * open details and the scroll position — which only a browser can measure,
 * so that half is proved in headless Edge (README).
 *
 *   §1  `refresh()` reads the CURRENT page again (reason 'refresh')
 *   §2  rows the last answer did not hold are drawn `twm-dt-row--new` — and
 *       none on the first answer
 *   §3  the selection is kept by key, wherever the new answer put the rows
 *   §4  the open row and the open details are kept
 *   §5  `follow`: re-read on its interval while on the first page
 *   §6  paging away turns it OFF (`onFollowChange(false)`); paging home does
 *       not turn it on again
 *   §7  `setFollow` / `isFollowing`
 *   §8  no tick while a request is out
 *   §9  no tick while the table is out of the page (`keepWhileDetached`), and
 *       ticking again once it is back
 *   §10 `dispose()` stops it
 *   §11 without `dataSource`, `refresh()` draws again and asks nothing
 *
 * Against 0.6.0 there is no `refresh` to call and no `follow`: every section
 * fails.
 *
 *     node tests/follow_refresh.test.mjs
 */
import { dataTableEnv } from './dt_env.mjs';

const T = await dataTableEnv('follow and refresh');
const { check, ok, section, mount, bodyRows, click, tick } = T;

const headers = ['Id', 'What'];
/** A newest-first feed whose head can grow between reads. */
function feed(n = 300) {
    let top = n;
    const calls = [];
    let hold = false;
    const pending = [];
    const fetch = (q) => {
        calls.push(q);
        const page = [];
        for (let id = top - q.offset; id > top - q.offset - q.limit && id > 0; id--) page.push([`e${id}`, `event ${id}`]);
        const answer = { rows: page, total: null };
        if (hold) return new Promise((res) => pending.push(() => res(answer)));
        return Promise.resolve(answer);
    };
    return {
        fetch, calls,
        add: (k) => { top += k; },
        hold: (on) => { hold = on; },
        release: () => { while (pending.length) pending.shift()(); },
    };
}
const ids = (host) => bodyRows(host).map((tr) => tr.children[0].textContent);
const keyed = { getRowKey: (row) => row[0] };

section('§1 refresh() reads the current page again');
{
    const f = feed();
    const { table } = mount({ headers, dataSource: f.fetch, ...keyed });
    await tick();
    await table._sourceGoTo(100);
    await table.refresh();
    check('same offset, reason refresh', [f.calls.at(-1).offset, f.calls.at(-1).reason], [100, 'refresh']);
    table.dispose();
}

section('§2 new rows are marked; none on the first answer');
{
    const f = feed();
    const { host, table } = mount({ headers, dataSource: f.fetch, ...keyed });
    await tick(); await tick();
    ok('first answer: nothing is new', !host.querySelector('.twm-dt-row--new'));
    f.add(3);
    await table.refresh();
    check('the three that arrived are on top', ids(host).slice(0, 4), ['e303', 'e302', 'e301', 'e300']);
    check('…and only they are marked new',
          bodyRows(host).filter((tr) => tr.classList.contains('twm-dt-row--new')).map((tr) => tr.children[0].textContent),
          ['e303', 'e302', 'e301']);
    await table.refresh();
    ok('read again with nothing new: nothing marked', !host.querySelector('.twm-dt-row--new'));
    table.dispose();
}

section('§3 the selection is kept by key');
{
    const f = feed();
    const sel = [];
    const { host, table } = mount({ headers, dataSource: f.fetch, ...keyed, onSelectionChange: (s) => sel.push(s) });
    await tick(); await tick();
    click(bodyRows(host)[4]);
    check('e296 selected at index 4', table.getSelection(), [4]);
    f.add(2);
    await table.refresh();
    check('after two arrived it is index 6 — still e296', [table.getSelection(), table.config.rows[table.getSelection()[0]][0]], [[6], 'e296']);
    ok('drawn selected', bodyRows(host)[6].classList.contains('selected'));
    check('onSelectionChange was told the new index', sel.at(-1), [6]);
    table.dispose();
}

section('§4 the open row and the open details are kept');
{
    const f = feed();
    const { host, table } = mount({ headers, dataSource: f.fetch, ...keyed, activeRow: 'e299',
                                    rowDetail: (row) => `about ${row[0]}` });
    await tick(); await tick();
    table.setRowExpanded('e298', true);
    f.add(1);
    await table.refresh();
    check('the open row is still marked', host.querySelector('.twm-dt-row--active')?.children[0].textContent, 'e299');
    check('the open detail is still under its row',
          host.querySelector('.twm-dt-detail-row')?.previousElementSibling?.children[0].textContent, 'e298');
    table.dispose();
}

section('§5 follow re-reads on its interval, on the first page');
{
    const f = feed();
    const { table } = mount({ headers, dataSource: f.fetch, ...keyed, follow: { interval: 30 } });
    await tick();
    ok('following from the start', table.isFollowing());
    const before = f.calls.length;
    await tick(110);
    const ticks = f.calls.slice(before);
    ok('it re-read at least twice in ~110 ms', ticks.length >= 2);
    ok('…each a refresh of the first page', ticks.every((q) => q.reason === 'refresh' && q.offset === 0));
    table.dispose();
}

section('§6 paging away turns it off; home does not turn it on');
{
    const f = feed();
    const heard = [];
    const { host, table } = mount({ headers, dataSource: f.fetch, ...keyed, follow: { interval: 25 },
                                    onFollowChange: (on) => heard.push(on) });
    await tick(); await tick();
    click(host.querySelector('[data-pager="next"]'));
    await tick();
    ok('off', !table.isFollowing());
    check('onFollowChange(false)', heard, [false]);
    const after = f.calls.length;
    await tick(90);
    check('no tick since', f.calls.length, after);
    click(host.querySelector('[data-pager="first"]'));
    await tick();
    ok('home: still off', !table.isFollowing());
    table.dispose();
}

section('§7 setFollow / isFollowing');
{
    const f = feed();
    const heard = [];
    const { table } = mount({ headers, dataSource: f.fetch, ...keyed, follow: { interval: 25 },
                              onFollowChange: (on) => heard.push(on) });
    table.setFollow(false);
    await tick(); await tick();
    const base = f.calls.length;
    await tick(80);
    check('off: no tick', f.calls.length, base);
    table.setFollow(true);
    await tick(80);
    ok('on: ticking', f.calls.length > base);
    check('heard both', heard, [false, true]);
    table.setFollow(false);
    const stop = f.calls.length;
    await tick(80);
    check('off again: stopped', f.calls.length, stop);
    table.dispose();
}

section('§8 no tick while a request is out');
{
    const f = feed();
    const { table } = mount({ headers, dataSource: f.fetch, ...keyed, follow: { interval: 20 } });
    await tick(); await tick();
    f.hold(true);
    table.refresh();
    const out = f.calls.length;
    await tick(100);
    check('the ticks waited for the answer', f.calls.length, out);
    f.hold(false);
    f.release();
    await tick(60);
    ok('answered: ticking again', f.calls.length > out);
    table.dispose();
}

section('§9 no tick while out of the page; ticking again once back');
{
    const f = feed();
    const { host, table } = mount({ headers, dataSource: f.fetch, ...keyed, follow: { interval: 20 },
                                    autoDispose: true, keepWhileDetached: true });
    await tick(); await tick();
    const parent = host.parentNode;
    host.remove();
    await tick(5);
    const out = f.calls.length;
    await tick(100);
    check('out of the page: no tick', f.calls.length, out);
    ok('…and not disposed', table._wrapperEl);
    parent.appendChild(host);
    await tick(80);
    ok('back: ticking again', f.calls.length > out);
    table.dispose();
}

section('§10 dispose() stops it');
{
    const f = feed();
    const { table } = mount({ headers, dataSource: f.fetch, ...keyed, follow: { interval: 20 } });
    await tick(); await tick();
    table.dispose();
    const n = f.calls.length;
    await tick(80);
    check('nothing after dispose', f.calls.length, n);
}

section('§11 without dataSource, refresh() only draws again');
{
    const { host, table } = mount({ headers, rows: [['a', 1]] });
    const before = host.querySelector('.twm-data-table-component');
    await table.refresh();
    ok('drawn again', host.querySelector('.twm-data-table-component') !== before && ids(host)[0] === 'a');
    table.setFollow(true);
    ok('following is meaningless without a source, but harmless', table.isFollowing());
    table.dispose();
}

T.done();
