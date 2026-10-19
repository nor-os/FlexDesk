/**
 * Modal helpers — prompt with form, yes/no confirm.
 *
 * Built on the canonical `ManagedWindow` (with `modal: true`) so dialogs
 * go through the same window system as everything else: same chrome,
 * same backdrop, same Esc-to-close behaviour, same z-stacking.
 *
 * Returns Promises that resolve with the form data (or null on cancel)
 * / a boolean (confirm).
 *
 * Field schema:
 *   { name, label, type='text', default, step?, min?, max?, options?, required?,
 *     placeholder?, hint?, validator?, rows?, create?, pick?, displayFor?,
 *     onText?, offText?, disabled?, compact? }
 *
 *   - type: 'text' | 'number' | 'password' | 'select' | 'textarea' |
 *           'checkbox' | 'toggle' | 'picker' | 'checklist' | 'radio' |
 *           'color' | 'colorList'
 *   - hint: small dim help line rendered under the field
 *   - validator: fn(value, allValues) => string | null    (inline error)
 *   - min / max: a `number` field's bounds — the input's own `min` / `max`
 *     attributes, and on submit a value outside them is refused with a field
 *     error under that field ("Must be between 2 and 200."), not the browser's
 *     bubble. An empty, non-required field is not out of range.
 *   - rows: number of textarea rows (only used for type='textarea')
 *   - toggle: a `ToggleField` switch, submitted as a boolean like a checkbox;
 *     `onText` / `offText` label its state, `disabled` and `compact` pass
 *     through to it
 *
 * Options — `select`, `checklist` and `radio` take `options`: bare values, or
 * `{ value, label?, disabled?, reason?, description? }`. A value comes back AS
 * ITSELF — an option whose value is the number 2 submits 2, not '2' — and a
 * default matches an option of the same text (`'2'` selects 2). A `disabled`
 * option is shown with its `reason` and is never the submitted value: it is not
 * selected by a default or by `api.set`, the reader cannot pick it, and a
 * submit that finds one selected anyway is refused with a field error.
 * `{ group: 'Heading', options: [...] }` in a select's list is an `<optgroup>`;
 * in a checklist or radio it is a `.twm-choice__group` heading over its
 * options. A combobox (a `select` with `create`) offers a group's enabled
 * options, flattened, and an entry naming a disabled one — a default or an
 * `api.set` — leaves the box empty.
 *
 *   - `checklist`: toggle chips; submits the ARRAY of chosen values in the
 *     list's order (`[]` for none). `required` means at least one.
 *   - `radio`: one radio row per option, each with its `description` under it;
 *     submits the chosen value, or null. `required` means one is chosen.
 *
 * These three are drawn by `choice_controls.js` — the same select, chips and
 * radio list as the flow kit's settings widgets, so there is one of each.
 *
 * Section dividers — entries of the form `{ section: 'Label' }` are
 * rendered as a small uppercase heading that groups the fields below
 * them. Useful for longer forms. A section that also carries a `name`
 * can be hidden and shown by `onFieldChange`'s `setVisible`.
 *
 * Rows — an entry of the form `{ row: [field, field, ...] }` puts its fields
 * side by side (a min and a max, say). Each is an ordinary field: its own
 * label, hint, error, `setVisible`, value and submitted key — the row is
 * layout only and has no name. The row stacks its fields when the form is
 * narrower than 360px (a container query on `.twm-modal__form`).
 *
 * Picker — a value the user LOOKS UP rather than types (an id chosen in a
 * search dialog, say). The row shows a read-only box and a search button;
 * the button (or a click on the box) awaits `pick(currentValue)`, which
 * resolves to `{ value, label }`, a bare value, or null to leave the field
 * alone. The value is what is submitted, the label is what is shown, and
 * `displayFor(value)` gives the label for the value the form opens with:
 *
 *   {
 *     name: 'parent', label: 'Parent', type: 'picker',
 *     pick: async (current) => ({ value: 'EPIC-0001', label: 'EPIC-0001 — Auth' }),
 *     displayFor: (value) => titleOf(value),
 *   }
 *
 * Dependent-property pick-or-create — a `select` field that carries a
 * `create` spec renders as a **type-ahead combobox** instead of a
 * dropdown: the user picks an existing option OR types a new value.
 * On submit, a value that isn't an existing option is created via
 * `create.onCreate(value)` before the form resolves:
 *
 *   {
 *     name: 'asset_kind', label: 'Asset kind', type: 'select',
 *     options: [...],                       // existing values (autocomplete)
 *     create: {
 *       onCreate: async (typed) => finalValue | null,   // make the entity
 *       hint: 'new asset kind',             // shown when the typed value is new
 *     },
 *   }
 *
 * `create: true` is the degenerate case — "pick one of these, or type
 * anything" — where the typed value IS the value and there is no entity to
 * create, so there is no "will create" hint either. A bare `true` used to
 * reach `f.create.onCreate(v)` and fail the submit with "onCreate is not a
 * function", blaming the user for typing their own name.
 *
 * Colours — `type: 'color'` is a `ColorField` (swatch + native picker, a hex
 * box kept in step, `presets?` as swatch buttons) and submits lowercase
 * `#rrggbb`, or `''` when left empty. `type: 'colorList'` is a
 * `ColorListField` (add, remove, reorder; `presets?` on every row) and submits
 * an ordered array of `#rrggbb`. An `rgb()` default is shown as its hex. A box
 * that holds no hex colour is a field error and the form does not resolve;
 * `required` on either is checked by the form, not the browser:
 *
 *   { name: 'accent', label: 'Accent', type: 'color', default: 'rgb(31,119,180)',
 *     presets: ['#1f77b4', '#ff7f0e'] }
 *   { name: 'palette', label: 'Palette', type: 'colorList', default: ['#1f77b4'] }
 */

import { ManagedWindow } from '../../ui/components/managed_window.js';
import { ToggleField } from '../../ui/components/toggle_field.js';
import { ColorField } from './color_field.js';
import { ColorListField } from './color_list_field.js';
import { choiceList, findChoice, flatChoices, selectBox, toggleChips } from './choice_controls.js';

/**
 * C25. WHERE A DIALOG OPENS, when the application spans more than one window.
 *
 * Every modal here is a `ManagedWindow` with no `container`, so it mounts into
 * `document.body` — and "document" is the document this MODULE was loaded in.
 * A consumer that opens a second browser window with `window.open` and builds
 * its DOM from the opener's realm (which is how a pop-out grid works: same
 * modules, same JS context, a different document) therefore gets its dialogs in
 * the window it popped OUT of. The user presses "Add column" on their second
 * monitor and a dialog appears on the first, behind whatever is there.
 *
 * Passing a container at each call site was the other option and it is worse:
 * twenty-one of them across eleven files, every one of which would have to be
 * given a document it has no other reason to know about, and any one missed is
 * this bug again with no way to see it from here.
 *
 * So the HOST is ambient and the consumer sets it when its focus moves. Null —
 * every consumer today — means `document.body`, exactly as before.
 */
