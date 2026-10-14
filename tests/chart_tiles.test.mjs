/**
 * ══ THE CHART AND KPI TILES (0.13.0, STORY-0022) ══
 *
 * `src/tiles/chart_tiles.js` is Tables' `tables.chart` and `tables.kpi`, lifted
 * upstream with the Tables half removed: a tile takes ALREADY-COMPUTED series
 * through `setData()`. What this suite pins:
 *
 *   §1  figures for line, bar, area, pie, donut and histogram
 *   §2  a burndown: a step series, a dashed series and a vertical "today" marker
 *   §3  nothing registers at import; registerChartTiles() is idempotent
 *   §4  the KPI: one number, a label, a delta — and no Plotly anywhere
 *   §5  a chart tile with no Plotly shows an error state instead of throwing
 *   §6  setData(empty) — or showLoading() — while a draw is in flight leaves
 *       no stale plot: the in-flight figure is purged, never marked drawn
 *   §7  the click callback carries the point's customdata (pie by index)
 *   §8  the config round-trips through TileGrid.getLayout()/setLayout()
 *   §9  the empty state, and onResize only on a drawn figure
 *   §10 the grid's config save (grid.data === null) keeps a tile's own data
 *
 * ── HOW TO RUN ───────────────────────────────────────────────────────────
 *
 *     node tests/chart_tiles.test.mjs              # from ../FlexDesk
 *     node tests/run.mjs                           # with every other suite
 *
 * Imports `../src/` directly, never `dist/`. Plotly is a FAKE on `globalThis`
 * whose `newPlot` resolves when the test says so — which is the only way to
 * hold a draw in flight. jsdom is borrowed from the sibling Tables checkout;
 * absent, this SKIPS loudly rather than passing.
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
    console.log('chart tiles: SKIPPED — needs jsdom '
        + '(`cd ../Tables/web && npm install`, or `npm i -D jsdom` here)');
    process.exit(0);
}

const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>',
                      { url: 'http://localhost/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'Event',
                   'CustomEvent', 'MouseEvent', 'PointerEvent', 'KeyboardEvent',
                   'getComputedStyle', 'navigator', 'requestAnimationFrame',
                   'cancelAnimationFrame', 'MutationObserver', 'ResizeObserver',
                   'DOMRect', 'localStorage']) {
    if (dom.window[key] !== undefined && globalThis[key] === undefined) {
        globalThis[key] = dom.window[key];
    }
}
globalThis.Event = dom.window.Event;
globalThis.CustomEvent = dom.window.CustomEvent;
if (globalThis.PointerEvent === undefined) globalThis.PointerEvent = dom.window.MouseEvent;
if (globalThis.ResizeObserver === undefined) {
    globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
}

let unhandled = 0;
process.on('unhandledRejection', (err) => {
    unhandled += 1;
    console.log(`  (unhandled rejection: ${err?.message || err})`);
});

const registry = await import('../src/tiles/tile_registry.js');
const { TileGrid } = await import('../src/tiles/tile_grid.js');
const { ChartTile, KpiTile, registerChartTiles, normalizeChartData } =
    await import('../src/tiles/chart_tiles.js');
// …and through the barrel, which is what a consumer imports.
const barrel = await import('../tiles.js');

// ── harness ─────────────────────────────────────────────────────────────
let failures = 0;
function ok(what, cond, why = '') {
    if (cond) { console.log(`  ok   ${what}`); return; }
    failures += 1;
    console.log(`  FAIL ${what}${why ? `\n       ${why}` : ''}`);
}
function check(what, actual, expected, why = '') {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    ok(what, a === e, `${why ? `${why}\n       ` : ''}expected ${e}, got ${a}`);
}
const tick = () => new Promise((r) => setTimeout(r, 0));
const ticks = async (n = 5) => { for (let i = 0; i < n; i++) await tick(); };

/** A Plotly whose `newPlot` is held until `release()` — or resolves at once. */
function fakePlotly({ hold = false } = {}) {
    const P = {
        newPlots: [], purged: [], resized: [], pending: [],
        newPlot(gd, data, layout, config) {
            P.newPlots.push({ gd, data, layout, config });
            gd.classList.add('js-plotly-plot');
            gd._handlers = {};
            gd.on = (name, fn) => { gd._handlers[name] = fn; };
            if (!hold) return Promise.resolve(gd);
            return new Promise((resolve) => P.pending.push(() => resolve(gd)));
        },
        purge(gd) { P.purged.push(gd); },
        Plots: { resize(gd) { P.resized.push(gd); } },
        release() { const r = P.pending.splice(0); r.forEach((f) => f()); },
    };
    return P;
}

