import {
  createTabs
} from "./chunk-REJ5HLIM.js";
import {
  ALL_CHART_TYPES,
  CHART_TYPES_2D,
  CHART_TYPES_3D,
  COLOR_PALETTE,
  DARK_THEME_LAYOUT,
  DEFAULT_CHART_EXPORT_FILENAME,
  DEFAULT_CONFIG,
  PLOT_GRID_THEME,
  PLOT_LAYOUTS,
  PlotPopoutWindow,
  applyNanHandling,
  build3DSceneLayout,
  buildBoxTrace,
  buildFanBandTraces,
  buildHeatmapTrace,
  buildHistogramTrace,
  buildIndicatorTrace,
  buildLegendLayout,
  buildOverlayShapes,
  buildTrace,
  buildXAxisLayout,
  buildYAxisLayout,
  createChart,
  createChartDeferred,
  deriveSeriesTraces,
  ensurePlotly,
  extendTraces,
  getChartExportFilename,
  getSeriesColor,
  hasPlot,
  hexToRgba,
  is3DChart,
  lttb,
  makeDefaultSeries,
  makeDefaultSubplot,
  makeDefaultYAxis,
  migrateData,
  migrateSingleChart,
  openPlotPopoutWindow,
  openRawTracesWindow,
  purge,
  relayout,
  renderPlotGrid,
  renderSeriesTransformControls,
  resize,
  resolveSeriesData,
  restyle,
  setChartExportFilename,
  setPlotlySource,
  strideDownsampleShared,
  strideIndices,
  uid,
  updateChart
} from "./chunk-TLIV6QSU.js";
import {
  AutocompleteField,
  createRafResizeObserver
} from "./chunk-2PM6ZMNS.js";
import {
  ColorField,
  ManagedWindow,
  ToggleField,
  selectBox
} from "./chunk-MADMGRX2.js";
import "./chunk-HNU6MM2B.js";
import "./chunk-N7HC3ADV.js";
import "./chunk-WUFLGETN.js";
import "./chunk-JYWURG5T.js";

