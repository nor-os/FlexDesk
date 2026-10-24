/**
 * ══ DERIVED SERIES ARE INJECTED (0.17.0, STORY-0062) ══
 *
 * `@flexdesk/charts` used to call one application's backend for a fixed
 * trend/cycle filter, gated on that application's global and configured by
 * three keys in every default subplot. It now ships no transform at all: an
 * embedder passes `seriesTransforms`, and `src/charts/series_transforms.js`
 * runs them. What this suite pins:
 *
 *   §1  the charts source names no app global and no filter config key
 *   §2  a transform's outputs are extra traces: source colour, declared dash,
 *       declared suffix, the source's axis; run once per eligible trace
 *   §3  a transform that throws is skipped and the chart still renders
 *   §4  the config controls: none without the option; toggles and params with it
 *   §5  PlotPopoutWindow draws them, and draws none without the option
 *   §6  the barrel exports both functions
 *   §7  (0.17.8) run(y, params, context): renderPlotGrid and PlotPopoutWindow
 *       pass { series, subplot, results, resolveSeries }, per series
 *   §8  (0.17.8) only traces drawn from a configured series are sources: no
 *       overlay, no derived trace; deriveSeriesTraces' `seriesOf` option
 *   §9  (0.17.8) a `type: 'choice'` parameter: a FlexDesk select (selectBox),
 *       options an array or a function, saved under params, passed to run
 *   §10 (0.17.8) a run(y, params) transform with number params: as before
 *
 * ── HOW TO RUN ───────────────────────────────────────────────────────────
 *
 *     node tests/series_transforms.test.mjs        # from ../FlexDesk
 *     node tests/run.mjs                           # with every other suite
 *
 * Imports `../src/` directly. Plotly is a FAKE on `globalThis` that records
 * every `react()`. jsdom is borrowed from the sibling Tables checkout; absent,
 * this SKIPS loudly rather than passing.
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';
import { existsSync, readdirSync, readFileSync } from 'node:fs';

import { ruleBody } from './css_rules.mjs';

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
    console.log('series transforms: SKIPPED — needs jsdom '
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
globalThis.ResizeObserver ||= class { observe() {} unobserve() {} disconnect() {} };
// jsdom lays nothing out; the popout skips a zero-width chart div.
Object.defineProperty(dom.window.HTMLElement.prototype, 'offsetWidth', { get: () => 400 });
Object.defineProperty(dom.window.HTMLElement.prototype, 'offsetHeight', { get: () => 300 });

/** A Plotly that records every figure it is asked to draw. */
const Plotly = {
    reacts: [],
    async react(gd, data, layout) { Plotly.reacts.push({ gd, data, layout }); return gd; },
    async newPlot(gd, data, layout) { return Plotly.react(gd, data, layout); },
    purge() {},
    relayout() {},
    Plots: { resize() {} },
};
globalThis.Plotly = Plotly;
dom.window.Plotly = Plotly;

let unhandled = 0;
process.on('unhandledRejection', (err) => {
    unhandled += 1;
    console.log(`  (unhandled rejection: ${err?.message || err})`);
});

const { deriveSeriesTraces, renderSeriesTransformControls } =
    await import('../src/charts/series_transforms.js');
const { makeDefaultSubplot } = await import('../src/charts/plot_config.js');
const { PlotPopoutWindow } = await import('../src/charts/plot_popout_window.js');
const { renderPlotGrid, resolveSeriesData } = await import('../src/charts/plot_grid.js');
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

/** A two-output transform that records its calls. */
function decompose() {
    const calls = [];
    return {
        calls,
        label: 'Decompose',
        params: { smoothing: { label: 'Smoothing', default: 10, min: 1, step: 1 } },
        outputs: {
            trend: { label: 'Trend', suffix: ' (Trend)', lineStyle: 'dashed' },
            cycle: { label: 'Cycle', suffix: ' (Cycle)', lineStyle: 'dotted', lineWidth: 1 },
        },
        async run(y, params) {
            calls.push({ y, params });
            return { trend: y.map((v) => v * 2), cycle: y.map((v) => -v) };
        },
    };
}

console.log('\ncharts: injected series transforms\n');

