/**
 * StateGuardService
 * ------------------
 * Runtime enforcement layer that blocks storing application state inside DOM attributes.
 * Hooks Element attribute/dataset APIs and emits violations through the event bus.
 */

import { DEFAULT_STATE_GUARD_CONFIG, normalizeStateGuardConfig } from './state_guard_config.js';

const HOOK_REGISTRY = {
    installed: false,
    service: null,
    originals: {
        setAttribute: null,
        removeAttribute: null,
        getAttribute: null,
    },
    datasetDescriptor: null,
    datasetProxyCache: new WeakMap(),
};

const STACK_CACHE_LIMIT = 500;
/** `url:line:col` at the end of a frame, in V8 (`at fn (url:1:2)`) and in Firefox/WebKit (`fn@url:1:2`). */
const FRAME_LOCATION = /(?:\(|@|\bat\s+)([^()\s@][^()\s]*?):\d+(?::\d+)?\)?\s*$/;
const DATA_ATTRIBUTE_PREFIX = 'data-';
/** Set by the DOM hooks below: one hook frame sits between the writer and handle*Mutation. */
const VIA_DOM_HOOK = Symbol('state-guard:via-dom-hook');
const EVENT_CHANNELS = Object.freeze({
    READY: 'state-guard:ready',
    VIOLATION: 'state-guard:violation',
    MODE_CHANGED: 'state-guard:mode-changed',
});

export class StateGuardService {
    constructor({
        eventBus = null,
        logger = null,
        config = DEFAULT_STATE_GUARD_CONFIG,
    } = {}) {
        this.eventBus = eventBus;
        this.logger = logger;
        this.enabled = true;
        this.bypassDepth = 0;
        this.config = normalizeStateGuardConfig(config);
        this.mode = this.config.mode;
        this.allowedAttributes = new Set(this.config.allowedAttributes.map((attr) => attr.toLowerCase()));
        this.allowedAttributePrefixes = this.config.allowedAttributePrefixes.map((attr) => attr.toLowerCase());
        this.allowedDatasetKeys = new Set(this.config.allowedDatasetKeys.map(normalizeDatasetKey));
        this.moduleOverrides = (this.config.moduleOverrides ?? []).map((entry) => ({
            pattern: entry.pattern,
            attributes: new Set(entry.attributes.map((attr) => attr.toLowerCase())),
            datasetKeys: new Set(entry.datasetKeys.map(normalizeDatasetKey)),
            attributePrefixes: entry.attributePrefixes.map((prefix) => prefix.toLowerCase()),
        }));
        this.moduleFramePattern = this.config.moduleFramePattern;
        this.stackCache = new Map();
        this.#installHooks();
    }

    setMode(mode) {
        const normalized = typeof mode === 'string' ? mode.toLowerCase() : '';
        if (!['off', 'warn', 'strict'].includes(normalized)) {
            throw new Error(`Invalid state guard mode "${mode}"`);
        }
        if (this.mode === normalized) {
            return this.mode;
        }
        this.mode = normalized;
        this.eventBus?.emit?.(EVENT_CHANNELS.MODE_CHANGED, {
            mode: this.mode,
            timestamp: Date.now(),
        });
        return this.mode;
    }

    getMode() {
        return this.mode;
    }

    allow(modulePattern, attributes = [], { datasetKeys = [], attributePrefixes = [] } = {}) {
        const pattern = modulePattern instanceof RegExp
            ? modulePattern
            : new RegExp(String(modulePattern ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        const entry = {
            pattern,
            attributes: new Set(attributes.map((attr) => String(attr).toLowerCase())),
            datasetKeys: new Set(datasetKeys.map(normalizeDatasetKey)),
            attributePrefixes: attributePrefixes.map((prefix) => String(prefix).toLowerCase()),
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
        if (typeof fn !== 'function') {
            throw new TypeError('executeWithBypass requires a function');
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
        if (typeof fn !== 'function') {
            throw new TypeError('executeWithBypassAsync requires a function');
        }
        try {
            this.bypassDepth += 1;
            return await fn();
        } finally {
            this.bypassDepth = Math.max(0, this.bypassDepth - 1);
        }
    }

    /**
     * Check one attribute write. The write is attributed to the caller of this
     * method, or to the caller of the patched DOM API when it came through one.
     */
    handleAttributeMutation(element, action, attribute, value, options = {}) {
        const attrName = this.#normalizeAttribute(attribute);
        if (!this.#shouldGuard(attrName)) {
            return;
        }
        this.#evaluateMutation({
            action,
            attribute: attrName,
            element,
            value,
            source: 'attribute',
            stack: new Error().stack,
            writerFrame: options?.[VIA_DOM_HOOK] ? 2 : 1,
        });
    }

    handleDatasetMutation(element, key, value, { deleting = false, [VIA_DOM_HOOK]: viaHook = false } = {}) {
        const attrName = datasetKeyToAttribute(key);
        if (!this.#shouldGuard(attrName)) {
            return;
        }
        this.#evaluateMutation({
            stack: new Error().stack,
            writerFrame: viaHook ? 2 : 1,
            action: deleting ? 'dataset:delete' : 'dataset:set',
            attribute: attrName,
            element,
            value,
            source: 'dataset',
        });
    }

