/**
 * tile_config_form.js — a tile's config schema drawn as a form (0.17.0).
 *
 * `TileBase.getConfigSchema()` answers `{fields: [...]}` and `config_schema.js`
 * knows how to validate, default and list options for those fields. This draws
 * them, so an embedder no longer hand-builds a control per field:
 *
 *     import { mountTileConfigForm } from '@flexdesk/tiles';
 *     const form = mountTileConfigForm(host, {
 *         schema: tile.getConfigSchema(),
 *         config: tile.config,
 *         data,                                  // for `options: 'variables'` and the like
 *         onChange: (key, value, config) => tile.update(undefined, config),
 *         renderers: { variable: (ctx) => myPicker(ctx) },
 *     });
 *     form.getValues();  form.setValues(next);  form.isValid();
 *     form.focusFirstInvalid();  form.flush();  form.dispose();
 *
 * ══ A FIELD ═════════════════════════════════════════════════════════════
 *
 *   { key, type, label?, description?, default?, required?, readonly?,
 *     min?, max?, step?, options?, visibleWhen? }
 *
 * `type` is a `FieldTypes` entry (text, number, checkbox, select, multiselect,
 * color, range) or a type a consumer renders through `renderers`. `options` is
 * what `getFieldOptions(field, data)` reads. `visibleWhen` is
 * `{field, in: [...]}` or `{field, equals}`: the row is hidden while the other
 * field's value does not match, and shown again when it does — by toggling the
 * row, never by rebuilding the form, so the control being typed into keeps its
 * focus and its caret.
 *
 * A field with no `key` throws: a form that wrote every edit to
 * `config['undefined']` was BUG-0021, and a loud mount is the cheaper failure.
 * So does a `type` with neither a built-in control nor a renderer. `label` is
 * optional: without one the field is called by its `key`, on its label and in
 * every message (`count must be at least 1`).
 *
 * ══ AN EDIT ═════════════════════════════════════════════════════════════
 *
 * Every edit is checked by `validateField`. A valid one is applied and calls
 * `onChange(key, value, config)` with a copy of the whole config. An invalid one
 * shows its error under the field and is NOT applied: the config keeps the last
 * valid value until the field is corrected (or `setValues` replaces it).
 * `setValues` does not call `onChange`. `isValid()` answers false while a
 * shown row has an error; `focusFirstInvalid()` focuses the first such row's
 * control (a renderer's element, or the first focusable element inside it) and
 * answers whether there was one.
 *
 * `commitOn: 'input'` (the default) checks text, number, range and colour
 * controls on every keystroke. `commitOn: 'change'` checks them when the edit is
 * finished (the control's `change`: blur, Enter, a released slider), for a
 * consumer whose `onChange` is expensive — a save, a reload. A range still shows
 * its value as it moves. `flush()` commits an edit typed but not yet finished,
 * for a consumer about to take the form away; it is a no-op under `'input'`.
 *
 * ══ A CONSUMER'S CONTROL ════════════════════════════════════════════════
 *
 * `renderers[type](ctx)` — consulted before the built-ins, so it may also
 * replace one — gets `{field, key, value, data, readonly, commit}` and returns an
 * element, or `{element, setValue?(value), dispose?()}`. `commit(value)` runs
 * the same check as a built-in edit and answers `{valid, error?}`. On a
 * `readonly` field it applies nothing and answers `{valid: false, error}`, as a
 * built-in control on a readonly field is disabled and never commits.
 *
 * ══ THE GRID'S COGWHEEL ═════════════════════════════════════════════════
 *
 * `TileGrid` emits `grid:config-modal-show` and nothing listens by default.
 * `openTileConfig(eventBus, opts)` is the opt-in listener: it shows the form in
 * a `SlideOutPanel` over `opts.host` (every finished, valid edit is saved — the
 * form runs `commitOn: 'change'`, so a typed title is one save, not one per
 * keystroke; closing the panel saves an edit still being typed) or in a modal
 * (saved on Save, which is refused while a field shows an error: the modal
 * stays open and the first invalid field gets the focus). A request that arrives while a modal is open is
 * ignored: the open modal is the one being answered. It answers a function that
 * unsubscribes; it also closes the slide-out, but leaves an open modal alone —
 * that modal stays working (its Save still saves) until the user dismisses it.
 */

import {
    FieldTypes, validateField, mergeWithDefaults, getFieldOptions,
} from './config_schema.js';
import { SlideOutPanel } from '../ui/components/slide_out_panel.js';
import { openModal } from '../ui/components/modal.js';