// ════════════════════════════════════════════════════════════════════════
// §1 THE CHARTS SOURCE NAMES NO APP GLOBAL AND NO FILTER CONFIG KEY
// ════════════════════════════════════════════════════════════════════════
{
    console.log('§1 no app global, no built-in filter keys');
    const dir = resolvePath(HERE, '../src/charts');
    const files = [
        ...readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => resolvePath(dir, f)),
        resolvePath(HERE, '../charts.js'),
    ];
    const hits = [];
    for (const file of files) {
        readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
            if (/window\.pywebview/.test(line)
                || /\bhp[A-Z_]\w*|\bshowHp\w*|['"]hp['"]|\bhp\s*:|hp_filter/i.test(line)) {
                hits.push(`${file.split('/').pop()}:${i + 1}: ${line.trim()}`);
            }
        });
    }
    check('no src/charts file mentions window.pywebview or an hp key', hits, []);
    const keys = Object.keys(makeDefaultSubplot(0));
    check('a default subplot has no hp key', keys.filter((k) => /hp/i.test(k)), []);
}

// ════════════════════════════════════════════════════════════════════════
// §2 OUTPUTS ARE EXTRA TRACES IN THE SOURCE COLOUR, DASH AND SUFFIX
// ════════════════════════════════════════════════════════════════════════
{
    console.log('\n§2 a transform\'s outputs draw as extra traces');
    const t = decompose();
    const traces = [
        { type: 'scatter', mode: 'lines', name: 'Alpha', x: [0, 1, 2], y: [1, 2, 3],
          line: { color: '#ff0000' } },
        { type: 'bar', name: 'Bars', x: [0, 1, 2], y: [5, 5, 5], marker: { color: '#00ff00' } },
        { type: 'scatter', mode: 'markers', name: 'Beta', x: [0, 1, 2], y: [4, 5, 6],
          yaxis: 'y2', marker: { color: '#0000ff' } },
    ];
    const sp = { transforms: { decompose: { outputs: { trend: true, cycle: true }, params: { smoothing: 3 } } } };
    const derived = await deriveSeriesTraces(traces, sp, { decompose: t });

    check('run once per eligible trace (bars are not eligible)', t.calls.map((c) => c.y), [[1, 2, 3], [4, 5, 6]]);
    check('run gets the subplot\'s params over the defaults', t.calls[0].params, { smoothing: 3 });
    check('names carry the declared suffix', derived.map((d) => d.name),
          ['Alpha (Trend)', 'Alpha (Cycle)', 'Beta (Trend)', 'Beta (Cycle)']);
    check('colour is the source trace\'s', derived.map((d) => d.line.color),
          ['#ff0000', '#ff0000', '#0000ff', '#0000ff']);
    check('dash is the declared lineStyle', derived.map((d) => d.line.dash), ['dash', 'dot', 'dash', 'dot']);
    check('width is the declared lineWidth (default 2)', derived.map((d) => d.line.width), [2, 1, 2, 1]);
    check('each sits on its source\'s axis', derived.map((d) => d.yaxis ?? 'y'), ['y', 'y', 'y2', 'y2']);
    check('values are the outputs', derived[0].y, [2, 4, 6]);
    check('x is the source\'s', derived[2].x, [0, 1, 2]);
    ok('the source traces are not modified', traces.length === 3 && traces[0].name === 'Alpha');

    const t2 = decompose();
    const only = await deriveSeriesTraces(traces.slice(0, 1),
        { transforms: { decompose: { outputs: { cycle: true } } } }, { decompose: t2 });
    check('only switched-on outputs draw', only.map((d) => d.name), ['Alpha (Cycle)']);
    check('params default when the subplot sets none', t2.calls[0].params, { smoothing: 10 });

    const t3 = decompose();
    const none = await deriveSeriesTraces(traces, {}, { decompose: t3 });
    check('a transform with nothing switched on never runs', [none.length, t3.calls.length], [0, 0]);
    check('no option => no derived traces', (await deriveSeriesTraces(traces, sp, null)).length, 0);
}

