/**
 * A range slider with optional companions: a linked number box, a readout, a
 * default with a modified state and a reset button, and an enable toggle.
 *
 * Every companion is opt-in through `field`; with none of them the DOM is the
 * range and the helper line, exactly as before.
 *
 *   field.min / max / step / value   the range (defaults 0 / 100 / 1 / min)
 *   field.numberInput                true: an editable number box, two-way synced
 *   field.readout                    true, or (value: number) => string
 *   field.defaultValue               enables the modified state and a reset button
 *   field.toggleable                 true: an enable checkbox before the slider
 *   field.enabled                    the toggle's initial state (default true)
 *   field.disabledValue              what onChange reports while toggled off (default null)
 *   field.emitOnInput                also report every drag frame ({ immediate: true })
 *   field.disabled / helperText      as before
 *
 * onChange(value, { immediate }) receives the slider's value as a string — the
 * range input's own value, as it always has — or `disabledValue` while the
 * toggle is off. A commit that leaves the reported value where it was reports
 * nothing, so setValue/setRange/setEnabled cannot echo back into the caller
 * that drove them.
 */
export class SliderField {
    #min = 0;
    #max = 100;
    #step = 1;
    #value = 0;
    #enabled = true;
    #hasDefault = false;
    #defaultValue = 0;

    constructor({ fieldId, field = {}, onChange = null, logger = null } = {}) {
        if (!fieldId) {
            throw new Error('SliderField requires a fieldId');
        }
        this.fieldId = fieldId;
        this.field = field;
        this.logger = logger;
        this.onChange = typeof onChange === 'function' ? onChange : null;

        this.root = null;
        this.sliderInput = null;
        this.numberInput = null;
        this.readoutEl = null;
        this.resetButton = null;
        this.toggleInput = null;
        this.helperEl = null;
        this.emitOnInput = Boolean(field.emitOnInput ?? field.emitsOnInput);
        this._disposers = [];

        this.#min = this.#coerceNumber(field.min, 0);
        this.#max = Math.max(this.#min, this.#coerceNumber(field.max, 100));
        this.#step = this.#coercePositiveNumber(field.step, 1);
        this.#value = this.#fit(this.#coerceNumber(field.value, this.#min));
        this.#enabled = field.toggleable ? field.enabled !== false : true;
        this.#hasDefault = this.#isFiniteInput(field.defaultValue);
        if (this.#hasDefault) {
            this.#defaultValue = this.#fit(Number(field.defaultValue));
        }
    }

