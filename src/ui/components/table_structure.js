/**
 * table_structure.js — STORY-0066. DataTable's STRUCTURAL EDITS: the
 * consumer's action buttons on the column headers (`columnActions`), renaming
 * a column in place (`onColumnRename`, through `attachInlineRenamer`), and the
 * menu items that add and delete columns and rows (`onColumnDelete`,
 * `onRowAdd`, `onRowDelete`). INTERNAL to the table: imported by
 * `data_table.js` only, and not part of the widgets barrel.
 *
 * THE CONSUMER OWNS THE DATA. Nothing here changes `headers` or `rows`: each
 * edit is a call, and the consumer answers it with `setData`. A rename shows
 * the new name in the header until then.
 *
 * Where the items go: the header's right-click menu (the STORY-0003
 * `headerMenu` path) gets "Rename column", "Delete column" and "Add row" after
 * the consumer's `headerMenu` items, and the body's right-click menu (the
 * STORY-0010 `contextMenuItems` path) "Insert row below" and "Delete row"
 * after the consumer's `contextMenuItems`. "Add row" is in the header's menu
 * so a table with no rows can still get its first.
 *
 * A table without any of these options never builds this.
 */

import { attachInlineRenamer } from './inline_renamer.js';

/** The options that build this module. */
export const STRUCTURE_OPTIONS = ['columnActions', 'onColumnRename', 'onColumnDelete', 'onRowAdd', 'onRowDelete'];

export class TableStructure {
    /** @param {import('./data_table.js').DataTable} table */
    constructor(table) {
        this.table = table;
        this._renamer = null;
    }

    _cfg() {
        return this.table.config;
    }

    _has(name) {
        return typeof this._cfg()[name] === 'function';
    }

    _call(name, ...args) {
        try { return this._cfg()[name]?.(...args); } catch (err) {
            console.error(`[DataTable] ${name} threw`, err);
            return undefined;
        }
    }

    /** Whether the header's right-click has items of this module's. */
    hasHeaderItems() {
        return this._has('onColumnRename') || this._has('onColumnDelete') || this._has('onRowAdd');
    }

    /** Whether a row's right-click has items of this module's. */
    hasRowItems() {
        return this._has('onRowAdd') || this._has('onRowDelete');
    }

    /** The header menu's items for the data column `colIdx` (null off one). */
    headerItems(colIdx) {
        const items = [];
        if (colIdx !== null && this._has('onColumnRename')) {
            items.push({ label: 'Rename column', icon: 'edit', onChoose: () => this.rename(colIdx) });
        }
        if (colIdx !== null && this._has('onColumnDelete')) {
            items.push({ label: 'Delete column', icon: 'delete', danger: true,
                         onChoose: () => this._call('onColumnDelete', colIdx) });
        }
        if (this._has('onRowAdd')) {
            items.push({ label: 'Add row', icon: 'add', onChoose: () => this._call('onRowAdd', null) });
        }
        return items;
    }

    /** The body menu's items for the row `rowIdx` (its original index). */
    rowItems(rowIdx) {
        const items = [];
        if (this._has('onRowAdd')) {
            items.push({ label: 'Insert row below', icon: 'add', onChoose: () => this._call('onRowAdd', rowIdx) });
        }
        if (this._has('onRowDelete')) {
            items.push({ label: 'Delete row', icon: 'delete', danger: true,
                         onChoose: () => this._call('onRowDelete', rowIdx) });
        }
        return items;
    }

    /**
     * After the header is built: each data column's label in a span the
     * renamer can take over, and the consumer's action buttons.
     */
    decorate(headerTable) {
        this._renamer?.destroy();
        this._renamer = null;
        const labelRow = headerTable?.querySelector('thead > tr');
        if (!labelRow) return;
        const headers = this._cfg().headers || [];
        const rename = this._has('onColumnRename');
        const actions = this._has('columnActions');
        if (!rename && !actions) return;
        for (let colIdx = 0; colIdx < headers.length; colIdx++) {
            const th = labelRow.children[this.table._domIdxOf(colIdx)];
            if (!th) continue;
            if (rename) this._wrapLabel(th, colIdx);
            if (actions) this._addActions(th, colIdx, headers[colIdx]);
        }
    }

    _wrapLabel(th, colIdx) {
        const text = [...th.childNodes].find((n) => n.nodeType === 3);
        if (!text) return;
        const label = document.createElement('span');
        label.className = 'twm-dt-col-label';
        th.insertBefore(label, text);
        label.appendChild(text);
        // The renamer's keys stay its own: no Escape or Enter it handles
        // reaches the table or the page. (On the label, not added per rename:
        // the renamer's Escape removes its input before the key bubbles here.)
        label.addEventListener('keydown', (ev) => ev.stopPropagation());
        // A double-click on the label renames — on a table whose header click
        // does not sort (there, the first click redraws the header).
        if (!this._cfg().sortable) {
            label.addEventListener('dblclick', (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                this.rename(colIdx);
            });
        }
    }

    _addActions(th, colIdx, header) {
        let items = null;
        try {
            items = this._cfg().columnActions(colIdx, { colIdx, header, table: this.table });
        } catch (err) {
            console.error('[DataTable] columnActions threw', err);
        }
        const list = Array.isArray(items) ? items.filter(Boolean) : [];
        if (!list.length) return;
        const box = document.createElement('span');
        box.className = 'twm-dt-col-actions';
        for (const item of list) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'twm-dt-col-action';
            if (item.icon) {
                const span = document.createElement('span');
                span.className = 'material-symbols-outlined';
                span.textContent = String(item.icon);
                b.appendChild(span);
            } else if (item.label != null) {
                b.textContent = String(item.label);
            }
            const name = item.title ?? item.label;
            if (name != null) {
                b.title = String(name);
                b.setAttribute('aria-label', String(name));
            }
            if (item.disabled) b.disabled = true;
            b.addEventListener('mousedown', (ev) => ev.stopPropagation());
            b.addEventListener('click', (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                this._call('onColumnAction', item.action, colIdx);
            });
            box.appendChild(b);
        }
        th.appendChild(box);
    }

    /**
     * Open the renamer on the data column's header. Enter (or the focus
     * leaving) with a different, non-empty name calls
     * `onColumnRename(colIdx, name)`; Escape, or the name left as it was,
     * restores the header and calls nothing. Returns whether it opened.
     */
    rename(colIdx) {
        if (!this._has('onColumnRename')) return false;
        const labelRow = this.table._headerTableEl?.querySelector('thead > tr');
        const dom = this.table._domIdxOf(colIdx);
        const label = dom < 0 ? null : labelRow?.children[dom]?.querySelector('.twm-dt-col-label');
        if (!label) return false;
        this._renamer?.cancel();
        const before = label.textContent || '';
        const done = () => {
            if (this._renamer === renamer) this._renamer = null;
        };
        const renamer = attachInlineRenamer({
            label,
            inputClass: 'twm-dt-col-rename',
            onCommit: async (raw) => {
                const name = String(raw ?? '').trim();
                if (!name || name === before) return { success: false };
                const answer = await this._call('onColumnRename', colIdx, name);
                if (answer === false || (answer && answer.ok === false)) return { success: false };
                return { newValue: name };
            },
            onCancel: done,
            onFinish: done,
        });
        this._renamer = renamer;
        renamer.start();
        return true;
    }

    dispose() {
        this._renamer?.destroy();
        this._renamer = null;
    }
}
