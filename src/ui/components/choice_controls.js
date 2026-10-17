/**
 * CHOICE CONTROLS — the one select, the one set of toggle chips and the one
 * radio list, shared by `openForm` and the flow kit's settings widgets.
 *
 * Each draws a fixed list of options and reads back the option's OWN value —
 * a number stays a number, an object stays the object — never the text of an
 * `<option>` or a `value` attribute. That is why every control here keeps the
 * values beside the DOM it draws and resolves the reader's choice by position.
 *
 * An option is a bare value, or `{ value, label?, description?, disabled?,
 * reason? }`. `selectBox` also takes `{ group, options }` entries, drawn as an
 * `<optgroup>`; the chips and the radio list draw a group's options in place.
 *
 * A DISABLED OPTION IS SHOWN, WITH ITS REASON, AND IS NEVER CHOSEN BY VALUE:
 * a stored value that names one is not selected (the select falls to its first
 * enabled option, the radios to none, the chips leave it unpressed), unless
 * `keepMissing` keeps it as a value the list does not offer. The reader cannot
 * pick one either. What a caller does about a disabled option selected some
 * other way (a script setting `.value`) is the caller's: `selectBox.entry()`
 * and `choiceList.entry()` say which option is selected, disabled or not.
 *
 * `keepMissing` (the kit's rule, on by default): a stored value the list does
 * not offer is KEPT, marked with `notFound(text)`, so a settings panel cannot
 * silently turn it into the first entry on the next save. A form that should
 * offer only what is listed passes `keepMissing: false`.
 *
 * `loose`: a stored value matches an option whose value has the same TEXT
 * (`2` matches `'2'`), for a caller whose stored values may arrive as strings.
 * Off by default: the kit's values keep their type, and `'2'` is not `2`.
 *
 * Nothing here names a consumer's vocabulary; every word on screen is the
 * caller's (`label`, `reason`, `description`, `notFound`).
 */

/** A value as one line of text shows it: a string as itself, anything else as JSON. */
export const shownValue = (v) => (v === undefined ? '' : typeof v === 'string' ? v : JSON.stringify(v));

function el(tag, className, text) {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
}

const isGroup = (o) => o !== null && typeof o === 'object' && Array.isArray(o.options) && 'group' in o;

/** One option, normalised: `{value, label, description, disabled, reason}`. */
export function choiceOption(o) {
    if (o === null || typeof o !== 'object') {
        return { value: o, label: shownValue(o), description: null, disabled: false, reason: null };
    }
    return {
        value: o.value,
        label: o.label != null ? String(o.label) : shownValue(o.value),
        description: o.description != null ? String(o.description) : null,
        disabled: Boolean(o.disabled),
        reason: o.reason != null && o.reason !== '' ? String(o.reason) : null,
    };
}

/** Every option of a list, groups flattened in order. */
export function flatChoices(options) {
    const out = [];
    for (const o of options || []) {
        if (isGroup(o)) for (const inner of o.options) out.push(choiceOption(inner));
        else out.push(choiceOption(o));
    }
    return out;
}

/** Does stored `value` name option value `v`? */
export function sameChoice(v, value, loose = false) {
    if (v === value) return true;
    if (!loose || v === undefined || value === undefined || v === null || value === null) return false;
    return String(v) === String(value);
}

/** An option's text: its label, and the reason it is unavailable when it is. */
const optionText = (o) => (o.disabled && o.reason ? `${o.label} — ${o.reason}` : o.label);

/**
 * A `<select>` over `options`.
 *
 * `empty` (text) draws a first option that stands for "no value" (`undefined`).
 * `valueAttr`: what each `<option value>` carries — `'index'` (its position;
 * the kit's) or `'value'` (the option's value as text, so a script that sets
 * `.value = 'b'` picks option `'b'`). The value READ BACK is the option's own
 * either way.
 *
 * Returns `{ box, valueOf(), entry(), select(value), setOptions(options) }`:
 * `select` re-selects by value (true when the value is offered and enabled);
 * `setOptions` redraws the list and keeps the current value when the new list
 * still offers it.
 */
