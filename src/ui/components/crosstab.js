/**
 * crosstab.js — STORY-0091. DataTable's CROSSTAB LAYOUT (`crosstab`).
 * INTERNAL to the table: imported by `data_table.js` only, and not part of the
 * widgets barrel — it reads the table's private fields.
 *
 * `crosstab: {labelColumns, headerRows, emptyLabel}` draws the table as a
 * matrix: k rows of spanned headers over the body columns, the leading
 * `labelColumns` drawn data columns as row labels, and the whole of it in ONE
 * `<table>` in ONE scroller. The consumer hands over every value and every
 * label — rows and columns that add others up, their words and their classes
 * (`rowClass`, `cellClass`, a header cell's `className`) are the consumer's;
 * this module only lays the cells out and pins them.
 *
 * ── ONE TABLE, ONE SCROLLER ───────────────────────────────────────────────
 *
 * The ordinary DataTable lifts its `<thead>` into a header table of its own
 * above the body's scroll box and copies the body's widths onto it. A header
 * of spans breaks that copy (every width pass reads the header CELL BY CELL at
 * the column's index), and two scrollers cannot pin a label column in both the
 * header and the body. So here the `<thead>` stays in the body table and
 * pinning is `position: sticky` against the body's scroll box (`_tableWrapEl`),
 * the only box that scrolls: the header rows to the top, the label columns
 * (with the row number and select columns in front of them) to the left, and
 * the corner — the header cells over the label columns — to both. No header
 * table is built, so no width pass, resize grip, header menu or group row of
 * the split layout runs.
 *
 * ── OFFSETS ARE MEASURED, NOT ASSUMED ─────────────────────────────────────
 *
 * A sticky header row needs its own `top`: the height of every header row
 * above it. A sticky label column needs its own `left`: the width of every
 * pinned column before it. Both are read after layout (`pin()`, on the frame
 * after a render) and again whenever a header row or a pinned header cell
 * changes size (a label that wraps, a font, a zoom) through a ResizeObserver.
 * They are read with `getBoundingClientRect`, which keeps the fraction
 * `offsetHeight` rounds away, and scaled back out of any CSS zoom, because
 * `style.top`/`style.left` are written in the unzoomed space inside it.
 *
 * ── AN EMPTY AXIS ─────────────────────────────────────────────────────────
 *
 * With no body column at all the table still draws: one column headed
 * `emptyLabel` ('(none)'), an empty cell under it in every row, and no spanned
 * header rows. It is no data column (`_dataIdxOfDom` answers null for it).
 *
 * A table without `crosstab` never builds this.
 */

import { createRafResizeObserver } from '../utils/raf_resize_observer.js';
import { normalizeSpans, blankSpanCell, labelSpanCell } from './column_groups.js';

const DEFAULT_EMPTY_LABEL = '(none)';

/** The CSS zoom an element is drawn in, as the factor that takes a measured
 *  (zoomed) length back to the space `style` lengths are written in. */
function unzoom(el) {
    return 1 / (el?.currentCSSZoom || 1);
}

export class Crosstab {
    /** @param {import('./data_table.js').DataTable} table */
    constructor(table) {
        this.table = table;
        /** The pinned columns' `left`, by drawn index, as last measured. */
        this._lefts = [];
        this._leafRow = null;
    }

    _spec() {
        const s = this.table.config.crosstab;
        return s && typeof s === 'object' ? s : {};
    }

    /** How many of the drawn data columns are row labels: the leading ones. */
    labelCount() {
        const k = Math.floor(Number(this._spec().labelColumns) || 0);
        return Math.max(0, Math.min(k, this.table._shownColumns().length));
    }

    /** The drawn columns that pin to the left: the select and row-number
     *  columns, and the label columns. */
    pinnedCount() {
        return this.table._lead().all + this.labelCount();
    }

    /** The drawn data columns after the label columns, in order. */
    bodyColumns() {
        return this.table._shownColumns().slice(this.labelCount());
    }

