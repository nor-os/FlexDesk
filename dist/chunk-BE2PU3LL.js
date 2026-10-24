import {
  ColorField,
  ManagedWindow,
  ToggleField,
  choiceList,
  findChoice,
  flatChoices,
  isHexColor,
  normalizeHex,
  selectBox,
  toggleChips
} from "./chunk-CVMCZZX2.js";
import {
  DragReorder
} from "./chunk-WUFLGETN.js";

// src/ui/components/sortable_list.js
var ROW_CLASS = "twm-sortable-list__row";
var ROW_SELECTOR = `.${ROW_CLASS}`;
var HANDLE_CLASS = "twm-sortable-list__handle";
var HANDLE_SELECTOR = `.${HANDLE_CLASS}`;
var SortableList = class {
  /**
   * Create a sortable list.
   * @param {Object} options - Configuration options
   * @param {string} options.containerId - Unique ID for the container
   * @param {Array} options.items - Initial items array
   * @param {Function} options.onChange - Called with updated items array when list changes
   * @param {Function} options.renderItem - Custom renderer for item content (receives item, index, callbacks)
   * @param {Function} options.createItem - Factory function to create new items
   * @param {string} options.emptyMessage - Message to show when list is empty
   * @param {string} options.addButtonText - Text for add button
   * @param {boolean} options.allowReorder - Whether to allow drag-and-drop reordering
   * @param {boolean} options.allowRemove - Whether to allow removing items
   * @param {number} options.minItems - Minimum number of items (blocks removal if at min)
   */
  constructor({
    containerId,
    items = [],
    onChange = null,
    renderItem = null,
    createItem = null,
    emptyMessage = "No items",
    addButtonText = "Add Item",
    allowReorder = true,
    allowRemove = true,
    minItems = 0
  } = {}) {
    this.containerId = containerId || `sortable-list-${Date.now()}`;
    this.items = Array.isArray(items) ? [...items] : [];
    this.onChange = typeof onChange === "function" ? onChange : null;
    this.renderItem = typeof renderItem === "function" ? renderItem : this.#defaultRenderItem.bind(this);
    this.createItem = typeof createItem === "function" ? createItem : this.#defaultCreateItem.bind(this);
    this.emptyMessage = emptyMessage;
    this.addButtonText = addButtonText;
    this.allowReorder = allowReorder;
    this.allowRemove = allowRemove;
    this.minItems = minItems;
    this.root = null;
    this.listEl = null;
    this._dragReorder = null;
    this._pressedHandle = false;
  }
  /**
   * Render the sortable list.
   * @returns {HTMLElement} The root container element
   */
  render() {
    if (this.root) {
      this.#refresh();
      return this.root;
    }
    this.root = document.createElement("div");
    this.root.className = "twm-sortable-list";
    this.root.id = this.containerId;
    this.listEl = document.createElement("div");
    this.listEl.className = "twm-sortable-list__items";
    this.root.appendChild(this.listEl);
    if (this.addButtonText) {
      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "twm-sortable-list__add";
      addBtn.innerHTML = `<span class="material-symbols-outlined">add</span> ${this.#escapeHtml(this.addButtonText)}`;
      addBtn.addEventListener("click", () => this.addItem());
      this.root.appendChild(addBtn);
    }
    this.#refresh();
    return this.root;
  }
  /**
   * Get current items.
   * @returns {Array} Copy of items array
   */
  getItems() {
    return [...this.items];
  }
  /**
   * Set items and re-render.
   * @param {Array} items - New items array
   */
  setItems(items) {
    this.items = Array.isArray(items) ? [...items] : [];
    this.#refresh();
  }
  /**
   * Add a new item.
   */
  addItem() {
    const newItem = this.createItem(this.items.length);
    this.items.push(newItem);
    this.#notifyChange();
    this.#refresh();
  }
  /**
   * Remove an item by index.
   * @param {number} index - Index of item to remove
   */
  removeItem(index) {
    if (index < 0 || index >= this.items.length) return;
    if (this.items.length <= this.minItems) return;
    this.items.splice(index, 1);
    this.#notifyChange();
    this.#refresh();
  }
  /**
   * Update an item at index.
   * @param {number} index - Index of item to update
   * @param {Object} updates - Properties to merge into item
   */
  updateItem(index, updates) {
    if (index < 0 || index >= this.items.length) return;
    this.items[index] = { ...this.items[index], ...updates };
    this.#notifyChange();
  }
  /**
   * Move an item from one index to another.
   * @param {number} fromIndex - Source index
   * @param {number} toIndex - Destination index
   */
  moveItem(fromIndex, toIndex) {
    if (fromIndex < 0 || fromIndex >= this.items.length) return;
    if (toIndex < 0 || toIndex >= this.items.length) return;
    if (fromIndex === toIndex) return;
    const [item] = this.items.splice(fromIndex, 1);
    this.items.splice(toIndex, 0, item);
    this.#notifyChange();
    this.#refresh();
  }
  /**
   * Dispose the component.
   */
  dispose() {
    this._dragReorder?.destroy();
    this._dragReorder = null;
    this.root = null;
    this.listEl = null;
    this.items = [];
  }
  // ─── Private Methods ───────────────────────────────────────────────────
  #refresh() {
    if (!this.listEl) return;
    this.listEl.innerHTML = "";
    if (this.items.length === 0) {
      const empty = document.createElement("div");
      empty.className = "twm-sortable-list__empty";
      empty.textContent = this.emptyMessage;
      this.listEl.appendChild(empty);
      return;
    }
    this.items.forEach((item, index) => {
      const row = this.#createRow(item, index);
      this.listEl.appendChild(row);
    });
    if (this.allowReorder) {
      if (!this._dragReorder) {
        this.listEl.addEventListener("mousedown", (e) => {
          this._pressedHandle = !!e.target.closest?.(HANDLE_SELECTOR);
        });
        this._dragReorder = new DragReorder({
          container: this.listEl,
          itemSelector: ROW_SELECTOR,
          keyAttr: "index",
          axis: "y",
          indicatorClass: "twm-sortable-list__drop",
          draggableGuard: () => {
            const fromHandle = this._pressedHandle;
            this._pressedHandle = false;
            return fromHandle;
          },
          onReorder: (order) => this.#applyReorder(order)
        });
      }
      this._dragReorder.attach();
    }
  }
  /** Reorder `items` to match the new DOM order produced by a drag,
   *  then notify + re-render. `order` holds the rows' pre-drag
   *  `data-index` values in their new arrangement. */
  #applyReorder(order) {
    const next = order.map((i) => this.items[Number(i)]).filter((it) => it !== void 0);
    if (next.length !== this.items.length) return;
    this.items = next;
    this.#notifyChange();
    this.#refresh();
  }
  #createRow(item, index) {
    const row = document.createElement("div");
    row.className = ROW_CLASS;
    row.dataset.index = index;
    if (this.allowReorder) {
      const handle = document.createElement("div");
      handle.className = HANDLE_CLASS;
      handle.innerHTML = '<span class="material-symbols-outlined">drag_indicator</span>';
      row.appendChild(handle);
    }
    const content = document.createElement("div");
    content.className = "twm-sortable-list__content";
    const callbacks = {
      update: (updates) => this.updateItem(index, updates),
      remove: () => this.removeItem(index),
      moveUp: () => this.moveItem(index, index - 1),
      moveDown: () => this.moveItem(index, index + 1)
    };
    this.renderItem(content, item, index, callbacks);
    row.appendChild(content);
    if (this.allowRemove) {
      const canRemove = this.items.length > this.minItems;
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "twm-sortable-list__remove";
      removeBtn.disabled = !canRemove;
      removeBtn.title = canRemove ? "Remove" : `Minimum ${this.minItems} items required`;
      removeBtn.innerHTML = '<span class="material-symbols-outlined">close</span>';
      removeBtn.addEventListener("click", () => {
        if (canRemove) this.removeItem(index);
      });
      row.appendChild(removeBtn);
    }
    return row;
  }
  #defaultRenderItem(container, item, index, callbacks) {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "twm-sortable-list__input";
    input.value = item.name ?? item.label ?? "";
    input.placeholder = `Item ${index + 1}`;
    input.addEventListener("change", () => {
      callbacks.update({ name: input.value });
    });
    container.appendChild(input);
  }
  #defaultCreateItem(index) {
    return {
      id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      name: `item${index + 1}`
    };
  }
  #notifyChange() {
    if (this.onChange) {
      this.onChange([...this.items]);
    }
  }
  #escapeHtml(str) {
    return String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
};