function mountTile(Tile, config = {}, extra = {}) {
    const container = document.createElement('div');
    document.getElementById('root').appendChild(container);
    const tile = new Tile({ id: `t-${Math.random().toString(36).slice(2, 7)}`, grid: null, config, ...extra });
    tile.mount(container);
    return tile;
}

const days = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'];
const planOf = (type, data, config = {}) =>
    new ChartTile({ id: 'p', grid: null, config: { chart_type: type, ...config } })._plan(normalizeChartData(data));

console.log('\ntiles: the chart and KPI tiles\n');

// ════════════════════════════════════════════════════════════════════════
// 3 (first, because it is about import time). NOTHING REGISTERS ON IMPORT
// ════════════════════════════════════════════════════════════════════════
{
    ok('importing the module registers nothing', !registry.hasWidget('flexdesk.chart')
        && !registry.hasWidget('flexdesk.kpi'));
    ok('the barrel exports the tiles and the registrar',
       barrel.ChartTile === ChartTile && barrel.KpiTile === KpiTile
       && barrel.registerChartTiles === registerChartTiles);
    check('the types are namespaced', [ChartTile.TYPE, KpiTile.TYPE], ['flexdesk.chart', 'flexdesk.kpi']);

    registerChartTiles();
    registerChartTiles();
    const ours = registry.getAllWidgetTypes().filter((t) => t.type.startsWith('flexdesk.'));
    check('two calls register two widgets, once each', ours.map((t) => t.type).sort(),
          ['flexdesk.chart', 'flexdesk.kpi']);
    ok('and the registered classes are these', registry.getWidget('flexdesk.chart') === ChartTile
       && registry.getWidget('flexdesk.kpi') === KpiTile);
}

