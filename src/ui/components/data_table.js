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
import {
    ISO_DATE, ISO_DATETIME, formatDate, formatDuration, matchDateFilter,
    matchDurationFilter, parseDateValue, parseDuration,
} from './table_values.js';
import { isRowActivation, isRowControl } from './row_activation.js';

// 0.5.0: the value helpers a typed column uses, and the one row-activation rule,
// re-exported so a consumer reaches them where it reaches DataTable.
export {
    ISO_DATE, ISO_DATETIME, formatDate, formatDuration, parseDateValue,
    parseDatePeriod, parseDuration, matchDateFilter, matchDurationFilter,
} from './table_values.js';
export {
    ROW_CONTROL_SELECTOR, endsTextSelection, isRowActivation, isRowControl,
} from './row_activation.js';

const DEFAULT_PAGE_SIZE = 100;

/** 0.5.0 — the column types that sort and filter by a value rather than by
 *  the text drawn for it. */
const TYPED_COLUMNS = new Set(['date', 'datetime', 'duration']);

// ── 0.5.0 `autoDispose` ─────────────────────────────────────────────────────
// ONE MutationObserver per document, shared by every table that asked, rather
// than one per table: a page with forty lists would otherwise run forty
// callbacks on every mutation anywhere in it. Each callback asks each table one
// question (`isConnected`), and the observer disconnects itself when the last
// table is gone.
//
// The tables are held WEAKLY. A table rendered into a host that never reaches
// the page is never "taken out" of it, so it is never disposed — and a strong
// set here would then keep it, its rows and its DOM alive for the life of the
// page: the very leak the option exists to stop.
const AUTO_DISPOSE = new Map();   // Document -> { observer, tables: Set<{deref()}> }
const AUTO_REFS = new WeakMap();  // DataTable -> its entry in that set
const weakRef = (table) => (typeof WeakRef === 'function'
    ? new WeakRef(table) : { deref: () => table });

function autoDisposeSweep(entry) {
    for (const ref of entry.tables) {
        const table = ref.deref();
        if (!table) { entry.tables.delete(ref); continue; }
        const el = table._wrapperEl;
        if (!el) continue;
        if (el.isConnected) { table._autoSeen = true; continue; }
        if (!table._autoSeen || table._autoPending) continue;
        // NOT AT ONCE. A renderer that takes a subtree out and puts it back in
        // the same task (FlexDesk's own tile renderer re-appends every leaf in
        // tree order) has put it back by the time this microtask runs — and one
        // that takes a turn longer still gets one task's grace. Only a table
        // that is STILL out after that has been removed from the page.
        table._autoPending = true;
        setTimeout(() => {
            table._autoPending = false;
            if (!entry.tables.has(ref)) return;
            const now = table._wrapperEl;
            if (now && !now.isConnected) table.dispose();
        }, 0);
    }
    if (entry.tables.size === 0) autoDisposeRelease(entry);
}

function autoDisposeRelease(entry) {
    for (const [doc, e] of AUTO_DISPOSE) {
        if (e !== entry) continue;
        try { e.observer.disconnect(); } catch (_) { /* gone */ }
        AUTO_DISPOSE.delete(doc);
    }
}

function autoDisposeWatch(table) {
    const doc = table.container?.ownerDocument;
    const MO = doc?.defaultView?.MutationObserver || globalThis.MutationObserver;
    if (!doc || typeof MO !== 'function') return;
    let entry = AUTO_DISPOSE.get(doc);
    if (!entry) {
        entry = { observer: null, tables: new Set() };
        entry.observer = new MO(() => autoDisposeSweep(entry));
        entry.observer.observe(doc, { childList: true, subtree: true });
        AUTO_DISPOSE.set(doc, entry);
    }
    let ref = AUTO_REFS.get(table);
    if (!ref) { ref = weakRef(table); AUTO_REFS.set(table, ref); }
    entry.tables.add(ref);
    if (table._wrapperEl?.isConnected) table._autoSeen = true;
}

function autoDisposeUnwatch(table) {
    const ref = AUTO_REFS.get(table);
    if (!ref) return;
    for (const entry of [...AUTO_DISPOSE.values()]) {
        if (entry.tables.delete(ref) && entry.tables.size === 0) autoDisposeRelease(entry);
    }
}

/** A per-column option: one value for every column, or an array / object
 *  keyed by column index. `null` and `undefined` mean "not set". */
function perColumn(option, colIdx) {
    if (option == null) return null;
    if (Array.isArray(option)) return option[colIdx] ?? null;
    if (typeof option === 'object') return option[colIdx] ?? null;
    return option;
}

/** One sort key, comparable with `compareSortKeys`. */
function normaliseSortKey(k) {
    if (k == null) return null;
    if (k instanceof Date) k = k.getTime();
    if (typeof k === 'boolean') return k ? 1 : 0;
    if (typeof k === 'number') return Number.isFinite(k) ? k : null;
    if (typeof k === 'bigint') return Number(k);
    return String(k).toLowerCase();
}

/** Nulls (and NaN) last in either direction — as the 0.4 comparator put them —
 *  numbers before text, numbers numerically, text as lower-cased text. */
