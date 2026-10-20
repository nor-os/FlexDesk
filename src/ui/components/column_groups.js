/**
 * column_groups.js — STORY-0066. DataTable's COLUMN GROUPS (`columnGroups`).
 * INTERNAL to the table: imported by `data_table.js` only, and not part of the
 * widgets barrel — it reads the table's private fields.
 *
 * A group is `{key, label?, columns: number[]}` (data column indices). The
 * groups draw a second header row above the column headers, one cell a run of
 * shown columns of the same group spanning them, a blank cell over the row
 * number / select column and over any run of columns in no group.
 *
 * ── WHY A TABLE OF ITS OWN ────────────────────────────────────────────────
 *
 * The group row is a separate `<table class="twm-dt-groups">` in the header
 * wrap, above the header table, rather than a first row of the header's
 * `<thead>`. Every width pass of the table (`_measureNaturalWidths`,
 * `_syncHeaderWidths`, the resize drag, `_applyTableWidth`) reads and writes
 * the header rows CELL BY CELL at the column's index, and under
 * `table-layout: fixed` the first row decides the track — a row of spanning
 * cells in either place would misalign every column. So the group table has a
 * `<colgroup>` of its own, one `<col>` a drawn column, and `align()` copies the
 * header's widths, table width, layout and sideways scroll onto it after every
 * pass that changes them (DataTable `_syncHeaderScroll`). The header wrap
 * scrolls both tables together.
 *
 * ── AN EMPTY GROUP KEEPS A PLACEHOLDER COLUMN ─────────────────────────────
 *
 * A group with no columns would have no cell to draw, so it gets one drawn
 * column of its own: a header cell `th.twm-dt-col--placeholder` (holding the
 * group's add control under `onColumnAdd`), an empty filter cell, and an
 * empty `td.twm-dt-cell--placeholder` in every body row. It is NO DATA
 * column: `_dataIdxOfDom` answers null for it, it is not in a copy, the CSV,
 * `ctx.colIdx` or the cell mode. It stands after the shown columns of the
 * groups listed before it.
 *
 * A table without `columnGroups` never builds this.
 */

/** The groups the table was given, cleaned: a key each, a label, the data
 *  columns that exist, each column in the first group that lists it. */
function normalize(spec, n) {
    const taken = new Set();
    const out = [];
    for (const g of Array.isArray(spec) ? spec : []) {
        if (!g || g.key == null) continue;
        const columns = [];
        for (const c of Array.isArray(g.columns) ? g.columns : []) {
            const i = Number(c);
            if (!Number.isInteger(i) || i < 0 || i >= n || taken.has(i)) continue;
            taken.add(i);
            columns.push(i);
        }
        out.push({ key: g.key, label: g.label == null ? String(g.key) : String(g.label), columns, spec: g });
    }
    return out;
}

/** A button in a header cell. Its click is its own: no sort under it. */
function actionButton(className, { icon, label, title }, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = className;
    if (icon) {
        const span = document.createElement('span');
        span.className = 'material-symbols-outlined';
        span.textContent = String(icon);
        b.appendChild(span);
    }
    if (label != null && !icon) b.appendChild(document.createTextNode(String(label)));
    const name = title ?? label;
    if (name != null) {
        b.title = String(name);
        b.setAttribute('aria-label', String(name));
    }
    b.addEventListener('mousedown', (ev) => ev.stopPropagation());
    b.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        onClick(ev);
    });
    return b;
}

export class ColumnGroups {
    /** @param {import('./data_table.js').DataTable} table */
    constructor(table) {
        this.table = table;
        this._memoKey = null;
        this._memo = null;
        this._el = null;
    }

    _cfg() {
        return this.table.config;
    }

