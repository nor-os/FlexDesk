/**
 * table_filter_chips.js — 0.7.0
 *
 * ONE-OF-N CHIPS WITH COUNTS, as a column filter control: the built-in kind
 * behind `DataTable`'s `filterKinds: {[col]: {kind: 'chips', options}}`, and
 * usable on its own.
 *
 * Each option is a chip — an optional glyph, its label, and a count badge that
 * reads `–` until `setCounts` says otherwise. A chip whose count is 0 is
 * DIMMED, never hidden: a chip that disappears at nought takes the information
 * "there are none of these" with it, which is often the most reassuring thing
 * on the screen.
 *
 *   - An option whose value is `''` or `null` stands for NO FILTER ("All"); it
 *     is pressed exactly when nothing is chosen, and its count is the total.
 *   - One-of-N (the default): pressing a chip chooses it; pressing the chosen
 *     chip again clears the filter.
 *   - `multiple: true`: each chip toggles its value in or out of a list.
 *
 * What the values MEAN — which levels exist, their words, their glyphs, what a
 * count counts — is the consumer's. This file is only the control.
 *
 *     const chips = createChipsFilter({ header: 'Level', setValue: (v) => …, value: null },
 *         { options: [{ value: '', label: 'All', icon: 'list_alt' },
 *                     { value: 'warn', label: 'Warn', icon: 'warning' }] });
 *     host.appendChild(chips.el);
 *     chips.setCounts({ '': 120, warn: 3 });
 */

const isAll = (v) => v === '' || v == null;

/**
 * @param {object} [ctx]   `{header, value, counts, setValue(v)}` — what a
 *   `DataTable` hands a filter control. Without `setValue` the control keeps
 *   its own value and reports it through `spec.onChange`.
 * @param {object} spec    `{options: [{value, label, icon?, title?}], multiple?,
 *   label?, counts? (false: no badges), onChange?}`
 * @returns {{el: HTMLElement, setValue(v): void, setCounts(c): void,
 *            getValue(): *, destroy(): void}}
 */
export function createChipsFilter(ctx = {}, spec = {}) {
    const options = Array.isArray(spec.options) ? spec.options : [];
    const multiple = !!spec.multiple;
    const showCounts = spec.counts !== false;
    const el = document.createElement('div');
    el.className = 'twm-dt-filter-chips' + (multiple ? ' twm-dt-filter-chips--multiple' : '');
    el.setAttribute('role', 'group');
    const name = spec.label || ctx.header;
    if (name) el.setAttribute('aria-label', String(name));

    /** Chip key (text) -> the option's own value. */
    const valueOf = new Map();
    const chips = new Map();
    let value = null;

    const keyOf = (v) => String(v ?? '');
    const normalise = (v) => {
        if (multiple) {
            const list = Array.isArray(v) ? v : (isAll(v) ? [] : [v]);
            return list.filter((x) => !isAll(x)).map(keyOf);
        }
        if (Array.isArray(v)) v = v[0];
        return isAll(v) ? null : keyOf(v);
    };
    const chosen = () => (multiple ? value.length === 0 : value === null);

    for (const opt of options) {
        const key = keyOf(opt.value);
        valueOf.set(key, opt.value);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'twm-dt-filter-chip';
        btn.dataset.value = key;
        if (opt.title) btn.title = String(opt.title);
        if (opt.icon) {
            const icon = document.createElement('span');
            icon.className = 'material-symbols-outlined twm-dt-filter-chip__icon';
            icon.setAttribute('aria-hidden', 'true');
            icon.textContent = String(opt.icon);
            btn.appendChild(icon);
        }
        const label = document.createElement('span');
        label.className = 'twm-dt-filter-chip__label';
        label.textContent = String(opt.label ?? key);
        btn.appendChild(label);
        let count = null;
        if (showCounts) {
            count = document.createElement('span');
            count.className = 'twm-dt-filter-chip__count';
            count.textContent = '–';
            btn.appendChild(count);
        }
        btn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            pick(key);
        });
        chips.set(key, { btn, count });
        el.appendChild(btn);
    }

    function outward() {
        if (multiple) return value.length ? value.map((k) => valueOf.get(k)) : null;
        return value === null ? null : valueOf.get(value);
    }

    function pick(key) {
        if (isAll(key)) value = multiple ? [] : null;
        else if (multiple) {
            value = value.includes(key) ? value.filter((k) => k !== key) : [...value, key];
        } else {
            value = value === key ? null : key;
        }
        paint();
        const out = outward();
        if (typeof ctx.setValue === 'function') ctx.setValue(out);
        try { spec.onChange?.(out); } catch (err) { console.error('[chips filter] onChange threw', err); }
    }

    function paint() {
        for (const [key, { btn }] of chips) {
            const on = isAll(key) ? chosen() : (multiple ? value.includes(key) : value === key);
            btn.classList.toggle('twm-dt-filter-chip--on', on);
            btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        }
    }

    function setValue(v) {
        value = normalise(v);
        paint();
    }

    function setCounts(counts) {
        for (const [key, { btn, count }] of chips) {
            const n = counts == null ? undefined : counts[key];
            const known = typeof n === 'number' && Number.isFinite(n);
            if (count) count.textContent = known ? n.toLocaleString() : '–';
            btn.classList.toggle('twm-dt-filter-chip--empty', known && n === 0);
        }
    }

    setValue(ctx.value);
    if (ctx.counts) setCounts(ctx.counts);

    return {
        el,
        setValue,
        setCounts,
        getValue: outward,
        destroy() { /* nothing outside its own element */ },
    };
}

export default createChipsFilter;