function compareSortKeys(a, b, asc) {
    if (a === null && b === null) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    const na = typeof a === 'number';
    const nb = typeof b === 'number';
    let cmp;
    if (na !== nb) cmp = na ? -1 : 1;
    else cmp = a < b ? -1 : a > b ? 1 : 0;
    return asc ? cmp : -cmp;
}

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
 * @property {boolean|'single'} [selectable=true] - Enable row selection. 'single' (0.5.0): a click selects exactly one row, Shift and Ctrl do not extend it, Ctrl+A selects nothing, and `setSelection` keeps the last index it is given.
 * @property {boolean} [copyable=true] - Enable copy shortcuts and context menu
 * @property {boolean} [sortable=false] - Enable column sorting
 * @property {boolean} [filterable=false] - Enable per-column filter inputs
 * @property {boolean} [readonly=false] - Read-only mode (no selection/hover effects)
 * @property {boolean|'position'} [showRowNumbers=false] - Show row number column. `true` numbers a row by its ORIGINAL index (2, 3, 4, 1 after a sort); 'position' (0.5.0) numbers the rows as SHOWN — 1, 2, 3 after a sort, a filter, or on any page.
 * @property {string} [emptyMessage='No data'] - Message when no data
 * @property {Function} [onSort] - Callback when sort changes: (column, ascending) => void
 * @property {boolean} [resetPageOnSort=false] - A client-paged table goes back to its first page on every `sortBy()` (a header click included), the way a new filter already does: on page 3, a new order otherwise draws rows 201–300 OF THE NEW ORDER under "Page 3 of 3", which reads as "it only sorted this page". OFF by default: before this key existed a sort kept the page, and a table that does not ask keeps that. Server-side paging is untouched either way — its page is the consumer's `offset`, which `sortBy` never reads or writes.
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
 * @property {boolean|{overscan?: number, rowHeight?: number}} [virtualize=false] - C10. Draw only the rows near the viewport, between a top and a bottom spacer row, and give the body table a `<colgroup>` so its column widths no longer come from whichever row happens to be first. OFF by default: nothing about a table that does not ask changes. `overscan` (rows drawn beyond each edge, default 20) and `rowHeight` (the estimate used until a real row has been measured, default 24) tune it. See `_virtUpdate` for the whole contract.
 * @property {Function} [virtualRowHeight] - `(rowIndex, baseHeight) => number`. Under `virtualize`, the height a row occupies, including anything the embedder injects in front of it (a group header) — and 0 for a row the embedder hides, which is then not drawn at all. Absent: every row is `baseHeight`, which is measured from a real row.
 * @property {Function} [onRowsRendered] - `({ rows, removed }) => void`. Under `virtualize`, called whenever the window changes after `render()` returned: `rows` are the `<tr>`s the virtualiser ADDED — the rows an embedder that decorates rows after a render would otherwise never see — and `removed` the ones it took OUT, already detached (an embedder that injected rows of its own beside them, or holds an editor in one, has to hear that they went). The rows present when `render()` returns are not reported: they are the render's, exactly as without `virtualize`.
 *
 * ── 0.5.0, every one of them off unless asked for ─────────────────────────
 * @property {boolean} [fitContent=false] - The table is as tall as its rows: the wrapper is `height:auto` instead of `height:100%`, and the body grows with its rows instead of filling the box. For a list in a flowing page, whose parent has no height — where the default draws a header and NO rows.
 * @property {number|string} [maxHeight] - Implies `fitContent`, and caps the whole table at this height (a number is px); past it the body scrolls under its header.
 * @property {boolean} [autoDispose=false] - Call `dispose()` by itself once the table has been taken out of the document (and is still out a task later). Do NOT set it on a table you take out and put back later — a cached tab — since a disposed table comes back empty.
 * @property {'time'|'plain'} [firstColumn='time'] - 'plain' draws the first column like every other column: no 120–150px pin, no grey, no weight. The default keeps the time-series styling the component was built around.
 * @property {boolean} [clickable] - Draw body rows as things to press (`twm-dt--clickable`: a pointer and a hover, readonly tables included). Defaults to on exactly when `onRowActivate` is set.
 * @property {Function} [onRowActivate] - `(rowIdx, row, ev) => void`. The row OPENS. Fired after the selection has been updated, on the gestures `activateOn` names, and never on a press on a control inside the row, a click that ends a text selection in the table, or the second click of a double-click. `ev.type` says which gesture ('click', 'dblclick' or 'keydown'). `rowIdx` is the original index, as for `onRowClick`.
 * @property {'click'|'dblclick'|'enter'|Array<'click'|'dblclick'|'enter'>} [activateOn='click'] - Which gestures open a row. A list of things to open: 'click'. A pick list, where one click selects: ['dblclick', 'enter']. Enter opens the active row (`activeRow`), else the one selected row.
 * @property {Function} [getRowKey] - `(row, rowIdx) => key`. A row's identity, which `activeRow` is matched by. Compared as text.
 * @property {*} [activeRow] - The key of the row that is OPEN (the master of a master-detail): drawn `twm-dt-row--active` with `aria-current="true"`. It survives `setData`, a sort, a filter and a page, and a right-click does not move it. Without `getRowKey` the key is the row's original index. See `setActiveRow`.
 * @property {Function} [rowClass] - `(row, rowIdx) => string|string[]|null`. Classes for the row's `<tr>`.
 * @property {Function} [rowAttrs] - `(row, rowIdx) => {name: value}`. Attributes for the row's `<tr>` (`null`/`false` leaves one off, `true` sets it empty).
 * @property {Function} [cellClass] - `(value, colIdx, row, rowIdx) => string|string[]|null`. Classes for a cell, after its type class.
 * @property {Function} [rowIcon] - `(row, rowIdx) => string|{icon, title?, tone?}|null`. A Material Symbols icon at the start of the row's first cell; `tone` adds `twm-dt-row-icon--<tone>`. Drawn by CSS, so it is in neither the cell's text, its tooltip nor a copy.
 * @property {string|Node|Function} [emptyState] - What the box says when there are no rows: text, a node, or a function returning either (called on each render). Replaces `emptyMessage`, and is hidden while `setLoading(true)` — an empty table that is still loading is not empty.
 * @property {string} [nullDisplay] - Draw `null`/`undefined` as this text (and copy it so), with `twm-dt-cell--null` on the cell, instead of '-'.
 * @property {Array<string|null>} [columnTypes] - Each column's type by position ('num', 'text', 'date', 'datetime', 'duration'); `null` leaves a column to `getColumnType` and detection.
 * @property {Function|Object|Array} [sortValue] - `(value, colIdx, row) => comparable` — what a column sorts by, for every column or (as an object or array keyed by column index) for some. `undefined` falls back to the column's own rule. A `Date` sorts by its time, numbers numerically, text as lower-cased text, `null` last.
 * @property {string|Function|Object|Array} [dateFormat='YYYY-MM-DD'] - How a 'date' column is drawn: a pattern (see `formatDate`) or `(date) => string`, for every date column or per column index.
 * @property {string|Function|Object|Array} [dateTimeFormat='YYYY-MM-DD HH:mm'] - The same for a 'datetime' column.
 * @property {'auto'|'clock'|Function|Object|Array} [durationFormat='auto'] - How a 'duration' column (milliseconds) is drawn: '850 ms', '3.2 s', '2m 5s' (auto) or '0:02:05' (clock).
 * @property {'local'|'UTC'} [dateTimeZone='local'] - The zone typed date columns are read and drawn in.
 */

/** C10. When the scroll box has no layout — mounted hidden, or a DOM with no
 *  layout engine — there is no viewport to measure, so the window is sized as if
 *  it were this tall. A ResizeObserver corrects it the moment a real size exists. */