    render() {
        if (this.root) {
            return this.root;
        }
        this.root = document.createElement('div');
        this.root.className = 'twm-slider-field';

        this.sliderInput = document.createElement('input');
        this.sliderInput.type = 'range';
        this.sliderInput.className = 'twm-slider-field__input';
        this.#writeRangeAttributes();

        // Prevent parent interactions from interfering with slider dragging
        // Use stopImmediatePropagation to ensure no other handlers on this element run
        // DO NOT call preventDefault - allow native slider drag behavior
        const stopDrag = (evt) => {
            evt.stopPropagation();
            evt.stopImmediatePropagation();
        };
        // Use capture phase to intercept before any parent handlers
        this.#listen(this.sliderInput, 'mousedown', stopDrag, { capture: true });
        this.#listen(this.sliderInput, 'touchstart', stopDrag, { passive: false, capture: true });

        this.helperEl = document.createElement('div');
        this.helperEl.className = 'twm-slider-field__helper';
        if (this.field.helperText) {
            this.helperEl.textContent = this.field.helperText;
        }

        const companions = this.field.toggleable || this.field.numberInput
            || this.field.readout || this.#hasDefault;
        if (companions) {
            const row = document.createElement('div');
            row.className = 'twm-slider-field__row';
            if (this.field.toggleable) {
                row.appendChild(this.#buildToggle());
            }
            row.appendChild(this.sliderInput);
            if (this.field.readout) {
                this.readoutEl = document.createElement('span');
                this.readoutEl.className = 'twm-slider-field__readout';
                row.appendChild(this.readoutEl);
            }
            if (this.field.numberInput) {
                row.appendChild(this.#buildNumberInput());
            }
            if (this.#hasDefault) {
                row.appendChild(this.#buildResetButton());
            }
            this.root.appendChild(row);
        } else {
            this.root.appendChild(this.sliderInput);
        }
        this.root.appendChild(this.helperEl);

        // Throttle onInput to animation frames to avoid re-render stutter while dragging
        let rafToken = null;
        let pendingValue = null;
        const flushPending = () => {
            if (rafToken) {
                cancelAnimationFrame(rafToken);
                rafToken = null;
            }
            if (pendingValue === null) return;
            const valueToEmit = pendingValue;
            pendingValue = null;
            if (this.emitOnInput) {
                this.onChange?.(valueToEmit, { immediate: true });
            }
        };

        const handleInput = (event) => {
            // The companions follow the thumb on every frame; onChange waits for release.
            this.#value = this.#fit(Number(event.target.value));
            this.#syncCompanions();
            pendingValue = event.target.value;
            if (!rafToken) {
                rafToken = requestAnimationFrame(() => {
                    rafToken = null;
                    flushPending();
                });
            }
        };
        const handleChange = (event) => {
            flushPending();
            this.#value = this.#fit(Number(event.target.value));
            this.#syncCompanions();
            this.onChange?.(event.target.value, { immediate: false });
        };
        this.#listen(this.sliderInput, 'input', handleInput);
        this.#listen(this.sliderInput, 'change', handleChange);

        this.#syncCompanions();
        return this.root;
    }

    /** What onChange would report now: the value as a string, or disabledValue while toggled off. */
    getValue() {
        return this.#enabled ? String(this.#value) : this.#disabledValue();
    }

    isEnabled() {
        return this.#enabled;
    }

    /** True when a defaultValue was given and the value differs from it. */
    isModified() {
        return this.#hasDefault && this.#value !== this.#defaultValue;
    }

    /**
     * Clamp to the range and snap to the step. Reports once, unless `silent` or
     * the reported value did not move. A non-finite value is refused (false).
     */
    setValue(value, { silent = false } = {}) {
        if (!this.#isFiniteInput(value)) {
            return false;
        }
        const numeric = Number(value);
        return this.#commit(() => { this.#value = this.#fit(numeric); }, silent);
    }

    setEnabled(enabled, { silent = false } = {}) {
        return this.#commit(() => { this.#enabled = Boolean(enabled); }, silent);
    }

    /** Change any of min/max/step; the value and the default are refitted into the new range. */
    setRange({ min, max, step } = {}, { silent = false } = {}) {
        return this.#commit(() => {
            this.#min = this.#isFiniteInput(min) ? Number(min) : this.#min;
            this.#max = Math.max(this.#min, this.#isFiniteInput(max) ? Number(max) : this.#max);
            this.#step = this.#coercePositiveNumber(step, this.#step);
            this.#value = this.#fit(this.#value);
            if (this.#hasDefault) {
                this.#defaultValue = this.#fit(this.#defaultValue);
            }
            if (this.sliderInput) {
                this.#writeRangeAttributes();
            }
        }, silent);
    }

    /** Restore defaultValue and report it, a commit like a drag release. */
    reset({ silent = false } = {}) {
        if (!this.#hasDefault) {
            return false;
        }
        return this.#commit(() => { this.#value = this.#defaultValue; }, silent);
    }

    dispose() {
        this._disposers.forEach((dispose) => {
            try {
                dispose?.();
            } catch (error) {
                this.logger?.warn?.('twm-slider-field', 'Failed to dispose slider listener', { error });
            }
        });
        this._disposers = [];
        this.root = null;
        this.sliderInput = null;
        this.numberInput = null;
        this.readoutEl = null;
        this.resetButton = null;
        this.toggleInput = null;
        this.helperEl = null;
    }

    #buildToggle() {
        this.toggleInput = document.createElement('input');
        this.toggleInput.type = 'checkbox';
        this.toggleInput.className = 'twm-slider-field__toggle';
        this.toggleInput.setAttribute('aria-label', 'Enabled');
        if (this.field.disabled) {
            this.toggleInput.disabled = true;
        }
        this.#listen(this.toggleInput, 'change', () => this.setEnabled(this.toggleInput.checked));
        return this.toggleInput;
    }

