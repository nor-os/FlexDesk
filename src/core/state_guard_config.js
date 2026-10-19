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
    'curve-number',
    'point-number',
    // UI state keys used by original HTML structure
    'active-content',
    'panel-content',
    'collapsible-id',
    'collapsible-default',
    'collapsible-header',
    'collapsible-content',
    'collapsible-group',
    'collapsible-exclusive',
    'collapsible-float',
    'collapsible-fill',
    'tool',
    'tab',
    'role',
    'op',
    'func-name',
    'func-expr',
    'arity',
    'tooltip',
    'latex-tooltip',
    'node-type',
    'node-name',
    'lang',
    'playback-control',
    // Simulation/scenario state keys
    'status',
    'scenario-id',
    'run-id',
    'run-state',
    'selected',
    'active',
    'disabled',
    'expanded',
    'collapsed',
    'visible',
    'hidden',
    // Node/canvas state keys
    'node-id',
    'connector-id',
    'connector-type',
    'connection-id',
    'input-index',
    'output-index',
    'port-index',
    // Scenario editor keys
    'source',
    'series-id',
    'dataset-id',
    'mirror-input-bound',
    'mirror-change-bound',
    'mirror-input',
    'bound',
    'field',
    'key',
    'namespace',
    'namespace-id',
    'tab-id',
    'param-id',
    'target-id',
    'override-type',
    // Tree view component keys
    'item-id',
    'category-id',
    // Calibration page keys
    'info-for',
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
    'dsl-section-registered',
    'dsl-scrollbars-installed',
    'dsl-tabs-bound',
    'dsl-controls-bound',
    // Inline highlighter keys
    'inline-hl',
    // Overlay scrollbar keys (UI-only, not state storage)
    'scrollable',
    'scrollable-x',
    'scrollable-y',
    // ManagedWindow component keys
    'window-id',
    // Help system keys
    'help-topic',
    // FlexDesk widgets: every literal data key written under src/ is listed
    // here (tests/state_guard_defaults.test.mjs scans for them), so the
    // shell, dialogs, forms, tooltips and editors pass a strict guard.
    'accent',
    'act',
    'action-idx',
    'action-value',
    'add',
    'category',
    'code',
    'data',
    'direction',
    'dismiss',
    'entry',
    'error',
    'extra',
    'flow',
    'from',
    'gap',
    'item',
    'kind',
    'lane',
    'leaf-id',
    'level',
    'list-action',
    'match',
    'mode',
    'node',
    'notification-summary',
    'open',
    'pager',
    'pane',
    'pane-id',
    'parameter',
    'placeholder',
    'placement',
    'port',
    'record-key',
    'ref',
    'refusal',
    'refusal-for',
    'renameable',
    'row-key',
    'rule',
    'scope',
    'shape',
    'slot',
    'slot-idx',
    'split-id',
    'state',
    'step',
    'syntax',
    'tile-id',
    'tile-type',
    'tip',
    'to',
    'tone',
    'tooltip-max-width',
    'tooltip-placement',
    'twm-flow-item',
    'twm-flow-title',
    'twm-icon',
    'twm-required',
    'twm-tabs',
    'twm-tail',
    'verb',
]);

export const DEFAULT_STATE_GUARD_CONFIG = Object.freeze({
    mode: 'warn',
    allowedAttributes: DEFAULT_ALLOWED_ATTRIBUTES,
    allowedAttributePrefixes: DEFAULT_ALLOWED_ATTRIBUTE_PREFIXES,
    allowedDatasetKeys: DEFAULT_ALLOWED_DATASET_KEYS,
    // FlexDesk ships no module overrides: which of YOUR modules may write which
    // keys is yours to say, through `moduleOverrides` or `allow()`.
    moduleOverrides: Object.freeze([]),
    // null: a write is attributed to the frame that made it. A RegExp (or a
    // literal string) picks the first frame from there up whose location
    // matches instead; its first capture group, if any, names the module.
    moduleFramePattern: null,
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
        moduleFramePattern: config.moduleFramePattern == null || config.moduleFramePattern === ''
            ? DEFAULT_STATE_GUARD_CONFIG.moduleFramePattern
            : patternToRegExp(config.moduleFramePattern),
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
