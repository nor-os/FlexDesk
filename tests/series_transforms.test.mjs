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
