/**
 * cell_selection.js — STORY-0003. DataTable's CELL MODE (`selectionMode:
 * 'cells'`): a cursor cell, a range from an anchor to that cursor, the keys
 * that move them, and the editing gestures on top.
 *
 * Two pieces, kept apart so the rules can be tested without a table:
 *
 *   CellSelection  the model — an anchor and a focus (the cursor), and every
 *                  move the keyboard makes, over whatever rows and columns it
 *                  is given. No DOM.
 *   CellGrid       DataTable's half: it reads the table's rows and columns,
 *                  paints the cells, listens to the pointer and the keys, and
 *                  drives the editor (`cell_editor_host.js`).
 *
 * ══ COORDINATES ═════════════════════════════════════════════════════════
 *
 * A cell is `{row, col}`. `row` is the row's POSITION in the order shown — the
 * index into `getDisplayedRows()`, after the sort and the filters — because a
 * range is a rectangle on the screen, not in the data. `col` is the DATA column
 * index (the one `headers`, `renderCell` and `hiddenColumns` use); a range
 * spans the columns SHOWN between its two edges, so a hidden column inside it
 * is not part of it. The cursor moves only over the rows of the page drawn.
 *
 * A table without `selectionMode: 'cells'` never builds either piece.
 */

import { CellEditorHost, createTextEditor } from './cell_editor_host.js';

/** Is this a cell somebody filled? What Ctrl+arrow stops at. */
export function isFilledValue(value) {
    if (value == null) return false;
    if (typeof value === 'string') return value !== '';
    if (typeof value === 'number') return !Number.isNaN(value);
    return true;
}

/**
 * The selection model. Rows are positions `first..last`; columns are the data
 * indices in `cols`, in the order they are shown. Both are handed in on every
 * move (`setBounds`), because a filter, a page or a hidden column changes them
 * under a selection that has to survive.
 */
export class CellSelection {
    constructor() {
        /** @type {{row:number, col:number}|null} */
        this.anchor = null;
        /** @type {{row:number, col:number}|null} the cursor */
        this.focus = null;
        this.first = 0;
        this.last = -1;
        this.cols = [];
    }

    /** The rows (positions, inclusive) and columns (data indices, shown order)
     *  the cursor may stand on. A selection outside them is pulled in. */
    setBounds(first, last, cols) {
        this.first = first;
        this.last = last;
        this.cols = Array.isArray(cols) ? cols.slice() : [];
        if (this.isEmptyGrid()) {
            this.anchor = null;
            this.focus = null;
            return;
        }
        if (this.focus) this.focus = this._clamp(this.focus);
        if (this.anchor) this.anchor = this._clamp(this.anchor);
    }

    isEmptyGrid() {
        return this.last < this.first || this.cols.length === 0;
    }

    _ord(col) {
        const i = this.cols.indexOf(col);
        return i >= 0 ? i : 0;
    }

    _clamp({ row, col }) {
        const r = Math.max(this.first, Math.min(this.last, row));
        const c = this.cols.includes(col) ? col
            : this.cols[Math.max(0, Math.min(this.cols.length - 1, this._nearestOrd(col)))];
        return { row: r, col: c };
    }

    /** A column that is not shown any more: the shown one nearest its index. */
    _nearestOrd(col) {
        let best = 0;
        for (let i = 0; i < this.cols.length; i++) if (this.cols[i] <= col) best = i;
        return best;
    }

    _inside(row, ord) {
        return row >= this.first && row <= this.last && ord >= 0 && ord < this.cols.length;
    }

    /** Put the cursor on one cell and collapse the range onto it. */
    setCursor(row, col) {
        if (this.isEmptyGrid()) return false;
        this.focus = this._clamp({ row, col });
        this.anchor = { ...this.focus };
        return true;
    }

    /** Move the cursor to a cell and keep the anchor: the range grows. */
    extendTo(row, col) {
        if (!this.anchor) return this.setCursor(row, col);
        if (this.isEmptyGrid()) return false;
        this.focus = this._clamp({ row, col });
        return true;
    }

    _go(cell, extend) {
        return extend ? this.extendTo(cell.row, cell.col) : this.setCursor(cell.row, cell.col);
    }

