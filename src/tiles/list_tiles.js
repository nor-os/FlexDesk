/**
 * list_tiles.js — a LIST tile and a PEOPLE tile for a `TileGrid` (0.16.1).
 *
 * Both are rows you hand over through `setData()`, the way the chart tile takes
 * series: which records are in the list, how they sort and what a row says is
 * the embedder's job, because only the embedder knows what a record is. What a
 * tile here owns is everything a list on a board needs and every embedder would
 * otherwise write again: the count, the empty line, the "open all of these"
 * button, a click, the keyboard, and a right-click menu per row.
 *
 *     import { registerListTiles } from '@flexdesk/tiles';
 *     registerListTiles();                         // idempotent; nothing registers at import
 *     const tile = grid.addTile('flexdesk.list', {x: 0, y: 0, w: 6, h: 4},
 *                               { title: 'Overdue', empty_text: 'Nothing is late.' });
 *     tile.onRowActivate = ({ row, event }) => open(row.key, event.ctrlKey);
 *     tile.rowMenu = ({ row }) => [{ label: 'Open', icon: 'open_in_new', action: 'open' }];
 *     tile.onRowMenuAction = ({ action, row }) => { … };
 *     tile.setData({
 *         rows: [{ key: '7', icon: 'task', lead: 'TASK-0007', title: 'Sign-off',
 *                  cells: [{ text: 'priya' }, { text: '9 days late', tone: 'danger' }] }],
 *         total: 12,                                // "7 of 12" when only 7 are handed over
 *         action: { label: 'Open as a list' },      // the button in the bar; see onAction
 *     });
 *
 * ══ THE DATA ════════════════════════════════════════════════════════════
 *
 *   list    { rows: [Row], total?, note?, empty?, action?: {label, icon?} }  (an array is {rows})
 *           Row = { key, title, icon?, iconTitle?, lead?, className?, tip?,
 *                   cells?: [{ text, title?, tone?, icon?, className? }] }
 *   people  { people: [Person], total?, note?, empty?, action? }            (an array is {people})
 *           Person = { key, name, icon?, muted?, count, countLabel?, title?,
 *                      pills?: [{ text, tone?, title? }] }
 *
 * `tone` is one of `danger`, `warning`, `ok`, `muted` and only picks a colour;
 * the text says the same thing, because colour alone does not survive a
 * monochrome display. `className` is the embedder's own class, added as it is,
 * so a status pill can keep the app's look.
 *
 * AN EMPTY LIST IS NOT THE EMPTY STATE. `{rows: []}` keeps the bar (count 0,
 * the button) and says `empty` (or `config.empty_text`) where the rows would be:
 * "nothing is late" is the most useful thing a list of late work can say, and a
 * tile that shows a grey inbox icon instead cannot say it. `setData(null)` is
 * the empty state; `showEmpty(message)` is how an embedder says "not set up".
 *
 * ══ INPUT ═══════════════════════════════════════════════════════════════
 *
 * A row is `role="button"` with a tab stop. Click, Enter and Space call
 * `onRowActivate({row, event, tile})` with the event, so the modifier keys
 * decide how it opens. Up and Down move between rows, Home and End to the ends.
 * Right-click, the context-menu key and Shift+F10 open the row's menu:
 * `rowMenu({row, event, tile})` answers the items (`showContextMenu`'s; none or
 * `[]` means no menu, and the browser's own is left alone) and the choice goes
 * to `onRowMenuAction({action, row, tile})`. The bar's button calls
 * `onAction({tile, event})`. Every hook can also be passed to the constructor.
 * A row carries `data-row-key`, so an embedder can find it for its own
 * listeners (a drag source, say); `rowsDraggable` makes rows `draggable`.
 *
 * The header reads `config.title`, else the type's title; the count is in the
 * bar, not the header, so a title the embedder sets is never rewritten.
 */

import { TileBase } from './tile_base.js';
import { registerWidget, getWidget } from './tile_registry.js';
import { showContextMenu } from '../ui/components/context_menu.js';

const TONES = new Set(['danger', 'warning', 'ok', 'muted']);

/** `{items, total, note, empty, action}` from what `setData` was handed under
 *  `key` (`rows` or `people`), or null when there is nothing at all. */
