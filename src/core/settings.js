/**
 * Application Settings — a generic, schema-driven value store.
 *
 * Purpose
 * -------
 * A persisted key/value store whose UI is driven entirely by a declarative
 * SCHEMA. The store knows nothing about any particular application's settings:
 * it ships the *shell's* own namespaces (workspace, window, logging, data,
 * notebook, ai, …) and an embedder PUSHES its own namespace in at boot with
 * `registerSettings()`. The Settings page renders whatever is in the schema.
 *
 * Two doors, on purpose
 * ---------------------
 *   createSettingsStore({ defaults, schema, categories, storageKey })
 *       The primitive. A private store with zero global state — what the
 *       library's demo and the unit tests use.
 *
 *   getSetting() / setSetting() / registerSettings() / …
 *       A thin binding over ONE instance of that primitive for THIS document.
 *       The cardinality is correct, not merely convenient: the store has a
 *       single physical backing key (`localStorage['ecosim.settings.v1']`), so
 *       two live stores in one document would be two writers to one key.
 *
 * Usage
 * -----
 * import { getSetting, setSetting } from '../core/settings.js';
 *
 * // Read a setting
 * if (getSetting('workspace.save.showToast')) { ... }
 *
 * // Write a setting (persists to localStorage, emits events)
 * setSetting('window.macShadows', true);
 *
 * // React to changes (after registerSettingsEventBus is called)
 * eventBus.on('settings:window.macShadows:changed', ({ value }) => { ... });
 *
 * Adding New Settings
 * -------------------
 * Shell-owned setting: add the default under the right namespace in DEFAULTS,
 * add a SCHEMA entry (type, category, group, label, description), done — the
 * Settings page picks it up.
 *
 * Embedder-owned setting: do NOT add it here. Put it in your own slice and
 * `registerSettings({ defaults, schema, categories })` at bootstrap.
 */

// ─── Defaults (shell-owned namespaces only) ──────────────────────────────────

const DEFAULTS = Object.freeze({
    workspace: Object.freeze({
        save: Object.freeze({
            showToast: false,
            showErrorToast: true,
        }),
        import: Object.freeze({
            showToast: false,
            showErrorToast: true,
        }),
        autosave: Object.freeze({
            enabled: true,
            intervalSeconds: 60,
        }),
        undoHistoryLimit: 200,
    }),

    host: Object.freeze({
        showConnectedToast: false,
    }),

    window: Object.freeze({
        animateMinimize: true,
        macShadows: true,
    }),

    notifications: Object.freeze({
        durationMs: 3500,
    }),

    data: Object.freeze({
        tablePageSize: 100,
        defaultResampleMethod: 'mean',
    }),

    etl: Object.freeze({
        parallelWorkers: 1,
    }),

    logging: Object.freeze({
        minLevel: 'info',
        historyLimit: 500,
        enableConsole: false,
    }),

    editor: Object.freeze({
        autosaveDelayMs: 5000,
    }),

    notebook: Object.freeze({
        cellWidthMode: 'fixed',
        codeCellMaxHeight: false,
        defaultCellView: 'config',
    }),

    debug: Object.freeze({
        logSettingsAccess: false,
    }),

    projects: Object.freeze({
        directory: null,
    }),

    // Only auto-create-defaults survives; the modules directory / addon /
    // ETL-plugin loaders were the node-graph plugin system.
    ai: Object.freeze({
        provider: '',
        cloud: Object.freeze({
            providerId: 'anthropic',
            providers: Object.freeze({}),
        }),
        local: Object.freeze({
            serverType: 'llamacpp',
            modelPath: '',
            baseUrl: '',
            model: '',
            port: 8080,
            gpuLayers: -1,
            contextLength: 32768,
            flashAttention: true,
            evalBatchSize: 512,
            kvCacheOnGpu: true,
        }),
        defaultMode: 'ask',
        maxToolCalls: 25,
    }),
});

// ─── Schema (drives the Settings page UI) ────────────────────────────────────

/**
 * @typedef {Object} SettingDef
 * @property {'boolean'|'select'|'number'|'text'|'colorList'} type
 * @property {string} category - Category ID (matches CATEGORIES[].id)
 * @property {string} group - Visual group within the category
 * @property {string} label - Human-readable label
 * @property {string} description - Explanation shown below the label
 * @property {*} defaultValue - Must match DEFAULTS
 * @property {Array<{value:string,label:string}>} [options] - For 'select' type
 * @property {number} [min] - For 'number' type
 * @property {number} [max] - For 'number' type
 * @property {number|string} [step] - For 'number' type
 * @property {string} [placeholder] - For 'text' type
 */