// src/charts/data_series_plot_window.js
var defaultClassifyHeader = (header) => {
  const lower = String(header ?? "").trim().toLowerCase();
  return lower === "t" || lower === "time" || lower === "step" || lower === "period" ? "time" : "indicator";
};
var defaultLabelHeader = (header) => header;
var INTERPOLATION_MODES = ["linear", "step", "cubic"];
var CHART_TYPES = ["line", "scatter", "bar", "area", "area-stacked"];
var LEGEND_POSITIONS = ["top", "bottom", "right", "hidden"];
var MAX_AUTO_COLUMNS = 3;
var DataSeriesPlotWindow = class _DataSeriesPlotWindow {
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
  constructor({
    seriesId,
    seriesName,
    datasetName,
    headers,
    dataHub,
    services,
    host,
    getPlotConfig,
    savePlotConfig,
    classifyHeader = defaultClassifyHeader,
    labelHeader = defaultLabelHeader
  }) {
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
    this._fullData = null;
    this._numericColumns = null;
    this._loading = false;
  }
  async show() {
    if (this.window?.isVisible) {
      this.window.bringToFront();
      return;
    }
    await ensurePlotly();
    await this.#fetchData();
    this._numericColumns = new Set(this.headers.filter((h) => this.#isNumericColumn(h)));
    const saved = this.getPlotConfig?.(this.seriesId);
    if (saved) {
      this._config = { ...saved };
      this._config.yColumns = (saved.yColumns || []).filter((c) => this._numericColumns.has(c.header));
    } else {
      this._config = _DataSeriesPlotWindow.createDefaultConfig(
        this.headers,
        this._numericColumns,
        this.classifyHeader
      );
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
    const title = this.datasetName ? `${this.datasetName} \xB7 ${this.seriesName}` : this.seriesName || "Series Plot";
    this.window = new ManagedWindow({
      id: `data-series-plot-${this.seriesId}`,
      title,
      icon: "monitoring",
      content: this.contentEl,
      minWidth: 600,
      minHeight: 400,
      defaultWidth: 900,
      defaultHeight: 550,
      canMinimize: true,
      canMaximize: true,
      canResize: true,
      canDrag: true,
      onClose: () => this.#dispose()
    });
    this.window.show();
  }
  #buildContent() {
    const container = document.createElement("div");
    container.className = "twm-data-series-plot-container";
    const actionsBar = document.createElement("div");
    actionsBar.className = "twm-data-series-plot-actions";
    const pngBtn = document.createElement("button");
    pngBtn.className = "twm-btn-icon twm-has-tooltip";
    pngBtn.type = "button";
    pngBtn.setAttribute("data-tooltip", "Download plot as PNG");
    pngBtn.innerHTML = '<span class="material-symbols-outlined">image</span>';
    pngBtn.addEventListener("click", () => this.#downloadPNG());
    const csvBtn = document.createElement("button");
    csvBtn.className = "twm-btn-icon twm-has-tooltip";
    csvBtn.type = "button";
    csvBtn.setAttribute("data-tooltip", "Download data as CSV");
    csvBtn.innerHTML = '<span class="material-symbols-outlined">download</span>';
    csvBtn.addEventListener("click", () => this.#downloadCSV());
    actionsBar.appendChild(pngBtn);
    actionsBar.appendChild(csvBtn);
    const chartWrap = document.createElement("div");
    chartWrap.className = "twm-data-series-plot-body";
    this.plotDiv = document.createElement("div");
    this.plotDiv.className = "twm-data-series-plot-chart";
    chartWrap.appendChild(this.plotDiv);
    const configPanel = this.#buildConfigPanel();
    chartWrap.appendChild(configPanel);
    container.appendChild(actionsBar);
    container.appendChild(chartWrap);
    return container;
  }
  // ── Config panel ─────────────────────────────────────────────────────
  #buildConfigPanel() {
    const panel = document.createElement("div");
    panel.className = "twm-data-series-plot-config";
    panel.appendChild(this.#buildSection("X Axis", this.#buildXColumnSelect()));
    this._yColumnsList = document.createElement("div");
    this._yColumnsList.className = "twm-data-series-plot-config__columns";
    this.#populateYColumns();
    panel.appendChild(this.#buildSection("Y Axis", this._yColumnsList));
    panel.appendChild(this.#buildSection("Chart Type", this.#buildSelect(
      CHART_TYPES,
      this._config.chartType,
      (val) => {
        this._config.chartType = val;
        this.#onConfigChanged();
      }
    )));
    panel.appendChild(this.#buildSection("Interpolation", this.#buildSelect(
      INTERPOLATION_MODES,
      this._config.interpolation,
      (val) => {
        this._config.interpolation = val;
        this.#onConfigChanged();
      }
    )));
    panel.appendChild(this.#buildSection("Legend", this.#buildSelect(
      LEGEND_POSITIONS,
      this._config.legendPosition,
      (val) => {
        this._config.legendPosition = val;
        this.#onConfigChanged();
      }
    )));
    panel.appendChild(this.#buildSection("", this.#buildCheckbox(
      "Show data points",
      this._config.showDataPoints,
      (checked) => {
        this._config.showDataPoints = checked;
        this.#onConfigChanged();
      }
    )));
    return panel;
  }
  #buildSection(label, content) {
    const section = document.createElement("div");
    section.className = "twm-data-series-plot-config__section";
    if (label) {
      const labelEl = document.createElement("div");
      labelEl.className = "twm-data-series-plot-config__label";
      labelEl.textContent = label;
      section.appendChild(labelEl);
    }
    if (content instanceof HTMLElement) {
      section.appendChild(content);
    }
    return section;
  }
  #buildXColumnSelect() {
    const select2 = document.createElement("select");
    for (const header of this.headers) {
      if (!this._numericColumns.has(header)) continue;
      const opt = document.createElement("option");
      opt.value = header;
      opt.textContent = this.labelHeader(header);
      if (header === this._config.xColumn) opt.selected = true;
      select2.appendChild(opt);
    }
    select2.addEventListener("change", () => {
      this._config.xColumn = select2.value;
      this.#onConfigChanged();
    });
    return select2;
  }
  #populateYColumns() {
    const list = this._yColumnsList;
    list.innerHTML = "";
    const selectedSet = new Set(this._config.yColumns.map((c) => c.header));
    for (const header of this.headers) {
      if (header === this._config.xColumn) continue;
      if (!this._numericColumns.has(header)) continue;
      const item = document.createElement("label");
      item.className = "twm-data-series-plot-config__column-item";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = selectedSet.has(header);
      cb.addEventListener("change", () => this.#toggleYColumn(header, cb.checked));
      const colorSwatch = document.createElement("input");
      colorSwatch.type = "color";
      colorSwatch.className = "twm-data-series-plot-config__color-swatch";
      const existing = this._config.yColumns.find((c) => c.header === header);
      colorSwatch.value = existing?.color || this.#nextColor(this.headers.indexOf(header));
      colorSwatch.addEventListener("input", () => this.#updateColumnColor(header, colorSwatch.value));
      const label = document.createElement("span");
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
      if (!this._config.yColumns.find((c) => c.header === header)) {
        const colorSwatch = this._yColumnsList.querySelector(
          `label:has(span[title="${header}"]) input[type="color"]`
        );
        this._config.yColumns.push({
          header,
          color: colorSwatch?.value || this.#nextColor(this.headers.indexOf(header))
        });
      }
    } else {
      this._config.yColumns = this._config.yColumns.filter((c) => c.header !== header);
    }
    this.#onConfigChanged();
  }
  #updateColumnColor(header, color) {
    const col = this._config.yColumns.find((c) => c.header === header);
    if (col) {
      col.color = color;
      this.#onConfigChanged();
    }
  }
  #nextColor(index) {
    return getSeriesColor(index);
  }
  #buildSelect(options, value, onChange) {
    const select2 = document.createElement("select");
    for (const opt of options) {
      const el2 = document.createElement("option");
      el2.value = opt;
      el2.textContent = opt.charAt(0).toUpperCase() + opt.slice(1);
      if (opt === value) el2.selected = true;
      select2.appendChild(el2);
    }
    select2.addEventListener("change", () => onChange(select2.value));
    return select2;
  }
  #buildCheckbox(label, checked, onChange) {
    const wrapper = document.createElement("label");
    wrapper.className = "twm-data-series-plot-config__column-item";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = checked;
    cb.addEventListener("change", () => onChange(cb.checked));
    const span = document.createElement("span");
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
          rows: response.rows || []
        };
      } else {
        this.#notify("Plot", response?.error || "Failed to load series data", "error");
      }
    } catch (err) {
      this.services.logger?.warn?.("[DataSeriesPlotWindow] Fetch failed", err);
      this.#notify("Plot", "Failed to load data", "error");
    } finally {
      this._loading = false;
    }
  }
  #isNumericColumn(header) {
    if (!this._fullData) return false;
    const data = this.#extractColumnData(header);
    let numericCount = 0;
    let sampleCount = 0;
    for (const v of data) {
      if (v == null || v === "") continue;
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
    const TIME_NAMES = /* @__PURE__ */ new Set(["time", "tDisp", "year", "date", "timestamp"]);
    const firstIsTime = TIME_NAMES.has(headers[0]);
    const colOffset = firstIsTime ? 1 : 0;
    return rows.map((row) => {
      if (Array.isArray(row)) return row[idx];
      if (row && typeof row === "object") {
        if (TIME_NAMES.has(columnHeader) && row.tDisp !== void 0) return row.tDisp;
        if (Array.isArray(row.cols)) return row.cols[idx - colOffset] ?? "";
        return row[columnHeader] ?? "";
      }
      return "";
    }).map((v) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : v;
    });
  }
  async #renderPlot() {
    if (!this.plotDiv || !window.Plotly || !this._fullData) return;
    const cfg = this._config;
    const xData = this.#extractColumnData(cfg.xColumn);
    if (xData.length === 0 || cfg.yColumns.length === 0) {
      if (this._chartCreated) {
        try {
          purge(this.plotDiv);
        } catch (e) {
        }
        this._chartCreated = false;
      }
      this.plotDiv.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#888;font-size:13px;">Select columns to plot</div>';
      return;
    }
    if (!this._chartCreated) {
      this.plotDiv.innerHTML = "";
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
        lineStyle: "solid",
        interpolation: cfg.interpolation,
        yAxisId: "y",
        showMarkers: cfg.showDataPoints,
        seriesIndex: i
      }));
    }
    const legendAtTop = cfg.legendPosition === "top";
    const legendAtBottom = cfg.legendPosition === "bottom";
    const layout = {
      ...DARK_THEME_LAYOUT,
      autosize: true,
      margin: {
        l: 60,
        r: 40,
        b: legendAtBottom ? 80 : 50,
        t: legendAtTop ? 60 : 30
      }
    };
    delete layout.scene;
    layout.xaxis = {
      ...buildXAxisLayout({ title: this.labelHeader(cfg.xColumn) })
    };
    layout.hovermode = "x unified";
    layout.xaxis.showspikes = true;
    layout.xaxis.spikemode = "across";
    layout.xaxis.spikethickness = 1;
    layout.xaxis.spikecolor = "#666666";
    layout.xaxis.spikedash = "dot";
    layout.yaxis = buildYAxisLayout({
      axisId: "yaxis",
      title: "",
      position: "left",
      scaleType: "linear",
      showGrid: true
    });
    const legendConfig = buildLegendLayout(cfg.legendPosition);
    if (legendConfig.legend) {
      layout.legend = legendConfig.legend;
    }
    layout.showlegend = legendConfig.showlegend !== false;
    const plotConfig = {
      ...DEFAULT_CONFIG,
      responsive: true,
      displayModeBar: true,
      modeBarButtonsToRemove: ["lasso2d", "select2d", "toImage"]
    };
    try {
      await window.Plotly.newPlot(this.plotDiv, traces, layout, plotConfig);
      this._chartCreated = true;
      requestAnimationFrame(() => {
        try {
          window.Plotly.Plots.resize(this.plotDiv);
        } catch (e) {
        }
      });
    } catch (e) {
      console.error("[DataSeriesPlotWindow] Chart render error:", e);
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
        } catch (e) {
        }
      }
    });
    this._resizeObserver.observe(this.plotDiv);
  }
  // ── Downloads ────────────────────────────────────────────────────────
  async #downloadPNG() {
    if (!this.plotDiv || !window.Plotly || !this._chartCreated) {
      this.#notify("Download", "Plot not ready", "warn");
      return;
    }
    const filename = `${(this.seriesName || "series").replace(/[^a-z0-9]/gi, "_")}.png`;
    try {
      const pngDataUrl = await window.Plotly.toImage(this.plotDiv, {
        format: "png",
        width: 1920,
        height: 1080,
        scale: 2
      });
      const dialogs = this._host?.dialogs;
      const result = dialogs ? await dialogs.saveFile({ data: pngDataUrl.split(",")[1], filename, kind: "png" }) : null;
      if (result) {
        if (result.ok) {
          this.#notify("Download", `Plot saved to ${result.path}`, "success");
        } else if (!result.cancelled) {
          this.#notify("Download", result.error || "Failed to save image", "error");
        }
      } else {
        const link = document.createElement("a");
        link.href = pngDataUrl;
        link.download = filename;
        link.click();
      }
    } catch (err) {
      this.services.logger?.warn?.("[DataSeriesPlotWindow] PNG download failed", err);
      this.#notify("Download", "Failed to generate PNG", "error");
    }
  }
  async #downloadCSV() {
    if (!this._fullData || !this._fullData.rows.length) {
      this.#notify("Download", "No data available", "warn");
      return;
    }
    const cfg = this._config;
    const columns = [cfg.xColumn, ...cfg.yColumns.map((c) => c.header)];
    const headers = columns.map((h) => this.labelHeader(h));
    const columnData = columns.map((col) => this.#extractColumnData(col));
    const rowCount = this._fullData.rows.length;
    const lines = [headers.join(",")];
    for (let r = 0; r < rowCount; r++) {
      const vals = columnData.map((data) => this.#csvEscape(data[r]));
      lines.push(vals.join(","));
    }
    const csv = lines.join("\n");
    const filename = `${(this.seriesName || "series").replace(/[^a-z0-9]/gi, "_")}_data.csv`;
    const dialogs = this._host?.dialogs;
    let result = null;
    if (dialogs) {
      try {
        result = await dialogs.saveFile({ data: csv, filename, kind: "csv" });
      } catch (err) {
        this.#notify("Download", "Failed to save file", "error");
        return;
      }
    }
    if (result) {
      if (result.ok) {
        this.#notify("Download", `Saved to ${result.path}`, "success");
      } else if (!result.cancelled) {
        this.#notify("Download", result.error || "Failed to save file", "error");
      }
    } else {
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    }
  }
  #csvEscape(value) {
    if (value == null) return "";
    const str = String(value);
    if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
    return str;
  }
  // ── Notifications ────────────────────────────────────────────────────
  #notify(title, message, severity = "info") {
    this.services.eventBus?.emit?.("toast:show", { title, message, type: severity });
  }
  // ── Disposal ─────────────────────────────────────────────────────────
  #dispose() {
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
    if (this.plotDiv && window.Plotly) {
      try {
        purge(this.plotDiv);
      } catch (e) {
      }
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
  /**
   * The config a series with no saved one opens with: the first numeric
   * column `classifyHeader` calls `'time'` is X (else the first numeric
   * column), and up to MAX_AUTO_COLUMNS other numeric columns are Y.
   *
   * Static, so it has no window: the header classifier is a parameter. A
   * window passes its own (`options.classifyHeader`); a caller that passes
   * none gets the default, which knows `t`/`time`/`step`/`period`.
   *
   * @param {string[]} headers
   * @param {Set<string>} [numericColumns] - absent => every column is numeric
   * @param {(header: string) => string} [classifyHeader=defaultClassifyHeader]
   */
  static createDefaultConfig(headers, numericColumns, classifyHeader = defaultClassifyHeader) {
    const isNumeric = numericColumns instanceof Set ? (h) => numericColumns.has(h) : () => true;
    let xColumn = "";
    for (const h of headers) {
      if (isNumeric(h) && classifyHeader(h) === "time") {
        xColumn = h;
        break;
      }
    }
    if (!xColumn) {
      for (const h of headers) {
        if (isNumeric(h)) {
          xColumn = h;
          break;
        }
      }
    }
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
      chartType: "line",
      showDataPoints: false,
      interpolation: "linear",
      legendPosition: "top"
    };
  }
};
var _openPlotWindows = /* @__PURE__ */ new Map();
async function openDataSeriesPlotWindow(options) {
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
function closeDataSeriesPlotWindow(seriesId) {
  const win = _openPlotWindows.get(seriesId);
  if (win) {
    win.close();
    _openPlotWindows.delete(seriesId);
  }
}

// src/charts/plot_config_editor.js
var CHART_TYPE_OPTIONS = Object.freeze([
  { group: "2D", options: CHART_TYPES_2D },
  { group: "3D", options: CHART_TYPES_3D }
]);
var SCALES = Object.freeze([{ value: "linear", label: "Linear" }, { value: "log", label: "Log" }]);
var POSITIONS = Object.freeze([{ value: "left", label: "Left" }, { value: "right", label: "Right" }]);
var DASHES = Object.freeze([
  { value: "solid", label: "Solid" },
  { value: "dashed", label: "Dashed" },
  { value: "dotted", label: "Dotted" }
]);
var LEGEND_POSITIONS2 = Object.freeze([
  { value: "hidden", label: "Hidden" },
  { value: "top", label: "Top" },
  { value: "bottom", label: "Bottom" },
  { value: "left", label: "Left" },
  { value: "right", label: "Right" }
]);
var INTERPOLATIONS = Object.freeze([
  { value: "auto", label: "Auto" },
  { value: "linear", label: "Linear" },
  { value: "step", label: "Step" },
  { value: "cubic", label: "Cubic spline" }
]);
var NAN_STRATEGIES = Object.freeze([
  { value: "gap", label: "Gap" },
  { value: "zero", label: "Zero" },
  { value: "hold", label: "Hold last value" },
  { value: "interpolate", label: "Interpolate" }
]);
var X_SOURCES = Object.freeze([{ value: "time", label: "Time" }, { value: "series", label: "Series" }]);
var OVERLAY_MODES = Object.freeze([
  { value: "markers+lines", label: "Markers and lines" },
  { value: "markers", label: "Markers" },
  { value: "lines", label: "Lines" }
]);
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = String(text);
  return node;
}
function button(text, onClick, { title = null, className = "twm-btn twm-plot-config__add" } = {}) {
  const b = el("button", className, text);
  b.type = "button";
  if (title) b.title = title;
  b.addEventListener("click", () => {
    if (!b.disabled) onClick();
  });
  return b;
}
function removeButton(title, onClick) {
  const b = button("", onClick, { title, className: "twm-btn-icon twm-plot-config__remove" });
  b.setAttribute("aria-label", title);
  b.appendChild(el("span", "material-symbols-outlined", "close"));
  return b;
}
function field(label, control) {
  const single = control.matches("input, select, textarea");
  const row = el(single ? "label" : "div", "twm-plot-config__field");
  row.append(el("span", "twm-plot-config__label", label), control);
  return row;
}
function textInput(value, onSet, { placeholder = "", label = null } = {}) {
  const input = el("input", "twm-plot-config__input");
  input.type = "text";
  input.value = value ?? "";
  input.placeholder = placeholder;
  if (label) input.setAttribute("aria-label", label);
  input.addEventListener("input", () => onSet(input.value));
  return input;
}
function numberInput(value, onSet, { placeholder = "Auto", label = null, min = null, max = null, step = "any" } = {}) {
  const input = el("input", "twm-plot-config__input twm-plot-config__input--number");
  input.type = "number";
  input.step = String(step);
  if (min != null) input.min = String(min);
  if (max != null) input.max = String(max);
  input.value = value == null ? "" : String(value);
  input.placeholder = placeholder;
  if (label) input.setAttribute("aria-label", label);
  input.addEventListener("change", () => {
    const n = parseFloat(input.value);
    onSet(Number.isFinite(n) ? n : null);
  });
  return input;
}
function select(options, value, onPick, { label = null, empty = null } = {}) {
  const s = selectBox(options, value, {
    label: label ?? "",
    empty,
    className: "twm-plot-config__input twm-plot-config__input--select"
  });
  s.box.addEventListener("change", () => onPick(s.valueOf()));
  return s.box;
}
function makeZAxis() {
  return { label: "", scale: "linear", min: null, max: null, step: null, variable: "" };
}
var editorCount = 0;
function renderPlotConfigEditor(container, config, options = {}) {
  const opts = {
    onChange: null,
    seriesProvider: null,
    overlaySources: null,
    seriesTransforms: null,
    extraSeriesFields: null,
    logger: null,
    ...options
  };
  const editorId = `twm-plot-config-${++editorCount}`;
  let fieldCount = 0;
  let active = 0;
  let disposed = false;
  let bodyDisposers = [];
  let generation = 0;
  const notify = () => {
    if (!disposed) opts.onChange?.(config);
  };
  const track = (fn) => {
    bodyDisposers.push(fn);
  };
  const template = () => PLOT_LAYOUTS[config.layout] || PLOT_LAYOUTS["1x1"];
  const slots = () => template().slots;
  function ensureSubplots() {
    if (!Array.isArray(config.subplots)) config.subplots = [];
    while (config.subplots.length < slots()) {
      config.subplots.push(makeDefaultSubplot(config.subplots.length));
    }
  }
  const root = el("div", "twm-plot-config");
  const layoutButtons = /* @__PURE__ */ new Map();
  const picker = el("div", "twm-plot-config__layouts");
  picker.setAttribute("role", "group");
  picker.setAttribute("aria-label", "Layout");
  for (const [key, tmpl] of Object.entries(PLOT_LAYOUTS)) {
    const b = button(tmpl.label, () => setLayout(key), { className: "twm-btn twm-plot-config__layout" });
    layoutButtons.set(key, b);
    picker.appendChild(b);
  }
  const syncLayoutButtons = () => {
    for (const [key, b] of layoutButtons) {
      const on = key === config.layout;
      b.setAttribute("aria-pressed", on ? "true" : "false");
      b.classList.toggle("twm-plot-config__layout--on", on);
    }
  };
  root.appendChild(section("Layout", picker));
  const tabsHost = el("div", "twm-plot-config__tabs");
  const body = el("div", "twm-plot-config__body");
  root.append(tabsHost, body);
  container.appendChild(root);
  ensureSubplots();
  const tabItems = () => Array.from({ length: slots() }, (_, i) => ({ id: i, label: `Subplot ${i + 1}` }));
  const tabs = createTabs(tabsHost, {
    items: tabItems(),
    active: 0,
    compact: true,
    label: "Subplots",
    onSelect: (id) => {
      if (id == null || id === active) return;
      active = id;
      renderBody();
    }
  });
  const syncChrome = () => {
    syncLayoutButtons();
    tabs.update(tabItems(), active);
    tabsHost.hidden = slots() < 2;
  };
  function setLayout(key) {
    if (disposed || key === config.layout) return;
    config.layout = key;
    ensureSubplots();
    active = Math.min(active, slots() - 1);
    syncChrome();
    renderBody();
    notify();
  }
  function section(title, ...children) {
    const s = el("section", "twm-plot-config__section");
    s.appendChild(el("h4", "twm-plot-config__heading", title));
    for (const child of children) if (child) s.appendChild(child);
    return s;
  }
  function disposeBody() {
    generation += 1;
    const disposers = bodyDisposers;
    bodyDisposers = [];
    for (const fn of disposers) {
      try {
        fn();
      } catch (error) {
        opts.logger?.warn?.("[plot config editor] a field failed to dispose", error);
      }
    }
  }
  function seriesPicker(target, key, role, sp, placeholder) {
    let alive = true;
    const ac = new AutocompleteField({
      fieldId: `${editorId}-field-${++fieldCount}`,
      field: { placeholder, value: target[key] ?? "" },
      skipNamespacePrefix: true,
      logger: opts.logger,
      provider: ({ value }) => opts.seriesProvider ? opts.seriesProvider({ value, role, subplot: sp }) : [],
      onChange: (value) => {
        if (!alive || (target[key] ?? "") === value) return;
        target[key] = value;
        notify();
      }
    });
    track(() => {
      alive = false;
      ac.dispose();
    });
    const node = ac.render();
    node.classList.add("twm-plot-config__picker");
    return node;
  }
  function colorField(value, onSet, label) {
    const f = new ColorField({
      value: value ?? "",
      label,
      onChange: (v) => {
        if (v !== null) {
          onSet(v || null);
          notify();
        }
      }
    });
    track(() => f.dispose());
    return f.render();
  }
  function toggle(label, checked, onSet) {
    const t = new ToggleField({ label, checked, compact: true, onChange: (on) => {
      onSet(on);
      notify();
    } });
    track(() => t.dispose());
    return t.render();
  }
  function listEditor(sp, key, { addLabel, makeItem, fields }) {
    if (!Array.isArray(sp[key])) sp[key] = [];
    const items = sp[key];
    const wrap = el("div", "twm-plot-config__list");
    items.forEach((item, i) => {
      const row = el("div", "twm-plot-config__row");
      row.append(...fields(item), removeButton("Remove", () => {
        items.splice(i, 1);
        renderBody();
        notify();
      }));
      wrap.appendChild(row);
    });
    wrap.appendChild(button(addLabel, () => {
      items.push(makeItem());
      renderBody();
      notify();
    }));
    return wrap;
  }
  function normalise(sp) {
    if (!sp.xAxis) sp.xAxis = { useTime: true, variable: "" };
    if (!Array.isArray(sp.yAxes) || !sp.yAxes.length) sp.yAxes = [makeDefaultYAxis(0)];
    for (const axis of sp.yAxes) if (!Array.isArray(axis.series)) axis.series = [];
    if (is3DChart(sp.chartType) && !sp.zAxis) sp.zAxis = makeZAxis();
  }
  function renderBody() {
    if (disposed) return;
    disposeBody();
    body.replaceChildren();
    const sp = config.subplots[active];
    if (!sp) return;
    normalise(sp);
    const is3D = is3DChart(sp.chartType);
    let sources = null;
    const overlaySources = () => sources ??= Promise.resolve().then(() => opts.overlaySources());
    body.append(...[
      section("Subplot", field("Title", textInput(
        sp.displayName,
        (v) => {
          sp.displayName = v;
          notify();
        },
        { placeholder: "Untitled" }
      ))),
      section("Display", ...displayFields(sp)),
      section("X axis", ...xAxisFields(sp)),
      section("Y axes", yAxesEditor(sp, is3D, overlaySources)),
      is3D ? section("Z axis", ...zAxisFields(sp)) : null,
      section("Reference lines", referenceLinesEditor(sp)),
      section("Shaded bands", shadedBandsEditor(sp)),
      transformsSection(sp)
    ].filter(Boolean));
  }
  function displayFields(sp) {
    return [
      field("Chart type", select(CHART_TYPE_OPTIONS, sp.chartType ?? "line", (v) => {
        const was3D = is3DChart(sp.chartType);
        sp.chartType = v;
        const now3D = is3DChart(v);
        if (now3D) sp.zAxis ??= makeZAxis();
        else sp.zAxis = null;
        if (was3D !== now3D) renderBody();
        notify();
      })),
      field("Legend", select(
        LEGEND_POSITIONS2,
        sp.legendPosition ?? "hidden",
        (v) => {
          sp.legendPosition = v;
          notify();
        }
      )),
      field("Interpolation", select(
        INTERPOLATIONS,
        sp.interpolation ?? "linear",
        (v) => {
          sp.interpolation = v;
          notify();
        }
      )),
      field("Missing values", select(
        NAN_STRATEGIES,
        sp.nanHandling ?? "gap",
        (v) => {
          sp.nanHandling = v;
          notify();
        }
      )),
      toggle("Data points", sp.showDataPoints === true, (on) => {
        sp.showDataPoints = on;
      })
    ];
  }
  function xAxisFields(sp) {
    const useTime = sp.xAxis.useTime !== false;
    const out = [field("Against", select(X_SOURCES, useTime ? "time" : "series", (v) => {
      sp.xAxis.useTime = v === "time";
      renderBody();
      notify();
    }))];
    if (!useTime) {
      out.push(
        field("Series", seriesPicker(sp.xAxis, "variable", "x", sp, "X series")),
        field("Label", textInput(
          sp.xAxis.label,
          (v) => {
            sp.xAxis.label = v;
            notify();
          },
          { placeholder: sp.xAxis.variable || "Axis title" }
        ))
      );
    }
    return out;
  }
  function zAxisFields(sp) {
    const z = sp.zAxis;
    return [
      field("Series", seriesPicker(z, "variable", "z", sp, "Z series")),
      field("Label", textInput(z.label, (v) => {
        z.label = v;
        notify();
      }, { placeholder: "Axis title" })),
      field("Scale", select(SCALES, z.scale ?? "linear", (v) => {
        z.scale = v;
        notify();
      })),
      field("Min", numberInput(z.min, (v) => {
        z.min = v;
        notify();
      })),
      field("Max", numberInput(z.max, (v) => {
        z.max = v;
        notify();
      })),
      field("Step", numberInput(z.step, (v) => {
        z.step = v;
        notify();
      }))
    ];
  }
  function yAxesEditor(sp, is3D, overlaySources) {
    const wrap = el("div", "twm-plot-config__axes");
    sp.yAxes.forEach((axis, i) => wrap.appendChild(yAxisEditor(sp, axis, i, is3D, overlaySources)));
    const add = button("Add Y axis", () => {
      sp.yAxes.push(makeDefaultYAxis(sp.yAxes.length));
      renderBody();
      notify();
    }, { title: is3D ? "A 3D chart has one Y axis" : null });
    add.disabled = is3D;
    wrap.appendChild(add);
    return wrap;
  }
  function yAxisEditor(sp, axis, index, is3D, overlaySources) {
    const group = el("fieldset", "twm-plot-config__axis");
    const legend = el("legend", "twm-plot-config__axis-title", `Y axis ${index + 1}`);
    group.appendChild(legend);
    if (sp.yAxes.length > 1) {
      legend.appendChild(removeButton("Remove Y axis", () => {
        sp.yAxes.splice(index, 1);
        renderBody();
        notify();
      }));
    }
    if (is3D && index > 0) {
      group.disabled = true;
      group.classList.add("twm-plot-config__axis--disabled");
      group.title = "A 3D chart uses the first Y axis only";
    }
    const fields = el("div", "twm-plot-config__axis-fields");
    fields.append(
      field("Label", textInput(axis.label, (v) => {
        axis.label = v;
        notify();
      }, { placeholder: "Axis title" })),
      field("Scale", select(SCALES, axis.scale ?? "linear", (v) => {
        axis.scale = v;
        notify();
      })),
      field("Position", select(POSITIONS, axis.position ?? "left", (v) => {
        axis.position = v;
        notify();
      })),
      field("Min", numberInput(axis.min, (v) => {
        axis.min = v;
        notify();
      })),
      field("Max", numberInput(axis.max, (v) => {
        axis.max = v;
        notify();
      })),
      field("Step", numberInput(axis.step, (v) => {
        axis.step = v;
        notify();
      }))
    );
    group.appendChild(fields);
    const list = el("div", "twm-plot-config__series-list");
    if (!axis.series.length) list.appendChild(el("div", "twm-plot-config__empty", "No series."));
    for (const s of axis.series) list.appendChild(seriesRow(sp, axis, s, overlaySources));
    group.appendChild(list);
    group.appendChild(button("Add series", () => {
      const count = sp.yAxes.reduce((n, a) => n + (a.series?.length ?? 0), 0);
      axis.series.push(makeDefaultSeries(count));
      renderBody();
      notify();
    }));
    return group;
  }
  function seriesRow(sp, axis, s, overlaySources) {
    const row = el("div", "twm-plot-config__series");
    const main = el("div", "twm-plot-config__series-main");
    main.append(
      seriesPicker(s, "variable", "series", sp, "Series"),
      textInput(s.label, (v) => {
        s.label = v;
        notify();
      }, { placeholder: "Legend label", label: "Legend label" }),
      colorField(s.color, (v) => {
        if (v) s.color = v;
        else delete s.color;
      }, "Colour"),
      numberInput(
        s.lineWidth ?? 2,
        (v) => {
          s.lineWidth = v ?? 2;
          notify();
        },
        { placeholder: "2", label: "Line width", min: 1, max: 10, step: 1 }
      ),
      select(DASHES, s.lineStyle ?? "solid", (v) => {
        s.lineStyle = v;
        notify();
      }, { label: "Dash" }),
      textInput(
        s.stackGroup,
        (v) => {
          s.stackGroup = v || null;
          notify();
        },
        { placeholder: "Stack group", label: "Stack group" }
      ),
      removeButton("Remove series", () => {
        const i = axis.series.indexOf(s);
        if (i >= 0) axis.series.splice(i, 1);
        renderBody();
        notify();
      })
    );
    row.appendChild(main);
    if (opts.extraSeriesFields) {
      const extra = el("div", "twm-plot-config__series-extra");
      row.appendChild(extra);
      const handle = opts.extraSeriesFields(extra, s, { subplot: sp, axis, onChange: notify });
      if (typeof handle?.dispose === "function") track(() => handle.dispose());
    }
    if (opts.overlaySources) row.appendChild(overlayEditor(s, overlaySources));
    return row;
  }
  function overlayEditor(s, overlaySources) {
    const wrap = el("div", "twm-plot-config__overlay");
    const head = el("div", "twm-plot-config__overlay-source", "Loading overlay sources\u2026");
    const details = el("div", "twm-plot-config__overlay-fields");
    wrap.append(head, details);
    const drawDetails = () => {
      details.replaceChildren();
      const ov = s.overlay;
      if (!ov) return;
      details.append(
        field("Label", textInput(
          ov.label,
          (v) => {
            ov.label = v;
            notify();
          },
          { placeholder: `${s.label || s.variable || "Series"} (actual)` }
        )),
        field("Colour", colorField(ov.color, (v) => {
          if (v) ov.color = v;
          else delete ov.color;
        }, "Overlay colour")),
        field("Dash", select(DASHES, ov.lineStyle ?? "dashed", (v) => {
          ov.lineStyle = v;
          notify();
        })),
        field("Width", numberInput(
          ov.lineWidth ?? 2,
          (v) => {
            ov.lineWidth = v ?? 2;
            notify();
          },
          { placeholder: "2", min: 1, max: 10, step: 1 }
        )),
        field("Mode", select(OVERLAY_MODES, ov.mode ?? "markers+lines", (v) => {
          ov.mode = v;
          notify();
        }))
      );
    };
    const gen = generation;
    overlaySources().then((list) => {
      if (disposed || gen !== generation) return;
      head.replaceChildren(field("Overlay", select(Array.isArray(list) ? list : [], s.overlay?.source, (v) => {
        if (v === void 0) delete s.overlay;
        else s.overlay = { ...s.overlay ?? {}, source: v };
        drawDetails();
        notify();
      }, { empty: "None" })));
      drawDetails();
    }, () => {
      if (disposed || gen !== generation) return;
      head.textContent = "Could not load overlay sources.";
      head.classList.add("twm-plot-config__overlay-source--error");
    });
    return wrap;
  }
  function referenceLinesEditor(sp) {
    const axisOptions = sp.yAxes.map((a, i) => ({ value: a.id, label: a.label || `Y axis ${i + 1}` }));
    return listEditor(sp, "referenceLines", {
      addLabel: "Add reference line",
      makeItem: () => ({ yAxisId: sp.yAxes[0].id, value: 0, label: "", lineStyle: "dashed" }),
      fields: (line) => [
        select(
          axisOptions,
          line.yAxisId ?? sp.yAxes[0].id,
          (v) => {
            line.yAxisId = v;
            notify();
          },
          { label: "Axis" }
        ),
        numberInput(line.value, (v) => {
          line.value = v;
          notify();
        }, { placeholder: "Value", label: "Value" }),
        textInput(line.label, (v) => {
          line.label = v;
          notify();
        }, { placeholder: "Label", label: "Label" }),
        colorField(line.color, (v) => {
          if (v) line.color = v;
          else delete line.color;
        }, "Colour"),
        select(DASHES, line.lineStyle ?? "dashed", (v) => {
          line.lineStyle = v;
          notify();
        }, { label: "Dash" })
      ]
    });
  }
  function shadedBandsEditor(sp) {
    return listEditor(sp, "shadedBands", {
      addLabel: "Add shaded band",
      makeItem: () => ({ x0: null, x1: null, label: "" }),
      fields: (band) => [
        numberInput(band.x0, (v) => {
          band.x0 = v;
          notify();
        }, { placeholder: "From", label: "From" }),
        numberInput(band.x1, (v) => {
          band.x1 = v;
          notify();
        }, { placeholder: "To", label: "To" }),
        textInput(band.label, (v) => {
          band.label = v;
          notify();
        }, { placeholder: "Label", label: "Label" }),
        colorField(band.color, (v) => {
          if (v) band.color = v;
          else delete band.color;
        }, "Colour"),
        numberInput(band.opacity, (v) => {
          if (v == null) delete band.opacity;
          else band.opacity = v;
          notify();
        }, { placeholder: "Opacity", label: "Opacity", min: 0, max: 1, step: 0.05 })
      ]
    });
  }
  function transformsSection(sp) {
    if (!Object.keys(opts.seriesTransforms ?? {}).length) return null;
    const s = section("Derived series");
    const controls = renderSeriesTransformControls(s, sp, opts.seriesTransforms, { onChange: notify });
    track(() => controls.dispose());
    return s;
  }
  syncChrome();
  renderBody();
  return {
    /** Dispose every field it created and remove the editor. Later calls do nothing. */
    dispose() {
      if (disposed) return;
      disposed = true;
      disposeBody();
      tabs.destroy();
      root.remove();
    },
    /** Redraw from the config, after it was changed from outside. */
    refresh() {
      if (disposed) return;
      ensureSubplots();
      active = Math.min(active, slots() - 1);
      syncChrome();
      renderBody();
    },
    /** Bring subplot `index` to the front. */
    selectSubplot(index) {
      if (disposed || !Number.isInteger(index) || index < 0 || index >= slots()) return;
      tabs.select(index);
    },
    /** The index of the subplot in front. */
    get activeSubplot() {
      return active;
    }
  };
}
export {
  ALL_CHART_TYPES,
  CHART_TYPES_2D,
  CHART_TYPES_3D,
  COLOR_PALETTE,
  DARK_THEME_LAYOUT,
  DEFAULT_CHART_EXPORT_FILENAME,
  DEFAULT_CONFIG,
  PLOT_GRID_THEME,
  PLOT_LAYOUTS,
  PlotPopoutWindow,
  applyNanHandling,
  build3DSceneLayout,
  buildBoxTrace,
  buildFanBandTraces,
  buildHeatmapTrace,
  buildHistogramTrace,
  buildIndicatorTrace,
  buildLegendLayout,
  buildOverlayShapes,
  buildTrace,
  buildXAxisLayout,
  buildYAxisLayout,
  closeDataSeriesPlotWindow,
  createChart,
  createChartDeferred,
  deriveSeriesTraces,
  ensurePlotly,
  extendTraces,
  getChartExportFilename,
  getSeriesColor,
  hasPlot,
  hexToRgba,
  is3DChart,
  lttb,
  makeDefaultSeries,
  makeDefaultSubplot,
  makeDefaultYAxis,
  migrateData,
  migrateSingleChart,
  openDataSeriesPlotWindow,
  openPlotPopoutWindow,
  openRawTracesWindow,
  purge,
  relayout,
  renderPlotConfigEditor,
  renderPlotGrid,
  renderSeriesTransformControls,
  resize,
  resolveSeriesData,
  restyle,
  setChartExportFilename,
  setPlotlySource,
  strideDownsampleShared,
  strideIndices,
  uid,
  updateChart
};
//# sourceMappingURL=charts.js.map