let _modalHost = null;
export function setModalHost(el) { _modalHost = el || null; }
export function modalHost() { return _modalHost; }

let _modalSeq = 1;

/**
 * @param {object}    o
 * @param {Function?} o.onFieldChange  `(name, value, api)` — called after any
 *   field's `change`, and ONCE on open with `name === null` so the form starts
 *   consistent with its defaults. `api` is
 *   `{ setVisible(name, on), get(name), set(name, value), setOptions(name,
 *   options) }`, addressing fields and named sections by name. `get` reads the
 *   control as it stands (a checkbox or toggle as a boolean, a select or radio as its
 *   option's own value — a select with no option selected as '', a radio
 *   with none as null — a combobox as the value of the option its text names,
 *   exactly as it submits, or as its text when it names none — a checklist as
 *   the array of chosen values, a colorList as the array of its rows' text,
 *   everything else — a colour too — as its string). An option
 *   whose value IS the given one wins over one that only has its text, here,
 *   in `set` and in defaults. `set` writes it (a value a select or radio does not
 *   offer, or offers only disabled, clears it; so does a disabled option's
 *   value in a combobox) and does NOT call
 *   `onFieldChange` back, so a hook that fills one field from another cannot
 *   loop. `setOptions` replaces the options of a `select` (a combobox's too),
 *   `checklist` or `radio` while the form is open, keeping the current value
 *   when the new list still offers it enabled — otherwise a select falls to its
 *   first enabled option, a radio to none, and a checklist drops what is gone.
 *   It does not call `onFieldChange` back either.
 *
 *   It exists for the form whose Type select spans two record kinds and must
 *   show the fields of the kind actually chosen. Rebuilding the form on every
 *   change would lose what the user had already typed, so every field is
 *   built once and the irrelevant rows are hidden. A hidden row keeps its
 *   value and is still submitted — the caller drops what its chosen kind does
 *   not use; a disabled option it holds submits as no value ('' for a select
 *   or combobox, null for a radio) — but it is not ASKED about: its `required` and its `validator`
 *   stand down until it is shown again, because a constraint on a field the
 *   user cannot see is a submit button that silently does nothing.
 *
 *   Absent — every caller before it — nothing here runs.
 */
