/**
 * INSERT A VALUE — the picker a field's "{ }" opens (36 §3.7).
 *
 *     openValuePicker({anchor, groups, note, onPick, strings});
 *     // groups: [{id, label, sub, items, layout?: 'grid'|'chips', empty?}]
 *     // item:   {label, type, ref, children?}   `ref` is the TEXT inserted
 *
 * The kit DRAWS; the groups are the consumer's — which values each step
 * offers, in its own words — computed over the steps that always run before
 * the field's step (`alwaysBefore`), so a value the run may not have is not
 * offered. `note` says so under the list in the consumer's words.
 *
 * An item with `children` opens one level down ("body ›"): its first option
 * there inserts the whole value, and Back (or Escape) climbs again. A group
 * drawn as a `grid` lists its items two to a row with their type beside them
 * (a loop's row, column by column); any other group draws chips. A group with
 * no items shows its `empty` sentence instead, so "none yet, and why" is on
 * the screen. The search box filters every level at once.
 *
 * Returns a promise of the picked item (or null), carrying `close()`; `onPick`
 * is called with the item as well. The line under the list says what the
 * active option inserts — "shown as a chip, kept as text".
 */

import { el, icon, nextOption, openPopover, uid } from './dom.js';
import { createStrings, say } from './strings.js';

const words = (s) => String(s ?? '').toLowerCase();

