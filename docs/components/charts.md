# Charts

> **Package:** `@flexdesk/charts` · **Needs:** Plotly, as a [peer dependency](../concepts/peer-dependencies.md) · [All docs](../README.md)

Plotly-backed charts: the wrapper, the chart types, subplot layouts, downsampling, the plot grid, the plot-config editor and the two plot windows. Plotly itself is not in the bundle; call `setPlotlySource()` with the path to your copy. The plot window's `streamEvents` option is described with the [other application-neutral options](../concepts/domain-neutrality.md#no-application-globals-the-gallery-picker-and-plot-window-events-0170).

## An empty cell can name what is missing: `emptyMessage` as a function (0.17.12)

[`renderPlotGrid`](#a-plot-config-in-any-container-renderplotgrid-0170),
`PlotPopoutWindow` and `openPlotPopoutWindow` take `emptyMessage` as a string,
as before, or as a function of the subplot:

```js
const grid = renderPlotGrid(el, plotConfig, results, {
    emptyMessage: (subplot, results, index) => {
        const name = subplot.yAxes[0].series[0]?.variable;
        return results ? `${name} not in this run` : 'No data yet.';
    },
});
await grid.update({ results: next });   // the empty cells say what is missing in `next`
```

The function is called each time a cell is drawn empty, with that cell's
subplot, the grid's results at that moment (null when there are none) and the
cell's index in the layout: on the first draw, on every `update()` (new
`results`, a new `plotConfig`, `overlays` or `hiddenSeries`), on a resize that
draws a deferred cell, and when a subplot fails to draw. So the message follows
results that stream in or change, without disposing and rebuilding the grid. A
slot with no subplot still shows `noSubplotMessage`.

The plot window hands its `emptyMessage` to its grid, so the function is called
on the window's own redraws too: its refresh and stream events and
`updateConfig()`. `openPlotPopoutWindow` forwards it with its other options.
The Data tab's `tableEmptyMessage` stays a string.

A string `emptyMessage` is shown exactly as before, and no option or export
changed.

`tests/plot_grid.test.mjs` §8 pins it.

## Interpolation `'auto'` is a listed choice (0.17.9)

