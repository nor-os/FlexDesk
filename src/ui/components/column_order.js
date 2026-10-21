/**
 * column_order.js — STORY-0086. The order DataTable draws its data columns in
 * (`reorderable`, `columnOrder`, `moveColumn`, `getColumnOrder`), and the drag
 * on the header that changes it. Internal to the table, like `cell_grid.js`.
 *
 * ══ AN ORDER IS A LIST OF DATA INDICES ══════════════════════════════════
 *
 * The order is every data column's index (hidden ones included), in the order
 * shown: `[0, 3, 1, 2]` draws column 3 second. Everything else the table keeps
 * by column — `hiddenColumns`, the sort, the filters, `renderCell`'s `colIdx`,
 * the cell mode's `col` — stays a data index and so stays on its column. Only
 * what is BY DRAWN POSITION (the cells of a row, the widths) follows the order.
 *
 * A table with no order asked for (`null`) draws 0, 1, 2, … as in 0.16. An
 * order that is not a permutation of today's columns — a saved one from when
 * the table had a different number of columns — is no order: the natural one
 * is drawn.
 */

/** Whether `order` is a permutation of `0..n-1`. */
export function isColumnOrder(order, n) {
    if (!Array.isArray(order) || order.length !== n) return false;
    const seen = new Set();
    for (const c of order) {
        if (!Number.isInteger(c) || c < 0 || c >= n || seen.has(c)) return false;
        seen.add(c);
    }
    return true;
}

/** `0..n-1`. */
export function naturalOrder(n) {
    return Array.from({ length: Math.max(0, n) }, (_, i) => i);
}

/**
 * The data indices of a row of `count` cells in the order drawn: `order`
 * where it holds, and any cell past the headers (a row longer than them) after
 * it, as 0.16 drew them.
 */
export function cellOrder(order, count) {
    if (!order) return naturalOrder(count);
    const out = order.filter((c) => c < count);
    for (let c = order.length; c < count; c++) out.push(c);
    return out;
}

/** `order` with the column at position `from` taken out and put back at
 *  position `to` (positions in `order`). A copy; `order` is not changed. */
export function moveInOrder(order, from, to) {
    const next = order.slice();
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    return next;
}

/**
 * The header drag. Every data column's header cell is draggable; dropping one
 * on another data column's header moves it to that column's place. A press
 * that starts on a resize grip is the resize's, never a drag. The row-number
 * and select columns are no data columns: they do not drag and take no drop,
 * so nothing lands in front of them.
 */
export class ColumnReorder {
    /** @param {import('./data_table.js').DataTable} table */
    constructor(table) {
        this.table = table;
        /** The data column being dragged, or null. */
        this.dragging = null;
        /** Whether the last press on a header cell was on its resize grip. */
        this.onGrip = false;
    }

    /** Wire the header row of a fresh render. Its cells are new each render,
     *  so nothing needs taking off. */
    install(headRow) {
        if (!headRow) return;
        [...headRow.children].forEach((th, domIdx) => {
            const col = this.table._dataIdxOfDom(domIdx);
            if (col === null) return;
            th.draggable = true;
            th.classList.add('twm-dt-col--movable');
            // Capture: the grip stops its own mousedown, so a listener on the
            // way up would never hear it.
            th.addEventListener('mousedown', (ev) => {
                this.onGrip = !!ev.target?.closest?.('.twm-dt-col-resizer');
            }, true);
            th.addEventListener('dragstart', (ev) => {
                if (this.onGrip || ev.target?.closest?.('.twm-dt-col-resizer')) {
                    ev.preventDefault();
                    return;
                }
                this.dragging = col;
                try {
                    ev.dataTransfer?.setData('text/plain', String(col));
                    if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'move';
                } catch (_) { /* a drag with no data transfer */ }
                th.classList.add('twm-dt-col--dragging');
            });
            th.addEventListener('dragover', (ev) => {
                if (this.dragging === null || this.dragging === col) return;
                ev.preventDefault();               // a drop is welcome here
                if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
                // Moved right it lands AFTER the column it is dropped on.
                const order = this.table.getColumnOrder();
                th.classList.add('twm-dt-col--drop');
                th.classList.toggle('twm-dt-col--drop-after', order.indexOf(col) > order.indexOf(this.dragging));
            });
            th.addEventListener('dragleave', () => th.classList.remove('twm-dt-col--drop', 'twm-dt-col--drop-after'));
            th.addEventListener('drop', (ev) => {
                th.classList.remove('twm-dt-col--drop', 'twm-dt-col--drop-after');
                const from = this.dragging;
                this.dragging = null;
                if (from === null || from === col) return;
                ev.preventDefault();
                const order = this.table.getColumnOrder();
                this.table.moveColumn(order.indexOf(from), order.indexOf(col));
            });
            th.addEventListener('dragend', () => {
                th.classList.remove('twm-dt-col--dragging');
                this.dragging = null;
            });
        });
    }

    /** "Move left" / "Move right" for the header menu of data column `col`:
     *  past the shown column next to it. */
    menuItems(col) {
        const shown = this.table._shownColumns();
        const at = shown.indexOf(col);
        if (at < 0) return [];
        const order = this.table.getColumnOrder();
        const step = (to) => () => this.table.moveColumn(order.indexOf(col), order.indexOf(to));
        return [
            { label: 'Move left', icon: 'arrow_back', action: 'move-left', disabled: at === 0,
              onChoose: at === 0 ? undefined : step(shown[at - 1]) },
            { label: 'Move right', icon: 'arrow_forward', action: 'move-right',
              disabled: at === shown.length - 1,
              onChoose: at === shown.length - 1 ? undefined : step(shown[at + 1]) },
        ];
    }
}
