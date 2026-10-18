/**
 * Plot configs, results and overlay data that `tests/plot_grid.test.mjs` draws
 * through `PlotPopoutWindow`, and the one function that reduces what the window
 * drew to the facts the STORY-0060 parity check compares: per figure, its trace
 * names, types and y-axes, and its layout's y-axis keys; per empty subplot, its
 * message. NOT a suite (`run.mjs` runs `*.test.mjs` only).
 *
 * `plot_grid_baseline.json` beside this file is `captureFixtures()` run against
 * the popout BEFORE its private renderer was replaced by `renderPlotGrid` (the
 * tree at e990159). Regenerate it only on purpose:
 *
 *     node tests/plot_grid.test.mjs --write-baseline
 */

const series = (id, variable, extra = {}) => ({
    id, variable, label: '', color: '', lineWidth: 2, lineStyle: 'solid', stackGroup: null, ...extra,
});

const axis = (id, seriesList, extra = {}) => ({
    id, label: '', scale: 'linear', position: 'left', min: null, max: null, step: null,
    series: seriesList, ...extra,
});

const subplot = (id, yAxes, extra = {}) => ({
    id, displayName: '', chartType: 'line', legendPosition: 'hidden', interpolation: 'linear',
    nanHandling: 'gap', showDataPoints: false, xAxis: { useTime: true, variable: '' }, zAxis: null,
    yAxes, ...extra,
});

const TIME = [0, 1, 2, 3, 4];

export const FIXTURES = [
    {
        name: 'single line',
        plotConfig: {
            layout: '1x1',
            subplots: [subplot('sp1', [axis('y1', [series('s1', 'a', { label: 'Alpha', color: '#ff0000' })])])],
        },
        results: { time: TIME, series: { a: [1, 2, 3, 4, 5] } },
    },
    {
        name: '2x2 with dual axes, overlays, stacks, bands and a dataless subplot',
        plotConfig: {
            layout: '2x2',
            subplots: [
                subplot('sp1', [
                    axis('y1', [series('s1', 'a', { label: 'Alpha' }),
                                series('s2', 'Model.b', { label: 'Beta (bare name)' })]),
                    axis('y2', [series('s3', 'c', { label: 'Gamma right',
                                                    overlay: { etlKey: 'k1', label: 'Gamma observed' } })],
                         { position: 'right', label: 'Right' }),
                ], { referenceLines: [{ yAxisId: 'y2', value: 3, label: 'Target' }],
                     shadedBands: [{ x0: 1, x1: 2, label: 'Band' }] }),
                subplot('sp2', [axis('y1', [
                    series('s4', 'a', { label: 'Stack A', stackGroup: 'g' }),
                    series('s5', 'c', { label: 'Stack C', stackGroup: 'g' }),
                ])], { chartType: 'area' }),
                subplot('sp3', [axis('y1', [series('s6', 'missing', { label: 'Nowhere' })])]),
                subplot('sp4', [axis('y1', [series('s7', 'nan', { label: 'Holes' }),
                                            series('s8', 'a', { _resultKey: 'scenario2.a', label: 'Keyed' })])],
                        { chartType: 'bar', nanHandling: 'interpolate' }),
            ],
        },
        results: {
            time: TIME,
            series: {
                a: [1, 2, 3, 4, 5],
                b: [5, 4, 3, 2, 1],
                c: [2, 2, 3, 3, 4],
                nan: [1, NaN, 3, null, 5],
                'scenario2.a': [9, 9, 9, 9, 9],
            },
        },
        actuals: { s3: { years: [0, 2, 4], values: [2.1, 2.9, 4.2] } },
    },
    {
        name: '1x2 with one subplot configured',
        plotConfig: {
            layout: '1x2',
            subplots: [subplot('sp1', [axis('y1', [series('s1', 'a', { label: 'Only' })])],
                               { chartType: 'scatter', legendPosition: 'right' })],
        },
        results: { time: TIME, series: { a: [1, 2, 3, 4, 5] } },
    },
    {
        name: 'wide-top, three axes',
        plotConfig: {
            layout: 'wide-top',
            subplots: [
                subplot('sp1', [
                    axis('y1', [series('s1', 'a')]),
                    axis('y2', [series('s2', 'b')], { position: 'right' }),
                    axis('y3', [series('s3', 'c')], { position: 'left', scale: 'log' }),
                ]),
                subplot('sp2', [axis('y1', [series('s4', 'b', { label: 'B again', lineStyle: 'dashed' })])]),
                subplot('sp3', [axis('y1', [])]),
            ],
        },
        results: { time: TIME, series: { a: [1, 2, 3, 4, 5], b: [5, 4, 3, 2, 1], c: [1, 10, 100, 1000, 10000] } },
    },
];

/**
 * Open a PlotPopoutWindow on every fixture and reduce what it drew.
 *
 * @param {Function} PlotPopoutWindow
 * @param {{ reacts: Array<{gd, data, layout}> }} Plotly - the recording fake
 * @param {Function} settle - resolves once pending renders are done
 */
export async function captureFixtures(PlotPopoutWindow, Plotly, settle) {
    const out = {};
    for (const fx of FIXTURES) {
        Plotly.reacts.length = 0;
        const win = new PlotPopoutWindow({
            id: `fixture-${fx.name}`, title: fx.name,
            plotConfig: structuredClone(fx.plotConfig),
            getResults: () => fx.results,
            actuals: fx.actuals ?? null,
            services: {},
        });
        await win.show();
        await settle();
        const latest = new Map();
        for (const r of Plotly.reacts) latest.set(r.gd, r);
        const figures = [...latest.values()].map(({ data, layout }) => ({
            traces: data.map((t) => ({ name: t.name, type: t.type ?? 'scatter', yaxis: t.yaxis ?? 'y' })),
            yAxes: Object.keys(layout).filter((k) => /^yaxis\d*$/.test(k)).sort(),
        }));
        const empty = [...document.querySelectorAll('.twm-plot-no-data')].map((el) => el.textContent);
        win.close();
        out[fx.name] = { figures, empty };
    }
    return out;
}