export function openForm({ title, fields = [], defaults = {}, submitLabel = 'OK', onFieldChange = null } = {}) {
    return new Promise((resolve) => {
        // Build the form body — same markup as the legacy overlay,
        // minus the outer .ea-modal wrapper (ManagedWindow owns the
        // chrome now).
        const body = document.createElement('div');
        body.className = 'twm-modal__body-host';
        body.innerHTML = `
            <form class="twm-modal__form">
                <div class="twm-modal__fields">
                    ${fields.map((f) => _renderEntry(f, defaults)).join('')}
                </div>
                <div class="twm-modal__error" data-role="form-error" hidden></div>
                <div class="twm-modal__actions">
                    <button type="button" class="twm-btn" data-action="cancel">Cancel</button>
                    <button type="submit" class="twm-btn twm-btn--primary">${submitLabel}</button>
                </div>
            </form>
        `;

        const win = new ManagedWindow({
            container: _modalHost,
            id: `twm-modal-${_modalSeq++}`,
            title: title || 'Dialog',
            icon: 'edit_note',
            content: body,
            modal: true,
            canMinimize: false,
            canMaximize: false,
            canResize: false,
            canDrag: true,
            defaultWidth: _estimateWidth(fields),
            defaultHeight: _estimateHeight(fields),
            onClose: () => {
                disposeControls();
                if (!_resolved) { _resolved = true; resolve(null); }
            },
        });

        let _resolved = false;
        const close = (result) => {
            if (_resolved) return;
            _resolved = true;
            resolve(result);
            try { win.close({ force: true }); } catch {}
            disposeControls();
        };

        const errEl = body.querySelector('[data-role="form-error"]');
        const showError = (msg) => {
            if (!errEl) return;
            errEl.textContent = msg;
            errEl.hidden = !msg;
        };
        body.querySelector('[data-action="cancel"]')?.addEventListener('click', () => close(null));

        const formFields = _formFields(fields);
        // The options each field offers NOW — `setOptions` replaces them, the
        // caller's field object is never written to.
        const optionsOf = new Map(formFields.map((f) => [f.name, f.options]));
        const comboHints = new Map();
        for (const f of formFields) {
            if (f.type === 'select' && f.create) {
                const update = _wireComboboxHint(body, f, () => optionsOf.get(f.name));
                if (update) comboHints.set(f.name, update);
            }
            if (f.type === 'picker') _wirePicker(body, f);
        }
        const rowHidden = (name) => !!body.querySelector(`[data-field-row="${name}"]`)?.hidden;

        const clearFieldError = (name) => {
            const row = body.querySelector(`[data-field-row="${name}"]`);
            const errEl = body.querySelector(`[data-field-error="${name}"]`);
            if (row) row.classList.remove('twm-is-invalid');
            if (errEl) { errEl.textContent = ''; errEl.hidden = true; }
        };
        const setFieldError = (name, msg) => {
            const row = body.querySelector(`[data-field-row="${name}"]`);
            const errEl = body.querySelector(`[data-field-error="${name}"]`);
            if (row) row.classList.add('twm-is-invalid');
            if (errEl) { errEl.textContent = msg; errEl.hidden = false; }
        };
        // Fields that are components, not markup — toggles, selects,
        // checklists, radios and colours — are mounted into the slot their
        // row left (`_mountControl`) and read back through it: a toggle as a
        // boolean, a choice as its option's own value, a colour as its hex. `onChoice` is what a checklist or
        // radio calls when the reader changes it (a toggle or select is a
        // named control and is heard by the loops below).
        let onChoice = (name) => clearFieldError(name);
        const controls = new Map();
        for (const f of formFields) {
            const c = _mountControl(body, f, defaults[f.name] ?? f.default, (name) => onChoice(name));
            if (c) controls.set(f.name, c);
        }
        function disposeControls() {
            for (const c of controls.values()) c.dispose?.();
            controls.clear();
        }
        win.show();
        /** The option a combobox entry names — the one whose value IS it, else the
         *  one whose value has its text — or undefined. `get` and the submit both
         *  read a combobox through this, so they agree (`'2'` is option `2`). */
        const comboOption = (f, text) => findChoice(flatChoices(optionsOf.get(f.name)), text, true);
        /** A disabled option's reason ('' with none) when one is the value, else null. */
        const unavailable = (f, value) => {
            const c = controls.get(f.name);
            if (c) return c.unavailable();
            if (f.type !== 'select' || !f.create || value == null || value === '') return null;
            const o = comboOption(f, value);
            return o?.disabled ? (o.reason || '') : null;
        };

        // Clear per-field errors on input so the user sees the row recover.
        for (const f of formFields) {
            const el = body.querySelector(`[name="${f.name}"]`);
            el?.addEventListener('input', () => clearFieldError(f.name));
            el?.addEventListener('change', () => clearFieldError(f.name));
            // The browser refuses a number outside its min / max before the
            // submit handler runs; its bubble is replaced by the field error
            // the submit would have shown.
            if (f.type === 'number' && _bounded(f)) {
                el?.addEventListener('invalid', (e) => {
                    if (!el.validity.rangeUnderflow && !el.validity.rangeOverflow) return;
                    e.preventDefault();
                    setFieldError(f.name, _rangeMessage(f));
                });
            }
        }

        // Adaptive fields — see `onFieldChange` above.
        if (typeof onFieldChange === 'function') {
            const fieldOf = (name) => formFields.find((f) => f.name === name) || null;
            const api = {
                setVisible(name, on) {
                    const row = body.querySelector(`[data-field-row="${name}"]`);
                    if (!row) return;
                    // The attribute alone loses to `.twm-modal__row { display:
                    // grid }` in any stylesheet that has not got the `[hidden]`
                    // rule flexdesk.css carries, so the inline style says it too.
                    row.hidden = !on;
                    row.style.display = on ? '' : 'none';
                    clearFieldError(name);
                    // A required control nobody can see blocks the submit with
                    // no message the user can find, and so does a number out
                    // of its min or max. Remembered on the control, so showing
                    // the row gives back exactly what it had.
                    for (const el of row.querySelectorAll('input, select, textarea')) {
                        if (!on && el.required) { el.required = false; el.dataset.twmRequired = '1'; }
                        else if (on && el.dataset.twmRequired) { el.required = true; delete el.dataset.twmRequired; }
                        for (const [attr, key] of [['min', 'twmMin'], ['max', 'twmMax']]) {
                            if (!on && el.hasAttribute(attr)) { el.dataset[key] = el.getAttribute(attr); el.removeAttribute(attr); }
                            else if (on && el.dataset[key] != null) { el.setAttribute(attr, el.dataset[key]); delete el.dataset[key]; }
                        }
                    }
                },
                get(name) {
                    if (controls.has(name)) return controls.get(name).read();
                    const el = body.querySelector(`[name="${name}"]`);
                    if (!el) return undefined;
                    if (el.type === 'checkbox') return !!el.checked;
                    const f = fieldOf(name);
                    if (f?.type === 'select' && f.create) {
                        const match = comboOption(f, el.value);
                        return match ? match.value : el.value;
                    }
                    return el.value;
                },
                set(name, value) {
                    if (controls.has(name)) { controls.get(name).write(value); return; }
                    const el = body.querySelector(`[name="${name}"]`);
                    if (!el) return;
                    if (el.type === 'checkbox') { el.checked = !!value; return; }
                    const f = fieldOf(name);
                    // A combobox does not take a disabled option's text either.
                    const shut = f?.type === 'select' && f.create && comboOption(f, value)?.disabled;
                    el.value = value == null || shut ? '' : String(value);
                    comboHints.get(name)?.();
                    if (f?.type === 'picker') {
                        const display = body.querySelector(`[data-picker-display="${name}"]`);
                        if (display) display.value = _pickerLabel(f, el.value);
                    }
                },
                setOptions(name, options) {
                    const f = fieldOf(name);
                    if (!f) return;
                    const c = controls.get(name);
                    if (c?.setOptions) {
                        optionsOf.set(name, options);
                        c.setOptions(options);
                        return;
                    }
                    if (f.type !== 'select' || !f.create) return;
                    optionsOf.set(name, options);
                    const list = body.querySelector(`[data-datalist-for="${name}"]`);
                    if (list) list.innerHTML = _datalistOptions(options);
                    comboHints.get(name)?.();
                },
            };
            const fire = (name) => {
                try { onFieldChange(name, name == null ? undefined : api.get(name), api); }
                catch (err) { console.error('[modal] onFieldChange threw', err); }
            };
            for (const f of formFields) {
                const el = body.querySelector(`[name="${f.name}"]`);
                el?.addEventListener('change', () => fire(f.name));
            }
            onChoice = (name) => { clearFieldError(name); fire(name); };
            // Once on open, so a preselected value is reflected immediately
            // rather than only after the user touches something.
            fire(null);
        }

        body.querySelector('form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = body.querySelector('button[type="submit"]');
            showError('');
            const data = {};
            for (const f of formFields) {
                const control = controls.get(f.name);
                const el = control ? null : body.querySelector(`[name="${f.name}"]`);
                if (!control && !el) continue;
                let v;
                if (control) {
                    // A colour reads as its text but submits as its hex.
                    v = control.submit ? control.submit() : control.read();
                    // An option with no value submits '', as an empty select does.
                    if (v === undefined) v = f.type === 'select' ? '' : null;
                } else if (f.type === 'checkbox') {
                    v = !!el.checked;
                } else if (f.type === 'number') {
                    v = (el.value === '' ? null : Number(el.value));
                } else {
                    v = el.value;
                }
                if (f.type === 'select' && f.create) {
                    const spec = _createSpec(f);
                    // A typed value that is an option's text IS that option,
                    // with the option's own value (a number stays a number).
                    const match = comboOption(f, v);
                    if (match) v = match.value;
                    else if (v) {
                        if (submitBtn) submitBtn.disabled = true;
                        let created;
                        let failMsg = null;
                        try { created = await spec.onCreate(v); }
                        catch (err) { created = null; failMsg = err?.message || String(err); }
                        if (submitBtn) submitBtn.disabled = false;
                        if (created == null) {
                            const hint = spec.hint || f.label.toLowerCase();
                            showError(failMsg
                                ? `Couldn't create ${hint} "${v}": ${failMsg}`
                                : `Couldn't create ${hint} "${v}". See the toast for details.`);
                            return;
                        }
                        v = created;
                    }
                }
                data[f.name] = v;
            }
            // Per-field validators run after collection so they can see
            // peer values (e.g. confirm-password matches password).
            let firstBadName = null;
            for (const f of formFields) {
                clearFieldError(f.name);
                if (rowHidden(f.name)) {
                    // Not asked about — but a disabled option is still never
                    // the value: a hidden row holding one submits no value.
                    if (unavailable(f, data[f.name]) != null) data[f.name] = f.type === 'radio' ? null : '';
                    continue;
                }
                const v = data[f.name];
                // A picker's value lives in a hidden input, and a checklist or
                // radio is no single control, so the browser's own `required`
                // check never sees them — they are checked here.
                let msg = f.required && _missing(f, v) ? 'Required.' : null;
                if (!msg && _outOfRange(f, v)) msg = _rangeMessage(f);
                if (!msg) {
                    const reason = unavailable(f, v);
                    if (reason != null) msg = reason ? `Not available: ${reason}` : 'Not available.';
                }
                if (!msg) msg = controls.get(f.name)?.error?.() ?? null;
                if (!msg && typeof f.validator === 'function') {
                    try { msg = f.validator(v, data); } catch (err) { msg = err?.message || String(err); }
                }
                if (msg) {
                    setFieldError(f.name, msg);
                    if (!firstBadName) firstBadName = f.name;
                }
            }
            if (firstBadName) {
                controls.get(firstBadName)?.focus();
                body.querySelector(`[data-picker="${firstBadName}"]`)?.focus();
                body.querySelector(`[name="${firstBadName}"]:not([type="hidden"])`)?.focus();
                return;
            }
            close(data);
        });

        // Focus first field on next frame so the managed-window mount
        // settles before we steal focus.
        // Not a picker's hidden value, and not a field in a row that
        // `onFieldChange` hid on open.
        requestAnimationFrame(() => {
            const first = [...body.querySelectorAll('input:not([type="hidden"]), select, textarea')]
                .find((el) => !el.closest('[data-field-row]')?.hidden);
            first?.focus();
        });
    });
}