/**
 * @typedef {Object} SettingsSlice
 * @property {object} [defaults]   - Nested default values for the namespace.
 * @property {Object<string, SettingDef>} [schema] - Dot-path -> SettingDef.
 * @property {Array<CategoryDef>} [categories]     - Categories the slice adds.
 */

/**
 * @typedef {Object} CategoryDef
 * @property {string} id
 * @property {string} label
 * @property {string} icon
 * @property {string} description
 * @property {number} [order] - Sidebar sort key. Lower sorts first; ties keep
 *                              registration order. Defaults to 1000.
 */

const SCHEMA = Object.freeze({
    // ── General ──────────────────────────────────────────────────────────────
    'workspace.save.showToast': {
        type: 'boolean', category: 'general', group: 'Workspace Notifications',
        label: 'Save success notification',
        description: 'Show a toast notification when a workspace is saved successfully.',
        defaultValue: false,
    },
    'workspace.save.showErrorToast': {
        type: 'boolean', category: 'general', group: 'Workspace Notifications',
        label: 'Save error notification',
        description: 'Show a toast notification when a workspace save fails.',
        defaultValue: true,
    },
    'workspace.import.showToast': {
        type: 'boolean', category: 'general', group: 'Workspace Notifications',
        label: 'Import success notification',
        description: 'Show a toast notification when a workspace is imported successfully.',
        defaultValue: false,
    },
    'workspace.import.showErrorToast': {
        type: 'boolean', category: 'general', group: 'Workspace Notifications',
        label: 'Import error notification',
        description: 'Show a toast notification when a workspace import fails.',
        defaultValue: true,
    },
    'host.showConnectedToast': {
        type: 'boolean', category: 'general', group: 'Host Bridge',
        label: 'Host connected notification',
        description: 'Show a toast notification when the desktop host bridge connects.',
        defaultValue: false,
    },
    'notifications.durationMs': {
        type: 'number', category: 'general', group: 'Notifications',
        label: 'Toast notification duration',
        description: 'How long toast notifications stay visible (milliseconds).',
        defaultValue: 3500, min: 1000, max: 15000, step: 500,
    },
    'workspace.autosave.enabled': {
        type: 'boolean', category: 'general', group: 'Auto-Save',
        label: 'Enable auto-save',
        description: 'Automatically save the workspace at regular intervals.',
        defaultValue: true,
    },
    'workspace.autosave.intervalSeconds': {
        type: 'number', category: 'general', group: 'Auto-Save',
        label: 'Auto-save interval (seconds)',
        description: 'Time between automatic saves.',
        defaultValue: 60, min: 10, max: 600, step: 10,
    },
    'workspace.undoHistoryLimit': {
        type: 'number', category: 'general', group: 'History',
        label: 'Undo/redo history depth',
        description: 'Maximum number of undo/redo steps retained in memory.',
        defaultValue: 200, min: 10, max: 1000, step: 10,
    },

    // ── Windows ──────────────────────────────────────────────────────────────
    'window.animateMinimize': {
        type: 'boolean', category: 'window', group: 'Appearance',
        label: 'Animate minimize/restore',
        description: 'Animate managed windows toward/from the taskbar when minimizing and restoring.',
        defaultValue: true,
    },
    'window.macShadows': {
        type: 'boolean', category: 'window', group: 'Appearance',
        label: 'macOS-style shadows',
        description: 'Use multi-layered soft shadows on managed windows.',
        defaultValue: true,
    },

    // ── Data ─────────────────────────────────────────────────────────────────
    'data.tablePageSize': {
        type: 'number', category: 'data', group: 'Tables',
        label: 'Table page size',
        description: 'Number of rows displayed per page in data tables.',
        defaultValue: 100, min: 25, max: 1000, step: 25,
    },
    'data.defaultResampleMethod': {
        type: 'select', category: 'data', group: 'Import',
        label: 'Default resample method',
        description: 'Aggregation method used when resampling imported time series.',
        defaultValue: 'mean',
        options: [
            { value: 'mean', label: 'Mean' },
            { value: 'sum', label: 'Sum' },
            { value: 'last', label: 'Last' },
            { value: 'first', label: 'First' },
            { value: 'linear', label: 'Linear interpolation' },
        ],
    },
    'etl.parallelWorkers': {
        type: 'number', category: 'data', group: 'ETL Pipelines',
        label: 'Parallel pipeline workers',
        description: 'Number of pipelines to execute simultaneously in orchestrations. 1 = sequential.',
        defaultValue: 1, min: 1, max: 8, step: 1,
    },

    // ── Logging ──────────────────────────────────────────────────────────────
    'logging.minLevel': {
        type: 'select', category: 'logging', group: 'Output',
        label: 'Minimum log level',
        description: 'Only messages at this level or above are recorded.',
        defaultValue: 'info',
        options: [
            { value: 'trace', label: 'Trace' },
            { value: 'debug', label: 'Debug' },
            { value: 'info', label: 'Info' },
            { value: 'warn', label: 'Warning' },
            { value: 'error', label: 'Error' },
            { value: 'fatal', label: 'Fatal' },
        ],
    },
    'logging.enableConsole': {
        type: 'boolean', category: 'logging', group: 'Output',
        label: 'Enable console output',
        description: 'Mirror log messages to the browser console.',
        defaultValue: false,
    },
    'logging.historyLimit': {
        type: 'number', category: 'logging', group: 'History',
        label: 'Log history limit',
        description: 'Maximum number of log entries retained in memory.',
        defaultValue: 500, min: 50, max: 10000, step: 50,
    },

    // ── Projects ─────────────────────────────────────────────────────────────
    'projects.directory': {
        type: 'text', category: 'general', group: 'Projects',
        label: 'Projects directory',
        description: 'Default directory for new projects and bundled demos. Leave empty for OS default.',
        defaultValue: null,
        placeholder: 'OS default (%APPDATA%/EcoSim/projects)',
    },

    // ── AI Assistant ────────────────────────────────────────────────────────
    // Provider, auth, model, and server settings are managed from the chat UI
    // modals. Only behavior settings appear here.
    'ai.defaultMode': {
        type: 'select', category: 'ai', group: 'Behavior',
        label: 'Default mode',
        description: 'Default interaction mode for the AI assistant.',
        defaultValue: 'ask',
        options: [
            { value: 'ask', label: 'Ask (preview before applying)' },
            { value: 'edit', label: 'Edit (apply immediately)' },
        ],
    },
    'ai.maxToolCalls': {
        type: 'number', category: 'ai', group: 'Behavior',
        label: 'Max tool calls',
        description: 'Maximum number of tool calls per AI turn.',
        defaultValue: 25, min: 1, max: 100, step: 1,
    },

    // ── Notebook ─────────────────────────────────────────────────────────────
    'notebook.cellWidthMode': {
        type: 'select', category: 'notebook', group: 'Layout',
        label: 'Cell width mode',
        description: 'Controls how wide all cells appear. "Fixed" constrains cells to a max-width; "Full" stretches all cells.',
        defaultValue: 'fixed',
        options: [
            { value: 'fixed',   label: 'Fixed width (900px)' },
            { value: 'full',    label: 'Full width' },
        ],
    },
    'notebook.codeCellMaxHeight': {
        type: 'boolean', category: 'notebook', group: 'Layout',
        label: 'Limit code cell height',
        description: 'When enabled, code cells have a maximum height and scroll internally instead of expanding to show all content.',
        defaultValue: false,
    },
    'notebook.paramCellMaxHeight': {
        type: 'boolean', category: 'notebook', group: 'Layout',
        label: 'Limit parameter cell height',
        description: 'When enabled, parameter cells have a maximum height and scroll internally instead of expanding to show all content.',
        defaultValue: false,
    },
    'notebook.defaultCellView': {
        type: 'select', category: 'notebook', group: 'Layout',
        label: 'Default cell view',
        description: 'Which tab to show by default on all cells: Config (edit) or EcoLang (generated code).',
        defaultValue: 'config',
        options: [
            { value: 'config',  label: 'Config' },
            { value: 'dsl',     label: 'EcoLang' },
        ],
    },

    // ── Advanced ─────────────────────────────────────────────────────────────
    'editor.autosaveDelayMs': {
        type: 'number', category: 'advanced', group: 'Performance',
        label: 'Editor autosave delay (ms)',
        description: 'Delay before the function editor auto-saves changes.',
        defaultValue: 5000, min: 1000, max: 30000, step: 1000,
    },
    'debug.logSettingsAccess': {
        type: 'boolean', category: 'advanced', group: 'Debug',
        label: 'Log settings access',
        description: 'Log all getSetting/setSetting calls to the console for debugging.',
        defaultValue: false,
    },
});

