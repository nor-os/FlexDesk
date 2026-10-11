/**
 * 0.7.0 — `paging` OVER A `dataSource`: one strip, one set of rules.
 *
 * 0.6.2 shipped `paging`, where the CONSUMER fetches and the table shows the
 * rows in pages or as one scrolling list; 0.7.0 adds `dataSource`, where the
 * TABLE asks. Together the table is its own `paging` consumer: the strip, the
 * soft and hard limits, the busy state and the load-near-the-end trigger are
 * 0.6.2's code, fed from the source's answers.
 *
 *   §1  pages: the first question is `paging.pageSize` rows; the strip says
 *       where they are, Next asks the next page, and the old pager is not drawn
 *   §2  pages: row numbers count from the page's offset ONCE (not twice)
 *   §3  scroll: near the end the table asks for the next rows (`reason:
 *       'more'`) and draws them UNDER the ones held — the scroll, the selection
 *       and the open details stay, and no overlay covers the rows
 *   §4  scroll: never past the hard limit, never while another question is out
 *   §5  scroll: Load all asks once, for every row left under the hard limit
 *   §6  scroll until the soft limit is proved: from then on, pages — and the
 *       rows just reached ARE that page
 *   §7  an exact total over the soft limit: pages from the first answer, the
 *       strip says why, Scroll refused
 *   §8  the Pages / Scroll switch: the table switches, tells the consumer, and
 *       asks again from the start
 *   §9  a sort while more rows are being asked for: the older question is
 *       aborted and its answer dropped
 *   §10 refresh while scrolling reads the rows HELD again; scrolling down for
 *       more turns following off, rows asked to fill the box do not
 *   §11 the pager's words (`pagerLabels`, `maxJumpOffset`) on the strip
 *   §12 setPaging changing the mode over a source asks again from the start
 *
 *     node tests/paging_data_source.test.mjs
 */
import { dataTableEnv } from './dt_env.mjs';

const T = await dataTableEnv('paging over a data source');
const { check, ok, section, done, mount, bodyRows, click, tick } = T;

const headers = ['Id', 'Name'];
const DATA = Array.from({ length: 5000 }, (_, i) => [i + 1, `row ${i + 1}`]);
const n = (x) => Number(x).toLocaleString();
const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
const strip = (host) => host.querySelector('.twm-dt-paging');
const info = (host) => host.querySelector('.twm-dt-paging__info')?.textContent ?? null;
const button = (host, tip) => [...host.querySelectorAll('.twm-dt-paging .twm-pagination-btn')]
    .find((b) => b.getAttribute('data-tooltip')?.startsWith(tip));
const modeButton = (host, mode) => host.querySelector(`.twm-dt-paging__mode[data-mode="${mode}"]`);
const ids = (host) => bodyRows(host).map((tr) => tr.children[0].textContent);

/** A server whose answers the test hands out (or `auto`, at once). */
function server({ auto = true, data = DATA, total = true, over = {} } = {}) {
    const calls = [];
    const fetch = (query, { signal } = {}) => {
        let resolve;
        const p = new Promise((res) => { resolve = res; });
        const call = {
            query, signal, resolve,
            answer: (more = {}) => {
                const rows = data.slice(query.offset, query.offset + query.limit);
                resolve({ rows, total: total ? data.length : null,
                          hasMore: query.offset + rows.length < data.length, ...over, ...more });
            },
        };
        calls.push(call);
        if (auto) call.answer();
        return p;
    };
    return { fetch, calls, last: () => calls.at(-1) };
}

/** jsdom lays nothing out: give the scroll box its numbers. */
function metrics(table, { clientHeight = 200, scrollHeight = 2000, scrollTop = 0 } = {}) {
    const wrap = table.scrollElement;
    let top = scrollTop;
    let height = scrollHeight;
    Object.defineProperty(wrap, 'clientHeight', { configurable: true, get: () => clientHeight });
    Object.defineProperty(wrap, 'scrollHeight', { configurable: true, get: () => height });
    Object.defineProperty(wrap, 'scrollTop', { configurable: true, get: () => top, set: (v) => { top = v; } });
    return {
        scrollTo(v) { top = v; wrap.dispatchEvent(new T.window.Event('scroll')); },
        setHeight(h) { height = h; },
        get top() { return top; },
    };
}
/** Re-apply the metrics after every render (a render builds a new box). */
async function settle(table, m = {}) {
    await tick(); await tick();
    const box = metrics(table, m);
    await frame();
    return box;
}

