/**
 * layout_persistence.js — saved tile layouts, keyed by whatever the app keys them by.
 *
 * Three things used to make this un-shippable, and all three are now injected:
 *
 *   1. It wrote to `localStorage` under 'ecosim.results.layouts' and
 *      'ecosim.results.configs' — a LIBRARY scribbling on one application's storage
 *      keys. The keys are the consumer's now, and EcoAgent passes its existing ones,
 *      so not a single saved layout is orphaned.
 *
 *   2. It imported EcoAgent's TemplateRegistry to pick a starting layout. That is a
 *      `resolveTemplate` callback now: hand it your context, get a layout back, or
 *      return null and get an empty grid.
 *
 *   3. Everything was called `scenarioId`, 85 times. A tile layout is keyed by
 *      SOMETHING — a scenario, a document, a user, a run — and the library does not
 *      get an opinion about which. It is `contextId` now. This is a rename of
 *      IDENTIFIERS only: the old name was never a stored string, just a key into the
 *      stored object, so no persisted data changes shape.
 *
 * `storage` is any synchronous Storage-shaped object (getItem/setItem/removeItem).
 * It defaults to localStorage because that is what a browser has; it is not the Host,
 * because the Host is async and every caller of this class is not.
 */

const LAYOUT_VERSION = 3;

const DEFAULT_LAYOUTS_KEY = 'twm.tiles.layouts';
const DEFAULT_CONFIGS_KEY = 'twm.tiles.configs';

export class LayoutPersistence {
    constructor({
        storage = (typeof localStorage !== 'undefined' ? localStorage : null),
        layoutsKey = DEFAULT_LAYOUTS_KEY,
        configsKey = DEFAULT_CONFIGS_KEY,
        resolveTemplate = null,
        logger = null,
    } = {}) {
        this._cache = null;
        this._storage = storage;
        this._logger = logger;
        this._layoutsKey = layoutsKey;
        this._configsKey = configsKey;
        // (context) => layout | null. No resolver => no starting template.
        this._resolveTemplate = typeof resolveTemplate === 'function' ? resolveTemplate : null;
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

        // Resolve a template based on context metadata
        const instantiated = this._resolveTemplate?.(context) ?? null;
        if (instantiated) {
            return {
                tiles: instantiated.tiles,
                version: LAYOUT_VERSION,
                templateId: instantiated.templateId,
                templateModified: false,
            };
        }

        // Final fallback: empty layout (should not happen — resolve always returns a default)
        return { tiles: [], version: LAYOUT_VERSION };
    }

    /**
     * Save layout for a specific context.
     * @param {string} contextId - Whatever the app keys layouts by.
     * @param {Array|Object} layout - Layout array or object with tiles property
     */
    saveLayout(contextId, layout) {
        const all = this._loadAll();

        // Handle both array (from TileGrid.getLayout) and object (with tiles property) formats
        const tilesArray = Array.isArray(layout) ? layout : (layout?.tiles || []);

        all[contextId] = {
            tiles: tilesArray,
            version: LAYOUT_VERSION,
            updatedAt: Date.now(),
            templateId: layout?.templateId || all[contextId]?.templateId || null,
            templateModified: layout?.templateModified ?? true,
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
            templateModified: false,
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
            this._logger?.info?.('[LayoutPersistence] Imported layouts');
        } catch (err) {
            console.error('[LayoutPersistence] Failed to import layouts:', err);
        }
    }

    /**
     * Clear all saved layouts.
     */
    clearAll() {
        try {
            this._storage?.removeItem(this._layoutsKey);
            this._cache = null;
            this._logger?.info?.('[LayoutPersistence] Cleared all layouts');
        } catch (err) {
            console.error('[LayoutPersistence] Failed to clear layouts:', err);
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
            console.error('[LayoutPersistence] Failed to load layouts:', err);
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
            console.error('[LayoutPersistence] Failed to save layouts:', err);

            // If quota exceeded, try to clear old entries
            if (err.name === 'QuotaExceededError') {
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

        // Sort by updatedAt, oldest first
        entries.sort((a, b) => (a[1].updatedAt || 0) - (b[1].updatedAt || 0));

        // Remove oldest 25%
        const removeCount = Math.ceil(entries.length * 0.25);
        for (let i = 0; i < removeCount; i++) {
            delete data[entries[i][0]];
        }

        // Try saving again
        try {
            this._storage?.setItem(this._layoutsKey, JSON.stringify(data));
            this._cache = data;
            this._logger?.warn?.('[LayoutPersistence] Pruned old layouts due to quota');
        } catch (err) {
            console.error('[LayoutPersistence] Still cannot save after pruning:', err);
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

        // Return empty structure
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

        // Ensure unique name
        const uniqueName = this._getUniqueName(all[contextId].configs, name);

        const configId = `config-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const tilesArray = Array.isArray(layout) ? layout : (layout?.tiles || []);

        all[contextId].configs[configId] = {
            name: uniqueName,
            tiles: tilesArray,
            version: LAYOUT_VERSION,
            createdAt: Date.now(),
            templateId: options?.templateId || null,
        };

        // Set as active if it's the first one
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

        const existingNames = new Set(Object.values(configs).map(c => c.name));

        if (!existingNames.has(name)) {
            return name;
        }

        // Find next available number
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
            // Update active config
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

        // Update active if deleted
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

        const tilesArray = Array.isArray(layout) ? layout : (layout?.tiles || []);

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

        // Get configs excluding the one being renamed for uniqueness check
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
            console.error('[LayoutPersistence] Failed to load configurations:', err);
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
            console.error('[LayoutPersistence] Failed to save configurations:', err);
        }
    }
}

// Singleton instance
let instance = null;
let _options = {};

/**
 * Configure the singleton BEFORE anything reads it. Call once, at boot.
 *
 * The first cut let `getLayoutPersistence(options)` configure it lazily — whoever
 * called first won. That is a trap with teeth: if ANY code path had reached the
 * store before the dashboard did, the singleton would have been built with the
 * library's generic defaults, and the app would have read
 * 'twm.tiles.layouts' instead of 'ecosim.results.layouts' — an empty store. Every
 * saved dashboard a user had ever built would have silently vanished, with no
 * error, and no captured view would show it because the pixel gate runs on a
 * fresh template that has no saved layouts to lose.
 *
 * Configure once, at boot, where the ordering is not in question.
 */
export function configureLayoutPersistence(options = {}) {
    _options = options;
    instance = null;               // rebuild on next get
}

/** @returns {LayoutPersistence} */
export function getLayoutPersistence() {
    if (!instance) {
        instance = new LayoutPersistence(_options);
    }
    return instance;
}

export default LayoutPersistence;
