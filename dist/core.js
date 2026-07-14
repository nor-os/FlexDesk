import {
  StateMachine
} from "./chunk-3PHCPZHT.js";
import {
  createSettingsStore,
  getAllSettings,
  getCategories,
  getDefaultValue,
  getSchema,
  getSetting,
  getSettingsByCategory,
  registerSettings,
  registerSettingsEventBus,
  resetAllSettings,
  resetCategory,
  resetSetting,
  setSetting
} from "./chunk-FL5KFNQH.js";
import "./chunk-JYWURG5T.js";

// src/core/event_bus.js
var PATTERN_TOKEN_RE = /[.*+?^${}()|[\]\\]/g;
var HAS_WILDCARD_RE = /[\*\?]/;
var EventBus = class {
  constructor({ logger, historyLimit = 200 } = {}) {
    this.logger = logger;
    this.historyLimit = historyLimit;
    this.sequence = 0;
    this.listeners = /* @__PURE__ */ new Map();
    this.wildcardListeners = /* @__PURE__ */ new Map();
    this.listenerIndex = /* @__PURE__ */ new Map();
    this.eventHistory = [];
  }
  on(eventName, handler, options = {}) {
    if (typeof eventName !== "string" || !eventName.trim()) {
      throw new TypeError("eventName must be a non-empty string");
    }
    if (typeof handler !== "function") {
      throw new TypeError("handler must be a function");
    }
    const entry = {
      id: ++this.sequence,
      eventName,
      handler,
      namespace: options.namespace ?? null,
      once: Boolean(options.once),
      priority: options.priority ?? 0,
      regex: null,
      abortCleanup: null
    };
    if (HAS_WILDCARD_RE.test(eventName)) {
      entry.regex = this._compilePattern(eventName);
      this.wildcardListeners.set(entry.id, entry);
    } else {
      if (!this.listeners.has(eventName)) {
        this.listeners.set(eventName, /* @__PURE__ */ new Set());
      }
      this.listeners.get(eventName).add(entry);
    }
    const useAbortSignal = typeof AbortSignal !== "undefined" && options.signal instanceof AbortSignal;
    if (useAbortSignal) {
      if (options.signal.aborted) {
        return { dispose: () => {
        }, id: entry.id };
      }
      const abortFn = () => this.off(entry.id);
      options.signal.addEventListener("abort", abortFn, { once: true });
      entry.abortCleanup = () => options.signal.removeEventListener("abort", abortFn);
    }
    this.listenerIndex.set(entry.id, entry);
    return {
      id: entry.id,
      dispose: () => this.off(entry.id)
    };
  }
  once(eventName, handler, options = {}) {
    return this.on(eventName, handler, { ...options, once: true });
  }
  off(target) {
    const id = typeof target === "number" ? target : target?.id;
    if (!this.listenerIndex.has(id)) {
      return false;
    }
    const entry = this.listenerIndex.get(id);
    this.listenerIndex.delete(id);
    if (entry.abortCleanup) {
      try {
        entry.abortCleanup();
      } catch (err) {
        this.logger?.warn?.("event-bus", "Abort cleanup failed", err);
      }
    }
    if (entry.regex) {
      this.wildcardListeners.delete(entry.id);
    } else {
      const bucket = this.listeners.get(entry.eventName);
      if (bucket) {
        bucket.delete(entry);
        if (bucket.size === 0) {
          this.listeners.delete(entry.eventName);
        }
      }
    }
    return true;
  }
  emit(eventName, payload = void 0, options = {}) {
    const context = this._createContext(eventName, options);
    const listeners = this._collectListeners(eventName, context.namespace);
    this._recordHistory(eventName, context.namespace, listeners.length);
    return this._invokeListeners(listeners, payload, context);
  }
  emitAsync(eventName, payload = void 0, options = {}) {
    const context = this._createContext(eventName, options);
    const listeners = this._collectListeners(eventName, context.namespace);
    this._recordHistory(eventName, context.namespace, listeners.length);
    return Promise.resolve().then(() => this._invokeListeners(listeners, payload, context));
  }
  listenerCount(eventName) {
    const direct = this.listeners.get(eventName)?.size ?? 0;
    const wildcard = [...this.wildcardListeners.values()].filter((entry) => entry.regex.test(eventName)).length;
    return direct + wildcard;
  }
  getHistory() {
    return [...this.eventHistory];
  }
  clearHistory() {
    this.eventHistory.length = 0;
  }
  reset() {
    this.listeners.clear();
    this.wildcardListeners.clear();
    this.listenerIndex.clear();
    this.eventHistory.length = 0;
  }
  _collectListeners(eventName, namespace) {
    const matches = [];
    const bucket = this.listeners.get(eventName);
    if (bucket) {
      matches.push(...bucket);
    }
    for (const entry of this.wildcardListeners.values()) {
      if (entry.regex.test(eventName)) {
        matches.push(entry);
      }
    }
    return matches.filter((entry) => !entry.namespace || entry.namespace === namespace).sort((a, b) => {
      if (a.priority === b.priority) {
        return a.id - b.id;
      }
      return b.priority - a.priority;
    });
  }
  _invokeListeners(listeners, payload, context) {
    const results = [];
    context.stopPropagation = () => {
      context.__stopped = true;
    };
    for (const entry of listeners) {
      if (context.__stopped) {
        break;
      }
      try {
        const result = entry.handler(payload, context);
        results.push(result);
        if (entry.once) {
          this.off(entry.id);
        }
      } catch (err) {
        this._handleListenerError(entry, context, err);
      }
    }
    return results;
  }
  _createContext(eventName, options) {
    return {
      event: eventName,
      namespace: options.namespace ?? null,
      timestamp: Date.now(),
      stopPropagation: () => {
      }
    };
  }
  _recordHistory(eventName, namespace, listenerCount) {
    this.eventHistory.push({
      event: eventName,
      namespace,
      timestamp: Date.now(),
      listeners: listenerCount
    });
    if (this.eventHistory.length > this.historyLimit) {
      this.eventHistory.shift();
    }
  }
  _handleListenerError(entry, context, error) {
    this.logger?.error?.("event-bus", "Listener error", {
      event: context.event,
      namespace: context.namespace,
      listenerId: entry.id,
      error
    });
  }
  _compilePattern(pattern) {
    const escaped = pattern.replace(PATTERN_TOKEN_RE, "\\$&");
    const regexSource = `^${escaped.replace(/\\\*/g, ".*").replace(/\\\?/g, ".")}$`;
    return new RegExp(regexSource);
  }
};

