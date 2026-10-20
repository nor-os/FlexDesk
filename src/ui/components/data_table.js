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
 * - Column drag-to-reorder (`reorderable`, `columnOrder`; column_order.js)
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
import { createChipsFilter } from './table_filter_chips.js';
import { CellGrid } from './cell_grid.js';
import { ColumnReorder, cellOrder, isColumnOrder, moveInOrder, naturalOrder } from './column_order.js';

// 0.7.0: the built-in chips filter control, for a consumer that wants to build
// one outside a table (the same control `filterKinds: {kind: 'chips'}` draws).
export { createChipsFilter } from './table_filter_chips.js';

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

/** 0.6.1 — the row statuses `diff` draws. */
const DIFF_STATUSES = new Set(['added', 'removed', 'changed', 'same', 'gap']);

// ── `paging`: a server's rows, in pages or as one scrolling list ────────────
//
// THE TWO LIMITS. A table that scrolls holds every row it has loaded, in one
// array and (through `virtualize`) one scroll range, so how many rows it may
// hold is a decision rather than an accident of how far somebody scrolled.
// The SOFT limit is the consumer's (a person's preference, say): a source
// with more rows than that is shown in pages, whatever was asked for. The HARD
// limit is the ceiling no soft limit may exceed, and no scrolling table ever
// holds more rows than it.

/** The most rows a scrolling table holds, and the ceiling of every soft limit. */
export const PAGING_HARD_LIMIT = 100_000;
/** The soft limit when the consumer names none. */
export const PAGING_SOFT_LIMIT = 10_000;

/**
 * WHICH WAY A TABLE IS SHOWN — pure, so a consumer deciding how to FETCH and
 * the table deciding how to DRAW get the same answer from the same facts.
 *
 * Scroll is allowed only while the source is known to hold no more rows than
 * the soft limit. What is known is the exact `total` when there is one, and
 * otherwise the most the facts prove: a lower bound (`atLeast`, a capped
 * count) or the rows already held plus one when the source says it has more.
 * An unknown total therefore does not force pages until the rows themselves
 * prove the source is larger than the limit.
 *
 * @param {object} [o]
 * @param {'pages'|'scroll'} [o.mode='scroll'] what was asked for
 * @param {number|null} [o.total]   the source's exact row count, if known
 * @param {number} [o.atLeast=0]    a lower bound on it (a capped count)
 * @param {number} [o.held=0]       rows the table holds now
 * @param {boolean} [o.hasMore=false] the source has rows past those held
 * @param {number} [o.softLimit=PAGING_SOFT_LIMIT]
 * @param {number} [o.hardLimit=PAGING_HARD_LIMIT]
 * @returns {{mode: 'pages'|'scroll', requested: 'pages'|'scroll', forced: boolean,
 *            softLimit: number, hardLimit: number, known: number, exact: boolean}}
 */
export function resolvePaging({
    mode = 'scroll', total = null, atLeast = 0, held = 0, hasMore = false,
    softLimit = PAGING_SOFT_LIMIT, hardLimit = PAGING_HARD_LIMIT,
} = {}) {
    const requested = mode === 'pages' ? 'pages' : 'scroll';
    const hard = Number.isFinite(hardLimit) && hardLimit >= 1
        ? Math.floor(hardLimit) : PAGING_HARD_LIMIT;
    // A soft limit above the hard one is the hard one: nothing the consumer
    // names can let a table hold more than the ceiling.
    const soft = Math.min(hard, Number.isFinite(softLimit) && softLimit >= 1
        ? Math.floor(softLimit) : PAGING_SOFT_LIMIT);
    const exact = Number.isFinite(total) && total >= 0;
    const known = exact ? total
        : Math.max(Number.isFinite(atLeast) ? atLeast : 0, (held || 0) + (hasMore ? 1 : 0));
    const forced = requested === 'scroll' && known > soft;
    return {
        mode: forced ? 'pages' : requested, requested, forced,
        softLimit: soft, hardLimit: hard, known, exact,
    };
}

/** How near the bottom (px) a scrolling table asks for its next rows. */
const PAGING_LOAD_MORE_PX = 400;

/** 0.5.0 — the column types that sort and filter by a value rather than by
 *  the text drawn for it. */
const TYPED_COLUMNS = new Set(['date', 'datetime', 'duration']);

/** 0.5.0. The clicks with which a `selectable: 'single'` table took its row
 *  back OFF the selection (Ctrl on the chosen row). `onRowActivate` does not
 *  open a row on such a click. Marked on the EVENT, not read back from the
 *  selection, because a selection callback that re-draws with new rows clears
 *  the selection before the activation listener runs. */
const DESELECTING_CLICKS = new WeakSet();

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
        if (el.isConnected) {
            table._autoSeen = true;
            // 0.7.0. BACK IN: whatever grace was running for the last time it
            // went out is over. Without this, a table taken out, put back and
            // taken out again was judged by the FIRST departure's clock, and
            // disposed while it had been out for less than its grace.
            if (table._autoPending) {
                clearTimeout(table._autoTimer);
                table._autoTimer = null;
                table._autoPending = false;
            }
            continue;
        }
        if (!table._autoSeen || table._autoPending) continue;
        // 0.7.0 `keepWhileDetached: true`: out is not gone. Nothing is
        // scheduled; the table waits to be put back (or for `dispose()`).
        const grace = table._detachGrace();
        if (grace === Infinity) continue;
        // NOT AT ONCE. A renderer that takes a subtree out and puts it back in
        // the same task (FlexDesk's own tile renderer re-appends every leaf in
        // tree order) has put it back by the time this microtask runs — and one
        // that takes a turn longer still gets one task's grace (or, 0.7.0, the
        // `keepWhileDetached` grace). Only a table that is STILL out after that
        // has been removed from the page.
        table._autoPending = true;
        table._autoTimer = setTimeout(() => {
            table._autoPending = false;
            table._autoTimer = null;
            if (!entry.tables.has(ref)) return;
            const now = table._wrapperEl;
            // `_disposeOwn`, NOT `dispose()`: by now the host may hold
            // something else — the next list mounted into it, or the pane's
            // own message — and `dispose()` empties the host.
            if (now && !now.isConnected) table._disposeOwn();
        }, grace);
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

/** 0.7.0. Ids for the detail regions a row's toggle controls. */
const DETAIL_SEQ = { n: 0 };

/** 0.7.0. How a filter control's value matches a cell when its control says
 *  nothing (`match`): a list is "one of these", a `{from, to}` is a range
 *  (inclusive; dates and numbers compared as such), text is "contains", and
 *  anything else is equality as text. */
function defaultControlMatch(cell, value) {
    if (Array.isArray(value)) return value.some((v) => String(v ?? '') === String(cell ?? ''));
    if (value && typeof value === 'object' && !(value instanceof Date)
        && ('from' in value || 'to' in value)) {
        const asNumber = (x) => {
            if (x == null || x === '') return null;
            if (x instanceof Date) return x.getTime();
            if (typeof x === 'number') return x;
            const t = parseDateValue(x);
            if (Number.isFinite(t)) return t;
            const n = parseFloat(x);
            return Number.isFinite(n) ? n : null;
        };
        const c = asNumber(cell);
        if (c === null) return false;
        const lo = asNumber(value.from);
        const hi = asNumber(value.to);
        if (lo !== null && c < lo) return false;
        if (hi !== null && c > hi) return false;
        return true;
    }
    if (typeof value === 'string') {
        return String(cell ?? '').toLowerCase().includes(value.toLowerCase());
    }
    return String(value) === String(cell ?? '');
}

/** 0.7.0. The chips' rule: the cell IS the chosen value (one of them, for
 *  `multiple`). */
