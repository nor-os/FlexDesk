import {
  ManagedWindow
} from "./chunk-6JSOVNID.js";

// src/ui/components/modal.js
var _modalHost = null;
function setModalHost(el) {
  _modalHost = el || null;
}
function modalHost() {
  return _modalHost;
}
var _modalSeq = 1;
function openForm({ title, fields = [], defaults = {}, submitLabel = "OK" } = {}) {
  return new Promise((resolve) => {
    const body = document.createElement("div");
    body.className = "twm-modal__body-host";
    body.innerHTML = `
            <form class="twm-modal__form">
                ${fields.map((f) => _renderEntry(f, defaults[f.name] ?? f.default)).join("")}
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
      title: title || "Dialog",
      icon: "edit_note",
      content: body,
      modal: true,
      canMinimize: false,
      canMaximize: false,
      canResize: false,
      canDrag: true,
      defaultWidth: _estimateWidth(fields),
      defaultHeight: _estimateHeight(fields),
      onClose: () => {
        if (!_resolved) {
          _resolved = true;
          resolve(null);
        }
      }
    });
    win.show();
    let _resolved = false;
    const close = (result) => {
      if (_resolved) return;
      _resolved = true;
      resolve(result);
      try {
        win.close({ force: true });
      } catch {
      }
    };
    const errEl = body.querySelector('[data-role="form-error"]');
    const showError = (msg) => {
      if (!errEl) return;
      errEl.textContent = msg;
      errEl.hidden = !msg;
    };
    body.querySelector('[data-action="cancel"]')?.addEventListener("click", () => close(null));
    const formFields = fields.filter((f) => !f.section);
    for (const f of formFields) {
      if (f.type === "select" && f.create) _wireComboboxHint(body, f);
    }
    const clearFieldError = (name) => {
      const row = body.querySelector(`[data-field-row="${name}"]`);
      const errEl2 = body.querySelector(`[data-field-error="${name}"]`);
      if (row) row.classList.remove("twm-is-invalid");
      if (errEl2) {
        errEl2.textContent = "";
        errEl2.hidden = true;
      }
    };
    const setFieldError = (name, msg) => {
      const row = body.querySelector(`[data-field-row="${name}"]`);
      const errEl2 = body.querySelector(`[data-field-error="${name}"]`);
      if (row) row.classList.add("twm-is-invalid");
      if (errEl2) {
        errEl2.textContent = msg;
        errEl2.hidden = false;
      }
    };
    for (const f of formFields) {
      const el = body.querySelector(`[name="${f.name}"]`);
      el?.addEventListener("input", () => clearFieldError(f.name));
      el?.addEventListener("change", () => clearFieldError(f.name));
    }
    body.querySelector("form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const submitBtn = body.querySelector('button[type="submit"]');
      showError("");
      const data = {};
      for (const f of formFields) {
        const el = body.querySelector(`[name="${f.name}"]`);
        if (!el) continue;
        let v;
        if (f.type === "checkbox") {
          v = !!el.checked;
        } else if (f.type === "number") {
          v = el.value === "" ? null : Number(el.value);
        } else {
          v = el.value;
        }
        if (f.type === "select" && f.create) {
          const known = new Set(_optionValues(f.options));
          if (v && !known.has(v)) {
            if (submitBtn) submitBtn.disabled = true;
            let created;
            let failMsg = null;
            try {
              created = await f.create.onCreate(v);
            } catch (err) {
              created = null;
              failMsg = err?.message || String(err);
            }
            if (submitBtn) submitBtn.disabled = false;
            if (created == null) {
              const hint = f.create && f.create.hint || f.label.toLowerCase();
              showError(failMsg ? `Couldn't create ${hint} "${v}": ${failMsg}` : `Couldn't create ${hint} "${v}". See the toast for details.`);
              return;
            }
            v = created;
          }
        }
        data[f.name] = v;
      }
      let firstBadName = null;
      for (const f of formFields) {
        clearFieldError(f.name);
        if (typeof f.validator !== "function") continue;
        let msg = null;
        try {
          msg = f.validator(data[f.name], data);
        } catch (err) {
          msg = err?.message || String(err);
        }
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
    requestAnimationFrame(() => {
      body.querySelector("input, select, textarea")?.focus();
    });
  });
}
function openConfirm({
  title,
  message,
  confirmLabel = "OK",
  cancelLabel = "Cancel",
  danger = false,
  icon = null
} = {}) {
  return new Promise((resolve) => {
    const body = document.createElement("div");
    body.className = "twm-modal__body-host";
    const cls = danger ? "twm-btn twm-btn--danger" : "twm-btn twm-btn--primary";
    body.innerHTML = `
            <div class="twm-modal__body">${message}</div>
            <div class="twm-modal__actions">
                <button type="button" class="twm-btn" data-action="cancel">${cancelLabel}</button>
                <button type="button" class="${cls}" data-action="confirm">${confirmLabel}</button>
            </div>
        `;
    let _resolved = false;
    const win = new ManagedWindow({
      container: _modalHost,
      id: `twm-confirm-${_modalSeq++}`,
      title: title || "Confirm",
      icon: icon || (danger ? "warning" : "help"),
      content: body,
      modal: true,
      canMinimize: false,
      canMaximize: false,
      canResize: false,
      canDrag: true,
      defaultWidth: 380,
      defaultHeight: 180,
      onClose: () => {
        if (!_resolved) {
          _resolved = true;
          resolve(false);
        }
      }
    });
    win.show();
    const close = (v) => {
      if (_resolved) return;
      _resolved = true;
      resolve(v);
      try {
        win.close({ force: true });
      } catch {
      }
    };
    body.querySelector('[data-action="cancel"]').addEventListener("click", () => close(false));
    body.querySelector('[data-action="confirm"]').addEventListener("click", () => close(true));
    requestAnimationFrame(() => {
      body.querySelector(`[data-action="${danger ? "cancel" : "confirm"}"]`)?.focus();
    });
  });
}
function openModal({
  title = "Dialog",
  icon = "info",
  content = null,
  actions = null,
  width = 640,
  height = 480,
  onMount = null,
  backdropBlur = void 0,
  backdropOpacity = void 0,
  maximizable = false,
  onMaximizeChange = null
} = {}) {
  return new Promise((resolve) => {
    const body = document.createElement("div");
    body.className = "twm-modal__body-host";
    const bodyInner = document.createElement("div");
    bodyInner.className = "twm-modal__body twm-modal__body--rich";
    if (content instanceof HTMLElement) bodyInner.appendChild(content);
    body.appendChild(bodyInner);
    const acts = Array.isArray(actions) && actions.length > 0 ? actions : [{ label: "Close", value: null }];
    const actionsEl = document.createElement("div");
    actionsEl.className = "twm-modal__actions";
    acts.forEach((a, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      let cls = "twm-btn";
      if (a.primary) cls += " twm-btn--primary";
      if (a.danger) cls += " twm-btn--danger";
      btn.className = cls;
      if (a.icon) {
        const glyph = document.createElement("span");
        glyph.className = "material-symbols-outlined twm-btn__glyph";
        glyph.textContent = String(a.icon);
        glyph.setAttribute("aria-hidden", "true");
        const text = document.createElement("span");
        text.className = "twm-btn__label";
        text.textContent = String(a.label || "");
        btn.append(glyph, text);
      } else {
        btn.textContent = String(a.label || "");
      }
      btn.dataset.actionIdx = String(i);
      if (a.disabled) btn.disabled = true;
      if (a.value !== void 0 && a.value !== null) {
        btn.dataset.actionValue = String(a.value);
      }
      actionsEl.appendChild(btn);
    });
    body.appendChild(actionsEl);
    let _resolved = false;
    let _onMax = null;
    const _dropMaxListener = () => {
      if (!_onMax) return;
      window.removeEventListener("managed-window-maximized", _onMax);
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
      defaultWidth: width,
      defaultHeight: height,
      // Esc, the X and the backdrop all land here without passing through
      // `close`, so the listener is dropped here as well as there — the
      // three dismissals a user reaches for most are exactly the ones
      // that would otherwise leak it.
      onClose: () => {
        _dropMaxListener();
        if (!_resolved) {
          _resolved = true;
          resolve(null);
        }
      }
    });
    win.show();
    if (maximizable && typeof onMaximizeChange === "function") {
      _onMax = (e) => {
        if (e.detail?.id !== win.id) return;
        try {
          onMaximizeChange(!!e.detail.maximized, bodyInner);
        } catch (err) {
          console.warn("[modal] onMaximizeChange threw", err);
        }
      };
      window.addEventListener("managed-window-maximized", _onMax);
    }
    const close = (value) => {
      if (_resolved) return;
      _resolved = true;
      _dropMaxListener();
      resolve(value);
      try {
        win.close({ force: true });
      } catch {
      }
    };
    actionsEl.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action-idx]");
      if (!btn) return;
      const idx = Number(btn.dataset.actionIdx);
      const a = acts[idx];
      if (!a) return;
      if (a.keepOpen) {
        try {
          a.onClick?.(close);
        } catch (err) {
          console.warn(err);
        }
        return;
      }
      close(a.value);
    });
    const controls = {
      // NOT `CSS.escape`. It is a browser global that jsdom does not
      // provide, and this file is mounted under jsdom by four render
      // tests — so reaching for it turns "the dialog is valid" into a
      // ReferenceError in every one of them, and into nothing at all in a
      // headless consumer. An attribute selector needs `"` and `\`
      // escaped and nothing else.
      actionButton: (value) => actionsEl.querySelector(
        `[data-action-value="${String(value).replace(/["\\]/g, "\\$&")}"]`
      ),
      setActionEnabled(value, enabled) {
        const btn = controls.actionButton(value);
        if (btn) btn.disabled = !enabled;
        return !!btn;
      }
    };
    if (typeof onMount === "function") {
      requestAnimationFrame(() => {
        try {
          onMount(bodyInner, controls);
        } catch (err) {
          console.warn(err);
        }
      });
    }
    requestAnimationFrame(() => {
      const field = bodyInner.querySelector(
        'input:not([type="hidden"]):not([disabled]):not([readonly]), textarea:not([disabled]):not([readonly]), select:not([disabled])'
      );
      if (field) {
        field.focus();
        try {
          field.setSelectionRange?.(field.value.length, field.value.length);
        } catch {
        }
        return;
      }
      const idx = acts.findIndex((a) => a.primary);
      const which = idx >= 0 ? idx : acts.length - 1;
      actionsEl.querySelector(`[data-action-idx="${which}"]`)?.focus();
    });
  });
}
function _estimateHeight(fields) {
  let body = 0;
  for (const f of fields) {
    if (f.section) body += 32;
    else if (f.type === "textarea") {
      const rows = Number(f.rows) || 4;
      body += 32 + rows * 18;
      if (f.hint) body += 16;
    } else if (f.type === "checkbox") body += 32;
    else {
      body += 46;
      if (f.hint) body += 16;
    }
  }
  const base = 36 + 46 + 28 + body;
  const max = Math.floor(window.innerHeight * 0.8);
  return Math.max(200, Math.min(base, max));
}
function _estimateWidth(fields) {
  const wide = fields.some((f) => f && (f.type === "textarea" || f.section));
  return wide ? 640 : 480;
}
function _optionValues(options) {
  return (options || []).map((o) => typeof o === "object" ? o.value : o);
}
function _wireComboboxHint(host, f) {
  const input = host.querySelector(`input[name="${f.name}"]`);
  const hintEl = host.querySelector(`.twm-combobox__hint[data-for="${f.name}"]`);
  if (!input || !hintEl) return;
  const known = new Set(_optionValues(f.options));
  const label = f.create && f.create.hint || "new entry";
  const update = () => {
    const v = input.value.trim();
    if (v && !known.has(v)) {
      hintEl.textContent = `\u21B3 will create ${label} \u201C${v}\u201D`;
      hintEl.hidden = false;
    } else {
      hintEl.hidden = true;
    }
  };
  input.addEventListener("input", update);
  update();
}
function _renderEntry(f, value) {
  if (f && f.section != null) {
    return `<div class="twm-modal__section">${_esc(f.section)}</div>`;
  }
  return _renderField(f, value);
}
function _renderField(f, value) {
  const required = f.required ? "required" : "";
  const rowMod = f.type === "textarea" ? " twm-modal__row--multiline" : "";
  const hintHtml = f.hint ? `<div class="twm-modal__hint--field">${_esc(f.hint)}</div>` : "";
  const errHtml = `<div class="twm-modal__field-error" data-field-error="${f.name}" hidden></div>`;
  const wrap = (inner) => `
        <label class="twm-modal__row${rowMod}" data-field-row="${f.name}">
            <span>${_esc(f.label || "")}</span>
            ${inner}
            ${hintHtml}
            ${errHtml}
        </label>
    `;
  if (f.type === "checkbox") {
    const checked = value === true || value === "true" ? "checked" : "";
    return `
            <label class="twm-modal__row" data-field-row="${f.name}">
                <span></span>
                <span class="twm-modal__check">
                    <input name="${f.name}" type="checkbox" ${checked}>
                    <span>${_esc(f.label || "")}</span>
                </span>
                ${hintHtml}
                ${errHtml}
            </label>
        `;
  }
  if (f.type === "textarea") {
    const v2 = value == null ? "" : String(value);
    const rows = f.rows != null ? `rows="${Number(f.rows) || 4}"` : 'rows="4"';
    const placeholder2 = f.placeholder ? `placeholder="${_esc(f.placeholder)}"` : "";
    return wrap(`<textarea name="${f.name}" ${rows} ${placeholder2} ${required}>${_esc(v2)}</textarea>`);
  }
  const v = value == null ? "" : String(value);
  if (f.type === "select" && f.create) {
    const dlId = `ea-dl-${f.name}-${_modalSeq}`;
    const opts = _optionValues(f.options).map((ov) => `<option value="${_esc(ov)}"></option>`).join("");
    const placeholder2 = f.placeholder ? `placeholder="${_esc(f.placeholder)}"` : 'placeholder="type to pick or create\u2026"';
    return wrap(`
            <div class="twm-combobox">
                <input name="${f.name}" type="text" list="${dlId}"
                       value="${_esc(v)}" ${placeholder2} ${required}
                       autocomplete="off">
                <datalist id="${dlId}">${opts}</datalist>
                <span class="twm-combobox__hint" data-for="${f.name}" hidden></span>
            </div>
        `);
  }
  if (f.type === "select") {
    const opts = (f.options || []).map((o) => {
      const ov = typeof o === "object" ? o.value : o;
      const ol = typeof o === "object" ? o.label : o;
      return `<option value="${_esc(ov)}" ${ov === v ? "selected" : ""}>${_esc(ol)}</option>`;
    }).join("");
    return wrap(`<select name="${f.name}" ${required}>${opts}</select>`);
  }
  const step = f.step != null ? `step="${f.step}"` : "";
  const placeholder = f.placeholder ? `placeholder="${_esc(f.placeholder)}"` : "";
  const type = f.type === "number" || f.type === "password" ? f.type : "text";
  return wrap(`<input name="${f.name}" type="${type}" value="${_esc(v)}" ${step} ${placeholder} ${required}>`);
}
function _esc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export {
  setModalHost,
  modalHost,
  openForm,
  openConfirm,
  openModal
};
//# sourceMappingURL=chunk-6NG7YVBG.js.map
