/**
 * cell_grid.js — STORY-0003. DataTable's half of the CELL MODE
 * (`selectionMode: 'cells'`). INTERNAL to the table: imported by
 * `data_table.js` only, and not part of the widgets barrel — it reads the
 * table's private fields.
 *
 * It reads the table's rows and columns, paints the cells, listens to the
 * pointer and the keys, moves the selection model (`cell_selection.js`
 * `CellSelection`) and drives the editor (`cell_editor_host.js`).
 *
 * A table without `selectionMode: 'cells'` never builds it.
 */

import { CellSelection } from './cell_selection.js';
import { CellEditorHost, createTextEditor } from './cell_editor_host.js';
import { StagedEdits } from './staged_edits.js';

/** Is this a cell somebody filled? What Ctrl+arrow stops at. */
export function isFilledValue(value) {
    if (value == null) return false;
    if (typeof value === 'string') return value !== '';
    if (typeof value === 'number') return !Number.isNaN(value);
    return true;
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
        /** `rowIdx`s whose redraw waits for the editor open in the row to
         *  close: a settled commit's, or the consumer's `updateRow`. The row
         *  is read when it is drawn, so the newest data is what shows. */
        this.rowsWaiting = new Set();
        /** `rowIdx:colIdx` → the token of the cell's newest commit, so an
         *  older commit settling late does not take the newer one's marks. */
        this.latest = new Map();
        /** Bumped by every new set of rows, so a commit that outlived its rows
         *  marks nothing in the new ones. */
        this.generation = 0;
        this.editor = new CellEditorHost({
            onCommit: (s, value, move, reason) => this._committed(s, value, move, reason),
            onCancel: (s, reason) => this._closed(s, reason),
        });
        /** STORY-0088 `staged`: commits are staged here instead of sent. */
        this.staged = null;
        if (this._cfg().staged) {
            if (this._cfg().editable) this.staged = new StagedEdits(this);
            else console.warn('[DataTable] `staged` needs `editable`; ignored.');
        }
    }

    // ── what the table is, read through its own helpers ──────────────────

    _cfg() { return this.table.config; }

    /** The data columns shown, in the order shown. */
    columns() {
        return this.table._shownColumns();
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

    /**
     * The row the table holds NOW for an original row index — the window's
     * row list, else `config.rows` at the place the table draws it from —
     * the one `updateRow` writes. Never a row captured earlier.
     */
    currentRow(rowIdx) {
        const t = this.table;
        const local = t._virtLocalOf(rowIdx);
        if (local >= 0) return t._virt.rows[local] ?? null;
        const rows = t.config.rows;
        if (!Array.isArray(rows)) return null;
        const at = t._isServerSide() ? rowIdx - (t.config.dataSource ? 0 : (t.config.offset || 0)) : rowIdx;
        return rows[at] ?? null;
    }

    /** What a cell shows: a refused or pending commit's value, else the row's. */
    shownValue(rowIdx, col) {
        const key = `${rowIdx}:${col}`;
        const err = this.errors.get(key);
        if (err) return err.value;
        if (this.pending.has(key)) return this.pending.get(key);
        if (this.staged?.has(key)) return this.staged.value(key);
        const row = this.currentRow(rowIdx);
        return row ? row[col] : undefined;
    }

    /** Whether the open editor sits in this row element. */
    _holds(tr) {
        const s = this.editor.session;
        return !!s && !!tr && tr.contains(s.td);
    }

    /**
     * `updateRow` on a drawn row: the table has stored the data already. When
     * the row holds the open editor the rebuild — which would take the editor
     * out of the document — waits for that editor to close, the editor's cell
     * left as it is. Returns whether it waits.
     */
    holdRow(tr, rowIdx) {
        if (!this._holds(tr)) return false;
        this.rowsWaiting.add(rowIdx);
        return true;
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
        this.latest.clear();
        this.rowsWaiting.clear();
        this.staged?.clear();
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
        for (const td of tr.children) {
            if (td.__colIdx !== undefined) this._decorateCell(td, pos, tr.__rowIndex, td.__colIdx);
        }
    }

    /** One cell: the selection, its commit's pending or refused mark, and
     *  (STORY-0088) its staged value and a refused batch's mark. */
    _decorateCell(td, pos, rowIdx, col) {
        this._paintCell(td, pos, col);
        const key = `${rowIdx}:${col}`;
        const err = this.errors.get(key);
        const waiting = this.pending.has(key);
        const staged = !!this.staged?.has(key);
        if (err || waiting) {
            td.textContent = this.table._formatValue(err ? err.value : this.pending.get(key), col);
        } else if (staged) {
            td.textContent = this.table._formatValue(this.staged.value(key), col);
        }
        const message = err ? err.message : this.staged?.errors.get(key);
        td.classList.toggle('twm-dt-cell--pending', waiting);
        td.classList.toggle('twm-dt-cell--staged', staged);
        td.classList.toggle('twm-dt-cell--error', message != null);
        if (message != null) {
            td.title = message;
            td.setAttribute('data-error', message);
        } else td.removeAttribute('data-error');
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
        // STORY-0088. The new controls are held while cells are staged.
        this.staged?.paintFreeze();
    }

    /** One key on the focused table. Returns whether the cell mode took it. */
    _onKey(ev) {
        this._sync();
        const ctrl = ev.ctrlKey || ev.metaKey;
        const k = ev.key;
        // STORY-0088. Ctrl+Z takes a staged edit back; Ctrl+Y (Ctrl+Shift+Z)
        // puts it back. Taken even with nothing to undo: the browser's own
        // undo has nothing to do on a table either.
        if (this.staged && ctrl && !ev.altKey) {
            const lower = String(k).toLowerCase();
            if (lower === 'z' && !ev.shiftKey) { this.staged.undo(); return true; }
            if (lower === 'y' || (lower === 'z' && ev.shiftKey)) { this.staged.redo(); return true; }
        }
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
            // On the last cell (the first, going back) Tab is not taken:
            // focus moves on out of the table, as Tab says.
            if (this.sel.tabEnds(ev.shiftKey)) return false;
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
        // STORY-0088. While a staged batch is out, nothing new is typed into it.
        if (this.staged?.committing) return false;
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
        const rowIdx = this.rowIndexAt(pos);
        const row = this.currentRow(rowIdx);
        const headers = this._cfg().headers || [];
        // The editor holds what the cell SHOWS — a refused or pending value,
        // not the row's — so it is what the person sees that they edit.
        return this.editor.open({
            td,
            factory: this._factoryFor(col),
            pos, colIdx: col, rowIdx, row,
            generation: this.generation,
            value: this.shownValue(rowIdx, col),
            column: { index: col, header: headers[col], type: this._typeOf(col) },
            initialText,
        });
    }

    /** The virtual window is taking a row out: an editor in it commits, as a
     *  click elsewhere would — what was typed is not thrown away. An editor
     *  with no `getValue` has nothing to commit, and is cancelled. */
    rowLeaving(tr) {
        const s = this.editor.session;
        if (s && tr.contains(s.td)) this.editor.commit(null, 'scroll');
    }

    dispose() {
        this.editor.cancel('dispose');
        this.renderWaiting = false;
        this.rowsWaiting.clear();
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
            this.rowsWaiting.clear();   // the render draws every row
            // A commit made by the virtual window taking the row out is made
            // in the middle of the window's own redraw, which a render would
            // pull out from under it: that one waits for the redraw to end.
            if (reason === 'scroll') queueMicrotask(() => { if (t._wrapperEl) t.render(); });
            else t.render();
            return;
        }
        if (this.rowsWaiting.size) {
            const flush = () => {
                const waiting = [...this.rowsWaiting];
                this.rowsWaiting.clear();
                for (const rowIdx of waiting) this._redraw(rowIdx);
            };
            if (reason === 'scroll') queueMicrotask(() => { if (t._wrapperEl) flush(); });
            else flush();
        }
    }

    /**
     * Draw a row again after a commit, from the row the table holds now
     * (`currentRow`). `updateRow` rebuilds EVERY cell of the row, so while an
     * editor is open in it (save, Tab, type — the commit settles under the
     * next editor) the row waits for that editor to close (`_closed`), and
     * only the committed cell's marks are painted now.
     */
    _redraw(rowIdx, col = null) {
        const t = this.table;
        const tr = t.getRowElement(rowIdx);
        const row = this.currentRow(rowIdx);
        if (!tr || !row) return;
        if (this._holds(tr)) {
            this.rowsWaiting.add(rowIdx);
            if (col === null || tr.__cellPos === undefined) return;
            const s = this.editor.session;
            for (const td of tr.children) {
                if (td.__colIdx === col && td !== s.td) this._decorateCell(td, tr.__cellPos, rowIdx, col);
            }
            return;
        }
        this.rowsWaiting.delete(rowIdx);
        t.updateRow(rowIdx, row);
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
        // Left as it was shown: no edit at all.
        if (Object.is(value, s.previous)) {
            this._closed(s, reason);
            return;
        }
        // STORY-0088 `staged`: the value is staged, not sent.
        if (this.staged) {
            if (live) this.staged.stage(s.rowIdx, s.colIdx, value);
            this._closed(s, reason);
            return;
        }
        // What the row holds: the table's row now, or — for a commit that
        // outlived its rows — the row it was opened on.
        const held = live ? this.currentRow(s.rowIdx) : s.row;
        const stored = held ? held[s.colIdx] : undefined;
        // A refused cell given back the value its row holds: nothing to save,
        // the refusal is over.
        if (live && this.errors.has(key) && !this.pending.has(key) && Object.is(value, stored)) {
            this.errors.delete(key);
            this.latest.delete(key);
            this._redraw(s.rowIdx, s.colIdx);
            this._closed(s, reason);
            return;
        }
        const fn = this._cfg().onCellCommit;
        const token = {};
        if (live) this.latest.set(key, token);
        const finish = (result) => {
            if (!live || s.generation !== this.generation) return;
            const newest = this.latest.get(key) === token;
            const good = !(result && result.ok === false);
            // The value goes into the row the table holds NOW, so a newer row
            // the consumer put in meanwhile (`updateRow`) keeps its other cells.
            if (good) {
                const row = this.currentRow(s.rowIdx);
                if (Array.isArray(row)) row[s.colIdx] = value;
            }
            // A newer commit of the cell is still out: its marks are its own.
            if (newest) {
                this.latest.delete(key);
                this.pending.delete(key);
                if (good) this.errors.delete(key);
                else this.errors.set(key, { value, message: String(result.error ?? 'Not saved') });
            }
            this._redraw(s.rowIdx, s.colIdx);
        };
        const refused = (err) => ({ ok: false, error: err?.message || String(err ?? 'Not saved') });
        let result;
        if (typeof fn === 'function') {
            try {
                result = fn({ rowIdx: s.rowIdx, colIdx: s.colIdx, value, previous: stored });
            } catch (err) {
                result = refused(err);
            }
        }
        if (result && typeof result.then === 'function') {
            if (live) {
                this.pending.set(key, value);
                this.errors.delete(key);
                this._redraw(s.rowIdx, s.colIdx);
            }
            this._closed(s, reason);
            result.then(finish, (err) => finish(refused(err)));
            return;
        }
        finish(result);
        this._closed(s, reason);
    }
}
