/**
 * ══ THE CATEGORICAL TRACES, AND THE INDICATOR THAT IS NOT A TRACE TYPE ══
 *
 * `buildTrace` was written for one shape: two parallel arrays, an x and a y,
 * drawn as a line or a bar. A dashboard asks for the other shape — a pie over
 * one grouped column, a funnel over an ordered set of stages, a single number
 * with a gauge behind it — and the two shapes do not share a trace object.
 *
 * So the three categorical types return EARLY, above the switch, and this file
 * exists to hold that placement in place. Two specific regressions are what it
 * is really guarding, and neither would throw:
 *
 *   §2  A pie carrying `x` and `y`. Plotly ignores them today, which is
 *       precisely why nobody would notice the day it stops ignoring them.
 *   §3  `showMarkers: true` reaching the marker block at the bottom of
 *       buildTrace, which assigns `marker = {color, size}` for ANY type and
 *       would replace `marker.colors` — the per-slice palette — with one
 *       scalar. A seven-slice pie becomes a single blue disc, silently.
 *
 * §1 is the D6 half: FlexDesk is modified UPSTREAM, ADDITIVELY AND
 * BACK-COMPATIBLY, so every pre-existing chart type is asserted to build
 * exactly what it built before the early return was inserted in front of it.
 * A test suite for new behaviour that does not pin the old behaviour is how an
 * additive change stops being one.
 *
 * §5 covers `buildIndicatorTrace`, whose contract has one trap of its own:
 * `delta: 0` is an ordinary comparison against a zero reference, and any
 * truthiness test drops it for exactly the callers who would be least sure
 * whether the number was right.
 *
 * ── HOW TO RUN ───────────────────────────────────────────────────────────
 *
 *     node tests/chart_types.test.mjs              # from ../FlexDesk
 *     node tests/run.mjs                           # with every other suite
 *
 * No jsdom, no DOM, no Plotly: these are pure functions returning literals,
 * which is the reason they are testable at all. It imports `../src/charts/`
 * DIRECTLY and never `dist/` — the change under test is upstream source, and a
 * test against the bundle passes for a week by testing the previous build.
 */

import {
    CHART_TYPES_2D,
    CHART_TYPES_3D,
    ALL_CHART_TYPES,
    is3DChart,
    buildTrace,
    buildIndicatorTrace,
} from '../src/charts/chart_types.js';
import { COLOR_PALETTE, getSeriesColor } from '../src/charts/plotly_wrapper.js';

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

console.log('\ncharts: pie, donut, funnel, and the indicator\n');

// ════════════════════════════════════════════════════════════════════════
// 1. NOTHING THAT WORKED BEFORE WORKS DIFFERENTLY (D6)
// ════════════════════════════════════════════════════════════════════════

{
    const line = buildTrace({ chartType: 'line', x: [1, 2], y: [3, 4], name: 'L' });
    check('line is still {type:scatter, mode:lines} over x/y',
          [line.type, line.mode, line.x, line.y], ['scatter', 'lines', [1, 2], [3, 4]]);
    check('line still carries its line config',
          line.line, { color: COLOR_PALETTE[0], width: 2, dash: 'solid', shape: 'linear' });

    const bar = buildTrace({ chartType: 'bar', x: ['a'], y: [1], seriesIndex: 1 });
    check('bar is still a bar with a scalar marker.color',
          [bar.type, bar.marker], ['bar', { color: COLOR_PALETTE[1] }]);

    const area = buildTrace({ chartType: 'area', x: [1], y: [2] });
    ok('area still fills to zero', area.fill === 'tozeroy' && !!area.fillcolor);

    const s3d = buildTrace({ chartType: 'scatter3d', x: [1], y: [2], z: [3] });
    check('3D still gets its z', [s3d.type, s3d.z], ['scatter3d', [3]]);

    const unknown = buildTrace({ chartType: 'nonsense', x: [1], y: [2] });
    check('an unknown type still falls through to a line', unknown.type, 'scatter',
          'the default arm of the switch must still be reachable — the early '
        + 'return takes only the three names it lists');

    // The three new names must not have leaked into the 3D predicate, which is
    // consulted for the z block and for the yaxis assignment at the bottom.
    check('none of the three is 3D',
          ['pie', 'donut', 'funnel'].map(is3DChart), [false, false, false]);

    const values = CHART_TYPES_2D.map((t) => t.value);
    check('CHART_TYPES_2D gained exactly three entries, appended',
          values, ['line', 'bar', 'scatter', 'area', 'area-stacked', 'phase',
                   'pie', 'donut', 'funnel'],
          'a consumer renders this list in order; inserting into the middle '
        + 'reshuffles every existing dropdown');
    ok('ALL_CHART_TYPES follows from it',
       ALL_CHART_TYPES.length === CHART_TYPES_2D.length + CHART_TYPES_3D.length
       && ALL_CHART_TYPES.slice(0, CHART_TYPES_2D.length).every(
              (t, i) => t.value === CHART_TYPES_2D[i].value));
    ok('`indicator` is NOT offered as a chart type',
       !ALL_CHART_TYPES.some((t) => t.value === 'indicator'),
       'buildTrace takes (x[], y[]) and an indicator takes a scalar — offering '
     + 'it in the same dropdown offers a rendering of data it cannot consume');
}

