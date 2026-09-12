/**
 * data_table.js
 *
 * Unified, reusable data table component with support for:
 * - Pagination (first/prev/next/last/jump to row)
 * - Row selection (single, range with Shift, toggle with Ctrl/Cmd)
 * - Keyboard shortcuts (Ctrl+A, Ctrl+C, Shift+Ctrl+C, Esc)
 * - Context menu (copy as TSV/CSV)
 * - Column sorting (internal or external via callback)
 * - Column drag-to-resize, and double-click-to-auto-size on the same grip
 * - Per-column filtering (numeric operators, text substring)
 * - Column type detection (numeric/text alignment)
 * - Header icons
 * - Read-only mode
 * - CSV download through the host port (native save dialog), with a
 *   Blob + <a download> fallback when no host is supplied
 *
 * Used by: DataPage, PlotPopoutWindow, StatisticsTable, Import Wizard
 */

import { createRafResizeObserver } from '../utils/raf_resize_observer.js';

const DEFAULT_PAGE_SIZE = 100;

/** How wide auto-sizing a column is allowed to make it.
 *
 *  520px, which is `_fitColumnWidths`' FIRST_CAP — the most generous ceiling
 *  this file already sanctions for a single column. Auto-size is an explicit
 *  gesture asking to see a column's content, so it is not held to the tighter
 *  360px the automatic fit pass applies to the columns it is squeezing; but it
 *  is held to SOMETHING, because one 4,000-character note in one cell would
 *  otherwise produce a column nobody can scroll past. */
const AUTOSIZE_MAX_PX = 520;

/**
 * Configuration options for DataTable
 * @typedef {Object} DataTableConfig
 * @property {string[]} headers - Column headers
 * @property {Array<Array>} rows - Row data (array of arrays)
 * @property {number} [pageSize=100] - Rows per page
 * @property {boolean} [pagination=true] - Enable pagination controls
 * @property {boolean} [selectable=true] - Enable row selection
 * @property {boolean} [copyable=true] - Enable copy shortcuts and context menu
 * @property {boolean} [sortable=false] - Enable column sorting
 * @property {boolean} [filterable=false] - Enable per-column filter inputs
 * @property {boolean} [readonly=false] - Read-only mode (no selection/hover effects)
 * @property {boolean} [showRowNumbers=false] - Show row number column
 * @property {string} [emptyMessage='No data'] - Message when no data
 * @property {Function} [onSort] - Callback when sort changes: (column, ascending) => void
 * @property {Function} [onSelectionChange] - Callback when selection changes: (selectedIndices) => void
 * @property {Function} [formatValue] - Custom value formatter: (value, colIndex) => string
 * @property {Function} [getHeaderIcon] - Get icon for header: (header, colIndex) => {icon, title}
 * @property {Function} [getColumnType] - Get column type: (colIndex, rows) => 'num'|'text'
 * @property {Object} [services] - App services { eventBus, logger } for notifications
 * @property {number} [totalCount] - Total row count for server-side pagination (when rows only contains current page)
 * @property {number} [offset=0] - Current offset for server-side pagination
 * @property {Function} [onPageChange] - Callback for server-side pagination: (offset, limit) => void
 * @property {Function} [onJumpToRow] - Callback for jump to row: (rowIndex) => void
 * @property {Function} [renderCell] - Custom cell renderer: (td, value, colIdx, rowIdx, row) => boolean (return true if handled)
 * @property {'normal'|'compact'} [mode='normal'] - Rendering density. 'compact' adds `data-table-component--compact` to the wrapper (tighter padding + smaller font for the bottom-panel use case).
 * @property {Function} [onRowClick] - Row click handler: (rowIdx, row, ev) => void. Receives the original (unfiltered) row index.
 * @property {Function} [onRowContextMenu] - Row right-click handler: (rowIdx, row, ev) => void. Fires before the default context menu; call ev.preventDefault() to suppress the default.
 * @property {Function} [onCellContextMenu] - Cell right-click handler: (colIdx, rowIdx, value, td, ev) => void. Fires before onRowContextMenu; same suppression semantics.
 * @property {boolean} [showExportButton=false] - Adds a "CSV" download button to the pagination strip that invokes `downloadCSV()`.
 * @property {Object} [host] - A Host (see ui/js/host/host.js). Its `dialogs` capability backs `downloadCSV()`'s native save dialog; without it CSV export falls back to a Blob download.
 * @property {Object} [stateStore] - `{ ready(), get(key), set(key, state) }` — REQUIRED when `persistKey` is set. Built by `createTableStateStore()`.
 * @property {'container'|'content'} [columnFit='container'] - How the automatic fit pass sizes a column the user has NOT dragged. 'container' squeezes every column into the wrap: a 360px cap, a more generous one for the first column, and water-fill-shrink toward the 40px floor when they do not fit. 'content' sizes each column to its own content through the same `_autoWidth` a grip double-click uses (520px cap) and lets the body scroll sideways rather than squeezing. A pinned column is honoured verbatim under both.
 */

export class DataTable {
    /**
     * Create a DataTable instance
     * @param {HTMLElement} container - Container element to render into
     * @param {DataTableConfig} config - Configuration options
     */
    constructor(container, config = {}) {
        this.container = container;
        this.config = {
            headers: [],
            rows: [],
            pageSize: DEFAULT_PAGE_SIZE,
            pagination: true,
            selectable: true,
            copyable: true,
            sortable: false,
            filterable: false,
            readonly: false,
            showRowNumbers: false,
            emptyMessage: 'No data',
            onSort: null,
            onSelectionChange: null,
            formatValue: null,
            getHeaderIcon: null,
            getColumnType: null,
            services: null,
            // Server-side pagination
            totalCount: null,
            offset: 0,
            onPageChange: null,
            onJumpToRow: null,
            // Custom cell rendering
            renderCell: null,
            // Rendering density + bottom-panel hooks (P2)
            mode: 'normal',
            onRowClick: null,
            onRowContextMenu: null,
            onCellContextMenu: null,
            showExportButton: false,
            // The host port. TOP LEVEL, deliberately — NOT inside `services`,
            // which most call sites never pass. Supplies the native save
            // dialog for downloadCSV(); absent => Blob fallback.
            host: null,
            // Opt-in persistence: when set, this table's sort, filters, and
            // column widths survive teardown/reload, keyed by this string
            // inside the injected `stateStore`. Omit it and the table stays
            // ephemeral. WHERE the store persists is the embedder's business.
            persistKey: null,
            stateStore: null,
            // How the automatic fit pass sizes an undragged column — see the
            // typedef. 'container' is exactly what every consumer got before
            // this key existed, so the default is not a preference: it is the
            // promise that adding the key changed no existing layout by a
            // pixel. Only a consumer that asks for 'content' sees anything new.
            columnFit: 'container',
            ...config,
        };

        // A persistKey with nowhere to persist is a wiring bug, not a
        // degraded mode. Fail loud at construction: a silent no-op here
        // reads as "my filters randomly stopped sticking" months later.
        if (this.config.persistKey && !this.config.stateStore) {
            throw new Error(`DataTable: persistKey "${this.config.persistKey}" requires { stateStore }`);
        }

        // State
        this._state = {
            offset: 0,
            selected: new Set(),
            anchorIndex: null,
            sortColumn: null,
            sortAscending: true,
            filters: new Map(),
        };

        // Column types cache
        this._columnTypes = [];

        // Processed rows cache (filtered + sorted)
        this._processedRows = null;
        this._processedIndexMap = null;
        this._filterDebounceTimer = null;

        // DOM references
        this._wrapperEl = null;
        this._paginationEl = null;
        this._tableEl = null;
        this._tbodyEl = null;
        this._contextMenuEl = null;
        this._filterDropdownEl = null;
        this._filterDropdownCleanup = null;

        // User column-resize overrides, keyed by DOM column index (the
        // row-number column, when shown, is index 0). Persists across
        // re-renders; reset when the header signature changes.
        this._colWidths = {};
        this._colWidthsSig = null;

        // Event cleanup
        this._disposers = [];
        this._contextMenuGlobals = [];

        // Persistence: seed from whatever's already cached, then — once
        // the on-disk blob has loaded — re-apply and re-render if state
        // arrived after this table first painted.
        if (this.config.persistKey) {
            const store = this.config.stateStore;
            this._restorePersisted(store.get(this.config.persistKey));
            store.ready().then(() => {
                const late = store.get(this.config.persistKey);
                if (late && this._restorePersisted(late) && this._wrapperEl) {
                    this._invalidateProcessedCache?.();
                    this.render();
                }
            });
        }
    }

    /** Apply a persisted blob ({sort, asc, filters, widths}) onto this
     *  table's live state. Returns true if anything was applied. */
    _restorePersisted(blob) {
        if (!blob) return false;
        let applied = false;
        if (typeof blob.sortColumn === 'number' || blob.sortColumn === null) {
            this._state.sortColumn = blob.sortColumn;
            this._state.sortAscending = blob.sortAscending !== false;
            applied = true;
        }
        if (Array.isArray(blob.filters)) {
            this._state.filters = new Map(blob.filters);
            applied = true;
        }
        if (blob.colWidths && typeof blob.colWidths === 'object') {
            // Stored under string keys (JSON) → coerce back to ints.
            this._colWidths = {};
            for (const [k, v] of Object.entries(blob.colWidths)) {
                this._colWidths[Number(k)] = v;
            }
            // Stamp the matching signature so the next render keeps these
            // widths instead of treating them as stale.
            this._colWidthsSig = this._colSig();
            applied = true;
        }
        return applied;
    }

    /** Identity of the current column set — restored widths/sort are
     *  keyed by position, so a schema change invalidates them. */
    _colSig() {
        return (this.config.headers || []).join('\x01')
            + (this.config.showRowNumbers ? '|#' : '');
    }

    /** Snapshot the persistable slice of state to the project store.
     *  No-op unless `persistKey` is set. Debounced inside the store. */
    _savePersisted() {
        if (!this.config.persistKey) return;
        this.config.stateStore.set(this.config.persistKey, {
            sortColumn: this._state.sortColumn,
            sortAscending: this._state.sortAscending,
            filters: [...this._state.filters.entries()],
            colWidths: { ...this._colWidths },
        });
    }

    /**
     * Update data and re-render
     * @param {Object} updates - Partial config updates (headers, rows, etc.)
     */
    setData(updates) {
        // Clear filters if headers changed
        if (updates.headers && this._state.filters.size > 0) {
            const oldHeaders = this.config.headers;
            const newHeaders = updates.headers;
            if (oldHeaders.length !== newHeaders.length ||
                oldHeaders.some((h, i) => h !== newHeaders[i])) {
                this._state.filters.clear();
            }
        }

        Object.assign(this.config, updates);

        // Reset state if rows changed
        if (updates.rows) {
            this._state.selected.clear();
            this._state.anchorIndex = null;
            if (this._state.offset >= updates.rows.length) {
                this._state.offset = 0;
            }
            this._columnTypes = this._detectColumnTypes();
        }

        // Invalidate processed cache
        this._processedRows = null;
        this._processedIndexMap = null;

        this.render();
    }