function normalize(data, key) {
    if (data == null) return null;
    const d = Array.isArray(data) ? { [key]: data } : data;
    if (typeof d !== 'object' || !Array.isArray(d[key])) return null;
    const items = d[key].filter((r) => r && typeof r === 'object' && r.key != null);
    const total = Number.isFinite(Number(d.total)) && d.total !== null && d.total !== '' ? Number(d.total) : items.length;
    return {
        items,
        total: Math.max(total, items.length),
        note: typeof d.note === 'string' ? d.note : '',
        empty: typeof d.empty === 'string' ? d.empty : '',
        action: d.action && typeof d.action === 'object' && d.action.label ? d.action : null,
    };
}

/** Exported for tests and for an embedder that wants to know what the tile will make of its data. */
export const normalizeListData = (data) => normalize(data, 'rows');
export const normalizePeopleData = (data) => normalize(data, 'people');

function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = String(text);
    return e;
}

function glyph(name, cls = '') {
    const g = el('span', `material-symbols-outlined${cls ? ` ${cls}` : ''}`, name);
    g.setAttribute('aria-hidden', 'true');
    return g;
}

const toneClass = (base, tone) => (TONES.has(tone) ? ` ${base}--${tone}` : '');

/**
 * The rows, the bar and the input, shared by both tiles. A subclass says what
 * its items are called in the data (`_KEY`) and draws one (`_renderItem`).
 * @abstract
 */
class RowsTile extends TileBase {
    static _KEY = 'rows';

    constructor(options = {}) {
        super(options);
        this.onRowActivate = typeof options.onRowActivate === 'function' ? options.onRowActivate : null;
        this.rowMenu = typeof options.rowMenu === 'function' ? options.rowMenu : null;
        this.onRowMenuAction = typeof options.onRowMenuAction === 'function' ? options.onRowMenuAction : null;
        this.onAction = typeof options.onAction === 'function' ? options.onAction : null;
        this.rowsDraggable = options.rowsDraggable === true;
        this._items = new Map();         // key → the item drawn for it
        this._onClick = (e) => this._click(e);
        this._onKey = (e) => this._key(e);
        this._onMenu = (e) => this._menu(e);
    }

    /** Pure and static-only — it runs inside `TileBase`'s constructor. */
    getDefaultConfig() {
        return { title: '', empty_text: '', max_rows: 0 };
    }

    getConfigSchema() {
        return {
            fields: [
                { name: 'title', type: 'text', label: 'Tile title' },
                { name: 'empty_text', type: 'text', label: 'When there is nothing',
                  help: 'What the tile says when the list is empty, e.g. "Nothing is late."' },
                { name: 'max_rows', type: 'number', label: 'Rows at most', min: 0,
                  help: '0 shows them all; the tile scrolls.' },
            ],
        };
    }

    mount(container) {
        super.mount(container);
        applyTitle(this);
        const c = this.contentElement;
        if (!c) return;
        // On the content element, which outlives every render (they replace
        // its children, never it), so one set of listeners serves them all.
        c.addEventListener('click', this._onClick);
        c.addEventListener('keydown', this._onKey);
        c.addEventListener('contextmenu', this._onMenu);
    }

    /** `null` is "the grid has no data" — see `ChartTile.update`. */
    update(data, config) {
        if (this._disposed) return;
        super.update(data === null ? undefined : data, config);
        if (config) applyTitle(this);
    }

    /** Hand this tile its rows; null is the empty state. */
    setData(data) {
        if (this._disposed) return;
        this.data = data ?? null;
        if (this.contentElement) this.render(this.data);
    }

    /** The item drawn under `key`, or null. */
    itemFor(key) { return this._items.get(String(key)) ?? null; }

    /** The element of the item drawn under `key`, or null. */
    rowElement(key) {
        const want = String(key);
        return [...(this.contentElement?.querySelectorAll('[data-row-key]') || [])]
            .find((r) => r.dataset.rowKey === want) || null;
    }

