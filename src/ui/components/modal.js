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
 *   { name, label, type='text', default, step?, options?, required?,
 *     placeholder?, hint?, validator?, rows?, create?, pick?, displayFor? }
 *
 *   - type: 'text' | 'number' | 'password' | 'select' | 'textarea' |
 *           'checkbox' | 'picker' | 'color' | 'colorList'
 *   - hint: small dim help line rendered under the field
 *   - validator: fn(value, allValues) => string | null    (inline error)
 *   - rows: number of textarea rows (only used for type='textarea')
 *
 * Section dividers — entries of the form `{ section: 'Label' }` are
 * rendered as a small uppercase heading that groups the fields below
 * them. Useful for longer forms. A section that also carries a `name`
 * can be hidden and shown by `onFieldChange`'s `setVisible`.
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
import { ColorField } from './color_field.js';
import { ColorListField } from './color_list_field.js';

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
 *   `{ setVisible(name, on), get(name), set(name, value) }`, addressing fields
 *   and named sections by name. `get` reads the control as it stands (a
 *   checkbox as a boolean, everything else as its string); `set` writes it and
 *   does NOT call `onFieldChange` back, so a hook that fills one field from
 *   another cannot loop.
 *
 *   It exists for the form whose Type select spans two record kinds and must
 *   show the fields of the kind actually chosen. Rebuilding the form on every
 *   change would lose what the user had already typed, so every field is
 *   built once and the irrelevant rows are hidden. A hidden row keeps its
 *   value and is still submitted — the caller drops what its chosen kind does
 *   not use — but it is not ASKED about: its `required` and its `validator`
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
                    ${fields.map((f) => _renderEntry(f, defaults[f.name] ?? f.default)).join('')}
                </div>
                <div class="twm-modal__error" data-role="form-error" hidden></div>
                <div class="twm-modal__actions">
                    <button type="button" class="twm-btn" data-action="cancel">Cancel</button>
                    <button type="submit" class="twm-btn twm-btn--primary">${submitLabel}</button>
                </div>
            </form>
        `;
        // Colour fields are components, mounted into the placeholders their
        // rows rendered; everything below reaches them by name like any field.
        const components = _mountColorFields(body, fields, defaults);

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
                if (_resolved) return;
                _resolved = true;
                for (const c of components.values()) c.dispose();
                resolve(null);
            },
        });
        win.show();

        let _resolved = false;
        const close = (result) => {
            if (_resolved) return;
            _resolved = true;
            for (const c of components.values()) c.dispose();
            resolve(result);
            try { win.close({ force: true }); } catch {}
        };

        const errEl = body.querySelector('[data-role="form-error"]');
        const showError = (msg) => {
            if (!errEl) return;
            errEl.textContent = msg;
            errEl.hidden = !msg;
        };
        body.querySelector('[data-action="cancel"]')?.addEventListener('click', () => close(null));

        const formFields = fields.filter((f) => !f.section);
        for (const f of formFields) {
            if (f.type === 'select' && f.create) _wireComboboxHint(body, f);
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
        // Clear per-field errors on input so the user sees the row recover.
        for (const f of formFields) {
            const el = body.querySelector(`[name="${f.name}"]`);
            el?.addEventListener('input', () => clearFieldError(f.name));
            el?.addEventListener('change', () => clearFieldError(f.name));
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
                    // no message the user can find. Remembered on the control,
                    // so showing the row gives back exactly what it had.
                    for (const el of row.querySelectorAll('input, select, textarea')) {
                        if (!on && el.required) { el.required = false; el.dataset.twmRequired = '1'; }
                        else if (on && el.dataset.twmRequired) { el.required = true; delete el.dataset.twmRequired; }
                    }
                },
                get(name) {
                    // A colour list is a list: its rows' text, as it stands.
                    if (fieldOf(name)?.type === 'colorList') return components.get(name).getTexts();
                    const el = body.querySelector(`[name="${name}"]`);
                    if (!el) return undefined;
                    return el.type === 'checkbox' ? !!el.checked : el.value;
                },
                set(name, value) {
                    // Through the component, so the swatch follows the value.
                    if (components.has(name)) { components.get(name).setValue(value); return; }
                    const el = body.querySelector(`[name="${name}"]`);
                    if (!el) return;
                    if (el.type === 'checkbox') { el.checked = !!value; return; }
                    el.value = value == null ? '' : String(value);
                    const f = fieldOf(name);
                    if (f?.type === 'picker') {
                        const display = body.querySelector(`[data-picker-display="${name}"]`);
                        if (display) display.value = _pickerLabel(f, el.value);
                    }
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
                const el = body.querySelector(`[name="${f.name}"]`);
                if (!el) continue;
                let v;
                if (components.has(f.name)) {
                    v = components.get(f.name).getValue();
                } else if (f.type === 'checkbox') {
                    v = !!el.checked;
                } else if (f.type === 'number') {
                    v = (el.value === '' ? null : Number(el.value));
                } else {
                    v = el.value;
                }
                if (f.type === 'select' && f.create) {
                    const spec = _createSpec(f);
                    const known = new Set(_optionValues(f.options));
                    if (v && !known.has(v)) {
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
                if (rowHidden(f.name)) continue;
                let msg = _builtinError(f, data[f.name], components.get(f.name));
                if (!msg && typeof f.validator === 'function') {
                    try { msg = f.validator(data[f.name], data); } catch (err) { msg = err?.message || String(err); }
                }
                if (msg) {
                    setFieldError(f.name, msg);
                    if (!firstBadName) firstBadName = f.name;
                }
            }
            if (firstBadName) {
                components.get(firstBadName)?.focus();
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
    // + body padding. Clamped to 200..80vh.
    let body = 0;
    for (const f of fields) {
        if (f.section) body += 32;
        else if (f.type === 'textarea') {
            const rows = Number(f.rows) || 4;
            body += 32 + rows * 18;
            if (f.hint) body += 16;
        }
        else if (f.type === 'checkbox') { body += 32; if (f.hint) body += 16; }
        else if (f.type === 'colorList') {
            const n = Array.isArray(f.default) ? f.default.length : 0;
            body += 46 + Math.max(n, 1) * 40 + 40;
            if (f.hint) body += 16;
        }
        else if (f.type === 'color') {
            body += 46 + (Array.isArray(f.presets) && f.presets.length ? 28 : 0);
            if (f.hint) body += 16;
        }
        else { body += 46; if (f.hint) body += 16; }
    }
    const base = 36 + 46 + 28 + body;
    const max = Math.floor(window.innerHeight * 0.8);
    return Math.max(200, Math.min(base, max));
}

function _estimateWidth(fields) {
    // Forms with a textarea or section divider get the wider layout so
    // multi-line content + grouped fields breathe; otherwise 480 px is
    // enough for label + single-line input pairs.
    const wide = fields.some((f) => f && (f.type === 'textarea' || f.type === 'colorList' || f.section));
    return wide ? 640 : 480;
}

function _optionValues(options) {
    return (options || []).map((o) => (typeof o === 'object') ? o.value : o);
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


/** Mount a ColorField / ColorListField into each colour row's placeholder.
 *  Returns name -> component. */
function _mountColorFields(host, fields, defaults) {
    const components = new Map();
    for (const f of fields) {
        if (!f || f.section != null) continue;
        if (f.type !== 'color' && f.type !== 'colorList') continue;
        const slot = host.querySelector(`[data-color-slot="${f.name}"]`);
        if (!slot) continue;
        const value = defaults[f.name] ?? f.default;
        const c = f.type === 'color'
            ? new ColorField({ name: f.name, value: value ?? '', presets: f.presets, label: f.label })
            : new ColorListField({ name: f.name, value: value ?? [], presets: f.presets });
        slot.replaceWith(c.render());
        components.set(f.name, c);
    }
    return components;
}

/** The form's own checks, before a caller's `validator`: a picker's
 *  `required` (its value lives in a hidden input, which the browser's
 *  `required` check skips) and a colour's hex. */
function _builtinError(f, value, component) {
    if (f.type === 'picker') return f.required && !value ? 'Required.' : null;
    if (f.type === 'color') {
        if (value === null) return 'Not a hex colour: use #rgb or #rrggbb.';
        return f.required && !value ? 'Required.' : null;
    }
    if (f.type === 'colorList') {
        if (value === null) {
            const bad = component.invalidIndexes().map((i) => i + 1).join(', ');
            return `Not a hex colour (row ${bad}): use #rgb or #rrggbb.`;
        }
        return f.required && !value.length ? 'Required.' : null;
    }
    return null;
}