function chipsMatch(spec) {
    return (cell, value) => {
        const want = Array.isArray(value) ? value : [value];
        return want.some((v) => String(v ?? '') === String(cell ?? ''));
    };
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
 * @property {Function} [getColumnType] - Get column type: (colIndex, rows) => 'num'|'text'. What it returns is the cells' class name, and 'num' also sorts and filters as a number — exactly as in 0.4. A date, datetime or duration column is declared through `columnTypes` (0.5.0): returned from here, those names are class names only.
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
 * @property {boolean} [showExportButton=false] - Adds a "CSV" download button to the pagination strip that invokes `downloadCSV()`. The strip is drawn for it even when the table fits on one page (0.14.1).
 * @property {string|function(DataTable): string} [exportFilename='data.csv'] - The file the export button saves (0.14.1); in a desktop host, the name the Save dialog suggests.
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
 * @property {boolean} [autoDispose=false] - Dispose by itself once the table has been taken out of the document (and is still out a task later). Unlike `dispose()`, it removes only the table's own elements and never empties the host, which by then may hold the next list or the pane's own message. Do NOT set it on a table you take out and put back later — a cached tab — since a disposed table comes back empty.
 * @property {'time'|'plain'} [firstColumn='time'] - 'plain' draws the first column like every other column: no 120–150px pin, no grey, no weight. The default keeps the time-series styling the component was built around.
 * @property {boolean} [clickable] - Draw body rows as things to press (`twm-dt--clickable`: a pointer and a hover, readonly tables included). Defaults to on exactly when `onRowActivate` is set.
 * @property {Function} [onRowActivate] - `(rowIdx, row, ev) => void`. The row OPENS. Fired after the selection has been updated, on the gestures `activateOn` names, and never on a press on a control inside the row, a click that ends a text selection in the table, the second click of a double-click, or (`selectable: 'single'`) the Ctrl click that took the row off the selection. `ev.type` says which gesture ('click', 'dblclick' or 'keydown'). `rowIdx` is the original index, as for `onRowClick`. A press whose `onSelectionChange` or `onRowClick` re-draws the table still opens the row pressed; `row` is that row as it was drawn.
 * @property {'click'|'dblclick'|'enter'|Array<'click'|'dblclick'|'enter'>} [activateOn='click'] - Which gestures open a row. A list of things to open: 'click'. A pick list, where one click selects: ['dblclick', 'enter']. Enter opens the selected row (the one row selected, or the selection's anchor) — the row a double-click on it would open; with nothing selected, the active row (`activeRow`).
 * @property {Function} [getRowKey] - `(row, rowIdx) => key`. A row's identity, which `activeRow` is matched by. Compared as text.
 * @property {*} [activeRow] - The key of the row that is OPEN (the master of a master-detail): drawn `twm-dt-row--active` with `aria-current="true"`. It survives `setData`, a sort, a filter and a page, and a right-click does not move it. Without `getRowKey` the key is the row's original index. See `setActiveRow`.
 * @property {Function} [rowClass] - `(row, rowIdx) => string|string[]|null`. Classes for the row's `<tr>`.
 * @property {Function} [rowAttrs] - `(row, rowIdx) => {name: value}`. Attributes for the row's `<tr>` (`null`/`false` leaves one off, `true` sets it empty).
 * @property {Function} [cellClass] - `(value, colIdx, row, rowIdx) => string|string[]|null`. Classes for a cell, after its type class.
 * @property {Function} [diff] - 0.6.1. `(row, rowIdx) => {status, cells?}|null`. One side of a COMPARISON: `status` is 'added', 'removed', 'changed', 'same' or 'gap' and draws the row `twm-dt-diff twm-dt-diff--<status>`; `cells` (an array or Set of column indices) marks the cells that differ `twm-dt-diff__cell--changed`. A 'gap' row is the place a row holds on the OTHER side: its cells are drawn empty, whatever its values and `renderCell`, so two tables drawn from one aligned row list keep their rows level. `null` (or an unknown status) draws the row as without `diff`.
 * @property {object} [scrollLock] - 0.6.1. A group from `createScrollLock()`: the table's body box joins it on every render and leaves it on the next render and on dispose, so tables in the same group scroll as one.
 * @property {Function} [rowIcon] - `(row, rowIdx) => string|{icon, title?, tone?}|null`. A Material Symbols icon at the start of the row's first cell; `tone` adds `twm-dt-row-icon--<tone>`. Drawn by CSS, so it is in neither the cell's text, its tooltip nor a copy.
 * @property {string|Node|Function} [emptyState] - What the box says when there are no rows: text, a node, or a function returning either (called on each render). Replaces `emptyMessage`, and is hidden while `setLoading(true)` — an empty table that is still loading is not empty.
 * @property {string} [nullDisplay] - Draw `null`/`undefined` as this text (and copy it so), with `twm-dt-cell--null` on the cell, instead of '-'.
 * @property {Array<string|null>} [columnTypes] - Each column's type by position ('num', 'text', 'date', 'datetime', 'duration'); `null` leaves a column to `getColumnType` and detection. Only a type declared HERE makes a column a date, datetime or duration column — drawn, sorted and filtered by its value; `setData({columnTypes})` applies a new list at once.
 * @property {Function|Object|Array} [sortValue] - `(value, colIdx, row) => comparable` — what a column sorts by, for every column or (as an object or array keyed by column index) for some. `undefined` falls back to the column's own rule. A `Date` sorts by its time, numbers numerically, text as lower-cased text, `null` last.
 * @property {string|Function|Object|Array} [dateFormat='YYYY-MM-DD'] - How a 'date' column is drawn: a pattern (see `formatDate`) or `(date) => string`, for every date column or per column index.
 * @property {string|Function|Object|Array} [dateTimeFormat='YYYY-MM-DD HH:mm'] - The same for a 'datetime' column.
 * @property {'auto'|'clock'|Function|Object|Array} [durationFormat='auto'] - How a 'duration' column (milliseconds) is drawn: '850 ms', '3.2 s', '2m 5s' (auto) or '0:02:05' (clock).
 * @property {'local'|'UTC'} [dateTimeZone='local'] - The zone typed date columns are read and drawn in.
 *
 * ── `paging`, off unless asked for ────────────────────────────────────────
 * @property {Object} [paging] - A server's rows shown IN PAGES or as ONE SCROLLING LIST, and a strip under the body that says which and lets the reader change it. The consumer holds the rows and fetches them; the table decides which way they are shown (`resolvePaging`), asks for more, and draws the strip. Set it and the old pager (`pagination`) is not drawn. Its keys:
 *   `mode` ('pages'|'scroll', default 'scroll') — what was asked for. Scroll is refused, and pages shown, while the source holds more than `softLimit` rows.
 *   `pageSize` — rows per page, and per load while scrolling (default `pageSize`).
 *   `softLimit` (default 10,000) and `hardLimit` (default 100,000) — see `resolvePaging`; the soft one is clamped to the hard one, and a scrolling table never asks for rows past the hard one.
 *   `total` — the source's exact row count, or null. `atLeast` — a lower bound when the exact count is not known (a capped count). `hasMore` — the source has rows past those held.
 *   `offset` — in pages, where the first row held stands in the source: the strip's "Rows 1,001–2,000" and `showRowNumbers: 'position'` read it. The rows' indexes (`__rowIndex`, selection, `onRowClick`) stay those of `rows`.
 *   `onPage(offset, limit)` — pages: show the page at `offset`. `onLoadMore()` — scroll: called when the body is scrolled within 400px of its end (`loadMorePx`), or does not fill its box, while `hasMore`. `onLoadAll()` — scroll: the strip's *Load all rows* button. `onModeChange(mode)` — the strip's Pages / Scroll switch; without it there is no switch. Each may return a Promise; until it settles no second call is made and its button shows the table is busy.
 *   0.7.0: WITH `dataSource` the table fetches, and is its own `paging` consumer — `offset`, `total`, `atLeast`, `hasMore` and `held` are read from the source's answers, `onPage`/`onLoadMore`/`onLoadAll` are the table's own questions (`reason` 'page', 'more', 'all'; more rows are drawn under those held), and `onModeChange` is told after the table has switched and asked again (`reason` 'mode'). The 0.7.0 pager is not drawn; `pagerLabels` and `maxJumpOffset` apply to the strip.
 *
 * ── 0.7.0, every one of them off unless asked for ─────────────────────────
 * @property {Function} [rowDetail] - `(row, rowIdx, {host, key, table}) => Node|string|null|void`. A row's DETAIL, folded open under it: each row (or each row `hasRowDetail` admits) gets a toggle at the start of its first cell, and opening it draws a full-width row under the row — the function fills `host` or returns what to put in it. It is drawn when opened and dropped when closed. Keyboard: the toggle is a button (Enter/Space), and on the focused table ArrowRight opens and ArrowLeft closes the current row's detail. Which rows are open is kept by KEY (`getRowKey`, else the row's index), so it survives a sort, a filter, a page and a `setData`; under `virtualize` an open detail is part of its row's height.
 * @property {Function} [hasRowDetail] - `(row, rowIdx) => boolean`. Whether a row has a detail at all; a row without one gets no toggle. Absent: every row has one.
 * @property {Array} [expandedRows] - The keys of the rows open at first.
 * @property {Function} [onRowDetailToggle] - `(rowIdx, row, expanded, key) => void`, after a detail opened or closed by a gesture or by `setRowExpanded`.
 * @property {string} [rowDetailLabel='Details'] - The toggle's accessible name (its state is `aria-expanded`).
 * @property {Function} [dataSource] - `(query, {signal}) => Promise<{rows, total?, hasMore?, filterCounts?} | rows>`. ROWS FROM A SERVER. The table asks for a page whenever its sort, its column filters or its page change (and on `reload()`/`refresh()`), and draws the answer AS GIVEN — no client sort, filter or slice. `query` is `{offset, limit, sort: {column, header, ascending}|null, filters: [{column, header, value}], reason}`. With `paging` the rows may be shown as one scrolling list as well as in pages — see `paging`. Only the NEWEST request paints: an older answer arriving later is dropped, and its `signal` is aborted. A failure keeps the rows on screen under `setError`'s banner. `total` is the count under these filters — a number, or null when it is not known (see `hasMore`). `rowIdx` everywhere is the row's index in the page drawn.
 * @property {Function} [onLoad] - `(result, query) => void`, after the newest answer has been drawn.
 * @property {Function} [onLoadError] - `(error, query) => void`, when the newest request failed (an aborted one is not a failure).
 * @property {boolean} [hasMore] - Server-side paging (`onPageChange`) with NO total: with `totalCount` null and this a boolean, the pager offers Next exactly while it is true and has no last page. Under `dataSource` the answer's `hasMore` (or, absent, a full page) says it.
 * @property {Object} [pagerLabels] - The pager's words: `{first, prev, next, last, noLast, tooDeep}`. The four buttons are drawn with their word beside the icon, never narrower than it (`{first: 'Newest', prev: 'Newer', next: 'Older', last: 'Oldest'}` for a log read newest first); `noLast` is the refusal on Last when the total is unknown, `tooDeep` (`(max) => string`) the one past `maxJumpOffset`.
 * @property {'top'|'bottom'} [pagerPosition='top'] - Where the pager strip sits.
 * @property {number} [maxJumpOffset] - The deepest offset Last and Go-to-row will jump to. Past it the control is REFUSED, disabled with the reason on it (`data-refusal`), rather than slow.
 * @property {boolean|{interval?: number}} [follow=false] - Under `dataSource`: re-read the first page every `interval` ms (default 10000) while the table is on it and in the page, keeping the scroll position, the selection and the active row; rows not there before are drawn `twm-dt-row--new`. A tick waits while text in the table is selected or the focus is inside an open detail. Paging away turns following OFF (`onFollowChange(false)`); coming back does not turn it on again. See `setFollow`, `refresh`.
 * @property {Function} [onFollowChange] - `(following) => void`.
 * @property {boolean|number} [keepWhileDetached=false] - With `autoDispose`: how long a table taken out of the page may stay out and still come back drawn. A number is a grace in ms; `true` keeps it for as long as it is out (it is disposed only by `dispose()`, and what it holds meanwhile is its own DOM — nothing on the document, and a follow timer that holds it weakly). A table put back within its grace is not disposed, however many tasks it was out.
 * @property {Object|Array|Function} [filterKinds] - FILTER CONTROLS THAT ARE NOT TEXT BOXES, per column (an object or array keyed by column index, or `(colIdx, header) => spec`). A spec is `'text'` (the 0.4 box), `{kind: 'chips', options: [{value, label, icon?, title?}], multiple?}` (one-of-N chips with counts — an option whose value is `''` or null means "no filter"), or `{create(ctx)}` / a function `create(ctx)` for the consumer's own control (a date range, a person): `ctx` is `{column, header, value, counts, setValue(v), table}`, and it returns `{el, setValue?(v), setCounts?(c), destroy?(), match?(cellValue, filterValue, row)}`. A filter's value may then be anything (an array, an object): `query.filters` forwards it as it is, and on the client the control's `match` decides (chips: equality, or membership for `multiple`). The control is built once and kept across renders, and is in the column-width measure: a column is never narrower than its control at its narrowest (the widest chip), and the cell wraps the rest.
 * @property {Function} [onFilterChange] - `(filters) => void` with `[{column, header, value}]`, whenever a column filter changes.
 *
 * ── STORY-0010, every one of them off unless asked for ─────────────────────
 * @property {Array|Function} [contextMenuItems] - The consumer's own items in the table's right-click menu: an array, or `(row, rowIdx, ctx) => items`, asked on every right-click of a body row so the items can follow the row and the live selection. An item is `{label, icon?, action, disabled?, danger?, title?}` or `{separator: true}`, drawn as the copy items are (`disabled` greys it, `danger` is `twm-delete-node`). `ctx` is `{rowIdx, row, colIdx, value, selection, selectedRows}`: the right-clicked row (already selected by then), the right-clicked cell (`colIdx` null off a data column, the row-number gutter included), and the selection's original indices with their rows, 1:1. The items come first; with `copyable` the copy items follow behind a separator. Set, it installs the menu without `copyable` too.
 * @property {Function} [onContextMenuAction] - `(action, rowIdx, row, ctx) => void`, when one of `contextMenuItems` is chosen; the menu is hidden first. The copy items never come here.
 * @property {Function} [onRender] - `(table) => void`, at the end of every `render()` — for a consumer that shows something the rows decide (a count) outside the table. See `getDisplayedRows`.
 * @property {boolean} [keyboardNav=false] - On the focused table, ArrowUp/ArrowDown move the selection one row through the rows of the page shown (in the order shown), Home/End to its first and last, and with Shift (a table that selects several rows) select the range from the anchor, as Shift-click does. The row moved to is scrolled into view (`scrollToRow`) and `onSelectionChange` is told. Needs `selectable`. Not on a key pressed in a control inside the table, nor with Ctrl, Cmd or Alt.
 * @property {Function} [onRowKeyDown] - `(rowIdx, row, ev) => boolean|void`, for every key pressed on the focused table (not in a control inside it) BEFORE the table's own keys: `rowIdx`/`row` are the row Enter would open (the one row selected, the selection's anchor, else the active row — see `activateOn`), or null when none is drawn. Return `true` and the key is the consumer's: the table does nothing more with it (default prevented, propagation stopped — the page's keymap does not see it either). For the keys `activateOn` does not take: Ctrl+Enter, Alt+T, a "delete this row".
 * @property {number[]} [hiddenColumns] - STORY-0012. Columns (data indices) NOT DRAWN: no header, no filter box, no cell, no width in the fit, not in a copy or the CSV. They stay in the row data — `renderCell`, `contextMenuItems`' `ctx.row`, sorting and filtering (`sortBy`, `setFilter`) all still see them. A column sorted on while hidden keeps the order and has no arrow to show it. The last column shown cannot be hidden. With `persistKey` the set shown is saved, and a saved set wins over this one. `setData({hiddenColumns})` applies a new set.
 * @property {boolean} [columnChooser=false] - STORY-0012. A right-click on the header lists every column with a check mark on those shown; choosing one shows or hides it (`setColumnVisible`).
 * @property {boolean} [selectToggle=false] - STORY-0016. The table offers a SELECT MODE: a narrow leading column whose header holds a toggle button. While the mode is on, every row shows a checkbox there and the header a select-all box; a plain click (or Space) ticks or unticks one row, Shift-click adds the range from the last row ticked, and no gesture opens a row (`onRowActivate` is not called; `onRowClick` still is — a consumer that opens rows from it asks `isSelectMode()`). The arrows move a cursor without changing what is ticked. A right-click keeps the ticks. Escape clears the ticks, then leaves the mode. Needs a multi-row `selectable` (ignored, with a warning, on `false` or 'single'). The column is not resizable, is no data column (not in a copy, a CSV, `ctx.colIdx` or `hiddenColumns`), and remembered widths stay on their columns.
 * @property {boolean} [selectMode=false] - STORY-0016. Start in select mode. Draws the select column even without `selectToggle` (then there is no toggle: the consumer turns the mode off with `setSelectMode(false)`).
 * @property {Function} [onSelectModeChange] - STORY-0016. `(on) => void`, after every change of the mode (the toggle, Escape, `setSelectMode`).
 * @property {Function} [onColumnsChange] - STORY-0012. `(hidden, {hidden, order}) => void` with the hidden columns' indices, ascending, after every change of the set (the chooser, `setColumnVisible`, `setData({hiddenColumns})`) — and (STORY-0086) of the order (a drag, `moveColumn`, `setData({columnOrder})`); `order` is `getColumnOrder()`.
 * @property {boolean} [reorderable=false] - STORY-0086. Data columns can be dragged into a new order by their headers (a press on a resize grip resizes instead), and the header's right-click offers Move left / Move right. The row-number and select columns stay first: they do not move and nothing is dropped in front of them. The order is kept by data index, so `hiddenColumns`, the sort and the filters stay on their columns; copies and the CSV follow the order shown. With `persistKey` it is saved, and a saved order wins over `columnOrder` — unless its column count is not today's, when it is ignored.
 * @property {number[]} [columnOrder] - STORY-0086. Every data index, in the order to draw them (`[0, 3, 1, 2]`). Not a permutation of the columns: ignored, natural order. Works without `reorderable` (then only code moves columns). See `moveColumn`, `getColumnOrder`.
 * @property {boolean} [persistPage=false] - With `persistKey`: the client page is saved with the sort and the filters, and opened again on mount (on the last page, if the rows have shrunk since). OFF by default: a key shared by DIFFERENT row sets (ad-hoc filters, search results) must not reopen on a page of the last list. A sort under `resetPageOnSort` and a new filter save the first page, as they show it. A server's page (`onPageChange`, `dataSource`) is the consumer's and is not kept.
 *
 * ── STORY-0003, every one of them off unless asked for ─────────────────────
 * @property {'rows'|'cells'} [selectionMode='rows'] - 'cells': CELL MODE (cell_grid.js, over cell_selection.js). A click selects one cell and puts the CURSOR on it, Shift+click selects the range from the anchor to it; every cell of the range is drawn `twm-dt-cell--selected` and the cursor `twm-dt-cell--cursor` (rows are not lit). On the focused table the arrows move the cursor (Shift extends), Ctrl+arrow jumps to the edge of the block of filled cells, Home/End go to the row's ends (Ctrl: the page's corners), Tab moves right and wraps to the next row (Shift+Tab back), Ctrl+A selects every cell of the page and Escape collapses the range onto the cursor. The cursor stays on the page drawn and is scrolled into view (under `virtualize` its row is drawn). `getSelection()` still answers ROWS — the original indices the range touches — and Ctrl+C copies those rows as before. A cell is `{row, col}`: `row` the position in the order shown (`getDisplayedRows()`), `col` the data column. Fixed for the table's life; `selectToggle`, `selectMode` and `keyboardNav` beside it are ignored with a console warning. See `getCellSelection`, `setCellSelection`.
 * @property {boolean|number[]|Function} [editable=false] - Cell mode only (a warning, and ignored, without it). Which cells open an EDITOR: `true` every one, an array of data column indices, or `(colIdx, row, rowIdx) => boolean`. F2, Enter, a double-click or a printable key (which the editor starts with) opens it on the cursor cell; in it Enter commits and moves down, Tab commits and moves right, Escape restores the cell and calls nothing, and the focus leaving commits. While it is open a `render()` (a `setData` included) waits, and runs when it closes; its row leaving the virtual window commits it. An editor with no `getValue` (a factory's `{el}` around an element that is not an input, select or textarea) has no value to commit: Enter and Tab do nothing, the focus leaving does nothing, and its row leaving the window CANCELS it — it calls `commit(value)` itself.
 * @property {Object} [editors] - `{[colIdx|type]: factory}`, the editor for a column (by index first, then by its type: `columnTypes`' or the detected 'num'/'text'). A factory is `({value, row, rowIdx, colIdx, column: {index, header, type}, initialText, commit(value), cancel()}) => Element | {el, getValue?, focus?, destroy?}`; an input, select or textarea returned as it is commits its `value`. Absent: a text box (cell_editor_host.js `createTextEditor`), which commits the value unchanged when left as it was.
 * @property {Function} [onCellCommit] - `({rowIdx, colIdx, value, previous}) => void | {ok, error?} | Promise<…>`, once per commit (not for a value left as the cell showed it; `previous` is the value the row holds). Resolving `{ok: false, error}`, rejecting or throwing leaves the typed value in the cell drawn `twm-dt-cell--error` with the message as its `title` and `data-error`; until it settles the cell is `twm-dt-cell--pending`. Otherwise the value is written into the row the table holds for `rowIdx` when it settles (`rows[rowIdx][colIdx]`) and drawn. Committing a refused cell back to the row's value clears the mark without a call. New rows (`setData({rows})`) drop the marks.
 * @property {Function} [onCellSelectionChange] - `(getCellSelection()) => void`, after every change of the cells selected.
 * @property {Function} [headerMenu] - `(colIdx, {colIdx, header, hiddenColumns, table}) => items`, asked on a right-click on a data column's header (or its filter cell). The items (`{label, action, icon?, disabled?, danger?, title?}` or `{separator: true}`) open the table's menu; with `columnChooser` the chooser's items follow behind a separator. `[]` or `null` shows what would show without the hook: the chooser, or the page's own menu.
 * @property {Function} [onHeaderMenuAction] - `(action, colIdx) => void`, when one of `headerMenu`'s items is chosen; the menu is hidden first.
 *
 * ── STORY-0088, off unless asked for ──────────────────────────────────────
 * @property {boolean} [staged=false] - With `editable` (a warning, and ignored, without it): an editor's commit is STAGED instead of sent to `onCellCommit` (staged_edits.js). A staged cell shows its value drawn `twm-dt-cell--staged`; staging the value its row holds is no change. On the focused table Ctrl+Z takes the last staged edit back and Ctrl+Y (or Ctrl+Shift+Z) puts it back — a cell staged as `null` undoes to no change, not to a staged null. `commit()` sends every staged cell to `onCommit` at once; `discard()` drops them. While any cell is staged the sort, the filters and the pages are FROZEN: their controls are disabled with the reason on them (`data-refusal`, `title`), and `sortBy`, `setFilter`, `clearFilters`, `goToPage`, `goToRow` and the paging calls refuse with a console warning. New rows (`setData({rows})`) drop the staged cells and the ring.
 * @property {number} [historyLimit=100] - With `staged`: the undo ring keeps this many entries (each a before/after delta of one cell); the oldest fall off.
 * @property {Function} [onCommit] - With `staged`: `({edits}) => void | {ok?, error?, errors?} | Promise<…>`, called once by `commit()` with every staged cell as `{rowIdx, colIdx, value, previous}` (by row, then column; `previous` is the value the row holds). Resolving `{errors: [{rowIdx, colIdx, error}]}` (non-empty) marks each of those cells `twm-dt-cell--error` with the message as its `title` and `data-error`, and every staged value stays; `{ok: false, error}`, a rejection or a throw marks every staged cell with the message. Anything else is success: the values are written into the rows the table holds, and the staged cells and the ring are cleared. While it is out no editor opens and Ctrl+Z, Ctrl+Y and `discard()` do nothing.
 * @property {Function} [onStagedChange] - With `staged`: `({count, canUndo, canRedo, committing}) => void` after every change of the staged cells.
 * @property {string|Function} [stagedRefusal] - With `staged`: the reason a frozen control carries, or `(count) => string`. Absent: "Sorting, filtering and paging are held while N changes are not committed. Commit or discard them first."
 */

/** C10. When the scroll box has no layout — mounted hidden, or a DOM with no
 *  layout engine — there is no viewport to measure, so the window is sized as if
 *  it were this tall. A ResizeObserver corrects it the moment a real size exists. */
const VIRTUAL_FALLBACK_VIEWPORT_PX = 1000;

/** The copy menu's two items — the whole right-click menu of a table without
 *  `contextMenuItems`, and its tail with them (STORY-0010). */
const COPY_MENU_HTML = `
            <div class="twm-context-menu-item" data-action="copy-tsv">
                <span class="material-symbols-outlined">content_copy</span>
                <span class="label">Copy Row(s)</span>
            </div>
            <div class="twm-context-menu-item" data-action="copy-csv">
                <span class="material-symbols-outlined">table</span>
                <span class="label">Copy as CSV</span>
            </div>
        `;

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
            exportFilename: null,
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
            // Off unless asked for — see the typedef. With it the old pager is
            // not drawn: the paging strip says the same and more.
            paging: null,
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
            diff: null,
            scrollLock: null,
            rowIcon: null,
            emptyState: undefined,
            nullDisplay: null,
            columnTypes: null,
            sortValue: null,
            dateFormat: null,
            dateTimeFormat: null,
            durationFormat: null,
            dateTimeZone: 'local',
            // 0.7.0. Off — or exactly the 0.6 behaviour — until set. The
            // typedef says what each does.
            rowDetail: null,
            hasRowDetail: null,
            expandedRows: null,
            onRowDetailToggle: null,
            rowDetailLabel: 'Details',
            dataSource: null,
            onLoad: null,
            onLoadError: null,
            hasMore: undefined,
            pagerLabels: null,
            pagerPosition: 'top',
            maxJumpOffset: null,
            follow: false,
            onFollowChange: null,
            keepWhileDetached: false,
            filterKinds: null,
            onFilterChange: null,
            // STORY-0010. Off — or exactly the 0.9.1 behaviour — until set. The
            // typedef says what each does.
            contextMenuItems: null,
            onContextMenuAction: null,
            onRender: null,
            keyboardNav: false,
            onRowKeyDown: null,
            persistPage: false,
            // STORY-0012. Off — every column drawn, as in 0.9.1 — until set.
            hiddenColumns: null,
            columnChooser: false,
            onColumnsChange: null,
            // STORY-0086. Off — columns in their natural order, as in 0.16.
            reorderable: false,
            columnOrder: null,
            // STORY-0016. Off — no select column, as in 0.11 — until set.
            selectToggle: false,
            selectMode: false,
            onSelectModeChange: null,
            // STORY-0003. Off — rows selected as in 0.16, no editing — until
            // set. The typedef says what each does.
            selectionMode: 'rows',
            editable: false,
            editors: null,
            onCellCommit: null,
            onCellSelectionChange: null,
            headerMenu: null,
            onHeaderMenuAction: null,
            // STORY-0088. Off — commits go to onCellCommit — until set.
            staged: false,
            historyLimit: 100,
            onCommit: null,
            onStagedChange: null,
            stagedRefusal: null,
            ...config,
        };

        // STORY-0003. Cell mode is the table's for its whole life. The row
        // modes it replaces are ignored beside it, out loud.
        this._cellGrid = null;
        if (this.config.selectionMode === 'cells') {
            const clash = ['selectToggle', 'selectMode', 'keyboardNav'].filter((k) => !!this.config[k]);
            if (clash.length) {
                console.warn(`[DataTable] ${clash.join('/')} cannot be combined with selectionMode: 'cells'; ignored.`);
                for (const k of clash) this.config[k] = false;
            }
            this._cellGrid = new CellGrid(this);
        } else if (this.config.editable) {
            console.warn("[DataTable] `editable` needs selectionMode: 'cells'; ignored.");
        }
        if (this.config.staged && !this._cellGrid) {
            console.warn('[DataTable] `staged` needs `editable`; ignored.');
        }

        // STORY-0016. The select column is drawn for the table's whole life or
        // not at all, so the drawn column indices (and the widths kept by them)
        // never move when the mode flips.
        {
            const sel = this.config.selectable;
            const asked = !!this.config.selectToggle || !!this.config.selectMode;
            this._gutter = asked && !!sel && sel !== 'single';
            if (asked && !this._gutter) {
                console.warn('[DataTable] selectToggle/selectMode need a multi-row `selectable`; ignored.');
            }
            this._selecting = this._gutter && !!this.config.selectMode;
        }

        // 0.7.0. Open details (by key), the server's half, follow, and the
        // filter controls that are not text boxes.
        this._expanded = new Set((this.config.expandedRows || []).map((k) => String(k)));
        this._detailHeights = new Map();
        this._source = null;
        this._following = !!this.config.follow && !!this.config.dataSource;
        this._followTimer = null;
        this._newKeys = null;
        this._filterControls = new Map();
        this._filterCounts = new Map();
        this._pendingFilter = null;

        // STORY-0012. The columns not drawn, by data index. Before the restore
        // below, which may replace them with the remembered set.
        this._hidden = new Set();
        this._setHidden(this.config.hiddenColumns);
        // STORY-0086. The order asked for (null: natural), before the restore
        // below, which may replace it with the remembered one.
        this._order = null;
        if (!this._setOrder(this.config.columnOrder)) {
            console.warn('[DataTable] columnOrder is not an order of the columns; ignored.');
        }
        this._reorder = this.config.reorderable ? new ColumnReorder(this) : null;

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
        // STORY-0010. The right-click the custom items on show were built for,
        // read again when one is chosen.
        this._contextMenuCtx = null;
        // STORY-0010 `keyboardNav`: the row the arrows last moved to.
        this._navCursor = null;
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
        // 0.5.0. `onRowActivate`'s listeners are kept apart from `_disposers`:
        // a render does not remove them at once (see `_retireActivation`).
        this._activationOffs = [];

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
        // STORY-0012. The columns shown, before the widths: the widths are by
        // DRAWN column, and were saved for this set.
        if (Array.isArray(blob.hidden)) {
            this._setHidden(blob.hidden);
            applied = true;
        }
        // STORY-0086. The order, before the widths for the same reason. One
        // saved for a different number of columns is no order of these.
        if (Array.isArray(blob.order) && this._setOrder(blob.order)) {
            applied = true;
        }
        if (blob.colWidths && typeof blob.colWidths === 'object') {
            // Stored under string keys (JSON) → coerce back to ints.
            this._colWidths = {};
            // STORY-0016. Widths are by drawn column; a blob saved before this
            // table drew its select column (or a consumer's seed) has none.
            const shift = this._lead().select - (Number(blob.colWidthsLead) || 0);
            for (const [k, v] of Object.entries(blob.colWidths)) {
                const i = Number(k) + shift;
                if (i >= this._lead().select) this._colWidths[i] = v;
            }
            // Stamp the matching signature so the next render keeps these
            // widths instead of treating them as stale.
            this._colWidthsSig = this._colSig();
            applied = true;
        }
        // STORY-0010 `persistPage`. The page you were on — only when asked for:
        // page 3 of one search is not a place in the next. Clamped by the first
        // render that has rows, since they may have shrunk since it was saved.
        if (this.config.persistPage && Number.isInteger(blob.offset) && blob.offset >= 0) {
            this._state.offset = blob.offset;
            this._clampRestoredPage = true;
            applied = true;
        }
        return applied;
    }

    /** Identity of the current column set — restored widths/sort are
     *  keyed by position, so a schema change invalidates them. */
    _colSig() {
        return (this.config.headers || []).join('\x01')
            + (this.config.showRowNumbers ? '|#' : '')
            // STORY-0012. Widths are by drawn column, so a different set drawn
            // is a different schema — unless `setColumnVisible` carried them.
            + (this._hidden?.size ? `|-${this.getHiddenColumns().join(',')}` : '')
            // STORY-0086. And a different order — unless `moveColumn` carried them.
            + (this._columnOrder() ? `|>${this._columnOrder().join(',')}` : '');
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
            // STORY-0016. Where the widths start, so a blob read by a table
            // with or without the select column lands on the same columns.
            ...(this._gutter ? { colWidthsLead: 1 } : {}),
            // STORY-0010. Only for a table that asked: one that did not writes
            // the 0.9.1 blob, key for key.
            ...(this.config.persistPage ? { offset: this._state.offset } : {}),
            // STORY-0012. Only for a table that hides columns or lets them be
            // hidden.
            ...(this._columnsOn() ? { hidden: this.getHiddenColumns() } : {}),
            // STORY-0086. Only for a table that orders its columns.
            ...(this._orderOn() ? { order: this.getColumnOrder() } : {}),
        });
    }

    // ─────────────────────────────────────────────────────────────────
    // STORY-0012 — columns shown and hidden
    // ─────────────────────────────────────────────────────────────────

    /** Whether this table hides columns at all (and so saves the set). */
    _columnsOn() {
        return Array.isArray(this.config.hiddenColumns) || !!this.config.columnChooser
            || !!this._columnsTouched;
    }

    /** Replace the hidden set: whole indices of existing columns, and never
     *  every column — the first one stays when nothing else would. A table
     *  with no headers yet keeps the set for the headers `setData` brings. */
    _setHidden(list) {
        const n = (this.config.headers || []).length;
        this._hidden = new Set((Array.isArray(list) ? list : [])
            .map(Number).filter((c) => Number.isInteger(c) && c >= 0 && (!n || c < n)));
        if (n && this._hidden.size >= n) this._hidden.delete(0);
    }

    _isHidden(colIdx) {
        return this._hidden.has(colIdx);
    }

    /** The cells a drawn row has: the shown columns, and the row number. */
    _domColCount() {
        const n = Math.max(0, (this.config.headers?.length || 0) - this._hidden.size);
        return n + this._lead().all;
    }

    /** STORY-0016. The drawn columns in front of the data: the select column
     *  (`select`, 0 or 1, always first) and the row number. */
    _lead() {
        const select = this._gutter ? 1 : 0;
        return { select, all: select + (this.config.showRowNumbers ? 1 : 0) };
    }

    /** The data columns drawn, in the order drawn (STORY-0086): the order
     *  without the hidden ones. */
    _shownColumns() {
        return this._rowColumns(this.config.headers?.length || 0);
    }

    /** The data indices of a row of `count` cells to draw, in order: the
     *  shown columns, and any cell past the headers after them. */
    _rowColumns(count) {
        return cellOrder(this._columnOrder(), count).filter((c) => !this._isHidden(c));
    }

    /** A data column's drawn index (row number included), or -1 when hidden. */
    _domIdxOf(colIdx) {
        const at = this._shownColumns().indexOf(colIdx);
        return at < 0 ? -1 : this._lead().all + at;
    }

    /** A drawn cell's data column, or null for the row number. */
    _dataIdxOfDom(domIdx) {
        const i = domIdx - this._lead().all;
        if (i < 0) return null;
        return this._shownColumns()[i] ?? null;
    }

    /** The columns not drawn, by data index, ascending. */
    getHiddenColumns() {
        return [...(this._hidden || [])].sort((a, b) => a - b);
    }

    /**
     * Show (`on` true) or hide a column. The last column shown is not hidden.
     * The widths of the other columns stay as they were; a column shown again
     * is measured. Saved under `persistKey`, and `onColumnsChange` is told.
     *
     * @param {number} colIdx
     * @param {boolean} [on=true]
     * @returns {boolean} whether the set changed
     */
    setColumnVisible(colIdx, on = true) {
        const n = this.config.headers?.length || 0;
        if (!Number.isInteger(colIdx) || colIdx < 0 || colIdx >= n) return false;
        if (!!on === !this._isHidden(colIdx)) return false;
        if (!on && n - this._hidden.size <= 1) return false;
        this._columnsTouched = true;
        const next = new Set(this._hidden);
        if (on) next.delete(colIdx); else next.add(colIdx);
        this._applyHidden(next);
        return true;
    }

    /** Swap in a new hidden set, carrying the drawn widths of the columns
     *  that stay drawn to their new places, and tell whoever listens. */
    _applyHidden(next) {
        const before = this.getHiddenColumns();
        this._carryWidths(() => this._setHidden([...next]));
        const after = this.getHiddenColumns();
        if (before.join() === after.join()) return;
        this._savePersisted();
        if (this._wrapperEl) this.render();
        this._columnsChanged();
    }

    /** STORY-0012/0086. Run `change` (a new hidden set or order), carrying
     *  the drawn widths of the columns drawn before and after to their new
     *  places. */
    _carryWidths(change) {
        const n = this.config.headers?.length || 0;
        const old = this._colWidths;
        const kept = this._colWidthsSig === this._colSig();
        const domBefore = [];
        for (let c = 0; c < n; c++) domBefore[c] = this._domIdxOf(c);
        change();
        if (kept) {
            const widths = {};
            for (let i = 0; i < this._lead().all; i++) if (old[i] != null) widths[i] = old[i];
            for (let c = 0; c < n; c++) {
                const from = domBefore[c];
                const to = this._domIdxOf(c);
                if (from >= 0 && to >= 0 && old[from] != null) widths[to] = old[from];
            }
            this._colWidths = widths;
            this._colWidthsSig = this._colSig();
        }
    }

    /** `onColumnsChange(hidden, {hidden, order})`, after a change of either. */
    _columnsChanged() {
        const hidden = this.getHiddenColumns();
        try { this.config.onColumnsChange?.(hidden, { hidden, order: this.getColumnOrder() }); } catch (err) {
            console.error('[DataTable] onColumnsChange threw', err);
        }
    }

    // ─────────────────────────────────────────────────────────────────
    // STORY-0086 — the order the columns are drawn in (column_order.js)
    // ─────────────────────────────────────────────────────────────────

    /** Whether this table orders its columns at all (and so saves the order). */
    _orderOn() {
        return !!this.config.reorderable || Array.isArray(this.config.columnOrder) || !!this._orderTouched;
    }

    /** Take `list` as the order. Refused (false, nothing changed) when it is
     *  no permutation of the columns; a table with no headers yet keeps it
     *  for the headers `setData` brings, and `_columnOrder` checks it then. */
    _setOrder(list) {
        if (list == null) { this._order = null; return true; }
        const n = this.config.headers?.length || 0;
        if (!Array.isArray(list) || (n && !isColumnOrder(list, n))) return false;
        this._order = list.map(Number);
        return true;
    }

    /** The order in force, or null for the natural one (none asked for, or
     *  one that does not fit today's columns). */
    _columnOrder() {
        const n = this.config.headers?.length || 0;
        return this._order && isColumnOrder(this._order, n) ? this._order : null;
    }

    /**
     * Every data column's index, hidden ones included, in the order drawn.
     * @returns {number[]}
     */
    getColumnOrder() {
        return (this._columnOrder() || naturalOrder(this.config.headers?.length || 0)).slice();
    }

    /**
     * Move the column at position `from` of `getColumnOrder()` to position
     * `to`, the others closing up behind it: from the natural order,
     * `moveColumn(3, 1)` draws 0, 3, 1, 2. The widths stay with their columns.
     * Saved under `persistKey`, and `onColumnsChange` is told.
     *
     * @param {number} from
     * @param {number} to
     * @returns {boolean} whether the order changed
     */
    moveColumn(from, to) {
        const order = this.getColumnOrder();
        const n = order.length;
        if (![from, to].every((i) => Number.isInteger(i) && i >= 0 && i < n) || from === to) return false;
        this._applyOrder(moveInOrder(order, from, to));
        return true;
    }

    /** Swap in a new order (a permutation, or null), widths carried, and
     *  tell whoever listens. */
    _applyOrder(next) {
        const before = this.getColumnOrder().join();
        this._orderTouched = true;
        this._carryWidths(() => this._setOrder(next));
        if (this.getColumnOrder().join() === before) return;
        this._savePersisted();
        if (this._wrapperEl) this.render();
        this._columnsChanged();
    }

    /** `columnChooser`'s items: one checkable item a column. */
    _columnChooserItems() {
        const headers = this.config.headers || [];
        const lastShown = headers.length - this._hidden.size <= 1;
        return headers.map((h, c) => {
            const shown = !this._isHidden(c);
            return {
                label: String(h ?? ''),
                icon: shown ? 'check' : '',
                checked: shown,
                disabled: shown && lastShown,
                title: shown && lastShown ? 'The last column shown cannot be hidden' : '',
                onChoose: () => this.setColumnVisible(c, !shown),
            };
        });
    }

    /**
     * STORY-0003. The header's right-click menu for a press on `target`: the
     * consumer's `headerMenu` items for the data column under it, then — with
     * `columnChooser` — the chooser's items behind a separator. Empty when
     * there is nothing to show.
     */
    _headerMenuItems(target) {
        const items = [];
        const hook = this.config.headerMenu;
        const colIdx = this._headerColumnAt(target);
        if (typeof hook === 'function' && colIdx !== null) {
            let asked = null;
            try {
                asked = hook(colIdx, {
                    colIdx,
                    header: this.config.headers?.[colIdx],
                    hiddenColumns: this.getHiddenColumns(),
                    table: this,
                });
            } catch (err) {
                console.error('[DataTable] headerMenu threw', err);
            }
            for (const item of Array.isArray(asked) ? asked.filter(Boolean) : []) {
                if (item.separator) { items.push({ separator: true }); continue; }
                items.push({
                    ...item,
                    onChoose: () => {
                        try { this.config.onHeaderMenuAction?.(item.action, colIdx); } catch (err) {
                            console.error('[DataTable] onHeaderMenuAction threw', err);
                        }
                    },
                });
            }
        }
        // STORY-0086. Move left / Move right, for the data column under it.
        if (this._reorder && colIdx !== null) {
            const moves = this._reorder.menuItems(colIdx);
            if (moves.length && items.length) items.push({ separator: true });
            items.push(...moves);
        }
        if (this.config.columnChooser) {
            if (items.length) items.push({ separator: true });
            items.push(...this._columnChooserItems());
        }
        return items;
    }

    /** The data column of a header cell (the header row, or the filter row
     *  under it), or null off one — the row number, the select column. */
    _headerColumnAt(target) {
        const cell = target?.closest?.('th, td');
        const tr = cell?.parentNode;
        if (!tr || tr.parentNode?.tagName !== 'THEAD') return null;
        if (tr.children.length !== this._domColCount()) return null;
        return this._dataIdxOfDom(Array.prototype.indexOf.call(tr.children, cell));
    }

    /** STORY-0010 `persistPage`: the client page changed, so save it. */
    _savePage() {
        if (this.config.persistPage) this._savePersisted();
    }

    /**
     * Update data and re-render
     * @param {Object} updates - Partial config updates (headers, rows, etc.)
     */
    setData(updates) {
        // STORY-0016. In select mode, ticks are kept by `getRowKey` across new
        // rows (read before they are replaced): a list refreshed under somebody halfway through ticking twenty
        // rows must not throw them away. Only in the mode; elsewhere new rows
        // are an answer, as before.
        const keepTicks = updates.rows && this._selecting && typeof this.config.getRowKey === 'function'
            && this._state.selected.size
            ? new Set(this.getSelection().map((i) => this._rowKey(this.config.rows[i], i)).filter((k) => k !== null))
            : null;
        // Clear filters if headers changed
        if (updates.headers && this._state.filters.size > 0) {
            const oldHeaders = this.config.headers;
            const newHeaders = updates.headers;
            if (oldHeaders.length !== newHeaders.length ||
                oldHeaders.some((h, i) => h !== newHeaders[i])) {
                this._state.filters.clear();
            }
        }
        // 0.7.0. A filter control belongs to a column; new columns, new
        // controls (and no counts carried onto a column they did not count).
        if (updates.headers && (this._filterControls.size || this._filterCounts.size)) {
            const oldHeaders = this.config.headers;
            const newHeaders = updates.headers;
            if (oldHeaders.length !== newHeaders.length
                || oldHeaders.some((h, i) => h !== newHeaders[i])) {
                this._destroyFilterControls();
                this._filterCounts.clear();
            }
        }
        if (Object.prototype.hasOwnProperty.call(updates, 'filterKinds')) {
            this._destroyFilterControls();
        }

        Object.assign(this.config, updates);

        // STORY-0012. A new set asked for applies at once; new columns keep
        // the set by position, minus any column that is gone.
        if (Object.prototype.hasOwnProperty.call(updates, 'hiddenColumns')) {
            const before = this.getHiddenColumns().join();
            this._setHidden(updates.hiddenColumns);
            if (this.getHiddenColumns().join() !== before) {
                this._savePersisted();
                this._columnsChanged();
            }
        } else if (updates.headers && this._hidden.size) {
            this._setHidden([...this._hidden]);
        }
        // STORY-0086. A new order asked for applies at once (refused, with a
        // warning, when it is no order of the columns); new headers keep the
        // order while it still fits them.
        if (Object.prototype.hasOwnProperty.call(updates, 'columnOrder')) {
            const before = this.getColumnOrder().join();
            if (!this._setOrder(updates.columnOrder)) {
                console.warn('[DataTable] columnOrder is not an order of the columns; ignored.');
            } else if (this.getColumnOrder().join() !== before) {
                this._savePersisted();
                this._columnsChanged();
            }
        }

        // Reset state if rows changed
        if (updates.rows) {
            this._state.selected.clear();
            this._state.anchorIndex = null;
            this._cellGrid?.newRows();
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
        // 0.5.0. A new `columnTypes` list (null included) applies at once. A new
        // `getColumnType` alone does NOT re-detect: in 0.4 it took effect with
        // the next rows, and a table that asks for nothing new keeps that.
        if (Object.prototype.hasOwnProperty.call(updates, 'columnTypes') && !updates.rows) {
            this._columnTypes = this._detectColumnTypes();
        }

        // STORY-0016. The ticks, found again in the new rows by key.
        if (keepTicks) {
            (this.config.rows || []).forEach((r, i) => {
                if (keepTicks.has(this._rowKey(r, i))) this._state.selected.add(i);
            });
        }

        // Invalidate processed cache
        this._processedRows = null;
        this._processedIndexMap = null;

        this.render();
        if (keepTicks) this._notifySelectionChange();
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
        // stay quiet while there is nothing YET (see the CSS) — and ONLY for a
        // table with an `emptyState`, the one thing that reads it: a table that
        // asks for nothing new keeps 0.4's wrapper to the attribute.
        this._wrapperEl.classList.toggle('twm-data-table-component--loading',
                                         !!on && (this.config.emptyState !== undefined
                                                  || !!this.config.dataSource));
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
        // STORY-0003. In cell mode, the cells of those rows: one range from the
        // first of them to the last, as shown, across every column shown.
        if (this._cellGrid) {
            this._cellGrid.selectRows(indices);
            return;
        }
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
        if (this._cellGrid) {
            this._cellGrid.clear();
            return;
        }
        this._state.selected.clear();
        this._state.anchorIndex = null;
        this._updateRowSelection();
        this._notifySelectionChange();
    }

    // ─────────────────────────────────────────────────────────────────
    // STORY-0003 — cell mode (`selectionMode: 'cells'`), see cell_grid.js
    // ─────────────────────────────────────────────────────────────────

    /**
     * The cell selection: `{anchor, focus, range}`. `anchor` and `focus` (the
     * cursor) are `{row, col, rowIdx}` — `row` the position in the order
     * shown, `col` the data column, `rowIdx` the original row index — and
     * `range` is `{top, bottom, left, right, rows, columns}`: positions,
     * data columns at its edges, and the original row indices and data
     * columns it covers. All null with nothing selected. Null outside cell
     * mode.
     */
    getCellSelection() {
        return this._cellGrid ? this._cellGrid.get() : null;
    }

    /**
     * Put the cursor on a cell (`row` a position in the order shown, `col` a
     * data column) — with `anchor`, select the range from there. `null`
     * clears. The row is brought into view. A no-op outside cell mode.
     *
     * @param {{row:number, col:number}|null} focus
     * @param {{row:number, col:number}} [anchor]
     */
    setCellSelection(focus, anchor = null) {
        this._cellGrid?.set(focus, anchor);
    }

    /** Open the editor on a cell (position, data column), as F2 would.
     *  Returns whether one opened. */
    editCell(row, col) {
        return !!this._cellGrid?.open(row, col);
    }

    /** Whether a cell editor is open. */
    isEditing() {
        return !!this._cellGrid?.isEditing();
    }

    // ── STORY-0088 `staged` ──────────────────────────────────────────────

    /**
     * Send every staged cell to `onCommit({edits})`, in one call. Resolves
     * `{ok: true, committed}` (the staged cells and the undo ring are
     * cleared), or `{ok: false, errors}` (the cells refused are marked and
     * every staged value stays). An open editor's value is staged first.
     * Without `staged`, resolves `{ok: false, errors: []}`.
     *
     * @returns {Promise<{ok: boolean, committed?: number, errors?: Array<{rowIdx:number, colIdx:number, error:string}>}>}
     */
    commit() {
        const st = this._cellGrid?.staged;
        return st ? st.commit() : Promise.resolve({ ok: false, errors: [] });
    }

    /** Drop every staged cell, its marks and the undo ring. Returns whether
     *  there was anything to drop. */
    discard() {
        return !!this._cellGrid?.staged?.discard();
    }

    /** Take the last staged edit back (Ctrl+Z). Returns whether it moved. */
    undo() {
        return !!this._cellGrid?.staged?.undo();
    }

    /** Put the last edit taken back back again (Ctrl+Y). */
    redo() {
        return !!this._cellGrid?.staged?.redo();
    }

    /** Every staged cell, `{rowIdx, colIdx, value, previous}`, by row then
     *  column. Empty without `staged`. */
    getStagedEdits() {
        return this._cellGrid?.staged ? this._cellGrid.staged.edits() : [];
    }

    /** Why sort, filters and pages are held — a staged edit — or null; with
     *  a reason, `what` is refused out loud. */
    _stagedRefusal(what) {
        const why = this._cellGrid?.staged?.freezeReason() || null;
        if (why) console.warn(`[DataTable] ${what} refused: ${why}`);
        return why;
    }

    /**
     * Go to specific page
     * @param {number} page - Page number (0-indexed)
     */
    goToPage(page) {
        if (this._stagedRefusal('goToPage')) return;
        // 0.7.0 `dataSource`: the page is the SOURCE's — asked for, and drawn
        // when it answers (the promise). Past a known total, the last page.
        // (The release review: this set an offset nothing under a data source
        // reads, and drew the same page again.)
        if (this.config.dataSource) {
            const size = this._sourcePageSize();
            let p = Math.max(0, Math.floor(Number(page)) || 0);
            const total = this._source?.total;
            if (typeof total === 'number') p = Math.min(p, Math.max(0, Math.ceil(total / size) - 1));
            return this._sourceGoTo(p * size);
        }
        const rowCount = this._getProcessedRows().length;
        const maxPage = Math.ceil(rowCount / this.config.pageSize) - 1;
        this._state.offset = Math.max(0, Math.min(page, maxPage)) * this.config.pageSize;
        this._savePage();
        this.render();
    }

    /**
     * Go to specific row
     * @param {number} rowIndex - Row index
     */
    goToRow(rowIndex) {
        if (this._stagedRefusal('goToRow')) return;
        // 0.7.0 `dataSource`: the page that holds the row, from the source.
        if (this.config.dataSource) {
            const size = this._sourcePageSize();
            return this.goToPage(Math.floor(Math.max(0, Math.floor(Number(rowIndex)) || 0) / size));
        }
        const rowCount = this._getProcessedRows().length;
        const idx = Math.max(0, Math.min(rowIndex, rowCount - 1));
        this._state.offset = Math.floor(idx / this.config.pageSize) * this.config.pageSize;
        this._savePage();
        this.render();
    }

    /**
     * Sort by column
     * @param {number} colIndex - Column index
     * @param {boolean} [ascending] - Sort direction (toggles if same column)
     */
    sortBy(colIndex, ascending) {
        if (this._stagedRefusal('sortBy')) return;
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
        // 0.7.0 `dataSource`: a new order is a new question, from its first
        // page. Drawn first (the arrow moves at once), asked after.
        if (this.config.dataSource) this._sourceLoad({ offset: 0, reason: 'sort' });
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
        if (this._stagedRefusal('clearFilters')) return;
        this._state.filters.clear();
        this._processedRows = null;
        this._processedIndexMap = null;
        this._state.offset = 0;
        this._pendingFilter = null;
        this._savePersisted();
        // 0.7.0. Each control shows "no filter", and whoever listens hears it.
        for (const { control } of this._filterControls.values()) {
            try { control.setValue?.(null); } catch (err) { console.error('[DataTable] filter control setValue threw', err); }
        }
        this._notifyFilterChange();
        if (this.config.dataSource) {
            if (this._wrapperEl) this.render();
            this._sourceLoad({ offset: 0, reason: 'filter' });
            return;
        }
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
     * STORY-0010. Give the table the keyboard focus (the body, where the arrow
     * keys and `onRowKeyDown` listen) without scrolling the page. False when
     * there is nothing drawn to focus.
     * @returns {boolean}
     */
    focus() {
        if (!this._tableEl) return false;
        try { this._tableEl.focus({ preventScroll: true }); } catch (_) { return false; }
        return true;
    }

    /** STORY-0010 `keyboardNav`: the original indices of the page shown, in
     *  the order shown — every row held, when the page is a server's or there
     *  are no pages. */
    _pageOrder() {
        this._getProcessedRows();
        const order = this._processedIndexMap || [];
        if (this._isServerSide() || !this.config.pagination || this._pagingConfig()) return order;
        return order.slice(this._state.offset, this._state.offset + this.config.pageSize);
    }

    /**
     * STORY-0010. The rows the table shows, as row arrays, in the order shown:
     * filtered and sorted, across EVERY page — not only the one on screen. With
     * server-side paging (`onPageChange`, `dataSource`) they are the page the
     * consumer or the source gave, which is all the table holds. A copy:
     * changing it changes nothing in the table.
     * @returns {Array<Array>}
     */
    getDisplayedRows() {
        return this._getProcessedRows().slice();
    }

    /**
     * Render the table
     */
    render() {
        // STORY-0003. An open cell editor is not torn down by a redraw: the
        // render waits for its commit or cancel, and runs then.
        if (this._cellGrid?.isEditing()) {
            this._cellGrid.renderWaiting = true;
            return;
        }
        // Capture active filter input before re-render
        const activeFilterColIdx = this._getActiveFilterColIdx();
        // KEYBOARD FOCUS SURVIVES A RE-RENDER. Rendering replaces the table
        // element, and a focused element that is removed hands focus to the
        // page body, where the arrow keys reach nobody. A data refresh does
        // exactly that (a record changed on disk, a live reload), so keyboard
        // navigation silently died the first time the store moved.
        const doc = this.container.ownerDocument;
        const hadTableFocus = !!this._tableEl && doc?.activeElement === this._tableEl;
        // 0.7.0. Focus inside a filter control (it is kept and re-appended,
        // which a move would blur) or on a row's detail toggle (rebuilt): put
        // back after the render. And a filter still being typed under
        // `dataSource` — an answer arriving mid-word re-renders the row.
        const focus070 = this._captureFocus070(doc);
        const pendingFilter = this.config.dataSource ? this._pendingFilter : null;
        // SCROLL POSITION SURVIVES A RE-RENDER, for the same reason: the scroll
        // box is rebuilt too, and a new one starts at the top. Folding a tree
        // row, or any refresh, threw a reader scrolled halfway down back to row
        // one. Only on the SAME page — turning the page should start at its top.
        const prevWrap = this._tableWrapEl;
        const prevScroll = prevWrap?.isConnected && this._renderedOffset === this._state.offset
            ? { top: prevWrap.scrollTop, left: prevWrap.scrollLeft } : null;

        this._cleanup();
        this._retireActivation();
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

        // STORY-0010 `persistPage`. A restored page is put on a page boundary,
        // and past the rows (they shrank since it was saved, or a restored
        // filter narrowed them) it is the last page — by the first render that
        // has rows to count, which for a board that sets its rows after it
        // mounts is not the first render.
        if (this._clampRestoredPage && rows.length > 0) {
            this._clampRestoredPage = false;
            if (!this._isServerSide() && !this._pagingConfig()) {
                const size = this.config.pageSize;
                const last = Math.max(0, Math.ceil(this._getProcessedRows().length / size) - 1) * size;
                this._state.offset = Math.min(Math.floor(this._state.offset / size) * size, last);
            }
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
        // strip would be uninformative (single page, no active filter). Not
        // with `paging`, whose own strip (under the body) replaces it.
        // 0.7.0: under `dataSource` an empty page that is not the first still
        // needs it — it is the way back.
        this._paginationEl = null;
        if (pagination && (rows.length > 0 || (this._source?.offset || 0) > 0) && !this._pagingConfig()) {
            this._paginationEl = this._createPagination();
            if (this._paginationEl && this.config.pagerPosition !== 'bottom') {
                this._wrapperEl.appendChild(this._paginationEl);
            }
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

        // 0.7.0. Under `dataSource` the rows ARE the filtered answer, so an
        // empty one must keep the filter row — or a filter that matched nothing
        // could never be cleared. It goes through `_createTable` and gets its
        // empty row there.
        const keepFilterRow = rows.length === 0 && !!this.config.dataSource && this.config.filterable;
        if (rows.length === 0 && !keepFilterRow) {
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
            if (this._gutter) tr.appendChild(this._buildSelectHead());
            if (showRowNumbers) {
                const th = document.createElement('th');
                th.className = 'num';
                th.textContent = '#';
                tr.appendChild(th);
            }
            for (const colIdx of this._shownColumns()) {
                const th = document.createElement('th');
                th.className = this._columnTypes[colIdx] || 'text';
                th.textContent = headers[colIdx];
                tr.appendChild(th);
            }
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
            tbody.appendChild(this._buildEmptyRow(this._domColCount(), emptyMessage));
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
            // 0.7.0 `keepFilterRow`: the header and its filters, then the
            // empty (or failed) row the other branch would have drawn.
            if (keepFilterRow && this._tbodyEl) {
                this._tbodyEl.appendChild(this._buildEmptyRow(this._domColCount(), emptyMessage));
            }
            tableWrap.appendChild(fullTable);
            this._wrapperEl.appendChild(tableWrap);
        }

        this._tableWrapEl = tableWrap;
        // STORY-0012 `columnChooser` and STORY-0003 `headerMenu`: the header's
        // right-click. With neither item to show, the page's own menu.
        if ((this.config.columnChooser || typeof this.config.headerMenu === 'function' || this._reorder)
            && this._headerTableEl) {
            const head = this._headerTableEl;
            const onHeadMenu = (ev) => {
                const items = this._headerMenuItems(ev.target);
                if (!items.length) return;
                ev.preventDefault();
                ev.stopPropagation();
                setTimeout(() => this._showContextMenu(ev.clientX, ev.clientY,
                                                       { ctx: null, items, copy: false }), 0);
            };
            head.addEventListener('contextmenu', onHeadMenu);
            this._disposers.push(() => head.removeEventListener('contextmenu', onHeadMenu));
        }
        // STORY-0086 `reorderable`: the header's drag.
        if (this._reorder && this._headerTableEl) {
            this._reorder.install(this._headerTableEl.querySelector('thead > tr'));
        }
        // 0.7.0 `pagerPosition: 'bottom'`: under the rows.
        if (this._paginationEl && this.config.pagerPosition === 'bottom') {
            this._paginationEl.classList.add('twm-pagination-controls--bottom');
            this._paginationEl.style.borderBottom = '0';
            this._paginationEl.style.borderTop = '1px solid #2a2a2a';
            this._wrapperEl.appendChild(this._paginationEl);
        }
        // `paging`: the strip goes UNDER the body, where the reader's eye is
        // when they reach the end of what is held.
        this._pagingEl = null;
        if (this._pagingConfig()) {
            this._pagingEl = this._createPagingStrip();
            if (this._pagingEl) this._wrapperEl.appendChild(this._pagingEl);
        }
        this.container.appendChild(this._wrapperEl);
        // 0.6.1 `scrollLock`: THIS render's body box joins the group, and leaves
        // it with the next render's cleanup or the dispose.
        if (this.config.scrollLock && typeof this.config.scrollLock.attach === 'function') {
            this._disposers.push(this.config.scrollLock.attach(tableWrap));
        }
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

        // `paging`, scrolling: ask for the next rows near the end — and once
        // the layout has settled, when the rows held do not fill the box at all,
        // since then nothing can ever be scrolled to ask for them.
        if (this._pagingConfig()) {
            const onScroll = () => this._pagingMaybeLoadMore();
            tableWrap.addEventListener('scroll', onScroll, { passive: true });
            this._disposers.push(() => tableWrap.removeEventListener('scroll', onScroll));
            requestAnimationFrame(() => {
                if (this._tableWrapEl === tableWrap) this._pagingMaybeLoadMore();
            });
        }

        // Sync header column widths to body after layout. Two-pass: the
        // first frame lets the browser settle natural widths from the
        // body's auto layout, then we lock both tables to those widths
        // via table-layout:fixed + explicit cell widths.
        if (this._headerTableEl && this._tableEl) {
            // 0.6.3: and once the widths are fixed the rows may be another
            // height than they were measured at — so the window measures again.
            requestAnimationFrame(() => {
                this._syncHeaderWidths();
                this._virtRemeasure();
            });
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
                                || typeof this.config.onRowActivate === 'function'
                                || typeof this.config.rowDetail === 'function'
                                || typeof this.config.onRowKeyDown === 'function'
                                || this._cellGrid)) {
            this._installInteractions();
        }

        // Restore focus to filter input if it was active
        if (activeFilterColIdx !== null) {
            this._restoreFilterFocus(activeFilterColIdx);
        }
        else if (hadTableFocus && this._tableEl) {
            try { this._tableEl.focus({ preventScroll: true }); } catch (_) { /* detached */ }
        }
        else if (focus070) {
            this._restoreFocus070(focus070);
        }
        // 0.7.0. The words still being typed, and their debounce, which
        // `_cleanup` cleared.
        if (pendingFilter) this._resumePendingFilter(pendingFilter);

        // 0.7.0 `dataSource`: the first render asks for the first page; a
        // render while a request is out keeps the overlay up; following
        // resumes on a table drawn again.
        if (this.config.dataSource) {
            if (!this._source?.started) {
                this._sourceState().started = true;
                Promise.resolve().then(() => this._sourceLoad({ offset: 0, reason: 'initial' }));
            } else if (this._source.inFlight && !this._source.pendingAppend) {
                this.setLoading(true);
            }
            if (this._following && !this._followTimer) this._armFollow();
        }

        // STORY-0010. Last, so the hook reads the table as drawn.
        if (typeof this.config.onRender === 'function') {
            try { this.config.onRender(this); } catch (err) {
                console.error('[DataTable] onRender threw', err);
            }
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
        // STORY-0012. The columns shown — all of them, unless some are hidden —
        // and (STORY-0086) in the order shown.
        const matrix = [this._rowColumns(headers.length).map((c) => headers[c])];

        for (const idx of indices) {
            const row = rows[idx];
            if (row) {
                matrix.push(this._rowColumns(row.length).map((c) => this._formatValue(row[c], c)));
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

        const lines = [this._rowColumns(headers.length).map((c) => headers[c]).join(',')];
        for (const row of rows) {
            lines.push(this._rowColumns(row.length).map((c) =>
                this._csvEscape(this._formatValue(row[c], c))
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
     * Dispose and cleanup. Empties the host, as it always has.
     */
    dispose() {
        this._teardown(true);
    }

    /**
     * 0.5.0 `autoDispose`'s dispose: everything `dispose()` lets go of — but of
     * the host, only the table's OWN wrapper. A table that has been taken out
     * of the page no longer owns its host: in the task before this runs, the
     * consumer may have mounted the next list into it, or written its own
     * message there, and emptying the host would wipe that.
     */
    _disposeOwn() {
        this._teardown(false);
    }

    _teardown(emptyHost) {
        // STORY-0003. An open editor goes, committing nothing.
        this._cellGrid?.dispose();
        autoDisposeUnwatch(this);
        this._autoSeen = false;
        // 0.7.0. A grace still running, the follow timer, a request still out
        // (its answer must not draw into a disposed table), and the filter
        // controls (a picker may hang a menu on the body).
        if (this._autoTimer) { clearTimeout(this._autoTimer); this._autoTimer = null; }
        this._autoPending = false;
        this._disarmFollow();
        if (this._source) {
            this._source.ticket++;
            try { this._source.controller?.abort(); } catch (_) { /* gone */ }
            this._source.controller = null;
            this._source.inFlight = false;
        }
        this._destroyFilterControls();
        this._runOffs(this._activationOffs);
        this._activationOffs = [];
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
        if (emptyHost) this.container.innerHTML = '';
        else this._wrapperEl?.remove();
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

        const isServerSide = this._isServerSide();
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
        // 0.7.0: each column's control rule, asked once rather than per row.
        const matchers = new Map();
        for (const colIdx of filters.keys()) matchers.set(colIdx, this._filterMatcher(colIdx));

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            let pass = true;

            for (const [colIdx, filterText] of filters) {
                if (!filterText) continue;
                const value = row[colIdx];
                // 0.7.0 `filterKinds`: a control that is not a text box decides
                // by its own rule, over a value that need not be text.
                const kindMatch = matchers.get(colIdx);
                if (kindMatch) {
                    if (this._isEmptyFilterValue(filterText)) continue;
                    if (!kindMatch(value, filterText, row)) { pass = false; break; }
                    continue;
                }
                const colType = this._valueKind(colIdx);

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
        const kind = this._valueKind(colIdx);
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

        if (this._gutter) {
            const th = document.createElement('th');
            th.className = 'data-table__filter-cell data-table__filter-cell--empty twm-dt-select-cell';
            tr.appendChild(th);
        }
        if (showRowNumbers) {
            const th = document.createElement('th');
            th.className = 'data-table__filter-cell data-table__filter-cell--empty';
            tr.appendChild(th);
        }

        this._shownColumns().forEach((colIdx) => {
            const header = headers[colIdx];
            const th = document.createElement('th');
            th.className = 'data-table__filter-cell';

            // 0.7.0 `filterKinds`: the consumer's (or the built-in chips')
            // control in place of the text box — the SAME element every render.
            const control = this._filterControlFor(colIdx, header);
            if (control) {
                th.classList.add('data-table__filter-cell--control');
                // The measuring pass keeps a row holding a control (its text
                // boxes stay out): see `_measureNaturalWidths`.
                tr.classList.add('twm-data-table__filter-row--controls');
                th.addEventListener('click', (e) => e.stopPropagation());
                if (control.el) th.appendChild(control.el);
                tr.appendChild(th);
                return;
            }

            const wrapper = document.createElement('div');
            wrapper.className = 'twm-data-table__filter-wrapper';

            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'twm-data-table__filter-input';
            const kind = this._valueKind(colIdx);
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

        const kind = this._valueKind(colIdx);
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
        // 0.7.0. What is waiting, so a render under `dataSource` (an answer
        // arriving mid-word) can put it back — see `_resumePendingFilter`.
        this._pendingFilter = { colIdx, value };
        this._filterDebounceTimer = setTimeout(() => {
            this._pendingFilter = null;
            this._onFilterInput(colIdx, value);
        }, 200);
    }

    _onFilterInput(colIdx, value) {
        if (this._stagedRefusal('A filter')) return;
        // 0.7.0. A filter value need not be text (a control's array, a range),
        // and an empty one of those is no filter. Text is judged as in 0.4.
        const empty = typeof value === 'string' ? !value : this._isEmptyFilterValue(value);
        if (!empty) {
            this._state.filters.set(colIdx, value);
        } else {
            this._state.filters.delete(colIdx);
        }
        this._pendingFilter = null;

        this._invalidateProcessedCache();
        this._state.offset = 0;
        this._state.selected.clear();
        this._state.anchorIndex = null;

        this._savePersisted();
        // 0.7.0. The column's control shows the value, and listeners hear it.
        const entry = this._filterControls.get(colIdx);
        if (entry) {
            try { entry.control.setValue?.(empty ? null : value); } catch (err) {
                console.error('[DataTable] filter control setValue threw', err);
            }
        }
        this._notifyFilterChange();
        // 0.7.0 `dataSource`: the server filters. Nothing to redraw until it
        // answers (the box shows what was typed); a control's own state
        // changed, so it repaints itself.
        if (this.config.dataSource) {
            this._sourceLoad({ offset: 0, reason: 'filter' });
            return;
        }
        this.render();
    }

    /** 0.7.0. Put back a filter that was still being typed when a render
     *  rebuilt its box: the words, and the debounce that will apply them. */
    _resumePendingFilter({ colIdx, value }) {
        const filterRow = this._wrapperEl?.querySelector('.twm-data-table__filter-row');
        const cell = filterRow?.children[this._domIdxOf(colIdx)];
        const input = cell?.querySelector('.twm-data-table__filter-input');
        if (input && input.value !== value) {
            const focused = input.ownerDocument?.activeElement === input;
            input.value = value;
            const clear = cell.querySelector('.twm-data-table__filter-clear');
            if (clear) clear.style.display = value ? '' : 'none';
            if (focused) input.setSelectionRange(value.length, value.length);
        }
        this._onFilterInputDebounced(colIdx, value);
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
        return this._dataIdxOfDom(idx);
    }

    _restoreFilterFocus(colIdx) {
        const filterRow = this._wrapperEl?.querySelector('.twm-data-table__filter-row');
        if (!filterRow) return;
        const cellIdx = this._domIdxOf(colIdx);
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

    /** Run (and forget) a list of removers. */
    _runOffs(offs) {
        for (const off of offs || []) {
            try { off?.(); } catch (_) { /* already gone */ }
        }
    }

    /**
     * 0.5.0. A render takes `onRowActivate`'s listeners off the body it is
     * replacing ONE TASK LATER, not now. The render may be running INSIDE the
     * very click that is about to open a row — an `onSelectionChange` that calls
     * `setData`, an `onRowClick` that calls `render` — and a listener removed
     * during its own event's dispatch is skipped: the row silently did not
     * open. The event's path was fixed when it was dispatched, so it still
     * reaches the old body, whose listener opens the row that was pressed. The
     * old body is out of the page, so nothing else can reach it meanwhile.
     */
    _retireActivation() {
        const offs = this._activationOffs;
        this._activationOffs = [];
        if (offs.length) setTimeout(() => this._runOffs(offs), 0);
    }

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
        // 0.7.0. Any of the new pager's options takes the new pager, which
        // draws the 0.6 strip's words for a known total and something honest
        // for an unknown one. Without them, the 0.6 strip below, untouched.
        if (this._usesPager070()) return this._createPager070();
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
        if (totalPages <= 1 && !isFiltered) return this._createExportOnlyStrip();
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
            if (this._stagedRefusal('Turning the page')) return;
            if (isServerSide) {
                // Auto-spinner if the consumer returns a Promise.
                this._awaitWithSpinner(onPageChange(newOffset, pageSize));
            } else {
                this._state.offset = newOffset;
                this._savePage();
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
        if (this.config.showExportButton) el.appendChild(this._createExportBtn());

        return el;
    }

    /** The export button: downloadCSV() under the configured file name. */
    _createExportBtn() {
        const name = this.config.exportFilename;
        const filename = (typeof name === 'function' ? name(this) : name) || 'data.csv';
        const btn = this._createPaginationBtn('download', 'Download visible rows as CSV', false,
                                              () => this.downloadCSV(filename));
        // STORY-0088. Moves no rows, so a staged edit's freeze leaves it be.
        btn.classList.add('twm-pagination-btn--export');
        return btn;
    }

    /**
     * The strip on a table with one page: nothing, as always, unless the export
     * button needs somewhere to be. Then the button alone, with no page
     * buttons (0.14.1).
     */
    _createExportOnlyStrip() {
        if (!this.config.showExportButton) return null;
        const el = document.createElement('div');
        el.className = 'twm-pagination-controls twm-pagination-controls--export-only';
        el.style.cssText = 'display:flex; align-items:center; gap:6px; padding:2px 8px; border-bottom:1px solid #2a2a2a; font-size:11px;';
        const spacer = document.createElement('div');
        spacer.style.flex = '1';
        el.append(spacer, this._createExportBtn());
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

    // ── `paging` ────────────────────────────────────────────────────────────

    /** The `paging` config with its defaults, or null when it is not set. */
    _pagingConfig() {
        const p = this.config.paging;
        if (!p || typeof p !== 'object') return null;
        const size = Number.isFinite(p.pageSize) && p.pageSize >= 1
            ? Math.floor(p.pageSize) : this.config.pageSize;
        // 0.7.0 — `paging` OVER A `dataSource`. ONE STRIP, ONE SET OF RULES:
        // the facts the 0.6.2 consumer hands in (`offset`, `total`, `hasMore`,
        // the rows held) are the source's last answer here, and the four
        // callbacks the consumer would write are the table's own — a page turn,
        // the next rows, all of them, the other mode — so the strip, the soft
        // and hard limits, the busy state and the load-near-the-end trigger are
        // the same code with or without a server the table asks itself.
        if (this.config.dataSource) {
            const src = this._source || { offset: 0, total: null, atLeast: 0, hasMore: false };
            return {
                ...p,
                pageSize: size,
                offset: src.offset || 0,
                held: this.config.rows?.length || 0,
                total: src.total,
                atLeast: src.atLeast || 0,
                hasMore: !!src.hasMore,
                loadMorePx: Number.isFinite(p.loadMorePx) ? p.loadMorePx : PAGING_LOAD_MORE_PX,
                onPage: (offset) => this._sourceGoTo(offset),
                onLoadMore: () => this._sourceLoadMore(),
                onLoadAll: () => this._sourceLoadAll(),
                // The switch is drawn, as in 0.6.2, only for a consumer that
                // listens; the table switches and then tells it.
                onModeChange: typeof p.onModeChange === 'function'
                    ? (mode) => this._sourceSetMode(mode) : undefined,
            };
        }
        return {
            ...p,
            pageSize: size,
            offset: Number.isFinite(p.offset) && p.offset > 0 ? Math.floor(p.offset) : 0,
            // What the table holds of the source. A consumer whose `rows` carry
            // a row the source does not (a blank line to type into) says so.
            held: Number.isFinite(p.held) ? p.held : (this.config.rows?.length || 0),
            hasMore: !!p.hasMore,
            loadMorePx: Number.isFinite(p.loadMorePx) ? p.loadMorePx : PAGING_LOAD_MORE_PX,
        };
    }

    /**
     * Which way the rows are shown, and why — `resolvePaging` over this
     * table's facts. `null` without `paging`.
     */
    get pagingState() {
        const p = this._pagingConfig();
        if (!p) return null;
        // A page's rows prove the source holds every row before them too, so
        // what is PROVEN is the offset plus the rows held.
        return resolvePaging({
            mode: p.mode, total: p.total, atLeast: p.atLeast, held: p.offset + p.held,
            hasMore: p.hasMore, softLimit: p.softLimit, hardLimit: p.hardLimit,
        });
    }

    /**
     * Change some `paging` facts — a count that arrived, a mode — and redraw
     * the STRIP only. The rows are not touched: a consumer with new rows
     * renders the table as it always has.
     */
    setPaging(patch = {}) {
        if (!this.config.paging) return;
        const before = this.config.dataSource ? this.pagingState?.mode : null;
        this.config.paging = { ...this.config.paging, ...patch };
        // 0.7.0: over a `dataSource` the rows held are the table's, so a patch
        // that changes which way they are shown asks again from the start —
        // a list scrolled to 3,000 rows is not page 1.
        if (before && this.pagingState?.mode !== before) {
            this._sourceLoad({ offset: 0, reason: 'mode' });
            return;
        }
        this._refreshPagingStrip();
        this._pagingMaybeLoadMore();
    }

    _refreshPagingStrip() {
        if (!this._wrapperEl) return;
        const next = this._pagingConfig() ? this._createPagingStrip() : null;
        const prev = this._pagingEl;
        if (prev && prev.parentNode === this._wrapperEl) {
            if (next) prev.replaceWith(next); else prev.remove();
        } else if (next) {
            this._wrapperEl.appendChild(next);
        }
        this._pagingEl = next;
        this._cellGrid?.staged?.paintFreeze();   // STORY-0088
    }

    /**
     * Call one of the consumer's paging callbacks. A Promise holds every other
     * paging call back until it settles, and the strip shows the table busy —
     * a second `onLoadMore` fired by the next scroll event would fetch the same
     * page twice.
     */
    _pagingCall(kind, fn, ...args) {
        if (typeof fn !== 'function' || this._pagingBusy) return;
        if (this._stagedRefusal(`paging ${kind}`)) return;
        let result;
        try {
            result = fn(...args);
        } catch (err) {
            console.error(`[DataTable] paging ${kind} threw`, err);
            return;
        }
        if (result && typeof result.then === 'function') {
            this._pagingBusy = kind;
            this._refreshPagingStrip();
            const settle = () => {
                if (this._pagingBusy !== kind) return;
                this._pagingBusy = null;
                if (this._pagingEl?.isConnected) this._refreshPagingStrip();
            };
            result.then(settle, (err) => {
                console.error(`[DataTable] paging ${kind} failed`, err);
                settle();
            });
        }
    }

    /**
     * Scrolling: ask for the next rows when the body is near its end — or does
     * not fill its box, which no scroll can ever change. Never past the hard
     * limit, never in pages, never with no layout (a hidden table's box is 0px
     * tall, and "0 ≤ 0" would ask for the whole source).
     */
    _pagingMaybeLoadMore() {
        const p = this._pagingConfig();
        if (!p || !p.hasMore || this._pagingBusy) return;
        // STORY-0088. Paging is held while cells are staged — quietly here:
        // a scroll is not a click on a control that could say why.
        if (this._cellGrid?.staged?.freezeReason()) return;
        // 0.7.0: not while the source is answering another question (a sort, a
        // filter, a refresh) — those rows are about to be replaced.
        if (this.config.dataSource && this._source?.inFlight) return;
        const state = this.pagingState;
        if (state.mode !== 'scroll' || p.held >= state.hardLimit) return;
        const wrap = this._tableWrapEl;
        if (!wrap?.isConnected || !(wrap.clientHeight > 0)) return;
        const remaining = wrap.scrollHeight - wrap.scrollTop - wrap.clientHeight;
        if (remaining >= p.loadMorePx) return;
        this._pagingCall('more', p.onLoadMore);
    }

    /** The strip under the body, or null when it would say nothing. */
    _createPagingStrip() {
        const p = this._pagingConfig();
        const state = this.pagingState;
        const { mode, forced, exact, known } = state;
        const busy = this._pagingBusy;
        const n = (x) => Number(x).toLocaleString();
        const pageSize = p.pageSize;
        const held = p.held;
        const total = exact ? p.total : null;

        const morePages = p.offset > 0 || p.hasMore || (exact && total > held);
        if (!forced && mode === 'scroll' && !p.hasMore && held <= pageSize) return null;
        if (!forced && mode === 'pages' && !morePages) return null;

        const el = document.createElement('div');
        el.className = `twm-dt-paging twm-dt-paging--${mode}`;
        el.setAttribute('role', 'navigation');
        el.setAttribute('aria-label', 'Rows');
        if (busy) el.classList.add('twm-dt-paging--busy');

        const info = document.createElement('span');
        info.className = 'twm-dt-paging__info';
        el.appendChild(info);

        if (mode === 'pages') {
            const from = held ? p.offset + 1 : p.offset;
            const to = p.offset + held;
            let of = '';
            if (exact) of = ` of ${n(total)}`;
            else if (known > to) of = ` of more than ${n(known - 1)}`;
            info.textContent = held ? `Rows ${n(from)}–${n(to)}${of}` : 'No rows on this page';

            // The same page arithmetic as the pager above the rows (`_pageNav`).
            const pn = this._pageNav({ offset: p.offset, held, total, hasMore: p.hasMore, pageSize });
            const { hasPrev, hasNext } = pn;
            const lastOffset = exact && total > 0 ? pn.lastOffset : null;
            // A disabled button's click is ignored here too: a browser sends none,
            // but a synthetic one (a test, a script) still reaches the listener.
            const go = (offset) => (ev) => {
                if (!ev?.currentTarget?.disabled) this._pagingCall('page', p.onPage, offset, pageSize);
            };
            const nav = document.createElement('span');
            nav.className = 'twm-dt-paging__nav';
            const off = !!busy || typeof p.onPage !== 'function';
            // 0.7.0: with the new pager's options (`pagerLabels`,
            // `maxJumpOffset`, or a `dataSource`) the strip's buttons are the
            // new pager's — words beside the icons, and a refusal said on the
            // control. Without them, exactly the 0.6.2 buttons.
            const words = this._usesPager070();
            const button = (icon, name, tip, disabled, onClick, refusal = null) => (words
                ? this._pagerButton(icon, name, tip, disabled, onClick, refusal)
                : this._createPaginationBtn(icon, tip, disabled, onClick));
            nav.append(
                button('first_page', 'first', 'First page', off || !hasPrev, go(0)),
                button('chevron_left', 'prev', 'Previous page', off || !hasPrev,
                    go(Math.max(0, p.offset - pageSize))),
            );
            const page = document.createElement('span');
            page.className = 'twm-dt-paging__page';
            page.textContent = exact
                ? `Page ${n(pn.page)} of ${n(pn.pages)}`
                : `Page ${n(pn.page)}`;
            nav.append(
                page,
                button('chevron_right', 'next', 'Next page', off || !hasNext,
                    go(p.offset + pageSize)),
                // The last page needs the exact count: without it there is no
                // offset to go to, and the button says so by being off.
                words
                    ? button('last_page', 'last', 'Last page', off || !hasNext || lastOffset === null,
                        go(lastOffset), pn.lastRefusal)
                    : button('last_page', 'last',
                        lastOffset === null ? 'Last page (the total is not known)' : 'Last page',
                        off || !hasNext || lastOffset === null, go(lastOffset)),
            );
            el.appendChild(nav);
        } else {
            if (exact && total > held) info.textContent = `${n(held)} of ${n(total)} rows`;
            else if (p.hasMore) info.textContent = `${n(held)} rows, more to come`;
            else info.textContent = `${n(held)} rows`;
            if (p.hasMore && typeof p.onLoadAll === 'function') {
                const all = document.createElement('button');
                all.type = 'button';
                all.className = 'twm-dt-paging__all';
                all.textContent = busy === 'all' ? 'Loading…'
                    : exact ? `Load all ${n(total)} rows` : 'Load all rows';
                all.disabled = !!busy;
                all.addEventListener('click', () => {
                    if (!all.disabled) this._pagingCall('all', p.onLoadAll);
                });
                el.appendChild(all);
            }
        }

        const spacer = document.createElement('span');
        spacer.className = 'twm-dt-paging__spacer';
        el.appendChild(spacer);

        // WHY IT IS PAGED, said on the strip — a disabled Scroll alone reads as
        // a switch that does not work.
        const why = forced
            ? `More than ${n(state.softLimit)} rows, so they are shown in pages.` : null;
        if (why) {
            const note = document.createElement('span');
            note.className = 'twm-dt-paging__note';
            note.textContent = why;
            el.appendChild(note);
        }

        if (typeof p.onModeChange === 'function') {
            const group = document.createElement('span');
            group.className = 'twm-dt-paging__modes';
            group.setAttribute('role', 'group');
            group.setAttribute('aria-label', 'Show rows');
            for (const [value, label] of [['pages', 'Pages'], ['scroll', 'Scroll']]) {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'twm-dt-paging__mode';
                b.dataset.mode = value;
                b.textContent = label;
                const pressed = mode === value;
                b.setAttribute('aria-pressed', String(pressed));
                b.disabled = !!busy || (value === 'scroll' && forced);
                if (value === 'scroll' && forced) b.title = why;
                b.addEventListener('click', () => {
                    if (!b.disabled && mode !== value) this._pagingCall('mode', p.onModeChange, value);
                });
                group.appendChild(b);
            }
            el.appendChild(group);
        }
        return el;
    }

    _createTable() {
        const { headers, rows, pageSize, sortable, filterable, showRowNumbers, readonly, getHeaderIcon } = this.config;
        const { sortColumn, sortAscending } = this._state;
        // 0.7.0 `dataSource`: a row's index is its place in the page drawn
        // (`config.rows`), so every lookup by index — selection, copy,
        // `updateRow` — reads the row it means on any page. The page's offset
        // is the server's, and only numbers the rows.
        const configOffset = this.config.dataSource ? 0 : this.config.offset;

        // Server-side pagination: rows already represent current page, use config offset for row numbering
        // Client-side pagination: use processed (filtered+sorted) rows, then slice for current page
        const isServerSide = this._isServerSide();
        const processedRows = isServerSide ? rows : this._getProcessedRows();
        const offset = isServerSide ? (configOffset || 0) : this._state.offset;
        // NO PAGINATION MEANS NO PAGES. This used to slice to `pageSize` either
        // way, so a table built with `pagination: false` silently showed its
        // first hundred rows and offered no control to reach the rest.
        // And `paging` rows ARE the page (or everything scrolled to so far):
        // the consumer fetched them, and slicing them again would draw a
        // hundred of a thousand.
        const pageRows = isServerSide || !this.config.pagination || this._pagingConfig()
            ? processedRows : processedRows.slice(offset, offset + pageSize);
        // STORY-0003. Where the rows drawn stand in the order shown.
        this._pageSpan = {
            start: pageRows === processedRows ? 0 : offset,
            count: pageRows.length,
        };

        const table = document.createElement('table');
        table.className = this._tableClassName();
        table.tabIndex = 0;

        // Header
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');

        if (this._gutter) headerRow.appendChild(this._buildSelectHead());
        if (showRowNumbers) {
            const th = document.createElement('th');
            th.className = 'num';
            th.textContent = '#';
            headerRow.appendChild(th);
        }

        this._shownColumns().forEach((colIdx) => {
            const header = headers[colIdx];
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
        this._positionBase = this.config.dataSource ? (this._source?.offset || 0)
            : isServerSide ? (configOffset || 0)
            : (this.config.pagination ? offset : 0);
        // `paging`: a page's rows stand at its offset in the SOURCE, which only
        // the numbering reads — their indexes stay those of `rows`. Over a
        // `dataSource` that offset IS the source's, counted above once.
        const paged = this.config.dataSource ? null : this._pagingConfig();
        if (paged && Number.isFinite(paged.offset)) this._positionBase += paged.offset;

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
                const tr = this._buildBodyRow(row, globalOf(localIdx), localIdx);
                tbody.appendChild(tr);
                // 0.7.0 `rowDetail`: an open detail goes in right under its row.
                if (this._detailOn()) this._appendDetailIfOpen(tr, null);
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
        // STORY-0003. The row's position in the order shown, for cell mode.
        if (this._cellGrid) tr.__cellPos = (this._pageSpan?.start || 0) + localIdx;

        // STORY-0003. In cell mode the CELLS are lit, not the rows.
        if (this._state.selected.has(globalIdx) && !this._cellGrid) {
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
        const n = this._domColCount();
        const colgroup = document.createElement('colgroup');
        for (let i = 0; i < n; i++) {
            const col = document.createElement('col');
            const w = i < this._lead().select ? this._selectColWidth() : this._colWidths?.[i];
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
            td.colSpan = Math.max(1, this._domColCount());
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
        // 0.7.0 `rowDetail`: an open detail is part of its row's height —
        // measured once drawn, estimated until then.
        const details = this._detailOn() && this._expanded.size > 0;
        let y = 0;
        for (let i = 0; i < n; i++) {
            let h = v.base;
            if (fn) {
                const asked = fn(v.globalOf(i), v.base);
                h = Number.isFinite(asked) && asked > 0 ? asked : 0;
            }
            if (details && h > 0) h += this._detailHeightOf(v.rows[i], v.globalOf(i), v.base);
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

    /**
     * Measure the rows that are DRAWN — the median of up to 64 of them. Client
     * pixels, so the zoom is divided back out (`_measureNaturalWidths` explains
     * why), and NOT `offsetHeight`, which is rounded: 21 for a 21.19px row is a
     * 1,100px error over 6,000 rows.
     *
     * 0.6.3: IT USED TO MEASURE ONE ROW, ONCE, AT RENDER, and trust it for the
     * life of the table. A row measured at a bad moment — a box not yet laid
     * out at its width, a font not yet loaded — set every row's height: a
     * Tables grid drawing 22.8px rows was found holding a 134px estimate, so the
     * window took a 650px viewport for five rows, drew rows 1–35 and left the
     * rest of the box blank spacer while the reader scrolled. Now it is asked
     * again on every window update (`_virtUpdate`), on a resize and once the
     * column widths are fixed, and corrects itself the first time real rows
     * are on screen. The first measure is exact; after that a change has to be
     * larger than half a pixel, so rows of mixed heights cannot make the
     * offsets move under the reader on every scroll.
     *
     * 0.7.0 `rowDetail`: AN OPEN DETAIL IS PART OF ITS ROW'S HEIGHT, and is
     * measured at the same moments. It is never one of the rows the median is
     * taken from (the window's map holds the rows, not their details), so a
     * tall detail cannot pass for a row; it is read on its own, into the
     * row's height — and read again here, because a detail's height moves for
     * the same reasons a row's does (the column widths fixed, a font), and
     * more: it wraps across the whole table's width.
     *
     * @returns {boolean} whether the heights changed (the offsets are recomputed).
     */
    _virtMeasure() {
        const v = this._virt;
        if (!v) return false;
        const zoom = this._tableEl?.currentCSSZoom || 1;
        const heights = [];
        for (const tr of v.map.values()) {
            if (!tr.isConnected || tr.hidden) continue;
            const h = tr.getBoundingClientRect().height / zoom;
            if (h > 0) heights.push(h);
            if (heights.length >= 64) break;
        }
        const details = this._detailOn() && this._expanded.size > 0
            && this._virtReadDetailHeights(v.map.values());
        let base = false;
        if (heights.length) {
            heights.sort((a, b) => a - b);
            const h = heights[heights.length >> 1];
            const tolerance = v.measured ? 0.5 : 0.01;
            v.measured = true;
            if (Math.abs(h - v.base) > tolerance) {
                v.base = h;
                this._virtBase = h;
                base = true;
            }
        }
        if (!base && !details) return false;
        this._virtComputeOffsets();
        return true;
    }

    /** Measure again, and redraw the window when the heights moved. */
    _virtRemeasure() {
        if (this._virtMeasure()) this._virtUpdate({ force: true });
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
    _virtUpdate({ force = false, notify = true, top = null, viewport = null, measure = true } = {}) {
        const v = this._virt;
        if (!v || !v.offsets) return [];
        // The rows on screen say how tall a row is — before the window is
        // placed, so a stale estimate is not used to place it (`_virtMeasure`).
        if (measure && this._virtMeasure()) force = true;
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
            // And the rows just drawn: if they disagree with the estimate the
            // window was placed by, place it once more by what they say.
            if (measure && added.length && this._virtMeasure()) {
                return added.concat(this._virtUpdate({
                    force: true, notify, top, viewport, measure: false,
                }));
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
                this._cellGrid?.rowLeaving(tr);   // STORY-0003: an open editor commits
                tr.remove();
                this._removeDetailPieces(tr);   // 0.7.0: its detail goes with it
                v.map.delete(i);
                removed?.push(tr);
            }
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
            // 0.7.0: an open detail between the row and the one after it.
            if (this._detailOn()) this._appendDetailIfOpen(tr, ref);
            ref = tr;
            added.push(tr);
        }
        added.reverse();
        // 0.7.0: the details just drawn have a real height now.
        if (this._detailOn() && added.length) this._virtMeasureDetails(added);
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

        // STORY-0016. The select column: a checkbox, shown in select mode. It
        // takes no focus and no click of its own — the row's click ticks it.
        if (this._gutter) {
            const td = document.createElement('td');
            td.className = 'twm-dt-select-cell';
            const box = document.createElement('input');
            box.type = 'checkbox';
            box.className = 'twm-dt-select-box';
            box.tabIndex = -1;
            box.checked = this._state.selected.has(globalIdx);
            box.setAttribute('aria-label', 'Select row');
            // Its click is the row's: the box flips, the row's handler ticks
            // and sets it to the tick. (Prevented, the browser would flip it
            // back AFTER the handler.)
            td.appendChild(box);
            tr.appendChild(td);
        }

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
        // 0.6.1 `diff`.
        const diff = this._diffOf(row, globalIdx);
        const gap = diff?.status === 'gap';
        const changedCells = diff?.cells
            ? (diff.cells instanceof Set ? diff.cells : new Set(diff.cells))
            : null;
        for (const colIdx of this._rowColumns(row.length)) {
            const td = document.createElement('td');
            td.className = this._columnTypes[colIdx] || 'text';
            if (this._cellGrid) td.__colIdx = colIdx;   // STORY-0003

            // Use custom cell renderer if provided
            const value = row[colIdx];
            let handled = false;
            if (gap) {
                // The other side's row: a place, not a value.
                td.classList.add('twm-dt-diff__gap');
                tr.appendChild(td);
                continue;
            }
            if (changedCells?.has(colIdx)) td.classList.add('twm-dt-diff__cell--changed');
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
            // 0.7.0 `rowDetail`: the toggle, in front of everything in the
            // first data cell.
            if (colIdx === 0 && this._detailOn()) this._prependDetailToggle(td, tr, row, globalIdx);

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
        // STORY-0003. The selection, and a commit's pending or refused mark.
        this._cellGrid?.decorateRow(tr);
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
     *  STORY-0003: on the row an open cell editor is in, the data is stored
     *  now and the row is drawn when the editor closes (true is returned).
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
        // STORY-0003. The row holds an open cell editor: the rebuild would take
        // it out of the document, so the row is drawn when the editor closes.
        if (this._cellGrid?.holdRow(tr, index)) return true;

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
            && !!tr.querySelector(':scope > td.num');
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

        tr.classList.toggle('selected', this._state?.selected?.has(index) === true && !this._cellGrid);
        // 0.5.0. The row's data changed, so its classes, attributes, key and
        // open mark are asked again (a key paused, a delivery that died).
        this._decorateRow(tr, row, index);
        // 0.7.0. An open detail is of the row's data, so it is drawn again.
        if (this._detailOn()) this._redrawDetail(tr);

        if (focusedCol >= 0 && tr.children[focusedCol]) {
            tr.children[focusedCol].focus?.();
        }
        return true;
    }

    // ─────────────────────────────────────────────────────────────────
    // 0.7.0 — a row's detail (#26)
    // ─────────────────────────────────────────────────────────────────
    //
    // A detail is TWO rows after its row: the detail itself (one cell across
    // every column) and a hidden filler. The filler is the stripe: rows are
    // striped by `tr:nth-child(even)`, a question about POSITION, and one extra
    // row would flip the stripe of every row below an open detail. Two keep
    // the parity — the trick `_virtSpacers` already plays for the window.
    //
    // Neither row has a `__rowIndex`, so everything that walks the body for
    // rows of data (selection, the open mark, `_firstBodyRow`, `getRowElement`,
    // the activation and the copy menu) steps over them as it steps over a
    // spacer.

    _detailOn() {
        return typeof this.config.rowDetail === 'function';
    }

    _rowHasDetail(row, rowIdx) {
        const fn = this.config.hasRowDetail;
        if (typeof fn !== 'function') return true;
        try { return !!fn(row, rowIdx); } catch (err) {
            console.error('[DataTable] hasRowDetail threw', err);
            return false;
        }
    }

    /** The toggle: a real `<button>` (so Enter and Space work on it, and it is
     *  a control `onRowActivate` leaves alone), its glyph drawn by CSS so the
     *  cell's text, its tooltip and a copy stay the cell's own. */
    _prependDetailToggle(td, tr, row, rowIdx) {
        if (!this._rowHasDetail(row, rowIdx)) {
            // A row with no detail keeps the toggle's room, so its first cell's
            // text lines up with the rows that have one.
            const gap = document.createElement('span');
            gap.className = 'twm-dt-detail-toggle-gap';
            gap.setAttribute('aria-hidden', 'true');
            td.insertBefore(gap, td.firstChild);
            return;
        }
        const key = this._rowKey(row, rowIdx);
        const open = key !== null && this._expanded.has(key);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'material-symbols-outlined twm-dt-detail-toggle';
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        btn.setAttribute('aria-label', String(this.config.rowDetailLabel || 'Details'));
        btn.title = String(this.config.rowDetailLabel || 'Details');
        btn.addEventListener('click', (ev) => {
            // Its own gesture: it neither selects nor opens the row.
            ev.preventDefault();
            ev.stopPropagation();
            this._setRowElExpanded(tr, btn.getAttribute('aria-expanded') !== 'true', ev);
        });
        td.insertBefore(btn, td.firstChild);
        td.classList.add('twm-dt-cell--has-detail-toggle');
        tr.classList.add('twm-dt-row--has-detail');
    }

    /** After `tr` has been placed: its open detail, in front of `ref` (the row
     *  after it, or null for the end of the body). */
    _appendDetailIfOpen(tr, ref) {
        const row = tr.__row;
        const idx = tr.__rowIndex;
        if (!this._rowHasDetail(row, idx)) return;
        const key = this._rowKey(row, idx);
        if (key === null || !this._expanded.has(key)) return;
        const pieces = this._buildDetailPieces(tr, key);
        const parent = tr.parentNode;
        if (!parent) return;
        for (const p of pieces) parent.insertBefore(p, ref);
    }

    _buildDetailPieces(tr, key) {
        const n = this._domColCount();
        const detailTr = document.createElement('tr');
        detailTr.className = 'twm-dt-detail-row';
        const td = document.createElement('td');
        td.className = 'twm-dt-detail-cell';
        td.colSpan = Math.max(1, n);
        const host = document.createElement('div');
        host.className = 'twm-dt-detail';
        DETAIL_SEQ.n += 1;
        host.id = `twm-dt-detail-${DETAIL_SEQ.n}`;
        td.appendChild(host);
        detailTr.appendChild(td);
        const filler = document.createElement('tr');
        filler.className = 'twm-dt-detail-filler';
        filler.hidden = true;
        filler.setAttribute('aria-hidden', 'true');
        detailTr.__detailOf = tr;
        tr.__detail = [detailTr, filler];
        this._drawDetail(tr, host, key);
        const btn = tr.querySelector(':scope > td > .twm-dt-detail-toggle');
        if (btn) btn.setAttribute('aria-controls', host.id);
        return tr.__detail;
    }

    _drawDetail(tr, host, key) {
        host.replaceChildren();
        let out;
        try {
            out = this.config.rowDetail(tr.__row, tr.__rowIndex, { host, key, table: this });
        } catch (err) {
            console.error('[DataTable] rowDetail threw', err);
            out = err?.message || String(err);
        }
        if (out == null || out === false || out === host) return;
        if (typeof Node !== 'undefined' && out instanceof Node) host.appendChild(out);
        else host.textContent = String(out);
    }

    _removeDetailPieces(tr) {
        const pieces = tr.__detail;
        if (!pieces) return;
        for (const p of pieces) p.remove();
        tr.__detail = null;
        const btn = tr.querySelector(':scope > td > .twm-dt-detail-toggle');
        if (btn) btn.removeAttribute('aria-controls');
    }

    /** `updateRow`'s half: the detail follows the row's new data. */
    _redrawDetail(tr) {
        const key = this._rowKey(tr.__row, tr.__rowIndex);
        const want = this._rowHasDetail(tr.__row, tr.__rowIndex) && key !== null && this._expanded.has(key);
        const pieces = tr.__detail;
        if (!want) { if (pieces) this._removeDetailPieces(tr); return; }
        if (pieces) {
            const host = pieces[0].querySelector('.twm-dt-detail');
            if (host) {
                this._drawDetail(tr, host, key);
                const btn = tr.querySelector(':scope > td > .twm-dt-detail-toggle');
                if (btn) btn.setAttribute('aria-controls', host.id);
            }
            return;
        }
        if (tr.parentNode) this._appendDetailIfOpen(tr, tr.nextSibling);
    }

    /** Open or close the detail of the row `tr` draws. Returns whether
     *  anything changed. */
    _setRowElExpanded(tr, open, ev = null) {
        if (!this._detailOn() || tr.__rowIndex === undefined) return false;
        if (!this._rowHasDetail(tr.__row, tr.__rowIndex)) return false;
        const key = this._rowKey(tr.__row, tr.__rowIndex);
        if (key === null || this._expanded.has(key) === !!open) return false;
        if (open) this._expanded.add(key); else this._expanded.delete(key);
        this._syncDetailOnScreen(tr, key);
        this._afterDetailChange();
        try { this.config.onRowDetailToggle?.(tr.__rowIndex, tr.__row, !!open, key, ev); } catch (err) {
            console.error('[DataTable] onRowDetailToggle threw', err);
        }
        return true;
    }

    /** Make the row on screen agree with `_expanded` for its key. */
    _syncDetailOnScreen(tr, key) {
        const open = this._expanded.has(key);
        const btn = tr.querySelector(':scope > td > .twm-dt-detail-toggle');
        if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open && !tr.__detail && tr.parentNode) {
            const ref = tr.nextSibling;
            for (const p of this._buildDetailPieces(tr, key)) tr.parentNode.insertBefore(p, ref);
        } else if (!open && tr.__detail) {
            this._removeDetailPieces(tr);
        }
    }

    /** Under `virtualize` an open detail is part of its row's height. */
    _afterDetailChange() {
        if (!this._virt) return;
        this._virtMeasureDetails([...this._virt.map.values()], { force: true });
    }

    /** The detail's height for row `i` of the window's list: 0 closed, the
     *  measured height open, three rows until it has been measured. */
    _detailHeightOf(row, rowIdx, base) {
        if (!this._rowHasDetail(row, rowIdx)) return 0;
        const key = this._rowKey(row, rowIdx);
        if (key === null || !this._expanded.has(key)) return 0;
        const h = this._detailHeights.get(key);
        return h > 0 ? h : base * 3;
    }

    /** Measure the open details among `trs` (client pixels, the zoom divided
     *  out, as `_virtMeasure` does), and re-lay the window if one changed. */
    _virtMeasureDetails(trs, { force = false } = {}) {
        const v = this._virt;
        if (!v) return;
        const changed = this._virtReadDetailHeights(trs) || force;
        if (!changed) return;
        this._virtComputeOffsets();
        this._virtSpacers();
    }

    /** Read the open details drawn under `trs` into `_detailHeights`; true
     *  when one moved by more than half a pixel. Recomputes nothing. */
    _virtReadDetailHeights(trs) {
        let changed = false;
        const zoom = this._tableEl?.currentCSSZoom || 1;
        for (const tr of trs) {
            const d = tr?.__detail?.[0];
            if (!d || !d.isConnected) continue;
            const h = d.getBoundingClientRect().height / zoom;
            if (!(h > 0)) continue;
            const key = this._rowKey(tr.__row, tr.__rowIndex);
            if (Math.abs((this._detailHeights.get(key) || 0) - h) > 0.5) {
                this._detailHeights.set(key, h);
                changed = true;
            }
        }
        return changed;
    }

    /**
     * Open (or close) the detail of the row whose key is `key` (`getRowKey`,
     * else the row's index). A row not on screen — another page, outside the
     * window, filtered out — opens when it is drawn.
     *
     * @param {*} key
     * @param {boolean} [open=true]
     * @returns {boolean} whether anything changed
     */
    setRowExpanded(key, open = true) {
        if (key == null) return false;
        const k = String(key);
        if (this._expanded.has(k) === !!open) return false;
        if (open) this._expanded.add(k); else this._expanded.delete(k);
        const tr = this._rowElByKey(k);
        if (tr) {
            this._syncDetailOnScreen(tr, k);
            try { this.config.onRowDetailToggle?.(tr.__rowIndex, tr.__row, !!open, k, null); } catch (err) {
                console.error('[DataTable] onRowDetailToggle threw', err);
            }
        }
        if (this._virt) {
            this._virtComputeOffsets();
            this._virtSpacers();
            this._afterDetailChange();
        }
        return true;
    }

    /** Whether the row whose key is `key` has its detail open. */
    isRowExpanded(key) {
        return key != null && this._expanded.has(String(key));
    }

    /** The keys of the rows whose detail is open, as text. */
    getExpandedRows() {
        return [...this._expanded];
    }

    /** Close every detail. */
    collapseAllRows() {
        for (const k of [...this._expanded]) this.setRowExpanded(k, false);
    }

    /** The `<tr>` on screen for a key, or null. */
    _rowElByKey(key) {
        const tbody = this._tbodyEl;
        if (!tbody) return null;
        for (const tr of tbody.children) {
            if (tr.__rowIndex === undefined) continue;
            if (this._rowKey(tr.__row, tr.__rowIndex) === key) return tr;
        }
        return null;
    }

    // ─────────────────────────────────────────────────────────────────
    // 0.7.0 — rows from a server (#33), the pager for an unknown total
    // (#35), refresh and follow (#36)
    // ─────────────────────────────────────────────────────────────────
    //
    // ONE QUESTION AT A TIME, AND ONLY THE NEWEST ANSWER. Every request takes
    // a ticket; an answer whose ticket is not the latest is dropped, and the
    // request it answered is aborted the moment a newer one is sent. Two
    // requests in flight from a fast typist otherwise race, and the loser
    // painting last is a list that does not match the box above it.

    /** Rows that are the current page of something larger (`onPageChange`,
     *  or 0.7.0's `dataSource`): drawn as given, never filtered, sorted or
     *  sliced here. */
    _isServerSide() {
        return typeof this.config.onPageChange === 'function' || !!this.config.dataSource;
    }

    /** `autoDispose`'s grace in ms: one task, `keepWhileDetached`'s number,
     *  or Infinity for `true`. */
    _detachGrace() {
        const k = this.config.keepWhileDetached;
        if (k === true) return Infinity;
        if (typeof k === 'number' && Number.isFinite(k) && k > 0) return k;
        if (k === Infinity) return Infinity;
        return 0;
    }

    _sourceState() {
        if (!this._source) {
            this._source = {
                started: false, ticket: 0, controller: null, inFlight: false,
                offset: 0, pendingOffset: 0, total: null, atLeast: 0, hasMore: false,
                query: null, loaded: false, pendingAppend: false,
            };
        }
        return this._source;
    }

    /** The column filters, as a query and `onFilterChange` carry them. */
    _filterList() {
        const headers = this.config.headers || [];
        const out = [];
        for (const [column, value] of this._state.filters) {
            if (typeof value === 'string' ? !value : this._isEmptyFilterValue(value)) continue;
            out.push({ column, header: headers[column], value });
        }
        return out.sort((a, b) => a.column - b.column);
    }

    /** Rows per question: `paging.pageSize` when the source is paged, else
     *  `pageSize` — one number for the query, `goToPage` and the pager. */
    _sourcePageSize() {
        const size = this._pagingConfig()?.pageSize ?? this.config.pageSize;
        return Math.max(1, size | 0);
    }

    _buildQuery(offset, reason, limit = null) {
        const col = this._state.sortColumn;
        return {
            offset,
            limit: Number.isFinite(limit) && limit >= 1 ? Math.floor(limit) : this._sourcePageSize(),
            sort: col == null ? null : {
                column: col, header: (this.config.headers || [])[col], ascending: this._state.sortAscending,
            },
            filters: this._filterList(),
            reason,
        };
    }

    /**
     * Ask the source for the page at `offset`, and draw the answer if it is
     * still the newest by then. Resolves with the answer drawn, or undefined
     * when it was dropped (superseded, failed, or the table was disposed).
     */
    async _sourceLoad({ offset = 0, reason = 'reload', keep = false, append = false, limit = null } = {}) {
        const fetch = this.config.dataSource;
        if (typeof fetch !== 'function') return undefined;
        const src = this._sourceState();
        src.started = true;
        const ticket = ++src.ticket;
        try { src.controller?.abort(); } catch (_) { /* gone */ }
        const controller = typeof AbortController === 'function' ? new AbortController() : null;
        src.controller = controller;
        const query = this._buildQuery(Math.max(0, offset | 0), reason, limit);
        src.query = query;
        src.inFlight = true;
        src.pendingOffset = query.offset;
        src.pendingAppend = append;
        // More rows under a scrolling list are said on the paging strip (busy),
        // not by covering the rows being read.
        if (!append) this.setLoading(true);
        let result;
        try {
            result = await fetch(query, { signal: controller?.signal });
        } catch (err) {
            if (ticket !== src.ticket) return undefined;      // superseded or disposed
            src.inFlight = false;
            src.controller = null;
            src.pendingAppend = false;
            if (err?.name === 'AbortError' || controller?.signal?.aborted) {
                this.setLoading(false);
                return undefined;
            }
            // THE ROWS ON SCREEN STAY: a failed refresh does not blank a list a
            // person was reading. `setError` keeps them under its banner.
            this.setError(err);
            try { this.config.onLoadError?.(err, query); } catch (e) { console.error('[DataTable] onLoadError threw', e); }
            return undefined;
        }
        if (ticket !== src.ticket) return undefined;          // a newer question is out
        src.inFlight = false;
        src.controller = null;
        src.pendingAppend = false;
        this._applySourceResult(result, query, { keep, append });
        try { this.config.onLoad?.(result, query); } catch (e) { console.error('[DataTable] onLoad threw', e); }
        return result;
    }

    _applySourceResult(result, query, { keep = false, append = false } = {}) {
        const src = this._sourceState();
        const r = Array.isArray(result) ? { rows: result } : (result || {});
        const answered = Array.isArray(r.rows) ? r.rows : [];
        const totalRaw = r.total ?? r.totalCount;
        const total = typeof totalRaw === 'number' && Number.isFinite(totalRaw) ? totalRaw : null;
        const hasMore = typeof r.hasMore === 'boolean' ? r.hasMore
            : total !== null ? query.offset + answered.length < total
            : answered.length >= query.limit;
        // `paging`, scrolling: the next rows go UNDER the ones held, and the
        // page held still starts where it started.
        let rows = append ? (this.config.rows || []).concat(answered) : answered;
        let rowsOffset = append ? (src.offset || 0) : query.offset;
        // …until the source proves it holds more than the soft limit: from then
        // on it is shown in PAGES (`resolvePaging`), and the rows the reader had
        // just reached ARE that page — nothing is asked again, and the reader
        // goes on from where they were reading.
        const pc = append ? this._pagingConfig() : null;
        if (pc && resolvePaging({
            mode: pc.mode, total, atLeast: r.atLeast, held: rowsOffset + rows.length, hasMore,
            softLimit: pc.softLimit, hardLimit: pc.hardLimit,
        }).mode === 'pages') {
            rows = answered;
            rowsOffset = query.offset;
            append = false;
        }
        // WITHOUT `getRowKey`, A DETAIL IS OPEN AT A PLACE, and a place in one
        // answer says nothing about which row stands there in the next: page 2's
        // first row is not page 1's, and a sort or a new arrival moves every
        // row. So an index-keyed detail stays open only where the new answer
        // has the SAME row (equal values) at its place; `expandedRows` applies
        // to the first answer as given. (The release review: a detail opened on
        // page 1 opened the same place on page 2, under another row.)
        if (src.loaded && this._detailOn() && this._expanded.size
            && typeof this.config.getRowKey !== 'function') {
            const before = this.config.rows || [];
            const same = (a, b) => {
                if (a === b) return true;
                try { return JSON.stringify(a) === JSON.stringify(b); } catch (_) { return false; }
            };
            for (const k of [...this._expanded]) {
                const i = Number(k);
                if (!Number.isInteger(i) || i < 0 || i >= rows.length || !same(before[i], rows[i])) {
                    this._expanded.delete(k);
                    this._detailHeights.delete(k);
                }
            }
        }
        // The page drawn — so the pager says where these rows ARE.
        src.offset = rowsOffset;
        src.total = total;
        src.atLeast = Number.isFinite(r.atLeast) ? r.atLeast : 0;
        src.hasMore = hasMore;
        src.loaded = true;
        if (r.filterCounts && typeof r.filterCounts === 'object') this.setFilterCounts(r.filterCounts);

        const snap = keep ? this._snapshotView() : null;
        const kept = append ? this._tableWrapEl?.scrollTop || 0 : null;
        // Rows the last answer did not hold — marked as new (only by key: an
        // index says nothing about which row is which across two answers).
        if (snap && snap.keys && snap.keys.size && typeof this.config.getRowKey === 'function') {
            const fresh = new Set();
            rows.forEach((row, i) => {
                const k = this._rowKey(row, i);
                if (k !== null && !snap.keys.has(k)) fresh.add(k);
            });
            this._newKeys = fresh.size ? fresh : null;
        } else {
            this._newKeys = null;
        }
        // More rows under the same ones: the rows a person chose stay chosen.
        const chosen = append && this._state.selected.size
            ? { sel: [...this._state.selected], anchor: this._state.anchorIndex } : null;
        this.setData({ rows });
        this._newKeys = null;
        if (chosen) {
            for (const i of chosen.sel) this._state.selected.add(i);
            this._state.anchorIndex = chosen.anchor;
            this._updateRowSelection();
        }
        if (snap) this._restoreView(snap);
        else if (kept !== null) this._scrollBodyTo(kept);   // more rows: the reader stays put
        else this._scrollBodyTo(0);   // a new question starts at the top of its answer
    }

    /** What a refresh must put back: the keys on screen, the selection by
     *  key, and the first row a reader can see with where it stood. */
    _snapshotView() {
        const rows = this.config.rows || [];
        const keyed = typeof this.config.getRowKey === 'function';
        const keys = keyed ? new Set(rows.map((row, i) => this._rowKey(row, i))) : null;
        const selectedKeys = keyed
            ? this.getSelection().map((i) => this._rowKey(rows[i], i)).filter((k) => k !== null)
            : null;
        const wrap = this._tableWrapEl;
        let anchor = null;
        const scrollTop = wrap?.scrollTop || 0;
        if (wrap && scrollTop > 0 && this._tbodyEl) {
            const zoom = this._tableEl?.currentCSSZoom || 1;
            const top = wrap.getBoundingClientRect().top;
            for (const tr of this._tbodyEl.children) {
                if (tr.__rowIndex === undefined) continue;
                const box = tr.getBoundingClientRect();
                if (box.bottom > top + 0.5) {
                    anchor = { key: this._rowKey(tr.__row, tr.__rowIndex), delta: (box.top - top) / zoom };
                    break;
                }
            }
        }
        return { keys, selectedKeys, anchor, scrollTop };
    }

    _restoreView(snap) {
        // The selection, by key: the rows a person chose are still chosen
        // wherever the new answer put them.
        if (snap.selectedKeys && snap.selectedKeys.length) {
            const want = new Set(snap.selectedKeys);
            const sel = this._state.selected;
            (this.config.rows || []).forEach((row, i) => {
                if (want.has(this._rowKey(row, i))) sel.add(i);
            });
            if (sel.size) {
                this._state.anchorIndex = [...sel][0];
                this._updateRowSelection();
                this._notifySelectionChange();
            }
        }
        // THE SCROLL POSITION: a reader at the top sees what arrived (that is
        // following); a reader scrolled down keeps the rows they were reading
        // where they were — new rows above push the scroll, not the rows.
        const wrap = this._tableWrapEl;
        if (!wrap || !snap.anchor || snap.anchor.key === null) return;
        const rows = this.config.rows || [];
        const idx = rows.findIndex((row, i) => this._rowKey(row, i) === snap.anchor.key);
        if (idx < 0) return;
        const zoom = this._tableEl?.currentCSSZoom || 1;
        if (this._virt) {
            const local = this._virtLocalOf(idx);
            if (local < 0) return;
            this._scrollBodyTo(Math.max(0, this._virt.offsets[local] - snap.anchor.delta));
            return;
        }
        const tr = this.getRowElement(idx);
        if (!tr) return;
        const now = (tr.getBoundingClientRect().top - wrap.getBoundingClientRect().top) / zoom;
        const shift = now - snap.anchor.delta;
        if (Math.abs(shift) >= 0.5) this._scrollBodyTo(wrap.scrollTop + shift);
    }

    _scrollBodyTo(top) {
        const wrap = this._tableWrapEl;
        if (!wrap) return;
        if (Math.abs((wrap.scrollTop || 0) - top) >= 0.5) wrap.scrollTop = top;
        if (this._virt) this._virtUpdate({ force: true, top });
    }

    /** Go to the page at `offset` (paging back stops following). */
    _sourceGoTo(offset) {
        if (this._stagedRefusal('Turning the page')) return undefined;
        const next = Math.max(0, offset | 0);
        // PAGING AWAY TURNS FOLLOWING OFF, and coming back does not turn it on
        // again by itself: a reader who left the tail to read an old page is
        // never pulled back to it by the next tick.
        if (this._following && next > 0) this.setFollow(false);
        return this._sourceLoad({ offset: next, reason: 'page' });
    }

    /**
     * `paging` over a `dataSource`, scrolling: the rows after those held, under
     * them — never past the hard limit. Scrolling down to ask for them is
     * paging away, so it turns following off as a page turn does; rows asked
     * for because the ones held do not fill the box are not (the reader is
     * still at the top).
     */
    _sourceLoadMore() {
        const held = this.config.rows?.length || 0;
        const hard = this.pagingState?.hardLimit ?? PAGING_HARD_LIMIT;
        const limit = Math.min(this._sourcePageSize(), hard - held);
        if (limit < 1) return Promise.resolve(undefined);
        if (this._following && (this._tableWrapEl?.scrollTop || 0) > 0) this.setFollow(false);
        const offset = (this._source?.offset || 0) + held;
        return this._sourceLoad({ offset, limit, reason: 'more', append: true });
    }

    /** The strip's *Load all rows*: ONE question for every row left under the
     *  hard limit (`reason: 'all'`); the source answers as many as it will, and
     *  says with `hasMore` whether there are still more. */
    _sourceLoadAll() {
        const held = this.config.rows?.length || 0;
        const hard = this.pagingState?.hardLimit ?? PAGING_HARD_LIMIT;
        if (hard - held < 1) return Promise.resolve(undefined);
        if (this._following) this.setFollow(false);
        const offset = (this._source?.offset || 0) + held;
        return this._sourceLoad({ offset, limit: hard - held, reason: 'all', append: true });
    }

    /** The strip's Pages / Scroll switch: the table switches, tells the
     *  consumer (`paging.onModeChange`), and asks again from the start. */
    _sourceSetMode(mode) {
        const next = mode === 'pages' ? 'pages' : 'scroll';
        const p = this.config.paging;
        this.config.paging = { ...p, mode: next };
        try { p.onModeChange?.(next); } catch (err) { console.error('[DataTable] onModeChange threw', err); }
        return this._sourceLoad({ offset: 0, reason: 'mode' });
    }

    /**
     * Ask the source again from its FIRST page — for a consumer whose own
     * filters (outside the table) changed. Under `dataSource` only; resolves
     * with the answer drawn (undefined when it was superseded or failed).
     */
    reload() {
        if (!this.config.dataSource) return Promise.resolve(undefined);
        return this._sourceLoad({ offset: 0, reason: 'reload' });
    }

    /**
     * Read the CURRENT page again, in place: the scroll position (a reader at
     * the top sees what arrived; one scrolled down keeps the rows they were
     * reading where they were), the selection by key, the open row and the
     * open details all stay; rows the last answer did not hold are drawn
     * `twm-dt-row--new` (needs `getRowKey`). What `follow` calls on its tick.
     * Without `dataSource`, it only draws again.
     */
    refresh() {
        if (!this.config.dataSource) {
            if (this._wrapperEl) this.render();
            return Promise.resolve(undefined);
        }
        const src = this._sourceState();
        // `paging`, scrolling: the rows HELD are read again, in one question
        // from where they start — a list scrolled to row 300 is still 300 rows
        // after the tick. (Following stops once the reader scrolls down for
        // more, so a following list stays short.)
        if (this.pagingState?.mode === 'scroll') {
            const held = this.config.rows?.length || 0;
            return this._sourceLoad({
                offset: src.offset || 0, limit: Math.max(this._sourcePageSize(), held),
                reason: 'refresh', keep: true,
            });
        }
        const offset = src.inFlight && !src.pendingAppend ? src.pendingOffset : src.offset;
        return this._sourceLoad({ offset, reason: 'refresh', keep: true });
    }

    /** The last query sent to `dataSource`, or null. */
    getQuery() {
        return this._source?.query || null;
    }

    /** What the last answer said about the whole: `{offset, total, hasMore}`. */
    getPageInfo() {
        const s = this._source;
        return s ? { offset: s.offset, total: s.total, hasMore: s.hasMore } : null;
    }

    /**
     * Turn following on or off (`follow`). On, the first page is read again
     * every `follow.interval` ms while the table is on it and in the page.
     */
    setFollow(on) {
        const next = !!on;
        if (next === this._following) return;
        this._following = next;
        if (next) this._armFollow(); else this._disarmFollow();
        try { this.config.onFollowChange?.(next); } catch (err) { console.error('[DataTable] onFollowChange threw', err); }
    }

    isFollowing() {
        return this._following;
    }

    _followInterval() {
        const f = this.config.follow;
        const ms = f && typeof f === 'object' ? Number(f.interval) : NaN;
        return Number.isFinite(ms) && ms > 0 ? ms : 10_000;
    }

    /** The tick holds the table WEAKLY: a follow timer must never be what keeps
     *  a table nobody holds alive (`keepWhileDetached: true`). */
    _armFollow() {
        this._disarmFollow();
        if (!this._following || !this.config.dataSource || !this._wrapperEl) return;
        const ref = weakRef(this);
        const id = setInterval(() => {
            const t = ref.deref();
            if (!t || t._followTimer !== id) { clearInterval(id); return; }
            const src = t._source;
            if (!t._following || !src || src.inFlight) return;
            if ((src.offset || 0) !== 0) return;              // only on the first page
            if (!t._wrapperEl?.isConnected) return;           // not while out of the page
            if (t._readerIsBusy()) return;                    // not under a reader (below)
            t.refresh();
        }, this._followInterval());
        this._followTimer = id;
    }

    _disarmFollow() {
        if (this._followTimer) clearInterval(this._followTimer);
        this._followTimer = null;
    }

    /** A TICK WAITS FOR A READER. A refresh redraws every row and every open
     *  detail, so a tick that came while somebody was selecting text in the
     *  table (a stack trace to copy) or working inside an open detail took the
     *  text out from under the selection and the focus out of the detail —
     *  every interval, for as long as they stayed. The tick is skipped
     *  instead, and following resumes on the next one after (the release
     *  review). `refresh()` called by the consumer is not a tick and does not
     *  wait. */
    _readerIsBusy() {
        const wrap = this._tableWrapEl;
        const doc = wrap?.ownerDocument;
        if (!wrap || !doc) return false;
        const active = doc.activeElement;
        if (active && active !== wrap && wrap.contains(active)
            && active.closest?.('.twm-dt-detail')) return true;
        try {
            const sel = doc.defaultView?.getSelection?.();
            if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
                for (let i = 0; i < sel.rangeCount; i++) {
                    const r = sel.getRangeAt(i);
                    if (wrap.contains(r.startContainer) || wrap.contains(r.endContainer)) return true;
                }
            }
        } catch (_) { /* no selection API */ }
        return false;
    }

    // ── the pager (#35) ────────────────────────────────────────────────

    _usesPager070() {
        const c = this.config;
        return !!c.dataSource || !!c.pagerLabels || c.maxJumpOffset != null
            || (typeof c.onPageChange === 'function' && c.totalCount == null && typeof c.hasMore === 'boolean');
    }

    _pagerLabel(name) {
        const labels = this.config.pagerLabels || {};
        return labels[name];
    }

    _pagerRefusalTooDeep() {
        const max = this.config.maxJumpOffset;
        const fn = this._pagerLabel('tooDeep');
        if (typeof fn === 'function') return String(fn(max));
        if (typeof fn === 'string') return fn;
        return `Past ${Number(max).toLocaleString()} rows. Narrow the filters first.`;
    }

    _pagerButton(icon, name, tip, disabled, onClick, refusal = null) {
        const label = this._pagerLabel(name);
        const btn = this._createPaginationBtn(icon, typeof label === 'string' ? label : tip,
                                              disabled || !!refusal, onClick);
        btn.dataset.pager = name;
        if (typeof label === 'string' && label) {
            const span = document.createElement('span');
            span.className = 'twm-pagination-btn__label';
            span.textContent = label;
            btn.appendChild(span);
            btn.classList.add('twm-pagination-btn--labelled');
            btn.style.padding = '1px 6px 1px 3px';
            // NEVER NARROWER THAN ITS WORD. The pager's buttons carry a
            // `min-width` sized for a glyph (22px, `!important` in the compact
            // skin), and in a narrow tile the flex row shrank a labelled one
            // to it and clipped its word. Inline and `important`, because it
            // is the one declaration that must beat both skins.
            btn.style.setProperty('min-width', 'max-content', 'important');
            btn.style.flexShrink = '0';
        }
        if (refusal) {
            // The reason is ON the control, where a person looks and a test can
            // read it — not only in a tooltip.
            btn.dataset.refusal = refusal;
            btn.setAttribute('data-tooltip', refusal);
            btn.title = refusal;
        }
        return btn;
    }

    /**
     * THE PAGE ARITHMETIC, ONCE — read by the pager above the rows (0.7.0) and
     * by the `paging` strip under them (0.6.2), which each worked it out for
     * themselves. `held` is the rows drawn on this page; `total` a number or
     * null (unknown, when `hasMore` says whether there is a next page).
     *
     * @returns {{known: boolean, hasPrev: boolean, hasNext: boolean, page: number,
     *            pages: number|null, lastOffset: number|null, lastRefusal: string|null}}
     */
    _pageNav({ offset = 0, held = 0, total = null, hasMore = false, pageSize }) {
        const size = Math.max(1, pageSize | 0);
        const known = typeof total === 'number' && Number.isFinite(total);
        const lastOffset = known ? Math.floor(Math.max(0, total - 1) / size) * size : null;
        const maxJump = Number.isFinite(this.config.maxJumpOffset) ? this.config.maxJumpOffset : null;
        let lastRefusal = null;
        if (!known) {
            const words = this._pagerLabel('noLast');
            lastRefusal = typeof words === 'string' ? words : 'The total is not known, so there is no last page.';
        } else if (maxJump !== null && lastOffset > maxJump) {
            lastRefusal = this._pagerRefusalTooDeep();
        }
        return {
            known,
            hasPrev: offset > 0,
            hasNext: known ? offset + held < total : !!hasMore,
            page: Math.floor(offset / size) + 1,
            pages: known ? Math.max(1, Math.ceil(total / size)) : null,
            lastOffset,
            lastRefusal,
        };
    }

    /**
     * The pager for any mode, with the two things the 0.6 strip could not do:
     * an UNKNOWN total (no "of N", no last page, Next until a short page) and
     * a REFUSED deep jump (`maxJumpOffset`). For a known total its words are
     * the 0.6 strip's.
     */
    _createPager070() {
        const c = this.config;
        const { rows, pageSize } = c;
        const source = !!c.dataSource;
        const server = !source && typeof c.onPageChange === 'function';
        const src = this._source || { offset: 0, total: null, hasMore: false };
        const offset = source ? src.offset : server ? (c.offset || 0) : this._state.offset;
        let total;
        let hasMoreKnown;
        if (source) {
            total = src.total;
            hasMoreKnown = src.hasMore;
        } else if (server) {
            const unknown = c.totalCount == null && typeof c.hasMore === 'boolean';
            total = unknown ? null : (c.totalCount || rows.length);
            hasMoreKnown = unknown ? c.hasMore : null;
        } else {
            total = this._getProcessedRows().length;
            hasMoreKnown = null;
        }
        const known = typeof total === 'number' && Number.isFinite(total);
        const isFiltered = !source && !server && this._state.filters.size > 0;
        const unfilteredTotal = !source && !server ? rows.length : total;
        const drawn = source || server ? rows.length : Math.max(0, Math.min(pageSize, total - offset));
        const pn = this._pageNav({ offset, held: drawn, total, hasMore: hasMoreKnown, pageSize });
        const { hasPrev, hasNext, page } = pn;
        const totalPages = pn.pages;
        if (known && totalPages <= 1 && !isFiltered && !hasPrev) return this._createExportOnlyStrip();
        if (!known && !hasPrev && !hasNext) return this._createExportOnlyStrip();
        const maxJump = Number.isFinite(c.maxJumpOffset) ? c.maxJumpOffset : null;

        const go = (newOffset) => {
            if (this._stagedRefusal('Turning the page')) return;
            if (source) { this._sourceGoTo(newOffset); return; }
            if (server) { this._awaitWithSpinner(c.onPageChange(newOffset, pageSize)); return; }
            this._state.offset = newOffset;
            this._savePage();
            this.render();
        };

        const el = document.createElement('div');
        el.className = 'twm-pagination-controls';
        if (!known) el.classList.add('twm-pagination-controls--unknown-total');
        el.style.cssText = 'display:flex; align-items:center; gap:6px; padding:2px 8px; border-bottom:1px solid #2a2a2a; font-size:11px;';

        const info = document.createElement('span');
        info.className = 'twm-pagination-info';
        info.style.cssText = 'color:#aaa; white-space:nowrap;';
        const from = (offset + 1).toLocaleString();
        const to = (offset + drawn).toLocaleString();
        if (drawn === 0) {
            info.textContent = hasPrev ? `Page ${page} · no rows`
                : isFiltered ? `0 of ${unfilteredTotal.toLocaleString()} rows match` : 'No rows';
        } else if (!known) {
            info.textContent = `Rows ${from}–${to}`;
        } else if (isFiltered) {
            info.textContent = `Rows ${from}–${to} of ${total.toLocaleString()} (${unfilteredTotal.toLocaleString()} total)`;
        } else {
            info.textContent = `Rows ${from}–${to} of ${total.toLocaleString()}`;
        }

        const spacer = document.createElement('div');
        spacer.style.flex = '1';

        const firstBtn = this._pagerButton('first_page', 'first', 'First page', !hasPrev, () => go(0));
        const prevBtn = this._pagerButton('chevron_left', 'prev', 'Previous page', !hasPrev,
                                          () => go(Math.max(0, offset - pageSize)));
        const pageInfo = document.createElement('span');
        pageInfo.className = 'twm-pagination-page';
        pageInfo.style.cssText = 'color:#aaa; font-size:10px; min-width:72px; text-align:center;';
        pageInfo.textContent = known ? `Page ${page} of ${totalPages.toLocaleString()}` : `Page ${page}`;
        const nextBtn = this._pagerButton('chevron_right', 'next', 'Next page', !hasNext,
                                          () => go(offset + pageSize));
        const { lastOffset, lastRefusal } = pn;
        const lastBtn = this._pagerButton('last_page', 'last', 'Last page',
                                          !hasNext || lastOffset === offset, () => {
                                              if (lastOffset !== null) go(lastOffset);
                                          }, lastRefusal);

        const jumpInput = document.createElement('input');
        jumpInput.type = 'number';
        jumpInput.className = 'twm-pagination-input';
        jumpInput.style.cssText = 'width:54px; padding:1px 4px; border:1px solid #444; background:#2a2a2a; color:#ccc; font-size:10px;';
        jumpInput.min = '1';
        if (known) jumpInput.max = String(total);
        jumpInput.placeholder = 'Row #';
        const jumpBtn = this._createPaginationBtn(null, 'Go to row', false, () => {
            const target = Math.floor(Number(jumpInput.value));
            if (!Number.isFinite(target) || target < 1) return;
            const row = known ? Math.min(target, Math.max(1, total)) : target;
            const newOffset = Math.floor((row - 1) / pageSize) * pageSize;
            if (maxJump !== null && newOffset > maxJump) {
                // Refused, and says so where the person is looking.
                const why = this._pagerRefusalTooDeep();
                jumpInput.setAttribute('aria-invalid', 'true');
                jumpInput.title = why;
                jumpInput.dataset.refusal = why;
                return;
            }
            jumpInput.removeAttribute('aria-invalid');
            delete jumpInput.dataset.refusal;
            if (server && typeof c.onJumpToRow === 'function') { c.onJumpToRow(row - 1); return; }
            go(newOffset);
        }, 'Go');
        jumpBtn.dataset.pager = 'go';

        el.append(info, spacer, firstBtn, prevBtn, pageInfo, nextBtn, lastBtn, jumpInput, jumpBtn);
        if (c.showExportButton) el.appendChild(this._createExportBtn());
        return el;
    }

    // ─────────────────────────────────────────────────────────────────
    // 0.7.0 — filter controls that are not text boxes (#37)
    // ─────────────────────────────────────────────────────────────────

    /** The spec for a column, normalised: null for the 0.4 text box. */
    _filterKindFor(colIdx, header) {
        const fk = this.config.filterKinds;
        if (fk == null) return null;
        let spec;
        if (typeof fk === 'function') {
            try { spec = fk(colIdx, header); } catch (err) {
                console.error('[DataTable] filterKinds threw', err);
                spec = null;
            }
        } else {
            spec = perColumn(fk, colIdx);
        }
        if (spec == null || spec === 'text' || spec === false) return null;
        if (typeof spec === 'function') return { kind: 'custom', create: spec };
        if (typeof spec === 'object') {
            if (spec.kind === 'text') return null;
            if (spec.kind === 'chips') return spec;
            if (typeof spec.create === 'function') return { ...spec, kind: spec.kind || 'custom' };
        }
        if (spec === 'chips') return null;   // chips need options
        return null;
    }

    /** The column's control — built once, then the same element every render. */
    _filterControlFor(colIdx, header) {
        const spec = this._filterKindFor(colIdx, header);
        if (!spec) return null;
        const have = this._filterControls.get(colIdx);
        if (have && have.kind === spec.kind && have.specKey === (spec.options || spec.create)) {
            return have.control;
        }
        if (have) this._destroyOneControl(have.control);
        const value = this._state.filters.get(colIdx) ?? null;
        const ctx = {
            column: colIdx,
            header,
            value,
            counts: this._filterCounts.get(colIdx) ?? null,
            table: this,
            setValue: (v) => this.setFilter(colIdx, v),
        };
        let control = null;
        try {
            control = spec.kind === 'chips' ? createChipsFilter(ctx, spec) : spec.create(ctx);
        } catch (err) {
            console.error('[DataTable] filter control threw while being built', err);
            control = null;
        }
        if (typeof Node !== 'undefined' && control instanceof Node) control = { el: control };
        if (!control || !control.el) return null;
        control.el.classList?.add('twm-dt-filter-control');
        this._filterControls.set(colIdx, {
            kind: spec.kind, specKey: spec.options || spec.create, control,
            match: typeof control.match === 'function' ? control.match
                : spec.kind === 'chips' ? chipsMatch(spec) : null,
        });
        return control;
    }

    /** The client-side rule for a column with a control, or null. */
    _filterMatcher(colIdx) {
        if (!this._filterControls.size && this.config.filterKinds == null) return null;
        const entry = this._filterControls.get(colIdx);
        if (entry) return entry.match || defaultControlMatch;
        // A control not yet built (no render yet, a restore): the spec decides.
        const spec = this._filterKindFor(colIdx, (this.config.headers || [])[colIdx]);
        if (!spec) return null;
        return spec.kind === 'chips' ? chipsMatch(spec) : (spec.match || defaultControlMatch);
    }

    _isEmptyFilterValue(v) {
        if (v == null || v === '' || v === false) return true;
        if (Array.isArray(v)) return v.length === 0;
        if (typeof v === 'object' && !(v instanceof Date)) {
            return Object.values(v).every((x) => x == null || x === '');
        }
        return false;
    }

    _destroyOneControl(control) {
        try { control?.destroy?.(); } catch (err) { console.error('[DataTable] filter control destroy threw', err); }
        control?.el?.remove?.();
    }

    _destroyFilterControls() {
        for (const { control } of this._filterControls.values()) this._destroyOneControl(control);
        this._filterControls.clear();
    }

    _notifyFilterChange() {
        if (typeof this.config.onFilterChange !== 'function') return;
        try { this.config.onFilterChange(this._filterList()); } catch (err) {
            console.error('[DataTable] onFilterChange threw', err);
        }
    }

    /** The column filters in force: `[{column, header, value}]`. */
    getFilters() {
        return this._filterList();
    }

    /**
     * Set one column's filter (`null`, `''` or an empty array clears it). The
     * value is whatever the column's control works in — text for the 0.4 box.
     */
    setFilter(colIdx, value) {
        if (this._stagedRefusal('setFilter')) return;
        const textBox = !this._filterKindFor(colIdx, (this.config.headers || [])[colIdx]);
        const v = textBox && value != null && typeof value !== 'string' ? String(value) : value;
        if (textBox) {
            const filterRow = this._wrapperEl?.querySelector('.twm-data-table__filter-row');
            const cell = filterRow?.children[this._domIdxOf(colIdx)];
            const input = cell?.querySelector('.twm-data-table__filter-input');
            if (input) input.value = v || '';
        }
        this._onFilterInput(colIdx, v ?? '');
    }

    /**
     * Counts for a column's filter control — chips draw them beside each
     * option (keyed by the option's value; `''` is "no filter"), a dimmed
     * chip at zero. `setFilterCounts(colIdx, counts)`, or
     * `setFilterCounts({[colIdx]: counts})` for several. They are kept, so a
     * control built later starts with them.
     */
    setFilterCounts(colIdx, counts) {
        if (colIdx && typeof colIdx === 'object' && counts === undefined) {
            for (const [k, c] of Object.entries(colIdx)) this.setFilterCounts(Number(k), c);
            return;
        }
        const col = Number(colIdx);
        if (!Number.isInteger(col)) return;
        if (counts == null) this._filterCounts.delete(col); else this._filterCounts.set(col, counts);
        const entry = this._filterControls.get(col);
        if (entry) {
            try { entry.control.setCounts?.(counts ?? null); } catch (err) {
                console.error('[DataTable] filter control setCounts threw', err);
            }
        }
    }

    /** What `setFilterCounts` last gave a column, or null. */
    getFilterCounts(colIdx) {
        return this._filterCounts.get(Number(colIdx)) ?? null;
    }

    // ── focus across a render ──────────────────────────────────────────

    _captureFocus070(doc) {
        const active = doc?.activeElement;
        if (!active || active === doc.body) return null;
        for (const [colIdx, { control }] of this._filterControls) {
            if (control.el?.contains?.(active)) {
                let sel = null;
                try {
                    if (typeof active.selectionStart === 'number') sel = [active.selectionStart, active.selectionEnd];
                } catch (_) { /* not a text field */ }
                return { kind: 'control', colIdx, el: active, sel };
            }
        }
        // Inside an open detail (a button in it, a field): the detail is drawn
        // again by the render, so the same place in it — by its path under the
        // detail's host — gets the focus back (the release review).
        const detailHost = active.closest?.('.twm-dt-detail');
        if (detailHost && this._tbodyEl?.contains(detailHost)) {
            const tr = detailHost.closest('tr')?.__detailOf;
            if (tr && tr.__rowIndex !== undefined) {
                const path = [];
                for (let n = active; n && n !== detailHost; n = n.parentElement) {
                    path.unshift(Array.prototype.indexOf.call(n.parentElement.children, n));
                }
                let sel = null;
                try {
                    if (typeof active.selectionStart === 'number') sel = [active.selectionStart, active.selectionEnd];
                } catch (_) { /* not a text field */ }
                return { kind: 'detail', key: this._rowKey(tr.__row, tr.__rowIndex), path, tag: active.tagName, sel };
            }
        }
        const toggle = active.closest?.('.twm-dt-detail-toggle');
        if (toggle && this._tbodyEl?.contains(toggle)) {
            const tr = toggle.closest('tr');
            if (tr && tr.__rowIndex !== undefined) {
                return { kind: 'toggle', key: this._rowKey(tr.__row, tr.__rowIndex) };
            }
        }
        return null;
    }

    _restoreFocus070(f) {
        try {
            if (f.kind === 'control') {
                if (!f.el.isConnected) return;
                f.el.focus({ preventScroll: true });
                if (f.sel) f.el.setSelectionRange?.(f.sel[0], f.sel[1]);
            } else if (f.kind === 'detail' && f.key !== null) {
                let n = this._rowElByKey(f.key)?.__detail?.[0]?.querySelector('.twm-dt-detail');
                for (const i of f.path) n = n?.children[i];
                if (n && n.tagName === f.tag) {
                    n.focus({ preventScroll: true });
                    if (f.sel) n.setSelectionRange?.(f.sel[0], f.sel[1]);
                }
            } else if (f.kind === 'toggle' && f.key !== null) {
                const tr = this._rowElByKey(f.key);
                tr?.querySelector(':scope > td > .twm-dt-detail-toggle')?.focus({ preventScroll: true });
            }
        } catch (_) { /* detached */ }
    }

    /** The one row spanning every column that says there are no rows (or why
     *  they could not be read). Under `dataSource` the plain message is drawn
     *  by class, so it is quiet while the first answer is on its way. */
    _buildEmptyRow(colCount, emptyMessage) {
        const emptyTr = document.createElement('tr');
        emptyTr.className = 'data-preview-row data-table__empty-row';
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
        } else if (this.config.dataSource) {
            emptyTd.className = 'twm-data-table__empty-cell twm-data-table__empty-cell--state';
            emptyTd.textContent = emptyMessage;
        } else {
            emptyTd.style.cssText
                = 'text-align:center; font-style:italic; color:#888; padding:16px;';
            emptyTd.textContent = emptyMessage;
        }
        emptyTr.appendChild(emptyTd);
        return emptyTr;
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
        // STORY-0016. The select column, and whether the mode is on.
        if (this._gutter) names.push('twm-dt--select');
        if (this._selecting) names.push('twm-dt--selecting');
        // STORY-0003.
        if (this._cellGrid) names.push('twm-dt--cells');
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

    /**
     * What a column is drawn, sorted and filtered BY: its type, except that a
     * 'date', 'datetime' or 'duration' counts only when it was DECLARED through
     * `columnTypes`. In 0.4, whatever `getColumnType` returned was the cells'
     * class name and nothing more (only 'num' changed the sort and the
     * filter), so a consumer that returned 'date' there to style its cells gets
     * exactly 0.4 — its `formatValue`, its text sort, its text filter — and
     * the class name it asked for.
     */
    _valueKind(colIdx) {
        const t = this._columnTypes?.[colIdx];
        if (!TYPED_COLUMNS.has(t)) return t;
        const declared = Array.isArray(this.config.columnTypes) ? this.config.columnTypes[colIdx] : null;
        return declared === t ? t : 'text';
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
     *
     * The listeners go in `_activationOffs`, not `_disposers`, and a render
     * retires them a task late (`_retireActivation`): a press whose selection
     * callback re-draws the table still opens the row it pressed — the row
     * as it was drawn (`tr.__row`), with its original index.
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
            // A table disposed by the press (its selection callback threw the
            // list away) opens nothing.
            if (!this._wrapperEl || typeof this.config.onRowActivate !== 'function') return;
            // STORY-0016. In select mode a gesture ticks; nothing opens.
            if (this._selecting) return;
            try { this.config.onRowActivate(tr.__rowIndex, tr.__row, ev); } catch (err) {
                console.error('[DataTable] onRowActivate threw', err);
            }
        };
        const rowFor = (ev) => {
            const tr = ev.target?.closest?.('tr');
            return tr && tr.__rowIndex !== undefined && tbody.contains(tr) ? tr : null;
        };
        const listen = (el, type, fn) => {
            el.addEventListener(type, fn);
            this._activationOffs.push(() => el.removeEventListener(type, fn));
        };
        if (on.has('click')) {
            listen(tbody, 'click', (ev) => {
                if (ev.button != null && ev.button !== 0) return;
                const tr = rowFor(ev);
                if (!tr || !isRowActivation(ev, 'click', { scope })) return;
                if (multi && (ev.shiftKey || ev.ctrlKey || ev.metaKey)) return;
                // 'single': a Ctrl click that took the row back OFF the
                // selection does not also open it (the selection handler, bound
                // first, said so on the event).
                if (DESELECTING_CLICKS.has(ev)) return;
                fire(tr, ev);
            });
        }
        if (on.has('dblclick')) {
            listen(tbody, 'dblclick', (ev) => {
                const tr = rowFor(ev);
                if (!tr || !isRowActivation(ev, 'dblclick', { scope })) return;
                fire(tr, ev);
            });
        }
        if (on.has('enter')) {
            listen(table, 'keydown', (ev) => {
                if (ev.key !== 'Enter' || ev.isComposing) return;
                if (ev.ctrlKey || ev.metaKey || ev.altKey || ev.shiftKey) return;
                if (isRowControl(ev.target, table)) return;
                const tr = this._currentRowEl();
                if (!tr) return;
                ev.preventDefault();
                fire(tr, ev);
            });
        }
    }

    /**
     * The row Enter opens: the SELECTED one — the one row selected, or the
     * selection's anchor — because that is the row a person just chose (a
     * double-click opens the row it lands on, and Enter must agree with it);
     * the open row (`activeRow`) only when nothing is selected. A selected row
     * that is not drawn (another page) opens nothing rather than a different
     * row.
     */
    _currentRowEl() {
        const tbody = this._tbodyEl;
        if (!tbody) return null;
        const selected = this._state.selected;
        let idx = null;
        if (selected.size === 1) idx = [...selected][0];
        else if (this._state.anchorIndex != null && selected.has(this._state.anchorIndex)) {
            idx = this._state.anchorIndex;
        }
        if (idx != null) return this.getRowElement(idx);
        if (this._activeKey !== null) {
            for (const tr of tbody.children) {
                if (tr.__rowIndex !== undefined && tr.classList.contains('twm-dt-row--active')) return tr;
            }
        }
        return null;
    }

    /** 0.6.1. The `diff` answer for one row, or `null` when there is none or
     *  its status is not one this component draws. */
    _diffOf(row, rowIdx) {
        if (typeof this.config.diff !== 'function') return null;
        const answer = this.config.diff(row, rowIdx);
        if (!answer || !DIFF_STATUSES.has(answer.status)) return null;
        return answer;
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
        // 0.6.1 `diff`: the row's status, taken off again first like `rowClass`.
        for (const c of [...tr.classList]) {
            if (c === 'twm-dt-diff' || c.startsWith('twm-dt-diff--')) tr.classList.remove(c);
        }
        const diff = this._diffOf(row, rowIdx);
        if (diff) tr.classList.add('twm-dt-diff', `twm-dt-diff--${diff.status}`);
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
        // 0.7.0 `follow`/`refresh`: a row the last answer did not have.
        if (this._newKeys) {
            tr.classList.toggle('twm-dt-row--new', this._newKeys.has(this._rowKey(row, rowIdx)));
        }
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
        // `aria-current` is taken off only where THIS component wrote it. A
        // consumer that marks its open row itself (0.4 had no mark of its own,
        // and `updateRow` re-decorates a row) keeps the attribute it set.
        if (on) {
            if (tr.getAttribute('aria-current') !== 'true') {
                tr.setAttribute('aria-current', 'true');
                tr.__twmAriaCurrent = true;
            }
        } else if (tr.__twmAriaCurrent) {
            tr.__twmAriaCurrent = false;
            if (!(tr.__twmAttrs || []).includes('aria-current')) tr.removeAttribute('aria-current');
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
        const kind = this._valueKind(colIdx);
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
        // 0.7.0 `filterKinds`: A FILTER CONTROL IS IN THE MEASURE. The text
        // boxes stay out (an `<input>`'s default width would set every
        // column), but a control — the Level chips with their counts — is
        // drawn at its NARROWEST (`min-content`: the widest chip) for this
        // reflow, so the label row's width above already spans it, and that
        // narrowest width is kept as the column's FLOOR for the fit pass,
        // which would otherwise squeeze the column under one chip in a narrow
        // tile and cut it off. Above the floor the cell wraps its chips.
        const floors = new Array(cols).fill(0);
        const filterRow = headerTable.querySelector('thead > tr.twm-data-table__filter-row--controls');
        if (filterRow) {
            for (let i = 0; i < cols && i < filterRow.children.length; i++) {
                const th = filterRow.children[i];
                if (!th.classList.contains('data-table__filter-cell--control')) continue;
                const el = th.firstElementChild;
                if (!el) continue;
                const cs = getComputedStyle(th);
                const pad = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0)
                    + (parseFloat(cs.borderLeftWidth) || 0) + (parseFloat(cs.borderRightWidth) || 0);
                floors[i] = Math.ceil(el.getBoundingClientRect().width / zoom + pad);
                natural[i] = Math.max(natural[i], floors[i]);
            }
        }
        this._filterFloors = floors;

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
        if (!natural || domIdx < this._lead().select || domIdx >= natural.length) return false;
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
        for (let i = this._lead().select; i < natural.length; i++) {
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
        for (let i = this._lead().select; i < n; i++) {
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
        const lead = this._lead().all;
        const firstIdx = lead && n > lead ? lead : 0;
        const widths = this._fitColumnWidths(natural, avail, {
            firstIdx,
            // STORY-0016. The select column is as wide as its controls, always.
            overrides: this._gutter ? { ...this._colWidths, 0: this._selectColWidth() } : this._colWidths,
            fit: this.config.columnFit,
            floors: this._filterFloors,
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
        // 0.7.0: a column's own floor (its filter control's narrowest width,
        // `_measureNaturalWidths`) — never squeezed below it, even when the
        // table then scrolls sideways.
        const floors = Array.isArray(opts.floors) ? opts.floors : [];
        const floorOf = (i) => Math.max(FLOOR, Math.ceil(floors[i] || 0));
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
            for (const i of shrinkable) widths[i] = floorOf(i);
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
                    widths[shrinkable[j]] = Math.max(level, floorOf(shrinkable[j]));
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
            if (th.classList.contains('twm-dt-select-cell')) return;   // STORY-0016: fixed
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
            // 0.7.0: a row's detail — and anything drawn inside it — is not a
            // clipped cell of the table.
            if (td.closest?.('.twm-dt-detail-row')) return;
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
        // STORY-0010. The consumer's own items install the menu by themselves.
        const customMenu = this.config.contextMenuItems != null;
        const tbody = this._tbodyEl;
        const table = this._tableEl;

        // STORY-0003. Cell mode: the cells' own pointer and keys, bound before
        // the activation, detail and copy listeners so a key it takes stops.
        // The row click below is not cell mode's.
        if (this._cellGrid) this._cellGrid.install(tbody, table);

        if (selectable && !this._cellGrid) {
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
                    else DESELECTING_CLICKS.add(event);   // so it does not ALSO open it
                    this._state.anchorIndex = selected.size ? idx : null;
                } else if (this._selecting) {
                    // STORY-0016. A plain click ticks one row; Shift adds the
                    // range from the last row ticked, as SHOWN.
                    if (event.shiftKey && this._state.anchorIndex != null) {
                        const order = this._processedIndexMap || this.config.rows.map((_, i) => i);
                        const a = order.indexOf(this._state.anchorIndex);
                        const b = order.indexOf(idx);
                        if (a >= 0 && b >= 0) {
                            for (let i = Math.min(a, b); i <= Math.max(a, b); i++) selected.add(order[i]);
                        } else selected.add(idx);
                    } else if (selected.has(idx)) selected.delete(idx);
                    else selected.add(idx);
                    this._state.anchorIndex = idx;
                    this._navCursor = idx;
                    this._markCursor();
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

        // STORY-0010 `onRowKeyDown`. Bound BEFORE every keydown listener of the
        // table's own (Enter's activation, the detail keys, copy, `keyboardNav`),
        // so a key the consumer takes stops here.
        if (typeof this.config.onRowKeyDown === 'function') {
            const onRowKey = (ev) => {
                if (ev.isComposing || isRowControl(ev.target, table)) return;
                const tr = this._currentRowEl();
                let handled = false;
                try {
                    handled = this.config.onRowKeyDown(tr ? tr.__rowIndex : null, tr ? tr.__row : null, ev) === true;
                } catch (err) {
                    console.error('[DataTable] onRowKeyDown threw', err);
                }
                if (handled) {
                    ev.preventDefault();
                    ev.stopImmediatePropagation();
                }
            };
            table.addEventListener('keydown', onRowKey);
            this._disposers.push(() => table.removeEventListener('keydown', onRowKey));
        }

        // STORY-0010 `keyboardNav`: the arrows move the selection through the
        // rows of the page, in the order shown.
        if (this.config.keyboardNav && selectable) {
            const NAV_KEYS = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
            const onNavKey = (ev) => {
                if (!NAV_KEYS.includes(ev.key) || ev.ctrlKey || ev.metaKey || ev.altKey) return;
                if (isRowControl(ev.target, table)) return;
                const order = this._pageOrder();
                if (!order.length) return;
                ev.preventDefault();
                const selected = this._state.selected;
                // Where the arrows left off, while that row is still selected;
                // else the anchor (a click since moved it).
                const cur = this._navCursor != null && (this._selecting || selected.has(this._navCursor))
                    ? this._navCursor : this._state.anchorIndex;
                let pos = order.indexOf(cur);
                if (ev.key === 'Home') pos = 0;
                else if (ev.key === 'End') pos = order.length - 1;
                else if (pos === -1) pos = ev.key === 'ArrowDown' ? 0 : order.length - 1;
                else pos = Math.max(0, Math.min(order.length - 1, pos + (ev.key === 'ArrowDown' ? 1 : -1)));
                const idx = order[pos];
                this._navCursor = idx;
                const anchorPos = order.indexOf(this._state.anchorIndex);
                if (this._selecting) {
                    // STORY-0016. The arrows move the cursor; the ticks stay.
                    // Shift ticks the rows passed over.
                    if (ev.shiftKey) {
                        const from = order.indexOf(cur);
                        if (from >= 0) {
                            for (let i = Math.min(from, pos); i <= Math.max(from, pos); i++) selected.add(order[i]);
                        } else selected.add(idx);
                        this._updateRowSelection();
                        this._notifySelectionChange();
                    }
                    this._state.anchorIndex = idx;
                    this._markCursor();
                    this.scrollToRow(idx);
                    return;
                }
                if (ev.shiftKey && selectable !== 'single' && anchorPos !== -1) {
                    // Shift: the range between the fixed anchor and the moving
                    // row, as Shift-click selects it.
                    const [a, b] = anchorPos <= pos ? [anchorPos, pos] : [pos, anchorPos];
                    selected.clear();
                    for (let i = a; i <= b; i++) selected.add(order[i]);
                } else {
                    selected.clear();
                    selected.add(idx);
                    this._state.anchorIndex = idx;
                }
                this._updateRowSelection();
                this._notifySelectionChange();
                this.scrollToRow(idx);
            };
            table.addEventListener('keydown', onNavKey);
            this._disposers.push(() => table.removeEventListener('keydown', onNavKey));
        }

        // STORY-0016. Space ticks the keyboard's row in select mode.
        if (this._gutter) {
            const onSpace = (ev) => {
                if (!this._selecting || ev.key !== ' ' || ev.ctrlKey || ev.metaKey || ev.altKey) return;
                if (isRowControl(ev.target, table)) return;
                const idx = this._navCursor ?? this._state.anchorIndex;
                if (idx == null || !this.config.rows[idx]) return;
                ev.preventDefault();
                const selected = this._state.selected;
                if (selected.has(idx)) selected.delete(idx); else selected.add(idx);
                this._state.anchorIndex = idx;
                this._updateRowSelection();
                this._notifySelectionChange();
            };
            table.addEventListener('keydown', onSpace);
            this._disposers.push(() => table.removeEventListener('keydown', onSpace));
            this._paintSelectHead();
            this._markCursor();
        }

        // 0.5.0 `onRowActivate`. Bound AFTER the selection handler on the same
        // element, so a row is selected before it is opened — the listener
        // order is the guarantee. `onRowClick` stays exactly where it was (on
        // the `<tr>`, before the selection), for whoever already relies on that.
        if (typeof this.config.onRowActivate === 'function') {
            this._installActivation(tbody, table);
        }

        // 0.7.0 `rowDetail` from the keyboard: on the focused table (or a row's
        // toggle), ArrowRight opens the current row's detail and ArrowLeft
        // closes it — the tree-grid keys. The toggle itself is a button, so
        // Enter and Space work on it as on any button.
        if (this._detailOn()) {
            const onDetailKey = (ev) => {
                if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft') return;
                if (ev.ctrlKey || ev.metaKey || ev.altKey || ev.shiftKey) return;
                const toggle = ev.target?.closest?.('.twm-dt-detail-toggle');
                let tr = null;
                if (toggle && table.contains(toggle)) tr = toggle.closest('tr');
                else if (ev.target === table) tr = this._currentRowEl();
                if (!tr || tr.__rowIndex === undefined) return;
                if (this._setRowElExpanded(tr, ev.key === 'ArrowRight', ev)) ev.preventDefault();
            };
            table.addEventListener('keydown', onDetailKey);
            this._disposers.push(() => table.removeEventListener('keydown', onDetailKey));
        }

        if (copyable || customMenu) {
            const handleContextMenu = (event) => {
                const rowEl = event.target.closest('tr');
                if (!rowEl) {
                    this._hideContextMenu();
                    return;
                }
                // 0.7.0: inside a row's detail, the page's own menu (copy the
                // text a person selected there), not the table's.
                if (rowEl.closest('.twm-dt-detail-row')) {
                    this._hideContextMenu();
                    return;
                }

                // STORY-0010. The consumer's items, asked with the selection the
                // right-click is about to make, so `ctx` describes the rows the
                // person will act on. None, and no copy items: the page's menu.
                const idx = rowEl.__rowIndex;
                let custom = null;
                if (customMenu) {
                    // STORY-0016. In select mode the menu is about the ticked
                    // rows when the row is one of them, else about that row
                    // alone — and the ticks stay as they were.
                    const selection = idx !== undefined && !this._state.selected.has(idx)
                        ? [idx] : this.getSelection();
                    const ctx = this._contextMenuCtxFor(rowEl, event.target, selection);
                    custom = { ctx, items: this._customMenuItems(ctx) };
                }
                if (!copyable && !custom.items.length) {
                    this._hideContextMenu();
                    return;
                }

                event.preventDefault();
                event.stopPropagation();

                if (idx !== undefined && !this._state.selected.has(idx) && !this._selecting) {
                    this._state.selected.clear();
                    this._state.selected.add(idx);
                    this._state.anchorIndex = idx;
                    this._updateRowSelection();
                    this._notifySelectionChange();
                }

                try { table.focus({ preventScroll: true }); } catch (_) {}
                setTimeout(() => this._showContextMenu(event.clientX, event.clientY, custom), 0);
            };

            tbody.addEventListener('contextmenu', handleContextMenu);
            this._disposers.push(() => tbody.removeEventListener('contextmenu', handleContextMenu));
        }

        if (copyable) {

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
                        this._selectAllShown();
                    } else if (key === 'c') {
                        event.preventDefault();
                        this.copyToClipboard(event.shiftKey ? 'csv' : 'tsv');
                    }
                } else if (event.key === 'Escape') {
                    if (this._state.selected.size) {
                        this.clearSelection();
                    } else if (this._selecting && this.config.selectToggle) {
                        this.setSelectMode(false);   // STORY-0016
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
                const on = this._state.selected.has(idx);
                tr.classList.toggle('selected', on && !this._cellGrid);
                // STORY-0016.
                const box = this._gutter ? tr.querySelector(':scope > td.twm-dt-select-cell > input') : null;
                if (box) box.checked = on;
            }
        });
        this._paintSelectHead();
    }

    /* ── STORY-0016: select mode ─────────────────────────────────────── */

    /** Whether the table is in select mode. */
    isSelectMode() {
        return !!this._selecting;
    }

    /**
     * Turn select mode on or off. The ticks are kept either way (a selection
     * is a selection); the consumer clears it if leaving means "never mind".
     * Does nothing on a table without the select column.
     *
     * @param {boolean} on
     * @returns {boolean} whether the mode changed
     */
    setSelectMode(on) {
        if (!this._gutter || !!on === this._selecting) return false;
        this._selecting = !!on;
        this._navCursor = this._selecting ? this._state.anchorIndex : null;
        if (this._wrapperEl) this.render();
        try { this.config.onSelectModeChange?.(this._selecting); } catch (err) {
            console.error('[DataTable] onSelectModeChange threw', err);
        }
        return true;
    }

    /** The rows the filters let through, on every page, by original index. */
    _shownIndices() {
        if (this._isServerSide()) return this.config.rows.map((_, i) => i);
        this._getProcessedRows();
        return this._processedIndexMap ? [...this._processedIndexMap] : this.config.rows.map((_, i) => i);
    }

    /** Ctrl+A and the select-all box: every row the filters let through. */
    _selectAllShown() {
        this._state.selected.clear();
        for (const i of this._shownIndices()) this._state.selected.add(i);
        this._state.anchorIndex = this.config.rows.length - 1;
        this._updateRowSelection();
        this._notifySelectionChange();
    }

    /** The select column's width: its controls, never a drag. */
    _selectColWidth() {
        return this._selecting ? (this.config.selectToggle ? 56 : 32) : 32;
    }

    /** The select column's header: the toggle and, in the mode, select-all. */
    _buildSelectHead() {
        const th = document.createElement('th');
        th.className = 'twm-dt-select-cell twm-dt-select-head';
        if (this._selecting) {
            const all = document.createElement('input');
            all.type = 'checkbox';
            all.className = 'twm-dt-select-all';
            all.setAttribute('aria-label', 'Select all rows');
            all.title = 'Select all rows';
            all.addEventListener('click', (ev) => {
                // Not prevented: the browser would undo the state set here.
                ev.stopPropagation();
                const shown = this._shownIndices();
                const every = shown.length > 0 && shown.every((i) => this._state.selected.has(i));
                if (every) this.clearSelection(); else this._selectAllShown();
            });
            th.appendChild(all);
        }
        if (this.config.selectToggle) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'material-symbols-outlined twm-dt-select-toggle';
            btn.textContent = this._selecting ? 'close' : 'checklist';
            btn.setAttribute('aria-pressed', this._selecting ? 'true' : 'false');
            const label = this._selecting ? 'Stop selecting' : 'Select multiple';
            btn.setAttribute('aria-label', label);
            btn.title = label;
            btn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                this.setSelectMode(!this._selecting);
            });
            th.appendChild(btn);
        }
        th.classList.toggle('twm-dt-select-head--on', this._selecting);
        return th;
    }

    /** The select-all box: checked, mixed or clear, as the ticks are. */
    _paintSelectHead() {
        if (!this._gutter || !this._wrapperEl) return;
        const all = this._wrapperEl.querySelector('.twm-dt-select-all');
        if (!all) return;
        const shown = this._shownIndices();
        const n = shown.filter((i) => this._state.selected.has(i)).length;
        all.checked = n > 0 && n === shown.length;
        all.indeterminate = n > 0 && n < shown.length;
    }

    /** The keyboard's row in select mode, marked so it can be seen. */
    _markCursor() {
        if (!this._tbodyEl) return;
        for (const tr of this._tbodyEl.children) {
            if (tr.__rowIndex === undefined) continue;
            tr.classList.toggle('twm-dt-row--cursor', this._selecting && tr.__rowIndex === this._navCursor);
        }
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
        menu.innerHTML = COPY_MENU_HTML;
        document.body.appendChild(menu);

        menu.addEventListener('click', (event) => {
            const item = event.target.closest('.twm-context-menu-item');
            if (!item || item.classList.contains('disabled')) return;
            // STORY-0010. One of the consumer's items: dispatched off the item
            // itself, not `data-action`, so an action is free to be called
            // 'copy-tsv'. The menu goes first — the action may open a dialog.
            if (item.__cmItem) {
                event.stopPropagation();
                event.preventDefault();
                const ctx = this._contextMenuCtx;
                this._hideContextMenu();
                // STORY-0012. The column chooser's own items.
                if (typeof item.__cmItem.onChoose === 'function') { item.__cmItem.onChoose(); return; }
                if (!ctx || typeof this.config.onContextMenuAction !== 'function') return;
                try { this.config.onContextMenuAction(item.__cmItem.action, ctx.rowIdx, ctx.row, ctx); } catch (err) {
                    console.error('[DataTable] onContextMenuAction threw', err);
                }
                return;
            }
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

    _showContextMenu(clientX, clientY, custom = null) {
        const menu = this._ensureContextMenu();
        this._drawContextMenuItems(menu, custom);
        this._armContextMenuGlobals();
        const hasSelection = this._state.selected.size > 0;

        // The copy items need a selection; a consumer's item says for itself.
        menu.querySelectorAll('.twm-context-menu-item').forEach(item => {
            if (item.__cmItem) return;
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

    /**
     * STORY-0010. The `ctx` handed to `contextMenuItems` and, later, to
     * `onContextMenuAction`: the right-clicked row and cell, and `selection`
     * (original indices, ascending) with its rows 1:1.
     */
    _contextMenuCtxFor(rowEl, target, selection) {
        const rows = this.config.rows || [];
        const rowIdx = rowEl.__rowIndex === undefined ? null : rowEl.__rowIndex;
        const row = rowIdx === null ? null : (rows[rowIdx] ?? null);
        // The DATA column under the pointer. Only a cell of THIS row counts (a
        // `renderCell` may plant a table of its own), and the row-number gutter
        // is no data column.
        let colIdx = null;
        const cellEl = target?.closest?.('td');
        if (cellEl && cellEl.parentNode === rowEl) {
            const domIdx = Array.prototype.indexOf.call(rowEl.children, cellEl);
            const dataIdx = this._dataIdxOfDom(domIdx);
            if (dataIdx !== null) colIdx = dataIdx;
        }
        const sel = [...selection].sort((a, b) => a - b);
        return {
            rowIdx,
            row,
            colIdx,
            value: colIdx !== null && row ? row[colIdx] : null,
            selection: sel,
            selectedRows: sel.map((i) => rows[i]),
        };
    }

    /** STORY-0010. `contextMenuItems` for one right-click: none off a data row
     *  (the empty row), and none from a function that threw. */
    _customMenuItems(ctx) {
        if (ctx.rowIdx === null) return [];
        const spec = this.config.contextMenuItems;
        let items = spec;
        if (typeof spec === 'function') {
            try { items = spec(ctx.row, ctx.rowIdx, ctx); } catch (err) {
                console.error('[DataTable] contextMenuItems threw', err);
                items = null;
            }
        }
        return Array.isArray(items) ? items.filter(Boolean) : [];
    }

    /**
     * STORY-0010. Fill the menu for this right-click: the consumer's items,
     * then (with `copyable`) a separator and the copy items. Without custom
     * items the menu is the 0.9.1 copy menu, and is only rebuilt when the last
     * right-click drew custom ones into it. Built with DOM calls, not markup:
     * the labels are the consumer's text.
     */
    _drawContextMenuItems(menu, custom) {
        this._contextMenuCtx = custom ? custom.ctx : null;
        if (!custom) {
            if (this._contextMenuCustom) {
                menu.innerHTML = COPY_MENU_HTML;
                this._contextMenuCustom = false;
            }
            return;
        }
        this._contextMenuCustom = true;
        menu.textContent = '';
        for (const item of custom.items) {
            if (item.separator) {
                const sep = document.createElement('div');
                sep.className = 'twm-context-menu__separator';
                menu.appendChild(sep);
                continue;
            }
            const el = document.createElement('div');
            el.className = 'twm-context-menu-item';
            if (item.action != null) el.setAttribute('data-action', String(item.action));
            if (item.danger) el.classList.add('twm-delete-node');
            if (item.disabled) {
                el.classList.add('disabled');
                el.style.pointerEvents = 'none';
                el.setAttribute('aria-disabled', 'true');
            }
            if (item.title) el.title = String(item.title);
            // STORY-0012. The column chooser's items say whether they are on.
            if (typeof item.checked === 'boolean') {
                el.setAttribute('role', 'menuitemcheckbox');
                el.setAttribute('aria-checked', String(item.checked));
            }
            const icon = document.createElement('span');
            icon.className = 'material-symbols-outlined';
            icon.textContent = item.icon == null ? '' : String(item.icon);
            const label = document.createElement('span');
            label.className = 'label';
            label.textContent = item.label == null ? '' : String(item.label);
            el.append(icon, label);
            el.__cmItem = item;
            menu.appendChild(el);
        }
        if (this.config.copyable && custom.copy !== false) {
            if (custom.items.length) {
                const sep = document.createElement('div');
                sep.className = 'twm-context-menu__separator';
                menu.appendChild(sep);
            }
            menu.insertAdjacentHTML('beforeend', COPY_MENU_HTML);
        }
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