    render(data) {
        const content = this.contentElement;
        if (!content) return;
        const norm = normalize(data, this.constructor._KEY);
        this._items.clear();
        if (!norm) { this.showEmpty('Nothing to show.'); return; }

        const max = Math.max(0, Math.floor(Number(this.config.max_rows) || 0));
        const shown = max ? norm.items.slice(0, max) : norm.items;
        const box = el('div', `fd-list-tile fd-list-tile--${this.constructor._KEY}`);

        const bar = el('div', 'fd-list-tile__bar');
        const count = el('span', 'fd-list-tile__count',
            shown.length < norm.total ? `${shown.length} of ${norm.total}` : String(norm.total));
        count.title = `${norm.total} in all`;
        bar.append(count, el('span', 'fd-list-tile__spacer'));
        if (norm.action) {
            const b = el('button', 'fd-list-tile__action');
            b.type = 'button';
            b.dataset.listAction = 'action';
            if (norm.action.icon) b.append(glyph(norm.action.icon));
            b.append(el('span', null, norm.action.label));
            bar.append(b);
        }
        box.append(bar);

        const list = el('div', 'fd-list-tile__rows');
        list.setAttribute('role', 'list');
        if (!shown.length) {
            list.append(el('div', 'fd-list-tile__empty', norm.empty || this.config.empty_text || 'Nothing here.'));
        }
        for (const item of shown) {
            const key = String(item.key);
            if (this._items.has(key)) continue;          // one row per key: a second would be unreachable
            this._items.set(key, item);
            const row = this._renderItem(item);
            row.classList.add('fd-list-tile__row');
            row.dataset.rowKey = key;
            row.setAttribute('role', 'button');
            row.tabIndex = 0;
            if (this.rowsDraggable) row.draggable = true;
            const wrap = el('div', 'fd-list-tile__item');
            wrap.setAttribute('role', 'listitem');
            wrap.append(row);
            list.append(wrap);
        }
        box.append(list);
        if (norm.note) {
            const note = el('div', 'fd-list-tile__note', norm.note);
            note.setAttribute('role', 'note');
            note.title = norm.note;
            box.append(note);
        }
        content.replaceChildren(box);
    }

    /** One item's row element. @abstract */
    _renderItem(_item) { return el('div'); }

    // ── input ───────────────────────────────────────────────────────────

    _rowOf(target) {
        const row = target?.closest?.('[data-row-key]');
        return row && this.contentElement?.contains(row) ? row : null;
    }

    _click(e) {
        if (e.target?.closest?.('[data-list-action]')) {
            this._call(this.onAction, { tile: this, event: e });
            return;
        }
        const row = this._rowOf(e.target);
        if (row) this._activate(row, e);
    }

    _activate(rowEl, event) {
        const row = this.itemFor(rowEl.dataset.rowKey);
        if (row) this._call(this.onRowActivate, { row, event, tile: this });
    }

    _key(e) {
        const rowEl = this._rowOf(e.target);
        if (!rowEl) return;
        if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
            const r = rowEl.getBoundingClientRect();
            if (this._openMenu(rowEl, e, r.left + 16, r.bottom)) e.preventDefault();
            return;
        }
        if ((e.key === 'Enter' || e.key === ' ') && !e.altKey) {
            e.preventDefault();
            this._activate(rowEl, e);
            return;
        }
        const rows = [...this.contentElement.querySelectorAll('[data-row-key]')];
        const i = rows.indexOf(rowEl);
        const to = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: rows.length - 1 }[e.key];
        if (to === undefined || !rows[to]) return;
        e.preventDefault();
        rows[to].focus();
    }

    _menu(e) {
        const rowEl = this._rowOf(e.target);
        if (rowEl && this._openMenu(rowEl, e, e.clientX, e.clientY)) e.preventDefault();
    }

    /** Show the row's menu, if it has one. → whether it did. */
    _openMenu(rowEl, event, x, y) {
        const row = this.itemFor(rowEl.dataset.rowKey);
        if (!row || typeof this.rowMenu !== 'function') return false;
        let items = null;
        try { items = this.rowMenu({ row, event, tile: this }); }
        catch (err) { console.error(`[${this.constructor.name}] rowMenu threw:`, err); return false; }
        if (!Array.isArray(items) || !items.length) return false;
        showContextMenu(x, y, items, (action) => this._call(this.onRowMenuAction, { action, row, tile: this }));
        return true;
    }

    /** A hook, called so that one that throws is reported and the tile goes on. */
    _call(fn, arg) {
        if (typeof fn !== 'function') return;
        try { fn(arg); } catch (err) { console.error(`[${this.constructor.name}] a callback threw:`, err); }
    }

    dispose() {
        const c = this.contentElement;
        if (c) {
            c.removeEventListener('click', this._onClick);
            c.removeEventListener('keydown', this._onKey);
            c.removeEventListener('contextmenu', this._onMenu);
        }
        this._items.clear();
        super.dispose();
    }
}

/**
 * A LIST OF RECORDS: an icon, a lead (a reference, say), the title, and cells.
 * See the header for the data and the input.
 */
