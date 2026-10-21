/**
 * STORY-0091 `crosstab` — A MATRIX OF SPANNED HEADER ROWS AND PINNED LABEL
 * COLUMNS, IN ONE TABLE IN ONE SCROLLER.
 *
 *   §1  a 2-level column axis draws 2 header rows (a band of spans over the
 *       column headers), and every row's spans add up to the body's columns;
 *       a column in no cell of a band gets a blank run, and a 3-level axis
 *       draws 3 rows the same way
 *   §2  the header rows stay pinned while the body scrolls vertically: one
 *       table, its `thead` inside the one scroll box, every header cell sticky;
 *       each row's `top` is the measured height of the rows above it, also
 *       after a header label wraps (a resize of the row), and out of a CSS zoom
 *   §3  the label columns stay pinned while the body scrolls sideways: one
 *       label column, and three (one per row field) behind a row number; each
 *       pinned cell's `left` is the measured width of the pinned columns before
 *       it, in the header, the corner, the filter row and the body; a row the
 *       virtual window draws later lines up at once; the corner pins both ways;
 *       a pinned cell's background is an opaque important stack, and every
 *       tint the sheet paints on a body cell (hover, clickable hover, row and
 *       cell selection, staged, fill mark, placeholder, diff, new-row flash)
 *       reaches it as a layer over the row's colour over the surface
 *   §4  an empty axis draws a single "(none)" column header, not a broken
 *       table: with rows, with none, with no label column, and with a word of
 *       the consumer's
 *   §5  totals rows and columns and every label come from the consumer; the
 *       source contains no pivot vocabulary (vocabulary gate)
 *   §6  with 1,000 rows and 50 body columns the first draw completes in under
 *       300 ms in jsdom
 *   §7  a table without `crosstab` is the 0.16 table: the split header, no
 *       crosstab class or pinned cell, the module never built; and
 *       `columnGroups` is ignored, with a warning, beside `crosstab`
 *
 * jsdom lays nothing out. The geometry the offsets are measured from is given
 * here (`GEO`): header row heights and column-header widths, through a stubbed
 * `getBoundingClientRect`, and a recording ResizeObserver stands in for the
 * engine's. Against 0.16 every section but §7 fails (there is no `crosstab`).
 *
 *     node tests/crosstab.test.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

// The engine's ResizeObserver, recorded: which elements are watched, and a way
// to tell the observer that they changed size.
const OBSERVERS = [];
globalThis.ResizeObserver = class {
    constructor(cb) { this.cb = cb; this.targets = new Set(); this.live = true; OBSERVERS.push(this); }
    observe(el) { this.targets.add(el); }
    unobserve(el) { this.targets.delete(el); }
    disconnect() { this.targets.clear(); this.live = false; }
};
const resized = (el) => {
    let hit = 0;
    for (const o of OBSERVERS) {
        if (o.live && o.targets.has(el)) { hit++; o.cb([{ target: el }]); }
    }
    return hit;
};

const { dataTableEnv } = await import('./dt_env.mjs');
const T = await dataTableEnv('crosstab');
const { check, ok, section, mount, bodyRows, click, tick, done, window, document } = T;
const HERE = dirname(fileURLToPath(import.meta.url));
const frame = () => new Promise((r) => window.requestAnimationFrame(() => r()));
const frames = async () => { await frame(); await frame(); };

// ── the given layout ─────────────────────────────────────────────────────
// `GEO.rowH[i]` is the height of the header's i-th row; `GEO.colW[j]` the
// width of the j-th column header (and so of every cell in its column).
const GEO = { rowH: [], colW: [] };
{
    const rect = (top, left, width, height) => ({
        top, left, width, height, x: left, y: top, right: left + width, bottom: top + height,
    });
    window.Element.prototype.getBoundingClientRect = function () {
        const thead = this.closest?.('thead');
        if (this.tagName === 'THEAD') {
            return rect(0, 0, 0, GEO.rowH.reduce((a, b) => a + b, 0));
        }
        if (this.tagName === 'TR' && thead) {
            const i = [...thead.rows].indexOf(this);
            const top = GEO.rowH.slice(0, i).reduce((a, b) => a + b, 0);
            return rect(top, 0, 0, GEO.rowH[i] || 0);
        }
        if ((this.tagName === 'TH' || this.tagName === 'TD') && thead && this.parentElement?.classList.contains('twm-dt-crosstab__leaf')) {
            const j = [...this.parentElement.children].indexOf(this);
            const left = GEO.colW.slice(0, j).reduce((a, b) => a + b, 0);
            return rect(0, left, GEO.colW[j] || 0, 0);
        }
        return rect(0, 0, 0, 0);
    };
    // jsdom's `scrollTop` is a no-op that reads 0; the virtual window reads it.
    const tops = new WeakMap();
    Object.defineProperty(window.Element.prototype, 'scrollTop', {
        configurable: true,
        get() { return tops.get(this) || 0; },
        set(v) { tops.set(this, Math.max(0, Number(v) || 0)); },
    });
}

const headRows = (host) => [...host.querySelector('table.twm-dt-crosstab thead').rows];
const bands = (host) => headRows(host).filter((tr) => tr.classList.contains('twm-dt-crosstab__band'));
const leaf = (host) => host.querySelector('thead tr.twm-dt-crosstab__leaf');
/** A band's runs over the body: its cells that are no corner. */
const runs = (tr) => [...tr.cells].filter((th) => !th.classList.contains('twm-dt-crosstab__corner'));
const spanSum = (tr) => runs(tr).reduce((a, th) => a + th.colSpan, 0);
const texts = (tr) => runs(tr).map((th) => th.querySelector('.twm-dt-group__label')?.textContent ?? '');
const px = (v) => (v === '' ? null : parseFloat(v));