/** Show / hide the "↳ will create …" hint as the user types into a
 *  create-capable combobox. */
function _wireComboboxHint(host, f) {
    const input = host.querySelector(`input[name="${f.name}"]`);
    const hintEl = host.querySelector(`.twm-combobox__hint[data-for="${f.name}"]`);
    if (!input || !hintEl) return;
    // With `create: true` the typed value simply IS the value — there is no
    // entity being made, so promising to "create" one is a lie that reads as
    // a warning.
    if (f.create === true) return;
    const known = new Set(_optionValues(f.options));
    const label = _createSpec(f).hint || 'new entry';
    const update = () => {
        const v = input.value.trim();
        if (v && !known.has(v)) {
            hintEl.textContent = `↳ will create ${label} “${v}”`;
            hintEl.hidden = false;
        } else {
            hintEl.hidden = true;
        }
    };
    input.addEventListener('input', update);
    update();
}


function _renderEntry(f, value) {
    if (f && f.section != null) {
        // A named section is addressable by `setVisible`, so a heading can be
        // hidden along with the group it introduces.
        const attr = f.name ? ` data-field-row="${f.name}"` : '';
        return `<div class="twm-modal__section"${attr}>${_esc(f.section)}</div>`;
    }
    return _renderField(f, value);
}

function _renderField(f, value) {
    const required = f.required ? 'required' : '';
    const rowMod = (f.type === 'textarea') ? ' twm-modal__row--multiline' : '';
    const hintHtml = f.hint
        ? `<div class="twm-modal__hint--field">${_esc(f.hint)}</div>` : '';
    const errHtml = `<div class="twm-modal__field-error" data-field-error="${f.name}" hidden></div>`;
    const wrap = (inner) => `
        <label class="twm-modal__row${rowMod}" data-field-row="${f.name}">
            <span>${_esc(f.label || '')}</span>
            ${inner}
            ${hintHtml}
            ${errHtml}
        </label>
    `;

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

    if (f.type === 'textarea') {
        const v = value == null ? '' : String(value);
        const rows = f.rows != null ? `rows="${Number(f.rows) || 4}"` : 'rows="4"';
        const placeholder = f.placeholder ? `placeholder="${_esc(f.placeholder)}"` : '';
        return wrap(`<textarea name="${f.name}" ${rows} ${placeholder} ${required}>${_esc(v)}</textarea>`);
    }

    if (f.type === 'color' || f.type === 'colorList') {
        // The component is mounted here by `_mountColorFields`. A list is a
        // group of controls, so its row is not a <label>: a label would hand
        // every click on it to the first row's swatch.
        const slot = `<div data-color-slot="${f.name}"></div>`;
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
        const dlId = `ea-dl-${f.name}-${_modalSeq}`;
        const opts = _optionValues(f.options)
            .map((ov) => `<option value="${_esc(ov)}"></option>`).join('');
        const placeholder = f.placeholder
            ? `placeholder="${_esc(f.placeholder)}"` : 'placeholder="type to pick or create…"';
        return wrap(`
            <div class="twm-combobox">
                <input name="${f.name}" type="text" list="${dlId}"
                       value="${_esc(v)}" ${placeholder} ${required}
                       autocomplete="off">
                <datalist id="${dlId}">${opts}</datalist>
                <span class="twm-combobox__hint" data-for="${f.name}" hidden></span>
            </div>
        `);
    }
    if (f.type === 'select') {
        const opts = (f.options || []).map((o) => {
            const ov = (typeof o === 'object') ? o.value : o;
            const ol = (typeof o === 'object') ? o.label : o;
            return `<option value="${_esc(ov)}" ${ov === v ? 'selected' : ''}>${_esc(ol)}</option>`;
        }).join('');
        return wrap(`<select name="${f.name}" ${required}>${opts}</select>`);
    }
    const step = f.step != null ? `step="${f.step}"` : '';
    const placeholder = f.placeholder ? `placeholder="${_esc(f.placeholder)}"` : '';
    const type = (f.type === 'number' || f.type === 'password') ? f.type : 'text';
    return wrap(`<input name="${f.name}" type="${type}" value="${_esc(v)}" ${step} ${placeholder} ${required}>`);
}

function _esc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
