/**
 * ToggleField — an on/off switch: a track and a knob drawn over a REAL
 * checkbox, so the form, the label and assistive technology all see a native
 * control.
 *
 *   const t = new ToggleField({ label: 'Autosave', onText: 'On', offText: 'Off',
 *                               checked: true, onChange: (on) => save(on) });
 *   host.appendChild(t.render());
 *   t.get();            // true
 *   t.set(false);       // no onChange: the caller already knows
 *   t.setDisabled(true);
 *   t.dispose();
 *
 * The input carries `role="switch"` and an `aria-checked` that follows it.
 * Space toggles it (as it does any checkbox) and so does Enter, which a
 * checkbox ignores but a switch is expected to honour. Both go through the
 * input's own `click()`, so a disabled switch ignores them exactly as it
 * ignores the mouse, and a toggle fires the input's `input` and `change` like
 * any other control. The root is a `<label>`, so a click on the track, the
 * on/off text or the label toggles it too.
 *
 * Markup — every class is styled by `flexdesk.css` from tokens alone:
 *
 *   label.twm-toggle[.twm-toggle--compact][.twm-toggle--disabled]
 *     span.twm-toggle__control
 *       input.twm-toggle__input[type=checkbox][role=switch]
 *       span.twm-toggle__track > span.twm-toggle__knob
 *     span.twm-toggle__state     (onText / offText, when either is given)
 *     span.twm-toggle__label     (label, when given)
 */
export class ToggleField {
    /**
     * @param {object}    o
     * @param {boolean}  [o.checked=false]
     * @param {string?}  [o.label]      text beside the switch, and its accessible name
     * @param {string?}  [o.ariaLabel]  accessible name when there is no visible label
     * @param {string?}  [o.onText]     state text shown while on
     * @param {string?}  [o.offText]    state text shown while off
     * @param {boolean}  [o.disabled=false]
     * @param {boolean}  [o.compact=false]  a smaller track, for dense rows
     * @param {string?}  [o.name]       the input's name, for a surrounding form
     * @param {string?}  [o.id]         the input's id
     * @param {Function?}[o.onChange]   `(checked: boolean)` after a user toggle
     */
    constructor({
        checked = false, label = null, ariaLabel = null, onText = null, offText = null,
        disabled = false, compact = false, name = null, id = null, onChange = null,
    } = {}) {
        this._initial = !!checked;
        this._label = label == null ? null : String(label);
        this._ariaLabel = ariaLabel == null ? null : String(ariaLabel);
        this._onText = onText == null ? null : String(onText);
        this._offText = offText == null ? null : String(offText);
        this._disabled = !!disabled;
        this._compact = !!compact;
        this._name = name == null ? null : String(name);
        this._id = id == null ? null : String(id);
        this._onChange = typeof onChange === 'function' ? onChange : null;

        this.root = null;
        this.input = null;
        this._stateEl = null;
        this._disposers = [];
    }

    /** Build the switch once and hand back its root; later calls return it. */
    render() {
        if (this.root) return this.root;

        const root = document.createElement('label');
        root.className = 'twm-toggle';
        if (this._compact) root.classList.add('twm-toggle--compact');

        const control = document.createElement('span');
        control.className = 'twm-toggle__control';

        const input = document.createElement('input');
        input.type = 'checkbox';
        input.className = 'twm-toggle__input';
        input.setAttribute('role', 'switch');
        if (this._name) input.name = this._name;
        if (this._id) input.id = this._id;
        if (this._ariaLabel && !this._label) input.setAttribute('aria-label', this._ariaLabel);
        input.checked = this._initial;

        const track = document.createElement('span');
        track.className = 'twm-toggle__track';
        track.setAttribute('aria-hidden', 'true');
        const knob = document.createElement('span');
        knob.className = 'twm-toggle__knob';
        track.appendChild(knob);

        control.append(input, track);
        root.appendChild(control);

        if (this._onText != null || this._offText != null) {
            this._stateEl = document.createElement('span');
            this._stateEl.className = 'twm-toggle__state';
            // The switch already says on/off to a screen reader.
            this._stateEl.setAttribute('aria-hidden', 'true');
            root.appendChild(this._stateEl);
        }
        if (this._label != null) {
            const labelEl = document.createElement('span');
            labelEl.className = 'twm-toggle__label';
            labelEl.textContent = this._label;
            root.appendChild(labelEl);
        }

        this.root = root;
        this.input = input;
        this.setDisabled(this._disabled);
        this._sync();

        const onKeyDown = (e) => {
            if (e.key !== ' ' && e.key !== 'Enter') return;
            // Ours, not the browser's: Space would otherwise activate on keyup
            // as well, and Enter would submit the surrounding form.
            e.preventDefault();
            if (e.repeat) return;
            input.click();
        };
        const onKeyUp = (e) => { if (e.key === ' ') e.preventDefault(); };
        const onChange = () => {
            this._sync();
            this._onChange?.(input.checked);
        };
        input.addEventListener('keydown', onKeyDown);
        input.addEventListener('keyup', onKeyUp);
        input.addEventListener('change', onChange);
        this._disposers.push(
            () => input.removeEventListener('keydown', onKeyDown),
            () => input.removeEventListener('keyup', onKeyUp),
            () => input.removeEventListener('change', onChange),
        );
        return root;
    }

    /** Whether the switch is on. */
    get() {
        return this.input ? this.input.checked : this._initial;
    }

    /** Turn it on or off. Does NOT call `onChange`. */
    set(checked) {
        if (!this.input) { this._initial = !!checked; return; }
        this.input.checked = !!checked;
        this._sync();
    }

    /** A disabled switch ignores clicks and keys alike. */
    setDisabled(disabled) {
        this._disabled = !!disabled;
        if (!this.input) return;
        this.input.disabled = this._disabled;
        this.root.classList.toggle('twm-toggle--disabled', this._disabled);
    }

    dispose() {
        for (const d of this._disposers) {
            try { d(); } catch { /* the element is already gone */ }
        }
        this._disposers = [];
        this.root?.remove();
        this.root = null;
        this.input = null;
        this._stateEl = null;
    }

    _sync() {
        const on = this.input.checked;
        this.input.setAttribute('aria-checked', on ? 'true' : 'false');
        if (this._stateEl) this._stateEl.textContent = (on ? this._onText : this._offText) ?? '';
    }
}
