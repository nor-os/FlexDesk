/**
 * Event Bus (js_new)
 *
 * Purpose
 * -------
 * Provide a deterministic, dependency-injected publish/subscribe hub for all front-end modules.
 *
 * Responsibilities
 * - Maintain per-event listener registries with namespace awareness.
 * - Support synchronous + async dispatch without DOM bridges or global singletons.
 * - Surface diagnostics via the shared logging service instead of ad hoc console calls.
 *
 * Source Material
 * - html/js/event_manager.js (core pub/sub semantics, minus DOM bridge + globals).
 * - html/js/debug_utils.js (event history/diagnostics requirements).
 *
 */

const PATTERN_TOKEN_RE = /[.*+?^${}()|[\]\\]/g;
const HAS_WILDCARD_RE = /[\*\?]/;

export class EventBus {
    constructor({ logger, historyLimit = 200 } = {}) {
        this.logger = logger;
        this.historyLimit = historyLimit;
        this.sequence = 0;
        this.listeners = new Map(); // event -> Set<entry>
        this.wildcardListeners = new Map(); // id -> entry (regex based)
        this.listenerIndex = new Map(); // id -> entry
        this.eventHistory = [];
    }

    on(eventName, handler, options = {}) {
        if (typeof eventName !== 'string' || !eventName.trim()) {
            throw new TypeError('eventName must be a non-empty string');
        }
        if (typeof handler !== 'function') {
            throw new TypeError('handler must be a function');
        }

        const entry = {
            id: ++this.sequence,
            eventName,
            handler,
            namespace: options.namespace ?? null,
            once: Boolean(options.once),
            priority: options.priority ?? 0,
            regex: null,
            abortCleanup: null,
        };

        if (HAS_WILDCARD_RE.test(eventName)) {
            entry.regex = this._compilePattern(eventName);
            this.wildcardListeners.set(entry.id, entry);
        } else {
            if (!this.listeners.has(eventName)) {
                this.listeners.set(eventName, new Set());
            }
            this.listeners.get(eventName).add(entry);
        }

        const useAbortSignal = typeof AbortSignal !== 'undefined' && options.signal instanceof AbortSignal;
        if (useAbortSignal) {
            if (options.signal.aborted) {
                // Immediately unsubscribe if already aborted.
                return { dispose: () => {}, id: entry.id };
            }
            const abortFn = () => this.off(entry.id);
            options.signal.addEventListener('abort', abortFn, { once: true });
            entry.abortCleanup = () => options.signal.removeEventListener('abort', abortFn);
        }

        this.listenerIndex.set(entry.id, entry);
        return {
            id: entry.id,
            dispose: () => this.off(entry.id),
        };
    }

    once(eventName, handler, options = {}) {
        return this.on(eventName, handler, { ...options, once: true });
    }

    off(target) {
        const id = typeof target === 'number' ? target : target?.id;
        if (!this.listenerIndex.has(id)) {
            return false;
        }
        const entry = this.listenerIndex.get(id);
        this.listenerIndex.delete(id);

        if (entry.abortCleanup) {
            try {
                entry.abortCleanup();
            } catch (err) {
                this.logger?.warn?.('event-bus', 'Abort cleanup failed', err);
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

    emit(eventName, payload = undefined, options = {}) {
        const context = this._createContext(eventName, options);
        const listeners = this._collectListeners(eventName, context.namespace);
        this._recordHistory(eventName, context.namespace, listeners.length);
        return this._invokeListeners(listeners, payload, context);
    }

    emitAsync(eventName, payload = undefined, options = {}) {
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

        return matches
            .filter((entry) => !entry.namespace || entry.namespace === namespace)
            .sort((a, b) => {
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
            stopPropagation: () => {},
        };
    }

    _recordHistory(eventName, namespace, listenerCount) {
        this.eventHistory.push({
            event: eventName,
            namespace,
            timestamp: Date.now(),
            listeners: listenerCount,
        });
        if (this.eventHistory.length > this.historyLimit) {
            this.eventHistory.shift();
        }
    }

    _handleListenerError(entry, context, error) {
        this.logger?.error?.('event-bus', 'Listener error', {
            event: context.event,
            namespace: context.namespace,
            listenerId: entry.id,
            error,
        });
    }

    _compilePattern(pattern) {
        const escaped = pattern.replace(PATTERN_TOKEN_RE, '\\$&');
        const regexSource = `^${escaped.replace(/\\\*/g, '.*').replace(/\\\?/g, '.')}$`;
        return new RegExp(regexSource);
    }
}
