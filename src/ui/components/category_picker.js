/**
 * category_picker.js
 *
 * A categorised picker popover (STORY-0126): a search field over three
 * columns — the categories (colour dot, label, item count), the active
 * category's items (icon, label) and a detail pane for the highlighted item
 * (title, description, an optional monospace preview, an Add button).
 *
 *   ┌──────────────────────────────────────────────────────────┐
 *   │ [ Search…                                              ] │
 *   ├──────────────┬──────────────────┬────────────────────────┤
 *   │ ● Text     3 │ [H]  Heading     │ Delay / Lag            │
 *   │ ● Model    5 │ [Δt] Delay / Lag │ The value of an        │
 *   │ ● Functions 6│ [Tb] Schedule    │ expression some time…  │
 *   │              │                  │ ┌────────────────────┐ │
 *   │              │                  │ │ lag(inflation, 2)  │ │
 *   │              │                  │ └────────────────────┘ │
 *   │              │                  │                  [Add] │
 *   └──────────────┴──────────────────┴────────────────────────┘
 *
 * Usage:
 * ```javascript
 * const picker = new CategoryPicker({
 *     trigger: addButton,
 *     categories: [
 *         { id: 'text', label: 'Text', color: 'var(--accent-light)', items: [
 *             { id: 'heading', label: 'Heading', badge: 'H',
 *               description: 'A section heading.', preview: '## Debt dynamics' },
 *         ] },
 *     ],
 *     onSelect: (item, category) => insert(category.id, item.id),
 * });
 * picker.open(); picker.close(); picker.toggle(); picker.destroy();
 * ```
 *
 * It is anchored and dismissed like `ActionDropdown`: the trigger's click
 * toggles it, it is placed by `ActionDropdown.position` (position: fixed,
 * under the trigger or flipped above it, kept 8px inside the window), drawn
 * on `--z-over-windows`, and an outside click or Escape closes it. Escape and
 * a pick give focus back to the trigger.
 *
 * Keyboard. Focus sits in the search field; typing filters. With no query,
 * Up/Down move within the current column (the categories, or the active
 * category's items) and Left/Right move between the two. With a query, the
 * items column is a flat hit list across every category, grouped under the
 * category's label; Up/Down walk it and Left/Right edit the query. Enter
 * picks the highlighted item, Escape closes. A double-click on an item picks
 * it; hovering or clicking one shows it in the detail pane.
 */
import { ActionDropdown } from './action_dropdown.js';

let _seq = 0;

/** Lower-cased words of a query; empty for a blank one. */
function _terms(query) {
    return String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
}

/** What a query is matched against: the label, the description, the keywords. */
function _haystack(item) {
    const kw = Array.isArray(item.keywords) ? item.keywords.join(' ') : (item.keywords || '');
    return `${item.label || ''} ${item.description || ''} ${kw}`.toLowerCase();
}

function _el(tag, className, text) {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (text != null) n.textContent = text;
    return n;
}

export class CategoryPicker {
    /**
     * @param {Object} config
     * @param {HTMLElement} config.trigger - The element the picker opens from; its click toggles it
     * @param {Array} config.categories - `[{ id, label, color?, items: [{ id, label, icon?, badge?,
     *     description?, preview?, keywords? }] }]`. `icon` is a Material Symbols ligature; `badge` a
     *     short text drawn as a monospace badge in the category's colour; `preview` is text shown
     *     monospace in the detail pane; `keywords` (array or string) are searched but not shown.
     * @param {Function} config.onSelect - `(item, category)` when an item is picked
     * @param {string} [config.className=''] - Additional CSS class for the popover
     * @param {string} [config.placeholder='Search…'] - The search field's placeholder
     * @param {string} [config.addLabel='Add'] - The detail pane's button
     * @param {string} [config.previewLabel] - A caption over the preview block (none when omitted)
     * @param {'start'|'end'} [config.align='start'] - Which trigger edge it lines up with first
     * @param {string} [config.label='Pick'] - The popover's accessible name (its `aria-label`)
     */
    constructor(config) {
        this.trigger = config.trigger;
        this.categories = config.categories || [];
        this.onSelect = config.onSelect;
        this.className = config.className || '';
        this.placeholder = config.placeholder ?? 'Search…';
        this.addLabel = config.addLabel ?? 'Add';
        this.previewLabel = config.previewLabel || '';
        this.align = config.align === 'end' ? 'end' : 'start';
        this.label = config.label || 'Pick';

        this.isOpen = false;
        this.el = null;

        this._id = `twm-category-picker-${++_seq}`;
        this._query = '';
        this._activeCat = 0;        // index of the category whose items show (no query)
        this._column = 'items';     // 'categories' | 'items' — where Up/Down go
        this._hl = null;            // { c, i } — the highlighted item
        this._rows = [];            // the items column's rows, in order: { c, i, el }

        this._onDocClick = this._onDocClick.bind(this);
        this._onKeydown = this._onKeydown.bind(this);
        this._onTriggerClick = this._onTriggerClick.bind(this);

        if (!this.trigger) {
            console.warn('[CategoryPicker] No trigger element provided');
            return;
        }
        this._build();
        this.trigger.setAttribute('aria-haspopup', 'dialog');
        this.trigger.setAttribute('aria-expanded', 'false');
        this.trigger.addEventListener('click', this._onTriggerClick);
    }