// ════════════════════════════════════════════════════════════════════════
// §3 A TRANSFORM THAT THROWS IS SKIPPED
// ════════════════════════════════════════════════════════════════════════
{
    console.log('\n§3 a throwing transform is skipped');
    const errors = [];
    const transforms = {
        broken: { label: 'Broken', outputs: { out: { suffix: ' (B)' } },
                  run() { throw new Error('boom'); } },
        rejects: { label: 'Rejects', outputs: { out: { suffix: ' (R)' } },
                   run: async () => { throw new Error('backend down'); } },
        empty: { label: 'Empty', outputs: { out: { suffix: ' (E)' } }, run: async () => null },
        good: decompose(),
    };
    const sp = { transforms: {
        broken: { outputs: { out: true } }, rejects: { outputs: { out: true } },
        empty: { outputs: { out: true } }, good: { outputs: { trend: true } },
    } };
    const traces = [{ type: 'scatter', name: 'Alpha', x: [0, 1], y: [1, 2], line: { color: '#123456' } }];
    const derived = await deriveSeriesTraces(traces, sp, transforms, { onError: (e) => errors.push(e) });
    check('only the working transform draws', derived.map((d) => d.name), ['Alpha (Trend)']);
    check('each skipped run is reported', errors.map((e) => [e.transformId, e.traceName]),
          [['broken', 'Alpha'], ['rejects', 'Alpha'], ['empty', 'Alpha']]);
    ok('the error is passed on', errors[1].error?.message === 'backend down');
}

// ════════════════════════════════════════════════════════════════════════
// §4 THE CONFIG CONTROLS
// ════════════════════════════════════════════════════════════════════════
{
    console.log('\n§4 config controls');
    for (const [what, option] of [['undefined', undefined], ['null', null], ['{}', {}]]) {
        const box = document.createElement('div');
        const sp = makeDefaultSubplot(0);
        const handle = renderSeriesTransformControls(box, sp, option, { onChange() {} });
        check(`without the option (${what}) nothing is rendered`,
              [box.childElementCount, box.querySelectorAll('input').length], [0, 0]);
        ok(`  ...and dispose() is still callable (${what})`, typeof handle.dispose === 'function');
    }

    const box = document.createElement('div');
    document.body.appendChild(box);
    const sp = makeDefaultSubplot(0);
    let changes = 0;
    const handle = renderSeriesTransformControls(box, sp, { decompose: decompose() },
                                                 { onChange: () => { changes += 1; } });
    const boxes = [...box.querySelectorAll('input[type="checkbox"]')];
    const params = [...box.querySelectorAll('input[type="number"]')];
    check('one toggle per output, labelled from the transform',
          boxes.map((b) => b.parentElement.textContent), ['Trend', 'Cycle']);
    check('the transform label heads its group',
          box.querySelector('.twm-series-transforms__label')?.textContent, 'Decompose');
    check('one field per param, showing its default', params.map((p) => [p.value, p.min, p.step]),
          [['10', '1', '1']]);
    ok('the param is disabled while no output is on', params[0].disabled);

    boxes[0].checked = true;
    boxes[0].dispatchEvent(new dom.window.Event('change'));
    check('a toggle writes subplot.transforms', sp.transforms, { decompose: { outputs: { trend: true } } });
    ok('  ...enables the param', !params[0].disabled);
    params[0].value = '25';
    params[0].dispatchEvent(new dom.window.Event('change'));
    check('a param edit writes subplot.transforms', sp.transforms.decompose.params, { smoothing: 25 });
    check('every edit calls onChange', changes, 2);

    const reopened = document.createElement('div');
    renderSeriesTransformControls(reopened, sp, { decompose: decompose() });
    check('controls show the subplot\'s saved state',
          [[...reopened.querySelectorAll('input[type="checkbox"]')].map((b) => b.checked),
           reopened.querySelector('input[type="number"]').value],
          [[true, false], '25']);

    const classes = new Set([...box.querySelectorAll('[class]')].flatMap((el) => [...el.classList]));
    const sheet = readFileSync(resolvePath(HERE, '../css/flexdesk.css'), 'utf8');
    check('flexdesk.css has a rule for every class the controls set',
          [...classes].filter((c) => !ruleBody(sheet, `.${c}`)), []);

    handle.dispose();
    check('dispose() removes the controls', box.childElementCount, 0);
}

