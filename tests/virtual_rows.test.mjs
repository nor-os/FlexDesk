/**
 * C10 — DataTable's VIRTUAL WINDOW: only the rows near the viewport in the DOM.
 *
 * What jsdom can check is the bookkeeping: which rows are drawn, how tall the
 * spacers say the rest is, that a row still on screen is the SAME node after
 * the window slides, that the stripe parity survives, that widths go on the
 * `<colgroup>` and not on whichever row is first, and that every row stays
 * reachable. What it cannot check is layout — a real row height, a header
 * lined up with its column. Those are measured in a browser (Tables' headless
 * Edge probe over a 6,000-row grid); this file is the half that needs none.
 *
 *   §1  off by default: a table that does not ask draws every row, as before
 *   §2  on: a bounded window, a bottom spacer for the rest, a colgroup
 *   §3  scrolled: the window follows, the spacers add up, the stripe holds
 *   §4  a row that stays in the window is never moved or rebuilt
 *   §5  onRowsRendered hears about added and removed rows, and not about render()'s own
 *   §6  scrollToRow reaches the last row
 *   §7  virtualRowHeight: a zero-height row is not drawn at all
 *   §8  updateRow on a row outside the window is not lost
 *   §9  widths go on the <col>s, and measuring skips spacers
 *   §10 an explicit auto-size fits every loaded row, not only the window
 *
 *     node tests/virtual_rows.test.mjs
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
    console.log('virtual rows: SKIPPED — needs jsdom '
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
function ok(name, cond, detail = '') {
    if (!cond) { failures++; console.error(`  FAIL ${name}${detail ? `\n    ${detail}` : ''}`); }
    else console.log(`  ok   ${name}`);
}

const ROWS = 5000;
const H = 20;               // the estimate; jsdom measures every row as 0 tall
const OVERSCAN = 5;
const makeRows = (n) => Array.from({ length: n }, (_, i) => [`r${i}`, i, i % 3 ? 'x' : 'y']);
const headers = ['Name', 'N', 'Tag'];

/** jsdom has no layout: give the scroll box a height and a working scrollTop. */
function fakeGeometry(table, height) {
    const wrap = table.scrollElement;
    let top = 0;
    Object.defineProperty(wrap, 'clientHeight', { configurable: true, get: () => height });
    Object.defineProperty(wrap, 'scrollTop', {
        configurable: true, get: () => top, set: (v) => { top = Math.max(0, v); },
    });
    return {
        scrollTo(y) { wrap.scrollTop = y; wrap.dispatchEvent(new dom.window.Event('scroll')); },
    };
}
const bodyOf = (host) => host.querySelector('.twm-preview-table-wrap tbody');
const dataRows = (host) => [...bodyOf(host).children].filter((tr) => tr.__rowIndex !== undefined);
const spacer = (host, edge) => bodyOf(host).querySelector(`.twm-dt-spacer--${edge}`);
const spacerH = (host, edge) => {
    const s = spacer(host, edge);
    return s ? parseFloat(s.firstChild.style.height) : 0;
};

function mount(config) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const table = new DataTable(host, {
        headers, pagination: false, onPageChange: () => {}, offset: 0,
        selectable: false, copyable: false, showRowNumbers: true, ...config,
    });
    table.render();
    return { host, table };
}

console.log('\n§1 off by default');
{
    const { host } = mount({ rows: makeRows(500) });
    check('every row is drawn', dataRows(host).length, 500);
    ok('no spacer rows', !host.querySelector('.twm-dt-spacer'));
    ok('no colgroup', !host.querySelector('colgroup'));
}

console.log('\n§2 on: a bounded window');
const rows = makeRows(ROWS);
const rendered = [];
const dropped = [];
const { host, table } = mount({
    rows, virtualize: { rowHeight: H, overscan: OVERSCAN },
    onRowsRendered: ({ rows: added, removed }) => {
        rendered.push(...added);
        dropped.push(...(removed || []));
    },
});
{
    const drawn = dataRows(host);
    ok('far fewer rows than the table holds', drawn.length > 0 && drawn.length < 100,
       `${drawn.length} rows in the DOM`);
    check('the window starts at the first row', drawn[0].__rowIndex, 0);
    ok('no top spacer at the top', !spacer(host, 'top'));
    check('the bottom spacer is everything below the window',
          spacerH(host, 'bottom'), (ROWS - drawn.length) * H);
    check('a <col> per DOM column, row numbers included',
          host.querySelectorAll('.twm-preview-table-wrap colgroup > col').length, headers.length + 1);
    check('render() reports nothing through onRowsRendered', rendered.length, 0);
}

