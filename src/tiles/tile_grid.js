/**
 * tile_grid.js
 *
 * Core draggable tile grid system.
 * Manages a 12-column CSS grid with drag-and-drop repositioning and resize functionality.
 */

import { createWidget, getWidgetCatalog } from './tile_registry.js';
import { ActionDropdown } from '../ui/components/action_dropdown.js';

export class TileGrid {
    /**
     * @param {Object} options
     * @param {HTMLElement} options.container - Container element for the grid
     * @param {number} [options.columns=12] - Number of grid columns
     * @param {number} [options.rowHeight=80] - Height of each grid row in pixels
     * @param {number} [options.gap=16] - Gap between tiles in pixels
     * @param {Object} [options.eventBus] - Event bus for cross-component communication
     * @param {boolean} [options.showToolbar=true] - Whether to show built-in toolbar
     * @param {Function} [options.onLayoutChange] - Callback when layout changes
     * @param {Function} [options.onAddWidget] - Callback for add widget action
     * @param {Function} [options.onResetLayout] - Callback for reset layout action
     * @param {Function} [options.onExport] - Callback for export action
     * @param {{resolve: Function}} [options.dataSource] - Per-tile data provider,
     *        handed to every tile. With none, the grid is the broadcast-only grid
     *        it has always been and no tile is ever asked to load anything.
     */
    constructor({ container, columns = 12, rowHeight = 80, gap = 16, eventBus = null,
                  showToolbar = true, readonly = false, onLayoutChange, onBeforeLayoutChange,
                  onAddWidget, onResetLayout, onExport,
                  // Handed down to every tile. TileBase used to import appHost() from
                  // ui/js/ecoagent/ to back Expand -> Export CSV/PNG; a grid that has
                  // no host simply gets the Blob-download fallback the host contract
                  // promises. It is not an error to have none.
                  host = null, stateGuard = null,
                  // Injected, never constructed here: the grid does not know what
                  // a binding is, only that a tile may have somewhere to ask.
                  dataSource = null }) {
        this.host = host;
        this.stateGuard = stateGuard;
        this.dataSource = dataSource;
        this.container = container;
        this.columns = columns;
        this.rowHeight = rowHeight;
        this.gap = gap;
        this.eventBus = eventBus;
        this.showToolbar = showToolbar;
        this.readonly = readonly;
        this._onLayoutChangeCallback = onLayoutChange;
        this._onBeforeLayoutChangeCallback = onBeforeLayoutChange;
        this._onAddWidgetCallback = onAddWidget;
        this._onResetLayoutCallback = onResetLayout;
        this._onExportCallback = onExport;

        /** @type {Map<string, import('./tile_base.js').TileBase>} */
        this.tiles = new Map();

        /** @type {Array<{id: string, x: number, y: number, w: number, h: number}>} */
        this.layout = [];

        /** @type {Set<string>|null} IDs of documentation cells (for "Show in Documentation" visibility) */
        this.documentationCellIds = null;

        this.gridElement = null;
        this.data = null;
        this.fullData = null;

        // Drag state
        this._dragState = null;
        this._resizeState = null;
        this._ghostElement = null;

        // Bound handlers for cleanup
        this._boundOnPointerMove = this._onPointerMove.bind(this);
        this._boundOnPointerUp = this._onPointerUp.bind(this);

        this._init();
    }

    /**
     * Initialize the grid container.
     * @private
     */
    _init() {
        // Create grid element
        this.gridElement = document.createElement('div');
        this.gridElement.className = 'tile-grid';
        this.gridElement.style.setProperty('--grid-columns', this.columns);
        this.gridElement.style.setProperty('--grid-row-height', `${this.rowHeight}px`);
        this.gridElement.style.setProperty('--grid-gap', `${this.gap}px`);

        // Add grid to container
        this.container.innerHTML = '';
        this.container.appendChild(this.gridElement);

        // Add toolbar (can be disabled for external toolbar)
        if (this.showToolbar) {
            this._buildToolbar();
        }

        // Listen for tile events
        this.gridElement.addEventListener('tile:config-request', this._onTileConfigRequest.bind(this));
        this.gridElement.addEventListener('tile:remove-request', this._onTileRemoveRequest.bind(this));

        // Global pointer events for drag/resize
        document.addEventListener('pointermove', this._boundOnPointerMove);
        document.addEventListener('pointerup', this._boundOnPointerUp);
    }