    /** Columns drawn that are no data column: the empty axis's one. */
    extraColumns() {
        return this.bodyColumns().length ? 0 : 1;
    }

    /** The header rows as drawn: per row, `{cell, span}` runs over the body
     *  columns (`cell` null for a run in no cell of that row). None for an
     *  empty axis. */
    headerRuns() {
        const body = this.bodyColumns();
        if (!body.length) return [];
        const spec = this._spec().headerRows;
        const n = this.table.config.headers?.length || 0;
        return (Array.isArray(spec) ? spec : []).map((rowSpec) => {
            const cells = normalizeSpans(rowSpec, n);
            const cellOf = new Map();
            cells.forEach((c) => { for (const col of c.columns) cellOf.set(col, c); });
            const runs = [];
            for (const col of body) {
                const cell = cellOf.get(col) || null;
                const last = runs[runs.length - 1];
                if (last && last.cell === cell) last.span++;
                else runs.push({ cell, span: 1, rowSpec });
            }
            return runs;
        });
    }

    /** STORY-0091. A body row: its pinned cells marked and put at the measured
     *  offsets (a row the virtual window draws later lines up at once), and
     *  the empty axis's cell. */
    fillRow(tr) {
        if (this.extraColumns()) {
            const td = document.createElement('td');
            td.className = 'twm-dt-crosstab__none';
            tr.appendChild(td);
        }
        this._pinRowCells(tr);
    }

    _pinRowCells(tr) {
        const p = this.pinnedCount();
        for (let j = 0; j < p && j < tr.children.length; j++) {
            const cell = tr.children[j];
            cell.classList.add('twm-dt-pin');
            if (j === p - 1) cell.classList.add('twm-dt-pin--last');
            cell.__pinCol = j;
            if (this._lefts[j] != null) cell.style.left = `${this._lefts[j]}px`;
        }
    }

    /**
     * After `_createTable`: the header rows above the column headers, the
     * corner, the pinned header cells and the empty axis's header — all in the
     * body table's own `<thead>`.
     */
    decorate(tableEl) {
        this._leafRow = null;
        const thead = tableEl?.querySelector('thead');
        const leaf = thead?.querySelector('tr');
        if (!leaf) return;
        tableEl.classList.add('twm-dt-crosstab');
        this._leafRow = leaf;
        leaf.classList.add('twm-dt-crosstab__leaf');
        const filters = [...thead.querySelectorAll('tr.twm-data-table__filter-row')];
        if (this.extraColumns()) {
            const th = document.createElement('th');
            th.className = 'text twm-dt-crosstab__none';
            const label = this._spec().emptyLabel;
            th.textContent = label == null ? DEFAULT_EMPTY_LABEL : String(label);
            leaf.appendChild(th);
            for (const tr of filters) {
                const cell = document.createElement('th');
                cell.className = 'data-table__filter-cell data-table__filter-cell--empty twm-dt-crosstab__none';
                tr.appendChild(cell);
            }
        }
        for (const tr of [leaf, ...filters]) this._pinRowCells(tr);

        const levels = this.headerRuns();
        const p = this.pinnedCount();
        levels.forEach((runs, r) => {
            const tr = document.createElement('tr');
            tr.className = 'twm-dt-crosstab__band';
            // THE CORNER: one cell per pinned column, spanning every header
            // row down to the column headers, so each pins at its own `left`.
            if (r === 0) {
                for (let j = 0; j < p; j++) {
                    const th = document.createElement('th');
                    th.className = 'twm-dt-crosstab__corner twm-dt-pin';
                    if (j === p - 1) th.classList.add('twm-dt-pin--last');
                    th.rowSpan = levels.length;
                    th.__pinCol = j;
                    tr.appendChild(th);
                }
            }
            for (const run of runs) tr.appendChild(this._bandCell(run));
            thead.insertBefore(tr, leaf);
        });
    }

