/**
 * Plot Popout Window
 *
 * Opens a plot in a separate draggable/resizable ManagedWindow with two tabs:
 * - Plot tab: Interactive Plotly chart grid with modebar controls
 * - Data tab: Table showing all series using the unified DataTable component
 *
 * Uses the PlotCell data model (multi-layout subplots) as its canonical format.
 * All plot window contexts (notebook, dashboard, documentation) use this single
 * implementation.
 *
 * Features:
 * - Multi-subplot grid layouts (1x1, 1x2, 2x1, 2x2, 1x3, wide-top, wide-bottom)
 * - Series visibility toggle panel
 * - Zoom/pan toolbar with zoom in/out, autoscale, reset
 * - PyWebView integration for file downloads (CSV, PNG)
 * - NotificationCenter integration for user feedback
 * - Live streaming updates while the data source is running
 * - HP filter trend/cycle decomposition
 * - ETL actuals overlay support
 */

import { ManagedWindow } from '../ui/components/managed_window.js';
import { DataTable } from '../ui/components/data_table.js';
import { createRafResizeObserver } from '../ui/utils/raf_resize_observer.js';
import {
    ensurePlotly,
    purge,
    getSeriesColor,
} from './plotly_wrapper.js';
import {
    buildTrace,
    buildYAxisLayout,
    buildLegendLayout,
    buildOverlayShapes,
} from './chart_types.js';
import {
    PLOT_LAYOUTS,
    migrateData,
    applyNanHandling,
} from './plot_config.js';

export class PlotPopoutWindow {
    /**
     * @param {Object} options
     * @param {string} options.id - Unique window identifier
     * @param {string} options.title - Window title
     * @param {Object} options.plotConfig - PlotCell format: { layout, subplots }
     * @param {Function} options.getResults - Returns { time: number[], series: { [key]: number[] } }
     * @param {Object} options.services - { eventBus, logger }
     * @param {Object} [options.host] - A Host (ui/js/host/host.js). Its `dialogs`
     *        capability backs Export PNG/CSV; absent => Blob download fallback.
     * @param {Function} [options.onClose] - Called when window closes
     * @param {Object} [options.actuals] - ETL overlay data { seriesId: { years, values } }
     * @param {Function} [options.configRenderer] - (container) => void — renders config panel
     */
    constructor({ id, title, plotConfig, getResults, services, host, onClose, actuals,
                  configRenderer,
                  // The window used to listen for 'simulation:run:completed' and tell
                  // the user to "run simulation first". A chart window does not know
                  // that its data comes from a simulation; the app that opens it does.
                  refreshEvent = 'data:changed',
                  emptyMessage = 'No data yet.',
                  tableEmptyMessage = 'No data yet.' }) {
        this._id = id;
        this._title = title || 'Plot';
        this._plotConfig = migrateData(plotConfig);
        this._getResults = getResults;
        this._services = services;
        this._host = host || null;
        this._onClose = onClose ?? (() => {});
        this._actuals = actuals ?? null;
        this._configRenderer = configRenderer ?? null;
        this.refreshEvent = refreshEvent;
        // TWO messages, not one. The chart says "No data — run simulation first."
        // and the data table underneath says "Run simulation to see data". Folding
        // them into a single option would have quietly rewritten one of them, which
        // is the kind of change a pixel gate catches only if a captured view happens
        // to be showing an empty plot.
        this.emptyMessage = emptyMessage;
        this.tableEmptyMessage = tableEmptyMessage;

        this._window = null;
        this._contentEl = null;
        this._chartDivs = [];
        this._gridEl = null;
        this._activeTab = 'plot';
        this._eventDisposers = [];
        this._resizeObserver = null;
        this._chartCreated = false;
        this._lastResults = null;

        // Data table
        this._dataTable = null;
        this._dataTableContainer = null;
        this._tableHeaders = [];
        this._tableRows = [];

        // DOM refs
        this._plotTab = null;
        this._dataTab = null;
        this._configTab = null;
        this._plotContent = null;
        this._dataContent = null;
        this._configContent = null;
        this._toolbarActions = null;
        this._zoomBtn = null;
        this._panBtn = null;

        // Series visibility toggle
        this._hiddenSeries = new Set();
        this._allSeriesInfo = [];
        this._allSeriesLabels = [];
        this._seriesToggleBtn = null;
        this._seriesTogglePanel = null;
        this._seriesTogglePanelVisible = false;
        this._lastTogglePanelSignature = null;
        this._outsideClickHandler = null;

        this._renderPending = false;

        // Live-update toggle: when true, window re-renders on streaming events
        this._liveUpdate = true;
        this._liveBtn = null;
    }

    get isVisible() { return this._window?.isVisible ?? false; }

    async show() {
        if (this._window?.isVisible) {
            this._window.bringToFront();
            return;
        }

        await ensurePlotly();
        this.#createWindow();
        this.#subscribeEvents();
        this.#setupResizeObserver();
        await this.#render();
    }

    bringToFront() { this._window?.bringToFront?.(); }

    close() { this._window?.close?.(); }

    /** Update plot config and re-render. */
    updateConfig(plotConfig) {
        this._plotConfig = migrateData(plotConfig);
        this.#buildSubplotGrid();
        this.#scheduleRender();
    }

    /** Update actuals overlay data and re-render. */
    setActuals(actuals) {
        this._actuals = actuals;
        this.#scheduleRender();
    }

    // ── Window creation ─────────────────────────────────────────────────

    #createWindow() {
        this._contentEl = this.#buildContent();

        this._window = new ManagedWindow({
            id: `plot-window-${this._id}`,
            title: this._title,
            icon: 'monitoring',
            content: this._contentEl,
            minWidth: 500,
            minHeight: 400,
            defaultWidth: 800,
            defaultHeight: 600,
            canMinimize: true,
            canMaximize: true,
            canResize: true,
            canDrag: true,
            onClose: () => { this.#dispose(); this._onClose(); },
        });

        this._window.show();
    }

    #buildContent() {
        const container = document.createElement('div');
        container.className = 'twm-plot-window-container';

        // Tab header
        const tabHeader = document.createElement('div');
        tabHeader.className = 'twm-code-tabs-header';

        const tabs = document.createElement('div');
        tabs.className = 'tabs twm-code-tabs';

