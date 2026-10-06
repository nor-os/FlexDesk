/**
 * A STEP'S SETTINGS, DRAWN FROM ITS SCHEMA — the widget registry, the generic
 * widgets and the field around each control (36 §3.3).
 *
 *  - a plain JSON-Schema type draws the obvious control: an `enum` a select, a
 *    string a text box (`x-ui-multiline`: a growing textarea), a number a
 *    number box, a boolean a checkbox, an object with properties a group of
 *    its own fields (`x-ui-fold`: folded, with a one-line summary);
 *  - `x-ui-widget` names a control from the REGISTRY. The kit pre-registers the
 *    ten generic ones; a consumer registers its own, and a name nobody
 *    registered is REFUSED ON SCREEN, BY NAME, with its stored value kept
 *    untouched — a panel that fell back to nothing would lose the setting on
 *    the next save.
 *
 * A widget is `(spec, value, ctx) => {el, destroy?, focus?, caret?,
 * restoreCaret?}` and reports through `ctx.set(value, {reshape?})`; `undefined`
 * removes the setting. `reshape: true` asks the panel to redraw (a choice that
 * changes which other settings exist).
 *
 * ══ A CONTROL NEVER WRITES A VALUE THE READER DID NOT GIVE IT ══════════
 *
 * An untouched optional setting stays ABSENT (the server's `default` applies),
 * and emptying one removes it — which is what keeps a saved graph byte-
 * identical when nothing was changed. And a value KEEPS ITS TYPE: an entry of a
 * map or a list that is a number, a boolean, an object or null is written back
 * as itself when another entry is edited, and read as JSON when it is edited
 * itself (`typedValue`). An enum's choice is written as the enum's own value,
 * never as the text of its `<option>`.
 */

import { button, el, uid } from './dom.js';
import { createChipInput } from './chip_input.js';
import { resolveSyntaxes } from './references.js';
import { admittedTypes, enumLabel, fieldsFromSchema, primaryType, titleOf, visibleFields, whenKeys }
    from './settings_schema.js';
import { createStrings, say } from './strings.js';

// ── values that keep their type ──────────────────────────────────────────

/** A stored value as a one-line box shows it: a string as itself, anything else as JSON. */
export const shownValue = (v) => (v === undefined ? '' : typeof v === 'string' ? v : JSON.stringify(v));

/**
 * The text typed into a box, as a value OF THE TYPE IT WAS:
 *  - an untouched box writes back what was stored, exactly;
 *  - an edited box whose stored value was NOT a string is parsed as JSON, and
 *    written as the parsed value when it parses (`5` → 5, `false` → false);
 *    text that does not parse is written as typed — the reader typed text;
 *  - a box whose stored value was a string, and a new row, stay text.
 */
