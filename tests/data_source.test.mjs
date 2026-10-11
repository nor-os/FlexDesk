/**
 * 0.7.0 `dataSource` (#33) — rows from a server.
 *
 * Before this, a server-paged table was `onPageChange`/`onSort` and a spinner:
 * its column filters did nothing at all (they were off in server mode), and
 * every consumer wrote its own ticket to drop a stale answer — the first
 * consumer's audit log, its System log, its change log and two Activity tabs
 * all share one hand-written `load()` for it. Now the table asks.
 *
 *   §1  the first render asks for the first page, and the answer is drawn AS
 *       GIVEN — no client sort, filter or slice
 *   §2  a sort is forwarded (from the first page) and the server's order drawn
 *   §3  a column filter is forwarded, after its debounce
 *   §4  ONLY THE NEWEST PAINTS: an older answer arriving last is dropped, and
 *       its request was aborted when the newer one went out
 *   §5  a failure keeps the rows on screen under the banner, and tells
 *       `onLoadError`; the next answer clears it
 *   §6  paging: Next asks for offset 100; a row's index is its place in the
 *       page drawn; 'position' numbers count from the page's offset
 *   §7  an empty answer under a filter keeps the filter row (the filter can be
 *       cleared)
 *   §8  while asking: the overlay, and an `emptyState` kept quiet
 *   §9  an answer arriving after `dispose()` draws nothing
 *   §10 `reload()` asks from the first page again; `onLoad` hears only the
 *       newest answer
 *   §11 a filter still being typed when an answer re-renders the row keeps its
 *       words and is still applied
 *
 * Against 0.6.0 nothing asks the source: §1 fails at its first assertion.
 *
 *     node tests/data_source.test.mjs
 */
import { dataTableEnv } from './dt_env.mjs';

const T = await dataTableEnv('data source');
const { check, ok, section, mount, bodyRows, click, tick } = T;

const headers = ['Id', 'Level', 'Message'];
const LOG = Array.from({ length: 250 }, (_, i) => [i + 1, ['info', 'warn', 'error'][i % 3], `event ${i + 1}`]);

/** A server whose answers the test hands out by hand, in any order. */
function server({ auto = false, data = LOG } = {}) {
    const calls = [];
    const answerFor = (query, over = {}) => {
        const rows = data.slice(query.offset, query.offset + query.limit);
        return { rows, total: data.length, ...over };
    };
    const fetch = (query, { signal } = {}) => {
        let resolve;
        let reject;
        const p = new Promise((res, rej) => { resolve = res; reject = rej; });
        const call = {
            query, signal, resolve, reject,
            answer: (over) => resolve(answerFor(query, over)),
        };
        calls.push(call);
        if (auto) call.answer();
        return p;
    };
    return { fetch, calls, last: () => calls.at(-1) };
}
const names = (host) => bodyRows(host).map((tr) => tr.children[0].textContent);

section('§1 the first render asks; the answer is drawn as given');
{
    const s = server();
    const { host, table } = mount({ headers, dataSource: s.fetch, sortable: true, filterable: true });
    check('nothing asked synchronously', s.calls.length, 0);
    await tick();
    check('one request', s.calls.length, 1);
    check('for the first page, sorted by nothing, filtered by nothing',
          s.last().query, { offset: 0, limit: 100, sort: null, filters: [], reason: 'initial' });
    ok('with an abort signal', s.last().signal && typeof s.last().signal.aborted === 'boolean');
    s.last().resolve({ rows: [[9, 'warn', 'z'], [2, 'info', 'a'], [5, 'error', 'm']], total: 3 });
    await tick();
    check('drawn in the server\'s order, not sorted here', names(host), ['9', '2', '5']);
    check('getPageInfo', table.getPageInfo(), { offset: 0, total: 3, hasMore: false });
    table.dispose();
}

section('§2 a sort is forwarded, from the first page');
{
    const s = server({ auto: true });
    const { host, table } = mount({ headers, dataSource: s.fetch, sortable: true });
    await tick();
    table._sourceGoTo(100);
    await tick();
    host.querySelectorAll('.twm-preview-table-header-wrap th')[1].click();
    check('the query carries the sort', s.last().query.sort, { column: 1, header: 'Level', ascending: true });
    check('…from offset 0, reason sort', [s.last().query.offset, s.last().query.reason], [0, 'sort']);
    table.sortBy(1);
    check('again: descending', s.last().query.sort.ascending, false);
    await tick();
    check('the server\'s page drawn as given', names(host).slice(0, 2), ['1', '2']);
    table.dispose();
}

