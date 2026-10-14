/**
 * chart_tiles.js — a CHART tile and a KPI tile for a `TileGrid`.
 *
 * Lifted from Tables' dashboard widgets (`tables.chart`, `tables.kpi`), with the
 * Tables half left behind: no binding, no Dataset, no column types, no currency
 * refusals. A tile here is handed ALREADY-COMPUTED series through `setData()`;
 * turning records into series is the embedder's job, because only the embedder
 * knows what a record is.
 *
 *     import { registerChartTiles } from '@flexdesk/tiles';
 *     registerChartTiles();                       // idempotent; nothing registers at import
 *     const tile = grid.addTile('flexdesk.chart', {x: 0, y: 0, w: 6, h: 4},
 *                               { chart_type: 'line', title: 'Burndown', unit: 'pts' });
 *     tile.setData({
 *         series: [
 *             { x: days, y: remaining, name: 'Remaining', interpolation: 'step' },
 *             { x: days, y: ideal, name: 'Ideal', lineStyle: 'dashed' },
 *         ],
 *         markers: [{ x: today, label: 'Today' }],
 *         note: 'Points from 41 stories',
 *     });
 *
 * ══ THE DATA A CHART TILE TAKES ═════════════════════════════════════════
 *
 *   { series: [{x, y, name, color?, lineStyle?, interpolation?, line?, customdata?}],
 *     markers?: [{x, label?, color?, lineStyle?}],   vertical lines (buildOverlayShapes)
 *     referenceLines?: [{value, label?, …}],          horizontal lines, passed through
 *     xKind?: 'date' | 'number' | 'category',         inferred from x when absent
 *     note?: string }                                  a line under the figure
 *
 * Shorthands: an ARRAY is `{series: array}`; a single `{x, y}`, `{labels, values}`
 * or `{values}` object is one series. Pie, donut and funnel read `labels`/`values`
 * (or `x`/`y`) of the first series; a histogram reads `values` (or `y`/`x`) of
 * each. `line` on a series is merged over the built `trace.line`, so
 * `line: {shape: 'hv', dash: 'dash'}` is as good as `interpolation`/`lineStyle`.
 *
 * ══ WHY THE DRAW HAS ITS OWN TRY/CATCH, AND A SEQUENCE ══════════════════
 *
 * The draw is `await ensurePlotly()` deep, so `render()` returns long before
 * anything can throw. `_draw` therefore reports its own failures (Plotly
 * absent included — a clear error state, never an unhandled rejection), and
 * `_drawSeq` discards a draw that lands after a newer one.
 *
 * EVERY STATE CHANGE INVALIDATES THE FIGURE. `showEmpty`, `showLoading` and
 * `showError` replace the content with `innerHTML`, which detaches the Plotly div
 * without telling Plotly. So each of them here first purges the figure, drops the
 * reference, marks it not drawn, and bumps `_drawSeq` — and a draw still in
 * flight when `setData(empty)` arrives finds itself stale and purges its own
 * figure instead of marking it drawn.
 *
 * `scrollZoom` is off per call: a tile sits on a scrolling board, and the wheel
 * over a chart must scroll past it rather than zoom it.
 */

import { TileBase } from './tile_base.js';
import { registerWidget, getWidget } from './tile_registry.js';
import {
    buildTrace, buildXAxisLayout, buildYAxisLayout, buildLegendLayout,
    buildHistogramTrace, buildOverlayShapes,
} from '../charts/chart_types.js';
import {
    createChart, resize as resizePlot, purge, ensurePlotly, getSeriesColor,
} from '../charts/plotly_wrapper.js';
import { strideDownsampleShared } from '../charts/downsample.js';

/** Part-of-whole types: one series, no axes. */
const CATEGORICAL_ONLY = new Set(['pie', 'donut', 'funnel']);

