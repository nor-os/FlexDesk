// src/ui/utils/raf_resize_observer.js
function createRafResizeObserver(callback) {
  let scheduled = false;
  let latestEntries = [];
  return new ResizeObserver((entries) => {
    latestEntries = entries;
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      callback(latestEntries);
    });
  });
}

// src/ui/components/data_table.js
var DEFAULT_PAGE_SIZE = 100;
var AUTOSIZE_MAX_PX = 520;
var VIRTUAL_FALLBACK_VIEWPORT_PX = 1e3;
var DataTable = class {
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
      emptyMessage: "No data",
      onSort: null,
      // OFF unless asked for, for `columnFit`'s reason below: a sort kept
      // the client-side page before this key existed, so turning the
      // reset on for everybody would change every paged table that never
      // asked. See the typedef.
      resetPageOnSort: false,
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
      mode: "normal",
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
      columnFit: "container",
      // C10. Off unless asked for — see the typedef.
      virtualize: false,
      virtualRowHeight: null,
      onRowsRendered: null,
      ...config
    };
    this._virt = null;
    this._virtBase = null;
    if (this.config.persistKey && !this.config.stateStore) {
      throw new Error(`DataTable: persistKey "${this.config.persistKey}" requires { stateStore }`);
    }
    this._state = {
      offset: 0,
      selected: /* @__PURE__ */ new Set(),
      anchorIndex: null,
      sortColumn: null,
      sortAscending: true,
      filters: /* @__PURE__ */ new Map()
    };
    this._columnTypes = [];
    this._processedRows = null;
    this._processedIndexMap = null;
    this._filterDebounceTimer = null;
    this._wrapperEl = null;
    this._paginationEl = null;
    this._tableEl = null;
    this._tbodyEl = null;
    this._contextMenuEl = null;
    this._filterDropdownEl = null;
    this._filterDropdownCleanup = null;
    this._colWidths = {};
    this._colWidthsSig = null;
    this._disposers = [];
    this._contextMenuGlobals = [];
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
    if (typeof blob.sortColumn === "number" || blob.sortColumn === null) {
      this._state.sortColumn = blob.sortColumn;
      this._state.sortAscending = blob.sortAscending !== false;
      applied = true;
    }
    if (Array.isArray(blob.filters)) {
      this._state.filters = new Map(blob.filters);
      applied = true;
    }
    if (blob.colWidths && typeof blob.colWidths === "object") {
      this._colWidths = {};
      for (const [k, v] of Object.entries(blob.colWidths)) {
        this._colWidths[Number(k)] = v;
      }
      this._colWidthsSig = this._colSig();
      applied = true;
    }
    return applied;
  }
  /** Identity of the current column set — restored widths/sort are
   *  keyed by position, so a schema change invalidates them. */
  _colSig() {
    return (this.config.headers || []).join("") + (this.config.showRowNumbers ? "|#" : "");
  }
  /** Snapshot the persistable slice of state to the project store.
   *  No-op unless `persistKey` is set. Debounced inside the store. */
  _savePersisted() {
    if (!this.config.persistKey) return;
    this.config.stateStore.set(this.config.persistKey, {
      sortColumn: this._state.sortColumn,
      sortAscending: this._state.sortAscending,
      filters: [...this._state.filters.entries()],
      colWidths: { ...this._colWidths }
    });
  }
  /**
   * Update data and re-render
   * @param {Object} updates - Partial config updates (headers, rows, etc.)
   */
  setData(updates) {
    if (updates.headers && this._state.filters.size > 0) {
      const oldHeaders = this.config.headers;
      const newHeaders = updates.headers;
      if (oldHeaders.length !== newHeaders.length || oldHeaders.some((h, i) => h !== newHeaders[i])) {
        this._state.filters.clear();
      }
    }
    Object.assign(this.config, updates);
    if (updates.rows) {
      this._state.selected.clear();
      this._state.anchorIndex = null;
      if (this._state.offset >= updates.rows.length) {
        this._state.offset = 0;
      }
      this._columnTypes = this._detectColumnTypes();
    }
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
    let overlay = this._wrapperEl.querySelector(".twm-data-table__loading");
    if (on) {
      if (!overlay) {
        overlay = document.createElement("div");
        overlay.className = "twm-data-table__loading";
        overlay.innerHTML = '<div class="twm-data-table__spinner"></div>';
        if (!this._wrapperEl.style.position) {
          this._wrapperEl.style.position = "relative";
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
    if (this._state.sortColumn === colIndex && ascending === void 0) {
      this._state.sortAscending = !this._state.sortAscending;
    } else {
      this._state.sortColumn = colIndex;
      this._state.sortAscending = ascending ?? true;
    }
    this._processedRows = null;
    this._processedIndexMap = null;
    if (this.config.resetPageOnSort) this._state.offset = 0;
    const ret = this.config.onSort?.(colIndex, this._state.sortAscending);
    this._awaitWithSpinner(ret);
    this._savePersisted();
    this.render();
  }
  /** Internal: if `maybePromise` is a Promise (or thenable),
   * toggle the loading overlay around it. No-op otherwise. */
  _awaitWithSpinner(maybePromise) {
    if (!maybePromise || typeof maybePromise.then !== "function") return;
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
    const activeFilterColIdx = this._getActiveFilterColIdx();
    const doc = this.container.ownerDocument;
    const hadTableFocus = !!this._tableEl && doc?.activeElement === this._tableEl;
    const prevWrap = this._tableWrapEl;
    const prevScroll = prevWrap?.isConnected && this._renderedOffset === this._state.offset ? { top: prevWrap.scrollTop, left: prevWrap.scrollLeft } : null;
    this._cleanup();
    this.container.innerHTML = "";
    this._virt = null;
    const { rows, pagination, emptyMessage } = this.config;
    const colSig = this._colSig();
    if (this._colWidthsSig !== colSig) {
      this._colWidths = {};
      this._colWidthsSig = colSig;
    }
    if (this._columnTypes.length === 0) {
      this._columnTypes = this._detectColumnTypes();
    }
    this._wrapperEl = document.createElement("div");
    this._wrapperEl.className = "twm-data-table-component" + (this.config.mode === "compact" ? " twm-data-table-component--compact" : "");
    this._wrapperEl.style.cssText = "display:flex; flex-direction:column; height:100%; min-height:0;";
    if (pagination && rows.length > 0) {
      this._paginationEl = this._createPagination();
      if (this._paginationEl) this._wrapperEl.appendChild(this._paginationEl);
    }
    const tableWrap = document.createElement("div");
    tableWrap.className = this.config.readonly ? "twm-preview-table-wrap twm-preview-table-wrap--wizard" : "twm-preview-table-wrap";
    tableWrap.style.cssText = "flex:1 1 0; min-height:0; min-width:0; overflow:auto;";
    if (rows.length === 0) {
      const { headers, showRowNumbers } = this.config;
      const headerWrap = document.createElement("div");
      headerWrap.className = "twm-preview-table-header-wrap";
      headerWrap.style.cssText = "flex:0 0 auto; overflow:hidden; min-width:0;";
      const headerTable = document.createElement("table");
      headerTable.className = this.config.readonly ? "twm-preview-table twm-preview-table--readonly" : "twm-preview-table";
      const thead = document.createElement("thead");
      const tr = document.createElement("tr");
      if (showRowNumbers) {
        const th = document.createElement("th");
        th.className = "num";
        th.textContent = "#";
        tr.appendChild(th);
      }
      headers.forEach((h, colIdx) => {
        const th = document.createElement("th");
        th.className = this._columnTypes[colIdx] || "text";
        th.textContent = h;
        tr.appendChild(th);
      });
      thead.appendChild(tr);
      headerTable.appendChild(thead);
      headerWrap.appendChild(headerTable);
      this._wrapperEl.appendChild(headerWrap);
      this._headerWrapEl = headerWrap;
      this._headerTableEl = headerTable;
      const bodyTable = document.createElement("table");
      bodyTable.className = headerTable.className;
      const tbody = document.createElement("tbody");
      const emptyTr = document.createElement("tr");
      emptyTr.className = "data-preview-row data-table__empty-row";
      const colCount = headers.length + (showRowNumbers ? 1 : 0);
      const emptyTd = document.createElement("td");
      emptyTd.colSpan = colCount;
      emptyTd.style.cssText = "text-align:center; font-style:italic; color:#888; padding:16px;";
      emptyTd.textContent = emptyMessage;
      emptyTr.appendChild(emptyTd);
      tbody.appendChild(emptyTr);
      bodyTable.appendChild(tbody);
      tableWrap.appendChild(bodyTable);
      this._wrapperEl.appendChild(tableWrap);
      this._tableEl = bodyTable;
      this._tableWrapEl = tableWrap;
    } else {
      const fullTable = this._createTable();
      this._tableEl = fullTable;
      const thead = fullTable.querySelector("thead");
      if (thead) {
        const headerWrap = document.createElement("div");
        headerWrap.className = "twm-preview-table-header-wrap";
        headerWrap.style.cssText = "flex:0 0 auto; overflow:hidden; min-width:0;";
        const headerTable = document.createElement("table");
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
    if (prevScroll && this._state.offset === this._renderedOffset) {
      tableWrap.scrollTop = prevScroll.top;
      tableWrap.scrollLeft = prevScroll.left;
    }
    this._renderedOffset = this._state.offset;
    if (this._virt) {
      const onScroll = () => this._virtUpdate();
      tableWrap.addEventListener("scroll", onScroll, { passive: true });
      this._disposers.push(() => tableWrap.removeEventListener("scroll", onScroll));
      this._virtMeasure();
      this._virtUpdate({ force: true, notify: false });
    }
    if (this._headerTableEl && this._tableEl) {
      requestAnimationFrame(() => this._syncHeaderWidths());
      if (this._resizeObserver) {
        try {
          this._resizeObserver.disconnect();
        } catch (_) {
        }
      }
      if (typeof ResizeObserver !== "undefined") {
        this._resizeObserver = createRafResizeObserver(() => {
          this._syncHeaderWidths();
          this._virtUpdate();
        });
        this._resizeObserver.observe(this._wrapperEl);
      }
      this._installHeaderScrollSync();
      if (rows.length > 0) this._installColumnResizers();
    }
    if (rows.length > 0 && (this.config.selectable || this.config.copyable || !this.config.readonly)) {
      this._installInteractions();
    }
    if (activeFilterColIdx !== null) {
      this._restoreFilterFocus(activeFilterColIdx);
    } else if (hadTableFocus && this._tableEl) {
      try {
        this._tableEl.focus({ preventScroll: true });
      } catch (_) {
      }
    }
  }
  /**
   * Copy selected rows to clipboard
   * @param {'tsv'|'csv'} [format='tsv'] - Output format
   */
  async copyToClipboard(format = "tsv") {
    const indices = this.getSelection();
    if (indices.length === 0) {
      this._notify("Copy", "No rows selected.", "warn");
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
    const separator = format === "csv" ? "," : "	";
    const text = format === "csv" ? matrix.map((row) => row.map((cell) => this._csvEscape(cell)).join(separator)).join("\n") : matrix.map((row) => row.join(separator)).join("\n");
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch (_) {
      ok = this._fallbackCopy(text);
    }
    if (ok) {
      const desc = indices.length === 1 ? "row" : "rows";
      const suffix = format === "csv" ? " as CSV" : "";
      this._notify("Copy", `Copied ${indices.length} ${desc}${suffix}.`, "info");
    } else {
      this._notify("Copy", "Clipboard unavailable.", "warn");
    }
    this._hideContextMenu();
  }
  /**
   * Download all data as CSV
   * @param {string} [filename='data.csv'] - Filename for download
   */
  async downloadCSV(filename = "data.csv") {
    const { headers, rows } = this.config;
    if (rows.length === 0) {
      this._notify("Download", "No data to download.", "warn");
      return;
    }
    const lines = [headers.join(",")];
    for (const row of rows) {
      lines.push(row.map(
        (val, colIdx) => this._csvEscape(this._formatValue(val, colIdx))
      ).join(","));
    }
    const csv = lines.join("\n");
    const dialogs = this.config.host?.dialogs;
    let result = null;
    if (dialogs) {
      try {
        result = await dialogs.saveFile({ data: csv, filename, kind: "csv" });
      } catch (err) {
        console.error("[DataTable] CSV download failed:", err);
        this._notify("Download", "Failed to save file", "error");
        return;
      }
    }
    if (result) {
      if (result.ok) {
        this._notify("Download", `Saved ${rows.length} rows to ${result.path}`, "success");
      } else if (!result.cancelled) {
        this._notify("Download", result.error || "Failed to save file", "error");
      }
      return;
    }
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    this._notify("Download", "Download started", "info");
  }
  /**
   * Dispose and cleanup
   */
  dispose() {
    this._cleanup();
    this._closeFilterDropdown();
    this._teardownContextMenu();
    if (this._resizeObserver) {
      try {
        this._resizeObserver.disconnect();
      } catch (_) {
      }
      this._resizeObserver = null;
    }
    if (this._onBodyScroll && this._scrollSyncEl) {
      try {
        this._scrollSyncEl.removeEventListener("scroll", this._onBodyScroll);
      } catch (_) {
      }
      this._onBodyScroll = null;
      this._scrollSyncEl = null;
    }
    this.container.innerHTML = "";
    this._wrapperEl = null;
    this._paginationEl = null;
    this._tableEl = null;
    this._tbodyEl = null;
    this._headerTableEl = null;
    this._headerWrapEl = null;
    this._tableWrapEl = null;
    this._processedRows = null;
    this._processedIndexMap = null;
    this._virt = null;
    this._colgroupEl = null;
  }
  // ─────────────────────────────────────────────────────────────────
  // Processed rows pipeline (filter → sort → cache)
  // ─────────────────────────────────────────────────────────────────
  _getProcessedRows() {
    if (this._processedRows !== null) return this._processedRows;
    const isServerSide = typeof this.config.onPageChange === "function";
    let rows = this.config.rows;
    let indexMap = rows.map((_, i) => i);
    if (!isServerSide && this._state.filters.size > 0) {
      const result = this._applyFilters(rows, indexMap);
      rows = result.rows;
      indexMap = result.indexMap;
    }
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
        if (colType === "num") {
          if (!this._matchNumericFilter(value, filterText)) {
            pass = false;
            break;
          }
        } else {
          if (!this._matchTextFilter(value, filterText)) {
            pass = false;
            break;
          }
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
    const paired = rows.map((row, i) => ({ row, origIdx: indexMap[i] }));
    const isNumeric = this._columnTypes[colIdx] === "num";
    paired.sort((a, b) => {
      let valA = a.row[colIdx];
      let valB = b.row[colIdx];
      if (valA == null && valB == null) return 0;
      if (valA == null) return 1;
      if (valB == null) return -1;
      if (isNumeric) {
        valA = typeof valA === "number" ? valA : parseFloat(valA);
        valB = typeof valB === "number" ? valB : parseFloat(valB);
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
      rows: paired.map((p) => p.row),
      indexMap: paired.map((p) => p.origIdx)
    };
  }
  _matchNumericFilter(value, filterText) {
    const text = filterText.trim();
    if (!text) return true;
    const numVal = typeof value === "number" ? value : parseFloat(value);
    if (!Number.isFinite(numVal)) return false;
    const rangeMatch = text.match(/^(-?[\d.]+)\.\.(-?[\d.]+)$/);
    if (rangeMatch) {
      const lo = parseFloat(rangeMatch[1]);
      const hi = parseFloat(rangeMatch[2]);
      return numVal >= lo && numVal <= hi;
    }
    const opMatch = text.match(/^(>=|<=|!=|>|<|=)\s*(-?[\d.]+)$/);
    if (opMatch) {
      const op = opMatch[1];
      const target = parseFloat(opMatch[2]);
      if (!Number.isFinite(target)) return true;
      switch (op) {
        case ">":
          return numVal > target;
        case "<":
          return numVal < target;
        case ">=":
          return numVal >= target;
        case "<=":
          return numVal <= target;
        case "!=":
          return Math.abs(numVal - target) > 1e-9;
        case "=":
          return Math.abs(numVal - target) <= 1e-9;
      }
    }
    const plain = parseFloat(text);
    if (Number.isFinite(plain)) {
      return Math.abs(numVal - plain) <= 1e-9;
    }
    return true;
  }
  _matchTextFilter(value, filterText) {
    if (!filterText) return true;
    const haystack = (value == null ? "" : String(value)).toLowerCase();
    const text = filterText.trim();
    if (text.startsWith('="') && text.endsWith('"')) {
      return haystack === text.slice(2, -1).toLowerCase();
    }
    if (text.startsWith("!")) {
      return !haystack.includes(text.slice(1).toLowerCase());
    }
    if (text.startsWith("^")) {
      return haystack.startsWith(text.slice(1).toLowerCase());
    }
    if (text.endsWith("$")) {
      return haystack.endsWith(text.slice(0, -1).toLowerCase());
    }
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
    const tr = document.createElement("tr");
    tr.className = "twm-data-table__filter-row";
    if (showRowNumbers) {
      const th = document.createElement("th");
      th.className = "data-table__filter-cell data-table__filter-cell--empty";
      tr.appendChild(th);
    }
    headers.forEach((header, colIdx) => {
      const th = document.createElement("th");
      th.className = "data-table__filter-cell";
      const wrapper = document.createElement("div");
      wrapper.className = "twm-data-table__filter-wrapper";
      const input = document.createElement("input");
      input.type = "text";
      input.className = "twm-data-table__filter-input";
      const isNumeric = this._columnTypes[colIdx] === "num";
      input.placeholder = isNumeric ? "e.g. >100" : "Filter...";
      const existingFilter = this._state.filters.get(colIdx);
      if (existingFilter) {
        input.value = existingFilter;
      }
      const dropdownBtn = document.createElement("button");
      dropdownBtn.type = "button";
      dropdownBtn.className = "twm-data-table__filter-dropdown-btn";
      dropdownBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:14px;">tune</span>';
      dropdownBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this._openFilterDropdown(colIdx, th, input);
      });
      const clearBtn = document.createElement("button");
      clearBtn.type = "button";
      clearBtn.className = "twm-data-table__filter-clear";
      clearBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:12px;">close</span>';
      clearBtn.style.display = existingFilter ? "" : "none";
      clearBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        input.value = "";
        this._onFilterInput(colIdx, "");
        clearBtn.style.display = "none";
        input.focus();
      });
      input.addEventListener("input", () => {
        clearBtn.style.display = input.value ? "" : "none";
        this._onFilterInputDebounced(colIdx, input.value);
      });
      th.addEventListener("click", (e) => e.stopPropagation());
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
    this._closeFilterDropdown();
    const isNumeric = this._columnTypes[colIdx] === "num";
    const currentFilter = this._state.filters.get(colIdx) || "";
    const parsed = this._parseFilterForDropdown(currentFilter, isNumeric);
    const panel = document.createElement("div");
    panel.className = "twm-data-table__filter-dropdown";
    const selectLabel = document.createElement("label");
    selectLabel.className = "twm-data-table__filter-dropdown-label";
    selectLabel.textContent = isNumeric ? "Operator" : "Mode";
    const select = document.createElement("select");
    select.className = "twm-data-table__filter-dropdown-select";
    const options = isNumeric ? [
      { value: "=", label: "Equals" },
      { value: "!=", label: "Not equals" },
      { value: ">", label: "Greater than" },
      { value: ">=", label: "Greater or equal" },
      { value: "<", label: "Less than" },
      { value: "<=", label: "Less or equal" },
      { value: "..", label: "Between" }
    ] : [
      { value: "contains", label: "Contains" },
      { value: "equals", label: "Equals" },
      { value: "starts", label: "Starts with" },
      { value: "ends", label: "Ends with" },
      { value: "not", label: "Not contains" }
    ];
    for (const opt of options) {
      const optEl = document.createElement("option");
      optEl.value = opt.value;
      optEl.textContent = opt.label;
      if (opt.value === parsed.operator) optEl.selected = true;
      select.appendChild(optEl);
    }
    const valueLabel = document.createElement("label");
    valueLabel.className = "twm-data-table__filter-dropdown-label";
    valueLabel.textContent = "Value";
    const valueInput = document.createElement("input");
    valueInput.type = isNumeric ? "number" : "text";
    valueInput.className = "twm-data-table__filter-dropdown-input";
    valueInput.placeholder = isNumeric ? "Number..." : "Text...";
    valueInput.value = parsed.value;
    const value2Label = document.createElement("label");
    value2Label.className = "twm-data-table__filter-dropdown-label";
    value2Label.textContent = "And";
    const value2Input = document.createElement("input");
    value2Input.type = "number";
    value2Input.className = "twm-data-table__filter-dropdown-input";
    value2Input.placeholder = "Number...";
    value2Input.value = parsed.value2;
    const value2Container = document.createElement("div");
    value2Container.className = "twm-data-table__filter-dropdown-between";
    value2Container.style.display = isNumeric && parsed.operator === ".." ? "" : "none";
    value2Container.appendChild(value2Label);
    value2Container.appendChild(value2Input);
    select.addEventListener("change", () => {
      value2Container.style.display = isNumeric && select.value === ".." ? "" : "none";
    });
    const actions = document.createElement("div");
    actions.className = "twm-data-table__filter-dropdown-actions";
    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "twm-data-table__filter-dropdown-btn-action twm-data-table__filter-dropdown-btn-action--clear";
    clearBtn.textContent = "Clear";
    clearBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      filterInput.value = "";
      this._onFilterInput(colIdx, "");
      this._closeFilterDropdown();
    });
    const applyBtn = document.createElement("button");
    applyBtn.type = "button";
    applyBtn.className = "twm-data-table__filter-dropdown-btn-action twm-data-table__filter-dropdown-btn-action--apply";
    applyBtn.textContent = "Apply";
    applyBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const composed = this._composeFilterString(select.value, valueInput.value, value2Input.value, isNumeric);
      filterInput.value = composed;
      this._onFilterInput(colIdx, composed);
      this._closeFilterDropdown();
    });
    actions.appendChild(clearBtn);
    actions.appendChild(applyBtn);
    panel.appendChild(selectLabel);
    panel.appendChild(select);
    panel.appendChild(valueLabel);
    panel.appendChild(valueInput);
    panel.appendChild(value2Container);
    panel.appendChild(actions);
    document.body.appendChild(panel);
    const anchorRect = anchorEl.getBoundingClientRect();
    let left = anchorRect.left;
    let top = anchorRect.bottom + 4;
    const panelRect = panel.getBoundingClientRect();
    if (left + panelRect.width > window.innerWidth) {
      left = window.innerWidth - panelRect.width - 8;
    }
    if (top + panelRect.height > window.innerHeight) {
      top = anchorRect.top - panelRect.height - 4;
    }
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    requestAnimationFrame(() => valueInput.focus());
    const handleOutsideClick = (e) => {
      if (!panel.contains(e.target)) {
        this._closeFilterDropdown();
      }
    };
    const handleEscape = (e) => {
      if (e.key === "Escape") {
        this._closeFilterDropdown();
      }
    };
    const handleEnter = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const composed = this._composeFilterString(select.value, valueInput.value, value2Input.value, isNumeric);
        filterInput.value = composed;
        this._onFilterInput(colIdx, composed);
        this._closeFilterDropdown();
      }
    };
    setTimeout(() => {
      document.addEventListener("click", handleOutsideClick, true);
    }, 0);
    document.addEventListener("keydown", handleEscape);
    panel.addEventListener("keydown", handleEnter);
    this._filterDropdownEl = panel;
    this._filterDropdownCleanup = () => {
      document.removeEventListener("click", handleOutsideClick, true);
      document.removeEventListener("keydown", handleEscape);
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
    const text = (filterText || "").trim();
    if (!text) {
      return { operator: isNumeric ? "=" : "contains", value: "", value2: "" };
    }
    if (isNumeric) {
      const rangeMatch = text.match(/^(-?[\d.]+)\.\.(-?[\d.]+)$/);
      if (rangeMatch) {
        return { operator: "..", value: rangeMatch[1], value2: rangeMatch[2] };
      }
      const opMatch = text.match(/^(>=|<=|!=|>|<|=)\s*(-?[\d.]+)$/);
      if (opMatch) {
        return { operator: opMatch[1], value: opMatch[2], value2: "" };
      }
      return { operator: "=", value: text, value2: "" };
    }
    if (text.startsWith('="') && text.endsWith('"')) {
      return { operator: "equals", value: text.slice(2, -1), value2: "" };
    }
    if (text.startsWith("!")) {
      return { operator: "not", value: text.slice(1), value2: "" };
    }
    if (text.startsWith("^")) {
      return { operator: "starts", value: text.slice(1), value2: "" };
    }
    if (text.endsWith("$")) {
      return { operator: "ends", value: text.slice(0, -1), value2: "" };
    }
    return { operator: "contains", value: text, value2: "" };
  }
  _composeFilterString(operator, value, value2, isNumeric) {
    if (!value && operator !== "..") return "";
    if (isNumeric) {
      if (operator === "..") {
        return value && value2 ? `${value}..${value2}` : "";
      }
      if (operator === "=") return value;
      return `${operator}${value}`;
    }
    switch (operator) {
      case "contains":
        return value;
      case "equals":
        return value ? `="${value}"` : "";
      case "starts":
        return value ? `^${value}` : "";
      case "ends":
        return value ? `${value}$` : "";
      case "not":
        return value ? `!${value}` : "";
      default:
        return value;
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
    if (!active || !active.classList.contains("twm-data-table__filter-input")) return null;
    const cell = active.closest(".data-table__filter-cell");
    if (!cell) return null;
    const row = cell.parentElement;
    if (!row) return null;
    const cells = Array.from(row.children);
    const idx = cells.indexOf(cell);
    return this.config.showRowNumbers ? idx - 1 : idx;
  }
  _restoreFilterFocus(colIdx) {
    const filterRow = this._wrapperEl?.querySelector(".twm-data-table__filter-row");
    if (!filterRow) return;
    const cellIdx = this.config.showRowNumbers ? colIdx + 1 : colIdx;
    const cell = filterRow.children[cellIdx];
    const input = cell?.querySelector(".twm-data-table__filter-input");
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }
  // ─────────────────────────────────────────────────────────────────
  // Private methods
  // ─────────────────────────────────────────────────────────────────
  _cleanup() {
    this._disposers.forEach((dispose) => {
      try {
        dispose?.();
      } catch (_) {
      }
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
      let numericCount = 0;
      let sampleCount = 0;
      const maxSamples = Math.min(10, rows.length);
      for (let i = 0; i < maxSamples; i++) {
        const value = rows[i]?.[colIdx];
        if (value != null && value !== "") {
          sampleCount++;
          if (typeof value === "number" || /^-?[\d,.]+%?$/.test(String(value).trim())) {
            numericCount++;
          }
        }
      }
      types.push(sampleCount > 0 && numericCount / sampleCount > 0.5 ? "num" : "text");
    }
    return types;
  }
  _createPagination() {
    const { rows, pageSize, totalCount: configTotalCount, offset: configOffset, onPageChange, onJumpToRow } = this.config;
    const isServerSide = typeof onPageChange === "function";
    const offset = isServerSide ? configOffset || 0 : this._state.offset;
    const processedRows = isServerSide ? rows : this._getProcessedRows();
    const effectiveTotal = isServerSide ? configTotalCount || rows.length : processedRows.length;
    const unfilteredTotal = isServerSide ? configTotalCount || rows.length : rows.length;
    const isFiltered = !isServerSide && this._state.filters.size > 0;
    const displayedRows = isServerSide ? rows.length : Math.min(pageSize, effectiveTotal - offset);
    const endRow = Math.min(offset + displayedRows, effectiveTotal);
    const totalPages = Math.max(1, Math.ceil(effectiveTotal / pageSize));
    if (totalPages <= 1 && !isFiltered) return null;
    const currentPage = Math.floor(offset / pageSize) + 1;
    const hasPrev = offset > 0;
    const hasNext = offset + pageSize < effectiveTotal;
    const el = document.createElement("div");
    el.className = "twm-pagination-controls";
    el.style.cssText = "display:flex; align-items:center; gap:6px; padding:2px 8px; border-bottom:1px solid #2a2a2a; font-size:11px;";
    const info = document.createElement("span");
    info.style.cssText = "color:#aaa; white-space:nowrap;";
    if (effectiveTotal === 0) {
      info.textContent = isFiltered ? `0 of ${unfilteredTotal.toLocaleString()} rows match` : "No rows";
    } else if (isFiltered) {
      info.textContent = `Rows ${offset + 1}\u2013${endRow} of ${effectiveTotal.toLocaleString()} (${unfilteredTotal.toLocaleString()} total)`;
    } else {
      info.textContent = `Rows ${offset + 1}\u2013${endRow} of ${effectiveTotal.toLocaleString()}`;
    }
    const spacer = document.createElement("div");
    spacer.style.flex = "1";
    const handlePageChange = (newOffset) => {
      if (isServerSide) {
        this._awaitWithSpinner(onPageChange(newOffset, pageSize));
      } else {
        this._state.offset = newOffset;
        this.render();
      }
    };
    const firstBtn = this._createPaginationBtn("first_page", "First page", !hasPrev, () => {
      handlePageChange(0);
    });
    const prevBtn = this._createPaginationBtn("chevron_left", "Previous page", !hasPrev, () => {
      handlePageChange(Math.max(0, offset - pageSize));
    });
    const pageInfo = document.createElement("span");
    pageInfo.style.cssText = "color:#aaa; font-size:10px; min-width:72px; text-align:center;";
    pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
    const nextBtn = this._createPaginationBtn("chevron_right", "Next page", !hasNext, () => {
      handlePageChange(offset + pageSize);
    });
    const lastBtn = this._createPaginationBtn("last_page", "Last page", !hasNext, () => {
      handlePageChange(Math.floor((effectiveTotal - 1) / pageSize) * pageSize);
    });
    const jumpInput = document.createElement("input");
    jumpInput.type = "number";
    jumpInput.className = "twm-pagination-input";
    jumpInput.style.cssText = "width:54px; padding:1px 4px; border:1px solid #444; background:#2a2a2a; color:#ccc; font-size:10px;";
    jumpInput.min = "1";
    jumpInput.max = String(effectiveTotal);
    jumpInput.placeholder = "Row #";
    const jumpBtn = this._createPaginationBtn(null, "Go to row", false, () => {
      const target = Number(jumpInput.value);
      if (Number.isFinite(target) && target >= 1) {
        if (isServerSide && onJumpToRow) {
          onJumpToRow(target - 1);
        } else if (isServerSide) {
          const newOffset = Math.floor((target - 1) / pageSize) * pageSize;
          handlePageChange(newOffset);
        } else {
          this.goToRow(target - 1);
        }
      }
    }, "Go");
    el.appendChild(info);
    el.appendChild(spacer);
    el.appendChild(firstBtn);
    el.appendChild(prevBtn);
    el.appendChild(pageInfo);
    el.appendChild(nextBtn);
    el.appendChild(lastBtn);
    el.appendChild(jumpInput);
    el.appendChild(jumpBtn);
    if (this.config.showExportButton) {
      const exportBtn = this._createPaginationBtn(
        "download",
        "Download visible rows as CSV",
        false,
        () => this.downloadCSV("data.csv")
      );
      el.appendChild(exportBtn);
    }
    return el;
  }
  _createPaginationBtn(icon, tooltip, disabled, onClick, textLabel = null) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "hoverbutton twm-pagination-btn twm-has-tooltip";
    btn.setAttribute("data-tooltip", tooltip);
    btn.disabled = disabled;
    btn.style.cssText = "padding:1px 3px; background:transparent; border:1px solid #444; color:#aaa; cursor:pointer; display:flex; align-items:center; justify-content:center; line-height:1;";
    if (disabled) {
      btn.style.opacity = "0.4";
      btn.style.cursor = "not-allowed";
    }
    if (icon) {
      const iconEl = document.createElement("span");
      iconEl.className = "material-symbols-outlined";
      iconEl.style.fontSize = "14px";
      iconEl.textContent = icon;
      btn.appendChild(iconEl);
    } else if (textLabel) {
      btn.textContent = textLabel;
      btn.style.fontSize = "10px";
      btn.style.padding = "1px 6px";
    }
    btn.addEventListener("click", onClick);
    return btn;
  }
  _createTable() {
    const { headers, rows, pageSize, sortable, filterable, showRowNumbers, readonly, getHeaderIcon, onPageChange, offset: configOffset } = this.config;
    const { sortColumn, sortAscending } = this._state;
    const isServerSide = typeof onPageChange === "function";
    const processedRows = isServerSide ? rows : this._getProcessedRows();
    const offset = isServerSide ? configOffset || 0 : this._state.offset;
    const pageRows = isServerSide || !this.config.pagination ? processedRows : processedRows.slice(offset, offset + pageSize);
    const table = document.createElement("table");
    table.className = readonly ? "twm-preview-table twm-preview-table--readonly" : "twm-preview-table";
    table.tabIndex = 0;
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    if (showRowNumbers) {
      const th = document.createElement("th");
      th.className = "num";
      th.textContent = "#";
      headerRow.appendChild(th);
    }
    headers.forEach((header, colIdx) => {
      const th = document.createElement("th");
      th.className = this._columnTypes[colIdx] || "text";
      if (sortable) {
        th.classList.add("sortable");
        th.style.cursor = "pointer";
      }
      if (getHeaderIcon) {
        const iconInfo = getHeaderIcon(header, colIdx);
        if (iconInfo) {
          const iconSpan = document.createElement("span");
          iconSpan.className = "material-symbols-outlined twm-header-icon twm-has-tooltip";
          iconSpan.setAttribute("data-tooltip", iconInfo.title || "");
          iconSpan.style.cssText = "font-size:16px; vertical-align:middle; margin-right:4px; opacity:0.7;";
          iconSpan.textContent = iconInfo.icon;
          th.appendChild(iconSpan);
        }
      }
      th.appendChild(document.createTextNode(header));
      if (sortable) {
        const sortIcon = document.createElement("span");
        sortIcon.className = "material-symbols-outlined twm-sort-icon";
        sortIcon.style.cssText = "font-size:14px; margin-left:4px; opacity:0.5;";
        if (sortColumn === colIdx) {
          sortIcon.textContent = sortAscending ? "arrow_upward" : "arrow_downward";
          sortIcon.style.opacity = "1";
        } else {
          sortIcon.textContent = "unfold_more";
        }
        th.appendChild(sortIcon);
        th.addEventListener("click", () => this.sortBy(colIdx));
      }
      th.title = header;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    if (filterable) {
      const filterRow = this._createFilterRow(headers);
      thead.appendChild(filterRow);
    }
    const virtual = this._isVirtual();
    if (virtual) {
      table.classList.add("twm-dt--virtual");
      table.appendChild(this._createColgroup());
    }
    table.appendChild(thead);
    const globalOf = (localIdx) => {
      const processedIdx = offset + localIdx;
      return isServerSide ? (configOffset || 0) + localIdx : this._processedIndexMap?.[processedIdx] ?? processedIdx;
    };
    const tbody = document.createElement("tbody");
    table.appendChild(tbody);
    this._tbodyEl = tbody;
    if (virtual) {
      this._virtInit(tbody, pageRows, globalOf, {
        serverSide: isServerSide,
        offset,
        configOffset: configOffset || 0
      });
    } else {
      pageRows.forEach((row, localIdx) => {
        tbody.appendChild(this._buildBodyRow(row, globalOf(localIdx), localIdx));
      });
    }
    return table;
  }
  /** One body row, fully built. The ONE place a `<tr>` for a row is made, so
   *  the full render and the virtual window cannot drift apart: a row drawn
   *  on scroll is the same row a render would have drawn. */
  _buildBodyRow(row, globalIdx, localIdx) {
    const { showRowNumbers } = this.config;
    const tr = document.createElement("tr");
    tr.__rowIndex = globalIdx;
    tr.className = "data-preview-row";
    if (this._state.selected.has(globalIdx)) {
      tr.classList.add("selected");
    }
    if (this._virt) tr.classList.toggle("twm-dt-row--alt", localIdx % 2 === 1);
    this._fillRowCells(tr, row, globalIdx, showRowNumbers);
    if (this.config.onRowClick) {
      tr.addEventListener("click", (ev) => {
        this.config.onRowClick(globalIdx, row, ev);
      });
    }
    if (this.config.onRowContextMenu) {
      tr.addEventListener("contextmenu", (ev) => {
        this.config.onRowContextMenu(globalIdx, row, ev);
      });
    }
    return tr;
  }
  // ─────────────────────────────────────────────────────────────────
  // C10 — the virtual window
  // ─────────────────────────────────────────────────────────────────
  //
  // ══ WHAT IT IS ═══════════════════════════════════════════════════
  //
  // Only the rows near the viewport are in the DOM: a TOP SPACER row whose
  // height is every row above the window, the window's rows, and a BOTTOM
  // SPACER for everything below it. The scrollbar is therefore sized to the
  // whole table and every row is reachable, while the DOM stays bounded by
  // the viewport — a thousand-row page (or fifty of them) costs the same
  // few dozen `<tr>`s as one screenful.
  //
  // ══ WHAT IT PROMISES ═════════════════════════════════════════════
  //
  //  - A row that stays in the window is NEVER MOVED OR REBUILT when the
  //    window slides. Rows leave from the edges and arrive at the edges; the
  //    ones in the middle are the same nodes. An open editor, a focused
  //    cell, a hover — anything living in a row that is still on screen —
  //    survives a scroll. (Moving a node that holds focus blurs it, which in
  //    an editable grid is a commit nobody asked for.)
  //  - Column widths come from a `<colgroup>`, so the first row changing
  //    moves nothing (see `_createTable`).
  //  - A spacer is in the DOM only while it has a height. A table that fits
  //    in its window has exactly the DOM it had without `virtualize`.
  //  - `onRowsRendered` hears about every row added after `render()`, and
  //    every row taken out.
  //
  // ══ WHAT IT ASSUMES ══════════════════════════════════════════════
  //
  // That a row's height is knowable without drawing it: `baseHeight`,
  // measured from a real row, or what `virtualRowHeight` says. A row that
  // wraps to two lines is drawn correctly and is simply mis-counted in the
  // spacer arithmetic by the difference — the overscan absorbs that.
  _isVirtual() {
    return !!this.config.virtualize;
  }
  _virtOptions() {
    const v = this.config.virtualize;
    const o = v && typeof v === "object" ? v : {};
    return {
      overscan: Number.isFinite(o.overscan) && o.overscan >= 0 ? Math.floor(o.overscan) : 20,
      rowHeight: Number.isFinite(o.rowHeight) && o.rowHeight > 0 ? o.rowHeight : 24
    };
  }
  /** One `<col>` per DOM column (the row-number column included), carrying
   *  any width already pinned for it, so a re-render starts at the widths it
   *  had rather than at a content-sized frame that then snaps. */
  _createColgroup() {
    const n = (this.config.headers?.length || 0) + (this.config.showRowNumbers ? 1 : 0);
    const colgroup = document.createElement("colgroup");
    for (let i = 0; i < n; i++) {
      const col = document.createElement("col");
      const w = this._colWidths?.[i];
      if (w != null && this._colWidthsSig === this._colSig()) col.style.width = `${w}px`;
      colgroup.appendChild(col);
    }
    this._colgroupEl = colgroup;
    return colgroup;
  }
  /** The `<col>`s, when this table has them. */
  _cols() {
    return this._virt && this._colgroupEl ? this._colgroupEl.children : null;
  }
  _virtInit(tbody, rows, globalOf, { serverSide, offset, configOffset }) {
    const { overscan, rowHeight } = this._virtOptions();
    const spacer = (edge) => {
      const tr = document.createElement("tr");
      tr.className = `twm-dt-spacer twm-dt-spacer--${edge}`;
      tr.setAttribute("aria-hidden", "true");
      const td = document.createElement("td");
      td.colSpan = Math.max(1, (this.config.headers?.length || 0) + (this.config.showRowNumbers ? 1 : 0));
      td.style.cssText = "padding:0;border:0;height:0;min-width:0;max-width:none;";
      tr.appendChild(td);
      return tr;
    };
    const filler = document.createElement("tr");
    filler.className = "twm-dt-spacer twm-dt-spacer--parity";
    filler.setAttribute("aria-hidden", "true");
    filler.hidden = true;
    this._virt = {
      tbody,
      rows,
      globalOf,
      serverSide,
      offset,
      configOffset,
      overscan,
      base: this._virtBase || rowHeight,
      heights: null,
      offsets: null,
      start: 0,
      end: 0,
      map: /* @__PURE__ */ new Map(),
      top: spacer("top"),
      bottom: spacer("bottom"),
      filler
    };
    this._virtComputeOffsets();
    const guess = this.container?.clientHeight || 0;
    this._virtUpdate({ force: true, notify: false, viewport: guess || void 0, top: 0 });
  }
  /** Heights and their running sum. `offsets[i]` is where row `i` starts;
   *  `offsets[n]` is the whole table. O(n), and rerun only when a height can
   *  have changed — a new measurement, or `refreshVirtualLayout()`. */
  _virtComputeOffsets() {
    const v = this._virt;
    if (!v) return;
    const n = v.rows.length;
    const heights = new Float64Array(n);
    const offsets = new Float64Array(n + 1);
    const fn = typeof this.config.virtualRowHeight === "function" ? this.config.virtualRowHeight : null;
    let y = 0;
    for (let i = 0; i < n; i++) {
      let h = v.base;
      if (fn) {
        const asked = fn(v.globalOf(i), v.base);
        h = Number.isFinite(asked) && asked > 0 ? asked : 0;
      }
      heights[i] = h;
      offsets[i] = y;
      y += h;
    }
    offsets[n] = y;
    v.heights = heights;
    v.offsets = offsets;
  }
  /** The row whose span contains `y`: the LAST `i` with `offsets[i] <= y`,
   *  which steps over rows of zero height at the same offset. */
  _virtIndexAt(y) {
    const v = this._virt;
    const n = v.rows.length;
    if (n === 0) return 0;
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = lo + hi + 1 >> 1;
      if (v.offsets[mid] <= y) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }
  /** Measure one real row. Client pixels, so the zoom is divided back out —
   *  `_measureNaturalWidths` explains why — and NOT `offsetHeight`, which is
   *  rounded: 21 for a 21.19px row is a 1,100px error over 6,000 rows. */
  _virtMeasure() {
    const v = this._virt;
    if (!v) return false;
    for (const tr of v.map.values()) {
      if (!tr.isConnected || tr.hidden) continue;
      const zoom = this._tableEl?.currentCSSZoom || 1;
      const h = tr.getBoundingClientRect().height / zoom;
      if (!(h > 0)) return false;
      if (Math.abs(h - v.base) > 0.01) {
        v.base = h;
        this._virtBase = h;
        this._virtComputeOffsets();
        return true;
      }
      return false;
    }
    return false;
  }
  /**
   * Slide the window to wherever the scroll box now is.
   *
   * HYSTERESIS, so a scroll of one pixel does not rebuild anything: the
   * window is redrawn only when the visible rows come within a quarter of the
   * overscan of either end of what is drawn, and it is then redrawn with the
   * full overscan on both sides.
   *
   * @param {object}  [o]
   * @param {boolean} [o.force]    redraw even inside the hysteresis band.
   * @param {boolean} [o.notify]   report added and removed rows to `onRowsRendered`.
   * @param {number}  [o.top]      the scroll offset to draw for, instead of
   *   reading one back — `scrollToRow` passes the offset it has just set,
   *   which a DOM with no layout would read back as 0.
   * @param {number}  [o.viewport] the viewport height, likewise.
   * @returns {HTMLElement[]} the rows added.
   */
  _virtUpdate({ force = false, notify = true, top = null, viewport = null } = {}) {
    const v = this._virt;
    if (!v || !v.offsets) return [];
    const n = v.rows.length;
    const wrap = this._tableWrapEl;
    const view = viewport || wrap?.clientHeight || VIRTUAL_FALLBACK_VIEWPORT_PX;
    const scrollTop = top ?? (wrap?.scrollTop || 0);
    const vs = this._virtIndexAt(scrollTop);
    const ve = Math.min(n, this._virtIndexAt(scrollTop + view) + 1);
    if (!force && v.end > v.start) {
      const margin = Math.max(1, Math.floor(v.overscan / 4));
      const lowOk = v.start === 0 || vs >= v.start + margin;
      const highOk = v.end === n || ve <= v.end - margin;
      if (lowOk && highOk) return [];
    }
    const start = Math.max(0, vs - v.overscan);
    const end = Math.min(n, ve + v.overscan);
    const removed = [];
    const added = this._virtRender(start, end, removed);
    if (added.length || removed.length) {
      if (added[0]?.isConnected && this._tableEl?.style.tableLayout === "fixed") {
        this._updateCellTooltips(added);
      }
      if (notify) {
        try {
          this.config.onRowsRendered?.({ rows: added, removed });
        } catch (err) {
          console.error("[DataTable] onRowsRendered threw", err);
        }
      }
    }
    return added;
  }
  /** Make the DOM hold exactly the drawable rows of `[start, end)`, without
   *  moving a row that is already there. See the promises above. */
  _virtRender(start, end, removed = null) {
    const v = this._virt;
    const tbody = v.tbody;
    const want = [];
    for (let i = start; i < end; i++) if (v.heights[i] > 0) want.push(i);
    const wanted = new Set(want);
    for (const [i, tr] of v.map) {
      if (!wanted.has(i)) {
        tr.remove();
        v.map.delete(i);
        removed?.push(tr);
      }
    }
    v.start = start;
    v.end = end;
    this._virtSpacers();
    const added = [];
    let ref = v.bottom.isConnected ? v.bottom : null;
    for (let k = want.length - 1; k >= 0; k--) {
      const i = want[k];
      const have = v.map.get(i);
      if (have) {
        ref = have;
        continue;
      }
      const tr = this._buildBodyRow(v.rows[i], v.globalOf(i), i);
      v.map.set(i, tr);
      tbody.insertBefore(tr, ref);
      ref = tr;
      added.push(tr);
    }
    added.reverse();
    return added;
  }
  /**
   * Size the two spacers, and put each in the DOM only while it has a height.
   *
   * AND KEEP THE STRIPE. `tr:nth-child(even)` stripes by POSITION, and in a
   * full render row `i` is child `i + 1`. Here the first drawn row is preceded
   * by the top spacer, so its position is off by one — and by a different one
   * each time the window's start changes parity, which strobes every stripe
   * on the screen as you scroll. A hidden filler row after the spacer, present
   * exactly when `start` is even, puts the parity back: a `display: none` row
   * is still a child, and so still counted by `nth-child`.
   */
  _virtSpacers() {
    const v = this._virt;
    const n = v.rows.length;
    const above = v.offsets[v.start];
    const below = v.offsets[n] - v.offsets[v.end];
    const tbody = v.tbody;
    if (above > 0) {
      v.top.firstChild.style.height = `${above}px`;
      if (tbody.firstChild !== v.top) tbody.insertBefore(v.top, tbody.firstChild);
      const needFiller = v.start % 2 === 0;
      if (needFiller && v.top.nextSibling !== v.filler) v.top.after(v.filler);
      else if (!needFiller) v.filler.remove();
    } else {
      v.top.remove();
      v.filler.remove();
    }
    if (below > 0) {
      v.bottom.firstChild.style.height = `${below}px`;
      if (tbody.lastChild !== v.bottom) tbody.appendChild(v.bottom);
    } else {
      v.bottom.remove();
    }
  }
  /**
   * Recompute every row's height and redraw the window. For an embedder whose
   * `virtualRowHeight` answer has changed — a group folded, a header added.
   * A no-op on a table that is not virtual.
   */
  refreshVirtualLayout() {
    if (!this._virt) return;
    this._virtMeasure();
    this._virtComputeOffsets();
    this._virtUpdate({ force: true });
  }
  /** The element that scrolls the body. Read-only; the table owns it. */
  get scrollElement() {
    return this._tableWrapEl || null;
  }
  /** The `<tr>` drawing row `rowIndex` (the `__rowIndex` space), or null when
   *  it is not in the DOM — outside the window, on another page, or hidden. */
  getRowElement(rowIndex) {
    const v = this._virt;
    if (v) {
      const local = this._virtLocalOf(rowIndex);
      return local < 0 ? null : v.map.get(local) || null;
    }
    const tbody = this._tbodyEl;
    if (!tbody) return null;
    for (const tr of tbody.children) if (tr.__rowIndex === rowIndex) return tr;
    return null;
  }
  /** Keep the window's row list and `config.rows` in step for one row. They
   *  are the same array in server-side mode; in client mode the window reads
   *  the filtered-and-sorted copy, which holds its own reference. */
  _virtSetRow(rowIndex, row) {
    const v = this._virt;
    if (!v) return;
    if (Array.isArray(this.config.rows) && rowIndex >= 0 && rowIndex < this.config.rows.length) {
      this.config.rows[rowIndex] = row;
    }
    const local = this._virtLocalOf(rowIndex);
    if (local >= 0) v.rows[local] = row;
  }
  /** `__rowIndex` → position in the window's row list, or -1. */
  _virtLocalOf(rowIndex) {
    const v = this._virt;
    if (!v) return -1;
    let local;
    if (v.serverSide) local = rowIndex - v.configOffset;
    else {
      const map = this._processedIndexMap;
      const processed = map ? map.indexOf(rowIndex) : rowIndex;
      local = processed < 0 ? -1 : processed - v.offset;
    }
    return local >= 0 && local < v.rows.length ? local : -1;
  }
  /**
   * Scroll the body so row `rowIndex` is on screen, drawing it if it was not,
   * and return its `<tr>` (null when it cannot be shown: another page, or a
   * row the embedder hides). Works with or without `virtualize`.
   *
   * @param {number} rowIndex  in the `__rowIndex` space.
   * @param {{block?: 'nearest'|'center'|'start'}} [opts]
   */
  scrollToRow(rowIndex, { block = "nearest" } = {}) {
    const wrap = this._tableWrapEl;
    const v = this._virt;
    if (!v) {
      const tr = this.getRowElement(rowIndex);
      if (!tr || !wrap) return tr;
      const zoom = this._tableEl?.currentCSSZoom || 1;
      const box = wrap.getBoundingClientRect();
      const r = tr.getBoundingClientRect();
      const rowTop = (r.top - box.top) / zoom + wrap.scrollTop;
      const rowH = r.height / zoom;
      const target2 = this._scrollTarget(
        rowTop,
        rowH,
        wrap.scrollTop,
        wrap.clientHeight,
        block
      );
      if (target2 !== wrap.scrollTop) wrap.scrollTop = target2;
      return tr;
    }
    const local = this._virtLocalOf(rowIndex);
    if (local < 0 || !(v.heights[local] > 0)) return null;
    const view = wrap?.clientHeight || VIRTUAL_FALLBACK_VIEWPORT_PX;
    const current = wrap?.scrollTop || 0;
    let target = this._scrollTarget(
      v.offsets[local],
      v.heights[local],
      current,
      view,
      block
    );
    target = Math.max(0, Math.min(target, Math.max(0, v.offsets[v.rows.length] - view)));
    if (wrap && Math.abs(target - current) >= 1) wrap.scrollTop = target;
    this._virtUpdate({ top: Math.abs(target - current) >= 1 ? target : current });
    return v.map.get(local) || null;
  }
  _scrollTarget(rowTop, rowH, current, view, block) {
    if (block === "start") return rowTop;
    if (block === "center") return rowTop - Math.max(0, (view - rowH) / 2);
    if (rowTop < current) return rowTop;
    if (rowTop + rowH > current + view) return rowTop + rowH - view;
    return current;
  }
  /** The first body row that draws a row of data — never a spacer, and never
   *  a row an embedder injected (a group header spans every column with ONE
   *  cell, so measuring it would report one column). */
  _firstBodyRow() {
    const tbody = this._tableEl?.querySelector?.("tbody");
    if (!tbody) return null;
    for (const tr of tbody.children) {
      if (tr.__rowIndex !== void 0) return tr;
    }
    return null;
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
      const td = document.createElement("td");
      td.className = "num";
      td.textContent = String(globalIdx + 1);
      tr.appendChild(td);
    }
    for (let colIdx = 0; colIdx < row.length; colIdx++) {
      const td = document.createElement("td");
      td.className = this._columnTypes[colIdx] || "text";
      const value = row[colIdx];
      if (this.config.renderCell) {
        const handled = this.config.renderCell(td, value, colIdx, globalIdx, row);
        if (!handled) {
          td.textContent = this._formatValue(value, colIdx);
        }
      } else {
        td.textContent = this._formatValue(value, colIdx);
      }
      if (this.config.onCellContextMenu) {
        const cellColIdx = colIdx;
        td.addEventListener("contextmenu", (ev) => {
          this.config.onCellContextMenu(
            cellColIdx,
            globalIdx,
            value,
            td,
            ev
          );
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
      if (candidate.__rowIndex === index) {
        tr = candidate;
        break;
      }
    }
    if (!tr) {
      if (this._virt) this._virtSetRow(index, row);
      return false;
    }
    if (Array.isArray(this.config.rows) && this.config.rows[index]) {
      this.config.rows[index] = row;
    }
    if (this._virt) this._virtSetRow(index, row);
    const active = document.activeElement;
    let focusedCol = -1;
    if (active && tr.contains(active)) {
      focusedCol = Array.prototype.indexOf.call(tr.children, active.closest("td"));
    }
    const isFirstRow = tr === tbody.firstElementChild;
    const widths = isFirstRow ? Array.prototype.map.call(tr.children, (td) => ({
      width: td.style.width,
      minWidth: td.style.minWidth,
      maxWidth: td.style.maxWidth
    })) : null;
    const showRowNumbers = this.config.showRowNumbers !== false && tr.firstElementChild?.classList.contains("num");
    this._fillRowCells(tr, row, index, showRowNumbers);
    if (widths) {
      widths.forEach((saved, i) => {
        const cell = tr.children[i];
        if (!saved.width || !cell) return;
        cell.style.width = saved.width;
        cell.style.minWidth = saved.minWidth;
        cell.style.maxWidth = saved.maxWidth;
      });
    }
    tr.classList.toggle("selected", this._state?.selected?.has(index) === true);
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
   * C10 — UNDER `virtualize` ONLY THE WINDOW IS IN THE DOM, so `max-content`
   * spans the eighty-odd rows drawn rather than every row loaded. The fit
   * pass that runs on every render is content with that (it is fitting what
   * is on screen). An EXPLICIT auto-size is not: it is a promise to fit the
   * column's content, and the longest value in a 6,000-row table is usually
   * not in the window. So `sample` adds, for the length of this one reflow,
   * the row holding each column's longest value — see `_virtSampleRows`.
   *
   * @param {{sample?: boolean}} [o]
   * @returns {number[]|null} width per DOM column index, or null when there
   *   is nothing laid out to measure.
   */
  _measureNaturalWidths({ sample = false } = {}) {
    const headerTable = this._headerTableEl;
    const bodyTable = this._tableEl;
    if (!headerTable || !bodyTable) return null;
    const firstRow = this._firstBodyRow();
    if (!firstRow) return null;
    const bodyCells = firstRow.children;
    if (!bodyCells.length) return null;
    headerTable.querySelectorAll("thead > tr").forEach((tr) => {
      for (const th of tr.children) this._clearCellWidth(th);
    });
    for (const td of bodyCells) this._clearCellWidth(td);
    for (const col of this._cols() || []) col.style.width = "";
    headerTable.style.width = "";
    bodyTable.style.width = "";
    headerTable.classList.add("twm-dt-measuring");
    bodyTable.classList.add("twm-dt-measuring");
    const sampled = sample ? this._virtSampleRows() : [];
    for (const tr of sampled) this._virt.tbody.appendChild(tr);
    bodyTable.offsetWidth;
    const labelRow = headerTable.querySelector("thead > tr");
    const cols = bodyCells.length;
    const natural = new Array(cols);
    const zoom = bodyTable.currentCSSZoom || 1;
    for (let i = 0; i < cols; i++) {
      const body = bodyCells[i].getBoundingClientRect().width / zoom;
      const head = labelRow && labelRow.children[i] ? labelRow.children[i].getBoundingClientRect().width / zoom : 0;
      natural[i] = Math.max(body, head);
    }
    for (const tr of sampled) tr.remove();
    headerTable.classList.remove("twm-dt-measuring");
    bodyTable.classList.remove("twm-dt-measuring");
    return natural;
  }
  /**
   * The rows an explicit auto-size must measure that the window has not
   * drawn: for each column, the drawable row whose value is LONGEST as a
   * string, plus the last row (the widest row number). Built with
   * `_buildBodyRow` — so a consumer's `renderCell` draws them exactly as it
   * would on screen — and handed back detached, for `_measureNaturalWidths`
   * to put in and take out around its one reflow.
   *
   * The string length is a proxy, not a measurement: in a proportional font
   * forty `i`s are narrower than thirty `W`s. It is the proxy a spreadsheet's
   * own autofit falls short by, and it is right about the case that matters
   * here — a value five times longer than anything in the window. One pass
   * over the loaded rows, on a click and never on a scroll or a resize.
   *
   * @returns {HTMLTableRowElement[]}
   */
  _virtSampleRows() {
    const v = this._virt;
    if (!v || !v.rows.length) return [];
    const longest = [];
    const at = [];
    let last = -1;
    for (let i = 0; i < v.rows.length; i++) {
      if (!(v.heights[i] > 0)) continue;
      last = i;
      const row = v.rows[i];
      if (!Array.isArray(row)) continue;
      for (let c = 0; c < row.length; c++) {
        const value = row[c];
        const len = value == null ? 0 : String(value).length;
        if (len > (longest[c] ?? -1)) {
          longest[c] = len;
          at[c] = i;
        }
      }
    }
    const want = new Set(at.filter((i) => i !== void 0));
    if (last >= 0) want.add(last);
    const rows = [];
    for (const i of want) {
      if (v.map.has(i)) continue;
      const tr = this._buildBodyRow(v.rows[i], v.globalOf(i), i);
      tr.setAttribute("aria-hidden", "true");
      rows.push(tr);
    }
    return rows;
  }
  /**
   * Fit one column to its widest value and pin it there — every loaded
   * row's, under `virtualize` (see `_virtSampleRows`), not only the window's.
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
    const natural = this._measureNaturalWidths({ sample: true });
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
    const natural = this._measureNaturalWidths({ sample: true });
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
    const bodyTable = this._tableEl;
    if (!headerTable || !bodyTable) return;
    const cols = this._cols();
    const firstRow = this._firstBodyRow();
    const bodyCells = cols ? [] : firstRow?.children;
    const n = cols ? cols.length : bodyCells?.length || 0;
    if (!n) return;
    const headerRows = headerTable.querySelectorAll("thead > tr");
    const natural = this._allColumnsPinned(n) ? new Array(n).fill(0) : this._measureNaturalWidths();
    if (!natural) return;
    const wrap = this._tableWrapEl;
    const headerWrap = this._headerWrapEl;
    const avail = wrap ? wrap.clientWidth : 0;
    const firstIdx = this.config.showRowNumbers && n > 1 ? 1 : 0;
    const widths = this._fitColumnWidths(natural, avail, {
      firstIdx,
      overrides: this._colWidths,
      fit: this.config.columnFit
    });
    const total = widths.reduce((a, b) => a + b, 0);
    headerRows.forEach((tr) => {
      for (let i = 0; i < tr.children.length && i < widths.length; i++) {
        this._setCellWidth(tr.children[i], widths[i]);
      }
    });
    if (cols) {
      for (let i = 0; i < cols.length && i < widths.length; i++) {
        cols[i].style.width = `${widths[i]}px`;
      }
    } else {
      for (let i = 0; i < bodyCells.length && i < widths.length; i++) {
        this._setCellWidth(bodyCells[i], widths[i]);
      }
    }
    headerTable.style.tableLayout = "fixed";
    bodyTable.style.tableLayout = "fixed";
    const hasOverride = Object.keys(this._colWidths).length > 0;
    if (hasOverride || total > avail + 1) {
      headerTable.style.width = `${total}px`;
      bodyTable.style.width = `${total}px`;
    } else {
      headerTable.style.width = "";
      bodyTable.style.width = "";
    }
    if (wrap && headerWrap) {
      const sbw = Math.max(0, wrap.offsetWidth - wrap.clientWidth);
      headerWrap.style.paddingRight = sbw ? `${sbw}px` : "";
      this._wrapperEl?.style?.setProperty("--twm-dt-gutter", `${sbw}px`);
    }
    this._syncHeaderScroll();
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
    const FLOOR = 40;
    const CAP = 360;
    const FIRST_CAP = 520;
    const PAD = 2;
    const n = natural.length;
    const firstIdx = opts.firstIdx ?? 0;
    const overrides = opts.overrides || {};
    const toContent = opts.fit === "content";
    const desired = new Array(n);
    const pinned = new Array(n).fill(false);
    for (let i = 0; i < n; i++) {
      if (overrides[i] != null) {
        desired[i] = Math.max(FLOOR, Math.round(overrides[i]));
        pinned[i] = true;
        continue;
      }
      if (toContent) {
        desired[i] = this._autoWidth(natural[i]);
        continue;
      }
      const cap = i === firstIdx ? FIRST_CAP : CAP;
      desired[i] = Math.min(cap, Math.max(FLOOR, Math.ceil(natural[i] + PAD)));
    }
    const widths = desired.slice();
    const sum = widths.reduce((a, b) => a + b, 0);
    if (avail <= 1) return widths;
    if (sum <= avail) {
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
    if (toContent) return widths;
    let protectedSum = 0;
    const shrinkable = [];
    for (let i = 0; i < n; i++) {
      if (pinned[i] || i === firstIdx) protectedSum += widths[i];
      else shrinkable.push(i);
    }
    const budget = avail - protectedSum;
    if (budget < shrinkable.length * FLOOR) {
      for (const i of shrinkable) widths[i] = FLOOR;
      return widths;
    }
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
    cell.style.minWidth = "0";
    cell.style.maxWidth = "none";
  }
  /** Undo `_setCellWidth` so a re-measure sees the cell's natural,
   *  CSS-constrained width again. */
  _clearCellWidth(cell) {
    cell.style.width = "";
    cell.style.minWidth = "";
    cell.style.maxWidth = "";
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
      this._scrollSyncEl.removeEventListener("scroll", this._onBodyScroll);
    }
    this._onBodyScroll = () => this._syncHeaderScroll();
    this._scrollSyncEl = wrap;
    wrap.addEventListener("scroll", this._onBodyScroll, { passive: true });
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
      headerTable.style.transform = x ? `translateX(${-x}px)` : "";
      return;
    }
    headerWrap.scrollLeft = x;
    const residual = x - headerWrap.scrollLeft;
    headerTable.style.transform = residual ? `translateX(${-residual}px)` : "";
  }
  /** Drag-to-resize: hang a thin grab handle off the right edge of
   *  every header cell. Dragging it writes a per-column width override
   *  (keyed by DOM index) that `_syncHeaderWidths` then honors. */
  _installColumnResizers() {
    const headerTable = this._headerTableEl;
    if (!headerTable) return;
    const headRow = headerTable.querySelector("thead > tr");
    if (!headRow) return;
    [...headRow.children].forEach((th, domIdx) => {
      if (th.querySelector(".twm-dt-col-resizer")) return;
      th.classList.add("twm-dt-col");
      const grip = document.createElement("div");
      grip.className = "twm-dt-col-resizer";
      grip.addEventListener(
        "mousedown",
        (ev) => this._beginColResize(ev, domIdx)
      );
      grip.addEventListener("click", (ev) => ev.stopPropagation());
      grip.addEventListener("dblclick", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        this.autoSizeColumn(domIdx);
      });
      th.appendChild(grip);
    });
  }
  /**
   * CSS px per screen px. Content inside a zoomed tile reports rects and
   * pointer coordinates in screen pixels, while `style.width` is CSS pixels;
   * mixing them widened every column by the zoom factor on a mere click.
   */
  _zoomFactor() {
    const el = this._tableWrapEl || this._tableEl;
    const css = el?.offsetWidth || 0;
    const screen = el?.getBoundingClientRect?.().width || 0;
    return css > 0 && screen > 0 ? screen / css : 1;
  }
  _beginColResize(ev, domIdx) {
    if (ev.button != null && ev.button !== 0) return;
    ev.preventDefault();
    ev.stopPropagation();
    const headerTable = this._headerTableEl;
    const bodyTable = this._tableEl;
    const headRow = headerTable && headerTable.querySelector("thead > tr");
    if (!headRow) return;
    const startX = ev.clientX;
    const THRESHOLD = 3;
    const MIN = 40;
    let startWidths = null;
    const begin = () => {
      const z = this._zoomFactor();
      startWidths = [...headRow.children].map((c) => {
        const set = parseFloat(c.style.width);
        return Number.isFinite(set) ? set : c.getBoundingClientRect().width / z;
      });
      headerTable.style.tableLayout = "fixed";
      if (bodyTable) bodyTable.style.tableLayout = "fixed";
      startWidths.forEach((w, i) => this._pinColumnWidth(i, w));
      this._applyTableWidth();
      document.body.classList.add("twm-dt-col-resizing");
    };
    const onMove = (mv) => {
      const dx = mv.clientX - startX;
      if (!startWidths) {
        if (Math.abs(dx) < THRESHOLD) return;
        begin();
      }
      const w = Math.max(MIN, Math.round(startWidths[domIdx] + dx / this._zoomFactor()));
      this._pinColumnWidth(domIdx, w);
      this._applyTableWidth(domIdx);
      this._syncHeaderScroll();
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      if (!startWidths) return;
      document.body.classList.remove("twm-dt-col-resizing");
      this._updateCellTooltips();
      this._savePersisted();
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
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
    headerTable.querySelectorAll("thead > tr").forEach((tr) => {
      if (tr.children[i]) this._setCellWidth(tr.children[i], w);
    });
    const cols = this._cols();
    if (cols) {
      if (cols[i]) cols[i].style.width = `${w}px`;
      return;
    }
    const bodyRow = bodyTable && this._firstBodyRow();
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
    const headRow = headerTable && headerTable.querySelector("thead > tr");
    if (!headRow) return;
    const cells = [...headRow.children];
    const cols = cells.length;
    if (cols === 0) return;
    const FLOOR = 40;
    const widthOf = (th) => {
      const px = parseFloat(th.style.width);
      return Number.isFinite(px) ? px : th.getBoundingClientRect().width;
    };
    const cur = cells.map(widthOf);
    const wrap = this._tableWrapEl;
    const avail = wrap ? wrap.clientWidth : 0;
    let flexIdx = cols - 1;
    if (dragIdx != null && flexIdx === dragIdx) flexIdx -= 1;
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
  _updateCellTooltips(rows = null) {
    const bodyTable = this._tableEl;
    if (!bodyTable) return;
    const cells = rows ? rows.flatMap((tr) => [...tr.children]) : bodyTable.querySelectorAll("tbody td");
    cells.forEach((td) => {
      if (td.parentElement?.classList.contains("twm-dt-spacer")) return;
      const clipped = td.scrollWidth > td.clientWidth + 1;
      if (clipped) {
        if (!td.title) td.title = td.textContent;
      } else if (td.title && td.title === td.textContent) {
        td.removeAttribute("title");
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
        const rowEl = event.target.closest("tr");
        if (!rowEl || rowEl.__rowIndex === void 0) return;
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
        try {
          table.focus({ preventScroll: true });
        } catch (_) {
        }
      };
      tbody.addEventListener("click", handleRowClick);
      this._disposers.push(() => tbody.removeEventListener("click", handleRowClick));
    }
    if (copyable) {
      const handleContextMenu = (event) => {
        const rowEl = event.target.closest("tr");
        if (!rowEl) {
          this._hideContextMenu();
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        const idx = rowEl.__rowIndex;
        if (idx !== void 0 && !this._state.selected.has(idx)) {
          this._state.selected.clear();
          this._state.selected.add(idx);
          this._state.anchorIndex = idx;
          this._updateRowSelection();
          this._notifySelectionChange();
        }
        try {
          table.focus({ preventScroll: true });
        } catch (_) {
        }
        setTimeout(() => this._showContextMenu(event.clientX, event.clientY), 0);
      };
      tbody.addEventListener("contextmenu", handleContextMenu);
      this._disposers.push(() => tbody.removeEventListener("contextmenu", handleContextMenu));
      const handleKeyDown = (event) => {
        const ctrlLike = event.ctrlKey || event.metaKey;
        if (ctrlLike && !event.altKey) {
          const key = String(event.key || "").toLowerCase();
          if (key === "a" && selectable) {
            event.preventDefault();
            this._state.selected.clear();
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
          } else if (key === "c") {
            event.preventDefault();
            this.copyToClipboard(event.shiftKey ? "csv" : "tsv");
          }
        } else if (event.key === "Escape") {
          if (this._state.selected.size) {
            this.clearSelection();
          }
          this._hideContextMenu();
        }
      };
      table.addEventListener("keydown", handleKeyDown);
      this._disposers.push(() => table.removeEventListener("keydown", handleKeyDown));
    }
  }
  _updateRowSelection() {
    if (!this._tbodyEl) return;
    this._tbodyEl.querySelectorAll("tr").forEach((tr) => {
      const idx = tr.__rowIndex;
      if (idx !== void 0) {
        tr.classList.toggle("selected", this._state.selected.has(idx));
      }
    });
  }
  _notifySelectionChange() {
    this.config.onSelectionChange?.(this.getSelection());
  }
  _ensureContextMenu() {
    if (this._contextMenuEl) return this._contextMenuEl;
    const menu = document.createElement("div");
    menu.className = "twm-context-menu data-context-menu";
    menu.style.display = "none";
    menu.style.position = "fixed";
    menu.style.zIndex = "10001";
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
    menu.addEventListener("click", (event) => {
      const item = event.target.closest(".twm-context-menu-item");
      if (!item || item.classList.contains("disabled")) return;
      const action = item.getAttribute("data-action");
      if (action === "copy-tsv") this.copyToClipboard("tsv");
      else if (action === "copy-csv") this.copyToClipboard("csv");
      event.stopPropagation();
      event.preventDefault();
    }, { capture: true });
    menu.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    const hideOnGlobal = (event) => {
      if (event?.target && menu.contains(event.target)) return;
      this._hideContextMenu();
    };
    const hideOnEscape = (event) => {
      if (event.key === "Escape") this._hideContextMenu();
    };
    const hideOnResize = () => this._hideContextMenu();
    document.addEventListener("click", hideOnGlobal, true);
    document.addEventListener("scroll", hideOnGlobal, true);
    window.addEventListener("resize", hideOnResize);
    document.addEventListener("keydown", hideOnEscape);
    this._contextMenuGlobals.push(() => document.removeEventListener("click", hideOnGlobal, true));
    this._contextMenuGlobals.push(() => document.removeEventListener("scroll", hideOnGlobal, true));
    this._contextMenuGlobals.push(() => document.removeEventListener("keydown", hideOnEscape));
    this._contextMenuGlobals.push(() => window.removeEventListener("resize", hideOnResize));
    this._contextMenuEl = menu;
    return menu;
  }
  _hideContextMenu() {
    if (this._contextMenuEl) {
      this._contextMenuEl.style.display = "none";
    }
  }
  _showContextMenu(clientX, clientY) {
    const menu = this._ensureContextMenu();
    const hasSelection = this._state.selected.size > 0;
    menu.querySelectorAll(".twm-context-menu-item").forEach((item) => {
      item.classList.toggle("disabled", !hasSelection);
      item.style.pointerEvents = hasSelection ? "" : "none";
    });
    menu.style.display = "block";
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
    this._contextMenuGlobals.forEach((dispose) => {
      try {
        dispose?.();
      } catch (_) {
      }
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
    if (value === void 0 || value === null) return "-";
    if (typeof value === "number") {
      if (!Number.isFinite(value)) return "-";
      return Number(value.toFixed(4)).toString();
    }
    return String(value);
  }
  _csvEscape(value) {
    if (value == null) return "";
    const str = String(value);
    if (/[",\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }
  _fallbackCopy(text) {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "absolute";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(textarea);
      return ok;
    } catch (_) {
      return false;
    }
  }
  _notify(title, message, type = "info") {
    this.config.services?.eventBus?.emit?.("toast:show", { title, message, type });
  }
};

export {
  createRafResizeObserver,
  DataTable
};
//# sourceMappingURL=chunk-WMGOJ3I6.js.map