const VIRTUAL_FALLBACK_VIEWPORT_PX = 1000;

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
            // C10. Off unless asked for — see the typedef.
            virtualize: false,
            virtualRowHeight: null,
            onRowsRendered: null,
            // 0.5.0. Every key below is off — or exactly the 0.4 behaviour — until
            // a consumer sets it (D6: additive and back-compatible). The typedef
            // says what each does.
            fitContent: false,
            maxHeight: null,
            autoDispose: false,
            firstColumn: 'time',
            clickable: null,
            onRowActivate: null,
            activateOn: 'click',
            getRowKey: null,
            activeRow: null,
            rowClass: null,
            rowAttrs: null,
            cellClass: null,
            rowIcon: null,
            emptyState: undefined,
            nullDisplay: null,
            columnTypes: null,
            sortValue: null,
            dateFormat: null,
            dateTimeFormat: null,
            durationFormat: null,
            dateTimeZone: 'local',
            ...config,
        };

        // 0.5.0. The open row's key, and the failure on show (`setError`).
        this._activeKey = this.config.activeRow == null ? null : String(this.config.activeRow);
        this._error = null;

        // C10. The render window, or null when this table draws every row.
        this._virt = null;
        // The measured row height outlives a render, so a re-render does not
        // start again from the estimate and jump once it has re-measured.
        this._virtBase = null;

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

    /**
     * 0.5.0. Construct AND DRAW, in one call. The constructor draws nothing
     * until `render()`, so every consumer that forgot the second line got an
     * empty box; this is the two lines, once.
     *
     * Called on a class made by `withDefaults`, it builds that class — so the
     * house defaults apply.
     *
     * @param {HTMLElement} container
     * @param {DataTableConfig} [config]
     * @returns {DataTable}
     */
    static mount(container, config = {}) {
        const table = new this(container, config);
        table.render();
        return table;
    }

    /**
     * 0.5.0. A DataTable class with house defaults: `defaults` sit under every
     * config it is constructed (or `mount`ed) with, and the config wins key by
     * key. It is a real subclass — `instanceof DataTable` holds — and it can be
     * narrowed again with its own `withDefaults`.
     *
     *     const ListTable = DataTable.withDefaults({ mode: 'compact', sortable: true,
     *                                                pagination: false, fitContent: true });
     *     const table = ListTable.mount(host, { headers, rows });
     *
     * @param {DataTableConfig} defaults
     * @returns {typeof DataTable}
     */
    static withDefaults(defaults = {}) {
        const house = { ...defaults };
        return class extends this {
            constructor(container, config = {}) {
                super(container, { ...house, ...config });
            }
        };
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
            // 0.5.0. New rows are an ANSWER, so a failure on show is over. The
            // open row is not reset: it is a key, and is found again in these
            // rows (or stays unmarked until it comes back).
            this._error = null;
        }
        if (Object.prototype.hasOwnProperty.call(updates, 'activeRow')) {
            this._activeKey = updates.activeRow == null ? null : String(updates.activeRow);
        }
        if (updates.columnTypes || updates.getColumnType) {
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
        this._loading = !!on;
        if (!this._wrapperEl) return;
        // 0.5.0. A wrapper class as well as the overlay, so an `emptyState` can
        // stay quiet while there is nothing YET (see the CSS).
        this._wrapperEl.classList.toggle('twm-data-table-component--loading', !!on);
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
                // 0.5.0. A single-selection table keeps the LAST index it is
                // given — the most recent choice — never several.
                if (this.config.selectable === 'single') this._state.selected.clear();
                this._state.selected.add(idx);
            }
        }
        if (this.config.selectable === 'single') {
            this._state.anchorIndex = this._state.selected.size
                ? [...this._state.selected][0] : null;
        }
        this._updateRowSelection();
        this._notifySelectionChange();
    }

    // ─────────────────────────────────────────────────────────────────
    // 0.5.0 — the open row, the failure state, column widths
    // ─────────────────────────────────────────────────────────────────

    /**
     * Mark the row that is OPEN — the master of a master-detail — by its key
     * (`getRowKey`; without it, the row's original index). `null` clears it.
     *
     * The mark is NOT the selection: `setData` keeps it (the key is looked for
     * in the new rows), a right-click does not move it, and a sort, a filter or
     * a page change finds it where the row went. Drawn as `twm-dt-row--active`
     * and `aria-current="true"` on the row, in place — no re-render.
     *
     * @param {*} key
     */
    setActiveRow(key) {
        this._activeKey = key == null ? null : String(key);
        this.config.activeRow = key ?? null;
        const tbody = this._tbodyEl;
        if (!tbody) return;
        for (const tr of tbody.children) {
            if (tr.__rowIndex === undefined) continue;
            this._paintActive(tr);
        }
    }

    /** The open row's key, as text, or null. */
    getActiveRow() {
        return this._activeKey;
    }

    /**
     * Show a FAILURE inside the table's own box: text, a node, or an `Error`
     * (its message). The rows already drawn STAY — a failed refresh does not
     * blank a list a person was reading — under a banner saying what failed;
     * with no rows, the failure takes the empty row's place. `setError(null)`
     * clears it, and so does `setData({rows})`: new rows are an answer. A
     * failure also ends `setLoading`.
     *
     * @param {string|Node|Error|null} error
     */
    setError(error) {
        this._error = error == null || error === false ? null : error;
        if (this._error) this.setLoading(false);
        if (this._wrapperEl) this.render();
    }

    /** What `setError` was last given, or null. */
    getError() {
        return this._error;
    }

    /**
     * Forget every column width a person dragged, a double-click fitted or the
     * store restored, and measure the columns again from what is on screen —
     * for an embedder whose content has just changed size under them (a zoom,
     * a font). Persisted widths are cleared too.
     *
     * @returns {boolean} whether there was a table to measure
     */
    resetColumnWidths() {
        this._colWidths = {};
        this._colWidthsSig = this._colSig();
        this._savePersisted();
        if (!this._headerTableEl || !this._tableEl) return false;
        this._syncHeaderWidths();
        return true;
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
        // A new order starts at its first page — when the table asked for it.
        // Staying on page 3 shows rows 201–300 of the NEW order, which reads as
        // "it only sorted this page"; but that IS what a sort did before
        // `resetPageOnSort` existed, so a table that does not ask keeps it (D6:
        // additive and back-compatible). `render()` keeps the scroll position
        // only on the same page, so the reset also starts the body at its top.
        if (this.config.resetPageOnSort) this._state.offset = 0;

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
        // KEYBOARD FOCUS SURVIVES A RE-RENDER. Rendering replaces the table
        // element, and a focused element that is removed hands focus to the
        // page body, where the arrow keys reach nobody. A data refresh does
        // exactly that (a record changed on disk, a live reload), so keyboard
        // navigation silently died the first time the store moved.
        const doc = this.container.ownerDocument;
        const hadTableFocus = !!this._tableEl && doc?.activeElement === this._tableEl;
        // SCROLL POSITION SURVIVES A RE-RENDER, for the same reason: the scroll
        // box is rebuilt too, and a new one starts at the top. Folding a tree
        // row, or any refresh, threw a reader scrolled halfway down back to row
        // one. Only on the SAME page — turning the page should start at its top.
        const prevWrap = this._tableWrapEl;
        const prevScroll = prevWrap?.isConnected && this._renderedOffset === this._state.offset
            ? { top: prevWrap.scrollTop, left: prevWrap.scrollLeft } : null;

        this._cleanup();
        this.container.innerHTML = '';
        // C10. A window belongs to one tbody; `_createTable` builds a new one.
        this._virt = null;

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
        // 0.5.0 `fitContent` / `maxHeight`. THE DEFAULT IS `height:100%`, which
        // is right for a pane that already has a height and wrong for a list in
        // a flowing page: against an `auto` parent it resolves to nothing, and
        // the body (`flex:1 1 0`) gets ZERO — a header, a filter row, and every
        // `<tr>` in the DOM with no box to draw in. A fitted table is as tall as
        // its rows instead, up to `maxHeight`, past which its body scrolls.
        const fit = this._fitsContent();
        if (fit) {
            this._wrapperEl.classList.add('twm-data-table-component--fit');
            const max = this._maxHeightCss();
            this._wrapperEl.style.cssText = 'display:flex; flex-direction:column; height:auto; min-height:0;'
                + (max ? ` max-height:${max};` : '');
        } else {
            this._wrapperEl.style.cssText = 'display:flex; flex-direction:column; height:100%; min-height:0;';
        }
        // A render ends a `setLoading` (the overlay goes with the old wrapper,
        // as it always has).
        this._loading = false;

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
        tableWrap.style.cssText = fit
            // As tall as its content, and the one thing that gives way under a
            // `maxHeight`: the header and the pager keep their height.
            ? 'flex:0 1 auto; min-height:0; min-width:0; overflow:auto;'
            : 'flex:1 1 0; min-height:0; min-width:0; overflow:auto;';

        // 0.5.0 `setError` with rows on screen: the rows STAY, under a banner.
        if (this._error && rows.length > 0) {
            this._wrapperEl.appendChild(this._createErrorBanner());
        }

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
            headerTable.className = this._tableClassName();
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
            if (this._error) {
                // 0.5.0. Nothing to keep: the failure takes the empty row.
                emptyTd.className = 'twm-data-table__empty-cell twm-data-table__empty-cell--error';
                emptyTd.setAttribute('role', 'alert');
                this._appendStateContent(emptyTd, this._errorContent());
            } else if (this.config.emptyState !== undefined) {
                // 0.5.0. The consumer's own words (or node), styled by class
                // rather than inline, and quiet while the table is loading.
                emptyTd.className = 'twm-data-table__empty-cell twm-data-table__empty-cell--state';
                const state = typeof this.config.emptyState === 'function'
                    ? this.config.emptyState() : this.config.emptyState;
                this._appendStateContent(emptyTd, state);
            } else {
                emptyTd.style.cssText
                    = 'text-align:center; font-style:italic; color:#888; padding:16px;';
                emptyTd.textContent = emptyMessage;
            }
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
        // 0.5.0. Watched from here, so a table rendered again after an automatic
        // dispose (a `setData` into a re-attached host) is watched again.
        if (this.config.autoDispose) autoDisposeWatch(this);
        if (prevScroll && this._state.offset === this._renderedOffset) {
            tableWrap.scrollTop = prevScroll.top;
            tableWrap.scrollLeft = prevScroll.left;
        }
        this._renderedOffset = this._state.offset;

        // C10. NOW THERE IS A VIEWPORT. `_createTable` drew a window sized from
        // an estimate, before the scroll box existed; measure a real row, and
        // redraw the window for the real height and the restored scroll offset.
        // Synchronously, and not reported through `onRowsRendered`: a row present
        // when `render()` returns is the render's, as it is without `virtualize`.
        if (this._virt) {
            const onScroll = () => this._virtUpdate();
            tableWrap.addEventListener('scroll', onScroll, { passive: true });
            this._disposers.push(() => tableWrap.removeEventListener('scroll', onScroll));
            this._virtMeasure();
            this._virtUpdate({ force: true, notify: false });
        }

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
                // C10: a new height is a new window, as well as new widths.
                this._resizeObserver = createRafResizeObserver(() => {
                    this._syncHeaderWidths();
                    this._virtUpdate();
                });
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
        if (rows.length > 0 && (this.config.selectable || this.config.copyable || !this.config.readonly
                                || typeof this.config.onRowActivate === 'function')) {
            this._installInteractions();
        }

        // Restore focus to filter input if it was active
        if (activeFilterColIdx !== null) {
            this._restoreFilterFocus(activeFilterColIdx);
        }
        else if (hadTableFocus && this._tableEl) {
            try { this._tableEl.focus({ preventScroll: true }); } catch (_) { /* detached */ }
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
        autoDisposeUnwatch(this);
        this._autoSeen = false;
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
        this._virt = null;
        this._colgroupEl = null;
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
                } else if (colType === 'date' || colType === 'datetime') {
                    // 0.5.0. By the TIME, with the drawn words as the fallback
                    // for text that names no period.
                    const utc = this._utc();
                    if (!matchDateFilter(parseDateValue(value, { utc }), filterText,
                                         this._formatValue(value, colIdx), { utc })) {
                        pass = false; break;
                    }
                } else if (colType === 'duration') {
                    if (!matchDurationFilter(parseDuration(value), filterText,
                                             this._formatValue(value, colIdx))) {
                        pass = false; break;
                    }
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

        // 0.5.0. A `sortValue` hook, or a column typed by its VALUE, sorts by a
        // key computed ONCE per row (a date is parsed once, not once per
        // comparison). Every other column takes the 0.4 comparator below,
        // untouched.
        const hook = this._sortValueFor(colIdx);
        const kind = this._columnTypes[colIdx];
        if (hook || TYPED_COLUMNS.has(kind)) {
            const utc = this._utc();
            const keyOf = (row) => {
                const value = row[colIdx];
                if (hook) {
                    const k = hook(value, colIdx, row);
                    if (k !== undefined) return normaliseSortKey(k);
                }
                if (kind === 'date' || kind === 'datetime') {
                    return normaliseSortKey(parseDateValue(value, { utc }));
                }
                if (kind === 'duration') return normaliseSortKey(parseDuration(value));
                if (kind === 'num') {
                    return normaliseSortKey(typeof value === 'number' ? value : parseFloat(value));
                }
                return value == null ? null : String(value).toLowerCase();
            };
            const keyed = rows.map((row, i) => ({ row, origIdx: indexMap[i], key: keyOf(row) }));
            keyed.sort((a, b) => compareSortKeys(a.key, b.key, asc));
            return {
                rows: keyed.map((p) => p.row),
                indexMap: keyed.map((p) => p.origIdx),
            };
        }

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
            const kind = this._columnTypes[colIdx];
            input.placeholder = kind === 'num' ? 'e.g. >100'
                : kind === 'date' || kind === 'datetime' ? 'e.g. >2026-01-01'
                : kind === 'duration' ? 'e.g. >1s'
                : 'Filter...';

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

        const kind = this._columnTypes[colIdx];
        const isNumeric = kind === 'num';
        // 0.5.0. A date or a duration takes the numeric OPERATORS — before,
        // after, between — over operands typed as text (`2026-10`, `1.5s`).
        const isDate = kind === 'date' || kind === 'datetime';
        const isOrdered = isNumeric || isDate || kind === 'duration';
        const currentFilter = this._state.filters.get(colIdx) || '';
        const parsed = this._parseFilterForDropdown(currentFilter, isOrdered ? (isNumeric ? true : kind) : false);

        // Build dropdown panel
        const panel = document.createElement('div');
        panel.className = 'twm-data-table__filter-dropdown';

        // Operator/mode select
        const selectLabel = document.createElement('label');
        selectLabel.className = 'twm-data-table__filter-dropdown-label';
        selectLabel.textContent = isOrdered ? 'Operator' : 'Mode';

        const select = document.createElement('select');
        select.className = 'twm-data-table__filter-dropdown-select';

        const options = isDate
            ? [
                { value: '=', label: 'On / in' },
                { value: '!=', label: 'Not on / in' },
                { value: '>', label: 'After' },
                { value: '>=', label: 'On or after' },
                { value: '<', label: 'Before' },
                { value: '<=', label: 'On or before' },
                { value: '..', label: 'Between' },
            ]
            : isOrdered
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

        const operandPlaceholder = isNumeric ? 'Number...'
            : isDate ? 'YYYY-MM-DD' : isOrdered ? 'e.g. 1.5s' : 'Text...';
        const valueInput = document.createElement('input');
        valueInput.type = isNumeric ? 'number' : 'text';
        valueInput.className = 'twm-data-table__filter-dropdown-input';
        valueInput.placeholder = operandPlaceholder;
        valueInput.value = parsed.value;

        // Second value input (for "between")
        const value2Label = document.createElement('label');
        value2Label.className = 'twm-data-table__filter-dropdown-label';
        value2Label.textContent = 'And';

        const value2Input = document.createElement('input');
        value2Input.type = isOrdered && !isNumeric ? 'text' : 'number';
        value2Input.className = 'twm-data-table__filter-dropdown-input';
        value2Input.placeholder = isOrdered && !isNumeric ? operandPlaceholder : 'Number...';
        value2Input.value = parsed.value2;

        const value2Container = document.createElement('div');
        value2Container.className = 'twm-data-table__filter-dropdown-between';
        value2Container.style.display = (isOrdered && parsed.operator === '..') ? '' : 'none';
        value2Container.appendChild(value2Label);
        value2Container.appendChild(value2Input);

        // Toggle between fields when operator changes
        select.addEventListener('change', () => {
            value2Container.style.display = (isOrdered && select.value === '..') ? '' : 'none';
        });
        // What `_composeFilterString` is told: true for a number (0.4), the
        // kind for a date or a duration, false for text.
        const composeMode = isNumeric ? true : isOrdered ? kind : false;

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
            const composed = this._composeFilterString(select.value, valueInput.value, value2Input.value, composeMode);
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
                const composed = this._composeFilterString(select.value, valueInput.value, value2Input.value, composeMode);
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

        // 0.5.0. A date or a duration (`isNumeric` is then the kind): the
        // numeric operators, over operands that are text.
        if (typeof isNumeric === 'string') {
            const range = text.match(/^(.+?)\s*\.\.\s*(.+)$/);
            if (range) return { operator: '..', value: range[1], value2: range[2] };
            const op = text.match(/^(>=|<=|!=|>|<|=)\s*(.+)$/);
            if (op) return { operator: op[1], value: op[2], value2: '' };
            return { operator: '=', value: text, value2: '' };
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

        // 0.5.0. A date or a duration keeps its `=`: an operand with no
        // operator is matched against the drawn words, not compared.
        if (typeof isNumeric === 'string') {
            if (operator === '..') return (value && value2) ? `${value}..${value2}` : '';
            return `${operator}${value}`;
        }

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
        const { headers, rows, getColumnType, columnTypes } = this.config;
        const types = [];

        for (let colIdx = 0; colIdx < headers.length; colIdx++) {
            // 0.5.0. A type declared by position wins over the callback and
            // over detection — which never guesses a date: typing one is a
            // decision about how it is drawn.
            const declared = Array.isArray(columnTypes) ? columnTypes[colIdx] : null;
            if (declared) {
                types.push(declared);
                continue;
            }
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
        const { sortColumn, sortAscending } = this._state;

        // Server-side pagination: rows already represent current page, use config offset for row numbering
        // Client-side pagination: use processed (filtered+sorted) rows, then slice for current page
        const isServerSide = typeof onPageChange === 'function';
        const processedRows = isServerSide ? rows : this._getProcessedRows();
        const offset = isServerSide ? (configOffset || 0) : this._state.offset;
        // NO PAGINATION MEANS NO PAGES. This used to slice to `pageSize` either
        // way, so a table built with `pagination: false` silently showed its
        // first hundred rows and offered no control to reach the rest.
        const pageRows = isServerSide || !this.config.pagination
            ? processedRows : processedRows.slice(offset, offset + pageSize);

        const table = document.createElement('table');
        table.className = this._tableClassName();
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

        // C10. THE COLUMN TRACK IS A `<colgroup>`, NOT THE FIRST ROW. Under
        // `table-layout: fixed` a `<col>` with a width decides its column, and a
        // first-row cell only decides one whose `<col>` is `auto` — so once the
        // widths live here, it stops mattering which row is first. A recycling
        // window changes that row on every scroll; without this the columns
        // would jitter each time it did. Before the `thead`, where the content
        // model puts it; the `thead` leaves for the header table in `render()`
        // and the colgroup stays with the body.
        const virtual = this._isVirtual();
        if (virtual) {
            table.classList.add('twm-dt--virtual');
            table.appendChild(this._createColgroup());
        }

        table.appendChild(thead);

        // Map back to original config.rows index for selection tracking
        const globalOf = (localIdx) => {
            const processedIdx = offset + localIdx;
            return isServerSide
                ? (configOffset || 0) + localIdx
                : (this._processedIndexMap?.[processedIdx] ?? processedIdx);
        };

        // 0.5.0 `showRowNumbers: 'position'`: where the first row drawn here
        // stands in the order SHOWN (the page's first row on a later page).
        this._positionBase = isServerSide ? (configOffset || 0)
            : (this.config.pagination ? offset : 0);

        // Body
        const tbody = document.createElement('tbody');
        table.appendChild(tbody);
        this._tbodyEl = tbody;

        if (virtual) {
            this._virtInit(tbody, pageRows, globalOf, {
                serverSide: isServerSide, offset, configOffset: configOffset || 0,
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
        const tr = document.createElement('tr');
        tr.__rowIndex = globalIdx;
        // 0.5.0. The row's place in the order shown (for 'position' numbers).
        tr.__position = (this._positionBase || 0) + localIdx;
        tr.className = 'data-preview-row';

        if (this._state.selected.has(globalIdx)) {
            tr.classList.add('selected');
        }
        // 0.5.0. The consumer's row classes and attributes, and the open mark.
        this._decorateRow(tr, row, globalIdx);
        // C10. The stripe is `tr:nth-child(even)`, which is a question about a
        // row's POSITION among its siblings — and a window that drops rows off
        // its top changes every answer. `_virtSpacers` keeps the position's
        // parity equal to the row's own, so the stripe needs nothing here; the
        // class is for an embedder that wants to ask about the row itself.
        if (this._virt) tr.classList.toggle('twm-dt-row--alt', localIdx % 2 === 1);

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
        const o = v && typeof v === 'object' ? v : {};
        return {
            overscan: Number.isFinite(o.overscan) && o.overscan >= 0 ? Math.floor(o.overscan) : 20,
            rowHeight: Number.isFinite(o.rowHeight) && o.rowHeight > 0 ? o.rowHeight : 24,
        };
    }

    /** One `<col>` per DOM column (the row-number column included), carrying
     *  any width already pinned for it, so a re-render starts at the widths it
     *  had rather than at a content-sized frame that then snaps. */
    _createColgroup() {
        const n = (this.config.headers?.length || 0) + (this.config.showRowNumbers ? 1 : 0);
        const colgroup = document.createElement('colgroup');
        for (let i = 0; i < n; i++) {
            const col = document.createElement('col');
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
            const tr = document.createElement('tr');
            tr.className = `twm-dt-spacer twm-dt-spacer--${edge}`;
            tr.setAttribute('aria-hidden', 'true');
            const td = document.createElement('td');
            td.colSpan = Math.max(1, (this.config.headers?.length || 0)
                + (this.config.showRowNumbers ? 1 : 0));
            // INLINE, because it must beat every consumer's cell padding and
            // border at any specificity: a spacer that is 1px taller than its
            // arithmetic moves every row below it by that pixel.
            td.style.cssText = 'padding:0;border:0;height:0;min-width:0;max-width:none;';
            tr.appendChild(td);
            return tr;
        };
        // The parity filler: see `_virtSpacers`.
        const filler = document.createElement('tr');
        filler.className = 'twm-dt-spacer twm-dt-spacer--parity';
        filler.setAttribute('aria-hidden', 'true');
        filler.hidden = true;
        this._virt = {
            tbody, rows, globalOf, serverSide, offset, configOffset,
            overscan,
            base: this._virtBase || rowHeight,
            heights: null, offsets: null,
            start: 0, end: 0,
            map: new Map(),
            top: spacer('top'), bottom: spacer('bottom'), filler,
        };
        this._virtComputeOffsets();
        // A first window from an ESTIMATED viewport: the scroll box does not
        // exist yet. `render()` redraws it for the real one once it does.
        const guess = this.container?.clientHeight || 0;
        this._virtUpdate({ force: true, notify: false, viewport: guess || undefined, top: 0 });
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
        const fn = typeof this.config.virtualRowHeight === 'function'
            ? this.config.virtualRowHeight : null;
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
            const mid = (lo + hi + 1) >> 1;
            if (v.offsets[mid] <= y) lo = mid; else hi = mid - 1;
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
            // Only once the columns are fixed: before that the first sync has
            // not run, and it tooltips every cell itself.
            if (added[0]?.isConnected && this._tableEl?.style.tableLayout === 'fixed') {
                this._updateCellTooltips(added);
            }
            if (notify) {
                try { this.config.onRowsRendered?.({ rows: added, removed }); } catch (err) {
                    console.error('[DataTable] onRowsRendered threw', err);
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
            if (!wanted.has(i)) { tr.remove(); v.map.delete(i); removed?.push(tr); }
        }
        v.start = start;
        v.end = end;
        this._virtSpacers();
        const added = [];
        // Right to left, so each new row goes in front of the one after it —
        // which is either a row that stayed (and is not moved) or the bottom
        // spacer (or the end of the body).
        let ref = v.bottom.isConnected ? v.bottom : null;
        for (let k = want.length - 1; k >= 0; k--) {
            const i = want[k];
            const have = v.map.get(i);
            if (have) { ref = have; continue; }
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
            return local < 0 ? null : (v.map.get(local) || null);
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
        if (Array.isArray(this.config.rows) && rowIndex >= 0
            && rowIndex < this.config.rows.length) {
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
    scrollToRow(rowIndex, { block = 'nearest' } = {}) {
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
            const target = this._scrollTarget(rowTop, rowH, wrap.scrollTop,
                                              wrap.clientHeight, block);
            if (target !== wrap.scrollTop) wrap.scrollTop = target;
            return tr;
        }
        const local = this._virtLocalOf(rowIndex);
        if (local < 0 || !(v.heights[local] > 0)) return null;
        const view = wrap?.clientHeight || VIRTUAL_FALLBACK_VIEWPORT_PX;
        const current = wrap?.scrollTop || 0;
        let target = this._scrollTarget(v.offsets[local], v.heights[local],
                                        current, view, block);
        target = Math.max(0, Math.min(target, Math.max(0, v.offsets[v.rows.length] - view)));
        if (wrap && Math.abs(target - current) >= 1) wrap.scrollTop = target;
        this._virtUpdate({ top: Math.abs(target - current) >= 1 ? target : current });
        return v.map.get(local) || null;
    }

    _scrollTarget(rowTop, rowH, current, view, block) {
        if (block === 'start') return rowTop;
        if (block === 'center') return rowTop - Math.max(0, (view - rowH) / 2);
        if (rowTop < current) return rowTop;
        if (rowTop + rowH > current + view) return rowTop + rowH - view;
        return current;
    }

    /** The first body row that draws a row of data — never a spacer, and never
     *  a row an embedder injected (a group header spans every column with ONE
     *  cell, so measuring it would report one column). */
    _firstBodyRow() {
        const tbody = this._tableEl?.querySelector?.('tbody');
        if (!tbody) return null;
        for (const tr of tbody.children) {
            if (tr.__rowIndex !== undefined) return tr;
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
            const td = document.createElement('td');
            td.className = 'num';
            // 0.5.0. 'position' counts the rows as SHOWN; `true` keeps the 0.4
            // number, the row's original index.
            const byPosition = this.config.showRowNumbers === 'position'
                && Number.isInteger(tr.__position);
            td.textContent = String((byPosition ? tr.__position : globalIdx) + 1);
            tr.appendChild(td);
        }

        const { cellClass, nullDisplay } = this.config;
        for (let colIdx = 0; colIdx < row.length; colIdx++) {
            const td = document.createElement('td');
            td.className = this._columnTypes[colIdx] || 'text';

            // Use custom cell renderer if provided
            const value = row[colIdx];
            let handled = false;
            if (this.config.renderCell) {
                handled = !!this.config.renderCell(td, value, colIdx, globalIdx, row);
                if (!handled) {
                    td.textContent = this._formatValue(value, colIdx);
                }
            } else {
                td.textContent = this._formatValue(value, colIdx);
            }
            // 0.5.0 `nullDisplay`: a NULL is marked as one, so it can be drawn
            // unlike the text "NULL" — unless `renderCell` drew the cell.
            if (!handled && value == null && nullDisplay != null) {
                td.classList.add('twm-dt-cell--null');
            }
            // 0.5.0 `cellClass`.
            if (typeof cellClass === 'function') {
                this._addClasses(td, cellClass(value, colIdx, row, globalIdx));
            }
            // 0.5.0 `rowIcon`, at the start of the first data cell.
            if (colIdx === 0 && typeof this.config.rowIcon === 'function') {
                this._prependRowIcon(td, this.config.rowIcon(row, globalIdx));
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
        // C10. OUTSIDE THE WINDOW IS NOT OFF THE PAGE. The row will be drawn the
        // moment it scrolls back in, from the window's own row list — so the
        // data has to change now, or it comes back showing the value it had
        // before this update. Without `virtualize` a row that is not in the DOM
        // is on another page, and that path is unchanged.
        if (!tr) {
            if (this._virt) this._virtSetRow(index, row);
            return false;
        }

        // Keep the caller's data in step, so a later full render agrees with
        // what is on screen. Server-side paging means config.rows may hold only
        // the current page; the index map is what resolves that.
        if (Array.isArray(this.config.rows) && this.config.rows[index]) {
            this.config.rows[index] = row;
        }
        if (this._virt) this._virtSetRow(index, row);

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
        // 0.5.0. The row's data changed, so its classes, attributes, key and
        // open mark are asked again (a key paused, a delivery that died).
        this._decorateRow(tr, row, index);

        if (focusedCol >= 0 && tr.children[focusedCol]) {
            tr.children[focusedCol].focus?.();
        }
        return true;
    }

    // ─────────────────────────────────────────────────────────────────
    // 0.5.0 — decoration, states and the typed columns
    // ─────────────────────────────────────────────────────────────────

    /** The class list both halves of the table carry: the 0.4 pair, plus the
     *  0.5.0 modifiers a consumer asked for. */
    _tableClassName() {
        const names = this.config.readonly
            ? ['twm-preview-table', 'twm-preview-table--readonly']
            : ['twm-preview-table'];
        if (this.config.firstColumn === 'plain') names.push('twm-dt--first-plain');
        if (this._isClickable()) names.push('twm-dt--clickable');
        return names.join(' ');
    }

    /** `clickable` when it is said; otherwise exactly when rows open. */
    _isClickable() {
        const c = this.config.clickable;
        if (c === true || c === false) return c;
        return typeof this.config.onRowActivate === 'function';
    }

    _fitsContent() {
        return !!this.config.fitContent || this._maxHeightCss() !== null;
    }

    _maxHeightCss() {
        const m = this.config.maxHeight;
        if (m == null || m === '' || m === false) return null;
        if (typeof m === 'number') return Number.isFinite(m) && m > 0 ? `${m}px` : null;
        return String(m);
    }

    _utc() {
        return String(this.config.dateTimeZone || '').toUpperCase() === 'UTC';
    }

    /** `classList.add` for whatever a hook returned: a string (space-separated
     *  names allowed), an array of them, or nothing. */
    _addClasses(el, names) {
        if (!names) return [];
        const list = (Array.isArray(names) ? names : String(names).split(/\s+/))
            .map((n) => String(n || '').trim()).filter(Boolean);
        if (list.length) el.classList.add(...list);
        return list;
    }

    /** A row's key, as text, or null: `getRowKey`, else its original index. */
    _rowKey(row, rowIdx) {
        const fn = this.config.getRowKey;
        let key;
        if (typeof fn === 'function') {
            try { key = fn(row, rowIdx); } catch (err) {
                console.error('[DataTable] getRowKey threw', err);
                key = null;
            }
        } else {
            key = rowIdx;
        }
        return key == null ? null : String(key);
    }

    /** The gestures `activateOn` names, as a set. */
    _activateOn() {
        const a = this.config.activateOn;
        const list = Array.isArray(a) ? a : [a || 'click'];
        return new Set(list.map((g) => String(g).toLowerCase()));
    }

    /**
     * Open a row on the gestures `activateOn` names, by the one rule in
     * `row_activation.js` (a control is its own gesture, a drag that selects
     * text is not a click, the second click of a double-click opens nothing).
     * Delegated on the body, bound after the selection handler.
     */
    _installActivation(tbody, table) {
        const on = this._activateOn();
        const scope = this._wrapperEl;
        // A table that selects several rows reads Shift and Ctrl as SELECTION
        // gestures; one that does not leaves them to the consumer (ev.ctrlKey:
        // "open it somewhere else").
        const sel = this.config.selectable;
        const multi = !!sel && sel !== 'single';
        const fire = (tr, ev) => {
            try { this.config.onRowActivate(tr.__rowIndex, tr.__row, ev); } catch (err) {
                console.error('[DataTable] onRowActivate threw', err);
            }
        };
        const rowFor = (ev) => {
            const tr = ev.target?.closest?.('tr');
            return tr && tr.__rowIndex !== undefined && tbody.contains(tr) ? tr : null;
        };
        if (on.has('click')) {
            const onClick = (ev) => {
                if (ev.button != null && ev.button !== 0) return;
                const tr = rowFor(ev);
                if (!tr || !isRowActivation(ev, 'click', { scope })) return;
                if (multi && (ev.shiftKey || ev.ctrlKey || ev.metaKey)) return;
                fire(tr, ev);
            };
            tbody.addEventListener('click', onClick);
            this._disposers.push(() => tbody.removeEventListener('click', onClick));
        }
        if (on.has('dblclick')) {
            const onDbl = (ev) => {
                const tr = rowFor(ev);
                if (!tr || !isRowActivation(ev, 'dblclick', { scope })) return;
                fire(tr, ev);
            };
            tbody.addEventListener('dblclick', onDbl);
            this._disposers.push(() => tbody.removeEventListener('dblclick', onDbl));
        }
        if (on.has('enter')) {
            const onKey = (ev) => {
                if (ev.key !== 'Enter' || ev.isComposing) return;
                if (ev.ctrlKey || ev.metaKey || ev.altKey || ev.shiftKey) return;
                if (isRowControl(ev.target, table)) return;
                const tr = this._currentRowEl();
                if (!tr) return;
                ev.preventDefault();
                fire(tr, ev);
            };
            table.addEventListener('keydown', onKey);
            this._disposers.push(() => table.removeEventListener('keydown', onKey));
        }
    }

    /** The row Enter opens: the open row when it is drawn, else the one row
     *  selected (or the selection's anchor). */
    _currentRowEl() {
        const tbody = this._tbodyEl;
        if (!tbody) return null;
        if (this._activeKey !== null) {
            for (const tr of tbody.children) {
                if (tr.__rowIndex !== undefined && tr.classList.contains('twm-dt-row--active')) return tr;
            }
        }
        const selected = this._state.selected;
        let idx = null;
        if (selected.size === 1) idx = [...selected][0];
        else if (this._state.anchorIndex != null && selected.has(this._state.anchorIndex)) {
            idx = this._state.anchorIndex;
        }
        return idx == null ? null : this.getRowElement(idx);
    }

    /** Everything `rowClass`, `rowAttrs` and the open mark put on a `<tr>`,
     *  taken off again first — so `updateRow` cannot leave last state's class
     *  behind. */
    _decorateRow(tr, row, rowIdx) {
        // The row's data, for a delegated handler (`onRowActivate`).
        tr.__row = row;
        const { rowClass, rowAttrs } = this.config;
        if (tr.__twmClasses) {
            for (const c of tr.__twmClasses) tr.classList.remove(c);
            tr.__twmClasses = null;
        }
        if (typeof rowClass === 'function') {
            const added = this._addClasses(tr, rowClass(row, rowIdx));
            // Never take away a class this component owns.
            tr.__twmClasses = added.filter((c) => c !== 'data-preview-row' && c !== 'selected');
        }
        if (tr.__twmAttrs) {
            for (const name of tr.__twmAttrs) tr.removeAttribute(name);
            tr.__twmAttrs = null;
        }
        if (typeof rowAttrs === 'function') {
            const attrs = rowAttrs(row, rowIdx) || {};
            const set = [];
            for (const [name, value] of Object.entries(attrs)) {
                if (value == null || value === false) continue;
                try {
                    tr.setAttribute(name, value === true ? '' : String(value));
                    set.push(name);
                } catch (err) {
                    console.error(`[DataTable] rowAttrs: bad attribute "${name}"`, err);
                }
            }
            tr.__twmAttrs = set;
        }
        if (typeof this.config.getRowKey === 'function' || this._activeKey !== null) {
            tr.__rowKey = this._rowKey(row, rowIdx);
        }
        this._paintActive(tr);
    }

    /** The open mark on one row, from `_activeKey`. */
    _paintActive(tr) {
        if (tr.__rowKey === undefined && this._activeKey !== null && tr.__rowIndex !== undefined) {
            // A row drawn before a key was asked for (setActiveRow after render).
            const rows = this.config.rows;
            const local = this._virt ? this._virtLocalOf(tr.__rowIndex) : -1;
            const row = local >= 0 ? this._virt.rows[local] : rows?.[tr.__rowIndex];
            tr.__rowKey = this._rowKey(row, tr.__rowIndex);
        }
        const on = this._activeKey !== null && tr.__rowKey === this._activeKey;
        tr.classList.toggle('twm-dt-row--active', on);
        if (on) tr.setAttribute('aria-current', 'true');
        else if (tr.getAttribute('aria-current') === 'true' && !(tr.__twmAttrs || []).includes('aria-current')) {
            tr.removeAttribute('aria-current');
        }
    }

    /** The row icon, drawn by CSS from `data-twm-icon` so that its name is in
     *  neither `textContent`, the clipped-cell tooltip nor a copy. */
    _prependRowIcon(td, spec) {
        if (!spec) return;
        const s = typeof spec === 'string' ? { icon: spec } : spec;
        if (!s.icon) return;
        const icon = document.createElement('span');
        icon.className = 'material-symbols-outlined twm-dt-row-icon'
            + (s.tone ? ` twm-dt-row-icon--${String(s.tone).replace(/[^\w-]/g, '')}` : '');
        icon.dataset.twmIcon = String(s.icon);
        if (s.title) {
            icon.title = String(s.title);
            icon.setAttribute('role', 'img');
            icon.setAttribute('aria-label', String(s.title));
        } else {
            icon.setAttribute('aria-hidden', 'true');
        }
        td.insertBefore(icon, td.firstChild);
        td.classList.add('twm-dt-cell--has-icon');
    }

    /** Text, a node, or nothing, into an empty-state cell. */
    _appendStateContent(td, content) {
        if (content == null || content === false) return;
        if (typeof Node !== 'undefined' && content instanceof Node) td.appendChild(content);
        else td.textContent = String(content);
    }

    /** What `setError` holds, as something `_appendStateContent` can draw. */
    _errorContent() {
        const e = this._error;
        if (e == null) return null;
        if (typeof Node !== 'undefined' && e instanceof Node) return e;
        if (e instanceof Error) return e.message || String(e);
        if (typeof e === 'object' && e.message) return String(e.message);
        return String(e);
    }

    /** The failure banner over rows that are kept. */
    _createErrorBanner() {
        const banner = document.createElement('div');
        banner.className = 'twm-data-table__error';
        banner.setAttribute('role', 'alert');
        const icon = document.createElement('span');
        icon.className = 'material-symbols-outlined twm-data-table__error-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = 'error';
        const text = document.createElement('span');
        text.className = 'twm-data-table__error-text';
        const content = this._errorContent();
        // A node is the consumer's (and is MOVED here); a copy would lose its
        // listeners.
        if (typeof Node !== 'undefined' && content instanceof Node) text.appendChild(content);
        else text.textContent = String(content ?? '');
        banner.append(icon, text);
        return banner;
    }

    /** The `sortValue` hook for one column, or null. */
    _sortValueFor(colIdx) {
        const sv = this.config.sortValue;
        if (typeof sv === 'function') return sv;
        const fn = perColumn(sv, colIdx);
        return typeof fn === 'function' ? fn : null;
    }

    /** The words for a value in a typed column, or `undefined` when the
     *  column is not typed (or the value is empty). */
    _formatTyped(value, colIdx) {
        const kind = this._columnTypes?.[colIdx];
        if (!TYPED_COLUMNS.has(kind) || value == null || value === '') return undefined;
        if (kind === 'duration') {
            return formatDuration(value, perColumn(this.config.durationFormat, colIdx) || 'auto');
        }
        const pattern = kind === 'datetime'
            ? perColumn(this.config.dateTimeFormat, colIdx) || ISO_DATETIME
            : perColumn(this.config.dateFormat, colIdx) || ISO_DATE;
        if (typeof pattern === 'function') {
            const t = parseDateValue(value, { utc: this._utc() });
            return Number.isFinite(t) ? String(pattern(new Date(t), colIdx, value) ?? '') : String(value);
        }
        return formatDate(value, pattern, { utc: this._utc() });
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
        const bodyTable   = this._tableEl;
        if (!headerTable || !bodyTable) return null;
        // A ROW OF DATA, not merely the first `<tr>`: under C10 that is a
        // spacer, and an embedder may inject rows of its own (a group header is
        // one cell spanning every column, which would measure as ONE column).
        const firstRow = this._firstBodyRow();
        if (!firstRow) return null;
        const bodyCells = firstRow.children;
        if (!bodyCells.length) return null;

        headerTable.querySelectorAll('thead > tr').forEach((tr) => {
            for (const th of tr.children) this._clearCellWidth(th);
        });
        for (const td of bodyCells) this._clearCellWidth(td);
        // C10: the `<col>`s are what hold the widths, so they are what has to
        // let go for the measure (`.twm-dt-measuring col` also overrides them).
        for (const col of this._cols() || []) col.style.width = '';
        headerTable.style.width = '';
        bodyTable.style.width   = '';
        headerTable.classList.add('twm-dt-measuring');
        bodyTable.classList.add('twm-dt-measuring');
        // Appended at the end, where they move no drawn row, and taken out
        // again below before anything paints.
        const sampled = sample ? this._virtSampleRows() : [];
        for (const tr of sampled) this._virt.tbody.appendChild(tr);
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

        for (const tr of sampled) tr.remove();
        headerTable.classList.remove('twm-dt-measuring');
        bodyTable.classList.remove('twm-dt-measuring');
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
            if (!(v.heights[i] > 0)) continue;       // hidden: not drawn, not fitted
            last = i;
            const row = v.rows[i];
            if (!Array.isArray(row)) continue;
            for (let c = 0; c < row.length; c++) {
                const value = row[c];
                const len = value == null ? 0 : String(value).length;
                if (len > (longest[c] ?? -1)) { longest[c] = len; at[c] = i; }
            }
        }
        const want = new Set(at.filter((i) => i !== undefined));
        if (last >= 0) want.add(last);
        const rows = [];
        for (const i of want) {
            if (v.map.has(i)) continue;             // drawn already; measured anyway
            const tr = this._buildBodyRow(v.rows[i], v.globalOf(i), i);
            tr.setAttribute('aria-hidden', 'true');
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
        const bodyTable   = this._tableEl;
        if (!headerTable || !bodyTable) return;
        // C10. UNDER `virtualize` THE COLUMN TRACK IS THE `<colgroup>`, and the
        // column count is ITS length — not the first row's, which is whatever
        // row the window happens to start at (or a spacer). Without it, the
        // first ROW OF DATA; see `_firstBodyRow` for why not merely the first `<tr>`.
        const cols = this._cols();
        const firstRow = this._firstBodyRow();
        const bodyCells = cols ? [] : firstRow?.children;
        const n = cols ? cols.length : (bodyCells?.length || 0);
        if (!n) return;

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
        const natural = this._allColumnsPinned(n)
            ? new Array(n).fill(0)
            : this._measureNaturalWidths();
        if (!natural) return;

        // ── Fit pass: turn natural widths into final widths that respect
        // the available space, favour the first column, and cap runaways.
        // User-dragged columns (`_colWidths`) are honored as-is inside.
        const wrap = this._tableWrapEl;
        const headerWrap = this._headerWrapEl;
        const avail = wrap ? wrap.clientWidth : 0;
        const firstIdx = this.config.showRowNumbers && n > 1 ? 1 : 0;
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
        if (cols) {
            for (let i = 0; i < cols.length && i < widths.length; i++) {
                cols[i].style.width = `${widths[i]}px`;
            }
        } else {
            for (let i = 0; i < bodyCells.length && i < widths.length; i++) {
                this._setCellWidth(bodyCells[i], widths[i]);
            }
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
        const headRow = headerTable && headerTable.querySelector('thead > tr');
        if (!headRow) return;

        // NOTHING HAPPENS UNTIL THE POINTER MOVES. Freezing on mousedown pinned
        // every column on a plain click, and the first click of a double-click,
        // so a click on a grip was already a resize and switched auto-fit off
        // for every column for good.
        //
        // Once the drag is real: freeze EVERY column at its current width on
        // BOTH tables and lock fixed layout, so the drag moves only the grabbed
        // column and a neighbour can never absorb it. Widths come from the
        // header row (the column source of truth), in CSS pixels.
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
            headerTable.style.tableLayout = 'fixed';
            if (bodyTable) bodyTable.style.tableLayout = 'fixed';
            startWidths.forEach((w, i) => this._pinColumnWidth(i, w));
            this._applyTableWidth();
            document.body.classList.add('twm-dt-col-resizing');
        };
        const onMove = (mv) => {
            const dx = mv.clientX - startX;
            if (!startWidths) {
                if (Math.abs(dx) < THRESHOLD) return;
                begin();
            }
            const w = Math.max(MIN, Math.round(startWidths[domIdx] + dx / this._zoomFactor()));
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
            if (!startWidths) return;               // a click: nothing changed
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
        // C10: the `<col>` is the track; without one, the first row of data.
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
    _updateCellTooltips(rows = null) {
        const bodyTable = this._tableEl;
        if (!bodyTable) return;
        // `rows`: only these (C10 — the rows a window slide just added).
        const cells = rows
            ? rows.flatMap((tr) => [...tr.children])
            : bodyTable.querySelectorAll('tbody td');
        cells.forEach((td) => {
            if (td.parentElement?.classList.contains('twm-dt-spacer')) return;
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

                if (selectable === 'single') {
                    // 0.5.0. One row, whatever the modifiers say: Ctrl takes
                    // the one row back off, nothing extends it.
                    const was = selected.has(idx);
                    selected.clear();
                    if (!(was && (event.metaKey || event.ctrlKey))) selected.add(idx);
                    this._state.anchorIndex = selected.size ? idx : null;
                } else if (event.shiftKey && this._state.anchorIndex != null) {
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

        // 0.5.0 `onRowActivate`. Bound AFTER the selection handler on the same
        // element, so a row is selected before it is opened — the listener
        // order is the guarantee. `onRowClick` stays exactly where it was (on
        // the `<tr>`, before the selection), for whoever already relies on that.
        if (typeof this.config.onRowActivate === 'function') {
            this._installActivation(tbody, table);
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
                    if (key === 'a' && selectable === 'single') {
                        // 0.5.0. Nothing to select all of — and not the page's
                        // text either.
                        event.preventDefault();
                    } else if (key === 'a' && selectable) {
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

        this._contextMenuEl = menu;
        return menu;
    }

    /**
     * The document-level listeners that close the copy menu — a click
     * elsewhere, a scroll, Escape, a resize — held ONLY WHILE IT IS OPEN
     * (0.5.0). They were installed the first time the menu was built and kept
     * until `dispose()`, so every table anybody had ever right-clicked kept four
     * listeners on the document for as long as the instance lived, and an
     * instance whose host was thrown away without a `dispose()` kept them for
     * the life of the page. A closed menu has nothing for them to do.
     */
    _armContextMenuGlobals() {
        if (this._contextMenuGlobals.length) return;
        const menu = this._contextMenuEl;
        const hideOnGlobal = (event) => {
            if (event?.target && menu?.contains(event.target)) return;
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
    }

    _disarmContextMenuGlobals() {
        this._contextMenuGlobals.forEach((off) => {
            try { off?.(); } catch (_) { /* already gone */ }
        });
        this._contextMenuGlobals = [];
    }

    _hideContextMenu() {
        if (this._contextMenuEl) {
            this._contextMenuEl.style.display = 'none';
        }
        this._disarmContextMenuGlobals();
    }

    _showContextMenu(clientX, clientY) {
        const menu = this._ensureContextMenu();
        this._armContextMenuGlobals();
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
        // 0.5.0 `nullDisplay`, then a typed column's own words — each only when
        // asked for, so a table without them formats exactly as 0.4 did.
        if (value == null && this.config.nullDisplay != null) {
            return String(this.config.nullDisplay);
        }
        const typed = this._formatTyped(value, colIndex);
        if (typed !== undefined) return typed;
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