    /** One step: the arrows. At an edge the cursor stays put. */
    move(dRow, dCol, { extend = false } = {}) {
        if (!this.focus) return this.setCursor(this.first, this.cols[0]);
        const ord = Math.max(0, Math.min(this.cols.length - 1, this._ord(this.focus.col) + dCol));
        const row = Math.max(this.first, Math.min(this.last, this.focus.row + dRow));
        return this._go({ row, col: this.cols[ord] }, extend);
    }

    /**
     * Ctrl+arrow: to the edge of the block of filled cells, as a spreadsheet
     * does. From a filled cell whose neighbour is filled, to the last filled
     * cell of that run; otherwise to the next filled cell along the line, or
     * the edge of the grid when there is none.
     *
     * @param {number} dRow  -1, 0 or 1
     * @param {number} dCol  -1, 0 or 1
     * @param {(row:number, col:number) => boolean} filled
     */
    jump(dRow, dCol, filled, { extend = false } = {}) {
        if (!this.focus) return this.setCursor(this.first, this.cols[0]);
        let r = this.focus.row;
        let o = this._ord(this.focus.col);
        const isFilled = (row, ord) => !!filled(row, this.cols[ord]);
        if (this._inside(r + dRow, o + dCol)) {
            if (isFilled(r, o) && isFilled(r + dRow, o + dCol)) {
                while (this._inside(r + dRow, o + dCol) && isFilled(r + dRow, o + dCol)) {
                    r += dRow; o += dCol;
                }
            } else {
                r += dRow; o += dCol;
                while (!isFilled(r, o) && this._inside(r + dRow, o + dCol)) {
                    r += dRow; o += dCol;
                }
            }
        }
        return this._go({ row: r, col: this.cols[o] }, extend);
    }

    /** Home / End: the first or last column of the cursor's row; with
     *  `corner` (Ctrl), the first or last cell of the grid. */
    lineEnd(toEnd, { extend = false, corner = false } = {}) {
        if (!this.focus) return this.setCursor(this.first, this.cols[0]);
        const col = toEnd ? this.cols[this.cols.length - 1] : this.cols[0];
        const row = corner ? (toEnd ? this.last : this.first) : this.focus.row;
        return this._go({ row, col }, extend);
    }

    /** Tab: one cell right, wrapping to the first cell of the next row (Shift:
     *  left, wrapping to the last cell of the row before). The last cell of
     *  the grid (the first, going back) stays put. */
    tab(back = false) {
        if (!this.focus) return this.setCursor(this.first, this.cols[0]);
        let row = this.focus.row;
        let ord = this._ord(this.focus.col) + (back ? -1 : 1);
        if (ord >= this.cols.length) {
            if (row >= this.last) return this.setCursor(row, this.focus.col);
            row += 1; ord = 0;
        } else if (ord < 0) {
            if (row <= this.first) return this.setCursor(row, this.focus.col);
            row -= 1; ord = this.cols.length - 1;
        }
        return this.setCursor(row, this.cols[ord]);
    }

    /** Every cell of the grid: from its first cell to its last, which is
     *  where the cursor goes. */
    selectAll() {
        if (this.isEmptyGrid()) return false;
        this.anchor = { row: this.first, col: this.cols[0] };
        this.focus = { row: this.last, col: this.cols[this.cols.length - 1] };
        return true;
    }

    /** The range collapses onto the cursor. */
    collapse() {
        if (!this.focus) return false;
        const was = this.anchor && (this.anchor.row !== this.focus.row || this.anchor.col !== this.focus.col);
        this.anchor = { ...this.focus };
        return !!was;
    }

    clear() {
        this.anchor = null;
        this.focus = null;
    }

    /** `{top, bottom, left, right, columns}` — rows as positions, `left` and
     *  `right` and `columns` as data indices — or null with nothing selected. */
    range() {
        if (!this.focus || !this.anchor) return null;
        const a = this._ord(this.anchor.col);
        const b = this._ord(this.focus.col);
        const lo = Math.min(a, b);
        const hi = Math.max(a, b);
        return {
            top: Math.min(this.anchor.row, this.focus.row),
            bottom: Math.max(this.anchor.row, this.focus.row),
            left: this.cols[lo],
            right: this.cols[hi],
            columns: this.cols.slice(lo, hi + 1),
        };
    }

