/**
 * tile_base.js
 *
 * Base class for all dashboard widget tiles.
 * Provides common lifecycle management, tile chrome (header, config button),
 * and abstract methods for subclass implementation.
 */

import { openRawTracesWindow } from '../charts/plot_popout_window.js';
import { formatVariableLabel } from './config_schema.js';
// The host is INJECTED, not fetched from a global.
//
// This imported `appHost()` from ui/js/ecoagent/app_host.js — a tile reaching into
// the application to find out how to save a file. The framework is injection-only;
// the app may have a root host provider, but the library does not get to know about
// it. Its only use was to back "Expand" -> Export CSV/PNG, and a tile without a host
// falls back to a Blob download, which is exactly what the host contract promises.

export class TileBase {
    /** @type {string} Widget type identifier - override in subclass */
    static TYPE = 'base';

    /** @type {string} Display title - override in subclass */
    static TITLE = 'Widget';

    /** @type {{w: number, h: number}} Default grid size - override in subclass */
    static DEFAULT_SIZE = { w: 4, h: 3 };

    /** @type {{minW: number, minH: number, maxW: number, maxH: number}} Size constraints */
    static SIZE_CONSTRAINTS = { minW: 2, minH: 2, maxW: 12, maxH: 8 };

    /** @type {boolean} Whether widget can be expanded to a separate window - override in subclass */
    static EXPANDABLE = false;

    /** @type {boolean} Whether widget supports scenario comparison overlay - override in subclass */
    static SUPPORTS_COMPARISON = false;

    /**
     * @param {Object} options
     * @param {string} options.id - Unique tile identifier
     * @param {Object} options.grid - Parent TileGrid instance
     * @param {Object} [options.eventBus] - Event bus for cross-component communication
     * @param {Object} [options.config] - Widget-specific configuration
     * @param {boolean} [options.headless] - If true, mount without tile chrome (header, controls)
     */
    constructor({ id, grid, eventBus = null, config = {}, readonly = false,
                  headless = false, host = null, stateGuard = null }) {
        this.host = host;
        // `window.__ECOSIM_JS_NEW__?.stateGuard` — an application's global, reached for
        // by a tile. The StateGuard is a FRAMEWORK service (@flexdesk/core); the INSTANCE is
        // the application's, and it is handed down through the grid. No guard => the
        // dataset writes happen directly, which is what the optional chain already did.
        this.stateGuard = stateGuard;
        this.id = id;
        this.grid = grid;
        this.eventBus = eventBus;
        this.config = { ...this.getDefaultConfig(), ...config };
        this.readonly = readonly;
        this.headless = headless;
        this.element = null;
        this.contentElement = null;
        this.chartInstance = null;
        this.data = null;
        /** @type {Object|null} Unfiltered analytics data for cross-namespace variable resolution */
        this.fullData = null;
        this._disposed = false;
        /** @type {Map<string, {name: string, analytics: Object, color: string}>|null} */
        this.comparisonData = null;
    }

    /**
     * Set comparison data for overlay rendering.
     * Only meaningful for widgets where SUPPORTS_COMPARISON = true.
     * @param {Map<string, Object>|null} comparisonData
     */
    setComparisonData(comparisonData) {
        this.comparisonData = comparisonData;
        if (this.data && this.contentElement) {
            this.render(this.data);
        }
    }

    /**
     * Format a raw analytics variable key into a user-friendly display label.
     * Strips namespace prefixes, internal Godley patterns, and stock type suffixes.
     * @param {string} name - Raw variable key
     * @returns {string} Friendly display label
     */
    formatLabel(name) {
        return formatVariableLabel(name);
    }

    /**
     * Look up the unit string for a variable from analytics metadata.
     * Checks stocks, flows, and indicators for unit metadata.
     * @param {string} varName - Variable name
     * @returns {string|null} Unit string or null
     */
    getVariableUnit(varName) {
        if (!varName || !this.data) return null;
        const sources = [this.data.stocks, this.data.flows, this.data.indicators];
        for (const source of sources) {
            const varData = source?.[varName];
            if (varData?.unit) return varData.unit;
        }
        return null;
    }