/** Every type the chart tile draws. */
export const CHART_TILE_TYPES = Object.freeze([
    { value: 'line', label: 'Line' },
    { value: 'bar', label: 'Bar' },
    { value: 'bar-stacked', label: 'Bar (stacked)' },
    { value: 'bar-horizontal', label: 'Bar (horizontal)' },
    { value: 'area', label: 'Area' },
    { value: 'area-stacked', label: 'Area (stacked %)' },
    { value: 'scatter', label: 'Scatter' },
    { value: 'pie', label: 'Pie' },
    { value: 'donut', label: 'Donut' },
    { value: 'funnel', label: 'Funnel' },
    { value: 'histogram', label: 'Histogram' },
]);

const AXIS_CHARTS = ['bar', 'bar-stacked', 'bar-horizontal', 'line', 'area', 'area-stacked', 'scatter'];

/**
 * THE DISPLAY SETTINGS EACH CHART TYPE READS, and the only place that says so:
 * the config schema shows a setting for exactly these types and the draw reads
 * it for no others, so a hidden setting a config still carries cannot go on
 * changing the figure unseen.
 */
const READS = Object.freeze({
    legend: new Set([...AXIS_CHARTS, 'pie', 'donut', 'histogram']),
    axis_titles: new Set([...AXIS_CHARTS, 'histogram']),
    y_scale: new Set(['bar', 'bar-horizontal', 'line', 'area', 'scatter']),
    y_range: new Set(['bar', 'bar-stacked', 'bar-horizontal', 'line', 'area', 'scatter']),
    show_markers: new Set(['line', 'area', 'area-stacked']),
});

/** Room for the tile's own header, and none for a Plotly title never set. */
const TILE_MARGIN = { l: 48, r: 16, t: 8, b: 36 };

/** The point count above which a continuous series is decimated — a rendering
 *  budget, not a data limit. */
const MAX_POINTS = 2000;

/**
 * Normalise what `setData` was handed into `{series, markers, referenceLines,
 * xKind, note}`, or `null` when there is nothing to draw. Exported for tests
 * and for an embedder that wants to know what the tile will make of its data.
 */
export function normalizeChartData(data) {
    if (data == null) return null;
    let d = data;
    if (Array.isArray(d)) d = { series: d };
    else if (typeof d !== 'object') return null;
    else if (!Array.isArray(d.series)) {
        const single = ['x', 'y', 'labels', 'values'].some((k) => Array.isArray(d[k]));
        d = { ...d, series: single ? [d] : [] };
    }
    const series = d.series.filter((s) => s && pointCount(s) > 0);
    if (!series.length) return null;
    return {
        series,
        markers: Array.isArray(d.markers) ? d.markers : [],
        referenceLines: Array.isArray(d.referenceLines) ? d.referenceLines : [],
        xKind: d.xKind || null,
        note: typeof d.note === 'string' ? d.note : '',
    };
}

function pointCount(s) {
    for (const k of ['y', 'values', 'x', 'labels']) {
        if (Array.isArray(s[k])) return s[k].length;
    }
    return 0;
}

export class ChartTile extends TileBase {
    static TYPE = 'flexdesk.chart';
    static TITLE = 'Chart';
    static ICON = 'insert_chart';
    static DESCRIPTION = 'Line, bar, area, pie, donut, funnel or histogram over series you supply.';
    static DEFAULT_SIZE = { w: 6, h: 4 };
    static SIZE_CONSTRAINTS = { minW: 3, minH: 3, maxW: 12, maxH: 10 };

    /**
     * @param {Object} options - TileBase's, plus:
     * @param {Function} [options.onPointClick] - `({customdata, point, tile})`
     *        on a click on a mark. Also assignable later as `tile.onPointClick`.
     */
    constructor(options = {}) {
        super(options);
        this.onPointClick = typeof options.onPointClick === 'function' ? options.onPointClick : null;
        this._plotEl = null;
        this._drawn = false;
        this._drawSeq = 0;
    }

    /** Pure and static-only — it runs inside `TileBase`'s constructor. */
    getDefaultConfig() {
        return {
            title: '',
            chart_type: 'line',
            unit: '',
            legend: 'bottom',
            x_title: '',
            y_title: '',
            y_scale: 'linear',
            y_min: null,
            y_max: null,
            show_markers: false,
            max_points: MAX_POINTS,
        };
    }