    contains(row, col) {
        const r = this.range();
        if (!r || row < r.top || row > r.bottom) return false;
        return r.columns.includes(col);
    }

    isCursor(row, col) {
        return !!this.focus && this.focus.row === row && this.focus.col === col;
    }
}

/** The keys a printable character is: one character, no Ctrl, Cmd or Alt. */
function isPrintable(ev) {
    return typeof ev.key === 'string' && [...ev.key].length === 1
        && !ev.ctrlKey && !ev.metaKey && !ev.altKey;
}

/** The arrows, as steps. */
const ARROWS = {
    ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1],
};

/**
 * DataTable's cell mode. Built by the table when `selectionMode` is 'cells';
 * it reads the table, never the other way round, except through the few hooks
 * the table calls (`decorateRow`, `install`, `rowLeaving`, `isEditing`).
 */
export class CellGrid {
    /** @param {import('./data_table.js').DataTable} table */
    constructor(table) {
        this.table = table;
        this.sel = new CellSelection();
        /** `rowIdx:colIdx` → value typed, while its commit is out. */
        this.pending = new Map();
        /** `rowIdx:colIdx` → {value, message}: a commit that was refused. */
        this.errors = new Map();
        /** A `render()` asked for while an editor was open. */
        this.renderWaiting = false;
        /** Bumped by every new set of rows, so a commit that outlived its rows
         *  marks nothing in the new ones. */
        this.generation = 0;
        this.editor = new CellEditorHost({
            onCommit: (s, value, move, reason) => this._committed(s, value, move, reason),
            onCancel: (s, reason) => this._closed(s, reason),
        });
    }

    // ── what the table is, read through its own helpers ──────────────────

    _cfg() { return this.table.config; }

    /** The data columns shown, in the order shown. */
    columns() {
        const n = this._cfg().headers?.length || 0;
        const out = [];
        for (let c = 0; c < n; c++) if (!this.table._isHidden(c)) out.push(c);
        return out;
    }

    /** The positions of the rows on the page drawn, `[first, last]`. */
    span() {
        const s = this.table._pageSpan || { start: 0, count: 0 };
        return [s.start, s.start + s.count - 1];
    }

    _sync() {
        const [first, last] = this.span();
        this.sel.setBounds(first, last, this.columns());
    }

    /** A position's original row index (the `__rowIndex` space). */
    rowIndexAt(pos) {
        const t = this.table;
        if (t._isServerSide()) return (t.config.dataSource ? 0 : (t.config.offset || 0)) + pos;
        t._getProcessedRows();
        return t._processedIndexMap?.[pos] ?? pos;
    }

    rowAt(pos) {
        return this.table._getProcessedRows()[pos] ?? null;
    }

    valueAt(pos, col) {
        const row = this.rowAt(pos);
        return row ? row[col] : undefined;
    }

    /** The `<td>` drawing a cell, or null when it is not drawn. */
    cellEl(pos, col) {
        const tr = this.table.getRowElement(this.rowIndexAt(pos));
        if (!tr) return null;
        for (const td of tr.children) if (td.__colIdx === col) return td;
        return null;
    }

    // ── the public face (DataTable delegates) ────────────────────────────

    /** `{anchor, focus, range}`; each cell is `{row, col, rowIdx}`, and the
     *  range also lists its `rows` (original indices) and `columns`. */
    get() {
        this._sync();
        const cell = (c) => (c ? { row: c.row, col: c.col, rowIdx: this.rowIndexAt(c.row) } : null);
        const r = this.sel.range();
        let range = null;
        if (r) {
            const rows = [];
            for (let p = r.top; p <= r.bottom; p++) rows.push(this.rowIndexAt(p));
            range = { ...r, rows };
        }
        return { anchor: cell(this.sel.anchor), focus: cell(this.sel.focus), range };
    }

    /** Rows (original indices) the range touches, ascending. */
    rowIndices() {
        const r = this.sel.range();
        if (!r) return [];
        const out = [];
        for (let p = r.top; p <= r.bottom; p++) out.push(this.rowIndexAt(p));
        return out.sort((a, b) => a - b);
    }