export function selectBox(options, value, {
    empty = null, label = '', notFound = (v) => `${v} (not found)`, keepMissing = true,
    valueAttr = 'index', loose = false, className = 'twm-flow-input twm-flow-input--select',
} = {}) {
    const box = el('select', className);
    if (label) box.setAttribute('aria-label', label);
    let entries = [];

    const add = (parent, o) => {
        const attr = valueAttr === 'index' ? String(entries.length) : (o.value === undefined ? '' : String(o.value));
        // `createElement`, not `new Option`: the constructor is a window
        // global, and a page that installed only `document` has none.
        const opt = el('option', '', optionText(o));
        opt.value = attr;
        if (o.disabled) {
            opt.disabled = true;
            if (o.reason) opt.title = o.reason;
        }
        parent.appendChild(opt);
        entries.push(o);
    };
    const firstEnabled = () => {
        const i = entries.findIndex((e) => !e.disabled);
        return i >= 0 ? i : 0;
    };
    const select = (v) => {
        const start = empty !== null ? 1 : 0;
        const at = entries.findIndex((e, i) => i >= start && !e.disabled && !e.stray && sameChoice(e.value, v, loose));
        if (at >= 0) { box.selectedIndex = at; return true; }
        return false;
    };
    const place = (v) => {
        if (select(v)) return;
        if (keepMissing && v !== undefined && v !== null && v !== '') {
            // A stored value the list no longer offers is KEPT as its own option:
            // it must not silently become the first entry on the next save.
            add(box, { value: v, label: notFound(shownValue(v)), description: null, disabled: false, reason: null,
                       stray: true });
            box.selectedIndex = entries.length - 1;
            return;
        }
        box.selectedIndex = empty !== null ? 0 : firstEnabled();
    };
    const fill = (opts, v) => {
        box.replaceChildren();
        entries = [];
        if (empty !== null) add(box, { value: undefined, label: String(empty), description: null, disabled: false,
                                       reason: null });
        for (const o of opts || []) {
            if (isGroup(o)) {
                const g = el('optgroup');
                g.label = String(o.group ?? '');
                for (const inner of o.options) add(g, choiceOption(inner));
                box.appendChild(g);
            } else {
                add(box, choiceOption(o));
            }
        }
        place(v);
    };
    const entry = () => (box.selectedIndex < 0 ? null : entries[box.selectedIndex] ?? null);
    const valueOf = () => entry()?.value;

    fill(options, value);
    return {
        box,
        valueOf,
        entry,
        select,
        setOptions(opts) { fill(opts, valueOf()); },
    };
}

/**
 * Toggle chips over a fixed list: a multi-select. The value is the list of
 * pressed values in the list's order, and `onChange(list | undefined)` hears
 * each toggle (`undefined` when none is pressed). With `keepMissing`, a stored
 * entry the list lacks is kept, marked, until it is toggled off. A disabled
 * option is a chip that cannot be pressed, its reason under its label.
 *
 * Returns `{ el, valueOf(), setValue(list), setOptions(options) }`;
 * `setOptions` keeps the pressed values the new list still offers.
 */
