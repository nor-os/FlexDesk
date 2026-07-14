import {
  __esm,
  __export
} from "./chunk-JYWURG5T.js";

// src/tiles/tile_registry.js
var tile_registry_exports = {};
__export(tile_registry_exports, {
  TileRegistry: () => TileRegistry,
  createWidget: () => createWidget,
  default: () => tile_registry_default,
  getAllWidgetTypes: () => getAllWidgetTypes,
  getWidget: () => getWidget,
  getWidgetCatalog: () => getWidgetCatalog,
  getWidgetMetadata: () => getWidgetMetadata,
  hasWidget: () => hasWidget,
  registerWidget: () => registerWidget,
  setTileLogger: () => setTileLogger
});
function setTileLogger(logger) {
  _logger = logger;
}
function registerWidget(WidgetClass) {
  if (!WidgetClass.TYPE) {
    console.warn("[TileRegistry] Widget class missing TYPE property:", WidgetClass);
    return;
  }
  registry.set(WidgetClass.TYPE, WidgetClass);
  _logger?.info?.(`[TileRegistry] Registered widget: ${WidgetClass.TYPE}`);
}
function getWidget(type) {
  return registry.get(type);
}
function hasWidget(type) {
  return registry.has(type);
}
function getAllWidgetTypes() {
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
function createWidget(type, options) {
  const WidgetClass = registry.get(type);
  if (!WidgetClass) {
    console.warn(`[TileRegistry] Unknown widget type: ${type}`);
    return null;
  }
  return new WidgetClass(options);
}
function getWidgetCatalog({ runType } = {}) {
  const catalog = [];
  registry.forEach((WidgetClass, type) => {
    if (runType === "static" && WidgetClass.REQUIRES_MC) return;
    catalog.push({
      type,
      title: WidgetClass.TITLE || type,
      icon: WidgetClass.ICON || "widgets",
      description: WidgetClass.DESCRIPTION || "",
      defaultSize: WidgetClass.DEFAULT_SIZE || { w: 4, h: 3 },
      requiresMC: !!WidgetClass.REQUIRES_MC
    });
  });
  return catalog;
}
function getWidgetMetadata(type) {
  const WidgetClass = registry.get(type);
  if (!WidgetClass) return null;
  return {
    type,
    title: WidgetClass.TITLE || type,
    icon: WidgetClass.ICON || "widgets",
    description: WidgetClass.DESCRIPTION || "",
    defaultSize: WidgetClass.DEFAULT_SIZE || { w: 4, h: 3 },
    requiresMC: !!WidgetClass.REQUIRES_MC
  };
}
var registry, _logger, TileRegistry, tile_registry_default;
var init_tile_registry = __esm({
  "src/tiles/tile_registry.js"() {
    registry = /* @__PURE__ */ new Map();
    _logger = null;
    TileRegistry = {
      register: registerWidget,
      get: getWidget,
      has: hasWidget,
      getAll: getAllWidgetTypes,
      create: createWidget,
      getCatalog: getWidgetCatalog,
      getMetadata: getWidgetMetadata,
      _registry: registry
    };
    tile_registry_default = TileRegistry;
  }
});

export {
  setTileLogger,
  registerWidget,
  getWidget,
  hasWidget,
  getAllWidgetTypes,
  createWidget,
  getWidgetCatalog,
  getWidgetMetadata,
  TileRegistry,
  tile_registry_default,
  tile_registry_exports,
  init_tile_registry
};
//# sourceMappingURL=chunk-FOOS3T5L.js.map