    /** Select from `anchor` to `focus` (`{row, col}`, positions and data
     *  indices), or put the cursor on `focus` alone. */
    set(focus, anchor = null) {
        this._sync();
        if (!focus) { this.sel.clear(); this._changed(); return; }
        this.sel.setCursor(anchor ? anchor.row : focus.row, anchor ? anchor.col : focus.col);
        if (anchor) this.sel.extendTo(focus.row, focus.col);
        this._changed({ reveal: true });
    }

    /** `setSelection(indices)` in cell mode: whole rows, the first to the last
     *  of them as shown. */
    selectRows(indices) {
        this._sync();
        const t = this.table;
        t._getProcessedRows();
        const map = t._processedIndexMap || [];
        const positions = indices.map((i) => (t._isServerSide()
            ? i - (t.config.dataSource ? 0 : (t.config.offset || 0)) : map.indexOf(i)))
            .filter((p) => p >= 0);
        const cols = this.sel.cols;
        if (!positions.length || !cols.length) { this.sel.clear(); this._changed(); return; }
        this.sel.setCursor(Math.min(...positions), cols[0]);
        this.sel.extendTo(Math.max(...positions), cols[cols.length - 1]);
        this._changed();
    }

    clear() {
        this.sel.clear();
        this._changed();
    }

    /** New rows (`setData({rows})`): the marks were about the old ones. */
    newRows() {
        this.generation++;
        this.pending.clear();
        this.errors.clear();
    }

    isEditing() {
        return !!this.editor.session;
    }

    // ── painting ─────────────────────────────────────────────────────────

    /** Called for every row drawn — on render, on a scroll, on `updateRow` —
     *  so a row that arrives later is painted like the rest. */
    decorateRow(tr) {
        const pos = tr.__cellPos;
        if (pos === undefined) return;
        const rowIdx = tr.__rowIndex;
        for (const td of tr.children) {
            const col = td.__colIdx;
            if (col === undefined) continue;
            this._paintCell(td, pos, col);
            const key = `${rowIdx}:${col}`;
            const err = this.errors.get(key);
            const waiting = this.pending.has(key);
            if (err || waiting) {
                td.textContent = this.table._formatValue(err ? err.value : this.pending.get(key), col);
            }
            td.classList.toggle('twm-dt-cell--pending', waiting);
            td.classList.toggle('twm-dt-cell--error', !!err);
            if (err) {
                td.title = err.message;
                td.setAttribute('data-error', err.message);
            } else td.removeAttribute('data-error');
        }
    }

    _paintCell(td, pos, col) {
        td.classList.toggle('twm-dt-cell--selected', this.sel.contains(pos, col));
        const cursor = this.sel.isCursor(pos, col);
        td.classList.toggle('twm-dt-cell--cursor', cursor);
        if (cursor) td.setAttribute('aria-selected', 'true');
        else td.removeAttribute('aria-selected');
    }

    paint() {
        const tbody = this.table._tbodyEl;
        if (!tbody) return;
        for (const tr of tbody.children) {
            const pos = tr.__cellPos;
            if (pos === undefined) continue;
            for (const td of tr.children) {
                if (td.__colIdx !== undefined) this._paintCell(td, pos, td.__colIdx);
            }
        }
    }

    /** The selection moved: the cells, the rows `getSelection()` answers, and
     *  whoever listens. */
    _changed({ reveal = false } = {}) {
        const t = this.table;
        if (reveal && this.sel.focus) t.scrollToRow(this.rowIndexAt(this.sel.focus.row));
        this.paint();
        const before = t.getSelection().join();
        const rows = this.rowIndices();
        t._state.selected.clear();
        for (const i of rows) t._state.selected.add(i);
        t._state.anchorIndex = this.sel.anchor ? this.rowIndexAt(this.sel.anchor.row) : null;
        if (rows.join() !== before) t._notifySelectionChange();
        try { t.config.onCellSelectionChange?.(this.get()); } catch (err) {
            console.error('[DataTable] onCellSelectionChange threw', err);
        }
    }

    // ── the pointer and the keys ─────────────────────────────────────────

