/**
 * cell_selection.js — STORY-0003. The model under DataTable's CELL MODE
 * (`selectionMode: 'cells'`): a cursor cell, a range from an anchor to that
 * cursor, and every move the keys make over them. No DOM, so the rules can be
 * tested — or drive another grid — without a table. DataTable's own half (the
 * painting, the pointer, the keys, the editor) is `cell_grid.js`, which is
 * internal to the table.
 *
 * ══ COORDINATES ═════════════════════════════════════════════════════════
 *
 * A cell is `{row, col}`. `row` is the row's POSITION in the order shown — the
 * index into `getDisplayedRows()`, after the sort and the filters — because a
 * range is a rectangle on the screen, not in the data. `col` is the DATA column
 * index (the one `headers`, `renderCell` and `hiddenColumns` use); a range
 * spans the columns SHOWN between its two edges, so a hidden column inside it
 * is not part of it. The cursor moves only over the rows of the page drawn.
 */

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
