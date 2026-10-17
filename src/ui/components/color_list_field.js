/**
 * ColorListField — an ordered list of colours: add, remove, and reorder by
 * the grip (drag) or the up / down buttons, each row a `ColorField`.
 *
 *   const list = new ColorListField({
 *       value: ['#1f77b4', 'rgb(255, 127, 14)'],
 *       onChange: (colors, { commit }) => { ... },
 *   });
 *   host.appendChild(list.render());
 *   list.getValue();             // ['#1f77b4', '#ff7f0e'] — or null, see below
 *
 * The list is a `SortableList` (the same add / remove / drag-reorder every
 * list in the library uses) whose rows render a `ColorField` and a pair of
 * move buttons, so the order can be changed without a pointer.
 *
 * `getValue()` is the colours in their current order as lowercase `#rrggbb`,
 * or `null` while any row holds something that is not a hex colour —
 * `invalidIndexes()` says which. Empty rows count as invalid: a list entry
 * with no colour is not a colour.
 *
 * Given a `name`, the list also carries a hidden `<input name>` whose value is
 * the rows as JSON, and fires `input` on it for every edit and `change` for
 * every committed one (a row's `change`, add, remove, move). That is the
 * surface a host form listens on; `openForm` reads the list through
 * `getValue()`, not through that input.
 */

import { SortableList } from './sortable_list.js';
import { ColorField, isHexColor, normalizeHex } from './color_field.js';

let _seq = 0;

/** A row's text as `#rrggbb`, or null when it is not a hex colour. */
const hexOf = (text) => {
    const t = String(text ?? '').trim();
    return isHexColor(t) ? normalizeHex(t) : null;
};

export class ColorListField {
    /**
     * @param {Object}   [o]
     * @param {string[]} [o.value]     initial colours (hex or rgb())
     * @param {string[]} [o.presets]   preset colours offered on every row
     * @param {string}   [o.newColor]  colour a newly added row starts on
     * @param {string}   [o.addLabel]  text of the add button
     * @param {string}   [o.name]      `name` of the hidden input, for a host form
     * @param {Function} [o.onChange]  `(colors, { commit })`, colors as `getValue()`
     */
    constructor({
        value = [], presets = [], newColor = '#000000', addLabel = 'Add colour',
        name = null, onChange = null,
    } = {}) {
        this.presets = Array.isArray(presets) ? presets : [];
        this.newColor = newColor;
        this.addLabel = addLabel;
        this.name = name;
        this.onChange = typeof onChange === 'function' ? onChange : null;

        /** Row index -> its ColorField; always exactly the rendered rows. */
        this._fields = [];
        /** Whether the SortableList change being reported is a committed one. */
        this._commit = true;
        /** True while a row's own edit is written into the list's items. */
        this._rowEdit = false;
        this.list = new SortableList({
            items: this.#toItems(value),
            addButtonText: addLabel,
            emptyMessage: 'No colours',
            createItem: () => ({ id: ++_seq, text: this.newColor }),
            renderItem: (container, item, index, callbacks) =>
                this.#renderRow(container, item, index, callbacks),
            // Every SortableList change but a row's own edit (add, remove,
            // move, drag) is followed by a refresh that rebuilds all rows —
            // down to none — so the old fields go first.
            onChange: () => {
                if (!this._rowEdit) this.#dropFields();
                this.#emit(this._commit);
            },
        });
        this.root = null;
        this.input = null;
    }

    render() {
        if (this.root) return this.root;
        const root = document.createElement('div');
        root.className = 'twm-color-list';
        if (this.name) {
            const input = document.createElement('input');
            input.type = 'hidden';
            input.name = this.name;
            root.appendChild(input);
            this.input = input;
        }
        root.appendChild(this.list.render());
        this.root = root;
        this.#writeInput();
        return root;
    }

    /** The colours in order as `#rrggbb`, or null while any row is not one. */
    getValue() {
        const out = this.getTexts().map(hexOf);
        return out.includes(null) ? null : out;
    }

    /** The rows' text as it stands, valid or not. */
    getTexts() {
        return this.list.getItems().map((item) => String(item.text ?? ''));
    }

    /** Indexes of the rows that do not hold a hex colour. */
    invalidIndexes() {
        const bad = [];
        this.getTexts().forEach((text, i) => { if (!hexOf(text)) bad.push(i); });
        return bad;
    }

    /** Replace the colours without firing `onChange`. */
    setValue(colors) {
        this.#dropFields();
        this.list.setItems(this.#toItems(colors));
        this.#writeInput();
    }

    /** Focus the first invalid row, else the first row, else the add button. */
    focus() {
        const bad = this.invalidIndexes()[0];
        const field = this._fields[bad ?? 0];
        if (field) { field.focus(); return; }
        this.root?.querySelector('.twm-sortable-list__add')?.focus();
    }

    dispose() {
        this.#dropFields();
        this.list.dispose();
        this.root = null;
        this.input = null;
    }

    #toItems(colors) {
        // A colour that converts is kept as its hex; anything else is kept as
        // typed, so it shows — and is reported — rather than vanishing.
        return (Array.isArray(colors) ? colors : []).map((c) => ({
            id: ++_seq,
            text: normalizeHex(String(c ?? '')) ?? String(c ?? ''),
        }));
    }

    /** Dispose every row's field: the rows are about to be rebuilt. */
    #dropFields() {
        for (const f of this._fields) f?.dispose();
        this._fields = [];
    }

    #renderRow(container, item, index, callbacks) {
        const count = this.list.getItems().length;

        const row = document.createElement('div');
        row.className = 'twm-color-list__row';
        const field = new ColorField({
            value: item.text,
            presets: this.presets,
            label: `Colour ${index + 1}`,
            // Every edit goes into the list's items, so the list never holds
            // a stale row; `_commit` tells its onChange which kind it was.
            onChange: (_v, { commit }) => {
                this._commit = commit;
                this._rowEdit = true;
                try { callbacks.update({ text: field.getText() }); }
                finally { this._commit = true; this._rowEdit = false; }
            },
        });
        this._fields[index] = field;
        row.appendChild(field.render());

        const move = (icon, label, disabled, fn) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'twm-color-list__move';
            btn.title = label;
            btn.setAttribute('aria-label', label);
            btn.disabled = disabled;
            const glyph = document.createElement('span');
            glyph.className = 'material-symbols-outlined';
            glyph.setAttribute('aria-hidden', 'true');
            glyph.textContent = icon;
            btn.appendChild(glyph);
            btn.addEventListener('click', fn);
            row.appendChild(btn);
        };
        move('arrow_upward', 'Move up', index === 0, callbacks.moveUp);
        move('arrow_downward', 'Move down', index === count - 1, callbacks.moveDown);
        container.appendChild(row);
    }

    #writeInput() {
        if (this.input) this.input.value = JSON.stringify(this.getTexts());
    }

    #emit(commit) {
        this.#writeInput();
        if (this.input) {
            this.input.dispatchEvent(new Event('input', { bubbles: true }));
            if (commit) this.input.dispatchEvent(new Event('change', { bubbles: true }));
        }
        this.onChange?.(this.getValue(), { commit });
    }
}