export function typedValue(text, stored) {
    if (text === shownValue(stored) && stored !== undefined) return stored;
    if (stored === undefined || typeof stored === 'string') return text;
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

const clean = (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

// ── small builders ───────────────────────────────────────────────────────

function textBox(value, { type = 'text', placeholder = '', label = '' } = {}) {
    const input = el('input', 'twm-flow-input');
    input.type = type;
    input.value = value ?? '';
    if (placeholder) input.placeholder = placeholder;
    if (label) input.setAttribute('aria-label', label);
    return input;
}

/** A `<select>` over `options` (`{value, label, disabled?}`), keeping a stored value it lacks. */
function selectBox(options, value, { empty = null, label = '', notFound = (v) => `${v} (not found)` } = {}) {
    const box = el('select', 'twm-flow-input twm-flow-input--select');
    if (label) box.setAttribute('aria-label', label);
    const values = [];
    if (empty !== null) {
        box.appendChild(new Option(empty, ''));
        values.push(undefined);
    }
    options.forEach((opt) => {
        const o = new Option(opt.label, String(values.length));
        if (opt.disabled) o.disabled = true;
        box.appendChild(o);
        values.push(opt.value);
    });
    const at = values.findIndex((v, i) => i >= (empty !== null ? 1 : 0) && v === value);
    if (value !== undefined && value !== null && value !== '' && at < 0) {
        // A stored value the list no longer offers is KEPT as its own option:
        // it must not silently become the first entry on the next save.
        box.appendChild(new Option(notFound(shownValue(value)), String(values.length)));
        values.push(value);
        box.value = String(values.length - 1);
    } else {
        box.value = at >= 0 ? String(at) : (empty !== null ? '' : '0');
    }
    return { box, valueOf: () => (box.value === '' ? undefined : values[Number(box.value)]) };
}

/**
 * A textarea as tall as its text — wrapped lines included — up to `maxLines`,
 * then it scrolls. Measured from `scrollHeight` once laid out (a
 * ResizeObserver, which also re-measures when the width changes) and on every
 * edit; with no layout (a test DOM) nothing is measured and `rows` stands.
 * Returns a disconnect, for the widget's `destroy`.
 */
export function fitToText(area, maxLines = 12) {
    let width = -1;
    const fit = () => {
        if (!area.isConnected || !area.clientWidth) return;
        const style = getComputedStyle(area);
        const line = parseFloat(style.lineHeight) || 16;
        const pad = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
        const border = (parseFloat(style.borderTopWidth) || 0) + (parseFloat(style.borderBottomWidth) || 0);
        area.style.height = 'auto';
        const want = Math.min(area.scrollHeight, Math.ceil(line * maxLines + pad));
        area.style.height = `${want + border}px`;
    };
    area.addEventListener('input', fit);
    if (typeof ResizeObserver !== 'function') return () => area.removeEventListener('input', fit);
    const watch = new ResizeObserver(() => {
        if (area.clientWidth === width) return;
        width = area.clientWidth;
        fit();
    });
    watch.observe(area);
    return () => { watch.disconnect(); area.removeEventListener('input', fit); };
}

/** Rows of editable lines with Add and Remove — the shape the list widgets share. */
function rowList({ items, draw, blank, onChange, addLabel, removeLabel, readOnly }) {
    const root = el('div', 'twm-flow-field__rows');
    root.setAttribute('role', 'group');
    const list = items.map((it) => ({ ...it }));
    const cleanups = [];
    const paint = () => {
        cleanups.splice(0).forEach((f) => f());
        root.replaceChildren();
        list.forEach((item, idx) => {
            const row = el('div', 'twm-flow-field__row');
            const drawn = draw(item, (next) => { list[idx] = next; onChange(list); });
            const parts = Array.isArray(drawn) ? drawn : drawn.parts;
            if (!Array.isArray(drawn) && drawn.destroy) cleanups.push(drawn.destroy);
            row.append(...parts);
            if (!readOnly) {
                row.appendChild(button({ label: removeLabel(item, idx), icon: 'close', iconOnly: true,
                                         className: 'twm-flow-field__remove',
                                         onClick: () => { list.splice(idx, 1); onChange(list); paint(); } }));
            }
            root.appendChild(row);
        });
        if (!readOnly) {
            root.appendChild(button({ label: addLabel, icon: 'add', className: 'twm-flow-field__add',
                                      onClick: () => { list.push(blank()); onChange(list); paint(); } }));
        }
    };
    paint();
    return { el: root, destroy: () => cleanups.splice(0).forEach((f) => f()) };
}

/** A chip input with its *Insert a value* button beside it. */
function refBox(ctx, { value, multiline, mono, placeholder, label, onInput }) {
    const S = ctx.strings;
    const chip = createChipInput({
        value, syntaxes: ctx.references, readOnly: ctx.readOnly, multiline, mono, placeholder,
        label, describeContext: ctx.describeContext, onInput,
    });
    const box = el('div', `twm-flow-refbox${mono ? ' twm-flow-refbox--mono' : ''}`);
    box.appendChild(chip.el);
    if (ctx.openValuePicker && !ctx.readOnly) {
        const insert = el('button', 'twm-flow-refbox__insert', say(S, 'insertValueGlyph'));
        insert.type = 'button';
        insert.setAttribute('aria-label', say(S, 'insertValue'));
        insert.title = say(S, 'insertValue');
        insert.setAttribute('aria-haspopup', 'dialog');
        insert.addEventListener('click', () => ctx.openValuePicker({ anchor: insert, insert: (t) => chip.insert(t) }));
        box.appendChild(insert);
    }
    return { box, chip };
}

const placeholderOf = (spec, S) => spec['x-ui-placeholder'] ?? say(S, 'textOrValue');

// ── the generic widgets ──────────────────────────────────────────────────

/** Text with reference chips. A setting that may also BE a list or an object
 *  (`["string", "array"]`) is shown as JSON and written back as the list when
 *  the text parses as one; text that does not parse is kept as typed, for the
 *  server to judge, and a setting that is only ever text is never parsed. */
function templateWidget(spec, value, ctx) {
    const admits = admittedTypes(spec);
    const shown = value && typeof value === 'object' ? JSON.stringify(value, null, 2) : (value ?? '');
    const { box, chip } = refBox(ctx, {
        value: String(shown), multiline: true, placeholder: placeholderOf(spec, ctx.strings), label: ctx.label,
        onInput: (text) => {
            if (/^\s*[[{]/.test(text) && (admits.includes('array') || admits.includes('object'))) {
                try {
                    const parsed = JSON.parse(text);
                    const kind = Array.isArray(parsed) ? 'array' : 'object';
                    if (parsed && typeof parsed === 'object' && admits.includes(kind)) { ctx.set(parsed); return; }
                } catch { /* not JSON yet: kept as typed */ }
            }
            ctx.set(clean(text));
        },
    });
    return { el: box, focus: () => chip.focus(), caret: chip.caret, restoreCaret: chip.restoreCaret,
             destroy: chip.destroy };
}

/** A formula: monospace, chips for its syntaxes. Plain text here; a consumer
 *  replaces it with its own editor (`register('expression', …, {replace: true})`). */
function expressionWidget(spec, value, ctx) {
    const { box, chip } = refBox(ctx, {
        value: String(value ?? ''), multiline: true, mono: true,
        placeholder: spec['x-ui-placeholder'] ?? '', label: ctx.label,
        onInput: (text) => ctx.set(clean(text)),
    });
    return { el: box, focus: () => chip.focus(), caret: chip.caret, restoreCaret: chip.restoreCaret,
             destroy: chip.destroy };
}

/** A request body: JSON when it parses as an object or a list, text otherwise. */
function jsonBodyWidget(spec, value, ctx) {
    const shown = value && typeof value === 'object' ? JSON.stringify(value, null, 2) : (value ?? '');
    const { box, chip } = refBox(ctx, {
        value: String(shown), multiline: true, mono: true, placeholder: spec['x-ui-placeholder'] ?? '',
        label: ctx.label,
        onInput: (text) => {
            if (/^\s*[[{]/.test(text)) {
                try { ctx.set(JSON.parse(text)); return; } catch { /* kept as text */ }
            }
            ctx.set(clean(text));
        },
    });
    return { el: box, focus: () => chip.focus(), caret: chip.caret, restoreCaret: chip.restoreCaret,
             destroy: chip.destroy };
}

/** An object of names to values; each value keeps its stored type. */
function keyValueMapWidget(spec, value, ctx) {
    const S = ctx.strings;
    const entries = Object.entries(value && typeof value === 'object' && !Array.isArray(value) ? value : {})
        .map(([k, v]) => ({ k, v: shownValue(v), stored: v }));
    const emit = (list) => {
        const out = {};
        for (const { k, v, stored } of list) if (k) out[k] = typedValue(v ?? '', stored);
        ctx.set(Object.keys(out).length ? out : undefined);
    };
    const rows = rowList({
        items: entries, onChange: emit, readOnly: ctx.readOnly,
        addLabel: spec['x-ui-add-label'] ?? say(S, 'add'),
        removeLabel: (item) => say(S, 'removeNamed', item.k || say(S, 'name').toLowerCase()),
        blank: () => ({ k: '', v: '' }),
        draw: (item, put) => {
            const key = textBox(item.k, { placeholder: say(S, 'name'), label: say(S, 'name') });
            key.disabled = Boolean(ctx.readOnly);
            key.addEventListener('input', () => put({ ...item, k: (item.k = key.value) }));
            const { box, chip } = refBox(ctx, {
                value: item.v, multiline: false, placeholder: say(S, 'value'), label: say(S, 'value'),
                onInput: (text) => put({ ...item, v: (item.v = text) }),
            });
            return { parts: [key, box], destroy: chip.destroy };
        },
    });
    return { el: rows.el, destroy: rows.destroy };
}

/** An ordered list of assignments — `{variable, value}` or `{variable, expression}`;
 *  a value keeps its type, a formula is its text. */
function keyValueListWidget(spec, value, ctx) {
    const S = ctx.strings;
    const formulaSyntaxes = resolveSyntaxes(spec['x-ui-formula-references'] ?? ['formula'], ctx.referenceMap);
    const items = (Array.isArray(value) ? value : []).map((a) => ({
        variable: a?.variable ?? '',
        mode: a?.expression !== undefined ? 'expression' : 'value',
        text: a?.expression ?? shownValue(a?.value),
        stored: a?.expression !== undefined ? undefined : a?.value,
    }));
    const emit = (list) => {
        const out = list.filter((a) => a.variable).map((a) => (a.mode === 'expression'
            ? { variable: a.variable, expression: a.text }
            : { variable: a.variable, value: typedValue(a.text, a.stored) }));
        ctx.set(out.length ? out : undefined);
    };
    const rows = rowList({
        items, onChange: emit, readOnly: ctx.readOnly,
        addLabel: spec['x-ui-add-label'] ?? say(S, 'addAssignment'),
        removeLabel: (item) => say(S, 'removeNamed', item.variable || say(S, 'value').toLowerCase()),
        blank: () => ({ variable: '', mode: 'value', text: '' }),
        draw: (item, put) => {
            const name = textBox(item.variable, { placeholder: say(S, 'name'), label: say(S, 'name') });
            name.disabled = Boolean(ctx.readOnly);
            name.addEventListener('input', () => put({ ...item, variable: (item.variable = name.value) }));
            const { box: mode, valueOf } = selectBox([{ value: 'value', label: say(S, 'value') },
                                                      { value: 'expression', label: say(S, 'formula') }],
                                                     item.mode, { label: say(S, 'value') });
            mode.disabled = Boolean(ctx.readOnly);
            const slot = el('span', 'twm-flow-field__slot');
            let chip = null;
            const drawText = () => {
                chip?.destroy();
                const sub = item.mode === 'expression'
                    ? { ...ctx, references: formulaSyntaxes } : ctx;
                const made = refBox(sub, {
                    value: item.text, multiline: false, mono: item.mode === 'expression',
                    placeholder: item.mode === 'expression' ? '' : say(S, 'textOrValue'), label: say(S, 'value'),
                    onInput: (text) => put({ ...item, text: (item.text = text) }),
                });
                chip = made.chip;
                slot.replaceChildren(made.box);
            };
            drawText();
            mode.addEventListener('change', () => {
                item.mode = valueOf();
                put({ ...item });
                drawText();
            });
            return { parts: [name, mode, slot], destroy: () => chip?.destroy() };
        },
    });
    return { el: rows.el, destroy: rows.destroy };
}

function stringListWidget(spec, value, ctx) {
    const S = ctx.strings;
    const items = (Array.isArray(value) ? value : []).map((s) => ({ s: String(s) }));
    const emit = (list) => {
        const out = list.map((x) => x.s).filter(Boolean);
        ctx.set(out.length ? out : undefined);
    };
    const rows = rowList({
        items, onChange: emit, readOnly: ctx.readOnly,
        addLabel: spec['x-ui-add-label'] ?? say(S, 'add'),
        removeLabel: (item) => say(S, 'removeNamed', item.s || say(S, 'value').toLowerCase()),
        blank: () => ({ s: '' }),
        draw: (item, put) => {
            const box = textBox(item.s, { label: ctx.label, placeholder: spec['x-ui-placeholder'] ?? '' });
            box.disabled = Boolean(ctx.readOnly);
            box.addEventListener('input', () => put({ s: (item.s = box.value) }));
            return [box];
        },
    });
    return { el: rows.el, destroy: rows.destroy };
}

/** Toggle chips over a fixed list; the stored list follows the list's order,
 *  and a stored entry the list lacks is kept, marked, until it is toggled off. */
function toggleChips({ options, value, label, readOnly, onChange, notFound }) {
    const root = el('div', 'twm-flow-togglechips');
    root.setAttribute('role', 'group');
    if (label) root.setAttribute('aria-label', label);
    const known = options.map((o) => o.value);
    const chosen = new Set((Array.isArray(value) ? value : []).filter((v) => known.includes(v)));
    const strays = (Array.isArray(value) ? value : []).filter((v) => !known.includes(v));
    const emit = () => {
        const out = [...known.filter((v) => chosen.has(v)), ...strays];
        onChange(out.length ? out : undefined);
    };
    const chipFor = (text, pressed, toggle, stray = false) => {
        const b = el('button', `twm-flow-togglechip${stray ? ' twm-flow-togglechip--missing' : ''}`, text);
        b.type = 'button';
        b.setAttribute('aria-pressed', pressed ? 'true' : 'false');
        b.disabled = Boolean(readOnly);
        b.addEventListener('click', () => {
            const on = toggle();
            b.setAttribute('aria-pressed', on ? 'true' : 'false');
            emit();
        });
        return b;
    };
    for (const o of options) {
        root.appendChild(chipFor(o.label, chosen.has(o.value), () => {
            if (chosen.has(o.value)) chosen.delete(o.value); else chosen.add(o.value);
            return chosen.has(o.value);
        }));
    }
    for (const v of [...strays]) {
        const b = chipFor(notFound(shownValue(v)), true, () => {
            const i = strays.indexOf(v);
            if (i >= 0) { strays.splice(i, 1); return false; }
            strays.push(v);
            return true;
        }, true);
        root.appendChild(b);
    }
    return root;
}

/** A multi-select from `items.enum`, drawn as chips. */
function enumChipsWidget(spec, value, ctx) {
    const S = ctx.strings;
    const itemSpec = spec.items && typeof spec.items === 'object' ? spec.items : {};
    const values = Array.isArray(itemSpec.enum) ? itemSpec.enum : (Array.isArray(spec.enum) ? spec.enum : []);
    const words = (v) => (itemSpec['x-ui-enum-labels'] ? enumLabel(itemSpec, v) : enumLabel(spec, v));
    return {
        el: toggleChips({
            options: values.map((v) => ({ value: v, label: words(v) })), value, label: ctx.label,
            readOnly: ctx.readOnly, onChange: (v) => ctx.set(v), notFound: (v) => say(S, 'notFound', v),
        }),
    };
}

/** A one-of-N as radio rows, each with its words — and a sentence under it,
 *  from `x-ui-enum-descriptions`, when the schema gives one. */
function choiceCardsWidget(spec, value, ctx) {
    const values = Array.isArray(spec.enum) ? spec.enum : [];
    const descriptions = spec['x-ui-enum-descriptions'] && typeof spec['x-ui-enum-descriptions'] === 'object'
        ? spec['x-ui-enum-descriptions'] : {};
    const root = el('div', 'twm-flow-choices');
    root.setAttribute('role', 'radiogroup');
    if (ctx.label) root.setAttribute('aria-label', ctx.label);
    const name = uid('choice');
    const current = value !== undefined ? value : spec.default;
    const radios = [];
    for (const v of values) {
        const row = el('label', 'twm-flow-choice');
        const radio = el('input', 'twm-flow-choice__radio');
        radio.type = 'radio';
        radio.name = name;
        radio.checked = v === current;
        radio.disabled = Boolean(ctx.readOnly);
        radio.addEventListener('change', () => { if (radio.checked) ctx.set(v); });
        radios.push(radio);
        const words = el('span', 'twm-flow-choice__words');
        words.appendChild(el('span', 'twm-flow-choice__label', enumLabel(spec, v)));
        if (descriptions[v] !== undefined) words.appendChild(el('span', 'twm-flow-choice__sub', descriptions[v]));
        row.append(radio, words);
        root.appendChild(row);
    }
    if (current !== undefined && !values.includes(current)) {
        root.appendChild(el('p', 'twm-flow-field__note', say(ctx.strings, 'notFound', shownValue(current))));
    }
    return { el: root, focus: () => (radios.find((r) => r.checked) || radios[0])?.focus({ preventScroll: true }) };
}

const columnWords = (c) => (c.type ? `${c.name} · ${c.type}` : String(c.name));

/** One column of the step's input, by NAME. */
function upstreamColumnWidget(spec, value, ctx) {
    const S = ctx.strings;
    const columns = ctx.columns?.();
    if (!Array.isArray(columns)) {
        const note = el('p', 'twm-flow-field__note', say(S, 'noColumns'));
        if (value !== undefined) note.appendChild(el('span', 'twm-flow-field__kept', ` ${shownValue(value)}`));
        return { el: note };
    }
    const { box, valueOf } = selectBox(columns.map((c) => ({ value: String(c.name), label: columnWords(c) })),
                                       value, { empty: say(S, 'choose'), label: ctx.label,
                                                notFound: (v) => say(S, 'notFound', v) });
    box.disabled = Boolean(ctx.readOnly);
    box.addEventListener('change', () => ctx.set(clean(valueOf())));
    return { el: box };
}

/** Several columns of the step's input, by name, as chips in the input's order. */
function upstreamColumnsWidget(spec, value, ctx) {
    const S = ctx.strings;
    const columns = ctx.columns?.();
    if (!Array.isArray(columns)) {
        const note = el('p', 'twm-flow-field__note', say(S, 'noColumns'));
        if (Array.isArray(value) && value.length) {
            note.appendChild(el('span', 'twm-flow-field__kept', ` ${value.map(shownValue).join(', ')}`));
        }
        return { el: note };
    }
    return {
        el: toggleChips({
            options: columns.map((c) => ({ value: String(c.name), label: String(c.name) })), value,
            label: ctx.label, readOnly: ctx.readOnly, onChange: (v) => ctx.set(v),
            notFound: (v) => say(S, 'notFound', v),
        }),
    };
}

/** The ten generic widgets the kit ships (36 §3.3). */
export const GENERIC_WIDGETS = Object.freeze({
    template: templateWidget,
    expression: expressionWidget,
    'json-body': jsonBodyWidget,
    'key-value-map': keyValueMapWidget,
    'key-value-list': keyValueListWidget,
    'string-list': stringListWidget,
    'enum-chips': enumChipsWidget,
    'choice-cards': choiceCardsWidget,
    'upstream-column': upstreamColumnWidget,
    'upstream-columns': upstreamColumnsWidget,
});

/** Which reference syntaxes a widget recognises when its schema names none. */
export const DEFAULT_WIDGET_REFERENCES = Object.freeze({
    template: ['template'],
    expression: ['formula'],
    'json-body': ['template'],
    'key-value-map': ['template'],
    'key-value-list': ['template'],
});

/**
 * A registry of widgets by name, the generic ones pre-registered. Registering
 * a name that exists THROWS; replacing one must be said (`{replace: true}`).
 */
export function createWidgetRegistry() {
    const table = new Map(Object.entries(GENERIC_WIDGETS));
    return Object.freeze({
        register(name, widget, { replace = false } = {}) {
            if (typeof name !== 'string' || !name) throw new Error('A widget needs a name.');
            if (typeof widget !== 'function') throw new Error(`Widget "${name}" must be a function (spec, value, ctx).`);
            if (table.has(name) && !replace) {
                throw new Error(`A widget called "${name}" is already registered; pass {replace: true} to replace it.`);
            }
            table.set(name, widget);
        },
        has: (name) => table.has(name),
        get: (name) => table.get(name) ?? null,
        names: () => [...table.keys()],
    });
}

// ── plain controls, for a spec with no widget ────────────────────────────

function plainControl(spec, value, ctx) {
    const S = ctx.strings;
    const type = primaryType(spec);
    if (Array.isArray(spec.enum)) {
        const { box, valueOf } = selectBox(spec.enum.map((v) => ({ value: v, label: enumLabel(spec, v) })), value, {
            empty: spec.default !== undefined
                ? (spec['x-ui-enum-labels']?.[spec.default] ?? say(S, 'defaultOption', shownValue(spec.default)))
                : say(S, 'choose'),
            label: ctx.label, notFound: (v) => say(S, 'notFound', v),
        });
        box.disabled = Boolean(ctx.readOnly);
        box.addEventListener('change', () => ctx.set(valueOf()));
        return { el: box };
    }
    if (type === 'boolean') {
        const box = el('input', 'twm-flow-checkbox');
        box.type = 'checkbox';
        box.checked = value === undefined ? Boolean(spec.default) : Boolean(value);
        box.disabled = Boolean(ctx.readOnly);
        if (ctx.label) box.setAttribute('aria-label', ctx.label);
        box.addEventListener('change', () => ctx.set(box.checked === Boolean(spec.default) ? undefined : box.checked));
        return { el: box };
    }
    if (type === 'integer' || type === 'number') {
        const box = textBox(value ?? '', {
            type: 'number', label: ctx.label,
            placeholder: spec['x-ui-placeholder'] ?? (spec.default !== undefined ? String(spec.default) : ''),
        });
        if (spec.minimum !== undefined) box.min = String(spec.minimum);
        if (spec.maximum !== undefined) box.max = String(spec.maximum);
        if (type === 'integer') box.step = '1';
        box.disabled = Boolean(ctx.readOnly);
        box.addEventListener('input', () => {
            const n = box.value === '' ? undefined : Number(box.value);
            ctx.set(Number.isFinite(n) ? n : undefined);
        });
        return { el: box };
    }
    if ((type === 'string' || type === undefined) && spec['x-ui-multiline']) {
        const area = el('textarea', 'twm-flow-input twm-flow-input--area');
        area.value = value ?? '';
        area.rows = 3;
        area.placeholder = spec['x-ui-placeholder'] ?? '';
        if (ctx.label) area.setAttribute('aria-label', ctx.label);
        area.readOnly = Boolean(ctx.readOnly);
        const unfit = fitToText(area, 12);
        area.addEventListener('input', () => ctx.set(clean(area.value)));
        return { el: area, destroy: unfit };
    }
    if (type === 'string' || type === undefined) {
        const box = textBox(value ?? '', { label: ctx.label, placeholder: spec['x-ui-placeholder'] ?? '' });
        box.readOnly = Boolean(ctx.readOnly);
        box.addEventListener('input', () => ctx.set(clean(box.value)));
        return { el: box };
    }
    return null;
}

/** A folded group's one line: the settings it holds that are set, else "Defaults". */
function foldSummary(spec, value, S) {
    const parts = [];
    for (const f of fieldsFromSchema(spec)) {
        const v = value?.[f.key];
        if (v === undefined) continue;
        parts.push(`${titleOf(f.key, f.spec)} ${Array.isArray(f.spec.enum) ? enumLabel(f.spec, v) : shownValue(v)}`);
    }
    return parts.length ? parts.join(' · ') : say(S, 'foldDefaults');
}

const focusable = (root) => root?.querySelector?.('select, input, textarea, button, [contenteditable="true"]')
    || null;

/**
 * One setting: its label, its control, its help, and a line for a finding.
 *
 * `ctx`: `{widgets, set(key, value, opts), path, step, type, readOnly,
 * referenceMap, openValuePicker({anchor, insert, path}), columns, services,
 * strings, describeContext}` — the panel builds it. Returns `{el, key, path,
 * setError(message, severity), focus(), caret(), restoreCaret(c), paths(),
 * fieldAt(path), destroy()}`.
 */
export function renderField({ key, spec = {}, required = false }, value, ctx) {
    const S = ctx.strings || createStrings();
    const path = ctx.path ? `${ctx.path}.${key}` : String(key);
    const title = titleOf(key, spec);
    const root = el('div', 'twm-flow-field');
    root.dataset.field = path;
    const labelId = uid('label');
    const errorId = uid('error');
    const helpId = uid('help');

    const labelCol = el('div', 'twm-flow-field__label');
    const label = el('label', 'twm-flow-field__name', title);
    label.id = labelId;
    labelCol.appendChild(label);
    if (required) {
        const mark = el('span', 'twm-flow-field__required', say(S, 'required'));
        mark.setAttribute('aria-label', say(S, 'requiredLabel'));
        labelCol.appendChild(mark);
    }
    const body = el('div', 'twm-flow-field__body');
    const error = el('p', 'twm-flow-field__error');
    error.id = errorId;
    error.hidden = true;
    const children = [];
    let control = null;
    const widgetName = spec['x-ui-widget'];
    const syntaxNames = spec['x-ui-references'] ?? DEFAULT_WIDGET_REFERENCES[widgetName] ?? [];
    const sub = {
        key, path, step: ctx.step ?? null, type: ctx.type ?? null, readOnly: Boolean(ctx.readOnly),
        label: title,
        references: resolveSyntaxes(syntaxNames, ctx.referenceMap),
        referenceMap: ctx.referenceMap,
        openValuePicker: ctx.openValuePicker
            ? ({ anchor, insert }) => ctx.openValuePicker({ anchor, insert, path, key })
            : null,
        columns: ctx.columns || (() => null),
        services: ctx.services,
        strings: S,
        describeContext: { ...(ctx.describeContext || {}), field: path },
        set: (v, opts) => ctx.set(key, v, opts),
    };

    if (widgetName !== undefined) {
        const make = ctx.widgets?.get?.(widgetName);
        if (make) {
            try {
                control = make(spec, value, sub);
            } catch (err) {
                control = { el: el('p', 'twm-flow-field__refusal', `${say(S, 'noControl')} (${err?.message || err})`) };
            }
        } else {
            // REFUSED BY NAME, and the stored value is kept: nothing here writes this key.
            control = { el: el('p', 'twm-flow-field__refusal', say(S, 'unknownWidget', widgetName)) };
            root.dataset.refusal = widgetName;
        }
    } else if (primaryType(spec) === 'object' && spec.properties && typeof spec.properties === 'object') {
        const group = el('details', 'twm-flow-field__group');
        group.open = !spec['x-ui-fold'];
        const summary = el('summary', 'twm-flow-field__summary');
        summary.appendChild(el('span', 'twm-flow-field__summary-text', foldSummary(spec, value, S)));
        group.appendChild(summary);
        const inner = { ...(value && typeof value === 'object' && !Array.isArray(value) ? value : {}) };
        const innerFields = fieldsFromSchema(spec);
        const repaintSummary = () => {
            summary.firstChild.textContent = foldSummary(spec, inner, S);
        };
        for (const f of visibleFields(innerFields, inner)) {
            const child = renderField(f, inner[f.key], {
                ...ctx, path,
                set: (k, v, opts) => {
                    if (v === undefined) delete inner[k]; else inner[k] = v;
                    repaintSummary();
                    ctx.set(key, Object.keys(inner).length ? { ...inner } : undefined,
                            { ...opts, reshape: opts?.reshape || whenKeys(innerFields).has(k) });
                },
            });
            children.push(child);
            group.appendChild(child.el);
        }
        control = { el: group };
        root.classList.add('twm-flow-field--group');
    } else {
        control = plainControl(spec, value, sub)
            || { el: el('p', 'twm-flow-field__refusal', say(S, 'noControl')) };
    }

    // Name the control by its label, and describe it by its help and its finding:
    // a box by `for`, a chip input inside its refbox and a group of rows or
    // choices by `aria-labelledby`.
    const target = control.el.matches?.('input, select, textarea') ? control.el : null;
    const labelled = target ? null
        : control.el.matches?.('[role="textbox"], [role="group"], [role="radiogroup"]') ? control.el
            : control.el.classList?.contains('twm-flow-refbox') ? control.el.querySelector('[role="textbox"]') : null;
    if (target) {
        target.id ||= uid('control');
        label.htmlFor = target.id;
        target.removeAttribute('aria-label');
    } else if (labelled) {
        labelled.setAttribute('aria-labelledby', labelId);
        labelled.removeAttribute('aria-label');
    }
    const describedBy = [errorId];
    body.appendChild(control.el);
    body.appendChild(error);
    if (spec.description) {
        const help = el('p', 'twm-flow-field__help', spec.description);
        help.id = helpId;
        body.appendChild(help);
        describedBy.push(helpId);
    }
    const described = target || labelled || control.el;
    described.setAttribute?.('aria-describedby', describedBy.join(' '));
    root.append(labelCol, body);

    return {
        el: root,
        key,
        path,
        control,
        setError(message, severity = 'error') {
            error.replaceChildren();
            if (message) {
                const glyph = el('span', 'material-symbols-outlined twm-flow-field__error-icon',
                                 severity === 'warning' ? 'warning' : 'error');
                glyph.setAttribute('aria-hidden', 'true');
                error.append(glyph, el('span', 'twm-flow-field__error-text', message));
            }
            error.hidden = !message;
            root.classList.toggle('twm-flow-field--error', Boolean(message) && severity !== 'warning');
            root.classList.toggle('twm-flow-field--warning', Boolean(message) && severity === 'warning');
            described.setAttribute?.('aria-invalid', message && severity !== 'warning' ? 'true' : 'false');
        },
        focus() {
            // A folded group holding this field opens, and so does this one.
            for (let d = root.parentElement?.closest('details'); d; d = d.parentElement?.closest('details')) d.open = true;
            if (control.el.tagName === 'DETAILS') control.el.open = true;
            if (typeof control.focus === 'function') { control.focus(); return true; }
            const f = target || focusable(control.el);
            if (f) { f.focus({ preventScroll: true }); return true; }
            return false;
        },
        caret: () => (typeof control.caret === 'function' ? control.caret() : null),
        restoreCaret: (c) => control.restoreCaret?.(c),
        /** Every field path this field draws, its own and its children's. */
        paths: () => [path, ...children.flatMap((c) => c.paths())],
        /** The field (this one or a child) drawn for exactly `p`. */
        fieldAt(p) {
            if (p === path) return this;
            for (const c of children) {
                const hit = c.fieldAt(p);
                if (hit) return hit;
            }
            return null;
        },
        destroy() {
            control.destroy?.();
            children.forEach((c) => c.destroy());
        },
    };
}