export function openValuePicker({ anchor, groups = [], note = null, onPick = null, strings = null,
                                  title = null } = {}) {
    const S = createStrings(strings);
    let settle;
    const done = new Promise((resolve) => { settle = resolve; });
    let result = null;
    const trail = [];                 // the items drilled into

    const root = el('div', 'twm-flow-values');
    const headingId = uid('values-title');
    const heading = el('span', 'twm-flow-values__title', title ?? say(S, 'insertValue'));
    heading.id = headingId;
    const head = el('div', 'twm-flow-values__head');
    head.appendChild(heading);
    const listId = uid('values-list');
    const searchRow = el('div', 'twm-flow-values__search');
    searchRow.appendChild(icon('search', 'twm-flow-values__search-icon'));
    const search = el('input', 'twm-flow-values__input');
    search.type = 'search';
    search.placeholder = say(S, 'searchValues');
    search.setAttribute('aria-label', say(S, 'searchValues'));
    search.setAttribute('role', 'combobox');
    search.setAttribute('aria-controls', listId);
    search.setAttribute('aria-expanded', 'true');
    search.setAttribute('aria-autocomplete', 'list');
    search.autocomplete = 'off';
    searchRow.appendChild(search);
    head.appendChild(searchRow);
    root.appendChild(head);

    const crumb = el('div', 'twm-flow-values__crumb');
    crumb.hidden = true;
    root.appendChild(crumb);
    const list = el('div', 'twm-flow-values__list');
    list.id = listId;
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-labelledby', headingId);
    root.appendChild(list);
    const foot = el('div', 'twm-flow-values__foot');
    const inserts = el('span', 'twm-flow-values__inserts');
    inserts.setAttribute('aria-live', 'polite');
    if (note) foot.appendChild(el('span', 'twm-flow-values__note', note));
    foot.appendChild(inserts);
    root.appendChild(foot);

    let active = null;
    let shown = [];                   // [{opt, item, whole?}]

    function activate(opt) {
        active?.setAttribute('aria-selected', 'false');
        active?.classList.remove('twm-flow-values__option--active');
        active = opt;
        const hit = shown.find((s) => s.opt === opt);
        if (opt) {
            opt.setAttribute('aria-selected', 'true');
            opt.classList.add('twm-flow-values__option--active');
            search.setAttribute('aria-activedescendant', opt.id);
            opt.scrollIntoView?.({ block: 'nearest' });
        } else {
            search.removeAttribute('aria-activedescendant');
        }
        inserts.textContent = hit && hit.item?.ref !== undefined && !(hit.item.children?.length && !hit.whole && !search.value)
            ? say(S, 'insertsLine', hit.item.ref) : '';
    }

    function option(item, { grid = false, whole = false, label = null } = {}) {
        const opens = !whole && Array.isArray(item.children) && item.children.length > 0;
        const opt = el('div', `twm-flow-values__option${grid ? ' twm-flow-values__option--row' : ' twm-flow-values__option--chip'}`);
        opt.id = uid('values-option');
        opt.setAttribute('role', 'option');
        opt.setAttribute('aria-selected', 'false');
        const text = label ?? (whole ? say(S, 'wholeValue', item.label) : item.label);
        opt.appendChild(el('span', 'twm-flow-values__label', opens && !search.value ? `${text} ›` : text));
        if (grid && item.type) opt.appendChild(el('span', 'twm-flow-values__type', item.type));
        if (opens) opt.setAttribute('aria-haspopup', 'listbox');
        opt.addEventListener('mousedown', (ev) => ev.preventDefault());
        opt.addEventListener('click', () => take(item, { whole }));
        opt.addEventListener('mousemove', () => { if (active !== opt) activate(opt); });
        shown.push({ opt, item, whole });
        return opt;
    }

    function matches(item, terms) {
        const hay = [item.label, item.type, item.ref].map(words).join(' ');
        return terms.every((t) => hay.includes(t));
    }

    /** Every descendant of `items`, with its labels joined by ›, for a search. */
    function flatten(items, prefix = '') {
        const out = [];
        for (const it of items || []) {
            const label = prefix ? `${prefix} › ${it.label}` : it.label;
            out.push({ item: it, label });
            if (Array.isArray(it.children)) out.push(...flatten(it.children, label));
        }
        return out;
    }

    function paint() {
        list.replaceChildren();
        shown = [];
        active = null;
        const terms = words(search.value).split(/\s+/).filter(Boolean);
        const level = trail[trail.length - 1] ?? null;
        crumb.hidden = !level;
        crumb.replaceChildren();
        if (level) {
            const back = el('button', 'twm-flow-values__back');
            back.type = 'button';
            back.appendChild(icon('chevron_left'));
            back.appendChild(el('span', '', say(S, 'back')));
            back.addEventListener('mousedown', (ev) => ev.preventDefault());
            back.addEventListener('click', climb);
            crumb.append(back, el('span', 'twm-flow-values__path', trail.map((t) => t.label).join(' › ')));
            const box = el('div', 'twm-flow-values__chips');
            if (!terms.length || matches(level, terms)) box.appendChild(option(level, { whole: true }));
            for (const it of level.children || []) {
                if (terms.length && !matches(it, terms)) continue;
                box.appendChild(option(it));
            }
            list.appendChild(box);
        } else {
            for (const g of groups) {
                const group = el('div', 'twm-flow-values__group');
                group.setAttribute('role', 'group');
                const gid = uid('values-group');
                const label = el('div', 'twm-flow-values__group-label');
                label.id = gid;
                label.appendChild(el('span', 'twm-flow-values__group-name', g.label ?? ''));
                if (g.sub) label.appendChild(el('span', 'twm-flow-values__group-sub', g.sub));
                group.setAttribute('aria-labelledby', gid);
                const items = Array.isArray(g.items) ? g.items : [];
                const grid = g.layout === 'grid';
                const box = el('div', grid ? 'twm-flow-values__grid' : 'twm-flow-values__chips');
                if (terms.length) {
                    for (const { item, label: path } of flatten(items)) {
                        if (matches(item, terms) || words(path).includes(terms.join(' '))) {
                            box.appendChild(option(item, { grid, label: path }));
                        }
                    }
                    if (!box.childNodes.length) continue;
                } else if (!items.length) {
                    if (g.empty) label.appendChild(el('span', 'twm-flow-values__group-empty', `— ${g.empty}`));
                    group.appendChild(label);
                    list.appendChild(group);
                    continue;
                } else {
                    for (const it of items) box.appendChild(option(it, { grid }));
                }
                group.append(label, box);
                list.appendChild(group);
            }
        }
        if (!shown.length) list.appendChild(el('p', 'twm-flow-values__empty', terms.length
            ? say(S, 'nothingMatches', search.value.trim()) : say(S, 'noValues')));
        activate(nextOption(list, null, 1));
    }

    function take(item, { whole = false } = {}) {
        const opens = !whole && Array.isArray(item.children) && item.children.length > 0;
        if (opens && !search.value) {
            trail.push(item);
            paint();
            return;
        }
        result = item;
        onPick?.(item);
        handle.close('chosen');
    }

    function climb() {
        trail.pop();
        paint();
        search.focus({ preventScroll: true });
    }

    search.addEventListener('input', paint);
    search.addEventListener('keydown', (ev) => {
        if (ev.isComposing) return;
        if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
            ev.preventDefault();
            activate(nextOption(list, active, ev.key === 'ArrowDown' ? 1 : -1) || active);
        } else if (ev.key === 'Enter') {
            ev.preventDefault();
            const hit = shown.find((s) => s.opt === active);
            if (hit) take(hit.item, { whole: hit.whole });
        } else if (ev.key === 'ArrowRight' && !search.value) {
            const hit = shown.find((s) => s.opt === active);
            if (hit && !hit.whole && hit.item.children?.length) { ev.preventDefault(); take(hit.item); }
        } else if (ev.key === 'Escape' && trail.length) {
            ev.preventDefault();
            ev.stopPropagation();
            climb();
        }
    });
    root.addEventListener('focusout', (ev) => {
        const to = ev.relatedTarget;
        if (to && !root.contains(to) && to !== anchor) handle.close('blur');
    });

    const handle = openPopover({
        anchor, content: root, label: title ?? say(S, 'insertValue'), className: 'twm-flow-popover--values',
        focus: search, onClose: () => settle(result),
    });
    if (handle.toggled) settle(null);
    else paint();
    done.close = () => handle.close('closed');
    return done;
}
