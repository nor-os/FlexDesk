/**
 * `paging` — A SERVER'S ROWS IN PAGES OR AS ONE SCROLLING LIST.
 *
 * The consumer holds the rows and fetches them; the table decides which way
 * they are shown (`resolvePaging`), asks for more while scrolling, and draws
 * the strip under the body. jsdom has no layout, so the scroll box's metrics
 * are given to the wrap by hand (`metrics`) — what a browser does with the
 * strip was proved in headless Edge for this release.
 *
 *   §0  without `paging`: no strip, and the old pager exactly as before
 *   §1  resolvePaging: the soft limit forces pages, clamped by the hard limit,
 *       from an exact total, a lower bound or the rows held
 *   §2  pages with an exact total: the rows, the page, the four buttons
 *   §3  pages with an unknown total: "more than", no Last
 *   §4  a source over the soft limit: shown in pages, SAID on the strip, and
 *       Scroll refused with the reason
 *   §5  scrolling: the count, Load all, busy while its promise is pending
 *   §6  scrolling asks for more near the end — once at a time, never past the
 *       hard limit, never in pages, never with no layout
 *   §7  rows that do not fill the box ask for more after the render
 *   §8  `showRowNumbers: 'position'` numbers a page from its offset
 *   §9  `setPaging` redraws the strip and not the rows
 *   §10 nothing to say, no strip
 *   §11 the Pages / Scroll switch
 *
 *     node tests/paging.test.mjs
 */
import { dataTableEnv } from './dt_env.mjs';

const T = await dataTableEnv('paging');
const { check, ok, section, done, mount, bodyRows, click, tick, resolvePaging } = T;
const { PAGING_HARD_LIMIT, PAGING_SOFT_LIMIT } = T;

const headers = ['Name', 'Value'];
const rowsOf = (n, from = 0) => Array.from({ length: n }, (_, i) => [`r${from + i}`, from + i]);
const strip = (host) => host.querySelector('.twm-dt-paging');
const text = (host, sel) => host.querySelector(sel)?.textContent ?? null;
const button = (host, tip) => [...host.querySelectorAll('.twm-dt-paging .twm-pagination-btn')]
    .find((b) => b.getAttribute('data-tooltip')?.startsWith(tip));
const modeButton = (host, mode) => host.querySelector(`.twm-dt-paging__mode[data-mode="${mode}"]`);
/** Numbers as the strip writes them: the reader's locale. */
const n = (x) => Number(x).toLocaleString();
const frame = () => new Promise((r) => requestAnimationFrame(() => r()));

/** Give the wrap a scroll box: jsdom lays nothing out. */
function metrics(table, { clientHeight = 200, scrollHeight = 2000, scrollTop = 0 } = {}) {
    const wrap = table.scrollElement;
    Object.defineProperty(wrap, 'clientHeight', { configurable: true, get: () => clientHeight });
    Object.defineProperty(wrap, 'scrollHeight', { configurable: true, get: () => scrollHeight });
    let top = scrollTop;
    Object.defineProperty(wrap, 'scrollTop', { configurable: true, get: () => top, set: (v) => { top = v; } });
    return {
        wrap,
        scrollTo(v) { top = v; wrap.dispatchEvent(new T.window.Event('scroll')); },
    };
}

section('§0 without `paging`: the 0.6 table');
{
    const { host } = mount({ headers, rows: rowsOf(250) });
    ok('no paging strip', !strip(host));
    ok('the old pager is drawn as before', !!host.querySelector('.twm-pagination-controls'));
    check('…over the first hundred', bodyRows(host).length, 100);
}