    getConfigSchema() {
        return {
            fields: [
                { name: 'title', type: 'text', label: 'Tile title' },
                { name: 'chart_type', type: 'select', label: 'Chart type',
                  options: CHART_TILE_TYPES.map((o) => ({ ...o })) },
                { name: 'unit', type: 'text', label: 'Unit',
                  help: 'Shown with the value axis title, e.g. "pts" or "h".' },
                { name: 'legend', type: 'select', label: 'Legend',
                  visibleWhen: { field: 'chart_type', in: [...READS.legend] },
                  options: [
                      { value: 'bottom', label: 'Below' },
                      { value: 'top', label: 'Above' },
                      { value: 'right', label: 'Right' },
                      { value: 'left', label: 'Left' },
                      { value: 'hidden', label: 'None' },
                  ] },
                { name: 'x_title', type: 'text', label: 'X axis title',
                  visibleWhen: { field: 'chart_type', in: [...READS.axis_titles] } },
                { name: 'y_title', type: 'text', label: 'Y axis title',
                  visibleWhen: { field: 'chart_type', in: [...READS.axis_titles] } },
                { name: 'y_scale', type: 'select', label: 'Y scale',
                  visibleWhen: { field: 'chart_type', in: [...READS.y_scale] },
                  options: [{ value: 'linear', label: 'Linear' }, { value: 'log', label: 'Logarithmic' }] },
                { name: 'y_min', type: 'number', label: 'Y minimum',
                  visibleWhen: { field: 'chart_type', in: [...READS.y_range] } },
                { name: 'y_max', type: 'number', label: 'Y maximum',
                  visibleWhen: { field: 'chart_type', in: [...READS.y_range] } },
                { name: 'show_markers', type: 'checkbox', label: 'Show point markers',
                  visibleWhen: { field: 'chart_type', in: [...READS.show_markers] } },
            ],
        };
    }

    mount(container) {
        super.mount(container);
        applyTitle(this);
    }

    /**
     * `null` here is "the grid has no data", not "clear this tile": TileGrid's
     * config save calls `update(grid.data, newConfig)`, and a grid whose tiles
     * are fed one by one through `setData` has `grid.data === null` — passed on,
     * it would drop the tile's series and skip the redraw in the new chart type.
     * `setData(null)` is how a tile is cleared.
     */
    update(data, config) {
        super.update(data === null ? undefined : data, config);
        if (config) applyTitle(this);
    }

    /**
     * Hand this tile its series. Unlike `update()`, an empty or null value is
     * drawn — as the empty state — rather than ignored.
     */
    setData(data) {
        if (this._disposed) return;
        this.data = data ?? null;
        if (this.contentElement) this.render(this.data);
    }

    /**
     * Kick off the draw and return. Deliberately not `async`: nothing awaits
     * `render`, so a returned promise would be a rejection nobody catches.
     */
    render(data) {
        this._draw(data);
    }

    /** One relayout when a resize settles; nothing while a draw is in flight. */
    onResize() {
        if (!this._plotEl || !this._drawn) return;
        resizePlot(this._plotEl).catch(() => {});
    }

    menuItems() {
        return [{ action: 'download-png', label: 'Download PNG', icon: 'image' }];
    }

    _onMenuAction(action) {
        if (action === 'download-png') this._downloadPng();
    }

    // ── the three states: each one invalidates the figure ───────────────

    showLoading() {
        this._invalidate();
        super.showLoading();
    }

    showEmpty(message) {
        this._invalidate();
        super.showEmpty(message);
    }

    showError(message) {
        this._invalidate();
        super.showError(message);
    }

    /** Release the figure BEFORE the element goes — `TileBase.dispose` nulls it. */
    dispose() {
        this._invalidate();
        super.dispose();
    }

    /** Any draw in flight is now stale, and the figure on screen is released. */
    _invalidate() {
        this._drawSeq += 1;
        this._releasePlot();
    }