    #installHooks() {
        if (typeof Element === 'undefined' || typeof HTMLElement === 'undefined') {
            this.enabled = false;
            this.logger?.warn?.('state-guard', 'DOM environment unavailable; guard disabled');
            return;
        }
        installDomHooks(this);
        this.eventBus?.emit?.(EVENT_CHANNELS.READY, {
            mode: this.mode,
            timestamp: Date.now(),
        });
    }

    #shouldGuard(attribute) {
        if (!this.enabled) {
            return false;
        }
        if (this.mode === 'off') {
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

    #evaluateMutation({ action, attribute, element, value, source, stack, writerFrame }) {
        const moduleKey = this.#resolveModuleFromStack(stack, writerFrame);
        if (this.#isAllowedForModule(moduleKey, attribute)) {
            return;
        }
        const payload = {
            attribute,
            action,
            source,
            module: moduleKey,
            mode: this.mode,
            timestamp: Date.now(),
        };
        this.logger?.warn?.('state-guard', 'Blocked DOM state mutation', {
            ...payload,
            valuePreview: this.#previewValue(value),
        });
        this.eventBus?.emit?.(EVENT_CHANNELS.VIOLATION, payload);
        if (this.mode === 'strict') {
            const label = moduleKey ? `${moduleKey}` : 'unknown module';
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
            return '';
        }
        return String(attribute).toLowerCase();
    }

    /**
     * The module a write is attributed to. `stack` was captured in a
     * handle*Mutation method (frame 0); `writerFrame` is the index of the frame
     * that made the write (1 for a direct call, 2 through a DOM hook). Without a
     * `moduleFramePattern` that writer's location (its URL or path, line and
     * column dropped) is the module. With one, the first frame from the writer
     * up whose location matches is used, and the module is the pattern's first
     * capture group, or that frame's whole location when it has none.
     */
    #resolveModuleFromStack(stack, writerFrame) {
        if (!stack) {
            return null;
        }
        const cacheKey = `${writerFrame}\n${stack}`;
        if (this.stackCache.has(cacheKey)) {
            return this.stackCache.get(cacheKey);
        }
        const locations = [];
        for (const line of String(stack).split('\n')) {
            const match = line.match(FRAME_LOCATION);
            if (match) {
                locations.push(match[1]);
            }
        }
        const callers = locations.slice(writerFrame);
        let modulePath = null;
        if (!this.moduleFramePattern) {
            modulePath = callers[0] ?? null;
        } else {
            for (const location of callers) {
                const match = location.match(this.moduleFramePattern);
                if (match) {
                    modulePath = match[1] ?? location;
                    break;
                }
            }
        }
        if (this.stackCache.size > STACK_CACHE_LIMIT) {
            this.stackCache.clear();
        }
        this.stackCache.set(cacheKey, modulePath);
        return modulePath;
    }

    #previewValue(value) {
        if (value === null || value === undefined) {
            return String(value);
        }
        if (typeof value === 'object') {
            return '[object]';
        }
        const str = String(value);
        return str.length > 50 ? `${str.slice(0, 47)}...` : str;
    }
}

/**
 * The attribute a dataset key writes: `fooBar` -> `data-foo-bar`, as the DOM
 * maps it. Empty for a key that names nothing.
 */
function datasetKeyToAttribute(key) {
    if (!key && key !== 0) {
        return '';
    }
    const normalized = String(key)
        .replace(/([A-Z])/g, '-$1')
        .replace(/[^a-zA-Z0-9_-]/g, '-')
        .toLowerCase()
        .replace(/-{2,}/g, '-')
        .replace(/^-+/, '')
        .replace(/-+$/, '');
    if (!normalized) {
        return '';
    }
    return `${DATA_ATTRIBUTE_PREFIX}${normalized}`;
}

/**
 * An allow-list dataset key in the one spelling the guard compares: the
 * attribute's, without `data-`. `fooBar` and `foo-bar` are the same key, so an
 * allow-list may use either.
 */
function normalizeDatasetKey(key) {
    return datasetKeyToAttribute(key).slice(DATA_ATTRIBUTE_PREFIX.length);
}

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
        guard?.handleAttributeMutation(this, 'setAttribute', name, value, { [VIA_DOM_HOOK]: true });
        return nativeSetAttribute.call(this, name, value);
    };

    Element.prototype.removeAttribute = function patchedRemoveAttribute(name) {
        const guard = HOOK_REGISTRY.service;
        guard?.handleAttributeMutation(this, 'removeAttribute', name, undefined, { [VIA_DOM_HOOK]: true });
        return nativeRemoveAttribute.call(this, name);
    };

    wrapDataset(service);
}

function wrapDataset(service) {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'dataset');
    if (!descriptor || typeof descriptor.get !== 'function') {
        return;
    }
    HOOK_REGISTRY.datasetDescriptor = descriptor;
    Object.defineProperty(HTMLElement.prototype, 'dataset', {
        configurable: true,
        enumerable: descriptor.enumerable,
        get: function datasetGetter() {
            const nativeDataset = descriptor.get.call(this);
            if (!nativeDataset || typeof nativeDataset !== 'object') {
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
                    const key = typeof prop === 'string' ? prop : null;
                    if (guard && key) {
                        guard.handleDatasetMutation(proxyState.element, key, value, { [VIA_DOM_HOOK]: true });
                    }
                    return Reflect.set(target, prop, value);
                },
                deleteProperty(target, prop) {
                    const guard = HOOK_REGISTRY.service;
                    const key = typeof prop === 'string' ? prop : null;
                    if (guard && key) {
                        guard.handleDatasetMutation(proxyState.element, key, undefined, {
                            deleting: true,
                            [VIA_DOM_HOOK]: true,
                        });
                    }
                    return Reflect.deleteProperty(target, prop);
                },
            });
            HOOK_REGISTRY.datasetProxyCache.set(nativeDataset, { proxy, element: this });
            return proxy;
        },
    });
}
