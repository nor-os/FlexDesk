/**
 * Data Series Plot Window
 *
 * Opens a data series in a ManagedWindow with a split layout:
 * - Left: Plotly chart
 * - Right: Configuration panel (column selection, chart type, styling)
 *
 * Config is persisted in workspace metadata via savePlotConfig callback.
 */

import { ManagedWindow } from '../ui/components/managed_window.js';
import {
    ensurePlotly,
    purge,
    DARK_THEME_LAYOUT,
    DEFAULT_CONFIG,
    getSeriesColor,
} from './plotly_wrapper.js';
import {
    buildTrace,
    buildYAxisLayout,
    buildXAxisLayout,
    buildLegendLayout,
} from './chart_types.js';
// The two header helpers are INJECTED, not imported.
//
// They used to come from ui/js/ui/utils/header_utils.js, which decides whether a
// column is a STOCK or a FLOW by looking for `asset`, `liability`, `equity`,
// `reserves`, `deposit`. That is stock-flow-consistent accounting, not charting,
// and that one import was the last thing keeping this window out of @flexdesk/charts.
//
// The defaults below are what a chart library can honestly know about a column
// name: whether it looks like a time axis, and nothing else.

/** A column called `t`/`time`/`step`/`period` is the x-axis. Everything else is data. */
const defaultClassifyHeader = (header) => {
    const lower = String(header ?? '').trim().toLowerCase();
    return (lower === 't' || lower === 'time' || lower === 'step' || lower === 'period')
        ? 'time' : 'indicator';
};

/** No convention to strip, absent one being supplied. */
const defaultLabelHeader = (header) => header;
import { createRafResizeObserver } from '../ui/utils/raf_resize_observer.js';

const INTERPOLATION_MODES = ['linear', 'step', 'cubic'];
const CHART_TYPES = ['line', 'scatter', 'bar', 'area', 'area-stacked'];
const LEGEND_POSITIONS = ['top', 'bottom', 'right', 'hidden'];
const MAX_AUTO_COLUMNS = 3;

class DataSeriesPlotWindow {
    /**
     * @param {Object} options
     * @param {string} options.seriesId
     * @param {string} options.seriesName
     * @param {string} options.datasetName
     * @param {string[]} options.headers - Column headers from the series
     * @param {Object} options.dataHub - DataHub service for fetching data
     * @param {Object} options.services - { eventBus, logger }
     * @param {Object} [options.host] - A Host (ui/js/host/host.js). Its `dialogs`
     *        capability backs Export PNG/CSV; absent => Blob download fallback.
     * @param {Function} options.getPlotConfig - (seriesId) => config | null
     * @param {Function} options.savePlotConfig - (seriesId, config) => void
     */
    constructor({ seriesId, seriesName, datasetName, headers, dataHub, services, host,
                  getPlotConfig, savePlotConfig,
                  classifyHeader = defaultClassifyHeader,
                  labelHeader = defaultLabelHeader }) {
        this.classifyHeader = classifyHeader;
        this.labelHeader = labelHeader;
        this.seriesId = seriesId;
        this.seriesName = seriesName;
        this.datasetName = datasetName;
        this.headers = headers;
        this.dataHub = dataHub;
        this.services = services;
        this._host = host || null;
        this.getPlotConfig = getPlotConfig;
        this.savePlotConfig = savePlotConfig;

        this.window = null;
        this.contentEl = null;
        this.plotDiv = null;
        this._resizeObserver = null;
        this._chartCreated = false;
        this._config = null;
        this._fullData = null; // { headers, rows } with all data
        this._numericColumns = null; // Set of numeric column headers
        this._loading = false;
    }

