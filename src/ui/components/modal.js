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
 *     placeholder?, hint?, validator?, rows?, create? }
 *
 *   - type: 'text' | 'number' | 'password' | 'select' | 'textarea' |
 *           'checkbox'
 *   - hint: small dim help line rendered under the field
 *   - validator: fn(value, allValues) => string | null    (inline error)
 *   - rows: number of textarea rows (only used for type='textarea')
 *
 * Section dividers — entries of the form `{ section: 'Label' }` are
 * rendered as a small uppercase heading that groups the fields below
 * them. Useful for longer forms.
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
 */

import { ManagedWindow } from '../../ui/components/managed_window.js';

let _modalSeq = 1;

export function openForm({ title, fields = [], defaults = {}, submitLabel = 'OK' } = {}) {
    return new Promise((resolve) => {
        // Build the form body — same markup as the legacy overlay,
        // minus the outer .ea-modal wrapper (ManagedWindow owns the
        // chrome now).
        const body = document.createElement('div');
        body.className = 'twm-modal__body-host';
        body.innerHTML = `
            <form class="twm-modal__form">
                ${fields.map((f) => _renderEntry(f, defaults[f.name] ?? f.default)).join('')}
                <div class="twm-modal__error" data-role="form-error" hidden></div>
                <div class="twm-modal__actions">
                    <button type="button" class="twm-btn" data-action="cancel">Cancel</button>
                    <button type="submit" class="twm-btn twm-btn--primary">${submitLabel}</button>
                </div>
            </form>
        `;

        const win = new ManagedWindow({
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
            onClose: () => { if (!_resolved) { _resolved = true; resolve(null); } },
        });
        win.show();

        let _resolved = false;
        const close = (result) => {
            if (_resolved) return;
            _resolved = true;
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
        }

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

        body.querySelector('form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = body.querySelector('button[type="submit"]');
            showError('');
            const data = {};
            for (const f of formFields) {
                const el = body.querySelector(`[name="${f.name}"]`);
                if (!el) continue;
                let v;
                if (f.type === 'checkbox') {
                    v = !!el.checked;
                } else if (f.type === 'number') {
                    v = (el.value === '' ? null : Number(el.value));
                } else {
                    v = el.value;
                }
                if (f.type === 'select' && f.create) {
                    const known = new Set(_optionValues(f.options));
                    if (v && !known.has(v)) {
                        if (submitBtn) submitBtn.disabled = true;
                        let created;
                        let failMsg = null;
                        try { created = await f.create.onCreate(v); }
                        catch (err) { created = null; failMsg = err?.message || String(err); }
                        if (submitBtn) submitBtn.disabled = false;
                        if (created == null) {
                            const hint = (f.create && f.create.hint) || f.label.toLowerCase();
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
                if (typeof f.validator !== 'function') continue;
                let msg = null;
                try { msg = f.validator(data[f.name], data); } catch (err) { msg = err?.message || String(err); }
                if (msg) {
                    setFieldError(f.name, msg);
                    if (!firstBadName) firstBadName = f.name;
                }
            }
            if (firstBadName) {
                body.querySelector(`[name="${firstBadName}"]`)?.focus();
                return;
            }
            close(data);
        });

        // Focus first field on next frame so the managed-window mount
        // settles before we steal focus.
        requestAnimationFrame(() => {
            body.querySelector('input, select, textarea')?.focus();
        });
    });
}


export function openConfirm({
    title, message, confirmLabel = 'OK',
    cancelLabel = 'Cancel',
    danger = false, icon = null,
} = {}) {
    return new Promise((resolve) => {
        const body = document.createElement('div');
        body.className = 'twm-modal__body-host';
        const cls = danger ? 'twm-btn twm-btn--danger' : 'twm-btn twm-btn--primary';
        body.innerHTML = `
            <div class="twm-modal__body">${message}</div>
            <div class="twm-modal__actions">
                <button type="button" class="twm-btn" data-action="cancel">${cancelLabel}</button>
                <button type="button" class="${cls}" data-action="confirm">${confirmLabel}</button>
            </div>
        `;

        let _resolved = false;
        const win = new ManagedWindow({
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
 *   - `actions`   `[{ label, value, primary?, danger? }, …]`. If
 *                 omitted, defaults to a single `[Close]` action that
 *                 resolves with `null`. The first action with
 *                 `primary: true` is the rightmost; otherwise the
 *                 last action wins. Esc / X / backdrop resolve with
 *                 `null` regardless of what's in `actions`.
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
            btn.textContent = String(a.label || '');
            btn.dataset.actionIdx = String(i);
            actionsEl.appendChild(btn);
        });
        body.appendChild(actionsEl);

        let _resolved = false;
        const win = new ManagedWindow({
            id: `twm-modal-${_modalSeq++}`,
            title,
            icon,
            content: body,
            modal: true,
            backdropBlur,
            backdropOpacity,
            canMinimize: false,
            canMaximize: false,
            canResize: true,
            canDrag: true,
            defaultWidth:  width,
            defaultHeight: height,
            onClose: () => { if (!_resolved) { _resolved = true; resolve(null); } },
        });
        win.show();

        const close = (value) => {
            if (_resolved) return;
            _resolved = true;
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

        // onMount runs after the next frame so layout has settled and
        // the inner content has a real bounding box for sizing.
        if (typeof onMount === 'function') {
            requestAnimationFrame(() => {
                try { onMount(bodyInner); } catch (err) { console.warn(err); }
            });
        }
        // Focus the primary button (or the last action) so Enter
        // resolves the most-likely intended outcome.
        requestAnimationFrame(() => {
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
        else if (f.type === 'checkbox') body += 32;
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
    const wide = fields.some((f) => f && (f.type === 'textarea' || f.section));
    return wide ? 640 : 480;
}

function _optionValues(options) {
    return (options || []).map((o) => (typeof o === 'object') ? o.value : o);
}


/** Show / hide the "↳ will create …" hint as the user types into a
 *  create-capable combobox. */
function _wireComboboxHint(host, f) {
    const input = host.querySelector(`input[name="${f.name}"]`);
    const hintEl = host.querySelector(`.twm-combobox__hint[data-for="${f.name}"]`);
    if (!input || !hintEl) return;
    const known = new Set(_optionValues(f.options));
    const label = (f.create && f.create.hint) || 'new entry';
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
        return `<div class="twm-modal__section">${_esc(f.section)}</div>`;
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

    const v = value == null ? '' : String(value);
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