// ════════════════════════════════════════════════════════════════════════
// 2. A PIE HAS LABELS AND VALUES, AND NO x AND NO y
// ════════════════════════════════════════════════════════════════════════

{
    const pie = buildTrace({ chartType: 'pie', x: ['EMEA', 'APAC'], y: [12, 5], name: 'Region' });

    check('type', pie.type, 'pie');
    check('labels come from x', pie.labels, ['EMEA', 'APAC']);
    check('values come from y', pie.values, [12, 5]);
    ok('there is no `x` key at all', !('x' in pie),
       'not `undefined` — ABSENT. A pie carrying x/y is ignored by Plotly '
     + 'today and is a shared-axis bug the day it is not');
    ok('there is no `y` key at all', !('y' in pie));
    ok('and no `mode`', !('mode' in pie), 'mode is a scatter concept');
    check('name survives, for the legend', pie.name, 'Region');

    check('slices take the palette from the top', pie.marker.colors,
          [getSeriesColor(0), getSeriesColor(1)],
          'a pie IS the chart — its slices do not continue another series\' numbering');

    const offset = buildTrace({ chartType: 'pie', x: ['a', 'b'], y: [1, 2], seriesIndex: 4 });
    check('seriesIndex does not shift the slice palette', offset.marker.colors,
          [getSeriesColor(0), getSeriesColor(1)]);

    const explicit = buildTrace({ chartType: 'pie', x: ['a', 'b'], y: [1, 2],
                                  colors: ['#111111', '#222222'] });
    check('explicit colors win', explicit.marker.colors, ['#111111', '#222222']);

    const empty = buildTrace({ chartType: 'pie', x: ['a'], y: [1], colors: [] });
    check('an EMPTY colors array falls back rather than drawing nothing',
          empty.marker.colors, [getSeriesColor(0)]);

    ok('slices are not re-sorted', pie.sort === false,
       'the caller ordered its rows; a second invisible ordering makes the '
     + 'chart disagree with the table beside it');

    const donut = buildTrace({ chartType: 'donut', x: ['a'], y: [1] });
    check('a donut is a pie with a hole', [donut.type, donut.hole], ['pie', 0.55]);
    ok('and a pie has no hole key', !('hole' in pie));
}

// ════════════════════════════════════════════════════════════════════════
// 3. showMarkers DOES NOT REACH THE PALETTE
// ════════════════════════════════════════════════════════════════════════
//
// The marker block near the end of buildTrace fires on `showMarkers` for any
// chart type. If a pie ever reaches it, `marker` is replaced wholesale by
// `{color, size}` — one scalar colour for every slice.

{
    for (const chartType of ['pie', 'donut']) {
        const t = buildTrace({ chartType, x: ['a', 'b', 'c'], y: [1, 2, 3], showMarkers: true });
        check(`${chartType}: marker.colors survives showMarkers`, t.marker.colors,
              [getSeriesColor(0), getSeriesColor(1), getSeriesColor(2)]);
        ok(`${chartType}: no scalar marker.color beside it`, !('color' in t.marker),
           'a seven-slice pie rendered as one blue disc, and nothing threw');
        ok(`${chartType}: no marker.size`, !('size' in t.marker));
    }

    const f = buildTrace({ chartType: 'funnel', x: ['a', 'b'], y: [1, 2], showMarkers: true });
    check('funnel: marker.color survives showMarkers', f.marker.color,
          [getSeriesColor(0), getSeriesColor(1)]);

    // The other blocks below the switch key off chartType by name, so the
    // categorical types would miss them anyway — but `stackGroup` is the one
    // that fires on a truthy OPTION rather than on a type name.
    const stacked = buildTrace({ chartType: 'pie', x: ['a'], y: [1], stackGroup: 'g' });
    ok('stackGroup cannot reach a pie either', !('stackgroup' in stacked));

    const axis2 = buildTrace({ chartType: 'pie', x: ['a'], y: [1], yAxisId: 'y2' });
    ok('and neither can a second y-axis assignment', !('yaxis' in axis2),
       'a pie has no axes to assign to');
}

// ════════════════════════════════════════════════════════════════════════
// 4. A FUNNEL IS BAR-SHAPED, WHICH IS A DIFFERENT SPELLING
// ════════════════════════════════════════════════════════════════════════