    async show() {
        if (this.window?.isVisible) {
            this.window.bringToFront();
            return;
        }

        await ensurePlotly();
        await this.#fetchData();

        // Determine which columns are numeric from actual data
        this._numericColumns = new Set(this.headers.filter(h => this.#isNumericColumn(h)));

        // Load or create config (filter out any non-numeric columns from saved config)
        const saved = this.getPlotConfig?.(this.seriesId);
        if (saved) {
            this._config = { ...saved };
            this._config.yColumns = (saved.yColumns || []).filter(c => this._numericColumns.has(c.header));
        } else {
            this._config = DataSeriesPlotWindow.createDefaultConfig(this.headers, this._numericColumns);
        }

        this.#createWindow();
        this.#setupResizeObserver();
        await this.#renderPlot();
    }

    close() {
        if (this.window?.isVisible) {
            this.window.close();
        }
    }

    // ── Window creation ──────────────────────────────────────────────────

    #createWindow() {
        this.contentEl = this.#buildContent();

        const title = this.datasetName
            ? `${this.datasetName} · ${this.seriesName}`
            : this.seriesName || 'Series Plot';

        this.window = new ManagedWindow({
            id: `data-series-plot-${this.seriesId}`,
            title,
            icon: 'monitoring',
            content: this.contentEl,
            minWidth: 600,
            minHeight: 400,
            defaultWidth: 900,
            defaultHeight: 550,
            canMinimize: true,
            canMaximize: true,
            canResize: true,
            canDrag: true,
            onClose: () => this.#dispose(),
        });

        this.window.show();
    }

    #buildContent() {
        const container = document.createElement('div');
        container.className = 'twm-data-series-plot-container';

        // Actions bar (download buttons)
        const actionsBar = document.createElement('div');
        actionsBar.className = 'twm-data-series-plot-actions';

        const pngBtn = document.createElement('button');
        pngBtn.className = 'twm-btn-icon twm-has-tooltip';
        pngBtn.type = 'button';
        pngBtn.setAttribute('data-tooltip', 'Download plot as PNG');
        pngBtn.innerHTML = '<span class="material-symbols-outlined">image</span>';
        pngBtn.addEventListener('click', () => this.#downloadPNG());

        const csvBtn = document.createElement('button');
        csvBtn.className = 'twm-btn-icon twm-has-tooltip';
        csvBtn.type = 'button';
        csvBtn.setAttribute('data-tooltip', 'Download data as CSV');
        csvBtn.innerHTML = '<span class="material-symbols-outlined">download</span>';
        csvBtn.addEventListener('click', () => this.#downloadCSV());

        actionsBar.appendChild(pngBtn);
        actionsBar.appendChild(csvBtn);

        // Chart area
        const chartWrap = document.createElement('div');
        chartWrap.className = 'twm-data-series-plot-body';

        this.plotDiv = document.createElement('div');
        this.plotDiv.className = 'twm-data-series-plot-chart';
        chartWrap.appendChild(this.plotDiv);

        // Config panel
        const configPanel = this.#buildConfigPanel();
        chartWrap.appendChild(configPanel);

        container.appendChild(actionsBar);
        container.appendChild(chartWrap);

        return container;
    }

    // ── Config panel ─────────────────────────────────────────────────────

    #buildConfigPanel() {
        const panel = document.createElement('div');
        panel.className = 'twm-data-series-plot-config';

        // X Column
        panel.appendChild(this.#buildSection('X Axis', this.#buildXColumnSelect()));

        // Y Columns
        this._yColumnsList = document.createElement('div');
        this._yColumnsList.className = 'twm-data-series-plot-config__columns';
        this.#populateYColumns();
        panel.appendChild(this.#buildSection('Y Axis', this._yColumnsList));

        // Chart type
        panel.appendChild(this.#buildSection('Chart Type', this.#buildSelect(
            CHART_TYPES,
            this._config.chartType,
            (val) => { this._config.chartType = val; this.#onConfigChanged(); }
        )));

        // Interpolation
        panel.appendChild(this.#buildSection('Interpolation', this.#buildSelect(
            INTERPOLATION_MODES,
            this._config.interpolation,
            (val) => { this._config.interpolation = val; this.#onConfigChanged(); }
        )));

        // Legend position
        panel.appendChild(this.#buildSection('Legend', this.#buildSelect(
            LEGEND_POSITIONS,
            this._config.legendPosition,
            (val) => { this._config.legendPosition = val; this.#onConfigChanged(); }
        )));

        // Show data points
        panel.appendChild(this.#buildSection('', this.#buildCheckbox(
            'Show data points',
            this._config.showDataPoints,
            (checked) => { this._config.showDataPoints = checked; this.#onConfigChanged(); }
        )));