// src/ui/components/color_list_field.js
var _seq = 0;
var hexOf = (text) => {
  const t = String(text ?? "").trim();
  return isHexColor(t) ? normalizeHex(t) : null;
};
var ColorListField = class {
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
    value = [],
    presets = [],
    newColor = "#000000",
    addLabel = "Add colour",
    name = null,
    onChange = null
  } = {}) {
    this.presets = Array.isArray(presets) ? presets : [];
    this.newColor = normalizeHex(String(newColor ?? "")) ?? String(newColor ?? "");
    this.addLabel = addLabel;
    this.name = name;
    this.onChange = typeof onChange === "function" ? onChange : null;
    this._fields = [];
    this._commit = true;
    this._rowEdit = false;
    this.list = new SortableList({
      items: this.#toItems(value),
      addButtonText: addLabel,
      emptyMessage: "No colours",
      createItem: () => ({ id: ++_seq, text: this.newColor }),
      renderItem: (container, item, index, callbacks) => this.#renderRow(container, item, index, callbacks),
      // Every SortableList change but a row's own edit (add, remove,
      // move, drag) is followed by a refresh that rebuilds all rows —
      // down to none — so the old fields go first.
      onChange: () => {
        if (!this._rowEdit) this.#dropFields();
        this.#emit(this._commit);
      }
    });
    this.root = null;
    this.input = null;
  }
  render() {
    if (this.root) return this.root;
    const root = document.createElement("div");
    root.className = "twm-color-list";
    if (this.name) {
      const input = document.createElement("input");
      input.type = "hidden";
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
    return this.list.getItems().map((item) => String(item.text ?? ""));
  }
  /** Indexes of the rows that do not hold a hex colour. */
  invalidIndexes() {
    const bad = [];
    this.getTexts().forEach((text, i) => {
      if (!hexOf(text)) bad.push(i);
    });
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
    if (field) {
      field.focus();
      return;
    }
    this.root?.querySelector(".twm-sortable-list__add")?.focus();
  }
  dispose() {
    this.#dropFields();
    this.list.dispose();
    this.root = null;
    this.input = null;
  }
  #toItems(colors) {
    return (Array.isArray(colors) ? colors : []).map((c) => ({
      id: ++_seq,
      text: normalizeHex(String(c ?? "")) ?? String(c ?? "")
    }));
  }
  /** Dispose every row's field: the rows are about to be rebuilt. */
  #dropFields() {
    for (const f of this._fields) f?.dispose();
    this._fields = [];
  }
  #renderRow(container, item, index, callbacks) {
    const count = this.list.getItems().length;
    const row = document.createElement("div");
    row.className = "twm-color-list__row";
    const field = new ColorField({
      value: item.text,
      presets: this.presets,
      label: `Colour ${index + 1}`,
      // Every edit goes into the list's items, so the list never holds
      // a stale row; `_commit` tells its onChange which kind it was.
      onChange: (_v, { commit }) => {
        this._commit = commit;
        this._rowEdit = true;
        try {
          callbacks.update({ text: field.getText() });
        } finally {
          this._commit = true;
          this._rowEdit = false;
        }
      }
    });
    this._fields[index] = field;
    row.appendChild(field.render());
    const move = (icon, label, disabled, fn) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "twm-color-list__move";
      btn.title = label;
      btn.setAttribute("aria-label", label);
      btn.disabled = disabled;
      const glyph = document.createElement("span");
      glyph.className = "material-symbols-outlined";
      glyph.setAttribute("aria-hidden", "true");
      glyph.textContent = icon;
      btn.appendChild(glyph);
      btn.addEventListener("click", fn);
      row.appendChild(btn);
    };
    move("arrow_upward", "Move up", index === 0, callbacks.moveUp);
    move("arrow_downward", "Move down", index === count - 1, callbacks.moveDown);
    container.appendChild(row);
  }
  #writeInput() {
    if (this.input) this.input.value = JSON.stringify(this.getTexts());
  }
  #emit(commit) {
    this.#writeInput();
    if (this.input) {
      this.input.dispatchEvent(new Event("input", { bubbles: true }));
      if (commit) this.input.dispatchEvent(new Event("change", { bubbles: true }));
    }
    this.onChange?.(this.getValue(), { commit });
  }
};