section('§3 a column filter is forwarded, after its debounce');
{
    const s = server({ auto: true });
    const { host, table } = mount({ headers, dataSource: s.fetch, filterable: true });
    await tick();
    const input = host.querySelectorAll('.twm-data-table__filter-input')[2];
    input.value = 'needle';
    input.dispatchEvent(new T.window.Event('input', { bubbles: true }));
    const before = s.calls.length;
    await tick(50);
    check('not before the debounce', s.calls.length, before);
    await tick(250);
    check('then one request', s.calls.length, before + 1);
    check('carrying the filter', s.last().query.filters, [{ column: 2, header: 'Message', value: 'needle' }]);
    await tick();
    check('the answer is drawn though no row says "needle" (the server filters, not the table)',
          bodyRows(host).length, 100);
    table.dispose();
}

section('§4 only the newest answer paints');
{
    const s = server();
    const { host, table } = mount({ headers, dataSource: s.fetch, sortable: true });
    await tick();
    s.calls[0].answer();
    await tick();
    table.sortBy(0, true);            // request A
    table.sortBy(0, false);           // request B, newer
    const [a, b] = s.calls.slice(-2);
    ok('the older request was aborted when the newer went out', a.signal.aborted && !b.signal.aborted);
    b.resolve({ rows: [['B1', 'info', 'b'], ['B2', 'info', 'b']], total: 2 });
    await tick();
    check('the newest answer is drawn', names(host), ['B1', 'B2']);
    a.resolve({ rows: [['A1', 'info', 'a']], total: 1 });
    await tick();
    check('the older answer, arriving last, is dropped', names(host), ['B1', 'B2']);
    table.sortBy(1, true);            // request C
    table.sortBy(1, false);           // request D, newer
    const [c, d] = s.calls.slice(-2);
    d.resolve({ rows: [['D1', 'info', 'd']], total: 1 });
    await tick();
    c.reject(new Error('late failure'));
    await tick();
    check('an older request FAILING last is dropped too', names(host), ['D1']);
    ok('…with no banner', !host.querySelector('.twm-data-table__error'));
    table.dispose();
}

section('§5 a failure keeps the rows, under the banner');
{
    const s = server();
    const errors = [];
    const { host, table } = mount({ headers, dataSource: s.fetch, sortable: true,
                                    onLoadError: (err, q) => errors.push([err.message, q.reason]) });
    await tick();
    s.calls[0].answer();
    await tick();
    table.sortBy(2);
    s.last().reject(new Error('The server did not answer.'));
    await tick();
    check('the rows on screen stay', bodyRows(host).length, 100);
    const banner = host.querySelector('.twm-data-table__error');
    check('under a banner saying why', banner?.textContent.trim(), 'errorThe server did not answer.');
    check('role alert', banner?.getAttribute('role'), 'alert');
    check('onLoadError heard it', errors, [['The server did not answer.', 'sort']]);
    ok('the overlay is down', !host.querySelector('.twm-data-table__loading'));
    table.refresh();
    s.last().answer();
    await tick();
    ok('the next answer clears it', !host.querySelector('.twm-data-table__error'));
    table.dispose();
}

section('§6 paging, and a row\'s index');
{
    const s = server({ auto: true });
    const opened = [];
    const { host, table } = mount({ headers, dataSource: s.fetch, showRowNumbers: 'position',
                                    onRowActivate: (idx, row) => opened.push([idx, row[0]]) });
    await tick();
    const next = host.querySelector('[data-pager="next"]');
    ok('a Next button', next && !next.disabled);
    click(next);
    await tick();
    check('it asked for offset 100', [s.last().query.offset, s.last().query.reason], [100, 'page']);
    check('the page drawn', bodyRows(host).slice(0, 2).map((tr) => tr.children[1].textContent), ['101', '102']);
    check('\'position\' numbers count from the page\'s offset', names(host).slice(0, 2), ['101', '102']);
    click(bodyRows(host)[0].children[1]);
    check('a row\'s index is its place in the page drawn', opened, [[0, 101]]);
    table.setSelection([1]);
    check('…so selection reads the row it means', table.config.rows[table.getSelection()[0]][0], 102);
    check('the info line', host.querySelector('.twm-pagination-info').textContent, 'Rows 101–200 of 250');
    table.dispose();
}

