/**
 * attribute_list_editor.js — generic AttributeSpec list editor.
 *
 * One reusable component for every entity that declares a typed-slot
 * list: Asset.attributes, Archetype.attributes, SectorKind.requires,
 * MarketKind.requires, Flow.params, KPI.params. Mounts a SortableList
 * (drag-reorder + add + remove + empty-state) with typed cells:
 *
 *   - scalar (number / integer / string / boolean): typed `<input>`
 *   - expression: free-text input — engine evaluates each tick
 *   - ref:<target>: typeahead-ish `<select>` populated by a caller-
 *     supplied resolver returning {id, label} lists
 *   - list[ref:<target>]: comma-separated input (UI primitive — chip
 *     editor can land later without changing the data shape)
 *   - select: dropdown of options (auto when `options[]` is set)
 *
 * Each row exposes the columns in `showColumns` (defaults to the full
 * set); callers narrow it (e.g. SectorKind.requires only needs name +
 * type + description, not default/value). Layout follows the column
 * spec — header strip aligned via CSS grid using --cols.
 *
 * Usage:
 *
 *   import { mountAttributeListEditor } from
 *     '../../ui/components/attribute_list_editor.js';
 *
 *   const editor = mountAttributeListEditor(hostEl, {
 *     items: kind.attributes,
 *     showColumns: ['name', 'type', 'default', 'value', 'description'],
 *     refResolvers: {
 *       'ref:asset': () => api.assets_list(),
 *     },
 *     onChange: (next) => { kind.attributes = next; save(); },
 *   });
 *   editor.refresh();  // call after `items` changes externally
 *   editor.dispose();  // teardown
 */

import { SortableList } from './sortable_list.js';

// The types a generic attribute editor knows about, with no application loaded.
//
// This used to also list nine EcoAgent entity kinds — asset_kind, market,
// sub_sector, currency, sector, market_kind, asset_kind_template, archetype,
// kpi — and derive `ref:<kind>` and `list[ref:<kind>]` from them. `types` was
// ALREADY an injectable option; it simply had EcoAgent's ontology as its
// default, which meant every consumer who didn't override it inherited a type
// dropdown full of macroeconomics.
//
// Callers who want reference types build them with refTypesFor() and pass them
// in, alongside the `refResolvers` that make them resolvable.
const SCALAR_TYPES = ['number', 'integer', 'string', 'boolean'];

const DEFAULT_TYPES = [...SCALAR_TYPES, 'expression'];

/** `['agent']` -> `['ref:agent', 'list[ref:agent]']`. */
export function refTypesFor(kinds = []) {
    return [
        ...kinds.map((k) => `ref:${k}`),
        ...kinds.map((k) => `list[ref:${k}]`),
    ];
}

export { SCALAR_TYPES, DEFAULT_TYPES };

const DEFAULT_COLUMNS = ['name', 'type', 'default', 'value', 'description'];

const COLUMN_TEMPLATES = {
    name:        { label: 'name',        width: 'minmax(140px, 1.2fr)' },
    type:        { label: 'type',        width: '140px' },
    default:     { label: 'default',     width: 'minmax(110px, 1fr)' },
    value:       { label: 'value',       width: 'minmax(110px, 1fr)' },
    description: { label: 'description', width: 'minmax(160px, 2fr)' },
    required:    { label: 'req',         width: '60px' },
    readonly:    { label: 'r/o',         width: '60px' },
    expression:  { label: 'expression',  width: 'minmax(160px, 2fr)' },
    // Layer N3 — extended AttributeSpec fields. Opt-in via showColumns
    // so existing single-table layouts (asset_kind editor) stay tight;
    // the agent params surface includes them.
    min:          { label: 'min',          width: '90px' },
    max:          { label: 'max',          width: '90px' },
    step:         { label: 'step',         width: '70px' },
    unit:         { label: 'unit',         width: '80px' },
    distribution: { label: 'dist',         width: '110px' },
    // Distribution and "selection set" are two different concepts —
    // numeric params sample from a continuous distribution (uniform /
    // normal / lognormal / …), choice params pick from a discrete
    // option set. Keep them in separate columns so the user can tell
    // which is which at a glance.
    choices:      { label: 'choices',      width: '130px' },
    // Variation-override flags — R7 in
    // docs/ARCHETYPE_RETHINK_REQUIREMENTS.md. Tight columns so they
    // stay readable next to the scalar fields.
    enabled:      { label: 'on',           width: '50px' },
    force:        { label: 'lock',         width: '50px' },
    optional:     { label: 'opt',          width: '50px' },
};