    /** Bound by `_installInteractions` on every render, BEFORE the table's own
     *  activation, detail and copy listeners, so a key the cell mode takes
     *  goes no further. Listeners go on the table's disposers. */
    install(tbody, table) {
        const t = this.table;
        const on = (el, type, fn) => {
            el.addEventListener(type, fn);
            t._disposers.push(() => el.removeEventListener(type, fn));
        };
        this._sync();
        const cellOf = (target) => {
            const td = target?.closest?.('td');
            if (!td || td.__colIdx === undefined || !tbody.contains(td)) return null;
            const tr = td.parentNode;
            if (tr?.__cellPos === undefined) return null;
            return { td, row: tr.__cellPos, col: td.__colIdx };
        };
        const inEditor = (target) => !!this.editor.session && this.editor.session.td.contains(target);

        on(tbody, 'click', (ev) => {
            if (ev.button != null && ev.button !== 0) return;
            if (inEditor(ev.target)) return;
            const hit = cellOf(ev.target);
            if (!hit) return;
            this._sync();
            if (ev.shiftKey && this.sel.anchor) this.sel.extendTo(hit.row, hit.col);
            else this.sel.setCursor(hit.row, hit.col);
            this._changed();
            try { table.focus({ preventScroll: true }); } catch (_) { /* detached */ }
        });
        on(tbody, 'dblclick', (ev) => {
            if (inEditor(ev.target)) return;
            const hit = cellOf(ev.target);
            if (!hit || !this.canEdit(hit.row, hit.col)) return;
            this._sync();
            this.sel.setCursor(hit.row, hit.col);
            this._changed();
            if (this.open(hit.row, hit.col)) ev.stopImmediatePropagation();
        });
        // A right-click outside the range moves the cursor there first, so the
        // table's own menu (bound after this) finds its row already selected.
        on(tbody, 'contextmenu', (ev) => {
            if (inEditor(ev.target)) return;
            const hit = cellOf(ev.target);
            if (!hit || this.sel.contains(hit.row, hit.col)) return;
            this._sync();
            this.sel.setCursor(hit.row, hit.col);
            this._changed();
        });
        on(table, 'keydown', (ev) => {
            if (ev.isComposing || inEditor(ev.target)) return;
            if (ev.target !== table && ev.target?.closest?.('input, select, textarea, button, [contenteditable="true"]')) return;
            if (this._onKey(ev)) {
                ev.preventDefault();
                ev.stopImmediatePropagation();
            }
        });
        // An editor that was open across a render of its row (an `updateRow`)
        // is still the editor; the paint follows the model.
        this.paint();
    }

    /** One key on the focused table. Returns whether the cell mode took it. */
    _onKey(ev) {
        this._sync();
        const ctrl = ev.ctrlKey || ev.metaKey;
        const k = ev.key;
        if (ARROWS[k] && !ev.altKey) {
            const [dr, dc] = ARROWS[k];
            if (ctrl) {
                this.sel.jump(dr, dc, (r, c) => isFilledValue(this.valueAt(r, c)), { extend: ev.shiftKey });
            } else this.sel.move(dr, dc, { extend: ev.shiftKey });
            this._changed({ reveal: true });
            return true;
        }
        if ((k === 'Home' || k === 'End') && !ev.altKey) {
            this.sel.lineEnd(k === 'End', { extend: ev.shiftKey, corner: ctrl });
            this._changed({ reveal: true });
            return true;
        }
        if (k === 'Tab' && !ctrl && !ev.altKey) {
            this.sel.tab(ev.shiftKey);
            this._changed({ reveal: true });
            return true;
        }
        if (ctrl && !ev.altKey && String(k).toLowerCase() === 'a') {
            this.sel.selectAll();
            this._changed();
            return true;
        }
        if (k === 'Escape') {
            this.sel.collapse();
            this._changed();
            this.table._hideContextMenu();
            return true;
        }
        const f = this.sel.focus;
        if (!f) return false;
        if ((k === 'F2' || (k === 'Enter' && !ctrl && !ev.altKey && !ev.shiftKey)) && this.canEdit(f.row, f.col)) {
            return this.open(f.row, f.col);
        }
        if (isPrintable(ev) && this.canEdit(f.row, f.col)) {
            return this.open(f.row, f.col, { initialText: ev.key });
        }
        return false;
    }

    // ── editing ──────────────────────────────────────────────────────────

