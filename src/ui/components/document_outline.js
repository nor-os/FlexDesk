/**
 * document_outline.js — A LONG DOCUMENT'S OUTLINE: its sections listed and
 * numbered, the one in view marked while the document scrolls, and a click
 * that goes to a section. (0.17.0)
 *
 *     ┌──────────────────────────┐
 *     │ 1   Introduction          │
 *     │   1.1 Scope               │   ← the section in view
 *     │   1.2 Terms               │
 *     │ 2   Method                │
 *     └──────────────────────────┘
 *
 *     const outline = createDocumentOutline(sidebarEl, {
 *         entries: [{ id: 'intro', level: 1, label: 'Introduction' }, …],
 *         numbering: true,
 *         scrollContainer: articleEl,
 *         resolveTarget: (entry) => articleEl.querySelector(`[data-section="${entry.id}"]`),
 *         onSelect: (id) => { … },
 *     });
 *
 * Where the entries come from (headings in markup, cells in a notebook, a
 * server's table of contents) is the embedder's business. The outline is told
 * `{id, level, label}` and, through `resolveTarget`, which element in the
 * scroll container each one stands for.
 *
 * NUMBERING (`numbering: true`) is hierarchical: levels 1, 2, 2, 1 are numbered
 * 1, 1.1, 1.2, 2. An entry sits one deeper than the nearest entry above it of
 * a lower level, so the shallowest level is depth 1 and a skipped level is one
 * step, not two (1, 3, 3, 2 is 1, 1.1, 1.2, 1.3, never 1.0.1); and nothing goes
 * deeper than `maxDepth` — a deeper entry is listed, indented and numbered at
 * `maxDepth`.
 *
 * THE SCROLL-SPY. With a `scrollContainer`, every resolved target is watched by
 * an IntersectionObserver rooted at that container, with `rootMargin` (default
 * `'0px 0px -70% 0px'`: the top 30% of the container is "in view"). Of the
 * targets in view, the one listed FIRST is the active section — the topmost
 * visible one. When none is in view the active section stays what it was, so
 * the long body of a section keeps its heading marked. An entry whose target
 * cannot be resolved is listed, but it is never watched and never marked
 * active, by the spy or by `setActive`.
 *
 * A CLICK keeps its entry active. A click on an entry marks it at once, scrolls
 * its target into view (unless `scrollOnSelect: false`, when `onSelect` does
 * the scrolling) and calls `onSelect(id, entry)`. A smooth scroll passes over
 * every section between here and there, so the spy is SUPPRESSED while it runs:
 * it resumes on the container's `scrollend`, or after `scrollEndTimeout` ms
 * (default 1000) when no `scrollend` comes — an engine without the event, or a
 * target that was already in place and so never scrolled.
 *
 * `refresh()` resolves the targets again (the document re-rendered);
 * `setEntries(entries)` replaces the list. `dispose()` disconnects the observer,
 * clears the timer and takes the outline off the page.
 */

/**
 * @typedef {Object} OutlineEntry
 * @property {string} id - Unique among the entries.
 * @property {number} [level=1] - 1 for a top-level section, 2 under it, …
 * @property {string} label - The entry's words, drawn as text (never markup).
 */

/**
 * @typedef {Object} DocumentOutlineConfig
 * @property {OutlineEntry[]} [entries]
 * @property {boolean} [numbering=false] - Hierarchical numbers before the labels.
 * @property {number} [maxDepth=3] - The deepest indentation and numbering depth.
 * @property {Function} [onSelect] - `(id, entry) => void`, on a click on an entry.
 * @property {boolean} [scrollOnSelect=true] - A click scrolls the entry's target
 *   into view (`scrollIntoView({block: 'start', behavior: scrollBehavior})`).
 * @property {ScrollBehavior} [scrollBehavior='smooth']
 * @property {HTMLElement|null} [scrollContainer] - The element that scrolls the
 *   document; the observer's root. Without it there is no scroll-spy.
 * @property {Function} [resolveTarget] - `(entry, scrollContainer) => Element|null`.
 *   Defaults to the element inside the container whose `id` is the entry's id.
 * @property {string} [rootMargin='0px 0px -70% 0px']
 * @property {number} [scrollEndTimeout=1000] - ms before a click's suppression
 *   lifts when no `scrollend` arrives.
 * @property {string|Node|Function|null} [emptyState='No headings'] - Shown with no entries.
 * @property {string} [label='Outline'] - The navigation's accessible name.
 * @property {string} [className] - Added to the root.
 * @property {Function} [IntersectionObserver] - The observer class; defaults to
 *   the global one. Without either there is no scroll-spy.
 */

