/**
 * plot_grid.js — draw a plot config into any container.
 *
 * A plot config (plot_config.js: `{ layout, subplots }`) is a grid of subplots,
 * each with one or more y-axes of series. `renderPlotGrid` lays the grid out
 * from PLOT_LAYOUTS, draws one Plotly figure per subplot and keeps them drawn:
 *
 *     const grid = renderPlotGrid(el, plotConfig, { time, series }, { overlays });
 *     await grid.update({ results: next });   // new data, same grid
 *     grid.resize();                          // after the container changed size
 *     grid.dispose();                         // purge every figure, remove the grid
 *
 * Per subplot it draws: the chart type, the interpolation, data points, stack
 * groups, every y-axis (left/right, linear/log, min/max/step), reference lines
 * and shaded bands, the NaN strategy, the x-axis clipped to the results' time
 * range — or an x variable instead of time (`subplot.xAxis = { useTime: false,
 * variable }`) — per-series overlay data, injected series transforms, and
 * whatever extra traces the embedder derives. A legend name or a label (a
 * reference line's, a band's) too long for its cell is broken into lines to fit
 * the cell's width, fitted again when a resize changes how it breaks; the hover
 * names a wrapped series on one line. A subplot with
 * nothing to draw shows the empty message; a grid slot with no subplot shows another.
 *
 * A figure is drawn only into a cell that is in the document and has a size.
 * One that is not (a hidden tab, a window not yet shown) is remembered and
 * drawn the next time the grid is resized, which its own ResizeObserver does
 * when the container gets a size.
 *
 * It was PlotPopoutWindow's private renderer; the window now calls this.
 */

import { createRafResizeObserver } from '../ui/utils/raf_resize_observer.js';
import { ensurePlotly } from './plotly_wrapper.js';
import {
    buildTrace, buildYAxisLayout, buildLegendLayout, buildOverlayShapes,
    wrapChartLabel, longestChartLine,
} from './chart_types.js';
import { PLOT_LAYOUTS, applyNanHandling } from './plot_config.js';
import { deriveSeriesTraces } from './series_transforms.js';

/** The figure colours and font. `options.theme` overrides any of them. */
const PLOT_GRID_THEME = Object.freeze({
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
    fontColor: '#cccccc',
    fontSize: 11,
    paperBackground: 'transparent',
    plotBackground: 'transparent',
    gridColor: 'rgba(255,255,255,0.05)',
    lineColor: 'rgba(255,255,255,0.08)',
    tickColor: 'rgba(255,255,255,0.3)',
    zeroLineColor: 'rgba(255,255,255,0.06)',
    hoverBackground: '#1e2228',
    hoverBorder: '#444444',
});

const OVERLAY_DASH = { dashed: 'dash', dotted: 'dot', solid: 'solid' };

/**
 * A character of a figure's font is taken as this many of its em wide: a
 * little over the average of mixed text, so capitals and digits fit too.
 */
const CHAR_EM = 0.6;
/** What an entry takes beside its text: Plotly's symbol and gap (40 px) and the legend's padding. */
const LEGEND_ENTRY_PX = 50;
/** A legend beside the plot takes at most this share of the figure's width. */
const LEGEND_SIDE_SHARE = 1 / 3;
/** No legend entry is broken into lines shorter than this. */
const LEGEND_MIN_CHARS = 12;
/** What the axes' tick labels may add to the margins the layout sets (automargin grows them). */
const AXIS_ALLOWANCE_PX = 24;
/** No label is broken into lines shorter than this. */
const LABEL_MIN_CHARS = 8;
/** A wrapped series' hover value, by hover mode; any other mode shows both coordinates. */
const HOVER_VALUE = { x: '%{y}', 'x unified': '%{y}', y: '%{x}', 'y unified': '%{x}' };
const HOVER_3D = new Set(['scatter3d', 'mesh3d', 'surface']);

/**
 * How many characters a line of a legend entry may have in a figure `width`
 * pixels wide: above or below the plot an entry may be as wide as the plot
 * area (Plotly starts a new row of entries there, and centres the legend on
 * the plot area, so an entry that fits stays inside the figure), beside the
 * plot a third of the figure. Infinity when the figure shows no legend.
 *
 * @param {number} width
 * @param {Object} layout - The figure's layout.
 * @returns {number}
 */