// ════════════════════════════════════════════════════════════════════════
// §5 PLOTPOPOUTWINDOW DRAWS THEM — AND NONE WITHOUT THE OPTION
// ════════════════════════════════════════════════════════════════════════
const plotConfig = () => {
    const sp = makeDefaultSubplot(0);
    sp.yAxes[0].series = [{ id: 's1', variable: 'a', label: 'Alpha', color: '#ff0000' }];
    sp.transforms = {
        decompose: { outputs: { trend: true } },
        broken: { outputs: { out: true } },
    };
    return { layout: '1x1', subplots: [sp] };
};
const getResults = () => ({ time: [0, 1, 2], series: { a: [1, 2, 3] } });

async function drawPopout(options) {
    Plotly.reacts.length = 0;
    const win = new PlotPopoutWindow({
        id: `w-${Math.random().toString(36).slice(2, 7)}`, title: 'T',
        plotConfig: plotConfig(), getResults, services: {}, ...options,
    });
    await win.show();
    await ticks();
    const figure = Plotly.reacts.at(-1);
    win.close();
    return figure;
}

{
    console.log('\n§5 PlotPopoutWindow');
    const warned = [];
    const figure = await drawPopout({
        services: { logger: { warn: (...a) => warned.push(a) } },
        seriesTransforms: {
            decompose: decompose(),
            broken: { label: 'Broken', outputs: { out: { suffix: ' (B)' } },
                      run: async () => { throw new Error('boom'); } },
        },
    });
    ok('the chart renders', !!figure);
    check('with the option: the source and its derived trace',
          figure?.data.map((t) => [t.name, t.line?.color, t.line?.dash]),
          [['Alpha', '#ff0000', 'solid'], ['Alpha (Trend)', '#ff0000', 'dash']]);
    check('the throwing transform is logged once', warned.length, 1);

    const bare = await drawPopout({});
    ok('without the option the chart renders', !!bare);
    check('without the option: no derived traces', bare?.data.map((t) => t.name), ['Alpha']);
}

// ════════════════════════════════════════════════════════════════════════
// §7 (0.17.8) run(y, params, context) — THE SERIES IT RUNS ON
// ════════════════════════════════════════════════════════════════════════
/** A transform that records every call's arguments, outputs `y + 1`. */
function recorder() {
    const calls = [];
    return {
        calls,
        label: 'Record',
        outputs: { out: { label: 'Out', suffix: ' (R)' } },
        async run(...args) {
            calls.push(args);
            return { out: args[0].map((v) => v + 1) };
        },
    };
}

/** A subplot with series a and b on two axes, the recorder switched on. */
function contextSubplot() {
    const sp = makeDefaultSubplot(0);
    sp.yAxes[0].series = [{ id: 's1', variable: 'a', label: 'Alpha', color: '#ff0000', scenario: 'base' }];
    sp.yAxes.push({ id: 'ax2', position: 'right', series: [
        { id: 's2', variable: 'b', label: 'Beta', color: '#0000ff', scenario: 'high' },
    ] });
    sp.transforms = { rec: { outputs: { out: true } } };
    return sp;
}
const CONTEXT_RESULTS = { time: [0, 1, 2], series: { a: [1, 2, 3], b: [10, 20, 30] } };

async function drawGrid(plotConfig, results, options) {
    Plotly.reacts.length = 0;
    const host = document.createElement('div');
    document.body.appendChild(host);
    const grid = renderPlotGrid(host, plotConfig, results, options);
    await ticks();
    const figure = Plotly.reacts.at(-1);
    grid.dispose();
    host.remove();
    return figure;
}

