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
 *     form.getValues();  form.setValues(next);  form.dispose();
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
 * So does a `type` with neither a built-in control nor a renderer.
 *
 * ══ AN EDIT ═════════════════════════════════════════════════════════════
 *
 * Every edit is checked by `validateField`. A valid one is applied and calls
 * `onChange(key, value, config)` with a copy of the whole config. An invalid one
 * shows its error under the field and is NOT applied: the config keeps the last
 * valid value until the field is corrected (or `setValues` replaces it).
 * `setValues` does not call `onChange`.
 *
 * ══ A CONSUMER'S CONTROL ════════════════════════════════════════════════
 *
 * `renderers[type](ctx)` — consulted before the built-ins, so it may also
 * replace one — gets `{field, key, value, data, readonly, commit}` and returns an
 * element, or `{element, setValue?(value), dispose?()}`. `commit(value)` runs
 * the same check as a built-in edit and answers `{valid, error?}`.
 *
 * ══ THE GRID'S COGWHEEL ═════════════════════════════════════════════════
 *
 * `TileGrid` emits `grid:config-modal-show` and nothing listens by default.
 * `openTileConfig(eventBus, opts)` is the opt-in listener: it shows the form in
 * a `SlideOutPanel` over `opts.host` (every valid edit is saved at once) or in a
 * modal (saved on Save). It answers a function that unsubscribes and closes.
 */

import {
    FieldTypes, validateField, mergeWithDefaults, getFieldOptions,
} from './config_schema.js';
import { SlideOutPanel } from '../ui/components/slide_out_panel.js';
import { openModal } from '../ui/components/modal.js';

let _seq = 0;

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
 * @returns {{getValues(): Object, setValues(config: Object): void, dispose(): void}}
 */
export function mountTileConfigForm(host, { schema, config = {}, data = null, onChange = null, renderers = {} } = {}) {
    if (!host) throw new TypeError('mountTileConfigForm: a host element is required');
    const fields = Array.isArray(schema?.fields) ? schema.fields : [];
    for (const f of fields) {
        if (typeof f?.key !== 'string' || !f.key) {
            throw new TypeError(`mountTileConfigForm: the field "${f?.label ?? f?.name ?? '?'}" has no key`);
        }
    }

    let values = mergeWithDefaults(config || {}, schema);
    const unlisten = [];   // listeners removed by dispose
    const root = el('div', 'fd-tile-config');
    const rows = [];   // {field, row, error, control}

    const showError = (r, message) => {
        r.error.textContent = message || '';
        r.error.hidden = !message;
        r.row.classList.toggle('fd-tile-config__row--invalid', !!message);
    };

    const applyVisibility = () => {
        for (const r of rows) r.row.hidden = !isVisible(r.field, values);
    };

    const commit = (r, raw) => {
        const result = validateField(raw, r.field);
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
        const label = el('label', 'fd-tile-config__label', field.label ?? field.key);
        label.htmlFor = id;
        const error = el('div', 'fd-tile-config__error');
        error.hidden = true;
        const r = { field, row, error, control: null };

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
            c.write(values[field.key]);
            const input = c.element.matches('input, select') ? c.element : c.element.querySelector('input, select');
            if (field.readonly) {
                input.disabled = true;
            } else {
                const onEdit = () => {
                    const raw = c.read();
                    c.shown?.(raw);
                    commit(r, raw);
                };
                for (const type of c.events) {
                    input.addEventListener(type, onEdit);
                    unlisten.push(() => input.removeEventListener(type, onEdit));
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
                r.control.write(values[r.field.key]);
                showError(r, null);
            }
            applyVisibility();
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
 * @param {{on: Function}} eventBus  The bus the `TileGrid` emits on.
 * @param {object}   [opts]
 * @param {'modal'|'slide-out'} [opts.mode='modal']  A modal saves on Save; a
 *   slide-out saves every valid edit as it is made.
 * @param {HTMLElement} [opts.host]  The slide-out's host (required for it).
 * @param {number}   [opts.width]    The slide-out's or the modal's width.
 * @param {Object}   [opts.renderers] Passed to `mountTileConfigForm`.
 * @param {string|Function} [opts.title='Tile settings']  Or `(detail) => string`.
 * @returns {() => void} Unsubscribes and closes whatever is open.
 */
export function openTileConfig(eventBus, { mode = 'modal', host = null, width, renderers = {}, title = 'Tile settings' } = {}) {
    if (typeof eventBus?.on !== 'function') throw new TypeError('openTileConfig: an event bus with on() is required');
    if (mode !== 'modal' && mode !== 'slide-out') throw new TypeError(`openTileConfig: unknown mode "${mode}"`);
    if (mode === 'slide-out' && !(host instanceof HTMLElement)) {
        throw new TypeError('openTileConfig: a slide-out needs a host element');
    }

    let form = null;
    let panel = null;
    const drop = () => { form?.dispose(); form = null; };

    const show = (detail = {}) => {
        drop();
        const heading = typeof title === 'function' ? title(detail) : title;
        const base = { schema: detail.schema, config: detail.config, data: detail.data ?? null, renderers };

        if (mode === 'slide-out') {
            if (!panel) {
                panel = new SlideOutPanel({ ...(width ? { width } : {}), onClose: drop });
                panel.mount(host);
            }
            const body = panel.open(heading, 'tune');
            form = mountTileConfigForm(body, { ...base, onChange: (_k, _v, cfg) => detail.onSave?.(cfg) });
            return;
        }

        // A modal owns the screen, so no second request arrives while it is
        // open; a form dropped by the returned dispose makes its Save a no-op.
        const content = el('div', 'fd-tile-config-host');
        const mine = mountTileConfigForm(content, base);
        form = mine;
        openModal({
            title: heading, icon: 'tune', content, ...(width ? { width } : {}),
            actions: [{ label: 'Cancel', value: null }, { label: 'Save', value: 'save', primary: true }],
        }).then((v) => {
            if (form !== mine) return;
            if (v === 'save') detail.onSave?.(mine.getValues());
            drop();
        });
    };

    const sub = eventBus.on('grid:config-modal-show', show);

    return () => {
        if (typeof sub === 'function') sub();
        else if (sub?.dispose) sub.dispose();
        else eventBus.off?.(sub);
        drop();
        panel?.dispose();
        panel = null;
    };
}
