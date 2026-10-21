/**
 * plot_config.js — the shape of a plot, independent of what is being plotted.
 *
 * Subplot grid layouts, the default subplot, the legacy-format migration, and the
 * NaN strategies (gap / zero / hold / interpolate). Not one line of it knows what
 * an economy is.
 *
 * It lived in ui/js/notebook/cells/plot_cell.js — an EcoAgent notebook cell with
 * 60 domain words in it — and that single import was the only thing keeping the
 * plot windows out of @flexdesk/charts. Five modules imported these helpers THROUGH the
 * cell, which is how you end up with a chart library that depends on a notebook.
 *
 * plot_cell.js re-exports everything here, so its existing importers are unchanged.
 */

import { getSeriesColor } from './plotly_wrapper.js';


let _uid = 0;
function uid(prefix = 'p') { return `${prefix}-${++_uid}-${Date.now().toString(36)}`; }

/**
 * Apply NaN handling strategy to a data array.
 * @param {number[]} data
 * @param {'gap'|'zero'|'hold'|'interpolate'} strategy
 * @param {number[]} xData  — for interpolation
 * @returns {Array}
 */
function applyNanHandling(data, strategy, xData) {
    const isMissing = (v) => v === null || v === undefined || (typeof v === 'number' && !Number.isFinite(v));

    if (strategy === 'zero') return data.map(v => isMissing(v) ? 0 : v);

    if (strategy === 'hold') {
        const result = [];
        let last = null;
        for (const v of data) {
            if (isMissing(v)) result.push(last);
            else { last = v; result.push(v); }
        }
        return result;
    }

    if (strategy === 'interpolate') {
        const result = [...data];
        for (let i = 0; i < result.length; i++) {
            if (!isMissing(result[i])) continue;
            let left = -1, right = -1;
            for (let j = i - 1; j >= 0; j--) { if (!isMissing(result[j])) { left = j; break; } }
            for (let j = i + 1; j < result.length; j++) { if (!isMissing(result[j])) { right = j; break; } }
            if (left >= 0 && right >= 0 && xData) {
                const frac = (xData[i] - xData[left]) / (xData[right] - xData[left]);
                result[i] = result[left] + frac * (result[right] - result[left]);
            } else if (left >= 0) {
                result[i] = result[left];
            } else if (right >= 0) {
                result[i] = result[right];
            } else {
                result[i] = null;
            }
        }
        return result;
    }

    // 'gap' (default) — replace with null for Plotly gap rendering
    return data.map(v => isMissing(v) ? null : v);
}

// ─── Layout templates (matching figure_cell.js) ─────────────────────────────

const PLOT_LAYOUTS = Object.freeze({
    '1x1':         { label: 'Single',        slots: 1, grid: { columns: '1fr',       rows: '1fr'     }, areas: [{ slot: 0, gridArea: '1/1/2/2' }] },
    '1x2':         { label: 'Side by side',   slots: 2, grid: { columns: '1fr 1fr',   rows: '1fr'     }, areas: [{ slot: 0, gridArea: '1/1/2/2' }, { slot: 1, gridArea: '1/2/2/3' }] },
    '2x1':         { label: 'Stacked',        slots: 2, grid: { columns: '1fr',       rows: '1fr 1fr' }, areas: [{ slot: 0, gridArea: '1/1/2/2' }, { slot: 1, gridArea: '2/1/3/2' }] },
    '2x2':         { label: '2\u00d72 Grid',  slots: 4, grid: { columns: '1fr 1fr',   rows: '1fr 1fr' }, areas: [{ slot: 0, gridArea: '1/1/2/2' }, { slot: 1, gridArea: '1/2/2/3' }, { slot: 2, gridArea: '2/1/3/2' }, { slot: 3, gridArea: '2/2/3/3' }] },
    '1x3':         { label: 'Three columns',  slots: 3, grid: { columns: '1fr 1fr 1fr', rows: '1fr'   }, areas: [{ slot: 0, gridArea: '1/1/2/2' }, { slot: 1, gridArea: '1/2/2/3' }, { slot: 2, gridArea: '1/3/2/4' }] },
    'wide-top':    { label: '1 + 2',          slots: 3, grid: { columns: '1fr 1fr',   rows: '1fr 1fr' }, areas: [{ slot: 0, gridArea: '1/1/2/3' }, { slot: 1, gridArea: '2/1/3/2' }, { slot: 2, gridArea: '2/2/3/3' }] },
    'wide-bottom': { label: '2 + 1',          slots: 3, grid: { columns: '1fr 1fr',   rows: '1fr 1fr' }, areas: [{ slot: 0, gridArea: '1/1/2/2' }, { slot: 1, gridArea: '1/2/2/3' }, { slot: 2, gridArea: '2/1/3/3' }] },
});