section('§1 pages: the first question, the strip, Next');
{
    const s = server();
    const { host, table } = mount({ headers, dataSource: s.fetch, pageSize: 100,
        paging: { mode: 'pages', pageSize: 50 } });
    await tick(); await tick();
    check('the first question is paging.pageSize rows', s.calls[0].query.limit, 50);
    check('…from the start', s.calls[0].query.offset, 0);
    check('the page drawn', bodyRows(host).length, 50);
    ok('the strip is drawn', strip(host));
    ok('the old pager is not', !host.querySelector('.twm-pagination-controls'));
    check('it says where the rows are', info(host), `Rows 1–50 of ${n(5000)}`);
    check('and which page', host.querySelector('.twm-dt-paging__page').textContent, `Page 1 of ${n(100)}`);
    click(button(host, 'Next page'));
    ok('busy while the page is asked for', strip(host).classList.contains('twm-dt-paging--busy'));
    await tick(); await tick();
    check('Next asks the next page', [s.last().query.offset, s.last().query.limit, s.last().query.reason], [50, 50, 'page']);
    check('and draws it', ids(host)[0], '51');
    check('the strip moved', info(host), `Rows 51–100 of ${n(5000)}`);
    ok('busy no more', !strip(host).classList.contains('twm-dt-paging--busy'));
    check('goToPage asks paging.pageSize pages', (await table.goToPage(3), s.last().query.offset), 150);
    check('pagingState is the source\'s', table.pagingState.mode, 'pages');
    table.dispose();
}

section("§2 pages: 'position' numbers from the offset, once");
{
    const s = server();
    const { host, table } = mount({ headers, dataSource: s.fetch, showRowNumbers: 'position',
        paging: { mode: 'pages', pageSize: 20 } });
    await tick(); await tick();
    await table.goToPage(2);
    await tick();
    check('the first row of page 3 is number 41', host.querySelector('tbody tr td.num')?.textContent, '41');
    table.dispose();
}

section('§3 scroll: more rows under the ones held');
{
    const s = server();
    const { host, table } = mount({ headers, dataSource: s.fetch, selectable: true,
        getRowKey: (row) => row[0],
        rowDetail: (row) => `detail ${row[0]}`,
        paging: { mode: 'scroll', pageSize: 40 } });
    const box = await settle(table);
    check('one question so far (the box is filled)', s.calls.length, 1);
    check('the strip counts the rows held', info(host), `40 of ${n(5000)} rows`);
    table.setRowExpanded(3, true);
    click(bodyRows(host)[2]);
    check('a row chosen', table.getSelection(), [2]);
    let overlay = false;
    const was = table.setLoading.bind(table);
    table.setLoading = (on) => { if (on) overlay = true; return was(on); };
    box.scrollTo(1700);
    check('near the end: one more question', s.calls.length, 2);
    check('for the rows after those held', [s.last().query.offset, s.last().query.limit, s.last().query.reason],
          [40, 40, 'more']);
    await tick(); await tick();
    check('drawn under the ones held', [bodyRows(host).length, ids(host)[0], ids(host)[40]], [80, '1', '41']);
    check('the scroll stays where it was', table.scrollElement.scrollTop, 1700);
    check('the chosen row is still chosen', table.getSelection(), [2]);
    ok('the open detail is still open', table.isRowExpanded(3) && host.querySelector('.twm-dt-detail'));
    ok('no overlay covered the rows', !overlay);
    check('the strip counts them', info(host), `80 of ${n(5000)} rows`);
    check('getPageInfo: the rows still start at 0', table.getPageInfo().offset, 0);
    table.dispose();
}