let _seq = 0;
// What focusFirstInvalid may focus inside a renderer's element.
const FOCUSABLE = 'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), '
    + 'button:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

function el(tag, className, text) {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (text != null) n.textContent = String(text);
    return n;
}

function isVisible(field, values) {
    const rule = field.visibleWhen;
    if (!rule) return true;
    const v = values[rule.field];
    if (Array.isArray(rule.in)) return rule.in.includes(v);
    if ('equals' in rule) return v === rule.equals;
    return true;
}

/** Built-in controls: each answers `{element, read(), write(value)}`. */
const BUILT_IN = {
    [FieldTypes.TEXT]: (field, id) => {
        const input = el('input', 'fd-tile-config__input');
        input.type = 'text';
        input.id = id;
        return {
            element: input, events: ['input'],
            read: () => input.value,
            write: (v) => { input.value = v == null ? '' : String(v); },
        };
    },
    [FieldTypes.NUMBER]: (field, id) => numeric(field, id, 'number'),
    [FieldTypes.RANGE]: (field, id) => numeric(field, id, 'range'),
    [FieldTypes.CHECKBOX]: (field, id) => {
        const input = el('input', 'fd-tile-config__checkbox');
        input.type = 'checkbox';
        input.id = id;
        return {
            element: input, events: ['change'],
            read: () => input.checked,
            write: (v) => { input.checked = !!v; },
        };
    },
    [FieldTypes.COLOR]: (field, id) => {
        const input = el('input', 'fd-tile-config__color');
        input.type = 'color';
        input.id = id;
        return {
            element: input, events: ['input'],
            read: () => input.value,
            write: (v) => { if (v) input.value = String(v); },
        };
    },
    [FieldTypes.SELECT]: (field, id, data) => choice(field, id, data, false),
    [FieldTypes.MULTISELECT]: (field, id, data) => choice(field, id, data, true),
};

function numeric(field, id, kind) {
    const input = el('input', `fd-tile-config__${kind === 'range' ? 'range' : 'input'}`);
    input.type = kind;
    input.id = id;
    if (field.min != null) input.min = String(field.min);
    if (field.max != null) input.max = String(field.max);
    if (field.step != null) input.step = String(field.step);
    const out = kind === 'range' ? el('output', 'fd-tile-config__range-value') : null;
    const element = out ? el('span', 'fd-tile-config__range-wrap') : input;
    if (out) element.append(input, out);
    return {
        element, events: ['input'],
        // The raw text goes to `validateField`; the form turns it into a number.
        read: () => input.value,
        write: (v) => {
            input.value = v == null ? '' : String(v);
            if (out) out.textContent = input.value;
        },
        shown: (v) => { if (out) out.textContent = v == null ? '' : String(v); },
    };
}

function choice(field, id, data, multiple) {
    const select = el('select', 'fd-tile-config__select');
    select.id = id;
    select.multiple = multiple;
    // Option values keep their type (a number stays a number) — they are read
    // back from this array by index, never from the element's string value.
    const options = getFieldOptions(field, data);
    options.forEach((o) => select.append(el('option', null, o.label ?? o.value)));
    return {
        element: select, events: ['change'],
        read: () => (multiple
            ? options.filter((_, i) => select.options[i].selected).map((o) => o.value)
            : (options[select.selectedIndex]?.value ?? null)),
        write: (v) => {
            if (multiple) {
                const want = Array.isArray(v) ? v : [];
                options.forEach((o, i) => { select.options[i].selected = want.includes(o.value); });
            } else {
                select.selectedIndex = options.findIndex((o) => o.value === v);
            }
        },
    };
}

/** Number and range read as text; an empty one is null. */
function coerce(field, raw) {
    if (field.type === FieldTypes.NUMBER || field.type === FieldTypes.RANGE) {
        return raw === '' || raw == null ? null : Number(raw);
    }
    return raw;
}

/**
 * Draw `schema.fields` into `host`.
 * @param {'input'|'change'} [opts.commitOn='input']  When a text, number, range
 *   or colour control is checked and committed: on every keystroke, or once the
 *   edit is finished.
 * @returns {{getValues(): Object, setValues(config: Object): void,
 *   isValid(): boolean, flush(): void, dispose(): void}}
 */