    /** Hand the current figure back to Plotly and forget it. Idempotent, and
     *  not awaited: a rejected purge (Plotly absent, already purged) must not
     *  surface as an unhandled rejection. */
    _releasePlot() {
        const el = this._plotEl;
        this._plotEl = null;
        this._drawn = false;
        if (el) purge(el).catch(() => {});
    }

    // ── the draw ────────────────────────────────────────────────────────

    async _draw(data) {
        this._drawSeq += 1;
        const seq = this._drawSeq;
        const content = this.contentElement;
        if (!content) return;

        // Every path below replaces the content, so the figure there now is
        // about to be orphaned whichever way this goes.
        this._releasePlot();

        const norm = normalizeChartData(data);
        if (!norm) { this.showEmpty('No data to show.'); return; }

        let plan;
        try {
            plan = this._plan(norm);
        } catch (err) {
            this._failed(err);
            return;
        }
        if (!plan) return;                  // `_plan` has already said why

        const host = document.createElement('div');
        host.className = 'fd-chart-tile';
        const parts = [host];
        if (norm.note) {
            const note = document.createElement('div');
            note.className = 'fd-chart-tile__note';
            note.setAttribute('role', 'note');
            note.textContent = norm.note;
            note.title = norm.note;
            parts.push(note);
        }
        content.replaceChildren(...parts);
        this._plotEl = host;
        this._drawn = false;

        try {
            await createChart(host, plan.traces, plan.layout, {
                scrollZoom: false,
                displayModeBar: false,
                responsive: true,
            });
        } catch (err) {
            if (this._disposed || seq !== this._drawSeq) return;
            this._failed(err);
            return;
        }
        if (this._disposed || seq !== this._drawSeq) {
            // A newer draw or a state change has already replaced the content;
            // this figure is detached, and purging it releases its listeners.
            purge(host).catch(() => {});
            return;
        }
        this._drawn = true;
        this._wireClick(host);
    }

    /** Plotly's click, reduced to the point's own `customdata`. A pie's point
     *  carries its slice index as `pointNumber` (older builds: `pointIndex`),
     *  and its `customdata` is read off the trace by that index. */
    _wireClick(host) {
        if (typeof host.on !== 'function') return;
        host.on('plotly_click', (ev) => {
            const point = ev?.points?.[0];
            if (!point || typeof this.onPointClick !== 'function') return;
            const trace = point.data || {};
            let customdata = point.customdata;
            if (trace.type === 'pie' || customdata === undefined) {
                const i = point.pointNumber ?? point.pointIndex;
                if (Array.isArray(trace.customdata) && i != null) customdata = trace.customdata[i];
            }
            try {
                this.onPointClick({ customdata, point, tile: this });
            } catch (err) {
                console.error('[ChartTile] onPointClick threw:', err);
            }
        });
    }

