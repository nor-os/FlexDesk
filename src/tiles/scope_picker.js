/**
 * scope_picker.js — ONE FILTER FOR THE WHOLE BOARD (0.16.1).
 *
 * A row of buttons, one per scope ("Everyone", "Assigned by me", …), exactly
 * one of them pressed. It is the control half of a dashboard-level filter; the
 * other half is `TileGrid.setScope()`, which hands the value to every tile
 * (`tile.scope`, `tile.onScopeChange`) and to the grid's `onScopeChange`:
 *
 *     const picker = createScopePicker({
 *         options: [{ value: 'all', label: 'Everyone' },
 *                   { value: 'mine', label: 'Mine', hint: 'only what is on me' }],
 *         value: 'all',
 *         onChange: (value) => grid.setScope(value),
 *     });
 *     header.append(picker.element);
 *
 * What a scope MEANS is the embedder's: the grid only carries the value, and a
 * tile that knows nothing about scopes is unaffected by one.
 *
 * Each button has `aria-pressed`, the group a label. Left and Right move the
 * focus along the row and Enter or Space presses, as on any button; a click on
 * the button already pressed changes nothing and calls nothing.
 */

/**
 * @param {Object} o
 * @param {Array<{value: string, label: string, hint?: string}>} o.options
 * @param {string} [o.value] - The pressed one; the first option when absent or unknown.
 * @param {string} [o.label='Scope'] - The group's accessible name.
 * @param {(value: string) => void} [o.onChange] - After the user presses another one.
 * @returns {{element: HTMLElement, readonly value: string, setValue: (v: string) => void, dispose: () => void}}
 */
export function createScopePicker({ options = [], value, label = 'Scope', onChange } = {}) {
    const opts = options.filter((o) => o && o.value != null).map((o) => ({ ...o, value: String(o.value) }));
    const known = (v) => opts.some((o) => o.value === String(v));
    let current = known(value) ? String(value) : opts[0]?.value ?? '';

    const element = document.createElement('span');
    element.className = 'fd-scope-picker';
    element.setAttribute('role', 'group');
    element.setAttribute('aria-label', label);

    const buttons = opts.map((o) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'fd-scope-picker__btn';
        b.dataset.scope = o.value;
        b.textContent = o.label ?? o.value;
        if (o.hint) b.title = o.hint;
        element.append(b);
        return b;
    });

    const paint = () => {
        for (const b of buttons) {
            const on = b.dataset.scope === current;
            b.classList.toggle('fd-scope-picker__btn--on', on);
            b.setAttribute('aria-pressed', String(on));
        }
    };
    paint();

    const onClick = (e) => {
        const b = e.target?.closest?.('[data-scope]');
        if (!b || !element.contains(b) || b.dataset.scope === current) return;
        current = b.dataset.scope;
        paint();
        try { onChange?.(current); } catch (err) { console.error('[ScopePicker] onChange threw:', err); }
    };
    const onKey = (e) => {
        const i = buttons.indexOf(e.target);
        if (i < 0) return;
        const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: buttons.length - 1 }[e.key];
        if (to === undefined || !buttons[to]) return;
        e.preventDefault();
        buttons[to].focus();
    };
    element.addEventListener('click', onClick);
    element.addEventListener('keydown', onKey);

    return {
        element,
        get value() { return current; },
        /** Press `v` without calling `onChange` (a value restored from elsewhere). */
        setValue(v) {
            if (!known(v)) return;
            current = String(v);
            paint();
        },
        dispose() {
            element.removeEventListener('click', onClick);
            element.removeEventListener('keydown', onKey);
            element.remove();
        },
    };
}
