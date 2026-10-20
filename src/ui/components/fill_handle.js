/**
 * fill_handle.js — STORY-0089. DataTable's FILL HANDLE (`fillHandle: true`).
 * INTERNAL to the table, like `cell_grid.js`: built by the cell grid, and
 * reading the table through it.
 *
 * A small square on the bottom-right corner of the cell range. Dragging it
 * up, down, left or right over the cells beyond the range previews the cells
 * it covers (`twm-dt-cell--fill-preview`) and, on release, STAGES their new
 * values (`staged_edits.js`) as ONE undo entry. What the values are is
 * `series.js`'s: each line of the range — a column for a fill up or down, a
 * row for a fill left or right — is a seed, continued as a series or repeated
 * in a cycle; Ctrl (Cmd) held at release repeats it.
 *
 * A target cell that `editable` refuses is SKIPPED: nothing is staged in it,
 * and it is drawn `twm-dt-cell--fill-skipped` until the selection moves, the
 * next fill, or new rows.
 */

import { projectSeries } from './series.js';

const key = (rowIdx, colIdx) => `${rowIdx}:${colIdx}`;

export class FillHandle {
    /** @param {import('./cell_grid.js').CellGrid} grid */
    constructor(grid) {
        this.grid = grid;
        /** The handle element; made on first use, moved into the corner cell. */
        this.el = null;
        /** The `<td>` holding the handle, or null. */
        this.corner = null;
        /** `rowIdx:colIdx` of the cells the last fill skipped. */
        this.skipped = new Set();
        /** `pos:colIdx` of the cells a drag covers now. */
        this.preview = new Set();
        /** The drag in progress: `{range, plan, unbind}`, or null. */
        this.drag = null;
    }

    // ── painting (called by the grid for every cell it paints) ───────────

    /** One cell: its preview and skipped marks, and the handle when it is
     *  the range's corner. */
    paintCell(td, pos, col) {
        const rowIdx = td.parentNode?.__rowIndex;
        td.classList.toggle('twm-dt-cell--fill-preview', this.preview.has(`${pos}:${col}`));
        td.classList.toggle('twm-dt-cell--fill-skipped', this.skipped.has(key(rowIdx, col)));
        const r = this.grid.sel.range();
        if (r && r.bottom === pos && r.right === col) this._place(td);
        else if (td === this.corner) this._unplace();
    }

    _handle() {
        if (this.el) return this.el;
        const el = document.createElement('div');
        el.className = 'twm-dt-fill-handle';
        el.setAttribute('aria-hidden', 'true');
        el.title = 'Drag to fill; hold Ctrl to repeat instead of continuing a series';
        el.addEventListener('pointerdown', (ev) => this._begin(ev));
        // A press and release on the handle is no click on its cell: the
        // range stays as it is.
        el.addEventListener('click', (ev) => ev.stopPropagation());
        el.addEventListener('dblclick', (ev) => ev.stopPropagation());
        this.el = el;
        return el;
    }

    _place(td) {
        if (this.grid.isEditing() || this.grid.staged?.committing) { this._unplace(); return; }
        if (this.corner && this.corner !== td) this.corner.classList.remove('twm-dt-cell--fill-corner');
        this.corner = td;
        td.classList.add('twm-dt-cell--fill-corner');
        const el = this._handle();
        if (el.parentNode !== td) td.appendChild(el);
    }

    _unplace() {
        this.corner?.classList.remove('twm-dt-cell--fill-corner');
        this.corner = null;
        this.el?.remove();
    }

    // ── what a fill covers ───────────────────────────────────────────────

