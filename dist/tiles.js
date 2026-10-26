import {
  TileRegistry,
  createWidget,
  getAllWidgetTypes,
  getWidget,
  getWidgetCatalog,
  getWidgetMetadata,
  hasWidget,
  init_tile_registry,
  registerWidget,
  setTileLogger,
  tile_registry_exports
} from "./chunk-FOOS3T5L.js";
import {
  ActionDropdown,
  SlideOutPanel
} from "./chunk-MIW7D6WC.js";
import {
  showContextMenu
} from "./chunk-7JI7HHSY.js";
import {
  modalHost,
  openModal
} from "./chunk-XJNADRGR.js";
import {
  buildHistogramTrace,
  buildLegendLayout,
  buildOverlayShapes,
  buildTrace,
  buildXAxisLayout,
  buildYAxisLayout,
  createChart,
  ensurePlotly,
  getSeriesColor,
  openRawTracesWindow,
  purge,
  resize,
  strideDownsampleShared
} from "./chunk-7OL6F2AM.js";
import "./chunk-2Z2ENHR3.js";
import {
  isHexColor
} from "./chunk-PGZ4EHSE.js";
import "./chunk-HNU6MM2B.js";
import "./chunk-WUFLGETN.js";
import {
  __toCommonJS
} from "./chunk-JYWURG5T.js";

// src/tiles/config_schema.js
var FieldTypes = {
  TEXT: "text",
  NUMBER: "number",
  CHECKBOX: "checkbox",
  SELECT: "select",
  MULTISELECT: "multiselect",
  COLOR: "color",
  RANGE: "range"
};
function validateField(value, field) {
  if (field.required && (value == null || value === "")) {
    return { valid: false, error: `${field.label} is required` };
  }
  switch (field.type) {
    case FieldTypes.NUMBER:
    case FieldTypes.RANGE:
      if (value != null && value !== "") {
        const num = parseFloat(value);
        if (isNaN(num)) {
          return { valid: false, error: `${field.label} must be a number` };
        }
        if (field.min != null && num < field.min) {
          return { valid: false, error: `${field.label} must be at least ${field.min}` };
        }
        if (field.max != null && num > field.max) {
          return { valid: false, error: `${field.label} must be at most ${field.max}` };
        }
      }
      break;
    case FieldTypes.SELECT:
      if (field.required && !value) {
        return { valid: false, error: `${field.label} must be selected` };
      }
      break;
    case FieldTypes.COLOR:
      if (value != null && value !== "" && !isHexColor(value)) {
        return { valid: false, error: `${field.label} must be a hex colour (#rgb or #rrggbb)` };
      }
      break;
    case FieldTypes.MULTISELECT:
      if (field.required && (!Array.isArray(value) || value.length === 0)) {
        return { valid: false, error: `${field.label} must have at least one selection` };
      }
      break;
  }
  return { valid: true };
}
function validateConfig(config, schema) {
  const errors = {};
  let valid = true;
  if (!schema?.fields) {
    return { valid: true, errors: {} };
  }
  schema.fields.forEach((field) => {
    const result = validateField(config[field.key], field);
    if (!result.valid) {
      errors[field.key] = result.error;
      valid = false;
    }
  });
  return { valid, errors };
}
function mergeWithDefaults(config, schema) {
  const result = { ...config };
  if (schema?.fields) {
    schema.fields.forEach((field) => {
      if (result[field.key] === void 0 && field.default !== void 0) {
        result[field.key] = field.default;
      }
    });
  }
  return result;
}
function getFieldOptions(field, data) {
  if (Array.isArray(field.options)) {
    return field.options;
  }
  if (field.options === "variables") {
    return getVariableOptions(data);
  }
  if (field.options === "namespaces") {
    return getNamespaceOptions(data);
  }
  return [];
}
function formatVariableLabel(name) {
  if (!name) return "";
  let label = name;
  const dotIdx = label.indexOf(".");
  if (dotIdx > 0) {
    label = label.slice(dotIdx + 1);
  }
  label = label.replace(/^__\w+__::/, "");
  label = label.replace(/\[State\]$/i, "");
  label = label.replace(/\[Rate\]$/i, "");
  label = label.replace(/\[\]$/, "");
  label = label.replace(/::/g, " / ");
  label = label.replace(/:/g, "_");
  return label.replace(/\s{2,}/g, " ").trim();
}
function getVariableOptions(data) {
  const options = [];
  if (!data) return options;
  if (data.stocks) {
    Object.keys(data.stocks).forEach((name) => {
      options.push({
        value: name,
        label: formatVariableLabel(name),
        category: "Stocks"
      });
    });
  }
  if (data.flows) {
    Object.keys(data.flows).forEach((name) => {
      options.push({
        value: name,
        label: formatVariableLabel(name),
        category: "Flows"
      });
    });
  }
  if (data.indicators) {
    Object.keys(data.indicators).forEach((name) => {
      options.push({
        value: name,
        label: formatVariableLabel(name),
        category: "Indicators"
      });
    });
  }
  return options;
}
function getNamespaceOptions(data) {
  const namespaces = /* @__PURE__ */ new Set();
  const sources = [data?.stocks, data?.flows, data?.indicators];
  for (const source of sources) {
    if (!source) continue;
    for (const key of Object.keys(source)) {
      const dotIdx = key.indexOf(".");
      if (dotIdx > 0) {
        namespaces.add(key.slice(0, dotIdx));
      }
    }
  }
  if (namespaces.size === 0) namespaces.add("Main");
  return Array.from(namespaces).sort().map((ns) => ({ value: ns, label: ns }));
}

