/**
 * THE STEP PICKER — what "+" opens (36 §3.5).
 *
 *     const picked = await openStepPicker({anchor, entries, categories, where, paste, strings});
 *     // → {entry} | {paste: true} | null
 *
 * Grouped by category, searchable over each entry's label, sub, description
 * and id (the box has focus on open); ↑ ↓ choose, stepping over a refused row;
 * Enter adds; Esc closes; *"Paste a copied step · Ctrl+V"* is its footer when
 * `paste` is set — and Ctrl+V in the EMPTY search box pastes the step (with
 * text in the box it pastes text, as a search box should).
 *
 * An entry with a `refusal` is drawn greyed WITH its sentence under it and
 * cannot be chosen — never hidden, because "why can I not add it here" is the
 * question the next screen would otherwise have to answer.
 *
 * ENTRIES ARE THE EDITOR'S, NOT THE CATALOGUE'S: an outline offers blocks
 * ("If … otherwise" is a condition and its two arms) beside plain steps, and
 * lanes offer sources only after "Add a source". The picker draws what it is
 * handed.
 *
 * It is a FlexDesk popover (`dom.js`): `role="dialog"` holding a `listbox`
 * whose active option is the search box's `aria-activedescendant`; it returns
 * focus to its anchor when it closes. The promise carries `close()`.
 */

import { el, icon, nextOption, openPopover, toneClass, uid } from './dom.js';
import { createStrings, say } from './strings.js';

const words = (s) => String(s ?? '').toLowerCase();

/**
 * @param {object} o
 * @param {HTMLElement} o.anchor
 * @param {{id: string, label: string, sub?: string, description?: string, icon?: string, tone?: string,
 *          category?: string, refusal?: string}[]} o.entries
 * @param {{id: string, label: string, layout?: 'list'|'grid'}[]} [o.categories]  groups, in order
 * @param {string} [o.where]     "inside For each row, after Check eligibility"
 * @param {{label?: string}|null} [o.paste]   a copied step can be pasted here
 * @param {object} [o.strings]
 * @param {string} [o.title]     the heading; `Add a step` by default
 */