    // ── DOM ────────────────────────────────────────────────────────────────

    _build() {
        const root = _el('div', `twm-category-picker ${this.className}`.trim());
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-label', this.label);
        root.hidden = true;
        // FOCUS STAYS IN THE SEARCH FIELD. A press on anything but the field
        // (a row, a group header, the detail text, padding, a disabled button)
        // would otherwise move focus to <body>, outside the popover, and the
        // arrow keys, Enter and typing would stop reaching it while it is
        // open. The click still happens; only the focus move is cancelled
        // (which also means the preview's text cannot be drag-selected).
        root.addEventListener('mousedown', (e) => {
            if (e.target !== this._input) e.preventDefault();
        });

        const search = _el('div', 'twm-category-picker__search');
        const input = _el('input', 'twm-category-picker__input');
        input.type = 'search';
        input.placeholder = this.placeholder;
        input.setAttribute('aria-label', this.placeholder || 'Search');
        input.setAttribute('role', 'combobox');
        input.setAttribute('aria-expanded', 'true');
        input.setAttribute('aria-autocomplete', 'list');
        input.setAttribute('aria-controls', `${this._id}-items`);
        input.autocomplete = 'off';
        input.spellcheck = false;
        input.addEventListener('input', () => this._setQuery(input.value));
        search.appendChild(input);

        const body = _el('div', 'twm-category-picker__body');
        const cats = _el('div', 'twm-category-picker__categories twm-category-picker__column');
        cats.id = `${this._id}-cats`;
        cats.setAttribute('role', 'listbox');
        cats.setAttribute('aria-label', 'Categories');
        const items = _el('div', 'twm-category-picker__items twm-category-picker__column');
        items.id = `${this._id}-items`;
        items.setAttribute('role', 'listbox');
        items.setAttribute('aria-label', 'Items');
        // No aria-live: the input's aria-activedescendant already announces
        // each move, and a live region would read the pane on every one.
        const detail = _el('div', 'twm-category-picker__detail');
        body.append(cats, items, detail);

        root.append(search, body);
        document.body.appendChild(root);

        this.el = root;
        this._input = input;
        this._catsEl = cats;
        this._itemsEl = items;
        this._detailEl = detail;
        this._render();
    }

    /** The items column's entries: the active category's items, or every hit for the query. */
    _visible() {
        const terms = _terms(this._query);
        if (!terms.length) {
            const cat = this.categories[this._activeCat];
            return (cat?.items || []).map((_, i) => ({ c: this._activeCat, i }));
        }
        const out = [];
        this.categories.forEach((cat, c) => (cat.items || []).forEach((item, i) => {
            const hay = _haystack(item);
            if (terms.every((t) => hay.includes(t))) out.push({ c, i });
        }));
        return out;
    }