/**
 * `openConfirm` — a yes/no modal. Resolves `true` on confirm, `false` on
 * cancel, Esc, X or backdrop.
 *
 * `message`, `confirmLabel` and `cancelLabel` are TEXT, never markup: callers
 * put user-named things in them ("Delete flow "<name>"?"), so they are set
 * with `textContent` and a `<` in a name shows as a `<`. A `\n` in `message`
 * breaks the line (`white-space: pre-line` on `.twm-modal__body--text`).
 */
export function openConfirm({
    title, message, confirmLabel = 'OK',
    cancelLabel = 'Cancel',
    danger = false, icon = null,
} = {}) {
    return new Promise((resolve) => {
        const body = document.createElement('div');
        body.className = 'twm-modal__body-host';

        const messageEl = document.createElement('div');
        messageEl.className = 'twm-modal__body twm-modal__body--text';
        messageEl.textContent = message == null ? '' : String(message);

        const actionsEl = document.createElement('div');
        actionsEl.className = 'twm-modal__actions';
        const button = (action, className, label) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = className;
            btn.dataset.action = action;
            btn.textContent = label == null ? '' : String(label);
            actionsEl.appendChild(btn);
        };
        button('cancel', 'twm-btn', cancelLabel);
        button('confirm', danger ? 'twm-btn twm-btn--danger' : 'twm-btn twm-btn--primary', confirmLabel);

        body.append(messageEl, actionsEl);

        let _resolved = false;
        const win = new ManagedWindow({
            container: _modalHost,
            id: `twm-confirm-${_modalSeq++}`,
            title: title || 'Confirm',
            icon: icon || (danger ? 'warning' : 'help'),
            content: body,
            modal: true,
            canMinimize: false,
            canMaximize: false,
            canResize: false,
            canDrag: true,
            defaultWidth: 380,
            defaultHeight: 180,
            onClose: () => { if (!_resolved) { _resolved = true; resolve(false); } },
        });
        win.show();
        const close = (v) => {
            if (_resolved) return;
            _resolved = true;
            resolve(v);
            try { win.close({ force: true }); } catch {}
        };
        body.querySelector('[data-action="cancel"]').addEventListener('click', () => close(false));
        body.querySelector('[data-action="confirm"]').addEventListener('click', () => close(true));
        requestAnimationFrame(() => {
            body.querySelector(`[data-action="${danger ? 'cancel' : 'confirm'}"]`)?.focus();
        });
    });
}


/**
 * `openModal` — rich-content modal. The third helper alongside
 * `openForm` (field-based) and `openConfirm` (yes/no).
 *
 * Use when the modal body is arbitrary DOM the caller renders itself
 * — a chart, a Monaco editor, a table, a diff view. The shell still
 * goes through ManagedWindow so the chrome, focus trap, Esc handling,
 * and z-stacking match every other modal in the app.
 *
 * Schema:
 *   - `title`     window title (string)
 *   - `icon`      optional material-symbols-outlined glyph for the
 *                 title bar; defaults to `info`
 *   - `content`   HTMLElement appended into the body. Caller owns
 *                 rendering — `openModal` doesn't size or style the
 *                 internal content beyond making it scrollable.
 *   - `actions`   `[{ label, value, primary?, danger?, icon? }, …]`. If
 *                 omitted, defaults to a single `[Close]` action that
 *                 resolves with `null`. The first action with
 *                 `primary: true` is the rightmost; otherwise the
 *                 last action wins. Esc / X / backdrop resolve with
 *                 `null` regardless of what's in `actions`. `icon` is
 *                 an optional material-symbols-outlined ligature drawn
 *                 BEFORE the label; when it is given the label lives in
 *                 a `.twm-btn__label` span, because an icon font's
 *                 ligature name is itself text and would otherwise be
 *                 read back as part of the label.
 *   - `width`,
 *     `height`    initial size in px. Defaults: 640 × 480.
 *   - `onMount`   optional `(contentEl) => void` invoked once after
 *                 the content is appended — handy when the caller
 *                 needs the bounding rect to size a chart / Monaco /
 *                 SVG inside the body.
 *   - `backdropBlur`     backdrop blur radius in px (`0` disables it).
 *   - `backdropOpacity`  backdrop dim, 0 (clear) … 1 (opaque). Use a low
 *                 value (with `backdropBlur: 0`) to keep the background
 *                 legible — e.g. a live-applied editor where you want to
 *                 watch the content behind update. Omit both to inherit
 *                 the default look (blur 2px over a 50% dim).
 *   - `maximizable`      C29. Draw a maximise button in the title bar.
 *                 Default `false`, which is byte-for-byte what every
 *                 existing caller has always got.
 *   - `onMaximizeChange` `(maximized, contentEl) => void`, called on each
 *                 flip. Only useful with `maximizable`.
 *
 * ══ C29. WHY A DIALOG'S MAXIMISE IS THE GEOMETRIC ONE ═══════════════════
 *
 * Everywhere else in this library maximise means BACK TO TILE: the window
 * stops being a window and its content returns to the tile it came out of.
 * That is R14, it is the product owner's ruling — *"maximize here means back
 * to tile"* — and it holds for the chrome button, the title bar's
 * double-click, an embedder's window menu and the aero-snap top edge alike.
 *
 * A DIALOG HAS NO TILE. It was never lifted out of one; it is modal, it owns
 * the screen until it resolves, and "back to tile" names a destination that
 * does not exist for it. So here maximise can only mean the rectangle, and
 * that is not a contradiction of the ruling but its boundary: THE RULING IS
 * ABOUT WINDOWS THAT CAME FROM A TILE. Do not "fix" this into a dock — there
 * is nothing to dock into, and `bringBackWindow` would refuse it anyway.
 *
 * Mechanically that means setting no `onMaximize` at all rather than reaching
 * for `toggleMaximize({claimable: false})`: with nothing claiming the gesture,
 * the ordinary path IS the rectangle, and the escape hatch is for consumers
 * who have claimed it.
 *
 * The dialog stays a dialog while maximised — `modal: true` is untouched, so
 * the backdrop, the Esc handler and the Tab focus trap (all of which hang off
 * `this.element` and the top-most-window test, not off geometry) go on working
 * exactly as they did.
 *
 * Returns a Promise resolving with the chosen action's `value`, or
 * `null` if the user dismissed the modal.
 */