        this._plotTab = document.createElement('button');
        this._plotTab.className = 'twm-code-tab active';
        this._plotTab.type = 'button';
        this._plotTab.textContent = 'Plot';
        this._plotTab.addEventListener('click', () => this.#switchTab('plot'));

        this._dataTab = document.createElement('button');
        this._dataTab.className = 'twm-code-tab';
        this._dataTab.type = 'button';
        this._dataTab.textContent = 'Data';
        this._dataTab.addEventListener('click', () => this.#switchTab('data'));

        tabs.appendChild(this._plotTab);
        tabs.appendChild(this._dataTab);

        if (this._configRenderer) {
            this._configTab = document.createElement('button');
            this._configTab.className = 'twm-code-tab';
            this._configTab.type = 'button';
            this._configTab.textContent = 'Config';
            this._configTab.addEventListener('click', () => this.#switchTab('config'));
            tabs.appendChild(this._configTab);
        }

        // Toolbar (visible when Plot tab is active)
        this._toolbarActions = document.createElement('div');
        this._toolbarActions.className = 'twm-plot-window-toolbar';

        // Drag mode group
        const dragGroup = this.#toolbarGroup();
        this._zoomBtn = this.#toolbarBtn('search', 'Zoom', () => this.#setDragMode('zoom'));
        this._zoomBtn.classList.add('twm-is-active');
        this._panBtn = this.#toolbarBtn('pan_tool', 'Pan', () => this.#setDragMode('pan'));
        dragGroup.appendChild(this._zoomBtn);
        dragGroup.appendChild(this._panBtn);
        this._toolbarActions.appendChild(dragGroup);

        // Zoom control group
        const zoomGroup = this.#toolbarGroup();
        zoomGroup.appendChild(this.#toolbarBtn('zoom_in', 'Zoom in', () => this.#zoom(0.5)));
        zoomGroup.appendChild(this.#toolbarBtn('zoom_out', 'Zoom out', () => this.#zoom(2)));
        zoomGroup.appendChild(this.#toolbarBtn('zoom_out_map', 'Autoscale', () => this.#autoscale()));
        zoomGroup.appendChild(this.#toolbarBtn('home', 'Reset axes', () => this.#autoscale()));
        this._toolbarActions.appendChild(zoomGroup);

        // Spacer
        const spacer = document.createElement('div');
        spacer.style.flex = '1';
        this._toolbarActions.appendChild(spacer);

        // Action buttons group
        const actionsGroup = this.#toolbarGroup();

        // Live-update toggle
        this._liveBtn = this.#toolbarBtn('stream', 'Live update — click to lock', () => this.#toggleLiveUpdate());
        this._liveBtn.classList.add('twm-is-active');
        actionsGroup.appendChild(this._liveBtn);

        // Series visibility toggle
        const toggleSeriesBtn = this.#toolbarBtn('visibility', 'Toggle series visibility', () => this.#toggleSeriesPanel());
        this._seriesToggleBtn = toggleSeriesBtn;
        actionsGroup.appendChild(toggleSeriesBtn);

        // Download PNG
        actionsGroup.appendChild(this.#toolbarBtn('image', 'Download plot as PNG', () => this.#downloadPNG()));

        // Download CSV
        actionsGroup.appendChild(this.#toolbarBtn('download', 'Download data as CSV', () => this.#downloadCSV()));

        this._toolbarActions.appendChild(actionsGroup);

        tabHeader.appendChild(tabs);
        tabHeader.appendChild(this._toolbarActions);

        // Tab content area
        const content = document.createElement('div');
        content.className = 'twm-plot-window-content';

        // Plot tab content
        this._plotContent = document.createElement('div');
        this._plotContent.className = 'twm-plot-tab-content active';
        this._plotContent.setAttribute('data-tab', 'plot');
        this._plotContent.style.cssText = 'display:flex; flex-direction:column;';

        this._gridEl = document.createElement('div');
        this._gridEl.className = 'twm-plot-window-chart';
        this._plotContent.appendChild(this._gridEl);

        this.#buildSubplotGrid();

        // Data tab content
        this._dataContent = document.createElement('div');
        this._dataContent.className = 'twm-plot-tab-content';
        this._dataContent.setAttribute('data-tab', 'data');
        this._dataContent.style.cssText = 'display:none; flex-direction:column;';

        this._dataTableContainer = document.createElement('div');
        this._dataTableContainer.style.cssText = 'flex:1; min-height:0; display:flex; flex-direction:column;';
        this._dataContent.appendChild(this._dataTableContainer);

        content.appendChild(this._plotContent);
        content.appendChild(this._dataContent);

        // Config tab content (optional)
        if (this._configRenderer) {
            this._configContent = document.createElement('div');
            this._configContent.className = 'twm-plot-tab-content';
            this._configContent.setAttribute('data-tab', 'config');
            this._configContent.style.cssText = 'display:none; flex-direction:column; overflow:auto; padding:8px 12px;';
            this._configRenderer(this._configContent);
            content.appendChild(this._configContent);
        }

        // Series visibility dropdown panel (initially hidden)
        this._seriesTogglePanel = document.createElement('div');
        this._seriesTogglePanel.className = 'twm-plot-series-toggle-panel';
        this._seriesTogglePanel.style.display = 'none';

        container.appendChild(tabHeader);
        container.appendChild(content);
        container.appendChild(this._seriesTogglePanel);

        return container;
    }

    // ── Subplot grid ────────────────────────────────────────────────────

    #buildSubplotGrid() {
        if (!this._gridEl) return;

        // Purge existing charts
        for (const div of this._chartDivs) {
            if (div && window.Plotly) {
                try { purge(div); } catch (_) {}
            }
        }
        this._gridEl.innerHTML = '';
        this._chartDivs = [];

        const tmpl = PLOT_LAYOUTS[this._plotConfig.layout] || PLOT_LAYOUTS['1x1'];
        this._gridEl.style.display = 'grid';
        this._gridEl.style.gridTemplateColumns = tmpl.grid.columns;
        this._gridEl.style.gridTemplateRows = tmpl.grid.rows;
        this._gridEl.style.gap = '4px';
        this._gridEl.style.height = '100%';
        this._gridEl.style.width = '100%';

        for (let i = 0; i < tmpl.slots; i++) {
            const div = document.createElement('div');
            div.className = 'plot-tile-chart';
            div.style.gridArea = tmpl.areas[i].gridArea;
            div.style.minHeight = '0';
            this._gridEl.appendChild(div);
            this._chartDivs.push(div);
        }

        this._chartCreated = false;
    }

    // ── Toolbar helpers ─────────────────────────────────────────────────

    #toolbarGroup() {
        const g = document.createElement('div');
        g.className = 'twm-plot-window-toolbar__group';
        return g;
    }

    #toolbarBtn(icon, tooltip, onClick) {
        const btn = document.createElement('button');
        btn.className = 'twm-btn-icon twm-has-tooltip';
        btn.type = 'button';
        btn.setAttribute('data-tooltip', tooltip);
        btn.innerHTML = `<span class="material-symbols-outlined">${icon}</span>`;
        if (onClick) btn.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
        return btn;
    }

    // ── Plotly toolbar actions ───────────────────────────────────────────

    #setDragMode(mode) {
        if (!this._chartCreated) return;
        for (const div of this._chartDivs) {
            if (div._fullLayout) {
                window.Plotly.relayout(div, { dragmode: mode }).catch(() => {});
            }
        }
        this._zoomBtn?.classList.toggle('twm-is-active', mode === 'zoom');
        this._panBtn?.classList.toggle('twm-is-active', mode === 'pan');
    }

    #zoom(factor) {
        for (const div of this._chartDivs) {
            if (!div._fullLayout) continue;
            const xa = div._fullLayout.xaxis;
            const ya = div._fullLayout.yaxis;
            if (!xa || !ya) continue;

            const xr = xa.range;
            const yr = ya.range;
            const xMid = (xr[0] + xr[1]) / 2;
            const yMid = (yr[0] + yr[1]) / 2;
            const xHalf = (xr[1] - xr[0]) / 2 * factor;
            const yHalf = (yr[1] - yr[0]) / 2 * factor;

            window.Plotly.relayout(div, {
                'xaxis.range': [xMid - xHalf, xMid + xHalf],
                'yaxis.range': [yMid - yHalf, yMid + yHalf],
            }).catch(() => {});
        }
    }

    #autoscale() {
        for (const div of this._chartDivs) {
            if (!div._fullLayout) continue;
            window.Plotly.relayout(div, {
                'xaxis.autorange': true,
                'yaxis.autorange': true,
            }).catch(() => {});
        }
    }

    #setupResizeObserver() {
        if (!this._plotContent) return;
        this._resizeObserver = createRafResizeObserver(() => {
            if (this._activeTab === 'plot' && this._chartCreated && window.Plotly) {
                for (const div of this._chartDivs) {
                    if (div._fullLayout) {
                        Plotly.Plots.resize(div).catch(() => {});
                    }
                }
            }
        });
        this._resizeObserver.observe(this._plotContent);
    }

    #switchTab(tabName) {
        this._activeTab = tabName;

        this._plotTab.classList.toggle('active', tabName === 'plot');
        this._dataTab.classList.toggle('active', tabName === 'data');
        this._configTab?.classList.toggle('active', tabName === 'config');

        if (this._toolbarActions) {
            this._toolbarActions.style.display = tabName === 'plot' ? '' : 'none';
        }

        this._plotContent.style.display = tabName === 'plot' ? 'flex' : 'none';
        this._dataContent.style.display = tabName === 'data' ? 'flex' : 'none';
        if (this._configContent) {
            this._configContent.style.display = tabName === 'config' ? 'flex' : 'none';
        }

        if (tabName === 'plot' && this._chartCreated && window.Plotly) {
            for (const div of this._chartDivs) {
                if (div._fullLayout) {
                    Plotly.Plots.resize(div).catch(() => {});
                }
            }
        }

        if (tabName === 'data') {
            this.#renderDataTable();
        }
    }