/**
 * Shell-owned categories. `order` is the sidebar sort key — it exists so a
 * registered slice can slot its category *between* two shell categories
 * instead of being stuck at the end.
 */
const CATEGORIES = Object.freeze([
    { id: 'general',    label: 'General',      icon: 'tune',         description: 'Workspace behavior and notifications',      order: 10 },
    { id: 'ai',         label: 'AI Assistant', icon: 'smart_toy',    description: 'AI assistant behavior',                     order: 30 },
    { id: 'window',     label: 'Windows',      icon: 'web_asset',    description: 'Managed window animation and appearance',   order: 40 },
    { id: 'data',       label: 'Data',         icon: 'database',     description: 'Table display, import, and pipeline defaults', order: 50 },
    { id: 'logging',    label: 'Logging',      icon: 'terminal',     description: 'Log level, console output, and history',    order: 60 },
    { id: 'notebook',   label: 'Notebook',     icon: 'menu_book',    description: 'Notebook editor layout and behavior',       order: 70 },
    { id: 'advanced',   label: 'Advanced',     icon: 'code',         description: 'Debug and developer settings',              order: 80 },
]);

const STORAGE_KEY = 'ecosim.settings.v1';

// ─── Path / value helpers ────────────────────────────────────────────────────

/**
 * Traverse an object by dot-path parts and return the value.
 * @param {object} obj
 * @param {string[]} parts
 * @returns {*}
 */