function legendCharBudget(width, layout) {
    if (!layout.showlegend || !(width > 0)) return Infinity;
    const room = layout.legend?.orientation === 'h'
        ? width - (layout.margin?.l ?? 80) - (layout.margin?.r ?? 80) - AXIS_ALLOWANCE_PX
        : width * LEGEND_SIDE_SHARE;
    return Math.max(LEGEND_MIN_CHARS, Math.floor((room - LEGEND_ENTRY_PX) / (legendFontSize(layout) * CHAR_EM)));
}

/** The legend's font size in a figure's layout. */
function legendFontSize(layout) {
    return layout.legend?.font?.size ?? layout.font?.size ?? 12;
}

/**
 * The pixels from annotation `a`'s anchor to the edge of a figure `width`
 * pixels wide that its text runs towards: to the right of a left-anchored
 * label, to the left of a right-anchored one, twice the nearer of the two for
 * a centred one. Where the anchor is comes from `a.x` as a fraction of the
 * plot area (`xref: 'paper'`), or within the x axis's range; without a range
 * the whole plot area.
 *
 * @param {Object} a - A Plotly annotation.
 * @param {number} width
 * @param {Object} layout - The figure's layout (its margins and x range).
 * @returns {number}
 */
function annotationRoom(a, width, layout) {
    const ml = layout.margin?.l ?? 80;
    const mr = layout.margin?.r ?? 80;
    const plot = Math.max(0, width - ml - mr - AXIS_ALLOWANCE_PX);
    let f = null;
    if (a.xref === 'paper') {
        f = a.x ?? 0.5;
    } else {
        const range = layout.xaxis?.range;
        if (typeof a.x === 'number' && range && range[1] !== range[0]) f = (a.x - range[0]) / (range[1] - range[0]);
    }
    if (f === null || !Number.isFinite(f)) return plot;
    f = Math.min(1, Math.max(0, f));
    const left = f * plot + ml;
    const right = (1 - f) * plot + mr;
    if (a.xanchor === 'left') return right;
    if (a.xanchor === 'right') return left;
    return 2 * Math.min(left, right);
}

/**
 * `annotations` with every label (an annotation without an arrow: the
 * reference lines', the bands', an embedder's) too long for its room in a
 * figure `width` pixels wide broken into lines. One that fits is returned as
 * it is.
 *
 * @param {Object[]} annotations
 * @param {number} width
 * @param {Object} layout
 * @returns {Object[]}
 */
function fitAnnotations(annotations, width, layout) {
    return annotations.map((a) => {
        if (typeof a?.text !== 'string' || a.showarrow !== false) return a;
        const size = a.font?.size ?? layout.font?.size ?? 12;
        const pad = 2 * ((a.borderpad ?? 1) + (a.borderwidth ?? 1));
        const maxChars = Math.max(LABEL_MIN_CHARS,
                                  Math.floor((annotationRoom(a, width, layout) - pad) / (size * CHAR_EM)));
        return longestChartLine([a.text]) <= maxChars ? a : { ...a, text: wrapChartLabel(a.text, maxChars) };
    });
}

/**
 * `figure` as drawn in a cell `width` pixels wide: its legend names and its
 * labels fitted to that width, and a `key` of the legend's orientation and
 * every fitted text, which differs exactly when the figure is drawn
 * differently at another width. A legend beside the plot in a cell too narrow
 * for lines of LEGEND_MIN_CHARS in a third of it is drawn above the plot
 * instead: Plotly grows the margin for a legend beside the plot until no plot
 * is left.
 *
 * @param {{ traces: Object[], layout: Object }} figure
 * @param {number} width
 * @returns {{ traces: Object[], layout: Object, key: string }}
 */
function fitFigure(figure, width) {
    let layout = figure.layout;
    const legend = layout.legend;
    if (layout.showlegend && legend?.orientation === 'v' && width > 0
        && (width * LEGEND_SIDE_SHARE - LEGEND_ENTRY_PX) / (legendFontSize(layout) * CHAR_EM) < LEGEND_MIN_CHARS) {
        layout = { ...layout, legend: { ...legend, ...buildLegendLayout('top').legend, font: legend.font } };
    }
    const traces = fitLegendNames(figure.traces, legendCharBudget(width, layout), layout);
    const annotations = Array.isArray(layout.annotations) && width > 0
        ? fitAnnotations(layout.annotations, width, layout)
        : null;
    if (annotations) layout = { ...layout, annotations };
    const key = [layout.legend?.orientation, ...traces.map((t) => t.name), ...(annotations ?? []).map((a) => a?.text)]
        .join('\u0000');
    return { traces, layout, key };
}

