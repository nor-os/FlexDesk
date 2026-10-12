/**
 * STORY-0010 `persistPage` — THE PAGE YOU WERE ON, REMEMBERED WITH THE SORT AND
 * THE FILTERS.
 *
 * A table with `persistKey` came back with its sort, its filters and its column
 * widths, and on page 1: leave a queue on page 4, come back, and you were three
 * pages from where you left. `persistPage: true` saves the client page in the
 * same blob and restores it on mount. It is OFF by default, because a key
 * shared by DIFFERENT row sets (an ad-hoc filter, search results) must not
 * reopen on a page of the last list (BugDesk BUG-0013).
 *
 *   §0  without it: the blob is 0.9.1's (no `offset`), and a saved offset is
 *       not applied — the table opens on page 1
 *   §1  with it: a page turned (pager button, goToPage, goToRow) is saved, and
 *       a new table under the key opens on that page, sort and filters applied
 *   §2  rows that shrank since: the last page; an offset off a page boundary
 *       is put on one
 *   §3  a sort under `resetPageOnSort` and a new filter save the first page
 *   §4  rows set after mount (`rows: []`, then `setData`): the page waits for them
 *   §5  server-side paging: the offset is the consumer's, and nothing restores it
 *
 * Against 0.9.1, §1–§4 fail.
 *
 *     node tests/persist_page.test.mjs
 */
import { dataTableEnv } from './dt_env.mjs';

const T = await dataTableEnv('persist page');
const { check, ok, section, mount, bodyRows, click, tick } = T;

const headers = ['Id', 'Value'];
const rows = Array.from({ length: 30 }, (_, i) => [`r${i}`, i]);
const firstId = (host) => bodyRows(host)[0]?.children[0].textContent;

/** The store DataTable is given: `createTableStateStore`'s interface, in memory. */
function memoryStore(seed = {}) {
    const map = { ...seed };
    return {
        map,
        ready: () => Promise.resolve(map),
        get: (k) => map[k] || null,
        set: (k, s) => { if (s == null) delete map[k]; else map[k] = JSON.parse(JSON.stringify(s)); },
    };
}

section('§0 without persistPage');
{
    const store = memoryStore();
    const { table } = mount({ headers, rows, pageSize: 10, sortable: true, stateStore: store, persistKey: 'q' });
    table.goToPage(2);
    table.sortBy(1);
    ok('the blob is 0.9.1\'s: no offset', !('offset' in store.map.q));
    check('…key for key', Object.keys(store.map.q), ['sortColumn', 'sortAscending', 'filters', 'colWidths']);
    table.dispose();
}
{
    const store = memoryStore({ q: { sortColumn: null, filters: [], colWidths: {}, offset: 20 } });
    const { host, table } = mount({ headers, rows, pageSize: 10, stateStore: store, persistKey: 'q' });
    check('a saved offset is not applied', firstId(host), 'r0');
    table.dispose();
}

section('§1 the page is saved and restored');
{
    const store = memoryStore();
    const cfg = { headers, rows, pageSize: 10, sortable: true, filterable: true,
                  stateStore: store, persistKey: 'q', persistPage: true };
    const a = mount(cfg);
    a.table.sortBy(1, false);
    click(a.host.querySelector('.twm-pagination-controls button:not([disabled])[title="Next page"]')
          || [...a.host.querySelectorAll('.twm-pagination-controls button')].find((b) => /next/i.test(b.title || b.getAttribute('data-tooltip') || b.textContent)));
    check('a pager button saves the page', store.map.q.offset, 10);
    a.table.goToPage(2);
    check('goToPage saves it', store.map.q.offset, 20);
    a.table.goToRow(12);
    check('goToRow saves it', store.map.q.offset, 10);
    a.table.goToPage(2);
    a.table.dispose();

    const b = mount(cfg);
    check('a new table opens on the saved page, in the saved order', firstId(b.host), 'r9');
    check('…and its pager says so', /21/.test(b.host.querySelector('.twm-pagination-controls')?.textContent || ''), true);
    b.table.dispose();
}

section('§2 the rows shrank; an offset off a page');
{
    const store = memoryStore({ q: { sortColumn: null, filters: [], colWidths: {}, offset: 20 } });
    const cfg = { headers, pageSize: 10, stateStore: store, persistKey: 'q', persistPage: true };
    const { host, table } = mount({ ...cfg, rows: rows.slice(0, 15) });
    check('15 rows: the last page, not an empty third', firstId(host), 'r10');
    table.dispose();
    store.map.q.offset = 17;
    const b = mount({ ...cfg, rows });
    check('offset 17 opens the page holding it', firstId(b.host), 'r10');
    b.table.dispose();
    store.map.q = { sortColumn: null, filters: [[1, '>24']], colWidths: {}, offset: 20 };
    const c = mount({ ...cfg, rows, filterable: true });
    check('a restored filter that leaves one page: that page', firstId(c.host), 'r25');
    c.table.dispose();
}

section('§3 a new order or a new filter starts at page 1, and says so');
{
    const store = memoryStore();
    const cfg = { headers, rows, pageSize: 10, sortable: true, filterable: true, resetPageOnSort: true,
                  stateStore: store, persistKey: 'q', persistPage: true };
    const a = mount(cfg);
    a.table.goToPage(2);
    a.table.sortBy(1, false);
    check('a sort under resetPageOnSort saves page 1', store.map.q.offset, 0);
    a.table.dispose();
    const b = mount(cfg);
    check('…and the table opens there', firstId(b.host), 'r29');
    b.table.goToPage(2);
    b.table.setFilter(1, '>5');
    check('a new filter saves page 1', store.map.q.offset, 0);
    b.table.dispose();
}

section('§4 rows set after mount');
{
    const store = memoryStore({ q: { sortColumn: null, filters: [], colWidths: {}, offset: 20 } });
    const { host, table } = mount({ headers, rows: [], pageSize: 10, stateStore: store, persistKey: 'q', persistPage: true });
    ok('no rows: nothing drawn yet', !bodyRows(host).length);
    table.setData({ rows });
    check('the rows arrive: the saved page', firstId(host), 'r20');
    table.dispose();
}
{
    // The store answers late (its read had not finished at construction).
    const map = {};
    let resolve;
    const store = { ready: () => new Promise((r) => { resolve = r; }), get: (k) => map[k] || null, set: (k, s) => { map[k] = s; } };
    const { host, table } = mount({ headers, rows, pageSize: 10, stateStore: store, persistKey: 'q', persistPage: true });
    check('before the store has read: page 1', firstId(host), 'r0');
    map.q = { sortColumn: null, filters: [], colWidths: {}, offset: 10 };
    resolve(map);
    await tick();
    check('once it has: the saved page', firstId(host), 'r10');
    table.dispose();
}

section('§5 server-side paging');
{
    const store = memoryStore({ q: { sortColumn: null, filters: [], colWidths: {}, offset: 20 } });
    const page = rows.slice(0, 10);
    const { host, table } = mount({ headers, rows: page, totalCount: 30, offset: 0, pageSize: 10,
                                    onPageChange: () => {}, stateStore: store, persistKey: 'q', persistPage: true });
    check('the page drawn is the consumer\'s', firstId(host), 'r0');
    table.dispose();
}

T.done();