// src/tiles/tile_base.js
var TileBase = class {
  /** @type {string} Widget type identifier - override in subclass */
  static TYPE = "base";
  /** @type {string} Display title - override in subclass */
  static TITLE = "Widget";
  /** @type {{w: number, h: number}} Default grid size - override in subclass */
  static DEFAULT_SIZE = { w: 4, h: 3 };
  /** @type {{minW: number, minH: number, maxW: number, maxH: number}} Size constraints */
  static SIZE_CONSTRAINTS = { minW: 2, minH: 2, maxW: 12, maxH: 8 };
  /** @type {boolean} Whether widget can be expanded to a separate window - override in subclass */
  static EXPANDABLE = false;
  /** @type {boolean} Whether widget supports scenario comparison overlay - override in subclass */
  static SUPPORTS_COMPARISON = false;
  /**
   * @param {Object} options
   * @param {string} options.id - Unique tile identifier
   * @param {Object} options.grid - Parent TileGrid instance
   * @param {Object} [options.eventBus] - Event bus for cross-component communication
   * @param {Object} [options.config] - Widget-specific configuration
   * @param {boolean} [options.headless] - If true, mount without tile chrome (header, controls)
   * @param {{resolve: Function}} [options.dataSource] - Where this tile asks for its
   *        own rows. Handed down by `TileGrid`; absent for a grid whose data is
   *        broadcast with `setData()`, and then nothing ever calls `loadData()`.
   * @param {boolean} [options.configOnDoubleClick=true] - A double-click on the
   *        title strip (not on its buttons or an editable field in it) does what
   *        the cogwheel does. False leaves the cogwheel as the only way in.
   */
  constructor({
    id,
    grid,
    eventBus = null,
    config = {},
    readonly = false,
    headless = false,
    host = null,
    stateGuard = null,
    dataSource = null,
    configOnDoubleClick = true
  }) {
    this.host = host;
    this.dataSource = dataSource;
    this.stateGuard = stateGuard;
    this.id = id;
    this.grid = grid;
    this.eventBus = eventBus;
    this.config = { ...this.getDefaultConfig(), ...config };
    this.readonly = readonly;
    this.headless = headless;
    this.configOnDoubleClick = configOnDoubleClick;
    this._configuring = false;
    this.element = null;
    this.contentElement = null;
    this.chartInstance = null;
    this.data = null;
    this.fullData = null;
    this._disposed = false;
    this._lastLoadedAt = null;
    this._loadSeq = 0;
    this.comparisonData = null;
    this.scope = null;
  }
  /**
   * Called when the board's scope changes (`TileGrid.setScope`), after
   * `this.scope` is set. A no-op here: a tile whose rows the grid's data
   * source loads is reloaded by the grid, and one fed through `setData` is
   * fed again by whoever owns its data.
   * @param {*} _scope
   */
  onScopeChange(_scope) {
  }
  /**
   * Set comparison data for overlay rendering.
   * Only meaningful for widgets where SUPPORTS_COMPARISON = true.
   * @param {Map<string, Object>|null} comparisonData
   */
  setComparisonData(comparisonData) {
    this.comparisonData = comparisonData;
    if (this.data && this.contentElement) {
      this.render(this.data);
    }
  }
  /**
   * Format a raw analytics variable key into a user-friendly display label.
   * Strips namespace prefixes, internal Godley patterns, and stock type suffixes.
   * @param {string} name - Raw variable key
   * @returns {string} Friendly display label
   */
  formatLabel(name) {
    return formatVariableLabel(name);
  }
  /**
   * Look up the unit string for a variable from analytics metadata.
   * Checks stocks, flows, and indicators for unit metadata.
   * @param {string} varName - Variable name
   * @returns {string|null} Unit string or null
   */
  getVariableUnit(varName) {
    if (!varName || !this.data) return null;
    const sources = [this.data.stocks, this.data.flows, this.data.indicators];
    for (const source of sources) {
      const varData = source?.[varName];
      if (varData?.unit) return varData.unit;
    }
    return null;
  }
  /**
   * Look up a variable across stocks, flows, and indicators.
   * If the variable is not found, returns the first available variable
   * and updates the config key so the widget self-heals.
   * @param {Object} data - Analytics data
   * @param {string} configKey - Config property name (e.g. 'variable', 'xVariable')
   * @returns {{varData: any, varName: string}|null} Resolved data or null if no data at all
   */
  resolveVariable(data, configKey = "variable") {
    const varName = this.config[configKey];
    if (varName) {
      const varData = data.stocks?.[varName] || data.indicators?.[varName] || data.flows?.[varName];
      if (varData) return { varData, varName };
      const dotIdx = varName.indexOf(".");
      if (dotIdx >= 0) {
        const bare = varName.slice(dotIdx + 1);
        const bareData = data.stocks?.[bare] || data.indicators?.[bare] || data.flows?.[bare];
        if (bareData) return { varData: bareData, varName: bare };
      }
      if (dotIdx < 0) {
        const suffix = `.${varName}`;
        for (const source of [data.stocks, data.indicators, data.flows]) {
          if (!source) continue;
          const match = Object.keys(source).find((k) => k.endsWith(suffix));
          if (match) return { varData: source[match], varName: match };
        }
      }
      if (this.fullData && this.fullData !== data) {
        const fullVarData = this.fullData.stocks?.[varName] || this.fullData.indicators?.[varName] || this.fullData.flows?.[varName];
        if (fullVarData) return { varData: fullVarData, varName };
        if (dotIdx >= 0) {
          const bare = varName.slice(dotIdx + 1);
          const fullBareData = this.fullData.stocks?.[bare] || this.fullData.indicators?.[bare] || this.fullData.flows?.[bare];
          if (fullBareData) return { varData: fullBareData, varName: bare };
        }
        if (dotIdx < 0) {
          const suffix = `.${varName}`;
          for (const source of [this.fullData.stocks, this.fullData.indicators, this.fullData.flows]) {
            if (!source) continue;
            const match = Object.keys(source).find((k) => k.endsWith(suffix));
            if (match) return { varData: source[match], varName: match };
          }
        }
      }
    }
    const sources = [data.stocks, data.indicators, data.flows];
    for (const source of sources) {
      if (!source) continue;
      const keys = Object.keys(source);
      if (keys.length > 0) {
        this.config[configKey] = keys[0];
        return { varData: source[keys[0]], varName: keys[0] };
      }
    }
    return null;
  }
  /**
   * Find a variable by name in data, trying exact match then suffix match.
   * Does NOT auto-fallback to first available variable.
   * @param {Object} data - Analytics data with stocks/indicators/flows
   * @param {string} varName - Variable name (bare or namespace-prefixed)
   * @returns {{varData: any, varName: string}|null}
   */
  static findVariable(data, varName) {
    if (!data || !varName) return null;
    for (const source of [data.stocks, data.indicators, data.flows]) {
      if (!source) continue;
      if (source[varName]) return { varData: source[varName], varName };
    }
    const dotIdx = varName.indexOf(".");
    if (dotIdx < 0) {
      const suffix = `.${varName}`;
      for (const source of [data.stocks, data.indicators, data.flows]) {
        if (!source) continue;
        const match = Object.keys(source).find((k) => k.endsWith(suffix));
        if (match) return { varData: source[match], varName: match };
      }
    } else {
      const bare = varName.slice(dotIdx + 1);
      for (const source of [data.stocks, data.indicators, data.flows]) {
        if (!source) continue;
        if (source[bare]) return { varData: source[bare], varName: bare };
      }
    }
    return null;
  }
  /**
   * Get default configuration for this widget type.
   * Override in subclass.
   * @returns {Object} Default config object
   */
  getDefaultConfig() {
    return {};
  }
  /**
   * Get configuration schema for the config modal.
   * Override in subclass.
   * @returns {Object} Schema definition
   */
  getConfigSchema() {
    return { fields: [] };
  }
  /**
   * Render widget content with data.
   * Override in subclass.
   * @param {Object} data - Analytics data
   */
  render(data) {
    throw new Error("TileBase.render() must be implemented by subclass");
  }
  /**
   * Mount the tile into the container.
   * @param {HTMLElement} container - Parent container
   */
  mount(container) {
    if (this._disposed) return;
    this.element = document.createElement("div");
    this.element.className = `tile${this.readonly ? " tile--readonly" : ""}${this._configuring ? " tile--configuring" : ""}`;
    const stateGuard = this.stateGuard;
    const setDataset = () => {
      this.element.dataset.tileId = this.id;
      this.element.dataset.tileType = this.constructor.TYPE;
    };
    if (stateGuard?.executeWithBypass) {
      stateGuard.executeWithBypass("tile-mount", setDataset);
    } else {
      setDataset();
    }
    if (this.headless) {
      this.contentElement = document.createElement("div");
      this.contentElement.className = "tile-content";
      this.element.appendChild(this.contentElement);
    } else {
      this._buildChrome();
    }
    container.appendChild(this.element);
  }
  /**
   * Update the widget with new data and/or config.
   * @param {Object} [data] - New analytics data
   * @param {Object} [config] - New config values to merge
   */
  update(data, config) {
    if (this._disposed) return;
    if (config) {
      const prevDocs = (this.config?.docs || "").trim();
      this.config = { ...this.config, ...config };
      const nextDocs = (this.config?.docs || "").trim();
      if (this.element && !this.headless && prevDocs !== nextDocs) {
        this._syncInfoButton();
      }
    }
    if (data !== void 0) {
      this.data = data;
    }
    if (this.data && this.contentElement) {
      this.render(this.data);
    }
  }
  /**
   * Load this tile's own data from `this.dataSource` and render it.
   *
   * A NO-OP HERE ON PURPOSE. The base class knows nothing about what a binding
   * is or what a dataset looks like — those belong to the consumer, and the
   * consumer that has them (Tables' `TablesTile`) implements this in ~30 lines
   * over `showLoading()` / `render()` / `showError()`. What upstream owns is the
   * CALL SITES: `TileGrid` invokes this after mount, after a resize settles and
   * after a config save, but only when a `dataSource` was injected. Making it a
   * hook rather than an implementation is what keeps EcoAgent's broadcast path
   * (`setData` -> `update`) bit-identical: with no data source nothing here ever
   * runs.
   *
   * @param {{force?: boolean}} [_opts] - `force` bypasses the source's cache.
   * @returns {Promise<void>}
   */
  async loadData(_opts = {}) {
  }
  /**
   * Called once after a drag-resize settles, for widgets whose content does not
   * reflow on its own — a Plotly figure sizes itself at draw time and stays that
   * size until something calls `Plotly.Plots.resize`. Deliberately NOT wired to a
   * ResizeObserver: the grid already knows when a resize ended, and an observer
   * per tile fires during the drag, which is a relayout per pointer-move.
   */
  onResize() {
  }
  /** Add, update, or remove the info (ⓘ) button in the header to match current docs state. */
  _syncInfoButton() {
    const header = this.element?.querySelector(".tile-header");
    const controls = header?.querySelector(".tile-controls");
    if (!controls) return;
    const docs = (this.config?.docs || "").trim();
    let btn = controls.querySelector(".tile-info-btn");
    if (docs) {
      if (!btn) {
        btn = document.createElement("button");
        btn.className = "tile-info-btn twm-has-tooltip";
        btn.type = "button";
        btn.tabIndex = -1;
        btn.style.cssText = "background:transparent;border:none;padding:2px;color:rgba(255,255,255,0.55);cursor:help;display:inline-flex;align-items:center;justify-content:center;";
        btn.setAttribute("data-tooltip-placement", "bottom");
        btn.setAttribute("data-tooltip-max-width", "420px");
        btn.innerHTML = '<span class="material-symbols-outlined" style="font-size:18px;">info</span>';
        btn.addEventListener("click", (e) => e.stopPropagation());
        const anchor = controls.querySelector(".tile-expand-btn") ?? controls.querySelector(".tile-remove-btn");
        if (anchor) controls.insertBefore(btn, anchor);
        else controls.appendChild(btn);
      }
      btn.setAttribute("data-tooltip", docs);
    } else if (btn) {
      btn.remove();
    }
  }
  /**
   * Clean up resources and remove from DOM.
   */
  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this._closeTileMenu();
    this._menuButton = null;
    this._menuDropdown = null;
    this._menuHome = null;
    if (this._expandWindow?.isVisible) {
      this._expandWindow.close();
    }
    this._expandWindow = null;
    if (this.chartInstance) {
      this.chartInstance.destroy();
      this.chartInstance = null;
    }
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
    this.element = null;
    this.contentElement = null;
    this.data = null;
    this.fullData = null;
  }
  /**
   * The entries in the tile's ⋯ menu, as `{action, label, icon, hidden}`.
   *
   * This existed as a LITERAL inside `_buildChrome`, and the literal was
   * EcoAgent's: "Add to Documentation" and "Show in Documentation". Both are
   * meaningful only for a tile whose `config.sourceCellId` names a notebook
   * cell, and the first one's hide condition is `sourceCellId && already-added` —
   * so on a tile that has no `sourceCellId` at all it renders VISIBLE, and
   * choosing it emits `tile:add-to-documentation` at an application that has no
   * documentation. Every consumer other than EcoAgent therefore shipped a menu
   * item that did nothing, and could not remove it without editing this file.
   *
   * Returning `[]` drops the whole wrapper — button, dropdown and all — because
   * a ⋯ button that opens an empty menu reads as a broken feature rather than
   * an absent one. The default is the two entries above, so EcoAgent's chrome
   * is unchanged.
   *
   * Selection is routed through `_onMenuAction()`; override both together.
   * @returns {Array<{action: string, label: string, icon?: string, hidden?: boolean}>}
   */
  menuItems() {
    const linked = !!(this.config?.sourceCellId && this.grid?.documentationCellIds?.has(this.config.sourceCellId));
    return [
      {
        action: "add-to-documentation",
        label: "Add to Documentation",
        icon: "post_add",
        hidden: linked
      },
      {
        action: "show-in-documentation",
        label: "Show in Documentation",
        icon: "description",
        hidden: !linked
      }
    ];
  }
  /**
   * Act on a ⋯ menu selection. One dispatch point for every entry, so an
   * override of `menuItems()` cannot add a row that has nothing behind it, and
   * an unrecognised action is silently ignored rather than throwing into a
   * click handler.
   * @param {string} action
   * @protected
   */
  _onMenuAction(action) {
    if (action === "add-to-documentation") {
      this.eventBus?.emit?.("tile:add-to-documentation", {
        tileType: this.constructor.TYPE,
        config: { ...this.config }
      });
    } else if (action === "show-in-documentation") {
      if (this.config?.sourceCellId) {
        this.eventBus?.emit?.("tile:show-in-documentation", {
          sourceCellId: this.config.sourceCellId
        });
      }
    }
  }
  /**
   * Build the tile chrome (header, content area, resize handles).
   * @private
   */
  _buildChrome() {
    this._closeTileMenu();
    this._menuButton = null;
    this._menuDropdown = null;
    this._menuHome = null;
    const header = document.createElement("div");
    header.className = "tile-header";
    const expandBtnHtml = this.constructor.EXPANDABLE ? `<button class="tile-expand-btn twm-has-tooltip" data-tooltip="Open in window">
                   <span class="material-symbols-outlined">open_in_new</span>
               </button>` : "";
    const docs = (this.config?.docs || "").trim();
    const infoBtnHtml = docs ? `<button class="tile-info-btn twm-has-tooltip" type="button" tabindex="-1"
                       data-tooltip="${this.#escapeAttr(docs)}"
                       data-tooltip-placement="bottom"
                       data-tooltip-max-width="420px"
                       style="background:transparent;border:none;padding:2px;color:rgba(255,255,255,0.55);cursor:help;display:inline-flex;align-items:center;justify-content:center;">
                   <span class="material-symbols-outlined" style="font-size:18px;">info</span>
               </button>` : "";
    const menuEntries = (this.readonly ? [] : this.menuItems()) ?? [];
    const menuHtml = menuEntries.length ? `<div class="tile-menu-wrapper">
                        <button class="tile-menu-btn twm-has-tooltip" data-tooltip="More actions">
                            <span class="material-symbols-outlined">more_vert</span>
                        </button>
                        <div class="tile-menu-dropdown" hidden>
                            ${menuEntries.map((item) => `
                            <button class="tile-menu-item" data-action="${this.#escapeAttr(item.action)}"${item.hidden ? ' style="display:none"' : ""}>
                                ${item.icon ? `<span class="material-symbols-outlined">${this.#escapeAttr(item.icon)}</span>` : ""}
                                <span>${this.#escapeAttr(item.label ?? "")}</span>
                            </button>`).join("")}
                        </div>
                    </div>` : "";
    if (this.readonly) {
      header.innerHTML = `
                <span class="tile-title">${this.constructor.TITLE}</span>
                <div class="tile-controls">
                    ${infoBtnHtml}
                    ${expandBtnHtml}
                </div>
            `;
    } else {
      header.innerHTML = `
                <span class="tile-drag-handle twm-has-tooltip" data-tooltip="Drag to reposition">
                    <span class="material-symbols-outlined">drag_indicator</span>
                </span>
                <span class="tile-title">${this.constructor.TITLE}</span>
                <div class="tile-controls">
                    <button class="tile-config-btn twm-has-tooltip" data-tooltip="Configure">
                        <span class="material-symbols-outlined">settings</span>
                    </button>
                    ${menuHtml}
                    ${infoBtnHtml}
                    ${expandBtnHtml}
                    <button class="tile-remove-btn twm-has-tooltip" data-tooltip="Remove widget">
                        <span class="material-symbols-outlined">close</span>
                    </button>
                </div>
            `;
    }
    const expandBtn = header.querySelector(".tile-expand-btn");
    expandBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      this._onExpandClick();
    });
    const infoBtn = header.querySelector(".tile-info-btn");
    infoBtn?.addEventListener("click", (e) => e.stopPropagation());
    if (!this.readonly) {
      const configBtn = header.querySelector(".tile-config-btn");
      configBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        this._onConfigClick();
      });
      header.addEventListener("dblclick", (e) => {
        if (!this.configOnDoubleClick || !configBtn) return;
        if (e.target.closest?.('button, input, textarea, select, [contenteditable=""], [contenteditable="true"], .tile-menu-dropdown')) return;
        e.stopPropagation();
        this._onConfigClick();
      });
      const menuBtn = header.querySelector(".tile-menu-btn");
      const menuDropdown = header.querySelector(".tile-menu-dropdown");
      if (menuBtn && menuDropdown) {
        this._menuButton = menuBtn;
        this._menuDropdown = menuDropdown;
        this._menuHome = menuDropdown.parentNode;
        menuBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          if (menuDropdown.hidden) this._openTileMenu();
          else this._closeTileMenu();
        });
        menuDropdown.querySelectorAll(".tile-menu-item").forEach((itemEl) => {
          itemEl.addEventListener("click", (e) => {
            e.stopPropagation();
            this._closeTileMenu();
            this._onMenuAction(itemEl.dataset.action);
          });
        });
      }
      const removeBtn = header.querySelector(".tile-remove-btn");
      removeBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        this._onRemoveClick();
      });
    }
    this.contentElement = document.createElement("div");
    this.contentElement.className = "tile-content";
    this.element.appendChild(header);
    this.element.appendChild(this.contentElement);
    if (!this.readonly) {
      const resizeHandle = document.createElement("div");
      resizeHandle.className = "tile-resize-handle se";
      resizeHandle.innerHTML = '<span class="material-symbols-outlined">drag_handle</span>';
      this.element.appendChild(resizeHandle);
      this.element.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.eventBus?.emit?.("tile:context-menu", {
          tileId: this.id,
          tileType: this.constructor.TYPE,
          tileTitle: this.constructor.TITLE,
          config: { ...this.config },
          clientX: e.clientX,
          clientY: e.clientY
        });
      });
    }
  }
  /**
   * Open the ⋯ menu. It is drawn on `document.body` (or the open modal's
   * host, as `showContextMenu` is), not inside the tile: a tile clips its
   * content, so a menu wider than a narrow tile lost its left part. It is
   * placed with `ActionDropdown.position` — fixed, under the button (above
   * when there is no room), right edges aligned, kept inside the window.
   * @private
   */
  _openTileMenu() {
    const btn = this._menuButton;
    const menu = this._menuDropdown;
    if (!btn || !menu || !menu.hidden) return;
    (modalHost() || document.body).appendChild(menu);
    menu.hidden = false;
    ActionDropdown.position(btn, menu, { align: "end" });
    this._menuOutsideListener = (ev) => {
      if (!menu.contains(ev.target) && !btn.contains(ev.target)) this._closeTileMenu();
    };
    const listener = this._menuOutsideListener;
    requestAnimationFrame(() => {
      if (this._menuOutsideListener === listener) {
        document.addEventListener("pointerdown", listener, true);
      }
    });
  }
  /**
   * Close the ⋯ menu and put it back in the tile's header.
   * @private
   */
  _closeTileMenu() {
    const menu = this._menuDropdown;
    if (this._menuOutsideListener) {
      document.removeEventListener("pointerdown", this._menuOutsideListener, true);
      this._menuOutsideListener = null;
    }
    if (!menu) return;
    menu.hidden = true;
    for (const prop of ["position", "top", "bottom", "left", "right", "maxHeight", "overflowY"]) {
      menu.style[prop] = "";
    }
    if (this._menuHome && menu.parentNode !== this._menuHome) this._menuHome.appendChild(menu);
  }
  /**
   * Mark this tile as being configured, or clear the mark (STORY-0128).
   * A convenience for `grid.setConfiguring(tile.id, on)`, which is the API:
   * the grid holds the mark by tile id, so it outlives this tile instance
   * (`setLayout` disposes and rebuilds every tile). A tile with no grid
   * holds the mark itself.
   *
   * @param {boolean} [on=true]
   */
  setConfiguring(on = true) {
    if (typeof this.grid?.setConfiguring === "function") {
      this.grid.setConfiguring(this.id, on);
      return;
    }
    this._applyConfiguring(on);
  }
  /** Draw (or clear) the configuring mark. Called by the grid.
   *  @param {boolean} on
   *  @private */
  _applyConfiguring(on) {
    this._configuring = !!on;
    this.element?.classList.toggle("tile--configuring", this._configuring);
  }
  /** True while this tile is marked as being configured. */
  get isConfiguring() {
    return this._configuring;
  }
  /**
   * Handle config button click — highlight tile and emit config request.
   * @private
   */
  _onConfigClick() {
    this.element?.closest(".tile-grid")?.querySelectorAll(".tile.tile--selected").forEach((el3) => el3.classList.remove("tile--selected"));
    this.element?.classList.add("tile--selected");
    this.eventBus?.emit?.("tile:config-request", {
      tileId: this.id,
      tileType: this.constructor.TYPE,
      config: this.config,
      schema: this.getConfigSchema()
    });
    this.element?.dispatchEvent(new CustomEvent("tile:config-request", {
      bubbles: true,
      detail: {
        tileId: this.id,
        tileType: this.constructor.TYPE,
        config: this.config,
        schema: this.getConfigSchema()
      }
    }));
  }
  /**
   * Handle remove button click.
   * @param {Event} [event] - Original click event
   * @private
   */
  _onRemoveClick(event) {
    const removeBtn = this.element?.querySelector(".tile-remove-btn");
    this.element?.dispatchEvent(new CustomEvent("tile:remove-request", {
      bubbles: true,
      detail: {
        tileId: this.id,
        anchorElement: removeBtn
      }
    }));
  }
  /**
   * Set the title displayed in the header.
   * @param {string} title - New title text
   */
  setTitle(title) {
    const titleEl = this.element?.querySelector(".tile-title");
    if (titleEl) {
      titleEl.textContent = title;
    }
  }
  /**
   * Show loading state in content area.
   */
  showLoading() {
    if (this.contentElement) {
      this.contentElement.innerHTML = `
                <div class="tile-loading">
                    <span class="material-symbols-outlined spinning">progress_activity</span>
                    <span>Loading...</span>
                </div>
            `;
    }
  }
  /**
   * Show empty state in content area.
   *
   * The message is ESCAPED. Both this and `showError` interpolated straight
   * into `innerHTML`, and the string reaching `showError` is the one place a
   * caller has least control over — a server's error text, echoed back with a
   * column name or a filter value in it. Callers pass plain text; this decides
   * what that means in HTML.
   *
   * @param {string} [message] - Custom message
   */
  showEmpty(message = "No data available") {
    if (this.contentElement) {
      this.contentElement.innerHTML = `
                <div class="tile-empty">
                    <span class="material-symbols-outlined">inbox</span>
                    <span>${this.#escapeAttr(message)}</span>
                </div>
            `;
    }
  }
  /**
   * Show error state in content area. The message is escaped — see `showEmpty`.
   * @param {string} [message] - Error message
   */
  showError(message = "Failed to load data") {
    if (this.contentElement) {
      this.contentElement.innerHTML = `
                <div class="twm-tile-error">
                    <span class="material-symbols-outlined">error</span>
                    <span>${this.#escapeAttr(message)}</span>
                </div>
            `;
    }
  }
  /**
   * Format a number for display.
   * @param {number} value - Number to format
   * @param {number} [decimals=2] - Decimal places
   * @returns {string} Formatted string
   */
  formatNumber(value, decimals = 2) {
    if (value == null || !Number.isFinite(value)) return "\u2014";
    const abs = Math.abs(value);
    if (abs >= 1e9) {
      return (value / 1e9).toFixed(1) + "B";
    } else if (abs >= 1e6) {
      return (value / 1e6).toFixed(1) + "M";
    } else if (abs >= 1e3) {
      return (value / 1e3).toFixed(1) + "K";
    } else if (abs < 0.01 && abs > 0) {
      return value.toExponential(decimals);
    }
    return value.toFixed(decimals);
  }
  /**
   * Get available variables from data for config dropdowns.
   * @param {Object} data - Analytics data
   * @returns {Array<{value: string, label: string}>} Variable options
   */
  getAvailableVariables(data) {
    if (!data) return [];
    const variables = [];
    if (data.stocks) {
      Object.keys(data.stocks).forEach((name) => {
        variables.push({ value: name, label: name, category: "Stocks" });
      });
    }
    if (data.flows) {
      Object.keys(data.flows).forEach((name) => {
        variables.push({ value: name, label: name, category: "Flows" });
      });
    }
    if (data.indicators) {
      Object.keys(data.indicators).forEach((name) => {
        variables.push({ value: name, label: name, category: "Indicators" });
      });
    }
    return variables;
  }
  // =========================================================================
  // EXPAND WINDOW FUNCTIONALITY
  // Reuses PlotPopoutWindow's patterns and CSS classes
  // =========================================================================
  /**
   * Handle expand button click.
   * @private
   */
  _onExpandClick() {
    if (!this.constructor.EXPANDABLE) return;
    const expandData = this.getExpandData();
    if (!expandData) {
      console.warn(`[TileBase] No expand data from widget ${this.id}`);
      return;
    }
    this._openExpandWindow(expandData);
  }
  /**
   * Get data for the expanded window.
   * Override in subclass for expandable widgets.
   * @returns {Object|null} { title, traces, layout, tableHeaders, tableRows }
   */
  getExpandData() {
    return null;
  }
  /**
   * Open the expand window with plot and data tabs.
   * Delegates to openRawTracesWindow (PlotPopoutWindow module) which
   * provides proper toolbar layout, download buttons, and data table.
   * @param {Object} expandData - Data from getExpandData()
   * @private
   */
  async _openExpandWindow(expandData) {
    if (this._expandWindow?.isVisible) {
      this._expandWindow.bringToFront();
      return;
    }
    this._expandWindow = await openRawTracesWindow({
      host: this.host,
      id: `tile-expand-${this.id}`,
      title: expandData.title || this.constructor.TITLE,
      traces: expandData.traces,
      layout: expandData.layout,
      frames: expandData.frames,
      tableHeaders: expandData.tableHeaders,
      tableRows: expandData.tableRows,
      services: { eventBus: this.eventBus }
    });
  }
  /**
   * Escape a string for safe insertion into HTML — an attribute value or a text
   * node, since the five characters that matter are the same five in both.
   * @private
   */
  #escapeAttr(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[c]);
  }
  /**
   * Show toast notification via eventBus.
   * @private
   */
  _notify(title, message, severity = "info") {
    this.eventBus?.emit?.("toast:show", {
      title,
      message,
      type: severity
    });
  }
};

