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
 * whatever extra traces the embedder derives. A subplot with nothing to draw
 * shows the empty message; a grid slot with no subplot shows another.
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
import { buildTrace, buildYAxisLayout, buildLegendLayout, buildOverlayShapes } from './chart_types.js';
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
 *        failed draw) with the grid's results at that moment (null when there are none).
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
    const hasPlot = (cell) => plotted.has(cell);
    const purgeCell = (cell) => {
        drawn.delete(cell);
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
        const xRange = !useX && time.length >= 2 ? [time[0], time[time.length - 1]] : undefined;
        const { shapes, annotations } = buildOverlayShapes({
            referenceLines: sp.referenceLines,
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

        const Plotly = await ensurePlotly();
        if (!current()) return false;
        if (!hasPlot(cell)) cell.replaceChildren();
        plotted.add(cell);
        try {
            await Plotly.react(cell, figure.traces, figure.layout, { responsive: true, displayModeBar: false });
            if (plotted.has(cell)) drawn.add(cell);
            return true;
        } catch (_) {
            // Plotly throws when the cell is removed mid-draw.
            drawn.delete(cell);
            return false;
        }
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

    /** Fit every figure to its cell, and draw the ones that were waiting for a size. */
    function resize() {
        if (disposed) return;
        for (const index of [...deferred]) {
            if (!hasSize(cells[index])) continue;
            drawCellOrFail(index);
        }
        const Plotly = globalThis.Plotly;
        if (!Plotly?.Plots?.resize) return;
        for (const cell of cells) {
            if (hasPlot(cell) && hasSize(cell)) {
                Promise.resolve().then(() => Plotly.Plots.resize(cell)).catch(() => {});
            }
        }
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