export class DocumentOutline {
    /**
     * @param {HTMLElement|null} host  appended to, if given
     * @param {DocumentOutlineConfig} [config]
     */
    constructor(host, config = {}) {
        this.config = {
            entries: [],
            numbering: false,
            maxDepth: 3,
            onSelect: null,
            scrollOnSelect: true,
            scrollBehavior: 'smooth',
            scrollContainer: null,
            resolveTarget: null,
            rootMargin: '0px 0px -70% 0px',
            scrollEndTimeout: 1000,
            emptyState: 'No headings',
            label: 'Outline',
            className: null,
            IntersectionObserver: null,
            ...config,
        };
        this._entries = [];
        this._rows = [];             // [{id, entry, depth, number, li, target}] in list order
        this._byId = new Map();      // id → row
        this._byTarget = new Map();  // target element → row
        this._inView = new Set();    // rows whose target intersects
        this._activeId = null;
        this._listeners = new Set();
        this._observer = null;
        this._suppressed = false;
        this._timer = null;
        this._disposed = false;

        const root = document.createElement('nav');
        root.className = 'twm-doc-outline'
            + (this.config.className ? ` ${this.config.className}` : '');
        if (this.config.label) root.setAttribute('aria-label', this.config.label);
        const list = document.createElement('ol');
        list.className = 'twm-doc-outline__items';
        root.appendChild(list);
        this.element = root;
        this.listElement = list;

        this._onClick = (ev) => this._click(ev);
        this._onScrollEnd = () => this._resume();
        list.addEventListener('click', this._onClick);
        this.config.scrollContainer?.addEventListener?.('scrollend', this._onScrollEnd);

        this._setEntries(this.config.entries);
        if (host) host.appendChild(root);
    }

    // ── public ───────────────────────────────────────────────────────────

    /** Replace the entries. The active entry stays active if it is still
     *  listed and resolved; otherwise there is none. */
    setEntries(entries) {
        if (this._disposed) return;
        this._setEntries(entries);
    }

    /** The entries, as last given. */
    getEntries() {
        return this._entries.slice();
    }

    /** Resolve every target again and watch the new ones: the document under
     *  the outline was re-rendered. */
    refresh() {
        if (this._disposed) return;
        this._observe();
        this._keepActive();
    }

    /** Mark an entry active (`null` for none). An id that is not listed, or
     *  whose target is not resolved, is refused: returns false. */
    setActive(id) {
        if (this._disposed) return false;
        if (id == null) { this._activate(null); return true; }
        const row = this._byId.get(String(id));
        if (!row?.target) return false;
        this._activate(row.id);
        return true;
    }

    /** The active entry's id, or null. */
    getActive() {
        return this._activeId;
    }

    /** `fn(id, entry)` on every change of the active entry (`(null, null)` when
     *  none). Returns the function that unsubscribes. */
    onActiveChange(fn) {
        if (typeof fn !== 'function' || this._disposed) return () => {};
        this._listeners.add(fn);
        return () => this._listeners.delete(fn);
    }

    /** The `<li>` drawn for an id, or null. */
    getItem(id) {
        return this._byId.get(String(id))?.li || null;
    }

    dispose() {
        if (this._disposed) return;
        this._disposed = true;
        this._observer?.disconnect();
        this._observer = null;
        this._clearTimer();
        this._suppressed = false;
        this.config.scrollContainer?.removeEventListener?.('scrollend', this._onScrollEnd);
        this.listElement.removeEventListener('click', this._onClick);
        this._listeners.clear();
        this._byId.clear();
        this._byTarget.clear();
        this._inView.clear();
        this._rows = [];
        this.element.remove();
    }

    // ── drawing ──────────────────────────────────────────────────────────

    _setEntries(entries) {
        this._entries = Array.isArray(entries) ? entries.slice() : [];
        this._rows = numberEntries(this._entries, this.config.maxDepth);
        this._byId = new Map(this._rows.map((row) => [row.id, row]));
        this._draw();
        this._observe();
        this._keepActive();
    }

    /** The active entry survives a redraw only while it is listed and resolved. */
    _keepActive() {
        if (this._activeId !== null && !this._byId.get(this._activeId)?.target) this._activate(null);
        else this._paint();
    }

    _draw() {
        const list = this.listElement;
        list.replaceChildren();
        this.element.querySelector(':scope > .twm-doc-outline__empty')?.remove();
        this.element.classList.toggle('twm-doc-outline--empty', this._rows.length === 0);
        this.element.classList.toggle('twm-doc-outline--numbered', !!this.config.numbering);
        if (!this._rows.length) { this._drawEmpty(); return; }
        for (const row of this._rows) {
            const li = document.createElement('li');
            li.className = `twm-doc-outline__item twm-doc-outline__item--level-${row.depth}`;
            li.style.setProperty('--twm-doc-outline-depth', String(row.depth - 1));
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'twm-doc-outline__link';
            if (this.config.numbering) {
                const num = document.createElement('span');
                num.className = 'twm-doc-outline__number';
                num.textContent = row.number;
                button.appendChild(num);
            }
            const label = document.createElement('span');
            label.className = 'twm-doc-outline__label';
            label.textContent = String(row.entry.label ?? '');
            button.appendChild(label);
            button.title = (this.config.numbering ? `${row.number} ` : '') + label.textContent;
            li.appendChild(button);
            row.li = li;
            list.appendChild(li);
        }
    }