// src/tiles/figure_tile.js
var FIGURE_CONFIG = Object.freeze({
  scrollZoom: false,
  displayModeBar: false,
  responsive: true
});
var DOWNLOAD_PNG = Object.freeze({ action: "download-png", label: "Download PNG", icon: "image" });
var FigureTile = class extends TileBase {
  static TYPE = "flexdesk.figure";
  static TITLE = "Figure";
  static EXPANDABLE = true;
  /** The empty state's text when `figure()` answers `null`. */
  static EMPTY_MESSAGE = "No data to show.";
  /**
   * @param {Object} options - TileBase's, plus:
   * @param {Function} [options.onPointClick] - `({customdata, point, tile})`
   *        on a click on a mark. Also assignable later as `tile.onPointClick`.
   */
  constructor(options = {}) {
    super(options);
    this.onPointClick = typeof options.onPointClick === "function" ? options.onPointClick : null;
    this._plotEl = null;
    this._drawn = false;
    this._drawSeq = 0;
    this._figure = null;
  }
  /**
   * The one override: what to draw for `data`.
   * @param {*} _data
   * @returns {{traces: Array, layout?: Object, config?: Object, frames?: Array}|null}
   */
  figure(_data) {
    throw new Error(`${this.constructor.name}.figure() must be implemented by the subclass`);
  }
  /**
   * Hand this tile its data. Unlike `update()`, an empty or null value is
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
    resize(this._plotEl).catch(() => {
    });
  }
  menuItems() {
    return [...super.menuItems(), ...this._figureMenuItems()];
  }
  /** The entries this class adds to the menu: Download PNG. For a subclass
   *  that wants them WITHOUT `TileBase`'s own. @protected */
  _figureMenuItems() {
    return [{ ...DOWNLOAD_PNG }];
  }
  _onMenuAction(action) {
    if (action === DOWNLOAD_PNG.action) this._downloadPng();
    else super._onMenuAction(action);
  }
  /** The last figure drawn, for the expand window; `null` while there is none. */
  getExpandData() {
    const fig = this._figure;
    if (!fig) return null;
    return {
      title: this.config.title || this.constructor.TITLE,
      // Copies: Plotly writes onto the trace and layout objects it draws.
      traces: fig.traces.map((t) => ({ ...t })),
      layout: { ...fig.layout || {} },
      frames: Array.isArray(fig.frames) ? fig.frames : void 0
    };
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
    const el3 = this._plotEl;
    this._plotEl = null;
    this._drawn = false;
    this._figure = null;
    if (el3) purge(el3).catch(() => {
    });
  }
  /**
   * The nodes the content holds while `plotEl` draws `fig`: the plot alone
   * here. A subclass adds what sits around the figure (a note, a caption).
   * @param {HTMLElement} plotEl
   * @param {Object} _fig - what `figure()` answered
   * @returns {HTMLElement[]}
   * @protected
   */
  _figureContent(plotEl, _fig) {
    return [plotEl];
  }
  // ── the draw ────────────────────────────────────────────────────────
  async _draw(data) {
    this._drawSeq += 1;
    const seq = this._drawSeq;
    const content = this.contentElement;
    if (!content) return;
    const stale = () => this._disposed || seq !== this._drawSeq;
    this._releasePlot();
    let fig;
    try {
      fig = this.figure(data);
      if (fig != null && (typeof fig !== "object" || !Array.isArray(fig.traces))) {
        throw new Error("figure() must answer {traces, layout} or null");
      }
    } catch (err) {
      this._failed(err);
      return;
    }
    if (!fig) {
      if (!stale()) this.showEmpty(this.constructor.EMPTY_MESSAGE);
      return;
    }
    const host = document.createElement("div");
    host.className = "fd-figure-tile";
    content.replaceChildren(...this._figureContent(host, fig));
    this._plotEl = host;
    this._drawn = false;
    try {
      const P = await ensurePlotly();
      if (stale()) return;
      await createChart(host, fig.traces, fig.layout || {}, { ...FIGURE_CONFIG, ...fig.config || {} });
      if (Array.isArray(fig.frames) && fig.frames.length && !stale()) {
        await P.addFrames(host, fig.frames);
      }
    } catch (err) {
      if (stale()) return;
      this._failed(err);
      return;
    }
    if (stale()) {
      purge(host).catch(() => {
      });
      return;
    }
    this._drawn = true;
    this._figure = fig;
    this._wireClick(host);
  }
  /** Plotly's click, reduced to the point's own `customdata`. A pie's point
   *  carries its slice index as `pointNumber` (older builds: `pointIndex`),
   *  and its `customdata` is read off the trace by that index. */
  _wireClick(host) {
    if (typeof host.on !== "function") return;
    host.on("plotly_click", (ev) => {
      const point = ev?.points?.[0];
      if (!point || typeof this.onPointClick !== "function") return;
      const trace = point.data || {};
      let customdata = point.customdata;
      if (trace.type === "pie" || customdata === void 0) {
        const i = point.pointNumber ?? point.pointIndex;
        if (Array.isArray(trace.customdata) && i != null) customdata = trace.customdata[i];
      }
      try {
        this.onPointClick({ customdata, point, tile: this });
      } catch (err) {
        console.error(`[${this.constructor.name}] onPointClick threw:`, err);
      }
    });
  }
  async _downloadPng() {
    if (!this._plotEl || !this._drawn) return;
    try {
      const P = await ensurePlotly();
      const uri = await P.toImage(this._plotEl, { format: "png", scale: 2 });
      const filename = `${slug(this.config.title || this.constructor.TITLE)}.png`;
      const dialogs = this.host?.dialogs;
      const result = dialogs ? await dialogs.saveFile({ data: uri.split(",")[1], filename, kind: "png" }) : null;
      if (result) {
        if (result.ok) this._notify("Download", `Chart saved to ${result.path}`, "success");
        else if (!result.cancelled) this._notify("Download failed", result.error || "The image could not be saved", "error");
        return;
      }
      const a = document.createElement("a");
      a.href = uri;
      a.download = filename;
      a.click();
    } catch (err) {
      this._notify("Download failed", `The image could not be made: ${err?.message || err}`, "error");
    }
  }
  _failed(err) {
    if (this._disposed) return;
    this.showError(`This chart could not be drawn: ${err?.message || err}`);
    this.eventBus?.emit?.("tile:render-failed", {
      tileId: this.id,
      message: err?.message || String(err)
    });
  }
};
function slug(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "chart";
}