A subplot's `interpolation` is `'linear'`, `'step'`, `'cubic'` or `'auto'`.
`'auto'` draws straight segments between the points, exactly as `'linear'`
does (`buildTrace` gives both the Plotly line shape `linear`, as it always
has); it is the value embedders such as EcoSim save for their plots.
[`renderPlotConfigEditor`](#editing-a-plot-config-renderplotconfigeditor-0170)
offered only Linear, Step and Cubic spline, so a subplot saved with `'auto'`
opened with `auto (not found)` in **Interpolation**. The select now offers
**Auto**, **Linear**, **Step** and **Cubic spline**: a subplot saved with
`'auto'` opens with Auto chosen and keeps `'auto'` until you pick something
else, and picking Auto writes `'auto'`. A new subplot is still `'linear'`
(`makeDefaultSubplot`), and every value draws as before.

`tests/plot_config_editor.test.mjs` §11 pins it.

## The plot config editor writes no stray "null" (0.17.9)

[`renderPlotConfigEditor`](#editing-a-plot-config-renderplotconfigeditor-0170)
drew a subplot's sections into one body and appended the sections a subplot
does not have as `null`, which `Element.append()` writes as the text `null`.
So every 2D subplot showed a `null` line between the Y axes and **Reference
lines** (where a 3D chart's **Z axis** goes), and an editor without
`seriesTransforms` showed another after **Shaded bands** (where **Derived
series** goes). The body now holds its sections and nothing else: a section
the subplot does not have is left out. Nothing else about the editor changed.

`tests/plot_config_editor.test.mjs` §10 pins it.

## A series transform knows its series, and takes a choice parameter (0.17.8)

Two additions to [`seriesTransforms`](#derived-series-seriestransforms-0170).
A transform written for `run(y, params)` with number parameters works exactly
as before.

**The series it runs on.** `run` gets a third argument:

```js
run(y, params, { series, subplot, results, resolveSeries })
```

`series` is the subplot's series entry the trace was drawn from (the same
object, with its `variable` and whatever else you keep on it, such as a
`scenario`), `subplot` the subplot config, `results` the results the figure was
drawn from, and `resolveSeries` the `(series, results, subplot) => { y, x? }`
the figure was drawn with (yours, or `resolveSeriesData`). `y` is still the
drawn values, after the subplot's NaN handling and whatever your
`resolveSeries` did to them (a rebase, say). So a transform can draw the same
series from somewhere else, resolved the same way, instead of guessing which
series `y` is:

```js
delta: {
    label: 'Scenario delta',
    params: { baseline: { label: 'Compare with', type: 'choice',
                          options: () => scenarios.map((s) => ({ value: s.id, label: s.name })) } },
    outputs: { difference: { label: 'Difference', suffix: ' (Δ)', lineStyle: 'dashed' } },
    run: (y, { baseline }, { series, subplot, resolveSeries }) => {
        const base = resolveSeries(series, resultsOf(baseline), subplot)?.y;
        return base ? { difference: y.map((v, i) => v - base[i]) } : {};
    },
},
```

`renderPlotGrid`, and so `PlotPopoutWindow`, run transforms on the same
traces as in 0.17.7, with the same derived traces: every line or scatter trace
of the figure, overlays included, never a derived trace. A trace drawn from one
of the subplot's series gets that series as `context.series`; any other trace,
such as an overlay, gets `context.series` null (with `subplot`, `results` and
`resolveSeries` still given), so a transform that needs a series, such as a
scenario delta, skips it itself (`if (!series) return {};`).
`deriveSeriesTraces(traces, subplot, seriesTransforms,
{ onError, seriesOf, results, resolveSeries })` takes the same as options:
`seriesOf(trace)` names the series a trace was drawn from (null for none); it
only fills `context.series` and does not choose which traces are run on.
Without these options `series`, `results` and `resolveSeries` are null.

**A choice parameter.** A parameter declared `{ type: 'choice', options }` is
a select instead of a number field. `options` is an array of
`{ value, label }` (a bare value, a `disabled` option and a `{ group, options }`
entry work as in the other FlexDesk selects), or a function
`(subplot) => options`, called when the controls are drawn and also whenever
the parameter needs its default (nothing saved, no `default`), which is on
each redraw of the figure. It is drawn by
`renderSeriesTransformControls` with the same select the settings view and
the flow kit use (choice_controls' `selectBox`), so a value comes back as the
option's own value (a number stays a number) and a saved value the list no
longer offers stays chosen, shown as `<value> (not found)`. The pick is saved
under `subplot.transforms.<id>.params` and passed to `run` like a number
parameter. Without a `default` and with nothing saved, the parameter is its
first enabled option (`{ group, options }` entries flattened in order, as the
select draws them), in the select and in `run`.

`tests/series_transforms.test.mjs` §7 to §10 pin all of it.

## A data series with no saved plot config opens (0.17.5)

`openDataSeriesPlotWindow` (and `new DataSeriesPlotWindow`, the module's
default export) asks `getPlotConfig(seriesId)` for the series' plot config.
When that answers nothing, the window builds a default one with
`DataSeriesPlotWindow.createDefaultConfig(headers, numericColumns, classifyHeader)`:
X is the first numeric column the classifier calls `'time'` (else the first
numeric column), and Y is up to three of the other numeric columns. The window
passes the `classifyHeader` it was given, so an application whose time column
is `year` or `date_index` gets that column on X; without one the default
classifier calls `t`, `time`, `step` and `period` time.

```js
openDataSeriesPlotWindow({ seriesId, seriesName, headers, dataHub, services,
    getPlotConfig, savePlotConfig,
    classifyHeader: (h) => (h === 'year' ? 'time' : 'indicator') });   // X is `year`
```

The third parameter of `createDefaultConfig` is new and optional: called with
two arguments it uses the default classifier. Until 0.17.5 the static method
read `this.classifyHeader`, which a class does not have, so opening any series
with no saved plot config threw `TypeError: this.classifyHeader is not a
function` (BUG-0037). `tests/data_series_plot_default_config.test.mjs` holds it.

## Derived series: `seriesTransforms` (0.17.0)

A plot can draw series worked out from its own: a trend, a moving average, a
decomposition. `@flexdesk/charts` ships none; you pass them to
`PlotPopoutWindow` (or `openPlotPopoutWindow`) as `seriesTransforms`:

```js
import { openPlotPopoutWindow, renderSeriesTransformControls } from '@flexdesk/charts';

const seriesTransforms = {
    hp: {
        label: 'HP filter',
        params: { lambda: { label: 'Lambda', default: 1600, min: 1, step: 100 } },
        outputs: {
            trend: { label: 'Trend', suffix: ' (HP Trend)', lineStyle: 'dashed' },
            cycle: { label: 'Cycle', suffix: ' (HP Cycle)', lineStyle: 'dotted', lineWidth: 1 },
        },
        run: (y, { lambda }) => myBackend.hpFilter(y, lambda),   // -> { trend: [...], cycle: [...] }
    },
};

openPlotPopoutWindow({ id, title, plotConfig, getResults, services, seriesTransforms,
    configRenderer: (el) => renderSeriesTransformControls(el, plotConfig.subplots[0],
                                                           seriesTransforms, { onChange: redraw }) });
```

What a subplot switches on is in the subplot:
`subplot.transforms = { hp: { outputs: { trend: true }, params: { lambda: 100 } } }`.
For every transform with an output switched on, `run(y, params)` is called
once per line or scatter trace of the subplot (params: the declared defaults
under the subplot's own), and each switched-on output it returns is drawn as
an extra trace in the source trace's colour, on its axis, named
`<source name><suffix>`, with the output's `lineStyle` and `lineWidth`
(default 2). A transform that throws or rejects is skipped for that trace,
reported to `services.logger.warn`, and the figure is drawn without it.
`deriveSeriesTraces(traces, subplot, seriesTransforms, { onError })` is that
step on its own, for a renderer of your own.

`renderSeriesTransformControls(container, subplot, seriesTransforms, { onChange })`
renders, per transform, a toggle for each output and a number field for each
parameter (disabled while no output is on); it edits `subplot.transforms` in
place and returns `{ dispose }`. With no transforms it renders nothing.

Until 0.17.0 the plot window called one application's backend for a
Hodrick-Prescott filter, and every default subplot carried `showHpTrend`,
`showHpCycle` and `hpLambda`. Those keys are gone and are ignored in saved
configs; without `seriesTransforms` no derived trace is drawn.
`tests/series_transforms.test.mjs` pins all of it.

## A plot config in any container: `renderPlotGrid` (0.17.0)

`PlotPopoutWindow` used to keep its subplot renderer private, so anything else
that showed the same plot config (a notebook cell, a dashboard tile) had to
copy it. It is now exported, and the window is one of its callers:

```js
import { renderPlotGrid, migrateData } from '@flexdesk/charts';

const grid = renderPlotGrid(el, migrateData(savedConfig), { time, series }, {
    overlays,                 // { [series.id]: { years, values } } for series with an `overlay`
    seriesTransforms,         // as above
    hiddenSeries: new Set(),  // trace names not to draw
});
await grid.update({ results: next });   // any of plotConfig, results, overlays, hiddenSeries
grid.resize();
grid.dispose();
```

It lays a `.twm-plot-grid` out from `PLOT_LAYOUTS` (a cell per slot, a
`.twm-plot-grid__cell` in that slot's grid area) and draws one figure per
subplot: its chart type, interpolation, data points and stack groups, every
y-axis (left or right, linear or log, min, max, step), reference lines and
shaded bands, the NaN strategy, the x-axis clipped to the results' time
range, or an x variable instead of time (`xAxis: { useTime: false, variable }`).
A subplot with nothing to draw shows `emptyMessage` (default `No data yet.`;
[a function of the subplot](#an-empty-cell-can-name-what-is-missing-emptymessage-as-a-function-01712)
since 0.17.12); a
slot with no subplot shows `noSubplotMessage` (`No subplot configured.`); null
results empty every subplot. A cell that is detached or has no size is not
drawn: the grid's own ResizeObserver draws it once it has one. `dispose()`
purges every figure and removes the grid; `grid.charts` is the cells, for
Plotly calls of your own (relayout, toImage), and `grid.plotted` is the cells
that show a figure right now, however it got there (an `update()`, or a
deferred draw on a resize). `update()` resolves whether it drew anything, but a
cell it deferred is drawn later, so ask `grid.plotted`, not that value, before
acting on a figure.

The other options:

| Option | What it does |
|---|---|
| `resolveSeries(series, results, subplot)` | Returns `{ y, x? }` or null. Default `resolveSeriesData`: `series[_resultKey ?? variable]`, then `variable`, then the name after its first `.`; `x` is `_resultTime`. Also resolves the x variable. |
| `derivedTraces(traces, subplot, { results, index })` | Extra Plotly traces (or a promise of them) appended to a subplot's figure. |
| `onTransformError`, `onError` | A transform that failed (`{ transformId, traceName, error }`); a subplot that failed to draw (`{ index, error }`), on an `update()` or on the resize that draws a deferred one, which then shows the empty message. |
| `theme` | Overrides for `PLOT_GRID_THEME`: `fontFamily`, `fontColor`, `fontSize`, `paperBackground`, `plotBackground`, `gridColor`, `lineColor`, `tickColor`, `zeroLineColor`, `hoverBackground`, `hoverBorder`. |
| `alwaysShowLegend` | Draws a subplot whose legend is `'hidden'` with one at the top. |
| `layout` | Plotly layout fields merged over every figure's (`hovermode`, `margin`, ...). |

`PlotPopoutWindow` takes `resolveSeries` too, for its chart and its data
table. Its chart cells were `div.plot-tile-chart` and are now
`div.twm-plot-grid__cell` inside a `.twm-plot-grid`. An overlay is drawn for
any series with an `overlay` and data under its id in `actuals`; it used to
need `overlay.etlKey` as well. More changes to what the window draws, for
configs outside the fixtures:

- On an `'area-stacked'` subplot, overlays are stacked too, in a group of their
  own per y-axis (`stackgroup: 'overlay-<y ref>'`, `groupnorm: 'fraction'`,
  `mode: 'lines'`, no fill), so they read on the same 0..1 scale as the stack.
  They used to be drawn unstacked, at their raw values.
- A subplot with no traces draws an empty figure, not the empty message, only
  when **all of its own** series are hidden (its overlays and derived traces do
  not count). It used to do that for every subplot as soon as any series
  anywhere in the window was hidden. Null results win over that rule: with no
  results every configured subplot shows `emptyMessage`, hidden series or not.
- While `getResults()` answers null and nothing has been drawn yet, every cell
  shows `emptyMessage`; the cells used to stay blank. Figures already drawn
  stay while the results are briefly null, as before.
- A y axis's positive `step` sets the Plotly `dtick` of that axis. The window
  used to ignore `step`, so Plotly chose the tick spacing.
- A subplot with `xAxis: { useTime: false, variable }` is drawn against that
  variable, with an x-axis title (`xAxis.label`, else the variable's name) and
  no clip of the x axis to the time range. The window used to ignore `xAxis`
  and always drew against time, clipped to the first and last time point.

Its zoom and pan buttons and Download PNG act on `grid.plotted`, so a figure the
grid drew on a resize (the window opened while its plot area had no size) is
zoomable and exportable; Download PNG exports the first subplot that shows a
figure, where it used to try the first slot whatever it held.
`tests/plot_grid.test.mjs` pins all of it,
including that the window draws the same traces, names and axes for the
fixture configs (`tests/fixtures/plot_grid_fixtures.mjs`) as it did before.

## Editing a plot config: `renderPlotConfigEditor` (0.17.0)

`renderPlotGrid` draws a plot config; `renderPlotConfigEditor` edits one, in
place, so an embedder no longer writes its own panel for it:

```js
import { renderPlotConfigEditor, renderPlotGrid, migrateData } from '@flexdesk/charts';

const plotConfig = migrateData(savedConfig);
const editor = renderPlotConfigEditor(el, plotConfig, {
    onChange: () => grid.update({ plotConfig }),            // after every edit
    seriesProvider: ({ value, role, subplot }) => names(value),   // items, or a promise of them
    seriesTransforms,                                       // their toggles, per subplot
    overlaySources: () => mySources(),                      // optional
    extraSeriesFields: (el, series, { subplot, axis, onChange }) => { /* your fields */ },
});
editor.dispose();
```

It draws a layout picker (every `PLOT_LAYOUTS` entry), a tab per subplot slot
when the layout has more than one, and for the subplot in front: its title;
its chart type, legend, interpolation, NaN handling and data points; its x
axis (time, or a series); its y axes (label, scale, position, min, max, step)
and, under each, its series (a picker, legend label, colour, width, dash and
stack group); its z axis while the chart type is 3D; its reference lines and
shaded bands; and the toggles of any `seriesTransforms`. Every edit writes the
config it was given and then calls `onChange(config)`.

- A layout with more slots than there are subplots adds default subplots
  (`makeDefaultSubplot`); one with fewer keeps the extra subplots, so switching
  back restores them.
- **Add Y axis** adds `makeDefaultYAxis(index)` (left for an even index, right
  for an odd one) and **Add series** adds `makeDefaultSeries(index)` (coloured
  by its place among the subplot's series). Both come from `@flexdesk/charts`,
  and `makeDefaultSubplot` and `migrateData` build their axes and series from
  them, so an axis added in the editor matches a default subplot's.
- A 3D chart type gives the subplot a z axis (label, scale, min, max, step and
  a series) and uses its first y axis only: the other y axes are shown disabled
  and **Add Y axis** is disabled. A 2D chart type sets `zAxis` back to `null`.
- Every series picker is an `AutocompleteField` fed by `seriesProvider`, asked
  `{ value, role, subplot }`, where `role` is `'series'`, `'x'` or `'z'`. It
  answers AutocompleteField items (`{ label, insertText?, type? }`) or a promise
  of them. A provider that throws or rejects shows no suggestions and leaves
  the typed text as it is (`logger.warn` hears it when you pass `logger`).
  Without `seriesProvider` the pickers suggest nothing and take typed text.
- `overlaySources()` answers choice options (`{ value, label }`, or
  `{ group, options }`), or a promise of them, asked once per draw. With it,
  every series row gets an overlay source select; choosing one writes
  `series.overlay = { source, ... }` and shows the overlay's label, colour,
  dash, width and mode. `renderPlotGrid` draws it from the data you pass under
  the series' id in `overlays`. **None** removes `series.overlay`. Without
  `overlaySources` there are no overlay controls.
- `extraSeriesFields(el, series, { subplot, axis, onChange })` puts fields of
  your own in each series row; call `onChange()` after you edit the series. What
  it returns is disposed (`dispose()`) when the row is redrawn or the editor
  is disposed. A `dispose()` that throws is reported to `logger.warn` and does
  not stop the rest of the editor being disposed.

It returns `{ dispose, refresh, selectSubplot, activeSubplot }`: `dispose()`
disposes every field it created (every `AutocompleteField` among them) and
removes the editor; `refresh()` redraws it after the config was changed from
outside; `selectSubplot(index)` brings a subplot to the front. It fits
`PlotPopoutWindow`'s `configRenderer` slot, `(container) => { dispose() } | void`:
the window disposes what the renderer returns when it closes, so return the
editor and its dropdowns leave `document.body` with the window.
`openPlotPopoutWindow` is async; await it:

```js
const win = await openPlotPopoutWindow({ id, title, plotConfig, getResults, services,
    configRenderer: (el) => renderPlotConfigEditor(el, plotConfig,
                                { onChange: () => win.updateConfig(plotConfig) }) });
```

Its classes are under `.twm-plot-config` in `flexdesk.css`.
`tests/plot_config_editor.test.mjs` pins all of it.
