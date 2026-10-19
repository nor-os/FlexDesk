/**
 * ══ THE FIGURE TILE (0.17.0, STORY-0063) ══
 *
 * `src/tiles/figure_tile.js` is the base every Plotly tile draws through: a
 * subclass answers `figure(data)` with `{traces, layout, config?, frames?}` or
 * `null`, and the base owns the rest. What this suite pins:
 *
 *   §1  with Plotly loaded LAZILY through setPlotlySource, the first draw
 *       succeeds — and data that changes while Plotly loads draws only once
 *   §2  a subclass answering null shows the empty state (its own message too)
 *   §3  a figure() that throws — or answers the wrong shape — is the error
 *       state plus tile:render-failed, with no unhandled rejection
 *   §4  a draw finishing after a newer draw is discarded and purged
 *   §5  Expand opens openRawTracesWindow with the last figure drawn
 *   §6  config over the defaults, frames, a resize after it settles, dispose
 *   §7  the menu extends TileBase's items with Download PNG; a click carries
 *       the point's customdata; the barrel exports the class
 *
 * ChartTile is a FigureTile; `chart_tiles.test.mjs` is its suite and runs
 * unchanged on this base.
 *
 *     node tests/figure_tile.test.mjs              # from ../FlexDesk
 *     node tests/run.mjs                           # with every other suite
 *
 * Imports `../src/` directly. Plotly is a FAKE whose `newPlot` can be held
 * until the test releases it. jsdom is borrowed from the sibling Tables
 * checkout; absent, this SKIPS loudly rather than passing.
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
    console.log('figure tile: SKIPPED — needs jsdom '
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
dom.window.ResizeObserver ||= globalThis.ResizeObserver;

let unhandled = 0;
process.on('unhandledRejection', (err) => {
    unhandled += 1;
    console.log(`  (unhandled rejection: ${err?.message || err})`);
});

const { FigureTile } = await import('../src/tiles/figure_tile.js');
const { TileBase } = await import('../src/tiles/tile_base.js');
const { ChartTile } = await import('../src/tiles/chart_tiles.js');
const { setPlotlySource } = await import('../src/charts/plotly_wrapper.js');
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
const ticks = async (n = 8) => { for (let i = 0; i < n; i++) await tick(); };

/** A Plotly whose `newPlot` is held until released — or resolves at once. */
function fakePlotly({ hold = false } = {}) {
    const P = {
        newPlots: [], purged: [], resized: [], frames: [], pending: [],
        newPlot(gd, data, layout, config) {
            P.newPlots.push({ gd, data, layout, config });
            gd.classList.add('js-plotly-plot');
            gd._handlers = {};
            gd.on = (name, fn) => { gd._handlers[name] = fn; };
            if (!hold) return Promise.resolve(gd);
            return new Promise((resolve) => P.pending.push({ gd, go: () => resolve(gd) }));
        },
        addFrames(gd, frames) { P.frames.push({ gd, frames }); return Promise.resolve(); },
        purge(gd) { P.purged.push(gd); },
        Plots: { resize(gd) { P.resized.push(gd); } },
        /** Release the held draw on `gd` only. */
        releaseOne(gd) {
            const i = P.pending.findIndex((p) => p.gd === gd);
            if (i >= 0) P.pending.splice(i, 1)[0].go();
        },
        release() { P.pending.splice(0).forEach((p) => p.go()); },
    };
    return P;
}
/** Plotly as the page sees it: the tile reads the global, the expand window `window.Plotly`. */
function installPlotly(P) {
    globalThis.Plotly = P;
    window.Plotly = P;
    return P;
}

/** A subclass that is nothing but `figure()` — the shape the story asks for. */
class SpreadTile extends FigureTile {
    static TYPE = 'test.spread';
    static TITLE = 'Spread';
    figure(data) {
        if (!data?.values?.length) return null;
        return {
            traces: [{ type: 'histogram', x: data.values, name: data.name || 'values' }],
            layout: { margin: { l: 40, r: 10, t: 8, b: 30 } },
            ...(data.config ? { config: data.config } : {}),
            ...(data.frames ? { frames: data.frames } : {}),
        };
    }
}