export function openStepPicker({ anchor, entries = [], categories = [], where = '', paste = null, strings = null,
                                 title = null } = {}) {
    const S = createStrings(strings);
    let settle;
    const done = new Promise((resolve) => { settle = resolve; });
    let result = null;

    const root = el('div', 'twm-flow-picker');
    const headingId = uid('picker-title');
    const head = el('div', 'twm-flow-picker__head');
    const heading = el('span', 'twm-flow-picker__title', title ?? say(S, 'addStep'));
    heading.id = headingId;
    head.appendChild(heading);
    if (where) head.appendChild(el('span', 'twm-flow-picker__where', where));
    root.appendChild(head);

    const listId = uid('picker-list');
    const searchRow = el('div', 'twm-flow-picker__search');
    searchRow.appendChild(icon('search', 'twm-flow-picker__search-icon'));
    const search = el('input', 'twm-flow-picker__input');
    search.type = 'search';
    search.placeholder = say(S, 'searchSteps');
    search.setAttribute('aria-label', say(S, 'searchSteps'));
    search.setAttribute('role', 'combobox');
    search.setAttribute('aria-controls', listId);
    search.setAttribute('aria-expanded', 'true');
    search.setAttribute('aria-autocomplete', 'list');
    search.autocomplete = 'off';
    searchRow.appendChild(search);
    root.appendChild(searchRow);

    const list = el('div', 'twm-flow-picker__list');
    list.id = listId;
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-labelledby', headingId);
    root.appendChild(list);
    const empty = el('p', 'twm-flow-picker__empty');
    empty.hidden = true;
    root.appendChild(empty);

    // Groups in the categories' order; an entry whose category is not listed
    // goes in a group of its own after them.
    const order = (Array.isArray(categories) ? categories : []).map((c) => ({ ...c }));
    for (const e of entries) {
        const cat = e.category ?? '';
        if (!order.some((c) => String(c.id) === String(cat))) order.push({ id: cat, label: cat, layout: 'list' });
    }
    const options = [];
    for (const cat of order) {
        const mine = entries.filter((e) => String(e.category ?? '') === String(cat.id));
        if (!mine.length) continue;
        const group = el('div', 'twm-flow-picker__group');
        group.setAttribute('role', 'group');
        const gid = uid('picker-group');
        const glabel = el('div', 'twm-flow-picker__group-label', cat.label ?? '');
        glabel.id = gid;
        group.setAttribute('aria-labelledby', gid);
        const items = el('div', `twm-flow-picker__items${cat.layout === 'grid' ? ' twm-flow-picker__items--grid' : ''}`);
        for (const entry of mine) {
            const opt = el('div', `twm-flow-picker__option${entry.refusal ? ' twm-flow-picker__option--refused' : ''}`);
            opt.id = uid('picker-option');
            opt.setAttribute('role', 'option');
            opt.setAttribute('aria-selected', 'false');
            if (entry.refusal) opt.setAttribute('aria-disabled', 'true');
            opt.dataset.entry = String(entry.id);
            const chip = el('span', `twm-flow-picker__chip ${toneClass('twm-flow-picker__chip', entry.tone)}`);
            chip.appendChild(icon(entry.icon || ''));
            chip.setAttribute('aria-hidden', 'true');
            const text = el('span', 'twm-flow-picker__words');
            const line = el('span', 'twm-flow-picker__label', entry.label ?? entry.id);
            if (entry.sub) line.appendChild(el('span', 'twm-flow-picker__sub', ` ${entry.sub}`));
            text.appendChild(line);
            if (entry.description && cat.layout !== 'grid') {
                text.appendChild(el('span', 'twm-flow-picker__description', entry.description));
            }
            if (entry.refusal) text.appendChild(el('span', 'twm-flow-picker__refusal', entry.refusal));
            opt.append(chip, text);
            // The search box keeps focus: an option is chosen by a click, not focused by a press.
            opt.addEventListener('mousedown', (ev) => ev.preventDefault());
            opt.addEventListener('click', () => {
                if (entry.refusal) return;
                choose({ entry });
            });
            opt.addEventListener('mousemove', () => { if (!entry.refusal) activate(opt); });
            options.push({ opt, entry, group, haystack: [entry.label, entry.sub, entry.description, entry.id].map(words).join(' ') });
            items.appendChild(opt);
        }
        group.append(glabel, items);
        list.appendChild(group);
    }

    const foot = el('div', 'twm-flow-picker__foot');
    foot.appendChild(el('span', 'twm-flow-picker__keys', say(S, 'pickerKeys')));
    if (paste) {
        const p = el('button', 'twm-flow-picker__paste', paste.label ?? say(S, 'pasteStep'));
        p.type = 'button';
        p.addEventListener('click', () => choose({ paste: true }));
        foot.appendChild(p);
    }
    root.appendChild(foot);

    let active = null;
    function activate(opt) {
        if (active === opt) return;
        active?.setAttribute('aria-selected', 'false');
        active?.classList.remove('twm-flow-picker__option--active');
        active = opt;
        if (opt) {
            opt.setAttribute('aria-selected', 'true');
            opt.classList.add('twm-flow-picker__option--active');
            search.setAttribute('aria-activedescendant', opt.id);
            opt.scrollIntoView?.({ block: 'nearest' });
        } else {
            search.removeAttribute('aria-activedescendant');
        }
    }

    function filter() {
        const terms = words(search.value).split(/\s+/).filter(Boolean);
        let shown = 0;
        for (const o of options) {
            const hit = terms.every((t) => o.haystack.includes(t));
            o.opt.hidden = !hit;
            if (hit) shown += 1;
        }
        for (const g of list.querySelectorAll('.twm-flow-picker__group')) {
            g.hidden = ![...g.querySelectorAll('[role="option"]')].some((o) => !o.hidden);
        }
        empty.hidden = shown > 0;
        empty.textContent = shown > 0 ? '' : say(S, 'nothingMatches', search.value.trim());
        if (!active || active.hidden) activate(nextOption(list, null, 1));
    }

    function choose(value) {
        result = value;
        handle.close('chosen');
    }

    search.addEventListener('input', filter);
    search.addEventListener('keydown', (ev) => {
        if (ev.isComposing) return;
        if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
            ev.preventDefault();
            activate(nextOption(list, active, ev.key === 'ArrowDown' ? 1 : -1) || active);
        } else if (ev.key === 'Enter') {
            ev.preventDefault();
            const hit = options.find((o) => o.opt === active);
            if (hit && !hit.entry.refusal) choose({ entry: hit.entry });
        } else if ((ev.ctrlKey || ev.metaKey) && String(ev.key).toLowerCase() === 'v' && paste && !search.value) {
            ev.preventDefault();
            choose({ paste: true });
        }
    });
    root.addEventListener('focusout', (ev) => {
        const to = ev.relatedTarget;
        if (to && !root.contains(to) && to !== anchor) handle.close('blur');
    });

    const handle = openPopover({
        anchor, content: root, label: title ?? say(S, 'addStep'), className: 'twm-flow-popover--picker',
        focus: search, onClose: () => settle(result),
    });
    if (handle.toggled) settle(null);
    else filter();
    done.close = () => handle.close('closed');
    return done;
}
