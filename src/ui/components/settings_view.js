/**
 * SettingsView — the settings page, drawn from a settings store's schema.
 *
 *   const view = new SettingsView({ store, eventBus });   // the bus the store emits on
 *   view.mount(host);
 *   view.selectCategory('window');
 *   view.setQuery('shadow');
 *   view.dispose();
 *
 *   // or as tile content:
 *   createShell({ content: { settings: settingsViewContent({ store, eventBus }) } });
 *
 * `store` is a `createSettingsStore()` handle, or the app-global binding's own
 * (`getSettingsStore()` in `@flexdesk/core`). The view knows no setting: every
 * category, group, label, description and control comes from the store's
 * `getCategories()` and `getSchema()`.
 *
 * THE LAYOUT. A sidebar with a filter box, the categories in their
 * `CategoryDef.order` and *Reset all*; beside it the chosen category's
 * settings under its title, description and *Reset category*, grouped by
 * `SettingDef.group` in schema order. Each row shows its label, a *Modified*
 * marker while its value differs from its default, its description, its path,
 * its control and a reset button. Text typed in the filter searches every
 * category's labels, descriptions and paths, and the matches are listed
 * under their category and group.
 *
 * THE CONTROLS, one per `SettingDef.type`:
 *   boolean    a ToggleField
 *   select     a select over `options`
 *   number     a number box with `min`, `max` and `step`; a value written is
 *              snapped to the step (counted from `min`) and clamped to the range,
 *              and a box left empty or unreadable goes back to the value
 *   text       a text box written `textDebounceMs` after the last keystroke,
 *              or at once on Enter or blur; emptied, it writes `null` when the
 *              default is `null`, else `''`
 *   colorList  a ColorListField, written on every committed edit while every
 *              row holds a colour
 * A type the view does not know shows the value as text, read only.
 *
 * LIVE, BOTH WAYS. A control writes through `store.set()`. The view listens
 * on `eventBus` for `settings:<path>:changed` for every path in the schema,
 * for `settings:changed` with a null path (the resets) and for
 * `settings:registered` (a slice registered after mount: its categories join
 * the sidebar and its settings their category, without a remount). A value
 * changed elsewhere moves its control and its marker.
 *
 * RESETS. A row's reset button resets that setting. *Reset category* and
 * *Reset all* ask `confirm(…)` first (default `openConfirm`) and change
 * nothing unless it resolves true.
 *
 * Every word on screen that comes from the schema, the store or the user is
 * set as text, so a label or a query holding markup is shown as typed.
 *
 * Markup: `.twm-settings` > `.twm-settings__sidebar` (`__search` >
 * `__search-input`, `__nav` > `button.__cat` [`--active`], `__reset-all`)
 * + `.twm-settings__content` (`__header` > `__title`, `__description`,
 * `__reset-category`; `section.__group` > `__group-title` + `.__row`
 * [`--modified`] > `__info` (`__label`, `__marker`, `__description`,
 * `__path`) + `__control` + `__reset`; `__empty`).
 */

import { ComponentBase } from '../base/component_base.js';
import { ToggleField } from './toggle_field.js';
import { ColorListField } from './color_list_field.js';
import { selectBox, shownValue } from './choice_controls.js';
import { openConfirm } from './modal.js';

/** Milliseconds between the last keystroke in a text setting and its write. */
export const SETTINGS_TEXT_DEBOUNCE_MS = 300;

function el(tag, className, text) {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
}

function icon(name) {
    const n = el('span', 'material-symbols-outlined', name);
    n.setAttribute('aria-hidden', 'true');
    return n;
}

function same(a, b) {
    if (a === b) return true;
    if (a == null || b == null) return a == null && b == null;
    if (typeof a !== typeof b || typeof a !== 'object') return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => same(a[k], b[k]));
}

/** `eventBus.on` returns `{dispose}` (FlexDesk's bus) or a function (others). */
function listen(bus, name, fn) {
    const sub = bus.on(name, fn);
    if (typeof sub === 'function') return sub;
    if (sub && typeof sub.dispose === 'function') return () => sub.dispose();
    return () => bus.off?.(name, fn);
}