    /**
     * Build the dashboard bottom toolbar with add widget dropdown.
     * @private
     */
    _buildToolbar() {
        const toolbar = document.createElement('div');
        toolbar.className = 'tile-grid-toolbar tile-grid-toolbar--bottom';
        this._toolbarElement = toolbar;

        toolbar.innerHTML = `
            <div class="toolbar-group toolbar-group--main">
                <div class="add-widget-container">
                    <button class="toolbar-btn add-widget-btn twm-has-tooltip" data-tooltip="Add widget">
                        <span class="material-symbols-outlined">add</span>
                        <span>Add Widget</span>
                        <span class="material-symbols-outlined dropdown-arrow">expand_less</span>
                    </button>
                </div>
                <button class="toolbar-btn reset-layout-btn twm-has-tooltip" data-tooltip="Reset to default layout">
                    <span class="material-symbols-outlined">restart_alt</span>
                    <span class="btn-text">Reset</span>
                </button>
                <button class="toolbar-btn export-btn twm-has-tooltip" data-tooltip="Export report">
                    <span class="material-symbols-outlined">download</span>
                    <span class="btn-text">Export</span>
                </button>
            </div>
        `;

        // Create add-widget dropdown via ActionDropdown
        const addBtn = toolbar.querySelector('.add-widget-btn');
        const catalog = getWidgetCatalog();
        this._addWidgetDropdown = new ActionDropdown({
            trigger: addBtn,
            options: catalog.map(w => ({ type: w.type, label: w.title, icon: w.icon, description: w.description })),
            onSelect: (opt) => this._addWidgetFromDropdown(opt.type),
            className: 'add-widget-dropdown-menu'
        });

        toolbar.querySelector('.reset-layout-btn')?.addEventListener('click', () => this._resetLayout());
        toolbar.querySelector('.export-btn')?.addEventListener('click', () => this._exportReport());

        // Insert after grid element (at bottom)
        this.container.appendChild(toolbar);
    }

    /**
     * Add a widget from the dropdown selection.
     * @param {string} type - Widget type
     * @private
     */
    _addWidgetFromDropdown(type) {
        import('./tile_registry.js').then(({ getWidget }) => {
            const WidgetClass = getWidget(type);
            if (WidgetClass) {
                const size = WidgetClass.DEFAULT_SIZE || { w: 4, h: 3 };
                const pos = this.findNextPosition(size.w, size.h);
                this.addTile(type, { ...pos, ...size });
            }
        });
    }