export function mountTileConfigForm(host, {
    schema, config = {}, data = null, onChange = null, renderers = {}, commitOn = 'input',
} = {}) {
    if (!host) throw new TypeError('mountTileConfigForm: a host element is required');
    if (commitOn !== 'input' && commitOn !== 'change') {
        throw new TypeError(`mountTileConfigForm: unknown commitOn "${commitOn}"`);
    }
    const fields = Array.isArray(schema?.fields) ? schema.fields : [];
    fields.forEach((f, i) => {
        if (typeof f?.key !== 'string' || !f.key) {
            const called = typeof f?.label === 'string' && f.label ? ` "${f.label}"` : '';
            throw new TypeError(`mountTileConfigForm: field #${i + 1}${called} has no key`);
        }
    });

    let values = mergeWithDefaults(config || {}, schema);
    const unlisten = [];   // listeners removed by dispose
    const root = el('div', 'fd-tile-config');
    const rows = [];   // {field, named, row, error, control, invalid, pending}

    const showError = (r, message) => {
        r.invalid = !!message;
        r.error.textContent = message || '';
        r.error.hidden = !message;
        r.row.classList.toggle('fd-tile-config__row--invalid', !!message);
    };

    const applyVisibility = () => {
        for (const r of rows) r.row.hidden = !isVisible(r.field, values);
    };

    const commit = (r, raw) => {
        if (r.field.readonly) return { valid: false, error: `${r.named.label} is read-only` };
        const result = validateField(raw, r.named);
        if (!result.valid) {
            showError(r, result.error);
            return { valid: false, error: result.error };
        }
        showError(r, null);
        const value = coerce(r.field, raw);
        values = { ...values, [r.field.key]: value };
        applyVisibility();
        onChange?.(r.field.key, value, { ...values });
        return { valid: true };
    };

    for (const field of fields) {
        const id = `fd-tile-config-${++_seq}`;
        const row = el('div', `fd-tile-config__row fd-tile-config__row--${field.type}`);
        row.setAttribute('data-field', field.key);
        // What validateField and the messages read: the label, or the key.
        const named = { ...field, label: field.label ?? field.key };
        const label = el('label', 'fd-tile-config__label', named.label);
        const error = el('div', 'fd-tile-config__error');
        error.hidden = true;
        const r = { field, named, row, error, control: null, invalid: false, pending: null };

        const custom = renderers?.[field.type];
        if (typeof custom === 'function') {
            const made = custom({
                field, key: field.key, value: values[field.key], data,
                readonly: !!field.readonly, commit: (v) => commit(r, v),
            });
            const element = made instanceof HTMLElement ? made : made?.element;
            if (!(element instanceof HTMLElement)) {
                throw new TypeError(`mountTileConfigForm: the renderer for "${field.type}" returned no element`);
            }
            element.id ||= id;
            // The id the control carries: a renderer may have set its own.
            label.htmlFor = element.id;
            r.control = {
                element,
                write: made instanceof HTMLElement ? () => {} : (v) => made.setValue?.(v),
                dispose: made instanceof HTMLElement ? null : () => made.dispose?.(),
            };
        } else {
            const build = BUILT_IN[field.type];
            if (!build) {
                throw new TypeError(`mountTileConfigForm: no control for type "${field.type}" (field "${field.key}"); pass a renderer`);
            }
            const c = build(field, id, data);
            label.htmlFor = id;
            c.write(values[field.key]);
            const input = c.element.matches('input, select') ? c.element : c.element.querySelector('input, select');
            if (field.readonly) {
                input.disabled = true;
            } else {
                const listen = (type, fn) => {
                    input.addEventListener(type, fn);
                    unlisten.push(() => input.removeEventListener(type, fn));
                };
                const onEdit = () => {
                    r.pending = null;
                    const raw = c.read();
                    c.shown?.(raw);
                    commit(r, raw);
                };
                if (commitOn === 'change') {
                    // Checked once the edit is finished; until then it is
                    // pending, so flush() can still commit it.
                    listen('change', onEdit);
                    if (c.events.includes('input')) {
                        listen('input', () => { r.pending = onEdit; c.shown?.(c.read()); });
                    }
                } else {
                    for (const type of c.events) listen(type, onEdit);
                }
            }
            r.control = c;
        }

        if (field.type === FieldTypes.CHECKBOX) row.append(r.control.element, label);
        else row.append(label, r.control.element);
        if (field.description) row.append(el('div', 'fd-tile-config__help', field.description));
        row.append(error);
        rows.push(r);
        root.append(row);
    }

    applyVisibility();
    host.append(root);

    return {
        getValues: () => ({ ...values }),
        setValues(next) {
            values = mergeWithDefaults(next || {}, schema);
            for (const r of rows) {
                r.pending = null;
                r.control.write(values[r.field.key]);
                showError(r, null);
            }
            applyVisibility();
        },
        isValid: () => rows.every((r) => r.row.hidden || !r.invalid),
        focusFirstInvalid() {
            const r = rows.find((x) => !x.row.hidden && x.invalid);
            if (!r) return false;
            const { element } = r.control;
            const target = element.matches(FOCUSABLE) ? element : element.querySelector(FOCUSABLE);
            (target || element).focus();
            return true;
        },
        flush() {
            for (const r of rows) r.pending?.();
        },
        dispose() {
            unlisten.splice(0).forEach((off) => off());
            for (const r of rows) {
                try { r.control.dispose?.(); } catch (err) { console.warn('[tile-config] a renderer dispose threw', err); }
            }
            rows.length = 0;
            root.remove();
        },
    };
}