// src/core/logging.js
var LEVELS = ["trace", "debug", "info", "warn", "error", "fatal"];
var LEVEL_INDEX = new Map(LEVELS.map((level, idx) => [level, idx]));
var DEFAULT_NAMESPACE = "app";
var QUIET_MODE_LEVEL = "warn";
var LoggingService = class {
  constructor({
    name = "ecosim",
    eventBus = null,
    minLevel = "info",
    historyLimit = 500,
    transports = [],
    enableConsole = false,
    namespaceLevels = null
  } = {}) {
    this.name = name;
    this.eventBus = eventBus;
    this.historyLimit = historyLimit;
    this.entries = [];
    this.sequence = 0;
    this.transports = /* @__PURE__ */ new Set();
    this.namespaceLevels = { ...namespaceLevels || {} };
    this._quietMode = false;
    this._savedLevel = null;
    this.setLevel(minLevel);
    transports.forEach((transport) => this.addTransport(transport));
    if (enableConsole) {
      this.addTransport(this._consoleTransport.bind(this));
    }
  }
  setLevel(level) {
    const normalized = this._normalizeLevel(level);
    this.minLevel = normalized;
  }
  getLevel() {
    return this.minLevel;
  }
  /**
   * Enter quiet mode - suppresses DEBUG/INFO logs during simulation.
   * Only WARNING and above are logged.
   */
  enterQuietMode() {
    if (this._quietMode) return;
    this._quietMode = true;
    this._savedLevel = this.minLevel;
    if (LEVEL_INDEX.get(this.minLevel) < LEVEL_INDEX.get(QUIET_MODE_LEVEL)) {
      this.minLevel = QUIET_MODE_LEVEL;
    }
  }
  /**
   * Exit quiet mode - restores previous log level.
   */
  exitQuietMode() {
    if (!this._quietMode) return;
    this._quietMode = false;
    if (this._savedLevel !== null) {
      this.minLevel = this._savedLevel;
      this._savedLevel = null;
    }
  }
  /**
   * Check if quiet mode is active.
   */
  isQuietMode() {
    return this._quietMode;
  }
  setNamespaceLevel(namespace, level) {
    if (!namespace) return;
    this.namespaceLevels[namespace] = this._normalizeLevel(level);
  }
  setNamespaceLevels(map) {
    if (!map || typeof map !== "object") return;
    Object.entries(map).forEach(([ns, lvl]) => {
      if (ns) {
        this.namespaceLevels[ns] = this._normalizeLevel(lvl);
      }
    });
  }
  getNamespaceLevel(namespace) {
    if (!namespace) return void 0;
    return this.namespaceLevels[namespace];
  }
  addTransport(transport) {
    if (typeof transport !== "function") {
      throw new TypeError("Logging transport must be a function");
    }
    this.transports.add(transport);
  }
  removeTransport(transport) {
    this.transports.delete(transport);
  }
  log(level, message, metadata = null, options = {}) {
    const normalizedLevel = this._normalizeLevel(level);
    const namespace = options.namespace || DEFAULT_NAMESPACE;
    if (!this._shouldLog(normalizedLevel, namespace)) {
      return null;
    }
    const entry = this._buildEntry(normalizedLevel, message, metadata, options);
    this._recordHistory(entry);
    this._emit(entry);
    this._dispatch(entry);
    return entry;
  }
  trace(message, metadata, options) {
    return this.log("trace", message, metadata, options);
  }
  debug(message, metadata, options) {
    return this.log("debug", message, metadata, options);
  }
  info(message, metadata, options) {
    return this.log("info", message, metadata, options);
  }
  warn(message, metadata, options) {
    return this.log("warn", message, metadata, options);
  }
  error(message, metadata, options) {
    return this.log("error", message, metadata, options);
  }
  fatal(message, metadata, options) {
    return this.log("fatal", message, metadata, options);
  }
  scoped(namespace) {
    const ns = namespace || DEFAULT_NAMESPACE;
    const make = (level) => (first, second, third) => {
      if (typeof second === "string") {
        return this.log(level, second, third ?? null, { namespace: ns });
      }
      return this.log(level, first, second ?? null, { namespace: ns });
    };
    return {
      trace: make("trace"),
      debug: make("debug"),
      info: make("info"),
      warn: make("warn"),
      error: make("error"),
      fatal: make("fatal")
    };
  }
  getHistory() {
    return [...this.entries];
  }
  clearHistory() {
    this.entries.length = 0;
  }
  _normalizeLevel(level) {
    const normalized = typeof level === "string" ? level.toLowerCase() : "";
    if (!LEVEL_INDEX.has(normalized)) {
      throw new Error(`Unknown log level "${level}"`);
    }
    return normalized;
  }
  _shouldLog(level, namespace) {
    const effectiveLevel = this._resolveEffectiveLevel(namespace);
    return LEVEL_INDEX.get(level) >= LEVEL_INDEX.get(effectiveLevel);
  }
  _resolveEffectiveLevel(namespace) {
    if (namespace && this.namespaceLevels?.[namespace]) {
      return this.namespaceLevels[namespace];
    }
    return this.minLevel;
  }
  _buildEntry(level, message, metadata, options) {
    const namespace = options.namespace || DEFAULT_NAMESPACE;
    const tags = options.tags || [];
    const context = options.context || null;
    const data = this._sanitizeMetadata(metadata);
    return {
      id: ++this.sequence,
      timestamp: Date.now(),
      service: this.name,
      level,
      namespace,
      message,
      data,
      tags,
      context
    };
  }
  _sanitizeMetadata(metadata) {
    if (!metadata) {
      return null;
    }
    if (metadata instanceof Error) {
      return this._errorToObject(metadata);
    }
    if (typeof metadata === "object") {
      const clone = { ...metadata };
      if (metadata.error instanceof Error) {
        clone.error = this._errorToObject(metadata.error);
      }
      return clone;
    }
    return { value: metadata };
  }
  _errorToObject(error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack
    };
  }
  _recordHistory(entry) {
    this.entries.push(entry);
    if (this.entries.length > this.historyLimit) {
      this.entries.shift();
    }
  }
  _emit(entry) {
    if (!this.eventBus) {
      return;
    }
    try {
      this.eventBus.emit("log:entry", entry);
    } catch (err) {
      this._consoleTransport({ ...entry, level: "warn", message: `Failed to emit log entry: ${err.message}` });
    }
  }
  _dispatch(entry) {
    for (const transport of this.transports) {
      try {
        transport(entry);
      } catch (err) {
        this._consoleTransport({
          ...entry,
          level: "warn",
          namespace: "logging",
          message: `Logging transport failed: ${err.message}`,
          data: { transportError: this._errorToObject(err) }
        });
      }
    }
  }
  _consoleTransport(entry) {
    const prefix = `[${entry.service}][${entry.namespace}]`;
    const method = entry.level === "trace" || entry.level === "debug" ? console.log : console[entry.level] || console.log;
    method(`${prefix} ${entry.message}`, entry.data ?? "");
  }
};

