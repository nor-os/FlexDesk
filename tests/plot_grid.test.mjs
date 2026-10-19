/**
 * ══ A PLOT CONFIG DRAWS INTO ANY CONTAINER (STORY-0060) ══
 *
 * `renderPlotGrid(container, plotConfig, results, options)` is what
 * PlotPopoutWindow used to keep private: the subplot grid and every figure in
 * it. Plot cells and plot tiles can now draw the same config the same way.
 * What this suite pins:
 *
 *   §1  a 2x2 config renders four subplots in the right grid areas
 *   §2  a subplot with no data shows the empty message; a slot with no subplot
 *       shows its own; null results empty every subplot; PlotPopoutWindow's
 *       updateConfig() with no data rebuilds the cells for the new layout
 *   §3  for the fixture configs, PlotPopoutWindow draws the same trace count,
 *       names and axes as before the refactor (tests/fixtures/plot_grid_baseline.json)
 *   §4  a zero-size or detached container defers drawing until it has a size
 *       (the fake ResizeObserver reports a resize only to observers of that element);
 *       a deferred draw that fails shows the empty message; PlotPopoutWindow's
 *       toolbar and PNG export see a figure the grid drew on a resize
 *   §5  dispose() purges every figure
 *   §6  the options: resolveSeries, overlays, seriesTransforms, derivedTraces,
 *       hiddenSeries, theme, x variable, x-range clip, NaN handling, stacks,
 *       multiple y-axes, reference lines and bands, legend, layout, onError,
 *       a stale draw is dropped
 *   §7  the barrel, the stylesheet, no app vocabulary
 *
 * ── HOW TO RUN ───────────────────────────────────────────────────────────
 *
 *     node tests/plot_grid.test.mjs                    # from ../FlexDesk
 *     node tests/plot_grid.test.mjs --write-baseline   # re-record §3 (on purpose only)
 *     node tests/run.mjs                               # with every other suite
 *
 * Imports `../src/` directly. Plotly is a FAKE on `globalThis` that records
 * every `react()` and `purge()`. jsdom is borrowed from the sibling Tables
 * checkout; absent, this SKIPS loudly rather than passing.
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { ruleBody } from './css_rules.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASELINE = resolvePath(HERE, 'fixtures/plot_grid_baseline.json');

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
    console.log('plot grid: SKIPPED — needs jsdom '
        + '(`cd ../Tables/web && npm install`, or `npm i -D jsdom` here)');
    process.exit(0);
}

const dom = new JSDOM('<!doctype html><body></body>',
                      { url: 'http://localhost/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'Event',
                   'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'getComputedStyle',
                   'navigator', 'requestAnimationFrame', 'cancelAnimationFrame',
                   'MutationObserver', 'localStorage']) {
    if (dom.window[key] !== undefined && globalThis[key] === undefined) {
        globalThis[key] = dom.window[key];
    }
}

/** A ResizeObserver whose callbacks the suite fires by hand. */
const observers = new Set();
globalThis.ResizeObserver = class {
    constructor(cb) { this.cb = cb; this.targets = []; observers.add(this); }
    observe(el) { this.targets.push(el); }
    unobserve() {}
    disconnect() { observers.delete(this); this.targets = []; }
};
/** `el` changed size: only the observers that observe `el` hear of it, as in a browser. */
const fireResize = (el) => {
    if (!el) throw new Error('fireResize needs the element that changed size');
    for (const o of [...observers]) if (o.targets.includes(el)) o.cb([{ target: el }]);
};
const observing = (el) => [...observers].some((o) => o.targets.includes(el));

// jsdom lays nothing out. Every element is 400x300 unless it, or an ancestor,
// is in `zeroSize`.
const zeroSize = new Set();
const sized = (el, v) => {
    for (let n = el; n; n = n.parentElement) if (zeroSize.has(n)) return 0;
    return v;
};
Object.defineProperty(dom.window.HTMLElement.prototype, 'offsetWidth', { get() { return sized(this, 400); } });
Object.defineProperty(dom.window.HTMLElement.prototype, 'offsetHeight', { get() { return sized(this, 300); } });

/** A Plotly that records every figure it draws and every div it purges. */
const Plotly = {
    reacts: [],
    purged: [],
    resized: [],
    async react(gd, data, layout) { gd._fullLayout = layout; Plotly.reacts.push({ gd, data, layout }); return gd; },
    async newPlot(gd, data, layout) { return Plotly.react(gd, data, layout); },
    purge(gd) { delete gd._fullLayout; Plotly.purged.push(gd); },
    relayout() { return Promise.resolve(); },
    Plots: { resize(gd) { Plotly.resized.push(gd); return Promise.resolve(); } },
};
globalThis.Plotly = Plotly;
dom.window.Plotly = Plotly;
const resetPlotly = () => { Plotly.reacts.length = 0; Plotly.purged.length = 0; Plotly.resized.length = 0; };