    /**
     * Look up a variable across stocks, flows, and indicators.
     * If the variable is not found, returns the first available variable
     * and updates the config key so the widget self-heals.
     * @param {Object} data - Analytics data
     * @param {string} configKey - Config property name (e.g. 'variable', 'xVariable')
     * @returns {{varData: any, varName: string}|null} Resolved data or null if no data at all
     */
    resolveVariable(data, configKey = 'variable') {
        const varName = this.config[configKey];
        if (varName) {
            // Try exact name first
            const varData = data.stocks?.[varName]
                || data.indicators?.[varName]
                || data.flows?.[varName];
            if (varData) return { varData, varName };

            // Try without namespace prefix (e.g. "Population.population" → "population")
            const dotIdx = varName.indexOf('.');
            if (dotIdx >= 0) {
                const bare = varName.slice(dotIdx + 1);
                const bareData = data.stocks?.[bare]
                    || data.indicators?.[bare]
                    || data.flows?.[bare];
                if (bareData) return { varData: bareData, varName: bare };
            }

            // Reverse lookup: bare name → namespace-prefixed key
            // e.g. "population" matches "Population.population" in MC data
            if (dotIdx < 0) {
                const suffix = `.${varName}`;
                for (const source of [data.stocks, data.indicators, data.flows]) {
                    if (!source) continue;
                    const match = Object.keys(source).find(k => k.endsWith(suffix));
                    if (match) return { varData: source[match], varName: match };
                }
            }

            // Try unfiltered data (variable may be in a different namespace)
            if (this.fullData && this.fullData !== data) {
                const fullVarData = this.fullData.stocks?.[varName]
                    || this.fullData.indicators?.[varName]
                    || this.fullData.flows?.[varName];
                if (fullVarData) return { varData: fullVarData, varName };

                // Also try bare name against unfiltered data
                if (dotIdx >= 0) {
                    const bare = varName.slice(dotIdx + 1);
                    const fullBareData = this.fullData.stocks?.[bare]
                        || this.fullData.indicators?.[bare]
                        || this.fullData.flows?.[bare];
                    if (fullBareData) return { varData: fullBareData, varName: bare };
                }

                // Reverse lookup against unfiltered data
                if (dotIdx < 0) {
                    const suffix = `.${varName}`;
                    for (const source of [this.fullData.stocks, this.fullData.indicators, this.fullData.flows]) {
                        if (!source) continue;
                        const match = Object.keys(source).find(k => k.endsWith(suffix));
                        if (match) return { varData: source[match], varName: match };
                    }
                }
            }
        }

        // Configured variable not found — auto-select the first available
        const sources = [data.stocks, data.indicators, data.flows];
        for (const source of sources) {
            if (!source) continue;
            const keys = Object.keys(source);
            if (keys.length > 0) {
                this.config[configKey] = keys[0];
                return { varData: source[keys[0]], varName: keys[0] };
            }
        }

        return null;
    }

    /**
     * Find a variable by name in data, trying exact match then suffix match.
     * Does NOT auto-fallback to first available variable.
     * @param {Object} data - Analytics data with stocks/indicators/flows
     * @param {string} varName - Variable name (bare or namespace-prefixed)
     * @returns {{varData: any, varName: string}|null}
     */
    static findVariable(data, varName) {
        if (!data || !varName) return null;
        for (const source of [data.stocks, data.indicators, data.flows]) {
            if (!source) continue;
            if (source[varName]) return { varData: source[varName], varName };
        }
        // Reverse lookup: bare "population" → "Population.population"
        const dotIdx = varName.indexOf('.');
        if (dotIdx < 0) {
            const suffix = `.${varName}`;
            for (const source of [data.stocks, data.indicators, data.flows]) {
                if (!source) continue;
                const match = Object.keys(source).find(k => k.endsWith(suffix));
                if (match) return { varData: source[match], varName: match };
            }
        } else {
            // Strip prefix: "Population.population" → "population"
            const bare = varName.slice(dotIdx + 1);
            for (const source of [data.stocks, data.indicators, data.flows]) {
                if (!source) continue;
                if (source[bare]) return { varData: source[bare], varName: bare };
            }
        }
        return null;
    }

    /**
     * Get default configuration for this widget type.
     * Override in subclass.
     * @returns {Object} Default config object
     */
    getDefaultConfig() {
        return {};
    }