        return panel;
    }

    #buildSection(label, content) {
        const section = document.createElement('div');
        section.className = 'twm-data-series-plot-config__section';

        if (label) {
            const labelEl = document.createElement('div');
            labelEl.className = 'twm-data-series-plot-config__label';
            labelEl.textContent = label;
            section.appendChild(labelEl);
        }

        if (content instanceof HTMLElement) {
            section.appendChild(content);
        }

        return section;
    }

    #buildXColumnSelect() {
        const select = document.createElement('select');
        for (const header of this.headers) {
            if (!this._numericColumns.has(header)) continue;
            const opt = document.createElement('option');
            opt.value = header;
            opt.textContent = this.labelHeader(header);
            if (header === this._config.xColumn) opt.selected = true;
            select.appendChild(opt);
        }
        select.addEventListener('change', () => {
            this._config.xColumn = select.value;
            this.#onConfigChanged();
        });
        return select;
    }

    #populateYColumns() {
        const list = this._yColumnsList;
        list.innerHTML = '';

        const selectedSet = new Set(this._config.yColumns.map(c => c.header));

        for (const header of this.headers) {
            if (header === this._config.xColumn) continue;
            if (!this._numericColumns.has(header)) continue;

            const item = document.createElement('label');
            item.className = 'twm-data-series-plot-config__column-item';

            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = selectedSet.has(header);
            cb.addEventListener('change', () => this.#toggleYColumn(header, cb.checked));

            const colorSwatch = document.createElement('input');
            colorSwatch.type = 'color';
            colorSwatch.className = 'twm-data-series-plot-config__color-swatch';
            const existing = this._config.yColumns.find(c => c.header === header);
            colorSwatch.value = existing?.color || this.#nextColor(this.headers.indexOf(header));
            colorSwatch.addEventListener('input', () => this.#updateColumnColor(header, colorSwatch.value));

            const label = document.createElement('span');
            label.textContent = this.labelHeader(header);
            label.title = header;

            item.appendChild(cb);
            item.appendChild(colorSwatch);
            item.appendChild(label);
            list.appendChild(item);
        }
    }

    #toggleYColumn(header, checked) {
        if (checked) {
            if (!this._config.yColumns.find(c => c.header === header)) {
                const colorSwatch = this._yColumnsList.querySelector(
                    `label:has(span[title="${header}"]) input[type="color"]`
                );
                this._config.yColumns.push({
                    header,
                    color: colorSwatch?.value || this.#nextColor(this.headers.indexOf(header)),
                });
            }
        } else {
            this._config.yColumns = this._config.yColumns.filter(c => c.header !== header);
        }
        this.#onConfigChanged();
    }

    #updateColumnColor(header, color) {
        const col = this._config.yColumns.find(c => c.header === header);
        if (col) {
            col.color = color;
            this.#onConfigChanged();
        }
    }

    #nextColor(index) {
        return getSeriesColor(index);
    }

    #buildSelect(options, value, onChange) {
        const select = document.createElement('select');
        for (const opt of options) {
            const el = document.createElement('option');
            el.value = opt;
            el.textContent = opt.charAt(0).toUpperCase() + opt.slice(1);
            if (opt === value) el.selected = true;
            select.appendChild(el);
        }
        select.addEventListener('change', () => onChange(select.value));
        return select;
    }

    #buildCheckbox(label, checked, onChange) {
        const wrapper = document.createElement('label');
        wrapper.className = 'twm-data-series-plot-config__column-item';

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = checked;
        cb.addEventListener('change', () => onChange(cb.checked));

        const span = document.createElement('span');
        span.textContent = label;

        wrapper.appendChild(cb);
        wrapper.appendChild(span);
        return wrapper;
    }

    // ── Data fetching ────────────────────────────────────────────────────

    async #fetchData() {
        if (this._loading) return;
        this._loading = true;

        try {
            const response = await this.dataHub.fetchSeriesById(this.seriesId, { limit: null, offset: 0 });
            if (response?.ok) {
                this._fullData = {
                    headers: response.headers || [],
                    rows: response.rows || [],
                };
            } else {
                this.#notify('Plot', response?.error || 'Failed to load series data', 'error');
            }
        } catch (err) {
            this.services.logger?.warn?.('[DataSeriesPlotWindow] Fetch failed', err);
            this.#notify('Plot', 'Failed to load data', 'error');
        } finally {
            this._loading = false;
        }
    }

    #isNumericColumn(header) {
        if (!this._fullData) return false;
        const data = this.#extractColumnData(header);
        // Sample up to 20 non-empty values
        let numericCount = 0;
        let sampleCount = 0;
        for (const v of data) {
            if (v == null || v === '') continue;
            sampleCount++;
            if (Number.isFinite(Number(v))) numericCount++;
            if (sampleCount >= 20) break;
        }
        return sampleCount > 0 && numericCount / sampleCount >= 0.8;
    }

    // ── Chart rendering ──────────────────────────────────────────────────

    #extractColumnData(columnHeader) {
        if (!this._fullData) return [];

        const { headers, rows } = this._fullData;
        const idx = headers.indexOf(columnHeader);
        if (idx < 0) return [];

        const TIME_NAMES = new Set(['time', 'tDisp', 'year', 'date', 'timestamp']);
        const firstIsTime = TIME_NAMES.has(headers[0]);
        const colOffset = firstIsTime ? 1 : 0;

        return rows.map(row => {
            if (Array.isArray(row)) return row[idx];
            if (row && typeof row === 'object') {
                // Handle {tDisp, cols} format
                if (TIME_NAMES.has(columnHeader) && row.tDisp !== undefined) return row.tDisp;
                if (Array.isArray(row.cols)) return row.cols[idx - colOffset] ?? '';
                return row[columnHeader] ?? '';
            }
            return '';
        }).map(v => {
            const n = Number(v);
            return Number.isFinite(n) ? n : v;
        });
    }

    async #renderPlot() {
        if (!this.plotDiv || !window.Plotly || !this._fullData) return;

        const cfg = this._config;
        const xData = this.#extractColumnData(cfg.xColumn);

        if (xData.length === 0 || cfg.yColumns.length === 0) {
            // Show empty state
            if (this._chartCreated) {
                try { purge(this.plotDiv); } catch (e) { /* ignore */ }
                this._chartCreated = false;
            }
            this.plotDiv.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#888;font-size:13px;">Select columns to plot</div>';
            return;
        }

        // Clear empty state if present
        if (!this._chartCreated) {
            this.plotDiv.innerHTML = '';
        }

        const traces = [];

        for (let i = 0; i < cfg.yColumns.length; i++) {
            const col = cfg.yColumns[i];
            const yData = this.#extractColumnData(col.header);

            traces.push(buildTrace({
                chartType: cfg.chartType,
                x: xData,
                y: yData,
                name: this.labelHeader(col.header),
                color: col.color,
                lineWidth: 2,
                lineStyle: 'solid',
                interpolation: cfg.interpolation,
                yAxisId: 'y',
                showMarkers: cfg.showDataPoints,
                seriesIndex: i,
            }));
        }

        const legendAtTop = cfg.legendPosition === 'top';
        const legendAtBottom = cfg.legendPosition === 'bottom';

        const layout = {
            ...DARK_THEME_LAYOUT,
            autosize: true,
            margin: {
                l: 60, r: 40,
                b: legendAtBottom ? 80 : 50,
                t: legendAtTop ? 60 : 30,
            },
        };

        // Remove 3D scene from layout
        delete layout.scene;

        // X-axis
        layout.xaxis = {
            ...buildXAxisLayout({ title: this.labelHeader(cfg.xColumn) }),
        };

        // Unified hover
        layout.hovermode = 'x unified';
        layout.xaxis.showspikes = true;
        layout.xaxis.spikemode = 'across';
        layout.xaxis.spikethickness = 1;
        layout.xaxis.spikecolor = '#666666';
        layout.xaxis.spikedash = 'dot';

        // Y-axis
        layout.yaxis = buildYAxisLayout({
            axisId: 'yaxis',
            title: '',
            position: 'left',
            scaleType: 'linear',
            showGrid: true,
        });

        // Legend
        const legendConfig = buildLegendLayout(cfg.legendPosition);
        if (legendConfig.legend) {
            layout.legend = legendConfig.legend;
        }
        layout.showlegend = legendConfig.showlegend !== false;

        const plotConfig = {
            ...DEFAULT_CONFIG,
            responsive: true,
            displayModeBar: true,
            modeBarButtonsToRemove: ['lasso2d', 'select2d', 'toImage'],
        };

        try {
            await window.Plotly.newPlot(this.plotDiv, traces, layout, plotConfig);
            this._chartCreated = true;

            requestAnimationFrame(() => {
                try {
                    window.Plotly.Plots.resize(this.plotDiv);
                } catch (e) { /* ignore */ }
            });
        } catch (e) {
            console.error('[DataSeriesPlotWindow] Chart render error:', e);
        }
    }

    // ── Config change handler ────────────────────────────────────────────

    #onConfigChanged() {
        this.#renderPlot();
        this.savePlotConfig?.(this.seriesId, { ...this._config, yColumns: [...this._config.yColumns] });
    }

    // ── Resize observer ──────────────────────────────────────────────────

    #setupResizeObserver() {
        if (!this.plotDiv) return;

        this._resizeObserver = createRafResizeObserver(() => {
            if (this.plotDiv && window.Plotly && this._chartCreated) {
                try {
                    window.Plotly.Plots.resize(this.plotDiv);
                } catch (e) { /* ignore */ }
            }
        });

        this._resizeObserver.observe(this.plotDiv);
    }

    // ── Downloads ────────────────────────────────────────────────────────

    async #downloadPNG() {
        if (!this.plotDiv || !window.Plotly || !this._chartCreated) {
            this.#notify('Download', 'Plot not ready', 'warn');
            return;
        }

        const filename = `${(this.seriesName || 'series').replace(/[^a-z0-9]/gi, '_')}.png`;

        try {
            const pngDataUrl = await window.Plotly.toImage(this.plotDiv, {
                format: 'png', width: 1920, height: 1080, scale: 2,
            });

            // null <=> no save dialog behind the capability (host.js) -> fall back.
            const dialogs = this._host?.dialogs;
            const result = dialogs
                ? await dialogs.saveFile({ data: pngDataUrl.split(',')[1], filename, kind: 'png' })
                : null;
            if (result) {
                if (result.ok) {
                    this.#notify('Download', `Plot saved to ${result.path}`, 'success');
                } else if (!result.cancelled) {
                    this.#notify('Download', result.error || 'Failed to save image', 'error');
                }
            } else {
                const link = document.createElement('a');
                link.href = pngDataUrl;
                link.download = filename;
                link.click();
            }
        } catch (err) {
            this.services.logger?.warn?.('[DataSeriesPlotWindow] PNG download failed', err);
            this.#notify('Download', 'Failed to generate PNG', 'error');
        }
    }

    async #downloadCSV() {
        if (!this._fullData || !this._fullData.rows.length) {
            this.#notify('Download', 'No data available', 'warn');
            return;
        }

        const cfg = this._config;
        const columns = [cfg.xColumn, ...cfg.yColumns.map(c => c.header)];
        const headers = columns.map(h => this.labelHeader(h));

        // Pre-extract all columns once
        const columnData = columns.map(col => this.#extractColumnData(col));
        const rowCount = this._fullData.rows.length;

        const lines = [headers.join(',')];
        for (let r = 0; r < rowCount; r++) {
            const vals = columnData.map(data => this.#csvEscape(data[r]));
            lines.push(vals.join(','));
        }
        const csv = lines.join('\n');

        const filename = `${(this.seriesName || 'series').replace(/[^a-z0-9]/gi, '_')}_data.csv`;

        // null <=> no save dialog behind the capability (host.js) -> fall back.
        const dialogs = this._host?.dialogs;
        let result = null;
        if (dialogs) {
            try {
                result = await dialogs.saveFile({ data: csv, filename, kind: 'csv' });
            } catch (err) {
                this.#notify('Download', 'Failed to save file', 'error');
                return;
            }
        }
        if (result) {
            if (result.ok) {
                this.#notify('Download', `Saved to ${result.path}`, 'success');
            } else if (!result.cancelled) {
                this.#notify('Download', result.error || 'Failed to save file', 'error');
            }
        } else {
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            link.click();
            URL.revokeObjectURL(url);
        }
    }

    #csvEscape(value) {
        if (value == null) return '';
        const str = String(value);
        if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
        return str;
    }

    // ── Notifications ────────────────────────────────────────────────────

    #notify(title, message, severity = 'info') {
        this.services.eventBus?.emit?.('toast:show', { title, message, type: severity });
    }

    // ── Disposal ─────────────────────────────────────────────────────────

    #dispose() {
        if (this._resizeObserver) {
            this._resizeObserver.disconnect();
            this._resizeObserver = null;
        }

        if (this.plotDiv && window.Plotly) {
            try { purge(this.plotDiv); } catch (e) { /* ignore */ }
        }

        _openPlotWindows.delete(this.seriesId);

        this.window = null;
        this.contentEl = null;
        this.plotDiv = null;
        this._yColumnsList = null;
        this._chartCreated = false;
        this._fullData = null;
        this._numericColumns = null;
        this._config = null;
    }

    // ── Default config factory ───────────────────────────────────────────

    static createDefaultConfig(headers, numericColumns) {
        const isNumeric = numericColumns instanceof Set ? (h) => numericColumns.has(h) : () => true;

        // Find best X column (time-like, must be numeric)
        let xColumn = '';
        for (const h of headers) {
            if (isNumeric(h) && this.classifyHeader(h) === 'time') {
                xColumn = h;
                break;
            }
        }
        // Fallback: first numeric column
        if (!xColumn) {
            for (const h of headers) {
                if (isNumeric(h)) { xColumn = h; break; }
            }
        }

        // Pick first N non-X numeric columns for Y
        const yColumns = [];
        for (const h of headers) {
            if (h === xColumn) continue;
            if (!isNumeric(h)) continue;
            if (yColumns.length >= MAX_AUTO_COLUMNS) break;
            yColumns.push({ header: h, color: getSeriesColor(yColumns.length) });
        }

        return {
            xColumn,
            yColumns,
            chartType: 'line',
            showDataPoints: false,
            interpolation: 'linear',
            legendPosition: 'top',
        };
    }
}

// ── Singleton window management ──────────────────────────────────────────

const _openPlotWindows = new Map();

export async function openDataSeriesPlotWindow(options) {
    const { seriesId } = options;
    let win = _openPlotWindows.get(seriesId);
    if (win?.window?.isVisible) {
        win.window.bringToFront();
        return win;
    }

    win = new DataSeriesPlotWindow(options);
    _openPlotWindows.set(seriesId, win);
    await win.show();
    return win;
}

export function closeDataSeriesPlotWindow(seriesId) {
    const win = _openPlotWindows.get(seriesId);
    if (win) {
        win.close();
        _openPlotWindows.delete(seriesId);
    }
}

export default DataSeriesPlotWindow;