    /**
     * Add a tile to the grid.
     * @param {string} type - Widget type
     * @param {Object} position - Grid position {x, y, w, h}
     * @param {Object} [config] - Widget configuration
     * @param {string} [id] - Optional tile ID (generated if not provided)
     * @returns {import('./tile_base.js').TileBase | null} The created tile or null
     */
    addTile(type, position, config = {}, id = null) {
        const tileId = id || `tile-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

        const tile = createWidget(type, {
            id: tileId,
            grid: this,
            eventBus: this.eventBus,
            config,
            readonly: this.readonly,
            host: this.host,
            stateGuard: this.stateGuard,
            dataSource: this.dataSource,
        });

        if (!tile) return null;

        // Add to layout
        const layoutEntry = {
            id: tileId,
            type,
            x: position.x,
            y: position.y,
            w: position.w,
            h: position.h,
            config
        };
        this.layout.push(layoutEntry);

        // Store tile instance
        this.tiles.set(tileId, tile);

        // Mount to grid
        tile.mount(this.gridElement);
        this._applyTilePosition(tile, layoutEntry);

        // Setup drag handles
        this._setupTileDragHandlers(tile);

        // Render with current data if available
        if (this.data) {
            tile.fullData = this.fullData;
            tile.update(this.data);
        } else if (this.dataSource) {
            // A tile that fetches its own rows is never handed any, so the branch
            // above cannot fire for it and it would mount empty and stay empty
            // until something else happened to it. NOT awaited: `setLayout` calls
            // `addTile` in a loop, and awaiting here would serialise a board into
            // one request per tile in sequence — the opposite of what a batching
            // data source exists to do.
            tile.loadData?.();
        }

        // Emit layout changed
        this._emitLayoutChanged();

        return tile;
    }

    /**
     * Remove a tile from the grid.
     * @param {string} tileId - Tile ID to remove
     */
    removeTile(tileId) {
        const tile = this.tiles.get(tileId);
        if (!tile) return;

        tile.dispose();
        this.tiles.delete(tileId);

        // Remove from layout
        this.layout = this.layout.filter(l => l.id !== tileId);

        this._emitLayoutChanged();
    }

    /**
     * Update all tiles with new data.
     * @param {Object} data - Analytics data
     */
    setData(data) {
        this.data = data;
        this.tiles.forEach(tile => {
            tile.fullData = this.fullData;
            tile.update(data);
        });
    }

    /**
     * Ask every self-fetching tile to load again, bypassing whatever the data
     * source has cached.
     *
     * The counterpart of `setData` for the pull model: `setData` is how a caller
     * with one dataset for the whole board pushes it, and this is how a caller
     * whose tiles each own a query says "that underlying data changed". Passing
     * `ids` narrows it to the tiles a change actually touched, which is what an
     * invalidation carrying a table id can work out and a broadcast cannot.
     *
     * Not awaited and returns nothing: the tiles render themselves as their own
     * requests land, and a caller that waited for all of them would be waiting on
     * the slowest tile to show the fastest one.
     *
     * @param {string[]|Set<string>|null} [ids] - Tile ids, or null for all.
     */
    reloadAll(ids = null) {
        if (!this.dataSource) return;
        const wanted = ids ? new Set(ids) : null;
        this.tiles.forEach((tile, tileId) => {
            if (wanted && !wanted.has(tileId)) return;
            tile.loadData?.({ force: true });
        });
    }

    /**
     * Get current layout.
     * @returns {Array} Layout array
     */
    getLayout() {
        return this.layout.map(l => ({
            id: l.id,
            type: l.type,
            x: l.x,
            y: l.y,
            w: l.w,
            h: l.h,
            config: this.tiles.get(l.id)?.config || l.config
        }));
    }

    /**
     * Set layout and rebuild tiles.
     * @param {Array|Object} layout - Layout array or object with tiles property
     */
    setLayout(layout) {
        // Clear existing tiles
        this.tiles.forEach(tile => tile.dispose());
        this.tiles.clear();
        this.layout = [];

        // Clear grid content (keep toolbar)
        this.gridElement.innerHTML = '';

        // Handle both array and object with tiles property
        const tilesArray = Array.isArray(layout) ? layout : (layout?.tiles || []);

        // Rebuild from layout
        tilesArray.forEach(item => {
            this.addTile(item.type, {
                x: item.x,
                y: item.y,
                w: item.w,
                h: item.h
            }, item.config, item.id);
        });
    }

    /**
     * Apply CSS grid position to a tile element.
     * @param {import('./tile_base.js').TileBase} tile
     * @param {{x: number, y: number, w: number, h: number}} position
     * @private
     */
    _applyTilePosition(tile, position) {
        if (!tile.element) return;

        tile.element.style.gridColumn = `${position.x + 1} / span ${position.w}`;
        tile.element.style.gridRow = `${position.y + 1} / span ${position.h}`;
    }

    /**
     * Setup drag and resize handlers for a tile.
     * @param {import('./tile_base.js').TileBase} tile
     * @private
     */
    _setupTileDragHandlers(tile) {
        if (!tile.element || this.readonly) return;

        const dragHandle = tile.element.querySelector('.tile-drag-handle');
        const resizeHandle = tile.element.querySelector('.tile-resize-handle');

        // Drag handle
        if (dragHandle) {
            dragHandle.addEventListener('pointerdown', (e) => this._onDragStart(tile, e));
        }

        // Resize handle
        if (resizeHandle) {
            resizeHandle.addEventListener('pointerdown', (e) => this._onResizeStart(tile, e));
        }
    }

    /**
     * Handle drag start.
     * @param {import('./tile_base.js').TileBase} tile
     * @param {PointerEvent} e
     * @private
     */
    _onDragStart(tile, e) {
        e.preventDefault();
        e.stopPropagation();

        const rect = tile.element.getBoundingClientRect();
        const gridRect = this.gridElement.getBoundingClientRect();

        const layoutItem = this.layout.find(l => l.id === tile.id);
        if (!layoutItem) return;

        // Notify before mutation so caller can snapshot current state
        this._emitBeforeLayoutChange();

        this._dragState = {
            tile,
            tileId: tile.id,
            startX: e.clientX,
            startY: e.clientY,
            startGridX: layoutItem.x,
            startGridY: layoutItem.y,
            tileRect: rect,
            gridRect,
            w: layoutItem.w,
            h: layoutItem.h
        };

        tile.element.classList.add('dragging');

        // Create ghost element
        this._createGhost(rect);
    }

    /**
     * Handle resize start.
     * @param {import('./tile_base.js').TileBase} tile
     * @param {PointerEvent} e
     * @private
     */
    _onResizeStart(tile, e) {
        e.preventDefault();
        e.stopPropagation();

        const layoutItem = this.layout.find(l => l.id === tile.id);
        if (!layoutItem) return;

        const gridRect = this.gridElement.getBoundingClientRect();
        const cellWidth = (gridRect.width - (this.columns - 1) * this.gap) / this.columns;

        // Notify before mutation so caller can snapshot current state
        this._emitBeforeLayoutChange();

        this._resizeState = {
            tile,
            tileId: tile.id,
            startX: e.clientX,
            startY: e.clientY,
            startW: layoutItem.w,
            startH: layoutItem.h,
            gridRect,
            cellWidth,
            x: layoutItem.x,
            y: layoutItem.y
        };

        tile.element.classList.add('resizing');
    }

    /**
     * Handle pointer move (drag/resize).
     * @param {PointerEvent} e
     * @private
     */
    _onPointerMove(e) {
        if (this._dragState) {
            this._onDragMove(e);
        } else if (this._resizeState) {
            this._onResizeMove(e);
        }
    }

    /**
     * Handle drag move.
     * @param {PointerEvent} e
     * @private
     */
    _onDragMove(e) {
        const state = this._dragState;
        if (!state) return;

        const dx = e.clientX - state.startX;
        const dy = e.clientY - state.startY;

        // Calculate cell dimensions
        const gridRect = state.gridRect;
        const cellWidth = (gridRect.width - (this.columns - 1) * this.gap) / this.columns;
        const cellHeight = this.rowHeight;

        // Calculate new grid position
        const deltaGridX = Math.round(dx / (cellWidth + this.gap));
        const deltaGridY = Math.round(dy / (cellHeight + this.gap));

        let newX = state.startGridX + deltaGridX;
        let newY = state.startGridY + deltaGridY;

        // Clamp to grid bounds
        newX = Math.max(0, Math.min(newX, this.columns - state.w));
        newY = Math.max(0, newY);

        // Update ghost position
        if (this._ghostElement) {
            const ghostLeft = newX * (cellWidth + this.gap);
            const ghostTop = newY * (cellHeight + this.gap);
            this._ghostElement.style.transform = `translate(${ghostLeft}px, ${ghostTop}px)`;
            this._ghostElement.style.width = `${state.w * cellWidth + (state.w - 1) * this.gap}px`;
            this._ghostElement.style.height = `${state.h * cellHeight + (state.h - 1) * this.gap}px`;
        }

        // Store pending position
        state.pendingX = newX;
        state.pendingY = newY;
    }

    /**
     * Handle resize move.
     * @param {PointerEvent} e
     * @private
     */
    _onResizeMove(e) {
        const state = this._resizeState;
        if (!state) return;

        const dx = e.clientX - state.startX;
        const dy = e.clientY - state.startY;

        // Calculate new size in grid cells
        const deltaW = Math.round(dx / (state.cellWidth + this.gap));
        const deltaH = Math.round(dy / (this.rowHeight + this.gap));

        let newW = state.startW + deltaW;
        let newH = state.startH + deltaH;

        // Get constraints
        const tileClass = state.tile.constructor;
        const constraints = tileClass.SIZE_CONSTRAINTS || { minW: 2, minH: 2, maxW: 12, maxH: 8 };

        // Apply constraints
        newW = Math.max(constraints.minW, Math.min(newW, constraints.maxW));
        newH = Math.max(constraints.minH, Math.min(newH, constraints.maxH));

        // Don't exceed grid width
        newW = Math.min(newW, this.columns - state.x);

        // Live update tile size
        state.tile.element.style.gridColumn = `${state.x + 1} / span ${newW}`;
        state.tile.element.style.gridRow = `${state.y + 1} / span ${newH}`;

        state.pendingW = newW;
        state.pendingH = newH;
    }

    /**
     * Handle pointer up (end drag/resize).
     * @param {PointerEvent} e
     * @private
     */
    _onPointerUp(e) {
        if (this._dragState) {
            this._onDragEnd();
        } else if (this._resizeState) {
            this._onResizeEnd();
        }
    }

    /**
     * Handle drag end.
     * @private
     */
    _onDragEnd() {
        const state = this._dragState;
        if (!state) return;

        state.tile.element.classList.remove('dragging');
        this._removeGhost();

        // Update layout if position changed
        if (state.pendingX !== undefined && state.pendingY !== undefined) {
            const layoutItem = this.layout.find(l => l.id === state.tileId);
            if (layoutItem) {
                layoutItem.x = state.pendingX;
                layoutItem.y = state.pendingY;
                this._applyTilePosition(state.tile, layoutItem);

                // Resolve overlaps - push other tiles down
                this._resolveOverlaps(state.tileId);

                this._emitLayoutChanged();
            }
        }

        this._dragState = null;
    }

    /**
     * Handle resize end.
     * @private
     */
    _onResizeEnd() {
        const state = this._resizeState;
        if (!state) return;

        state.tile.element.classList.remove('resizing');

        // Update layout if size changed
        if (state.pendingW !== undefined && state.pendingH !== undefined) {
            const layoutItem = this.layout.find(l => l.id === state.tileId);
            if (layoutItem) {
                layoutItem.w = state.pendingW;
                layoutItem.h = state.pendingH;

                // Resolve overlaps - push other tiles down
                this._resolveOverlaps(state.tileId);

                this._emitLayoutChanged();

                // Re-render tile content for new size
                if (this.data) {
                    state.tile.fullData = this.fullData;
                    state.tile.update(this.data);
                } else if (this.dataSource) {
                    // Re-rendering from a dataset already in hand is free; asking
                    // the server again because a tile got 40 px wider is not. A
                    // self-fetching tile is told the geometry settled and decides
                    // what that costs it — for a chart, one `Plotly.Plots.resize`.
                    state.tile.onResize?.();
                }
            }
        }

        this._resizeState = null;
    }

    /**
     * Check if two layout items overlap.
     * @param {Object} a - First layout item {x, y, w, h}
     * @param {Object} b - Second layout item {x, y, w, h}
     * @returns {boolean}
     * @private
     */
    _tilesOverlap(a, b) {
        return !(
            a.x + a.w <= b.x ||
            b.x + b.w <= a.x ||
            a.y + a.h <= b.y ||
            b.y + b.h <= a.y
        );
    }

    /**
     * Resolve overlaps by pushing tiles down.
     * @param {string} sourceTileId - The tile that was resized/moved
     * @private
     */
    _resolveOverlaps(sourceTileId) {
        const sourceItem = this.layout.find(l => l.id === sourceTileId);
        if (!sourceItem) return;

        // Sort tiles by y position (top to bottom), then by x
        const otherTiles = this.layout
            .filter(l => l.id !== sourceTileId)
            .sort((a, b) => a.y - b.y || a.x - b.x);

        let hasChanges = true;
        let iterations = 0;
        const maxIterations = 100; // Prevent infinite loops

        while (hasChanges && iterations < maxIterations) {
            hasChanges = false;
            iterations++;

            for (const item of otherTiles) {
                if (this._tilesOverlap(sourceItem, item)) {
                    // Push this tile down to be below the source tile
                    const newY = sourceItem.y + sourceItem.h;
                    if (item.y !== newY) {
                        item.y = newY;
                        hasChanges = true;

                        // Apply the new position visually
                        const tile = this.tiles.get(item.id);
                        if (tile) {
                            this._applyTilePosition(tile, item);
                        }
                    }
                }
            }

            // Check for cascading overlaps among the moved tiles
            for (let i = 0; i < otherTiles.length; i++) {
                for (let j = i + 1; j < otherTiles.length; j++) {
                    if (this._tilesOverlap(otherTiles[i], otherTiles[j])) {
                        // Push the lower-index tile (earlier in sort order) doesn't need to move
                        // Push the higher one down
                        const pusher = otherTiles[i];
                        const pushed = otherTiles[j];
                        const newY = pusher.y + pusher.h;
                        if (pushed.y < newY && this._tilesOverlap(pusher, pushed)) {
                            pushed.y = newY;
                            hasChanges = true;

                            const tile = this.tiles.get(pushed.id);
                            if (tile) {
                                this._applyTilePosition(tile, pushed);
                            }
                        }
                    }
                }
            }
        }

        // Compact the layout - remove vertical gaps
        this._compactLayout();
    }

    /**
     * Compact the layout by removing vertical gaps.
     * @private
     */
    _compactLayout() {
        // Sort tiles by y position
        const sortedTiles = [...this.layout].sort((a, b) => a.y - b.y || a.x - b.x);

        for (const item of sortedTiles) {
            // Try to move up as far as possible
            let newY = 0;

            while (newY < item.y) {
                const testPosition = { ...item, y: newY };

                // Check for overlaps with tiles above this one
                let hasOverlap = false;
                for (const other of this.layout) {
                    if (other.id === item.id) continue;
                    if (this._tilesOverlap(testPosition, other)) {
                        hasOverlap = true;
                        // Move below this overlapping tile
                        newY = other.y + other.h;
                        break;
                    }
                }

                if (!hasOverlap) {
                    break;
                }
            }

            if (newY < item.y) {
                item.y = newY;
                const tile = this.tiles.get(item.id);
                if (tile) {
                    this._applyTilePosition(tile, item);
                }
            }
        }
    }

    /**
     * Create ghost element for drag preview.
     * @param {DOMRect} rect - Original tile rect
     * @private
     */
    _createGhost(rect) {
        this._ghostElement = document.createElement('div');
        this._ghostElement.className = 'tile-ghost';
        this.gridElement.appendChild(this._ghostElement);
    }

    /**
     * Remove ghost element.
     * @private
     */
    _removeGhost() {
        if (this._ghostElement) {
            this._ghostElement.remove();
            this._ghostElement = null;
        }
    }

    /**
     * Find next available position for a new tile.
     * @param {number} w - Width in cells
     * @param {number} h - Height in cells
     * @returns {{x: number, y: number}}
     */
    findNextPosition(w, h) {
        // Build occupancy grid
        const maxY = Math.max(...this.layout.map(l => l.y + l.h), 0);
        const occupied = new Set();

        this.layout.forEach(l => {
            for (let x = l.x; x < l.x + l.w; x++) {
                for (let y = l.y; y < l.y + l.h; y++) {
                    occupied.add(`${x},${y}`);
                }
            }
        });

        // Find first available position
        for (let y = 0; y <= maxY + 1; y++) {
            for (let x = 0; x <= this.columns - w; x++) {
                let fits = true;
                for (let dx = 0; dx < w && fits; dx++) {
                    for (let dy = 0; dy < h && fits; dy++) {
                        if (occupied.has(`${x + dx},${y + dy}`)) {
                            fits = false;
                        }
                    }
                }
                if (fits) {
                    return { x, y };
                }
            }
        }

        // Default: place at bottom
        return { x: 0, y: maxY + 1 };
    }

    /**
     * Handle tile config request.
     * @param {CustomEvent} e
     * @private
     */
    _onTileConfigRequest(e) {
        const { tileId, tileType, config, schema } = e.detail;
        this.eventBus?.emit?.('grid:config-modal-show', {
            tileId,
            tileType,
            config,
            schema,
            variables: this.data ? this._getVariableList() : [],
            onSave: (newConfig) => {
                const tile = this.tiles.get(tileId);
                if (tile) {
                    tile.fullData = this.fullData;
                    tile.update(this.data, newConfig);
                    // A saved config is usually a changed BINDING, and the data
                    // source's cache is keyed by the old one — so this is the one
                    // reload that must not be served from it.
                    if (this.dataSource) tile.loadData?.({ force: true });
                    // Update layout config
                    const layoutItem = this.layout.find(l => l.id === tileId);
                    if (layoutItem) {
                        layoutItem.config = newConfig;
                    }
                    this._emitLayoutChanged();
                }
            }
        });
    }

    /**
     * Handle tile remove request.
     * Note: Let the event bubble up to the dashboard which handles confirmation.
     * @param {CustomEvent} e
     * @private
     */
    _onTileRemoveRequest(e) {
        // Don't auto-remove - let event bubble up to dashboard
        // Dashboard shows a confirm dialog before calling removeTile()
        // Do NOT stop propagation - dashboard listener needs to receive this event
    }

    /**
     * Get list of available variables from data.
     * @returns {Array<{value: string, label: string}>}
     * @private
     */
    _getVariableList() {
        if (!this.data) return [];

        const variables = [];
        if (this.data.stocks) {
            Object.keys(this.data.stocks).forEach(name => {
                variables.push({ value: name, label: name });
            });
        }
        if (this.data.indicators) {
            Object.keys(this.data.indicators).forEach(name => {
                variables.push({ value: name, label: name });
            });
        }
        return variables;
    }

    /**
     * Show add widget menu.
     * @private
     */
    _showAddWidgetMenu() {
        this.eventBus?.emit?.('grid:add-widget-menu-show', {
            onSelect: (type) => {
                const { getWidget } = require('./tile_registry.js');
                const WidgetClass = getWidget(type);
                if (WidgetClass) {
                    const size = WidgetClass.DEFAULT_SIZE || { w: 4, h: 3 };
                    const pos = this.findNextPosition(size.w, size.h);
                    this.addTile(type, { ...pos, ...size });
                }
            }
        });
    }

    /**
     * Reset to default layout.
     * @private
     */
    _resetLayout() {
        this.eventBus?.emit?.('grid:reset-layout-confirm', {
            onConfirm: () => {
                this.eventBus?.emit?.('grid:layout-reset-requested');
            }
        });
    }

    /**
     * Export report.
     * @private
     */
    _exportReport() {
        this.eventBus?.emit?.('grid:export-requested', {
            gridElement: this.gridElement,
            layout: this.getLayout()
        });
    }

    /**
     * Notify that a layout mutation is about to begin (drag/resize start).
     * @private
     */
    _emitBeforeLayoutChange() {
        if (typeof this._onBeforeLayoutChangeCallback === 'function') {
            this._onBeforeLayoutChangeCallback(this.getLayout());
        }
    }

    /**
     * Emit layout changed event and call the onLayoutChange callback.
     * @private
     */
    _emitLayoutChanged() {
        const layout = this.getLayout();
        this.eventBus?.emit?.('grid:layout-changed', { layout });

        // Call the callback if provided (used by ResultsTileDashboard for autosave)
        if (typeof this._onLayoutChangeCallback === 'function') {
            this._onLayoutChangeCallback(layout);
        }
    }

    /**
     * Clean up resources.
     */
    dispose() {
        document.removeEventListener('pointermove', this._boundOnPointerMove);
        document.removeEventListener('pointerup', this._boundOnPointerUp);

        this._addWidgetDropdown?.destroy();
        this._addWidgetDropdown = null;

        this.tiles.forEach(tile => tile.dispose());
        this.tiles.clear();
        this.layout = [];

        if (this.gridElement) {
            this.gridElement.remove();
            this.gridElement = null;
        }
    }
}

export default TileGrid;