// src/tiles/chart_tiles.js
init_tile_registry();
var CATEGORICAL_ONLY = /* @__PURE__ */ new Set(["pie", "donut", "funnel"]);
var CHART_TILE_TYPES = Object.freeze([
  { value: "line", label: "Line" },
  { value: "bar", label: "Bar" },
  { value: "bar-stacked", label: "Bar (stacked)" },
  { value: "bar-horizontal", label: "Bar (horizontal)" },
  { value: "area", label: "Area" },
  { value: "area-stacked", label: "Area (stacked %)" },
  { value: "scatter", label: "Scatter" },
  { value: "pie", label: "Pie" },
  { value: "donut", label: "Donut" },
  { value: "funnel", label: "Funnel" },
  { value: "histogram", label: "Histogram" }
]);
var AXIS_CHARTS = ["bar", "bar-stacked", "bar-horizontal", "line", "area", "area-stacked", "scatter"];
var READS = Object.freeze({
  legend: /* @__PURE__ */ new Set([...AXIS_CHARTS, "pie", "donut", "histogram"]),
  axis_titles: /* @__PURE__ */ new Set([...AXIS_CHARTS, "histogram"]),
  y_scale: /* @__PURE__ */ new Set(["bar", "bar-horizontal", "line", "area", "scatter"]),
  y_range: /* @__PURE__ */ new Set(["bar", "bar-stacked", "bar-horizontal", "line", "area", "scatter"]),
  show_markers: /* @__PURE__ */ new Set(["line", "area", "area-stacked"])
});
var TILE_MARGIN = { l: 48, r: 16, t: 8, b: 36 };
var MAX_POINTS = 2e3;
function normalizeChartData(data) {
  if (data == null) return null;
  let d = data;
  if (Array.isArray(d)) d = { series: d };
  else if (typeof d !== "object") return null;
  else if (!Array.isArray(d.series)) {
    const single = ["x", "y", "labels", "values"].some((k) => Array.isArray(d[k]));
    d = { ...d, series: single ? [d] : [] };
  }
  const series = d.series.filter((s) => s && pointCount(s) > 0);
  if (!series.length) return null;
  return {
    series,
    markers: Array.isArray(d.markers) ? d.markers : [],
    referenceLines: Array.isArray(d.referenceLines) ? d.referenceLines : [],
    xKind: d.xKind || null,
    note: typeof d.note === "string" ? d.note : ""
  };
}
function pointCount(s) {
  for (const k of ["y", "values", "x", "labels"]) {
    if (Array.isArray(s[k])) return s[k].length;
  }
  return 0;
}
var ChartTile = class extends FigureTile {
  static TYPE = "flexdesk.chart";
  static TITLE = "Chart";
  static ICON = "insert_chart";
  static DESCRIPTION = "Line, bar, area, pie, donut, funnel or histogram over series you supply.";
  static DEFAULT_SIZE = { w: 6, h: 4 };
  static SIZE_CONSTRAINTS = { minW: 3, minH: 3, maxW: 12, maxH: 10 };
  /** Pure and static-only — it runs inside `TileBase`'s constructor. */
  getDefaultConfig() {
    return {
      title: "",
      chart_type: "line",
      unit: "",
      legend: "bottom",
      x_title: "",
      y_title: "",
      y_scale: "linear",
      y_min: null,
      y_max: null,
      show_markers: false,
      max_points: MAX_POINTS
    };
  }
  getConfigSchema() {
    return {
      fields: [
        { key: "title", type: "text", label: "Tile title" },
        {
          key: "chart_type",
          type: "select",
          label: "Chart type",
          options: CHART_TILE_TYPES.map((o) => ({ ...o }))
        },
        {
          key: "unit",
          type: "text",
          label: "Unit",
          description: 'Shown with the value axis title, e.g. "pts" or "h".'
        },
        {
          key: "legend",
          type: "select",
          label: "Legend",
          visibleWhen: { field: "chart_type", in: [...READS.legend] },
          options: [
            { value: "bottom", label: "Below" },
            { value: "top", label: "Above" },
            { value: "right", label: "Right" },
            { value: "left", label: "Left" },
            { value: "hidden", label: "None" }
          ]
        },
        {
          key: "x_title",
          type: "text",
          label: "X axis title",
          visibleWhen: { field: "chart_type", in: [...READS.axis_titles] }
        },
        {
          key: "y_title",
          type: "text",
          label: "Y axis title",
          visibleWhen: { field: "chart_type", in: [...READS.axis_titles] }
        },
        {
          key: "y_scale",
          type: "select",
          label: "Y scale",
          visibleWhen: { field: "chart_type", in: [...READS.y_scale] },
          options: [{ value: "linear", label: "Linear" }, { value: "log", label: "Logarithmic" }]
        },
        {
          key: "y_min",
          type: "number",
          label: "Y minimum",
          visibleWhen: { field: "chart_type", in: [...READS.y_range] }
        },
        {
          key: "y_max",
          type: "number",
          label: "Y maximum",
          visibleWhen: { field: "chart_type", in: [...READS.y_range] }
        },
        {
          key: "show_markers",
          type: "checkbox",
          label: "Show point markers",
          visibleWhen: { field: "chart_type", in: [...READS.show_markers] }
        }
      ]
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
    super.update(data === null ? void 0 : data, config);
    if (config) applyTitle(this);
  }
  /** `null` (the empty state) when there is nothing to draw. */
  figure(data) {
    const norm = normalizeChartData(data);
    if (!norm) return null;
    return { ...this._plan(norm), note: norm.note };
  }
  /** Download PNG alone — see the header. */
  menuItems() {
    return this._figureMenuItems();
  }
  /** The figure, and the note on its own line under it. */
  _figureContent(plotEl, fig) {
    plotEl.classList.add("fd-chart-tile");
    if (!fig.note) return [plotEl];
    const note = document.createElement("div");
    note.className = "fd-chart-tile__note";
    note.setAttribute("role", "note");
    note.textContent = fig.note;
    note.title = fig.note;
    return [plotEl, note];
  }
  /** Turn normalised data into `{traces, layout}`. */
  _plan(norm) {
    const type = this.config.chart_type || "line";
    const { series } = norm;
    if (CATEGORICAL_ONLY.has(type)) {
      const s = series[0];
      const labels = s.labels ?? s.x ?? [];
      const values = s.values ?? s.y ?? [];
      const trace = buildTrace({
        chartType: type,
        x: labels.map((v) => v === null || v === void 0 ? "\u2014" : String(v)),
        y: values,
        name: s.name || "",
        colors: s.colors || null
      });
      if (Array.isArray(s.customdata)) trace.customdata = s.customdata;
      return {
        traces: [trace],
        layout: {
          margin: type === "funnel" ? { ...TILE_MARGIN, l: 96 } : TILE_MARGIN,
          ...this._legend()
        }
      };
    }
    if (type === "histogram") {
      const traces2 = series.map((s, i) => {
        const raw = s.values ?? s.y ?? s.x ?? [];
        const trace = {
          ...buildHistogramTrace({
            x: raw.map(toNumber).filter((v) => v !== null),
            color: s.color || getSeriesColor(i),
            name: s.name || `Series ${i + 1}`,
            ...s.nbins ? { nbins: s.nbins } : {}
          }),
          opacity: series.length > 1 ? 0.7 : 1
        };
        return trace;
      });
      return {
        traces: traces2,
        layout: {
          margin: TILE_MARGIN,
          ...this._legend(),
          barmode: "overlay",
          xaxis: buildXAxisLayout({ title: this.config.x_title || "" }),
          yaxis: buildYAxisLayout({ axisId: "yaxis", title: this.config.y_title || "Count" })
        }
      };
    }
    const kind = norm.xKind || inferXKind(series);
    const base = type.startsWith("bar") ? "bar" : type;
    const target = Number(this.config.max_points) || MAX_POINTS;
    const showMarkers = READS.show_markers.has(type) && this.config.show_markers === true;
    const traces = series.map((s, i) => {
      let x = Array.isArray(s.x) ? s.x : (s.y || []).map((_, j) => j);
      let y = Array.isArray(s.y) ? s.y : s.values || [];
      let customdata = Array.isArray(s.customdata) ? s.customdata : null;
      if (kind !== "category") {
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
        lineStyle: s.lineStyle || "solid",
        interpolation: s.interpolation || "linear",
        ...s.lineWidth ? { lineWidth: s.lineWidth } : {},
        seriesIndex: i,
        showMarkers
      });
      if (s.line && typeof s.line === "object") trace.line = { ...trace.line || {}, ...s.line };
      if (customdata) trace.customdata = customdata;
      return trace;
    });
    const xaxis = buildXAxisLayout({ title: this.config.x_title || "", scaleType: "linear" });
    if (kind !== "number") xaxis.type = kind === "date" ? "date" : "category";
    const log = READS.y_scale.has(type) && this.config.y_scale === "log";
    const yaxis = buildYAxisLayout({
      axisId: "yaxis",
      title: this._valueTitle(series),
      scaleType: log ? "log" : "linear",
      min: READS.y_range.has(type) ? axisBound(this.config.y_min, log) : null,
      max: READS.y_range.has(type) ? axisBound(this.config.y_max, log) : null
    });
    const layout = { margin: TILE_MARGIN, xaxis, yaxis, ...this._legend() };
    if (type === "bar") layout.barmode = "group";
    if (type === "bar-stacked") layout.barmode = "stack";
    if (type === "bar-horizontal") {
      layout.barmode = "group";
      for (const t of traces) {
        [t.x, t.y] = [t.y, t.x];
        t.orientation = "h";
      }
      [layout.xaxis, layout.yaxis] = [yaxis, xaxis];
      layout.margin = { ...TILE_MARGIN, l: 96 };
    }
    const overlay = buildOverlayShapes({
      verticalLines: type === "bar-horizontal" ? [] : norm.markers,
      referenceLines: norm.referenceLines
    });
    if (overlay.shapes.length) layout.shapes = overlay.shapes;
    if (overlay.annotations.length) layout.annotations = overlay.annotations;
    return { traces, layout };
  }
  /** The value axis title: the configured one, else the single series' name,
   *  with the unit beside it. */
  _valueTitle(series) {
    const unit = (this.config.unit || "").trim();
    const base = this.config.y_title || (series.length === 1 ? series[0].name || "" : "");
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
    if (!READS.legend.has(this.config.chart_type || "line")) return { showlegend: false };
    const position = this.config.legend || "bottom";
    const spec = buildLegendLayout(position);
    const out = { showlegend: spec.showlegend === true };
    if (spec.legend) out.legend = spec.legend;
    if (position === "bottom" && out.legend) {
      out.legend = { ...out.legend, yref: "container", y: 0, yanchor: "bottom" };
    }
    return out;
  }
};
var KpiTile = class extends TileBase {
  static TYPE = "flexdesk.kpi";
  static TITLE = "KPI";
  static ICON = "speed";
  static DESCRIPTION = "One number with a label and an optional comparison.";
  static DEFAULT_SIZE = { w: 3, h: 2 };
  static SIZE_CONSTRAINTS = { minW: 2, minH: 2, maxW: 12, maxH: 6 };
  getDefaultConfig() {
    return {
      title: "",
      label: "",
      unit: "",
      format: "number",
      decimals: null,
      prefix: "",
      suffix: "",
      currency: null,
      delta_relative: false,
      invert_delta: false,
      foot: ""
    };
  }
  getConfigSchema() {
    return {
      fields: [
        { key: "title", type: "text", label: "Tile title" },
        { key: "label", type: "text", label: "Label" },
        { key: "unit", type: "text", label: "Unit", description: 'Shown after the number, e.g. "pts".' },
        {
          key: "format",
          type: "select",
          label: "Format",
          options: [
            { value: "number", label: "Number" },
            { value: "percent", label: "Percentage (of a ratio)" },
            { value: "currency", label: "Currency" },
            { value: "duration", label: "Duration (seconds)" },
            { value: "text", label: "Text" }
          ]
        },
        { key: "decimals", type: "number", label: "Decimals", min: 0, max: 6 },
        {
          key: "currency",
          type: "text",
          label: "Currency code",
          description: "ISO 4217, e.g. EUR. Left empty, the number is shown without a symbol."
        },
        { key: "prefix", type: "text", label: "Prefix" },
        { key: "suffix", type: "text", label: "Suffix" },
        { key: "delta_relative", type: "checkbox", label: "Show the change as a percentage" },
        {
          key: "invert_delta",
          type: "checkbox",
          label: "A fall is good",
          description: "For a cost, a queue length or a latency: a smaller number is the better one."
        },
        { key: "foot", type: "text", label: "Caption" }
      ]
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
    super.update(data === null ? void 0 : data, config);
    if (config) applyTitle(this);
    const d = this.data;
    if (d !== null && d !== void 0 && !d && this.contentElement) this.render(d);
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
    const d = typeof data === "number" ? { value: data } : data;
    if (!d || typeof d !== "object" || d.value === null || d.value === void 0 || d.value === "") {
      this.showEmpty("No value to show.");
      return;
    }
    content.replaceChildren();
    const box = document.createElement("div");
    box.className = "fd-kpi";
    const labelText = d.label || this.config.label || "";
    if (labelText) {
      const label = document.createElement("div");
      label.className = "fd-kpi__label";
      label.textContent = labelText;
      label.title = labelText;
      box.append(label);
    }
    const big = document.createElement("div");
    big.className = "fd-kpi__value";
    big.textContent = this._format(d.value, true);
    big.title = String(d.value);
    box.append(big);
    const delta = this._buildDelta(d.value, d.reference);
    if (delta) box.append(delta);
    const foot = [this.config.foot, d.note].filter(Boolean).join(" \xB7 ");
    if (foot) {
      const el3 = document.createElement("div");
      el3.className = "fd-kpi__foot";
      el3.textContent = foot;
      el3.title = foot;
      box.append(el3);
    }
    content.append(box);
  }
  /** The comparison line, or `null` when there is nothing to compare against.
   *  `0` is a real reference — the test is finiteness, never truthiness. */
  _buildDelta(rawValue, rawReference) {
    const value = Number(rawValue);
    if (rawReference === null || rawReference === void 0 || rawReference === "") return null;
    const reference = Number(rawReference);
    if (!Number.isFinite(value) || !Number.isFinite(reference)) return null;
    const change = value - reference;
    const el3 = document.createElement("div");
    el3.className = "fd-kpi__delta";
    if (change > 0) el3.classList.add(this.config.invert_delta ? "fd-kpi__delta--down" : "fd-kpi__delta--up");
    else if (change < 0) el3.classList.add(this.config.invert_delta ? "fd-kpi__delta--up" : "fd-kpi__delta--down");
    const arrow = change > 0 ? "\u25B2" : change < 0 ? "\u25BC" : "\u2013";
    const magnitude = this.config.delta_relative ? reference === 0 ? null : formatValue(Math.abs(change / reference), {
      format: "percent",
      decimals: this.config.decimals ?? 1
    }) : this._format(Math.abs(change), false);
    const sign = change > 0 ? "+" : change < 0 ? "-" : "";
    el3.textContent = magnitude === null ? `${arrow} \u2014` : `${arrow} ${sign}${magnitude}`;
    el3.title = `Compared with ${this._format(reference, false)}`;
    return el3;
  }
  _format(value, withAffixes) {
    const format = this.config.format || "number";
    const body = formatValue(value, {
      format: format === "text" && !withAffixes ? "number" : format,
      decimals: this.config.decimals,
      currency: this.config.currency,
      prefix: withAffixes ? this.config.prefix : "",
      suffix: withAffixes ? this.config.suffix : ""
    });
    const unit = (this.config.unit || "").trim();
    return unit && body !== "\u2014" ? `${body} ${unit}` : body;
  }
};
function registerChartTiles() {
  for (const Tile of [ChartTile, KpiTile]) {
    if (getWidget(Tile.TYPE) !== Tile) registerWidget(Tile);
  }
}
function applyTitle(tile) {
  tile.setTitle(tile.config.title || tile.constructor.TITLE);
}
function inferXKind(series) {
  let sawAny = false;
  let allNumbers = true;
  let allDates = true;
  for (const s of series) {
    for (const v of Array.isArray(s.x) ? s.x : []) {
      if (v === null || v === void 0) continue;
      sawAny = true;
      if (typeof v !== "number") allNumbers = false;
      if (!(v instanceof Date) && !(typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v))) allDates = false;
      if (!allNumbers && !allDates) return "category";
    }
  }
  if (!sawAny || allNumbers) return "number";
  return allDates ? "date" : "category";
}
function toNumber(value) {
  if (value === null || value === void 0 || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function axisBound(value, log) {
  const n = toNumber(value);
  if (n === null || !log) return n;
  return n > 0 ? Math.log10(n) : null;
}
function fractionDigits(decimals) {
  const d = Math.max(0, Math.min(20, Number(decimals) || 0));
  return { minimumFractionDigits: d, maximumFractionDigits: d };
}
function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return "\u2014";
  const sign = seconds < 0 ? "-" : "";
  let rest = Math.abs(Math.round(seconds));
  const days = Math.floor(rest / 86400);
  rest -= days * 86400;
  const hours = Math.floor(rest / 3600);
  rest -= hours * 3600;
  const minutes = Math.floor(rest / 60);
  const secs = rest - minutes * 60;
  if (days) return `${sign}${days}d ${hours}h`;
  if (hours) return `${sign}${hours}h ${minutes}m`;
  if (minutes) return `${sign}${minutes}m ${secs}s`;
  return `${sign}${secs}s`;
}
function formatValue(value, {
  format = "number",
  decimals = null,
  prefix = "",
  suffix = "",
  currency = null
} = {}) {
  if (value === null || value === void 0 || value === "") return "\u2014";
  const n = Number(value);
  const body = (() => {
    switch (format) {
      case "number":
        if (!Number.isFinite(n)) return String(value);
        return decimals === null || decimals === void 0 ? n.toLocaleString() : n.toLocaleString(void 0, fractionDigits(decimals));
      case "percent":
        if (!Number.isFinite(n)) return String(value);
        return `${(n * 100).toLocaleString(void 0, fractionDigits(decimals ?? 1))}%`;
      case "currency":
        if (!Number.isFinite(n)) return String(value);
        if (!currency) return n.toLocaleString(void 0, fractionDigits(decimals ?? 2));
        try {
          return n.toLocaleString(void 0, { style: "currency", currency, ...fractionDigits(decimals ?? 2) });
        } catch {
          return n.toLocaleString(void 0, fractionDigits(decimals ?? 2));
        }
      case "duration":
        return formatDuration(n);
      default:
        return String(value);
    }
  })();
  return `${prefix || ""}${body}${suffix || ""}`;
}

// src/tiles/layout_persistence.js
var LAYOUT_VERSION = 3;
var DEFAULT_LAYOUTS_KEY = "twm.tiles.layouts";
var DEFAULT_CONFIGS_KEY = "twm.tiles.configs";
var LayoutPersistence = class {
  constructor({
    storage = typeof localStorage !== "undefined" ? localStorage : null,
    layoutsKey = DEFAULT_LAYOUTS_KEY,
    configsKey = DEFAULT_CONFIGS_KEY,
    resolveTemplate = null,
    logger = null
  } = {}) {
    this._cache = null;
    this._storage = storage;
    this._logger = logger;
    this._layoutsKey = layoutsKey;
    this._configsKey = configsKey;
    this._resolveTemplate = typeof resolveTemplate === "function" ? resolveTemplate : null;
  }
  /**
   * Get layout for a specific context.
   * Falls back to template resolution when no saved layout exists.
   * @param {string} contextId - Whatever the app keys layouts by.
   * @param {Object} [context]  - Passed opaquely to `resolveTemplate`.
   * @returns {Object} Layout object with tiles array
   */
  getLayout(contextId, context) {
    const all = this._loadAll();
    const layout = all[contextId];
    if (layout && layout.version === LAYOUT_VERSION) {
      return layout;
    }
    const instantiated = this._resolveTemplate?.(context) ?? null;
    if (instantiated) {
      return {
        tiles: instantiated.tiles,
        version: LAYOUT_VERSION,
        templateId: instantiated.templateId,
        templateModified: false
      };
    }
    return { tiles: [], version: LAYOUT_VERSION };
  }
  /**
   * Save layout for a specific context.
   * @param {string} contextId - Whatever the app keys layouts by.
   * @param {Array|Object} layout - Layout array or object with tiles property
   */
  saveLayout(contextId, layout) {
    const all = this._loadAll();
    const tilesArray = Array.isArray(layout) ? layout : layout?.tiles || [];
    all[contextId] = {
      tiles: tilesArray,
      version: LAYOUT_VERSION,
      updatedAt: Date.now(),
      templateId: layout?.templateId || all[contextId]?.templateId || null,
      templateModified: layout?.templateModified ?? true
    };
    this._saveAll(all);
    this._logger?.info?.(`[LayoutPersistence] Saved layout for context ${contextId}`);
  }
  /**
   * Delete layout for a specific context.
   * @param {string} contextId - Whatever the app keys layouts by.
   */
  deleteLayout(contextId) {
    const all = this._loadAll();
    if (all[contextId]) {
      delete all[contextId];
      this._saveAll(all);
      this._logger?.info?.(`[LayoutPersistence] Deleted layout for context ${contextId}`);
    }
  }
  /**
   * Reset a layout by re-resolving the best-matching template.
   *
   * With no `resolveTemplate` supplied, "reset" means "empty grid" — which is the
   * honest answer for a library that has no templates. The previous code called
   * `TemplateRegistry.instantiate()` unconditionally and read `.tiles` off the
   * result, so a null resolver here would have been a TypeError.
   *
   * @param {string} contextId - Whatever the app keys layouts by.
   * @param {Object} [context]  - Passed opaquely to `resolveTemplate`.
   * @returns {Object} The resolved layout (empty if nothing resolves).
   */
  resetLayout(contextId, context) {
    const instantiated = this._resolveTemplate?.(context) ?? null;
    const layout = {
      tiles: instantiated?.tiles ?? [],
      version: LAYOUT_VERSION,
      templateId: instantiated?.templateId ?? null,
      templateModified: false
    };
    this.saveLayout(contextId, layout);
    return layout;
  }
  /**
   * Check if a context has a saved layout.
   * @param {string} contextId - Whatever the app keys layouts by.
   * @returns {boolean}
   */
  hasLayout(contextId) {
    const all = this._loadAll();
    return !!all[contextId];
  }
  /**
   * Get all context IDs with saved layouts.
   * @returns {Array<string>}
   */
  getAllContextIds() {
    const all = this._loadAll();
    return Object.keys(all);
  }
  /**
   * Export all layouts as JSON string.
   * @returns {string}
   */
  exportAll() {
    const all = this._loadAll();
    return JSON.stringify(all, null, 2);
  }
  /**
   * Import layouts from JSON string.
   * @param {string} json - JSON string of layouts
   * @param {boolean} [merge=false] - Whether to merge with existing or replace
   */
  importAll(json, merge = false) {
    try {
      const imported = JSON.parse(json);
      if (merge) {
        const existing = this._loadAll();
        this._saveAll({ ...existing, ...imported });
      } else {
        this._saveAll(imported);
      }
      this._cache = null;
      this._logger?.info?.("[LayoutPersistence] Imported layouts");
    } catch (err) {
      console.error("[LayoutPersistence] Failed to import layouts:", err);
    }
  }
  /**
   * Clear all saved layouts.
   */
  clearAll() {
    try {
      this._storage?.removeItem(this._layoutsKey);
      this._cache = null;
      this._logger?.info?.("[LayoutPersistence] Cleared all layouts");
    } catch (err) {
      console.error("[LayoutPersistence] Failed to clear layouts:", err);
    }
  }
  /**
   * Load all layouts from storage.
   * @returns {Object}
   * @private
   */
  _loadAll() {
    if (this._cache) {
      return this._cache;
    }
    try {
      const raw = this._storage?.getItem(this._layoutsKey);
      if (raw) {
        this._cache = JSON.parse(raw);
        return this._cache;
      }
    } catch (err) {
      console.error("[LayoutPersistence] Failed to load layouts:", err);
    }
    this._cache = {};
    return this._cache;
  }
  /**
   * Save all layouts to storage.
   * @param {Object} data
   * @private
   */
  _saveAll(data) {
    try {
      this._storage?.setItem(this._layoutsKey, JSON.stringify(data));
      this._cache = data;
    } catch (err) {
      console.error("[LayoutPersistence] Failed to save layouts:", err);
      if (err.name === "QuotaExceededError") {
        this._pruneOldLayouts(data);
      }
    }
  }
  /**
   * Remove oldest layouts to free up space.
   * @param {Object} data
   * @private
   */
  _pruneOldLayouts(data) {
    const entries = Object.entries(data);
    entries.sort((a, b) => (a[1].updatedAt || 0) - (b[1].updatedAt || 0));
    const removeCount = Math.ceil(entries.length * 0.25);
    for (let i = 0; i < removeCount; i++) {
      delete data[entries[i][0]];
    }
    try {
      this._storage?.setItem(this._layoutsKey, JSON.stringify(data));
      this._cache = data;
      this._logger?.warn?.("[LayoutPersistence] Pruned old layouts due to quota");
    } catch (err) {
      console.error("[LayoutPersistence] Still cannot save after pruning:", err);
    }
  }
  /**
   * Get the template ID associated with a saved layout.
   * @param {string} contextId - Whatever the app keys layouts by.
   * @returns {string|null} Template ID or null
   */
  getTemplateId(contextId) {
    const all = this._loadAll();
    return all[contextId]?.templateId || null;
  }
  /**
   * Check if the user has modified the layout since the template was applied.
   * @param {string} contextId - Whatever the app keys layouts by.
   * @returns {boolean}
   */
  isTemplateModified(contextId) {
    const all = this._loadAll();
    return all[contextId]?.templateModified ?? false;
  }
  // =========================================================================
  // NAMED CONFIGURATION MANAGEMENT
  // =========================================================================
  /**
   * Get all saved configurations for a context.
   * @param {string} contextId - Whatever the app keys layouts by.
   * @returns {Object} { activeId: string, configs: { id: { name, tiles, createdAt } } }
   */
  getConfigurations(contextId) {
    const all = this._loadConfigs();
    const contextConfigs = all[contextId];
    if (contextConfigs && Object.keys(contextConfigs.configs || {}).length > 0) {
      return contextConfigs;
    }
    return {
      activeId: null,
      configs: {}
    };
  }
  /**
   * Save the current layout as a named configuration.
   * Names are enforced to be unique - duplicates get "(2)", "(3)", etc. suffix.
   * @param {string} contextId - Whatever the app keys layouts by.
   * @param {string} name - Configuration name
   * @param {Array|Object} layout - Layout to save
   * @param {Object} [options] - Additional options
   * @param {string} [options.templateId] - Template ID that generated this layout
   * @returns {string} The new configuration ID
   */
  saveConfiguration(contextId, name, layout, options) {
    const all = this._loadConfigs();
    if (!all[contextId]) {
      all[contextId] = { activeId: null, configs: {} };
    }
    const uniqueName = this._getUniqueName(all[contextId].configs, name);
    const configId = `config-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const tilesArray = Array.isArray(layout) ? layout : layout?.tiles || [];
    all[contextId].configs[configId] = {
      name: uniqueName,
      tiles: tilesArray,
      version: LAYOUT_VERSION,
      createdAt: Date.now(),
      templateId: options?.templateId || null
    };
    if (!all[contextId].activeId) {
      all[contextId].activeId = configId;
    }
    this._saveConfigs(all);
    this._logger?.info?.(`[LayoutPersistence] Saved configuration "${uniqueName}" for context ${contextId}`);
    return configId;
  }
  /**
   * Generate a unique name by appending (2), (3), etc. if name already exists.
   * @param {Object} configs - Existing configurations object
   * @param {string} name - Desired name
   * @returns {string} Unique name
   * @private
   */
  _getUniqueName(configs, name) {
    if (!configs) return name;
    const existingNames = new Set(Object.values(configs).map((c) => c.name));
    if (!existingNames.has(name)) {
      return name;
    }
    let counter = 2;
    let candidate = `${name} (${counter})`;
    while (existingNames.has(candidate)) {
      counter++;
      candidate = `${name} (${counter})`;
    }
    return candidate;
  }
  /**
   * Load a specific configuration.
   * @param {string} contextId - Whatever the app keys layouts by.
   * @param {string} configId - Configuration ID
   * @returns {Object|null} Configuration layout or null if not found
   */
  loadConfiguration(contextId, configId) {
    const all = this._loadConfigs();
    const config = all[contextId]?.configs?.[configId];
    if (config) {
      all[contextId].activeId = configId;
      this._saveConfigs(all);
      return config;
    }
    return null;
  }
  /**
   * Delete a saved configuration.
   * @param {string} contextId - Whatever the app keys layouts by.
   * @param {string} configId - Configuration ID
   * @returns {boolean} True if deleted, false if not found
   */
  deleteConfiguration(contextId, configId) {
    const all = this._loadConfigs();
    if (!all[contextId]?.configs?.[configId]) {
      return false;
    }
    delete all[contextId].configs[configId];
    if (all[contextId].activeId === configId) {
      const remaining = Object.keys(all[contextId].configs);
      all[contextId].activeId = remaining.length > 0 ? remaining[0] : null;
    }
    this._saveConfigs(all);
    this._logger?.info?.(`[LayoutPersistence] Deleted configuration ${configId} for context ${contextId}`);
    return true;
  }
  /**
   * Update an existing configuration's layout (without creating a new ID).
   * @param {string} contextId - Whatever the app keys layouts by.
   * @param {string} configId - Configuration ID
   * @param {Array|Object} layout - New layout to save
   * @returns {boolean} True if updated, false if not found
   */
  updateConfiguration(contextId, configId, layout) {
    const all = this._loadConfigs();
    if (!all[contextId]?.configs?.[configId]) {
      return false;
    }
    const tilesArray = Array.isArray(layout) ? layout : layout?.tiles || [];
    all[contextId].configs[configId].tiles = tilesArray;
    all[contextId].configs[configId].version = LAYOUT_VERSION;
    all[contextId].configs[configId].updatedAt = Date.now();
    this._saveConfigs(all);
    return true;
  }
  /**
   * Update the templateId on an existing configuration.
   * @param {string} contextId - Whatever the app keys layouts by.
   * @param {string} configId - Configuration ID
   * @param {string} templateId - New template ID
   * @returns {boolean} True if updated, false if not found
   */
  updateConfigurationTemplateId(contextId, configId, templateId) {
    const all = this._loadConfigs();
    if (!all[contextId]?.configs?.[configId]) {
      return false;
    }
    all[contextId].configs[configId].templateId = templateId;
    this._saveConfigs(all);
    return true;
  }
  /**
   * Rename a configuration.
   * Names are enforced to be unique - duplicates get "(2)", "(3)", etc. suffix.
   * @param {string} contextId - Whatever the app keys layouts by.
   * @param {string} configId - Configuration ID
   * @param {string} newName - New name
   * @returns {string|false} The actual name used (may differ if duplicate), or false if not found
   */
  renameConfiguration(contextId, configId, newName) {
    const all = this._loadConfigs();
    if (!all[contextId]?.configs?.[configId]) {
      return false;
    }
    const otherConfigs = {};
    Object.entries(all[contextId].configs).forEach(([id, config]) => {
      if (id !== configId) {
        otherConfigs[id] = config;
      }
    });
    const uniqueName = this._getUniqueName(otherConfigs, newName);
    all[contextId].configs[configId].name = uniqueName;
    this._saveConfigs(all);
    return uniqueName;
  }
  /**
   * Get the active configuration for a context.
   * @param {string} contextId - Whatever the app keys layouts by.
   * @returns {Object|null} { id, name, tiles } or null
   */
  getActiveConfiguration(contextId) {
    const all = this._loadConfigs();
    const contextConfigs = all[contextId];
    if (!contextConfigs?.activeId) {
      return null;
    }
    const activeConfig = contextConfigs.configs[contextConfigs.activeId];
    if (activeConfig) {
      return {
        id: contextConfigs.activeId,
        ...activeConfig
      };
    }
    return null;
  }
  /**
   * Set the active configuration.
   * @param {string} contextId - Whatever the app keys layouts by.
   * @param {string} configId - Configuration ID
   */
  setActiveConfiguration(contextId, configId) {
    const all = this._loadConfigs();
    if (all[contextId]?.configs?.[configId]) {
      all[contextId].activeId = configId;
      this._saveConfigs(all);
    }
  }
  /**
   * List all configurations for a context.
   * @param {string} contextId - Whatever the app keys layouts by.
   * @returns {Array} Array of { id, name, createdAt, isActive }
   */
  listConfigurations(contextId) {
    const all = this._loadConfigs();
    const contextConfigs = all[contextId];
    if (!contextConfigs?.configs) {
      return [];
    }
    return Object.entries(contextConfigs.configs).map(([id, config]) => ({
      id,
      name: config.name,
      createdAt: config.createdAt,
      isActive: id === contextConfigs.activeId
    })).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }
  /**
   * Get the template set fingerprint for a context.
   * Used to detect when templates have changed and configs need regeneration.
   * @param {string} contextId
   * @returns {string|null}
   */
  getTemplateSetId(contextId) {
    const all = this._loadConfigs();
    return all[contextId]?.templateSetId || null;
  }
  /**
   * Store the template set fingerprint for a context.
   * @param {string} contextId
   * @param {string} templateSetId
   */
  setTemplateSetId(contextId, templateSetId) {
    const all = this._loadConfigs();
    if (!all[contextId]) {
      all[contextId] = { activeId: null, configs: {} };
    }
    all[contextId].templateSetId = templateSetId;
    this._saveConfigs(all);
  }
  /**
   * Delete ALL configurations for a context.
   * @param {string} contextId
   */
  clearConfigurations(contextId) {
    const all = this._loadConfigs();
    delete all[contextId];
    this._saveConfigs(all);
  }
  /**
   * Load all configurations from storage.
   * @returns {Object}
   * @private
   */
  _loadConfigs() {
    try {
      const raw = this._storage?.getItem(this._configsKey);
      if (raw) {
        return JSON.parse(raw);
      }
    } catch (err) {
      console.error("[LayoutPersistence] Failed to load configurations:", err);
    }
    return {};
  }
  /**
   * Save all configurations to storage.
   * @param {Object} data
   * @private
   */
  _saveConfigs(data) {
    try {
      this._storage?.setItem(this._configsKey, JSON.stringify(data));
    } catch (err) {
      console.error("[LayoutPersistence] Failed to save configurations:", err);
    }
  }
};
var instance = null;
var _options = {};
function configureLayoutPersistence(options = {}) {
  _options = options;
  instance = null;
}
function getLayoutPersistence() {
  if (!instance) {
    instance = new LayoutPersistence(_options);
  }
  return instance;
}

// src/tiles/list_tiles.js
init_tile_registry();
var TONES = /* @__PURE__ */ new Set(["danger", "warning", "ok", "muted"]);
function normalize(data, key) {
  if (data == null) return null;
  const d = Array.isArray(data) ? { [key]: data } : data;
  if (typeof d !== "object" || !Array.isArray(d[key])) return null;
  const items = d[key].filter((r) => r && typeof r === "object" && r.key != null);
  const total = Number.isFinite(Number(d.total)) && d.total !== null && d.total !== "" ? Number(d.total) : items.length;
  return {
    items,
    total: Math.max(total, items.length),
    note: typeof d.note === "string" ? d.note : "",
    empty: typeof d.empty === "string" ? d.empty : "",
    action: d.action && typeof d.action === "object" && d.action.label ? d.action : null
  };
}
var normalizeListData = (data) => normalize(data, "rows");
var normalizePeopleData = (data) => normalize(data, "people");
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = String(text);
  return e;
}
function glyph(name, cls = "") {
  const g = el("span", `material-symbols-outlined${cls ? ` ${cls}` : ""}`, name);
  g.setAttribute("aria-hidden", "true");
  return g;
}
var toneClass = (base, tone) => TONES.has(tone) ? ` ${base}--${tone}` : "";
var RowsTile = class extends TileBase {
  static _KEY = "rows";
  constructor(options = {}) {
    super(options);
    this.onRowActivate = typeof options.onRowActivate === "function" ? options.onRowActivate : null;
    this.rowMenu = typeof options.rowMenu === "function" ? options.rowMenu : null;
    this.onRowMenuAction = typeof options.onRowMenuAction === "function" ? options.onRowMenuAction : null;
    this.onAction = typeof options.onAction === "function" ? options.onAction : null;
    this.rowsDraggable = options.rowsDraggable === true;
    this._items = /* @__PURE__ */ new Map();
    this._onClick = (e) => this._click(e);
    this._onKey = (e) => this._key(e);
    this._onMenu = (e) => this._menu(e);
  }
  /** Pure and static-only — it runs inside `TileBase`'s constructor. */
  getDefaultConfig() {
    return { title: "", empty_text: "", max_rows: 0 };
  }
  getConfigSchema() {
    return {
      fields: [
        { key: "title", type: "text", label: "Tile title" },
        {
          key: "empty_text",
          type: "text",
          label: "When there is nothing",
          description: 'What the tile says when the list is empty, e.g. "Nothing is late."'
        },
        {
          key: "max_rows",
          type: "number",
          label: "Rows at most",
          min: 0,
          description: "0 shows them all; the tile scrolls."
        }
      ]
    };
  }
  mount(container) {
    super.mount(container);
    applyTitle2(this);
    const c = this.contentElement;
    if (!c) return;
    c.addEventListener("click", this._onClick);
    c.addEventListener("keydown", this._onKey);
    c.addEventListener("contextmenu", this._onMenu);
  }
  /** `null` is "the grid has no data" — see `ChartTile.update`. */
  update(data, config) {
    if (this._disposed) return;
    super.update(data === null ? void 0 : data, config);
    if (config) applyTitle2(this);
  }
  /** Hand this tile its rows; null is the empty state. */
  setData(data) {
    if (this._disposed) return;
    this.data = data ?? null;
    if (this.contentElement) this.render(this.data);
  }
  /** The item drawn under `key`, or null. */
  itemFor(key) {
    return this._items.get(String(key)) ?? null;
  }
  /** The element of the item drawn under `key`, or null. */
  rowElement(key) {
    const want = String(key);
    return [...this.contentElement?.querySelectorAll("[data-row-key]") || []].find((r) => r.dataset.rowKey === want) || null;
  }
  render(data) {
    const content = this.contentElement;
    if (!content) return;
    const norm = normalize(data, this.constructor._KEY);
    this._items.clear();
    if (!norm) {
      this.showEmpty("Nothing to show.");
      return;
    }
    const max = Math.max(0, Math.floor(Number(this.config.max_rows) || 0));
    const shown = max ? norm.items.slice(0, max) : norm.items;
    const box = el("div", `fd-list-tile fd-list-tile--${this.constructor._KEY}`);
    const bar = el("div", "fd-list-tile__bar");
    const count = el(
      "span",
      "fd-list-tile__count",
      shown.length < norm.total ? `${shown.length} of ${norm.total}` : String(norm.total)
    );
    count.title = `${norm.total} in all`;
    bar.append(count, el("span", "fd-list-tile__spacer"));
    if (norm.action) {
      const b = el("button", "fd-list-tile__action");
      b.type = "button";
      b.dataset.listAction = "action";
      if (norm.action.icon) b.append(glyph(norm.action.icon));
      b.append(el("span", null, norm.action.label));
      bar.append(b);
    }
    box.append(bar);
    const list = el("div", "fd-list-tile__rows");
    list.setAttribute("role", "list");
    if (!shown.length) {
      list.append(el("div", "fd-list-tile__empty", norm.empty || this.config.empty_text || "Nothing here."));
    }
    for (const item of shown) {
      const key = String(item.key);
      if (this._items.has(key)) continue;
      this._items.set(key, item);
      const row = this._renderItem(item);
      row.classList.add("fd-list-tile__row");
      row.dataset.rowKey = key;
      row.setAttribute("role", "button");
      row.tabIndex = 0;
      if (this.rowsDraggable) row.draggable = true;
      const wrap = el("div", "fd-list-tile__item");
      wrap.setAttribute("role", "listitem");
      wrap.append(row);
      list.append(wrap);
    }
    box.append(list);
    if (norm.note) {
      const note = el("div", "fd-list-tile__note", norm.note);
      note.setAttribute("role", "note");
      note.title = norm.note;
      box.append(note);
    }
    content.replaceChildren(box);
  }
  /** One item's row element. @abstract */
  _renderItem(_item) {
    return el("div");
  }
  // ── input ───────────────────────────────────────────────────────────
  _rowOf(target) {
    const row = target?.closest?.("[data-row-key]");
    return row && this.contentElement?.contains(row) ? row : null;
  }
  _click(e) {
    if (e.target?.closest?.("[data-list-action]")) {
      this._call(this.onAction, { tile: this, event: e });
      return;
    }
    const row = this._rowOf(e.target);
    if (row) this._activate(row, e);
  }
  _activate(rowEl, event) {
    const row = this.itemFor(rowEl.dataset.rowKey);
    if (row) this._call(this.onRowActivate, { row, event, tile: this });
  }
  _key(e) {
    const rowEl = this._rowOf(e.target);
    if (!rowEl) return;
    if (e.key === "ContextMenu" || e.key === "F10" && e.shiftKey) {
      const r = rowEl.getBoundingClientRect();
      if (this._openMenu(rowEl, e, r.left + 16, r.bottom)) e.preventDefault();
      return;
    }
    if ((e.key === "Enter" || e.key === " ") && !e.altKey) {
      e.preventDefault();
      this._activate(rowEl, e);
      return;
    }
    const rows = [...this.contentElement.querySelectorAll("[data-row-key]")];
    const i = rows.indexOf(rowEl);
    const to = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: rows.length - 1 }[e.key];
    if (to === void 0 || !rows[to]) return;
    e.preventDefault();
    rows[to].focus();
  }
  _menu(e) {
    const rowEl = this._rowOf(e.target);
    if (rowEl && this._openMenu(rowEl, e, e.clientX, e.clientY)) e.preventDefault();
  }
  /** Show the row's menu, if it has one. → whether it did. */
  _openMenu(rowEl, event, x, y) {
    const row = this.itemFor(rowEl.dataset.rowKey);
    if (!row || typeof this.rowMenu !== "function") return false;
    let items = null;
    try {
      items = this.rowMenu({ row, event, tile: this });
    } catch (err) {
      console.error(`[${this.constructor.name}] rowMenu threw:`, err);
      return false;
    }
    if (!Array.isArray(items) || !items.length) return false;
    showContextMenu(x, y, items, (action) => this._call(this.onRowMenuAction, { action, row, tile: this }));
    return true;
  }
  /** A hook, called so that one that throws is reported and the tile goes on. */
  _call(fn, arg) {
    if (typeof fn !== "function") return;
    try {
      fn(arg);
    } catch (err) {
      console.error(`[${this.constructor.name}] a callback threw:`, err);
    }
  }
  dispose() {
    const c = this.contentElement;
    if (c) {
      c.removeEventListener("click", this._onClick);
      c.removeEventListener("keydown", this._onKey);
      c.removeEventListener("contextmenu", this._onMenu);
    }
    this._items.clear();
    super.dispose();
  }
};
var ListTile = class extends RowsTile {
  static TYPE = "flexdesk.list";
  static TITLE = "List";
  static ICON = "list";
  static DESCRIPTION = "Rows you supply, with a count, a click and a right-click menu per row.";
  static DEFAULT_SIZE = { w: 6, h: 4 };
  static SIZE_CONSTRAINTS = { minW: 3, minH: 2, maxW: 12, maxH: 12 };
  static _KEY = "rows";
  _renderItem(r) {
    const row = el("div", r.className ? String(r.className) : null);
    if (r.icon) {
      const g = glyph(r.icon, "fd-list-tile__icon");
      if (r.iconTitle) {
        g.title = r.iconTitle;
        g.removeAttribute("aria-hidden");
      }
      row.append(g);
    }
    if (r.lead != null && r.lead !== "") row.append(el("span", "fd-list-tile__lead", r.lead));
    const title = el("span", "fd-list-tile__title", r.title ?? "");
    title.title = r.tip || String(r.title ?? "");
    row.append(title);
    for (const c of Array.isArray(r.cells) ? r.cells : []) {
      if (!c) continue;
      const cell = el("span", `fd-list-tile__cell${toneClass("fd-list-tile__cell", c.tone)}${c.className ? ` ${c.className}` : ""}`);
      if (c.icon) cell.append(glyph(c.icon));
      if (c.text != null && c.text !== "") cell.append(document.createTextNode(String(c.text)));
      if (c.title) cell.title = c.title;
      row.append(cell);
    }
    return row;
  }
};
var PeopleTile = class extends RowsTile {
  static TYPE = "flexdesk.people";
  static TITLE = "People";
  static ICON = "groups";
  static DESCRIPTION = "One row per person, with how much is on them.";
  static DEFAULT_SIZE = { w: 6, h: 4 };
  static SIZE_CONSTRAINTS = { minW: 3, minH: 2, maxW: 12, maxH: 12 };
  static _KEY = "people";
  getDefaultConfig() {
    return { ...super.getDefaultConfig(), count_label: "open" };
  }
  getConfigSchema() {
    const { fields } = super.getConfigSchema();
    return { fields: [...fields, {
      key: "count_label",
      type: "text",
      label: "Count reads",
      description: `After each person's number, e.g. "open" for "3 open".`
    }] };
  }
  _renderItem(p) {
    const row = el("div", "fd-people-tile__row");
    row.append(glyph(p.icon || (p.muted ? "person_off" : "person"), "fd-list-tile__icon"));
    row.append(el("span", `fd-people-tile__name${p.muted ? " fd-people-tile__name--muted" : ""}`, p.name ?? p.key));
    const pills = el("span", "fd-people-tile__pills");
    for (const pill of Array.isArray(p.pills) ? p.pills : []) {
      if (!pill?.text) continue;
      const s = el("span", `fd-people-tile__pill${toneClass("fd-people-tile__pill", pill.tone)}`, pill.text);
      if (pill.title) s.title = pill.title;
      pills.append(s);
    }
    row.append(pills);
    const label = p.countLabel ?? this.config.count_label ?? "";
    row.append(el("span", "fd-people-tile__count", `${Number(p.count) || 0}${label ? ` ${label}` : ""}`));
    if (p.title) row.title = p.title;
    return row;
  }
};
function groupByPerson(items, personOf) {
  const by = /* @__PURE__ */ new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const who = String(personOf(item) || "");
    if (!by.has(who)) by.set(who, { key: who, items: [] });
    by.get(who).items.push(item);
  }
  return [...by.values()].sort((a, b) => b.items.length - a.items.length || (a.key === "") - (b.key === "") || a.key.localeCompare(b.key));
}
function registerListTiles() {
  for (const Tile of [ListTile, PeopleTile]) {
    if (getWidget(Tile.TYPE) !== Tile) registerWidget(Tile);
  }
}
function applyTitle2(tile) {
  tile.setTitle(tile.config.title || tile.constructor.TITLE);
}