function _getNestedValue(obj, parts) {
    let current = obj;
    for (const part of parts) {
        if (current === null || current === undefined || typeof current !== 'object') {
            return undefined;
        }
        current = current[part];
    }
    return current;
}

/**
 * Set a value in a nested object by dot-path parts, creating intermediates.
 * @param {object} obj
 * @param {string[]} parts
 * @param {*} value
 */
function _setNestedValue(obj, parts, value) {
    let current = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        if (current[parts[i]] === undefined || current[parts[i]] === null || typeof current[parts[i]] !== 'object') {
            current[parts[i]] = {};
        }
        current = current[parts[i]];
    }
    current[parts[parts.length - 1]] = value;
}

/**
 * Deep equality check for primitives, arrays, and plain objects.
 */
function _deepEqual(a, b) {
    if (a === b) return true;
    if (a == null || b == null) return a === b;
    if (typeof a !== typeof b) return false;
    if (Array.isArray(a)) {
        if (!Array.isArray(b) || a.length !== b.length) return false;
        return a.every((v, i) => _deepEqual(v, b[i]));
    }
    if (typeof a === 'object') {
        const keysA = Object.keys(a);
        const keysB = Object.keys(b);
        if (keysA.length !== keysB.length) return false;
        return keysA.every(k => _deepEqual(a[k], b[k]));
    }
    return false;
}

/** Deep clone via JSON — the value tree is JSON by construction (it persists). */
function _clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

/** Recursively merge `src` into `target` (plain objects only; arrays replace). */
function _deepMerge(target, src) {
    for (const [key, value] of Object.entries(src || {})) {
        const isPlain = value !== null && typeof value === 'object' && !Array.isArray(value);
        if (isPlain) {
            if (target[key] === null || typeof target[key] !== 'object' || Array.isArray(target[key])) {
                target[key] = {};
            }
            _deepMerge(target[key], value);
        } else {
            target[key] = _clone(value);
        }
    }
    return target;
}

// ─── The store (the primitive) ───────────────────────────────────────────────