    // ── Series visibility toggle ────────────────────────────────────────

    #toggleSeriesPanel() {
        if (this._seriesTogglePanelVisible) {
            this.#hideSeriesPanel();
        } else {
            this.#showSeriesPanel();
        }
    }

    #showSeriesPanel() {
        if (!this._seriesTogglePanel || !this._seriesToggleBtn) return;

        const btnRect = this._seriesToggleBtn.getBoundingClientRect();
        const containerRect = this._contentEl.getBoundingClientRect();

        this._seriesTogglePanel.style.top = `${btnRect.bottom - containerRect.top + 4}px`;
        this._seriesTogglePanel.style.right = `${containerRect.right - btnRect.right}px`;
        this._seriesTogglePanel.style.display = '';
        this._seriesTogglePanelVisible = true;

        this._seriesToggleBtn.classList.add('twm-is-active');
        this.#rebuildSeriesToggleList();

        this._outsideClickHandler = (e) => {
            if (!this._seriesTogglePanel.contains(e.target) &&
                !this._seriesToggleBtn.contains(e.target)) {
                this.#hideSeriesPanel();
            }
        };
        requestAnimationFrame(() => {
            document.addEventListener('pointerdown', this._outsideClickHandler, true);
        });
    }

    #hideSeriesPanel() {
        if (this._seriesTogglePanel) {
            this._seriesTogglePanel.style.display = 'none';
        }
        this._seriesTogglePanelVisible = false;
        this._lastTogglePanelSignature = null;
        this._seriesToggleBtn?.classList.remove('twm-is-active');

        if (this._outsideClickHandler) {
            document.removeEventListener('pointerdown', this._outsideClickHandler, true);
            this._outsideClickHandler = null;
        }
    }

    #rebuildSeriesToggleList() {
        const panel = this._seriesTogglePanel;
        if (!panel) return;
        panel.innerHTML = '';

        // Header with "All" / "None" actions
        const header = document.createElement('div');
        header.className = 'twm-plot-series-toggle-panel__header';

        const title = document.createElement('span');
        title.className = 'twm-plot-series-toggle-panel__title';
        title.textContent = 'Series';
        header.appendChild(title);

        const headerActions = document.createElement('div');
        headerActions.className = 'twm-plot-series-toggle-panel__header-actions';

        const showAllBtn = document.createElement('button');
        showAllBtn.className = 'twm-plot-series-toggle-panel__action';
        showAllBtn.type = 'button';
        showAllBtn.textContent = 'All';
        showAllBtn.addEventListener('click', () => {
            this._hiddenSeries.clear();
            this.#rebuildSeriesToggleList();
            this.#scheduleRender();
        });

        const hideAllBtn = document.createElement('button');
        hideAllBtn.className = 'twm-plot-series-toggle-panel__action';
        hideAllBtn.type = 'button';
        hideAllBtn.textContent = 'None';
        hideAllBtn.addEventListener('click', () => {
            for (const label of this._allSeriesLabels) {
                this._hiddenSeries.add(label);
            }
            this.#rebuildSeriesToggleList();
            this.#scheduleRender();
        });

        headerActions.appendChild(showAllBtn);
        headerActions.appendChild(hideAllBtn);
        header.appendChild(headerActions);
        panel.appendChild(header);

        // Split series into model vs overlay
        const modelSeries = this._allSeriesInfo.filter(s => !s.isOverlay);
        const overlaySeries = this._allSeriesInfo.filter(s => s.isOverlay);

        const buildItem = ({ label, color, lineStyle }) => {
            const item = document.createElement('label');
            item.className = 'twm-plot-series-toggle-panel__item';

            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = !this._hiddenSeries.has(label);
            cb.addEventListener('change', () => {
                if (cb.checked) this._hiddenSeries.delete(label);
                else this._hiddenSeries.add(label);
                this.#scheduleRender();
            });

            const dashMap = { solid: '', dashed: '4,2', dotted: '1,2' };
            const indicator = document.createElement('div');
            indicator.className = 'twm-plot-series-toggle-panel__line-indicator';
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('viewBox', '0 0 28 14');
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', '3');
            line.setAttribute('y1', '7');
            line.setAttribute('x2', '25');
            line.setAttribute('y2', '7');
            line.setAttribute('stroke', color || '#888');
            line.setAttribute('stroke-width', '2');
            line.setAttribute('stroke-linecap', 'round');
            const dash = dashMap[lineStyle] || '';
            if (dash) line.setAttribute('stroke-dasharray', dash);
            svg.appendChild(line);
            indicator.appendChild(svg);

            const text = document.createElement('span');
            text.className = 'twm-plot-series-toggle-panel__label';
            text.textContent = label;
            text.title = label;

            item.appendChild(cb);
            item.appendChild(indicator);
            item.appendChild(text);
            return item;
        };

        // Model series section
        const list = document.createElement('div');
        list.className = 'twm-plot-series-toggle-panel__list';

        const subplotGroups = new Map();
        for (const info of modelSeries) {
            if (!subplotGroups.has(info.subplotIndex)) {
                subplotGroups.set(info.subplotIndex, []);
            }
            subplotGroups.get(info.subplotIndex).push(info);
        }

        const multipleSubplots = subplotGroups.size > 1;

        for (const [spIdx, seriesList] of subplotGroups) {
            if (multipleSubplots) {
                const spName = seriesList[0]?.subplotName || `Subplot ${spIdx + 1}`;
                const spHeader = document.createElement('div');
                spHeader.className = 'twm-plot-series-toggle-panel__axis-label';
                spHeader.textContent = spName;
                list.appendChild(spHeader);
            }

            for (const info of seriesList) {
                list.appendChild(buildItem(info));
            }
        }

        panel.appendChild(list);

        // Overlays section (only if any exist)
        if (overlaySeries.length > 0) {
            const ovList = document.createElement('div');
            ovList.className = 'twm-plot-series-toggle-panel__list';

            const ovHeader = document.createElement('div');
            ovHeader.className = 'twm-plot-series-toggle-panel__axis-label';
            ovHeader.textContent = 'Overlays';
            ovList.appendChild(ovHeader);

            for (const info of overlaySeries) {
                ovList.appendChild(buildItem(info));
            }

            panel.appendChild(ovList);
        }
    }

    // ── Event subscriptions ─────────────────────────────────────────────

    #subscribeEvents() {
        const { eventBus } = this._services;
        if (!eventBus) return;

        this._eventDisposers.push(
            eventBus.on('streaming:delta', () => {
                if (this._liveUpdate) this.#scheduleRender();
            })
        );
        this._eventDisposers.push(
            eventBus.on('streaming:complete', () => {
                if (this._liveUpdate) this.#scheduleRender();
            })
        );
        // Final analytics arrive asynchronously after streaming:complete
        // (backend fetch + transform). Without this, the popout window may
        // render stale data from a previous run when the dashboard tab
        // didn't receive streaming deltas (e.g. user was on another tab).
        this._eventDisposers.push(
            eventBus.on(this.refreshEvent, () => {
                if (this._liveUpdate) this.#scheduleRender();
            })
        );
    }

    #toggleLiveUpdate() {
        this._liveUpdate = !this._liveUpdate;
        if (this._liveBtn) {
            this._liveBtn.classList.toggle('twm-is-active', this._liveUpdate);
            const icon = this._liveBtn.querySelector('.material-symbols-outlined');
            if (icon) icon.textContent = this._liveUpdate ? 'stream' : 'lock';
            this._liveBtn.title = this._liveUpdate
                ? 'Live update — click to lock'
                : 'Locked — click for live update';
        }
        // If switching back to live, immediately render latest data
        if (this._liveUpdate) this.#scheduleRender();
    }

    #scheduleRender() {
        if (this._renderPending) return;
        this._renderPending = true;
        requestAnimationFrame(() => {
            this._renderPending = false;
            this.#render();
        });
    }

    // ── Rendering ───────────────────────────────────────────────────────

    async #render() {
        if (!this._window?.isVisible) return;

        const results = this._getResults?.();
        if (!results) return;

        this._lastResults = results;

        // Build series info for toggle panel
        this.#collectSeriesInfo();

        // Render all subplot charts
        this.#renderAllCharts(results);

        // Update table data
        this.#updateTableData(results);

        if (this._activeTab === 'data') {
            this.#renderDataTable();
        }
    }

    #collectSeriesInfo() {
        this._allSeriesInfo = [];
        this._allSeriesLabels = [];

        const subplots = this._plotConfig.subplots ?? [];
        for (let spIdx = 0; spIdx < subplots.length; spIdx++) {
            const sp = subplots[spIdx];
            for (const axis of sp.yAxes ?? []) {
                for (const s of axis.series ?? []) {
                    const label = s.label || s.variable || 'Series';
                    this._allSeriesInfo.push({
                        label,
                        color: s.color || getSeriesColor(this._allSeriesInfo.length),
                        lineStyle: s.lineStyle || 'solid',
                        subplotIndex: spIdx,
                        subplotName: sp.displayName || `Subplot ${spIdx + 1}`,
                    });
                    this._allSeriesLabels.push(label);

                    // Include overlay in toggle list
                    if (s.overlay?.etlKey) {
                        const ovLabel = s.overlay.label || `${label} (actual)`;
                        this._allSeriesInfo.push({
                            label: ovLabel,
                            color: s.overlay.color || s.color || getSeriesColor(this._allSeriesInfo.length),
                            lineStyle: s.overlay.lineStyle || 'dashed',
                            subplotIndex: spIdx,
                            subplotName: sp.displayName || `Subplot ${spIdx + 1}`,
                            isOverlay: true,
                        });
                        this._allSeriesLabels.push(ovLabel);
                    }
                }
            }
        }

        // Prune hidden labels that no longer exist
        for (const label of this._hiddenSeries) {
            if (!this._allSeriesLabels.includes(label)) {
                this._hiddenSeries.delete(label);
            }
        }

        // Update toggle panel if visible
        if (this._seriesTogglePanelVisible) {
            const newSig = this._allSeriesInfo.map(s => `${s.subplotIndex}|${s.label}|${s.lineStyle}`).join('\x00');
            if (newSig !== this._lastTogglePanelSignature) {
                this._lastTogglePanelSignature = newSig;
                this.#rebuildSeriesToggleList();
            }
        }

        // Update toggle button icon
        if (this._seriesToggleBtn) {
            const icon = this._seriesToggleBtn.querySelector('.material-symbols-outlined');
            if (icon) {
                icon.textContent = this._hiddenSeries.size > 0 ? 'visibility_off' : 'visibility';
            }
        }
    }

    #renderAllCharts(results) {
        if (!window.Plotly) return;

        const subplots = this._plotConfig.subplots ?? [];
        for (let i = 0; i < this._chartDivs.length; i++) {
            const chartDiv = this._chartDivs[i];
            const sp = subplots[i];
            if (!chartDiv) continue;
            if (!sp) {
                chartDiv.innerHTML = '<div class="twm-plot-no-data" style="color:rgba(255,255,255,0.3);text-align:center;padding:16px;">No subplot configured.</div>';
                continue;
            }
            this.#renderSubplotChart(chartDiv, sp, results);
        }
    }

    async #renderSubplotChart(chartDiv, sp, results) {
        const { time, series } = results;
        const traces = [];
        const layoutAxes = {};
        const yRefByAxisId = {};
        let axisCount = 0;

        for (const axis of sp.yAxes ?? []) {
            axisCount++;
            const yAxisKey = axisCount === 1 ? 'yaxis' : `yaxis${axisCount}`;
            const yRef = axisCount === 1 ? 'y' : `y${axisCount}`;
            if (axis.id) yRefByAxisId[axis.id] = yRef;

            layoutAxes[yAxisKey] = buildYAxisLayout({
                axisId: yAxisKey,
                title: axis.label || '',
                position: axis.position || 'left',
                scaleType: axis.scale || 'linear',
                min: axis.min,
                max: axis.max,
                showGrid: (sp.yAxes ?? []).length === 1,
                axisPosition: axisCount > 1 ? (axis.position === 'right' ? 1 : 0) : null,
            });

            for (const s of axis.series ?? []) {
                if (!s.variable) continue;

                const label = s.label || s.variable;

                // Skip hidden series
                if (this._hiddenSeries.has(label)) continue;

                // Resolve variable: try result key (paper multi-scenario), exact, then bare (without namespace prefix)
                let rawY = series?.[s._resultKey ?? s.variable];
                if (!rawY && s._resultKey) {
                    rawY = series?.[s.variable];
                }
                if (!rawY) {
                    const dotIdx = s.variable.indexOf('.');
                    if (dotIdx >= 0) rawY = series?.[s.variable.slice(dotIdx + 1)];
                }
                if (!rawY) continue;

                const y = Array.isArray(rawY) ? applyNanHandling(rawY, sp.nanHandling ?? 'gap', time) : rawY;
                const seriesTime = s._resultTime ?? time;
                traces.push(buildTrace({
                    chartType: sp.chartType || 'line',
                    x: seriesTime,
                    y,
                    name: label,
                    color: s.color,
                    lineWidth: s.lineWidth ?? 2,
                    lineStyle: s.lineStyle ?? 'solid',
                    interpolation: sp.interpolation ?? 'linear',
                    yAxisId: yRef,
                    showMarkers: sp.showDataPoints ?? false,
                    stackGroup: s.stackGroup ?? null,
                }));

                // Per-series overlay trace (ETL actuals)
                if (s.overlay?.etlKey && this._actuals?.[s.id]) {
                    const ovLabel = s.overlay.label || `${label} (actual)`;
                    if (!this._hiddenSeries.has(ovLabel)) {
                        const act = this._actuals[s.id];
                        if (act?.years?.length) {
                            const ov = s.overlay;
                            const dashMap = { dashed: 'dash', dotted: 'dot', solid: 'solid' };
                            traces.push({
                                type: 'scatter',
                                mode: ov.mode || 'markers+lines',
                                x: act.years,
                                y: act.values,
                                name: ov.label || `${label} (actual)`,
                                yaxis: yRef === 'y' ? undefined : yRef,
                                line: {
                                    color: ov.color || s.color,
                                    width: ov.lineWidth ?? 2,
                                    dash: dashMap[ov.lineStyle] || 'dash',
                                },
                                marker: {
                                    color: ov.color || s.color,
                                    size: 4,
                                    symbol: 'circle',
                                },
                                showlegend: true,
                            });
                        }
                    }
                }
            }
        }

        // HP filter traces
        if ((sp.showHpTrend || sp.showHpCycle) && window.pywebview?.api?.hp_filter) {
            const hpLambda = sp.hpLambda ?? 1600;
            for (const trace of [...traces]) {
                if (trace.type && trace.type !== 'scatter' && trace.type !== 'scattergl') continue;
                try {
                    const hpResult = await window.pywebview.api.hp_filter({
                        data: trace.y,
                        lambda: hpLambda,
                    });
                    if (!hpResult?.ok) continue;
                    const { trend, cycle } = hpResult;
                    const origColor = trace.line?.color || trace.marker?.color || getSeriesColor(0);
                    if (sp.showHpTrend && trend) {
                        traces.push({
                            x: trace.x, y: trend, type: 'scatter', mode: 'lines',
                            name: `${trace.name} (HP Trend)`,
                            yaxis: trace.yaxis || 'y',
                            line: { color: origColor, width: 2, dash: 'dash' },
                            showlegend: true,
                        });
                    }
                    if (sp.showHpCycle && cycle) {
                        traces.push({
                            x: trace.x, y: cycle, type: 'scatter', mode: 'lines',
                            name: `${trace.name} (HP Cycle)`,
                            yaxis: trace.yaxis || 'y',
                            line: { color: origColor, width: 1, dash: 'dot' },
                            showlegend: true,
                        });
                    }
                } catch (_) { /* ignore HP filter failures */ }
            }
        }

        if (traces.length === 0 && this._hiddenSeries.size === 0) {
            chartDiv.innerHTML = `<div class="twm-plot-no-data" style="color:rgba(255,255,255,0.3);text-align:center;padding:16px;font-size:11px;">${this.emptyMessage}</div>`;
            return;
        }

        // Popout windows have space — always show legend
        const legendPos = sp.legendPosition === 'hidden' ? 'top' : (sp.legendPosition ?? 'top');
        const legend = buildLegendLayout(legendPos);

        // Clip the x-axis to the data's time range so overlays don't run past t0–t1
        const xRange = time?.length >= 2 ? [time[0], time[time.length - 1]] : undefined;

        const { shapes, annotations } = buildOverlayShapes({
            referenceLines: sp.referenceLines,
            shadedBands: sp.shadedBands,
            yRefByAxisId,
        });

        const layout = {
            ...layoutAxes,
            ...(shapes.length ? { shapes } : {}),
            ...(annotations.length ? { annotations } : {}),
            xaxis: {
                gridcolor: 'rgba(255,255,255,0.05)',
                linecolor: 'rgba(255,255,255,0.08)',
                tickcolor: 'rgba(255,255,255,0.3)',
                zerolinecolor: 'rgba(255,255,255,0.06)',
                automargin: true,
                ...(xRange ? { range: xRange } : {}),
            },
            ...legend,
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'transparent',
            font: { family: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif', color: '#cccccc', size: 11 },
            margin: { t: 10, r: 20, b: 40, l: 50 },
            hoverlabel: {
                bgcolor: '#1e2228',
                bordercolor: '#444444',
                font: { family: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif', color: '#cccccc' },
            },
            autosize: true,
            hovermode: 'x unified',
        };

        // Guard: skip if div is detached or zero-size
        if (!chartDiv.isConnected || chartDiv.offsetWidth === 0) return;

        try {
            await Plotly.react(chartDiv, traces, layout, { responsive: true, displayModeBar: false });
            this._chartCreated = true;
        } catch (_) {
            // Plotly can throw if div is removed mid-render
        }
    }

    // ── Data table ──────────────────────────────────────────────────────

    #updateTableData(results) {
        if (!results) {
            this._tableHeaders = [];
            this._tableRows = [];
            return;
        }

        const headers = ['Time'];
        const seriesColumns = [];
        const { time, series } = results;
        const subplots = this._plotConfig.subplots ?? [];

        for (const sp of subplots) {
            for (const axis of sp.yAxes ?? []) {
                for (const s of axis.series ?? []) {
                    if (!s.variable) continue;
                    const label = s.label || s.variable;
                    let rawY = series?.[s._resultKey ?? s.variable];
                    if (!rawY && s._resultKey) {
                        rawY = series?.[s.variable];
                    }
                    if (!rawY) {
                        const dotIdx = s.variable.indexOf('.');
                        if (dotIdx >= 0) rawY = series?.[s.variable.slice(dotIdx + 1)];
                    }
                    if (!rawY) continue;
                    headers.push(label);
                    seriesColumns.push(rawY);
                }
            }
        }

        const rows = [];
        for (let i = 0; i < time.length; i++) {
            const row = [time[i]];
            for (const col of seriesColumns) {
                row.push(Array.isArray(col) ? col[i] : null);
            }
            rows.push(row);
        }

        this._tableHeaders = headers;
        this._tableRows = rows;
    }

    #renderDataTable() {
        if (!this._dataTableContainer) return;

        if (!this._dataTable) {
            this._dataTable = new DataTable(this._dataTableContainer, {
                headers: this._tableHeaders,
                rows: this._tableRows,
                pageSize: 100,
                pagination: true,
                selectable: true,
                copyable: true,
                sortable: true,
                filterable: true,
                readonly: false,
                emptyMessage: this.tableEmptyMessage,
                services: this._services,
                host: this._host,
            });
            this._dataTable.render();
        } else {
            this._dataTable.setData({
                headers: this._tableHeaders,
                rows: this._tableRows,
            });
        }
    }

    // ── Downloads ────────────────────────────────────────────────────────

    async #downloadCSV() {
        if (this._tableRows.length === 0) {
            this.#notify('Download', 'No data available to download.', 'warn');
            return;
        }

        const filename = `${this._title.replace(/[^a-z0-9]/gi, '_')}_data.csv`;

        const lines = [this._tableHeaders.join(',')];
        for (const row of this._tableRows) {
            lines.push(row.map(val => this.#csvEscape(val)).join(','));
        }
        const csv = lines.join('\n');

        // null <=> the host has no save dialog behind its `dialogs` capability
        // (host.js). Fall back; do not report it as a failed save.
        const dialogs = this._host?.dialogs;
        let result = null;
        if (dialogs) {
            try {
                result = await dialogs.saveFile({ data: csv, filename, kind: 'csv' });
            } catch (err) {
                console.error('[PlotPopoutWindow] CSV download failed:', err);
                this.#notify('Download', 'Failed to save file', 'error');
                return;
            }
        }
        if (result) {
            if (result.ok) {
                this.#notify('Download', `Saved ${this._tableRows.length} rows to ${result.path}`, 'success');
            } else if (!result.cancelled) {
                this.#notify('Download', result.error || 'Failed to save file', 'error');
            }
            return;
        }

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
        this.#notify('Download', 'Download started', 'info');
    }

    #csvEscape(value) {
        if (value == null) return '';
        const str = String(value);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
    }

    async #downloadPNG() {
        // For multi-subplot, capture the grid container as a whole
        // Fall back to first chart div if only one subplot
        const targetDiv = this._chartDivs.length === 1 ? this._chartDivs[0] : this._chartDivs[0];
        if (!targetDiv || !window.Plotly || !this._chartCreated) {
            this.#notify('Download', 'Plot not ready', 'warn');
            return;
        }

        const filename = `${this._title.replace(/[^a-z0-9]/gi, '_')}.png`;

        try {
            const pngDataUrl = await window.Plotly.toImage(targetDiv, {
                format: 'png',
                width: 1920,
                height: 1080,
                scale: 2,
            });

            // null <=> no save dialog behind the capability (host.js) -> fall back.
            const dialogs = this._host?.dialogs;
            const result = dialogs
                ? await dialogs.saveFile({ data: pngDataUrl.split(',')[1], filename, kind: 'png' })
                : null;
            if (result) {
                if (result.ok) {
                    this.#notify('Download', `Plot saved to ${result.path}`, 'success');
                } else if (!result.cancelled) {
                    this.#notify('Download', result.error || 'Failed to save image', 'error');
                }
            } else {
                const link = document.createElement('a');
                link.href = pngDataUrl;
                link.download = filename;
                link.click();
                this.#notify('Download', 'PNG download started', 'info');
            }
        } catch (err) {
            this._services.logger?.warn?.('[PlotPopoutWindow] PNG download failed', err);
            this.#notify('Download', 'Failed to generate PNG', 'error');
        }
    }

    // ── Utilities ───────────────────────────────────────────────────────

    #notify(title, message, severity = 'info') {
        this._services.eventBus?.emit?.('toast:show', {
            title,
            message,
            type: severity,
        });
    }

    // ── Cleanup ─────────────────────────────────────────────────────────

    #dispose() {
        if (this._dataTable) {
            this._dataTable.dispose();
            this._dataTable = null;
        }

        this.#hideSeriesPanel();

        if (this._resizeObserver) {
            this._resizeObserver.disconnect();
            this._resizeObserver = null;
        }

        for (const disposer of this._eventDisposers) {
            try { disposer?.dispose?.(); } catch (_) {}
        }
        this._eventDisposers = [];

        for (const div of this._chartDivs) {
            if (div && window.Plotly) {
                try { purge(div); } catch (_) {}
            }
        }

        this._window = null;
        this._contentEl = null;
        this._gridEl = null;
        this._chartDivs = [];
        this._plotTab = null;
        this._dataTab = null;
        this._plotContent = null;
        this._dataContent = null;
        this._dataTableContainer = null;
        this._toolbarActions = null;
        this._zoomBtn = null;
        this._panBtn = null;
        this._seriesToggleBtn = null;
        this._seriesTogglePanel = null;
        this._lastTogglePanelSignature = null;
        this._hiddenSeries = null;
        this._allSeriesInfo = null;
        this._allSeriesLabels = null;
        this._chartCreated = false;
        this._lastResults = null;
    }
}

