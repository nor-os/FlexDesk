/**
 * 0.7.0 — THE TWO PARTS OF THE RELEASE TOGETHER (the release review).
 *
 * Each part's suites prove its options one at a time. This one puts them on
 * one page the way a log viewer and an administration screen will:
 *
 *   §1 a `dataSource` table with `rowDetail`, `follow` and
 *      `keepWhileDetached: true` under `autoDispose`, taken out of the page
 *      and put back: nothing is read while it is out, nothing is disposed, and
 *      back in, the tail is followed again with the detail still open
 *   §2 the same with a NUMBER grace: out longer than it, the table is disposed
 *      and its follow timer with it — no read after the dispose
 *   §3 focus inside an open detail survives a follow tick, and a reader
 *      selecting text in a detail is not re-drawn under (a tick waits)
 *   §4 without `getRowKey`, a row's index says nothing across two answers of
 *      a `dataSource`: a detail opened on one page does not open on the next
 *      page, nor after a sort, and `expandedRows` still opens on the FIRST
 *   §5 `goToPage` / `goToRow` under `dataSource` ask the source for that page
 *   §6 a record list beside a table: each keeps its own keys, opens its own
 *      record, and neither one's arrow keys move the other
 *
 *     node tests/release_070_interplay.test.mjs
 */
import { dataTableEnv } from './dt_env.mjs';

const T = await dataTableEnv('0.7.0 interplay');
const { check, ok, section, mount, bodyRows, click, key, tick, document, window } = T;
const { createRecordList } = await import('../src/ui/components/record_list.js');
const { createFactTable } = await import('../src/ui/components/fact_table.js');

const headers = ['Id', 'What'];
/** A newest-first feed whose head can grow between reads. */
function feed(n = 300) {
    let top = n;
    const calls = [];
    const fetch = (q) => {
        calls.push(q);
        const page = [];
        for (let id = top - q.offset; id > top - q.offset - q.limit && id > 0; id--) page.push([`e${id}`, `event ${id}`]);
        return Promise.resolve({ rows: page, total: null });
    };
    return { fetch, calls, add: (k) => { top += k; } };
}
const ids = (host) => bodyRows(host).map((tr) => tr.children[0].textContent.trim());
const keyed = { getRowKey: (row) => row[0] };
const detailOf = (host) => host.querySelector('.twm-dt-detail-row')?.previousElementSibling?.children[0].textContent.trim();

section('§1 dataSource + rowDetail + follow + keepWhileDetached: true, out and back');
{
    const f = feed();
    const { host, table } = mount({
        headers, dataSource: f.fetch, ...keyed, pageSize: 50,
        rowDetail: (row) => `about ${row[0]}`,
        follow: { interval: 20 }, autoDispose: true, keepWhileDetached: true,
    });
    await tick(); await tick();
    table.setRowExpanded('e298', true);
    check('the detail is under e298', detailOf(host), 'e298');
    host.remove();
    const before = f.calls.length;
    await tick(120);
    check('out of the page: no read on any tick', f.calls.length, before);
    ok('…and not disposed', !!table._wrapperEl && table.isFollowing());
    f.add(2);
    document.body.appendChild(host);
    await tick(80);
    ok('back in: followed again', f.calls.length > before && f.calls.at(-1).reason === 'refresh');
    check('the two that arrived are on top', ids(host).slice(0, 3), ['e302', 'e301', 'e300']);
    check('the detail is still under e298', detailOf(host), 'e298');
    table.dispose();
    const after = f.calls.length;
    await tick(80);
    check('disposed: no read after', f.calls.length, after);
    host.remove();
}

section('§2 a NUMBER grace: out longer than it, disposed, and the follow timer with it');
{
    const f = feed();
    const { host, table } = mount({
        headers, dataSource: f.fetch, ...keyed, rowDetail: (row) => `about ${row[0]}`,
        follow: { interval: 15 }, autoDispose: true, keepWhileDetached: 40,
    });
    await tick(); await tick();
    host.remove();
    await tick(140);
    ok('disposed after its grace', !table._wrapperEl);
    const n = f.calls.length;
    await tick(80);
    check('no read after the dispose', f.calls.length, n);
}

section('§3 a reader inside an open detail is not drawn under by a follow tick');
{
    const f = feed();
    const { host, table } = mount({
        headers, dataSource: f.fetch, ...keyed, follow: { interval: 20 },
        rowDetail: (row, i, { host: h }) => {
            const b = document.createElement('button');
            b.className = 'copy'; b.textContent = `copy ${row[0]}`;
            const p = document.createElement('pre');
            p.textContent = `trace of ${row[0]}`;
            h.append(b, p);
        },
    });
    await tick(); await tick();
    table.setRowExpanded('e299', true);
    const btn = host.querySelector('.twm-dt-detail .copy');
    btn.focus();
    ok('focus is on the detail\'s button', document.activeElement === btn);
    const n0 = f.calls.length;
    f.add(1);
    await tick(80);
    check('no tick read while the focus is in the detail', f.calls.length, n0);
    const now = document.activeElement;
    ok('focus is still on that detail\'s button', now === btn);
    // A refresh the consumer asks for is not a tick: it reads at once, and
    // the focus is put back on the same place in the detail drawn again.
    f.add(1);
    await table.refresh();
    const again = document.activeElement;
    ok('an explicit refresh() redrew the detail…', again !== now && !now.isConnected);
    ok('…and the focus is on the same button in it', again?.classList?.contains('copy') && again.textContent === 'copy e299');
    // A reader selecting text in a detail: the tick waits rather than redraw
    // the text out from under the selection.
    again.blur();
    const pre = host.querySelector('.twm-dt-detail pre');
    const range = document.createRange();
    range.selectNodeContents(pre);
    const sel = window.getSelection();
    sel.removeAllRanges(); sel.addRange(range);
    const n = f.calls.length;
    f.add(1);
    await tick(80);
    check('no read while text in the table is selected', f.calls.length, n);
    ok('the selected text is still in the document', pre.isConnected && !sel.isCollapsed);
    sel.removeAllRanges();
    await tick(80);
    ok('the selection gone, following resumes', f.calls.length > n);
    table.dispose();
    host.remove();
}