    /** A header row's cell: STORY-0066's spanning cells, the consumer's
     *  `className` and `title` on a labelled one. */
    _bandCell({ cell, span, rowSpec }) {
        if (!cell) return blankSpanCell(span);
        const own = rowSpec[cell.index];
        const th = labelSpanCell(span, cell.label, own?.title == null ? cell.label : String(own.title));
        if (own?.className) this.table._addClasses(th, own.className);
        return th;
    }

    /**
     * Once the table is in the document: pin now (a layout already there is
     * used at once), on the next frame (when it has settled), and whenever a
     * header row, a pinned header cell or the table's box changes size. The
     * observer goes with the render (`_disposers`).
     *
     * The split layout's own resize observer and settle frame hang off its
     * header table, which a crosstab has none of; so the virtual window's
     * re-measure and resize (`_virtRemeasure`, `_virtUpdate`) run from here.
     */
    install() {
        const table = this.table;
        const tableEl = table._tableEl;
        if (!tableEl || !this._leafRow) return;
        this.pin();
        requestAnimationFrame(() => {
            if (table._tableEl !== tableEl) return;
            this.pin();
            table._virtRemeasure();
        });
        if (typeof ResizeObserver === 'undefined') return;
        const observer = createRafResizeObserver(() => {
            if (table._tableEl !== tableEl) return;
            this.pin();
            table._virtUpdate();
        });
        if (table._wrapperEl) observer.observe(table._wrapperEl);
        const thead = tableEl.querySelector('thead');
        for (const tr of thead.querySelectorAll('tr')) observer.observe(tr);
        for (let j = 0; j < this.pinnedCount(); j++) {
            const cell = this._leafRow.children[j];
            if (cell) observer.observe(cell);
        }
        table._disposers.push(() => {
            try { observer.disconnect(); } catch (_) { /* gone */ }
        });
    }

    /** Measure and write every offset: each header row's `top`, each pinned
     *  column's `left`. */
    pin() {
        const tableEl = this.table._tableEl;
        const thead = tableEl?.querySelector('thead');
        if (!thead || !this._leafRow) return;
        const rows = [...thead.rows];
        const scale = unzoom(thead);
        const origin = rows[0].getBoundingClientRect().top;
        for (const tr of rows) {
            const top = Math.max(0, (tr.getBoundingClientRect().top - origin) * scale);
            const css = `${+top.toFixed(2)}px`;
            for (const th of tr.cells) th.style.top = css;
        }

        const p = this.pinnedCount();
        const lefts = [0];
        for (let j = 1; j < p; j++) {
            const cell = this._leafRow.children[j - 1];
            const w = cell ? cell.getBoundingClientRect().width * scale : 0;
            lefts[j] = +(lefts[j - 1] + w).toFixed(2);
        }
        this._lefts = p ? lefts : [];
        for (const cell of tableEl.querySelectorAll('.twm-dt-pin')) {
            const left = this._lefts[cell.__pinCol];
            if (left != null) cell.style.left = `${left}px`;
        }
        this._lockColumns(scale);
    }

    /**
     * Under `virtualize` the rows drawn change with every scroll, and with
     * them the widths an automatic layout gives the columns. The first pass
     * that sees a layout writes the widths it measured on the column headers
     * into the `<colgroup>` and fixes the layout, so the columns hold still.
     * No layout (every width 0) is no measurement, and nothing is written.
     */
    _lockColumns(scale) {
        const cols = this.table._cols();
        const tableEl = this.table._tableEl;
        if (!cols || !tableEl || tableEl.__crosstabLocked) return;
        const cells = this._leafRow.children;
        if (cells.length !== cols.length) return;
        const widths = [...cells].map((c) => c.getBoundingClientRect().width * scale);
        if (!widths.every((w) => w > 0)) return;
        widths.forEach((w, i) => { cols[i].style.width = `${+w.toFixed(2)}px`; });
        tableEl.style.tableLayout = 'fixed';
        tableEl.style.width = `${+widths.reduce((a, b) => a + b, 0).toFixed(2)}px`;
        tableEl.__crosstabLocked = true;
    }
}