/**
 * Create an isolated, schema-driven settings store.
 *
 * The store owns no domain knowledge: everything it can hold, validate,
 * persist and render is described by the `defaults` / `schema` / `categories`
 * it is handed. Pass none and you get an empty store that an embedder fills
 * entirely via `extend()`.
 *
 * @param {object}  [opts]
 * @param {object}  [opts.defaults]     Nested default values.
 * @param {Object<string, SettingDef>} [opts.schema] Dot-path -> definition.
 * @param {CategoryDef[]} [opts.categories]
 * @param {string}  [opts.storageKey]   localStorage key. Omit -> no persistence.
 * @param {object}  [opts.eventBus]     Optional; may be attached later.
 * @returns {object} Frozen store handle.
 */
export function createSettingsStore({
    defaults = {},
    schema = {},
    categories = [],
    storageKey = null,
    eventBus = null,
} = {}) {
    const _defaults = _clone(defaults) ?? {};
    const _schema = { ...schema };
    let _categories = categories.map(c => ({ ...c }));
    const _values = _clone(defaults) ?? {};
    let _bus = eventBus;

    const _sortCategories = () => {
        // Array#sort is stable, so equal `order` keeps registration order.
        _categories.sort((a, b) => (a.order ?? 1000) - (b.order ?? 1000));
    };
    _sortCategories();

    const _debug = () => _values.debug?.logSettingsAccess;

    /**
     * Load user-persisted values from localStorage (sparse merge).
     * Only paths currently present in the schema are restored; anything else in
     * storage is left untouched in memory — that is what makes `extend()` able
     * to pick up a late-registered namespace's saved values.
     */
    const _load = () => {
        try {
            if (!storageKey || typeof localStorage === 'undefined') return;
            const raw = localStorage.getItem(storageKey);
            if (!raw) return;
            const saved = JSON.parse(raw);
            for (const path of Object.keys(_schema)) {
                const parts = path.split('.');
                const value = _getNestedValue(saved, parts);
                if (value !== undefined) {
                    _setNestedValue(_values, parts, value);
                }
            }
        } catch (err) {
            console.warn('[Settings] Failed to load persisted settings', err);
        }
    };

    /** Persist values that differ from their defaults (sparse storage). */
    const _save = () => {
        try {
            if (!storageKey || typeof localStorage === 'undefined') return;
            const sparse = {};
            for (const path of Object.keys(_schema)) {
                const parts = path.split('.');
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
            console.warn('[Settings] Failed to persist settings', err);
        }
    };

    const _emit = (path, value) => {
        if (!_bus) return;
        _bus.emit(`settings:${path}:changed`, { path, value });
        _bus.emit('settings:changed', { path, value });
    };

    _load();

    /**
     * Merge an additional slice in — an embedder's own namespace — then re-apply
     * persisted overrides for the newly-known paths.
     *
     * ORDERING RULE: call this before the first `set()`. `_save()` rebuilds
     * storage from `Object.keys(_schema)`, so a write that lands *before* a
     * namespace is registered would garbage-collect that namespace's saved
     * values. Registering at the top of bootstrap satisfies this trivially.
     *
     * @param {SettingsSlice} slice
     */
    const extend = ({ defaults: d = {}, schema: s = {}, categories: c = [] } = {}) => {
        _deepMerge(_defaults, d);
        _deepMerge(_values, d);
        Object.assign(_schema, s);
        for (const cat of c) {
            if (!cat?.id) continue;
            if (_categories.some(x => x.id === cat.id)) continue;
            _categories.push({ ...cat });
        }
        _sortCategories();
        _load();   // idempotent: overlays only paths it finds in storage
    };

    const get = (path, defaultValue = undefined) => {
        const parts = path.split('.');
        let current = _values;
        for (const part of parts) {
            if (current === null || current === undefined || typeof current !== 'object') {
                if (_debug()) console.warn(`[Settings] Path not found: ${path}`);
                return defaultValue;
            }
            current = current[part];
        }
        if (current === undefined) return defaultValue;
        if (_debug()) console.log(`[Settings] getSetting('${path}') =>`, current);
        return current;
    };

    const set = (path, value) => {
        const parts = path.split('.');
        const lastPart = parts.pop();
        let current = _values;
        for (const part of parts) {
            if (current[part] === undefined || current[part] === null) {
                current[part] = {};
            }
            if (typeof current[part] !== 'object') {
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
        if (!def) return _clone(_getNestedValue(_defaults, path.split('.')));
        return _clone(def.defaultValue);
    };

    const resetOne = (path) => {
        const defaultVal = getDefault(path);
        if (defaultVal === undefined) {
            console.warn(`[Settings] No default found for '${path}'`);
            return false;
        }
        return set(path, defaultVal);
    };

    const resetCategoryFn = (categoryId) => {
        for (const [path, def] of Object.entries(_schema)) {
            if (def.category !== categoryId) continue;
            _setNestedValue(_values, path.split('.'), _clone(def.defaultValue));
        }
        _save();
        if (_bus) {
            _bus.emit('settings:category:reset', { category: categoryId });
            _bus.emit('settings:changed', { path: null, category: categoryId });
        }
    };

    const resetAll = () => {
        for (const [path, def] of Object.entries(_schema)) {
            _setNestedValue(_values, path.split('.'), _clone(def.defaultValue));
        }
        _save();
        if (_bus) {
            _bus.emit('settings:reset', {});
            _bus.emit('settings:changed', { path: null });
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
        setEventBus: (bus) => { _bus = bus; },
    });
}

// ─── The app-global binding over ONE store ───────────────────────────────────
//
// A capability *port* (the host bridge) may have many implementations at once,
// so a singleton there is a category error. A *value store* with a single
// physical backing key has cardinality one by construction: two live stores in
// one document would be two writers to `localStorage[STORAGE_KEY]`. The
// singleton is the correct cardinality, not a shortcut — and the factory above
// is the primitive, so tests and a standalone demo never touch this binding.

const _store = createSettingsStore({
    defaults: DEFAULTS,
    schema: SCHEMA,
    categories: CATEGORIES,
    storageKey: STORAGE_KEY,
});

/**
 * Push an embedder's settings namespace into the app-global store.
 *
 * This is the whole of "push, don't pull": the framework ships the shell's own
 * settings and the *embedder* hands over its own — the store never imports a
 * schema it does not own.
 *
 * MUST run before any setSetting() — see `extend()`.
 *
 * @param {SettingsSlice} slice
 */
export function registerSettings(slice) {
    _store.extend(slice);
}

/**
 * Register the EventBus instance for settings change notifications.
 * Called once during app bootstrap.
 * @param {object} eventBus
 */
export function registerSettingsEventBus(eventBus) {
    _store.setEventBus(eventBus);
}

/**
 * Get a setting value by dot-notation path.
 * @param {string} path - Dot-separated path (e.g., 'workspace.save.showToast')
 * @param {*} [defaultValue] - Fallback if path not found
 * @returns {*} The setting value or defaultValue
 */
export function getSetting(path, defaultValue = undefined) {
    return _store.get(path, defaultValue);
}

/**
 * Set a setting value. Persists to localStorage and emits change events.
 * @param {string} path - Dot-separated path
 * @param {*} value - Value to set
 * @returns {boolean} True if set successfully
 */
export function setSetting(path, value) {
    return _store.set(path, value);
}

/**
 * Get the default value for a setting path.
 * @param {string} path - Dot-separated path
 * @returns {*} The default value, or undefined if the path is unknown
 */
export function getDefaultValue(path) {
    return _store.getDefault(path);
}

/**
 * Reset a setting to its default value.
 * @param {string} path - Dot-separated path
 * @returns {boolean} True if reset successfully
 */
export function resetSetting(path) {
    return _store.resetOne(path);
}

/**
 * Reset all settings in a category to their defaults.
 * @param {string} categoryId
 */
export function resetCategory(categoryId) {
    _store.resetCategory(categoryId);
}

/** Reset all settings to their defaults. */
export function resetAllSettings() {
    _store.resetAll();
}

/**
 * Get all settings as a plain object (for serialization or debugging).
 * @returns {object} Deep copy of current settings
 */
export function getAllSettings() {
    return _store.getAll();
}

// ─── Schema / Category API (for Settings page UI) ───────────────────────────

/**
 * Get the full settings schema (shell + every registered slice).
 * @returns {Object<string, SettingDef>}
 */
export function getSchema() {
    return _store.getSchema();
}

/**
 * Get the categories list, in sidebar order.
 * @returns {CategoryDef[]}
 */
export function getCategories() {
    return _store.getCategories();
}

/**
 * Get all settings definitions for a given category, in schema order.
 * @param {string} categoryId
 * @returns {Array<{path:string} & SettingDef>}
 */
export function getSettingsByCategory(categoryId) {
    return _store.getByCategory(categoryId);
}