    /**
     * The drawn columns after the lead, in order: `{col, group}` for a shown
     * data column (`group` the index in `groups`, or null) and
     * `{placeholder: true, group}` for an empty group's column. Memoised on
     * the groups' content, the column count and the hidden set.
     */
    layout() {
        const cfg = this._cfg();
        const n = cfg.headers?.length || 0;
        const hidden = this.table.getHiddenColumns();
        const spec = Array.isArray(cfg.columnGroups) ? cfg.columnGroups : [];
        const key = `${n}|${hidden.join(',')}|${spec.map((g) => (g ? `${g.key}\x01${g.label}\x01${(g.columns || []).join(',')}` : '')).join('\x02')}`;
        if (key === this._memoKey) return this._memo;

        const groups = normalize(spec, n);
        const groupOf = new Array(n).fill(null);
        groups.forEach((g, gi) => { for (const c of g.columns) groupOf[c] = gi; });
        const empty = groups.map((g) => g.columns.length === 0);
        const placed = new Set();
        const slots = [];
        const placeEmptyBefore = (gi) => {
            for (let e = 0; e < gi; e++) {
                if (empty[e] && !placed.has(e)) { placed.add(e); slots.push({ placeholder: true, group: e }); }
            }
        };
        for (let c = 0; c < n; c++) {
            if (this.table._isHidden(c)) continue;
            const gi = groupOf[c];
            if (gi !== null) placeEmptyBefore(gi);
            slots.push({ col: c, group: gi });
        }
        placeEmptyBefore(groups.length);

        const slotOfCol = new Map();
        slots.forEach((s, i) => { if (!s.placeholder) slotOfCol.set(s.col, i); });
        const placeholders = slots.filter((s) => s.placeholder).length;
        this._memoKey = key;
        this._memo = { groups, slots, slotOfCol, placeholders };
        return this._memo;
    }

    /** How many placeholder columns are drawn. */
    placeholderCount() {
        return this.layout().placeholders;
    }

    /** A shown data column's place after the lead, or -1 when the layout
     *  has no placeholder (the table's own arithmetic then holds). */
    slotOf(colIdx) {
        const l = this.layout();
        if (!l.placeholders) return -1;
        return l.slotOfCol.has(colIdx) ? l.slotOfCol.get(colIdx) : -1;
    }

    /** What the drawn column `i` after the lead is: the data column, null for
     *  a placeholder or past the end, `undefined` when the layout has no
     *  placeholder (the table's own arithmetic then holds). */
    slotAt(i) {
        const l = this.layout();
        if (!l.placeholders) return undefined;
        const s = l.slots[i];
        return s && !s.placeholder ? s.col : null;
    }

    /** Part of the table's column signature: where the placeholders stand. */
    sig() {
        const l = this.layout();
        if (!l.placeholders) return '';
        return `|g${l.slots.map((s, i) => (s.placeholder ? i : '')).filter((x) => x !== '').join(',')}`;
    }

    /** The drawn positions (after the lead) of the placeholders, ascending,
     *  with their groups. */
    _placeholderSlots() {
        const out = [];
        this.layout().slots.forEach((s, i) => { if (s.placeholder) out.push({ at: i, group: s.group }); });
        return out;
    }

    /** Put the placeholders' cells into a drawn row whose cells are the lead
     *  and the shown data columns, in order. */
    _insert(tr, make) {
        const lead = this.table._lead().all;
        for (const { at, group } of this._placeholderSlots()) {
            const ref = tr.children[lead + at] || null;
            tr.insertBefore(make(this.layout().groups[group]), ref);
        }
    }

    /** STORY-0066. A body row gets an empty cell under each placeholder. */
    fillRow(tr) {
        if (!this.placeholderCount()) return;
        this._insert(tr, () => {
            const td = document.createElement('td');
            td.className = 'twm-dt-cell--placeholder';
            return td;
        });
    }

    /**
     * After the header is built and in the header table: the placeholders'
     * header and filter cells, and the group table above the header table.
     */
    decorate(headerWrap, headerTable) {
        this._el = null;
        if (!headerWrap || !headerTable) return;
        const thead = headerTable.querySelector('thead');
        const labelRow = thead?.querySelector('tr');
        if (!labelRow) return;
        if (this.placeholderCount()) {
            this._insert(labelRow, (g) => this._placeholderHead(g));
            for (const tr of thead.querySelectorAll('tr.twm-data-table__filter-row')) {
                this._insert(tr, () => {
                    const th = document.createElement('th');
                    th.className = 'data-table__filter-cell data-table__filter-cell--empty twm-dt-col--placeholder';
                    return th;
                });
            }
        }
        const groupTable = this._buildGroupTable(headerTable);
        headerWrap.insertBefore(groupTable, headerTable);
        this._el = groupTable;
        this.align();
    }

