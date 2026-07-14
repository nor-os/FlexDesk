import {
  ActionDropdown
} from "./chunk-TLZUUFOE.js";
import {
  openRawTracesWindow
} from "./chunk-DRYCDMEG.js";
import "./chunk-CT4YXXLP.js";
import "./chunk-UCJ2WD4D.js";
import "./chunk-FL5KFNQH.js";
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
   */
  constructor({
    id,
    grid,
    eventBus = null,
    config = {},
    readonly = false,
    headless = false,
    host = null,
    stateGuard = null
  }) {
    this.host = host;
    this.stateGuard = stateGuard;
    this.id = id;
    this.grid = grid;
    this.eventBus = eventBus;
    this.config = { ...this.getDefaultConfig(), ...config };
    this.readonly = readonly;
    this.headless = headless;
    this.element = null;
    this.contentElement = null;
    this.chartInstance = null;
    this.data = null;
    this.fullData = null;
    this._disposed = false;
    this.comparisonData = null;
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
    this.element.className = `tile${this.readonly ? " tile--readonly" : ""}`;
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
   * Build the tile chrome (header, content area, resize handles).
   * @private
   */
  _buildChrome() {
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
                    <div class="tile-menu-wrapper">
                        <button class="tile-menu-btn twm-has-tooltip" data-tooltip="More actions">
                            <span class="material-symbols-outlined">more_vert</span>
                        </button>
                        <div class="tile-menu-dropdown" hidden>
                            <button class="tile-menu-item" data-action="add-to-documentation" style="${this.config?.sourceCellId && this.grid?.documentationCellIds?.has(this.config.sourceCellId) ? "display:none" : ""}">
                                <span class="material-symbols-outlined">post_add</span>
                                <span>Add to Documentation</span>
                            </button>
                            <button class="tile-menu-item" data-action="show-in-documentation" style="${this.config?.sourceCellId && this.grid?.documentationCellIds?.has(this.config.sourceCellId) ? "" : "display:none"}">
                                <span class="material-symbols-outlined">description</span>
                                <span>Show in Documentation</span>
                            </button>
                        </div>
                    </div>
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
      const menuBtn = header.querySelector(".tile-menu-btn");
      const menuDropdown = header.querySelector(".tile-menu-dropdown");
      if (menuBtn && menuDropdown) {
        menuBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          const isOpen = !menuDropdown.hidden;
          menuDropdown.hidden = !menuDropdown.hidden;
          if (!isOpen) {
            const closeMenu = (ev) => {
              if (!menuDropdown.contains(ev.target) && ev.target !== menuBtn) {
                menuDropdown.hidden = true;
                document.removeEventListener("pointerdown", closeMenu, true);
              }
            };
            requestAnimationFrame(() => {
              document.addEventListener("pointerdown", closeMenu, true);
            });
          }
        });
        menuDropdown.querySelector('[data-action="add-to-documentation"]')?.addEventListener("click", (e) => {
          e.stopPropagation();
          menuDropdown.hidden = true;
          this.eventBus?.emit?.("tile:add-to-documentation", {
            tileType: this.constructor.TYPE,
            config: { ...this.config }
          });
        });
        menuDropdown.querySelector('[data-action="show-in-documentation"]')?.addEventListener("click", (e) => {
          e.stopPropagation();
          menuDropdown.hidden = true;
          if (this.config?.sourceCellId) {
            this.eventBus?.emit?.("tile:show-in-documentation", {
              sourceCellId: this.config.sourceCellId
            });
          }
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
   * Handle config button click — highlight tile and emit config request.
   * @private
   */
  _onConfigClick() {
    this.element?.closest(".tile-grid")?.querySelectorAll(".tile.tile--selected").forEach((el) => el.classList.remove("tile--selected"));
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
   * @param {string} [message] - Custom message
   */
  showEmpty(message = "No data available") {
    if (this.contentElement) {
      this.contentElement.innerHTML = `
                <div class="tile-empty">
                    <span class="material-symbols-outlined">inbox</span>
                    <span>${message}</span>
                </div>
            `;
    }
  }
  /**
   * Show error state in content area.
   * @param {string} [message] - Error message
   */
  showError(message = "Failed to load data") {
    if (this.contentElement) {
      this.contentElement.innerHTML = `
                <div class="twm-tile-error">
                    <span class="material-symbols-outlined">error</span>
                    <span>${message}</span>
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
   * Escape a string for safe insertion into an HTML attribute.
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
    stateGuard = null
  }) {
    this.host = host;
    this.stateGuard = stateGuard;
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
      stateGuard: this.stateGuard
    });
    if (!tile) return null;
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
      variables: this.data ? this._getVariableList() : [],
      onSave: (newConfig) => {
        const tile = this.tiles.get(tileId);
        if (tile) {
          tile.fullData = this.fullData;
          tile.update(this.data, newConfig);
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
  FieldTypes,
  LayoutPersistence,
  TileBase,
  TileGrid,
  TileRegistry,
  configureLayoutPersistence,
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
  hasWidget,
  mergeWithDefaults,
  registerWidget,
  setTileLogger,
  validateConfig,
  validateField
};
//# sourceMappingURL=tiles.js.map