let unhandled = 0;
process.on('unhandledRejection', (err) => {
    unhandled += 1;
    console.log(`  (unhandled rejection: ${err?.message || err})`);
});

const { renderPlotGrid, resolveSeriesData, PLOT_GRID_THEME } = await import('../src/charts/plot_grid.js');
const { PLOT_LAYOUTS, makeDefaultSubplot } = await import('../src/charts/plot_config.js');
const { PlotPopoutWindow } = await import('../src/charts/plot_popout_window.js');
const { FIXTURES, captureFixtures } = await import('./fixtures/plot_grid_fixtures.mjs');
const barrel = await import('../charts.js');

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
const ticks = async (n = 10) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0)); };
/** Past a requestAnimationFrame (jsdom's visual mode runs them at ~60 Hz). */
const settle = async () => { await new Promise((r) => setTimeout(r, 40)); await ticks(); };

const mountHost = ({ attach = true } = {}) => {
    const el = document.createElement('div');
    if (attach) document.body.appendChild(el);
    return el;
};
/** A subplot drawing `variables` on one left axis. */
const sp = (variables, extra = {}) => {
    const s = makeDefaultSubplot(0);
    s.yAxes[0].series = variables.map((v, i) => ({ id: `s-${v}-${i}`, variable: v, label: '', color: '#ff0000' }));
    return Object.assign(s, extra);
};
const RESULTS = { time: [0, 1, 2, 3], series: { a: [1, 2, 3, 4], b: [4, 3, 2, 1], c: [1, NaN, 3, null] } };
const lastFigureFor = (gd) => Plotly.reacts.filter((r) => r.gd === gd).at(-1);

if (process.argv.includes('--write-baseline')) {
    const captured = await captureFixtures(PlotPopoutWindow, Plotly, settle);
    writeFileSync(BASELINE, `${JSON.stringify(captured, null, 2)}\n`);
    console.log(`wrote ${BASELINE}`);
    process.exit(0);
}

console.log('\ncharts: renderPlotGrid\n');

// ════════════════════════════════════════════════════════════════════════
// §1 A 2x2 CONFIG: FOUR SUBPLOTS IN THE RIGHT GRID AREAS
// ════════════════════════════════════════════════════════════════════════
{
    console.log('§1 a 2x2 config renders four subplots in the right grid areas');
    resetPlotly();
    const host = mountHost();
    const config = { layout: '2x2', subplots: [sp(['a']), sp(['b']), sp(['a', 'b']), sp(['c'])] };
    const grid = renderPlotGrid(host, config, RESULTS);
    await settle();

    const root = host.querySelector('.twm-plot-grid');
    ok('the container gets one .twm-plot-grid', host.children.length === 1 && !!root);
    check('the grid template is the layout\'s',
          [root.style.gridTemplateColumns, root.style.gridTemplateRows], ['1fr 1fr', '1fr 1fr']);
    const cells = [...root.children];
    check('four cells', cells.length, 4);
    check('each cell sits in its layout grid area',
          cells.map((c) => c.style.gridArea.replace(/\s/g, '')),
          PLOT_LAYOUTS['2x2'].areas.map((a) => a.gridArea));
    check('grid.charts is the cells, in layout order', grid.charts, cells);
    check('one figure per cell, each with its own subplot\'s traces',
          cells.map((c) => lastFigureFor(c)?.data.map((t) => t.name)),
          [['a'], ['b'], ['a', 'b'], ['c']]);

    await grid.update({ plotConfig: { layout: '1x3', subplots: config.subplots.slice(0, 3) } });
    const after = [...host.querySelector('.twm-plot-grid').children];
    check('another layout rebuilds the grid',
          [after.length, host.querySelector('.twm-plot-grid').style.gridTemplateColumns],
          [3, '1fr 1fr 1fr']);
    ok('  ...and purges the old figures', cells.every((c) => Plotly.purged.includes(c)));
    grid.dispose();
    host.remove();
}