// src/ui/components/modal.js
var _modalHost = null;
function setModalHost(el) {
  _modalHost = el || null;
}
function modalHost() {
  return _modalHost;
}
var _modalSeq = 1;
function openForm({ title, fields = [], defaults = {}, submitLabel = "OK", onFieldChange = null } = {}) {
  return new Promise((resolve) => {
    const body = document.createElement("div");
    body.className = "twm-modal__body-host";
    body.innerHTML = `
            <form class="twm-modal__form">
                <div class="twm-modal__fields">
                    ${fields.map((f) => _renderEntry(f, defaults)).join("")}
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
        disposeControls();
        if (!_resolved) {
          _resolved = true;
          resolve(null);
        }
      }
    });
    let _resolved = false;
    const close = (result) => {
      if (_resolved) return;
      _resolved = true;
      resolve(result);
      try {
        win.close({ force: true });
      } catch {
      }
      disposeControls();
    };
    const errEl = body.querySelector('[data-role="form-error"]');
    const showError = (msg) => {
      if (!errEl) return;
      errEl.textContent = msg;
      errEl.hidden = !msg;
    };
    body.querySelector('[data-action="cancel"]')?.addEventListener("click", () => close(null));
    const formFields = _formFields(fields);
    const optionsOf = new Map(formFields.map((f) => [f.name, f.options]));
    const comboHints = /* @__PURE__ */ new Map();
    for (const f of formFields) {
      if (f.type === "select" && f.create) {
        const update = _wireComboboxHint(body, f, () => optionsOf.get(f.name));
        if (update) comboHints.set(f.name, update);
      }
      if (f.type === "picker") _wirePicker(body, f);
    }
    const rowHidden = (name) => !!body.querySelector(`[data-field-row="${name}"]`)?.hidden;
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
    let onChoice = (name) => clearFieldError(name);
    const controls = /* @__PURE__ */ new Map();
    for (const f of formFields) {
      const c = _mountControl(body, f, defaults[f.name] ?? f.default, (name) => onChoice(name));
      if (c) controls.set(f.name, c);
    }
    function disposeControls() {
      for (const c of controls.values()) c.dispose?.();
      controls.clear();
    }
    win.show();
    const comboOption = (f, text) => findChoice(flatChoices(optionsOf.get(f.name)), text, true);
    const unavailable = (f, value) => {
      const c = controls.get(f.name);
      if (c) return c.unavailable();
      if (f.type !== "select" || !f.create || value == null || value === "") return null;
      const o = comboOption(f, value);
      return o?.disabled ? o.reason || "" : null;
    };
    for (const f of formFields) {
      const el = body.querySelector(`[name="${f.name}"]`);
      el?.addEventListener("input", () => clearFieldError(f.name));
      el?.addEventListener("change", () => clearFieldError(f.name));
      if (f.type === "number" && _bounded(f)) {
        el?.addEventListener("invalid", (e) => {
          if (!el.validity.rangeUnderflow && !el.validity.rangeOverflow) return;
          e.preventDefault();
          setFieldError(f.name, _rangeMessage(f));
        });
      }
    }
    if (typeof onFieldChange === "function") {
      const fieldOf = (name) => formFields.find((f) => f.name === name) || null;
      const api = {
        setVisible(name, on) {
          const row = body.querySelector(`[data-field-row="${name}"]`);
          if (!row) return;
          row.hidden = !on;
          row.style.display = on ? "" : "none";
          clearFieldError(name);
          for (const el of row.querySelectorAll("input, select, textarea")) {
            if (!on && el.required) {
              el.required = false;
              el.dataset.twmRequired = "1";
            } else if (on && el.dataset.twmRequired) {
              el.required = true;
              delete el.dataset.twmRequired;
            }
            for (const [attr, key] of [["min", "twmMin"], ["max", "twmMax"]]) {
              if (!on && el.hasAttribute(attr)) {
                el.dataset[key] = el.getAttribute(attr);
                el.removeAttribute(attr);
              } else if (on && el.dataset[key] != null) {
                el.setAttribute(attr, el.dataset[key]);
                delete el.dataset[key];
              }
            }
          }
        },
        get(name) {
          if (controls.has(name)) return controls.get(name).read();
          const el = body.querySelector(`[name="${name}"]`);
          if (!el) return void 0;
          if (el.type === "checkbox") return !!el.checked;
          const f = fieldOf(name);
          if (f?.type === "select" && f.create) {
            const match = comboOption(f, el.value);
            return match ? match.value : el.value;
          }
          return el.value;
        },
        set(name, value) {
          if (controls.has(name)) {
            controls.get(name).write(value);
            return;
          }
          const el = body.querySelector(`[name="${name}"]`);
          if (!el) return;
          if (el.type === "checkbox") {
            el.checked = !!value;
            return;
          }
          const f = fieldOf(name);
          const shut = f?.type === "select" && f.create && comboOption(f, value)?.disabled;
          el.value = value == null || shut ? "" : String(value);
          comboHints.get(name)?.();
          if (f?.type === "picker") {
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
          if (f.type !== "select" || !f.create) return;
          optionsOf.set(name, options);
          const list = body.querySelector(`[data-datalist-for="${name}"]`);
          if (list) list.innerHTML = _datalistOptions(options);
          comboHints.get(name)?.();
        }
      };
      const fire = (name) => {
        try {
          onFieldChange(name, name == null ? void 0 : api.get(name), api);
        } catch (err) {
          console.error("[modal] onFieldChange threw", err);
        }
      };
      for (const f of formFields) {
        const el = body.querySelector(`[name="${f.name}"]`);
        el?.addEventListener("change", () => fire(f.name));
      }
      onChoice = (name) => {
        clearFieldError(name);
        fire(name);
      };
      fire(null);
    }
    body.querySelector("form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const submitBtn = body.querySelector('button[type="submit"]');
      showError("");
      const data = {};
      for (const f of formFields) {
        const control = controls.get(f.name);
        const el = control ? null : body.querySelector(`[name="${f.name}"]`);
        if (!control && !el) continue;
        let v;
        if (control) {
          v = control.submit ? control.submit() : control.read();
          if (v === void 0) v = f.type === "select" ? "" : null;
        } else if (f.type === "checkbox") {
          v = !!el.checked;
        } else if (f.type === "number") {
          v = el.value === "" ? null : Number(el.value);
        } else {
          v = el.value;
        }
        if (f.type === "select" && f.create) {
          const spec = _createSpec(f);
          const match = comboOption(f, v);
          if (match) v = match.value;
          else if (v) {
            if (submitBtn) submitBtn.disabled = true;
            let created;
            let failMsg = null;
            try {
              created = await spec.onCreate(v);
            } catch (err) {
              created = null;
              failMsg = err?.message || String(err);
            }
            if (submitBtn) submitBtn.disabled = false;
            if (created == null) {
              const hint = spec.hint || f.label.toLowerCase();
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
        if (rowHidden(f.name)) {
          if (unavailable(f, data[f.name]) != null) data[f.name] = f.type === "radio" ? null : "";
          continue;
        }
        const v = data[f.name];
        let msg = f.required && _missing(f, v) ? "Required." : null;
        if (!msg && _outOfRange(f, v)) msg = _rangeMessage(f);
        if (!msg) {
          const reason = unavailable(f, v);
          if (reason != null) msg = reason ? `Not available: ${reason}` : "Not available.";
        }
        if (!msg) msg = controls.get(f.name)?.error?.() ?? null;
        if (!msg && typeof f.validator === "function") {
          try {
            msg = f.validator(v, data);
          } catch (err) {
            msg = err?.message || String(err);
          }
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
    requestAnimationFrame(() => {
      const first = [...body.querySelectorAll('input:not([type="hidden"]), select, textarea')].find((el) => !el.closest("[data-field-row]")?.hidden);
      first?.focus();
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
    const messageEl = document.createElement("div");
    messageEl.className = "twm-modal__body twm-modal__body--text";
    messageEl.textContent = message == null ? "" : String(message);
    const actionsEl = document.createElement("div");
    actionsEl.className = "twm-modal__actions";
    const button = (action, className, label) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = className;
      btn.dataset.action = action;
      btn.textContent = label == null ? "" : String(label);
      actionsEl.appendChild(btn);
    };
    button("cancel", "twm-btn", cancelLabel);
    button("confirm", danger ? "twm-btn twm-btn--danger" : "twm-btn twm-btn--primary", confirmLabel);
    body.append(messageEl, actionsEl);
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
  const height = (f) => {
    if (f.section) return 32;
    const hint = f.hint ? 16 : 0;
    if (f.type === "textarea") return 32 + (Number(f.rows) || 4) * 18 + hint;
    if (f.type === "checkbox" || f.type === "toggle") return 32 + hint;
    if (f.type === "colorList") {
      const n = Array.isArray(f.default) ? f.default.length : 0;
      return 46 + Math.max(n, 1) * 40 + 40 + hint;
    }
    if (f.type === "color") return 46 + (Array.isArray(f.presets) && f.presets.length ? 28 : 0) + hint;
    if (f.type === "radio") {
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
  const wide = fields.some((f) => f && (f.type === "textarea" || f.type === "colorList" || f.section || Array.isArray(f.row)));
  return wide ? 640 : 480;
}
function _formFields(entries) {
  return entries.flatMap((e) => Array.isArray(e?.row) ? e.row : [e]).filter((f) => f && f.section == null);
}
function _bounded(f) {
  return f.min != null || f.max != null;
}
function _outOfRange(f, v) {
  if (f.type !== "number" || !_bounded(f) || v == null || Number.isNaN(v)) return false;
  return f.min != null && v < Number(f.min) || f.max != null && v > Number(f.max);
}
function _rangeMessage(f) {
  if (f.min != null && f.max != null) return `Must be between ${f.min} and ${f.max}.`;
  return f.min != null ? `Must be at least ${f.min}.` : `Must be at most ${f.max}.`;
}
function _offered(options) {
  return flatChoices(options).filter((o) => !o.disabled);
}
function _datalistOptions(options) {
  return _offered(options).map((o) => `<option value="${_esc(o.value)}"></option>`).join("");
}
function _mountControl(host, f, value, onChange) {
  const slot = host.querySelector(`[data-control-slot="${f.name}"]`);
  if (!slot) return null;
  if (f.type === "toggle") {
    const toggle = new ToggleField({
      name: f.name,
      checked: value === true || value === "true",
      ariaLabel: f.label || f.name,
      onText: f.onText ?? null,
      offText: f.offText ?? null,
      disabled: !!f.disabled,
      compact: !!f.compact
    });
    slot.appendChild(toggle.render());
    return {
      read: () => toggle.get(),
      write: (v) => toggle.set(v),
      focus: () => toggle.input?.focus(),
      unavailable: () => null,
      dispose: () => toggle.dispose()
    };
  }
  if (f.type === "color" || f.type === "colorList") {
    const c2 = f.type === "color" ? new ColorField({ name: f.name, value: value ?? "", presets: f.presets, label: f.label }) : new ColorListField({ name: f.name, value: value ?? [], presets: f.presets });
    slot.replaceWith(c2.render());
    const list2 = f.type === "colorList";
    return {
      read: () => list2 ? c2.getTexts() : c2.getText(),
      submit: () => c2.getValue(),
      write: (v) => c2.setValue(v),
      focus: () => c2.focus(),
      unavailable: () => null,
      error: () => {
        if (c2.getValue() !== null) return null;
        if (!list2) return "Not a hex colour: use #rgb or #rrggbb.";
        const bad = c2.invalidIndexes().map((i) => i + 1).join(", ");
        return `Not a hex colour (row ${bad}): use #rgb or #rrggbb.`;
      },
      dispose: () => c2.dispose()
    };
  }
  const common = { keepMissing: false, loose: true };
  const disabledReason = (entry) => entry?.disabled ? entry.reason || "" : null;
  if (f.type === "select") {
    const c2 = selectBox(f.options, value, { ...common, valueAttr: "value", className: "" });
    c2.box.name = f.name;
    if (f.required) c2.box.required = true;
    slot.replaceWith(c2.box);
    return {
      // No option selected reads '', as an empty select always has (and
      // as it submits); a selected option reads as its own value.
      read: () => c2.entry() ? c2.entry().value : "",
      // A value the list does not offer enabled clears the select, as
      // writing an unknown `.value` always has (it then submits '').
      write: (v) => {
        if (!c2.select(v)) c2.box.selectedIndex = -1;
      },
      focus: () => c2.box.focus(),
      unavailable: () => disabledReason(c2.entry()),
      setOptions: c2.setOptions
    };
  }
  const list = (v) => Array.isArray(v) ? v : v == null || v === "" ? [] : [v];
  if (f.type === "checklist") {
    const c2 = toggleChips({
      ...common,
      options: f.options,
      value: list(value),
      label: f.label || f.name,
      onChange: () => onChange(f.name)
    });
    slot.replaceWith(c2.el);
    return {
      read: c2.valueOf,
      write: (v) => c2.setValue(list(v)),
      focus: () => c2.el.querySelector("button:not(:disabled)")?.focus(),
      unavailable: () => null,
      // a disabled chip cannot be pressed, by hand or by set
      setOptions: c2.setOptions
    };
  }
  const c = choiceList({
    ...common,
    options: f.options,
    value,
    label: f.label || f.name,
    name: `twm-form-${_modalSeq}-${f.name}`,
    onChange: () => onChange(f.name)
  });
  slot.replaceWith(c.el);
  return {
    read: () => c.valueOf() ?? null,
    write: (v) => {
      c.select(v);
    },
    focus: c.focus,
    unavailable: () => disabledReason(c.entry()),
    setOptions: c.setOptions
  };
}
function _missing(f, v) {
  if (f.type === "picker") return !v;
  if (f.type === "checklist") return !Array.isArray(v) || v.length === 0;
  if (f.type === "radio") return v == null;
  if (f.type === "color") return v === "";
  if (f.type === "colorList") return Array.isArray(v) && v.length === 0;
  return false;
}
function _createSpec(f) {
  if (!f || !f.create) return null;
  if (f.create === true) return { onCreate: async (v) => v, hint: null };
  return {
    onCreate: typeof f.create.onCreate === "function" ? f.create.onCreate : async (v) => v,
    hint: f.create.hint ?? null
  };
}
function _pickerLabel(f, value) {
  if (typeof f.displayFor !== "function") return value == null ? "" : String(value);
  try {
    return String(f.displayFor(value) ?? "");
  } catch (err) {
    console.warn("[modal] displayFor threw", err);
    return String(value ?? "");
  }
}
function _wirePicker(host, f) {
  const hidden = host.querySelector(`input[type="hidden"][name="${f.name}"]`);
  const display = host.querySelector(`[data-picker-display="${f.name}"]`);
  const btn = host.querySelector(`[data-picker="${f.name}"]`);
  if (!hidden || !display || !btn || typeof f.pick !== "function") return;
  let busy = false;
  const open = async () => {
    if (busy) return;
    busy = true;
    let picked;
    try {
      picked = await f.pick(hidden.value);
    } catch (err) {
      console.warn("[modal] pick threw", err);
      picked = null;
    } finally {
      busy = false;
    }
    if (picked == null) return;
    const isPair = typeof picked === "object";
    hidden.value = String((isPair ? picked.value : picked) ?? "");
    display.value = isPair && picked.label != null ? String(picked.label) : _pickerLabel(f, hidden.value);
    hidden.dispatchEvent(new Event("change", { bubbles: true }));
  };
  btn.addEventListener("click", open);
  display.addEventListener("click", open);
}
function _wireComboboxHint(host, f, optionsOf) {
  const input = host.querySelector(`input[name="${f.name}"]`);
  const hintEl = host.querySelector(`.twm-combobox__hint[data-for="${f.name}"]`);
  if (!input || !hintEl) return;
  if (f.create === true) return;
  const label = _createSpec(f).hint || "new entry";
  const update = () => {
    const v = input.value.trim();
    const known = new Set(flatChoices(optionsOf()).map((o) => String(o.value)));
    if (v && !known.has(v)) {
      hintEl.textContent = `\u21B3 will create ${label} \u201C${v}\u201D`;
      hintEl.hidden = false;
    } else {
      hintEl.hidden = true;
    }
  };
  input.addEventListener("input", update);
  update();
  return update;
}
function _renderEntry(f, defaults) {
  if (f && f.section != null) {
    const attr = f.name ? ` data-field-row="${f.name}"` : "";
    return `<div class="twm-modal__section"${attr}>${_esc(f.section)}</div>`;
  }
  if (Array.isArray(f?.row)) {
    const cells = _formFields(f.row).map((g) => _renderField(g, defaults[g.name] ?? g.default));
    return `<div class="twm-modal__field-group">${cells.join("")}</div>`;
  }
  return _renderField(f, defaults[f.name] ?? f.default);
}
function _renderField(f, value) {
  const required = f.required ? "required" : "";
  const rowMod = f.type === "textarea" || f.type === "checklist" || f.type === "radio" ? " twm-modal__row--multiline" : "";
  const hintHtml = f.hint ? `<div class="twm-modal__hint--field">${_esc(f.hint)}</div>` : "";
  const errHtml = `<div class="twm-modal__field-error" data-field-error="${f.name}" hidden></div>`;
  const wrap = (inner, tag = "label") => `
        <${tag} class="twm-modal__row${rowMod}" data-field-row="${f.name}">
            <span>${_esc(f.label || "")}</span>
            ${inner}
            ${hintHtml}
            ${errHtml}
        </${tag}>
    `;
  const slot = `<span data-control-slot="${f.name}"></span>`;
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
  if (f.type === "checklist" || f.type === "radio") return wrap(slot, "div");
  if (f.type === "toggle") {
    return wrap(`<span class="twm-modal__toggle" data-control-slot="${f.name}"></span>`, "div");
  }
  if (f.type === "textarea") {
    const v2 = value == null ? "" : String(value);
    const rows = f.rows != null ? `rows="${Number(f.rows) || 4}"` : 'rows="4"';
    const placeholder2 = f.placeholder ? `placeholder="${_esc(f.placeholder)}"` : "";
    return wrap(`<textarea name="${f.name}" ${rows} ${placeholder2} ${required}>${_esc(v2)}</textarea>`);
  }
  if (f.type === "color" || f.type === "colorList") {
    if (f.type === "color") return wrap(slot);
    return `
            <div class="twm-modal__row twm-modal__row--multiline" data-field-row="${f.name}" role="group" aria-label="${_esc(f.label || "")}">
                <span>${_esc(f.label || "")}</span>
                ${slot}
                ${hintHtml}
                ${errHtml}
            </div>
        `;
  }
  const v = value == null ? "" : String(value);
  if (f.type === "picker") {
    const placeholder2 = f.placeholder ? `placeholder="${_esc(f.placeholder)}"` : "";
    return wrap(`
            <div class="twm-picker">
                <input type="hidden" name="${f.name}" value="${_esc(v)}">
                <input class="twm-picker__display" data-picker-display="${f.name}" type="text"
                       value="${_esc(_pickerLabel(f, v))}" ${placeholder2} readonly>
                <button type="button" class="twm-btn twm-picker__btn" data-picker="${f.name}"
                        aria-label="Search" title="Search">
                    <span class="material-symbols-outlined" aria-hidden="true">search</span>
                </button>
            </div>
        `);
  }
  if (f.type === "select" && f.create) {
    const shown = findChoice(flatChoices(f.options), value, true)?.disabled ? "" : v;
    const dlId = `ea-dl-${f.name}-${_modalSeq}`;
    const opts = _datalistOptions(f.options);
    const placeholder2 = f.placeholder ? `placeholder="${_esc(f.placeholder)}"` : 'placeholder="type to pick or create\u2026"';
    return wrap(`
            <div class="twm-combobox">
                <input name="${f.name}" type="text" list="${dlId}"
                       value="${_esc(shown)}" ${placeholder2} ${required}
                       autocomplete="off">
                <datalist id="${dlId}" data-datalist-for="${f.name}">${opts}</datalist>
                <span class="twm-combobox__hint" data-for="${f.name}" hidden></span>
            </div>
        `);
  }
  if (f.type === "select") return wrap(slot);
  const step = f.step != null ? `step="${f.step}"` : "";
  const placeholder = f.placeholder ? `placeholder="${_esc(f.placeholder)}"` : "";
  const type = f.type === "number" || f.type === "password" ? f.type : "text";
  let bounds = "";
  if (f.type === "number" && f.min != null) bounds += ` min="${_esc(f.min)}"`;
  if (f.type === "number" && f.max != null) bounds += ` max="${_esc(f.max)}"`;
  return wrap(`<input name="${f.name}" type="${type}" value="${_esc(v)}" ${step}${bounds} ${placeholder} ${required}>`);
}
function _esc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export {
  SortableList,
  ColorListField,
  setModalHost,
  modalHost,
  openForm,
  openConfirm,
  openModal
};
//# sourceMappingURL=chunk-BE2PU3LL.js.map