section('§4 scroll: never past the hard limit, never under another question');
{
    const s = server({ total: false });
    const { table } = mount({ headers, dataSource: s.fetch, sortable: true,
        paging: { mode: 'scroll', pageSize: 40, softLimit: 100, hardLimit: 100 } });
    const box = await settle(table);
    box.scrollTo(1700); await tick(); await tick();
    check('80 held', table.config.rows.length, 80);
    const b2 = metrics(table);
    b2.scrollTo(1700);
    check('the last question asks only up to the hard limit', s.last().query.limit, 20);
    await tick(); await tick();
    const s2 = server({ auto: false });
    const { table: t2 } = mount({ headers, dataSource: s2.fetch, sortable: true,
        paging: { mode: 'scroll', pageSize: 40 } });
    await tick();
    s2.last().answer(); await tick(); await tick();
    const b3 = metrics(t2);
    t2.sortBy(0, false);                 // a question out
    b3.scrollTo(1700);
    check('no "more" while a sort is being answered', s2.calls.map((c) => c.query.reason), ['initial', 'sort']);
    table.dispose(); t2.dispose();
}

section('§5 scroll: Load all asks once');
{
    const s = server({ data: DATA.slice(0, 300) });
    const { host, table } = mount({ headers, dataSource: s.fetch,
        paging: { mode: 'scroll', pageSize: 50, onLoadAll() {} } });
    await settle(table);
    const all = host.querySelector('.twm-dt-paging__all');
    check('the button names the total', all?.textContent, `Load all ${n(300)} rows`);
    click(all);
    check('one question for every row left under the hard limit',
          [s.last().query.offset, s.last().query.limit, s.last().query.reason], [50, 100000 - 50, 'all']);
    await tick(); await tick();
    check('every row held', table.config.rows.length, 300);
    ok('no more to load', !host.querySelector('.twm-dt-paging__all'));
    table.dispose();
}

section('§6 scroll until the soft limit is proved: then pages');
{
    const s = server({ total: false });
    const { host, table } = mount({ headers, dataSource: s.fetch,
        paging: { mode: 'scroll', pageSize: 50, softLimit: 100 } });
    const box = await settle(table);
    box.scrollTo(1700); await tick(); await tick();
    // 100 scrolled in, and more to come, proves 101: over the limit, so pages —
    // and the last 50 rows asked for are the page shown.
    check('100 rows and more to come prove 101: pages', table.pagingState.mode, 'pages');
    check('the rows drawn are the page just reached', [ids(host)[0], bodyRows(host).length], ['51', 50]);
    check('where it stands', table.getPageInfo().offset, 50);
    check('the strip pages, and says why', [strip(host).classList.contains('twm-dt-paging--pages'),
        host.querySelector('.twm-dt-paging__note')?.textContent],
          [true, `More than ${n(100)} rows, so they are shown in pages.`]);
    click(button(host, 'Next page')); await tick(); await tick();
    check('Next asks the page after it', s.last().query.offset, 100);
    table.dispose();
}

section('§7 an exact total over the soft limit: pages from the first answer');
{
    const s = server();
    const { host, table } = mount({ headers, dataSource: s.fetch,
        paging: { mode: 'scroll', pageSize: 100, softLimit: 1000, onModeChange() {} } });
    await settle(table);
    check('pages', table.pagingState.forced, true);
    check('one page held', table.config.rows.length, 100);
    check('the strip says why', host.querySelector('.twm-dt-paging__note')?.textContent,
          `More than ${n(1000)} rows, so they are shown in pages.`);
    ok('Scroll is refused', modeButton(host, 'scroll').disabled);
    table.dispose();
}