    /**
     * The fill that reaching cell `to` (`{row, col}`, position and data
     * column) from `range` makes: `{direction, count}`, or null when `to` is
     * inside the range's rows and columns. The direction is the one the cell
     * lies furthest out in; up and down win a tie. Clamped to the page drawn.
     */
    plan(range, to) {
        if (!range || !to) return null;
        const cols = this.grid.columns();
        const [first, last] = this.grid.span();
        const row = Math.max(first, Math.min(last, Number(to.row)));
        const ordL = cols.indexOf(range.left);
        const ordR = cols.indexOf(range.right);
        const ordTo = cols.indexOf(to.col);
        const out = [
            ['down', row - range.bottom],
            ['up', range.top - row],
            ['right', ordTo < 0 ? 0 : ordTo - ordR],
            ['left', ordTo < 0 ? 0 : ordL - ordTo],
        ];
        let best = null;
        for (const [direction, count] of out) {
            if (count > 0 && (!best || count > best.count)) best = { direction, count };
        }
        return best;
    }

    /** The cells a plan covers, as `{pos, col}`, line by line in fill order:
     *  `[{seed: [{pos, col}], targets: [{pos, col}]}]`. */
    _lines(range, { direction, count }) {
        const cols = this.grid.columns();
        const ordL = cols.indexOf(range.left);
        const ordR = cols.indexOf(range.right);
        const lines = [];
        if (direction === 'down' || direction === 'up') {
            const down = direction === 'down';
            for (let o = ordL; o <= ordR; o++) {
                const col = cols[o];
                const seed = [];
                for (let p = range.top; p <= range.bottom; p++) seed.push({ pos: p, col });
                if (!down) seed.reverse();
                const targets = [];
                for (let i = 1; i <= count; i++) {
                    targets.push({ pos: down ? range.bottom + i : range.top - i, col });
                }
                lines.push({ seed, targets });
            }
        } else {
            const right = direction === 'right';
            for (let p = range.top; p <= range.bottom; p++) {
                const seed = [];
                for (let o = ordL; o <= ordR; o++) seed.push({ pos: p, col: cols[o] });
                if (!right) seed.reverse();
                const targets = [];
                for (let i = 1; i <= count; i++) {
                    const o = right ? ordR + i : ordL - i;
                    if (o >= 0 && o < cols.length) targets.push({ pos: p, col: cols[o] });
                }
                lines.push({ seed, targets });
            }
        }
        return lines;
    }

    // ── the fill ─────────────────────────────────────────────────────────

    /**
     * Fill from the range to cell `to`, staging the values as ONE undo
     * entry. Returns `{direction, count, staged, skipped}` (`skipped` the
     * cells `editable` refused, `{row, col, rowIdx}`), or null when nothing
     * was filled: no range, `to` inside it, an editor open or a commit out.
     */
    fill(to, { forceCopy = false } = {}) {
        const g = this.grid;
        g._sync();
        const range = g.sel.range();
        const plan = this.plan(range, to);
        if (!plan || !g.staged || g.staged.committing || g.isEditing()) return null;
        const cells = [];
        const skipped = [];
        for (const { seed, targets } of this._lines(range, plan)) {
            const values = projectSeries(
                seed.map(({ pos, col }) => g.shownValue(g.rowIndexAt(pos), col)),
                targets.length, { forceCopy });
            targets.forEach(({ pos, col }, i) => {
                const rowIdx = g.rowIndexAt(pos);
                if (g.canEdit(pos, col)) cells.push({ rowIdx, colIdx: col, value: values[i] });
                else skipped.push({ row: pos, col, rowIdx });
            });
        }
        const staged = g.staged.stageMany(cells, `fill ${cells.length} cell(s)`);
        // The range grows over what was filled, the cursor at its far end.
        const cols = g.columns();
        const ordL = cols.indexOf(range.left);
        const ordR = cols.indexOf(range.right);
        const { direction, count } = plan;
        if (direction === 'down') g.set({ row: range.bottom + count, col: range.right }, { row: range.top, col: range.left });
        else if (direction === 'up') g.set({ row: range.top - count, col: range.left }, { row: range.bottom, col: range.right });
        else if (direction === 'right') g.set({ row: range.bottom, col: cols[Math.min(cols.length - 1, ordR + count)] }, { row: range.top, col: range.left });
        else g.set({ row: range.top, col: cols[Math.max(0, ordL - count)] }, { row: range.bottom, col: range.right });
        // Marked after the selection moved, which clears the last fill's marks.
        for (const s of skipped) this.skipped.add(key(s.rowIdx, s.col));
        if (skipped.length) g.paint();
        return { direction, count, staged, skipped };
    }

