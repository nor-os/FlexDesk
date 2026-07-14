/**
 * tile_registry.js
 *
 * Registry for widget tile types.
 * Widgets register themselves here, and the grid uses this to instantiate tiles by type.
 */

/** @type {Map<string, typeof import('./tile_base.js').TileBase>} */
const registry = new Map();

/**
 * Register a widget class.
 * @param {typeof import('./tile_base.js').TileBase} WidgetClass - Widget class to register
 */
// The registry used to trace registrations to `window.logger` — a global belonging
// to one application. Give it a logger or it stays quiet.
let _logger = null;

/** @param {{info?: Function, warn?: Function}|null} logger */
export function setTileLogger(logger) {
    _logger = logger;
}

export function registerWidget(WidgetClass) {
    if (!WidgetClass.TYPE) {
        console.warn('[TileRegistry] Widget class missing TYPE property:', WidgetClass);
        return;
    }
    registry.set(WidgetClass.TYPE, WidgetClass);
    _logger?.info?.(`[TileRegistry] Registered widget: ${WidgetClass.TYPE}`);
}

/**
 * Get a widget class by type.
 * @param {string} type - Widget type identifier
 * @returns {typeof import('./tile_base.js').TileBase | undefined} Widget class or undefined
 */
export function getWidget(type) {
    return registry.get(type);
}

/**
 * Check if a widget type is registered.
 * @param {string} type - Widget type identifier
 * @returns {boolean}
 */
export function hasWidget(type) {
    return registry.has(type);
}

/**
 * Get all registered widget types.
 * @returns {Array<{type: string, title: string, defaultSize: {w: number, h: number}}>}
 */
export function getAllWidgetTypes() {
    const types = [];
    registry.forEach((WidgetClass, type) => {
        types.push({
            type,
            title: WidgetClass.TITLE || type,
            defaultSize: WidgetClass.DEFAULT_SIZE || { w: 4, h: 3 },
            constraints: WidgetClass.SIZE_CONSTRAINTS || { minW: 2, minH: 2, maxW: 12, maxH: 8 }
        });
    });
    return types;
}

/**
 * Create a widget instance.
 * @param {string} type - Widget type identifier
 * @param {Object} options - Constructor options for the widget
 * @returns {import('./tile_base.js').TileBase | null} Widget instance or null if type not found
 */
export function createWidget(type, options) {
    const WidgetClass = registry.get(type);
    if (!WidgetClass) {
        console.warn(`[TileRegistry] Unknown widget type: ${type}`);
        return null;
    }
    return new WidgetClass(options);
}

/**
 * Get widget metadata for the "Add Widget" menu.
 * @returns {Array<{type: string, title: string, icon: string, description: string}>}
 */
export function getWidgetCatalog({ runType } = {}) {
    const catalog = [];
    registry.forEach((WidgetClass, type) => {
        // Filter out MC-only widgets for static runs
        if (runType === 'static' && WidgetClass.REQUIRES_MC) return;

        catalog.push({
            type,
            title: WidgetClass.TITLE || type,
            icon: WidgetClass.ICON || 'widgets',
            description: WidgetClass.DESCRIPTION || '',
            defaultSize: WidgetClass.DEFAULT_SIZE || { w: 4, h: 3 },
            requiresMC: !!WidgetClass.REQUIRES_MC,
        });
    });
    return catalog;
}

/**
 * Get metadata for a specific widget type.
 * @param {string} type - Widget type identifier
 * @returns {Object|null} Widget metadata or null if not found
 */
export function getWidgetMetadata(type) {
    const WidgetClass = registry.get(type);
    if (!WidgetClass) return null;

    return {
        type,
        title: WidgetClass.TITLE || type,
        icon: WidgetClass.ICON || 'widgets',
        description: WidgetClass.DESCRIPTION || '',
        defaultSize: WidgetClass.DEFAULT_SIZE || { w: 4, h: 3 },
        requiresMC: !!WidgetClass.REQUIRES_MC,
    };
}

// Export registry for debugging
export const TileRegistry = {
    register: registerWidget,
    get: getWidget,
    has: hasWidget,
    getAll: getAllWidgetTypes,
    create: createWidget,
    getCatalog: getWidgetCatalog,
    getMetadata: getWidgetMetadata,
    _registry: registry
};

export default TileRegistry;