const DISTRIBUTION_OPTIONS = [
    '', 'constant', 'uniform', 'normal', 'lognormal', 'choice',
];


/** Classify one attribute against its parent-archetype counterpart.
 *  Layer 8.J1 inheritance display:
 *
 *    - 'inherited' — entity's effective value matches the archetype's
 *      default for the same attribute name. UI paints the row blue.
 *    - 'overridden' — entity's value is set AND differs from the
 *      archetype's default. UI paints the row solarized orange + shows
 *      a revert button.
 *    - 'neutral' — neither side declares a value (or there's no parent).
 *      UI paints the row in default style.
 */
function _classifyRow(row, parentByName) {
    if (!parentByName) return 'neutral';
    const p = parentByName.get(row.name);
    if (!p) return 'neutral';
    const ourValue    = (row.value !== undefined && row.value !== null)
                        ? row.value : row.default;
    const parentValue = (p.value !== undefined && p.value !== null)
                        ? p.value : p.default;
    if (ourValue === undefined || ourValue === null) return 'neutral';
    if (parentValue === undefined || parentValue === null) return 'overridden';
    // Loose equality: handles number vs numeric-string from form inputs.
    if (String(ourValue) === String(parentValue)) return 'inherited';
    return 'overridden';
}


export function mountAttributeListEditor(hostEl, options = {}) {
    const {
        items          = [],
        types          = DEFAULT_TYPES,
        showColumns    = DEFAULT_COLUMNS,
        refResolvers   = {},
        onChange       = () => {},
        onFlush        = () => {},
        addButtonText  = '',
        emptyMessage   = 'No entries yet.',
        containerId    = `attrs-${Math.random().toString(36).slice(2, 8)}`,
        allowReorder   = true,
        allowRemove    = true,
        // Layer 8.J1: parent-archetype attributes (the inherited baseline).
        // The editor uses this to classify each row as inherited / overridden /
        // neutral and to provide a revert action. Pass [] when no archetype
        // applies; the editor degrades gracefully (all rows render neutral).
        parentAttributes = null,
        createItem     = () => ({
            name: '', type: 'string', default: null,
            value: null, description: '',
        }),
        // Layer N3 — per-column renderer overrides. Callers can supply
        // `cellOverrides: {column_name: (item, callbacks, ctx) => HTMLElement | null}`
        // to swap in a custom cell. Returning `null` falls through to
        // the default renderer. The `ctx` object exposes:
        //    refreshRow()  — force a re-render (the wider list refreshes
        //                    when the row's items change, e.g. type swap).
        // Use cases: agent params' distribution-dict button cell;
        // structured-type modal openers on the default cell.
        cellOverrides  = null,
        // R7 — when true, this editor is mounted as a *variation* of the
        // parent archetype (not on the archetype itself). Rows where
        // the parent has `force=true` lock their editable cells; the
        // `enabled/force/optional` flag columns themselves stay
        // read-only (variations don't author flags, only the
        // archetype does).
        variationMode  = false,
    } = options;

    // Lookup map for inheritance classification.
    const parentByName = parentAttributes
        ? new Map(parentAttributes.map((p) => [p.name, p]))
        : null;

    if (!hostEl) {
        return { refresh() {}, addItem() {}, dispose() {} };
    }

    hostEl.classList.add('twm-attr-editor');
    hostEl.style.setProperty('--cols',
        showColumns.map((c) => COLUMN_TEMPLATES[c]?.width || '1fr').join(' '));

    const refsCache = new Map();
    const resolveRefOptions = async (target) => {
        if (refsCache.has(target)) return refsCache.get(target);
        const resolver = refResolvers[`ref:${target}`]
                      || refResolvers[`list[ref:${target}]`];
        let list = [];
        if (typeof resolver === 'function') {
            try { list = await resolver() || []; }
            catch (e) { console.warn('ref resolver failed', target, e); }
        }
        const normalised = (list || []).map((o) => {
            if (typeof o === 'string') return { id: o, label: o };
            return { id: o.id ?? o.value ?? '', label: o.label ?? o.id ?? '' };
        }).filter((o) => o.id);
        refsCache.set(target, normalised);
        return normalised;
    };

    // Header strip — mimics the SortableList row layout exactly so
    // header cells align with body cells. Row shape is:
    //   [drag-handle] [content-with-cols-grid] [remove-button]
    // The header reuses `.sortable-list__row` chrome with placeholder
    // spans for the handle / remove gutters, then the inner content
    // div carries the same `--cols` grid as each row's content div.
    const header = document.createElement('div');
    header.className = 'twm-sortable-list__row twm-attr-editor__header-row';
    if (allowReorder) {
        const handlePh = document.createElement('span');
        handlePh.className = 'twm-sortable-list__handle twm-attr-editor__header-placeholder';
        header.appendChild(handlePh);
    }
    const headerContent = document.createElement('div');
    headerContent.className = 'twm-sortable-list__content twm-attr-editor__headers';
    for (const col of showColumns) {
        const span = document.createElement('span');
        span.textContent = COLUMN_TEMPLATES[col]?.label ?? col;
        headerContent.appendChild(span);
    }
    header.appendChild(headerContent);
    if (allowRemove) {
        const removePh = document.createElement('span');
        removePh.className = 'twm-sortable-list__remove twm-attr-editor__header-placeholder';
        header.appendChild(removePh);
    }
    hostEl.appendChild(header);

    const listHost = document.createElement('div');
    listHost.className = 'ea-attr-editor__rows';
    hostEl.appendChild(listHost);

    let list = null;

    const renderRow = (contentEl, item, _idx, callbacks) => {
        contentEl.classList.add('twm-attr-editor__row');
        // Layer 8.J1 — paint inheritance state.
        const cls = _classifyRow(item, parentByName);
        contentEl.classList.remove(
            'twm-attr-editor__row--inherited',
            'twm-attr-editor__row--overridden',
            'twm-attr-editor__row--neutral',
        );
        contentEl.classList.add(`twm-attr-editor__row--${cls}`);

        // R7 variation-override flags. `enabled` defaults true, so the
        // disabled treatment only applies when explicitly false.
        // `force` locks the row (variations can't override). `optional`
        // signals the value is a suggestion — green border, no fill.
        // The flag rules are applied additively so the inheritance
        // classification's background still shows where applicable.
        // In variation mode the relevant flags are the parent's; in
        // archetype mode they're the row's own. (A variation row only
        // has the flags it inherited; it doesn't author its own.)
        const parentRow = parentByName?.get(item.name);
        const flagSource = variationMode && parentRow ? parentRow : item;
        contentEl.classList.toggle(
            'twm-attr-editor__row--disabled', flagSource.enabled === false);
        contentEl.classList.toggle(
            'twm-attr-editor__row--forced',   flagSource.force === true);
        contentEl.classList.toggle(
            'twm-attr-editor__row--optional', flagSource.optional === true);

        // Attention indicator on overridden rows + revert button.
        if (cls === 'overridden') {
            const attention = document.createElement('span');
            attention.className = 'twm-attr-editor__attention material-symbols-outlined';
            attention.textContent = 'fiber_manual_record';
            attention.title = 'Value overrides the parent default';
            contentEl.appendChild(attention);
        }

        for (const col of showColumns) {
            const cell = renderCell(col, item, callbacks);
            contentEl.appendChild(cell);
        }
        // R7 — lock the row's editable inputs when the parent forced it.
        // The flag columns themselves stay enabled on the archetype
        // (where the author sets them); in variation mode they're
        // read-only because variations don't author flags.
        const FLAG_COLS = new Set(['enabled', 'force', 'optional']);
        if (variationMode && flagSource.force === true) {
            contentEl.querySelectorAll(
                'input:not([type="checkbox"]), select, textarea'
            ).forEach((el) => { el.disabled = true; });
        }
        if (variationMode) {
            contentEl.querySelectorAll(
                'input[type="checkbox"].ea-attr-editor__cell--flag'
            ).forEach((el) => { el.disabled = true; });
        }
        void FLAG_COLS;  // referenced by future per-column handling

        // Revert button — only rendered for overridden rows. Resets
        // `value` back to the archetype's inherited default. The row
        // re-classifies as 'inherited' on the next render pass.
        if (cls === 'overridden' && parentByName) {
            const p = parentByName.get(item.name);
            const parentDefault = (p?.value !== undefined && p?.value !== null)
                ? p.value : p?.default;
            const revert = document.createElement('button');
            revert.type = 'button';
            revert.className = 'twm-attr-editor__revert material-symbols-outlined';
            revert.textContent = 'undo';
            revert.title =
                `Revert to inherited default (${parentDefault ?? '—'})`;
            revert.addEventListener('click', (e) => {
                e.stopPropagation();
                callbacks.update({ value: parentDefault });
                onFlush();
                // Force a re-render so the row re-classifies.
                list?.setItems(currentItems());
            });
            contentEl.appendChild(revert);
        }
    };

    const renderCell = (col, item, callbacks) => {
        // Caller override wins — used by agent_tab to inject the
        // distribution-dict button + structured-type modal openers.
        if (cellOverrides && typeof cellOverrides[col] === 'function') {
            const ctx = { refreshRow: () => list?.setItems(currentItems()) };
            const custom = cellOverrides[col](item, callbacks, ctx);
            if (custom) return custom;
        }
        if (col === 'name')        return renderTextCell(item, 'name', callbacks, 'attr_name');
        if (col === 'type')        return renderTypeCell(item, callbacks);
        if (col === 'description') return renderTextCell(item, 'description', callbacks, 'optional');
        if (col === 'required')    return renderBoolCell(item, 'required', callbacks);
        if (col === 'readonly')    return renderBoolCell(item, 'readonly', callbacks);
        // R7 — three variation-override flags. `enabled` defaults true,
        // so the checkbox renders checked when the field is undefined;
        // the others default false.
        if (col === 'enabled')     return renderFlagCell(item, 'enabled',  callbacks, true);
        if (col === 'force')       return renderFlagCell(item, 'force',    callbacks, false);
        if (col === 'optional')    return renderFlagCell(item, 'optional', callbacks, false);
        if (col === 'expression')  return renderTextCell(item, 'expression', callbacks, 'expr');
        if (col === 'min')         return renderNumericCell(item, 'min', callbacks);
        if (col === 'max')         return renderNumericCell(item, 'max', callbacks);
        if (col === 'step')        return renderTextCell(item, 'step', callbacks, 'any');
        if (col === 'unit')        return renderTextCell(item, 'unit', callbacks, 'USD/%/…');
        if (col === 'distribution') return renderDistributionCell(item, callbacks);
        if (col === 'default' || col === 'value') return renderTypedValueCell(col, item, callbacks);
        // Unknown column — render a stub.
        const stub = document.createElement('span');
        stub.textContent = '';
        return stub;
    };

    const renderNumericCell = (item, field, callbacks) => {
        const el = document.createElement('input');
        el.type = 'number';
        el.className = 'twm-sortable-list__input twm-attr-editor__cell';
        el.step = 'any';
        el.value = (item[field] === null || item[field] === undefined)
            ? '' : String(item[field]);
        el.placeholder = '—';
        el.addEventListener('input', () => {
            const v = el.value === '' ? null : Number(el.value);
            callbacks.update({ [field]: v });
        });
        el.addEventListener('blur', () => onFlush());
        return el;
    };

    const renderDistributionCell = (item, callbacks) => {
        const el = document.createElement('select');
        el.className = 'twm-attr-editor__cell';
        for (const d of DISTRIBUTION_OPTIONS) {
            const o = document.createElement('option');
            o.value = d; o.textContent = d || '(none)';
            if ((item.distribution || '') === d) o.selected = true;
            el.appendChild(o);
        }
        el.addEventListener('change', () => {
            callbacks.update({ distribution: el.value || null });
            onFlush();
        });
        return el;
    };

    const renderTextCell = (item, field, callbacks, placeholder) => {
        const el = document.createElement('input');
        el.type = 'text';
        el.className = 'twm-sortable-list__input twm-attr-editor__cell';
        el.value = item[field] ?? '';
        el.placeholder = placeholder;
        el.addEventListener('input', () => {
            callbacks.update({ [field]: el.value });
        });
        el.addEventListener('blur', () => onFlush());
        return el;
    };

    const renderBoolCell = (item, field, callbacks) => {
        const el = document.createElement('input');
        el.type = 'checkbox';
        el.className = 'twm-attr-editor__cell';
        el.checked = !!item[field];
        el.addEventListener('change', () => {
            callbacks.update({ [field]: el.checked });
            onFlush();
        });
        return el;
    };

    /** Boolean cell for R7 flags. Same as renderBoolCell but treats an
     *  undefined value as `defaultIfMissing`, so `enabled` (default
     *  true) renders checked on legacy rows that predate the flag. */
    const renderFlagCell = (item, field, callbacks, defaultIfMissing) => {
        const el = document.createElement('input');
        el.type = 'checkbox';
        el.className = 'twm-attr-editor__cell ea-attr-editor__cell--flag';
        const cur = item[field];
        el.checked = (cur === undefined || cur === null)
            ? !!defaultIfMissing : !!cur;
        el.addEventListener('change', () => {
            callbacks.update({ [field]: el.checked });
            onFlush();
        });
        return el;
    };

    const renderTypeCell = (item, callbacks) => {
        const el = document.createElement('select');
        el.className = 'twm-attr-editor__cell';
        // Group scalar, expression, ref, list[ref] for readability.
        // Any type the caller hands us that doesn't fit one of those
        // buckets lands in `other` — that's how param-mode types
        // (float / int / str / bool / choice / map / schedule /
        // string_list) appear without breaking the dispatch.
        const seen = new Set();
        const addOpts = (label, optList) => {
            if (optList.length === 0) return;
            const grp = document.createElement('optgroup');
            grp.label = label;
            for (const t of optList) {
                const o = document.createElement('option');
                o.value = t; o.textContent = t;
                if (t === item.type) o.selected = true;
                grp.appendChild(o);
                seen.add(t);
            }
            el.appendChild(grp);
        };
        addOpts('scalar', types.filter((t) => SCALAR_TYPES.includes(t)));
        addOpts('expression', types.filter((t) => t === 'expression'));
        addOpts('typed reference', types.filter((t) => t.startsWith('ref:')));
        addOpts('list of references',
                types.filter((t) => t.startsWith('list[ref:')));
        addOpts('other', types.filter((t) => !seen.has(t)));
        el.addEventListener('change', () => {
            // On type change, leave default/value as-is — the user
            // may want to keep e.g. a numeric value when switching
            // from number to integer. The typed value cell renderer
            // coerces on display.
            callbacks.update({ type: el.value });
            onFlush();
            // Force re-render so the value cell picks up the new
            // input type (number → select, etc.).
            list?.setItems(currentItems());
        });
        return el;
    };

    const renderTypedValueCell = (field, item, callbacks) => {
        const t = item.type || 'string';
        if (t === 'boolean') {
            return renderBoolCell(item, field, callbacks);
        }
        if (t === 'integer' || t === 'number') {
            const el = document.createElement('input');
            el.type = 'number';
            el.className = 'twm-sortable-list__input twm-attr-editor__cell';
            el.step = (t === 'integer') ? '1' : 'any';
            el.value = (item[field] === null || item[field] === undefined)
                ? '' : item[field];
            el.placeholder = field;
            el.addEventListener('input', () => {
                const v = el.value === '' ? null
                        : (t === 'integer' ? parseInt(el.value, 10)
                                           : Number(el.value));
                callbacks.update({ [field]: v });
            });
            el.addEventListener('blur', () => onFlush());
            return el;
        }
        if (t === 'expression') {
            // For an expression-typed attribute, the value cell shows
            // the expression itself (read-only by convention — the
            // engine fills it). Stub: render the expression string;
            // the actual expression authoring lives in the
            // `expression` column when shown.
            const el = document.createElement('span');
            el.className = 'twm-attr-editor__cell twm-attr-editor__cell--readonly';
            el.textContent = item.expression
                ? `→ ${item.expression}` : '— (engine-evaluated)';
            return el;
        }
        if (t.startsWith('ref:')) {
            return renderRefCell(t.slice(4), field, item, callbacks);
        }
        if (t.startsWith('list[ref:') && t.endsWith(']')) {
            return renderListRefCell(t.slice(9, -1), field, item, callbacks);
        }
        if (Array.isArray(item.options) && item.options.length > 0) {
            return renderEnumCell(item.options, field, item, callbacks);
        }
        // String fallback.
        const el = document.createElement('input');
        el.type = 'text';
        el.className = 'twm-sortable-list__input twm-attr-editor__cell';
        el.value = item[field] ?? '';
        el.placeholder = field;
        el.addEventListener('input', () => {
            callbacks.update({ [field]: el.value });
        });
        el.addEventListener('blur', () => onFlush());
        return el;
    };

    const renderRefCell = (target, field, item, callbacks) => {
        const el = document.createElement('select');
        el.className = 'twm-attr-editor__cell';
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = `— pick ${target} —`;
        el.appendChild(placeholder);
        // Render once with the cached options if we have them; resolve
        // async otherwise and patch.
        const populate = (opts) => {
            // Clear everything except the placeholder.
            while (el.childNodes.length > 1) el.removeChild(el.lastChild);
            for (const o of opts) {
                const node = document.createElement('option');
                node.value = o.id;
                node.textContent = o.label;
                if (o.id === item[field]) node.selected = true;
                el.appendChild(node);
            }
        };
        if (refsCache.has(target)) {
            populate(refsCache.get(target));
        } else {
            resolveRefOptions(target).then(populate);
        }
        el.addEventListener('change', () => {
            callbacks.update({ [field]: el.value || null });
            onFlush();
        });
        return el;
    };

    const renderListRefCell = (target, field, item, callbacks) => {
        // MVP: comma-separated text input over the underlying string-
        // list. The chip-style picker can replace this without
        // changing the on-disk shape.
        const el = document.createElement('input');
        el.type = 'text';
        el.className = 'twm-sortable-list__input twm-attr-editor__cell';
        const arr = Array.isArray(item[field]) ? item[field] : [];
        el.value = arr.join(', ');
        el.placeholder = `${target}, ${target}, …`;
        el.addEventListener('input', () => {
            const next = el.value.split(',')
                .map((s) => s.trim()).filter(Boolean);
            callbacks.update({ [field]: next });
        });
        el.addEventListener('blur', () => onFlush());
        return el;
    };

    const renderEnumCell = (options, field, item, callbacks) => {
        // `options` may be either a flat list of strings (legacy:
        // `['fx', 'commodity', …]`) or a list of `{value, label}`
        // pairs (newer callers that want display labels distinct from
        // the stored value, e.g. market-rules ref fields where the
        // value is a currency id and the label is the currency name).
        const el = document.createElement('select');
        el.className = 'twm-attr-editor__cell';
        // Empty placeholder so the user can clear the selection.
        const blank = document.createElement('option');
        blank.value = '';
        blank.textContent = '—';
        if (item[field] === null || item[field] === undefined || item[field] === '') {
            blank.selected = true;
        }
        el.appendChild(blank);
        for (const opt of options) {
            const o = document.createElement('option');
            if (opt !== null && typeof opt === 'object') {
                o.value = String(opt.value ?? opt.id ?? '');
                o.textContent = String(opt.label ?? opt.value ?? opt.id ?? '');
            } else {
                o.value = String(opt);
                o.textContent = String(opt);
            }
            if (o.value === String(item[field] ?? '')) o.selected = true;
            el.appendChild(o);
        }
        el.addEventListener('change', () => {
            callbacks.update({ [field]: el.value === '' ? null : el.value });
            onFlush();
        });
        return el;
    };

    // ─── SortableList wiring ────────────────────────────────────────

    const itemsCopy = (src) => (src || []).map((it) => ({ ...it }));
    const currentItems = () => list?.getItems?.() || itemsCopy(items);

    const buildList = (current) => {
        try { list?.dispose?.(); } catch {}
        listHost.innerHTML = '';
        list = new SortableList({
            containerId,
            items: itemsCopy(current),
            allowReorder,
            allowRemove,
            minItems: 0,
            emptyMessage,
            addButtonText,
            createItem,
            renderItem: renderRow,
            onChange: (next) => onChange(next.map((it) => ({ ...it }))),
        });
        listHost.appendChild(list.render());
    };

    buildList(items);

    return {
        addItem() { list?.addItem(); },
        refresh(nextItems) {
            // External update: rebuild to pick up new type-cell shapes.
            // Cheaper than setItems when types changed; setItems
            // wouldn't re-render the row controls.
            buildList(nextItems !== undefined ? nextItems : currentItems());
        },
        items() {
            return currentItems();
        },
        dispose() {
            try { list?.dispose?.(); } catch {}
            list = null;
            hostEl.innerHTML = '';
            hostEl.classList.remove('twm-attr-editor');
        },
    };
}