    #buildNumberInput() {
        this.numberInput = document.createElement('input');
        this.numberInput.type = 'text';
        this.numberInput.inputMode = 'decimal';
        this.numberInput.className = 'twm-slider-field__number';
        this.numberInput.setAttribute('aria-label', 'Value');
        // A typed value that is not a finite number is refused and the box shows the value again.
        const commitTyped = () => {
            if (!this.setValue(this.numberInput.value.trim())) {
                this.#syncCompanions();
            }
        };
        this.#listen(this.numberInput, 'keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                commitTyped();
            } else if (event.key === 'Escape') {
                this.#syncCompanions();
            }
        });
        this.#listen(this.numberInput, 'change', commitTyped);
        return this.numberInput;
    }

    #buildResetButton() {
        this.resetButton = document.createElement('button');
        this.resetButton.type = 'button';
        this.resetButton.className = 'twm-slider-field__reset';
        this.resetButton.title = 'Reset to default';
        this.resetButton.setAttribute('aria-label', 'Reset to default');
        const icon = document.createElement('span');
        icon.className = 'material-symbols-outlined';
        icon.textContent = 'restart_alt';
        this.resetButton.appendChild(icon);
        this.#listen(this.resetButton, 'click', () => this.reset());
        return this.resetButton;
    }

    /** Apply a change, refresh the DOM, and report once if the reported value moved. */
    #commit(apply, silent) {
        const before = this.getValue();
        apply();
        this.#syncCompanions();
        const after = this.getValue();
        if (after === before) {
            return false;
        }
        if (!silent) {
            this.onChange?.(after, { immediate: false });
        }
        return true;
    }

    /** Write the model into every element: slider, box, readout, toggle, states. */
    #syncCompanions() {
        if (!this.root) return;
        const text = String(this.#value);
        if (this.sliderInput.value !== text) {
            this.sliderInput.value = text;
        }
        const off = !this.#enabled;
        const hardDisabled = Boolean(this.field.disabled);
        this.sliderInput.disabled = hardDisabled || off;
        if (this.numberInput) {
            this.numberInput.value = text;
            this.numberInput.disabled = hardDisabled || off;
        }
        if (this.readoutEl) {
            const format = typeof this.field.readout === 'function' ? this.field.readout : null;
            this.readoutEl.textContent = format ? String(format(this.#value)) : text;
        }
        if (this.toggleInput) {
            this.toggleInput.checked = this.#enabled;
        }
        const modified = this.isModified();
        if (this.resetButton) {
            this.resetButton.disabled = hardDisabled || off || !modified;
        }
        this.root.classList.toggle('twm-slider-field--modified', modified);
        this.root.classList.toggle('twm-slider-field--off', off);
    }

    #writeRangeAttributes() {
        this.sliderInput.min = String(this.#min);
        this.sliderInput.max = String(this.#max);
        this.sliderInput.step = String(this.#step);
        this.sliderInput.value = String(this.#value);
    }

    /** Clamp to [min, max] and snap to the step grid anchored at min, as a range input does. */
    #fit(value) {
        const clamped = Math.min(this.#max, Math.max(this.#min, value));
        let snapped = this.#min + Math.round((clamped - this.#min) / this.#step) * this.#step;
        if (snapped > this.#max) snapped -= this.#step;
        const decimals = Math.max(this.#decimals(this.#step), this.#decimals(this.#min));
        return Number(snapped.toFixed(Math.min(decimals, 12)));
    }

    #decimals(value) {
        const text = String(value);
        if (text.includes('e-')) return Number(text.split('e-')[1]);
        const dot = text.indexOf('.');
        return dot === -1 ? 0 : text.length - dot - 1;
    }

    #isFiniteInput(value) {
        if (value === null || value === undefined || typeof value === 'boolean') {
            return false;
        }
        if (typeof value === 'string' && value.trim() === '') {
            return false;
        }
        return Number.isFinite(Number(value));
    }

    #disabledValue() {
        return this.field.disabledValue === undefined ? null : this.field.disabledValue;
    }

    #listen(target, type, handler, options) {
        target.addEventListener(type, handler, options);
        this._disposers.push(() => target.removeEventListener(type, handler, options));
    }

    #coerceNumber(value, fallback) {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : fallback;
    }

    #coercePositiveNumber(value, fallback) {
        const numeric = this.#coerceNumber(value, fallback);
        if (numeric <= 0) {
            return fallback;
        }
        return numeric;
    }
}