section('§1 resolvePaging');
{
    check('the constants', [PAGING_SOFT_LIMIT, PAGING_HARD_LIMIT], [10000, 100000]);
    const r = (o) => { const s = resolvePaging(o); return [s.mode, s.forced]; };
    check('scroll under the soft limit stays scroll', r({ mode: 'scroll', total: 10000 }), ['scroll', false]);
    check('one row over it is pages', r({ mode: 'scroll', total: 10001 }), ['pages', true]);
    check('pages asked for is pages, not forced', r({ mode: 'pages', total: 5 }), ['pages', false]);
    check('a lower bound over the limit forces pages', r({ mode: 'scroll', atLeast: 10001 }), ['pages', true]);
    check('rows held plus "more" prove it too',
          r({ mode: 'scroll', held: 10000, hasMore: true }), ['pages', true]);
    check('…and without "more" they do not', r({ mode: 'scroll', held: 10000 }), ['scroll', false]);
    check('an unknown total forces nothing', r({ mode: 'scroll', held: 1000, hasMore: true }), ['scroll', false]);
    check('the default mode is scroll', resolvePaging({}).requested, 'scroll');
    check('a soft limit above the hard one is the hard one',
          resolvePaging({ softLimit: 500000 }).softLimit, PAGING_HARD_LIMIT);
    check('…and so is a consumer hard limit below it',
          resolvePaging({ softLimit: 5000, hardLimit: 2000 }).softLimit, 2000);
    check(`a soft limit of ${n(25000)} lets ${n(25000)} scroll`,
          r({ mode: 'scroll', total: 25000, softLimit: 25000 }), ['scroll', false]);
    check('a nonsense limit is the default', resolvePaging({ softLimit: -3 }).softLimit, PAGING_SOFT_LIMIT);
    check('an exact total wins over a bound', resolvePaging({ total: 12, atLeast: 99999 }).known, 12);
}

section('§2 pages, exact total');
{
    const calls = [];
    const { host, table } = mount({
        headers, rows: rowsOf(1000, 1000),
        paging: { mode: 'pages', pageSize: 1000, total: 5000, offset: 1000, hasMore: true,
                  onPage: (o, l) => calls.push([o, l]) },
    });
    ok('the strip is drawn', !!strip(host));
    ok('…under the body', strip(host).previousElementSibling === table.scrollElement);
    ok('the old pager is not', !host.querySelector('.twm-pagination-controls'));
    check('every row of the page is drawn', bodyRows(host).length, 1000);
    check('the rows', text(host, '.twm-dt-paging__info'), `Rows ${n(1001)}–${n(2000)} of ${n(5000)}`);
    check('the page', text(host, '.twm-dt-paging__page'), 'Page 2 of 5');
    for (const [tip, want] of [['First page', [0, 1000]], ['Previous page', [0, 1000]],
                               ['Next page', [2000, 1000]], ['Last page', [4000, 1000]]]) {
        calls.length = 0;
        click(button(host, tip));
        check(`${tip} asks for its page`, calls, [want]);
    }
    const { host: last } = mount({
        headers, rows: rowsOf(1000, 4000),
        paging: { mode: 'pages', pageSize: 1000, total: 5000, offset: 4000, onPage: () => {} },
    });
    ok('on the last page Next is off', button(last, 'Next page').disabled);
    ok('…and Last', button(last, 'Last page').disabled);
    ok('…and Previous is on', !button(last, 'Previous page').disabled);
    const { host: first } = mount({
        headers, rows: rowsOf(1000),
        paging: { mode: 'pages', pageSize: 1000, total: 5000, hasMore: true, onPage: () => {} },
    });
    ok('on the first page First is off', button(first, 'First page').disabled);
    ok('…and Previous', button(first, 'Previous page').disabled);
}

section('§3 pages, unknown total');
{
    const { host } = mount({
        headers, rows: rowsOf(1000),
        paging: { mode: 'pages', pageSize: 1000, atLeast: 100001, hasMore: true, onPage: () => {} },
    });
    check('"more than" the bound', text(host, '.twm-dt-paging__info'), `Rows 1–${n(1000)} of more than ${n(100000)}`);
    check('a page with no "of"', text(host, '.twm-dt-paging__page'), 'Page 1');
    ok('Next is on (the source has more)', !button(host, 'Next page').disabled);
    ok('Last is off: there is no offset to go to', button(host, 'Last page').disabled);
    const { host: bare } = mount({
        headers, rows: rowsOf(1000),
        paging: { mode: 'pages', pageSize: 1000, hasMore: true, onPage: () => {} },
    });
    check('no bound at all: the page itself proves "more than" it', text(bare, '.twm-dt-paging__info'),
          `Rows 1–${n(1000)} of more than ${n(1000)}`);
}

