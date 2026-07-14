/**
 * Logging + Telemetry Hub (js_new)
 *
 * Purpose
 * -------
 * Single sink for structured logs, metrics, and telemetry forwarding from all modules.
 *
 * Responsibilities
 * - Normalize log payloads (level, namespace, metadata) before dispatching to host.
 * - Publish `log:*` events for in-app diagnostics dashboards.
 * - Replace scattered console/notify usage with a deterministic API.
 *
 * Source Material
 * - html/js/logger.js (log formatting + transports).
 * - html/js/debug_utils.js (runtime diagnostics + indicators).
 *
 */

const LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];
const LEVEL_INDEX = new Map(LEVELS.map((level, idx) => [level, idx]));

const DEFAULT_NAMESPACE = 'app';

// Quiet mode level - only warn and above during simulation
const QUIET_MODE_LEVEL = 'warn';

export class LoggingService {
    constructor({
        name = 'ecosim',
        eventBus = null,
        minLevel = 'info',
        historyLimit = 500,
        transports = [],
        enableConsole = false,
        namespaceLevels = null,
    } = {}) {
        this.name = name;
        this.eventBus = eventBus;
        this.historyLimit = historyLimit;
        this.entries = [];
        this.sequence = 0;
        this.transports = new Set();
        this.namespaceLevels = { ...(namespaceLevels || {}) };
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
        if (!map || typeof map !== 'object') return;
        Object.entries(map).forEach(([ns, lvl]) => {
            if (ns) {
                this.namespaceLevels[ns] = this._normalizeLevel(lvl);
            }
        });
    }

    getNamespaceLevel(namespace) {
        if (!namespace) return undefined;
        return this.namespaceLevels[namespace];
    }

    addTransport(transport) {
        if (typeof transport !== 'function') {
            throw new TypeError('Logging transport must be a function');
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
        return this.log('trace', message, metadata, options);
    }

    debug(message, metadata, options) {
        return this.log('debug', message, metadata, options);
    }

    info(message, metadata, options) {
        return this.log('info', message, metadata, options);
    }

    warn(message, metadata, options) {
        return this.log('warn', message, metadata, options);
    }

    error(message, metadata, options) {
        return this.log('error', message, metadata, options);
    }

    fatal(message, metadata, options) {
        return this.log('fatal', message, metadata, options);
    }

    scoped(namespace) {
        const ns = namespace || DEFAULT_NAMESPACE;
        // Codebase convention: callers pass (subcategory, message, meta?) where
        // subcategory is a short kebab-case tag and message is the human-readable
        // string.  Detect this pattern (two leading string args) and use the second
        // string as the log message, discarding the subcategory (the scoped
        // namespace already provides sufficient context).
        // Also supports the standard (message, meta?) single-string form.
        const make = (level) => (first, second, third) => {
            if (typeof second === 'string') {
                return this.log(level, second, third ?? null, { namespace: ns });
            }
            return this.log(level, first, second ?? null, { namespace: ns });
        };
        return {
            trace: make('trace'),
            debug: make('debug'),
            info: make('info'),
            warn: make('warn'),
            error: make('error'),
            fatal: make('fatal'),
        };
    }

    getHistory() {
        return [...this.entries];
    }

    clearHistory() {
        this.entries.length = 0;
    }

    _normalizeLevel(level) {
        const normalized = typeof level === 'string' ? level.toLowerCase() : '';
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
            context,
        };
    }

    _sanitizeMetadata(metadata) {
        if (!metadata) {
            return null;
        }
        if (metadata instanceof Error) {
            return this._errorToObject(metadata);
        }
        if (typeof metadata === 'object') {
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
            stack: error.stack,
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
            this.eventBus.emit('log:entry', entry);
        } catch (err) {
            this._consoleTransport({ ...entry, level: 'warn', message: `Failed to emit log entry: ${err.message}` });
        }
    }

    _dispatch(entry) {
        for (const transport of this.transports) {
            try {
                transport(entry);
            } catch (err) {
                this._consoleTransport({
                    ...entry,
                    level: 'warn',
                    namespace: 'logging',
                    message: `Logging transport failed: ${err.message}`,
                    data: { transportError: this._errorToObject(err) },
                });
            }
        }
    }

    _consoleTransport(entry) {
        const prefix = `[${entry.service}][${entry.namespace}]`;
        const method = (entry.level === 'trace' || entry.level === 'debug')
            ? console.log // eslint-disable-line no-console
            : (console[entry.level] || console.log); // eslint-disable-line no-console
        method(`${prefix} ${entry.message}`, entry.data ?? ''); // eslint-disable-line no-console
    }
}