    _drawEmpty() {
        let content = this.config.emptyState;
        if (typeof content === 'function') content = content();
        if (content == null || content === false || content === '') return;
        const p = document.createElement('p');
        p.className = 'twm-doc-outline__empty';
        if (typeof Node !== 'undefined' && content instanceof Node) p.appendChild(content);
        else p.textContent = String(content);
        this.element.appendChild(p);
    }

    _paint() {
        for (const row of this._rows) {
            if (!row.li) continue;
            const active = row.id === this._activeId;
            row.li.classList.toggle('twm-doc-outline__item--active', active);
            row.li.classList.toggle('twm-doc-outline__item--unresolved', !row.target);
            const button = row.li.firstChild;
            if (active) button.setAttribute('aria-current', 'location');
            else button.removeAttribute('aria-current');
        }
    }

    _activate(id) {
        const next = id ?? null;
        if (next === this._activeId) { this._paint(); return; }
        this._activeId = next;
        this._paint();
        const entry = next === null ? null : this._byId.get(next)?.entry ?? null;
        for (const fn of [...this._listeners]) fn(next, entry);
    }

    // ── the scroll-spy ───────────────────────────────────────────────────

    _resolve(entry) {
        const container = this.config.scrollContainer;
        if (typeof this.config.resolveTarget === 'function') {
            return this.config.resolveTarget(entry, container) || null;
        }
        if (!container) return null;
        const id = String(entry.id);
        for (const el of container.querySelectorAll('[id]')) if (el.id === id) return el;
        return null;
    }

    _observe() {
        this._observer?.disconnect();
        this._byTarget.clear();
        this._inView.clear();
        for (const row of this._rows) row.target = this._resolve(row.entry);
        for (const row of this._rows) {
            if (row.target && !this._byTarget.has(row.target)) this._byTarget.set(row.target, row);
        }
        const container = this.config.scrollContainer;
        const IO = this.config.IntersectionObserver || globalThis.IntersectionObserver;
        if (!container || typeof IO !== 'function') return;
        if (!this._observer) {
            this._observer = new IO((records) => this._intersect(records), {
                root: container,
                rootMargin: this.config.rootMargin,
                threshold: 0,
            });
        }
        for (const target of this._byTarget.keys()) this._observer.observe(target);
    }

    _intersect(records) {
        if (this._disposed) return;
        for (const rec of records) {
            const row = this._byTarget.get(rec.target);
            if (!row) continue;
            if (rec.isIntersecting) this._inView.add(row);
            else this._inView.delete(row);
        }
        if (this._suppressed) return;
        // The topmost section in view: the first listed.
        const top = this._rows.find((row) => this._inView.has(row));
        if (top) this._activate(top.id);
    }

    _click(ev) {
        const li = ev.target?.closest?.('.twm-doc-outline__item');
        if (!li || !this.listElement.contains(li)) return;
        const row = this._rows.find((r) => r.li === li);
        if (!row) return;
        if (row.target) {
            this._activate(row.id);
            this._suppress();
            if (this.config.scrollOnSelect && typeof row.target.scrollIntoView === 'function') {
                row.target.scrollIntoView({ block: 'start', behavior: this.config.scrollBehavior });
            }
        }
        this.config.onSelect?.(row.id, row.entry);
    }

    _suppress() {
        this._suppressed = true;
        this._clearTimer();
        this._timer = setTimeout(() => this._resume(), this.config.scrollEndTimeout);
    }

    _resume() {
        this._clearTimer();
        this._suppressed = false;
    }

    _clearTimer() {
        if (this._timer !== null) clearTimeout(this._timer);
        this._timer = null;
    }
}

/**
 * Build a document outline, append it to `host` (if given) and draw it.
 *
 * @param {HTMLElement|null} host
 * @param {DocumentOutlineConfig} [config]
 * @returns {DocumentOutline}
 */
export function createDocumentOutline(host, config = {}) {
    return new DocumentOutline(host, config);
}

/**
 * Each entry's row: its id as a string, its depth and its hierarchical number.
 * An entry's depth is one more than the number of open sections of a lower
 * level above it, so the shallowest level is depth 1 and a skipped level is
 * one deeper, never two; then at most `maxDepth`.
 */
function numberEntries(entries, maxDepth) {
    const cap = Math.max(1, Math.floor(Number(maxDepth) || 3));
    const open = [];        // the levels of the sections this entry may sit under
    const counters = [];
    return entries.map((entry) => {
        const level = Math.max(1, Math.floor(Number(entry?.level) || 1));
        while (open.length && open[open.length - 1] >= level) open.pop();
        const depth = Math.min(cap, open.length + 1);
        open.push(level);
        counters.length = depth;
        counters[depth - 1] = (counters[depth - 1] || 0) + 1;
        return { id: String(entry?.id), entry, depth, number: counters.join('.'), li: null, target: null };
    });
}