/**
 * Show `grid:config-modal-show` requests as a config form.
 *
 * @param {{on(name: string, handler: Function): {dispose(): void}}} eventBus
 *   The `EventBus` the `TileGrid` emits on.
 * @param {object}   [opts]
 * @param {'modal'|'slide-out'} [opts.mode='modal']  A modal saves on Save, and
 *   refuses Save while a field shows an error; a slide-out saves every
 *   finished, valid edit (`commitOn: 'change'`).
 * @param {HTMLElement} [opts.host]  The slide-out's host (required for it).
 * @param {number}   [opts.width]    The slide-out's or the modal's width.
 * @param {Object}   [opts.renderers] Passed to `mountTileConfigForm`.
 * @param {string|Function} [opts.title='Tile settings']  Or `(detail) => string`.
 * @returns {() => void} Unsubscribes and closes the slide-out. An open modal is
 *   left to the user: it keeps its form, and its Save still calls `onSave`.
 */
export function openTileConfig(eventBus, { mode = 'modal', host = null, width, renderers = {}, title = 'Tile settings' } = {}) {
    if (typeof eventBus?.on !== 'function') throw new TypeError('openTileConfig: an event bus with on() is required');
    if (mode !== 'modal' && mode !== 'slide-out') throw new TypeError(`openTileConfig: unknown mode "${mode}"`);
    if (mode === 'slide-out' && !(host instanceof HTMLElement)) {
        throw new TypeError('openTileConfig: a slide-out needs a host element');
    }

    let form = null;    // the slide-out's form
    let panel = null;
    let modalOpen = false;
    // An edit still being typed when the panel goes is saved, not lost.
    const drop = () => { form?.flush(); form?.dispose(); form = null; };

    const show = (detail = {}) => {
        if (modalOpen) return;
        const heading = typeof title === 'function' ? title(detail) : title;
        const base = { schema: detail.schema, config: detail.config, data: detail.data ?? null, renderers };

        if (mode === 'slide-out') {
            drop();
            if (!panel) {
                panel = new SlideOutPanel({ ...(width ? { width } : {}), onClose: drop });
                panel.mount(host);
            }
            const body = panel.open(heading, 'tune');
            form = mountTileConfigForm(body, {
                ...base, commitOn: 'change', onChange: (_k, _v, cfg) => detail.onSave?.(cfg),
            });
            return;
        }

        // The modal's form lives until the user dismisses the modal, whatever
        // else happens meanwhile: requests are ignored while it is open, and
        // the returned function leaves it alone.
        const content = el('div', 'fd-tile-config-host');
        const mine = mountTileConfigForm(content, base);
        modalOpen = true;
        openModal({
            title: heading, icon: 'tune', content, ...(width ? { width } : {}),
            actions: [
                { label: 'Cancel', value: null },
                // Refused while a field shows an error: its last valid value is
                // not what the user is looking at, so saving it would be a lie.
                { label: 'Save', value: 'save', primary: true, keepOpen: true, onClick: (close) => {
                    if (mine.isValid()) { close('save'); return; }
                    mine.focusFirstInvalid();
                } },
            ],
        }).then((v) => {
            modalOpen = false;
            if (v === 'save') detail.onSave?.(mine.getValues());
            mine.dispose();
        });
    };

    const sub = eventBus.on('grid:config-modal-show', show);

    return () => {
        sub.dispose();
        drop();
        panel?.dispose();
        panel = null;
    };
}