export function openModal({
    title    = 'Dialog',
    icon     = 'info',
    content  = null,
    actions  = null,
    width    = 640,
    height   = 480,
    onMount  = null,
    backdropBlur    = undefined,
    backdropOpacity = undefined,
    maximizable      = false,
    onMaximizeChange = null,
} = {}) {
    return new Promise((resolve) => {
        const body = document.createElement('div');
        body.className = 'twm-modal__body-host';

        const bodyInner = document.createElement('div');
        bodyInner.className = 'twm-modal__body twm-modal__body--rich';
        if (content instanceof HTMLElement) bodyInner.appendChild(content);
        body.appendChild(bodyInner);

        // Actions row — default = single Close button. Esc / backdrop /
        // X all bypass this and resolve with null.
        const acts = Array.isArray(actions) && actions.length > 0
            ? actions
            : [{ label: 'Close', value: null }];
        const actionsEl = document.createElement('div');
        actionsEl.className = 'twm-modal__actions';
        acts.forEach((a, i) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            let cls = 'twm-btn';
            if (a.primary) cls += ' twm-btn--primary';
            if (a.danger)  cls += ' twm-btn--danger';
            btn.className = cls;
            // C26. AN ACTION MAY CARRY A GLYPH — additively, and only when it
            // asks for one. Without `icon` the button is byte-identical to what
            // every existing caller gets today: one text node, so a consumer
            // reading `btn.textContent` to find its own button keeps working.
            //
            // With one, the label moves into its own span so that reading it
            // back is still possible: an icon font's ligature name IS text
            // content ("save" renders as a glyph but reads as the word), so a
            // bare `textContent` on a button with an icon would answer
            // "saveSave". `.twm-btn__label` is the answer to "what does this
            // button say", and `aria-hidden` on the glyph is what keeps a screen
            // reader from saying the ligature name out loud beside the label.
            if (a.icon) {
                const glyph = document.createElement('span');
                glyph.className = 'material-symbols-outlined twm-btn__glyph';
                glyph.textContent = String(a.icon);
                glyph.setAttribute('aria-hidden', 'true');
                const text = document.createElement('span');
                text.className = 'twm-btn__label';
                text.textContent = String(a.label || '');
                btn.append(glyph, text);
            } else {
                btn.textContent = String(a.label || '');
            }
            btn.dataset.actionIdx = String(i);
            // C27. AN ACTION MAY START DISABLED, and be enabled later.
            //
            // Every action here dismisses the dialog and resolves the promise —
            // that is the documented contract, and it is why a caller cannot
            // "refuse" a submit: by the time it sees the value, the form and
            // everything typed into it are gone. So a dialog whose primary
            // action is not yet valid has had exactly two options: let the user
            // press it and lose their work to a toast, or reach into this markup
            // from outside, which is the coupling C6 exists to remove.
            //
            // `disabled` plus the controller handed to `onMount` is the third.
            // Absent — every existing caller — the button is enabled exactly as
            // before.
            if (a.disabled) btn.disabled = true;
            if (a.value !== undefined && a.value !== null) {
                btn.dataset.actionValue = String(a.value);
            }
            actionsEl.appendChild(btn);
        });
        body.appendChild(actionsEl);

        let _resolved = false;
        // DECLARED BEFORE THE WINDOW, INSTALLED AFTER IT. `onClose` below closes
        // over `_dropMaxListener`, and `show()` runs between the two — so
        // leaving the declaration down where the listener is installed would
        // stretch a temporal dead zone across a call that could come back
        // through `onClose`. The cost of getting that wrong is a ReferenceError
        // inside a dismissal, which is the least debuggable place in this file.
        let _onMax = null;
        const _dropMaxListener = () => {
            if (!_onMax) return;
            window.removeEventListener('managed-window-maximized', _onMax);
            _onMax = null;
        };
        const win = new ManagedWindow({
            container: _modalHost,
            id: `twm-modal-${_modalSeq++}`,
            title,
            icon,
            content: body,
            modal: true,
            backdropBlur,
            backdropOpacity,
            canMinimize: false,
            // C29. OPT-IN, and `false` is still the default — a confirmation
            // and a two-field form have nothing to do with the extra room, and
            // a button that grows a dialog nobody wanted grown is noise in the
            // one place a user looks for the X. `onMaximize` is deliberately
            // NOT set: see the C29 note in the header — with nothing claiming
            // the gesture, `toggleMaximize` runs the rectangle, which is the
            // only thing maximise can mean for a window with no tile.
            canMaximize: !!maximizable,
            canResize: true,
            canDrag: true,
            defaultWidth:  width,
            defaultHeight: height,
            // Esc, the X and the backdrop all land here without passing through
            // `close`, so the listener is dropped here as well as there — the
            // three dismissals a user reaches for most are exactly the ones
            // that would otherwise leak it.
            onClose: () => {
                _dropMaxListener();
                if (!_resolved) { _resolved = true; resolve(null); }
            },
        });
        win.show();

        // C29. THE STATE, FOR A CALLER WHOSE LAYOUT DEPENDS ON IT.
        //
        // `managed-window-maximized` (C16) is the framework's own edge and it
        // is global, so it is filtered on the id — the alternative, wrapping
        // `win.toggleMaximize`, would miss `_restoreState`'s replay of a
        // persisted maximised window and any consumer calling the method
        // directly. Removed on close: a dialog is short-lived and twenty of
        // them over a session leaving listeners behind is a leak with no
        // symptom until the twenty-first.
        //
        // The CSS half needs no listener at all — `ManagedWindow` toggles
        // `.twm-managed-window--maximized` on its own element, which is an
        // ancestor of everything in here, so a stylesheet can respond without
        // any of this. The callback is for the layout a stylesheet cannot
        // reach: content whose height was fixed by the CALLER's own rules.
        if (maximizable && typeof onMaximizeChange === 'function') {
            _onMax = (e) => {
                if (e.detail?.id !== win.id) return;
                try { onMaximizeChange(!!e.detail.maximized, bodyInner); }
                catch (err) { console.warn('[modal] onMaximizeChange threw', err); }
            };
            window.addEventListener('managed-window-maximized', _onMax);
        }

        const close = (value) => {
            if (_resolved) return;
            _resolved = true;
            _dropMaxListener();
            resolve(value);
            try { win.close({ force: true }); } catch {}
        };
        actionsEl.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action-idx]');
            if (!btn) return;
            const idx = Number(btn.dataset.actionIdx);
            const a = acts[idx];
            if (!a) return;
            // `keepOpen` actions are side-effects (Copy, Apply
            // Without Close, etc.): if the action's `onClick` returns
            // anything (or just runs), the modal stays open. Use this
            // for Copy buttons and the like.
            if (a.keepOpen) {
                // `onClick` receives `close` so the handler can
                // validate, do an async side-effect, and only then
                // dismiss the modal with whatever value it chooses.
                // Returning early without calling `close` leaves the
                // modal open (which is the whole point of keepOpen).
                try { a.onClick?.(close); } catch (err) { console.warn(err); }
                return;
            }
            close(a.value);
        });

        /**
         * C27. What `onMount` is handed alongside the body, so a form can keep
         * its own submit honest without knowing this file's markup.
         *
         * Addressed by an action's VALUE rather than its index: an index is a
         * fact about the order the caller happened to list them in, and a caller
         * that inserted a "Save and add another" in the middle would silently
         * start disabling Cancel.
         */
        const controls = {
            // NOT `CSS.escape`. It is a browser global that jsdom does not
            // provide, and this file is mounted under jsdom by four render
            // tests — so reaching for it turns "the dialog is valid" into a
            // ReferenceError in every one of them, and into nothing at all in a
            // headless consumer. An attribute selector needs `"` and `\`
            // escaped and nothing else.
            actionButton: (value) => actionsEl.querySelector(
                `[data-action-value="${String(value).replace(/["\\]/g, '\\$&')}"]`),
            setActionEnabled(value, enabled) {
                const btn = controls.actionButton(value);
                if (btn) btn.disabled = !enabled;
                return !!btn;
            },
        };

        // onMount runs after the next frame so layout has settled and
        // the inner content has a real bounding box for sizing.
        if (typeof onMount === 'function') {
            requestAnimationFrame(() => {
                try { onMount(bodyInner, controls); } catch (err) { console.warn(err); }
            });
        }
        // C28. THE FIRST FIELD, IF THERE IS ONE. Otherwise the primary button.
        //
        // A dialog that asks for a name should let you type it: *"on any 'new'
        // dialog I would like to have the first input focused by default, so
        // that I can directly start typing."* Focusing the action button first
        // means every new table, project and column begins with a click into a
        // field that was the only place the caret could sensibly have been.
        //
        // The button remains the fallback, which is what keeps Enter useful on
        // a dialog that asks nothing — a confirmation has no field, and there
        // the primary action IS the answer.
        //
        // DISABLED CONTROLS ARE SKIPPED, and so is anything `readonly`: a form
        // whose first control is a read-only statement panel (C27's disabled
        // primary is the sibling case) would swallow the caret into a box that
        // cannot take it.
        requestAnimationFrame(() => {
            const field = bodyInner.querySelector(
                'input:not([type="hidden"]):not([disabled]):not([readonly]),'
              + ' textarea:not([disabled]):not([readonly]),'
              + ' select:not([disabled])');
            if (field) {
                field.focus();
                // The caret at the END of whatever is already there, not
                // selecting it: an edit dialog opens on a value the user means
                // to amend, and a selected value is one keystroke from gone.
                try { field.setSelectionRange?.(field.value.length, field.value.length); }
                catch { /* a `select`, or an input type with no selection */ }
                return;
            }
            const idx = acts.findIndex((a) => a.primary);
            const which = idx >= 0 ? idx : acts.length - 1;
            actionsEl.querySelector(`[data-action-idx="${which}"]`)?.focus();
        });
    });
}


