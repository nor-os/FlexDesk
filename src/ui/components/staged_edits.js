/**
 * staged_edits.js — STORY-0088. DataTable's STAGED edits (`staged: true`).
 * INTERNAL to the table, like `cell_grid.js`: built by the cell grid, and
 * reading the table's private fields.
 *
 * With `staged`, an editor's commit does not go to `onCellCommit`: the value
 * is STAGED here, drawn `twm-dt-cell--staged`, and recorded in the undo ring
 * (`staged_history.js`) as a before/after delta. `commit()` hands every staged
 * cell to the consumer's `onCommit({edits})` in one call; `discard()` drops
 * them. While any cell is staged the table's sort, filters and pages are
 * FROZEN — each such control is disabled with the reason on it
 * (`data-refusal`), and the methods behind them refuse — because a new order
 * or page would move the rows being edited out from under the person editing.
 *
 * A cell has three states: absent (no change), staged as null, staged as a
 * value. Staging the value its row already holds makes it absent again.
 */

import { StagedHistory, DEFAULT_HISTORY_LIMIT } from './staged_history.js';

const key = (rowIdx, colIdx) => `${rowIdx}:${colIdx}`;

/** The controls a freeze holds, under the table's wrapper. The export button
 *  moves no rows and is left alone. */
const FROZEN_SELECTORS = [
    'th.sortable',
    '.data-table__filter-cell:not(.data-table__filter-cell--empty)',
    '.data-table__filter-cell:not(.data-table__filter-cell--empty) input',
    '.data-table__filter-cell:not(.data-table__filter-cell--empty) button',
    '.data-table__filter-cell:not(.data-table__filter-cell--empty) select',
    '.data-table__filter-cell:not(.data-table__filter-cell--empty) textarea',
    '.twm-pagination-controls button:not(.twm-pagination-btn--export)',
    '.twm-pagination-controls input',
    '.twm-dt-paging button',
    '.twm-dt-paging input',
].join(', ');

/** The attributes a freeze writes, put back as they were when it lifts. */
const SAVED_ATTRS = ['title', 'data-refusal', 'data-tooltip', 'aria-disabled'];

export class StagedEdits {
    /** @param {import('./cell_grid.js').CellGrid} grid */
    constructor(grid) {
        this.grid = grid;
        this.table = grid.table;
        /** `rowIdx:colIdx` → {rowIdx, colIdx, value}: what is staged. */
        this.cells = new Map();
        /** `rowIdx:colIdx` → message: a cell the last commit refused. */
        this.errors = new Map();
        /** The commit out, or null. */
        this.committing = null;
        /** Bumped by new rows: a commit that outlived its rows marks nothing. */
        this.generation = 0;
        /** Rows touched while the ring applies an entry, drawn after it. */
        this._touched = null;
        /** Element → the attributes it had before the freeze. */
        this._frozen = new Map();
        const limit = this.table.config.historyLimit;
        this.history = new StagedHistory({
            apply: (entry, direction) => this._apply(entry, direction),
            limit: limit == null ? DEFAULT_HISTORY_LIMIT : limit,
        });
    }

    // ── what is staged ───────────────────────────────────────────────────

    has(k) { return this.cells.has(k); }

    value(k) { return this.cells.get(k)?.value; }

    /** The value the row holds for a cell: what "no change" means. */
    original(rowIdx, colIdx) {
        const row = this.grid.currentRow(rowIdx);
        return row ? row[colIdx] : undefined;
    }

    /** Every staged cell as `{rowIdx, colIdx, value, previous}`, by row then
     *  column; `previous` is the value the row holds. */
    edits() {
        return [...this.cells.values()]
            .sort((a, b) => a.rowIdx - b.rowIdx || a.colIdx - b.colIdx)
            .map(({ rowIdx, colIdx, value }) => ({
                rowIdx, colIdx, value, previous: this.original(rowIdx, colIdx),
            }));
    }

    _side(k) {
        return this.cells.has(k) ? { has: true, value: this.cells.get(k).value } : { has: false, value: null };
    }

