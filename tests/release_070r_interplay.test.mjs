/**
 * 0.7.0 ON 0.6.3 — the published 0.6.x options and the 0.7.0 ones together.
 *
 * 0.6.1 (`diff`, `createScrollLock`), 0.6.2 (`paging`) and 0.6.3 (the row
 * height measured again) were published while 0.7.0 was being built on 0.6.0.
 * Each line's suites prove its own options; this one puts them on one table:
 *
 *   §1 0.6.2 `paging` in pages (the consumer fetching) with `rowDetail`: a
 *      detail open by key stays open across the consumer's page renders, and
 *      the strip counts rows, never details
 *   §2 0.6.2 scrolling with `virtualize` and `rowDetail`: the measured row
 *      height (0.6.3) and the open detail are BOTH in the row's height, a
 *      detail that grows once the widths are fixed is measured again, and the
 *      next rows the consumer appends keep it
 *   §3 0.6.2 `paging` with `autoDispose` + `keepWhileDetached`: nothing is
 *      asked while out, and back in, the strip and the load trigger work
 *   §4 `follow` with `paging` in pages over a `dataSource`: the tick reads the
 *      first page in place, and Next turns following off
 *   §5 `diff` and `scrollLock` beside a `dataSource` table: the answer's
 *      re-render keeps the table in the lock, the two scroll as one, and a
 *      new answer (at its top) takes the other side to the top too
 *
 *     node tests/release_070r_interplay.test.mjs
 */
import { dataTableEnv } from './dt_env.mjs';
import { createScrollLock } from '../src/ui/utils/scroll_lock.js';

const T = await dataTableEnv('0.7.0 on 0.6.3 interplay');
const { check, ok, section, done, mount, bodyRows, click, tick, document, window } = T;

const headers = ['Id', 'What'];
const rowsOf = (count, from = 0) => Array.from({ length: count }, (_, i) => [`r${from + i}`, `what ${from + i}`]);
const keyed = { getRowKey: (row) => row[0] };
const ids = (host) => bodyRows(host).map((tr) => tr.children[0].textContent.trim());
const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
const n = (x) => Number(x).toLocaleString();
const strip = (host) => host.querySelector('.twm-dt-paging');
const button = (host, tip) => [...host.querySelectorAll('.twm-dt-paging .twm-pagination-btn')]
    .find((b) => b.getAttribute('data-tooltip')?.startsWith(tip));
function metrics(table, { clientHeight = 200, scrollHeight = 2000, scrollTop = 0 } = {}) {
    const wrap = table.scrollElement;
    let top = scrollTop;
    Object.defineProperty(wrap, 'clientHeight', { configurable: true, get: () => clientHeight });
    Object.defineProperty(wrap, 'scrollHeight', { configurable: true, get: () => scrollHeight });
    Object.defineProperty(wrap, 'scrollTop', { configurable: true, get: () => top, set: (v) => { top = v; } });
    return { scrollTo(v) { top = v; wrap.dispatchEvent(new window.Event('scroll')); } };
}

section('§1 paging in pages (the consumer fetching) with rowDetail');
{
    const all = rowsOf(250);
    let table;
    const paging = {
        mode: 'pages', pageSize: 100, total: 250, offset: 0,
        onPage: (offset) => {
            table.setData({ rows: all.slice(offset, offset + 100) });
            table.setPaging({ offset });
        },
    };
    let host;
    ({ host, table } = mount({ headers, rows: all.slice(0, 100), ...keyed, paging,
        rowDetail: (row) => `about ${row[0]}` }));
    table.setRowExpanded('r5', true);
    check('the strip counts rows, not details', host.querySelector('.twm-dt-paging__info').textContent,
          `Rows 1–100 of ${n(250)}`);
    click(button(host, 'Next page'));
    check('page 2 drawn', ids(host)[0], 'r100');
    ok('r5 is not on it, so no detail is drawn', !host.querySelector('.twm-dt-detail'));
    click(button(host, 'Previous page'));
    ok('back on page 1, r5\'s detail is open again', host.querySelector('.twm-dt-detail')?.textContent === 'about r5');
    check('and the strip is still the strip', host.querySelector('.twm-dt-paging__info').textContent,
          `Rows 1–100 of ${n(250)}`);
    table.dispose();
}