/** A number written by a number row: snapped to `step` from `min`, then clamped. */
function fitNumber(n, { min, max, step }) {
    let v = n;
    const s = Number(step);
    if (Number.isFinite(s) && s > 0) {
        const base = Number.isFinite(Number(min)) ? Number(min) : 0;
        v = base + Math.round((v - base) / s) * s;
        const decimals = (String(s).split('.')[1] || '').length;
        v = Number(v.toFixed(decimals));
    }
    if (min != null && Number.isFinite(Number(min))) v = Math.max(Number(min), v);
    if (max != null && Number.isFinite(Number(max))) v = Math.min(Number(max), v);
    return v;
}

export class SettingsView extends ComponentBase {
    /**
     * @param {object}    o
     * @param {object}    o.store     a settings store (`createSettingsStore()` / `getSettingsStore()`)
     * @param {object}    o.eventBus  the bus the store emits on
     * @param {Function} [o.confirm]  `({title, message, confirmLabel, danger}) -> Promise<boolean>`
     * @param {string}   [o.category] the category shown first (default: the first)
     * @param {number}   [o.textDebounceMs]
     * @param {string}   [o.title='Settings']  the sidebar heading
     */
    constructor({
        store, eventBus, confirm = openConfirm, category = null,
        textDebounceMs = SETTINGS_TEXT_DEBOUNCE_MS, title = 'Settings', logger,
    } = {}) {
        super({ eventBus, logger });
        if (!store || typeof store.getSchema !== 'function') {
            throw new TypeError('SettingsView: `store` must be a settings store');
        }
        if (!eventBus || typeof eventBus.on !== 'function') {
            throw new TypeError('SettingsView: `eventBus` must be the bus the store emits on');
        }
        this.store = store;
        this._confirm = confirm;
        this._category = category;
        this._query = '';
        this._debounceMs = textDebounceMs;
        this._title = title;

        this.root = null;
        this._nav = null;
        this._content = null;
        this._search = null;
        /** path -> { sync(), flush(), dispose() } for the rows on screen. */
        this._rows = new Map();
        /** path -> unsubscribe, for every schema path. */
        this._pathSubs = new Map();
        this._subs = [];
        this._disposed = false;
    }