// ─── helpers ────────────────────────────────────────────────────────

function _estimateHeight(fields) {
    // Header (~36) + actions row (~46) + section dividers (~32 each)
    // + per-field rows (~46 text, ~140 textarea, ~32 checkbox)
    // + body padding. Clamped to 200..80vh. A `{ row }` is as tall as its
    // tallest field.
    const height = (f) => {
        if (f.section) return 32;
        const hint = f.hint ? 16 : 0;
        if (f.type === 'textarea') return 32 + (Number(f.rows) || 4) * 18 + hint;
        if (f.type === 'checkbox' || f.type === 'toggle') return 32 + hint;
        if (f.type === 'colorList') {
            const n = Array.isArray(f.default) ? f.default.length : 0;
            return 46 + Math.max(n, 1) * 40 + 40 + hint;
        }
        if (f.type === 'color') return 46 + (Array.isArray(f.presets) && f.presets.length ? 28 : 0) + hint;
        if (f.type === 'radio') {
            const opts = flatChoices(f.options);
            return 12 + opts.reduce((h, o) => h + 22 + (o.description || o.reason ? 16 : 0), 0) + hint;
        }
        return 46 + hint;
    };
    let body = 0;
    for (const f of fields) {
        body += Array.isArray(f?.row) ? Math.max(0, ..._formFields(f.row).map(height)) : height(f);
    }
    const base = 36 + 46 + 28 + body;
    const max = Math.floor(window.innerHeight * 0.8);
    return Math.max(200, Math.min(base, max));
}

function _estimateWidth(fields) {
    // Forms with a textarea, a colour list, a section divider or a row of
    // fields get the wider layout so multi-line content + grouped fields
    // breathe; otherwise 480 px is enough for label + single-line input pairs.
    const wide = fields.some((f) => f && (f.type === 'textarea' || f.type === 'colorList' || f.section || Array.isArray(f.row)))
        || _formFields(fields).some((f) => f.type === 'textarea' || f.type === 'colorList');
    return wide ? 640 : 480;
}

/** The fields of a form's entries, rows opened up, headings left out. */
function _formFields(entries) {
    return entries.flatMap((e) => (Array.isArray(e?.row) ? e.row : [e])).filter((f) => f && f.section == null);
}

/** Does a field carry a `min` or a `max`? */
function _bounded(f) {
    return f.min != null || f.max != null;
}

/** Is a `number` field's submitted value outside its `min` / `max`? */
function _outOfRange(f, v) {
    if (f.type !== 'number' || !_bounded(f) || v == null || Number.isNaN(v)) return false;
    return (f.min != null && v < Number(f.min)) || (f.max != null && v > Number(f.max));
}

/** The field error for a number outside its bounds. */
function _rangeMessage(f) {
    if (f.min != null && f.max != null) return `Must be between ${f.min} and ${f.max}.`;
    return f.min != null ? `Must be at least ${f.min}.` : `Must be at most ${f.max}.`;
}

/** A combobox's offered options: enabled, groups flattened. */
function _offered(options) {
    return flatChoices(options).filter((o) => !o.disabled);
}

function _datalistOptions(options) {
    return _offered(options).map((o) => `<option value="${_esc(o.value)}"></option>`).join('');
}