    /**
     * Get configuration schema for the config modal.
     * Override in subclass.
     * @returns {Object} Schema definition
     */
    getConfigSchema() {
        return { fields: [] };
    }

    /**
     * Render widget content with data.
     * Override in subclass.
     * @param {Object} data - Analytics data
     */
    render(data) {
        throw new Error('TileBase.render() must be implemented by subclass');
    }

    /**
     * Mount the tile into the container.
     * @param {HTMLElement} container - Parent container
     */
    mount(container) {
        if (this._disposed) return;

        this.element = document.createElement('div');
        this.element.className = `tile${this.readonly ? ' tile--readonly' : ''}`;

        // Use StateGuard bypass if available to set dataset properties
        const stateGuard = this.stateGuard;
        const setDataset = () => {
            this.element.dataset.tileId = this.id;
            this.element.dataset.tileType = this.constructor.TYPE;
        };
        if (stateGuard?.executeWithBypass) {
            stateGuard.executeWithBypass('tile-mount', setDataset);
        } else {
            setDataset();
        }

        if (this.headless) {
            // Headless mode: content only, no header/controls (for embedding in notebook cells)
            this.contentElement = document.createElement('div');
            this.contentElement.className = 'tile-content';
            this.element.appendChild(this.contentElement);
        } else {
            // Build tile chrome (header + content area)
            this._buildChrome();
        }

        container.appendChild(this.element);
    }

    /**
     * Update the widget with new data and/or config.
     * @param {Object} [data] - New analytics data
     * @param {Object} [config] - New config values to merge
     */
    update(data, config) {
        if (this._disposed) return;

        if (config) {
            const prevDocs = (this.config?.docs || '').trim();
            this.config = { ...this.config, ...config };
            const nextDocs = (this.config?.docs || '').trim();
            // Keep the header's info-button in sync with the docs state
            if (this.element && !this.headless && prevDocs !== nextDocs) {
                this._syncInfoButton();
            }
        }

        if (data !== undefined) {
            this.data = data;
        }

        if (this.data && this.contentElement) {
            this.render(this.data);
        }
    }

    /** Add, update, or remove the info (ⓘ) button in the header to match current docs state. */
    _syncInfoButton() {
        const header = this.element?.querySelector('.tile-header');
        const controls = header?.querySelector('.tile-controls');
        if (!controls) return;
        const docs = (this.config?.docs || '').trim();
        let btn = controls.querySelector('.tile-info-btn');
        if (docs) {
            if (!btn) {
                btn = document.createElement('button');
                btn.className = 'tile-info-btn twm-has-tooltip';
                btn.type = 'button';
                btn.tabIndex = -1;
                btn.style.cssText = 'background:transparent;border:none;padding:2px;color:rgba(255,255,255,0.55);cursor:help;display:inline-flex;align-items:center;justify-content:center;';
                btn.setAttribute('data-tooltip-placement', 'bottom');
                btn.setAttribute('data-tooltip-max-width', '420px');
                btn.innerHTML = '<span class="material-symbols-outlined" style="font-size:18px;">info</span>';
                btn.addEventListener('click', (e) => e.stopPropagation());
                const anchor = controls.querySelector('.tile-expand-btn')
                             ?? controls.querySelector('.tile-remove-btn');
                if (anchor) controls.insertBefore(btn, anchor);
                else controls.appendChild(btn);
            }
            btn.setAttribute('data-tooltip', docs);
        } else if (btn) {
            btn.remove();
        }
    }

    /**
     * Clean up resources and remove from DOM.
     */
    dispose() {
        if (this._disposed) return;
        this._disposed = true;

        // Close expand window if open
        if (this._expandWindow?.isVisible) {
            this._expandWindow.close();
        }
        this._expandWindow = null;

        // Destroy chart instance if exists
        if (this.chartInstance) {
            this.chartInstance.destroy();
            this.chartInstance = null;
        }

        // Remove from DOM
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }

        this.element = null;
        this.contentElement = null;
        this.data = null;
        this.fullData = null;
    }

    /**
     * Build the tile chrome (header, content area, resize handles).
     * @private
     */
    _buildChrome() {
        // Header with drag handle and controls
        const header = document.createElement('div');
        header.className = 'tile-header';

        // Build controls HTML - expand button only if widget is expandable
        const expandBtnHtml = this.constructor.EXPANDABLE
            ? `<button class="tile-expand-btn twm-has-tooltip" data-tooltip="Open in window">
                   <span class="material-symbols-outlined">open_in_new</span>
               </button>`
            : '';

        // Info button — only shown if config.docs has text.  Uses the
        // standard has-tooltip system so the docs appear as a hover tooltip
        // (auto-positioned) instead of a click-to-open popover.
        const docs = (this.config?.docs || '').trim();
        const infoBtnHtml = docs
            ? `<button class="tile-info-btn twm-has-tooltip" type="button" tabindex="-1"
                       data-tooltip="${this.#escapeAttr(docs)}"
                       data-tooltip-placement="bottom"
                       data-tooltip-max-width="420px"
                       style="background:transparent;border:none;padding:2px;color:rgba(255,255,255,0.55);cursor:help;display:inline-flex;align-items:center;justify-content:center;">
                   <span class="material-symbols-outlined" style="font-size:18px;">info</span>
               </button>`
            : '';

        if (this.readonly) {
            // Read-only mode: no drag handle, no menu, no remove button
            header.innerHTML = `
                <span class="tile-title">${this.constructor.TITLE}</span>
                <div class="tile-controls">
                    ${infoBtnHtml}
                    ${expandBtnHtml}
                </div>
            `;
        } else {
            header.innerHTML = `
                <span class="tile-drag-handle twm-has-tooltip" data-tooltip="Drag to reposition">
                    <span class="material-symbols-outlined">drag_indicator</span>
                </span>
                <span class="tile-title">${this.constructor.TITLE}</span>
                <div class="tile-controls">
                    <button class="tile-config-btn twm-has-tooltip" data-tooltip="Configure">
                        <span class="material-symbols-outlined">settings</span>
                    </button>
                    <div class="tile-menu-wrapper">
                        <button class="tile-menu-btn twm-has-tooltip" data-tooltip="More actions">
                            <span class="material-symbols-outlined">more_vert</span>
                        </button>
                        <div class="tile-menu-dropdown" hidden>
                            <button class="tile-menu-item" data-action="add-to-documentation" style="${this.config?.sourceCellId && this.grid?.documentationCellIds?.has(this.config.sourceCellId) ? 'display:none' : ''}">
                                <span class="material-symbols-outlined">post_add</span>
                                <span>Add to Documentation</span>
                            </button>
                            <button class="tile-menu-item" data-action="show-in-documentation" style="${this.config?.sourceCellId && this.grid?.documentationCellIds?.has(this.config.sourceCellId) ? '' : 'display:none'}">
                                <span class="material-symbols-outlined">description</span>
                                <span>Show in Documentation</span>
                            </button>
                        </div>
                    </div>
                    ${infoBtnHtml}
                    ${expandBtnHtml}
                    <button class="tile-remove-btn twm-has-tooltip" data-tooltip="Remove widget">
                        <span class="material-symbols-outlined">close</span>
                    </button>
                </div>
            `;
        }

        // Expand button handler
        const expandBtn = header.querySelector('.tile-expand-btn');
        expandBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._onExpandClick();
        });

        // Info button is purely decorative — the docs are shown by the global
        // tooltip service via data-tooltip.  Stop click-propagation so clicks
        // don't open the config panel, and make the button unfocusable.
        const infoBtn = header.querySelector('.tile-info-btn');
        infoBtn?.addEventListener('click', (e) => e.stopPropagation());

        if (!this.readonly) {
            // Config opens ONLY via the explicit cogwheel button — not a
            // title or content click, which fired the config panel too
            // eagerly (e.g. when you just wanted to read or pan the chart).
            const configBtn = header.querySelector('.tile-config-btn');
            configBtn?.addEventListener('click', (e) => {
                e.stopPropagation();
                this._onConfigClick();
            });

            // "..." menu button + dropdown
            const menuBtn = header.querySelector('.tile-menu-btn');
            const menuDropdown = header.querySelector('.tile-menu-dropdown');
            if (menuBtn && menuDropdown) {
                menuBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const isOpen = !menuDropdown.hidden;
                    menuDropdown.hidden = !menuDropdown.hidden;
                    if (!isOpen) {
                        // Close on outside click
                        const closeMenu = (ev) => {
                            if (!menuDropdown.contains(ev.target) && ev.target !== menuBtn) {
                                menuDropdown.hidden = true;
                                document.removeEventListener('pointerdown', closeMenu, true);
                            }
                        };
                        // Delay to avoid immediate close from the same click
                        requestAnimationFrame(() => {
                            document.addEventListener('pointerdown', closeMenu, true);
                        });
                    }
                });
                menuDropdown.querySelector('[data-action="add-to-documentation"]')?.addEventListener('click', (e) => {
                    e.stopPropagation();
                    menuDropdown.hidden = true;
                    this.eventBus?.emit?.('tile:add-to-documentation', {
                        tileType: this.constructor.TYPE,
                        config: { ...this.config },
                    });
                });
                menuDropdown.querySelector('[data-action="show-in-documentation"]')?.addEventListener('click', (e) => {
                    e.stopPropagation();
                    menuDropdown.hidden = true;
                    if (this.config?.sourceCellId) {
                        this.eventBus?.emit?.('tile:show-in-documentation', {
                            sourceCellId: this.config.sourceCellId,
                        });
                    }
                });
            }

            const removeBtn = header.querySelector('.tile-remove-btn');
            removeBtn?.addEventListener('click', (e) => {
                e.stopPropagation();
                this._onRemoveClick();
            });
        }

        // Content area. Clicking the content no longer opens config — that
        // moved to the explicit cogwheel button in the header so chart
        // interaction (pan/zoom/hover) doesn't trip the config panel.
        this.contentElement = document.createElement('div');
        this.contentElement.className = 'tile-content';

        this.element.appendChild(header);
        this.element.appendChild(this.contentElement);

        if (!this.readonly) {
            // Resize handle (bottom-right)
            const resizeHandle = document.createElement('div');
            resizeHandle.className = 'tile-resize-handle se';
            resizeHandle.innerHTML = '<span class="material-symbols-outlined">drag_handle</span>';
            this.element.appendChild(resizeHandle);

            // Context menu for "Add to Documentation" etc.
            this.element.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.eventBus?.emit?.('tile:context-menu', {
                    tileId: this.id,
                    tileType: this.constructor.TYPE,
                    tileTitle: this.constructor.TITLE,
                    config: { ...this.config },
                    clientX: e.clientX,
                    clientY: e.clientY,
                });
            });
        }
    }

    /**
     * Handle config button click — highlight tile and emit config request.
     * @private
     */
    _onConfigClick() {
        // Deselect all sibling tiles, then select this one
        this.element?.closest('.tile-grid')
            ?.querySelectorAll('.tile.tile--selected')
            .forEach(el => el.classList.remove('tile--selected'));
        this.element?.classList.add('tile--selected');

        // Emit event for grid/dashboard to show config panel
        this.eventBus?.emit?.('tile:config-request', {
            tileId: this.id,
            tileType: this.constructor.TYPE,
            config: this.config,
            schema: this.getConfigSchema()
        });

        // Also dispatch DOM event for alternative handling
        this.element?.dispatchEvent(new CustomEvent('tile:config-request', {
            bubbles: true,
            detail: {
                tileId: this.id,
                tileType: this.constructor.TYPE,
                config: this.config,
                schema: this.getConfigSchema()
            }
        }));
    }

    /**
     * Handle remove button click.
     * @param {Event} [event] - Original click event
     * @private
     */
    _onRemoveClick(event) {
        const removeBtn = this.element?.querySelector('.tile-remove-btn');

        // Only dispatch DOM event - let the dashboard handle confirmation
        this.element?.dispatchEvent(new CustomEvent('tile:remove-request', {
            bubbles: true,
            detail: {
                tileId: this.id,
                anchorElement: removeBtn
            }
        }));
    }

    /**
     * Set the title displayed in the header.
     * @param {string} title - New title text
     */
    setTitle(title) {
        const titleEl = this.element?.querySelector('.tile-title');
        if (titleEl) {
            titleEl.textContent = title;
        }
    }

    /**
     * Show loading state in content area.
     */
    showLoading() {
        if (this.contentElement) {
            this.contentElement.innerHTML = `
                <div class="tile-loading">
                    <span class="material-symbols-outlined spinning">progress_activity</span>
                    <span>Loading...</span>
                </div>
            `;
        }
    }

    /**
     * Show empty state in content area.
     * @param {string} [message] - Custom message
     */
    showEmpty(message = 'No data available') {
        if (this.contentElement) {
            this.contentElement.innerHTML = `
                <div class="tile-empty">
                    <span class="material-symbols-outlined">inbox</span>
                    <span>${message}</span>
                </div>
            `;
        }
    }

    /**
     * Show error state in content area.
     * @param {string} [message] - Error message
     */
    showError(message = 'Failed to load data') {
        if (this.contentElement) {
            this.contentElement.innerHTML = `
                <div class="twm-tile-error">
                    <span class="material-symbols-outlined">error</span>
                    <span>${message}</span>
                </div>
            `;
        }
    }

    /**
     * Format a number for display.
     * @param {number} value - Number to format
     * @param {number} [decimals=2] - Decimal places
     * @returns {string} Formatted string
     */
    formatNumber(value, decimals = 2) {
        if (value == null || !Number.isFinite(value)) return '—';

        const abs = Math.abs(value);
        if (abs >= 1e9) {
            return (value / 1e9).toFixed(1) + 'B';
        } else if (abs >= 1e6) {
            return (value / 1e6).toFixed(1) + 'M';
        } else if (abs >= 1e3) {
            return (value / 1e3).toFixed(1) + 'K';
        } else if (abs < 0.01 && abs > 0) {
            return value.toExponential(decimals);
        }
        return value.toFixed(decimals);
    }

    /**
     * Get available variables from data for config dropdowns.
     * @param {Object} data - Analytics data
     * @returns {Array<{value: string, label: string}>} Variable options
     */
    getAvailableVariables(data) {
        if (!data) return [];

        const variables = [];

        // Add stocks
        if (data.stocks) {
            Object.keys(data.stocks).forEach(name => {
                variables.push({ value: name, label: name, category: 'Stocks' });
            });
        }

        // Add flows
        if (data.flows) {
            Object.keys(data.flows).forEach(name => {
                variables.push({ value: name, label: name, category: 'Flows' });
            });
        }

        // Add indicators
        if (data.indicators) {
            Object.keys(data.indicators).forEach(name => {
                variables.push({ value: name, label: name, category: 'Indicators' });
            });
        }

        return variables;
    }

    // =========================================================================
    // EXPAND WINDOW FUNCTIONALITY
    // Reuses PlotPopoutWindow's patterns and CSS classes
    // =========================================================================

    /**
     * Handle expand button click.
     * @private
     */
    _onExpandClick() {
        if (!this.constructor.EXPANDABLE) return;

        const expandData = this.getExpandData();
        if (!expandData) {
            console.warn(`[TileBase] No expand data from widget ${this.id}`);
            return;
        }

        this._openExpandWindow(expandData);
    }

    /**
     * Get data for the expanded window.
     * Override in subclass for expandable widgets.
     * @returns {Object|null} { title, traces, layout, tableHeaders, tableRows }
     */
    getExpandData() {
        return null;
    }

    /**
     * Open the expand window with plot and data tabs.
     * Delegates to openRawTracesWindow (PlotPopoutWindow module) which
     * provides proper toolbar layout, download buttons, and data table.
     * @param {Object} expandData - Data from getExpandData()
     * @private
     */
    async _openExpandWindow(expandData) {
        if (this._expandWindow?.isVisible) {
            this._expandWindow.bringToFront();
            return;
        }

        this._expandWindow = await openRawTracesWindow({
            host: this.host,
            id: `tile-expand-${this.id}`,
            title: expandData.title || this.constructor.TITLE,
            traces: expandData.traces,
            layout: expandData.layout,
            frames: expandData.frames,
            tableHeaders: expandData.tableHeaders,
            tableRows: expandData.tableRows,
            services: { eventBus: this.eventBus },
        });
    }

    /**
     * Escape a string for safe insertion into an HTML attribute.
     * @private
     */
    #escapeAttr(s) {
        return String(s ?? '').replace(/[&<>"']/g, c => ({
            '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
        }[c]));
    }

    /**
     * Show toast notification via eventBus.
     * @private
     */
    _notify(title, message, severity = 'info') {
        this.eventBus?.emit?.('toast:show', {
            title,
            message,
            type: severity,
        });
    }
}

export default TileBase;