/**
 * A new y axis with no series. Axis `index` 0, 2, 4, ... sits on the left,
 * 1, 3, 5, ... on the right.
 * @param {number} [index=0] - its place among the subplot's y axes
 */
function makeDefaultYAxis(index = 0) {
    return {
        id: uid('y'),
        label: '',
        scale: 'linear',
        position: index % 2 === 0 ? 'left' : 'right',
        min: null,
        max: null,
        step: null,
        series: [],
    };
}

/**
 * A new series with no variable, coloured by its place in the subplot.
 * @param {number} [index=0] - how many series the subplot already has
 */
function makeDefaultSeries(index = 0) {
    return {
        id: uid('s'),
        variable: '',
        label: '',
        color: getSeriesColor(index),
        lineWidth: 2,
        lineStyle: 'solid',
        stackGroup: null,
    };
}

function makeDefaultSubplot(index) {
    return {
        id: uid('sp'),
        displayName: '',
        chartType: 'line',
        legendPosition: 'hidden',
        interpolation: 'linear',
        nanHandling: 'gap',
        showDataPoints: false,
        xAxis: { useTime: true, variable: '' },
        zAxis: null,
        yAxes: [makeDefaultYAxis(0)],
    };
}

function migrateData(data) {
    // Already in multi-layout format
    if (data?.layout && Array.isArray(data?.subplots)) {
        // Migrate caption → description (old field name)
        if ('caption' in data && !('description' in data)) {
            data.description = data.caption;
            data.caption = '';
        }
        return data;
    }

    // Migrate legacy single-chart format → multi-layout with one subplot
    const legacySingle = migrateSingleChart(data);
    return {
        layout: '1x1',
        subplots: [{ id: uid('sp'), ...legacySingle }],
        caption: '',
        description: data?.caption ?? data?.description ?? '',
        doc: data?.doc ?? '',
    };
}

/** Migrate legacy flat series[]/variables[] to yAxes[] single-chart format. */
function migrateSingleChart(data) {
    if (data?.yAxes) {
        return {
            displayName:    data.displayName ?? '',
            chartType:      data.chartType ?? 'line',
            legendPosition: data.legendPosition ?? 'hidden',
            interpolation:  data.interpolation ?? 'linear',
            nanHandling:    data.nanHandling ?? 'gap',
            showDataPoints: data.showDataPoints ?? false,
            yAxes: data.yAxes,
        };
    }

    const series = data?.series ?? data?.variables?.map((v, i) => ({
        variable: v, label: '', color: getSeriesColor(i),
    })) ?? [];

    return {
        displayName:    data?.title ?? data?.displayName ?? '',
        chartType:      data?.chartType ?? data?.widgetType ?? 'line',
        legendPosition: data?.legendPosition ?? 'hidden',
        interpolation:  data?.interpolation ?? 'linear',
        nanHandling:    data?.nanHandling ?? 'gap',
        showDataPoints: data?.showDataPoints ?? false,
        yAxes: [{
            ...makeDefaultYAxis(0),
            label: data?.yLabel ?? '',
            series: series.map((s, i) => {
                const d = makeDefaultSeries(i);
                return {
                    id: s.id ?? d.id,
                    variable: s.variable ?? d.variable,
                    label: s.label ?? d.label,
                    color: s.color ?? d.color,
                    lineWidth: s.lineWidth ?? d.lineWidth,
                    lineStyle: s.lineStyle ?? d.lineStyle,
                    stackGroup: s.stackGroup ?? d.stackGroup,
                    ...(s.overlay ? { overlay: s.overlay } : {}),
                };
            }),
        }],
    };
}

export {
    uid, applyNanHandling, PLOT_LAYOUTS, makeDefaultSubplot, makeDefaultYAxis, makeDefaultSeries,
    migrateData, migrateSingleChart,
};