// ════════════════════════════════════════════════════════════════════════
// §2 EMPTY STATES
// ════════════════════════════════════════════════════════════════════════
{
    console.log('\n§2 a subplot with no data shows the empty message');
    resetPlotly();
    const host = mountHost();
    const config = { layout: '2x2', subplots: [sp(['a']), sp(['nowhere']), sp([])] };
    const grid = renderPlotGrid(host, config, RESULTS, { emptyMessage: 'Nothing to show.' });
    await settle();
    const cells = grid.charts;
    const msg = (c) => c.querySelector('.twm-plot-no-data')?.textContent ?? null;
    check('a subplot with data draws; one whose series resolve to nothing shows the message',
          cells.map(msg), [null, 'Nothing to show.', 'Nothing to show.', 'No subplot configured.']);
    check('no figure is drawn for an empty subplot', Plotly.reacts.map((r) => cells.indexOf(r.gd)), [0]);

    await grid.update({ results: null });
    check('null results empty every configured subplot', cells.map(msg),
          ['Nothing to show.', 'Nothing to show.', 'Nothing to show.', 'No subplot configured.']);
    ok('  ...and the figure that was there is purged first', Plotly.purged.includes(cells[0]));

    await grid.update({ results: RESULTS });
    ok('data again: the message is replaced by the figure',
       msg(cells[0]) === null && lastFigureFor(cells[0])?.data.length === 1);

    resetPlotly();
    await grid.update({ hiddenSeries: new Set(['a']) });
    check('a subplot whose series are all hidden draws an empty figure, not the message',
          [msg(cells[0]), lastFigureFor(cells[0])?.data.length], [null, 0]);

    // Only the subplot's OWN series count: a series hidden in another subplot,
    // or one hidden while another of its own just has no data, is not "all hidden".
    resetPlotly();
    await grid.update({
        plotConfig: { layout: '2x2', subplots: [sp(['a', 'nowhere']), sp(['nowhere']), sp(['b']), sp([])] },
        hiddenSeries: new Set(['a', 'b']),
    });
    check('one series hidden, the other without data: the message, no empty figure',
          [msg(cells[0]), lastFigureFor(cells[0])], ['Nothing to show.', undefined]);
    check('a series hidden in another subplot leaves an empty subplot showing the message',
          msg(cells[1]), 'Nothing to show.');
    check('the subplot whose one series is hidden draws an empty figure',
          [msg(cells[2]), lastFigureFor(cells[2])?.data.length], [null, 0]);
    grid.dispose();
    host.remove();

    // PlotPopoutWindow with no data yet: updateConfig() to another layout
    // still rebuilds the cells for it (it used to, through #buildSubplotGrid).
    resetPlotly();
    const win = new PlotPopoutWindow({
        id: 'no-data-popout', title: 'No data',
        plotConfig: { layout: '1x1', subplots: [sp(['a'])] },
        getResults: () => null,
        services: { eventBus: { on: () => ({ dispose() {} }), emit() {} } },
    });
    await win.show();
    await settle();
    const popoutCells = () => [...win._contentEl.querySelectorAll('.twm-plot-grid > .twm-plot-grid__cell')];
    check('a popout with no results shows one cell for 1x1', popoutCells().length, 1);
    win.updateConfig({ layout: '2x2', subplots: [sp(['a']), sp(['b']), sp(['c']), sp(['d'])] });
    await settle();
    check('  ...updateConfig to 2x2 with null results rebuilds four cells in the 2x2 grid areas',
          popoutCells().map((c) => c.style.gridArea.replace(/\s/g, '')),
          PLOT_LAYOUTS['2x2'].areas.map((a) => a.gridArea));
    check('  ...each showing the empty message, with nothing drawn',
          [popoutCells().map(msg), Plotly.reacts.length],
          [Array(4).fill('No data yet.'), 0]);
    win.close();
    await settle();

    const host2 = mountHost();
    const grid2 = renderPlotGrid(host2, { layout: '1x1', subplots: [sp(['a'])] }, null);
    await settle();
    check('the default empty message', grid2.charts[0].textContent, 'No data yet.');
    grid2.dispose();
    host2.remove();
}

// ════════════════════════════════════════════════════════════════════════
// §3 POPOUT PARITY WITH THE PRE-REFACTOR RENDERER
// ════════════════════════════════════════════════════════════════════════
{
    console.log('\n§3 PlotPopoutWindow draws what it drew before the refactor');
    const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
    const captured = await captureFixtures(PlotPopoutWindow, Plotly, settle);
    check('the baseline covers every fixture', Object.keys(baseline), FIXTURES.map((f) => f.name));
    for (const fx of FIXTURES) {
        const before = baseline[fx.name];
        const now = captured[fx.name];
        check(`${fx.name}: trace count per figure`,
              now.figures.map((f) => f.traces.length), before.figures.map((f) => f.traces.length));
        check(`${fx.name}: trace names`,
              now.figures.map((f) => f.traces.map((t) => t.name)),
              before.figures.map((f) => f.traces.map((t) => t.name)));
        check(`${fx.name}: trace types and y-axes`,
              now.figures.map((f) => f.traces.map((t) => [t.type, t.yaxis])),
              before.figures.map((f) => f.traces.map((t) => [t.type, t.yaxis])));
        check(`${fx.name}: layout y-axes`, now.figures.map((f) => f.yAxes), before.figures.map((f) => f.yAxes));
        check(`${fx.name}: empty messages`, now.empty, before.empty);
    }
}