section('§2 scrolling, virtualize, rowDetail: the measured height holds the detail');
{
    const proto = window.HTMLElement.prototype;
    const real = proto.getBoundingClientRect;
    let rowH = 22;
    let detailH = 60;
    proto.getBoundingClientRect = function () {
        let h = 0;
        if (this.tagName === 'TR' && this.__rowIndex !== undefined) h = rowH;
        else if (this.tagName === 'TR' && this.classList.contains('twm-dt-detail-row')) h = detailH;
        return { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: h, width: 0, height: h };
    };
    try {
        let held = rowsOf(200);
        let table;
        const paging = {
            mode: 'scroll', pageSize: 200, hasMore: true,
            onLoadMore: () => {
                held = held.concat(rowsOf(200, held.length));
                table.setData({ rows: held });
            },
        };
        let host;
        ({ host, table } = mount({ headers, rows: held, ...keyed, paging, pagination: false,
            virtualize: { overscan: 5, rowHeight: 30 }, rowDetail: (row) => `about ${row[0]}` }));
        const v = () => table._virt;
        check('the rows are measured (0.6.3), not estimated', v().base, 22);
        table.setRowExpanded('r3', true);
        check('r3 is its row and its detail', v().heights[3], 22 + 60);
        // The column widths are fixed a frame later, and the detail — as wide
        // as the table — wraps to another height. The remeasure reads it.
        detailH = 96;
        table._virtRemeasure();
        check('the detail measured again', v().heights[3], 22 + 96);
        check('rows after it start lower by that', v().offsets[4] - v().offsets[3], 118);
        // The rows themselves change too (a font): both are read.
        rowH = 25;
        detailH = 100;
        table._virtRemeasure();
        check('both moved: row and detail', [v().base, v().heights[3]], [25, 125]);
        check('a row without a detail is the row', v().heights[4], 25);
        // The consumer appends the next rows: the detail stays, measured.
        const m = metrics(table, { clientHeight: 300, scrollHeight: 5100 });
        m.scrollTo(4900);
        check('more rows held', table.config.rows.length, 400);
        ok('r3 still open', table.isRowExpanded('r3'));
        check('…and still part of its row', table._virt.heights[3], 25 + 100);
        table.dispose();
    } finally {
        proto.getBoundingClientRect = real;
    }
}

section('§3 paging with autoDispose + keepWhileDetached');
{
    let asked = 0;
    const { host, table } = mount({ headers, rows: rowsOf(50), autoDispose: true, keepWhileDetached: true,
        paging: { mode: 'scroll', hasMore: true, onLoadMore: () => { asked++; } } });
    await tick(30);
    const m = metrics(table, { clientHeight: 200, scrollHeight: 2000 });
    host.remove();
    await tick(40);
    m.scrollTo(1900);
    check('out of the page: nothing asked', asked, 0);
    ok('…and not disposed', !!table._wrapperEl && !!strip(host));
    document.body.appendChild(host);
    await tick(20);
    m.scrollTo(1950);
    check('back in: the end of the scroll asks', asked, 1);
    ok('the strip is still there', strip(host)?.isConnected);
    table.dispose();
    host.remove();
}

section('§4 follow with paging in pages over a dataSource');
{
    let top = 300;
    const calls = [];
    const fetch = (q) => {
        calls.push(q);
        const rows = [];
        for (let id = top - q.offset; id > top - q.offset - q.limit && id > 0; id--) rows.push([`e${id}`, `event ${id}`]);
        return Promise.resolve({ rows, total: null, hasMore: top - q.offset - q.limit > 0 });
    };
    const heard = [];
    const { host, table } = mount({ headers, dataSource: fetch, ...keyed, follow: { interval: 20 },
        onFollowChange: (on) => heard.push(on), paging: { mode: 'pages', pageSize: 50 } });
    await tick(); await tick();
    top += 2;
    await tick(60);
    ok('a tick re-read the first page', calls.some((q) => q.reason === 'refresh' && q.offset === 0 && q.limit === 50));
    check('the arrivals on top', ids(host).slice(0, 2), ['e302', 'e301']);
    click(button(host, 'Next page'));
    await tick(); await tick();
    check('Next turned following off', [table.isFollowing(), heard], [false, [false]]);
    const before = calls.length;
    await tick(60);
    check('no tick reads page 2', calls.length, before);
    table.dispose();
}

section('§5 diff and scrollLock beside a dataSource table');
{
    const lock = createScrollLock({ axis: 'y' });
    const data = rowsOf(80);
    const diffSide = mount({ headers, rows: data, pagination: false, scrollLock: lock,
        diff: (_row, i) => ({ status: i % 7 === 0 ? 'changed' : 'same', cells: [1] }) });
    const fetch = (q) => Promise.resolve({ rows: data.slice(q.offset, q.offset + q.limit), total: data.length });
    const sourceSide = mount({ headers, dataSource: fetch, pageSize: 100, pagination: false, scrollLock: lock });
    await tick(); await tick();
    check('the source table drew its answer', bodyRows(sourceSide.host).length, 80);
    check('both in the lock after the answer\'s re-render', lock.size, 2);
    const box = (host) => host.querySelector('.twm-preview-table-wrap');
    box(diffSide.host).scrollTop = 120;
    box(diffSide.host).dispatchEvent(new window.Event('scroll'));
    check('the diff side moves the source side', box(sourceSide.host).scrollTop, 120);
    ok('the diff rows are drawn', diffSide.host.querySelector('.twm-dt-diff--changed'));
    await sourceSide.table.reload();
    check('a new answer: still two in the lock', lock.size, 2);
    // A new question starts at the top of its answer — and the lock takes the
    // other side there with it (the browser's scroll event, sent by hand).
    check('…the new answer starts at its top', box(sourceSide.host).scrollTop, 0);
    box(sourceSide.host).dispatchEvent(new window.Event('scroll'));
    check('…and the diff side comes with it', box(diffSide.host).scrollTop, 0);
    sourceSide.table.dispose();
    diffSide.table.dispose();
    check('both left on dispose', lock.size, 0);
}

done();