section('§4 without getRowKey, an index does not carry a detail to another answer');
{
    const f = feed();
    const { host, table } = mount({ headers, dataSource: f.fetch, pageSize: 10, sortable: true,
                                    rowDetail: (row) => `about ${row[0]}`, expandedRows: [1] });
    await tick(); await tick();
    check('expandedRows opens on the first answer', detailOf(host), 'e299');
    await table._sourceGoTo(10);
    check('page 2: nothing open', host.querySelectorAll('.twm-dt-detail-row').length, 0);
    check('…and none is said to be', table.getExpandedRows(), []);
    table.setRowExpanded(0, true);
    check('opened on page 2', detailOf(host), 'e290');
    click(host.querySelectorAll('thead th')[0]);
    await tick(); await tick();
    check('after a sort: nothing open', host.querySelectorAll('.twm-dt-detail-row').length, 0);
    table.dispose();
    host.remove();
}
{
    // With a key, the page change keeps what is open (it opens again when its
    // row comes back): the rule above is about index keys only.
    const f = feed();
    const { host, table } = mount({ headers, dataSource: f.fetch, pageSize: 10, ...keyed,
                                    rowDetail: (row) => `about ${row[0]}` });
    await tick(); await tick();
    table.setRowExpanded('e299', true);
    await table._sourceGoTo(10);
    await table._sourceGoTo(0);
    check('keyed: open again on the way back', detailOf(host), 'e299');
    table.dispose();
    host.remove();
}

section('§5 goToPage and goToRow under dataSource ask the source');
{
    const f = feed();
    const { host, table } = mount({ headers, dataSource: f.fetch, pageSize: 10, ...keyed });
    await tick(); await tick();
    await table.goToPage(3);
    check('goToPage(3) asked for offset 30', [f.calls.at(-1).offset, f.calls.at(-1).reason], [30, 'page']);
    check('…and drew it', ids(host)[0], 'e270');
    await table.goToRow(57);
    check('goToRow(57) asked for offset 50', f.calls.at(-1).offset, 50);
    check('…and drew it', ids(host)[0], 'e250');
    table.dispose();
    host.remove();
}

section('§6 a record list beside a table on one page');
{
    const page = document.createElement('div');
    document.body.appendChild(page);
    const listHost = document.createElement('div');
    const factHost = document.createElement('div');
    const tableHost = document.createElement('div');
    page.append(listHost, factHost, tableHost);
    const opened = [];
    const list = createRecordList(listHost, {
        records: [{ id: 'a', name: 'Alpha', facts: ['one'] }, { id: 'b', name: 'Beta', facts: ['two'] }],
        onActivate: (r) => opened.push(['record', r.id]),
    });
    createFactTable(factHost, { rows: [{ label: 'Rows', value: '300' }] });
    const f = feed();
    const table = new T.DataTable(tableHost, {
        headers, dataSource: f.fetch, ...keyed, rowDetail: (row) => `about ${row[0]}`, selectable: 'single', activateOn: ['click', 'enter'],
        onRowActivate: (i, row) => opened.push(['row', row[0]]),
    });
    table.render();
    await tick(); await tick();
    const rec = listHost.querySelector('li');
    rec.focus();
    key(rec, 'ArrowDown');
    ok('ArrowDown in the list moved within the list', listHost.contains(document.activeElement)
        && document.activeElement !== rec);
    check('…and opened no detail in the table', table.getExpandedRows(), []);
    key(document.activeElement, 'Enter');
    check('Enter opened the record, not a row', opened, [['record', 'b']]);
    click(bodyRows(tableHost)[1]);
    check('a click opened a row of the table, not a record', opened.at(-1), ['row', 'e299']);
    const tbl = tableHost.querySelector('table[tabindex]') || tableHost.querySelector('.twm-preview-table-wrap table');
    tbl.focus();
    key(tbl, 'ArrowRight');
    ok('ArrowRight on the table opened its current row\'s detail', table.getExpandedRows().length === 1);
    ok('…and the list did not move', !listHost.contains(document.activeElement));
    key(tbl, 'Enter');
    const before = opened.length;
    key(tbl, 'ArrowLeft');
    check('ArrowLeft closed it', table.getExpandedRows(), []);
    key(tbl, 'Enter');
    ok('Enter on the table opened its row again', opened.length === before + 1 && opened.at(-1)[1] === 'e299');
    const allIds = [...page.querySelectorAll('[id]')].map((e) => e.id);
    check('no id is used twice on the page', allIds.length, new Set(allIds).size);
    list.dispose?.();
    table.dispose();
    page.remove();
}

T.done();