function mountTile(Tile, extra = {}, config = {}) {
    const container = document.createElement('div');
    document.getElementById('root').appendChild(container);
    const tile = new Tile({ id: `f-${Math.random().toString(36).slice(2, 7)}`, grid: null, config, ...extra });
    tile.mount(container);
    return tile;
}

console.log('\ntiles: the figure tile\n');

// ════════════════════════════════════════════════════════════════════════
// 1 (first: Plotly must not be loaded yet). PLOTLY LOADED LAZILY
// ════════════════════════════════════════════════════════════════════════
{
    ok('Plotly is not loaded at the start', typeof globalThis.Plotly === 'undefined');
    const P = fakePlotly();
    globalThis.__fakePlotly = P;
    const fetched = [];
    let releaseFetch;
    const fetchGate = new Promise((r) => { releaseFetch = r; });
    globalThis.fetch = async (url) => {
        fetched.push(String(url));
        await fetchGate;
        // What a UMD bundle's browser-global branch does: set the global.
        return { ok: true, status: 200, text: async () => 'globalThis.Plotly = globalThis.__fakePlotly;' };
    };
    setPlotlySource('/vendor/plotly.min.js');

    const events = [];
    const tile = mountTile(SpreadTile, { eventBus: { emit: (n, p) => events.push([n, p]) } });
    tile.setData({ values: [1, 2, 3], name: 'first' });
    await ticks();
    check('the source is fetched once', fetched, ['/vendor/plotly.min.js']);
    ok('nothing is drawn while Plotly loads', P.newPlots.length === 0 && tile._drawn === false);
    tile.setData({ values: [4, 5, 6], name: 'latest' });
    await ticks();
    releaseFetch();
    await ticks();

    check('the first draw succeeds once Plotly arrives', P.newPlots.length, 1);
    check('…and draws the latest data, not every value it was handed', P.newPlots[0]?.data[0].name, 'latest');
    ok('the tile holds a drawn figure', tile._drawn === true && tile._plotEl === P.newPlots[0]?.gd
       && tile.contentElement.contains(tile._plotEl));
    ok('no error state and no failure event', !tile.contentElement.querySelector('.twm-tile-error')
       && events.length === 0, JSON.stringify(events));
    check('still one fetch', fetched.length, 1);
    window.Plotly = P;
}

// ════════════════════════════════════════════════════════════════════════
// 2. NULL IS THE EMPTY STATE
// ════════════════════════════════════════════════════════════════════════
{
    const P = installPlotly(fakePlotly());
    const tile = mountTile(SpreadTile);
    tile.setData({ values: [] });
    await ticks();
    const empty = tile.contentElement.querySelector('.tile-empty');
    ok('a subclass returning null shows the empty state', !!empty);
    ok('with the class\'s EMPTY_MESSAGE', empty?.textContent.includes(FigureTile.EMPTY_MESSAGE), empty?.textContent);
    check('and nothing is drawn', P.newPlots.length, 0);

    tile.setData({ values: [1, 2] });
    await ticks();
    const drawn = tile._plotEl;
    tile.setData(null);
    await ticks();
    ok('going empty releases the figure on screen', P.purged.includes(drawn) && tile._plotEl === null
       && tile.getExpandData() === null);

    class SaysWhy extends FigureTile {
        figure(data) {
            if (!data?.variable) { this.showEmpty('No variable "gdp" in this run.'); return null; }
            return { traces: [] };
        }
    }
    const why = mountTile(SaysWhy);
    why.setData({});
    await ticks();
    check('a subclass may say why, and its message stays',
          why.contentElement.querySelector('.tile-empty span:last-child')?.textContent,
          'No variable "gdp" in this run.');
}