    /**
     * Turn normalised data into `{traces, layout}`, or put the tile in the
     * empty state and answer `null`.
     */
    _plan(norm) {
        const type = this.config.chart_type || 'line';
        const { series } = norm;

        if (CATEGORICAL_ONLY.has(type)) {
            // ONE series. A pie of three is three pies drawn on top of one another.
            const s = series[0];
            const labels = s.labels ?? s.x ?? [];
            const values = s.values ?? s.y ?? [];
            const trace = buildTrace({
                chartType: type,
                x: labels.map((v) => (v === null || v === undefined ? '—' : String(v))),
                y: values,
                name: s.name || '',
                colors: s.colors || null,
            });
            if (Array.isArray(s.customdata)) trace.customdata = s.customdata;
            return {
                traces: [trace],
                layout: {
                    margin: type === 'funnel' ? { ...TILE_MARGIN, l: 96 } : TILE_MARGIN,
                    ...this._legend(),
                },
            };
        }

        if (type === 'histogram') {
            const traces = series.map((s, i) => {
                const raw = s.values ?? s.y ?? s.x ?? [];
                const trace = {
                    ...buildHistogramTrace({
                        x: raw.map(toNumber).filter((v) => v !== null),
                        color: s.color || getSeriesColor(i),
                        name: s.name || `Series ${i + 1}`,
                        ...(s.nbins ? { nbins: s.nbins } : {}),
                    }),
                    opacity: series.length > 1 ? 0.7 : 1,
                };
                return trace;
            });
            return {
                traces,
                layout: {
                    margin: TILE_MARGIN, ...this._legend(), barmode: 'overlay',
                    xaxis: buildXAxisLayout({ title: this.config.x_title || '' }),
                    yaxis: buildYAxisLayout({ axisId: 'yaxis', title: this.config.y_title || 'Count' }),
                },
            };
        }

        const kind = norm.xKind || inferXKind(series);
        const base = type.startsWith('bar') ? 'bar' : type;
        const target = Number(this.config.max_points) || MAX_POINTS;
        const showMarkers = READS.show_markers.has(type) && this.config.show_markers === true;

        const traces = series.map((s, i) => {
            let x = Array.isArray(s.x) ? s.x : (s.y || []).map((_, j) => j);
            let y = Array.isArray(s.y) ? s.y : (s.values || []);
            let customdata = Array.isArray(s.customdata) ? s.customdata : null;
            if (kind !== 'category') {
                const cut = strideDownsampleShared(x, customdata ? { y, customdata } : { y }, target);
                x = cut.time;
                y = cut.series.y;
                if (customdata) customdata = cut.series.customdata;
            }
            const trace = buildTrace({
                chartType: base,
                x,
                y,
                name: s.name || `Series ${i + 1}`,
                color: s.color || null,
                lineStyle: s.lineStyle || 'solid',
                interpolation: s.interpolation || 'linear',
                ...(s.lineWidth ? { lineWidth: s.lineWidth } : {}),
                seriesIndex: i,
                showMarkers,
            });
            if (s.line && typeof s.line === 'object') trace.line = { ...(trace.line || {}), ...s.line };
            if (customdata) trace.customdata = customdata;
            return trace;
        });

        const xaxis = buildXAxisLayout({ title: this.config.x_title || '', scaleType: 'linear' });
        if (kind !== 'number') xaxis.type = kind === 'date' ? 'date' : 'category';

        const log = READS.y_scale.has(type) && this.config.y_scale === 'log';
        const yaxis = buildYAxisLayout({
            axisId: 'yaxis',
            title: this._valueTitle(series),
            scaleType: log ? 'log' : 'linear',
            min: READS.y_range.has(type) ? axisBound(this.config.y_min, log) : null,
            max: READS.y_range.has(type) ? axisBound(this.config.y_max, log) : null,
        });

        const layout = { margin: TILE_MARGIN, xaxis, yaxis, ...this._legend() };
        if (type === 'bar') layout.barmode = 'group';
        if (type === 'bar-stacked') layout.barmode = 'stack';
        if (type === 'bar-horizontal') {
            // Swap the DATA and the AXES together; swapping one draws NaN.
            layout.barmode = 'group';
            for (const t of traces) { [t.x, t.y] = [t.y, t.x]; t.orientation = 'h'; }
            [layout.xaxis, layout.yaxis] = [yaxis, xaxis];
            layout.margin = { ...TILE_MARGIN, l: 96 };
        }

        const overlay = buildOverlayShapes({
            verticalLines: type === 'bar-horizontal' ? [] : norm.markers,
            referenceLines: norm.referenceLines,
        });
        if (overlay.shapes.length) layout.shapes = overlay.shapes;
        if (overlay.annotations.length) layout.annotations = overlay.annotations;
        return { traces, layout };
    }

    /** The value axis title: the configured one, else the single series' name,
     *  with the unit beside it. */
    _valueTitle(series) {
        const unit = (this.config.unit || '').trim();
        const base = this.config.y_title || (series.length === 1 ? (series[0].name || '') : '');
        if (!unit) return base;
        return base ? `${base} (${unit})` : unit;
    }