// ── Singleton window manager ────────────────────────────────────────────

const _openWindows = new Map();

/**
 * Open or focus a plot popout window.
 *
 * @param {Object} options
 * @param {string} options.id - Unique window identifier
 * @param {string} options.title - Window title
 * @param {Object} options.plotConfig - PlotCell format: { layout, subplots }
 * @param {Function} options.getResults - Returns { time: number[], series: { [key]: number[] } }
 * @param {Object} options.services - { eventBus, logger }
 * @param {Object} [options.actuals] - ETL overlay data
 * @returns {PlotPopoutWindow}
 */
export async function openPlotPopoutWindow(options) {
    const { id } = options;
    let win = _openWindows.get(id);
    if (win?.isVisible) {
        win.bringToFront();
        return win;
    }

    // Forward the WHOLE options object. This used to destructure a fixed list of
    // eight names and rebuild the object from them, which means every option added
    // to the constructor from now on would be silently dropped on its way through
    // the factory — including `refreshEvent`, whose loss would show up as a plot
    // window that simply stops updating, with no error anywhere.
    win = new PlotPopoutWindow({
        ...options,
        onClose: () => _openWindows.delete(id),
    });
    _openWindows.set(id, win);

    await win.show();
    return win;
}

// ── Raw-traces window (for dashboard tile expand) ──────────────────────