// ════════════════════════════════════════════════════════════════════════
// 3. figure() THROWS
// ════════════════════════════════════════════════════════════════════════
{
    installPlotly(fakePlotly());
    const before = unhandled;
    class Broken extends FigureTile {
        figure() { throw new Error('no such column: price'); }
    }
    const events = [];
    const tile = mountTile(Broken, { eventBus: { emit: (n, p) => events.push([n, p]) } });
    let threw = null;
    try { tile.setData({ anything: true }); } catch (err) { threw = err; }
    await ticks();
    ok('setData does not throw', threw === null, String(threw));
    const err = tile.contentElement.querySelector('.twm-tile-error');
    ok('the tile shows the error state', !!err);
    ok('and says what went wrong', /no such column: price/.test(err?.textContent || ''), err?.textContent);
    check('tile:render-failed is emitted with the tile and the message', events,
          [['tile:render-failed', { tileId: tile.id, message: 'no such column: price' }]]);
    ok('nothing is held as a plot', tile._plotEl === null && tile._drawn === false);

    class WrongShape extends FigureTile { figure() { return { data: [] }; } }
    const ev2 = [];
    const t2 = mountTile(WrongShape, { eventBus: { emit: (n) => ev2.push(n) } });
    t2.setData({ x: 1 });
    await ticks();
    ok('a figure without traces is an error too, not a blank tile',
       !!t2.contentElement.querySelector('.twm-tile-error') && ev2.join() === 'tile:render-failed');

    const t3 = mountTile(FigureTile);
    t3.setData({ x: 1 });
    await ticks();
    ok('the base class alone says figure() is not implemented',
       /figure\(\) must be implemented/.test(t3.contentElement.querySelector('.twm-tile-error')?.textContent || ''));
    ok('with no unhandled rejection', unhandled === before);
}

// ════════════════════════════════════════════════════════════════════════
// 4. A STALE DRAW IS DISCARDED
// ════════════════════════════════════════════════════════════════════════
{
    const P = installPlotly(fakePlotly({ hold: true }));
    const tile = mountTile(SpreadTile);
    tile.setData({ values: [1], name: 'older' });
    await ticks();
    tile.setData({ values: [2], name: 'newer' });
    await ticks();
    check('two draws are in flight', P.newPlots.map((c) => c.data[0].name), ['older', 'newer']);
    const [older, newer] = P.newPlots.map((c) => c.gd);

    P.releaseOne(newer);
    await ticks();
    ok('the newer draw lands and is the plot', tile._plotEl === newer && tile._drawn === true);
    const purgedBefore = P.purged.filter((g) => g === older).length;
    P.releaseOne(older);
    await ticks();
    ok('the older draw, finishing after it, is discarded', tile._plotEl === newer && tile._drawn === true
       && tile.contentElement.contains(newer) && !tile.contentElement.contains(older));
    ok('…and purged when it lands, while the newer one is not',
       P.purged.filter((g) => g === older).length > purgedBefore && !P.purged.includes(newer));
    check('the figure Expand would open is the newer one', tile.getExpandData()?.traces[0].name, 'newer');
}

// ════════════════════════════════════════════════════════════════════════
// 5. EXPAND OPENS openRawTracesWindow WITH THE LAST FIGURE
// ════════════════════════════════════════════════════════════════════════
{
    const P = installPlotly(fakePlotly());
    ok('a figure tile is expandable', FigureTile.EXPANDABLE === true);
    const tile = mountTile(SpreadTile, {}, { title: 'Wealth spread' });
    const btn = tile.element.querySelector('.tile-expand-btn');
    ok('its header has the expand button', !!btn);

    btn.click();
    await ticks();
    ok('before anything is drawn there is nothing to expand',
       !document.querySelector('.twm-plot-window-chart'));

    tile.setData({ values: [3, 1, 4, 1, 5], name: 'wealth' });
    await ticks();
    const drawnFigure = P.newPlots.at(-1);
    btn.click();
    await ticks();
    const windowDraw = P.newPlots.find((c) => c.gd.classList.contains('twm-plot-window-chart'));
    ok('Expand opens the raw-traces window and draws in it', !!windowDraw);
    check('…the traces of the last figure', windowDraw?.data.map((t) => [t.type, t.x, t.name]),
          drawnFigure.data.map((t) => [t.type, t.x, t.name]));
    ok('…as copies, not the objects the tile drew', windowDraw?.data[0] !== drawnFigure.data[0]);
    check('…with the figure\'s layout under the window\'s defaults', windowDraw?.layout.margin,
          { l: 40, r: 10, t: 8, b: 30 });
    ok('the window is titled from the tile\'s config',
       [...document.querySelectorAll('*')].some((el) => el.children.length === 0
           && el.textContent.trim() === 'Wealth spread'));
    ok('the tile holds the window handle', tile._expandWindow?.isVisible === true);
    tile.dispose();
    await ticks();
    ok('disposing the tile closes it', !document.querySelector('.twm-plot-window-chart'));
}

