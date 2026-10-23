/**
 * ══ A DATA SERIES WITH NO SAVED PLOT CONFIG OPENS (0.17.5, BUG-0037) ══
 *
 * `DataSeriesPlotWindow.createDefaultConfig` is static and used to call
 * `this.classifyHeader(h)`. In a static method `this` is the class, and
 * `classifyHeader` is an instance property, so every series with no saved
 * plot config threw `TypeError: this.classifyHeader is not a function` on
 * `show()`. What this suite pins:
 *
 *   §1  a window over a series with a numeric time column and no saved config
 *       opens, and its X axis is the time column
 *   §2  a `classifyHeader` passed to the constructor picks the X column
 *   §3  `createDefaultConfig(headers, numericColumns)` on its own uses the
 *       default classifier; a third argument replaces it
 *
 * ── HOW TO RUN ───────────────────────────────────────────────────────────
 *
 *     node tests/data_series_plot_default_config.test.mjs
 *     node tests/run.mjs                           # with every other suite
 *
 * Imports `../src/` directly, never `dist/`. Plotly is a FAKE on `globalThis`.
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
    console.log('data series plot default config: SKIPPED — needs jsdom '
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

/** A Plotly that records every figure. */
const plots = [];
const fakePlotly = {
    newPlot(gd, data, layout, config) {
        plots.push({ gd, data, layout, config });
        gd.classList.add('js-plotly-plot');
        gd.on = () => {};
        return Promise.resolve(gd);
    },
    react(gd, data, layout, config) { return fakePlotly.newPlot(gd, data, layout, config); },
    purge() {},
    Plots: { resize() {} },
};
globalThis.Plotly = fakePlotly;
dom.window.Plotly = fakePlotly;

// The class is the module's default export; the barrel re-exports the
// module's named exports (openDataSeriesPlotWindow), which is what §1 opens with.
const { default: DataSeriesPlotWindow } = await import('../src/charts/data_series_plot_window.js');
const { openDataSeriesPlotWindow } = await import('../charts.js');

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

/** A series whose time column is numeric and is not the first column. */
const HEADERS = ['GDP', 'year', 'CPI'];
const ROWS = [[100, 2000, 1.0], [104, 2001, 1.1], [109, 2002, 1.3]];
const dataHub = {
    fetchSeriesById: async () => ({ ok: true, headers: HEADERS, rows: ROWS }),
};
const services = { logger: { warn() {}, error() {}, info() {}, debug() {} },
                   notifications: { show() {} } };

async function open(extra = {}) {
    const win = new DataSeriesPlotWindow({
        seriesId: `s-${Math.random().toString(36).slice(2, 7)}`,
        seriesName: 'Macro', datasetName: 'Test',
        headers: HEADERS, dataHub, services,
        getPlotConfig: () => null,             // no saved plot config
        savePlotConfig: () => {},
        ...extra,
    });
    let error = null;
    try { await win.show(); } catch (err) { error = err; }
    return { win, error };
}

console.log('\ncharts: a data series with no saved plot config\n');

// ════════════════════════════════════════════════════════════════════════
// 1. THE WINDOW OPENS, AND X IS THE TIME COLUMN (default classifier)
// ════════════════════════════════════════════════════════════════════════
{
    const headers = ['GDP', 'time', 'CPI'];
    const rows = [[100, 0, 1.0], [104, 1, 1.1], [109, 2, 1.3]];
    const before = plots.length;
    let win = null;
    let error = null;
    try {
        win = await openDataSeriesPlotWindow({
            seriesId: 's-time', seriesName: 'Macro', datasetName: 'Test',
            headers, services,
            dataHub: { fetchSeriesById: async () => ({ ok: true, headers, rows }) },
            getPlotConfig: () => null,          // no saved plot config
            savePlotConfig: () => {},
        });
    } catch (err) { error = err; }
    ok('§1 show() does not throw with no saved config', error === null,
       error ? `threw ${error?.name}: ${error?.message}` : '');
    check('§1 the default X column is the time column', win?._config?.xColumn, 'time');
    check('§1 the Y columns are the other numeric columns',
          (win?._config?.yColumns || []).map((c) => c.header), ['GDP', 'CPI']);
    const fig = plots[plots.length - 1];
    ok('§1 a figure was drawn', plots.length > before);
    check('§1 the figure is drawn against the time column', fig?.data?.[0]?.x, [0, 1, 2]);
    win?.close();
}

// ════════════════════════════════════════════════════════════════════════
// 2. A classifyHeader PASSED TO THE CONSTRUCTOR IS HONOURED
// ════════════════════════════════════════════════════════════════════════
{
    // `year` is not a time name to the default classifier: it would fall back
    // to the first numeric column, GDP. The window's own classifier says it is.
    const asked = [];
    const classifyHeader = (h) => { asked.push(h); return h === 'year' ? 'time' : 'indicator'; };
    const { win, error } = await open({ classifyHeader });
    ok('§2 show() does not throw', error === null,
       error ? `threw ${error?.name}: ${error?.message}` : '');
    ok('§2 the window\'s classifier was asked', asked.includes('year'), `asked ${JSON.stringify(asked)}`);
    check('§2 its time column is the X column', win._config?.xColumn, 'year');
    check('§2 the rest are Y', (win?._config?.yColumns || []).map((c) => c.header), ['GDP', 'CPI']);
    win.close();

    const { win: plain, error: plainError } = await open();
    ok('§2 without one, show() does not throw', plainError === null,
       plainError ? `threw ${plainError?.name}: ${plainError?.message}` : '');
    check('§2 without one, `year` is not time: X falls back to the first numeric column',
          plain._config?.xColumn, 'GDP');
    plain.close();
}

// ════════════════════════════════════════════════════════════════════════
// 3. createDefaultConfig ON ITS OWN
// ════════════════════════════════════════════════════════════════════════
{
    let cfg = null;
    let error = null;
    try {
        cfg = DataSeriesPlotWindow.createDefaultConfig(['a', 'period', 'b'], new Set(['a', 'period', 'b']));
    } catch (err) { error = err; }
    ok('§3 the static call does not throw', error === null,
       error ? `threw ${error?.name}: ${error?.message}` : '');
    check('§3 the default classifier finds `period`', cfg?.xColumn, 'period');

    const custom = DataSeriesPlotWindow.createDefaultConfig(
        ['a', 'period', 'b'], undefined, (h) => (h === 'b' ? 'time' : 'indicator'));
    check('§3 a third argument replaces the classifier', custom.xColumn, 'b');
    check('§3 no numeric set: every column is numeric', custom.yColumns.map((c) => c.header), ['a', 'period']);
}

console.log(failures ? `\n${failures} FAILED\n` : '\nall passed\n');
process.exit(failures ? 1 : 0);
