/**
 * fact_table.js — A SHEET OF FACTS: a name and its value, row after row, with
 * no header row, nothing truncated and no height to give it. (0.7.0)
 *
 *     Server          db-main-01.internal
 *     Version         16.4
 *     Connection      postgresql://tables@db-main-01.internal:5432/tables_control
 *                     ?application_name=tables-api&sslmode=verify-full
 *
 * A DataTable is the wrong tool for this, for three reasons that are its
 * design rather than its defects: it draws a header row, it clips a cell to
 * one line (a long value becomes an ellipsis), and it fills a box with a
 * height (in a box without one it draws its header and no rows). A fact
 * sheet is the opposite on all three: the names are the header, every value
 * is read whole, and the sheet is exactly as tall as its rows.
 *
 * So this is a plain `<table class="twm-facts">`:
 *
 *  - the first column is the LABEL — muted, and kept on one line (pass
 *    `wrapLabels: true` to let a long one wrap, `labelColumn: false` for a
 *    sheet whose first column is ordinary data);
 *  - every value WRAPS — at spaces, and inside a long word or URL when it must
 *    (`overflow-wrap: anywhere`) — and keeps its own line breaks, so a
 *    pretty-printed JSON value reads as one;
 *  - a value is text, a number or a NODE (a pill, a link, a button); an
 *    object or array is drawn as indented JSON; `null` is an empty cell, or
 *    `nullDisplay`;
 *  - `mono` draws values in the monospace face, for the whole sheet or one row;
 *  - `compare: true` gives each row a BEFORE and an AFTER, with an arrow
 *    between: a row whose two sides differ is `--changed`, one that has only
 *    an after is `--added`, only a before `--removed`, and the same on both
 *    sides `--same`. A row with a plain `value` spans both sides;
 *  - `headers` adds a header row after all, for the sheets that have several
 *    columns of facts (a list of schemas, a list of pools); rows are then
 *    arrays of cells, and `numeric` names the columns of figures.
 *
 * A row may be an OBJECT — `{label, value}` or `{label, before, after}`, with
 * `mono`, `numeric`, `labelTitle`, `key` and `status` — or an ARRAY of cells,
 * `[label, value, …]`, which is the positional form a multi-column sheet uses.
 */

let SEQ = 0;
const isNode = (v) => typeof Node !== 'undefined' && v instanceof Node;

/**
 * @typedef {Object} FactRow
 * @property {string|Node} label
 * @property {*} [value]
 * @property {*} [before] - With `compare`: the value before.
 * @property {*} [after] - With `compare`: the value after.
 * @property {boolean} [mono] - This row's values in the monospace face.
 * @property {boolean} [numeric] - This row's values in tabular numerals.
 * @property {string} [labelTitle] - A tooltip on the label.
 * @property {*} [key] - `data-key` on the row.
 * @property {'changed'|'same'|'added'|'removed'} [status] - With `compare`:
 *   overrides the status worked out from the two sides.
 */

/**
 * @typedef {Object} FactTableConfig
 * @property {Array<FactRow|Array>} [rows=[]]
 * @property {string[]|null} [headers=null] - A header row. Off by default.
 * @property {boolean} [compare=false] - A before and an after column.
 * @property {boolean} [labelColumn=true] - The first column is a label.
 * @property {boolean} [wrapLabels=false] - Let a long label wrap.
 * @property {boolean} [mono=false] - Every value in the monospace face.
 * @property {number[]} [numeric=[]] - Column indices drawn in tabular numerals.
 * @property {string} [nullDisplay=''] - What `null`/`undefined` reads as.
 * @property {string} [missing='—'] - With `compare`: an absent side.
 * @property {Function} [rowClass] - `(row, idx) => string|string[]|null`.
 * @property {Function} [rowAttrs] - `(row, idx) => {name: value}`.
 * @property {string|Node|Function} [emptyState] - Shown when there are no rows.
 * @property {string} [label] - The table's accessible name (`aria-label`).
 * @property {string} [className] - Added to the `<table>`.
 */