    /** Write one side of a delta: stage the value, or take the cell out. */
    _write(rowIdx, colIdx, side) {
        const k = key(rowIdx, colIdx);
        if (side.has) this.cells.set(k, { rowIdx, colIdx, value: side.value });
        else this.cells.delete(k);
        // A cell staged again (or taken back) is no longer what a commit refused.
        this.errors.delete(k);
    }

    /**
     * Stage a value in a cell, as one undo entry (inside an open group, part
     * of it). The value its row holds takes the cell back to no change.
     * Returns whether anything changed.
     */
    stage(rowIdx, colIdx, value) {
        if (this.committing) return false;
        const k = key(rowIdx, colIdx);
        const before = this._side(k);
        const after = Object.is(value, this.original(rowIdx, colIdx))
            ? { has: false, value: null } : { has: true, value };
        if (before.has === after.has && Object.is(before.value, after.value)) return false;
        this._write(rowIdx, colIdx, after);
        this.history.record({ action: 'cell:stage', row: rowIdx, col: colIdx, before, after });
        this.grid._redraw(rowIdx, colIdx);
        this._changed();
        return true;
    }

    _apply(entry, direction) {
        this._write(entry.row, entry.col, direction === 'undo' ? entry.before : entry.after);
        this._touched?.add(entry.row);
    }

    _walk(step) {
        if (this.committing) return false;
        this._touched = new Set();
        let moved = false;
        try {
            moved = step();
        } finally {
            const rows = this._touched;
            this._touched = null;
            for (const rowIdx of rows) this.grid._redraw(rowIdx);
        }
        if (moved) this._changed();
        return moved;
    }

    undo() { return this._walk(() => this.history.undo()); }

    redo() { return this._walk(() => this.history.redo()); }

    /** Drop every staged cell, its marks and the ring. */
    discard() {
        if (this.committing) return false;
        const rows = this._rows();
        const had = this.cells.size > 0 || this.errors.size > 0;
        this.cells.clear();
        this.errors.clear();
        this.history.reset();
        for (const rowIdx of rows) this.grid._redraw(rowIdx);
        if (had) this._changed();
        return had;
    }

    /** New rows (`setData({rows})`): the cells named rows that are gone. */
    clear() {
        this.generation++;
        this.committing = null;
        const had = this.cells.size > 0 || this.errors.size > 0;
        this.cells.clear();
        this.errors.clear();
        this.history.reset();
        if (had) this._changed();
    }

    _rows() {
        const rows = new Set();
        for (const c of this.cells.values()) rows.add(c.rowIdx);
        for (const k of this.errors.keys()) rows.add(Number(k.split(':')[0]));
        return rows;
    }

    // ── the commit ───────────────────────────────────────────────────────

    /**
     * Hand every staged cell to `onCommit({edits})`, once. Resolves
     * `{ok: true, committed}` when it succeeded — the values are written into
     * the rows the table holds, and the staged cells and the ring are gone —
     * or `{ok: false, errors}` when it refused: per-cell errors mark their
     * cells, a refusal with none marks every staged cell, and every staged
     * value stays.
     */
    commit() {
        if (this.committing) return this.committing;
        // An open editor's value is staged first: it is part of the batch.
        if (this.grid.isEditing()) this.grid.editor.commit(null, 'commit');
        const fn = this.table.config.onCommit;
        const edits = this.edits();
        if (!edits.length) return Promise.resolve({ ok: true, committed: 0 });
        if (typeof fn !== 'function') {
            console.warn('[DataTable] commit() needs an `onCommit`; nothing was committed.');
            return Promise.resolve({ ok: false, errors: [] });
        }
        const generation = this.generation;
        const refused = (err) => ({ ok: false, error: err?.message || String(err ?? 'Not saved') });
        let result;
        try {
            result = fn({ edits: edits.map((e) => ({ ...e })) });
        } catch (err) {
            result = refused(err);
        }
        const out = Promise.resolve(result)
            .then((r) => r, refused)
            .then((r) => {
                if (generation !== this.generation) return { ok: false, errors: [] };
                this.committing = null;
                return this._settle(edits, r);
            });
        this.committing = out;
        this._changed();
        return out;
    }