    /**
     * `showlegend` and `legend`, lifted out by name: `buildLegendLayout`'s
     * top-level `font` would replace the theme's whole font object. Below the
     * plot it is anchored to the CONTAINER, so the axis title sits above it
     * however tall the tick labels are.
     */
    _legend() {
        if (!READS.legend.has(this.config.chart_type || 'line')) return { showlegend: false };
        const position = this.config.legend || 'bottom';
        const spec = buildLegendLayout(position);
        const out = { showlegend: spec.showlegend === true };
        if (spec.legend) out.legend = spec.legend;
        if (position === 'bottom' && out.legend) {
            out.legend = { ...out.legend, yref: 'container', y: 0, yanchor: 'bottom' };
        }
        return out;
    }

    async _downloadPng() {
        if (!this._plotEl || !this._drawn) return;
        try {
            const P = await ensurePlotly();
            const uri = await P.toImage(this._plotEl, { format: 'png', scale: 2 });
            const a = document.createElement('a');
            a.href = uri;
            a.download = `${slug(this.config.title || this.constructor.TITLE)}.png`;
            a.click();
        } catch (err) {
            this._notify('Download failed', `The image could not be made: ${err?.message || err}`, 'error');
        }
    }

    _failed(err) {
        if (this._disposed) return;
        this.showError(`This chart could not be drawn: ${err?.message || err}`);
        this.eventBus?.emit?.('tile:render-failed', {
            tileId: this.id,
            message: err?.message || String(err),
        });
    }
}

/**
 * ONE NUMBER, AND WHAT IT IS DOING. Plain DOM, no Plotly: a KPI strip is the
 * common board, and it should not pay 4 MB for three divs — nor wait for them.
 * It therefore renders synchronously and renders without Plotly loaded at all.
 *
 *     tile.setData({ value: 42, reference: 37, label: 'Open bugs', note: 'vs last week' })
 *
 * A bare number is `{value}`. The delta's ARROW states the fact (up or down);
 * `invert_delta` flips only the colour's judgement, so a falling cost is a
 * green ▼. The sign is in the text too, because colour alone does not survive
 * a monochrome display.
 */
export class KpiTile extends TileBase {
    static TYPE = 'flexdesk.kpi';
    static TITLE = 'KPI';
    static ICON = 'speed';
    static DESCRIPTION = 'One number with a label and an optional comparison.';
    static DEFAULT_SIZE = { w: 3, h: 2 };
    static SIZE_CONSTRAINTS = { minW: 2, minH: 2, maxW: 12, maxH: 6 };

    getDefaultConfig() {
        return {
            title: '',
            label: '',
            unit: '',
            format: 'number',
            decimals: null,
            prefix: '',
            suffix: '',
            currency: null,
            delta_relative: false,
            invert_delta: false,
            foot: '',
        };
    }

    getConfigSchema() {
        return {
            fields: [
                { name: 'title', type: 'text', label: 'Tile title' },
                { name: 'label', type: 'text', label: 'Label' },
                { name: 'unit', type: 'text', label: 'Unit', help: 'Shown after the number, e.g. "pts".' },
                { name: 'format', type: 'select', label: 'Format',
                  options: [
                      { value: 'number', label: 'Number' },
                      { value: 'percent', label: 'Percentage (of a ratio)' },
                      { value: 'currency', label: 'Currency' },
                      { value: 'duration', label: 'Duration (seconds)' },
                      { value: 'text', label: 'Text' },
                  ] },
                { name: 'decimals', type: 'number', label: 'Decimals', min: 0, max: 6 },
                { name: 'currency', type: 'text', label: 'Currency code',
                  help: 'ISO 4217, e.g. EUR. Left empty, the number is shown without a symbol.' },
                { name: 'prefix', type: 'text', label: 'Prefix' },
                { name: 'suffix', type: 'text', label: 'Suffix' },
                { name: 'delta_relative', type: 'checkbox', label: 'Show the change as a percentage' },
                { name: 'invert_delta', type: 'checkbox', label: 'A fall is good',
                  help: 'For a cost, a queue length or a latency: a smaller number is the better one.' },
                { name: 'foot', type: 'text', label: 'Caption' },
            ],
        };
    }

