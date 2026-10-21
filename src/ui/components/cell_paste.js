/**
 * cell_paste.js — STORY-0090. DataTable's PASTE (`pasteable: true`, with
 * `staged`). INTERNAL to the table, like `cell_grid.js` and `fill_handle.js`:
 * built by the cell grid, and reading the table through it.
 *
 * A block of tab-separated text (`tsv.js` `fromTSV`, what Excel and Google
 * Sheets put on the clipboard) lands at the CURSOR cell and fills right, over
 * the columns shown, and down, over the rows in the order shown. Each value is
 * read by its column's editor's parse (`cell_editors.js`, or an injected
 * editor's own `parse`), and every cell that reads is STAGED
 * (`staged_edits.js`) as ONE undo entry.
 *
 *   - Columns past the last one shown are dropped, with a warning naming how
 *     many.
 *   - Rows past the last loaded row ask `onPasteOverrun({rows: n})` first:
 *     anything but `true` (or a Promise of it) stages nothing; `true` stages
 *     the rows that fit and hands the extra ones to `onRowsAppend`.
 *   - A value that does not parse marks its cell (`twm-dt-cell--error`, the
 *     message as `title` and `data-error`, the text kept in the cell, as an
 *     editor's refusal is) and the rest of the block still stages.
 *   - A cell `editable` refuses is skipped — nothing is staged in it — and
 *     drawn `twm-dt-cell--paste-skipped` until the selection moves, the next
 *     paste or fill, or new rows.
 */

import { fromTSV } from './tsv.js';
import { CELL_EDITORS } from './cell_editors.js';

const key = (rowIdx, colIdx) => `${rowIdx}:${colIdx}`;

export class CellPaste {
    /** @param {import('./cell_grid.js').CellGrid} grid */
    constructor(grid) {
        this.grid = grid;
        /** `rowIdx:colIdx` of the cells the last paste skipped. */
        this.skipped = new Set();
        /** True while a paste waits for `onPasteOverrun` or `onRowsAppend`. */
        this.busy = false;
    }

    // ── painting (called by the grid for every cell it paints) ───────────

    paintCell(td, col) {
        const rowIdx = td.parentNode?.__rowIndex;
        td.classList.toggle('twm-dt-cell--paste-skipped', this.skipped.has(key(rowIdx, col)));
    }

    /** The selection moved, or new rows came: the skipped marks are over. */
    clearMarks() {
        this.skipped.clear();
    }

    // ── reading a value ──────────────────────────────────────────────────

    /**
     * The parse a column's pasted text is read with: an injected editor's
     * own (`editors[k].parse`, looked up as the editor is), else the built-in
     * editor's for the column's type, else the text as it is.
     */
    _parserFor(col) {
        const g = this.grid;
        const editors = g._cfg().editors;
        if (editors && typeof editors === 'object') {
            for (const k of [col, g._rawType(col), g._typeOf(col)]) {
                const f = editors[k];
                if (typeof f === 'function') {
                    if (typeof f.parse === 'function') return f.parse;
                    break;
                }
            }
        }
        const type = g._typeOf(col);
        return Object.prototype.hasOwnProperty.call(CELL_EDITORS, type)
            ? CELL_EDITORS[type].parse : CELL_EDITORS.text.parse;
    }

    /** One column's reader: `(text) => {ok: true, value} | {ok: false, error}`. */
    _reader(col) {
        const g = this.grid;
        const cfg = g._cfg();
        const spec = g._editSpec(col) || {};
        const parse = this._parserFor(col);
        const ctx = {
            locale: cfg.locale ?? undefined,
            utc: g.table._utc(),
            messages: cfg.editorMessages ?? undefined,
            options: spec.options,
            allowOther: !!spec.allowOther,
        };
        return (text) => {
            let r;
            try { r = parse(text, ctx); } catch (err) {
                return { ok: false, error: err?.message || String(err ?? 'Not pasted') };
            }
            if (r && r.ok === true) return { ok: true, value: r.value };
            if (r && r.ok === false) return { ok: false, error: String(r.error ?? 'Not pasted') };
            return { ok: false, error: 'Not pasted' };
        };
    }

    /** The position of the last loaded row: the rows held in the order shown
     *  (all of them filtered and sorted; a server's page, the rows it sent). */
    _lastLoaded() {
        const t = this.grid.table;
        if (t._isServerSide()) return this.grid.span()[1];
        return t._getProcessedRows().length - 1;
    }

    _warn(message) {
        console.warn(`[DataTable] paste: ${message}`);
        this.grid.table._notify('Paste', message, 'warn');
    }

    // ── the paste ────────────────────────────────────────────────────────

