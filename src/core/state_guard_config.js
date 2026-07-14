const DEFAULT_ALLOWED_ATTRIBUTES = Object.freeze([
    'data-testid',
    'data-field',
    'data-descriptor-key',
    'aria-label',
    'aria-labelledby',
    'aria-describedby',
    'aria-hidden',
    'aria-expanded',
    'aria-selected',
    'aria-disabled',
    'aria-checked',
    'aria-controls',
    'aria-haspopup',
    'aria-live',
    'aria-busy',
    'role',
    'title',
    'twm-has-tooltip',
    'data-tooltip',
    'data-help-topic',
]);

const DEFAULT_ALLOWED_ATTRIBUTE_PREFIXES = Object.freeze([
]);

const DEFAULT_ALLOWED_DATASET_KEYS = Object.freeze([
    'testid',
    'phase',
    'page-key',
    'deleting',
    // Notification center
    'notification-id',
    'notificationId',
    // Plotly.js internal attributes (third-party charting library)
    'unformatted',
    'toggle',
    'notex',
    'math',
    'originalindex',
    'original-index',
    'gravity',
    'attr',
    'val',
    'subplot',
    'group',
    'trace',
    'point',
    'curveNumber',
    'pointNumber',
    // UI state keys used by original HTML structure
    'active-content',
    'activeContent',
    'panel-content',
    'panelContent',
    'collapsible-id',
    'collapsibleId',
    'collapsible-default',
    'collapsibleDefault',
    'twm-collapsible-header',
    'collapsibleHeader',
    'twm-collapsible-content',
    'collapsibleContent',
    'collapsible-group',
    'collapsibleGroup',
    'collapsible-exclusive',
    'collapsibleExclusive',
    'collapsible-float',
    'collapsibleFloat',
    'collapsible-fill',
    'collapsibleFill',
    'tool',
    'tab',
    'role',
    'op',
    'func-name',
    'funcName',
    'func-expr',
    'funcExpr',
    'arity',
    'tooltip',
    'twm-latex-tooltip',
    'latexTooltip',
    'node-type',
    'nodeType',
    'twm-node-name',
    'nodeName',
    'lang',
    'playback-control',
    'playbackControl',
    // Simulation/scenario state keys
    'status',
    'scenario-id',
    'scenarioId',
    'run-id',
    'runId',
    'run-state',
    'runState',
    'selected',
    'active',
    'disabled',
    'expanded',
    'collapsed',
    'visible',
    'hidden',
    // Node/canvas state keys
    'node-id',
    'nodeId',
    'connector-id',
    'connectorId',
    'connector-type',
    'connectorType',
    'connection-id',
    'connectionId',
    'input-index',
    'inputIndex',
    'output-index',
    'outputIndex',
    'port-index',
    'portIndex',
    // Scenario editor keys
    'source',
    'series-id',
    'seriesId',
    'dataset-id',
    'datasetId',
    'mirror-input-bound',
    'mirrorInputBound',
    'mirror-change-bound',
    'mirrorChangeBound',
    'mirror-input',
    'mirrorInput',
    'bound',
    'field',
    'key',
    'namespace',
    'namespace-id',
    'namespaceId',
    'tab-id',
    'tabId',
    'param-id',
    'paramId',
    'target-id',
    'targetId',
    'override-type',
    'overrideType',
    // Tree view component keys
    'item-id',
    'itemId',
    'category-id',
    'categoryId',
    // Calibration page keys
    'info-for',
    'infoFor',
    'column',
    // Data page keys
    'readonly',
    'id',
    'action',
    'type',
    'name',
    'path',
    'index',
    'count',
    'total',
    'page',
    'sort',
    'order',
    'filter',
    'search',
    'value',
    'label',
    'title',
    'description',
    // DSL generator keys
    'dsl-state',
    'dslState',
    'dsl-section-registered',
    'dslSectionRegistered',
    'dsl-scrollbars-installed',
    'dslScrollbarsInstalled',
    'dsl-tabs-bound',
    'dslTabsBound',
    'dsl-controls-bound',
    'dslControlsBound',
    // Inline highlighter keys
    'inline-hl',
    'inlineHl',
    'tooltip',
    // Overlay scrollbar keys (UI-only, not state storage)
    'scrollable',
    'scrollable-x',
    'scrollableX',
    'scrollable-y',
    'scrollableY',
    // ManagedWindow component keys
    'window-id',
    'windowId',
    // Help system keys
    'help-topic',
    'helpTopic',
]);

const DEFAULT_OVERRIDES = Object.freeze([
    {
        // Panel controller writes dataset hooks for field identification/focus.
        pattern: /js_new\/ui\/controllers\/panel_controller\.js/,
        datasetKeys: ['field', 'descriptor-key', 'descriptorKey'],
        attributes: ['data-field', 'data-descriptor-key'],
        attributePrefixes: [],
    },
]);

const DEFAULT_MODE = typeof window !== 'undefined' && Boolean(window.__ECOSIM_DEBUG__)
    ? 'strict'
    : 'warn';

export const DEFAULT_STATE_GUARD_CONFIG = Object.freeze({
    mode: DEFAULT_MODE,
    allowedAttributes: DEFAULT_ALLOWED_ATTRIBUTES,
    allowedAttributePrefixes: DEFAULT_ALLOWED_ATTRIBUTE_PREFIXES,
    allowedDatasetKeys: DEFAULT_ALLOWED_DATASET_KEYS,
    moduleOverrides: DEFAULT_OVERRIDES,
});

export function normalizeStateGuardConfig(config = {}) {
    if (!config || typeof config !== 'object') {
        return { ...DEFAULT_STATE_GUARD_CONFIG };
    }
    return {
        mode: normalizeMode(config.mode ?? DEFAULT_STATE_GUARD_CONFIG.mode),
        allowedAttributes: normalizeStringList(
            config.allowedAttributes ?? DEFAULT_STATE_GUARD_CONFIG.allowedAttributes,
        ),
        allowedAttributePrefixes: normalizeStringList(
            config.allowedAttributePrefixes ?? DEFAULT_STATE_GUARD_CONFIG.allowedAttributePrefixes,
        ),
        allowedDatasetKeys: normalizeStringList(
            config.allowedDatasetKeys ?? DEFAULT_STATE_GUARD_CONFIG.allowedDatasetKeys,
        ),
        moduleOverrides: normalizeOverrides(
            config.moduleOverrides ?? DEFAULT_STATE_GUARD_CONFIG.moduleOverrides,
        ),
    };
}

function normalizeMode(mode) {
    const normalized = typeof mode === 'string' ? mode.toLowerCase() : '';
    return normalized === 'off' || normalized === 'warn' || normalized === 'strict'
        ? normalized
        : DEFAULT_STATE_GUARD_CONFIG.mode;
}

function normalizeStringList(value) {
    if (!value) {
        return [];
    }
    if (Array.isArray(value)) {
        return value
            .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
            .filter(Boolean);
    }
    if (typeof value === 'string') {
        return value
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean);
    }
    return [];
}

function normalizeOverrides(overrides) {
    if (!Array.isArray(overrides)) {
        return [];
    }
    return overrides
        .map((entry) => normalizeOverride(entry))
        .filter(Boolean);
}

function normalizeOverride(entry) {
    if (!entry || typeof entry !== 'object') {
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
        attributePrefixes: prefixes,
    };
}

function patternToRegExp(pattern) {
    if (pattern instanceof RegExp) {
        return pattern;
    }
    const source = String(pattern ?? '')
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(source);
}