/**
 * `traces` with every legend name longer than `maxChars` broken into lines
 * (wrapChartLabel): Plotly does not wrap legend text, so a long name ran past
 * the figure's edge and was cut off. A wrapped trace with no hover of its own
 * names itself on one line in the hover (a `hovertemplate` whose `<extra>` is
 * the name as given), in every hover mode, `'x unified'` included. A trace
 * that is not wrapped is returned as it is.
 *
 * @param {Object[]} traces
 * @param {number} maxChars
 * @param {Object} layout - The figure's layout (its `hovermode`).
 * @returns {Object[]}
 */
function fitLegendNames(traces, maxChars, layout) {
    if (!Number.isFinite(maxChars)) return traces;
    const value = HOVER_VALUE[layout.hovermode] ?? '(%{x}, %{y})';
    return traces.map((trace) => {
        const name = trace.name;
        if (typeof name !== 'string' || trace.showlegend === false || trace.type === 'pie') return trace;
        if (longestChartLine([name]) <= maxChars) return trace;
        const fitted = { ...trace, name: wrapChartLabel(name, maxChars) };
        if (trace.hovertemplate === undefined && trace.hoverinfo === undefined) {
            const shown = HOVER_3D.has(trace.type) ? '(%{x}, %{y}, %{z})' : value;
            fitted.hovertemplate = `${shown}<extra>${name}</extra>`;
        }
        return fitted;
    });
}

/**
 * The default series lookup: `results.series[series._resultKey ?? series.variable]`,
 * then `series.variable`, then the variable without its `prefix.`. Its own x is
 * `series._resultTime` when it has one.
 *
 * @param {Object} series - A series of a subplot's y-axis.
 * @param {{ time?: number[], series?: Object }} results
 * @returns {{ y: number[], x?: number[] } | null}
 */
function resolveSeriesData(series, results) {
    const table = results?.series;
    const variable = series?.variable;
    if (!table || !variable) return null;
    let y = table[series._resultKey ?? variable];
    if (!y && series._resultKey) y = table[variable];
    if (!y) {
        const dot = variable.indexOf('.');
        if (dot >= 0) y = table[variable.slice(dot + 1)];
    }
    if (!y) return null;
    return series._resultTime ? { y, x: series._resultTime } : { y };
}

/**
 * The text of an empty cell: `message` itself when it is a string, else what
 * the function `message(subplot, results, index)` returns. PlotPopoutWindow
 * hands its `emptyMessage` to the grid unchanged, so this is the one place the
 * two forms are told apart.
 */
function emptyMessageFor(message, subplot, results, index) {
    return typeof message === 'function' ? message(subplot, results, index) : message;
}