{
    console.log('\n§7 run(y, params, context)');
    const rec = recorder();
    const sp = contextSubplot();
    const resolveSeries = (series, results, subplot) => {
        const r = resolveSeriesData(series, results);
        return r && subplot?.rebaseYear != null ? { ...r, y: r.y.map((v) => v * 100 / r.y[0]) } : r;
    };
    sp.rebaseYear = 0;
    const figure = await drawGrid({ layout: '1x1', subplots: [sp] }, CONTEXT_RESULTS,
                                  { seriesTransforms: { rec }, resolveSeries });
    check('renderPlotGrid runs once per series', rec.calls.length, 2);
    check('run gets three arguments', rec.calls.map((c) => c.length), [3, 3]);
    check('context has series, subplot, results, resolveSeries',
          Object.keys(rec.calls[0][2]).sort(), ['resolveSeries', 'results', 'series', 'subplot']);
    ok('context.series is the subplot\'s own series entry (the same object)',
       rec.calls[0][2].series === sp.yAxes[0].series[0] && rec.calls[1][2].series === sp.yAxes[1].series[0]);
    check('  ...with its variable and scenario',
          rec.calls.map((c) => [c[2].series.variable, c[2].series.scenario]), [['a', 'base'], ['b', 'high']]);
    ok('context.subplot is the subplot config', rec.calls.every((c) => c[2].subplot === sp));
    ok('context.results are the results drawn', rec.calls.every((c) => c[2].results === CONTEXT_RESULTS));
    ok('context.resolveSeries is the grid\'s resolver', rec.calls.every((c) => c[2].resolveSeries === resolveSeries));
    check('y is the drawn (rebased) values', rec.calls.map((c) => c[0]), [[100, 200, 300], [100, 200, 300]]);
    // What a scenario delta does with it: the same series, elsewhere, resolved the same way.
    const baseline = { time: [0, 1, 2], series: { a: [2, 2, 2] } };
    check('context resolves the same series in other results with the same rebase',
          rec.calls[0][2].resolveSeries(rec.calls[0][2].series, baseline, rec.calls[0][2].subplot).y, [100, 100, 100]);
    check('each derived trace is its own series\'', figure?.data.map((t) => t.name),
          ['Alpha', 'Beta', 'Alpha (R)', 'Beta (R)']);

    const defaults = recorder();
    const sp2 = contextSubplot();
    await drawGrid({ layout: '1x1', subplots: [sp2] }, CONTEXT_RESULTS, { seriesTransforms: { rec: defaults } });
    ok('without a resolveSeries option context.resolveSeries is the default resolver',
       defaults.calls[0]?.[2].resolveSeries === resolveSeriesData);

    // PlotPopoutWindow
    const popRec = recorder();
    const popConfig = { layout: '1x1', subplots: [contextSubplot()] };
    const popResults = { time: [0, 1, 2], series: { a: [1, 2, 3], b: [10, 20, 30] } };
    Plotly.reacts.length = 0;
    const win = new PlotPopoutWindow({ id: 'w-context', title: 'T', plotConfig: popConfig,
        getResults: () => popResults, services: {}, seriesTransforms: { rec: popRec } });
    await win.show();
    await ticks();
    const drawnSp = popRec.calls[0]?.[2]?.subplot;
    win.close();
    check('PlotPopoutWindow passes the context too', popRec.calls.map((c) => [c.length, c[2].series?.variable]),
          [[3, 'a'], [3, 'b']]);
    ok('  ...with the window\'s subplot and results',
       drawnSp?.yAxes?.[0]?.series?.[0]?.variable === 'a'
       && popRec.calls.every((c) => c[2].subplot === drawnSp && c[2].results === popResults
                                    && typeof c[2].resolveSeries === 'function'));
}

// ════════════════════════════════════════════════════════════════════════
// §8 (0.17.8) ONLY CONFIGURED SERIES ARE SOURCES
// ════════════════════════════════════════════════════════════════════════
{
    console.log('\n§8 only traces drawn from a configured series');
    const rec = recorder();
    const sp = contextSubplot();
    sp.yAxes[0].series[0].overlay = { label: 'Alpha observed' };
    const figure = await drawGrid({ layout: '1x1', subplots: [sp] }, CONTEXT_RESULTS, {
        seriesTransforms: { rec, second: recorder() },
        overlays: { s1: { years: [0, 2], values: [1.5, 2.5] } },
    });
    check('the overlay is drawn', figure?.data.some((t) => t.name === 'Alpha observed'), true);
    check('no transform runs on the overlay', rec.calls.map((c) => c[2].series.variable), ['a', 'b']);
    check('no derived trace of an overlay or of a derived trace',
          figure?.data.map((t) => t.name).filter((n) => n.includes('observed') || n.includes('(R) (R)')),
          ['Alpha observed']);

    // deriveSeriesTraces on its own
    const own = recorder();
    const traces = [
        { type: 'scatter', name: 'A', x: [0, 1], y: [1, 2] },
        { type: 'scatter', name: 'Overlay', x: [0, 1], y: [3, 4] },
        { type: 'scatter', name: 'B', x: [0, 1], y: [5, 6] },
    ];
    const series = new Map([[traces[0], { variable: 'a' }], [traces[2], { variable: 'b' }]]);
    const results = { time: [0, 1], series: {} };
    const derived = await deriveSeriesTraces(traces, { transforms: { rec: { outputs: { out: true } } } }, { rec: own },
                                             { seriesOf: (t) => series.get(t), results });
    check('with seriesOf: only the traces it names a series for', derived.map((d) => d.name), ['A (R)', 'B (R)']);
    check('  ...each with its own series', own.calls.map((c) => c[2].series.variable), ['a', 'b']);
    ok('  ...and the results given', own.calls.every((c) => c[2].results === results));
    const bare = recorder();
    await deriveSeriesTraces(traces, { transforms: { rec: { outputs: { out: true } } } }, { rec: bare });
    check('without seriesOf: every eligible trace, series and results null',
          bare.calls.map((c) => [c[0], c[2].series, c[2].results, c[2].resolveSeries]),
          [[[1, 2], null, null, null], [[3, 4], null, null, null], [[5, 6], null, null, null]]);
}