// src/tiles/scope_picker.js
function createScopePicker({ options = [], value, label = "Scope", onChange } = {}) {
  const opts = options.filter((o) => o && o.value != null).map((o) => ({ ...o, value: String(o.value) }));
  const known = (v) => opts.some((o) => o.value === String(v));
  let current = known(value) ? String(value) : opts[0]?.value ?? "";
  const element = document.createElement("span");
  element.className = "fd-scope-picker";
  element.setAttribute("role", "group");
  element.setAttribute("aria-label", label);
  const buttons = opts.map((o) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "fd-scope-picker__btn";
    b.dataset.scope = o.value;
    b.textContent = o.label ?? o.value;
    if (o.hint) b.title = o.hint;
    element.append(b);
    return b;
  });
  const paint = () => {
    for (const b of buttons) {
      const on = b.dataset.scope === current;
      b.classList.toggle("fd-scope-picker__btn--on", on);
      b.setAttribute("aria-pressed", String(on));
    }
  };
  paint();
  const onClick = (e) => {
    const b = e.target?.closest?.("[data-scope]");
    if (!b || !element.contains(b) || b.dataset.scope === current) return;
    current = b.dataset.scope;
    paint();
    try {
      onChange?.(current);
    } catch (err) {
      console.error("[ScopePicker] onChange threw:", err);
    }
  };
  const onKey = (e) => {
    const i = buttons.indexOf(e.target);
    if (i < 0) return;
    const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: buttons.length - 1 }[e.key];
    if (to === void 0 || !buttons[to]) return;
    e.preventDefault();
    buttons[to].focus();
  };
  element.addEventListener("click", onClick);
  element.addEventListener("keydown", onKey);
  return {
    element,
    get value() {
      return current;
    },
    /** Press `v` without calling `onChange` (a value restored from elsewhere). */
    setValue(v) {
      if (!known(v)) return;
      current = String(v);
      paint();
    },
    dispose() {
      element.removeEventListener("click", onClick);
      element.removeEventListener("keydown", onKey);
      element.remove();
    }
  };
}