    _placeholderHead(group) {
        const th = document.createElement('th');
        th.className = 'text twm-dt-col--placeholder';
        th.__groupKey = group.key;
        if (typeof this._cfg().onColumnAdd === 'function') {
            th.appendChild(this._addButton(group));
        }
        return th;
    }

    _addButton(group) {
        return actionButton('twm-dt-group__add', { icon: 'add', title: `Add column to ${group.label}` },
                            () => this._call('onColumnAdd', group.key));
    }

    _call(name, ...args) {
        try { this._cfg()[name]?.(...args); } catch (err) {
            console.error(`[DataTable] ${name} threw`, err);
        }
    }

    _buildGroupTable(headerTable) {
        const { groups, slots } = this.layout();
        const lead = this.table._lead().all;
        const table = document.createElement('table');
        table.className = `${headerTable.className} twm-dt-groups`;
        const colgroup = document.createElement('colgroup');
        for (let i = 0; i < lead + slots.length; i++) colgroup.appendChild(document.createElement('col'));
        table.appendChild(colgroup);
        const thead = document.createElement('thead');
        const tr = document.createElement('tr');
        tr.className = 'twm-dt-group-row';
        if (lead) {
            const th = document.createElement('th');
            th.className = 'twm-dt-group twm-dt-group--lead';
            th.colSpan = lead;
            tr.appendChild(th);
        }
        // Runs of the same group (or of no group) are one cell.
        let i = 0;
        while (i < slots.length) {
            const gi = slots[i].group;
            let j = i + 1;
            while (j < slots.length && slots[j].group === gi) j++;
            tr.appendChild(gi === null ? this._blankCell(j - i) : this._groupCell(groups[gi], j - i, slots[i].placeholder));
            i = j;
        }
        thead.appendChild(tr);
        table.appendChild(thead);
        return table;
    }

    _blankCell(span) {
        const th = document.createElement('th');
        th.className = 'twm-dt-group twm-dt-group--none';
        th.colSpan = span;
        return th;
    }

    _groupCell(group, span, empty) {
        const th = document.createElement('th');
        th.className = empty ? 'twm-dt-group twm-dt-group--empty' : 'twm-dt-group';
        th.colSpan = span;
        th.__groupKey = group.key;
        th.title = group.label;
        const label = document.createElement('span');
        label.className = 'twm-dt-group__label';
        label.textContent = group.label;
        th.appendChild(label);

        const actions = document.createElement('span');
        actions.className = 'twm-dt-group__actions';
        const cfg = this._cfg();
        if (typeof cfg.groupActions === 'function') {
            let items = null;
            try {
                items = cfg.groupActions(group.spec, { key: group.key, columns: group.columns.slice(), table: this.table });
            } catch (err) {
                console.error('[DataTable] groupActions threw', err);
            }
            for (const item of Array.isArray(items) ? items.filter(Boolean) : []) {
                const b = actionButton('twm-dt-group__action', item,
                                       () => this._call('onGroupAction', item.action, group.key));
                if (item.disabled) b.disabled = true;
                actions.appendChild(b);
            }
        }
        if (typeof cfg.onColumnAdd === 'function') actions.appendChild(this._addButton(group));
        if (actions.childNodes.length) th.appendChild(actions);
        return th;
    }

    /** The group table follows the header table: the same column widths,
     *  table width, layout and sideways offset. */
    align() {
        const groupTable = this._el;
        const headerTable = this.table._headerTableEl;
        if (!groupTable || !headerTable) return;
        const labelRow = headerTable.querySelector('thead > tr');
        const cols = groupTable.querySelector('colgroup')?.children || [];
        for (let i = 0; i < cols.length; i++) {
            const th = labelRow?.children[i];
            const w = th ? parseFloat(th.style.width) : NaN;
            cols[i].style.width = Number.isFinite(w) ? `${w}px` : '';
        }
        groupTable.style.width = headerTable.style.width;
        groupTable.style.tableLayout = headerTable.style.tableLayout;
        groupTable.style.transform = headerTable.style.transform;
    }

    /** The group table drawn by the last render, or null. */
    element() {
        return this._el;
    }
}