    /** Build the view into `container` (once). */
    mount(container) {
        if (this.root) return this.root;
        const root = el('div', 'twm-settings');
        const side = el('aside', 'twm-settings__sidebar');
        const head = el('div', 'twm-settings__sidebar-title');
        head.append(icon('settings'), el('span', '', this._title));

        const search = el('label', 'twm-settings__search');
        const input = el('input', 'twm-settings__search-input');
        input.type = 'search';
        input.placeholder = 'Filter settings…';
        input.autocomplete = 'off';
        input.spellcheck = false;
        input.setAttribute('aria-label', 'Filter settings');
        input.addEventListener('input', () => this.setQuery(input.value));
        search.append(icon('search'), input);
        this._search = input;

        const nav = el('nav', 'twm-settings__nav');
        nav.setAttribute('aria-label', 'Settings categories');
        nav.addEventListener('click', (e) => {
            const btn = e.target.closest?.('[data-category]');
            if (btn && nav.contains(btn)) this.selectCategory(btn.dataset.category);
        });
        this._nav = nav;

        const resetAll = el('button', 'twm-btn twm-settings__reset-all');
        resetAll.type = 'button';
        resetAll.append(icon('restart_alt'), el('span', '', 'Reset all'));
        resetAll.addEventListener('click', () => { this.resetAll(); });

        side.append(head, search, nav, resetAll);

        const content = el('div', 'twm-settings__content');
        this._content = content;
        root.append(side, content);
        this.root = root;
        container.appendChild(root);
        this._mounted = true;

        for (const path of Object.keys(this.store.getSchema())) this.#watch(path);
        this._subs.push(listen(this.eventBus, 'settings:changed', (p) => {
            if (p?.path == null) this.#syncAll();
        }));
        this._subs.push(listen(this.eventBus, 'settings:registered', (p) => this.#onRegistered(p)));

        this.#paintNav();
        this.#paintContent();
        return root;
    }

    /** The category on screen (its id), or null. */
    getCategory() { return this.#activeCategory()?.id ?? null; }

    /** The filter text. */
    getQuery() { return this._query; }

    /** Show one category; clears the filter. */
    selectCategory(id) {
        if (!this.root) return;
        if (!this.store.getCategories().some((c) => c.id === id)) return;
        this._category = id;
        this._query = '';
        if (this._search) this._search.value = '';
        this.#paintNav();
        this.#paintContent();
    }

    /** Search every category; an empty query goes back to the category. */
    setQuery(query) {
        if (!this.root) return;
        const q = String(query ?? '');
        this._query = q;
        if (this._search && this._search.value !== q) this._search.value = q;
        this.#paintNav();
        this.#paintContent();
    }

    /** Reset one category after `confirm`; resolves true when it was reset. */
    async resetCategory(id = this.getCategory()) {
        const cat = this.store.getCategories().find((c) => c.id === id);
        if (!cat) return false;
        const ok = await this._confirm({
            title: 'Reset category',
            message: `Reset every setting in “${cat.label ?? cat.id}” to its default?`,
            confirmLabel: 'Reset',
            danger: true,
        });
        if (!ok || this._disposed) return false;
        this.#flushAll();
        this.store.resetCategory(id);
        this.#syncAll();
        return true;
    }

    /** Reset every setting after `confirm`; resolves true when they were reset. */
    async resetAll() {
        const ok = await this._confirm({
            title: 'Reset all settings',
            message: 'Reset every setting to its default?',
            confirmLabel: 'Reset all',
            danger: true,
        });
        if (!ok || this._disposed) return false;
        this.#flushAll();
        this.store.resetAll();
        this.#syncAll();
        return true;
    }

    dispose() {
        if (this._disposed) return;
        this._disposed = true;
        this.#flushAll();
        this.#dropRows();
        for (const off of this._pathSubs.values()) off();
        this._pathSubs.clear();
        for (const off of this._subs) off();
        this._subs = [];
        this.root?.remove();
        this.root = null;
        this._nav = null;
        this._content = null;
        this._search = null;
        super.dispose();
    }

    // ── store events ─────────────────────────────────────────────────────

    #watch(path) {
        if (this._pathSubs.has(path)) return;
        this._pathSubs.set(path, listen(this.eventBus, `settings:${path}:changed`, () => {
            this._rows.get(path)?.sync();
        }));
    }

    #onRegistered({ paths = [] } = {}) {
        if (!this.root) return;
        const schema = this.store.getSchema();
        for (const path of Object.keys(schema)) this.#watch(path);
        this.#paintNav();
        const active = this.getCategory();
        const touches = this._query !== ''
            || !this._rows.size
            || paths.some((p) => schema[p]?.category === active);
        if (touches) this.#paintContent();
        else this.#syncAll();
    }

    #syncAll() {
        for (const row of this._rows.values()) row.sync();
    }