    mount(container) {
        super.mount(container);
        applyTitle(this);
    }

    /** `null` is "the grid has no data" — see `ChartTile.update`. And a value of
     *  `0` is a value: `TileBase.update` re-renders truthy data only. */
    update(data, config) {
        if (this._disposed) return;
        super.update(data === null ? undefined : data, config);
        if (config) applyTitle(this);
        const d = this.data;
        if (d !== null && d !== undefined && !d && this.contentElement) this.render(d);
    }

    /** `{value, reference?, label?, note?}` or a bare number; null is the empty state. */
    setData(data) {
        if (this._disposed) return;
        this.data = data ?? null;
        if (this.contentElement) this.render(this.data);
    }

    render(data) {
        const content = this.contentElement;
        if (!content) return;
        const d = typeof data === 'number' ? { value: data } : data;
        if (!d || typeof d !== 'object' || d.value === null || d.value === undefined || d.value === '') {
            this.showEmpty('No value to show.');
            return;
        }

        content.replaceChildren();
        const box = document.createElement('div');
        box.className = 'fd-kpi';

        const labelText = d.label || this.config.label || '';
        if (labelText) {
            const label = document.createElement('div');
            label.className = 'fd-kpi__label';
            label.textContent = labelText;
            label.title = labelText;
            box.append(label);
        }

        const big = document.createElement('div');
        big.className = 'fd-kpi__value';
        big.textContent = this._format(d.value, true);
        big.title = String(d.value);
        box.append(big);

        const delta = this._buildDelta(d.value, d.reference);
        if (delta) box.append(delta);

        const foot = [this.config.foot, d.note].filter(Boolean).join(' · ');
        if (foot) {
            const el = document.createElement('div');
            el.className = 'fd-kpi__foot';
            el.textContent = foot;
            el.title = foot;
            box.append(el);
        }
        content.append(box);
    }

    /** The comparison line, or `null` when there is nothing to compare against.
     *  `0` is a real reference — the test is finiteness, never truthiness. */
    _buildDelta(rawValue, rawReference) {
        const value = Number(rawValue);
        if (rawReference === null || rawReference === undefined || rawReference === '') return null;
        const reference = Number(rawReference);
        if (!Number.isFinite(value) || !Number.isFinite(reference)) return null;

        const change = value - reference;
        const el = document.createElement('div');
        el.className = 'fd-kpi__delta';
        // No change gets neither colour: a flat week is not a good one.
        if (change > 0) el.classList.add(this.config.invert_delta ? 'fd-kpi__delta--down' : 'fd-kpi__delta--up');
        else if (change < 0) el.classList.add(this.config.invert_delta ? 'fd-kpi__delta--up' : 'fd-kpi__delta--down');

        const arrow = change > 0 ? '▲' : change < 0 ? '▼' : '–';
        const magnitude = this.config.delta_relative
            ? (reference === 0 ? null : formatValue(Math.abs(change / reference), {
                format: 'percent', decimals: this.config.decimals ?? 1 }))
            : this._format(Math.abs(change), false);
        const sign = change > 0 ? '+' : change < 0 ? '-' : '';
        el.textContent = magnitude === null ? `${arrow} —` : `${arrow} ${sign}${magnitude}`;
        el.title = `Compared with ${this._format(reference, false)}`;
        return el;
    }

    _format(value, withAffixes) {
        const format = this.config.format || 'number';
        const body = formatValue(value, {
            format: format === 'text' && !withAffixes ? 'number' : format,
            decimals: this.config.decimals,
            currency: this.config.currency,
            prefix: withAffixes ? this.config.prefix : '',
            suffix: withAffixes ? this.config.suffix : '',
        });
        const unit = (this.config.unit || '').trim();
        return unit && body !== '—' ? `${body} ${unit}` : body;
    }
}