{
    const f = buildTrace({ chartType: 'funnel', x: ['Visited', 'Signed up', 'Paid'],
                           y: [900, 240, 61], name: 'Signup' });

    check('type', f.type, 'funnel');
    check('the stages read DOWN the categorical axis', f.y, ['Visited', 'Signed up', 'Paid']);
    check('and the measure runs ACROSS', f.x, [900, 240, 61]);
    ok('it is `marker.color`, singular, holding an array', Array.isArray(f.marker.color),
       '`marker.colors` is the pie spelling; a funnel silently ignores it and '
     + 'draws every stage in Plotly\'s default blue');
    ok('and NOT `marker.colors`', !('colors' in f.marker));
    check('percent-of-first is on, which is what a funnel is read for',
          f.textinfo, 'value+percent initial');
    ok('no labels/values keys', !('labels' in f) && !('values' in f));
}

// ════════════════════════════════════════════════════════════════════════
// 5. THE INDICATOR
// ════════════════════════════════════════════════════════════════════════

{
    const bare = buildIndicatorTrace({ value: 41 });
    check('with no ceiling it is a bare number',
          [bare.type, bare.mode, bare.value], ['indicator', 'number', 41]);
    ok('and there is no gauge object to draw', !('gauge' in bare),
       'a gauge with no ceiling has no arc; inventing one draws a chart that '
     + 'is quietly wrong about the only thing a gauge says');
    ok('no delta either', !('delta' in bare));
    ok('no title key when none was given', !('title' in bare));

    const gauge = buildIndicatorTrace({ value: 41, max: 100, title: 'Utilisation' });
    check('a ceiling turns it into a gauge', gauge.mode, 'gauge+number');
    check('the range floors at zero by default', gauge.gauge.axis.range, [0, 100]);
    check('title', gauge.title, { text: 'Utilisation' });
    check('the bar takes the palette', gauge.gauge.bar.color, getSeriesColor(0));
    check('…or the series index', buildIndicatorTrace({ value: 1, max: 2, seriesIndex: 2 })
          .gauge.bar.color, getSeriesColor(2));
    check('…or an explicit colour', buildIndicatorTrace({ value: 1, max: 2, color: '#abcdef' })
          .gauge.bar.color, '#abcdef');
    ok('no steps key when none were passed', !('steps' in gauge.gauge));
    ok('no threshold key when none was passed', !('threshold' in gauge.gauge));

    const banded = buildIndicatorTrace({
        value: 41, min: 10, max: 100,
        steps: [{ range: [10, 50], color: '#eee' }],
        threshold: 90,
    });
    check('min is honoured', banded.gauge.axis.range, [10, 100]);
    check('steps pass through untouched', banded.gauge.steps,
          [{ range: [10, 50], color: '#eee' }]);
    check('a bare number threshold becomes a line at that value',
          banded.gauge.threshold.value, 90);
    ok('with a width and a thickness Plotly needs',
       banded.gauge.threshold.line.width === 3 && banded.gauge.threshold.thickness === 0.9);

    const objThreshold = buildIndicatorTrace({ value: 1, max: 2,
        threshold: { value: 1.5, color: '#123456', width: 6, thickness: 0.5 } });
    check('or an object, spelled out', objThreshold.gauge.threshold,
          { line: { color: '#123456', width: 6 }, thickness: 0.5, value: 1.5 });

    // The one that would be missed.
    const zero = buildIndicatorTrace({ value: 7, delta: 0 });
    check('delta:0 is a REFERENCE, not an absence', zero.mode, 'number+delta',
          '0 is an ordinary reference — last month was zero — and a truthiness '
        + 'test drops the comparison exactly for the callers least sure of it');
    check('and it reaches Plotly as a zero', zero.delta.reference, 0);

    const delta = buildIndicatorTrace({ value: 7, max: 10, delta: { reference: 5 } });
    check('gauge + number + delta, in that order', delta.mode, 'gauge+number+delta');
    check('up is green and down is red by default',
          [delta.delta.increasing.color, delta.delta.decreasing.color],
          ['#859900', '#dc322f']);
    check('relative defaults to absolute', delta.delta.relative, false);

    const inverted = buildIndicatorTrace({ value: 7,
        delta: { reference: 5, relative: true, increasing: '#dc322f', decreasing: '#859900' } });
    check('a metric that is better when it falls swaps its own two colours',
          [inverted.delta.increasing.color, inverted.delta.decreasing.color],
          ['#dc322f', '#859900'],
          '"up is good" is a property of the measure, and this file is never '
        + 'told what the measure is');
    check('and relative is passed through', inverted.delta.relative, true);

    ok('a null delta is no delta', !('delta' in buildIndicatorTrace({ value: 1, delta: null })));
}

console.log(failures === 0
    ? '\nall assertions passed\n'
    : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