// ════════════════════════════════════════════════════════════════════════
// 6. CONFIG, FRAMES, RESIZE, DISPOSE
// ════════════════════════════════════════════════════════════════════════
{
    const P = installPlotly(fakePlotly());
    const tile = mountTile(SpreadTile);
    const frames = [{ name: 'f1', data: [{ x: [1] }] }];
    tile.setData({ values: [1, 2], config: { displayModeBar: true }, frames });
    await ticks();
    const call = P.newPlots.at(-1);
    check('the figure\'s config goes over the tile defaults',
          [call.config.displayModeBar, call.config.scrollZoom, call.config.responsive], [true, false, true]);
    check('frames are added to the figure drawn', P.frames.map((f) => [f.gd === call.gd, f.frames]),
          [[true, frames]]);

    tile.onResize();
    await ticks();
    check('a settled resize relayouts the drawn figure once', P.resized, [call.gd]);
    tile.showLoading();
    tile.onResize();
    await ticks();
    check('…and nothing once it is gone', P.resized.length, 1);

    tile.setData({ values: [5] });
    await ticks();
    const host = tile._plotEl;
    tile.dispose();
    await ticks();
    ok('dispose purges the figure', P.purged.includes(host));
}

// ════════════════════════════════════════════════════════════════════════
// 7. MENU, CLICK, BARREL
// ════════════════════════════════════════════════════════════════════════
{
    const P = installPlotly(fakePlotly());
    P.toImage = async () => 'data:image/png;base64,QUJD';
    const base = TileBase.prototype.menuItems.call(new SpreadTile({ id: 'm', grid: null }));
    const tile = mountTile(SpreadTile);
    check('the menu is TileBase\'s items, then Download PNG', tile.menuItems().map((i) => i.action),
          [...base.map((i) => i.action), 'download-png']);
    check('a chart tile keeps the menu it shipped with', new ChartTile({ id: 'c', grid: null })
          .menuItems().map((i) => i.action), ['download-png']);
    ok('the ⋯ menu renders the Download PNG row',
       !!tile.element.querySelector('.tile-menu-item[data-action="download-png"]'));

    const calls = [];
    const host = { dialogs: { async saveFile(arg) { calls.push(arg); return { ok: true, path: '/tmp/x.png' }; } } };
    const saver = mountTile(SpreadTile, { host }, { title: 'Spread of x' });
    saver.setData({ values: [1] });
    await ticks();
    saver.element.querySelector('.tile-menu-item[data-action="download-png"]').click();
    await ticks();
    check('Download PNG goes through host.dialogs.saveFile', calls,
          [{ data: 'QUJD', filename: 'spread-of-x.png', kind: 'png' }]);

    const clicks = [];
    const clicker = mountTile(SpreadTile, { onPointClick: (e) => clicks.push([e.customdata, e.tile === clicker]) });
    clicker.setData({ values: [1, 2] });
    await ticks();
    const c = P.newPlots.at(-1);
    c.gd._handlers.plotly_click({ points: [{ data: { customdata: ['a', 'b'] }, pointIndex: 1 }] });
    check('a click carries the point\'s customdata and the tile', clicks, [['b', true]]);

    ok('ChartTile is a FigureTile', new ChartTile({ id: 'x', grid: null }) instanceof FigureTile);
    ok('the barrel exports FigureTile', barrel.FigureTile === FigureTile);
}

ok('no unhandled rejection anywhere in the suite', unhandled === 0);

console.log(failures === 0
    ? '\nall assertions passed\n'
    : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