// 2 years × 2 quarters, and a column that sums each row.
const quarterHeaders = ['Region', '2024 Q1', '2024 Q2', '2025 Q1', '2025 Q2', 'All'];
const quarterRows = [
    ['North', 1, 2, 3, 4, 10],
    ['South', 5, 6, 7, 8, 26],
    ['All', 6, 8, 10, 12, 36],
];
const years = [
    { label: '2024', columns: [1, 2] },
    { label: '2025', columns: [3, 4] },
    { label: 'All', columns: [5] },
];

section('§1 a 2-level column axis draws 2 header rows whose spans add up to the body\'s columns');
{
    const { host, table } = mount({
        headers: quarterHeaders, rows: quarterRows,
        crosstab: { labelColumns: 1, headerRows: [years] },
    });
    const rowsDrawn = headRows(host);
    check('2 header rows: the band and the column headers', rowsDrawn.length, 2);
    check('the band is above the column headers', rowsDrawn.map((tr) => tr.className),
          ['twm-dt-crosstab__band', 'twm-dt-crosstab__leaf']);
    check('the band\'s spans', runs(bands(host)[0]).map((th) => th.colSpan), [2, 2, 1]);
    check('the band\'s labels', texts(bands(host)[0]), ['2024', '2025', 'All']);
    const bodyCols = bodyRows(host)[0].children.length - 1;
    check('the band\'s spans add up to the body\'s columns', spanSum(bands(host)[0]), bodyCols);
    check('…which the column header row has, after its label column',
          leaf(host).children.length - 1, bodyCols);
    check('each span sits over its own columns: 2024 over 2024 Q1–Q2',
          [...leaf(host).children].slice(1, 3).map((th) => th.textContent), ['2024 Q1', '2024 Q2']);
    const corner = bands(host)[0].querySelector('.twm-dt-crosstab__corner');
    check('the corner spans the band, over the label column', [corner.rowSpan, corner.colSpan], [1, 1]);

    // A column in no cell of a band: a blank run, and the sum still holds.
    table.setData({ crosstab: { labelColumns: 1, headerRows: [[{ label: '2024', columns: [1, 2] }, { label: '2025', columns: [3, 4] }]] } });
    table.render();
    check('an ungrouped column is a blank run', runs(bands(host)[0]).map((th) => [th.colSpan, th.classList.contains('twm-dt-group--none')]),
          [[2, false], [2, false], [1, true]]);
    check('…and the spans still add up', spanSum(bands(host)[0]), bodyCols);

    // The band cells are STORY-0066's group cells: the same markup a
    // `columnGroups` row draws for the same spans and labels.
    const grouped = mount({
        headers: quarterHeaders, rows: quarterRows,
        columnGroups: [{ key: 'a', label: '2024', columns: [1, 2] }, { key: 'b', label: '2025', columns: [3, 4] }],
    });
    const groupCells = [...grouped.host.querySelectorAll('table.twm-dt-groups th.twm-dt-group')].slice(-3);
    // (less the pinned `top` the crosstab writes on every header cell)
    const markup = (th) => { const c = th.cloneNode(true); c.removeAttribute('style'); return c.outerHTML; };
    check('…the same markup as a column group row\'s cells', runs(bands(host)[0]).map(markup), groupCells.map(markup));

    // Three levels: three rows, each adding up; the corner spans the two bands.
    const three = mount({
        headers: ['Region', 'a', 'b', 'c', 'd'],
        rows: [['North', 1, 2, 3, 4]],
        crosstab: {
            labelColumns: 1,
            headerRows: [
                [{ label: 'Both years', columns: [1, 2, 3, 4] }],
                [{ label: '2024', columns: [1, 2] }, { label: '2025', columns: [3, 4] }],
            ],
        },
    });
    check('a 3-level axis draws 3 header rows', headRows(three.host).length, 3);
    check('…every band adds up to the body\'s 4 columns', bands(three.host).map(spanSum), [4, 4]);
    check('…the spans of each', bands(three.host).map((tr) => runs(tr).map((th) => th.colSpan)), [[4], [2, 2]]);
    check('…the corner spans both bands', bands(three.host)[0].querySelector('.twm-dt-crosstab__corner').rowSpan, 2);
}