/**
 * Draw `plotConfig` into `container`.
 *
 * @param {HTMLElement} container - Receives one `.twm-plot-grid` child.
 * @param {{ layout: string, subplots: Object[] }} plotConfig - Already migrated (migrateData).
 * @param {{ time: number[], series: Object } | null} results - null: every subplot is empty.
 * @param {Object} [options]
 * @param {Function} [options.resolveSeries] - `(series, results, subplot) => { y, x? } | null`;
 *        default resolveSeriesData. Also resolves the x variable, as `{ variable }`.
 * @param {Function} [options.resolveConstant] - `(name) => number | undefined`: the value of a
 *        reference line that stores a name (renderPlotConfigEditor's `constantsProvider`),
 *        asked at each draw. A name it does not know draws no line; so does any name without it.
 * @param {Object} [options.overlays] - `{ [series.id]: { years, values } }`, drawn for
 *        every series with an `overlay` description.
 * @param {Object} [options.seriesTransforms] - `{ [id]: transform }` (series_transforms.js).
 *        Each runs on every line/scatter trace (overlays included, derived traces
 *        not) as `run(y, params, { series, subplot, results, resolveSeries })`,
 *        `series` being the subplot's series entry the trace was drawn from, or
 *        null for an overlay.
 * @param {Function} [options.onTransformError] - `({ transformId, traceName, error })`.
 * @param {Function} [options.derivedTraces] - `(traces, subplot, { results, index })
 *        => trace[] | Promise<trace[]>`: extra traces appended to a subplot's figure.
 * @param {Set<string>|string[]} [options.hiddenSeries] - Trace names not to draw.
 * @param {Object} [options.theme] - Overrides for PLOT_GRID_THEME.
 * @param {boolean} [options.alwaysShowLegend=false] - Draw a 'hidden' legend at the top.
 * @param {Object} [options.layout] - Plotly layout fields merged over every figure's.
 * @param {string|Function} [options.emptyMessage='No data yet.'] - What a subplot
 *        with nothing to draw says: a string, or `(subplot, results, index) => string`,
 *        called each time a cell is drawn empty (first draw, every `update()`, a
 *        failed draw) with the grid's results at that moment (as the grid was given them, so null or undefined when there are none).
 * @param {string} [options.noSubplotMessage='No subplot configured.']
 * @param {Function} [options.onError] - `({ index, error })` when drawing a subplot
 *        throws — on an update or on a resize that draws a deferred one; that
 *        subplot shows the empty message.
 * @returns {{ update: Function, resize: Function, dispose: Function,
 *             readonly charts: HTMLElement[], readonly plotted: HTMLElement[] }}
 */
