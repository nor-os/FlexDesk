export class SliderField {
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
        this.helperEl = null;
        this.emitOnInput = Boolean(field.emitOnInput ?? field.emitsOnInput);
        this._disposers = [];
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
        this.sliderInput.min = this.#coerceNumber(this.field.min, 0);
        this.sliderInput.max = this.#coerceNumber(this.field.max, 100);
        this.sliderInput.step = this.#coercePositiveNumber(this.field.step, 1);
        this.sliderInput.value = this.#coerceNumber(this.field.value, Number(this.sliderInput.min));
        if (this.field.disabled) {
            this.sliderInput.disabled = true;
        }

        // Prevent parent interactions from interfering with slider dragging
        // Use stopImmediatePropagation to ensure no other handlers on this element run
        // DO NOT call preventDefault - allow native slider drag behavior
        const stopDrag = (evt) => {
            evt.stopPropagation();
            evt.stopImmediatePropagation();
        };
        // Use capture phase to intercept before any parent handlers
        this.sliderInput.addEventListener('mousedown', stopDrag, { capture: true });
        this.sliderInput.addEventListener('touchstart', stopDrag, { passive: false, capture: true });
        this._disposers.push(() => this.sliderInput.removeEventListener('mousedown', stopDrag, { capture: true }));
        this._disposers.push(() => this.sliderInput.removeEventListener('touchstart', stopDrag, { passive: false, capture: true }));

        this.helperEl = document.createElement('div');
        this.helperEl.className = 'twm-slider-field__helper';
        if (this.field.helperText) {
            this.helperEl.textContent = this.field.helperText;
        }

        this.root.appendChild(this.sliderInput);
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
            const value = event.target.value;
            this.onChange?.(value, { immediate: false });
        };
        this.sliderInput.addEventListener('input', handleInput);
        this.sliderInput.addEventListener('change', handleChange);
        this._disposers.push(() => this.sliderInput.removeEventListener('input', handleInput));
        this._disposers.push(() => this.sliderInput.removeEventListener('change', handleChange));

        return this.root;
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
        this.helperEl = null;
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