// ════════════════════════════════════════════════════════════════════════
// §4 A ZERO-SIZE CONTAINER DEFERS UNTIL IT HAS A SIZE
// ════════════════════════════════════════════════════════════════════════
{
    console.log('\n§4 a zero-size container defers drawing until it has a size');
    resetPlotly();
    const host = mountHost();
    zeroSize.add(host);
    const grid = renderPlotGrid(host, { layout: '1x2', subplots: [sp(['a']), sp(['b'])] }, RESULTS);
    await settle();
    check('nothing is drawn into a zero-size container', Plotly.reacts.length, 0);
    ok('  ...and no message is shown in its place',
       grid.charts.every((c) => c.childElementCount === 0));
    const gridEl = host.querySelector('.twm-plot-grid');
    ok('the grid\'s ResizeObserver observes its .twm-plot-grid element', !!gridEl && observing(gridEl));

    fireResize(gridEl);
    await settle();
    check('a resize while still zero-size draws nothing', Plotly.reacts.length, 0);

    zeroSize.delete(host);
    fireResize(gridEl);
    await settle();
    check('once it has a size, its ResizeObserver draws both figures',
          Plotly.reacts.map((r) => grid.charts.indexOf(r.gd)).sort(), [0, 1]);

    resetPlotly();
    fireResize(gridEl);
    await settle();
    check('a later resize only fits the drawn figures', [Plotly.reacts.length, Plotly.resized.length], [0, 2]);
    grid.dispose();
    host.remove();

    resetPlotly();
    const detached = mountHost({ attach: false });
    const grid2 = renderPlotGrid(detached, { layout: '1x1', subplots: [sp(['a'])] }, RESULTS);
    await settle();
    check('nothing is drawn into a detached container', Plotly.reacts.length, 0);
    document.body.appendChild(detached);
    grid2.resize();
    await settle();
    check('attached and resized: drawn', Plotly.reacts.length, 1);
    grid2.dispose();
    detached.remove();

    resetPlotly();
    const hidden = mountHost();
    const grid3 = renderPlotGrid(hidden, { layout: '1x1', subplots: [sp(['a'])] }, RESULTS);
    await settle();
    zeroSize.add(hidden);
    await grid3.update({ results: { ...RESULTS, series: { a: [9, 9, 9, 9] } } });
    check('an update while hidden is deferred', Plotly.reacts.length, 1);
    zeroSize.delete(hidden);
    grid3.resize();
    await settle();
    check('  ...and drawn with the newest data once visible', lastFigureFor(grid3.charts[0])?.data[0].y,
          [9, 9, 9, 9]);
    grid3.dispose();
    hidden.remove();

    // A deferred draw that throws, on the resize that draws it, fails like any
    // other draw: the empty message, and onError.
    for (const [what, options] of [
        ['resolveSeries', { resolveSeries: () => { throw new Error('boom'); } }],
        ['derivedTraces', { derivedTraces: () => { throw new Error('boom'); } }],
    ]) {
        resetPlotly();
        const host4 = mountHost();
        zeroSize.add(host4);
        const errors = [];
        let failing = false;
        const wrapped = Object.fromEntries(Object.entries(options).map(([k, fn]) => [k, (...args) => {
            if (failing) return fn(...args);
            return k === 'resolveSeries' ? resolveSeriesData(...args) : [];
        }]));
        const grid4 = renderPlotGrid(host4, { layout: '1x1', subplots: [sp(['a'])] }, RESULTS, {
            ...wrapped, onError: (e) => errors.push(e),
        });
        await settle();
        failing = true;
        zeroSize.delete(host4);
        grid4.resize();
        await settle();
        const cell = grid4.charts[0];
        check(`a deferred draw whose ${what} throws on resize() shows the empty message and is reported`,
              [cell.querySelector('.twm-plot-no-data')?.textContent ?? null, Plotly.reacts.length,
               errors.map((e) => [e.index, e.error.message]), grid4.plotted.length],
              ['No data yet.', 0, [[0, 'boom']], 0]);
        grid4.dispose();
        host4.remove();
    }

    // The same failure over a figure already on screen replaces it.
    resetPlotly();
    const host5 = mountHost();
    let fail5 = false;
    const errors5 = [];
    const grid5 = renderPlotGrid(host5, { layout: '1x1', subplots: [sp(['a'])] }, RESULTS, {
        derivedTraces: () => { if (fail5) throw new Error('later'); return []; },
        onError: (e) => errors5.push(e),
    });
    await settle();
    ok('plotted lists a drawn cell', grid5.plotted.length === 1 && grid5.plotted[0] === grid5.charts[0]);
    zeroSize.add(host5);
    fail5 = true;
    await grid5.update({ results: { ...RESULTS } });
    zeroSize.delete(host5);
    grid5.resize();
    await settle();
    check('  ...a deferred redraw that throws purges the old figure for the empty message',
          [grid5.charts[0].querySelector('.twm-plot-no-data')?.textContent ?? null,
           Plotly.purged.includes(grid5.charts[0]), grid5.plotted.length, errors5.length],
          ['No data yet.', true, 0, 1]);
    grid5.dispose();
    host5.remove();

    // PlotPopoutWindow opened while its plot area has no size: the grid's own
    // ResizeObserver draws it later, and the toolbar and PNG export see that.
    resetPlotly();
    zeroSize.add(document.body);
    const toasts = [];
    const saved = [];
    const relayouts = [];
    const images = [];
    Plotly.relayout = (gd, upd) => { relayouts.push([gd, upd]); return Promise.resolve(); };
    Plotly.toImage = async (gd) => { images.push(gd); return 'data:image/png;base64,AAAA'; };
    const win = new PlotPopoutWindow({
        id: 'deferred-popout', title: 'Deferred',
        plotConfig: { layout: '1x1', subplots: [sp(['a'])] },
        getResults: () => RESULTS,
        services: { eventBus: { on: () => ({ dispose() {} }), emit: (name, payload) => { if (name === 'toast:show') toasts.push(payload); } } },
        host: { dialogs: { saveFile: async (req) => { saved.push(req); return { ok: true, path: '/x.png' }; } } },
    });
    await win.show();
    await settle();
    check('a popout shown at zero size draws nothing yet', Plotly.reacts.length, 0);
    zeroSize.delete(document.body);
    // Only the grid element is reported resized, so it is the grid's own
    // observer (not the window's) that has to draw the figure.
    const popoutGridEl = win._contentEl.querySelector('.twm-plot-window-chart > .twm-plot-grid');
    ok('  ...its grid observes its own .twm-plot-grid element', !!popoutGridEl && observing(popoutGridEl));
    fireResize(popoutGridEl);
    await settle();
    check('  ...its grid draws the figure once it has a size', Plotly.reacts.length, 1);
    const btn = (tip) => document.querySelector(`.twm-plot-window-toolbar [data-tooltip="${tip}"]`)
        ?? [...document.querySelectorAll('button[data-tooltip]')].find((b) => b.dataset.tooltip === tip);
    btn('Pan').click();
    await settle();
    check('  ...the Pan button sets the drag mode on that figure',
          relayouts.map(([gd, upd]) => [gd === Plotly.reacts[0].gd, upd.dragmode]), [[true, 'pan']]);
    btn('Download plot as PNG').click();
    await settle();
    check('  ...Download PNG exports that figure, not "Plot not ready"',
          [images.length, images[0] === Plotly.reacts[0].gd, saved.length, toasts.map((t) => t.message)],
          [1, true, 1, ['Plot saved to /x.png']]);
    win.close();
    delete Plotly.toImage;
    Plotly.relayout = () => Promise.resolve();
}