export class FactTable {
    /**
     * @param {HTMLElement|null} host  appended to, if given
     * @param {FactTableConfig} [config]
     */
    constructor(host, config = {}) {
        this.config = {
            rows: [],
            headers: null,
            compare: false,
            labelColumn: true,
            wrapLabels: false,
            mono: false,
            numeric: [],
            nullDisplay: '',
            missing: '—',
            rowClass: null,
            rowAttrs: null,
            emptyState: null,
            label: null,
            className: null,
            ...config,
        };
        this._rows = Array.isArray(this.config.rows) ? this.config.rows.slice() : [];
        this._id = ++SEQ;
        const table = document.createElement('table');
        table.className = 'twm-facts'
            + (this.config.compare ? ' twm-facts--compare' : '')
            + (this.config.labelColumn ? '' : ' twm-facts--no-label')
            + (this.config.wrapLabels ? ' twm-facts--wrap-labels' : '')
            + (this.config.mono ? ' twm-facts--mono' : '')
            + (this.config.className ? ` ${this.config.className}` : '');
        if (this.config.label) table.setAttribute('aria-label', this.config.label);
        this.element = table;
        this._draw();
        if (host) host.appendChild(table);
    }

    /** Replace the rows and draw them. */
    setRows(rows) {
        this._rows = Array.isArray(rows) ? rows.slice() : [];
        this._draw();
    }

    getRows() {
        return this._rows.slice();
    }

    /** The `<tr>` drawn for row `idx`, or null. */
    getRow(idx) {
        return this.element.tBodies[0]?.rows[idx]?.__factIndex === idx
            ? this.element.tBodies[0].rows[idx] : null;
    }

    dispose() {
        this.element.remove();
    }

    // ── drawing ──────────────────────────────────────────────────────────

    /** How many columns the sheet has. */
    _width() {
        const { compare, headers } = this.config;
        if (compare) return 4;
        let n = 2;
        if (Array.isArray(headers)) n = Math.max(n, headers.length);
        for (const r of this._rows) if (Array.isArray(r)) n = Math.max(n, r.length);
        return n;
    }

    _draw() {
        const table = this.element;
        table.replaceChildren();
        const width = this._width();
        const { headers, compare } = this.config;

        if (Array.isArray(headers) && headers.length) {
            const thead = document.createElement('thead');
            const tr = document.createElement('tr');
            // With `compare`, three names stand over label, before and after;
            // the arrow column gets an empty one.
            const names = compare && headers.length === 3
                ? [headers[0], headers[1], '', headers[2]] : headers;
            for (let i = 0; i < width; i++) {
                const th = document.createElement('th');
                th.scope = 'col';
                appendContent(th, names[i] ?? '');
                if (this._numeric(i)) th.classList.add('twm-facts__num');
                tr.appendChild(th);
            }
            thead.appendChild(tr);
            table.appendChild(thead);
        }

        const tbody = document.createElement('tbody');
        this._rows.forEach((row, idx) => tbody.appendChild(this._row(row, idx, width)));
        if (!this._rows.length) {
            let content = this.config.emptyState;
            if (typeof content === 'function') content = content();
            if (content != null && content !== false && content !== '') {
                const tr = document.createElement('tr');
                tr.className = 'twm-facts__empty-row';
                const td = document.createElement('td');
                td.className = 'twm-facts__empty';
                td.colSpan = width;
                appendContent(td, content);
                tr.appendChild(td);
                tbody.appendChild(tr);
            }
        }
        table.classList.toggle('twm-facts--empty', this._rows.length === 0);
        table.appendChild(tbody);
    }

    _numeric(col) {
        const n = this.config.numeric;
        return Array.isArray(n) && n.includes(col);
    }