    /** The selection moved, or new rows came: the skipped marks are over. */
    clearMarks() {
        this.skipped.clear();
    }

    // ── the drag ─────────────────────────────────────────────────────────

    _begin(ev) {
        if (ev.button != null && ev.button !== 0) return;
        ev.preventDefault();
        ev.stopPropagation();
        const g = this.grid;
        g._sync();
        const range = g.sel.range();
        if (!range || this.drag || g.isEditing() || g.staged?.committing) return;
        const doc = this.el.ownerDocument;
        const onMove = (move) => this._move(move);
        const onUp = (up) => {
            const plan = this.drag?.plan;
            this._end();
            if (plan) this.fill(this._reach(range, plan), { forceCopy: !!(up.ctrlKey || up.metaKey) });
            try { g.table._tableEl?.focus({ preventScroll: true }); } catch (_) { /* detached */ }
        };
        const onCancel = () => this._end();
        const onKey = (k) => { if (k.key === 'Escape') { k.preventDefault(); k.stopPropagation(); this._end(); } };
        doc.addEventListener('pointermove', onMove);
        doc.addEventListener('pointerup', onUp);
        doc.addEventListener('pointercancel', onCancel);
        doc.addEventListener('keydown', onKey, true);
        this.drag = {
            range,
            plan: null,
            unbind: () => {
                doc.removeEventListener('pointermove', onMove);
                doc.removeEventListener('pointerup', onUp);
                doc.removeEventListener('pointercancel', onCancel);
                doc.removeEventListener('keydown', onKey, true);
            },
        };
    }

    /** The cell a plan reaches, as `fill` takes it. */
    _reach(range, { direction, count }) {
        const cols = this.grid.columns();
        if (direction === 'down') return { row: range.bottom + count, col: range.right };
        if (direction === 'up') return { row: range.top - count, col: range.left };
        if (direction === 'right') return { row: range.bottom, col: cols[cols.indexOf(range.right) + count] };
        return { row: range.top, col: cols[cols.indexOf(range.left) - count] };
    }

    /** The data cell under the pointer: the event's target, or (a touch,
     *  whose events stay on the handle) the element at its point. */
    _cellUnder(ev) {
        const tbody = this.grid.table._tbodyEl;
        const hit = (el) => {
            const td = el?.closest?.('td');
            if (!td || td.__colIdx === undefined || !tbody?.contains(td)) return null;
            const pos = td.parentNode?.__cellPos;
            return pos === undefined ? null : { row: pos, col: td.__colIdx };
        };
        let cell = ev.target === this.el ? null : hit(ev.target);
        if (!cell && typeof document.elementFromPoint === 'function') {
            cell = hit(document.elementFromPoint(ev.clientX, ev.clientY));
        }
        return cell;
    }

    _move(ev) {
        const d = this.drag;
        if (!d) return;
        const cell = this._cellUnder(ev);
        if (!cell) return;
        d.plan = this.plan(d.range, cell);
        this.preview.clear();
        if (d.plan) {
            for (const { targets } of this._lines(d.range, d.plan)) {
                for (const t of targets) this.preview.add(`${t.pos}:${t.col}`);
            }
        }
        this.grid.paint();
    }

    _end() {
        const d = this.drag;
        if (!d) return;
        this.drag = null;
        d.unbind();
        this.preview.clear();
        this.grid.paint();
    }

    dispose() {
        this._end();
        this._unplace();
        this.skipped.clear();
    }
}