    /** Whether a cell opens an editor: `editable` says so for its column. */
    canEdit(pos, col) {
        const spec = this._cfg().editable;
        if (!spec) return false;
        if (spec === true) return true;
        if (Array.isArray(spec)) return spec.includes(col);
        if (typeof spec === 'function') {
            try { return !!spec(col, this.rowAt(pos), this.rowIndexAt(pos)); } catch (err) {
                console.error('[DataTable] editable threw', err);
                return false;
            }
        }
        return false;
    }

    /** The column's type, as `editors` is keyed by: the declared one, else the
     *  detected one. */
    _typeOf(col) {
        const declared = this._cfg().columnTypes?.[col];
        return declared || this.table._columnTypes?.[col] || 'text';
    }

    _factoryFor(col) {
        const editors = this._cfg().editors;
        if (editors && typeof editors === 'object') {
            if (typeof editors[col] === 'function') return editors[col];
            const type = this._typeOf(col);
            if (typeof editors[type] === 'function') return editors[type];
        }
        return createTextEditor;
    }

    /**
     * Open the editor on a cell (position, data column). Brings the row into
     * view first. Returns whether an editor opened.
     */
    open(pos, col, { initialText = null } = {}) {
        if (this.editor.session || !this.canEdit(pos, col)) return false;
        this.table.scrollToRow(this.rowIndexAt(pos));
        const td = this.cellEl(pos, col);
        if (!td) return false;
        const row = this.rowAt(pos);
        const rowIdx = this.rowIndexAt(pos);
        const headers = this._cfg().headers || [];
        return this.editor.open({
            td,
            factory: this._factoryFor(col),
            pos, colIdx: col, rowIdx, row,
            generation: this.generation,
            value: row ? row[col] : undefined,
            column: { index: col, header: headers[col], type: this._typeOf(col) },
            initialText,
        });
    }

    /** The virtual window is taking a row out: an editor in it commits, as a
     *  click elsewhere would — what was typed is not thrown away. */
    rowLeaving(tr) {
        const s = this.editor.session;
        if (s && tr.contains(s.td)) this.editor.commit(null, 'scroll');
    }

    dispose() {
        this.editor.cancel('dispose');
        this.renderWaiting = false;
    }

    /** After every close: focus back on the table when the keyboard closed it,
     *  and the render that waited for the editor. */
    _closed(s, reason) {
        const t = this.table;
        if (reason === 'dispose') return;
        if (reason === 'key' || reason === 'editor') {
            try { t._tableEl?.focus({ preventScroll: true }); } catch (_) { /* detached */ }
        }
        if (this.renderWaiting) {
            this.renderWaiting = false;
            t.render();
        }
    }

    _redraw(rowIdx, row) {
        const t = this.table;
        if (!t.getRowElement(rowIdx)) return;
        if (row) t.updateRow(rowIdx, row);
    }

    _committed(s, value, move, reason) {
        if (move) {
            this._sync();
            if (move === 'down' || move === 'up') this.sel.move(move === 'down' ? 1 : -1, 0);
            else this.sel.tab(move === 'left');
            this._changed({ reveal: true });
        }
        const live = s.generation === this.generation;
        const key = `${s.rowIdx}:${s.colIdx}`;
        if (Object.is(value, s.previous)) {
            this._closed(s, reason);
            return;
        }
        const fn = this._cfg().onCellCommit;
        const finish = (result) => {
            if (!live || s.generation !== this.generation) return;
            this.pending.delete(key);
            if (result && result.ok === false) {
                this.errors.set(key, { value, message: String(result.error ?? 'Not saved') });
            } else {
                this.errors.delete(key);
                if (Array.isArray(s.row)) s.row[s.colIdx] = value;
            }
            this._redraw(s.rowIdx, s.row);
        };
        const refused = (err) => ({ ok: false, error: err?.message || String(err ?? 'Not saved') });
        let result;
        if (typeof fn === 'function') {
            try {
                result = fn({ rowIdx: s.rowIdx, colIdx: s.colIdx, value, previous: s.previous });
            } catch (err) {
                result = refused(err);
            }
        }
        if (result && typeof result.then === 'function') {
            if (live) {
                this.pending.set(key, value);
                this.errors.delete(key);
                this._redraw(s.rowIdx, s.row);
            }
            this._closed(s, reason);
            result.then(finish, (err) => finish(refused(err)));
            return;
        }
        finish(result);
        this._closed(s, reason);
    }
}