// ════════════════════════════════════════════════════════════════════════
// §5 DISPOSE PURGES EVERY FIGURE
// ════════════════════════════════════════════════════════════════════════
{
    console.log('\n§5 dispose() purges every figure');
    resetPlotly();
    const host = mountHost();
    const grid = renderPlotGrid(host, { layout: '2x2', subplots: [sp(['a']), sp(['b']), sp(['nowhere']), sp(['c'])] },
                                RESULTS);
    await settle();
    const cells = grid.charts;
    const drawnCells = [...new Set(Plotly.reacts.map((r) => r.gd))];
    check('three figures were drawn (one subplot is empty)', drawnCells.length, 3);
    const observersBefore = observers.size;
    grid.dispose();
    check('every drawn figure is purged, once', Plotly.purged.filter((g) => drawnCells.includes(g)).length, 3);
    ok('  ...each of them', drawnCells.every((c) => Plotly.purged.includes(c)));
    ok('the grid is removed from the container', host.childElementCount === 0 && !cells[0].isConnected);
    check('its ResizeObserver is disconnected', observers.size, observersBefore - 1);
    resetPlotly();
    const late = await grid.update({ results: RESULTS });
    grid.resize();
    grid.dispose();
    await settle();
    check('update, resize and dispose after dispose do nothing', [late, Plotly.reacts.length, Plotly.purged.length],
          [false, 0, 0]);

    resetPlotly();
    const host2 = mountHost();
    let release;
    const grid2 = renderPlotGrid(host2, { layout: '1x1', subplots: [sp(['a'])] }, RESULTS, {
        derivedTraces: () => new Promise((r) => { release = r; }),
    });
    await ticks();
    grid2.dispose();
    release([]);
    await settle();
    check('a draw still in flight at dispose() draws nothing', Plotly.reacts.length, 0);
    host2.remove();
    host.remove();
}

