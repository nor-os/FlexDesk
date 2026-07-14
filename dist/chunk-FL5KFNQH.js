// src/core/settings.js
var DEFAULTS = Object.freeze({
  workspace: Object.freeze({
    save: Object.freeze({
      showToast: false,
      showErrorToast: true
    }),
    import: Object.freeze({
      showToast: false,
      showErrorToast: true
    }),
    autosave: Object.freeze({
      enabled: true,
      intervalSeconds: 60
    }),
    undoHistoryLimit: 200
  }),
  host: Object.freeze({
    showConnectedToast: false
  }),
  window: Object.freeze({
    animateMinimize: true,
    macShadows: true
  }),
  notifications: Object.freeze({
    durationMs: 3500
  }),
  data: Object.freeze({
    tablePageSize: 100,
    defaultResampleMethod: "mean"
  }),
  etl: Object.freeze({
    parallelWorkers: 1
  }),
  logging: Object.freeze({
    minLevel: "info",
    historyLimit: 500,
    enableConsole: false
  }),
  editor: Object.freeze({
    autosaveDelayMs: 5e3
  }),
  notebook: Object.freeze({
    cellWidthMode: "fixed",
    codeCellMaxHeight: false,
    defaultCellView: "config"
  }),
  debug: Object.freeze({
    logSettingsAccess: false
  }),
  projects: Object.freeze({
    directory: null
  }),
  // Only auto-create-defaults survives; the modules directory / addon /
  // ETL-plugin loaders were the node-graph plugin system.
  ai: Object.freeze({
    provider: "",
    cloud: Object.freeze({
      providerId: "anthropic",
      providers: Object.freeze({})
    }),
    local: Object.freeze({
      serverType: "llamacpp",
      modelPath: "",
      baseUrl: "",
      model: "",
      port: 8080,
      gpuLayers: -1,
      contextLength: 32768,
      flashAttention: true,
      evalBatchSize: 512,
      kvCacheOnGpu: true
    }),
    defaultMode: "ask",
    maxToolCalls: 25
  })
});
var SCHEMA = Object.freeze({
  // ── General ──────────────────────────────────────────────────────────────
  "workspace.save.showToast": {
    type: "boolean",
    category: "general",
    group: "Workspace Notifications",
    label: "Save success notification",
    description: "Show a toast notification when a workspace is saved successfully.",
    defaultValue: false
  },
  "workspace.save.showErrorToast": {
    type: "boolean",
    category: "general",
    group: "Workspace Notifications",
    label: "Save error notification",
    description: "Show a toast notification when a workspace save fails.",
    defaultValue: true
  },
  "workspace.import.showToast": {
    type: "boolean",
    category: "general",
    group: "Workspace Notifications",
    label: "Import success notification",
    description: "Show a toast notification when a workspace is imported successfully.",
    defaultValue: false
  },
  "workspace.import.showErrorToast": {
    type: "boolean",
    category: "general",
    group: "Workspace Notifications",
    label: "Import error notification",
    description: "Show a toast notification when a workspace import fails.",
    defaultValue: true
  },
  "host.showConnectedToast": {
    type: "boolean",
    category: "general",
    group: "Host Bridge",
    label: "Host connected notification",
    description: "Show a toast notification when the desktop host bridge connects.",
    defaultValue: false
  },
  "notifications.durationMs": {
    type: "number",
    category: "general",
    group: "Notifications",
    label: "Toast notification duration",
    description: "How long toast notifications stay visible (milliseconds).",
    defaultValue: 3500,
    min: 1e3,
    max: 15e3,
    step: 500
  },
  "workspace.autosave.enabled": {
    type: "boolean",
    category: "general",
    group: "Auto-Save",
    label: "Enable auto-save",
    description: "Automatically save the workspace at regular intervals.",
    defaultValue: true
  },
  "workspace.autosave.intervalSeconds": {
    type: "number",
    category: "general",
    group: "Auto-Save",
    label: "Auto-save interval (seconds)",
    description: "Time between automatic saves.",
    defaultValue: 60,
    min: 10,
    max: 600,
    step: 10
  },
  "workspace.undoHistoryLimit": {
    type: "number",
    category: "general",
    group: "History",
    label: "Undo/redo history depth",
    description: "Maximum number of undo/redo steps retained in memory.",
    defaultValue: 200,
    min: 10,
    max: 1e3,
    step: 10
  },
  // ── Windows ──────────────────────────────────────────────────────────────
  "window.animateMinimize": {
    type: "boolean",
    category: "window",
    group: "Appearance",
    label: "Animate minimize/restore",
    description: "Animate managed windows toward/from the taskbar when minimizing and restoring.",
    defaultValue: true
  },
  "window.macShadows": {
    type: "boolean",
    category: "window",
    group: "Appearance",
    label: "macOS-style shadows",
    description: "Use multi-layered soft shadows on managed windows.",
    defaultValue: true
  },
  // ── Data ─────────────────────────────────────────────────────────────────
  "data.tablePageSize": {
    type: "number",
    category: "data",
    group: "Tables",
    label: "Table page size",
    description: "Number of rows displayed per page in data tables.",
    defaultValue: 100,
    min: 25,
    max: 1e3,
    step: 25
  },
  "data.defaultResampleMethod": {
    type: "select",
    category: "data",
    group: "Import",
    label: "Default resample method",
    description: "Aggregation method used when resampling imported time series.",
    defaultValue: "mean",
    options: [
      { value: "mean", label: "Mean" },
      { value: "sum", label: "Sum" },
      { value: "last", label: "Last" },
      { value: "first", label: "First" },
      { value: "linear", label: "Linear interpolation" }
    ]
  },
  "etl.parallelWorkers": {
    type: "number",
    category: "data",
    group: "ETL Pipelines",
    label: "Parallel pipeline workers",
    description: "Number of pipelines to execute simultaneously in orchestrations. 1 = sequential.",
    defaultValue: 1,
    min: 1,
    max: 8,
    step: 1
  },
  // ── Logging ──────────────────────────────────────────────────────────────
  "logging.minLevel": {
    type: "select",
    category: "logging",
    group: "Output",
    label: "Minimum log level",
    description: "Only messages at this level or above are recorded.",
    defaultValue: "info",
    options: [
      { value: "trace", label: "Trace" },
      { value: "debug", label: "Debug" },
      { value: "info", label: "Info" },
      { value: "warn", label: "Warning" },
      { value: "error", label: "Error" },
      { value: "fatal", label: "Fatal" }
    ]
  },
  "logging.enableConsole": {
    type: "boolean",
    category: "logging",
    group: "Output",
    label: "Enable console output",
    description: "Mirror log messages to the browser console.",
    defaultValue: false
  },
  "logging.historyLimit": {
    type: "number",
    category: "logging",
    group: "History",
    label: "Log history limit",
    description: "Maximum number of log entries retained in memory.",
    defaultValue: 500,
    min: 50,
    max: 1e4,
    step: 50
  },
  // ── Projects ─────────────────────────────────────────────────────────────
  "projects.directory": {
    type: "text",
    category: "general",
    group: "Projects",
    label: "Projects directory",
    description: "Default directory for new projects and bundled demos. Leave empty for OS default.",
    defaultValue: null,
    placeholder: "OS default (%APPDATA%/EcoSim/projects)"
  },
  // ── AI Assistant ────────────────────────────────────────────────────────
  // Provider, auth, model, and server settings are managed from the chat UI
  // modals. Only behavior settings appear here.
  "ai.defaultMode": {
    type: "select",
    category: "ai",
    group: "Behavior",
    label: "Default mode",
    description: "Default interaction mode for the AI assistant.",
    defaultValue: "ask",
    options: [
      { value: "ask", label: "Ask (preview before applying)" },
      { value: "edit", label: "Edit (apply immediately)" }
    ]
  },
  "ai.maxToolCalls": {
    type: "number",
    category: "ai",
    group: "Behavior",
    label: "Max tool calls",
    description: "Maximum number of tool calls per AI turn.",
    defaultValue: 25,
    min: 1,
    max: 100,
    step: 1
  },
  // ── Notebook ─────────────────────────────────────────────────────────────
  "notebook.cellWidthMode": {
    type: "select",
    category: "notebook",
    group: "Layout",
    label: "Cell width mode",
    description: 'Controls how wide all cells appear. "Fixed" constrains cells to a max-width; "Full" stretches all cells.',
    defaultValue: "fixed",
    options: [
      { value: "fixed", label: "Fixed width (900px)" },
      { value: "full", label: "Full width" }
    ]
  },
  "notebook.codeCellMaxHeight": {
    type: "boolean",
    category: "notebook",
    group: "Layout",
    label: "Limit code cell height",
    description: "When enabled, code cells have a maximum height and scroll internally instead of expanding to show all content.",
    defaultValue: false
  },
  "notebook.paramCellMaxHeight": {
    type: "boolean",
    category: "notebook",
    group: "Layout",
    label: "Limit parameter cell height",
    description: "When enabled, parameter cells have a maximum height and scroll internally instead of expanding to show all content.",
    defaultValue: false
  },
  "notebook.defaultCellView": {
    type: "select",
    category: "notebook",
    group: "Layout",
    label: "Default cell view",
    description: "Which tab to show by default on all cells: Config (edit) or EcoLang (generated code).",
    defaultValue: "config",
    options: [
      { value: "config", label: "Config" },
      { value: "dsl", label: "EcoLang" }
    ]
  },
  // ── Advanced ─────────────────────────────────────────────────────────────
  "editor.autosaveDelayMs": {
    type: "number",
    category: "advanced",
    group: "Performance",
    label: "Editor autosave delay (ms)",
    description: "Delay before the function editor auto-saves changes.",
    defaultValue: 5e3,
    min: 1e3,
    max: 3e4,
    step: 1e3
  },
  "debug.logSettingsAccess": {
    type: "boolean",
    category: "advanced",
    group: "Debug",
    label: "Log settings access",
    description: "Log all getSetting/setSetting calls to the console for debugging.",
    defaultValue: false
  }
});
var CATEGORIES = Object.freeze([
  { id: "general", label: "General", icon: "tune", description: "Workspace behavior and notifications", order: 10 },
  { id: "ai", label: "AI Assistant", icon: "smart_toy", description: "AI assistant behavior", order: 30 },
  { id: "window", label: "Windows", icon: "web_asset", description: "Managed window animation and appearance", order: 40 },
  { id: "data", label: "Data", icon: "database", description: "Table display, import, and pipeline defaults", order: 50 },
  { id: "logging", label: "Logging", icon: "terminal", description: "Log level, console output, and history", order: 60 },
  { id: "notebook", label: "Notebook", icon: "menu_book", description: "Notebook editor layout and behavior", order: 70 },
  { id: "advanced", label: "Advanced", icon: "code", description: "Debug and developer settings", order: 80 }
]);
var STORAGE_KEY = "ecosim.settings.v1";
function _getNestedValue(obj, parts) {
  let current = obj;
  for (const part of parts) {
    if (current === null || current === void 0 || typeof current !== "object") {
      return void 0;
    }
    current = current[part];
  }
  return current;
}
function _setNestedValue(obj, parts, value) {
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (current[parts[i]] === void 0 || current[parts[i]] === null || typeof current[parts[i]] !== "object") {
      current[parts[i]] = {};
    }
    current = current[parts[i]];
  }
  current[parts[parts.length - 1]] = value;
}
function _deepEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => _deepEqual(v, b[i]));
  }
  if (typeof a === "object") {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((k) => _deepEqual(a[k], b[k]));
  }
  return false;
}
function _clone(value) {
  return value === void 0 ? void 0 : JSON.parse(JSON.stringify(value));
}
function _deepMerge(target, src) {
  for (const [key, value] of Object.entries(src || {})) {
    const isPlain = value !== null && typeof value === "object" && !Array.isArray(value);
    if (isPlain) {
      if (target[key] === null || typeof target[key] !== "object" || Array.isArray(target[key])) {
        target[key] = {};
      }
      _deepMerge(target[key], value);
    } else {
      target[key] = _clone(value);
    }
  }
  return target;
}
function createSettingsStore({
  defaults = {},
  schema = {},
  categories = [],
  storageKey = null,
  eventBus = null
} = {}) {
  const _defaults = _clone(defaults) ?? {};
  const _schema = { ...schema };
  let _categories = categories.map((c) => ({ ...c }));
  const _values = _clone(defaults) ?? {};
  let _bus = eventBus;
  const _sortCategories = () => {
    _categories.sort((a, b) => (a.order ?? 1e3) - (b.order ?? 1e3));
  };
  _sortCategories();
  const _debug = () => _values.debug?.logSettingsAccess;
  const _load = () => {
    try {
      if (!storageKey || typeof localStorage === "undefined") return;
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const saved = JSON.parse(raw);
      for (const path of Object.keys(_schema)) {
        const parts = path.split(".");
        const value = _getNestedValue(saved, parts);
        if (value !== void 0) {
          _setNestedValue(_values, parts, value);
        }
      }
    } catch (err) {
      console.warn("[Settings] Failed to load persisted settings", err);
    }
  };
  const _save = () => {
    try {
      if (!storageKey || typeof localStorage === "undefined") return;
      const sparse = {};
      for (const path of Object.keys(_schema)) {
        const parts = path.split(".");
        const current = _getNestedValue(_values, parts);
        const def = _schema[path].defaultValue;
        if (!_deepEqual(current, def)) {
          _setNestedValue(sparse, parts, current);
        }
      }
      if (Object.keys(sparse).length === 0) {
        localStorage.removeItem(storageKey);
      } else {
        localStorage.setItem(storageKey, JSON.stringify(sparse));
      }
    } catch (err) {
      console.warn("[Settings] Failed to persist settings", err);
    }
  };
  const _emit = (path, value) => {
    if (!_bus) return;
    _bus.emit(`settings:${path}:changed`, { path, value });
    _bus.emit("settings:changed", { path, value });
  };
  _load();
  const extend = ({ defaults: d = {}, schema: s = {}, categories: c = [] } = {}) => {
    _deepMerge(_defaults, d);
    _deepMerge(_values, d);
    Object.assign(_schema, s);
    for (const cat of c) {
      if (!cat?.id) continue;
      if (_categories.some((x) => x.id === cat.id)) continue;
      _categories.push({ ...cat });
    }
    _sortCategories();
    _load();
  };
  const get = (path, defaultValue = void 0) => {
    const parts = path.split(".");
    let current = _values;
    for (const part of parts) {
      if (current === null || current === void 0 || typeof current !== "object") {
        if (_debug()) console.warn(`[Settings] Path not found: ${path}`);
        return defaultValue;
      }
      current = current[part];
    }
    if (current === void 0) return defaultValue;
    if (_debug()) console.log(`[Settings] getSetting('${path}') =>`, current);
    return current;
  };
  const set = (path, value) => {
    const parts = path.split(".");
    const lastPart = parts.pop();
    let current = _values;
    for (const part of parts) {
      if (current[part] === void 0 || current[part] === null) {
        current[part] = {};
      }
      if (typeof current[part] !== "object") {
        console.warn(`[Settings] Cannot set '${path}': intermediate path is not an object`);
        return false;
      }
      current = current[part];
    }
    current[lastPart] = value;
    if (_debug()) console.log(`[Settings] setSetting('${path}', ${JSON.stringify(value)})`);
    _save();
    _emit(path, value);
    return true;
  };
  const getDefault = (path) => {
    const def = _schema[path];
    if (!def) return _clone(_getNestedValue(_defaults, path.split(".")));
    return _clone(def.defaultValue);
  };
  const resetOne = (path) => {
    const defaultVal = getDefault(path);
    if (defaultVal === void 0) {
      console.warn(`[Settings] No default found for '${path}'`);
      return false;
    }
    return set(path, defaultVal);
  };
  const resetCategoryFn = (categoryId) => {
    for (const [path, def] of Object.entries(_schema)) {
      if (def.category !== categoryId) continue;
      _setNestedValue(_values, path.split("."), _clone(def.defaultValue));
    }
    _save();
    if (_bus) {
      _bus.emit("settings:category:reset", { category: categoryId });
      _bus.emit("settings:changed", { path: null, category: categoryId });
    }
  };
  const resetAll = () => {
    for (const [path, def] of Object.entries(_schema)) {
      _setNestedValue(_values, path.split("."), _clone(def.defaultValue));
    }
    _save();
    if (_bus) {
      _bus.emit("settings:reset", {});
      _bus.emit("settings:changed", { path: null });
    }
  };
  const getByCategory = (categoryId) => {
    const result = [];
    for (const [path, def] of Object.entries(_schema)) {
      if (def.category === categoryId) result.push({ path, ...def });
    }
    return result;
  };
  return Object.freeze({
    get,
    set,
    extend,
    getDefault,
    resetOne,
    resetCategory: resetCategoryFn,
    resetAll,
    getAll: () => _clone(_values),
    getSchema: () => _schema,
    // Frozen snapshot: the old module-level CATEGORIES was a frozen const, and
    // a caller that sorted or spliced the live array in place would silently
    // reorder the Settings sidebar. Same objects, same order — just not ours
    // to wreck.
    getCategories: () => Object.freeze(_categories.slice()),
    getByCategory,
    setEventBus: (bus) => {
      _bus = bus;
    }
  });
}
var _store = createSettingsStore({
  defaults: DEFAULTS,
  schema: SCHEMA,
  categories: CATEGORIES,
  storageKey: STORAGE_KEY
});
function registerSettings(slice) {
  _store.extend(slice);
}
function registerSettingsEventBus(eventBus) {
  _store.setEventBus(eventBus);
}
function getSetting(path, defaultValue = void 0) {
  return _store.get(path, defaultValue);
}
function setSetting(path, value) {
  return _store.set(path, value);
}
function getDefaultValue(path) {
  return _store.getDefault(path);
}
function resetSetting(path) {
  return _store.resetOne(path);
}
function resetCategory(categoryId) {
  _store.resetCategory(categoryId);
}
function resetAllSettings() {
  _store.resetAll();
}
function getAllSettings() {
  return _store.getAll();
}
function getSchema() {
  return _store.getSchema();
}
function getCategories() {
  return _store.getCategories();
}
function getSettingsByCategory(categoryId) {
  return _store.getByCategory(categoryId);
}

export {
  createSettingsStore,
  registerSettings,
  registerSettingsEventBus,
  getSetting,
  setSetting,
  getDefaultValue,
  resetSetting,
  resetCategory,
  resetAllSettings,
  getAllSettings,
  getSchema,
  getCategories,
  getSettingsByCategory
};
//# sourceMappingURL=chunk-FL5KFNQH.js.map