export class ListTile extends RowsTile {
    static TYPE = 'flexdesk.list';
    static TITLE = 'List';
    static ICON = 'list';
    static DESCRIPTION = 'Rows you supply, with a count, a click and a right-click menu per row.';
    static DEFAULT_SIZE = { w: 6, h: 4 };
    static SIZE_CONSTRAINTS = { minW: 3, minH: 2, maxW: 12, maxH: 12 };
    static _KEY = 'rows';

    _renderItem(r) {
        const row = el('div', r.className ? String(r.className) : null);
        if (r.icon) {
            const g = glyph(r.icon, 'fd-list-tile__icon');
            if (r.iconTitle) { g.title = r.iconTitle; g.removeAttribute('aria-hidden'); }
            row.append(g);
        }
        if (r.lead != null && r.lead !== '') row.append(el('span', 'fd-list-tile__lead', r.lead));
        const title = el('span', 'fd-list-tile__title', r.title ?? '');
        title.title = r.tip || String(r.title ?? '');
        row.append(title);
        for (const c of Array.isArray(r.cells) ? r.cells : []) {
            if (!c) continue;
            const cell = el('span', `fd-list-tile__cell${toneClass('fd-list-tile__cell', c.tone)}${c.className ? ` ${c.className}` : ''}`);
            if (c.icon) cell.append(glyph(c.icon));
            if (c.text != null && c.text !== '') cell.append(document.createTextNode(String(c.text)));
            if (c.title) cell.title = c.title;
            row.append(cell);
        }
        return row;
    }
}

/**
 * WHO HAS WHAT: one row per person, with a count and pills. The order is the
 * embedder's (the list is read top-down and stopped at, so the order should BE
 * the priority); `groupByPerson` is a starting point for building it.
 */
export class PeopleTile extends RowsTile {
    static TYPE = 'flexdesk.people';
    static TITLE = 'People';
    static ICON = 'groups';
    static DESCRIPTION = 'One row per person, with how much is on them.';
    static DEFAULT_SIZE = { w: 6, h: 4 };
    static SIZE_CONSTRAINTS = { minW: 3, minH: 2, maxW: 12, maxH: 12 };
    static _KEY = 'people';

    getDefaultConfig() {
        return { ...super.getDefaultConfig(), count_label: 'open' };
    }

    getConfigSchema() {
        const { fields } = super.getConfigSchema();
        return { fields: [...fields, { name: 'count_label', type: 'text', label: 'Count reads',
            help: 'After each person\'s number, e.g. "open" for "3 open".' }] };
    }

    _renderItem(p) {
        const row = el('div', 'fd-people-tile__row');
        row.append(glyph(p.icon || (p.muted ? 'person_off' : 'person'), 'fd-list-tile__icon'));
        row.append(el('span', `fd-people-tile__name${p.muted ? ' fd-people-tile__name--muted' : ''}`, p.name ?? p.key));
        const pills = el('span', 'fd-people-tile__pills');
        for (const pill of Array.isArray(p.pills) ? p.pills : []) {
            if (!pill?.text) continue;
            const s = el('span', `fd-people-tile__pill${toneClass('fd-people-tile__pill', pill.tone)}`, pill.text);
            if (pill.title) s.title = pill.title;
            pills.append(s);
        }
        row.append(pills);
        const label = p.countLabel ?? this.config.count_label ?? '';
        row.append(el('span', 'fd-people-tile__count', `${Number(p.count) || 0}${label ? ` ${label}` : ''}`));
        if (p.title) row.title = p.title;
        return row;
    }
}

/**
 * Items grouped by person: `[{key, items}]`, most items first, then by key, the
 * nobody group (key `''`) last among equals. `personOf(item)` answers the
 * person's key, or a falsy value for nobody.
 */
export function groupByPerson(items, personOf) {
    const by = new Map();
    for (const item of Array.isArray(items) ? items : []) {
        const who = String(personOf(item) || '');
        if (!by.has(who)) by.set(who, { key: who, items: [] });
        by.get(who).items.push(item);
    }
    return [...by.values()].sort((a, b) => b.items.length - a.items.length
        || (a.key === '') - (b.key === '') || a.key.localeCompare(b.key));
}

/**
 * Register both tiles. Idempotent, and nothing registers at import time — see
 * `registerChartTiles`.
 */
export function registerListTiles() {
    for (const Tile of [ListTile, PeopleTile]) {
        if (getWidget(Tile.TYPE) !== Tile) registerWidget(Tile);
    }
}

/** The header shows `config.title`, else the type's own title. */
function applyTitle(tile) {
    tile.setTitle(tile.config.title || tile.constructor.TITLE);
}