section('§4 over the soft limit: pages, and the strip says why');
{
    const modes = [];
    const { host, table } = mount({
        headers, rows: rowsOf(1000),
        paging: { mode: 'scroll', pageSize: 1000, total: 50000, hasMore: true,
                  onPage: () => {}, onModeChange: (m) => modes.push(m) },
    });
    const s = table.pagingState;
    check('the state', [s.requested, s.mode, s.forced], ['scroll', 'pages', true]);
    ok('the strip is the pages strip', strip(host).classList.contains('twm-dt-paging--pages'));
    check('the reason, on the strip', text(host, '.twm-dt-paging__note'),
          `More than ${n(10000)} rows, so they are shown in pages.`);
    ok('Scroll is refused', modeButton(host, 'scroll').disabled);
    check('…with the same reason on it', modeButton(host, 'scroll').title,
          `More than ${n(10000)} rows, so they are shown in pages.`);
    check('Pages is the pressed one', modeButton(host, 'pages').getAttribute('aria-pressed'), 'true');
    click(modeButton(host, 'scroll'));
    check('a refused Scroll asks nothing', modes, []);
    const { host: own } = mount({
        headers, rows: rowsOf(1000),
        paging: { mode: 'scroll', pageSize: 1000, total: 50000, softLimit: 60000, hasMore: true },
    });
    ok(`a soft limit of ${n(60000)} lets ${n(50000)} scroll`, strip(own).classList.contains('twm-dt-paging--scroll'));
    ok('…with no note', !own.querySelector('.twm-dt-paging__note'));
}

section('§5 scrolling: the count and Load all');
{
    let release;
    let asked = 0;
    const { host } = mount({
        headers, rows: rowsOf(2000),
        paging: { mode: 'scroll', pageSize: 1000, total: 6000, hasMore: true,
                  onLoadAll: () => { asked++; return new Promise((r) => { release = r; }); } },
    });
    check('the count', text(host, '.twm-dt-paging__info'), `${n(2000)} of ${n(6000)} rows`);
    const all = () => host.querySelector('.twm-dt-paging__all');
    check('Load all names the total', all()?.textContent, `Load all ${n(6000)} rows`);
    click(all());
    check('it asks', asked, 1);
    check('while it loads it says so', all().textContent, 'Loading…');
    ok('…and cannot be pressed again', all().disabled);
    click(all());
    check('a second press asks nothing', asked, 1);
    release();
    await tick(); await tick();
    ok('settled, it is a button again', !all().disabled);
    const { host: unknown } = mount({
        headers, rows: rowsOf(2000),
        paging: { mode: 'scroll', pageSize: 1000, hasMore: true, onLoadAll: () => {} },
    });
    check('an unknown total', text(unknown, '.twm-dt-paging__info'), `${n(2000)} rows, more to come`);
    check('…Load all without a number', unknown.querySelector('.twm-dt-paging__all')?.textContent, 'Load all rows');
    const { host: whole } = mount({
        headers, rows: rowsOf(2000),
        paging: { mode: 'scroll', pageSize: 1000, total: 2000, onLoadAll: () => {} },
    });
    check('everything held', text(whole, '.twm-dt-paging__info'), `${n(2000)} rows`);
    ok('…no Load all', !whole.querySelector('.twm-dt-paging__all'));
    const { host: held } = mount({
        headers, rows: [...rowsOf(1500), ['', null]],
        paging: { mode: 'scroll', pageSize: 1000, total: 1500, held: 1500 },
    });
    check('`held` counts what the source holds, not a blank line', text(held, '.twm-dt-paging__info'), `${n(1500)} rows`);
}

section('§6 scrolling asks for more near the end');
{
    let asked = 0;
    let release = null;
    const paging = { mode: 'scroll', pageSize: 1000, hasMore: true,
                     onLoadMore: () => { asked++; return new Promise((r) => { release = r; }); } };
    const { table } = mount({ headers, rows: rowsOf(100), paging });
    await frame();
    const m = metrics(table, { clientHeight: 200, scrollHeight: 2000 });
    m.scrollTo(0);
    check('at the top: nothing', asked, 0);
    m.scrollTo(1500);
    check('within 400px of the end: one ask', asked, 1);
    m.scrollTo(1600);
    check('while it is pending: no second', asked, 1);
    release();
    await tick(); await tick();
    m.scrollTo(1700);
    check('settled, the next scroll asks again', asked, 2);

    const hard = { calls: 0 };
    const { table: full } = mount({
        headers, rows: rowsOf(50),
        paging: { mode: 'scroll', hasMore: true, held: 1000, hardLimit: 1000, softLimit: 1000,
                  onLoadMore: () => { hard.calls++; } },
    });
    metrics(full, { clientHeight: 200, scrollHeight: 300 }).scrollTo(100);
    check('at the hard limit: never', hard.calls, 0);

    const paged = { calls: 0 };
    const { table: pages } = mount({
        headers, rows: rowsOf(50),
        paging: { mode: 'pages', hasMore: true, onLoadMore: () => { paged.calls++; } },
    });
    metrics(pages, { clientHeight: 200, scrollHeight: 300 }).scrollTo(100);
    check('in pages: never', paged.calls, 0);

    const hidden = { calls: 0 };
    const { table: zero } = mount({
        headers, rows: rowsOf(50),
        paging: { mode: 'scroll', hasMore: true, onLoadMore: () => { hidden.calls++; } },
    });
    metrics(zero, { clientHeight: 0, scrollHeight: 0 }).scrollTo(0);
    check('with no layout: never', hidden.calls, 0);

    const ended = { calls: 0 };
    const { table: done_ } = mount({
        headers, rows: rowsOf(50),
        paging: { mode: 'scroll', hasMore: false, onLoadMore: () => { ended.calls++; } },
    });
    metrics(done_, { clientHeight: 200, scrollHeight: 300 }).scrollTo(100);
    check('with nothing more: never', ended.calls, 0);
}