// ════════════════════════════════════════════════════════════════════════
// §6 THE OPTIONS
// ════════════════════════════════════════════════════════════════════════
async function figureOf(subplot, results = RESULTS, options = {}) {
    resetPlotly();
    const host = mountHost();
    const grid = renderPlotGrid(host, { layout: '1x1', subplots: [subplot] }, results, options);
    await settle();
    const fig = lastFigureFor(grid.charts[0]);
    const text = grid.charts[0].textContent;
    grid.dispose();
    host.remove();
    return { ...fig, text };
}

{
    console.log('\n§6 options and subplot features');

    // multi-y axes, reference lines, bands
    const multi = sp(['a']);
    multi.yAxes.push({ id: 'right', label: 'R', scale: 'log', position: 'right', min: 1, max: 10, step: 2,
                       series: [{ id: 'sb', variable: 'b', label: 'B', color: '#00ff00' }] });
    multi.yAxes[0].id = 'left';
    multi.referenceLines = [{ yAxisId: 'right', value: 5, label: 'Five' }];
    multi.shadedBands = [{ x0: 1, x1: 2, label: 'Band' }];
    let f = await figureOf(multi);
    check('each y-axis is a layout axis; series sit on theirs',
          [Object.keys(f.layout).filter((k) => /^yaxis/.test(k)), f.data.map((t) => t.yaxis ?? 'y')],
          [['yaxis', 'yaxis2'], ['y', 'y2']]);
    check('a secondary axis: right side, log, range, step, overlaying',
          [f.layout.yaxis2.side, f.layout.yaxis2.type, f.layout.yaxis2.range, f.layout.yaxis2.dtick,
           f.layout.yaxis2.overlaying], ['right', 'log', [1, 10], 2, 'y']);
    check('reference line on its axis, band across the paper',
          f.layout.shapes.map((s) => [s.type, s.yref]), [['rect', 'paper'], ['line', 'y2']]);
    check('x-axis clipped to the time range', f.layout.xaxis.range, [0, 3]);
    check('a hidden legend stays hidden by default', f.layout.showlegend, false);

    // chart types, interpolation, stacks, NaN handling
    const kinds = sp(['a', 'c'], { chartType: 'bar' });
    check('the chart type', (await figureOf(kinds)).data.map((t) => t.type), ['bar', 'bar']);
    const spline = sp(['a'], { interpolation: 'cubic', showDataPoints: true });
    f = await figureOf(spline);
    check('interpolation and data points', [f.data[0].line?.shape, f.data[0].mode], ['spline', 'lines+markers']);
    const stacked = sp(['a', 'b']);
    stacked.yAxes[0].series.forEach((s) => { s.stackGroup = 'g1'; });
    check('stack groups', (await figureOf(stacked)).data.map((t) => t.stackgroup), ['g1', 'g1']);
    const gaps = sp(['c'], { nanHandling: 'gap' });
    check('NaN handling: gap', (await figureOf(gaps)).data[0].y, [1, null, 3, null]);
    check('NaN handling: zero', (await figureOf(sp(['c'], { nanHandling: 'zero' }))).data[0].y, [1, 0, 3, 0]);
    check('NaN handling: interpolate',
          (await figureOf(sp(['c'], { nanHandling: 'interpolate' }))).data[0].y, [1, 2, 3, 3]);

    // x variable
    const phase = sp(['b'], { xAxis: { useTime: false, variable: 'a' } });
    f = await figureOf(phase);
    check('an x variable: x is its data, the axis is titled, no time clip',
          [f.data[0].x, f.layout.xaxis.title?.text, f.layout.xaxis.range], [[1, 2, 3, 4], 'a', undefined]);
    const lostX = sp(['b'], { xAxis: { useTime: false, variable: 'gone' } });
    check('an x variable that does not resolve falls back to time', (await figureOf(lostX)).data[0].x, [0, 1, 2, 3]);

    // default resolver
    check('resolveSeriesData: exact, _resultKey, bare name, own time',
          [resolveSeriesData({ variable: 'a' }, RESULTS)?.y,
           resolveSeriesData({ variable: 'a', _resultKey: 'k' }, { series: { k: [7] } })?.y,
           resolveSeriesData({ variable: 'NS.b' }, RESULTS)?.y,
           resolveSeriesData({ variable: 'a', _resultTime: [5] }, RESULTS)?.x,
           resolveSeriesData({ variable: 'zz' }, RESULTS)],
          [[1, 2, 3, 4], [7], [4, 3, 2, 1], [5], null]);

    // resolveSeries
    const seen = [];
    f = await figureOf(sp(['anything']), { time: [0, 1] }, {
        resolveSeries: (s, results, subplot) => { seen.push([s.variable, !!subplot]); return { y: [3, 4], x: [10, 11] }; },
    });
    check('resolveSeries supplies the data and its x', [f.data[0].y, f.data[0].x], [[3, 4], [10, 11]]);
    check('  ...called with the series and the subplot', seen, [['anything', true]]);

    // overlays
    const withOverlay = sp(['a']);
    withOverlay.yAxes[0].series[0].overlay = { label: 'Observed', lineStyle: 'dotted' };
    const overlays = { [withOverlay.yAxes[0].series[0].id]: { years: [0, 2], values: [1.5, 2.5] } };
    f = await figureOf(withOverlay, RESULTS, { overlays });
    check('an overlay draws as its own trace',
          f.data.map((t) => [t.name, t.line?.dash]), [['a', 'solid'], ['Observed', 'dot']]);
    check('  ...at its own points', [f.data[1].x, f.data[1].y], [[0, 2], [1.5, 2.5]]);
    check('no overlay data => no overlay trace', (await figureOf(withOverlay)).data.length, 1);
    withOverlay.chartType = 'area-stacked';
    f = await figureOf(withOverlay, RESULTS, { overlays });
    check('a stacked-percent chart stacks its overlay in a group of its own',
          [f.data[1].stackgroup, f.data[1].groupnorm], ['overlay-y', 'fraction']);

    // PlotPopoutWindow: its `actuals` are the overlays; no `overlay.etlKey` needed
    const popoutOverlayFigure = async (chartType) => {
        resetPlotly();
        const subplot = sp(['a']);
        subplot.yAxes[0].series[0].overlay = { label: 'Observed' };
        if (chartType) subplot.chartType = chartType;
        const win = new PlotPopoutWindow({
            id: `overlay-popout-${chartType ?? 'line'}`, title: 'Overlay',
            plotConfig: { layout: '1x1', subplots: [subplot] },
            getResults: () => RESULTS,
            actuals: { [subplot.yAxes[0].series[0].id]: { years: [0, 2], values: [1.5, 2.5] } },
            services: { eventBus: { on: () => ({ dispose() {} }), emit() {} } },
        });
        await win.show();
        await settle();
        const cell = win._contentEl.querySelector('.twm-plot-grid > .twm-plot-grid__cell');
        const fig = lastFigureFor(cell);
        win.close();
        await settle();
        return fig;
    };
    f = await popoutOverlayFigure();
    check('a popout draws an overlay from actuals for a series whose overlay has no etlKey',
          f?.data.map((t) => [t.name, t.x, t.y]), [['a', [0, 1, 2, 3], [1, 2, 3, 4]], ['Observed', [0, 2], [1.5, 2.5]]]);
    f = await popoutOverlayFigure('area-stacked');
    check('  ...and on an area-stacked subplot stacks it with groupnorm fraction',
          [f?.data[1]?.name, f?.data[1]?.groupnorm], ['Observed', 'fraction']);

    // hidden series
    f = await figureOf(sp(['a', 'b']), RESULTS, { hiddenSeries: ['a'] });
    check('hiddenSeries (an array) is not drawn', f.data.map((t) => t.name), ['b']);

    // seriesTransforms
    const transformed = sp(['a']);
    transformed.transforms = { double: { outputs: { out: true } } };
    const errors = [];
    f = await figureOf(transformed, RESULTS, {
        seriesTransforms: {
            double: { outputs: { out: { suffix: ' x2', lineStyle: 'dashed' } }, run: async (y) => ({ out: y.map((v) => v * 2) }) },
        },
        onTransformError: (e) => errors.push(e),
    });
    check('seriesTransforms draw derived traces', f.data.map((t) => [t.name, t.line.dash]), [['a', 'solid'], ['a x2', 'dash']]);

    // derivedTraces
    let derivedArgs = null;
    f = await figureOf(sp(['a']), RESULTS, {
        derivedTraces: (traces, subplot, ctx) => {
            derivedArgs = [traces.length, !!subplot, ctx.index, ctx.results === RESULTS];
            return [{ type: 'scatter', name: 'extra', x: [0], y: [0] }];
        },
    });
    check('derivedTraces are appended', f.data.map((t) => t.name), ['a', 'extra']);
    check('  ...given the traces so far, the subplot, its index and the results', derivedArgs, [1, true, 0, true]);
    f = await figureOf(sp(['nowhere']), RESULTS, { derivedTraces: () => [{ type: 'scatter', name: 'only', x: [0], y: [1] }] });
    check('derived traces alone are a figure, not the empty message', f.data?.map((t) => t.name), ['only']);

    // onError
    const drawErrors = [];
    f = await figureOf(sp(['a']), RESULTS, {
        derivedTraces: () => { throw new Error('nope'); },
        onError: (e) => drawErrors.push(e),
    });
    check('a throwing derivedTraces shows the empty message and is reported',
          [f.text, drawErrors.map((e) => [e.index, e.error.message])], ['No data yet.', [[0, 'nope']]]);

    // theme, legend, layout
    f = await figureOf(sp(['a'], { legendPosition: 'hidden' }), RESULTS, {
        theme: { fontColor: '#111111', gridColor: '#222222', hoverBackground: '#333333' },
        alwaysShowLegend: true,
        layout: { hovermode: 'x unified', margin: { t: 1, r: 2, b: 3, l: 4 } },
    });
    check('theme colours reach font, axes and hover label',
          [f.layout.font.color, f.layout.xaxis.gridcolor, f.layout.yaxis.gridcolor, f.layout.hoverlabel.bgcolor,
           f.layout.font.family],
          ['#111111', '#222222', '#222222', '#333333', PLOT_GRID_THEME.fontFamily]);
    check('alwaysShowLegend draws a hidden legend', f.layout.showlegend, true);
    check('layout is merged over the figure\'s', [f.layout.hovermode, f.layout.margin], ['x unified', { t: 1, r: 2, b: 3, l: 4 }]);
    ok('PLOT_GRID_THEME is frozen', Object.isFrozen(PLOT_GRID_THEME));

    // stale draws
    resetPlotly();
    const host = mountHost();
    const releases = [];
    const grid = renderPlotGrid(host, { layout: '1x1', subplots: [sp(['a'])] }, RESULTS, {
        derivedTraces: (traces) => new Promise((r) => releases.push(() => r([]))),
    });
    await ticks();
    const second = grid.update({ results: { time: [0, 1], series: { a: [8, 8] } } });
    await ticks();
    releases[1]();
    await second;
    releases[0]();
    await settle();
    check('a draw overtaken by a newer one is dropped',
          Plotly.reacts.map((r) => r.data[0].y), [[8, 8]]);
    grid.dispose();
    host.remove();
}