    /**
     * Paste tab-separated `text` at the cursor. Resolves `{rows, cols, staged,
     * skipped, refused, droppedColumns, appended}` — `staged` the NUMBER of
     * cells that changed, `skipped` the cells `editable` refused and `refused`
     * the ones whose text did not parse (`{row, col, rowIdx}`, `refused` with
     * its `text` and `error`), `droppedColumns` the columns past the last one,
     * `appended` the rows handed to `onRowsAppend` — or null when nothing was
     * pasted: empty text, no cursor, an editor open, a commit or another paste
     * out, an overrun declined, or new rows while `onPasteOverrun` was asked.
     */
    async paste(text) {
        const g = this.grid;
        const matrix = fromTSV(text);
        if (!matrix.length || this.busy) return null;
        g._sync();
        const at = g.sel.focus ? { ...g.sel.focus } : null;
        if (!at || g.isEditing() || g.staged.committing) return null;
        const cfg = g._cfg();
        const cols = g.columns();
        const width = Math.max(...matrix.map((line) => line.length));
        const targetCols = cols.slice(cols.indexOf(at.col), cols.indexOf(at.col) + width);
        const droppedColumns = width - targetCols.length;
        const last = this._lastLoaded();
        const fit = Math.max(0, Math.min(matrix.length, last - at.row + 1));
        const extra = matrix.length - fit;
        const generation = g.generation;

        if (extra > 0) {
            const ask = cfg.onPasteOverrun;
            let answer = false;
            if (typeof ask === 'function') {
                this.busy = true;
                try { answer = await ask({ rows: extra }); } catch (err) {
                    console.error('[DataTable] onPasteOverrun threw', err);
                    answer = false;
                } finally {
                    this.busy = false;
                }
            } else {
                console.warn(`[DataTable] paste: ${extra} row(s) past the last loaded row and no \`onPasteOverrun\`; nothing pasted.`);
            }
            if (answer !== true) return null;
            if (generation !== g.generation || g.isEditing() || g.staged.committing) return null;
        }

        // What lands in the loaded rows: each cell read, or skipped.
        const cells = [];
        const skipped = [];
        const refused = [];
        const readers = new Map(targetCols.map((col) => [col, this._reader(col)]));
        for (let r = 0; r < fit; r++) {
            const pos = at.row + r;
            const rowIdx = g.rowIndexAt(pos);
            targetCols.forEach((col, c) => {
                if (c >= matrix[r].length) return;   // a short line: nothing there
                if (!g.canEdit(pos, col)) { skipped.push({ row: pos, col, rowIdx }); return; }
                const text = matrix[r][c];
                const read = readers.get(col)(text);
                if (read.ok) cells.push({ rowIdx, colIdx: col, value: read.value });
                else refused.push({ row: pos, col, rowIdx, text, error: read.error });
            });
        }

        // The rows past the last loaded one, as data rows: every pasted
        // column read; one that does not read is null, and listed.
        let appended = 0;
        if (extra > 0) {
            const n = (cfg.headers || []).length;
            const rows = [];
            const errors = [];
            for (let r = fit; r < matrix.length; r++) {
                const row = new Array(n).fill(null);
                targetCols.forEach((col, c) => {
                    if (c >= matrix[r].length) return;
                    const text = matrix[r][c];
                    const read = readers.get(col)(text);
                    if (read.ok) row[col] = read.value;
                    else errors.push({ row: rows.length, colIdx: col, text, error: read.error });
                });
                rows.push(row);
            }
            const append = cfg.onRowsAppend;
            if (typeof append === 'function') {
                appended = rows.length;
                this.busy = true;
                try { await append({ rows, errors }); } catch (err) {
                    console.error('[DataTable] onRowsAppend threw', err);
                } finally {
                    this.busy = false;
                }
            } else {
                this._warn(`${rows.length} row(s) past the last loaded row were not pasted (no \`onRowsAppend\`).`);
            }
        }

        const staged = g.staged.stageMany(cells, `paste ${cells.length} cell(s)`);

        // The range covers the block that landed, the cursor where it began.
        const lastCol = targetCols[targetCols.length - 1] ?? at.col;
        const lastRow = at.row + Math.max(0, fit - 1);
        g.set({ row: at.row, col: at.col }, { row: lastRow, col: lastCol });

        // Marked after the selection moved, which clears the last marks.
        for (const s of skipped) this.skipped.add(key(s.rowIdx, s.col));
        const redraw = new Set();
        for (const f of refused) {
            const k = key(f.rowIdx, f.col);
            g.errors.set(k, { value: f.text, message: f.error });
            // Any older commit of the cell still out no longer owns its marks.
            g.latest.set(k, {});
            g.pending.delete(k);
            redraw.add(f.rowIdx);
        }
        for (const rowIdx of redraw) g._redraw(rowIdx);
        if (skipped.length) g.paint();

        if (droppedColumns > 0) {
            this._warn(`${droppedColumns} column(s) past the last column were not pasted.`);
        }
        return {
            rows: matrix.length, cols: width, staged, skipped, refused, droppedColumns, appended,
        };
    }

    dispose() {
        this.skipped.clear();
    }
}