// ════════════════════════════════════════════════════════════════════════
// §9 (0.17.8) A CHOICE PARAMETER
// ════════════════════════════════════════════════════════════════════════
{
    console.log('\n§9 a choice parameter');
    const SCENARIOS = [{ value: 'base', label: 'Baseline' }, { value: 'high', label: 'High growth' }];
    const delta = (options, extra = {}) => {
        const calls = [];
        return {
            calls,
            label: 'Delta',
            params: {
                baseline: { label: 'Compare with', type: 'choice', options, ...extra },
                scale: { label: 'Scale', default: 1, step: 0.5 },
            },
            outputs: { diff: { label: 'Difference', suffix: ' (Δ)' } },
            async run(y, params, context) { calls.push({ params, context }); return { diff: y.map(() => 0) }; },
        };
    };

    for (const [what, options] of [['an array', SCENARIOS], ['a function', (subplot) => (subplot ? SCENARIOS : [])]]) {
        const box = document.createElement('div');
        document.body.appendChild(box);
        const sp = makeDefaultSubplot(0);
        let changes = 0;
        const handle = renderSeriesTransformControls(box, sp, { delta: delta(options) },
                                                     { onChange: () => { changes += 1; } });
        const select = box.querySelector('select');
        ok(`options as ${what}: drawn as a select`, !!select);
        check('  ...with the option labels', [...(select?.options ?? [])].map((o) => o.textContent),
              ['Baseline', 'High growth']);
        check('  ...the first option chosen when nothing is declared or saved', select?.value, 'base');
        ok('  ...labelled by the param', select?.parentElement.textContent.startsWith('Compare with')
           && select?.getAttribute('aria-label') === 'Compare with');
        ok('  ...disabled while no output is on', select?.disabled === true);
        ok('  ...beside the number param, still a number field',
           box.querySelectorAll('input[type="number"]').length === 1);

        const toggle = box.querySelector('input[type="checkbox"]');
        toggle.checked = true;
        toggle.dispatchEvent(new dom.window.Event('change'));
        ok('  ...enabled once an output is on', select.disabled === false);
        select.value = 'high';
        select.dispatchEvent(new dom.window.Event('change'));
        check('  ...a pick is saved under subplot.transforms.delta.params', sp.transforms.delta.params,
              { baseline: 'high' });
        check('  ...and calls onChange', changes, 2);

        const reopened = document.createElement('div');
        renderSeriesTransformControls(reopened, sp, { delta: delta(options) });
        check('  ...reopened controls show the saved choice', reopened.querySelector('select').value, 'high');

        const t = delta(options);
        await deriveSeriesTraces([{ type: 'scatter', name: 'A', x: [0], y: [1] }], sp, { delta: t });
        check('  ...run gets the saved choice like a number param', t.calls[0]?.params, { baseline: 'high', scale: 1 });
        handle.dispose();
        box.remove();
    }

    // The select is FlexDesk's selectBox: a value is read back as the option's own value (not text).
    const numeric = [{ value: 1, label: 'One' }, { value: 2, label: 'Two' }];
    const box = document.createElement('div');
    const sp = makeDefaultSubplot(0);
    sp.transforms = { delta: { outputs: { diff: true } } };
    renderSeriesTransformControls(box, sp, { delta: delta(numeric) });
    const select = box.querySelector('select');
    select.selectedIndex = 1;
    select.dispatchEvent(new dom.window.Event('change'));
    check('a numeric option value is saved as its own value (selectBox), not text',
          sp.transforms.delta.params.baseline, 2);
    ok('the select carries the transform param classes',
       select.classList.contains('twm-series-transforms__param')
       && select.classList.contains('twm-series-transforms__select'));
    const source = readFileSync(resolvePath(HERE, '../src/charts/series_transforms.js'), 'utf8');
    ok('series_transforms.js draws it with choice_controls\' selectBox, not a hand-built select',
       /import \{ selectBox \} from '\.\.\/ui\/components\/choice_controls\.js'/.test(source)
       && !/createElement\('select'\)/.test(source));

    // A declared default; a saved value the options no longer offer is kept.
    const t = delta(SCENARIOS, { default: 'high' });
    await deriveSeriesTraces([{ type: 'scatter', name: 'A', x: [0], y: [1] }],
                             { transforms: { delta: { outputs: { diff: true } } } }, { delta: t });
    check('a declared default is passed when nothing is saved', t.calls[0]?.params.baseline, 'high');
    const t2 = delta(SCENARIOS);
    await deriveSeriesTraces([{ type: 'scatter', name: 'A', x: [0], y: [1] }],
                             { transforms: { delta: { outputs: { diff: true } } } }, { delta: t2 });
    check('no default and nothing saved: the first option is passed', t2.calls[0]?.params.baseline, 'base');
    const stale = document.createElement('div');
    renderSeriesTransformControls(stale, { transforms: { delta: { params: { baseline: 'gone' } } } },
                                  { delta: delta(SCENARIOS) });
    check('a saved value no longer offered stays chosen, marked not found',
          [stale.querySelector('select').selectedOptions[0]?.textContent], ['gone (not found)']);
}