    _row(row, idx, width) {
        const tr = document.createElement('tr');
        tr.className = 'twm-facts__row';
        tr.__factIndex = idx;
        tr.__fact = row;
        if (Array.isArray(row)) {
            for (let i = 0; i < width; i++) {
                const td = this._cell(i === 0 && this.config.labelColumn ? 'label' : 'value', row[i]);
                if (this._numeric(i)) td.classList.add('twm-facts__num');
                if (i === row.length - 1 && row.length < width) {
                    td.colSpan = width - i;
                    tr.appendChild(td);
                    break;
                }
                tr.appendChild(td);
            }
        } else {
            const r = row && typeof row === 'object' ? row : { label: row };
            if (r.key !== undefined && r.key !== null) tr.dataset.key = String(r.key);
            const label = this._cell(this.config.labelColumn ? 'label' : 'value', r.label);
            if (r.labelTitle) label.title = String(r.labelTitle);
            tr.appendChild(label);
            const tune = (td) => {
                if (r.mono) td.classList.add('twm-facts__mono');
                if (r.numeric) td.classList.add('twm-facts__num');
                return td;
            };
            const hasBefore = Object.prototype.hasOwnProperty.call(r, 'before');
            const hasAfter = Object.prototype.hasOwnProperty.call(r, 'after');
            if (this.config.compare && (hasBefore || hasAfter)) {
                const status = r.status || statusOf(r, hasBefore, hasAfter);
                tr.classList.add(`twm-facts__row--${String(status).replace(/[^\w-]/g, '')}`);
                tr.dataset.status = String(status);
                const before = tune(hasBefore ? this._cell('value', r.before) : this._missing());
                before.classList.add('twm-facts__before');
                const arrow = document.createElement('td');
                arrow.className = 'twm-facts__arrow';
                arrow.setAttribute('aria-hidden', 'true');
                arrow.textContent = '→';
                const after = tune(hasAfter ? this._cell('value', r.after) : this._missing());
                after.classList.add('twm-facts__after');
                tr.append(before, arrow, after);
            } else {
                const value = tune(this._cell('value', r.value));
                if (width > 2) value.colSpan = width - 1;
                tr.appendChild(value);
            }
        }
        this._decorate(tr, row, idx);
        return tr;
    }

    _cell(kind, content) {
        const isLabel = kind === 'label';
        const td = document.createElement(isLabel ? 'th' : 'td');
        td.className = isLabel ? 'twm-facts__label' : 'twm-facts__value';
        if (isLabel) td.scope = 'row';
        if (content === null || content === undefined) {
            const said = isLabel ? '' : this.config.nullDisplay;
            if (said) {
                td.textContent = String(said);
                td.classList.add('twm-facts__null');
            }
        } else {
            appendContent(td, content);
        }
        return td;
    }

    _missing() {
        const td = document.createElement('td');
        td.className = 'twm-facts__value twm-facts__missing';
        td.textContent = String(this.config.missing ?? '');
        return td;
    }

    _decorate(tr, row, idx) {
        const { rowClass, rowAttrs } = this.config;
        if (typeof rowClass === 'function') {
            const c = rowClass(row, idx);
            const list = Array.isArray(c) ? c : String(c ?? '').split(/\s+/);
            for (const name of list) if (name) tr.classList.add(String(name));
        }
        if (typeof rowAttrs === 'function') {
            for (const [name, value] of Object.entries(rowAttrs(row, idx) || {})) {
                if (value == null || value === false) continue;
                try {
                    tr.setAttribute(name, value === true ? '' : String(value));
                } catch (err) {
                    console.error(`[FactTable] rowAttrs: bad attribute "${name}"`, err);
                }
            }
        }
    }
}

/**
 * Build a fact sheet, append it to `host` (if given) and draw it.
 *
 * @param {HTMLElement|null} host
 * @param {FactTableConfig} [config]
 * @returns {FactTable}
 */
export function createFactTable(host, config = {}) {
    return new FactTable(host, config);
}

/** What a before/after row says, from its two sides. Nodes cannot be
 *  compared, so a row that has one is `changed` unless it says otherwise;
 *  objects compare by their JSON. */
function statusOf(r, hasBefore, hasAfter) {
    if (!hasBefore) return 'added';
    if (!hasAfter) return 'removed';
    if (isNode(r.before) || isNode(r.after)) return 'changed';
    if (Object.is(r.before, r.after)) return 'same';
    if (r.before && r.after && typeof r.before === 'object' && typeof r.after === 'object') {
        try {
            return JSON.stringify(r.before) === JSON.stringify(r.after) ? 'same' : 'changed';
        } catch {
            return 'changed';
        }
    }
    return 'changed';
}

/** Text, a number, a node, or an object (drawn as indented JSON) into `el`. */
function appendContent(el, content) {
    if (content === null || content === undefined) return;
    if (isNode(content)) { el.appendChild(content); return; }
    let text;
    if (typeof content === 'object') {
        try { text = JSON.stringify(content, null, 2); } catch { text = String(content); }
    } else {
        text = String(content);
    }
    el.appendChild(document.createTextNode(text));
}