section('§7 rows that do not fill the box ask after the render');
{
    let asked = 0;
    const host = document.createElement('div');
    document.body.appendChild(host);
    const table = new T.DataTable(host, {
        headers, rows: rowsOf(5),
        paging: { mode: 'scroll', hasMore: true, onLoadMore: () => { asked++; } },
    });
    table.render();
    metrics(table, { clientHeight: 400, scrollHeight: 120 });
    check('not during the render', asked, 0);
    await frame();
    check('after it, once', asked, 1);
}

section("§8 showRowNumbers: 'position' numbers a page from its offset");
{
    const { host } = mount({
        headers, rows: rowsOf(3, 2000), showRowNumbers: 'position',
        paging: { mode: 'pages', pageSize: 1000, total: 5000, offset: 2000, onPage: () => {} },
    });
    const first = bodyRows(host)[0];
    check(`the first row is ${n(2001)}`, first.firstElementChild.textContent, '2001');
    check('…while its index is still its own', first.__rowIndex, 0);
}

section('§9 setPaging redraws the strip, not the rows');
{
    const { host, table } = mount({
        headers, rows: rowsOf(1000),
        paging: { mode: 'pages', pageSize: 1000, hasMore: true, onPage: () => {} },
    });
    const tbody = host.querySelector('.twm-preview-table-wrap tbody');
    check('before the count', text(host, '.twm-dt-paging__page'), 'Page 1');
    table.setPaging({ total: 3500 });
    check('after it', text(host, '.twm-dt-paging__page'), 'Page 1 of 4');
    ok('the same rows', host.querySelector('.twm-preview-table-wrap tbody') === tbody);
    check('one strip', host.querySelectorAll('.twm-dt-paging').length, 1);
}

section('§10 nothing to say, no strip');
{
    const { host } = mount({ headers, rows: rowsOf(40), paging: { mode: 'scroll', pageSize: 1000 } });
    ok('a short list that is all here', !strip(host));
    const { host: one } = mount({ headers, rows: rowsOf(40), paging: { mode: 'pages', pageSize: 1000, total: 40 } });
    ok('one page', !strip(one));
    const { host: empty } = mount({ headers, rows: [], paging: { mode: 'pages', pageSize: 1000, total: 0 } });
    ok('no rows at all', !strip(empty));
    const { host: emptyPage } = mount({
        headers, rows: [], paging: { mode: 'pages', pageSize: 1000, offset: 3000, total: 2500, onPage: () => {} },
    });
    ok('an empty page past the end still has its strip, to go back', !!strip(emptyPage));
}

section('§11 the Pages / Scroll switch');
{
    const modes = [];
    const { host } = mount({
        headers, rows: rowsOf(1000),
        paging: { mode: 'pages', pageSize: 1000, total: 3000, hasMore: true,
                  onPage: () => {}, onModeChange: (m) => modes.push(m) },
    });
    check('Pages pressed', modeButton(host, 'pages').getAttribute('aria-pressed'), 'true');
    check('Scroll not', modeButton(host, 'scroll').getAttribute('aria-pressed'), 'false');
    click(modeButton(host, 'pages'));
    check('pressing the current mode asks nothing', modes, []);
    click(modeButton(host, 'scroll'));
    check('Scroll asks for scroll', modes, ['scroll']);
    const { host: none } = mount({
        headers, rows: rowsOf(1000),
        paging: { mode: 'pages', pageSize: 1000, total: 3000, onPage: () => {} },
    });
    ok('no onModeChange, no switch', !none.querySelector('.twm-dt-paging__modes'));
}

done();