    /**
     * Show / hide a translucent loading overlay over the table body.
     * Used by server-side consumers between firing a fetch and
     * receiving the new rows so the UI doesn't appear frozen.
     * Callers either:
     *   - call `setLoading(true)` before their fetch, `setLoading(false)` after, OR
     *   - return a Promise from `onPageChange` / `onSort` callbacks
     *     — the overlay auto-shows during the await.
     * @param {boolean} on
     */
    setLoading(on) {
        if (!this._wrapperEl) return;
        let overlay = this._wrapperEl.querySelector('.twm-data-table__loading');
        if (on) {
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.className = 'twm-data-table__loading';
                overlay.innerHTML =
                    '<div class="twm-data-table__spinner"></div>';
                // Ensure positioning context.
                if (!this._wrapperEl.style.position) {
                    this._wrapperEl.style.position = 'relative';
                }
                this._wrapperEl.appendChild(overlay);
            }
        } else if (overlay) {
            overlay.remove();
        }
    }

    /**
     * Get current selection indices
     * @returns {number[]} Array of selected row indices
     */
    getSelection() {
        return Array.from(this._state.selected).sort((a, b) => a - b);
    }

    /**
     * Set selection programmatically
     * @param {number[]} indices - Row indices to select
     */
    setSelection(indices) {
        this._state.selected.clear();
        for (const idx of indices) {
            if (idx >= 0 && idx < this.config.rows.length) {
                this._state.selected.add(idx);
            }
        }
        this._updateRowSelection();
        this._notifySelectionChange();
    }

    /**
     * Clear selection
     */
    clearSelection() {
        this._state.selected.clear();
        this._state.anchorIndex = null;
        this._updateRowSelection();
        this._notifySelectionChange();
    }

    /**
     * Go to specific page
     * @param {number} page - Page number (0-indexed)
     */
    goToPage(page) {
        const rowCount = this._getProcessedRows().length;
        const maxPage = Math.ceil(rowCount / this.config.pageSize) - 1;
        this._state.offset = Math.max(0, Math.min(page, maxPage)) * this.config.pageSize;
        this.render();
    }

    /**
     * Go to specific row
     * @param {number} rowIndex - Row index
     */
    goToRow(rowIndex) {
        const rowCount = this._getProcessedRows().length;
        const idx = Math.max(0, Math.min(rowIndex, rowCount - 1));
        this._state.offset = Math.floor(idx / this.config.pageSize) * this.config.pageSize;
        this.render();
    }

    /**
     * Sort by column
     * @param {number} colIndex - Column index
     * @param {boolean} [ascending] - Sort direction (toggles if same column)
     */
    sortBy(colIndex, ascending) {
        if (this._state.sortColumn === colIndex && ascending === undefined) {
            this._state.sortAscending = !this._state.sortAscending;
        } else {
            this._state.sortColumn = colIndex;
            this._state.sortAscending = ascending ?? true;
        }

        // Invalidate processed cache
        this._processedRows = null;
        this._processedIndexMap = null;

        // Auto-spinner: if the sort handler returns a Promise (i.e.
        // it does a server-side refetch), show the loading overlay
        // until it resolves so the user gets visible feedback.
        const ret = this.config.onSort?.(colIndex, this._state.sortAscending);
        this._awaitWithSpinner(ret);
        this._savePersisted();
        this.render();
    }

    /** Internal: if `maybePromise` is a Promise (or thenable),
     * toggle the loading overlay around it. No-op otherwise. */
    _awaitWithSpinner(maybePromise) {
        if (!maybePromise || typeof maybePromise.then !== 'function') return;
        this.setLoading(true);
        Promise.resolve(maybePromise).finally(() => this.setLoading(false));
    }

    /**
     * Clear all column filters
     */
    clearFilters() {
        this._state.filters.clear();
        this._processedRows = null;
        this._processedIndexMap = null;
        this._state.offset = 0;
        this._savePersisted();
        this.render();
    }

    /**
     * Get the number of rows after filtering
     * @returns {number}
     */
    getFilteredRowCount() {
        return this._getProcessedRows().length;
    }

    /**
     * Render the table
     */
    render() {
        // Capture active filter input before re-render
        const activeFilterColIdx = this._getActiveFilterColIdx();

        this._cleanup();
        this.container.innerHTML = '';

        const { rows, pagination, emptyMessage } = this.config;

        // Drop stale column-resize overrides when the columns change —
        // widths are keyed by position, so a different schema must start
        // from natural widths rather than inherit the old ones. (Restore
        // stamps the matching signature so persisted widths survive the
        // first render.)
        const colSig = this._colSig();
        if (this._colWidthsSig !== colSig) {
            this._colWidths = {};
            this._colWidthsSig = colSig;
        }

        // Detect column types if not cached
        if (this._columnTypes.length === 0) {
            this._columnTypes = this._detectColumnTypes();
        }

        // Create wrapper. Compact mode adds a modifier class that the
        // CSS uses to tighten padding + drop font size — opt-in so
        // existing landing/tab use sites stay identical.
        this._wrapperEl = document.createElement('div');
        this._wrapperEl.className = 'twm-data-table-component'
            + (this.config.mode === 'compact' ? ' twm-data-table-component--compact' : '');
        this._wrapperEl.style.cssText = 'display:flex; flex-direction:column; height:100%; min-height:0;';

        // Pagination (top). `_createPagination` returns null when the
        // strip would be uninformative (single page, no active filter).
        if (pagination && rows.length > 0) {
            this._paginationEl = this._createPagination();
            if (this._paginationEl) this._wrapperEl.appendChild(this._paginationEl);
        }

        // ── Structural split: thead and tbody live in separate
        // containers so the scrollbar appears only over the body,
        // never over the header / filter row. Column widths are
        // measured from the body after layout and applied to the
        // header via `table-layout: fixed` + explicit cell widths.
        const tableWrap = document.createElement('div');
        tableWrap.className = this.config.readonly
            ? 'twm-preview-table-wrap twm-preview-table-wrap--wizard'
            : 'twm-preview-table-wrap';
        tableWrap.style.cssText = 'flex:1 1 0; min-height:0; min-width:0; overflow:auto;';

        if (rows.length === 0) {
            // Empty state — render the same chrome as the data table
            // (header row in its own non-scrolling wrap) followed by a
            // single virtual row spanning every column with the empty
            // message in italics. NO filter row: there's nothing to
            // filter, so it'd only mislead the user.
            const { headers, showRowNumbers } = this.config;
            const headerWrap = document.createElement('div');
            headerWrap.className = 'twm-preview-table-header-wrap';
            headerWrap.style.cssText
                = 'flex:0 0 auto; overflow:hidden; min-width:0;';
            const headerTable = document.createElement('table');
            headerTable.className = this.config.readonly
                ? 'twm-preview-table twm-preview-table--readonly'
                : 'twm-preview-table';
            const thead = document.createElement('thead');
            const tr = document.createElement('tr');
            if (showRowNumbers) {
                const th = document.createElement('th');
                th.className = 'num';
                th.textContent = '#';
                tr.appendChild(th);
            }
            headers.forEach((h, colIdx) => {
                const th = document.createElement('th');
                th.className = this._columnTypes[colIdx] || 'text';
                th.textContent = h;
                tr.appendChild(th);
            });
            thead.appendChild(tr);
            headerTable.appendChild(thead);
            headerWrap.appendChild(headerTable);
            this._wrapperEl.appendChild(headerWrap);
            this._headerWrapEl = headerWrap;
            this._headerTableEl = headerTable;

            // Body: one virtual row across every column with the empty
            // message in italics. Wraps in the standard scroll container
            // so the placeholder sits where data rows would.
            const bodyTable = document.createElement('table');
            bodyTable.className = headerTable.className;
            const tbody = document.createElement('tbody');
            const emptyTr = document.createElement('tr');
            emptyTr.className = 'data-preview-row data-table__empty-row';
            const colCount = headers.length + (showRowNumbers ? 1 : 0);
            const emptyTd = document.createElement('td');
            emptyTd.colSpan = colCount;
            emptyTd.style.cssText
                = 'text-align:center; font-style:italic; color:#888; padding:16px;';
            emptyTd.textContent = emptyMessage;
            emptyTr.appendChild(emptyTd);
            tbody.appendChild(emptyTr);
            bodyTable.appendChild(tbody);
            tableWrap.appendChild(bodyTable);
            this._wrapperEl.appendChild(tableWrap);
            this._tableEl = bodyTable;
            this._tableWrapEl = tableWrap;
            // No column-width sync needed — the body row has colspan=N
            // so there's nothing per-column to align against.
        } else {
            const fullTable = this._createTable();
            this._tableEl = fullTable;
            // Extract thead → header table in its own non-scrolling
            // container. The body table keeps tbody only.
            const thead = fullTable.querySelector('thead');
            if (thead) {
                const headerWrap = document.createElement('div');
                headerWrap.className = 'twm-preview-table-header-wrap';
                headerWrap.style.cssText
                    = 'flex:0 0 auto; overflow:hidden; min-width:0;';
                const headerTable = document.createElement('table');
                headerTable.className = fullTable.className;
                headerTable.appendChild(thead);
                headerWrap.appendChild(headerTable);
                this._wrapperEl.appendChild(headerWrap);
                this._headerTableEl = headerTable;
                this._headerWrapEl = headerWrap;
            } else {
                this._headerTableEl = null;
            }
            tableWrap.appendChild(fullTable);
            this._wrapperEl.appendChild(tableWrap);
        }

        this._tableWrapEl = tableWrap;
        this.container.appendChild(this._wrapperEl);

        // Sync header column widths to body after layout. Two-pass: the
        // first frame lets the browser settle natural widths from the
        // body's auto layout, then we lock both tables to those widths
        // via table-layout:fixed + explicit cell widths.
        if (this._headerTableEl && this._tableEl) {
            requestAnimationFrame(() => this._syncHeaderWidths());
            // Re-sync on container resize so columns stay aligned when
            // the parent flex / grid layout changes (window resize,
            // splitter drag, etc.).
            if (this._resizeObserver) {
                try { this._resizeObserver.disconnect(); } catch (_) {}
            }
            if (typeof ResizeObserver !== 'undefined') {
                this._resizeObserver = createRafResizeObserver(
                    () => this._syncHeaderWidths());
                this._resizeObserver.observe(this._wrapperEl);
            }
            // The header lives in its own non-scrolling wrap (so it can't
            // escape vertically), but that means it also won't follow the
            // body's HORIZONTAL scroll on its own — translate it to match.
            this._installHeaderScrollSync();
            // Drag-to-resize handles on each header cell. Only meaningful
            // when there are body rows to size against.
            if (rows.length > 0) this._installColumnResizers();
        }

        // Install interactions (readonly only prevents editing, not selection/copy)
        if (rows.length > 0 && (this.config.selectable || this.config.copyable || !this.config.readonly)) {
            this._installInteractions();
        }

        // Restore focus to filter input if it was active
        if (activeFilterColIdx !== null) {
            this._restoreFilterFocus(activeFilterColIdx);
        }
    }

    /**
     * Copy selected rows to clipboard
     * @param {'tsv'|'csv'} [format='tsv'] - Output format
     */
    async copyToClipboard(format = 'tsv') {
        const indices = this.getSelection();
        if (indices.length === 0) {
            this._notify('Copy', 'No rows selected.', 'warn');
            return;
        }

        const { headers, rows } = this.config;
        const matrix = [headers];

        for (const idx of indices) {
            const row = rows[idx];
            if (row) {
                matrix.push(row.map((val, colIdx) => this._formatValue(val, colIdx)));
            }
        }

        const separator = format === 'csv' ? ',' : '\t';
        const text = format === 'csv'
            ? matrix.map(row => row.map(cell => this._csvEscape(cell)).join(separator)).join('\n')
            : matrix.map(row => row.join(separator)).join('\n');

        let ok = false;
        try {
            await navigator.clipboard.writeText(text);
            ok = true;
        } catch (_) {
            ok = this._fallbackCopy(text);
        }

        if (ok) {
            const desc = indices.length === 1 ? 'row' : 'rows';
            const suffix = format === 'csv' ? ' as CSV' : '';
            this._notify('Copy', `Copied ${indices.length} ${desc}${suffix}.`, 'info');
        } else {
            this._notify('Copy', 'Clipboard unavailable.', 'warn');
        }

        this._hideContextMenu();
    }

    /**
     * Download all data as CSV
     * @param {string} [filename='data.csv'] - Filename for download
     */
    async downloadCSV(filename = 'data.csv') {
        const { headers, rows } = this.config;
        if (rows.length === 0) {
            this._notify('Download', 'No data to download.', 'warn');
            return;
        }

        const lines = [headers.join(',')];
        for (const row of rows) {
            lines.push(row.map((val, colIdx) =>
                this._csvEscape(this._formatValue(val, colIdx))
            ).join(','));
        }

        const csv = lines.join('\n');

        // Native save dialog when the embedder supplies one.
        //
        // `saveFile` resolves to null when a host advertises `dialogs` but its
        // transport has no save dialog behind it (host.js: null <=> unavailable).
        // That is NOT a failed save — it means "I can't do this, use your own
        // way", so it must reach the Blob fallback below, not the error toast.
        const dialogs = this.config.host?.dialogs;
        let result = null;
        if (dialogs) {
            try {
                // Send plain text CSV - Python handles text files directly (no base64)
                result = await dialogs.saveFile({ data: csv, filename, kind: 'csv' });
            } catch (err) {
                console.error('[DataTable] CSV download failed:', err);
                this._notify('Download', 'Failed to save file', 'error');
                return;
            }
        }
        if (result) {
            if (result.ok) {
                this._notify('Download', `Saved ${rows.length} rows to ${result.path}`, 'success');
            } else if (!result.cancelled) {
                this._notify('Download', result.error || 'Failed to save file', 'error');
            }
            return;
        }

        // Fallback: no `dialogs` capability at all, or a host that has one but
        // cannot actually save. Both mean "download it yourself".
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
        this._notify('Download', 'Download started', 'info');
    }

    /**
     * Dispose and cleanup
     */
    dispose() {
        this._cleanup();
        this._closeFilterDropdown();
        this._teardownContextMenu();
        if (this._resizeObserver) {
            try { this._resizeObserver.disconnect(); } catch (_) {}
            this._resizeObserver = null;
        }
        if (this._onBodyScroll && this._scrollSyncEl) {
            try {
                this._scrollSyncEl.removeEventListener('scroll', this._onBodyScroll);
            } catch (_) {}
            this._onBodyScroll = null;
            this._scrollSyncEl = null;
        }
        this.container.innerHTML = '';
        this._wrapperEl = null;
        this._paginationEl = null;
        this._tableEl = null;
        this._tbodyEl = null;
        this._headerTableEl = null;
        this._headerWrapEl = null;
        this._tableWrapEl = null;
        this._processedRows = null;
        this._processedIndexMap = null;
    }

    // ─────────────────────────────────────────────────────────────────
    // Processed rows pipeline (filter → sort → cache)
    // ─────────────────────────────────────────────────────────────────

    _getProcessedRows() {
        if (this._processedRows !== null) return this._processedRows;

        const isServerSide = typeof this.config.onPageChange === 'function';
        let rows = this.config.rows;
        let indexMap = rows.map((_, i) => i);

        // Apply filters (client-side only)
        if (!isServerSide && this._state.filters.size > 0) {
            const result = this._applyFilters(rows, indexMap);
            rows = result.rows;
            indexMap = result.indexMap;
        }

        // Apply sort (client-side, only when no external onSort handler)
        if (!isServerSide && this.config.sortable && this._state.sortColumn !== null && !this.config.onSort) {
            const result = this._applySorting(rows, indexMap);
            rows = result.rows;
            indexMap = result.indexMap;
        }

        this._processedRows = rows;
        this._processedIndexMap = indexMap;
        return rows;
    }

    _applyFilters(rows, indexMap) {
        const filters = this._state.filters;
        const filteredRows = [];
        const filteredMap = [];

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            let pass = true;

            for (const [colIdx, filterText] of filters) {
                if (!filterText) continue;
                const value = row[colIdx];
                const colType = this._columnTypes[colIdx];

                if (colType === 'num') {
                    if (!this._matchNumericFilter(value, filterText)) { pass = false; break; }
                } else {
                    if (!this._matchTextFilter(value, filterText)) { pass = false; break; }
                }
            }

            if (pass) {
                filteredRows.push(row);
                filteredMap.push(indexMap[i]);
            }
        }

        return { rows: filteredRows, indexMap: filteredMap };
    }

    _applySorting(rows, indexMap) {
        const colIdx = this._state.sortColumn;
        const asc = this._state.sortAscending;

        // Build paired array for stable sort with index tracking
        const paired = rows.map((row, i) => ({ row, origIdx: indexMap[i] }));
        const isNumeric = this._columnTypes[colIdx] === 'num';

        paired.sort((a, b) => {
            let valA = a.row[colIdx];
            let valB = b.row[colIdx];

            if (valA == null && valB == null) return 0;
            if (valA == null) return 1;
            if (valB == null) return -1;

            if (isNumeric) {
                valA = typeof valA === 'number' ? valA : parseFloat(valA);
                valB = typeof valB === 'number' ? valB : parseFloat(valB);
                if (!Number.isFinite(valA)) return 1;
                if (!Number.isFinite(valB)) return -1;
            } else {
                valA = String(valA).toLowerCase();
                valB = String(valB).toLowerCase();
            }

            let cmp = 0;
            if (valA < valB) cmp = -1;
            else if (valA > valB) cmp = 1;

            return asc ? cmp : -cmp;
        });

        return {
            rows: paired.map(p => p.row),
            indexMap: paired.map(p => p.origIdx),
        };
    }

    _matchNumericFilter(value, filterText) {
        const text = filterText.trim();
        if (!text) return true;

        const numVal = (typeof value === 'number') ? value : parseFloat(value);
        if (!Number.isFinite(numVal)) return false;

        // Range: "10..100"
        const rangeMatch = text.match(/^(-?[\d.]+)\.\.(-?[\d.]+)$/);
        if (rangeMatch) {
            const lo = parseFloat(rangeMatch[1]);
            const hi = parseFloat(rangeMatch[2]);
            return numVal >= lo && numVal <= hi;
        }

        // Operator prefix: >=, <=, !=, >, <, =
        const opMatch = text.match(/^(>=|<=|!=|>|<|=)\s*(-?[\d.]+)$/);
        if (opMatch) {
            const op = opMatch[1];
            const target = parseFloat(opMatch[2]);
            if (!Number.isFinite(target)) return true;
            switch (op) {
                case '>':  return numVal > target;
                case '<':  return numVal < target;
                case '>=': return numVal >= target;
                case '<=': return numVal <= target;
                case '!=': return Math.abs(numVal - target) > 1e-9;
                case '=':  return Math.abs(numVal - target) <= 1e-9;
            }
        }

        // Plain number: equality
        const plain = parseFloat(text);
        if (Number.isFinite(plain)) {
            return Math.abs(numVal - plain) <= 1e-9;
        }

        return true;
    }

    _matchTextFilter(value, filterText) {
        if (!filterText) return true;
        const haystack = (value == null ? '' : String(value)).toLowerCase();
        const text = filterText.trim();

        // Exact match: ="value"
        if (text.startsWith('="') && text.endsWith('"')) {
            return haystack === text.slice(2, -1).toLowerCase();
        }
        // Not contains: !value
        if (text.startsWith('!')) {
            return !haystack.includes(text.slice(1).toLowerCase());
        }
        // Starts with: ^value
        if (text.startsWith('^')) {
            return haystack.startsWith(text.slice(1).toLowerCase());
        }
        // Ends with: value$
        if (text.endsWith('$')) {
            return haystack.endsWith(text.slice(0, -1).toLowerCase());
        }
        // Contains (default)
        return haystack.includes(text.toLowerCase());
    }

    _invalidateProcessedCache() {
        this._processedRows = null;
        this._processedIndexMap = null;
    }

    // ─────────────────────────────────────────────────────────────────
    // Filter row
    // ─────────────────────────────────────────────────────────────────

    _createFilterRow(headers) {
        const { showRowNumbers } = this.config;
        const tr = document.createElement('tr');
        tr.className = 'twm-data-table__filter-row';

        if (showRowNumbers) {
            const th = document.createElement('th');
            th.className = 'data-table__filter-cell data-table__filter-cell--empty';
            tr.appendChild(th);
        }

        headers.forEach((header, colIdx) => {
            const th = document.createElement('th');
            th.className = 'data-table__filter-cell';

            const wrapper = document.createElement('div');
            wrapper.className = 'twm-data-table__filter-wrapper';

            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'twm-data-table__filter-input';
            const isNumeric = this._columnTypes[colIdx] === 'num';
            input.placeholder = isNumeric ? 'e.g. >100' : 'Filter...';

            // Restore existing filter value
            const existingFilter = this._state.filters.get(colIdx);
            if (existingFilter) {
                input.value = existingFilter;
            }

            // Dropdown trigger button
            const dropdownBtn = document.createElement('button');
            dropdownBtn.type = 'button';
            dropdownBtn.className = 'twm-data-table__filter-dropdown-btn';
            dropdownBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:14px;">tune</span>';
            dropdownBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._openFilterDropdown(colIdx, th, input);
            });

            // Clear button
            const clearBtn = document.createElement('button');
            clearBtn.type = 'button';
            clearBtn.className = 'twm-data-table__filter-clear';
            clearBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:12px;">close</span>';
            clearBtn.style.display = existingFilter ? '' : 'none';
            clearBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                input.value = '';
                this._onFilterInput(colIdx, '');
                clearBtn.style.display = 'none';
                input.focus();
            });

            input.addEventListener('input', () => {
                clearBtn.style.display = input.value ? '' : 'none';
                this._onFilterInputDebounced(colIdx, input.value);
            });

            // Prevent sort from triggering when clicking in filter cell
            th.addEventListener('click', (e) => e.stopPropagation());

            wrapper.appendChild(input);
            wrapper.appendChild(dropdownBtn);
            wrapper.appendChild(clearBtn);
            th.appendChild(wrapper);
            tr.appendChild(th);
        });

        return tr;
    }

    // ─────────────────────────────────────────────────────────────────
    // Filter dropdown
    // ─────────────────────────────────────────────────────────────────

    _openFilterDropdown(colIdx, anchorEl, filterInput) {
        // Close any existing dropdown
        this._closeFilterDropdown();

        const isNumeric = this._columnTypes[colIdx] === 'num';
        const currentFilter = this._state.filters.get(colIdx) || '';
        const parsed = this._parseFilterForDropdown(currentFilter, isNumeric);

        // Build dropdown panel
        const panel = document.createElement('div');
        panel.className = 'twm-data-table__filter-dropdown';

        // Operator/mode select
        const selectLabel = document.createElement('label');
        selectLabel.className = 'twm-data-table__filter-dropdown-label';
        selectLabel.textContent = isNumeric ? 'Operator' : 'Mode';

        const select = document.createElement('select');
        select.className = 'twm-data-table__filter-dropdown-select';

        const options = isNumeric
            ? [
                { value: '=', label: 'Equals' },
                { value: '!=', label: 'Not equals' },
                { value: '>', label: 'Greater than' },
                { value: '>=', label: 'Greater or equal' },
                { value: '<', label: 'Less than' },
                { value: '<=', label: 'Less or equal' },
                { value: '..', label: 'Between' },
            ]
            : [
                { value: 'contains', label: 'Contains' },
                { value: 'equals', label: 'Equals' },
                { value: 'starts', label: 'Starts with' },
                { value: 'ends', label: 'Ends with' },
                { value: 'not', label: 'Not contains' },
            ];

        for (const opt of options) {
            const optEl = document.createElement('option');
            optEl.value = opt.value;
            optEl.textContent = opt.label;
            if (opt.value === parsed.operator) optEl.selected = true;
            select.appendChild(optEl);
        }

        // Value input
        const valueLabel = document.createElement('label');
        valueLabel.className = 'twm-data-table__filter-dropdown-label';
        valueLabel.textContent = 'Value';

        const valueInput = document.createElement('input');
        valueInput.type = isNumeric ? 'number' : 'text';
        valueInput.className = 'twm-data-table__filter-dropdown-input';
        valueInput.placeholder = isNumeric ? 'Number...' : 'Text...';
        valueInput.value = parsed.value;

        // Second value input (for "between")
        const value2Label = document.createElement('label');
        value2Label.className = 'twm-data-table__filter-dropdown-label';
        value2Label.textContent = 'And';

        const value2Input = document.createElement('input');
        value2Input.type = 'number';
        value2Input.className = 'twm-data-table__filter-dropdown-input';
        value2Input.placeholder = 'Number...';
        value2Input.value = parsed.value2;

        const value2Container = document.createElement('div');
        value2Container.className = 'twm-data-table__filter-dropdown-between';
        value2Container.style.display = (isNumeric && parsed.operator === '..') ? '' : 'none';
        value2Container.appendChild(value2Label);
        value2Container.appendChild(value2Input);

        // Toggle between fields when operator changes
        select.addEventListener('change', () => {
            value2Container.style.display = (isNumeric && select.value === '..') ? '' : 'none';
        });

        // Actions
        const actions = document.createElement('div');
        actions.className = 'twm-data-table__filter-dropdown-actions';

        const clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className = 'twm-data-table__filter-dropdown-btn-action twm-data-table__filter-dropdown-btn-action--clear';
        clearBtn.textContent = 'Clear';
        clearBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            filterInput.value = '';
            this._onFilterInput(colIdx, '');
            this._closeFilterDropdown();
        });

        const applyBtn = document.createElement('button');
        applyBtn.type = 'button';
        applyBtn.className = 'twm-data-table__filter-dropdown-btn-action twm-data-table__filter-dropdown-btn-action--apply';
        applyBtn.textContent = 'Apply';
        applyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const composed = this._composeFilterString(select.value, valueInput.value, value2Input.value, isNumeric);
            filterInput.value = composed;
            this._onFilterInput(colIdx, composed);
            this._closeFilterDropdown();
        });

        actions.appendChild(clearBtn);
        actions.appendChild(applyBtn);

        // Assemble panel
        panel.appendChild(selectLabel);
        panel.appendChild(select);
        panel.appendChild(valueLabel);
        panel.appendChild(valueInput);
        panel.appendChild(value2Container);
        panel.appendChild(actions);

        // Add to document and position
        document.body.appendChild(panel);

        const anchorRect = anchorEl.getBoundingClientRect();
        let left = anchorRect.left;
        let top = anchorRect.bottom + 4;

        // Viewport boundary check
        const panelRect = panel.getBoundingClientRect();
        if (left + panelRect.width > window.innerWidth) {
            left = window.innerWidth - panelRect.width - 8;
        }
        if (top + panelRect.height > window.innerHeight) {
            top = anchorRect.top - panelRect.height - 4;
        }

        panel.style.left = `${left}px`;
        panel.style.top = `${top}px`;

        // Focus the value input
        requestAnimationFrame(() => valueInput.focus());

        // Close on outside click (capture phase)
        const handleOutsideClick = (e) => {
            if (!panel.contains(e.target)) {
                this._closeFilterDropdown();
            }
        };
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                this._closeFilterDropdown();
            }
        };
        // Enter key applies the filter
        const handleEnter = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const composed = this._composeFilterString(select.value, valueInput.value, value2Input.value, isNumeric);
                filterInput.value = composed;
                this._onFilterInput(colIdx, composed);
                this._closeFilterDropdown();
            }
        };

        // Delay attaching outside-click to avoid catching the trigger click
        setTimeout(() => {
            document.addEventListener('click', handleOutsideClick, true);
        }, 0);
        document.addEventListener('keydown', handleEscape);
        panel.addEventListener('keydown', handleEnter);

        this._filterDropdownEl = panel;
        this._filterDropdownCleanup = () => {
            document.removeEventListener('click', handleOutsideClick, true);
            document.removeEventListener('keydown', handleEscape);
        };
    }

    _closeFilterDropdown() {
        if (this._filterDropdownEl?.parentNode) {
            this._filterDropdownEl.parentNode.removeChild(this._filterDropdownEl);
        }
        this._filterDropdownCleanup?.();
        this._filterDropdownEl = null;
        this._filterDropdownCleanup = null;
    }

    _parseFilterForDropdown(filterText, isNumeric) {
        const text = (filterText || '').trim();
        if (!text) {
            return { operator: isNumeric ? '=' : 'contains', value: '', value2: '' };
        }

        if (isNumeric) {
            // Range: "10..100"
            const rangeMatch = text.match(/^(-?[\d.]+)\.\.(-?[\d.]+)$/);
            if (rangeMatch) {
                return { operator: '..', value: rangeMatch[1], value2: rangeMatch[2] };
            }
            // Operator prefix: >=, <=, !=, >, <, =
            const opMatch = text.match(/^(>=|<=|!=|>|<|=)\s*(-?[\d.]+)$/);
            if (opMatch) {
                return { operator: opMatch[1], value: opMatch[2], value2: '' };
            }
            // Plain number
            return { operator: '=', value: text, value2: '' };
        }

        // Text modes
        if (text.startsWith('="') && text.endsWith('"')) {
            return { operator: 'equals', value: text.slice(2, -1), value2: '' };
        }
        if (text.startsWith('!')) {
            return { operator: 'not', value: text.slice(1), value2: '' };
        }
        if (text.startsWith('^')) {
            return { operator: 'starts', value: text.slice(1), value2: '' };
        }
        if (text.endsWith('$')) {
            return { operator: 'ends', value: text.slice(0, -1), value2: '' };
        }
        return { operator: 'contains', value: text, value2: '' };
    }

    _composeFilterString(operator, value, value2, isNumeric) {
        if (!value && operator !== '..') return '';

        if (isNumeric) {
            if (operator === '..') {
                return (value && value2) ? `${value}..${value2}` : '';
            }
            if (operator === '=') return value;
            return `${operator}${value}`;
        }

        // Text modes
        switch (operator) {
            case 'contains': return value;
            case 'equals': return value ? `="${value}"` : '';
            case 'starts': return value ? `^${value}` : '';
            case 'ends': return value ? `${value}$` : '';
            case 'not': return value ? `!${value}` : '';
            default: return value;
        }
    }

    _onFilterInputDebounced(colIdx, value) {
        if (this._filterDebounceTimer) {
            clearTimeout(this._filterDebounceTimer);
        }
        this._filterDebounceTimer = setTimeout(() => {
            this._onFilterInput(colIdx, value);
        }, 200);
    }

    _onFilterInput(colIdx, value) {
        if (value) {
            this._state.filters.set(colIdx, value);
        } else {
            this._state.filters.delete(colIdx);
        }

        this._invalidateProcessedCache();
        this._state.offset = 0;
        this._state.selected.clear();
        this._state.anchorIndex = null;

        this._savePersisted();
        this.render();
    }

    _getActiveFilterColIdx() {
        const active = document.activeElement;
        if (!active || !active.classList.contains('twm-data-table__filter-input')) return null;
        const cell = active.closest('.data-table__filter-cell');
        if (!cell) return null;
        const row = cell.parentElement;
        if (!row) return null;
        const cells = Array.from(row.children);
        const idx = cells.indexOf(cell);
        return this.config.showRowNumbers ? idx - 1 : idx;
    }

    _restoreFilterFocus(colIdx) {
        const filterRow = this._wrapperEl?.querySelector('.twm-data-table__filter-row');
        if (!filterRow) return;
        const cellIdx = this.config.showRowNumbers ? colIdx + 1 : colIdx;
        const cell = filterRow.children[cellIdx];
        const input = cell?.querySelector('.twm-data-table__filter-input');
        if (input) {
            input.focus();
            input.setSelectionRange(input.value.length, input.value.length);
        }
    }

    // ─────────────────────────────────────────────────────────────────
    // Private methods
    // ─────────────────────────────────────────────────────────────────

    _cleanup() {
        this._disposers.forEach(dispose => {
            try { dispose?.(); } catch (_) {}
        });
        this._disposers = [];
        this._closeFilterDropdown();
        if (this._filterDebounceTimer) {
            clearTimeout(this._filterDebounceTimer);
            this._filterDebounceTimer = null;
        }
    }

    _detectColumnTypes() {
        const { headers, rows, getColumnType } = this.config;
        const types = [];

        for (let colIdx = 0; colIdx < headers.length; colIdx++) {
            if (getColumnType) {
                types.push(getColumnType(colIdx, rows));
                continue;
            }

            // Auto-detect by sampling first 10 rows
            let numericCount = 0;
            let sampleCount = 0;
            const maxSamples = Math.min(10, rows.length);

            for (let i = 0; i < maxSamples; i++) {
                const value = rows[i]?.[colIdx];
                if (value != null && value !== '') {
                    sampleCount++;
                    if (typeof value === 'number' || /^-?[\d,.]+%?$/.test(String(value).trim())) {
                        numericCount++;
                    }
                }
            }

            types.push(sampleCount > 0 && numericCount / sampleCount > 0.5 ? 'num' : 'text');
        }

        return types;
    }

    _createPagination() {
        const { rows, pageSize, totalCount: configTotalCount, offset: configOffset, onPageChange, onJumpToRow } = this.config;

        // Server-side pagination uses config offset, client-side uses state offset
        const isServerSide = typeof onPageChange === 'function';
        const offset = isServerSide ? (configOffset || 0) : this._state.offset;

        // For client-side, use processed (filtered+sorted) row count
        const processedRows = isServerSide ? rows : this._getProcessedRows();
        const effectiveTotal = isServerSide ? (configTotalCount || rows.length) : processedRows.length;
        const unfilteredTotal = isServerSide ? (configTotalCount || rows.length) : rows.length;
        const isFiltered = !isServerSide && this._state.filters.size > 0;

        const displayedRows = isServerSide ? rows.length : Math.min(pageSize, effectiveTotal - offset);
        const endRow = Math.min(offset + displayedRows, effectiveTotal);
        const totalPages = Math.max(1, Math.ceil(effectiveTotal / pageSize));
        // Don't render the strip when there's only one page — the row
        // count is uninformative (the table itself shows every row) and
        // the nav buttons would all be disabled.
        if (totalPages <= 1 && !isFiltered) return null;
        const currentPage = Math.floor(offset / pageSize) + 1;
        const hasPrev = offset > 0;
        const hasNext = offset + pageSize < effectiveTotal;

        const el = document.createElement('div');
        el.className = 'twm-pagination-controls';
        el.style.cssText = 'display:flex; align-items:center; gap:6px; padding:2px 8px; border-bottom:1px solid #2a2a2a; font-size:11px;';

        // Info
        const info = document.createElement('span');
        info.style.cssText = 'color:#aaa; white-space:nowrap;';
        if (effectiveTotal === 0) {
            info.textContent = isFiltered
                ? `0 of ${unfilteredTotal.toLocaleString()} rows match`
                : 'No rows';
        } else if (isFiltered) {
            info.textContent = `Rows ${offset + 1}\u2013${endRow} of ${effectiveTotal.toLocaleString()} (${unfilteredTotal.toLocaleString()} total)`;
        } else {
            info.textContent = `Rows ${offset + 1}\u2013${endRow} of ${effectiveTotal.toLocaleString()}`;
        }

        // Spacer
        const spacer = document.createElement('div');
        spacer.style.flex = '1';

        // Page change handler - supports both client-side and server-side pagination
        const handlePageChange = (newOffset) => {
            if (isServerSide) {
                // Auto-spinner if the consumer returns a Promise.
                this._awaitWithSpinner(onPageChange(newOffset, pageSize));
            } else {
                this._state.offset = newOffset;
                this.render();
            }
        };

        // Navigation buttons
        const firstBtn = this._createPaginationBtn('first_page', 'First page', !hasPrev, () => {
            handlePageChange(0);
        });

        const prevBtn = this._createPaginationBtn('chevron_left', 'Previous page', !hasPrev, () => {
            handlePageChange(Math.max(0, offset - pageSize));
        });

        const pageInfo = document.createElement('span');
        pageInfo.style.cssText = 'color:#aaa; font-size:10px; min-width:72px; text-align:center;';
        pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;

        const nextBtn = this._createPaginationBtn('chevron_right', 'Next page', !hasNext, () => {
            handlePageChange(offset + pageSize);
        });

        const lastBtn = this._createPaginationBtn('last_page', 'Last page', !hasNext, () => {
            handlePageChange(Math.floor((effectiveTotal - 1) / pageSize) * pageSize);
        });

        // Jump to row
        const jumpInput = document.createElement('input');
        jumpInput.type = 'number';
        jumpInput.className = 'twm-pagination-input';
        jumpInput.style.cssText = 'width:54px; padding:1px 4px; border:1px solid #444; background:#2a2a2a; color:#ccc; font-size:10px;';
        jumpInput.min = '1';
        jumpInput.max = String(effectiveTotal);
        jumpInput.placeholder = 'Row #';

        const jumpBtn = this._createPaginationBtn(null, 'Go to row', false, () => {
            const target = Number(jumpInput.value);
            if (Number.isFinite(target) && target >= 1) {
                if (isServerSide && onJumpToRow) {
                    onJumpToRow(target - 1);
                } else if (isServerSide) {
                    // Default: calculate page offset for the target row
                    const newOffset = Math.floor((target - 1) / pageSize) * pageSize;
                    handlePageChange(newOffset);
                } else {
                    this.goToRow(target - 1);
                }
            }
        }, 'Go');

        el.appendChild(info);
        el.appendChild(spacer);
        el.appendChild(firstBtn);
        el.appendChild(prevBtn);
        el.appendChild(pageInfo);
        el.appendChild(nextBtn);
        el.appendChild(lastBtn);
        el.appendChild(jumpInput);
        el.appendChild(jumpBtn);

        // CSV export button (opt-in). Re-uses the existing downloadCSV
        // method which already handles the host save dialog + browser
        // fallback.
        if (this.config.showExportButton) {
            const exportBtn = this._createPaginationBtn(
                'download', 'Download visible rows as CSV', false,
                () => this.downloadCSV('data.csv'));
            el.appendChild(exportBtn);
        }

        return el;
    }

    _createPaginationBtn(icon, tooltip, disabled, onClick, textLabel = null) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'hoverbutton twm-pagination-btn twm-has-tooltip';
        btn.setAttribute('data-tooltip', tooltip);
        btn.disabled = disabled;
        btn.style.cssText = 'padding:1px 3px; background:transparent; border:1px solid #444; color:#aaa; cursor:pointer; display:flex; align-items:center; justify-content:center; line-height:1;';

        if (disabled) {
            btn.style.opacity = '0.4';
            btn.style.cursor = 'not-allowed';
        }

        if (icon) {
            const iconEl = document.createElement('span');
            iconEl.className = 'material-symbols-outlined';
            iconEl.style.fontSize = '14px';
            iconEl.textContent = icon;
            btn.appendChild(iconEl);
        } else if (textLabel) {
            btn.textContent = textLabel;
            btn.style.fontSize = '10px';
            btn.style.padding = '1px 6px';
        }

        btn.addEventListener('click', onClick);
        return btn;
    }

    _createTable() {
        const { headers, rows, pageSize, sortable, filterable, showRowNumbers, readonly, getHeaderIcon, onPageChange, offset: configOffset } = this.config;
        const { selected, sortColumn, sortAscending } = this._state;

        // Server-side pagination: rows already represent current page, use config offset for row numbering
        // Client-side pagination: use processed (filtered+sorted) rows, then slice for current page
        const isServerSide = typeof onPageChange === 'function';
        const processedRows = isServerSide ? rows : this._getProcessedRows();
        const offset = isServerSide ? (configOffset || 0) : this._state.offset;
        const pageRows = isServerSide ? processedRows : processedRows.slice(offset, offset + pageSize);

        const table = document.createElement('table');
        table.className = readonly ? 'twm-preview-table twm-preview-table--readonly' : 'twm-preview-table';
        table.tabIndex = 0;

        // Header
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');

        if (showRowNumbers) {
            const th = document.createElement('th');
            th.className = 'num';
            th.textContent = '#';
            headerRow.appendChild(th);
        }

        headers.forEach((header, colIdx) => {
            const th = document.createElement('th');
            th.className = this._columnTypes[colIdx] || 'text';

            if (sortable) {
                th.classList.add('sortable');
                th.style.cursor = 'pointer';
            }

            // Header icon
            if (getHeaderIcon) {
                const iconInfo = getHeaderIcon(header, colIdx);
                if (iconInfo) {
                    const iconSpan = document.createElement('span');
                    iconSpan.className = 'material-symbols-outlined twm-header-icon twm-has-tooltip';
                    iconSpan.setAttribute('data-tooltip', iconInfo.title || '');
                    iconSpan.style.cssText = 'font-size:16px; vertical-align:middle; margin-right:4px; opacity:0.7;';
                    iconSpan.textContent = iconInfo.icon;
                    th.appendChild(iconSpan);
                }
            }

            th.appendChild(document.createTextNode(header));

            // Sort indicator
            if (sortable) {
                const sortIcon = document.createElement('span');
                sortIcon.className = 'material-symbols-outlined twm-sort-icon';
                sortIcon.style.cssText = 'font-size:14px; margin-left:4px; opacity:0.5;';
                if (sortColumn === colIdx) {
                    sortIcon.textContent = sortAscending ? 'arrow_upward' : 'arrow_downward';
                    sortIcon.style.opacity = '1';
                } else {
                    sortIcon.textContent = 'unfold_more';
                }
                th.appendChild(sortIcon);

                th.addEventListener('click', () => this.sortBy(colIdx));
            }

            th.title = header;
            headerRow.appendChild(th);
        });

        thead.appendChild(headerRow);

        // Filter row (below header)
        if (filterable) {
            const filterRow = this._createFilterRow(headers);
            thead.appendChild(filterRow);
        }

        table.appendChild(thead);

        // Body
        const tbody = document.createElement('tbody');
        pageRows.forEach((row, localIdx) => {
            const processedIdx = offset + localIdx;
            // Map back to original config.rows index for selection tracking
            const globalIdx = isServerSide
                ? (configOffset || 0) + localIdx
                : (this._processedIndexMap?.[processedIdx] ?? processedIdx);
            const tr = document.createElement('tr');
            tr.__rowIndex = globalIdx;
            tr.className = 'data-preview-row';

            if (selected.has(globalIdx)) {
                tr.classList.add('selected');
            }

            this._fillRowCells(tr, row, globalIdx, showRowNumbers);

            // Row-level click + right-click hooks (P2). Bound after
            // cells so per-cell handlers run first.
            if (this.config.onRowClick) {
                tr.addEventListener('click', (ev) => {
                    this.config.onRowClick(globalIdx, row, ev);
                });
            }
            if (this.config.onRowContextMenu) {
                tr.addEventListener('contextmenu', (ev) => {
                    this.config.onRowContextMenu(globalIdx, row, ev);
                });
            }

            tbody.appendChild(tr);
        });

        table.appendChild(tbody);
        this._tbodyEl = tbody;

        return table;
    }

    /** Build (or rebuild) one row's cells in place.
     *
     *  Extracted from the body loop so that `updateRow` and the initial
     *  render share ONE cell-building path. Two paths would drift, and the
     *  drift would show as a cell that renders differently after a live
     *  update than it did on load. */
    _fillRowCells(tr, row, globalIdx, showRowNumbers) {
        tr.replaceChildren();

        if (showRowNumbers) {
            const td = document.createElement('td');
            td.className = 'num';
            td.textContent = String(globalIdx + 1);
            tr.appendChild(td);
        }

        for (let colIdx = 0; colIdx < row.length; colIdx++) {
            const td = document.createElement('td');
            td.className = this._columnTypes[colIdx] || 'text';

            // Use custom cell renderer if provided
            const value = row[colIdx];
            if (this.config.renderCell) {
                const handled = this.config.renderCell(td, value, colIdx, globalIdx, row);
                if (!handled) {
                    td.textContent = this._formatValue(value, colIdx);
                }
            } else {
                td.textContent = this._formatValue(value, colIdx);
            }

            // Cell-level right-click hook (P2). Fires before the row-level
            // hook and the built-in context menu — the caller can
            // ev.preventDefault() to suppress the default copy menu on this
            // cell only.
            if (this.config.onCellContextMenu) {
                const cellColIdx = colIdx;
                td.addEventListener('contextmenu', (ev) => {
                    this.config.onCellContextMenu(
                        cellColIdx, globalIdx, value, td, ev);
                });
            }

            tr.appendChild(td);
        }
    }

    /** Re-render ONE row in place, preserving everything around it.
     *
     *  `render()` rebuilds the entire `<tbody>`, which takes the scroll
     *  position, any open editor, the keyboard focus and the measured column
     *  widths with it. That is fine for a sort or a page change and wrong for
     *  a single-cell commit or a live update arriving over a socket — the
     *  common case in an editable grid, where a full rebuild once per keystroke
     *  is both visible and destructive.
     *
     *  What survives, by construction:
     *   - scroll position, because the tbody is not replaced;
     *   - the separately-rendered thead/tbody column widths, because the
     *     explicit widths live on the header cells and on the FIRST body row,
     *     and all three of the properties `_setCellWidth` writes are re-applied
     *     here when that first row is the one being replaced;
     *   - selection, because the `selected` class is recomputed from the
     *     selection set rather than carried on the old element;
     *   - keyboard focus, because the focused element's position is recorded
     *     before the replace and restored after.
     *
     *  @param {number} index   row index as tracked by `tr.__rowIndex`
     *  @param {any[]}  row     the new cell values
     *  @returns {boolean}      false when the row is not currently rendered
     *                          (it is on another page, or outside the render
     *                          window) — which is NOT an error: the caller has
     *                          nothing to update on screen.
     */
    updateRow(index, row) {
        const tbody = this._tbodyEl;
        if (!tbody) return false;

        let tr = null;
        for (const candidate of tbody.children) {
            if (candidate.__rowIndex === index) { tr = candidate; break; }
        }
        if (!tr) return false;

        // Keep the caller's data in step, so a later full render agrees with
        // what is on screen. Server-side paging means config.rows may hold only
        // the current page; the index map is what resolves that.
        if (Array.isArray(this.config.rows) && this.config.rows[index]) {
            this.config.rows[index] = row;
        }

        // Record focus BEFORE the replace: `replaceChildren` detaches the
        // focused cell and the browser moves focus to <body>.
        const active = document.activeElement;
        let focusedCol = -1;
        if (active && tr.contains(active)) {
            focusedCol = Array.prototype.indexOf.call(tr.children, active.closest('td'));
        }

        // ALL THREE PROPERTIES, not just `width`. `_setCellWidth` writes
        // `width` together with `min-width: 0` and `max-width: none`, precisely
        // to escape the CSS floors on these cells (base.css pins the first
        // column at 120px/min 100px and gives every other column a 80px min).
        // Carrying the width across the rebuild and leaving the other two behind
        // let those floors back in — so a column measured narrower than its
        // floor SNAPPED WIDER the moment one of its cells was repainted, and
        // under `table-layout: fixed` this row is the column track, so the whole
        // column moved. In an editable grid that is one visible jump per saved
        // cell, which is what it looked like to the person doing the saving.
        const isFirstRow = tr === tbody.firstElementChild;
        const widths = isFirstRow
            ? Array.prototype.map.call(tr.children, (td) => ({
                width: td.style.width,
                minWidth: td.style.minWidth,
                maxWidth: td.style.maxWidth,
            }))
            : null;

        const showRowNumbers = this.config.showRowNumbers !== false
            && tr.firstElementChild?.classList.contains('num');
        this._fillRowCells(tr, row, index, showRowNumbers);

        // `_syncHeaderWidths` derives column widths from the FIRST body row.
        // Under a recycling virtualiser that row changes on every scroll — and
        // here it changes on every update — so the explicit widths have to be
        // carried across the rebuild or the columns jitter.
        if (widths) {
            widths.forEach((saved, i) => {
                const cell = tr.children[i];
                if (!saved.width || !cell) return;
                cell.style.width = saved.width;
                cell.style.minWidth = saved.minWidth;
                cell.style.maxWidth = saved.maxWidth;
            });
        }

        tr.classList.toggle('selected', this._state?.selected?.has(index) === true);

        if (focusedCol >= 0 && tr.children[focusedCol]) {
            tr.children[focusedCol].focus?.();
        }
        return true;
    }

    /** Sync the (separate) header table's column widths to the body
     *  table's measured widths. Without this, the two tables compute
     *  widths independently and the columns drift apart. Locks both
     *  tables to `table-layout: fixed` and writes explicit width onto
     *  each header cell of every header row (header + filter row). */
    /**
     * Measure every column's NATURAL content width, in one transient reflow.
     *
     * Extracted from `_syncHeaderWidths` so that auto-size can ask the same
     * question the fit pass asks, and get the same answer. Two measurement
     * passes would drift, and the drift would show as a double-click that
     * sized a column differently from the render that follows it.
     *
     * The pass ignores the CSS caps (the 150px-pinned first column, the 80px
     * min on the rest) and the filter-row inputs: `twm-dt-measuring` flips both
     * tables to `table-layout:auto; width:max-content` with those caps off (via
     * `!important`) for a single reflow, then reverts before paint — it is
     * never visible. Clearing inline widths first stops the last sync's forced
     * widths from constraining the measure.
     *
     * @returns {number[]|null} width per DOM column index, or null when there
     *   is nothing laid out to measure.
     */
    _measureNaturalWidths() {
        const headerTable = this._headerTableEl;
        const bodyTable   = this._tableEl;
        if (!headerTable || !bodyTable) return null;
        const firstRow = bodyTable.querySelector('tbody > tr');
        if (!firstRow) return null;
        const bodyCells = firstRow.children;
        if (!bodyCells.length) return null;

        headerTable.querySelectorAll('thead > tr').forEach((tr) => {
            for (const th of tr.children) this._clearCellWidth(th);
        });
        for (const td of bodyCells) this._clearCellWidth(td);
        headerTable.style.width = '';
        bodyTable.style.width   = '';
        headerTable.classList.add('twm-dt-measuring');
        bodyTable.classList.add('twm-dt-measuring');
        // Force layout flush so measurements are current.
        // eslint-disable-next-line no-unused-expressions
        bodyTable.offsetWidth;

        // Natural width per column = the wider of its header label and its
        // body content. `max-content` already spans every rendered body
        // row, so the body cell of the first row reports the whole column.
        const labelRow = headerTable.querySelector('thead > tr');
        const cols = bodyCells.length;
        const natural = new Array(cols);
        // ── AND CSS `zoom` IS DIVIDED BACK OUT ─────────────────────────
        //
        // `getBoundingClientRect()` reports CLIENT pixels, so under a `zoom`
        // anywhere above this table every width read here comes back multiplied
        // by that zoom — while `_setCellWidth` writes a plain `width` in the
        // cell's OWN pixels, which the same zoom then multiplies again. The two
        // halves of one measure-and-apply loop would be in different units:
        // measured at 200% a column is pinned twice as wide as its text needs,
        // and at 50% it is pinned half as wide and every value ellipsises. The
        // fit pass has the same split, because its `avail` is `clientWidth`,
        // which is NOT zoom-adjusted.
        //
        // `currentCSSZoom` is the effective zoom on this element — 1 when
        // nothing above it zooms, and `undefined` in an engine that predates
        // the property — so this is exactly a no-op for every consumer that
        // does not zoom, which is all of them but the Tables grid.
        const zoom = bodyTable.currentCSSZoom || 1;
        for (let i = 0; i < cols; i++) {
            const body = bodyCells[i].getBoundingClientRect().width / zoom;
            const head = labelRow && labelRow.children[i]
                ? labelRow.children[i].getBoundingClientRect().width / zoom
                : 0;
            natural[i] = Math.max(body, head);
        }

        headerTable.classList.remove('twm-dt-measuring');
        bodyTable.classList.remove('twm-dt-measuring');
        return natural;
    }

    /**
     * Fit one column to its widest visible value and pin it there.
     *
     * The gesture is a double-click on the column's resize grip, which is where
     * every spreadsheet has put it — and the grip is this component's, which is
     * why the behaviour is too. A consumer that wanted this had no hook to hang
     * it on: `_installColumnResizers` bound `mousedown` and a `click` that only
     * suppressed the sort, and the measurement, the pin, the table-width
     * invariant and the write-through to `stateStore` are all private here.
     *
     * @param {number} domIdx column index INCLUDING the row-number column when
     *   `showRowNumbers` is on — the same index space as `_colWidths`.
     * @param {{maxWidth?: number}} [opts] ceiling; defaults to AUTOSIZE_MAX_PX.
     * @returns {boolean} whether it had a layout to measure.
     */
    autoSizeColumn(domIdx, opts = {}) {
        const natural = this._measureNaturalWidths();
        if (!natural || domIdx < 0 || domIdx >= natural.length) return false;
        this._colWidths[domIdx] = this._autoWidth(natural[domIdx], opts);
        this._colWidthsSig = this._colSig();
        this._savePersisted();
        this._syncHeaderWidths();
        return true;
    }

    /**
     * The same for every column at once.
     *
     * It REPLACES existing drag overrides rather than sizing around them: "fit
     * every column to its content" that quietly excepted the three columns you
     * had dragged would be a button whose result depends on history nobody can
     * see.
     *
     * The result may well be wider than the container — forty columns of real
     * content usually are — and that is the intended answer, not a failure:
     * `_syncHeaderWidths` honours overrides verbatim, sizes both tables to their
     * total and the body wrap scrolls sideways with the header following it.
     * Squeezing them to fit is what the automatic fit pass does on every render
     * already, so a button that did that would be a button that does nothing.
     */
    autoSizeColumns(opts = {}) {
        const natural = this._measureNaturalWidths();
        if (!natural) return false;
        this._colWidths = {};
        for (let i = 0; i < natural.length; i++) {
            this._colWidths[i] = this._autoWidth(natural[i], opts);
        }
        this._colWidthsSig = this._colSig();
        this._savePersisted();
        this._syncHeaderWidths();
        return true;
    }

    /** One measured width, floored at the drag-resize minimum and capped, with
     *  the same sub-pixel pad `_fitColumnWidths` adds against ellipsis. */
    _autoWidth(natural, opts = {}) {
        const max = opts.maxWidth ?? AUTOSIZE_MAX_PX;
        return Math.min(max, Math.max(40, Math.ceil((natural || 0) + 2)));
    }

    /**
     * Does every one of the `n` DOM columns already carry an override taken
     * against the column set that is on screen right now?
     *
     * The signature half is not belt-and-braces. `render()` drops `_colWidths`
     * when `_colSig` changes, but `_syncHeaderWidths` is also reached straight
     * from the ResizeObserver, which never goes through `render()` — so a set
     * of overrides measured against the PREVIOUS headers can still be sitting
     * in `_colWidths` when this is asked. Answering "pinned" then would skip
     * the measure and hand `_fitColumnWidths` widths keyed to columns that are
     * no longer there, each one landing on its neighbour.
     *
     * `== null` rather than a falsy test, to match `_fitColumnWidths`' own
     * `overrides[i] != null`: a legitimately-stored 0 must be read the same way
     * in both places or the two disagree about which columns are flexible.
     */
    _allColumnsPinned(n) {
        if (!n || this._colWidthsSig !== this._colSig()) return false;
        for (let i = 0; i < n; i++) {
            if (this._colWidths[i] == null) return false;
        }
        return true;
    }

    /** Sync the (separate) header table's column widths to the body
     *  table's measured widths. Without this, the two tables compute
     *  widths independently and the columns drift apart. Locks both
     *  tables to `table-layout: fixed` and writes explicit width onto
     *  each header cell of every header row (header + filter row). */
    _syncHeaderWidths() {
        const headerTable = this._headerTableEl;
        const bodyTable   = this._tableEl;
        if (!headerTable || !bodyTable) return;
        const firstRow = bodyTable.querySelector('tbody > tr');
        if (!firstRow) return;
        const bodyCells = firstRow.children;
        if (!bodyCells.length) return;

        const headerRows = headerTable.querySelectorAll('thead > tr');
        // DO NOT MEASURE WHAT NOTHING WILL READ.
        //
        // `_measureNaturalWidths` flips BOTH tables to
        // `table-layout:auto; width:max-content` with the CSS caps lifted, for
        // a full synchronous reflow (`.twm-dt-measuring`, css/base.css). This
        // method is the ResizeObserver's callback, so that reflow fires once
        // per animation frame for the whole of a splitter drag — and an
        // embedder that pages a thousand rows at a time across twenty columns
        // re-lays-out ~20,000 cells per frame for it.
        //
        // When every column is pinned, `_fitColumnWidths` reads `natural[i]`
        // for no `i` at all: each column takes its override verbatim, and the
        // only thing left that the array supplies is `n`, which is its length.
        // So zeroes of the right length are not an approximation of the
        // measurement, they are indistinguishable from it.
        const natural = this._allColumnsPinned(bodyCells.length)
            ? new Array(bodyCells.length).fill(0)
            : this._measureNaturalWidths();
        if (!natural) return;

        // ── Fit pass: turn natural widths into final widths that respect
        // the available space, favour the first column, and cap runaways.
        // User-dragged columns (`_colWidths`) are honored as-is inside.
        const wrap = this._tableWrapEl;
        const headerWrap = this._headerWrapEl;
        const avail = wrap ? wrap.clientWidth : 0;
        const firstIdx = this.config.showRowNumbers && bodyCells.length > 1 ? 1 : 0;
        const widths = this._fitColumnWidths(natural, avail, {
            firstIdx,
            overrides: this._colWidths,
            fit: this.config.columnFit,
        });
        const total = widths.reduce((a, b) => a + b, 0);

        // Apply measured widths to every header row at the matching
        // column index AND the body's first row, so both tables compute
        // the SAME column track. `_setCellWidth` also clears any CSS
        // min/max-width (e.g. the 150px-pinned first "time" column) so
        // the explicit width is actually honored.
        headerRows.forEach((tr) => {
            for (let i = 0; i < tr.children.length && i < widths.length; i++) {
                this._setCellWidth(tr.children[i], widths[i]);
            }
        });
        for (let i = 0; i < bodyCells.length && i < widths.length; i++) {
            this._setCellWidth(bodyCells[i], widths[i]);
        }

        // Lock both tables so the widths stick even when content changes.
        headerTable.style.tableLayout = 'fixed';
        bodyTable.style.tableLayout   = 'fixed';

        // Size both tables to the explicit column TOTAL (not the CSS
        // `width: 100%`) so a widened column GROWS the table and the
        // body wrap scrolls horizontally, instead of squeezing into a
        // fixed budget and stealing from its neighbours. When the
        // columns fit and the user hasn't dragged, stay at 100% to fill
        // the container exactly with no phantom scrollbar.
        const hasOverride = Object.keys(this._colWidths).length > 0;
        if (hasOverride || total > avail + 1) {
            headerTable.style.width = `${total}px`;
            bodyTable.style.width   = `${total}px`;
        } else {
            headerTable.style.width = '';
            bodyTable.style.width   = '';
        }

        // Scrollbar gutter: when the body shows a vertical scrollbar, its
        // content is narrower than the wrap by `scrollbarW`. The header
        // wrap has no scrollbar, so pad it on the right to match.
        //
        // C29b. AND THE SAME NUMBER IS PUBLISHED AS A CUSTOM PROPERTY, because
        // padding does not help the one thing C29 was for. A `position: sticky`
        // cell pins to its scroll container's SCROLLPORT, and the scrollport of
        // a box with a classic scrollbar excludes that scrollbar while padding
        // is inside it — so `right: 0` in the body pins `sbw` px to the LEFT of
        // `right: 0` in the header, and a pinned trailing column would sit
        // visibly out of line with its own heading. There is nothing a
        // stylesheet can measure this from: it is the platform's scrollbar
        // width, known here and nowhere else. Written on the WRAPPER rather
        // than either box so a consumer's rule can read it from whichever of
        // the two it is styling, and written on every sync because a scrollbar
        // appears and disappears with the row count.
        if (wrap && headerWrap) {
            const sbw = Math.max(0, wrap.offsetWidth - wrap.clientWidth);
            headerWrap.style.paddingRight = sbw ? `${sbw}px` : '';
            this._wrapperEl?.style?.setProperty('--twm-dt-gutter', `${sbw}px`);
        }

        // Keep the header aligned with the body's current horizontal
        // scroll (a resize can clamp scrollLeft).
        this._syncHeaderScroll();

        // Columns are now fixed-width: any cell whose text was clipped
        // gets a hover tooltip carrying the full value.
        this._updateCellTooltips();
    }

    /**
     * Convert measured natural content widths into final column widths.
     *
     * Goals (the "intelligent" sizing):
     *  - every column wants its content width (+a hair), clamped to a
     *    sane [floor, cap]; the FIRST content column gets a more generous
     *    cap so it shows its full value;
     *  - user-dragged columns (`overrides`) are pinned, never grown/shrunk;
     *  - if everything fits, grow the flexible columns evenly to fill the
     *    width (no dead gap on the right);
     *  - if it doesn't fit, protect the first column and water-fill-shrink
     *    the rest (trim the widest first) until it fits; only if even the
     *    floors overflow do we give up and let the body scroll sideways.
     *
     * Under `fit: 'content'` the first and last of those goals invert: each
     * unpinned column asks for its own content width through the same
     * `_autoWidth` the grip double-click uses, and an overflow is the answer
     * rather than a problem — the caller wanted a table that scrolls sideways,
     * not one squeezed toward the floor. The grow-to-fill branch is shared by
     * both, because a table narrower than its container leaves a dead gap on
     * the right under either reading.
     *
     * @param {number[]} natural  measured content width per column (px)
     * @param {number}   avail    usable width of the body wrap (px)
     * @param {{firstIdx?:number, overrides?:Object, fit?:'container'|'content'}} [opts]
     * @returns {number[]} final width per column (px)
     */
    _fitColumnWidths(natural, avail, opts = {}) {
        const FLOOR = 40;        // matches the drag-resize minimum
        const CAP = 360;         // general per-column ceiling
        const FIRST_CAP = 520;   // the first column may run wider
        const PAD = 2;           // sub-pixel safety against ellipsis

        const n = natural.length;
        const firstIdx = opts.firstIdx ?? 0;
        const overrides = opts.overrides || {};
        // Anything that is not the literal opt-in is the historical behaviour.
        // Read once, so an embedder that passes a typo gets the old layout
        // rather than half of each.
        const toContent = opts.fit === 'content';

        // Desired (pre-fit) width per column. Pinned columns take their
        // override verbatim and sit out the grow/shrink redistribution.
        const desired = new Array(n);
        const pinned = new Array(n).fill(false);
        for (let i = 0; i < n; i++) {
            if (overrides[i] != null) {
                desired[i] = Math.max(FLOOR, Math.round(overrides[i]));
                pinned[i] = true;
                continue;
            }
            if (toContent) {
                // THE SAME CALL THE GRIP DOUBLE-CLICK MAKES — `autoSizeColumn`
                // → `_autoWidth` — and deliberately not a second arithmetic
                // that happens to agree with it today. Two width formulas
                // drift, and the drift shows up as a column that jumps the
                // first time anyone double-clicks its grip.
                //
                // FIRST_CAP has nothing to say here. It exists to favour one
                // column while the others are being squeezed; under a content
                // fit nothing is being squeezed, so there is no column to
                // favour and every one of them is held to the same ceiling.
                desired[i] = this._autoWidth(natural[i]);
                continue;
            }
            const cap = i === firstIdx ? FIRST_CAP : CAP;
            desired[i] = Math.min(cap, Math.max(FLOOR, Math.ceil(natural[i] + PAD)));
        }

        const widths = desired.slice();
        const sum = widths.reduce((a, b) => a + b, 0);

        // Not laid out yet (or content already exactly fits): hand back the
        // desired widths; the caller decides fill vs horizontal scroll.
        if (avail <= 1) return widths;

        if (sum <= avail) {
            // Grow flexible columns evenly to fill the remaining space so
            // the table doesn't leave a dead gap on the right. When EVERY
            // column is pinned (e.g. after the user has dragged a column —
            // the resize freezes all columns as overrides), fall back to
            // the last column so the table still spans the full container:
            // the width invariant — a table never renders narrower than
            // 100% of its wrap.
            const flex = [];
            for (let i = 0; i < n; i++) if (!pinned[i]) flex.push(i);
            const slack = avail - sum;
            if (slack > 0) {
                const targets = flex.length ? flex : [n - 1];
                const per = Math.floor(slack / targets.length);
                for (const i of targets) widths[i] += per;
                widths[targets[targets.length - 1]] += slack - per * targets.length;
            }
            return widths;
        }

        // OVERFLOW IS THE ANSWER UNDER A CONTENT FIT, not a case to recover
        // from. Everything below squeezes the unprotected columns toward the
        // 40px floor so that forty columns can be made to fit a pane — which is
        // precisely the outcome `columnFit: 'content'` opted out of. Handing
        // back the content widths lets the caller's `total > avail + 1` test
        // size both tables to the total, and the body wrap then scrolls
        // sideways with the header following it.
        if (toContent) return widths;

        // Overflow: protect the first column + pinned columns, water-fill
        // the rest down toward the floor.
        let protectedSum = 0;
        const shrinkable = [];
        for (let i = 0; i < n; i++) {
            if (pinned[i] || i === firstIdx) protectedSum += widths[i];
            else shrinkable.push(i);
        }
        const budget = avail - protectedSum;
        if (budget < shrinkable.length * FLOOR) {
            // Even at the floor we overflow → let the body scroll sideways.
            for (const i of shrinkable) widths[i] = FLOOR;
            return widths;
        }
        // Max-min fair allocation: the narrow columns keep their content,
        // the widest share the remaining budget equally.
        shrinkable.sort((a, b) => desired[a] - desired[b]);
        let remaining = budget;
        for (let k = 0; k < shrinkable.length; k++) {
            const colsLeft = shrinkable.length - k;
            const fair = Math.floor(remaining / colsLeft);
            const i = shrinkable[k];
            if (desired[i] <= fair) {
                widths[i] = desired[i];
                remaining -= desired[i];
            } else {
                const level = Math.max(FLOOR, fair);
                for (let j = k; j < shrinkable.length; j++) {
                    widths[shrinkable[j]] = level;
                }
                // Dump any rounding remainder onto the widest column.
                const leftover = remaining - colsLeft * level;
                if (leftover > 0) widths[shrinkable[shrinkable.length - 1]] += leftover;
                break;
            }
        }
        return widths;
    }

    /** Set an explicit width on a table cell, clearing any CSS min/max
     *  width constraint so the width is honored exactly. The first
     *  ("time") column is pinned to 150px by `min/max-width` in CSS;
     *  without this, dragging it does nothing and the slack leaks to the
     *  other columns. */
    _setCellWidth(cell, w) {
        cell.style.width = `${w}px`;
        cell.style.minWidth = '0';
        cell.style.maxWidth = 'none';
    }

    /** Undo `_setCellWidth` so a re-measure sees the cell's natural,
     *  CSS-constrained width again. */
    _clearCellWidth(cell) {
        cell.style.width = '';
        cell.style.minWidth = '';
        cell.style.maxWidth = '';
    }

    /** Wire the body wrap's horizontal scroll to the header. The header
     *  sits in an overflow:hidden wrap, so it can't scroll sideways on
     *  its own — `_syncHeaderScroll` scrolls it programmatically to the
     *  body's `scrollLeft`. Re-installed each render against the freshly-built
     *  wrap. */
    _installHeaderScrollSync() {
        const wrap = this._tableWrapEl;
        if (!wrap) return;
        if (this._onBodyScroll && this._scrollSyncEl) {
            this._scrollSyncEl.removeEventListener('scroll', this._onBodyScroll);
        }
        this._onBodyScroll = () => this._syncHeaderScroll();
        this._scrollSyncEl = wrap;
        wrap.addEventListener('scroll', this._onBodyScroll, { passive: true });
        this._syncHeaderScroll();
    }

    /**
     * Scroll the header wrap to match the body's horizontal scroll so the
     * columns stay aligned when the table overflows sideways.
     *
     * ══ C29. A TRANSFORM IS WHAT MAKES A STICKY COLUMN IMPOSSIBLE ═══════
     *
     * This wrote `headerTable.style.transform = translateX(-scrollLeft)`. It
     * aligns the two tables perfectly and it forecloses `position: sticky`
     * entirely, because the two halves of the table then pin against different
     * things: a sticky cell in the BODY pins to the body wrap's scrollport,
     * while its header counterpart is moved by a transform inside a box that
     * never scrolls at all. Scroll sideways and the pinned body column stands
     * still while its header slides away with everything else — so a table
     * with a trailing verb column (the row-actions column Tables needs pinned
     * to the right edge) can have a sticky body or an aligned header, never
     * both. A transform also establishes a containing block for fixed/sticky
     * descendants, which breaks the header cell independently of the offset.
     *
     * AN `overflow: hidden` BOX IS STILL A SCROLL CONTAINER. It has no
     * scrollbar and no user affordance, and `scrollLeft` moves it exactly like
     * any other. Scrolling the wrap rather than transforming its child gives
     * the header a real scrollport at the same offset as the body's, which is
     * the one arrangement in which a sticky cell on each side pins to the same
     * place. Identical for ordinary content: same pixels, no transform, no new
     * containing block.
     *
     * THE CLAMP IS ALREADY PAID FOR. A scroll container clamps `scrollLeft` to
     * `scrollWidth - clientWidth`, and the body wrap carries a vertical
     * scrollbar the header wrap does not — so the header would clamp short by
     * the scrollbar width and desync at the far right. `_syncHeaderWidths`
     * already pads the header wrap by exactly that gutter (`paddingRight`,
     * :1905), and end padding counts toward `scrollWidth`, so the two maxima
     * coincide. The residual below is the honest belt for the day some engine
     * disagrees about that: it is zero in the ordinary case, so the transform
     * is not set and sticky keeps working, and it is the difference rather
     * than the whole offset if it is ever not.
     */
    _syncHeaderScroll() {
        const wrap = this._tableWrapEl;
        const headerTable = this._headerTableEl;
        if (!wrap || !headerTable) return;
        const x = wrap.scrollLeft;
        const headerWrap = this._headerWrapEl;
        if (!headerWrap) {
            // No wrap to scroll — a consumer that built the header some other
            // way still gets the behaviour it always had.
            headerTable.style.transform = x ? `translateX(${-x}px)` : '';
            return;
        }
        headerWrap.scrollLeft = x;
        const residual = x - headerWrap.scrollLeft;
        headerTable.style.transform = residual ? `translateX(${-residual}px)` : '';
    }

    /** Drag-to-resize: hang a thin grab handle off the right edge of
     *  every header cell. Dragging it writes a per-column width override
     *  (keyed by DOM index) that `_syncHeaderWidths` then honors. */
    _installColumnResizers() {
        const headerTable = this._headerTableEl;
        if (!headerTable) return;
        const headRow = headerTable.querySelector('thead > tr');
        if (!headRow) return;
        [...headRow.children].forEach((th, domIdx) => {
            if (th.querySelector('.twm-dt-col-resizer')) return;
            th.classList.add('twm-dt-col');
            const grip = document.createElement('div');
            grip.className = 'twm-dt-col-resizer';
            grip.addEventListener('mousedown',
                (ev) => this._beginColResize(ev, domIdx));
            // Keep a resize gesture from registering as a sort click.
            grip.addEventListener('click', (ev) => ev.stopPropagation());
            // Double-click the grip: fit the column to its content. The gesture
            // every spreadsheet has, on the affordance it has always been on.
            // Stopped as well as prevented, or a consumer that opens a column
            // menu from the header (Tables does) opens it on the way past.
            grip.addEventListener('dblclick', (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                this.autoSizeColumn(domIdx);
            });
            th.appendChild(grip);
        });
    }

    _beginColResize(ev, domIdx) {
        ev.preventDefault();
        ev.stopPropagation();
        const headerTable = this._headerTableEl;
        const bodyTable = this._tableEl;
        const headRow = headerTable && headerTable.querySelector('thead > tr');
        if (!headRow) return;

        // Freeze EVERY column at its current width on BOTH tables and
        // lock fixed layout up front, so the drag moves only the grabbed
        // column and a neighbour can never absorb it. Widths come from
        // the header row (the column source of truth); the body's first
        // row is pinned to match so the two tables stay in lock-step.
        const startWidths = [...headRow.children].map(
            (c) => c.getBoundingClientRect().width);
        headerTable.style.tableLayout = 'fixed';
        if (bodyTable) bodyTable.style.tableLayout = 'fixed';
        startWidths.forEach((w, i) => this._pinColumnWidth(i, w));
        this._applyTableWidth();

        const startX = ev.clientX;
        const MIN = 40;
        document.body.classList.add('twm-dt-col-resizing');
        const onMove = (mv) => {
            const w = Math.max(
                MIN, Math.round(startWidths[domIdx] + (mv.clientX - startX)));
            this._pinColumnWidth(domIdx, w);
            // Pass the dragged column so the fill invariant reclaims any
            // freed width into a DIFFERENT (flexible/last) column, never
            // shrinking the table below the container.
            this._applyTableWidth(domIdx);
            this._syncHeaderScroll();
        };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            document.body.classList.remove('twm-dt-col-resizing');
            this._updateCellTooltips();
            this._savePersisted();
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }

    /** Pin one column to an explicit width across BOTH tables (every
     *  header row + the body's first row) and record it as a user
     *  override so `_syncHeaderWidths` honors it on later renders. The
     *  single place that writes a column width during a drag / fill. */
    _pinColumnWidth(i, w) {
        const headerTable = this._headerTableEl;
        const bodyTable = this._tableEl;
        if (!headerTable) return;
        this._colWidths[i] = w;
        headerTable.querySelectorAll('thead > tr').forEach((tr) => {
            if (tr.children[i]) this._setCellWidth(tr.children[i], w);
        });
        const bodyRow = bodyTable && bodyTable.querySelector('tbody > tr');
        if (bodyRow && bodyRow.children[i]) this._setCellWidth(bodyRow.children[i], w);
    }

    /** Size both tables so a widened column grows the table (→ horizontal
     *  scroll) rather than stealing from its neighbours — while enforcing
     *  the TABLE WIDTH INVARIANT: the table is never narrower than its
     *  container. Any width freed by dragging a column in stretches a
     *  flexible column (the last one, stepping off the column being
     *  dragged) so the table always spans ≥100% of the wrap.
     *
     * @param {number|null} dragIdx column the user is actively dragging,
     *        so the fill lands on a DIFFERENT column and doesn't fight the
     *        drag. Null (non-drag callers) lets the last column flex. */
    _applyTableWidth(dragIdx = null) {
        const headerTable = this._headerTableEl;
        const bodyTable = this._tableEl;
        const headRow = headerTable && headerTable.querySelector('thead > tr');
        if (!headRow) return;
        const cells = [...headRow.children];
        const cols = cells.length;
        if (cols === 0) return;

        const FLOOR = 40; // matches the drag-resize minimum
        const widthOf = (th) => {
            const px = parseFloat(th.style.width);
            return Number.isFinite(px) ? px : th.getBoundingClientRect().width;
        };
        const cur = cells.map(widthOf);

        // Fill invariant: pick a flexible column and stretch it to soak up
        // any freed width so the summed total is never below the container.
        const wrap = this._tableWrapEl;
        const avail = wrap ? wrap.clientWidth : 0;
        let flexIdx = cols - 1;
        if (dragIdx != null && flexIdx === dragIdx) flexIdx -= 1; // step off the dragged col
        if (avail > 1 && flexIdx >= 0 && flexIdx !== dragIdx) {
            let rest = 0;
            for (let i = 0; i < cols; i++) if (i !== flexIdx) rest += cur[i];
            const fill = Math.max(FLOOR, Math.round(avail - rest));
            if (Math.round(fill) !== Math.round(cur[flexIdx])) {
                this._pinColumnWidth(flexIdx, fill);
                cur[flexIdx] = fill;
            }
        }

        let total = 0;
        for (const w of cur) total += w;
        total = Math.ceil(total);
        headerTable.style.width = `${total}px`;
        if (bodyTable) bodyTable.style.width = `${total}px`;
    }

    /** Add a native `title` tooltip to any body cell whose text is
     *  clipped by its column width; remove ours once it fits again.
     *  Leaves caller-supplied titles (e.g. from renderCell) untouched. */
    _updateCellTooltips() {
        const bodyTable = this._tableEl;
        if (!bodyTable) return;
        bodyTable.querySelectorAll('tbody td').forEach((td) => {
            const clipped = td.scrollWidth > td.clientWidth + 1;
            if (clipped) {
                if (!td.title) td.title = td.textContent;
            } else if (td.title && td.title === td.textContent) {
                td.removeAttribute('title');
            }
        });
    }

    _installInteractions() {
        if (!this._tbodyEl || !this._tableEl) return;

        const { selectable, copyable } = this.config;
        const tbody = this._tbodyEl;
        const table = this._tableEl;

        if (selectable) {
            const handleRowClick = (event) => {
                const rowEl = event.target.closest('tr');
                if (!rowEl || rowEl.__rowIndex === undefined) return;

                const idx = rowEl.__rowIndex;
                const selected = this._state.selected;

                if (event.shiftKey && this._state.anchorIndex != null) {
                    const start = Math.min(this._state.anchorIndex, idx);
                    const end = Math.max(this._state.anchorIndex, idx);
                    selected.clear();
                    for (let i = start; i <= end; i++) selected.add(i);
                } else if (event.metaKey || event.ctrlKey) {
                    if (selected.has(idx)) selected.delete(idx);
                    else selected.add(idx);
                    this._state.anchorIndex = idx;
                } else {
                    selected.clear();
                    selected.add(idx);
                    this._state.anchorIndex = idx;
                }

                this._updateRowSelection();
                this._notifySelectionChange();
                try { table.focus({ preventScroll: true }); } catch (_) {}
            };

            tbody.addEventListener('click', handleRowClick);
            this._disposers.push(() => tbody.removeEventListener('click', handleRowClick));
        }

        if (copyable) {
            const handleContextMenu = (event) => {
                const rowEl = event.target.closest('tr');
                if (!rowEl) {
                    this._hideContextMenu();
                    return;
                }

                event.preventDefault();
                event.stopPropagation();

                const idx = rowEl.__rowIndex;
                if (idx !== undefined && !this._state.selected.has(idx)) {
                    this._state.selected.clear();
                    this._state.selected.add(idx);
                    this._state.anchorIndex = idx;
                    this._updateRowSelection();
                    this._notifySelectionChange();
                }

                try { table.focus({ preventScroll: true }); } catch (_) {}
                setTimeout(() => this._showContextMenu(event.clientX, event.clientY), 0);
            };

            tbody.addEventListener('contextmenu', handleContextMenu);
            this._disposers.push(() => tbody.removeEventListener('contextmenu', handleContextMenu));

            const handleKeyDown = (event) => {
                const ctrlLike = event.ctrlKey || event.metaKey;
                if (ctrlLike && !event.altKey) {
                    const key = String(event.key || '').toLowerCase();
                    if (key === 'a' && selectable) {
                        event.preventDefault();
                        this._state.selected.clear();
                        // Select only visible (filtered) rows via index map
                        const indexMap = this._processedIndexMap;
                        if (indexMap) {
                            for (const originalIdx of indexMap) {
                                this._state.selected.add(originalIdx);
                            }
                        } else {
                            for (let i = 0; i < this.config.rows.length; i++) {
                                this._state.selected.add(i);
                            }
                        }
                        this._state.anchorIndex = this.config.rows.length - 1;
                        this._updateRowSelection();
                        this._notifySelectionChange();
                    } else if (key === 'c') {
                        event.preventDefault();
                        this.copyToClipboard(event.shiftKey ? 'csv' : 'tsv');
                    }
                } else if (event.key === 'Escape') {
                    if (this._state.selected.size) {
                        this.clearSelection();
                    }
                    this._hideContextMenu();
                }
            };

            table.addEventListener('keydown', handleKeyDown);
            this._disposers.push(() => table.removeEventListener('keydown', handleKeyDown));
        }
    }

    _updateRowSelection() {
        if (!this._tbodyEl) return;
        this._tbodyEl.querySelectorAll('tr').forEach(tr => {
            const idx = tr.__rowIndex;
            if (idx !== undefined) {
                tr.classList.toggle('selected', this._state.selected.has(idx));
            }
        });
    }

    _notifySelectionChange() {
        this.config.onSelectionChange?.(this.getSelection());
    }

    _ensureContextMenu() {
        if (this._contextMenuEl) return this._contextMenuEl;

        const menu = document.createElement('div');
        menu.className = 'twm-context-menu data-context-menu';
        menu.style.display = 'none';
        menu.style.position = 'fixed';
        menu.style.zIndex = '10001';
        menu.innerHTML = `
            <div class="twm-context-menu-item" data-action="copy-tsv">
                <span class="material-symbols-outlined">content_copy</span>
                <span class="label">Copy Row(s)</span>
            </div>
            <div class="twm-context-menu-item" data-action="copy-csv">
                <span class="material-symbols-outlined">table</span>
                <span class="label">Copy as CSV</span>
            </div>
        `;
        document.body.appendChild(menu);

        menu.addEventListener('click', (event) => {
            const item = event.target.closest('.twm-context-menu-item');
            if (!item || item.classList.contains('disabled')) return;
            const action = item.getAttribute('data-action');
            if (action === 'copy-tsv') this.copyToClipboard('tsv');
            else if (action === 'copy-csv') this.copyToClipboard('csv');
            event.stopPropagation();
            event.preventDefault();
        }, { capture: true });

        menu.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });

        const hideOnGlobal = (event) => {
            if (event?.target && menu.contains(event.target)) return;
            this._hideContextMenu();
        };
        const hideOnEscape = (event) => {
            if (event.key === 'Escape') this._hideContextMenu();
        };
        const hideOnResize = () => this._hideContextMenu();

        document.addEventListener('click', hideOnGlobal, true);
        document.addEventListener('scroll', hideOnGlobal, true);
        window.addEventListener('resize', hideOnResize);
        document.addEventListener('keydown', hideOnEscape);

        this._contextMenuGlobals.push(() => document.removeEventListener('click', hideOnGlobal, true));
        this._contextMenuGlobals.push(() => document.removeEventListener('scroll', hideOnGlobal, true));
        this._contextMenuGlobals.push(() => document.removeEventListener('keydown', hideOnEscape));
        this._contextMenuGlobals.push(() => window.removeEventListener('resize', hideOnResize));

        this._contextMenuEl = menu;
        return menu;
    }

    _hideContextMenu() {
        if (this._contextMenuEl) {
            this._contextMenuEl.style.display = 'none';
        }
    }

    _showContextMenu(clientX, clientY) {
        const menu = this._ensureContextMenu();
        const hasSelection = this._state.selected.size > 0;

        menu.querySelectorAll('.twm-context-menu-item').forEach(item => {
            item.classList.toggle('disabled', !hasSelection);
            item.style.pointerEvents = hasSelection ? '' : 'none';
        });

        menu.style.display = 'block';
        const rect = menu.getBoundingClientRect();
        let left = clientX;
        let top = clientY;

        if (left + rect.width > window.innerWidth) {
            left = window.innerWidth - rect.width - 8;
        }
        if (top + rect.height > window.innerHeight) {
            top = window.innerHeight - rect.height - 8;
        }

        menu.style.left = `${left}px`;
        menu.style.top = `${top}px`;
    }

    _teardownContextMenu() {
        this._contextMenuGlobals.forEach(dispose => {
            try { dispose?.(); } catch (_) {}
        });
        this._contextMenuGlobals = [];
        if (this._contextMenuEl?.parentNode) {
            this._contextMenuEl.parentNode.removeChild(this._contextMenuEl);
        }
        this._contextMenuEl = null;
    }

    _formatValue(value, colIndex) {
        if (this.config.formatValue) {
            return this.config.formatValue(value, colIndex);
        }
        if (value === undefined || value === null) return '-';
        if (typeof value === 'number') {
            if (!Number.isFinite(value)) return '-';
            return Number(value.toFixed(4)).toString();
        }
        return String(value);
    }

    _csvEscape(value) {
        if (value == null) return '';
        const str = String(value);
        if (/[",\n]/.test(str)) {
            return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
    }

    _fallbackCopy(text) {
        try {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.setAttribute('readonly', '');
            textarea.style.position = 'absolute';
            textarea.style.left = '-9999px';
            document.body.appendChild(textarea);
            textarea.select();
            const ok = document.execCommand('copy');
            document.body.removeChild(textarea);
            return ok;
        } catch (_) {
            return false;
        }
    }

    _notify(title, message, type = 'info') {
        this.config.services?.eventBus?.emit?.('toast:show', { title, message, type });
    }
}

export default DataTable;