// ════════════════════════════════════════════════════════════════════════
// 1. FIGURES
// ════════════════════════════════════════════════════════════════════════
{
    const line = planOf('line', { x: days, y: [10, 8, 5, 2], name: 'Remaining' });
    check('line: one scatter trace in lines mode', [line.traces[0].type, line.traces[0].mode], ['scatter', 'lines']);
    check('line: ISO date strings make a date axis', line.layout.xaxis.type, 'date');
    check('line: no shapes when given no markers', 'shapes' in line.layout, false);

    const bar = planOf('bar', [{ x: ['a', 'b'], y: [1, 2], name: 'A' }, { x: ['a', 'b'], y: [3, 4], name: 'B' }]);
    check('bar: two grouped bar traces on a category axis',
          [bar.traces.map((t) => t.type), bar.layout.barmode, bar.layout.xaxis.type],
          [['bar', 'bar'], 'group', 'category']);

    const area = planOf('area', { x: [1, 2, 3], y: [1, 4, 9], name: 'Sq' });
    check('area: filled to zero on a number axis', [area.traces[0].fill, 'type' in area.layout.xaxis && area.layout.xaxis.type],
          ['tozeroy', 'linear']);

    const pie = planOf('pie', { labels: ['Open', 'Done', null], values: [3, 5, 1] });
    check('pie: labels/values, null label shown as a dash',
          [pie.traces[0].type, pie.traces[0].labels, pie.traces[0].values, 'hole' in pie.traces[0]],
          ['pie', ['Open', 'Done', '—'], [3, 5, 1], false]);
    ok('pie: no x axis', !('xaxis' in pie.layout));

    const donut = planOf('donut', { x: ['A', 'B'], y: [1, 2] });
    check('donut: a pie with a hole, from x/y too', [donut.traces[0].type, donut.traces[0].hole], ['pie', 0.55]);

    const hist = planOf('histogram', { values: [1, 2, 2, '3', null, 'x'], name: 'Age' });
    check('histogram: numeric values only', [hist.traces[0].type, hist.traces[0].x], ['histogram', [1, 2, 2, 3]]);
    check('histogram: overlay, Count axis', [hist.layout.barmode, hist.layout.yaxis.title.text], ['overlay', 'Count']);

    const unit = planOf('line', { x: [1, 2], y: [1, 2], name: 'Remaining' }, { unit: 'pts' });
    check('the unit sits beside the value axis title', unit.layout.yaxis.title.text, 'Remaining (pts)');

    const horiz = planOf('bar-horizontal', { x: ['a', 'b'], y: [1, 2] });
    check('horizontal bar swaps data and axes', [horiz.traces[0].orientation, horiz.traces[0].y, horiz.layout.yaxis.type],
          ['h', ['a', 'b'], 'category']);

    const many = Array.from({ length: 5000 }, (_, i) => i);
    const cut = planOf('line', { x: many, y: many }, { max_points: 100 });
    ok('a long continuous series is decimated', cut.traces[0].x.length <= 100 && cut.traces[0].x.at(-1) === 4999);
}

// ════════════════════════════════════════════════════════════════════════
// 2. A BURNDOWN: STEP + DASHED + "TODAY"
// ════════════════════════════════════════════════════════════════════════
{
    const plan = planOf('line', {
        series: [
            { x: days, y: [10, 10, 6, 4], name: 'Remaining', interpolation: 'step', customdata: ['a', 'b', 'c', 'd'] },
            { x: days, y: [10, 7, 3, 0], name: 'Ideal', lineStyle: 'dashed' },
            { x: days, y: [9, 9, 9, 9], name: 'Scope', line: { shape: 'hv', dash: 'dot' } },
        ],
        markers: [{ x: '2026-10-03', label: 'Today' }],
    });
    check('the step series is drawn hv', plan.traces[0].line.shape, 'hv');
    check('the dashed series is dashed and linear', [plan.traces[1].line.dash, plan.traces[1].line.shape], ['dash', 'linear']);
    check('an explicit line object is merged over the built one',
          [plan.traces[2].line.shape, plan.traces[2].line.dash, typeof plan.traces[2].line.color], ['hv', 'dot', 'string']);
    check('customdata rides on the trace', plan.traces[0].customdata, ['a', 'b', 'c', 'd']);
    check('one vertical shape at today, full height',
          plan.layout.shapes.map((s) => [s.type, s.xref, s.yref, s.x0, s.x1, s.y0, s.y1]),
          [['line', 'x', 'paper', '2026-10-03', '2026-10-03', 0, 1]]);
    check('labelled', plan.layout.annotations.map((a) => a.text), ['Today']);
}