function renderPlotGrid(container, plotConfig, results, options = {}) {
    const opts = {
        resolveSeries: resolveSeriesData,
        overlays: null,
        seriesTransforms: null,
        onTransformError: null,
        derivedTraces: null,
        hiddenSeries: null,
        theme: null,
        alwaysShowLegend: false,
        layout: null,
        emptyMessage: 'No data yet.',
        noSubplotMessage: 'No subplot configured.',
        onError: null,
        ...options,
    };
    let config = plotConfig;
    let data = results;
    let disposed = false;
    let cells = [];
    let cellsLayout = null;
    /**
     * Per cell: the latest draw's token, from one grid-wide counter that a
     * rebuild never resets, so no draw for an old layout shares a token with a
     * draw for the new one. An older draw that resolves late is dropped.
     */
    let tokens = [];
    let lastToken = 0;
    /** Cells whose last draw found them detached or zero-size. */
    const deferred = new Set();

    const grid = document.createElement('div');
    grid.className = 'twm-plot-grid';
    container.appendChild(grid);

    const observer = createRafResizeObserver(() => resize());
    observer.observe(grid);

    /** Cells Plotly has been asked to draw into: every one of them is purged. */
    const plotted = new Set();
    /** Cells whose latest Plotly draw finished: they show a figure. */
    const drawn = new Set();
    /** Per cell asked to show a figure: that figure, the key of its texts as fitted (fitFigure) and the draw's token. */
    const painted = new Map();
    const hasPlot = (cell) => plotted.has(cell);
    const purgeCell = (cell) => {
        drawn.delete(cell);
        painted.delete(cell);
        if (!plotted.delete(cell)) return;
        try { globalThis.Plotly?.purge(cell); } catch (_) { /* already gone */ }
    };

    function buildCells() {
        for (const cell of cells) purgeCell(cell);
        grid.replaceChildren();
        const tmpl = PLOT_LAYOUTS[config?.layout] || PLOT_LAYOUTS['1x1'];
        grid.style.gridTemplateColumns = tmpl.grid.columns;
        grid.style.gridTemplateRows = tmpl.grid.rows;
        cells = tmpl.areas.map(({ gridArea }) => {
            const cell = document.createElement('div');
            cell.className = 'twm-plot-grid__cell';
            cell.style.gridArea = gridArea;
            grid.appendChild(cell);
            return cell;
        });
        cellsLayout = config?.layout;
        tokens = cells.map(() => 0);
        deferred.clear();
    }

    /** Show the empty message in cell `index`, for its subplot and the current results. */
    function showEmpty(cell, index) {
        showMessage(cell, emptyMessageFor(opts.emptyMessage, config?.subplots?.[index] ?? null, data, index));
    }

    function showMessage(cell, text) {
        purgeCell(cell);
        const msg = document.createElement('div');
        msg.className = 'twm-plot-no-data';
        msg.textContent = text;
        cell.replaceChildren(msg);
    }

    const theme = () => ({ ...PLOT_GRID_THEME, ...(opts.theme ?? {}) });
    const isHidden = (name) => {
        const h = opts.hiddenSeries;
        if (!h) return false;
        return typeof h.has === 'function' ? h.has(name) : h.includes(name);
    };
    const axisColours = (t) => ({
        gridcolor: t.gridColor, linecolor: t.lineColor,
        tickcolor: t.tickColor, zerolinecolor: t.zeroLineColor,
    });

    /** The traces and layout of one subplot, or null when it has nothing to draw. */
    async function buildFigure(sp, index) {
        // No results is the empty message, whatever is hidden.
        if (!data) return null;
        const t = theme();
        const time = data.time ?? [];
        const traces = [];
        const layoutAxes = {};
        const yRefByAxisId = {};
        /** The subplot's own series (overlays and derived traces aside), and how many are hidden. */
        let ownCount = 0;
        let hiddenCount = 0;
        /** The x extent of the overlays drawn ([min, max] of their finite years), or null: the x range widens to it. */
        let overlayExtent = null;
        /** Each trace drawn from one of the subplot's series, to that series (a transform's context.series). */
        const seriesByTrace = new Map();

        const useX = sp.xAxis && sp.xAxis.useTime === false && sp.xAxis.variable;
        const xData = useX
            ? (opts.resolveSeries({ variable: sp.xAxis.variable }, data, sp)?.y ?? time)
            : time;

        const yAxes = sp.yAxes ?? [];
        yAxes.forEach((axis, a) => {
            const n = a + 1;
            const yAxisKey = n === 1 ? 'yaxis' : `yaxis${n}`;
            const yRef = n === 1 ? 'y' : `y${n}`;
            if (axis.id) yRefByAxisId[axis.id] = yRef;

            layoutAxes[yAxisKey] = {
                ...buildYAxisLayout({
                    axisId: yAxisKey,
                    title: axis.label || '',
                    position: axis.position || 'left',
                    scaleType: axis.scale || 'linear',
                    min: axis.min ?? null,
                    max: axis.max ?? null,
                    step: axis.step ?? null,
                    showGrid: yAxes.length === 1,
                    axisPosition: n > 1 ? (axis.position === 'right' ? 1 : 0) : null,
                }),
                ...axisColours(t),
            };

            for (const s of axis.series ?? []) {
                if (!s.variable) continue;
                const label = s.label || s.variable;
                ownCount++;
                if (isHidden(label)) { hiddenCount++; continue; }

                const resolved = opts.resolveSeries(s, data, sp);
                if (!resolved?.y) continue;
                const x = resolved.x ?? xData;
                const y = Array.isArray(resolved.y)
                    ? applyNanHandling(resolved.y, sp.nanHandling ?? 'gap', x)
                    : resolved.y;
                const trace = buildTrace({
                    chartType: sp.chartType || 'line',
                    x,
                    y,
                    name: label,
                    color: s.color,
                    lineWidth: s.lineWidth ?? 2,
                    lineStyle: s.lineStyle ?? 'solid',
                    interpolation: sp.interpolation ?? 'linear',
                    yAxisId: yRef,
                    showMarkers: sp.showDataPoints ?? false,
                    stackGroup: s.stackGroup ?? null,
                });
                traces.push(trace);
                seriesByTrace.set(trace, s);

                const overlay = s.overlay ? opts.overlays?.[s.id] : null;
                if (!overlay?.years?.length) continue;
                const ov = s.overlay;
                const ovLabel = ov.label || `${label} (actual)`;
                if (isHidden(ovLabel)) continue;
                const ovTrace = {
                    type: 'scatter',
                    mode: ov.mode || 'markers+lines',
                    x: overlay.years,
                    y: overlay.values,
                    name: ovLabel,
                    yaxis: yRef === 'y' ? undefined : yRef,
                    line: { color: ov.color || s.color, width: ov.lineWidth ?? 2,
                            dash: OVERLAY_DASH[ov.lineStyle] || 'dash' },
                    marker: { color: ov.color || s.color, size: 4, symbol: 'circle' },
                    showlegend: true,
                };
                // A stacked-percent chart stacks its overlays too, in a group of
                // their own, so they read on the same 0..1 scale.
                if ((sp.chartType || 'line') === 'area-stacked') {
                    ovTrace.stackgroup = `overlay-${yRef}`;
                    ovTrace.groupnorm = 'fraction';
                    ovTrace.fill = 'none';
                    ovTrace.mode = 'lines';
                }
                traces.push(ovTrace);
                for (const yr of overlay.years) {
                    if (typeof yr !== 'number' || !Number.isFinite(yr)) continue;
                    overlayExtent = overlayExtent
                        ? [Math.min(overlayExtent[0], yr), Math.max(overlayExtent[1], yr)]
                        : [yr, yr];
                }
            }
        });

        traces.push(...await deriveSeriesTraces(traces, sp, opts.seriesTransforms, {
            onError: opts.onTransformError ?? undefined,
            seriesOf: (trace) => seriesByTrace.get(trace) ?? null,
            results: data,
            resolveSeries: opts.resolveSeries,
        }));
        if (opts.derivedTraces) {
            const extra = await opts.derivedTraces(traces, sp, { results: data, index });
            if (Array.isArray(extra)) traces.push(...extra);
        }

        // Nothing to draw is the empty message — unless there are results and
        // every one of the subplot's own series is hidden: then it is an empty
        // figure, so the viewer can tell "hidden" from "no data".
        if (traces.length === 0 && !(ownCount > 0 && hiddenCount === ownCount)) return null;

        const legendPos = opts.alwaysShowLegend && (sp.legendPosition ?? 'hidden') === 'hidden'
            ? 'top' : (sp.legendPosition ?? 'hidden');
        // The x axis is clipped to the run's time range, widened to the drawn
        // overlays' years: observed data before (or after) the run is shown.
        let xRange = !useX && time.length >= 2 ? [time[0], time[time.length - 1]] : undefined;
        if (xRange && overlayExtent) {
            xRange = [Math.min(xRange[0], overlayExtent[0]), Math.max(xRange[1], overlayExtent[1])];
        }
        const { shapes, annotations } = buildOverlayShapes({
            referenceLines: (sp.referenceLines ?? []).map((line) => (typeof line.value === 'string'
                ? { ...line, value: opts.resolveConstant?.(line.value) }
                : line)),
            shadedBands: sp.shadedBands,
            yRefByAxisId,
        });
        const font = { family: t.fontFamily, color: t.fontColor };

        const layout = {
            ...layoutAxes,
            ...(shapes.length ? { shapes } : {}),
            ...(annotations.length ? { annotations } : {}),
            xaxis: {
                ...(useX ? { title: { text: sp.xAxis.label || sp.xAxis.variable, font: { size: t.fontSize } } } : {}),
                ...axisColours(t),
                automargin: true,
                ...(xRange ? { range: xRange } : {}),
            },
            ...buildLegendLayout(legendPos),
            paper_bgcolor: t.paperBackground,
            plot_bgcolor: t.plotBackground,
            font: { ...font, size: t.fontSize },
            margin: { t: 10, r: 20, b: 40, l: 50 },
            hoverlabel: { bgcolor: t.hoverBackground, bordercolor: t.hoverBorder, font },
            ...(opts.layout ?? {}),
        };
        return { traces, layout };
    }

    const hasSize = (cell) => cell.isConnected && cell.offsetWidth > 0 && cell.offsetHeight > 0;

    /** Draw cell `index`; resolves true when a figure was drawn. */
    async function drawCell(index) {
        const cell = cells[index];
        const token = ++lastToken;
        tokens[index] = token;
        const current = () => !disposed && cells[index] === cell && tokens[index] === token;
        const sp = config?.subplots?.[index];
        if (!sp) { showMessage(cell, opts.noSubplotMessage); deferred.delete(index); return false; }

        const figure = await buildFigure(sp, index);
        if (!current()) return false;
        if (!figure) { showEmpty(cell, index); deferred.delete(index); return false; }

        if (!hasSize(cell)) { deferred.add(index); return false; }
        deferred.delete(index);
        return paint(index, figure, token);
    }

    /**
     * Draw `figure` into cell `index`, its legend names and labels fitted to
     * the cell's width, as the draw `token`; resolves true when it was drawn.
     * A newer draw of the cell wins.
     */
    async function paint(index, figure, token) {
        const cell = cells[index];
        const current = () => !disposed && cells[index] === cell && tokens[index] === token;
        const Plotly = await ensurePlotly();
        if (!current()) return false;
        if (!hasPlot(cell)) cell.replaceChildren();
        plotted.add(cell);
        const fitted = fitFigure(figure, cell.offsetWidth);
        painted.set(cell, { figure, key: fitted.key, token });
        try {
            await Plotly.react(cell, fitted.traces, fitted.layout, { responsive: true, displayModeBar: false });
            if (plotted.has(cell)) drawn.add(cell);
            return true;
        } catch (_) {
            // Plotly throws when the cell is removed mid-draw.
            drawn.delete(cell);
            return false;
        }
    }

    /**
     * Draw cell `index`'s figure again, as it is, for a width at which its
     * texts are fitted differently. Not while a newer draw of the cell is on
     * its way: that one fits them to the width it finds.
     */
    function refit(index) {
        const shown = painted.get(cells[index]);
        if (!shown || shown.token !== tokens[index]) return;
        const token = ++lastToken;
        tokens[index] = token;
        paint(index, shown.figure, token).catch(() => {});
    }

    /**
     * Draw cell `index` and handle a failure: a resolver, transform or
     * derivedTraces that throws costs its own subplot only — it shows the empty
     * message and is reported to onError. Every draw goes through here.
     */
    function drawCellOrFail(index) {
        const cell = cells[index];
        const pending = drawCell(index);
        const token = tokens[index];
        return pending.catch((error) => {
            if (disposed) return false;
            if (cells[index] === cell && tokens[index] === token) {
                deferred.delete(index);
                showEmpty(cell, index);
            }
            opts.onError?.({ index, error });
            return false;
        });
    }

    async function drawAll() {
        if (disposed) return false;
        if (cellsLayout !== config?.layout || !cells.length) buildCells();
        const results = await Promise.all(cells.map((_, i) => drawCellOrFail(i)));
        return results.some(Boolean);
    }

    /**
     * Change what is drawn and redraw. Every field is optional; omitted ones keep
     * their value. A config with another layout rebuilds the grid.
     *
     * @param {Object} [patch]
     * @param {Object} [patch.plotConfig]
     * @param {Object|null} [patch.results]
     * @param {Object|null} [patch.overlays]
     * @param {Set<string>|string[]|null} [patch.hiddenSeries]
     * @returns {Promise<boolean>} whether any figure was drawn
     */
    function update(patch = {}) {
        if (disposed) return Promise.resolve(false);
        if ('plotConfig' in patch) config = patch.plotConfig;
        if ('results' in patch) data = patch.results;
        if ('overlays' in patch) opts.overlays = patch.overlays;
        if ('hiddenSeries' in patch) opts.hiddenSeries = patch.hiddenSeries;
        return drawAll();
    }

    /**
     * Fit every figure to its cell, and draw the ones that were waiting for a
     * size. A figure whose legend names or labels would break differently at
     * the new width is drawn again with them refitted.
     */
    function resize() {
        if (disposed) return;
        for (const index of [...deferred]) {
            if (!hasSize(cells[index])) continue;
            drawCellOrFail(index);
        }
        const Plotly = globalThis.Plotly;
        cells.forEach((cell, index) => {
            if (!hasPlot(cell) || !hasSize(cell)) return;
            const shown = painted.get(cell);
            if (shown && fitFigure(shown.figure, cell.offsetWidth).key !== shown.key) {
                refit(index);
            } else if (Plotly?.Plots?.resize) {
                Promise.resolve().then(() => Plotly.Plots.resize(cell)).catch(() => {});
            }
        });
    }

    /** Purge every figure and remove the grid. Later calls do nothing. */
    function dispose() {
        if (disposed) return;
        disposed = true;
        observer.disconnect();
        for (const cell of cells) purgeCell(cell);
        cells = [];
        deferred.clear();
        grid.remove();
    }

    drawAll();

    return {
        update,
        resize,
        dispose,
        /** The cells, one per grid slot, in layout order. */
        get charts() { return [...cells]; },
        /**
         * The cells that show a figure now, in layout order — however it got
         * there: an update, or a deferred draw on a resize.
         */
        get plotted() { return cells.filter((cell) => drawn.has(cell)); },
    };
}

export { renderPlotGrid, resolveSeriesData, PLOT_GRID_THEME };