console.log('\n§3 scrolled');
const geo = fakeGeometry(table, 400);            // 20 rows visible
{
    geo.scrollTo(2500 * H);
    const drawn = dataRows(host);
    const first = drawn[0].__rowIndex;
    const last = drawn.at(-1).__rowIndex;
    ok('the window covers row 2500', first <= 2500 && last >= 2519, `${first}..${last}`);
    ok('…with the overscan and no more', drawn.length <= 20 + 2 * OVERSCAN + 2,
       `${drawn.length} rows`);
    check('the top spacer is every row above the window', spacerH(host, 'top'), first * H);
    check('the bottom spacer is every row below it', spacerH(host, 'bottom'), (ROWS - 1 - last) * H);
    check('drawn rows are contiguous', drawn.map((tr) => tr.__rowIndex),
          Array.from({ length: drawn.length }, (_, i) => first + i));
    // THE STRIPE: `tr:nth-child(even)`. In a full render row i is child i + 1.
    const kids = [...bodyOf(host).children];
    const parityOk = drawn.every((tr) => (kids.indexOf(tr) + 1) % 2 === (tr.__rowIndex + 1) % 2);
    ok('each row sits at a position of the same parity as in a full render', parityOk);
    geo.scrollTo(2501 * H);
    const kids2 = [...bodyOf(host).children];
    ok('…and still does one row later (the filler follows the start)',
       dataRows(host).every((tr) => (kids2.indexOf(tr) + 1) % 2 === (tr.__rowIndex + 1) % 2));
}

console.log('\n§4 a row that stays is the same node');
{
    geo.scrollTo(3000 * H);
    const before = new Map(dataRows(host).map((tr) => [tr.__rowIndex, tr]));
    const keep = before.get(3010);
    keep.dataset.marker = 'still-me';
    rendered.length = 0;
    dropped.length = 0;
    geo.scrollTo(3008 * H);                       // past the hysteresis band
    const after = new Map(dataRows(host).map((tr) => [tr.__rowIndex, tr]));
    ok('the window moved', [...after.keys()].at(-1) !== [...before.keys()].at(-1));
    ok('row 3010 is the very same element', after.get(3010) === keep && keep.isConnected
       && keep.dataset.marker === 'still-me');
    const shared = [...after.keys()].filter((k) => before.has(k));
    ok('every row in both windows is the same element',
       shared.length > 0 && shared.every((k) => after.get(k) === before.get(k)));

    console.log('\n§5 onRowsRendered');
    const added = [...after.keys()].filter((k) => !before.has(k));
    check('reports exactly the rows added, in order',
          rendered.map((tr) => tr.__rowIndex), added);
    ok('…all of them connected', rendered.every((tr) => tr.isConnected));
    // AND ABOUT THE ROWS IT TOOK OUT. An embedder that injected rows of its own
    // beside them (a group header) or holds an editor in one has to hear it.
    const gone = [...before.keys()].filter((k) => !after.has(k));
    check('reports exactly the rows removed', dropped.map((tr) => tr.__rowIndex).sort((a, b) => a - b),
          gone);
    ok('…all of them already detached', dropped.every((tr) => !tr.isConnected));
}

console.log('\n§6 scrollToRow');
{
    const tr = table.scrollToRow(ROWS - 1);
    check('returns the last row', tr?.__rowIndex, ROWS - 1);
    ok('drawn', tr?.isConnected === true);
    ok('no bottom spacer at the end', !spacer(host, 'bottom'));
    check('scrolled so it is the last thing on screen',
          table.scrollElement.scrollTop, ROWS * H - 400);
    check('getRowElement agrees', table.getRowElement(ROWS - 1), tr);
    check('and says null for a row outside the window', table.getRowElement(0), null);
    const top = table.scrollToRow(0, { block: 'start' });
    check('and back to the first', top?.__rowIndex, 0);
}

console.log('\n§7 virtualRowHeight');
{
    // Every tenth row carries 10px of something the embedder draws in front of
    // it; rows 100–199 are hidden and must not be drawn at all.
    const { host: h2, table: t2 } = mount({
        rows: makeRows(1000), virtualize: { rowHeight: H, overscan: OVERSCAN },
        virtualRowHeight: (i, base) => (i >= 100 && i < 200 ? 0 : base + (i % 10 === 0 ? 10 : 0)),
    });
    const g2 = fakeGeometry(t2, 400);
    const total = 900 * H + 90 * 10;
    g2.scrollTo(0);
    t2.scrollToRow(150);
    check('a hidden row cannot be scrolled to', t2.scrollToRow(150), null);
    g2.scrollTo(100 * H + 10 * 10 - 50);       // straddling the hidden run
    const drawn = dataRows(h2).map((tr) => tr.__rowIndex);
    ok('no hidden row is drawn', drawn.every((i) => i < 100 || i >= 200),
       JSON.stringify(drawn));
    ok('the rows on both sides of the hidden run are', drawn.includes(99) && drawn.includes(200),
       JSON.stringify(drawn));
    check('spacers + drawn rows account for the whole height',
          spacerH(h2, 'top') + spacerH(h2, 'bottom')
          + drawn.reduce((a, i) => a + H + (i % 10 === 0 ? 10 : 0), 0), total);
}