/**
 * Open a ManagedWindow with pre-built Plotly traces.
 *
 * Reuses the same toolbar, tab layout, and download logic as PlotPopoutWindow
 * but accepts ready-made `{ traces, layout }` instead of plotConfig + getResults.
 * Used by dashboard tile widgets whose getExpandData() returns raw Plotly specs.
 *
 * @param {Object} options
 * @param {string} options.id - Unique window identifier
 * @param {string} options.title - Window title
 * @param {Array}  options.traces - Plotly trace objects
 * @param {Object} options.layout - Plotly layout object
 * @param {Array}  [options.tableHeaders] - Column headers for Data tab
 * @param {Array}  [options.tableRows] - Row data for Data tab
 * @param {Object} [options.services] - { eventBus, logger }
 * @param {Object} [options.host] - A Host (ui/js/host/host.js); backs Export PNG/CSV.
 * @returns {{ close: Function, bringToFront: Function }}
 */
export async function openRawTracesWindow({ id, title, traces, layout, frames, tableHeaders, tableRows, services, host }) {
    const existing = _openWindows.get(id);
    if (existing?.isVisible) {
        existing.bringToFront();
        return existing;
    }

    await ensurePlotly();

    // State
    let chartDiv = null;
    let chartCreated = false;
    let resizeObserver = null;
    let dataTable = null;
    let managedWindow = null;

    // ── Build content DOM ───────────────────────────────────────────

    const container = document.createElement('div');
    container.className = 'twm-plot-window-container';

    // Tab header
    const tabHeader = document.createElement('div');
    tabHeader.className = 'twm-code-tabs-header';

    const tabs = document.createElement('div');
    tabs.className = 'tabs twm-code-tabs';

    const plotTab = document.createElement('button');
    plotTab.className = 'twm-code-tab active';
    plotTab.type = 'button';
    plotTab.textContent = 'Plot';

    const dataTab = document.createElement('button');
    dataTab.className = 'twm-code-tab';
    dataTab.type = 'button';
    dataTab.textContent = 'Data';

    tabs.appendChild(plotTab);
    tabs.appendChild(dataTab);

    // Toolbar (same layout as PlotPopoutWindow)
    const toolbar = document.createElement('div');
    toolbar.className = 'twm-plot-window-toolbar';

    const spacer = document.createElement('div');
    spacer.style.flex = '1';
    toolbar.appendChild(spacer);

    const actionsGroup = document.createElement('div');
    actionsGroup.className = 'twm-plot-window-toolbar__group';

    const mkBtn = (icon, tooltip, onClick) => {
        const btn = document.createElement('button');
        btn.className = 'twm-btn-icon twm-has-tooltip';
        btn.type = 'button';
        btn.setAttribute('data-tooltip', tooltip);
        btn.innerHTML = `<span class="material-symbols-outlined">${icon}</span>`;
        btn.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
        return btn;
    };

    actionsGroup.appendChild(mkBtn('image', 'Download plot as PNG', downloadPNG));
    actionsGroup.appendChild(mkBtn('download', 'Download data as CSV', downloadCSV));
    toolbar.appendChild(actionsGroup);

    tabHeader.appendChild(tabs);
    tabHeader.appendChild(toolbar);

    // Tab content
    const content = document.createElement('div');
    content.className = 'twm-plot-window-content';

    const plotContent = document.createElement('div');
    plotContent.className = 'twm-plot-tab-content active';
    plotContent.setAttribute('data-tab', 'plot');
    plotContent.style.cssText = 'display:flex; flex-direction:column;';

    chartDiv = document.createElement('div');
    chartDiv.className = 'twm-plot-window-chart';
    plotContent.appendChild(chartDiv);

    const dataContent = document.createElement('div');
    dataContent.className = 'twm-plot-tab-content';
    dataContent.setAttribute('data-tab', 'data');
    dataContent.style.cssText = 'display:none; flex-direction:column;';

    const dataTableContainer = document.createElement('div');
    dataTableContainer.style.cssText = 'flex:1; min-height:0; display:flex; flex-direction:column;';
    dataContent.appendChild(dataTableContainer);

    content.appendChild(plotContent);
    content.appendChild(dataContent);

    container.appendChild(tabHeader);
    container.appendChild(content);

    // Tab switching
    plotTab.addEventListener('click', () => {
        plotTab.classList.add('active');
        dataTab.classList.remove('active');
        toolbar.style.display = '';
        plotContent.style.display = 'flex';
        dataContent.style.display = 'none';
        if (chartCreated && window.Plotly && chartDiv) {
            try { window.Plotly.Plots.resize(chartDiv); } catch (_) {}
        }
    });

    dataTab.addEventListener('click', () => {
        dataTab.classList.add('active');
        plotTab.classList.remove('active');
        toolbar.style.display = 'none';
        plotContent.style.display = 'none';
        dataContent.style.display = 'flex';
        if (!dataTable && tableHeaders?.length) {
            dataTable = new DataTable(dataTableContainer, {
                headers: tableHeaders,
                rows: tableRows || [],
                pagination: true,
                pageSize: 100,
                selectable: true,
                copyable: true,
                sortable: true,
                filterable: true,
                readonly: true,
                emptyMessage: 'No data available',
                services,
                host,
            });
            dataTable.render();
        }
    });

    // ── Create window ───────────────────────────────────────────────

    function dispose() {
        if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null; }
        if (dataTable) { dataTable.dispose(); dataTable = null; }
        if (chartDiv && window.Plotly) { try { purge(chartDiv); } catch (_) {} }
        chartDiv = null;
        chartCreated = false;
        managedWindow = null;
        _openWindows.delete(id);
    }

    managedWindow = new ManagedWindow({
        id: `raw-plot-${id}`,
        title: title || 'Chart',
        icon: 'monitoring',
        content: container,
        minWidth: 500,
        minHeight: 400,
        defaultWidth: 800,
        defaultHeight: 600,
        canMinimize: true,
        canMaximize: true,
        canResize: true,
        canDrag: true,
        onClose: dispose,
    });

    const handle = {
        get isVisible() { return managedWindow?.isVisible ?? false; },
        bringToFront() { managedWindow?.bringToFront?.(); },
        close() { managedWindow?.close?.(); },
    };

    _openWindows.set(id, handle);
    managedWindow.show();

    // Render plot
    const defaultMargin = { l: 60, r: 30, t: 40, b: 60 };
    const plotLayout = {
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent',
        font: { family: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif', color: '#cccccc', size: 11 },
        hoverlabel: {
            bgcolor: '#1e2228',
            bordercolor: '#444444',
            font: { family: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif', color: '#cccccc' },
        },
        autosize: true,
        hovermode: 'x unified',
        ...layout,
        margin: { ...defaultMargin, ...(layout?.margin || {}) },
    };

    await window.Plotly.newPlot(chartDiv, traces, plotLayout, {
        responsive: true,
        displayModeBar: true,
        displaylogo: false,
        modeBarButtonsToRemove: ['lasso2d', 'select2d', 'toImage'],
    });
    if (Array.isArray(frames) && frames.length) {
        try { await window.Plotly.addFrames(chartDiv, frames); }
        catch (err) { console.warn('[openRawTracesWindow] addFrames failed:', err); }
    }
    chartCreated = true;

    // Resize observer
    resizeObserver = createRafResizeObserver(() => {
        if (chartDiv && chartCreated && window.Plotly) {
            try { window.Plotly.Plots.resize(chartDiv); } catch (_) {}
        }
    });
    resizeObserver.observe(plotContent);

    // ── Download helpers ────────────────────────────────────────────

    function notify(ntitle, message, severity = 'info') {
        services?.eventBus?.emit?.('toast:show', { title: ntitle, message, type: severity });
    }

    async function downloadPNG() {
        if (!chartDiv || !chartCreated || !window.Plotly) {
            notify('Download', 'Plot not ready', 'warn');
            return;
        }
        const filename = `${(title || 'chart').replace(/[^a-z0-9]/gi, '_')}.png`;
        try {
            const dataUrl = await window.Plotly.toImage(chartDiv, {
                format: 'png', width: 1920, height: 1080, scale: 2,
            });
            // null <=> no save dialog behind the capability (host.js) -> fall back.
            const dialogs = host?.dialogs;
            const result = dialogs
                ? await dialogs.saveFile({ data: dataUrl.split(',')[1], filename, kind: 'png' })
                : null;
            if (result) {
                if (result.ok) notify('Download', `Plot saved to ${result.path}`, 'success');
                else if (!result.cancelled) notify('Download', result.error || 'Failed to save image', 'error');
            } else {
                const link = document.createElement('a');
                link.href = dataUrl;
                link.download = filename;
                link.click();
                notify('Download', 'PNG download started', 'info');
            }
        } catch (err) {
            console.error('[openRawTracesWindow] PNG download failed:', err);
            notify('Download', 'Failed to generate PNG', 'error');
        }
    }

    async function downloadCSV() {
        if (!tableRows?.length) {
            notify('Download', 'No data available to download', 'warn');
            return;
        }
        const filename = `${(title || 'data').replace(/[^a-z0-9]/gi, '_')}_data.csv`;
        const csvEscape = (val) => {
            if (val == null) return '';
            const str = String(val);
            return (str.includes(',') || str.includes('"') || str.includes('\n'))
                ? `"${str.replace(/"/g, '""')}"` : str;
        };
        const lines = [(tableHeaders || []).join(',')];
        for (const row of tableRows) lines.push(row.map(csvEscape).join(','));
        const csv = lines.join('\n');

        // null <=> no save dialog behind the capability (host.js) -> fall back.
        const dialogs = host?.dialogs;
        let result = null;
        if (dialogs) {
            try {
                result = await dialogs.saveFile({ data: csv, filename, kind: 'csv' });
            } catch (err) {
                console.error('[openRawTracesWindow] CSV download failed:', err);
                notify('Download', 'Failed to save file', 'error');
                return;
            }
        }
        if (result) {
            if (result.ok) notify('Download', `Saved ${tableRows.length} rows to ${result.path}`, 'success');
            else if (!result.cancelled) notify('Download', result.error || 'Failed to save file', 'error');
        } else {
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            link.click();
            URL.revokeObjectURL(url);
            notify('Download', 'Download started', 'info');
        }
    }

    return handle;
}