section('§2 header rows stay pinned while the body scrolls vertically, each at the measured height above it');
{
    GEO.rowH = [20, 24, 30, 26];
    GEO.colW = [90, 60, 60, 60, 60, 60, 60, 60];
    const { host, table } = mount({
        headers: ['Region', 'a', 'b', 'c', 'd'],
        rows: Array.from({ length: 40 }, (_, i) => [`r${i}`, i, i, i, i]),
        filterable: true,
        pagination: false,
        crosstab: {
            labelColumns: 1,
            headerRows: [
                [{ label: 'Both years', columns: [1, 2, 3, 4] }],
                [{ label: '2024', columns: [1, 2] }, { label: '2025', columns: [3, 4] }],
            ],
        },
    });
    const wrap = host.querySelector('.twm-preview-table-wrap');
    check('one table, nothing above it', host.querySelectorAll('table').length, 1);
    check('no header wrap of its own', host.querySelector('.twm-preview-table-header-wrap'), null);
    ok('the header is inside the one scroll box', wrap.querySelector('thead') && wrap.querySelector('tbody'));
    ok('the scroll box scrolls (overflow:auto)', /overflow:\s*auto/.test(wrap.style.cssText));
    check('header rows: 2 bands, the column headers, the filters', headRows(host).length, 4);

    const tops = () => headRows(host).map((tr) => [...tr.cells].map((th) => px(th.style.top)));
    const rowTops = () => tops().map((cells) => [...new Set(cells)]);
    check('each row\'s top is the height of the rows above it', rowTops(), [[0], [20], [44], [74]]);
    check('…on every cell of the row', tops()[2].length, leaf(host).children.length);

    const sheet = T.css('flexdesk.css');
    ok('every crosstab header cell is sticky', /\.twm-preview-table\.twm-dt-crosstab thead th \{\s*position: sticky;/.test(sheet));

    // Scrolling the body down moves nothing the header was given.
    wrap.scrollTop = 400;
    wrap.dispatchEvent(new window.Event('scroll'));
    await frames();
    check('a vertical scroll leaves every top as it was', rowTops(), [[0], [20], [44], [74]]);
    ok('…and transforms nothing', headRows(host).every((tr) => [...tr.cells].every((th) => !th.style.transform)));

    // A label wraps: the first band grows to two lines.
    GEO.rowH = [38, 24, 30, 26];
    const watched = resized(headRows(host)[0]);
    ok('the band row is watched for its size', watched > 0);
    await frames();
    check('after the label wraps every row below moves down by the growth', rowTops(), [[0], [38], [62], [92]]);

    // A zoom: the measured lengths are zoomed, `style.top` is not.
    const thead = host.querySelector('thead');
    Object.defineProperty(thead, 'currentCSSZoom', { configurable: true, value: 2 });
    GEO.rowH = [76, 48, 60, 52];
    resized(headRows(host)[1]);
    await frames();
    check('under a 200% zoom the tops are written in the unzoomed space', rowTops(), [[0], [38], [62], [92]]);
    delete thead.currentCSSZoom;

    // At 100% the fractions stand: no rounded length (offsetHeight) rescales them.
    GEO.rowH = [20.5, 24.25, 30, 26];
    Object.defineProperty(thead, 'offsetHeight', { configurable: true, value: 101 });
    resized(headRows(host)[0]);
    await frames();
    check('fractional row heights give fractional tops, exactly', rowTops(), [[0], [20.5], [44.75], [74.75]]);
    delete thead.offsetHeight;

    // A re-render measures again (its own new rows).
    GEO.rowH = [20, 24, 30, 26];
    table.render();
    await frames();
    check('a re-render pins its own header', rowTops(), [[0], [20], [44], [74]]);
    table.dispose();
}

section('§3 row-label columns stay pinned while the body scrolls sideways; the corner both ways');
{
    const pins = (tr) => [...tr.children].filter((c) => c.classList.contains('twm-dt-pin'));
    const lefts = (tr) => pins(tr).map((c) => px(c.style.left));

    // One label column (a compact layout): left 0.
    GEO.rowH = [22, 24];
    GEO.colW = [140, 60, 60, 60, 60, 60];
    const compact = mount({
        headers: quarterHeaders, rows: quarterRows,
        crosstab: { labelColumns: 1, headerRows: [years] },
    });
    await frames();
    check('one label column: one pinned cell a row', bodyRows(compact.host).map((tr) => pins(tr).length), [1, 1, 1]);
    check('…at left 0', bodyRows(compact.host).map(lefts), [[0], [0], [0]]);
    check('…its header and the corner too', [lefts(leaf(compact.host)), lefts(bands(compact.host)[0])], [[0], [0]]);
    ok('the body cells after it are not pinned', [...bodyRows(compact.host)[0].children].slice(1).every((c) => !c.classList.contains('twm-dt-pin')));

    // Three label columns (one per row field) behind a row number.
    GEO.rowH = [22, 24, 26];
    GEO.colW = [30, 100, 80, 120, 60, 60, 60, 60];
    const fields = ['Continent', 'Country', 'City'];
    const deep = mount({
        headers: [...fields, '2024 Q1', '2024 Q2', '2025 Q1', '2025 Q2'],
        rows: Array.from({ length: 200 }, (_, i) => ['Europe', `C${i % 7}`, `city ${i}`, i, i, i, i]),
        showRowNumbers: true,
        filterable: true,
        pagination: false,
        virtualize: { rowHeight: 24, overscan: 5 },
        crosstab: { labelColumns: 3, headerRows: [[{ label: '2024', columns: [3, 4] }, { label: '2025', columns: [5, 6] }]] },
    });
    const wrap = deep.table.scrollElement;
    Object.defineProperty(wrap, 'clientHeight', { configurable: true, value: 240 });
    deep.table.refreshVirtualLayout();
    await frames();
    const expected = [0, 30, 130, 210];
    check('the row number and three label columns pin, each at the widths before it', lefts(bodyRows(deep.host)[0]), expected);
    check('…in every drawn row', bodyRows(deep.host).every((tr) => JSON.stringify(lefts(tr)) === JSON.stringify(expected)), true);
    check('…in the column headers', lefts(leaf(deep.host)), expected);
    check('…in the filter row', lefts(deep.host.querySelector('thead tr.twm-data-table__filter-row')), expected);
    const corner = [...bands(deep.host)[0].querySelectorAll('.twm-dt-crosstab__corner')];
    check('the corner: one cell per pinned column', corner.length, 4);
    check('…pinned left at the same offsets', corner.map((th) => px(th.style.left)), expected);
    check('…and to the top', corner.map((th) => px(th.style.top)), [0, 0, 0, 0]);
    check('the label header cells pin to the top of their row as well',
          pins(leaf(deep.host)).map((th) => px(th.style.top)), [22, 22, 22, 22]);
    const sheet = T.css('flexdesk.css');
    ok('a pinned body cell is sticky with a background of its own',
       /\.twm-dt-crosstab tbody td\.twm-dt-pin \{\s*position: sticky;\s*z-index: 1;\s*background:/.test(sheet));
    const ROW_LAYER = 'linear-gradient(var(--twm-dt-row-bg, transparent), var(--twm-dt-row-bg, transparent)) var(--surface-0, #1e1e1e)';
    // The sheet's top-level rules, as [selector, body] (the at-rules' bodies
    // are not split into rules).
    const rules = [];
    {
        let depth = 0, start = 0, sel = '';
        const text = sheet.replace(/\/\*[\s\S]*?\*\//g, '');
        for (let i = 0; i < text.length; i++) {
            if (text[i] === '{') { if (depth === 0) { sel = text.slice(start, i).trim(); start = i + 1; } depth++; }
            else if (text[i] === '}') { depth--; if (depth === 0) { rules.push([sel.replace(/\s+/g, ' '), text.slice(start, i)]); start = i + 1; } }
        }
    }
    const ruleOf = (selector) => rules.find(([sel]) => sel === selector)?.[1] ?? '';
    // Specificity (a, b, c) of one selector, `:not()` counted as its argument.
    const specificity = (selector) => {
        let rest = selector, a = 0, b = 0, c = 0;
        for (;;) {
            const m = /:not\(([^()]*)\)/.exec(rest);
            if (!m) break;
            const [x, y, z] = specificity(m[1]);
            a += x; b += y; c += z;
            rest = rest.slice(0, m.index) + ' ' + rest.slice(m.index + m[0].length);
        }
        a += (rest.match(/#[\w-]+/g) || []).length;
        b += (rest.match(/\.[\w-]+|\[[^\]]*\]|:(?!:)[\w-]+/g) || []).length;
        c += (rest.replace(/\.[\w-]+|\[[^\]]*\]|:[\w-]+|#[\w-]+/g, ' ').match(/[a-z][\w-]*/gi) || []).length;
        return [a, b, c];
    };
    const beats = (x, y) => x[0] !== y[0] ? x[0] > y[0] : x[1] !== y[1] ? x[1] > y[1] : x[2] > y[2];
    ok('the zebra stripe is the row\'s --twm-dt-row-bg',
       /:where\(\.twm-preview-table tbody tr:nth-child\(even\)\) \{\s*--twm-dt-row-bg: rgba\(255, 255, 255, 0\.02\);/.test(sheet)
       && ruleOf('.twm-preview-table tbody tr:nth-child(even)').includes('background: var(--twm-dt-row-bg);'));
    const PIN = '.twm-preview-table.twm-dt-crosstab tbody td.twm-dt-pin';
    const pinBg = ruleOf(PIN).replace(/\s+/g, ' ');
    ok('a pinned body cell draws one opaque stack: mark, new-row flash, state, the row\'s background, the surface',
       pinBg.includes('background: var(--twm-dt-pin-mark, none), '
           + 'linear-gradient(var(--twm-dt-pin-new, transparent), var(--twm-dt-pin-new, transparent)), '
           + `var(--twm-dt-pin-state, none), ${ROW_LAYER} !important;`));
    ok('…important, so no state rule and no animation replaces the surface',
       /!important;\s*$/.test(ruleOf(PIN).trim()));
    // Every background FlexDesk paints on a body `td` (a state: hover, row
    // and cell selection, staged, the fill's and the paste's marks, placeholder, diff, the
    // new-row flash) is mirrored for the pinned cell as a layer: the same
    // selector with `.twm-dt-crosstab` on the table and `.twm-dt-pin` on the
    // cell, setting the layer to the same colour. The two classes are added to
    // every one, so the mirrors rank among themselves as the originals do.
    const STATES = [
        ['.twm-preview-table:not(.twm-preview-table--readonly) tr:hover td',
         '.twm-preview-table.twm-dt-crosstab:not(.twm-preview-table--readonly) tr:hover td.twm-dt-pin', '--twm-dt-pin-state', 'rgba(255, 255, 255, 0.04)'],
        ['.twm-preview-table:not(.twm-preview-table--readonly) tbody tr.selected td, .twm-preview-table tbody tr.selected td',
         '.twm-preview-table.twm-dt-crosstab:not(.twm-preview-table--readonly) tbody tr.selected td.twm-dt-pin, .twm-preview-table.twm-dt-crosstab tbody tr.selected td.twm-dt-pin', '--twm-dt-pin-state', 'var(--state-selected, rgba(0, 122, 204, 0.15))'],
        ['.twm-preview-table.twm-dt--clickable tbody tr:not(.twm-dt-spacer):not(.data-table__empty-row):not(.selected):hover td',
         '.twm-preview-table.twm-dt-crosstab.twm-dt--clickable tbody tr:not(.twm-dt-spacer):not(.data-table__empty-row):not(.selected):hover td.twm-dt-pin', '--twm-dt-pin-state', 'var(--state-hover, rgba(255, 255, 255, 0.05))'],
        ['.twm-preview-table.twm-dt--cells tbody td.twm-dt-cell--selected',
         '.twm-preview-table.twm-dt-crosstab.twm-dt--cells tbody td.twm-dt-pin.twm-dt-cell--selected', '--twm-dt-pin-state', 'var(--state-selected, rgba(0, 122, 204, 0.15))'],
        ['.twm-preview-table.twm-dt--cells tbody td.twm-dt-cell--staged',
         '.twm-preview-table.twm-dt-crosstab.twm-dt--cells tbody td.twm-dt-pin.twm-dt-cell--staged', '--twm-dt-pin-state', 'color-mix(in srgb, var(--accent-bright, #007acc) 16%, transparent)'],
        ['.twm-preview-table.twm-dt--cells tbody td.twm-dt-cell--fill-skipped',
         '.twm-preview-table.twm-dt-crosstab.twm-dt--cells tbody td.twm-dt-pin.twm-dt-cell--fill-skipped', '--twm-dt-pin-mark', 'color-mix(in srgb, var(--color-danger, #f14c4c) 22%, transparent) 0 4px, transparent 4px 8px'],
        ['.twm-preview-table.twm-dt--cells tbody td.twm-dt-cell--paste-skipped',
         '.twm-preview-table.twm-dt-crosstab.twm-dt--cells tbody td.twm-dt-pin.twm-dt-cell--paste-skipped', '--twm-dt-pin-mark', 'color-mix(in srgb, var(--color-danger, #f14c4c) 22%, transparent) 0 4px, transparent 4px 8px'],
        ['.twm-preview-table th.twm-dt-col--placeholder, .twm-preview-table td.twm-dt-cell--placeholder',
         '.twm-preview-table.twm-dt-crosstab td.twm-dt-pin.twm-dt-cell--placeholder', '--twm-dt-pin-state', 'rgba(255, 255, 255, 0.015)'],
        ['.twm-data-table-component .twm-preview-table tbody tr.twm-dt-diff--added:not(.selected) > td',
         '.twm-data-table-component .twm-preview-table.twm-dt-crosstab tbody tr.twm-dt-diff--added:not(.selected) > td.twm-dt-pin', '--twm-dt-pin-state', 'color-mix(in srgb, var(--color-success, #3fb950) 16%, transparent)'],
        ['.twm-data-table-component .twm-preview-table tbody tr.twm-dt-diff--removed:not(.selected) > td',
         '.twm-data-table-component .twm-preview-table.twm-dt-crosstab tbody tr.twm-dt-diff--removed:not(.selected) > td.twm-dt-pin', '--twm-dt-pin-state', 'color-mix(in srgb, var(--color-danger, #c74e4e) 18%, transparent)'],
        ['.twm-data-table-component .twm-preview-table tbody tr.twm-dt-diff:not(.selected) > td.twm-dt-diff__cell--changed',
         '.twm-data-table-component .twm-preview-table.twm-dt-crosstab tbody tr.twm-dt-diff:not(.selected) > td.twm-dt-pin.twm-dt-diff__cell--changed', '--twm-dt-pin-state', 'color-mix(in srgb, var(--color-warning, #ff9800) 22%, transparent)'],
        ['.twm-data-table-component .twm-preview-table tbody tr.twm-dt-diff--gap > td.twm-dt-diff__gap',
         '.twm-data-table-component .twm-preview-table.twm-dt-crosstab tbody tr.twm-dt-diff--gap > td.twm-dt-pin.twm-dt-diff__gap', '--twm-dt-pin-state', 'color-mix(in srgb, var(--text-muted, #888) 14%, transparent) 6px 7px'],
        ['.twm-preview-table tr:hover td',
         '.twm-preview-table.twm-dt-crosstab tr:hover td.twm-dt-pin', '--twm-dt-pin-state', 'rgba(255,255,255,0.04)'],
    ];
    const flat = (body) => body.replace(/\s+/g, ' ');
    for (const [original, mirror, layer, colour] of STATES) {
        const from = ruleOf(original), to = flat(ruleOf(mirror));
        ok(`${original}: its tint (${colour}) is on the unpinned cell`, flat(from).includes(colour));
        ok(`…and the pinned cell lays it as ${layer}`, to.includes(`${layer}: `) && to.includes(colour) && !/(^|[;\s])background(-image)?\s*:/.test(to));
        const o = original.split(', '), m = mirror.split(', ');
        check('…at the original\'s specificity plus the two classes, selector for selector',
              m.map(specificity), o.filter((x) => !x.includes(' th.')).map((x) => { const [a, b, c] = specificity(x); return [a, b + 2, c]; }));
    }
    // The order the originals rank in is kept: where two tie, the later wins,
    // and the mirrors are in the same order.
    const at = (sel) => rules.findIndex(([s]) => s === sel);
    const pairs = [];
    for (let i = 0; i < STATES.length; i++) for (let j = 0; j < STATES.length; j++) {
        if (i === j) continue;
        const so = specificity(STATES[i][0].split(', ').pop()), sp = specificity(STATES[j][0].split(', ').pop());
        if (!beats(so, sp) && !beats(sp, so) && at(STATES[i][0]) < at(STATES[j][0])) pairs.push([i, j]);
    }
    check('…tied originals keep their order in the mirrors', pairs.filter(([i, j]) => at(STATES[i][1]) > at(STATES[j][1])), []);
    // The sweep: any OTHER rule that paints a body cell's background or
    // animates it would bleed through a pinned cell, unless mirrored above.
    const known = new Set(STATES.map(([o]) => o));
    const painters = rules.filter(([sel, body]) => /(^|[;\s])(background(-image|-color)?|animation)\s*:/.test(body)
        && sel.split(', ').some((one) => /(^|[\s>])td([.:[][^\s>]*)?$/.test(one))
        && !sel.includes('twm-dt-crosstab') && !known.has(sel)).map(([sel]) => sel);
    check('every other body-cell background is not a state a pinned cell can carry (the spacer row, the detail cell, the new-row flash below)', painters, [
        '.twm-preview-table tbody tr.twm-dt-spacer, .twm-preview-table tbody tr.twm-dt-spacer > td',
        '.twm-data-table-component .twm-preview-table tbody tr.twm-dt-detail-row > td.twm-dt-detail-cell, .twm-data-table-component .twm-preview-table tbody tr.twm-dt-detail-row:not(.twm-dt-spacer):not(.data-table__empty-row):hover > td.twm-dt-detail-cell',
        '.twm-preview-table tbody tr.twm-dt-row--new > td',
    ]);
    // The new-row flash: an animation outranks a normal declaration, an
    // important one outranks it — so the pinned cell flashes through its
    // layer instead, a colour registered so that it animates.
    ok('the flash layer is a registered colour, transparent at rest',
       /@property --twm-dt-pin-new \{\s*syntax: '<color>';\s*inherits: false;\s*initial-value: transparent;/.test(sheet));
    ok('…animated from the same --twm-dt-new-bg the unpinned cells flash in, to transparent',
       /@keyframes twm-dt-pin-new \{\s*from \{ --twm-dt-pin-new: var\(--twm-dt-new-bg, rgba\(0, 122, 204, 0\.22\)\); \}\s*to \{ --twm-dt-pin-new: transparent; \}/.test(sheet)
       && /@keyframes twm-dt-row-new \{\s*from \{ background: var\(--twm-dt-new-bg, rgba\(0, 122, 204, 0\.22\)\); \}/.test(sheet));
    const flash = ruleOf('.twm-preview-table.twm-dt-crosstab tbody tr.twm-dt-row--new > td.twm-dt-pin');
    ok('…on a new row\'s pinned cells, for as long, replacing the background animation the important stack would void',
       flash.includes('animation: twm-dt-pin-new 1.6s ease-out;')
       && ruleOf('.twm-preview-table tbody tr.twm-dt-row--new > td').includes('animation: twm-dt-row-new 1.6s ease-out;')
       && beats(specificity('.twm-preview-table.twm-dt-crosstab tbody tr.twm-dt-row--new > td.twm-dt-pin'), specificity('.twm-preview-table tbody tr.twm-dt-row--new > td')));
    ok('a pinned header cell (the corner) is above the header and the body',
       /\.twm-dt-crosstab thead th\.twm-dt-pin \{\s*z-index: 4;/.test(sheet));

    // Sideways: the body scrolls, the pinned cells keep their offsets.
    wrap.scrollLeft = 300;
    wrap.dispatchEvent(new window.Event('scroll'));
    await frames();
    check('a sideways scroll leaves the pinned offsets as they were', lefts(bodyRows(deep.host)[0]), expected);

    // Down: rows the virtual window draws later are pinned at once.
    const before = new Set(bodyRows(deep.host).map((tr) => tr.__rowIndex));
    wrap.scrollTop = 2400;
    wrap.dispatchEvent(new window.Event('scroll'));
    const later = bodyRows(deep.host).filter((tr) => !before.has(tr.__rowIndex));
    ok('the window drew new rows', later.length > 0);
    check('…pinned at the measured offsets as they are drawn', later.every((tr) => JSON.stringify(lefts(tr)) === JSON.stringify(expected)), true);

    // A label column widens (a longer label wraps or a font loads): re-measured.
    GEO.colW = [30, 150, 80, 120, 60, 60, 60, 60];
    ok('the pinned header cells are watched for their size', resized(leaf(deep.host).children[1]) > 0);
    await frames();
    check('a wider label column moves the ones after it', lefts(bodyRows(deep.host)[0]), [0, 30, 180, 260]);

    // Under `virtualize` the columns are held at the widths measured.
    const cols = [...deep.host.querySelectorAll('table.twm-dt-crosstab > colgroup > col')];
    check('the virtual window\'s columns are held at the measured widths',
          cols.map((c) => px(c.style.width)), [30, 100, 80, 120, 60, 60, 60, 60]);
    check('…under a fixed layout', deep.table._tableEl.style.tableLayout, 'fixed');

    // A click on a header cell selects no row and throws nothing.
    click(bands(deep.host)[0].children[4]);
    check('a click on a band cell selects nothing', deep.table.getSelection(), []);
    deep.table.dispose();
    compact.table.dispose();
}

section('§4 an empty axis draws a single "(none)" column header, not a broken table');
{
    const none = (host) => [...leaf(host).children].filter((th) => th.classList.contains('twm-dt-crosstab__none'));
    const { host, table } = mount({
        headers: ['Region'], rows: [['North'], ['South']],
        crosstab: { labelColumns: 1, headerRows: [[{ label: '2024', columns: [] }]] },
    });
    check('a single column header beside the label column', [...leaf(host).children].map((th) => th.textContent), ['Region', '(none)']);
    check('…and no band over nothing', bands(host).length, 0);
    check('one header row', headRows(host).length, 1);
    check('every row has a cell under it', bodyRows(host).map((tr) => tr.children.length), [2, 2]);
    check('…an empty one', bodyRows(host).map((tr) => tr.children[1].textContent), ['', '']);
    ok('the table is drawn, not an error or an empty state', !host.querySelector('.data-table__empty-row') && bodyRows(host).length === 2);
    check('the "(none)" column is no data column', table._dataIdxOfDom(1), null);

    const empty = mount({ headers: ['Region'], rows: [], crosstab: { labelColumns: 1 } });
    check('no rows either: the header still draws, with "(none)"', none(empty.host).map((th) => th.textContent), ['(none)']);
    check('…in the one table', empty.host.querySelectorAll('table').length, 1);
    check('…and its empty row spans both columns', empty.host.querySelector('tbody td').colSpan, 2);

    const bare = mount({ headers: [], rows: [], crosstab: {} });
    check('no columns at all: a single "(none)" header', [...leaf(bare.host).children].map((th) => th.textContent), ['(none)']);

    const worded = mount({ headers: ['Region'], rows: [['North']], crosstab: { labelColumns: 1, emptyLabel: 'No columns' } });
    check('the consumer\'s word for it', none(worded.host).map((th) => th.textContent), ['No columns']);

    // The axis fills in: the placeholder goes.
    table.setData({ headers: ['Region', 'Q1'], rows: [['North', 1]] });
    table.render();
    check('columns again: no "(none)"', none(host).length, 0);
}

section('§5 totals rows and columns and every label come from the consumer (vocabulary gate)');
{
    const isTotalRow = (row) => row[0] === 'All';
    const { host } = mount({
        headers: quarterHeaders, rows: quarterRows,
        rowClass: (row) => (isTotalRow(row) ? 'my-sum-row' : null),
        cellClass: (value, colIdx) => (colIdx === 5 ? 'my-sum-col' : null),
        crosstab: {
            labelColumns: 1,
            headerRows: [[...years.slice(0, 2), { label: 'All', columns: [5], className: 'my-sum-head', title: 'All years' }]],
        },
    });
    const rows = bodyRows(host);
    check('the consumer\'s row is drawn as the consumer marked it', rows.map((tr) => tr.classList.contains('my-sum-row')), [false, false, true]);
    check('…with the consumer\'s label and values', [...rows[2].children].map((c) => c.textContent), ['All', '6', '8', '10', '12', '36']);
    check('the consumer\'s column is marked by the consumer', rows.map((tr) => tr.children[5].classList.contains('my-sum-col')), [true, true, true]);
    // The consumer colours that row: `--twm-dt-row-bg` through its rowClass.
    // jsdom cascades no custom property, so the contract is read off the
    // stylesheet: every crosstab row paints the variable, its pinned cells lay
    // it over their surface, and the sheet's own value (the stripe) is set at
    // no specificity, so a consumer's one-class rule replaces it on every row.
    const css = T.css('flexdesk.css');
    ok('every crosstab row paints its --twm-dt-row-bg',
       /\.twm-preview-table\.twm-dt-crosstab tbody tr \{\s*background: var\(--twm-dt-row-bg, transparent\);/.test(css));
    ok('…and its pinned cells lay it over the surface, so the label cells carry the row colour',
       /tbody td\.twm-dt-pin \{[^}]*background:[^}]*var\(--twm-dt-pin-state, none\),\s*linear-gradient\(var\(--twm-dt-row-bg, transparent\), var\(--twm-dt-row-bg, transparent\)\) var\(--surface-0/.test(css));
    const setters = css.split('}').filter((rule) => /--twm-dt-row-bg\s*:/.test(rule)).map((rule) => rule.trim().split('{')[0].trim().split('\n').pop());
    check('the sheet sets --twm-dt-row-bg only at no specificity (a consumer\'s .my-sum-row wins)',
          setters, [':where(.twm-preview-table tbody tr:nth-child(even))']);
    const doc = readFileSync(resolvePath(HERE, '../README.md'), 'utf8');
    ok('the README tells a consumer to colour a crosstab row through --twm-dt-row-bg', /--twm-dt-row-bg/.test(doc.slice(doc.indexOf('### DataTable: a crosstab'))));
    const head = runs(bands(host)[0])[2];
    check('a band cell takes the consumer\'s class, label and title',
          [head.classList.contains('my-sum-head'), head.textContent, head.title], [true, 'All', 'All years']);
    check('every header text is the consumer\'s', [...leaf(host).children].map((th) => th.textContent), quarterHeaders);

    // The gate: none of a cross-tabulating app's words in the component.
    const WORDS = /pivot|subtotal|grand[\s_-]*total|aggregat|drill|roll-?up|\bmembers?\b|\boutline\b|\btabular\b|row[\s_-]?field|column[\s_-]?field|\bsum\b|\btotals?\b(?!Count)/i;
    const sources = ['src/ui/components/crosstab.js'];
    for (const file of sources) {
        const text = readFileSync(resolvePath(HERE, '..', file), 'utf8');
        const hits = text.split('\n').map((line, i) => [i + 1, line]).filter(([, line]) => WORDS.test(line));
        check(`${file} has no pivot vocabulary`, hits, []);
    }
    // The table and the stylesheet's crosstab rules, held to the words that
    // only a pivot uses (they already speak of a table's `totalCount`).
    const PIVOT_ONLY = /pivot|subtotal|grand[\s_-]*total|aggregat|drill|roll-?up|row[\s_-]?field|column[\s_-]?field/i;
    const table = readFileSync(resolvePath(HERE, '../src/ui/components/data_table.js'), 'utf8');
    check('data_table.js has no pivot vocabulary', table.split('\n').filter((l) => PIVOT_ONLY.test(l)), []);
    const sheet = T.css('flexdesk.css');
    const block = sheet.slice(sheet.indexOf('STORY-0091 `crosstab`'), sheet.indexOf('th.twm-dt-crosstab__none'));
    ok('the stylesheet has a crosstab block', block.length > 100);
    check('…with no pivot vocabulary', block.split('\n').filter((l) => WORDS.test(l)), []);
}

section('§6 with 1,000 rows and 50 body columns, the first draw completes in under 300 ms in jsdom');
{
    const labels = ['Region', 'City'];
    const body = Array.from({ length: 50 }, (_, i) => `Y${2000 + Math.floor(i / 5)} M${i % 5}`);
    const headers = [...labels, ...body];
    const rows = Array.from({ length: 1000 }, (_, r) => [`R${r % 10}`, `city ${r}`, ...body.map((_, c) => r * c)]);
    const yearsRow = Array.from({ length: 10 }, (_, y) => ({
        label: `Y${2000 + y}`, columns: [0, 1, 2, 3, 4].map((m) => 2 + y * 5 + m),
    }));
    const config = {
        headers, rows, pagination: false, virtualize: true,
        crosstab: { labelColumns: 2, headerRows: [yearsRow] },
    };
    // One warm-up draw, as a page has loaded its modules before it draws.
    mount({ ...config }).table.dispose();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const t0 = performance.now();
    const table = new T.DataTable(host, config);
    table.render();
    table._crosstab().pin();
    const ms = performance.now() - t0;
    console.log(`    first draw: ${ms.toFixed(1)} ms`);
    ok(`the first draw took under 300 ms (${ms.toFixed(1)} ms)`, ms < 300);
    check('every row is the table\'s', table.getDisplayedRows().length, 1000);
    check('the band spans the 50 body columns', spanSum(bands(host)[0]), 50);
    check('a drawn row has the 2 labels and the 50 body columns', bodyRows(host)[0].children.length, 52);
    table.dispose();
}

section('§7 a table without crosstab is the 0.16 table');
{
    const { host, table } = mount({ headers: quarterHeaders, rows: quarterRows, filterable: true });
    ok('the header has its own wrap above the body', host.querySelector('.twm-preview-table-header-wrap > table > thead'));
    check('two tables, as before', host.querySelectorAll('table').length, 2);
    check('no crosstab class', host.querySelectorAll('.twm-dt-crosstab').length, 0);
    check('no pinned cell', host.querySelectorAll('.twm-dt-pin').length, 0);
    check('no band row', host.querySelectorAll('.twm-dt-crosstab__band').length, 0);
    check('the module is never built', table._crosstabLayout ?? null, null);
    check('the body row as before', [...bodyRows(host)[0].children].map((td) => td.textContent), ['North', '1', '2', '3', '4', '10']);
    check('no inline top or left on a header cell', [...host.querySelectorAll('thead th')].filter((th) => th.style.top || th.style.left).length, 0);

    const warned = [];
    const warn = console.warn;
    console.warn = (...a) => warned.push(a.join(' '));
    const both = mount({
        headers: quarterHeaders, rows: quarterRows,
        columnGroups: [{ key: 'a', label: 'A', columns: [1, 2] }],
        crosstab: { labelColumns: 1, headerRows: [years] },
    });
    both.table.render();
    console.warn = warn;
    check('…once, from the constructor, however often it draws', warned.filter((w) => /columnGroups/.test(w)).length, 1);
    check('columnGroups beside crosstab: no group table', both.host.querySelectorAll('table.twm-dt-groups').length, 0);
    ok('…and a warning that says to use headerRows', warned.some((w) => /^\[DataTable\] `columnGroups` cannot be combined with `crosstab` \(use crosstab\.headerRows\); ignored\.$/.test(w)));
    check('…the crosstab is drawn', bands(both.host).length, 1);
}

done();