console.log('\n§8 updateRow outside the window');
{
    table.scrollToRow(0, { block: 'start' });
    ok('row 4000 is not drawn', !table.getRowElement(4000));
    check('updateRow says it drew nothing', table.updateRow(4000, ['changed', 4000, 'z']), false);
    const tr = table.scrollToRow(4000);
    check('…but the row comes back with the new value', tr?.children[1]?.textContent, 'changed');
}

console.log('\n§9 widths go on the colgroup');
{
    table._colWidths = { 0: 40, 1: 150, 2: 60, 3: 70 };
    table._colWidthsSig = table._colSig();
    table.scrollToRow(2500, { block: 'start' });
    table._syncHeaderWidths();
    const cols = [...host.querySelectorAll('.twm-preview-table-wrap colgroup > col')];
    check('each <col> carries its width', cols.map((c) => c.style.width),
          ['40px', '150px', '60px', '70px']);
    ok('no body cell carries one — the first row is not the track',
       dataRows(host).every((tr) => [...tr.children].every((td) => !td.style.width)));
    const ths = [...host.querySelectorAll('.twm-preview-table-header-wrap thead > tr:first-child > th')];
    check('the header cells carry the same widths', ths.map((th) => th.style.width),
          ['40px', '150px', '60px', '70px']);
    check('the first body row asked for is a row of data, not a spacer',
          table._firstBodyRow()?.__rowIndex, dataRows(host)[0].__rowIndex);
    table._pinColumnWidth(2, 99);
    check('a drag writes the <col>', cols[2].style.width, '99px');
}

console.log('\n§10 an explicit auto-size fits every loaded row, not only the window');
{
    // The longest Name is at row 3000, far outside the window. jsdom has no
    // layout, so `max-content` is simulated the way a browser computes it for
    // `table-layout: auto`: while the tables are measuring, a cell is as wide as
    // the longest text in its column ACROSS EVERY ROW IN THE TBODY — which is
    // exactly the set the window limits, and what the fix has to widen.
    const long = makeRows(5000);
    long[3000][0] = 'x'.repeat(60);
    const { host: h3, table: t3 } = mount({
        rows: long, virtualize: { rowHeight: H, overscan: OVERSCAN },
    });
    const PX = 7;
    const proto = dom.window.HTMLElement.prototype;
    const real = proto.getBoundingClientRect;
    proto.getBoundingClientRect = function () {
        let w = 0;
        const table = this.closest?.('table');
        if ((this.tagName === 'TD' || this.tagName === 'TH')
            && table?.classList.contains('twm-dt-measuring')) {
            const idx = [...this.parentElement.children].indexOf(this);
            const body = table.tBodies[0];
            w = this.textContent.length * PX;
            if (body && this.tagName === 'TD') {
                for (const tr of body.rows) {
                    if (tr.__rowIndex === undefined) continue;
                    const td = tr.children[idx];
                    if (td) w = Math.max(w, td.textContent.length * PX);
                }
            }
        }
        return { x: 0, y: 0, top: 0, left: 0, right: w, bottom: 0, width: w, height: 0 };
    };
    const trsBefore = bodyOf(h3).children.length;
    try {
        ok('row 3000 is not drawn', !t3.getRowElement(3000));
        // Unchanged on purpose: the fit that runs on every render fits what is
        // on screen, and sampling 5,000 rows per ResizeObserver frame is not
        // a price to pay for it.
        const fit = t3._measureNaturalWidths()[1];
        ok('the render-time fit pass still measures only the window', fit < 60 * PX,
           `measured ${fit}`);
        t3.autoSizeColumns();
    } finally {
        proto.getBoundingClientRect = real;
    }
    check('Auto-width sizes Name to the value at row 3000',
          t3._colWidths[1], Math.ceil(60 * PX + 2));
    check('…and the row-number column to the widest number, the last row\'s',
          t3._colWidths[0], Math.max(40, Math.ceil('5000'.length * PX + 2)));
    check('the sampled rows are gone again — the DOM is the window it was',
          bodyOf(h3).children.length, trsBefore);
    ok('…and row 3000 is still not drawn', !t3.getRowElement(3000));
}

console.log(failures ? `\n${failures} assertion(s) FAILED` : '\nall assertions passed');
process.exit(failures ? 1 : 0);