    /** Rebuild both lists and the detail pane. Hover never calls this. */
    _render() {
        if (!this.el) return;
        const searching = _terms(this._query).length > 0;
        const visible = this._visible();
        const hits = new Map();
        for (const v of visible) hits.set(v.c, (hits.get(v.c) || 0) + 1);

        // Keep the highlight when it is still listed, else the first entry.
        if (!this._hl || !visible.some((v) => v.c === this._hl.c && v.i === this._hl.i)) {
            this._hl = visible[0] ? { ...visible[0] } : null;
        }
        if (searching && this._hl) this._activeCat = this._hl.c;

        // Categories.
        this._catsEl.replaceChildren();
        this.categories.forEach((cat, c) => {
            const btn = _el('button', 'twm-category-picker__category');
            btn.type = 'button';
            btn.tabIndex = -1;
            btn.id = `${this._id}-cat-${c}`;
            btn.setAttribute('role', 'option');
            btn.dataset.index = String(c);
            if (cat.color) btn.style.setProperty('--twm-category-picker-color', cat.color);
            const count = searching ? (hits.get(c) || 0) : (cat.items || []).length;
            if (searching && !count) btn.classList.add('twm-category-picker__category--empty');
            btn.append(
                _el('span', 'twm-category-picker__dot'),
                _el('span', 'twm-category-picker__category-label', cat.label),
                _el('span', 'twm-category-picker__count', String(count)),
            );
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                this._column = 'categories';
                this._chooseCategory(c);
                this._input.focus();
            });
            this._catsEl.appendChild(btn);
        });

        // Items (or hits: each category's in a role="group" named by its header).
        this._itemsEl.replaceChildren();
        this._rows = [];
        let lastCat = -1;
        let into = this._itemsEl;
        for (const v of visible) {
            const cat = this.categories[v.c];
            const item = cat.items[v.i];
            if (searching && v.c !== lastCat) {
                const header = _el('div', 'twm-category-picker__group');
                header.id = `${this._id}-group-${v.c}`;
                if (cat.color) header.style.setProperty('--twm-category-picker-color', cat.color);
                header.append(_el('span', 'twm-category-picker__dot'), _el('span', null, cat.label));
                into = _el('div', 'twm-category-picker__hits');
                into.setAttribute('role', 'group');
                into.setAttribute('aria-labelledby', header.id);
                into.appendChild(header);
                this._itemsEl.appendChild(into);
                lastCat = v.c;
            }
            const btn = _el('button', 'twm-category-picker__item');
            btn.type = 'button';
            btn.tabIndex = -1;
            btn.id = `${this._id}-item-${v.c}-${v.i}`;
            btn.setAttribute('role', 'option');
            btn.dataset.category = String(v.c);
            btn.dataset.index = String(v.i);
            if (cat.color) btn.style.setProperty('--twm-category-picker-color', cat.color);
            if (item.icon) {
                btn.appendChild(_el('span', 'material-symbols-outlined twm-category-picker__icon', item.icon));
            } else {
                btn.appendChild(_el('span', 'twm-category-picker__badge', item.badge ?? ''));
            }
            btn.appendChild(_el('span', 'twm-category-picker__item-label', item.label));
            btn.addEventListener('mouseenter', () => this._highlight(v));
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                this._column = 'items';
                this._highlight(v);
                this._input.focus();
            });
            btn.addEventListener('dblclick', (e) => {
                e.preventDefault();
                this._pick(v);
            });
            this._rows.push({ ...v, el: btn });
            into.appendChild(btn);
        }
        if (!visible.length) {
            this._itemsEl.appendChild(_el('div', 'twm-category-picker__empty',
                searching ? `Nothing matches “${this._query.trim()}”.` : 'Nothing here.'));
        }

        this._paintState();
    }

    /** Classes and ARIA for the active category, the highlight and the current column; the detail pane. */
    _paintState() {
        const searching = _terms(this._query).length > 0;
        [...this._catsEl.children].forEach((btn, c) => {
            const on = c === this._activeCat;
            btn.classList.toggle('twm-category-picker__category--active', on);
            btn.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        for (const r of this._rows) {
            const on = !!this._hl && r.c === this._hl.c && r.i === this._hl.i;
            r.el.classList.toggle('twm-category-picker__item--highlighted', on);
            r.el.setAttribute('aria-selected', on ? 'true' : 'false');
        }
        const column = searching ? 'items' : this._column;
        this._catsEl.classList.toggle('twm-category-picker__column--current', column === 'categories');
        this._itemsEl.classList.toggle('twm-category-picker__column--current', column === 'items');

        const hlRow = this._rows.find((r) => this._hl && r.c === this._hl.c && r.i === this._hl.i);
        const activeCatEl = this._catsEl.children[this._activeCat];
        // The input names the option the arrow keys are on: the active
        // category while the categories column is current, else the highlight.
        const current = column === 'categories' ? activeCatEl : hlRow?.el;
        this._input.setAttribute('aria-controls', column === 'categories' ? this._catsEl.id : this._itemsEl.id);
        if (current) this._input.setAttribute('aria-activedescendant', current.id);
        else this._input.removeAttribute('aria-activedescendant');
        hlRow?.el.scrollIntoView?.({ block: 'nearest' });
        activeCatEl?.scrollIntoView?.({ block: 'nearest' });

        this._renderDetail();
    }

    _renderDetail() {
        const d = this._detailEl;
        d.replaceChildren();
        const item = this._hl ? this.categories[this._hl.c]?.items?.[this._hl.i] : null;
        if (item) {
            d.appendChild(_el('div', 'twm-category-picker__title', item.label));
            if (item.description) d.appendChild(_el('div', 'twm-category-picker__description', item.description));
            if (item.preview != null && item.preview !== '') {
                if (this.previewLabel) d.appendChild(_el('div', 'twm-category-picker__preview-label', this.previewLabel));
                d.appendChild(_el('pre', 'twm-category-picker__preview', String(item.preview)));
            }
        } else {
            d.appendChild(_el('div', 'twm-category-picker__detail-empty', 'Nothing selected.'));
        }
        const add = _el('button', 'twm-btn twm-btn--primary twm-category-picker__add', this.addLabel);
        add.type = 'button';
        add.disabled = !item;
        add.addEventListener('click', (e) => {
            e.preventDefault();
            if (this._hl) this._pick(this._hl);
        });
        d.appendChild(add);
    }

    // ── State changes ──────────────────────────────────────────────────────

    _setQuery(q) {
        this._query = String(q || '');
        if (_terms(this._query).length) {
            // A new query highlights its first hit.
            this._hl = null;
        } else if (this._hl) {
            // Back to browsing: the highlight's category is the one shown.
            this._activeCat = this._hl.c;
        }
        this._render();
    }

    _highlight(v) {
        if (!v) return;
        this._hl = { c: v.c, i: v.i };
        if (_terms(this._query).length) this._activeCat = v.c;
        this._paintState();
    }

    /** Make category `c` the active one. Browsing: show its items. Searching: jump to its first hit. */
    _chooseCategory(c) {
        if (c < 0 || c >= this.categories.length) return;
        if (_terms(this._query).length) {
            const first = this._rows.find((r) => r.c === c);
            if (first) this._highlight(first);
            return;
        }
        this._activeCat = c;
        this._hl = (this.categories[c].items || []).length ? { c, i: 0 } : null;
        this._render();
    }

    _moveHighlight(dir) {
        if (!this._rows.length) return;
        let at = this._rows.findIndex((r) => this._hl && r.c === this._hl.c && r.i === this._hl.i);
        at = at < 0 ? (dir > 0 ? 0 : this._rows.length - 1)
                    : (at + dir + this._rows.length) % this._rows.length;
        this._highlight(this._rows[at]);
    }

    _pick(v) {
        const category = this.categories[v.c];
        const item = category?.items?.[v.i];
        if (!item) return;
        const onSelect = this.onSelect;
        this.close();
        this.trigger?.focus();
        onSelect?.(item, category);
    }

    // ── Events ─────────────────────────────────────────────────────────────

    _onTriggerClick(e) {
        e.preventDefault();
        e.stopPropagation();
        this.toggle();
    }

    _onDocClick(e) {
        if (!this.isOpen) return;
        if (this.el?.contains(e.target) || this.trigger?.contains(e.target)) return;
        this.close();
    }

    _onKeydown(e) {
        if (!this.isOpen) return;
        // An IME composing a character owns Enter and Escape.
        if (e.isComposing || e.keyCode === 229) return;
        if (e.key === 'Escape') {
            // Capture phase, and stopped: an open picker is the innermost
            // thing on screen, so Escape closes it and not the ManagedWindow
            // around it (ActionDropdown's rule).
            e.preventDefault();
            e.stopPropagation();
            this.close();
            this.trigger?.focus();
            return;
        }
        if (!this.el.contains(e.target)) return;

        const searching = _terms(this._query).length > 0;
        switch (e.key) {
            case 'ArrowDown':
            case 'ArrowUp': {
                e.preventDefault();
                const dir = e.key === 'ArrowDown' ? 1 : -1;
                if (!searching && this._column === 'categories') {
                    const n = this.categories.length;
                    if (n) this._chooseCategory((this._activeCat + dir + n) % n);
                } else {
                    this._moveHighlight(dir);
                }
                break;
            }
            case 'ArrowRight':
            case 'ArrowLeft':
                if (searching) return;    // the query's caret
                e.preventDefault();
                this._column = e.key === 'ArrowRight' ? 'items' : 'categories';
                if (this._column === 'items' && !this._hl) this._moveHighlight(1);
                this._paintState();
                break;
            case 'Enter':
                e.preventDefault();
                if (this._hl) this._pick(this._hl);
                break;
            case 'Tab': {
                // Tab stays inside, like a modal ManagedWindow's focus trap:
                // it cycles the search field and Add (when Add is enabled).
                // Leaving would strand an open popover with a dead keyboard.
                e.preventDefault();
                e.stopPropagation();
                const add = this._detailEl.querySelector('.twm-category-picker__add');
                const stops = [this._input, ...(add && !add.disabled ? [add] : [])];
                const at = stops.indexOf(e.target);
                const next = at < 0 ? 0 : (at + (e.shiftKey ? -1 : 1) + stops.length) % stops.length;
                stops[next].focus();
                break;
            }
            default:
                // A printable key typed while a row or the button has focus
                // goes to the search field.
                if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey
                    && e.target !== this._input) {
                    this._input.focus();
                }
        }
    }

    // ── Public API ─────────────────────────────────────────────────────────

    /** Open it under (or above) the trigger, with an empty query and focus in the search field. */
    open() {
        if (this.isOpen || !this.el) return;
        this.isOpen = true;
        this._input.value = '';
        this._query = '';
        this._column = 'items';
        // Shown and placed first, then drawn: scrolling the highlight into
        // view does nothing in a hidden popover.
        this.el.hidden = false;
        this.position();
        this._render();

        this.trigger?.classList.add('twm-is-open');
        this.trigger?.setAttribute('aria-expanded', 'true');
        document.addEventListener('click', this._onDocClick, true);
        document.addEventListener('keydown', this._onKeydown, true);
        this._input.focus();
    }

    close() {
        if (!this.isOpen) return;
        this.isOpen = false;
        if (this.el) this.el.hidden = true;
        this.trigger?.classList.remove('twm-is-open');
        this.trigger?.setAttribute('aria-expanded', 'false');
        document.removeEventListener('click', this._onDocClick, true);
        document.removeEventListener('keydown', this._onKeydown, true);
    }

    /** @param {boolean} [force] */
    toggle(force) {
        const want = typeof force === 'boolean' ? force : !this.isOpen;
        if (want) this.open(); else this.close();
    }

    /** Place it against the trigger again (after the trigger moved). */
    position() {
        if (!this.el || !this.trigger) return;
        ActionDropdown.position(this.trigger, this.el, { align: this.align });
        // The columns scroll themselves; the popover only shrinks to fit.
        this.el.style.overflowY = 'hidden';
    }

    /**
     * Replace the categories. The active category and the highlight are
     * looked up again by `id`, so they are kept when they still exist,
     * wherever they moved to.
     */
    setCategories(categories) {
        const oldCat = this.categories[this._activeCat];
        const oldHlCat = this._hl ? this.categories[this._hl.c] : null;
        const oldHlItem = oldHlCat?.items?.[this._hl.i];
        this.categories = categories || [];
        const catAt = (cat) => (cat ? this.categories.findIndex((c) => c.id === cat.id) : -1);

        const active = catAt(oldCat);
        this._activeCat = active >= 0 ? active : 0;
        this._hl = null;
        const hc = catAt(oldHlCat);
        if (hc >= 0 && oldHlItem) {
            const hi = (this.categories[hc].items || []).findIndex((it) => it.id === oldHlItem.id);
            if (hi >= 0) this._hl = { c: hc, i: hi };
        }
        if (this.el) this._render();
    }

    destroy() {
        this.close();
        this.trigger?.removeEventListener('click', this._onTriggerClick);
        this.el?.remove();
        this.el = null;
        this.trigger = null;
        this.categories = [];
        this.onSelect = null;
    }
}

export default CategoryPicker;