// ════════════════════════════════════════════════════════════════════════
// 4. THE KPI — without Plotly
// ════════════════════════════════════════════════════════════════════════
{
    delete globalThis.Plotly;
    const kpi = mountTile(KpiTile, { title: 'Open', unit: 'bugs' });
    kpi.setData({ value: 42, reference: 37, label: 'Open bugs', note: 'vs last week' });
    const q = (sel) => kpi.contentElement.querySelector(sel);
    check('the number, with its unit', q('.fd-kpi__value')?.textContent, '42 bugs');
    check('the label', q('.fd-kpi__label')?.textContent, 'Open bugs');
    check('the delta: arrow and sign, not colour alone', q('.fd-kpi__delta')?.textContent, '▲ +5 bugs');
    ok('rising is --up by default', q('.fd-kpi__delta')?.classList.contains('fd-kpi__delta--up'));
    check('the note is the foot', q('.fd-kpi__foot')?.textContent, 'vs last week');
    check('the header shows config.title', kpi.element.querySelector('.tile-title')?.textContent, 'Open');

    kpi.update(undefined, { invert_delta: true });
    ok('invert_delta flips the colour, not the arrow',
       q('.fd-kpi__delta')?.classList.contains('fd-kpi__delta--down') && q('.fd-kpi__delta').textContent.startsWith('▲'));

    kpi.setData({ value: 7 });
    ok('no reference, no delta', q('.fd-kpi__value')?.textContent === '7 bugs' && !q('.fd-kpi__delta'));

    kpi.setData({ value: 5, reference: 0 });
    check('a zero reference is a reference', q('.fd-kpi__delta')?.textContent, '▲ +5 bugs');

    kpi.update(undefined, { delta_relative: true });
    kpi.setData({ value: 5, reference: 0 });
    check('…with no percentage', q('.fd-kpi__delta')?.textContent, '▲ —');

    kpi.setData(3);
    check('a bare number is a value', q('.fd-kpi__value')?.textContent, '3 bugs');

    kpi.setData(null);
    ok('null is the empty state', !!kpi.contentElement.querySelector('.tile-empty'));
}

// ════════════════════════════════════════════════════════════════════════
// 5. A CHART WITH NO PLOTLY
// ════════════════════════════════════════════════════════════════════════
{
    delete globalThis.Plotly;
    const events = [];
    const tile = mountTile(ChartTile, {}, { eventBus: { emit: (n, p) => events.push([n, p]) } });
    const before = unhandled;
    let threw = null;
    try { tile.setData({ x: [1, 2], y: [3, 4] }); } catch (err) { threw = err; }
    await ticks();
    ok('setData does not throw', threw === null, String(threw));
    const err = tile.contentElement.querySelector('.twm-tile-error');
    ok('the tile shows the error state', !!err);
    ok('and says what is missing', /Plotly/.test(err?.textContent || ''), err?.textContent);
    ok('with no unhandled rejection', unhandled === before);
    check('the failure is reported on the event bus', events.map(([n]) => n), ['tile:render-failed']);
    ok('nothing is held as a plot', tile._plotEl === null && tile._drawn === false);
}

// ════════════════════════════════════════════════════════════════════════
// 6. setData(empty) DURING AN IN-FLIGHT DRAW
// ════════════════════════════════════════════════════════════════════════
{
    const P = fakePlotly({ hold: true });
    globalThis.Plotly = P;
    const tile = mountTile(ChartTile);
    tile.setData({ x: [1, 2], y: [3, 4] });
    await ticks();
    check('the draw is in flight', P.newPlots.length, 1);
    const host = P.newPlots[0].gd;
    ok('its host is held while it draws', tile._plotEl === host && tile._drawn === false);

    tile.setData(null);
    ok('setData(null) shows the empty state at once', !!tile.contentElement.querySelector('.tile-empty'));
    ok('and drops the plot reference', tile._plotEl === null && tile._drawn === false);

    P.release();
    await ticks();
    ok('the late figure is never marked drawn', tile._drawn === false && tile._plotEl === null);
    ok('it is purged', P.purged.includes(host));
    ok('and the empty state stays', !!tile.contentElement.querySelector('.tile-empty')
       && !tile.contentElement.contains(host));

    // The same through a direct state call — the path a loading embedder takes.
    tile.setData({ x: [1, 2], y: [5, 6] });
    await ticks();
    const host2 = P.newPlots.at(-1).gd;
    tile.showLoading();
    await ticks();                          // purge() awaits ensurePlotly()
    ok('showLoading releases the plot too', tile._plotEl === null && P.purged.includes(host2));
    P.release();
    await ticks();
    ok('…and the in-flight draw does not come back', tile._drawn === false
       && !!tile.contentElement.querySelector('.tile-loading'));

    // A newer draw wins over an older one.
    tile.setData({ x: [1], y: [1] });
    await ticks();
    tile.setData({ x: [2], y: [2] });
    await ticks();
    const [older, newer] = P.newPlots.slice(-2).map((c) => c.gd);
    P.release();
    await ticks();
    ok('of two draws, the newer one is the plot', tile._plotEl === newer && tile._drawn === true
       && P.purged.includes(older) && !P.purged.includes(newer));
}