// src/core/state_guard_config.js
var DEFAULT_ALLOWED_ATTRIBUTES = Object.freeze([
  "data-testid",
  "data-field",
  "data-descriptor-key",
  "aria-label",
  "aria-labelledby",
  "aria-describedby",
  "aria-hidden",
  "aria-expanded",
  "aria-selected",
  "aria-disabled",
  "aria-checked",
  "aria-controls",
  "aria-haspopup",
  "aria-live",
  "aria-busy",
  "role",
  "title",
  "twm-has-tooltip",
  "data-tooltip",
  "data-help-topic"
]);
var DEFAULT_ALLOWED_ATTRIBUTE_PREFIXES = Object.freeze([]);
var DEFAULT_ALLOWED_DATASET_KEYS = Object.freeze([
  "testid",
  "phase",
  "page-key",
  "deleting",
  // Notification center
  "notification-id",
  "notificationId",
  // Plotly.js internal attributes (third-party charting library)
  "unformatted",
  "toggle",
  "notex",
  "math",
  "originalindex",
  "original-index",
  "gravity",
  "attr",
  "val",
  "subplot",
  "group",
  "trace",
  "point",
  "curveNumber",
  "pointNumber",
  // UI state keys used by original HTML structure
  "active-content",
  "activeContent",
  "panel-content",
  "panelContent",
  "collapsible-id",
  "collapsibleId",
  "collapsible-default",
  "collapsibleDefault",
  "twm-collapsible-header",
  "collapsibleHeader",
  "twm-collapsible-content",
  "collapsibleContent",
  "collapsible-group",
  "collapsibleGroup",
  "collapsible-exclusive",
  "collapsibleExclusive",
  "collapsible-float",
  "collapsibleFloat",
  "collapsible-fill",
  "collapsibleFill",
  "tool",
  "tab",
  "role",
  "op",
  "func-name",
  "funcName",
  "func-expr",
  "funcExpr",
  "arity",
  "tooltip",
  "twm-latex-tooltip",
  "latexTooltip",
  "node-type",
  "nodeType",
  "twm-node-name",
  "nodeName",
  "lang",
  "playback-control",
  "playbackControl",
  // Simulation/scenario state keys
  "status",
  "scenario-id",
  "scenarioId",
  "run-id",
  "runId",
  "run-state",
  "runState",
  "selected",
  "active",
  "disabled",
  "expanded",
  "collapsed",
  "visible",
  "hidden",
  // Node/canvas state keys
  "node-id",
  "nodeId",
  "connector-id",
  "connectorId",
  "connector-type",
  "connectorType",
  "connection-id",
  "connectionId",
  "input-index",
  "inputIndex",
  "output-index",
  "outputIndex",
  "port-index",
  "portIndex",
  // Scenario editor keys
  "source",
  "series-id",
  "seriesId",
  "dataset-id",
  "datasetId",
  "mirror-input-bound",
  "mirrorInputBound",
  "mirror-change-bound",
  "mirrorChangeBound",
  "mirror-input",
  "mirrorInput",
  "bound",
  "field",
  "key",
  "namespace",
  "namespace-id",
  "namespaceId",
  "tab-id",
  "tabId",
  "param-id",
  "paramId",
  "target-id",
  "targetId",
  "override-type",
  "overrideType",
  // Tree view component keys
  "item-id",
  "itemId",
  "category-id",
  "categoryId",
  // Calibration page keys
  "info-for",
  "infoFor",
  "column",
  // Data page keys
  "readonly",
  "id",
  "action",
  "type",
  "name",
  "path",
  "index",
  "count",
  "total",
  "page",
  "sort",
  "order",
  "filter",
  "search",
  "value",
  "label",
  "title",
  "description",
  // DSL generator keys
  "dsl-state",
  "dslState",
  "dsl-section-registered",
  "dslSectionRegistered",
  "dsl-scrollbars-installed",
  "dslScrollbarsInstalled",
  "dsl-tabs-bound",
  "dslTabsBound",
  "dsl-controls-bound",
  "dslControlsBound",
  // Inline highlighter keys
  "inline-hl",
  "inlineHl",
  "tooltip",
  // Overlay scrollbar keys (UI-only, not state storage)
  "scrollable",
  "scrollable-x",
  "scrollableX",
  "scrollable-y",
  "scrollableY",
  // ManagedWindow component keys
  "window-id",
  "windowId",
  // Help system keys
  "help-topic",
  "helpTopic"
]);
var DEFAULT_OVERRIDES = Object.freeze([
  {
    // Panel controller writes dataset hooks for field identification/focus.
    pattern: /js_new\/ui\/controllers\/panel_controller\.js/,
    datasetKeys: ["field", "descriptor-key", "descriptorKey"],
    attributes: ["data-field", "data-descriptor-key"],
    attributePrefixes: []
  }
]);
var DEFAULT_MODE = typeof window !== "undefined" && Boolean(window.__ECOSIM_DEBUG__) ? "strict" : "warn";
var DEFAULT_STATE_GUARD_CONFIG = Object.freeze({
  mode: DEFAULT_MODE,
  allowedAttributes: DEFAULT_ALLOWED_ATTRIBUTES,
  allowedAttributePrefixes: DEFAULT_ALLOWED_ATTRIBUTE_PREFIXES,
  allowedDatasetKeys: DEFAULT_ALLOWED_DATASET_KEYS,
  moduleOverrides: DEFAULT_OVERRIDES
});
function normalizeStateGuardConfig(config = {}) {
  if (!config || typeof config !== "object") {
    return { ...DEFAULT_STATE_GUARD_CONFIG };
  }
  return {
    mode: normalizeMode(config.mode ?? DEFAULT_STATE_GUARD_CONFIG.mode),
    allowedAttributes: normalizeStringList(
      config.allowedAttributes ?? DEFAULT_STATE_GUARD_CONFIG.allowedAttributes
    ),
    allowedAttributePrefixes: normalizeStringList(
      config.allowedAttributePrefixes ?? DEFAULT_STATE_GUARD_CONFIG.allowedAttributePrefixes
    ),
    allowedDatasetKeys: normalizeStringList(
      config.allowedDatasetKeys ?? DEFAULT_STATE_GUARD_CONFIG.allowedDatasetKeys
    ),
    moduleOverrides: normalizeOverrides(
      config.moduleOverrides ?? DEFAULT_STATE_GUARD_CONFIG.moduleOverrides
    )
  };
}
function normalizeMode(mode) {
  const normalized = typeof mode === "string" ? mode.toLowerCase() : "";
  return normalized === "off" || normalized === "warn" || normalized === "strict" ? normalized : DEFAULT_STATE_GUARD_CONFIG.mode;
}
function normalizeStringList(value) {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.map((entry) => typeof entry === "string" ? entry.trim() : "").filter(Boolean);
  }
  if (typeof value === "string") {
    return value.split(",").map((entry) => entry.trim()).filter(Boolean);
  }
  return [];
}
function normalizeOverrides(overrides) {
  if (!Array.isArray(overrides)) {
    return [];
  }
  return overrides.map((entry) => normalizeOverride(entry)).filter(Boolean);
}
function normalizeOverride(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  if (!entry.pattern) {
    return null;
  }
  const attributes = normalizeStringList(entry.attributes);
  const datasetKeys = normalizeStringList(entry.datasetKeys);
  const prefixes = normalizeStringList(entry.attributePrefixes);
  if (!attributes.length && !datasetKeys.length && !prefixes.length) {
    return null;
  }
  return {
    pattern: patternToRegExp(entry.pattern),
    attributes,
    datasetKeys,
    attributePrefixes: prefixes
  };
}
function patternToRegExp(pattern) {
  if (pattern instanceof RegExp) {
    return pattern;
  }
  const source = String(pattern ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(source);
}

// src/core/state_guard.js
var HOOK_REGISTRY = {
  installed: false,
  service: null,
  originals: {
    setAttribute: null,
    removeAttribute: null,
    getAttribute: null
  },
  datasetDescriptor: null,
  datasetProxyCache: /* @__PURE__ */ new WeakMap()
};
var STACK_CACHE = /* @__PURE__ */ new Map();
var DATA_ATTRIBUTE_PREFIX = "data-";
var EVENT_CHANNELS = Object.freeze({
  READY: "state-guard:ready",
  VIOLATION: "state-guard:violation",
  MODE_CHANGED: "state-guard:mode-changed"
});
var StateGuardService = class {
  constructor({
    eventBus = null,
    logger = null,
    config = DEFAULT_STATE_GUARD_CONFIG
  } = {}) {
    this.eventBus = eventBus;
    this.logger = logger;
    this.enabled = true;
    this.bypassDepth = 0;
    this.config = normalizeStateGuardConfig(config);
    this.mode = this.config.mode;
    this.allowedAttributes = new Set(this.config.allowedAttributes.map((attr) => attr.toLowerCase()));
    this.allowedAttributePrefixes = this.config.allowedAttributePrefixes.map((attr) => attr.toLowerCase());
    this.allowedDatasetKeys = new Set(this.config.allowedDatasetKeys.map((key) => key.toLowerCase()));
    this.moduleOverrides = (this.config.moduleOverrides ?? []).map((entry) => ({
      pattern: entry.pattern,
      attributes: new Set(entry.attributes.map((attr) => attr.toLowerCase())),
      datasetKeys: new Set(entry.datasetKeys.map((key) => key.toLowerCase())),
      attributePrefixes: entry.attributePrefixes.map((prefix) => prefix.toLowerCase())
    }));
    this.#installHooks();
  }
  setMode(mode) {
    const normalized = typeof mode === "string" ? mode.toLowerCase() : "";
    if (!["off", "warn", "strict"].includes(normalized)) {
      throw new Error(`Invalid state guard mode "${mode}"`);
    }
    if (this.mode === normalized) {
      return this.mode;
    }
    this.mode = normalized;
    this.eventBus?.emit?.(EVENT_CHANNELS.MODE_CHANGED, {
      mode: this.mode,
      timestamp: Date.now()
    });
    return this.mode;
  }
  getMode() {
    return this.mode;
  }
  allow(modulePattern, attributes = [], { datasetKeys = [], attributePrefixes = [] } = {}) {
    const pattern = modulePattern instanceof RegExp ? modulePattern : new RegExp(String(modulePattern ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const entry = {
      pattern,
      attributes: new Set(attributes.map((attr) => String(attr).toLowerCase())),
      datasetKeys: new Set(datasetKeys.map((key) => String(key).toLowerCase())),
      attributePrefixes: attributePrefixes.map((prefix) => String(prefix).toLowerCase())
    };
    this.moduleOverrides.push(entry);
    return () => {
      const idx = this.moduleOverrides.indexOf(entry);
      if (idx >= 0) {
        this.moduleOverrides.splice(idx, 1);
      }
    };
  }
  executeWithBypass(label, fn) {
    if (typeof fn !== "function") {
      throw new TypeError("executeWithBypass requires a function");
    }
    try {
      this.bypassDepth += 1;
      return fn();
    } finally {
      this.bypassDepth = Math.max(0, this.bypassDepth - 1);
    }
  }
  /**
   * Execute an async function with state guard bypass.
   * The bypass remains active for the entire duration of the async operation.
   * @param {string} label - Label for debugging
   * @param {Function} fn - Async function to execute
   * @returns {Promise<*>} Result of the function
   */
  async executeWithBypassAsync(label, fn) {
    if (typeof fn !== "function") {
      throw new TypeError("executeWithBypassAsync requires a function");
    }
    try {
      this.bypassDepth += 1;
      return await fn();
    } finally {
      this.bypassDepth = Math.max(0, this.bypassDepth - 1);
    }
  }
  handleAttributeMutation(element, action, attribute, value) {
    const attrName = this.#normalizeAttribute(attribute);
    if (!this.#shouldGuard(attrName)) {
      return;
    }
    this.#evaluateMutation({
      action,
      attribute: attrName,
      element,
      value,
      source: "attribute"
    });
  }
  handleDatasetMutation(element, key, value, { deleting = false } = {}) {
    const attrName = this.#datasetKeyToAttribute(key);
    if (!this.#shouldGuard(attrName)) {
      return;
    }
    this.#evaluateMutation({
      action: deleting ? "dataset:delete" : "dataset:set",
      attribute: attrName,
      element,
      value,
      source: "dataset"
    });
  }
  #installHooks() {
    if (typeof Element === "undefined" || typeof HTMLElement === "undefined") {
      this.enabled = false;
      this.logger?.warn?.("state-guard", "DOM environment unavailable; guard disabled");
      return;
    }
    installDomHooks(this);
    this.eventBus?.emit?.(EVENT_CHANNELS.READY, {
      mode: this.mode,
      timestamp: Date.now()
    });
  }
  #shouldGuard(attribute) {
    if (!this.enabled) {
      return false;
    }
    if (this.mode === "off") {
      return false;
    }
    if (this.bypassDepth > 0) {
      return false;
    }
    if (!attribute || !attribute.startsWith(DATA_ATTRIBUTE_PREFIX)) {
      return false;
    }
    if (this.allowedAttributes.has(attribute)) {
      return false;
    }
    if (attribute.startsWith(DATA_ATTRIBUTE_PREFIX)) {
      const datasetKey = attribute.slice(DATA_ATTRIBUTE_PREFIX.length);
      if (this.allowedDatasetKeys.has(datasetKey)) {
        return false;
      }
    }
    if (this.allowedAttributePrefixes.some((prefix) => attribute.startsWith(prefix))) {
      return false;
    }
    return true;
  }
  #evaluateMutation({ action, attribute, element, value, source }) {
    const moduleKey = this.#resolveModuleFromStack();
    if (this.#isAllowedForModule(moduleKey, attribute)) {
      return;
    }
    const payload = {
      attribute,
      action,
      source,
      module: moduleKey,
      mode: this.mode,
      timestamp: Date.now()
    };
    this.logger?.warn?.("state-guard", "Blocked DOM state mutation", {
      ...payload,
      valuePreview: this.#previewValue(value)
    });
    this.eventBus?.emit?.(EVENT_CHANNELS.VIOLATION, payload);
    if (this.mode === "strict") {
      const label = moduleKey ? `${moduleKey}` : "unknown module";
      throw new Error(`StateGuard blocked ${action} on "${attribute}" from ${label}`);
    }
  }
  #isAllowedForModule(moduleKey, attribute) {
    if (!moduleKey || !this.moduleOverrides.length) {
      return false;
    }
    const lowerAttr = attribute.toLowerCase();
    for (const entry of this.moduleOverrides) {
      if (!entry.pattern.test(moduleKey)) {
        continue;
      }
      if (entry.attributes.has(lowerAttr)) {
        return true;
      }
      if (entry.attributePrefixes.some((prefix) => lowerAttr.startsWith(prefix))) {
        return true;
      }
      if (lowerAttr.startsWith(DATA_ATTRIBUTE_PREFIX)) {
        const datasetKey = lowerAttr.slice(DATA_ATTRIBUTE_PREFIX.length);
        if (entry.datasetKeys.has(datasetKey)) {
          return true;
        }
      }
    }
    return false;
  }
  #normalizeAttribute(attribute) {
    if (!attribute) {
      return "";
    }
    return String(attribute).toLowerCase();
  }
  #datasetKeyToAttribute(key) {
    if (!key && key !== 0) {
      return "";
    }
    const normalized = String(key).replace(/([A-Z])/g, "-$1").replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase().replace(/-{2,}/g, "-").replace(/^-+/, "").replace(/-+$/, "");
    if (!normalized) {
      return "";
    }
    return `${DATA_ATTRIBUTE_PREFIX}${normalized}`;
  }
  #resolveModuleFromStack() {
    const stack = new Error().stack;
    if (!stack) {
      return null;
    }
    if (STACK_CACHE.has(stack)) {
      return STACK_CACHE.get(stack);
    }
    const lines = stack.split("\n");
    let modulePath = null;
    for (const line of lines) {
      const match = line.match(/(js_new\/[^)\s]+)/);
      if (match) {
        modulePath = match[1];
        break;
      }
    }
    if (STACK_CACHE.size > 500) {
      STACK_CACHE.clear();
    }
    STACK_CACHE.set(stack, modulePath);
    return modulePath;
  }
  #previewValue(value) {
    if (value === null || value === void 0) {
      return String(value);
    }
    if (typeof value === "object") {
      return "[object]";
    }
    const str = String(value);
    return str.length > 50 ? `${str.slice(0, 47)}...` : str;
  }
};
function installDomHooks(service) {
  if (HOOK_REGISTRY.installed) {
    HOOK_REGISTRY.service = service;
    return;
  }
  HOOK_REGISTRY.installed = true;
  HOOK_REGISTRY.service = service;
  const { setAttribute, removeAttribute } = Element.prototype;
  const nativeSetAttribute = setAttribute;
  const nativeRemoveAttribute = removeAttribute;
  HOOK_REGISTRY.originals.setAttribute = nativeSetAttribute;
  HOOK_REGISTRY.originals.removeAttribute = nativeRemoveAttribute;
  Element.prototype.setAttribute = function patchedSetAttribute(name, value) {
    const guard = HOOK_REGISTRY.service;
    try {
      guard?.handleAttributeMutation(this, "setAttribute", name, value);
    } catch (error) {
      throw error;
    }
    return nativeSetAttribute.call(this, name, value);
  };
  Element.prototype.removeAttribute = function patchedRemoveAttribute(name) {
    const guard = HOOK_REGISTRY.service;
    try {
      guard?.handleAttributeMutation(this, "removeAttribute", name, void 0);
    } catch (error) {
      throw error;
    }
    return nativeRemoveAttribute.call(this, name);
  };
  wrapDataset(service);
}
function wrapDataset(service) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "dataset");
  if (!descriptor || typeof descriptor.get !== "function") {
    return;
  }
  HOOK_REGISTRY.datasetDescriptor = descriptor;
  Object.defineProperty(HTMLElement.prototype, "dataset", {
    configurable: true,
    enumerable: descriptor.enumerable,
    get: function datasetGetter() {
      const nativeDataset = descriptor.get.call(this);
      if (!nativeDataset || typeof nativeDataset !== "object") {
        return nativeDataset;
      }
      const cached = HOOK_REGISTRY.datasetProxyCache.get(nativeDataset);
      if (cached && cached.proxy) {
        cached.element = this;
        return cached.proxy;
      }
      const proxyState = { element: this };
      const proxy = new Proxy(nativeDataset, {
        set(target, prop, value) {
          const guard = HOOK_REGISTRY.service;
          const key = typeof prop === "string" ? prop : null;
          if (guard && key) {
            guard.handleDatasetMutation(proxyState.element, key, value);
          }
          return Reflect.set(target, prop, value);
        },
        deleteProperty(target, prop) {
          const guard = HOOK_REGISTRY.service;
          const key = typeof prop === "string" ? prop : null;
          if (guard && key) {
            guard.handleDatasetMutation(proxyState.element, key, void 0, { deleting: true });
          }
          return Reflect.deleteProperty(target, prop);
        }
      });
      HOOK_REGISTRY.datasetProxyCache.set(nativeDataset, { proxy, element: this });
      return proxy;
    }
  });
}
export {
  DEFAULT_STATE_GUARD_CONFIG,
  EventBus,
  LoggingService,
  StateGuardService,
  StateMachine,
  createSettingsStore,
  getAllSettings,
  getCategories,
  getDefaultValue,
  getSchema,
  getSetting,
  getSettingsByCategory,
  normalizeStateGuardConfig,
  registerSettings,
  registerSettingsEventBus,
  resetAllSettings,
  resetCategory,
  resetSetting,
  setSetting
};
//# sourceMappingURL=core.js.map