    #flushAll() {
        for (const row of this._rows.values()) row.flush();
    }

    #dropRows() {
        for (const row of this._rows.values()) row.dispose();
        this._rows.clear();
    }

    // ── painting ─────────────────────────────────────────────────────────

    #activeCategory() {
        const cats = this.store.getCategories();
        return cats.find((c) => c.id === this._category) ?? cats[0] ?? null;
    }

    #paintNav() {
        const active = this._query ? null : this.getCategory();
        const buttons = this.store.getCategories().map((cat) => {
            const b = el('button', 'twm-settings__cat');
            b.type = 'button';
            b.dataset.category = cat.id;
            if (cat.id === active) {
                b.classList.add('twm-settings__cat--active');
                b.setAttribute('aria-current', 'page');
            }
            b.append(icon(cat.icon || 'tune'), el('span', 'twm-settings__cat-label', cat.label ?? cat.id));
            if (cat.description) b.title = String(cat.description);
            return b;
        });
        this._nav.replaceChildren(...buttons);
    }

    #paintContent() {
        this.#flushAll();
        this.#dropRows();
        const schema = this.store.getSchema();
        const content = this._content;
        content.replaceChildren();

        if (this._query.trim() !== '') {
            const q = this._query.trim().toLowerCase();
            const cats = this.store.getCategories();
            const labelOf = new Map(cats.map((c) => [c.id, c.label ?? c.id]));
            const rank = new Map(cats.map((c, i) => [c.id, i]));
            const matches = Object.entries(schema)
                .filter(([path, def]) => [def.label, def.description, path]
                    .some((t) => t != null && String(t).toLowerCase().includes(q)))
                .map(([path, def]) => ({ path, ...def }));
            matches.sort((a, b) => (rank.get(a.category) ?? Infinity) - (rank.get(b.category) ?? Infinity));

            const header = el('header', 'twm-settings__header');
            const info = el('div', 'twm-settings__header-info');
            const n = matches.length;
            info.append(el('h2', 'twm-settings__title',
                `${n} result${n === 1 ? '' : 's'} for “${this._query.trim()}”`));
            header.append(info);
            content.append(header);
            if (!n) {
                content.append(el('div', 'twm-settings__empty', 'No setting matches the filter.'));
                return;
            }
            this.#paintGroups(matches, (def) =>
                `${labelOf.get(def.category) ?? def.category ?? ''} › ${def.group || 'General'}`);
            return;
        }

        const cat = this.#activeCategory();
        if (!cat) {
            content.append(el('div', 'twm-settings__empty', 'No settings.'));
            return;
        }
        const header = el('header', 'twm-settings__header');
        const info = el('div', 'twm-settings__header-info');
        info.append(el('h2', 'twm-settings__title', cat.label ?? cat.id));
        if (cat.description) info.append(el('p', 'twm-settings__description', cat.description));
        const reset = el('button', 'twm-btn twm-settings__reset-category');
        reset.type = 'button';
        reset.append(icon('restart_alt'), el('span', '', 'Reset category'));
        reset.addEventListener('click', () => { this.resetCategory(cat.id); });
        header.append(info, reset);
        content.append(header);

        const defs = Object.entries(schema)
            .filter(([, def]) => def.category === cat.id)
            .map(([path, def]) => ({ path, ...def }));
        if (!defs.length) {
            content.append(el('div', 'twm-settings__empty', 'No settings in this category.'));
            return;
        }
        this.#paintGroups(defs, (def) => def.group || 'General');
    }

    #paintGroups(defs, groupTitle) {
        const groups = new Map();
        for (const def of defs) {
            const key = groupTitle(def);
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(def);
        }
        for (const [title, list] of groups) {
            const section = el('section', 'twm-settings__group');
            section.append(el('h3', 'twm-settings__group-title', title));
            for (const def of list) section.append(this.#row(def));
            this._content.append(section);
        }
    }

    // ── rows ─────────────────────────────────────────────────────────────

    #row(def) {
        const { path } = def;
        const store = this.store;
        const row = el('div', 'twm-settings__row');
        row.dataset.path = path;

        const info = el('div', 'twm-settings__info');
        const labelLine = el('div', 'twm-settings__label-line');
        const label = el('span', 'twm-settings__label', def.label ?? path);
        const marker = el('span', 'twm-settings__marker', 'Modified');
        labelLine.append(label, marker);
        info.append(labelLine);
        if (def.description) info.append(el('div', 'twm-settings__description', def.description));
        info.append(el('code', 'twm-settings__path', path));

        const slot = el('div', 'twm-settings__control');
        const control = this.#control(def, (value) => store.set(path, value));
        slot.append(control.el);

        const reset = el('button', 'twm-settings__reset');
        reset.type = 'button';
        reset.title = 'Reset to default';
        reset.setAttribute('aria-label', `Reset ${def.label ?? path} to default`);
        reset.append(icon('restart_alt'));
        reset.addEventListener('click', () => {
            control.cancel?.();
            store.resetOne(path);
        });

        row.append(info, slot, reset);

        const sync = () => {
            const value = store.get(path);
            control.show(value);
            const modified = !same(value, store.getDefault(path));
            row.classList.toggle('twm-settings__row--modified', modified);
            marker.hidden = !modified;
            reset.hidden = !modified;
        };
        sync();
        this._rows.set(path, {
            sync,
            flush: () => control.flush?.(),
            dispose: () => control.dispose?.(),
        });
        return row;
    }

    /** `{ el, show(value), flush?(), cancel?(), dispose?() }` for one setting. */
    #control(def, write) {
        const name = def.label ?? def.path;
        switch (def.type) {
        case 'boolean': {
            const t = new ToggleField({
                checked: !!this.store.get(def.path), ariaLabel: name, compact: true,
                onChange: (on) => write(on),
            });
            return {
                el: t.render(),
                show: (v) => { if (t.get() !== !!v) t.set(!!v); },
                dispose: () => t.dispose(),
            };
        }
        case 'select': {
            const c = selectBox(def.options || [], this.store.get(def.path), {
                label: name, valueAttr: 'value', className: 'twm-settings__select',
            });
            c.box.addEventListener('change', () => write(c.valueOf()));
            return {
                el: c.box,
                show: (v) => { if (!same(c.valueOf(), v)) c.select(v); },
            };
        }
        case 'number': {
            const box = el('input', 'twm-settings__number');
            box.type = 'number';
            box.setAttribute('aria-label', name);
            if (def.min != null) box.min = String(def.min);
            if (def.max != null) box.max = String(def.max);
            if (def.step != null) box.step = String(def.step);
            const show = (v) => {
                const text = v == null ? '' : String(v);
                if (box.value !== text) box.value = text;
            };
            box.addEventListener('change', () => {
                const current = this.store.get(def.path);
                const n = box.value.trim() === '' ? NaN : Number(box.value);
                if (!Number.isFinite(n)) { show(current); return; }
                const v = fitNumber(n, def);
                show(v);
                if (!same(v, current)) write(v);
            });
            return { el: box, show };
        }
        case 'text': {
            const box = el('input', 'twm-settings__text');
            box.type = 'text';
            box.setAttribute('aria-label', name);
            if (def.placeholder != null) box.placeholder = String(def.placeholder);
            let timer = null;
            const valueOf = () => (box.value === '' && def.defaultValue === null ? null : box.value);
            const cancel = () => { if (timer !== null) { clearTimeout(timer); timer = null; } };
            const commit = () => {
                const v = valueOf();
                if (!same(v, this.store.get(def.path))) write(v);
            };
            const flush = () => {
                if (timer === null) return;
                cancel();
                commit();
            };
            box.addEventListener('input', () => {
                cancel();
                timer = setTimeout(() => { timer = null; commit(); }, this._debounceMs);
            });
            box.addEventListener('change', flush);
            box.addEventListener('keydown', (e) => { if (e.key === 'Enter') flush(); });
            return {
                el: box,
                show: (v) => {
                    const text = v == null ? '' : String(v);
                    if (box.value === text) return;
                    cancel();
                    box.value = text;
                },
                flush,
                cancel,
                dispose: cancel,
            };
        }
        case 'colorList': {
            const value = this.store.get(def.path);
            const f = new ColorListField({
                value: Array.isArray(value) ? value : [],
                onChange: (colors, { commit }) => { if (commit && colors) write(colors); },
            });
            return {
                el: f.render(),
                show: (v) => {
                    const list = Array.isArray(v) ? v : [];
                    if (!same(f.getValue(), list)) f.setValue(list);
                },
                dispose: () => f.dispose(),
            };
        }
        default: {
            const out = el('span', 'twm-settings__readonly');
            return {
                el: out,
                show: (v) => { out.textContent = shownValue(v); },
            };
        }
        }
    }
}

/**
 * A content factory for the shell: `(hostEl, props, ctx) -> { title, destroy }`.
 * `props.category` picks the category shown first.
 *
 * @param {object} opts  as `new SettingsView(opts)`
 * @returns {Function}
 */
export function settingsViewContent(opts = {}) {
    return (hostEl, props = {}) => {
        const view = new SettingsView({ ...opts, category: props?.category ?? opts.category ?? null });
        view.mount(hostEl);
        return {
            title: opts.title ?? 'Settings',
            view,
            destroy: () => view.dispose(),
        };
    };
}