/**
 * Register both tiles. Idempotent: a second call registers nothing new and
 * replaces nothing — and nothing registers at import time, so an app that
 * imports `@flexdesk/tiles` without wanting these never sees them in its
 * Add-widget catalogue.
 */
export function registerChartTiles() {
    for (const Tile of [ChartTile, KpiTile]) {
        if (getWidget(Tile.TYPE) !== Tile) registerWidget(Tile);
    }
}

// ── helpers ─────────────────────────────────────────────────────────────

/** The header shows `config.title`, else the type's own title. */
function applyTitle(tile) {
    tile.setTitle(tile.config.title || tile.constructor.TITLE);
}

/** `'date' | 'number' | 'category'` from the x values themselves. */
function inferXKind(series) {
    let sawAny = false;
    let allNumbers = true;
    let allDates = true;
    for (const s of series) {
        for (const v of (Array.isArray(s.x) ? s.x : [])) {
            if (v === null || v === undefined) continue;
            sawAny = true;
            if (typeof v !== 'number') allNumbers = false;
            if (!(v instanceof Date) && !(typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v))) allDates = false;
            if (!allNumbers && !allDates) return 'category';
        }
    }
    if (!sawAny || allNumbers) return 'number';
    return allDates ? 'date' : 'category';
}

/** A value as a number, or `null` — never `NaN`. */
function toNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

/** A Y bound as the axis reads it: on a log axis Plotly reads `range` in log₁₀
 *  units, and a non-positive bound has no place there at all. */
function axisBound(value, log) {
    const n = toNumber(value);
    if (n === null || !log) return n;
    return n > 0 ? Math.log10(n) : null;
}

function fractionDigits(decimals) {
    const d = Math.max(0, Math.min(20, Number(decimals) || 0));
    return { minimumFractionDigits: d, maximumFractionDigits: d };
}

/** Seconds as `1d 4h`, `4h 12m`, `12m 30s`, `30s` — two units, never three. */
function formatDuration(seconds) {
    if (!Number.isFinite(seconds)) return '—';
    const sign = seconds < 0 ? '-' : '';
    let rest = Math.abs(Math.round(seconds));
    const days = Math.floor(rest / 86400); rest -= days * 86400;
    const hours = Math.floor(rest / 3600); rest -= hours * 3600;
    const minutes = Math.floor(rest / 60);
    const secs = rest - minutes * 60;
    if (days) return `${sign}${days}d ${hours}h`;
    if (hours) return `${sign}${hours}h ${minutes}m`;
    if (minutes) return `${sign}${minutes}m ${secs}s`;
    return `${sign}${secs}s`;
}

/**
 * The KPI's formatter. `currency` has NO default: a symbol nobody chose is a
 * claim about money that may be false. `percent` takes a RATIO (0.42 → 42%).
 */
function formatValue(value, { format = 'number', decimals = null, prefix = '', suffix = '',
                              currency = null } = {}) {
    if (value === null || value === undefined || value === '') return '—';
    const n = Number(value);
    const body = (() => {
        switch (format) {
        case 'number':
            if (!Number.isFinite(n)) return String(value);
            return decimals === null || decimals === undefined
                ? n.toLocaleString()
                : n.toLocaleString(undefined, fractionDigits(decimals));
        case 'percent':
            if (!Number.isFinite(n)) return String(value);
            return `${(n * 100).toLocaleString(undefined, fractionDigits(decimals ?? 1))}%`;
        case 'currency':
            if (!Number.isFinite(n)) return String(value);
            if (!currency) return n.toLocaleString(undefined, fractionDigits(decimals ?? 2));
            try {
                return n.toLocaleString(undefined, { style: 'currency', currency, ...fractionDigits(decimals ?? 2) });
            } catch {
                // An unknown code throws a RangeError from inside a render.
                return n.toLocaleString(undefined, fractionDigits(decimals ?? 2));
            }
        case 'duration':
            return formatDuration(n);
        default:
            return String(value);
        }
    })();
    return `${prefix || ''}${body}${suffix || ''}`;
}

function slug(text) {
    return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'chart';
}