// ════════════════════════════════════════════════════════════════════════
// §10 (0.17.8) A run(y, params) TRANSFORM WITH NUMBER PARAMS: AS BEFORE
// ════════════════════════════════════════════════════════════════════════
{
    console.log('\n§10 a two-argument transform is unchanged');
    const t = decompose();
    const sp = makeDefaultSubplot(0);
    sp.yAxes[0].series = [{ id: 's1', variable: 'a', label: 'Alpha', color: '#ff0000' }];
    sp.transforms = { decompose: { outputs: { trend: true, cycle: true }, params: { smoothing: 4 } } };
    const figure = await drawGrid({ layout: '1x1', subplots: [sp] }, { time: [0, 1, 2], series: { a: [1, 2, 3] } },
                                  { seriesTransforms: { decompose: t } });
    check('its params are its number params', t.calls.map((c) => c.params), [{ smoothing: 4 }]);
    check('its y is the drawn values', t.calls.map((c) => c.y), [[1, 2, 3]]);
    check('its outputs draw as before', figure?.data.map((d) => [d.name, d.line?.color, d.line?.dash]),
          [['Alpha', '#ff0000', 'solid'], ['Alpha (Trend)', '#ff0000', 'dash'], ['Alpha (Cycle)', '#ff0000', 'dot']]);

    const box = document.createElement('div');
    const sp2 = makeDefaultSubplot(0);
    renderSeriesTransformControls(box, sp2, { decompose: decompose() });
    check('its controls: no select, one number field', [box.querySelectorAll('select').length,
          box.querySelectorAll('input[type="number"]').length], [0, 1]);
    const field = box.querySelector('input[type="number"]');
    field.value = 'abc';
    field.dispatchEvent(new dom.window.Event('change'));
    check('a non-number entry removes the saved param, as before', sp2.transforms.decompose.params, {});
}

// ════════════════════════════════════════════════════════════════════════
// §6 THE BARREL
// ════════════════════════════════════════════════════════════════════════
{
    console.log('\n§6 @flexdesk/charts exports');
    ok('deriveSeriesTraces', barrel.deriveSeriesTraces === deriveSeriesTraces);
    ok('renderSeriesTransformControls', barrel.renderSeriesTransformControls === renderSeriesTransformControls);
}

await ticks();
check('no unhandled rejections', unhandled, 0);

if (failures) {
    console.error(`\nseries transforms: ${failures} assertion(s) FAILED`);
    process.exit(1);
}
console.log('\nall assertions passed');
