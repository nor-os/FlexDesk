/**
 * ColorField — one colour: a swatch that opens the native picker, a hex text
 * box kept in step with it, and an optional row of preset swatches.
 *
 *   const field = new ColorField({
 *       value: 'rgb(31, 119, 180)',            // shown as #1f77b4
 *       presets: ['#1f77b4', '#ff7f0e', '#2ca02c'],
 *       onChange: (hex, { commit }) => { ... },
 *   });
 *   host.appendChild(field.render());
 *   field.getValue();                          // '#1f77b4' | '' | null
 *
 * THE HEX BOX IS THE CONTROL. Picking in the swatch writes the box and fires
 * the box's own `input` (and, when the picker commits, `change`); a preset
 * does the same. So there is one path from any gesture to the value, and a
 * host listening on the box — `openForm` does, by its `name` — hears every
 * change whatever made it. Typing a valid hex moves the swatch; typing an
 * invalid one leaves the swatch on the last good colour and marks the field
 * `.twm-color-field--invalid`.
 *
 * VALUES. `getValue()` is the colour as lowercase `#rrggbb`, `''` when the box
 * is empty, and `null` when what is typed is not a hex colour (`#rgb` and
 * `#rrggbb` are). An `rgb()` / `rgba()` value handed IN — a default, a preset,
 * `setValue` — is converted to its hex equivalent first; alpha is dropped,
 * because the native picker has no alpha channel.
 *
 * `onChange(value, { commit })` runs on every edit with `commit: false` and on
 * the box's `change` (blur, Enter, a preset, the picker closing) with
 * `commit: true`.
 */

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const RGB_RE = /^rgba?\(\s*([^)]*)\)$/i;

/** True for `#rgb` and `#rrggbb` (any case), and nothing else. */
export function isHexColor(value) {
    return typeof value === 'string' && HEX_RE.test(value.trim());
}

/**
 * A colour as lowercase `#rrggbb`, or null when `value` is not one.
 * Accepts `#rgb`, `#rrggbb` and `rgb()` / `rgba()` in comma or space syntax,
 * with channels as 0–255 or percentages; an alpha channel is dropped.
 */
export function normalizeHex(value) {
    if (typeof value !== 'string') return null;
    const s = value.trim();
    if (HEX_RE.test(s)) {
        const h = s.slice(1).toLowerCase();
        return h.length === 3 ? `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}` : `#${h}`;
    }
    const m = RGB_RE.exec(s);
    if (!m) return null;
    const parts = m[1].split(/\s*[,/]\s*|\s+/).filter(Boolean);
    if (parts.length < 3 || parts.length > 4) return null;
    const channels = [];
    for (const p of parts.slice(0, 3)) {
        const pct = p.endsWith('%');
        const n = Number(pct ? p.slice(0, -1) : p);
        if (!Number.isFinite(n)) return null;
        const v = pct ? (n / 100) * 255 : n;
        if (v < 0 || v > 255) return null;
        channels.push(Math.round(v));
    }
    return `#${channels.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/** What the box shows for a value handed in: its hex if it is a colour, else as given. */
function displayText(value) {
    if (value == null) return '';
    return normalizeHex(String(value)) ?? String(value);
}

export class ColorField {
    /**
     * @param {Object}   [o]
     * @param {string}   [o.value]     initial colour (hex or rgb()); '' for none
     * @param {string[]} [o.presets]   preset colours drawn as buttons; ones that
     *                                 are not colours are left out
     * @param {string}   [o.name]      `name` of the hex box, for a host form
     * @param {string}   [o.label]     accessible name of the swatch and the box
     * @param {Function} [o.onChange]  `(value, { commit })`, value as `getValue()`
     */
    constructor({ value = '', presets = [], name = null, label = null, onChange = null } = {}) {
        this.initial = displayText(value);
        this.presets = (Array.isArray(presets) ? presets : []).map(normalizeHex).filter(Boolean);
        this.name = name;
        this.label = label;
        this.onChange = typeof onChange === 'function' ? onChange : null;

        this.root = null;
        this.swatch = null;
        this.hex = null;
        this._disposers = [];
    }

    render() {
        if (this.root) return this.root;
        const root = document.createElement('div');
        root.className = 'twm-color-field';

        const swatch = document.createElement('input');
        swatch.type = 'color';
        swatch.className = 'twm-color-field__swatch';
        swatch.value = normalizeHex(this.initial) ?? '#000000';
        if (this.label) swatch.title = this.label;

        const hex = document.createElement('input');
        hex.type = 'text';
        hex.className = 'twm-color-field__hex';
        hex.value = this.initial;
        hex.placeholder = '#rrggbb';
        hex.spellcheck = false;
        hex.autocomplete = 'off';
        hex.maxLength = 7;
        if (this.name) hex.name = this.name;
        if (this.label) hex.setAttribute('aria-label', this.label);

        root.append(swatch, hex);
        this.root = root;
        this.swatch = swatch;
        this.hex = hex;

        if (this.presets.length) {
            const strip = document.createElement('div');
            strip.className = 'twm-color-field__presets';
            for (const color of this.presets) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'twm-color-field__preset';
                btn.style.backgroundColor = color;
                btn.title = color;
                btn.setAttribute('aria-label', color);
                this.#listen(btn, 'click', () => this.#writeBox(color, true));
                strip.appendChild(btn);
            }
            root.appendChild(strip);
        }

        // Every gesture lands on the box; the box's listeners do the rest.
        this.#listen(swatch, 'input', () => this.#writeBox(swatch.value, false));
        this.#listen(swatch, 'change', () => this.#writeBox(swatch.value, true));
        this.#listen(hex, 'input', () => this.#sync(false));
        this.#listen(hex, 'change', () => {
            const v = this.getValue();
            if (v) hex.value = v;                // canonical form once committed
            this.#sync(true);
        });

        this.#sync(null);
        return root;
    }

    /** `#rrggbb`, `''` when empty, or `null` when the box holds no hex colour. */
    getValue() {
        const text = this.getText().trim();
        if (text === '') return '';
        return isHexColor(text) ? normalizeHex(text) : null;
    }

    /** The box as it stands. */
    getText() {
        return this.hex ? this.hex.value : this.initial;
    }

    isValid() {
        return this.getValue() !== null;
    }

    /** Write a colour (hex or rgb()) without firing `onChange`. */
    setValue(value) {
        const text = displayText(value);
        if (!this.hex) { this.initial = text; return; }
        this.hex.value = text;
        this.#sync(null);
    }

    focus() {
        this.hex?.focus();
    }

    dispose() {
        for (const d of this._disposers) {
            try { d(); } catch { /* listener already gone */ }
        }
        this._disposers = [];
        this.root = null;
        this.swatch = null;
        this.hex = null;
    }

    #listen(el, type, fn) {
        el.addEventListener(type, fn);
        this._disposers.push(() => el.removeEventListener(type, fn));
    }

    /** Put `text` in the box and fire the box's own events, as typing would. */
    #writeBox(text, commit) {
        this.hex.value = text;
        this.hex.dispatchEvent(new Event('input', { bubbles: true }));
        if (commit) this.hex.dispatchEvent(new Event('change', { bubbles: true }));
    }

    /** Swatch and invalid mark follow the box; `commit === null` is silent. */
    #sync(commit) {
        const v = this.getValue();
        if (v) this.swatch.value = v;
        this.root.classList.toggle('twm-color-field--invalid', v === null);
        if (commit !== null) this.onChange?.(v, { commit });
    }
}