export function toggleChips({ options, value, label, readOnly, onChange, notFound = (v) => `${v} (not found)`,
                              keepMissing = true, loose = false }) {
    const root = el('div', 'twm-flow-togglechips');
    root.setAttribute('role', 'group');
    if (label) root.setAttribute('aria-label', label);
    let list = [];
    let chosen = new Set();
    let strays = [];

    const emit = () => {
        const out = valueOf();
        onChange?.(out.length ? out : undefined);
    };
    const chipFor = (text, pressed, toggle, { stray = false, reason = null, disabled = false } = {}) => {
        const b = el('button', `twm-flow-togglechip${stray ? ' twm-flow-togglechip--missing' : ''}`, text);
        b.type = 'button';
        b.setAttribute('aria-pressed', pressed ? 'true' : 'false');
        b.disabled = Boolean(readOnly) || disabled;
        if (reason) {
            b.title = reason;
            b.appendChild(el('span', 'twm-choice__reason', reason));
        }
        b.addEventListener('click', () => {
            const on = toggle();
            b.setAttribute('aria-pressed', on ? 'true' : 'false');
            emit();
        });
        return b;
    };
    const draw = (opts, stored) => {
        list = flatChoices(opts);
        const wanted = Array.isArray(stored) ? stored : [];
        const offered = (v) => list.find((o) => !o.disabled && sameChoice(o.value, v, loose));
        chosen = new Set(wanted.map(offered).filter(Boolean).map((o) => o.value));
        strays = keepMissing ? wanted.filter((v) => !offered(v)) : [];
        root.replaceChildren();
        for (const o of list) {
            root.appendChild(chipFor(o.label, chosen.has(o.value), () => {
                if (o.disabled) return false;           // never chosen, even with the button forced
                if (chosen.has(o.value)) chosen.delete(o.value); else chosen.add(o.value);
                return chosen.has(o.value);
            }, { disabled: o.disabled, reason: o.disabled ? o.reason : null }));
        }
        for (const v of [...strays]) {
            root.appendChild(chipFor(notFound(shownValue(v)), true, () => {
                const i = strays.indexOf(v);
                if (i >= 0) { strays.splice(i, 1); return false; }
                strays.push(v);
                return true;
            }, { stray: true }));
        }
    };
    const valueOf = () => [...list.filter((o) => chosen.has(o.value)).map((o) => o.value), ...strays];
    draw(options, value);
    return {
        el: root,
        valueOf,
        setValue: (stored) => draw(list, stored),
        setOptions: (opts) => draw(opts, valueOf()),
    };
}

/**
 * A one-of-N as radio rows, each with its label — and a sentence under it when
 * the option has a `description`, and its `reason` when it is disabled. `name`
 * groups the radios (the caller's, so it is unique where it needs to be).
 *
 * Returns `{ el, focus(), valueOf(), entry(), select(value), setOptions(options) }`.
 * `onChange(value)` hears the reader's choice. With `keepMissing`, a stored
 * value the list lacks is named in a note under the list (and kept by the
 * caller, since no radio holds it).
 */
export function choiceList({ options, value, name, label, readOnly, onChange, notFound = (v) => `${v} (not found)`,
                             keepMissing = true, loose = false }) {
    const root = el('div', 'twm-flow-choices');
    root.setAttribute('role', 'radiogroup');
    if (label) root.setAttribute('aria-label', label);
    let list = [];
    let radios = [];

    const draw = (opts, current) => {
        list = flatChoices(opts);
        radios = [];
        root.replaceChildren();
        const at = list.findIndex((o) => !o.disabled && sameChoice(o.value, current, loose));
        list.forEach((o, i) => {
            const row = el('label', `twm-flow-choice${o.disabled ? ' twm-choice--disabled' : ''}`);
            const radio = el('input', 'twm-flow-choice__radio');
            radio.type = 'radio';
            radio.name = name;
            radio.checked = i === at;
            radio.disabled = Boolean(readOnly) || o.disabled;
            radio.addEventListener('change', () => { if (radio.checked) onChange?.(o.value); });
            radios.push(radio);
            const words = el('span', 'twm-flow-choice__words');
            words.appendChild(el('span', 'twm-flow-choice__label', o.label));
            if (o.description !== null) words.appendChild(el('span', 'twm-flow-choice__sub', o.description));
            if (o.disabled && o.reason) words.appendChild(el('span', 'twm-choice__reason', o.reason));
            row.append(radio, words);
            root.appendChild(row);
        });
        if (keepMissing && current !== undefined && at < 0 && !list.some((o) => sameChoice(o.value, current, loose))) {
            root.appendChild(el('p', 'twm-flow-field__note', notFound(shownValue(current))));
        }
    };
    const checkedAt = () => radios.findIndex((r) => r.checked);
    const entry = () => list[checkedAt()] ?? null;
    const api = {
        el: root,
        focus: () => (radios.find((r) => r.checked && !r.disabled) || radios.find((r) => !r.disabled))
            ?.focus({ preventScroll: true }),
        entry,
        valueOf: () => entry()?.value,
        select(v) {
            const at = list.findIndex((o) => !o.disabled && sameChoice(o.value, v, loose));
            radios.forEach((r, i) => { r.checked = i === at; });
            return at >= 0;
        },
        setOptions(opts) { draw(opts, api.valueOf()); },
    };
    draw(options, value);
    return api;
}