/**
 * Mount a field that is a component rather than markup — a `toggle`, a
 * `select` (not a combobox), `checklist` or `radio` drawn by
 * `choice_controls.js`, or a `color` / `colorList` — into the
 * `data-control-slot` its row left, and hand back what the form needs of it:
 * `{ read(), write(v), focus(), unavailable(), submit?(), error?(),
 * setOptions?(options), dispose?() }`. `unavailable()` is the reason (or '')
 * when the selected option is disabled, else null. `submit()`, where given,
 * is the value submitted when it differs from what `read()` shows (a colour's
 * hex, null while its box holds none), and `error()` is the field's own
 * message for a value it cannot submit, else null. `onChange(name)` hears the
 * reader's choice on a checklist or radio; a toggle or select is a named
 * control, heard as one. Null for any other field.
 */
function _mountControl(host, f, value, onChange) {
    const slot = host.querySelector(`[data-control-slot="${f.name}"]`);
    if (!slot) return null;
    if (f.type === 'toggle') {
        // Mounted INTO the slot: the slot is the row's `.twm-modal__toggle`
        // cell, and the switch's own root is the <label>.
        const toggle = new ToggleField({
            name: f.name,
            checked: value === true || value === 'true',
            ariaLabel: f.label || f.name,
            onText: f.onText ?? null,
            offText: f.offText ?? null,
            disabled: !!f.disabled,
            compact: !!f.compact,
        });
        slot.appendChild(toggle.render());
        return {
            read: () => toggle.get(),
            write: (v) => toggle.set(v),
            focus: () => toggle.input?.focus(),
            unavailable: () => null,
            dispose: () => toggle.dispose(),
        };
    }
    if (f.type === 'color' || f.type === 'colorList') {
        // Read as their text as it stands (a list as its rows' text), submitted
        // as hex: `getValue()` is null while a box holds no hex colour.
        const c = f.type === 'color'
            ? new ColorField({ name: f.name, value: value ?? '', presets: f.presets, label: f.label })
            : new ColorListField({ name: f.name, value: value ?? [], presets: f.presets });
        slot.replaceWith(c.render());
        const list = f.type === 'colorList';
        return {
            read: () => (list ? c.getTexts() : c.getText()),
            submit: () => c.getValue(),
            write: (v) => c.setValue(v),
            focus: () => c.focus(),
            unavailable: () => null,
            error: () => {
                if (c.getValue() !== null) return null;
                if (!list) return 'Not a hex colour: use #rgb or #rrggbb.';
                const bad = c.invalidIndexes().map((i) => i + 1).join(', ');
                return `Not a hex colour (row ${bad}): use #rgb or #rrggbb.`;
            },
            dispose: () => c.dispose(),
        };
    }
    const common = { keepMissing: false, loose: true };
    const disabledReason = (entry) => (entry?.disabled ? (entry.reason || '') : null);
    if (f.type === 'select') {
        const c = selectBox(f.options, value, { ...common, valueAttr: 'value', className: '' });
        c.box.name = f.name;
        if (f.required) c.box.required = true;
        slot.replaceWith(c.box);
        return {
            // No option selected reads '', as an empty select always has (and
            // as it submits); a selected option reads as its own value.
            read: () => (c.entry() ? c.entry().value : ''),
            // A value the list does not offer enabled clears the select, as
            // writing an unknown `.value` always has (it then submits '').
            write: (v) => { if (!c.select(v)) c.box.selectedIndex = -1; },
            focus: () => c.box.focus(),
            unavailable: () => disabledReason(c.entry()),
            setOptions: c.setOptions,
        };
    }
    const list = (v) => (Array.isArray(v) ? v : (v == null || v === '' ? [] : [v]));
    if (f.type === 'checklist') {
        const c = toggleChips({ ...common, options: f.options, value: list(value), label: f.label || f.name,
                                onChange: () => onChange(f.name) });
        slot.replaceWith(c.el);
        return {
            read: c.valueOf,
            write: (v) => c.setValue(list(v)),
            focus: () => c.el.querySelector('button:not(:disabled)')?.focus(),
            unavailable: () => null,           // a disabled chip cannot be pressed, by hand or by set
            setOptions: c.setOptions,
        };
    }
    const c = choiceList({ ...common, options: f.options, value, label: f.label || f.name,
                           name: `twm-form-${_modalSeq}-${f.name}`, onChange: () => onChange(f.name) });
    slot.replaceWith(c.el);
    return {
        read: () => c.valueOf() ?? null,
        write: (v) => { c.select(v); },
        focus: c.focus,
        unavailable: () => disabledReason(c.entry()),
        setOptions: c.setOptions,
    };
}

/** Is a `required` field without a value the browser cannot check for itself? */
function _missing(f, v) {
    if (f.type === 'picker') return !v;
    if (f.type === 'checklist') return !Array.isArray(v) || v.length === 0;
    if (f.type === 'radio') return v == null;
    // A colour that is not a hex (null) is its own error, not a missing one.
    if (f.type === 'color') return v === '';
    if (f.type === 'colorList') return Array.isArray(v) && v.length === 0;
    return false;
}

/** Normalise a `create` spec. `true` means the typed value is accepted as-is. */
function _createSpec(f) {
    if (!f || !f.create) return null;
    if (f.create === true) return { onCreate: async (v) => v, hint: null };
    return {
        onCreate: typeof f.create.onCreate === 'function' ? f.create.onCreate : async (v) => v,
        hint: f.create.hint ?? null,
    };
}

/** What a picker shows for `value`: the caller's `displayFor`, else the value. */
function _pickerLabel(f, value) {
    if (typeof f.displayFor !== 'function') return value == null ? '' : String(value);
    try { return String(f.displayFor(value) ?? ''); }
    catch (err) { console.warn('[modal] displayFor threw', err); return String(value ?? ''); }
}

/** Hook a picker field's search button up to the caller's `pick()`, and keep
 *  the hidden value and the visible display in step. */
function _wirePicker(host, f) {
    const hidden = host.querySelector(`input[type="hidden"][name="${f.name}"]`);
    const display = host.querySelector(`[data-picker-display="${f.name}"]`);
    const btn = host.querySelector(`[data-picker="${f.name}"]`);
    if (!hidden || !display || !btn || typeof f.pick !== 'function') return;

    let busy = false;
    const open = async () => {
        if (busy) return;                           // one search at a time
        busy = true;
        let picked;
        try { picked = await f.pick(hidden.value); }
        catch (err) { console.warn('[modal] pick threw', err); picked = null; }
        finally { busy = false; }
        if (picked == null) return;                 // cancelled — leave it alone
        const isPair = typeof picked === 'object';
        hidden.value = String((isPair ? picked.value : picked) ?? '');
        display.value = isPair && picked.label != null
            ? String(picked.label) : _pickerLabel(f, hidden.value);
        // A hidden input fires no `change` of its own; this is the one the
        // field-error clear and `onFieldChange` listen for.
        hidden.dispatchEvent(new Event('change', { bubbles: true }));
    };
    btn.addEventListener('click', open);
    // The read-only box is the obvious thing to click; make it work too.
    display.addEventListener('click', open);
}


/** Show / hide the "↳ will create …" hint as the user types into a
 *  create-capable combobox. */