section('§7 an empty answer under a filter keeps the filter row');
{
    const s = server();
    const { host, table } = mount({ headers, dataSource: s.fetch, filterable: true });
    await tick();
    s.last().answer();
    await tick();
    table.setFilter(2, 'nothing matches this');
    s.last().resolve({ rows: [], total: 0 });
    await tick();
    ok('the filter row is still there', host.querySelector('.twm-data-table__filter-row'));
    check('holding what was typed', host.querySelectorAll('.twm-data-table__filter-input')[2].value, 'nothing matches this');
    ok('the empty row says so', host.querySelector('.data-table__empty-row'));
    table.clearFilters();
    check('clearing it asks again, unfiltered', s.last().query.filters, []);
    table.dispose();
}

section('§8 while asking: the overlay, and the empty state kept quiet');
{
    const s = server();
    const { host, table } = mount({ headers, dataSource: s.fetch, emptyState: 'Nothing yet.' });
    await tick();
    ok('the overlay is up', host.querySelector('.twm-data-table__loading'));
    ok('the wrapper says loading (the empty state hides by it)',
       host.querySelector('.twm-data-table-component--loading'));
    s.last().resolve({ rows: [], total: 0 });
    await tick();
    ok('answered: the overlay is down', !host.querySelector('.twm-data-table__loading'));
    check('…and the empty state shows', host.querySelector('.twm-data-table__empty-cell')?.textContent, 'Nothing yet.');
    table.dispose();
}
{
    const s = server();
    const { host, table } = mount({ headers, dataSource: s.fetch });
    await tick();
    ok('without emptyState, the plain message is drawn by class so it is quiet too',
       host.querySelector('.twm-data-table__empty-cell--state') && host.querySelector('.twm-data-table-component--loading'));
    table.dispose();
}

section('§9 an answer after dispose() draws nothing');
{
    const s = server();
    const { host, table } = mount({ headers, dataSource: s.fetch });
    await tick();
    const call = s.last();
    table.dispose();
    ok('dispose aborted the request', call.signal.aborted);
    call.answer();
    await tick();
    check('nothing drawn into the host', host.children.length, 0);
}

section('§10 reload(), and onLoad');
{
    let level = '';
    const heard = [];
    const s = server();
    const fetch = (q, o) => s.fetch({ ...q, level }, o);
    const { table } = mount({ headers, dataSource: fetch, onLoad: (r, q) => heard.push([q.reason, r.rows.length]) });
    await tick();
    s.last().answer();
    await tick();
    table._sourceGoTo(200);
    s.last().answer();
    await tick();
    level = 'warn';                     // the consumer's own filter, outside the table
    const p = table.reload();
    check('reload asks from the first page, with the consumer\'s own state',
          [s.last().query.offset, s.last().query.reason, s.last().query.level], [0, 'reload', 'warn']);
    const stale = table.reload();
    s.calls.at(-2).answer();
    s.last().answer();
    check('the superseded reload resolves undefined', await p, undefined);
    ok('the newest resolves with its answer', (await stale)?.rows?.length === 100);
    check('onLoad heard each answer that was drawn, and not the dropped one', heard,
          [['initial', 100], ['page', 50], ['reload', 100]]);
    table.dispose();
}

section('§11 a filter still being typed survives an answer');
{
    const s = server();
    const { host, table } = mount({ headers, dataSource: s.fetch, filterable: true });
    await tick();
    s.last().answer();
    await tick();
    let input = host.querySelectorAll('.twm-data-table__filter-input')[2];
    input.focus();
    input.value = 'ev';
    input.dispatchEvent(new T.window.Event('input', { bubbles: true }));
    await tick(260);
    const asked = s.last();
    check('"ev" was asked for', asked.query.filters[0]?.value, 'ev');
    input.value = 'eve';                                    // still typing
    input.dispatchEvent(new T.window.Event('input', { bubbles: true }));
    asked.answer();                                         // the answer re-renders the row
    await tick();
    input = host.querySelectorAll('.twm-data-table__filter-input')[2];
    check('the box still holds what was typed', input.value, 'eve');
    ok('…and still has the focus', document.activeElement === input);
    await tick(260);
    check('and "eve" is asked for after its debounce', s.last().query.filters[0]?.value, 'eve');
    table.dispose();
}

T.done();