    _settle(edits, result) {
        const listed = Array.isArray(result?.errors) ? result.errors : [];
        if (listed.length || result?.ok === false) {
            const errors = [];
            const mark = (rowIdx, colIdx, message) => {
                const k = key(rowIdx, colIdx);
                if (!this.cells.has(k)) return;
                const text = String(message ?? 'Not saved');
                this.errors.set(k, text);
                errors.push({ rowIdx, colIdx, error: text });
            };
            if (listed.length) {
                for (const e of listed) mark(e?.rowIdx, e?.colIdx, e?.error ?? e?.message);
            } else {
                for (const e of edits) mark(e.rowIdx, e.colIdx, result.error);
            }
            for (const rowIdx of this._rows()) this.grid._redraw(rowIdx);
            this._changed();
            return { ok: false, errors };
        }
        const rows = this._rows();
        for (const e of edits) {
            const row = this.grid.currentRow(e.rowIdx);
            if (Array.isArray(row)) row[e.colIdx] = e.value;
        }
        this.cells.clear();
        this.errors.clear();
        this.history.reset();
        for (const rowIdx of rows) this.grid._redraw(rowIdx);
        this._changed();
        return { ok: true, committed: edits.length };
    }

    // ── the freeze ───────────────────────────────────────────────────────

    /** Why sort, filters and pages are held, or null when nothing is staged. */
    freezeReason() {
        const n = this.cells.size;
        if (!n) return null;
        const own = this.table.config.stagedRefusal;
        if (typeof own === 'function') {
            try { return String(own(n)); } catch (err) {
                console.error('[DataTable] stagedRefusal threw', err);
            }
        } else if (typeof own === 'string' && own) return own;
        return `Sorting, filtering and paging are held while ${n} change${n === 1 ? ' is' : 's are'} `
            + 'not committed. Commit or discard them first.';
    }

    /** Disable every control the freeze holds with the reason on it, or put
     *  back the ones it held. Run after every render and every change. */
    paintFreeze() {
        const root = this.table._wrapperEl;
        const reason = this.freezeReason();
        root?.classList.toggle('twm-dt--frozen', !!reason);
        if (!reason) {
            for (const [el, saved] of this._frozen) this._thaw(el, saved);
            this._frozen.clear();
            return;
        }
        for (const el of this._frozen.keys()) if (!el.isConnected) this._frozen.delete(el);
        if (!root) return;
        for (const el of root.querySelectorAll(FROZEN_SELECTORS)) {
            if (!this._frozen.has(el)) {
                const saved = {};
                for (const a of SAVED_ATTRS) saved[a] = el.getAttribute(a);
                saved.disabled = 'disabled' in el ? el.disabled : null;
                this._frozen.set(el, saved);
            }
            el.setAttribute('data-refusal', reason);
            el.setAttribute('title', reason);
            if (el.hasAttribute('data-tooltip')) el.setAttribute('data-tooltip', reason);
            el.setAttribute('aria-disabled', 'true');
            if ('disabled' in el) el.disabled = true;
        }
    }

    _thaw(el, saved) {
        for (const a of SAVED_ATTRS) {
            if (saved[a] == null) el.removeAttribute(a);
            else el.setAttribute(a, saved[a]);
        }
        if (saved.disabled !== null) el.disabled = saved.disabled;
    }

    /** After every change: the freeze, and whoever listens. */
    _changed() {
        this.paintFreeze();
        const fn = this.table.config.onStagedChange;
        if (typeof fn !== 'function') return;
        try {
            fn({
                count: this.cells.size,
                canUndo: this.history.canUndo,
                canRedo: this.history.canRedo,
                committing: !!this.committing,
            });
        } catch (err) {
            console.error('[DataTable] onStagedChange threw', err);
        }
    }
}