// ════════════════════════════════════════════════════════════════════════
// §7 BARREL, STYLESHEET, VOCABULARY
// ════════════════════════════════════════════════════════════════════════
{
    console.log('\n§7 @flexdesk/charts exports, flexdesk.css, vocabulary');
    ok('renderPlotGrid', barrel.renderPlotGrid === renderPlotGrid);
    ok('resolveSeriesData', barrel.resolveSeriesData === resolveSeriesData);
    ok('PLOT_GRID_THEME', barrel.PLOT_GRID_THEME === PLOT_GRID_THEME);

    const sheet = readFileSync(resolvePath(HERE, '../css/flexdesk.css'), 'utf8');
    check('flexdesk.css has a rule for every class the grid sets',
          ['.twm-plot-grid', '.twm-plot-grid__cell', '.twm-plot-no-data'].filter((c) => !ruleBody(sheet, c)), []);

    const src = readFileSync(resolvePath(HERE, '../src/charts/plot_grid.js'), 'utf8');
    check('plot_grid.js names no app global or domain word',
          src.split('\n').filter((l) => /pywebview|ecosim|ecoagent|simulation|window\.api/i.test(l)), []);
    const popout = readFileSync(resolvePath(HERE, '../src/charts/plot_popout_window.js'), 'utf8');
    ok('PlotPopoutWindow has no renderer of its own any more',
       !/#renderSubplotChart|#renderAllCharts|#buildSubplotGrid|buildTrace\(/.test(popout)
       && /renderPlotGrid\(/.test(popout));
}

await settle();
check('no unhandled rejections', unhandled, 0);

if (failures) {
    console.error(`\nplot grid: ${failures} assertion(s) FAILED`);
    process.exit(1);
}
console.log('\nall assertions passed');