// ════════════════════════════════════════════════════════════════════════
// 7. CLICK → customdata
// ════════════════════════════════════════════════════════════════════════
{
    const P = fakePlotly();
    globalThis.Plotly = P;
    const clicks = [];
    const tile = mountTile(ChartTile, { chart_type: 'pie' }, { onPointClick: (e) => clicks.push(e.customdata) });
    tile.setData({ labels: ['A', 'B', 'C'], values: [1, 2, 3], customdata: ['id-a', 'id-b', 'id-c'] });
    await ticks();
    const { gd, data, config } = P.newPlots.at(-1);
    check('the tile draws with scrollZoom off', config.scrollZoom, false);
    gd._handlers.plotly_click({ points: [{ data: data[0], pointNumber: 1, customdata: ['id-b'] }] });
    gd._handlers.plotly_click({ points: [{ data: data[0], pointIndex: 2 }] });
    check('pie: customdata by pointNumber ?? pointIndex', clicks, ['id-b', 'id-c']);

    const lineClicks = [];
    const t2 = mountTile(ChartTile, { chart_type: 'line' });
    t2.onPointClick = (e) => lineClicks.push(e.customdata);
    t2.setData({ x: [1, 2], y: [3, 4], customdata: ['k1', 'k2'] });
    await ticks();
    const c2 = P.newPlots.at(-1);
    c2.gd._handlers.plotly_click({ points: [{ data: c2.data[0], pointIndex: 1, customdata: 'k2' }] });
    check('line: the point\'s own customdata, assignable after construction', lineClicks, ['k2']);
}

// ════════════════════════════════════════════════════════════════════════
// 8. CONFIG ROUND TRIP THROUGH THE GRID
// ════════════════════════════════════════════════════════════════════════
{
    globalThis.Plotly = fakePlotly();
    const container = document.createElement('div');
    document.getElementById('root').appendChild(container);
    const grid = new TileGrid({ container, showToolbar: false, onLayoutChange: () => {} });
    const chart = grid.addTile('flexdesk.chart', { x: 0, y: 0, w: 6, h: 4 },
                               { chart_type: 'bar', title: 'Velocity', unit: 'pts' }, 'c1');
    grid.addTile('flexdesk.kpi', { x: 6, y: 0, w: 3, h: 2 }, { title: 'Open', unit: 'bugs' }, 'k1');
    ok('the grid builds a ChartTile by type', chart instanceof ChartTile);
    check('the header shows the configured title', chart.element.querySelector('.tile-title')?.textContent, 'Velocity');

    const saved = JSON.parse(JSON.stringify(grid.getLayout()));
    grid.setLayout(saved);
    const back = grid.tiles.get('c1');
    ok('setLayout rebuilt a ChartTile', back instanceof ChartTile && back !== chart);
    check('chart type, title and unit survive',
          [back.config.chart_type, back.config.title, back.config.unit], ['bar', 'Velocity', 'pts']);
    check('the KPI config survives', [grid.tiles.get('k1').config.title, grid.tiles.get('k1').config.unit],
          ['Open', 'bugs']);
    check('and the header says so again', back.element.querySelector('.tile-title')?.textContent, 'Velocity');
    check('a config change re-titles the header', (back.update(undefined, { title: 'Throughput' }),
          back.element.querySelector('.tile-title')?.textContent), 'Throughput');
}