// src/tiles/tile_config_form.js
var _seq = 0;
var FOCUSABLE = 'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';
function el2(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text != null) n.textContent = String(text);
  return n;
}
function isVisible(field, values) {
  const rule = field.visibleWhen;
  if (!rule) return true;
  const v = values[rule.field];
  if (Array.isArray(rule.in)) return rule.in.includes(v);
  if ("equals" in rule) return v === rule.equals;
  return true;
}
var BUILT_IN = {
  [FieldTypes.TEXT]: (field, id) => {
    const input = el2("input", "fd-tile-config__input");
    input.type = "text";
    input.id = id;
    return {
      element: input,
      events: ["input"],
      read: () => input.value,
      write: (v) => {
        input.value = v == null ? "" : String(v);
      }
    };
  },
  [FieldTypes.NUMBER]: (field, id) => numeric(field, id, "number"),
  [FieldTypes.RANGE]: (field, id) => numeric(field, id, "range"),
  [FieldTypes.CHECKBOX]: (field, id) => {
    const input = el2("input", "fd-tile-config__checkbox");
    input.type = "checkbox";
    input.id = id;
    return {
      element: input,
      events: ["change"],
      read: () => input.checked,
      write: (v) => {
        input.checked = !!v;
      }
    };
  },
  [FieldTypes.COLOR]: (field, id) => {
    const input = el2("input", "fd-tile-config__color");
    input.type = "color";
    input.id = id;
    return {
      element: input,
      events: ["input"],
      read: () => input.value,
      write: (v) => {
        if (v) input.value = String(v);
      }
    };
  },
  [FieldTypes.SELECT]: (field, id, data) => choice(field, id, data, false),
  [FieldTypes.MULTISELECT]: (field, id, data) => choice(field, id, data, true)
};
function numeric(field, id, kind) {
  const input = el2("input", `fd-tile-config__${kind === "range" ? "range" : "input"}`);
  input.type = kind;
  input.id = id;
  if (field.min != null) input.min = String(field.min);
  if (field.max != null) input.max = String(field.max);
  if (field.step != null) input.step = String(field.step);
  const out = kind === "range" ? el2("output", "fd-tile-config__range-value") : null;
  const element = out ? el2("span", "fd-tile-config__range-wrap") : input;
  if (out) element.append(input, out);
  return {
    element,
    events: ["input"],
    // The raw text goes to `validateField`; the form turns it into a number.
    read: () => input.value,
    write: (v) => {
      input.value = v == null ? "" : String(v);
      if (out) out.textContent = input.value;
    },
    shown: (v) => {
      if (out) out.textContent = v == null ? "" : String(v);
    }
  };
}
function choice(field, id, data, multiple) {
  const select = el2("select", "fd-tile-config__select");
  select.id = id;
  select.multiple = multiple;
  const options = getFieldOptions(field, data);
  options.forEach((o) => select.append(el2("option", null, o.label ?? o.value)));
  return {
    element: select,
    events: ["change"],
    read: () => multiple ? options.filter((_, i) => select.options[i].selected).map((o) => o.value) : options[select.selectedIndex]?.value ?? null,
    write: (v) => {
      if (multiple) {
        const want = Array.isArray(v) ? v : [];
        options.forEach((o, i) => {
          select.options[i].selected = want.includes(o.value);
        });
      } else {
        select.selectedIndex = options.findIndex((o) => o.value === v);
      }
    }
  };
}
function coerce(field, raw) {
  if (field.type === FieldTypes.NUMBER || field.type === FieldTypes.RANGE) {
    return raw === "" || raw == null ? null : Number(raw);
  }
  return raw;
}
function mountTileConfigForm(host, {
  schema,
  config = {},
  data = null,
  onChange = null,
  renderers = {},
  commitOn = "input"
} = {}) {
  if (!host) throw new TypeError("mountTileConfigForm: a host element is required");
  if (commitOn !== "input" && commitOn !== "change") {
    throw new TypeError(`mountTileConfigForm: unknown commitOn "${commitOn}"`);
  }
  const fields = Array.isArray(schema?.fields) ? schema.fields : [];
  fields.forEach((f, i) => {
    if (typeof f?.key !== "string" || !f.key) {
      const called = typeof f?.label === "string" && f.label ? ` "${f.label}"` : "";
      throw new TypeError(`mountTileConfigForm: field #${i + 1}${called} has no key`);
    }
  });
  let values = mergeWithDefaults(config || {}, schema);
  const unlisten = [];
  const root = el2("div", "fd-tile-config");
  const rows = [];
  const showError = (r, message) => {
    r.invalid = !!message;
    r.error.textContent = message || "";
    r.error.hidden = !message;
    r.row.classList.toggle("fd-tile-config__row--invalid", !!message);
  };
  const applyVisibility = () => {
    for (const r of rows) r.row.hidden = !isVisible(r.field, values);
  };
  const commit = (r, raw) => {
    if (r.field.readonly) return { valid: false, error: `${r.named.label} is read-only` };
    const result = validateField(raw, r.named);
    if (!result.valid) {
      showError(r, result.error);
      return { valid: false, error: result.error };
    }
    showError(r, null);
    const value = coerce(r.field, raw);
    values = { ...values, [r.field.key]: value };
    applyVisibility();
    onChange?.(r.field.key, value, { ...values });
    return { valid: true };
  };
  for (const field of fields) {
    const id = `fd-tile-config-${++_seq}`;
    const row = el2("div", `fd-tile-config__row fd-tile-config__row--${field.type}`);
    row.setAttribute("data-field", field.key);
    const named = { ...field, label: field.label ?? field.key };
    const label = el2("label", "fd-tile-config__label", named.label);
    const error = el2("div", "fd-tile-config__error");
    error.hidden = true;
    const r = { field, named, row, error, control: null, invalid: false, pending: null };
    const custom = renderers?.[field.type];
    if (typeof custom === "function") {
      const made = custom({
        field,
        key: field.key,
        value: values[field.key],
        data,
        readonly: !!field.readonly,
        commit: (v) => commit(r, v)
      });
      const element = made instanceof HTMLElement ? made : made?.element;
      if (!(element instanceof HTMLElement)) {
        throw new TypeError(`mountTileConfigForm: the renderer for "${field.type}" returned no element`);
      }
      element.id ||= id;
      label.htmlFor = element.id;
      r.control = {
        element,
        write: made instanceof HTMLElement ? () => {
        } : (v) => made.setValue?.(v),
        dispose: made instanceof HTMLElement ? null : () => made.dispose?.()
      };
    } else {
      const build = BUILT_IN[field.type];
      if (!build) {
        throw new TypeError(`mountTileConfigForm: no control for type "${field.type}" (field "${field.key}"); pass a renderer`);
      }
      const c = build(field, id, data);
      label.htmlFor = id;
      c.write(values[field.key]);
      const input = c.element.matches("input, select") ? c.element : c.element.querySelector("input, select");
      if (field.readonly) {
        input.disabled = true;
      } else {
        const listen = (type, fn) => {
          input.addEventListener(type, fn);
          unlisten.push(() => input.removeEventListener(type, fn));
        };
        const onEdit = () => {
          r.pending = null;
          const raw = c.read();
          c.shown?.(raw);
          commit(r, raw);
        };
        if (commitOn === "change") {
          listen("change", onEdit);
          if (c.events.includes("input")) {
            listen("input", () => {
              r.pending = onEdit;
              c.shown?.(c.read());
            });
          }
        } else {
          for (const type of c.events) listen(type, onEdit);
        }
      }
      r.control = c;
    }
    if (field.type === FieldTypes.CHECKBOX) row.append(r.control.element, label);
    else row.append(label, r.control.element);
    if (field.description) row.append(el2("div", "fd-tile-config__help", field.description));
    row.append(error);
    rows.push(r);
    root.append(row);
  }
  applyVisibility();
  host.append(root);
  return {
    getValues: () => ({ ...values }),
    setValues(next) {
      values = mergeWithDefaults(next || {}, schema);
      for (const r of rows) {
        r.pending = null;
        r.control.write(values[r.field.key]);
        showError(r, null);
      }
      applyVisibility();
    },
    isValid: () => rows.every((r) => r.row.hidden || !r.invalid),
    focusFirstInvalid() {
      const r = rows.find((x) => !x.row.hidden && x.invalid);
      if (!r) return false;
      const { element } = r.control;
      const target = element.matches(FOCUSABLE) ? element : element.querySelector(FOCUSABLE);
      (target || element).focus();
      return true;
    },
    flush() {
      for (const r of rows) r.pending?.();
    },
    dispose() {
      unlisten.splice(0).forEach((off) => off());
      for (const r of rows) {
        try {
          r.control.dispose?.();
        } catch (err) {
          console.warn("[tile-config] a renderer dispose threw", err);
        }
      }
      rows.length = 0;
      root.remove();
    }
  };
}
function openTileConfig(eventBus, { mode = "modal", host = null, width, renderers = {}, title = "Tile settings" } = {}) {
  if (typeof eventBus?.on !== "function") throw new TypeError("openTileConfig: an event bus with on() is required");
  if (mode !== "modal" && mode !== "slide-out") throw new TypeError(`openTileConfig: unknown mode "${mode}"`);
  if (mode === "slide-out" && !(host instanceof HTMLElement)) {
    throw new TypeError("openTileConfig: a slide-out needs a host element");
  }
  let form = null;
  let panel = null;
  let modalOpen = false;
  const drop = () => {
    form?.flush();
    form?.dispose();
    form = null;
  };
  const show = (detail = {}) => {
    if (modalOpen) return;
    const heading = typeof title === "function" ? title(detail) : title;
    const base = { schema: detail.schema, config: detail.config, data: detail.data ?? null, renderers };
    if (mode === "slide-out") {
      drop();
      if (!panel) {
        panel = new SlideOutPanel({ ...width ? { width } : {}, onClose: drop });
        panel.mount(host);
      }
      const body = panel.open(heading, "tune");
      form = mountTileConfigForm(body, {
        ...base,
        commitOn: "change",
        onChange: (_k, _v, cfg) => detail.onSave?.(cfg)
      });
      return;
    }
    const content = el2("div", "fd-tile-config-host");
    const mine = mountTileConfigForm(content, base);
    modalOpen = true;
    openModal({
      title: heading,
      icon: "tune",
      content,
      ...width ? { width } : {},
      actions: [
        { label: "Cancel", value: null },
        // Refused while a field shows an error: its last valid value is
        // not what the user is looking at, so saving it would be a lie.
        { label: "Save", value: "save", primary: true, keepOpen: true, onClick: (close) => {
          if (mine.isValid()) {
            close("save");
            return;
          }
          mine.focusFirstInvalid();
        } }
      ]
    }).then((v) => {
      modalOpen = false;
      if (v === "save") detail.onSave?.(mine.getValues());
      mine.dispose();
    });
  };
  const sub = eventBus.on("grid:config-modal-show", show);
  return () => {
    sub.dispose();
    drop();
    panel?.dispose();
    panel = null;
  };
}