section('§8 the switch: the table switches, tells, asks again');
{
    const s = server({ data: DATA.slice(0, 800) });
    const heard = [];
    const { host, table } = mount({ headers, dataSource: s.fetch,
        paging: { mode: 'scroll', pageSize: 100, onModeChange: (m) => heard.push(m) } });
    const box = await settle(table);
    box.scrollTo(1700); await tick(); await tick();
    check('200 held while scrolling', table.config.rows.length, 200);
    click(modeButton(host, 'pages'));
    await tick(); await tick();
    check('the consumer heard', heard, ['pages']);
    check('asked again from the start', [s.last().query.offset, s.last().query.limit, s.last().query.reason],
          [0, 100, 'mode']);
    check('one page drawn', bodyRows(host).length, 100);
    check('pages now', table.pagingState.mode, 'pages');
    ok('the switch says so', modeButton(host, 'pages').getAttribute('aria-pressed') === 'true');
    table.dispose();
}

section('§9 a sort while more rows are asked for drops them');
{
    const s = server({ auto: false });
    const { host, table } = mount({ headers, dataSource: s.fetch, sortable: true,
        paging: { mode: 'scroll', pageSize: 40 } });
    await tick();
    s.last().answer(); await tick(); await tick();
    metrics(table).scrollTo(1700);
    const more = s.last();
    check('a "more" is out', more.query.reason, 'more');
    table.sortBy(1, false);
    ok('its signal was aborted', more.signal.aborted);
    more.answer(); await tick();
    s.last().answer({ rows: [[9, 'z']] }); await tick(); await tick();
    check('only the sort\'s answer is drawn', ids(host), ['9']);
    table.dispose();
}

section('§10 refresh while scrolling, and following');
{
    const s = server({ total: false });
    const changes = [];
    let answers = 0;
    // The first answer does not fill the box: the table asks for more with the
    // reader at the top. (The box's numbers are given as the answer is drawn,
    // before the frame the table asks in.)
    const { table } = mount({ headers, dataSource: s.fetch, getRowKey: (r) => r[0],
        follow: true, onFollowChange: (on) => changes.push(on),
        onLoad: () => { if (++answers === 1) metrics(table, { clientHeight: 200, scrollHeight: 150 }); },
        paging: { mode: 'scroll', pageSize: 30 } });
    await tick(); await tick();
    await frame(); await tick(); await tick();
    check('more asked to fill the box', s.calls.map((c) => c.query.reason), ['initial', 'more']);
    ok('following still on', table.isFollowing());
    await table.refresh();
    check('refresh reads the rows held, in one question',
          [s.last().query.offset, s.last().query.limit, s.last().query.reason], [0, 60, 'refresh']);
    check('…and keeps them all', table.config.rows.length, 60);
    const box = metrics(table, { clientHeight: 200, scrollHeight: 2000 });
    box.scrollTo(1850);
    check('scrolling down for more turns following off', [table.isFollowing(), changes], [false, [false]]);
    await tick(); await tick();
    table.dispose();
}

section('§11 the pager\'s words on the strip');
{
    const s = server();
    const { host, table } = mount({ headers, dataSource: s.fetch, maxJumpOffset: 1000,
        pagerLabels: { next: 'Older' }, paging: { mode: 'pages', pageSize: 100 } });
    await tick(); await tick();
    const last = host.querySelector('.twm-dt-paging [data-pager="last"]');
    ok('Last is refused past maxJumpOffset', last?.disabled && last.dataset.refusal);
    check('…in the pager\'s words', last?.dataset.refusal, `Past ${n(1000)} rows. Narrow the filters first.`);
    check('a word beside Next', host.querySelector('.twm-dt-paging [data-pager="next"] .twm-pagination-btn__label')?.textContent, 'Older');
    table.dispose();
}

section('§12 setPaging changing the mode asks again');
{
    const s = server({ data: DATA.slice(0, 500) });
    const { table } = mount({ headers, dataSource: s.fetch, paging: { mode: 'pages', pageSize: 100 } });
    await tick(); await tick();
    await table.goToPage(2);
    table.setPaging({ mode: 'scroll' });
    check('from the start', [s.last().query.offset, s.last().query.reason], [0, 'mode']);
    await tick(); await tick();
    table.setPaging({ softLimit: 9000 });
    check('a patch that keeps the mode asks nothing', s.last().query.reason, 'mode');
    check('still one question per change', s.calls.length, 3);
    table.dispose();
}

done();