// ════════════════════════════════════════════════════════════════════════
// 9. EMPTY STATE, AND RESIZE
// ════════════════════════════════════════════════════════════════════════
{
    const P = fakePlotly();
    globalThis.Plotly = P;
    const tile = mountTile(ChartTile);
    for (const [what, data] of [['null', null], ['[]', []], ['{series: []}', { series: [] }],
                                ['a series with no points', { x: [], y: [] }]]) {
        tile.setData(data);
        await ticks();
        ok(`${what} is the empty state`, !!tile.contentElement.querySelector('.tile-empty'));
    }
    check('no figure was drawn for any of them', P.newPlots.length, 0);

    tile.onResize();
    check('onResize with nothing drawn does nothing', P.resized.length, 0);
    tile.setData({ x: [1, 2], y: [1, 2], note: 'Points from 4 stories' });
    await ticks();
    check('the note is under the figure', tile.contentElement.querySelector('.fd-chart-tile__note')?.textContent,
          'Points from 4 stories');
    tile.onResize();
    await ticks();
    check('onResize on a drawn figure relayouts it once', P.resized.length, 1);

    const host = tile._plotEl;
    tile.dispose();
    await ticks();
    ok('dispose purges the figure', P.purged.includes(host));
}

// ════════════════════════════════════════════════════════════════════════
// 10. THE GRID'S CONFIG SAVE ON A TILE FED THROUGH setData
// ════════════════════════════════════════════════════════════════════════
// `TileGrid`'s config-modal save calls `tile.update(grid.data, newConfig)`, and
// a grid whose tiles are fed one by one has `grid.data === null`. That null is
// "the grid has nothing", not "clear this tile": the tile keeps its series and
// redraws them in the new chart type. And a KPI of 0 is a value, so a config
// change re-renders it like any other.
{
    const P = fakePlotly();
    globalThis.Plotly = P;
    const container = document.createElement('div');
    document.getElementById('root').appendChild(container);
    let onSave = null;
    const eventBus = { emit(name, detail) { if (name === 'grid:config-modal-show') onSave = detail.onSave; } };
    const grid = new TileGrid({ container, showToolbar: false, eventBus, onLayoutChange: () => {} });
    const chart = grid.addTile('flexdesk.chart', { x: 0, y: 0, w: 6, h: 4 }, { chart_type: 'line' }, 'cs1');
    chart.setData({ x: [1, 2, 3], y: [3, 2, 1] });
    await ticks();
    const before = P.newPlots.length;

    grid._onTileConfigRequest({ detail: { tileId: 'cs1', tileType: 'flexdesk.chart', config: chart.config } });
    onSave({ ...chart.config, chart_type: 'bar' });
    await ticks();
    ok('a config save keeps the series the tile was given', chart.data !== null);
    check('…and redraws them in the new type', P.newPlots.slice(before).map((p) => p.data[0].type), ['bar']);

    const kpi = grid.addTile('flexdesk.kpi', { x: 6, y: 0, w: 3, h: 2 }, { unit: 'bugs' }, 'ks1');
    kpi.setData(0);
    check('a KPI of 0 is a value', kpi.contentElement.querySelector('.fd-kpi__value')?.textContent, '0 bugs');
    grid._onTileConfigRequest({ detail: { tileId: 'ks1', tileType: 'flexdesk.kpi', config: kpi.config } });
    onSave({ ...kpi.config, unit: 'open' });
    check('a config save re-renders a KPI of 0', kpi.contentElement.querySelector('.fd-kpi__value')?.textContent,
          '0 open');
    kpi.setData(null);
    ok('setData(null) is still the way to clear it', !!kpi.contentElement.querySelector('.tile-empty'));
    grid.dispose();
}

ok('no unhandled rejection anywhere in the suite', unhandled === 0);

console.log(failures === 0
    ? '\nall assertions passed\n'
    : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