// src/tiles/tile_grid.js
init_tile_registry();
var TileGrid = class {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.container - Container element for the grid
   * @param {number} [options.columns=12] - Number of grid columns
   * @param {number} [options.rowHeight=80] - Height of each grid row in pixels
   * @param {number} [options.gap=16] - Gap between tiles in pixels
   * @param {Object} [options.eventBus] - Event bus for cross-component communication
   * @param {boolean} [options.showToolbar=true] - Whether to show built-in toolbar
   * @param {Function} [options.onLayoutChange] - Callback when layout changes
   * @param {Function} [options.onAddWidget] - Callback for add widget action
   * @param {Function} [options.onResetLayout] - Callback for reset layout action
   * @param {Function} [options.onExport] - Callback for export action
   * @param {{resolve: Function}} [options.dataSource] - Per-tile data provider,
   *        handed to every tile. With none, the grid is the broadcast-only grid
   *        it has always been and no tile is ever asked to load anything.
   * @param {*} [options.scope=null] - The board's scope, a filter every tile
   *        follows (0.16.1); see `setScope`.
   * @param {Function} [options.onScopeChange] - `(scope)` after `setScope` changed it.
   * @param {boolean} [options.configOnDoubleClick=true] - Whether a double-click
   *        on a tile's title strip opens its config, as its cogwheel does (0.17.16).
   */
  constructor({
    container,
    columns = 12,
    rowHeight = 80,
    gap = 16,
    eventBus = null,
    showToolbar = true,
    readonly = false,
    onLayoutChange,
    onBeforeLayoutChange,
    onAddWidget,
    onResetLayout,
    onExport,
    // Handed down to every tile. TileBase used to import appHost() from
    // ui/js/ecoagent/ to back Expand -> Export CSV/PNG; a grid that has
    // no host simply gets the Blob-download fallback the host contract
    // promises. It is not an error to have none.
    host = null,
    stateGuard = null,
    // Injected, never constructed here: the grid does not know what
    // a binding is, only that a tile may have somewhere to ask.
    dataSource = null,
    scope = null,
    onScopeChange = null,
    // STORY-0128. Handed to every tile: false turns off the
    // title strip's double-click to configure.
    configOnDoubleClick = true
  }) {
    this.host = host;
    this.scope = scope;
    this._onScopeChangeCallback = onScopeChange;
    this.stateGuard = stateGuard;
    this.dataSource = dataSource;
    this.configOnDoubleClick = configOnDoubleClick;
    this._configuringIds = /* @__PURE__ */ new Set();
    this.container = container;
    this.columns = columns;
    this.rowHeight = rowHeight;
    this.gap = gap;
    this.eventBus = eventBus;
    this.showToolbar = showToolbar;
    this.readonly = readonly;
    this._onLayoutChangeCallback = onLayoutChange;
    this._onBeforeLayoutChangeCallback = onBeforeLayoutChange;
    this._onAddWidgetCallback = onAddWidget;
    this._onResetLayoutCallback = onResetLayout;
    this._onExportCallback = onExport;
    this.tiles = /* @__PURE__ */ new Map();
    this.layout = [];
    this.documentationCellIds = null;
    this.gridElement = null;
    this.data = null;
    this.fullData = null;
    this._dragState = null;
    this._resizeState = null;
    this._ghostElement = null;
    this._boundOnPointerMove = this._onPointerMove.bind(this);
    this._boundOnPointerUp = this._onPointerUp.bind(this);
    this._init();
  }
  /**
   * Initialize the grid container.
   * @private
   */
  _init() {
    this.gridElement = document.createElement("div");
    this.gridElement.className = "tile-grid";
    this.gridElement.style.setProperty("--grid-columns", this.columns);
    this.gridElement.style.setProperty("--grid-row-height", `${this.rowHeight}px`);
    this.gridElement.style.setProperty("--grid-gap", `${this.gap}px`);
    this.container.innerHTML = "";
    this.container.appendChild(this.gridElement);
    if (this.showToolbar) {
      this._buildToolbar();
    }
    this.gridElement.addEventListener("tile:config-request", this._onTileConfigRequest.bind(this));
    this.gridElement.addEventListener("tile:remove-request", this._onTileRemoveRequest.bind(this));
    document.addEventListener("pointermove", this._boundOnPointerMove);
    document.addEventListener("pointerup", this._boundOnPointerUp);
  }
  /**
   * Build the dashboard bottom toolbar with add widget dropdown.
   * @private
   */
  _buildToolbar() {
    const toolbar = document.createElement("div");
    toolbar.className = "tile-grid-toolbar tile-grid-toolbar--bottom";
    this._toolbarElement = toolbar;
    toolbar.innerHTML = `
            <div class="toolbar-group toolbar-group--main">
                <div class="add-widget-container">
                    <button class="toolbar-btn add-widget-btn twm-has-tooltip" data-tooltip="Add widget">
                        <span class="material-symbols-outlined">add</span>
                        <span>Add Widget</span>
                        <span class="material-symbols-outlined dropdown-arrow">expand_less</span>
                    </button>
                </div>
                <button class="toolbar-btn reset-layout-btn twm-has-tooltip" data-tooltip="Reset to default layout">
                    <span class="material-symbols-outlined">restart_alt</span>
                    <span class="btn-text">Reset</span>
                </button>
                <button class="toolbar-btn export-btn twm-has-tooltip" data-tooltip="Export report">
                    <span class="material-symbols-outlined">download</span>
                    <span class="btn-text">Export</span>
                </button>
            </div>
        `;
    const addBtn = toolbar.querySelector(".add-widget-btn");
    const catalog = getWidgetCatalog();
    this._addWidgetDropdown = new ActionDropdown({
      trigger: addBtn,
      options: catalog.map((w) => ({ type: w.type, label: w.title, icon: w.icon, description: w.description })),
      onSelect: (opt) => this._addWidgetFromDropdown(opt.type),
      className: "add-widget-dropdown-menu"
    });
    toolbar.querySelector(".reset-layout-btn")?.addEventListener("click", () => this._resetLayout());
    toolbar.querySelector(".export-btn")?.addEventListener("click", () => this._exportReport());
    this.container.appendChild(toolbar);
  }
  /**
   * Add a widget from the dropdown selection.
   * @param {string} type - Widget type
   * @private
   */
  _addWidgetFromDropdown(type) {
    import("./tile_registry-6WZPTUZV.js").then(({ getWidget: getWidget2 }) => {
      const WidgetClass = getWidget2(type);
      if (WidgetClass) {
        const size = WidgetClass.DEFAULT_SIZE || { w: 4, h: 3 };
        const pos = this.findNextPosition(size.w, size.h);
        this.addTile(type, { ...pos, ...size });
      }
    });
  }
  /**
   * Add a tile to the grid.
   * @param {string} type - Widget type
   * @param {Object} position - Grid position {x, y, w, h}
   * @param {Object} [config] - Widget configuration
   * @param {string} [id] - Optional tile ID (generated if not provided)
   * @returns {import('./tile_base.js').TileBase | null} The created tile or null
   */
  addTile(type, position, config = {}, id = null) {
    const tileId = id || `tile-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const tile = createWidget(type, {
      id: tileId,
      grid: this,
      eventBus: this.eventBus,
      config,
      readonly: this.readonly,
      host: this.host,
      stateGuard: this.stateGuard,
      dataSource: this.dataSource,
      configOnDoubleClick: this.configOnDoubleClick
    });
    if (!tile) return null;
    tile.scope = this.scope;
    if (this._configuringIds.has(tileId)) tile._applyConfiguring(true);
    const layoutEntry = {
      id: tileId,
      type,
      x: position.x,
      y: position.y,
      w: position.w,
      h: position.h,
      config
    };
    this.layout.push(layoutEntry);
    this.tiles.set(tileId, tile);
    tile.mount(this.gridElement);
    this._applyTilePosition(tile, layoutEntry);
    this._setupTileDragHandlers(tile);
    if (this.data) {
      tile.fullData = this.fullData;
      tile.update(this.data);
    } else if (this.dataSource) {
      tile.loadData?.();
    }
    this._emitLayoutChanged();
    return tile;
  }
  /**
   * Remove a tile from the grid.
   * @param {string} tileId - Tile ID to remove
   */
  removeTile(tileId) {
    const tile = this.tiles.get(tileId);
    if (!tile) return;
    tile.dispose();
    this.tiles.delete(tileId);
    this.layout = this.layout.filter((l) => l.id !== tileId);
    this._emitLayoutChanged();
  }
  /**
   * Update all tiles with new data.
   * @param {Object} data - Analytics data
   */
  setData(data) {
    this.data = data;
    this.tiles.forEach((tile) => {
      tile.fullData = this.fullData;
      tile.update(data);
    });
  }
  /**
   * Ask every self-fetching tile to load again, bypassing whatever the data
   * source has cached.
   *
   * The counterpart of `setData` for the pull model: `setData` is how a caller
   * with one dataset for the whole board pushes it, and this is how a caller
   * whose tiles each own a query says "that underlying data changed". Passing
   * `ids` narrows it to the tiles a change actually touched, which is what an
   * invalidation carrying a table id can work out and a broadcast cannot.
   *
   * Not awaited and returns nothing: the tiles render themselves as their own
   * requests land, and a caller that waited for all of them would be waiting on
   * the slowest tile to show the fastest one.
   *
   * @param {string[]|Set<string>|null} [ids] - Tile ids, or null for all.
   */
  reloadAll(ids = null) {
    if (!this.dataSource) return;
    const wanted = ids ? new Set(ids) : null;
    this.tiles.forEach((tile, tileId) => {
      if (wanted && !wanted.has(tileId)) return;
      tile.loadData?.({ force: true });
    });
  }
  /**
   * THE BOARD'S SCOPE: one filter every tile follows ("Everyone", "Assigned
   * by me", …), set from a `createScopePicker` or from anything else.
   *
   * The grid only carries the value; what it means is the embedder's. Every
   * tile gets it as `tile.scope` and through `tile.onScopeChange(scope)`, the
   * grid's `onScopeChange(scope)` is called, and a grid with a data source
   * reloads its tiles, since their rows depend on it. The scope is not part
   * of the layout: it is how the board is being looked at, not what is on it.
   *
   * @param {*} scope - Compared by JSON: setting the same scope again does nothing.
   * @returns {boolean} whether it changed
   */
  setScope(scope) {
    if (JSON.stringify(scope ?? null) === JSON.stringify(this.scope ?? null)) return false;
    this.scope = scope ?? null;
    this.tiles.forEach((tile) => {
      tile.scope = this.scope;
      try {
        tile.onScopeChange?.(this.scope);
      } catch (err) {
        console.error("[TileGrid] a tile's onScopeChange threw:", err);
      }
    });
    try {
      this._onScopeChangeCallback?.(this.scope);
    } catch (err) {
      console.error("[TileGrid] onScopeChange threw:", err);
    }
    this.eventBus?.emit?.("grid:scope-changed", { scope: this.scope });
    if (this.dataSource) this.reloadAll();
    return true;
  }
  /**
   * Get current layout.
   * @returns {Array} Layout array
   */
  getLayout() {
    return this.layout.map((l) => ({
      id: l.id,
      type: l.type,
      x: l.x,
      y: l.y,
      w: l.w,
      h: l.h,
      config: this.tiles.get(l.id)?.config || l.config
    }));
  }
  /**
   * Mark a tile as being configured, or clear the mark (STORY-0128).
   *
   * A config request (cogwheel or title double-click) highlights the
   * requesting tile with `tile--selected` and takes that highlight off every
   * other tile: one selection per grid. An embedder that keeps a config
   * window open per tile marks each such tile here instead. The mark
   * (`tile--configuring`, drawn like the selection) is the embedder's alone:
   * no config request clears it, and it is held by id, so a tile that
   * `setLayout` rebuilds (or an id added later) is marked again. Clear it
   * when that tile's config window closes.
   *
   * @param {string} tileId
   * @param {boolean} [on=true]
   */
  setConfiguring(tileId, on = true) {
    if (on) this._configuringIds.add(tileId);
    else this._configuringIds.delete(tileId);
    this.tiles.get(tileId)?._applyConfiguring(!!on);
  }
  /**
   * @param {string} tileId
   * @returns {boolean} Whether the tile is marked as being configured.
   */
  isConfiguring(tileId) {
    return this._configuringIds.has(tileId);
  }
  /**
   * Set layout and rebuild tiles.
   * @param {Array|Object} layout - Layout array or object with tiles property
   */
  setLayout(layout) {
    this.tiles.forEach((tile) => tile.dispose());
    this.tiles.clear();
    this.layout = [];
    this.gridElement.innerHTML = "";
    const tilesArray = Array.isArray(layout) ? layout : layout?.tiles || [];
    tilesArray.forEach((item) => {
      this.addTile(item.type, {
        x: item.x,
        y: item.y,
        w: item.w,
        h: item.h
      }, item.config, item.id);
    });
  }
  /**
   * Apply CSS grid position to a tile element.
   * @param {import('./tile_base.js').TileBase} tile
   * @param {{x: number, y: number, w: number, h: number}} position
   * @private
   */
  _applyTilePosition(tile, position) {
    if (!tile.element) return;
    tile.element.style.gridColumn = `${position.x + 1} / span ${position.w}`;
    tile.element.style.gridRow = `${position.y + 1} / span ${position.h}`;
  }
  /**
   * Setup drag and resize handlers for a tile.
   * @param {import('./tile_base.js').TileBase} tile
   * @private
   */
  _setupTileDragHandlers(tile) {
    if (!tile.element || this.readonly) return;
    const dragHandle = tile.element.querySelector(".tile-drag-handle");
    const resizeHandle = tile.element.querySelector(".tile-resize-handle");
    if (dragHandle) {
      dragHandle.addEventListener("pointerdown", (e) => this._onDragStart(tile, e));
    }
    if (resizeHandle) {
      resizeHandle.addEventListener("pointerdown", (e) => this._onResizeStart(tile, e));
    }
  }
  /**
   * Handle drag start.
   * @param {import('./tile_base.js').TileBase} tile
   * @param {PointerEvent} e
   * @private
   */
  _onDragStart(tile, e) {
    e.preventDefault();
    e.stopPropagation();
    const rect = tile.element.getBoundingClientRect();
    const gridRect = this.gridElement.getBoundingClientRect();
    const layoutItem = this.layout.find((l) => l.id === tile.id);
    if (!layoutItem) return;
    this._emitBeforeLayoutChange();
    this._dragState = {
      tile,
      tileId: tile.id,
      startX: e.clientX,
      startY: e.clientY,
      startGridX: layoutItem.x,
      startGridY: layoutItem.y,
      tileRect: rect,
      gridRect,
      w: layoutItem.w,
      h: layoutItem.h
    };
    tile.element.classList.add("dragging");
    this._createGhost(rect);
  }
  /**
   * Handle resize start.
   * @param {import('./tile_base.js').TileBase} tile
   * @param {PointerEvent} e
   * @private
   */
  _onResizeStart(tile, e) {
    e.preventDefault();
    e.stopPropagation();
    const layoutItem = this.layout.find((l) => l.id === tile.id);
    if (!layoutItem) return;
    const gridRect = this.gridElement.getBoundingClientRect();
    const cellWidth = (gridRect.width - (this.columns - 1) * this.gap) / this.columns;
    this._emitBeforeLayoutChange();
    this._resizeState = {
      tile,
      tileId: tile.id,
      startX: e.clientX,
      startY: e.clientY,
      startW: layoutItem.w,
      startH: layoutItem.h,
      gridRect,
      cellWidth,
      x: layoutItem.x,
      y: layoutItem.y
    };
    tile.element.classList.add("resizing");
  }
  /**
   * Handle pointer move (drag/resize).
   * @param {PointerEvent} e
   * @private
   */
  _onPointerMove(e) {
    if (this._dragState) {
      this._onDragMove(e);
    } else if (this._resizeState) {
      this._onResizeMove(e);
    }
  }
  /**
   * Handle drag move.
   * @param {PointerEvent} e
   * @private
   */
  _onDragMove(e) {
    const state = this._dragState;
    if (!state) return;
    const dx = e.clientX - state.startX;
    const dy = e.clientY - state.startY;
    const gridRect = state.gridRect;
    const cellWidth = (gridRect.width - (this.columns - 1) * this.gap) / this.columns;
    const cellHeight = this.rowHeight;
    const deltaGridX = Math.round(dx / (cellWidth + this.gap));
    const deltaGridY = Math.round(dy / (cellHeight + this.gap));
    let newX = state.startGridX + deltaGridX;
    let newY = state.startGridY + deltaGridY;
    newX = Math.max(0, Math.min(newX, this.columns - state.w));
    newY = Math.max(0, newY);
    if (this._ghostElement) {
      const ghostLeft = newX * (cellWidth + this.gap);
      const ghostTop = newY * (cellHeight + this.gap);
      this._ghostElement.style.transform = `translate(${ghostLeft}px, ${ghostTop}px)`;
      this._ghostElement.style.width = `${state.w * cellWidth + (state.w - 1) * this.gap}px`;
      this._ghostElement.style.height = `${state.h * cellHeight + (state.h - 1) * this.gap}px`;
    }
    state.pendingX = newX;
    state.pendingY = newY;
  }
  /**
   * Handle resize move.
   * @param {PointerEvent} e
   * @private
   */
  _onResizeMove(e) {
    const state = this._resizeState;
    if (!state) return;
    const dx = e.clientX - state.startX;
    const dy = e.clientY - state.startY;
    const deltaW = Math.round(dx / (state.cellWidth + this.gap));
    const deltaH = Math.round(dy / (this.rowHeight + this.gap));
    let newW = state.startW + deltaW;
    let newH = state.startH + deltaH;
    const tileClass = state.tile.constructor;
    const constraints = tileClass.SIZE_CONSTRAINTS || { minW: 2, minH: 2, maxW: 12, maxH: 8 };
    newW = Math.max(constraints.minW, Math.min(newW, constraints.maxW));
    newH = Math.max(constraints.minH, Math.min(newH, constraints.maxH));
    newW = Math.min(newW, this.columns - state.x);
    state.tile.element.style.gridColumn = `${state.x + 1} / span ${newW}`;
    state.tile.element.style.gridRow = `${state.y + 1} / span ${newH}`;
    state.pendingW = newW;
    state.pendingH = newH;
  }
  /**
   * Handle pointer up (end drag/resize).
   * @param {PointerEvent} e
   * @private
   */
  _onPointerUp(e) {
    if (this._dragState) {
      this._onDragEnd();
    } else if (this._resizeState) {
      this._onResizeEnd();
    }
  }
  /**
   * Handle drag end.
   * @private
   */
  _onDragEnd() {
    const state = this._dragState;
    if (!state) return;
    state.tile.element.classList.remove("dragging");
    this._removeGhost();
    if (state.pendingX !== void 0 && state.pendingY !== void 0) {
      const layoutItem = this.layout.find((l) => l.id === state.tileId);
      if (layoutItem) {
        layoutItem.x = state.pendingX;
        layoutItem.y = state.pendingY;
        this._applyTilePosition(state.tile, layoutItem);
        this._resolveOverlaps(state.tileId);
        this._emitLayoutChanged();
      }
    }
    this._dragState = null;
  }
  /**
   * Handle resize end.
   * @private
   */
  _onResizeEnd() {
    const state = this._resizeState;
    if (!state) return;
    state.tile.element.classList.remove("resizing");
    if (state.pendingW !== void 0 && state.pendingH !== void 0) {
      const layoutItem = this.layout.find((l) => l.id === state.tileId);
      if (layoutItem) {
        layoutItem.w = state.pendingW;
        layoutItem.h = state.pendingH;
        this._resolveOverlaps(state.tileId);
        this._emitLayoutChanged();
        if (this.data) {
          state.tile.fullData = this.fullData;
          state.tile.update(this.data);
        } else {
          state.tile.onResize?.();
        }
      }
    }
    this._resizeState = null;
  }
  /**
   * Check if two layout items overlap.
   * @param {Object} a - First layout item {x, y, w, h}
   * @param {Object} b - Second layout item {x, y, w, h}
   * @returns {boolean}
   * @private
   */
  _tilesOverlap(a, b) {
    return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
  }
  /**
   * Resolve overlaps by pushing tiles down.
   * @param {string} sourceTileId - The tile that was resized/moved
   * @private
   */
  _resolveOverlaps(sourceTileId) {
    const sourceItem = this.layout.find((l) => l.id === sourceTileId);
    if (!sourceItem) return;
    const otherTiles = this.layout.filter((l) => l.id !== sourceTileId).sort((a, b) => a.y - b.y || a.x - b.x);
    let hasChanges = true;
    let iterations = 0;
    const maxIterations = 100;
    while (hasChanges && iterations < maxIterations) {
      hasChanges = false;
      iterations++;
      for (const item of otherTiles) {
        if (this._tilesOverlap(sourceItem, item)) {
          const newY = sourceItem.y + sourceItem.h;
          if (item.y !== newY) {
            item.y = newY;
            hasChanges = true;
            const tile = this.tiles.get(item.id);
            if (tile) {
              this._applyTilePosition(tile, item);
            }
          }
        }
      }
      for (let i = 0; i < otherTiles.length; i++) {
        for (let j = i + 1; j < otherTiles.length; j++) {
          if (this._tilesOverlap(otherTiles[i], otherTiles[j])) {
            const pusher = otherTiles[i];
            const pushed = otherTiles[j];
            const newY = pusher.y + pusher.h;
            if (pushed.y < newY && this._tilesOverlap(pusher, pushed)) {
              pushed.y = newY;
              hasChanges = true;
              const tile = this.tiles.get(pushed.id);
              if (tile) {
                this._applyTilePosition(tile, pushed);
              }
            }
          }
        }
      }
    }
    this._compactLayout();
  }
  /**
   * Compact the layout by removing vertical gaps.
   * @private
   */
  _compactLayout() {
    const sortedTiles = [...this.layout].sort((a, b) => a.y - b.y || a.x - b.x);
    for (const item of sortedTiles) {
      let newY = 0;
      while (newY < item.y) {
        const testPosition = { ...item, y: newY };
        let hasOverlap = false;
        for (const other of this.layout) {
          if (other.id === item.id) continue;
          if (this._tilesOverlap(testPosition, other)) {
            hasOverlap = true;
            newY = other.y + other.h;
            break;
          }
        }
        if (!hasOverlap) {
          break;
        }
      }
      if (newY < item.y) {
        item.y = newY;
        const tile = this.tiles.get(item.id);
        if (tile) {
          this._applyTilePosition(tile, item);
        }
      }
    }
  }
  /**
   * Create ghost element for drag preview.
   * @param {DOMRect} rect - Original tile rect
   * @private
   */
  _createGhost(rect) {
    this._ghostElement = document.createElement("div");
    this._ghostElement.className = "tile-ghost";
    this.gridElement.appendChild(this._ghostElement);
  }
  /**
   * Remove ghost element.
   * @private
   */
  _removeGhost() {
    if (this._ghostElement) {
      this._ghostElement.remove();
      this._ghostElement = null;
    }
  }
  /**
   * Find next available position for a new tile.
   * @param {number} w - Width in cells
   * @param {number} h - Height in cells
   * @returns {{x: number, y: number}}
   */
  findNextPosition(w, h) {
    const maxY = Math.max(...this.layout.map((l) => l.y + l.h), 0);
    const occupied = /* @__PURE__ */ new Set();
    this.layout.forEach((l) => {
      for (let x = l.x; x < l.x + l.w; x++) {
        for (let y = l.y; y < l.y + l.h; y++) {
          occupied.add(`${x},${y}`);
        }
      }
    });
    for (let y = 0; y <= maxY + 1; y++) {
      for (let x = 0; x <= this.columns - w; x++) {
        let fits = true;
        for (let dx = 0; dx < w && fits; dx++) {
          for (let dy = 0; dy < h && fits; dy++) {
            if (occupied.has(`${x + dx},${y + dy}`)) {
              fits = false;
            }
          }
        }
        if (fits) {
          return { x, y };
        }
      }
    }
    return { x: 0, y: maxY + 1 };
  }
  /**
   * Handle tile config request.
   * @param {CustomEvent} e
   * @private
   */
  _onTileConfigRequest(e) {
    const { tileId, tileType, config, schema } = e.detail;
    this.eventBus?.emit?.("grid:config-modal-show", {
      tileId,
      tileType,
      config,
      schema,
      // What `getFieldOptions` reads for a field with dynamic options.
      data: this.data,
      variables: this.data ? this._getVariableList() : [],
      onSave: (newConfig) => {
        const tile = this.tiles.get(tileId);
        if (tile) {
          tile.fullData = this.fullData;
          tile.update(this.data, newConfig);
          if (this.dataSource) tile.loadData?.({ force: true });
          const layoutItem = this.layout.find((l) => l.id === tileId);
          if (layoutItem) {
            layoutItem.config = newConfig;
          }
          this._emitLayoutChanged();
        }
      }
    });
  }
  /**
   * Handle tile remove request.
   * Note: Let the event bubble up to the dashboard which handles confirmation.
   * @param {CustomEvent} e
   * @private
   */
  _onTileRemoveRequest(e) {
  }
  /**
   * Get list of available variables from data.
   * @returns {Array<{value: string, label: string}>}
   * @private
   */
  _getVariableList() {
    if (!this.data) return [];
    const variables = [];
    if (this.data.stocks) {
      Object.keys(this.data.stocks).forEach((name) => {
        variables.push({ value: name, label: name });
      });
    }
    if (this.data.indicators) {
      Object.keys(this.data.indicators).forEach((name) => {
        variables.push({ value: name, label: name });
      });
    }
    return variables;
  }
  /**
   * Show add widget menu.
   * @private
   */
  _showAddWidgetMenu() {
    this.eventBus?.emit?.("grid:add-widget-menu-show", {
      onSelect: (type) => {
        const { getWidget: getWidget2 } = (init_tile_registry(), __toCommonJS(tile_registry_exports));
        const WidgetClass = getWidget2(type);
        if (WidgetClass) {
          const size = WidgetClass.DEFAULT_SIZE || { w: 4, h: 3 };
          const pos = this.findNextPosition(size.w, size.h);
          this.addTile(type, { ...pos, ...size });
        }
      }
    });
  }
  /**
   * Reset to default layout.
   * @private
   */
  _resetLayout() {
    this.eventBus?.emit?.("grid:reset-layout-confirm", {
      onConfirm: () => {
        this.eventBus?.emit?.("grid:layout-reset-requested");
      }
    });
  }
  /**
   * Export report.
   * @private
   */
  _exportReport() {
    this.eventBus?.emit?.("grid:export-requested", {
      gridElement: this.gridElement,
      layout: this.getLayout()
    });
  }
  /**
   * Notify that a layout mutation is about to begin (drag/resize start).
   * @private
   */
  _emitBeforeLayoutChange() {
    if (typeof this._onBeforeLayoutChangeCallback === "function") {
      this._onBeforeLayoutChangeCallback(this.getLayout());
    }
  }
  /**
   * Emit layout changed event and call the onLayoutChange callback.
   * @private
   */
  _emitLayoutChanged() {
    const layout = this.getLayout();
    this.eventBus?.emit?.("grid:layout-changed", { layout });
    if (typeof this._onLayoutChangeCallback === "function") {
      this._onLayoutChangeCallback(layout);
    }
  }
  /**
   * Clean up resources.
   */
  dispose() {
    document.removeEventListener("pointermove", this._boundOnPointerMove);
    document.removeEventListener("pointerup", this._boundOnPointerUp);
    this._addWidgetDropdown?.destroy();
    this._addWidgetDropdown = null;
    this.tiles.forEach((tile) => tile.dispose());
    this.tiles.clear();
    this.layout = [];
    if (this.gridElement) {
      this.gridElement.remove();
      this.gridElement = null;
    }
  }
};

// tiles.js
init_tile_registry();
export {
  CHART_TILE_TYPES,
  ChartTile,
  FieldTypes,
  FigureTile,
  KpiTile,
  LayoutPersistence,
  ListTile,
  PeopleTile,
  TileBase,
  TileGrid,
  TileRegistry,
  configureLayoutPersistence,
  createScopePicker,
  createWidget,
  formatVariableLabel,
  getAllWidgetTypes,
  getFieldOptions,
  getLayoutPersistence,
  getNamespaceOptions,
  getVariableOptions,
  getWidget,
  getWidgetCatalog,
  getWidgetMetadata,
  groupByPerson,
  hasWidget,
  mergeWithDefaults,
  mountTileConfigForm,
  normalizeChartData,
  normalizeListData,
  normalizePeopleData,
  openTileConfig,
  registerChartTiles,
  registerListTiles,
  registerWidget,
  setTileLogger,
  validateConfig,
  validateField
};
//# sourceMappingURL=tiles.js.map