function _wireComboboxHint(host, f, optionsOf) {
    const input = host.querySelector(`input[name="${f.name}"]`);
    const hintEl = host.querySelector(`.twm-combobox__hint[data-for="${f.name}"]`);
    if (!input || !hintEl) return;
    // With `create: true` the typed value simply IS the value — there is no
    // entity being made, so promising to "create" one is a lie that reads as
    // a warning.
    if (f.create === true) return;
    const label = _createSpec(f).hint || 'new entry';
    const update = () => {
        const v = input.value.trim();
        const known = new Set(flatChoices(optionsOf()).map((o) => String(o.value)));
        if (v && !known.has(v)) {
            hintEl.textContent = `↳ will create ${label} “${v}”`;
            hintEl.hidden = false;
        } else {
            hintEl.hidden = true;
        }
    };
    input.addEventListener('input', update);
    update();
    return update;
}


function _renderEntry(f, defaults) {
    if (f && f.section != null) {
        // A named section is addressable by `setVisible`, so a heading can be
        // hidden along with the group it introduces.
        const attr = f.name ? ` data-field-row="${f.name}"` : '';
        return `<div class="twm-modal__section"${attr}>${_esc(f.section)}</div>`;
    }
    // A row is layout only: each field in it is rendered exactly as it would
    // be on its own line, with its own `data-field-row`.
    if (Array.isArray(f?.row)) {
        const cells = _formFields(f.row).map((g) => _renderField(g, defaults[g.name] ?? g.default));
        return `<div class="twm-modal__field-group">${cells.join('')}</div>`;
    }
    return _renderField(f, defaults[f.name] ?? f.default);
}

function _renderField(f, value) {
    const required = f.required ? 'required' : '';
    const rowMod = (f.type === 'textarea' || f.type === 'checklist' || f.type === 'radio')
        ? ' twm-modal__row--multiline' : '';
    const hintHtml = f.hint
        ? `<div class="twm-modal__hint--field">${_esc(f.hint)}</div>` : '';
    const errHtml = `<div class="twm-modal__field-error" data-field-error="${f.name}" hidden></div>`;
    const wrap = (inner, tag = 'label') => `
        <${tag} class="twm-modal__row${rowMod}" data-field-row="${f.name}">
            <span>${_esc(f.label || '')}</span>
            ${inner}
            ${hintHtml}
            ${errHtml}
        </${tag}>
    `;
    // A component's place, filled once the markup is in (`_mountControl`).
    const slot = `<span data-control-slot="${f.name}"></span>`;

    if (f.type === 'checkbox') {
        const checked = (value === true || value === 'true') ? 'checked' : '';
        return `
            <label class="twm-modal__row" data-field-row="${f.name}">
                <span></span>
                <span class="twm-modal__check">
                    <input name="${f.name}" type="checkbox" ${checked}>
                    <span>${_esc(f.label || '')}</span>
                </span>
                ${hintHtml}
                ${errHtml}
            </label>
        `;
    }

    // A group of controls is not one labelable control: a `<label>` round it
    // would hand every click on the row to its first chip or radio.
    if (f.type === 'checklist' || f.type === 'radio') return wrap(slot, 'div');

    // A div, not a label: the switch's own root is the <label>, and a label
    // may not hold another.
    if (f.type === 'toggle') {
        return wrap(`<span class="twm-modal__toggle" data-control-slot="${f.name}"></span>`, 'div');
    }

    if (f.type === 'textarea') {
        const v = value == null ? '' : String(value);
        const rows = f.rows != null ? `rows="${Number(f.rows) || 4}"` : 'rows="4"';
        const placeholder = f.placeholder ? `placeholder="${_esc(f.placeholder)}"` : '';
        return wrap(`<textarea name="${f.name}" ${rows} ${placeholder} ${required}>${_esc(v)}</textarea>`);
    }

    if (f.type === 'color' || f.type === 'colorList') {
        // The component is mounted into the slot by `_mountControl`. A list
        // is a group of controls, so its row is not a <label>: a label would
        // hand every click on it to the first row's swatch.
        if (f.type === 'color') return wrap(slot);
        return `
            <div class="twm-modal__row twm-modal__row--multiline" data-field-row="${f.name}" role="group" aria-label="${_esc(f.label || '')}">
                <span>${_esc(f.label || '')}</span>
                ${slot}
                ${hintHtml}
                ${errHtml}
            </div>
        `;
    }
    const v = value == null ? '' : String(value);
    if (f.type === 'picker') {
        // The display text and the stored value are different things (an id
        // vs. "EPIC-0001 — Auth rewrite"), so the value rides in a hidden
        // input — the one the submit reads by name — and the visible box is
        // read-only.
        const placeholder = f.placeholder ? `placeholder="${_esc(f.placeholder)}"` : '';
        return wrap(`
            <div class="twm-picker">
                <input type="hidden" name="${f.name}" value="${_esc(v)}">
                <input class="twm-picker__display" data-picker-display="${f.name}" type="text"
                       value="${_esc(_pickerLabel(f, v))}" ${placeholder} readonly>
                <button type="button" class="twm-btn twm-picker__btn" data-picker="${f.name}"
                        aria-label="Search" title="Search">
                    <span class="material-symbols-outlined" aria-hidden="true">search</span>
                </button>
            </div>
        `);
    }
    if (f.type === 'select' && f.create) {
        // A default naming a disabled option is not taken, as in a select.
        const shown = findChoice(flatChoices(f.options), value, true)?.disabled ? '' : v;
        const dlId = `ea-dl-${f.name}-${_modalSeq}`;
        const opts = _datalistOptions(f.options);
        const placeholder = f.placeholder
            ? `placeholder="${_esc(f.placeholder)}"` : 'placeholder="type to pick or create…"';
        return wrap(`
            <div class="twm-combobox">
                <input name="${f.name}" type="text" list="${dlId}"
                       value="${_esc(shown)}" ${placeholder} ${required}
                       autocomplete="off">
                <datalist id="${dlId}" data-datalist-for="${f.name}">${opts}</datalist>
                <span class="twm-combobox__hint" data-for="${f.name}" hidden></span>
            </div>
        `);
    }
    if (f.type === 'select') return wrap(slot);
    const step = f.step != null ? `step="${f.step}"` : '';
    const placeholder = f.placeholder ? `placeholder="${_esc(f.placeholder)}"` : '';
    const type = (f.type === 'number' || f.type === 'password') ? f.type : 'text';
    // Attributes only a bounded number has, so no other input's markup moves.
    let bounds = '';
    if (f.type === 'number' && f.min != null) bounds += ` min="${_esc(f.min)}"`;
    if (f.type === 'number' && f.max != null) bounds += ` max="${_esc(f.max)}"`;
    return wrap(`<input name="${f.name}" type="${type}" value="${_esc(v)}" ${step}${bounds} ${placeholder} ${required}>`);
}

function _esc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
