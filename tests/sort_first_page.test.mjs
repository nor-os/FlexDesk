/**
 * A NEW SORT STARTS AT THE FIRST PAGE — WHEN THE TABLE ASKS FOR IT.
 *
 * A client-paged DataTable keeps `_state.offset` across `sortBy`, so sorting
 * while on page 3 draws rows 21–30 of the NEW order under "Page 3 of 3" — which
 * reads as "it only sorted this page", and hides the row the person sorted to
 * find (the smallest, the largest) two pages away. A new filter already started
 * at the first page (`_onFilterInput`, `clearFilters`).
 *
 * `resetPageOnSort: true` makes a new order do the same. It is OFF by default,
 * and §0 is the half that says why that matters: a sort kept the page before
 * the key existed, and a table that does not ask must keep it (the 0.4.7
 * review: an unconditional reset changed every client-paged table in every
 * consumer that never asked — D6, additive and back-compatible).
 *
 *   §0  without the key: sortBy() and a header click on page 3 STAY on page 3,
 *       exactly as before the key existed
 *   §1  with it, sortBy() while on page 3 draws the first page of the new order
 *   §2  with it, clicking a sortable header does the same (the gesture a person
 *       makes)
 *   §3  with it, toggling the direction of the same column starts at the first
 *       page too
 *   §4  server-side paging, with the key on: the consumer's `offset` is still
 *       the consumer's — the reset touches only the client-side page, and
 *       onSort is still told
 *
 * Against 0.4.6's data_table.js (no key, never resets) §1–§3 fail; against the
 * first 0.4.7 cut (e17e637, an unconditional reset) §0 fails.
 *
 *     node tests/sort_first_page.test.mjs
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';
import { existsSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));

let JSDOM = null;
try {
    ({ JSDOM } = await import('jsdom'));
} catch {
    for (const c of [
        resolvePath(HERE, '../../Tables/web/node_modules/jsdom/lib/api.js'),
        resolvePath(HERE, '../../Tables/node_modules/jsdom/lib/api.js'),
    ]) {
        if (!existsSync(c)) continue;
        ({ JSDOM } = createRequire(import.meta.url)(c));
        break;
    }
}
if (!JSDOM) {
    console.log('sort first page: SKIPPED — needs jsdom '
        + '(`cd ../Tables/web && npm install`, or `npm i -D jsdom` here)');
    process.exit(0);
}

const dom = new JSDOM('<!doctype html><body></body>',
                      { url: 'http://localhost/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'Event',
                   'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'getComputedStyle',
                   'navigator', 'requestAnimationFrame', 'cancelAnimationFrame',
                   'MutationObserver']) {
    if (dom.window[key] !== undefined && globalThis[key] === undefined) {
        globalThis[key] = dom.window[key];
    }
}
globalThis.ResizeObserver ||= class { observe() {} unobserve() {} disconnect() {} };

const { DataTable } = await import('../src/ui/components/data_table.js');

let failures = 0;
function check(name, actual, expected) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) { failures++; console.error(`  FAIL ${name}\n    got      ${a}\n    expected ${e}`); }
    else console.log(`  ok   ${name}`);
}

// Thirty rows whose `Value` is a permutation of 0–29 (7 and 30 are coprime),
// so the sorted order differs from the stored one on every page.
const ROWS = Array.from({ length: 30 }, (_, i) => [`n${String(i).padStart(2, '0')}`, (i * 7) % 30]);
const headers = ['Name', 'Value'];
const PAGE = 10;

function mount(config = {}) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const table = new DataTable(host, {
        headers, rows: ROWS, pageSize: PAGE, sortable: true,
        selectable: false, copyable: false, ...config,
    });
    table.render();
    return { host, table };
}
const resetting = (config = {}) => mount({ resetPageOnSort: true, ...config });

/** The `Value` cells of the rows on screen, in order. */
const shownValues = (host) => [...host.querySelectorAll('tbody tr')]
    .filter((tr) => tr.__rowIndex !== undefined)
    .map((tr) => Number(tr.children[1].textContent));
const pageLabel = (host) => [...host.querySelectorAll('.twm-pagination-controls span')]
    .map((s) => s.textContent).find((t) => /^Page /.test(t));
const range = (a, b) => Array.from({ length: b - a }, (_, i) => a + i);
const valueHeader = (host) => [...host.querySelectorAll('th.sortable')]
    .find((t) => t.textContent.startsWith('Value'));
const click = (el) => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));

console.log('\n§0 without resetPageOnSort: the page is kept, as before the key existed');
{
    const { host, table } = mount();
    table.goToPage(2);
    table.sortBy(1, true);
    check('sortBy() on page 3 draws page 3 of the new order', shownValues(host), range(20, 30));
    check('the pager still says page 3', pageLabel(host), 'Page 3 of 3');
}
{
    const { host, table } = mount();
    table.goToPage(2);
    click(valueHeader(host));
    check('a header click on page 3 stays on page 3', [pageLabel(host), shownValues(host)],
        ['Page 3 of 3', range(20, 30)]);
}

console.log('\n§1 sortBy() while on page 3, resetPageOnSort: true');
{
    const { host, table } = resetting();
    table.goToPage(2);
    check('on page 3 before the sort', pageLabel(host), 'Page 3 of 3');
    table.sortBy(1, true);
    check('the first page of the new order is drawn', shownValues(host), range(0, 10));
    check('the pager says page 1', pageLabel(host), 'Page 1 of 3');
}

console.log('\n§2 a header click while on page 3, resetPageOnSort: true');
{
    const { host, table } = resetting();
    table.goToPage(2);
    click(valueHeader(host));
    check('the first page of the ascending order is drawn', shownValues(host), range(0, 10));
    check('the pager says page 1', pageLabel(host), 'Page 1 of 3');
}

console.log('\n§3 the same column toggled, from page 2, resetPageOnSort: true');
{
    const { host, table } = resetting();
    table.sortBy(1, true);
    table.goToPage(1);
    check('page 2 of the ascending order', shownValues(host), range(10, 20));
    table.sortBy(1);                         // toggles to descending
    check('the first page of the descending order', shownValues(host), range(20, 30).reverse());
    check('the pager says page 1', pageLabel(host), 'Page 1 of 3');
}

console.log('\n§4 server-side paging keeps the consumer\'s offset, resetPageOnSort: true');
{
    const sorts = [];
    const page3 = ROWS.slice(20, 30);
    const { host, table } = resetting({
        rows: page3, totalCount: 30, offset: 20,
        onPageChange: () => {}, onSort: (col, asc) => { sorts.push([col, asc]); },
    });
    table.sortBy(1, false);
    check('onSort is told', sorts, [[1, false]]);
    check('the consumer\'s offset is untouched', table.config.offset, 20);
    check('the pager still reads the consumer\'s page', pageLabel(host), 'Page 3 of 3');
}

if (failures) {
    console.error(`\nsort first page: ${failures} FAILED`);
    process.exit(1);
}
console.log('\nsort first page: all green');
