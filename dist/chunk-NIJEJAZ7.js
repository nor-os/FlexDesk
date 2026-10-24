import {
  isRowActivation,
  isRowControl
} from "./chunk-CVMCZZX2.js";
import {
  focusMenuItem,
  moveMenuFocus,
  placeMenuInViewport
} from "./chunk-WUFLGETN.js";

// src/ui/components/autocomplete_field.js
var AutocompleteField = class {
  constructor({
    fieldId,
    field = {},
    provider = null,
    onChange = null,
    logger = null,
    namespace = null,
    namespaceOptions = [],
    showNamespaceSelect = false,
    variant = null,
    showNamespaceChip = false,
    allowScopeToggle = false,
    namespaceLabel = null,
    scopeMode = "current",
    skipNamespacePrefix = false,
    // Material symbol per completion type, merged over the generic set. The
    // framework's map used to include `sector: 'domain'` — an EcoAgent
    // completion type — so the widget knew one application's ontology.
    typeIcons = {}
  } = {}) {
    if (!fieldId) {
      throw new Error("AutocompleteField requires a fieldId");
    }
    this.fieldId = fieldId;
    this.field = field;
    this.provider = typeof provider === "function" ? provider : () => [];
    this.onChange = typeof onChange === "function" ? onChange : null;
    this.logger = logger;
    this.typeIcons = typeIcons ?? {};
    this.namespace = namespace;
    this.namespaceOptions = Array.isArray(namespaceOptions) ? [...namespaceOptions] : [];
    if (this.namespace && !this.namespaceOptions.some((opt) => opt.value === this.namespace)) {
      const fallbackLabel = this.field.namespaceLabel || "This Tab";
      this.namespaceOptions.push({ value: this.namespace, label: fallbackLabel, token: fallbackLabel });
    }
    this.showNamespaceSelect = Boolean(showNamespaceSelect);
    this.variant = variant;
    this.showNamespaceChip = Boolean(showNamespaceChip);
    this.allowScopeToggle = Boolean(allowScopeToggle);
    this.namespaceLabel = namespaceLabel;
    this.scope = scopeMode === "all" ? "all" : "current";
    this.skipNamespacePrefix = Boolean(skipNamespacePrefix);
    this.disabled = Boolean(field.disabled);
    const parsed = this.#parseInitialNamespace(field.value ?? "");
    this.selectedNamespace = parsed.initialNamespace;
    this.initialFragment = parsed.initialFragment;
    this._lastDropdownRect = null;
    this.root = null;
    this.input = null;
    this.dropdown = null;
    this.helperEl = null;
    this.scopeControl = null;
    this.namespaceSelect = null;
    this.ghost = null;
    this._items = [];
    this._activeIndex = -1;
    this._isOpen = false;
    this._disposers = [];
    this._suggestSeq = 0;
  }
  getValue() {
    return this.#composeValue();
  }
  setComposedValue(value) {
    if (!this.input) return;
    const safeValue = typeof value === "string" ? value : "";
    if (this.skipNamespacePrefix) {
      this.input.value = safeValue;
      this.initialFragment = safeValue;
      this.#renderGhost();
      this.#close();
      return;
    }
    const parsed = this.#parseInitialNamespace(safeValue);
    this.selectedNamespace = parsed.initialNamespace;
    this.initialFragment = parsed.initialFragment;
    if (this.namespaceSelect) {
      this.namespaceSelect.value = this.selectedNamespace;
    }
    this.#updateNamespaceChip();
    this.input.value = parsed.initialFragment;
    this.#renderGhost();
    this.#close();
  }
  #parseInitialNamespace(rawValue) {
    const value = typeof rawValue === "string" ? rawValue.trim() : "";
    const options = this.namespaceOptions;
    const defaultNs = this.namespace ? options.find((opt) => opt.value === this.namespace)?.value ?? this.namespace : options[0]?.value ?? "__ALL__";
    if (!options.length) {
      return { initialNamespace: defaultNs, initialFragment: value };
    }
    if (!value) {
      return { initialNamespace: defaultNs, initialFragment: "" };
    }
    const dotIndex = value.indexOf(".");
    if (dotIndex > 0) {
      const nsCandidate = value.slice(0, dotIndex);
      const match = options.find(
        (opt) => (opt.value || "").toLowerCase() === nsCandidate.toLowerCase() || (opt.label || "").toLowerCase() === nsCandidate.toLowerCase()
      );
      if (match) {
        return { initialNamespace: match.value, initialFragment: value.slice(dotIndex + 1) };
      }
    }
    return { initialNamespace: defaultNs, initialFragment: value };
  }
  #resolveNamespaceLabel() {
    if (this.scope === "all") {
      return "All Namespaces";
    }
    if (typeof this.namespaceLabel === "string" && this.namespaceLabel.trim()) {
      return this.namespaceLabel.trim();
    }
    if (typeof this.field.namespaceLabel === "string" && this.field.namespaceLabel.trim()) {
      return this.field.namespaceLabel.trim();
    }
    if (typeof this.namespace === "string" && this.namespace.trim()) {
      return this.namespace.trim();
    }
    return "This Tab";
  }
  #toggleScope() {
    if (this.disabled) return;
    this.scope = this.scope === "all" ? "current" : "all";
    this.root?.classList?.toggle("twm-autocomplete-field--scope-all", this.scope === "all");
    this.#updateNamespaceChip();
    this.#updateSuggestions();
  }
  #updateNamespaceChip() {
    if (!this.scopeControl) return;
    this.scopeControl.textContent = this.#resolveNamespaceLabel();
    this.scopeControl.dataset.scope = this.scope;
    this.scopeControl.title = this.scope === "all" ? "Searching across all namespaces (click to limit to this tab)" : "Searching this tab (click to search all namespaces)";
  }
  render() {
    if (this.root) {
      return this.root;
    }
    this.root = document.createElement("div");
    this.root.className = "twm-autocomplete-field";
    if (this.variant) {
      this.root.classList.add(`twm-autocomplete-field--${this.variant}`);
    }
    this.root.classList.toggle("twm-autocomplete-field--scope-all", this.scope === "all");
    const inputWrapper = document.createElement("div");
    inputWrapper.className = "twm-autocomplete-field__input-wrapper";
    if (this.showNamespaceSelect && this.namespaceOptions.length) {
      const select = document.createElement("select");
      select.className = "twm-autocomplete-field__namespace-select";
      this.namespaceOptions.forEach((opt) => {
        const option = document.createElement("option");
        option.value = opt.value;
        option.textContent = opt.label ?? opt.value;
        if (opt.value === this.selectedNamespace) {
          option.selected = true;
        }
        select.appendChild(option);
      });
      this.namespaceSelect = select;
      inputWrapper.appendChild(select);
    }
    if (this.showNamespaceChip) {
      const nsChip = document.createElement(this.allowScopeToggle ? "button" : "span");
      nsChip.className = "twm-autocomplete-field__namespace";
      if (this.allowScopeToggle) {
        nsChip.setAttribute("type", "button");
      }
      if (this.allowScopeToggle) {
        nsChip.classList.add("twm-autocomplete-field__namespace--toggle");
        nsChip.addEventListener("click", () => this.#toggleScope());
      }
      this.scopeControl = nsChip;
      this.#updateNamespaceChip();
      inputWrapper.appendChild(nsChip);
    }
    this.input = document.createElement("input");
    this.input.type = "text";
    this.input.className = "twm-autocomplete-field__input";
    this.input.id = this.fieldId;
    this.input.autocomplete = "off";
    this.input.spellcheck = false;
    if (this.field.placeholder) {
      this.input.placeholder = this.field.placeholder;
    }
    if (this.field.value != null) {
      this.input.value = this.initialFragment;
    }
    if (this.disabled) {
      this.input.disabled = true;
      this.root.classList.add("twm-autocomplete-field--disabled");
    }
    inputWrapper.appendChild(this.input);
    this.ghost = null;
    this.dropdown = document.createElement("div");
    this.dropdown.className = "twm-autocomplete-field__dropdown";
    this.dropdown.setAttribute("role", "listbox");
    document.body.appendChild(this.dropdown);
    this.helperEl = document.createElement("div");
    this.helperEl.className = "twm-autocomplete-field__helper twm-config-hint";
    if (this.field.helperText) {
      this.helperEl.textContent = this.field.helperText;
    }
    this.root.appendChild(inputWrapper);
    this.root.appendChild(this.helperEl);
    this.#wireEvents();
    this.#renderGhost();
    return this.root;
  }
  #wireEvents() {
    const onInput = () => {
      if (this.disabled) return;
      this.#syncNamespaceFromInput();
      this.#renderGhost();
      this.#updateSuggestions();
    };
    const onChange = () => {
      this.onChange?.(this.#composeValue(), { immediate: false, namespace: this.selectedNamespace });
    };
    const onPaste = () => {
    };
    const onKeyDown = (e) => {
      if (this.disabled) return;
      this.#handleKeyDown(e);
    };
    const onFocus = () => {
      if (this.disabled) return;
      this.#updateSuggestions();
    };
    const onBlur = (e) => {
      setTimeout(() => {
        if (!this.root?.contains(document.activeElement)) {
          this.#close();
          this.onChange?.(this.#composeValue(), { immediate: false, namespace: this.selectedNamespace });
        }
      }, 150);
    };
    const onDropdownMouseDown = (e) => {
      e.preventDefault();
    };
    const onDropdownClick = (e) => {
      const item = e.target.closest(".twm-autocomplete-field__item");
      if (item) {
        const index = parseInt(item.dataset.index, 10);
        if (!isNaN(index)) {
          this.#selectItem(index);
        }
      }
    };
    this.input.addEventListener("input", onInput);
    this.input.addEventListener("change", onChange);
    this.input.addEventListener("paste", onPaste);
    this.input.addEventListener("keydown", onKeyDown);
    this.input.addEventListener("focus", onFocus);
    this.input.addEventListener("blur", onBlur);
    this.dropdown.addEventListener("mousedown", onDropdownMouseDown);
    this.dropdown.addEventListener("click", onDropdownClick);
    if (this.namespaceSelect) {
      const onSelectChange = () => {
        this.selectedNamespace = this.namespaceSelect.value;
        this.#updateSuggestions();
        this.onChange?.(this.#composeValue(), {
          immediate: false,
          namespace: this.selectedNamespace,
          viewNamespace: this.selectedNamespace
        });
      };
      this.namespaceSelect.addEventListener("change", onSelectChange);
      this._disposers.push(() => this.namespaceSelect.removeEventListener("change", onSelectChange));
    }
    const onWindowResize = () => {
      if (this._isOpen) {
        this.#positionDropdown();
      }
    };
    window.addEventListener("resize", onWindowResize);
    const onScroll = (e) => {
      if (!this._isOpen) return;
      if (this.dropdown?.contains(e.target)) return;
      this.#close();
    };
    document.addEventListener("scroll", onScroll, true);
    this._disposers.push(() => {
      document.removeEventListener("scroll", onScroll, true);
    });
    const onDocumentClick = (e) => {
      if (!this._isOpen) return;
      const clickedInRoot = this.root?.contains(e.target);
      const clickedInDropdown = this.dropdown?.contains(e.target);
      if (!clickedInRoot && !clickedInDropdown) {
        this.#close();
      }
    };
    document.addEventListener("click", onDocumentClick, true);
    this._disposers.push(() => {
      window.removeEventListener("resize", onWindowResize);
    });
    this._disposers.push(() => {
      document.removeEventListener("click", onDocumentClick, true);
    });
    this._disposers.push(() => {
      this.input.removeEventListener("input", onInput);
      this.input.removeEventListener("change", onChange);
      this.input.removeEventListener("paste", onPaste);
      this.input.removeEventListener("keydown", onKeyDown);
      this.input.removeEventListener("focus", onFocus);
      this.input.removeEventListener("blur", onBlur);
      this.dropdown.removeEventListener("mousedown", onDropdownMouseDown);
      this.dropdown.removeEventListener("click", onDropdownClick);
    });
  }
  #handleKeyDown(e) {
    if (!this._isOpen) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        this.#updateSuggestions();
        e.preventDefault();
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        this.#moveSelection(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        this.#moveSelection(-1);
        break;
      case "Enter":
        e.preventDefault();
        if (this._activeIndex >= 0) {
          this.#selectItem(this._activeIndex);
        }
        this.input?.blur();
        break;
      case "Tab":
        if (this._activeIndex >= 0) {
          e.preventDefault();
          this.#selectItem(this._activeIndex);
        }
        break;
      case "Escape":
        e.preventDefault();
        this.#close();
        break;
    }
  }
  #updateSuggestions() {
    const fragment = this.#getInputFragment();
    const request = ++this._suggestSeq;
    let produced;
    try {
      produced = this.provider({
        value: fragment,
        scope: this.scope,
        namespace: this.selectedNamespace
      });
    } catch (err) {
      this.logger?.warn?.("autocomplete", "Provider error", { err });
      this._items = [];
      this.#close();
      return;
    }
    if (produced && typeof produced.then === "function") {
      produced.then(
        (items) => {
          if (request !== this._suggestSeq) return;
          this.#applySuggestions(items);
        },
        (err) => {
          this.logger?.warn?.("autocomplete", "Provider error", { err });
          if (request !== this._suggestSeq) return;
          this._items = [];
          this.#close();
        }
      );
      return;
    }
    this.#applySuggestions(produced);
  }
  /** Draw whatever the provider produced. Split out of `#updateSuggestions`
   *  so the synchronous and the awaited paths cannot drift apart. */
  #applySuggestions(produced) {
    const items = Array.isArray(produced) ? produced : [];
    this._items = items;
    this._activeIndex = items.length > 0 ? 0 : -1;
    this.#renderDropdown();
    if (items.length > 0) {
      this.#open();
    } else {
      this.#close();
    }
  }
  #renderDropdown() {
    this.dropdown.innerHTML = "";
    const showingAll = this.selectedNamespace === "__ALL__";
    this._items.forEach((item, index) => {
      const el = document.createElement("div");
      el.className = "twm-autocomplete-field__item";
      el.setAttribute("role", "option");
      el.dataset.index = index;
      el.dataset.type = item.type || item.iconType || "variable";
      if (index === this._activeIndex) {
        el.classList.add("active");
      }
      const icon = document.createElement("span");
      icon.className = "twm-autocomplete-field__icon material-symbols-outlined";
      icon.textContent = this.#getIconForType(item.type || item.iconType);
      el.appendChild(icon);
      const label = document.createElement("span");
      label.className = "twm-autocomplete-field__label";
      label.textContent = item.label || item.insertText || "";
      el.appendChild(label);
      if (showingAll && item.metadata?.namespaceId) {
        const nsLabel = this.#resolveNamespaceToken(item.metadata.namespaceId);
        if (nsLabel) {
          const nsIndicator = document.createElement("span");
          nsIndicator.className = "twm-autocomplete-field__namespace-indicator";
          nsIndicator.textContent = nsLabel;
          el.appendChild(nsIndicator);
        }
      }
      if (item.type && !showingAll) {
        const badge = document.createElement("span");
        badge.className = "twm-autocomplete-field__badge";
        badge.textContent = item.type;
        el.appendChild(badge);
      }
      this.dropdown.appendChild(el);
    });
    if (this._isOpen) {
      this.#positionDropdown();
    }
  }
  #resolveNamespaceToken(namespaceId) {
    if (!namespaceId) return null;
    const opt = this.namespaceOptions.find((o) => o.value === namespaceId);
    return opt?.token || opt?.label || null;
  }
  #getIconForType(type) {
    const icons = {
      variable: "functions",
      "variable-qualified": "link",
      stock: "account_balance",
      account: "savings",
      function: "code",
      constant: "numbers",
      operator: "calculate",
      snippet: "content_paste",
      ...this.typeIcons
    };
    return icons[type] || "label";
  }
  #moveSelection(delta) {
    if (this._items.length === 0) return;
    let newIndex = this._activeIndex + delta;
    if (newIndex < 0) newIndex = this._items.length - 1;
    if (newIndex >= this._items.length) newIndex = 0;
    this._activeIndex = newIndex;
    this.#renderDropdown();
    this.#scrollToActive();
  }
  #scrollToActive() {
    const activeEl = this.dropdown.querySelector(".twm-autocomplete-field__item.active");
    if (activeEl) {
      activeEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }
  #selectItem(index) {
    const item = this._items[index];
    if (!item) return;
    const itemNamespace = item.metadata?.namespaceId || null;
    const insertText = item.insertText || item.label || "";
    this.input.value = insertText;
    const viewNamespace = this.selectedNamespace;
    const resolvedNamespace = viewNamespace === "__ALL__" && itemNamespace ? itemNamespace : viewNamespace;
    this.#close();
    this.input.focus();
    this.onChange?.(this.#composeValue(), {
      immediate: true,
      namespace: resolvedNamespace,
      viewNamespace,
      metadata: item.metadata || null
    });
  }
  #open() {
    if (this._isOpen) {
      return;
    }
    this._isOpen = true;
    this.#positionDropdown();
    this.dropdown.classList.add("visible");
  }
  #close() {
    if (!this._isOpen) return;
    this._isOpen = false;
    this.dropdown.classList.remove("visible");
    this._activeIndex = -1;
  }
  #syncNamespaceFromInput() {
    if (!this.namespaceOptions.length) return;
    const value = this.input?.value || "";
    const dotIndex = value.indexOf(".");
    if (dotIndex > 0) {
      const nsCandidate = value.slice(0, dotIndex);
      const match = this.namespaceOptions.find(
        (opt) => opt.value !== "__ALL__" && ((opt.value || "").toLowerCase() === nsCandidate.toLowerCase() || (opt.label || "").toLowerCase() === nsCandidate.toLowerCase() || (opt.token || "").toLowerCase() === nsCandidate.toLowerCase())
      );
      if (match && this.namespaceSelect && this.namespaceSelect.value !== match.value) {
        this.namespaceSelect.value = match.value;
        this.selectedNamespace = match.value;
      }
    }
  }
  #getInputFragment() {
    const value = this.input?.value || "";
    const dotIndex = value.indexOf(".");
    if (dotIndex > 0) {
      const nsCandidate = value.slice(0, dotIndex);
      const match = this.namespaceOptions.find(
        (opt) => opt.value !== "__ALL__" && ((opt.value || "").toLowerCase() === nsCandidate.toLowerCase() || (opt.label || "").toLowerCase() === nsCandidate.toLowerCase())
      );
      if (match) {
        return value.slice(dotIndex + 1);
      }
    }
    return value;
  }
  #composeValue() {
    const rawInput = this.input?.value || "";
    if (!rawInput) return "";
    if (this.skipNamespacePrefix) {
      return rawInput;
    }
    const dotIndex = rawInput.indexOf(".");
    if (dotIndex > 0) {
      const nsCandidate = rawInput.slice(0, dotIndex);
      const match = this.namespaceOptions.find(
        (opt) => opt.value !== "__ALL__" && ((opt.value || "").toLowerCase() === nsCandidate.toLowerCase() || (opt.label || "").toLowerCase() === nsCandidate.toLowerCase())
      );
      if (match) {
        return rawInput;
      }
    }
    const ns = this.selectedNamespace;
    if (!ns || ns === "__ALL__") {
      return rawInput;
    }
    const nsOption = this.namespaceOptions.find(
      (opt) => opt.value === ns || (opt.value || "").toLowerCase() === (ns || "").toLowerCase()
    );
    const nsToken = nsOption?.token || nsOption?.label || "";
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (ns === "__ALL__" || (nsToken || "").toUpperCase() === "__ALL__") {
      return rawInput;
    }
    if (!nsToken || uuidPattern.test(nsToken)) {
      return rawInput;
    }
    return `${nsToken}.${rawInput}`;
  }
  #renderGhost() {
    if (this.ghost) {
      this.ghost.style.display = "none";
    }
  }
  #positionDropdown() {
    if (!this.dropdown || !this.root) return;
    const wrapper = this.root.querySelector(".twm-autocomplete-field__input-wrapper");
    if (!wrapper) return;
    const rect = wrapper.getBoundingClientRect();
    this._lastDropdownRect = rect;
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
    const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
    const width = Math.min(rect.width, viewportWidth - rect.left - 8);
    const maxHeight = Math.max(120, viewportHeight - rect.bottom - 12);
    Object.assign(this.dropdown.style, {
      position: "fixed",
      top: `${rect.bottom}px`,
      left: `${rect.left}px`,
      width: `${width}px`,
      maxWidth: `${width}px`,
      maxHeight: `${maxHeight}px`
    });
  }
  dispose() {
    this._suggestSeq += 1;
    this.#close();
    this._disposers.forEach((fn) => {
      try {
        fn();
      } catch (e) {
      }
    });
    this._disposers = [];
    if (this.dropdown && this.dropdown.parentNode) {
      this.dropdown.parentNode.removeChild(this.dropdown);
    }
    this.root = null;
    this.input = null;
    this.dropdown = null;
    this.helperEl = null;
  }
};

// src/ui/components/cell_editor_host.js
function createTextEditor({ value, initialText = null }) {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "twm-dt-editor";
  input.spellcheck = false;
  input.setAttribute("autocomplete", "off");
  const start = value == null ? "" : String(value);
  input.value = initialText != null ? String(initialText) : start;
  return {
    el: input,
    getValue: () => initialText == null && input.value === start ? value : input.value,
    focus: () => {
      input.focus({ preventScroll: true });
      const end = input.value.length;
      try {
        input.setSelectionRange(end, end);
      } catch (_) {
      }
    }
  };
}
function normalise(made) {
  if (!made) return null;
  const isNode = typeof Node !== "undefined" && made instanceof Node;
  const el = isNode ? made : made.el;
  if (!el || typeof Node !== "undefined" && !(el instanceof Node)) return null;
  const own = isNode ? {} : made;
  let getValue = typeof own.getValue === "function" ? own.getValue : null;
  if (!getValue && el.matches?.("input, select, textarea")) getValue = () => el.value;
  const parse = typeof own.parse === "function" ? own.parse : null;
  let read = null;
  if (parse) {
    read = () => {
      let r;
      try {
        r = parse();
      } catch (err) {
        r = { ok: false, error: err?.message || String(err) };
      }
      return r && r.ok === false ? { ok: false, error: String(r.error ?? "Not valid") } : { ok: true, value: r ? r.value : void 0 };
    };
  } else if (getValue) read = () => ({ ok: true, value: getValue() });
  return {
    el,
    getValue,
    read,
    multiline: !!own.multiline,
    focus: typeof own.focus === "function" ? own.focus : null,
    destroy: typeof own.destroy === "function" ? own.destroy : null
  };
}
var MOVES = /* @__PURE__ */ new Set(["down", "up", "right", "left"]);
var CellEditorHost = class {
  /**
   * @param {object} o
   * @param {(session, value, move, reason) => void} o.onCommit  after the
   *   cell is drawn as it was again; `move` is 'down', 'up', 'right', 'left'
   *   or null; `reason` is 'key', 'blur', 'editor' or 'scroll'.
   * @param {(session, reason) => void} o.onCancel
   * @param {(session, error, text, reason) => void} [o.onRefuse]  a value
   *   that did not parse, when the editor closed with it (the focus left,
   *   `commit()` from outside); without it such a close is a cancel.
   */
  constructor({ onCommit, onCancel, onRefuse = null }) {
    this._onCommit = onCommit;
    this._onCancel = onCancel;
    this._onRefuse = onRefuse;
    this.session = null;
  }
  /**
   * Open an editor in `td`; `args` go to the factory beside the cell's own
   * (DataTable's `locale`, `utc`, `messages`). Returns whether one opened (a factory that
   * throws or returns nothing opens none, and the cell is untouched).
   */
  open({ td, factory, value, row, rowIdx, colIdx, column, initialText = null, args = {}, ...extra }) {
    if (this.session) return false;
    const s = {
      ...extra,
      td,
      value,
      row,
      rowIdx,
      colIdx,
      column,
      previous: value,
      closed: false,
      offs: [],
      saved: null,
      editor: null
    };
    let made = null;
    try {
      made = factory({
        ...args,
        value,
        row,
        rowIdx,
        colIdx,
        column,
        initialText,
        commit: (v, move = null) => this._finish(s, v, MOVES.has(move) ? move : null, "editor"),
        cancel: () => this._cancel(s, "editor")
      });
    } catch (err) {
      console.error("[DataTable] cell editor factory threw", err);
      return false;
    }
    const editor = normalise(made);
    if (!editor) return false;
    s.editor = editor;
    s.saved = [...td.childNodes];
    s.savedTitle = td.getAttribute("title");
    s.savedError = {
      on: td.classList.contains("twm-dt-cell--error"),
      message: td.getAttribute("data-error")
    };
    this.session = s;
    td.classList.add("twm-dt-cell--editing");
    td.replaceChildren(editor.el);
    const on = (type, fn) => {
      editor.el.addEventListener(type, fn);
      s.offs.push(() => editor.el.removeEventListener(type, fn));
    };
    on("keydown", (ev) => {
      if (ev.isComposing) return;
      ev.stopPropagation();
      if (ev.key === "Escape") {
        ev.preventDefault();
        this._cancel(s, "key");
      } else if (ev.key === "Enter" && !ev.altKey && editor.read && (editor.multiline ? ev.ctrlKey || ev.metaKey : !(ev.ctrlKey || ev.metaKey))) {
        ev.preventDefault();
        this._tryKey(s, ev.shiftKey ? "up" : "down");
      } else if (ev.key === "Tab" && !ev.altKey && !ev.ctrlKey && !ev.metaKey && editor.read) {
        ev.preventDefault();
        this._tryKey(s, ev.shiftKey ? "left" : "right");
      }
    });
    on("input", () => this._unmark(s));
    for (const type of ["click", "dblclick", "mousedown", "contextmenu"]) {
      on(type, (ev) => ev.stopPropagation());
    }
    on("focusout", (ev) => {
      if (s.closed || !editor.read) return;
      const to = ev.relatedTarget;
      if (to && editor.el.contains(to)) return;
      const doc = editor.el.ownerDocument;
      if (!to && doc && typeof doc.hasFocus === "function" && !doc.hasFocus()) return;
      this._settle(s, null, "blur");
    });
    try {
      if (editor.focus) editor.focus();
      else editor.el.focus?.({ preventScroll: true });
    } catch (_) {
    }
    return true;
  }
  /** Commit the open session with what its editor holds. */
  commit(move = null, reason = "editor") {
    const s = this.session;
    if (!s) return false;
    if (!s.editor.read) {
      this._cancel(s, reason);
      return false;
    }
    return this._settle(s, move, reason);
  }
  /** Enter or Tab: commit what parses; a refusal keeps the editor open,
   *  the message on its cell. */
  _tryKey(s, move) {
    const r = s.editor.read();
    if (r.ok) return this._finish(s, r.value, move, "key");
    s.td.classList.add("twm-dt-cell--error");
    s.td.setAttribute("data-error", r.error);
    s.td.setAttribute("title", r.error);
    s.marked = true;
    return false;
  }
  _unmark(s) {
    if (!s.marked) return;
    s.marked = false;
    this._restoreMark(s);
  }
  _restoreMark(s) {
    const { on, message } = s.savedError;
    s.td.classList.toggle("twm-dt-cell--error", on);
    if (message == null) s.td.removeAttribute("data-error");
    else s.td.setAttribute("data-error", message);
    if (s.savedTitle == null) s.td.removeAttribute("title");
    else s.td.setAttribute("title", s.savedTitle);
  }
  /** The editor closing with what it holds (the focus left, `commit()`):
   *  committed when it parses, else handed to `onRefuse`. */
  _settle(s, move, reason) {
    const r = s.editor.read();
    if (r.ok) return this._finish(s, r.value, move, reason);
    if (s.closed) return false;
    let text = "";
    try {
      text = s.editor.getValue ? s.editor.getValue() : "";
    } catch (_) {
    }
    this._close(s);
    if (this._onRefuse) this._onRefuse(s, r.error, text, reason);
    else this._onCancel?.(s, reason);
    return true;
  }
  /** Cancel the open session: the cell is drawn as it was. */
  cancel(reason = "editor") {
    const s = this.session;
    if (!s) return false;
    return this._cancel(s, reason);
  }
  /** Take the editor out and put the cell's own content back. */
  _close(s) {
    s.closed = true;
    if (this.session === s) this.session = null;
    for (const off of s.offs) {
      try {
        off();
      } catch (_) {
      }
    }
    s.offs = [];
    try {
      s.editor.destroy?.();
    } catch (err) {
      console.error("[DataTable] cell editor destroy threw", err);
    }
    s.td.classList.remove("twm-dt-cell--editing");
    s.td.replaceChildren(...s.saved);
    this._restoreMark(s);
  }
  _finish(s, value, move, reason) {
    if (s.closed) return false;
    this._close(s);
    this._onCommit?.(s, value, move, reason);
    return true;
  }
  _cancel(s, reason) {
    if (s.closed) return false;
    this._close(s);
    this._onCancel?.(s, reason);
    return true;
  }
};

// src/ui/components/cell_editors.js
var EDITOR_MESSAGES = Object.freeze({
  number: "Not a number",
  datetime: "Not a date",
  bool: "Not true or false",
  choice: "Not one of the options"
});
var ok = (value) => ({ ok: true, value });
var refuse = (ctx, type) => ({ ok: false, error: (ctx?.messages || {})[type] || EDITOR_MESSAGES[type] });
var isBlank = (text) => text == null || String(text).trim() === "";
var ALIASES = { num: "number", date: "datetime" };
function editorTypeOf(type) {
  const t = type == null ? "text" : String(type);
  return ALIASES[t] || t;
}
function safeLocale(locale) {
  if (!locale) return void 0;
  try {
    return Intl.NumberFormat.supportedLocalesOf(locale).length ? locale : void 0;
  } catch (_) {
    return void 0;
  }
}
function numberSeparators(locale) {
  const parts = new Intl.NumberFormat(safeLocale(locale)).formatToParts(12345675e-1);
  return {
    group: parts.find((p) => p.type === "group")?.value ?? ",",
    decimal: parts.find((p) => p.type === "decimal")?.value ?? "."
  };
}
var SPACES = /[\s\u00a0\u202f]/g;
function parseNumber(text, ctx = {}) {
  if (isBlank(text)) return ok(null);
  const { group, decimal } = numberSeparators(ctx.locale);
  let s = String(text).trim().replace(/\u2212/g, "-");
  let sign = "";
  if (s[0] === "-" || s[0] === "+") {
    sign = s[0] === "-" ? "-" : "";
    s = s.slice(1);
  }
  const halves = s.split(decimal);
  if (halves.length > 2) return refuse(ctx, "number");
  let [whole, frac = null] = halves;
  let exp = "";
  const tail = frac ?? whole;
  const e = /[eE][+-]?\d+$/.exec(tail);
  if (e) {
    exp = e[0];
    if (frac != null) frac = frac.slice(0, -exp.length);
    else whole = whole.slice(0, -exp.length);
  }
  const spaceGroup = group !== "" && group.replace(SPACES, "") === "";
  const g = spaceGroup ? " " : group;
  if (spaceGroup) whole = whole.replace(SPACES, " ");
  if (g && whole.includes(g)) {
    const esc = g.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (!new RegExp(`^\\d{1,3}(${esc}\\d{3})+$`).test(whole)) return refuse(ctx, "number");
    whole = whole.split(g).join("");
  }
  if (!/^\d*$/.test(whole) || frac != null && !/^\d*$/.test(frac)) return refuse(ctx, "number");
  if (!whole && !frac) return refuse(ctx, "number");
  const n = Number(`${sign}${whole || "0"}.${frac || "0"}${exp}`);
  return Number.isFinite(n) ? ok(n) : refuse(ctx, "number");
}
function formatNumberForEdit(value, ctx = {}) {
  if (value == null) return "";
  if (typeof value !== "number" || !Number.isFinite(value)) return String(value);
  const { decimal } = numberSeparators(ctx.locale);
  return String(value).replace(".", decimal);
}
var TRUE_WORDS = /* @__PURE__ */ new Set(["true", "yes", "y", "1", "on", "x", "\u2713", "\u2714"]);
var FALSE_WORDS = /* @__PURE__ */ new Set(["false", "no", "n", "0", "off", ""]);
function parseBool(text, ctx = {}) {
  if (typeof text === "boolean") return ok(text);
  const t = String(text ?? "").trim().toLowerCase();
  if (TRUE_WORDS.has(t)) return ok(true);
  if (FALSE_WORDS.has(t)) return ok(false);
  return refuse(ctx, "bool");
}
function truthy(value) {
  if (typeof value === "boolean") return value;
  if (value == null) return false;
  const r = parseBool(String(value));
  return r.ok ? r.value : true;
}
function dateOrder(locale) {
  let loc;
  try {
    loc = Intl.DateTimeFormat.supportedLocalesOf(locale || []).length ? locale : void 0;
  } catch (_) {
    loc = void 0;
  }
  return new Intl.DateTimeFormat(loc, { year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(2026, 11, 31)).map((p) => p.type).filter((t) => t === "day" || t === "month" || t === "year");
}
function daysIn(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
function makeDate({ y, mo, d, h = 0, mi = 0, s = 0, ms = 0 }, utc, offsetMin = null) {
  if (!(mo >= 1 && mo <= 12) || !(d >= 1 && d <= daysIn(y, mo))) return null;
  if (h > 23 || mi > 59 || s > 59) return null;
  if (offsetMin != null) return new Date(Date.UTC(y, mo - 1, d, h, mi, s, ms) - offsetMin * 6e4);
  if (utc) return new Date(Date.UTC(y, mo - 1, d, h, mi, s, ms));
  const date = new Date(y, mo - 1, d, h, mi, s, ms);
  date.setFullYear(y);
  return date;
}
var ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,3})\d*)?)?\s*(Z|[+-]\d{2}:?\d{2})?)?$/i;
var LOCAL = /^(\d{1,4})[./-](\d{1,2})[./-](\d{1,4})\.?(?:[,\sT]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap])?\.?m?\.?)?$/i;
function parseDateTime(text, ctx = {}) {
  if (isBlank(text)) return ok(null);
  const t = String(text).trim();
  const iso = ISO.exec(t);
  if (iso) {
    const [, y, mo, d, h2, mi2, s, ms, zone] = iso;
    let offset = null;
    if (zone) {
      if (zone.toUpperCase() === "Z") offset = 0;
      else {
        const z = zone.replace(":", "");
        offset = (z[0] === "-" ? -1 : 1) * (Number(z.slice(1, 3)) * 60 + Number(z.slice(3, 5)));
      }
    }
    const date2 = makeDate({
      y: +y,
      mo: +mo,
      d: +d,
      h: +(h2 || 0),
      mi: +(mi2 || 0),
      s: +(s || 0),
      ms: ms ? Number(ms.padEnd(3, "0")) : 0
    }, !!ctx.utc, offset);
    return date2 ? ok(date2) : refuse(ctx, "datetime");
  }
  const m = LOCAL.exec(t);
  if (!m) return refuse(ctx, "datetime");
  const [, a, b, c, hh, mi, ss, ap] = m;
  let h = hh == null ? 0 : +hh;
  if (ap) {
    if (h < 1 || h > 12) return refuse(ctx, "datetime");
    h = h % 12 + (ap.toLowerCase() === "p" ? 12 : 0);
  }
  const time = { h, mi: +(mi || 0), s: +(ss || 0) };
  const order = dateOrder(ctx.locale);
  const nums = [a, b, c];
  const read = (ord) => {
    const at = {};
    ord.forEach((type, i) => {
      at[type] = nums[i];
    });
    if (!at.year || at.year.length !== 4) return null;
    return makeDate({ y: +at.year, mo: +at.month, d: +at.day, ...time }, !!ctx.utc);
  };
  let date = read(order);
  if (!date) {
    const swapped = order.map((p) => p === "day" ? "month" : p === "month" ? "day" : p);
    date = read(swapped);
  }
  return date ? ok(date) : refuse(ctx, "datetime");
}
var pad = (n, w = 2) => String(n).padStart(w, "0");
function formatDateTimeForEdit(value, ctx = {}) {
  if (value == null || value === "") return "";
  if (!(value instanceof Date)) return String(value);
  if (Number.isNaN(value.getTime())) return "";
  const u = !!ctx.utc;
  const y = u ? value.getUTCFullYear() : value.getFullYear();
  const mo = (u ? value.getUTCMonth() : value.getMonth()) + 1;
  const d = u ? value.getUTCDate() : value.getDate();
  const h = u ? value.getUTCHours() : value.getHours();
  const mi = u ? value.getUTCMinutes() : value.getMinutes();
  const s = u ? value.getUTCSeconds() : value.getSeconds();
  const day = `${pad(y, 4)}-${pad(mo)}-${pad(d)}`;
  if (!h && !mi && !s) return day;
  return `${day} ${pad(h)}:${pad(mi)}${s ? `:${pad(s)}` : ""}`;
}
function normalizeOptions(options) {
  if (!Array.isArray(options)) return [];
  return options.map((o) => o && typeof o === "object" ? { value: o.value, label: String(o.label ?? o.value ?? "") } : { value: o, label: String(o ?? "") });
}
function parseChoice(text, ctx = {}) {
  if (isBlank(text)) return ok(null);
  const t = String(text).trim();
  const lower = t.toLowerCase();
  const opts = normalizeOptions(ctx.options);
  const hit = opts.find((o) => o.label.trim().toLowerCase() === lower) || opts.find((o) => String(o.value ?? "").trim().toLowerCase() === lower);
  if (hit) return ok(hit.value);
  return ctx.allowOther ? ok(t) : refuse(ctx, "choice");
}
function labelOf(value, ctx) {
  if (value == null) return "";
  const hit = normalizeOptions(ctx.options).find((o) => Object.is(o.value, value) || String(o.value) === String(value));
  return hit ? hit.label : String(value);
}
function contextOf(args) {
  const col = args.column || {};
  return {
    locale: args.locale,
    utc: !!args.utc,
    messages: args.messages,
    options: col.options,
    allowOther: !!col.allowOther
  };
}
function parsedField(el, args, start, parse) {
  const { value, initialText = null } = args;
  el.value = initialText != null ? String(initialText) : start;
  const ctx = contextOf(args);
  return {
    el,
    getValue: () => el.value,
    parse: () => initialText == null && el.value === start ? ok(value) : parse(el.value, ctx),
    focus: () => {
      el.focus({ preventScroll: true });
      const end = el.value.length;
      try {
        el.setSelectionRange(end, end);
      } catch (_) {
      }
    }
  };
}
function textInput(kind) {
  const input = document.createElement("input");
  input.type = "text";
  input.className = `twm-dt-editor twm-dt-editor--${kind}`;
  input.spellcheck = false;
  input.setAttribute("autocomplete", "off");
  return input;
}
function createNumberEditor(args) {
  const input = textInput("number");
  input.inputMode = "decimal";
  return parsedField(input, args, formatNumberForEdit(args.value, contextOf(args)), parseNumber);
}
function createDateTimeEditor(args) {
  const input = textInput("datetime");
  return parsedField(input, args, formatDateTimeForEdit(args.value, contextOf(args)), parseDateTime);
}
function createMultiTextEditor(args) {
  const area = document.createElement("textarea");
  area.className = "twm-dt-editor twm-dt-editor--multitext";
  area.spellcheck = false;
  area.rows = Number(args.column?.rows) > 0 ? Number(args.column.rows) : 3;
  const start = args.value == null ? "" : String(args.value);
  const field = parsedField(area, args, start, (text) => ok(text));
  return { ...field, multiline: true };
}
function createBoolEditor(args) {
  const { value, initialText = null, commit } = args;
  const box = document.createElement("input");
  box.type = "checkbox";
  box.className = "twm-dt-editor twm-dt-editor--bool";
  const start = truthy(value);
  box.checked = start;
  if (initialText === " ") box.checked = !start;
  else if (initialText != null) {
    const r = parseBool(initialText);
    if (r.ok) box.checked = r.value;
  }
  box.addEventListener("change", () => commit(box.checked));
  const read = () => box.checked === start && initialText == null ? ok(value) : ok(box.checked);
  return {
    el: box,
    getValue: () => box.checked,
    parse: read,
    focus: () => box.focus({ preventScroll: true })
  };
}
var uid = 0;
function createChoiceEditor(args) {
  const { value, initialText = null, commit } = args;
  const ctx = contextOf(args);
  const opts = normalizeOptions(ctx.options);
  const start = labelOf(value, ctx);
  const shown = initialText != null ? String(initialText) : start;
  let picked = null;
  let keying = null;
  let done = false;
  const ac = new AutocompleteField({
    fieldId: `twm-dt-choice-${++uid}`,
    field: { value: shown },
    skipNamespacePrefix: true,
    typeIcons: { option: "list" },
    provider: ({ value: term }) => {
      const q = String(term ?? "").trim().toLowerCase();
      const all = !q || initialText == null && term === start;
      return opts.filter((o) => all || o.label.toLowerCase().includes(q)).map((o) => ({ label: o.label, insertText: o.label, iconType: "option", metadata: { value: o.value } }));
    },
    onChange: (text, meta) => {
      if (done || !meta?.immediate || !meta.metadata) return;
      picked = { label: String(text ?? ""), value: meta.metadata.value };
      const move = keying ? keying.key === "Tab" ? keying.shift ? "left" : "right" : keying.shift ? "up" : "down" : null;
      commit(picked.value, move);
    }
  });
  const root = ac.render();
  root.classList.add("twm-dt-editor--choice");
  const input = ac.input;
  input.classList.add("twm-dt-editor");
  let browsed = false;
  const onCapture = (ev) => {
    const commitKey = (ev.key === "Enter" || ev.key === "Tab") && !ev.ctrlKey && !ev.metaKey && !ev.altKey;
    keying = commitKey ? { key: ev.key, shift: ev.shiftKey } : null;
    if (ev.key === "ArrowDown" || ev.key === "ArrowUp") browsed = true;
    if (commitKey && !browsed && !String(input.value).trim() && !ev.isComposing) {
      ev.preventDefault();
      ev.stopPropagation();
      const move = ev.key === "Tab" ? ev.shiftKey ? "left" : "right" : ev.shiftKey ? "up" : "down";
      commit(null, move);
    }
  };
  const onInput = () => {
    browsed = false;
  };
  const onAfter = (ev) => {
    keying = null;
    if (ev.key === "Escape" && ev.defaultPrevented) ev.stopPropagation();
  };
  root.addEventListener("keydown", onCapture, true);
  input.addEventListener("keydown", onAfter);
  input.addEventListener("input", onInput);
  return {
    el: root,
    getValue: () => ac.input?.value ?? "",
    parse: () => {
      const text = ac.input?.value ?? "";
      if (initialText == null && text === start) return ok(value);
      if (picked && text === picked.label) return ok(picked.value);
      return parseChoice(text, ctx);
    },
    focus: () => {
      ac.input?.focus({ preventScroll: true });
      const end = ac.input?.value.length ?? 0;
      try {
        ac.input?.setSelectionRange(end, end);
      } catch (_) {
      }
    },
    destroy: () => {
      done = true;
      root.removeEventListener("keydown", onCapture, true);
      input.removeEventListener("keydown", onAfter);
      input.removeEventListener("input", onInput);
      ac.dispose();
    }
  };
}
var identity = (text) => ok(text == null ? "" : String(text));
var CELL_EDITORS = Object.freeze({
  text: Object.freeze({ create: createTextEditor, parse: identity }),
  multitext: Object.freeze({ create: createMultiTextEditor, parse: identity }),
  number: Object.freeze({ create: createNumberEditor, parse: parseNumber }),
  bool: Object.freeze({ create: createBoolEditor, parse: parseBool }),
  choice: Object.freeze({ create: createChoiceEditor, parse: parseChoice }),
  datetime: Object.freeze({ create: createDateTimeEditor, parse: parseDateTime })
});

// src/ui/components/cell_selection.js
var CellSelection = class {
  constructor() {
    this.anchor = null;
    this.focus = null;
    this.first = 0;
    this.last = -1;
    this.cols = [];
  }
  /** The rows (positions, inclusive) and columns (data indices, shown order)
   *  the cursor may stand on. A selection outside them is pulled in. */
  setBounds(first, last, cols) {
    this.first = first;
    this.last = last;
    this.cols = Array.isArray(cols) ? cols.slice() : [];
    if (this.isEmptyGrid()) {
      this.anchor = null;
      this.focus = null;
      return;
    }
    if (this.focus) this.focus = this._clamp(this.focus);
    if (this.anchor) this.anchor = this._clamp(this.anchor);
  }
  isEmptyGrid() {
    return this.last < this.first || this.cols.length === 0;
  }
  _ord(col) {
    const i = this.cols.indexOf(col);
    return i >= 0 ? i : 0;
  }
  _clamp({ row, col }) {
    const r = Math.max(this.first, Math.min(this.last, row));
    const c = this.cols.includes(col) ? col : this.cols[Math.max(0, Math.min(this.cols.length - 1, this._nearestOrd(col)))];
    return { row: r, col: c };
  }
  /** A column that is not shown any more: the shown one nearest its index. */
  _nearestOrd(col) {
    let best = 0;
    for (let i = 0; i < this.cols.length; i++) if (this.cols[i] <= col) best = i;
    return best;
  }
  _inside(row, ord) {
    return row >= this.first && row <= this.last && ord >= 0 && ord < this.cols.length;
  }
  /** Put the cursor on one cell and collapse the range onto it. */
  setCursor(row, col) {
    if (this.isEmptyGrid()) return false;
    this.focus = this._clamp({ row, col });
    this.anchor = { ...this.focus };
    return true;
  }
  /** Move the cursor to a cell and keep the anchor: the range grows. */
  extendTo(row, col) {
    if (!this.anchor) return this.setCursor(row, col);
    if (this.isEmptyGrid()) return false;
    this.focus = this._clamp({ row, col });
    return true;
  }
  _go(cell, extend) {
    return extend ? this.extendTo(cell.row, cell.col) : this.setCursor(cell.row, cell.col);
  }
  /** One step: the arrows. At an edge the cursor stays put. */
  move(dRow, dCol, { extend = false } = {}) {
    if (!this.focus) return this.setCursor(this.first, this.cols[0]);
    const ord = Math.max(0, Math.min(this.cols.length - 1, this._ord(this.focus.col) + dCol));
    const row = Math.max(this.first, Math.min(this.last, this.focus.row + dRow));
    return this._go({ row, col: this.cols[ord] }, extend);
  }
  /**
   * Ctrl+arrow: to the edge of the block of filled cells, as a spreadsheet
   * does. From a filled cell whose neighbour is filled, to the last filled
   * cell of that run; otherwise to the next filled cell along the line, or
   * the edge of the grid when there is none.
   *
   * @param {number} dRow  -1, 0 or 1
   * @param {number} dCol  -1, 0 or 1
   * @param {(row:number, col:number) => boolean} filled
   */
  jump(dRow, dCol, filled, { extend = false } = {}) {
    if (!this.focus) return this.setCursor(this.first, this.cols[0]);
    let r = this.focus.row;
    let o = this._ord(this.focus.col);
    const isFilled = (row, ord) => !!filled(row, this.cols[ord]);
    if (this._inside(r + dRow, o + dCol)) {
      if (isFilled(r, o) && isFilled(r + dRow, o + dCol)) {
        while (this._inside(r + dRow, o + dCol) && isFilled(r + dRow, o + dCol)) {
          r += dRow;
          o += dCol;
        }
      } else {
        r += dRow;
        o += dCol;
        while (!isFilled(r, o) && this._inside(r + dRow, o + dCol)) {
          r += dRow;
          o += dCol;
        }
      }
    }
    return this._go({ row: r, col: this.cols[o] }, extend);
  }
  /** Home / End: the first or last column of the cursor's row; with
   *  `corner` (Ctrl), the first or last cell of the grid. */
  lineEnd(toEnd, { extend = false, corner = false } = {}) {
    if (!this.focus) return this.setCursor(this.first, this.cols[0]);
    const col = toEnd ? this.cols[this.cols.length - 1] : this.cols[0];
    const row = corner ? toEnd ? this.last : this.first : this.focus.row;
    return this._go({ row, col }, extend);
  }
  /** Tab: one cell right, wrapping to the first cell of the next row (Shift:
   *  left, wrapping to the last cell of the row before). The last cell of
   *  the grid (the first, going back) stays put. */
  tab(back = false) {
    if (!this.focus) return this.setCursor(this.first, this.cols[0]);
    let row = this.focus.row;
    let ord = this._ord(this.focus.col) + (back ? -1 : 1);
    if (ord >= this.cols.length) {
      if (row >= this.last) return this.setCursor(row, this.focus.col);
      row += 1;
      ord = 0;
    } else if (ord < 0) {
      if (row <= this.first) return this.setCursor(row, this.focus.col);
      row -= 1;
      ord = this.cols.length - 1;
    }
    return this.setCursor(row, this.cols[ord]);
  }
  /** Whether Tab (Shift+Tab with `back`) has nowhere to go: the cursor is
   *  on the grid's last cell (its first, going back). The grid then lets
   *  the key move focus on, out of the table. */
  tabEnds(back = false) {
    if (!this.focus || this.isEmptyGrid()) return false;
    const col = back ? this.cols[0] : this.cols[this.cols.length - 1];
    const row = back ? this.first : this.last;
    return this.focus.row === row && this.focus.col === col;
  }
  /** Every cell of the grid: from its first cell to its last, which is
   *  where the cursor goes. */
  selectAll() {
    if (this.isEmptyGrid()) return false;
    this.anchor = { row: this.first, col: this.cols[0] };
    this.focus = { row: this.last, col: this.cols[this.cols.length - 1] };
    return true;
  }
  /** The range collapses onto the cursor. */
  collapse() {
    if (!this.focus) return false;
    const was = this.anchor && (this.anchor.row !== this.focus.row || this.anchor.col !== this.focus.col);
    this.anchor = { ...this.focus };
    return !!was;
  }
  clear() {
    this.anchor = null;
    this.focus = null;
  }
  /** `{top, bottom, left, right, columns}` — rows as positions, `left` and
   *  `right` and `columns` as data indices — or null with nothing selected. */
  range() {
    if (!this.focus || !this.anchor) return null;
    const a = this._ord(this.anchor.col);
    const b = this._ord(this.focus.col);
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    return {
      top: Math.min(this.anchor.row, this.focus.row),
      bottom: Math.max(this.anchor.row, this.focus.row),
      left: this.cols[lo],
      right: this.cols[hi],
      columns: this.cols.slice(lo, hi + 1)
    };
  }
  contains(row, col) {
    const r = this.range();
    if (!r || row < r.top || row > r.bottom) return false;
    return r.columns.includes(col);
  }
  isCursor(row, col) {
    return !!this.focus && this.focus.row === row && this.focus.col === col;
  }
};

// src/ui/utils/raf_resize_observer.js
function createRafResizeObserver(callback) {
  let scheduled = false;
  let latestEntries = [];
  return new ResizeObserver((entries) => {
    latestEntries = entries;
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      callback(latestEntries);
    });
  });
}

// src/ui/components/table_values.js
var MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];
var WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday"
];
var ISO_DATE = "YYYY-MM-DD";
var ISO_DATETIME = "YYYY-MM-DD HH:mm";
var ISO_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,9}))?)?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$/i;
var pad2 = (n, w = 2) => String(Math.trunc(Math.abs(n))).padStart(w, "0");
function daysInMonth(y, mo) {
  if (mo !== 1) return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo];
  return y % 4 === 0 && y % 100 !== 0 || y % 400 === 0 ? 29 : 28;
}
function partsToTime(utc, y, mo, d = 1, h = 0, mi = 0, s = 0, ms = 0) {
  const date = /* @__PURE__ */ new Date(0);
  if (utc) {
    date.setUTCFullYear(y, mo, d);
    date.setUTCHours(h, mi, s, ms);
  } else {
    date.setFullYear(y, mo, d);
    date.setHours(h, mi, s, ms);
  }
  return date.getTime();
}
function parseDateValue(value, { utc = false } = {}) {
  if (value == null || value === "") return NaN;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  const text = String(value).trim();
  if (!text) return NaN;
  const m = ISO_RE.exec(text);
  if (!m) return NaN;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo - 1)) return NaN;
  const h = m[4] ? Number(m[4]) : 0;
  const mi = m[5] ? Number(m[5]) : 0;
  const s = m[6] ? Number(m[6]) : 0;
  const ms = m[7] ? Math.round(Number(`0.${m[7]}`) * 1e3) : 0;
  if (h > 24 || mi > 59 || s > 60 || h === 24 && (mi || s || ms)) return NaN;
  const zone = m[8];
  if (zone) {
    let offset = 0;
    if (zone.toUpperCase() !== "Z") {
      const sign = zone[0] === "-" ? -1 : 1;
      const digits = zone.slice(1).replace(":", "");
      offset = sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2, 4) || 0));
    }
    return partsToTime(true, y, mo - 1, d, h, mi, s, ms) - offset * 6e4;
  }
  return partsToTime(utc, y, mo - 1, d, h, mi, s, ms);
}
function formatDate(value, pattern = ISO_DATE, { utc = false } = {}) {
  if (value == null || value === "") return "";
  const t = parseDateValue(value, { utc });
  if (!Number.isFinite(t)) return String(value);
  const date = new Date(t);
  if (typeof pattern === "function") return String(pattern(date) ?? "");
  const get = utc ? {
    y: date.getUTCFullYear(),
    mo: date.getUTCMonth(),
    d: date.getUTCDate(),
    wd: date.getUTCDay(),
    h: date.getUTCHours(),
    mi: date.getUTCMinutes(),
    s: date.getUTCSeconds(),
    ms: date.getUTCMilliseconds()
  } : {
    y: date.getFullYear(),
    mo: date.getMonth(),
    d: date.getDate(),
    wd: date.getDay(),
    h: date.getHours(),
    mi: date.getMinutes(),
    s: date.getSeconds(),
    ms: date.getMilliseconds()
  };
  const h12 = get.h % 12 === 0 ? 12 : get.h % 12;
  return String(pattern || ISO_DATE).replace(
    /\[([^\]]*)\]|YYYY|YY|MMMM|MMM|MM|M|dddd|ddd|DD|D|HH|H|hh|h|mm|m|ss|s|SSS|A|a/g,
    (tok, literal) => {
      if (literal !== void 0) return literal;
      switch (tok) {
        case "YYYY":
          return pad2(get.y, 4);
        case "YY":
          return pad2(get.y % 100);
        case "MMMM":
          return MONTHS[get.mo];
        case "MMM":
          return MONTHS[get.mo].slice(0, 3);
        case "MM":
          return pad2(get.mo + 1);
        case "M":
          return String(get.mo + 1);
        case "dddd":
          return WEEKDAYS[get.wd];
        case "ddd":
          return WEEKDAYS[get.wd].slice(0, 3);
        case "DD":
          return pad2(get.d);
        case "D":
          return String(get.d);
        case "HH":
          return pad2(get.h);
        case "H":
          return String(get.h);
        case "hh":
          return pad2(h12);
        case "h":
          return String(h12);
        case "mm":
          return pad2(get.mi);
        case "m":
          return String(get.mi);
        case "ss":
          return pad2(get.s);
        case "s":
          return String(get.s);
        case "SSS":
          return pad2(get.ms, 3);
        case "A":
          return get.h < 12 ? "AM" : "PM";
        case "a":
          return get.h < 12 ? "am" : "pm";
        default:
          return tok;
      }
    }
  );
}
function parseDatePeriod(text, { utc = false } = {}) {
  const t = String(text ?? "").trim();
  const m = /^(\d{4})(?:-(\d{2})(?:-(\d{2})(?:[T ](\d{2})(?::(\d{2})(?::(\d{2}))?)?)?)?)?$/i.exec(t);
  if (m) {
    const parts = [
      Number(m[1]),
      m[2] ? Number(m[2]) - 1 : 0,
      m[3] ? Number(m[3]) : 1,
      m[4] ? Number(m[4]) : 0,
      m[5] ? Number(m[5]) : 0,
      m[6] ? Number(m[6]) : 0
    ];
    if (parts[1] < 0 || parts[1] > 11 || parts[2] < 1 || parts[2] > daysInMonth(parts[0], parts[1]) || parts[3] > 23 || parts[4] > 59 || parts[5] > 59) return null;
    const unit = m[6] ? 5 : m[5] ? 4 : m[4] ? 3 : m[3] ? 2 : m[2] ? 1 : 0;
    const next = parts.slice();
    next[unit] += 1;
    return { start: partsToTime(utc, ...parts), end: partsToTime(utc, ...next) };
  }
  const instant = parseDateValue(t, { utc });
  return Number.isFinite(instant) ? { start: instant, end: instant + 1 } : null;
}
var DURATION_UNITS = {
  ms: 1,
  msec: 1,
  msecs: 1,
  millisecond: 1,
  milliseconds: 1,
  s: 1e3,
  sec: 1e3,
  secs: 1e3,
  second: 1e3,
  seconds: 1e3,
  m: 6e4,
  min: 6e4,
  mins: 6e4,
  minute: 6e4,
  minutes: 6e4,
  h: 36e5,
  hr: 36e5,
  hrs: 36e5,
  hour: 36e5,
  hours: 36e5,
  d: 864e5,
  day: 864e5,
  days: 864e5
};
function parseDuration(value) {
  if (value == null || value === "") return NaN;
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  let text = String(value).trim().toLowerCase();
  if (!text) return NaN;
  let sign = 1;
  if (text[0] === "-") {
    sign = -1;
    text = text.slice(1).trim();
  }
  if (/^\d+(?:\.\d+)?$/.test(text)) return sign * Number(text);
  const clock = /^(?:(\d+)\.)?(\d+):(\d{1,2})(?::(\d{1,2}(?:\.\d+)?))?$/.exec(text);
  if (clock) {
    const [, d, a, b, c] = clock;
    const ms = (Number(d || 0) * 86400 + Number(a) * 3600 + Number(b) * 60 + Number(c || 0)) * 1e3;
    return sign * ms;
  }
  const re = /(\d+(?:\.\d+)?)\s*([a-z]+)\s*/g;
  let total = 0;
  let consumed = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index !== consumed) return NaN;
    const unit = DURATION_UNITS[m[2]];
    if (unit === void 0) return NaN;
    total += Number(m[1]) * unit;
    consumed = re.lastIndex;
  }
  return consumed === text.length && consumed > 0 ? sign * total : NaN;
}
function formatDuration(value, pattern = "auto") {
  if (value == null || value === "") return "";
  const ms = parseDuration(value);
  if (!Number.isFinite(ms)) return String(value);
  if (typeof pattern === "function") return String(pattern(ms) ?? "");
  const neg = ms < 0;
  const a = Math.abs(ms);
  let out;
  if (pattern === "clock") {
    const total = Math.round(a / 1e3);
    const d = Math.floor(total / 86400);
    const h = Math.floor(total % 86400 / 3600);
    const mi = Math.floor(total % 3600 / 60);
    const s = total % 60;
    out = `${d ? `${d}.${pad2(h)}` : h}:${pad2(mi)}:${pad2(s)}`;
  } else if (a < 1e3) {
    out = `${Math.round(a)} ms`;
  } else if (a < 59950) {
    out = `${(a / 1e3).toFixed(1)} s`;
  } else if (a < 36e5) {
    let mi = Math.floor(a / 6e4);
    let s = Math.round(a % 6e4 / 1e3);
    if (s === 60) {
      mi += 1;
      s = 0;
    }
    out = `${mi}m ${s}s`;
  } else if (a < 864e5) {
    let h = Math.floor(a / 36e5);
    let mi = Math.round(a % 36e5 / 6e4);
    if (mi === 60) {
      h += 1;
      mi = 0;
    }
    out = `${h}h ${mi}m`;
  } else {
    let d = Math.floor(a / 864e5);
    let h = Math.round(a % 864e5 / 36e5);
    if (h === 24) {
      d += 1;
      h = 0;
    }
    out = `${d}d ${h}h`;
  }
  return neg ? `-${out}` : out;
}
function matchDateFilter(t, filterText, shown, { utc = false } = {}) {
  const text = String(filterText ?? "").trim();
  if (!text) return true;
  const range = /^(.+?)\s*\.\.\s*(.+)$/.exec(text);
  if (range) {
    const lo = parseDatePeriod(range[1], { utc });
    const hi = parseDatePeriod(range[2], { utc });
    if (!lo || !hi) return true;
    return Number.isFinite(t) && t >= lo.start && t < hi.end;
  }
  const op = /^(>=|<=|!=|>|<|=)\s*(.+)$/.exec(text);
  if (op) {
    const p2 = parseDatePeriod(op[2], { utc });
    if (!p2) return true;
    if (!Number.isFinite(t)) return false;
    switch (op[1]) {
      case ">":
        return t >= p2.end;
      case ">=":
        return t >= p2.start;
      case "<":
        return t < p2.start;
      case "<=":
        return t < p2.end;
      case "=":
        return t >= p2.start && t < p2.end;
      case "!=":
        return !(t >= p2.start && t < p2.end);
    }
  }
  const p = parseDatePeriod(text, { utc });
  if (p) return Number.isFinite(t) && t >= p.start && t < p.end;
  return String(shown ?? "").toLowerCase().includes(text.toLowerCase());
}
function matchDurationFilter(ms, filterText, shown) {
  const text = String(filterText ?? "").trim();
  if (!text) return true;
  const range = /^(.+?)\s*\.\.\s*(.+)$/.exec(text);
  if (range) {
    const lo = parseDuration(range[1]);
    const hi = parseDuration(range[2]);
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return true;
    return Number.isFinite(ms) && ms >= lo && ms <= hi;
  }
  const op = /^(>=|<=|!=|>|<|=)\s*(.+)$/.exec(text);
  if (op) {
    const target = parseDuration(op[2]);
    if (!Number.isFinite(target)) return true;
    if (!Number.isFinite(ms)) return false;
    switch (op[1]) {
      case ">":
        return ms > target;
      case ">=":
        return ms >= target;
      case "<":
        return ms < target;
      case "<=":
        return ms <= target;
      case "=":
        return ms === target;
      case "!=":
        return ms !== target;
    }
  }
  return String(shown ?? "").toLowerCase().includes(text.toLowerCase());
}

// src/ui/components/table_filter_chips.js
var isAll = (v) => v === "" || v == null;
function createChipsFilter(ctx = {}, spec = {}) {
  const options = Array.isArray(spec.options) ? spec.options : [];
  const multiple = !!spec.multiple;
  const showCounts = spec.counts !== false;
  const el = document.createElement("div");
  el.className = "twm-dt-filter-chips" + (multiple ? " twm-dt-filter-chips--multiple" : "");
  el.setAttribute("role", "group");
  const name = spec.label || ctx.header;
  if (name) el.setAttribute("aria-label", String(name));
  const valueOf = /* @__PURE__ */ new Map();
  const chips = /* @__PURE__ */ new Map();
  let value = null;
  const keyOf = (v) => String(v ?? "");
  const normalise2 = (v) => {
    if (multiple) {
      const list = Array.isArray(v) ? v : isAll(v) ? [] : [v];
      return list.filter((x) => !isAll(x)).map(keyOf);
    }
    if (Array.isArray(v)) v = v[0];
    return isAll(v) ? null : keyOf(v);
  };
  const chosen = () => multiple ? value.length === 0 : value === null;
  for (const opt of options) {
    const key4 = keyOf(opt.value);
    valueOf.set(key4, opt.value);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "twm-dt-filter-chip";
    btn.dataset.value = key4;
    if (opt.title) btn.title = String(opt.title);
    if (opt.icon) {
      const icon = document.createElement("span");
      icon.className = "material-symbols-outlined twm-dt-filter-chip__icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = String(opt.icon);
      btn.appendChild(icon);
    }
    const label = document.createElement("span");
    label.className = "twm-dt-filter-chip__label";
    label.textContent = String(opt.label ?? key4);
    btn.appendChild(label);
    let count = null;
    if (showCounts) {
      count = document.createElement("span");
      count.className = "twm-dt-filter-chip__count";
      count.textContent = "\u2013";
      btn.appendChild(count);
    }
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      pick(key4);
    });
    chips.set(key4, { btn, count });
    el.appendChild(btn);
  }
  function outward() {
    if (multiple) return value.length ? value.map((k) => valueOf.get(k)) : null;
    return value === null ? null : valueOf.get(value);
  }
  function pick(key4) {
    if (isAll(key4)) value = multiple ? [] : null;
    else if (multiple) {
      value = value.includes(key4) ? value.filter((k) => k !== key4) : [...value, key4];
    } else {
      value = value === key4 ? null : key4;
    }
    paint();
    const out = outward();
    if (typeof ctx.setValue === "function") ctx.setValue(out);
    try {
      spec.onChange?.(out);
    } catch (err) {
      console.error("[chips filter] onChange threw", err);
    }
  }
  function paint() {
    for (const [key4, { btn }] of chips) {
      const on = isAll(key4) ? chosen() : multiple ? value.includes(key4) : value === key4;
      btn.classList.toggle("twm-dt-filter-chip--on", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    }
  }
  function setValue(v) {
    value = normalise2(v);
    paint();
  }
  function setCounts(counts) {
    for (const [key4, { btn, count }] of chips) {
      const n = counts == null ? void 0 : counts[key4];
      const known = typeof n === "number" && Number.isFinite(n);
      if (count) count.textContent = known ? n.toLocaleString() : "\u2013";
      btn.classList.toggle("twm-dt-filter-chip--empty", known && n === 0);
    }
  }
  setValue(ctx.value);
  if (ctx.counts) setCounts(ctx.counts);
  return {
    el,
    setValue,
    setCounts,
    getValue: outward,
    destroy() {
    }
  };
}

// src/ui/components/staged_history.js
var ACTIONS = Object.freeze(["cell:stage"]);
var DEFAULT_HISTORY_LIMIT = 100;
var StagedHistory = class {
  /**
   * @param {object} cfg
   * @param {(entry, direction: 'undo'|'redo') => void} cfg.apply  writes one
   *   leaf entry's `before` (undo) or `after` (redo) into the staged cells.
   *   Called once per leaf; the ring holds no reference to those cells.
   * @param {({canUndo, canRedo, depth}) => void} [cfg.onState]  after every
   *   change of the stacks.
   * @param {number} [cfg.limit=100]  entries kept; the oldest fall off.
   */
  constructor({ apply, onState = null, limit = DEFAULT_HISTORY_LIMIT } = {}) {
    if (typeof apply !== "function") {
      throw new Error("StagedHistory needs an `apply(entry, direction)`: a ring with no writer would report every undo as done and change nothing.");
    }
    this.apply = apply;
    this.onState = onState;
    this.limit = Number.isFinite(limit) && limit >= 1 ? Math.floor(limit) : DEFAULT_HISTORY_LIMIT;
    this.undoStack = [];
    this.redoStack = [];
    this.group = null;
    this.depthOpen = 0;
    this.applying = false;
  }
  get canUndo() {
    return this.undoStack.length > 0;
  }
  get canRedo() {
    return this.redoStack.length > 0;
  }
  get depth() {
    return this.undoStack.length;
  }
  /** Open a group: everything recorded until the matching `endGroup` is one
   *  undo (a fill, a paste). */
  beginGroup(label = "") {
    this.depthOpen += 1;
    if (this.depthOpen === 1) this.group = { action: "batch", label, entries: [] };
  }
  /** Close a group. An empty one is dropped, so it costs no undo step; one
   *  holding a single entry is that entry. */
  endGroup() {
    if (!this.depthOpen) return;
    this.depthOpen -= 1;
    if (this.depthOpen) return;
    const group = this.group;
    this.group = null;
    if (!group) return;
    if (group.entries.length === 1) this._push(group.entries[0]);
    else if (group.entries.length) this._push(group);
  }
  /** Record one delta. Returns whether it was recorded (false while an
   *  entry is being applied). Throws on an action that is not in `ACTIONS`. */
  record(entry) {
    if (this.applying) return false;
    if (!entry || !ACTIONS.includes(entry.action)) {
      throw new Error(`${entry?.action} is not an undoable action: the ring reverses staged cells only, never a commit.`);
    }
    if (this.group) {
      this.group.entries.push(entry);
      return true;
    }
    this._push(entry);
    return true;
  }
  undo() {
    this._closeOpenGroup();
    const entry = this.undoStack.pop();
    if (!entry) return false;
    this._run(entry, "undo");
    this.redoStack.push(entry);
    this._publish();
    return true;
  }
  redo() {
    this._closeOpenGroup();
    const entry = this.redoStack.pop();
    if (!entry) return false;
    this._run(entry, "redo");
    this.undoStack.push(entry);
    this._publish();
    return true;
  }
  /** Forget everything — after a commit or a discard, whose cells the
   *  entries no longer describe. An open group is closed with it. */
  reset() {
    this.undoStack = [];
    this.redoStack = [];
    this.group = null;
    this.depthOpen = 0;
    this._publish();
  }
  /** A group left open (a caller that threw) is closed before an undo, so it
   *  cannot swallow every later entry. */
  _closeOpenGroup() {
    if (!this.depthOpen) return;
    this.depthOpen = 1;
    this.endGroup();
  }
  _push(entry) {
    this.undoStack.push(entry);
    this.redoStack = [];
    if (this.undoStack.length > this.limit) this.undoStack.splice(0, this.undoStack.length - this.limit);
    this._publish();
  }
  _publish() {
    try {
      this.onState?.({ canUndo: this.canUndo, canRedo: this.canRedo, depth: this.undoStack.length });
    } catch (err) {
      console.error("[StagedHistory] onState threw", err);
    }
  }
  _run(entry, direction) {
    this.applying = true;
    try {
      this._applyOne(entry, direction);
    } finally {
      this.applying = false;
    }
  }
  /** A group replays in REVERSE on the way back (two writes to one cell must
   *  unwind last first) and in order on the way forward. */
  _applyOne(entry, direction) {
    if (entry.action === "batch") {
      const entries = direction === "undo" ? [...entry.entries].reverse() : entry.entries;
      for (const child of entries) this._applyOne(child, direction);
      return;
    }
    this.apply(entry, direction);
  }
};

// src/ui/components/series.js
var ISO_DATE2 = /^\d{4}-\d{2}-\d{2}$/;
var TRAILING_NUMBER = /^(.*?)(\d+)(\D*)$/;
var NUMERIC_TEXT = /^[-+]?(\d+\.?\d*|\.\d+)$/;
var DAY_MS = 864e5;
var isBlank2 = (v) => v === null || v === void 0 || v === "";
function detectSeries(values) {
  if (!Array.isArray(values) || values.length === 0) return null;
  if (values.every(isBlank2)) return null;
  if (values.length === 1) return { kind: "copy", step: 0 };
  const numbers = values.map(toNumber);
  if (numbers.every((n) => n !== null)) {
    const step = numbers[1] - numbers[0];
    const constant = numbers.every((n, i) => i === 0 || nearlyEqual(n - numbers[i - 1], step));
    if (constant && step !== 0) return { kind: "number", step };
    if (constant) return { kind: "copy", step: 0 };
    return { kind: "cycle", step: 0 };
  }
  const days = values.map(toDayMs);
  if (days.every((d) => d !== null)) {
    const step = Math.round((days[1] - days[0]) / DAY_MS);
    const constant = days.every((d, i) => i === 0 || Math.round((d - days[i - 1]) / DAY_MS) === step);
    if (constant && step !== 0) return { kind: "date", step };
    if (constant) return { kind: "copy", step: 0 };
    return { kind: "cycle", step: 0 };
  }
  const parts = values.map((v) => typeof v === "string" ? TRAILING_NUMBER.exec(v) : null);
  if (parts.every(Boolean)) {
    const prefix = parts[0][1];
    const suffix = parts[0][3];
    if (parts.every((p) => p[1] === prefix && p[3] === suffix)) {
      const nums = parts.map((p) => Number(p[2]));
      const step = nums[1] - nums[0];
      const constant = nums.every((n, i) => i === 0 || n - nums[i - 1] === step);
      if (constant && step !== 0) {
        return { kind: "text-number", step, prefix, suffix, pad: parts[0][2].length };
      }
    }
  }
  return { kind: "cycle", step: 0 };
}
function projectSeries(values, count, { forceCopy = false } = {}) {
  const out = [];
  const n = Math.max(0, Math.floor(Number(count) || 0));
  if (!Array.isArray(values) || values.length === 0 || n === 0) return out;
  const series = forceCopy ? null : detectSeries(values);
  const last = values[values.length - 1];
  if (series?.kind === "number") {
    const base = toNumber(last);
    const decimals = Math.min(15, Math.max(...values.map(decimalsOf)));
    const allNumbers = values.every((v) => typeof v === "number");
    for (let i = 1; i <= n; i++) {
      const next = base + series.step * i;
      out.push(allNumbers ? Number(next.toFixed(decimals)) : next.toFixed(decimals));
    }
    return out;
  }
  if (series?.kind === "date") {
    const asDate = last instanceof Date;
    for (let i = 1; i <= n; i++) {
      if (asDate) {
        const next = new Date(last.getTime());
        next.setDate(next.getDate() + series.step * i);
        out.push(next);
      } else {
        const next = new Date(toDayMs(last));
        next.setUTCDate(next.getUTCDate() + series.step * i);
        out.push(next.toISOString().slice(0, 10));
      }
    }
    return out;
  }
  if (series?.kind === "text-number") {
    const base = Number(TRAILING_NUMBER.exec(last)[2]);
    for (let i = 1; i <= n; i++) {
      const next = base + series.step * i;
      const digits = String(Math.abs(next)).padStart(series.pad, "0");
      out.push(`${series.prefix}${next < 0 ? "-" : ""}${digits}${series.suffix}`);
    }
    return out;
  }
  for (let i = 0; i < n; i++) out.push(values[i % values.length]);
  return out;
}
function toNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const text = value.trim();
  return NUMERIC_TEXT.test(text) ? Number(text) : null;
}
function toDayMs(value) {
  if (value instanceof Date) {
    const t2 = value.getTime();
    return Number.isNaN(t2) ? null : t2;
  }
  if (typeof value !== "string" || !ISO_DATE2.test(value.trim())) return null;
  const text = value.trim();
  const t = (/* @__PURE__ */ new Date(`${text}T00:00:00Z`)).getTime();
  if (Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== text) return null;
  return t;
}
function decimalsOf(value) {
  const text = typeof value === "number" ? String(value) : String(value).trim();
  if (/e/i.test(text)) return 15;
  return (text.split(".")[1] || "").length;
}
function nearlyEqual(a, b) {
  return Math.abs(a - b) < 1e-9;
}

// src/ui/components/tsv.js
function tsvCell(value) {
  const text = value === null || value === void 0 ? "" : String(value);
  if (/[\t\n\r"]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}
function toTSV(matrix) {
  if (!Array.isArray(matrix)) return "";
  return matrix.map((row) => (Array.isArray(row) ? row : [row]).map(tsvCell).join("	")).join("\n");
}
function fromTSV(text) {
  if (text === null || text === void 0 || text === "") return [];
  const src = String(text);
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === "	") {
      row.push(cell);
      cell = "";
    } else if (ch === "\r") {
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell);
  rows.push(row);
  while (rows.length > 1) {
    const last = rows[rows.length - 1];
    if (last.length === 1 && last[0] === "") rows.pop();
    else break;
  }
  return rows;
}

// src/ui/components/inline_renamer.js
function assertLabel(label) {
  if (!label || typeof label.appendChild !== "function") {
    throw new Error("[InlineRenamer] options.label must be an HTMLElement");
  }
}
function buildInput(label, options) {
  const input = document.createElement("input");
  input.type = "text";
  input.className = ["twm-node-edit-input", options?.inputClass || ""].join(" ").trim();
  input.placeholder = options?.placeholder || label.textContent || "Name";
  input.value = options?.initialValue ?? label.textContent ?? "";
  input.spellcheck = false;
  input.autocomplete = "off";
  input.setAttribute("aria-label", "Edit name");
  return input;
}
function attachInlineRenamer(options = {}) {
  const label = options.label;
  assertLabel(label);
  let input = null;
  let editing = false;
  let destroyed = false;
  let originalText = label.textContent || "";
  const cleanup = () => {
    if (input && input.parentNode === label) {
      input.remove();
    }
    input = null;
    editing = false;
  };
  const cancel = () => {
    if (destroyed) return;
    cleanup();
    label.textContent = originalText;
    options.onCancel?.({ value: originalText });
  };
  const commit = async (reason = "commit") => {
    if (destroyed || !input) return;
    const raw = input.value;
    let next = raw;
    try {
      next = options.transformInput ? options.transformInput(raw, { reason }) : raw;
    } catch (err) {
      window.logger?.warn("inline-renamer", "transformInput failed", err);
    }
    try {
      const result = await options.onCommit?.(next, { reason }) || {};
      if (result.success === false) {
        if (result.keepEditing) {
          input.focus();
          input.select();
          return;
        }
        cancel();
        return;
      }
      const finalValue = result.newValue ?? next ?? "";
      label.textContent = finalValue;
      cleanup();
      options.onFinish?.({ value: finalValue });
    } catch (err) {
      window.logger?.warn("inline-renamer", "onCommit failed", err);
      cancel();
    }
  };
  const start = (triggerEvent = null) => {
    if (destroyed || editing) return;
    editing = true;
    originalText = label.textContent || "";
    label.textContent = "";
    input = buildInput(label, { ...options, initialValue: originalText });
    label.appendChild(input);
    const stopEvents = (ev) => ev.stopPropagation();
    input.addEventListener("mousedown", stopEvents);
    input.addEventListener("click", stopEvents);
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        commit("enter");
      } else if (ev.key === "Escape") {
        ev.preventDefault();
        cancel();
      }
    });
    input.addEventListener("blur", () => commit("blur"));
    options.onStart?.({ value: originalText, triggerEvent });
    setTimeout(() => {
      input?.focus();
      input?.select?.();
    }, 0);
  };
  const destroy = () => {
    destroyed = true;
    cleanup();
  };
  return { start, cancel, commit, destroy };
}

// src/ui/components/staged_edits.js
var key = (rowIdx, colIdx) => `${rowIdx}:${colIdx}`;
var FROZEN_SELECTORS = [
  "th.sortable",
  ".data-table__filter-cell:not(.data-table__filter-cell--empty)",
  ".data-table__filter-cell:not(.data-table__filter-cell--empty) input",
  ".data-table__filter-cell:not(.data-table__filter-cell--empty) button",
  ".data-table__filter-cell:not(.data-table__filter-cell--empty) select",
  ".data-table__filter-cell:not(.data-table__filter-cell--empty) textarea",
  ".twm-pagination-controls button:not(.twm-pagination-btn--export)",
  ".twm-pagination-controls input",
  ".twm-dt-paging button",
  ".twm-dt-paging input"
].join(", ");
var SAVED_ATTRS = ["title", "data-refusal", "data-tooltip", "aria-disabled"];
var StagedEdits = class {
  /** @param {import('./cell_grid.js').CellGrid} grid */
  constructor(grid) {
    this.grid = grid;
    this.table = grid.table;
    this.cells = /* @__PURE__ */ new Map();
    this.errors = /* @__PURE__ */ new Map();
    this.committing = null;
    this.generation = 0;
    this._touched = null;
    this._frozen = /* @__PURE__ */ new Map();
    const limit = this.table.config.historyLimit;
    this.history = new StagedHistory({
      apply: (entry, direction) => this._apply(entry, direction),
      limit: limit == null ? DEFAULT_HISTORY_LIMIT : limit
    });
  }
  // ── what is staged ───────────────────────────────────────────────────
  has(k) {
    return this.cells.has(k);
  }
  value(k) {
    return this.cells.get(k)?.value;
  }
  /** The value the row holds for a cell: what "no change" means. */
  original(rowIdx, colIdx) {
    const row = this.grid.currentRow(rowIdx);
    return row ? row[colIdx] : void 0;
  }
  /** Every staged cell as `{rowIdx, colIdx, value, previous}`, by row then
   *  column; `previous` is the value the row holds. */
  edits() {
    return [...this.cells.values()].sort((a, b) => a.rowIdx - b.rowIdx || a.colIdx - b.colIdx).map(({ rowIdx, colIdx, value }) => ({
      rowIdx,
      colIdx,
      value,
      previous: this.original(rowIdx, colIdx)
    }));
  }
  _side(k) {
    return this.cells.has(k) ? { has: true, value: this.cells.get(k).value } : { has: false, value: null };
  }
  /** Write one side of a delta: stage the value, or take the cell out. */
  _write(rowIdx, colIdx, side) {
    const k = key(rowIdx, colIdx);
    if (side.has) this.cells.set(k, { rowIdx, colIdx, value: side.value });
    else this.cells.delete(k);
    this.errors.delete(k);
  }
  /**
   * Stage a value in a cell, as one undo entry (inside an open group, part
   * of it). The value its row holds takes the cell back to no change.
   * Returns whether anything changed.
   */
  stage(rowIdx, colIdx, value) {
    if (this.committing) return false;
    const refusal = this._dropRefusal(rowIdx, colIdx);
    if (!this._stageOne(rowIdx, colIdx, value)) {
      if (refusal) this.grid._redraw(rowIdx, colIdx);
      return false;
    }
    this.grid._redraw(rowIdx, colIdx);
    this._changed();
    return true;
  }
  /**
   * STORY-0089. Stage many cells (`[{rowIdx, colIdx, value}]`) as ONE undo
   * entry — a fill, a paste — each as `stage` would; the rows are drawn and
   * the listeners told once, at the end. Returns how many cells changed.
   */
  stageMany(cells, label = "") {
    if (this.committing) return 0;
    const rows = /* @__PURE__ */ new Set();
    let changed = 0;
    this.history.beginGroup(label);
    try {
      for (const { rowIdx, colIdx, value } of cells) {
        const refusal = this._dropRefusal(rowIdx, colIdx);
        if (this._stageOne(rowIdx, colIdx, value)) {
          changed++;
          rows.add(rowIdx);
        } else if (refusal) rows.add(rowIdx);
      }
    } finally {
      this.history.endGroup();
    }
    for (const rowIdx of rows) this.grid._redraw(rowIdx);
    if (changed) this._changed();
    return changed;
  }
  /** STORY-0087. A text that did not parse stays in its cell, marked, in
   *  the grid's own marks; anything staged into the cell ends that refusal,
   *  the value its row holds included. Whether there was one. */
  _dropRefusal(rowIdx, colIdx) {
    const k = key(rowIdx, colIdx);
    if (!this.grid.errors.has(k)) return false;
    this.grid.errors.delete(k);
    this.grid.latest.delete(k);
    return true;
  }
  /** One cell's new state and its delta in the ring; whether it changed. */
  _stageOne(rowIdx, colIdx, value) {
    const k = key(rowIdx, colIdx);
    const before = this._side(k);
    const after = Object.is(value, this.original(rowIdx, colIdx)) ? { has: false, value: null } : { has: true, value };
    if (before.has === after.has && Object.is(before.value, after.value)) return false;
    this._write(rowIdx, colIdx, after);
    this.history.record({ action: "cell:stage", row: rowIdx, col: colIdx, before, after });
    return true;
  }
  _apply(entry, direction) {
    this._write(entry.row, entry.col, direction === "undo" ? entry.before : entry.after);
    this._touched?.add(entry.row);
  }
  _walk(step) {
    if (this.committing) return false;
    this._touched = /* @__PURE__ */ new Set();
    let moved = false;
    try {
      moved = step();
    } finally {
      const rows = this._touched;
      this._touched = null;
      for (const rowIdx of rows) this.grid._redraw(rowIdx);
    }
    if (moved) this._changed();
    return moved;
  }
  undo() {
    return this._walk(() => this.history.undo());
  }
  redo() {
    return this._walk(() => this.history.redo());
  }
  /** Drop every staged cell, its marks and the ring. */
  discard() {
    if (this.committing) return false;
    const rows = this._rows();
    const had = this.cells.size > 0 || this.errors.size > 0;
    this.cells.clear();
    this.errors.clear();
    this.history.reset();
    for (const rowIdx of rows) this.grid._redraw(rowIdx);
    if (had) this._changed();
    return had;
  }
  /** New rows (`setData({rows})`): the cells named rows that are gone. */
  clear() {
    this.generation++;
    this.committing = null;
    const had = this.cells.size > 0 || this.errors.size > 0;
    this.cells.clear();
    this.errors.clear();
    this.history.reset();
    if (had) this._changed();
  }
  _rows() {
    const rows = /* @__PURE__ */ new Set();
    for (const c of this.cells.values()) rows.add(c.rowIdx);
    for (const k of this.errors.keys()) rows.add(Number(k.split(":")[0]));
    return rows;
  }
  // ── the commit ───────────────────────────────────────────────────────
  /**
   * Hand every staged cell to `onCommit({edits})`, once. Resolves
   * `{ok: true, committed}` when it succeeded — the values are written into
   * the rows the table holds, and the staged cells and the ring are gone —
   * or `{ok: false, errors}` when it refused: per-cell errors mark their
   * cells, a refusal with none marks every staged cell, and every staged
   * value stays.
   */
  commit() {
    if (this.committing) return this.committing;
    if (this.grid.isEditing()) this.grid.editor.commit(null, "commit");
    const fn = this.table.config.onCommit;
    const edits = this.edits();
    if (!edits.length) return Promise.resolve({ ok: true, committed: 0 });
    if (typeof fn !== "function") {
      console.warn("[DataTable] commit() needs an `onCommit`; nothing was committed.");
      return Promise.resolve({ ok: false, errors: [] });
    }
    const generation = this.generation;
    const refused = (err) => ({ ok: false, error: err?.message || String(err ?? "Not saved") });
    let result;
    try {
      result = fn({ edits: edits.map((e) => ({ ...e })) });
    } catch (err) {
      result = refused(err);
    }
    const out = Promise.resolve(result).then((r) => r, refused).then((r) => {
      if (generation !== this.generation) return { ok: false, errors: [] };
      this.committing = null;
      return this._settle(edits, r);
    });
    this.committing = out;
    this._changed();
    return out;
  }
  _settle(edits, result) {
    const listed = Array.isArray(result?.errors) ? result.errors : [];
    if (listed.length || result?.ok === false) {
      const errors = [];
      const mark = (rowIdx, colIdx, message) => {
        const k = key(rowIdx, colIdx);
        if (!this.cells.has(k)) return;
        const text = String(message ?? "Not saved");
        this.errors.set(k, text);
        errors.push({ rowIdx, colIdx, error: text });
      };
      if (listed.length) {
        for (const e of listed) mark(e?.rowIdx, e?.colIdx, e?.error ?? e?.message);
      } else {
        for (const e of edits) mark(e.rowIdx, e.colIdx, result.error);
      }
      for (const rowIdx of this._rows()) this.grid._redraw(rowIdx);
      this._changed();
      return { ok: false, errors };
    }
    const rows = this._rows();
    for (const e of edits) {
      const row = this.grid.currentRow(e.rowIdx);
      if (Array.isArray(row)) row[e.colIdx] = e.value;
    }
    this.cells.clear();
    this.errors.clear();
    this.history.reset();
    for (const rowIdx of rows) this.grid._redraw(rowIdx);
    this._changed();
    return { ok: true, committed: edits.length };
  }
  // ── the freeze ───────────────────────────────────────────────────────
  /** Why sort, filters and pages are held, or null when nothing is staged. */
  freezeReason() {
    const n = this.cells.size;
    if (!n) return null;
    const own = this.table.config.stagedRefusal;
    if (typeof own === "function") {
      try {
        return String(own(n));
      } catch (err) {
        console.error("[DataTable] stagedRefusal threw", err);
      }
    } else if (typeof own === "string" && own) return own;
    return `Sorting, filtering and paging are held while ${n} change${n === 1 ? " is" : "s are"} not committed. Commit or discard them first.`;
  }
  /** Disable every control the freeze holds with the reason on it, or put
   *  back the ones it held. Run after every render and every change. */
  paintFreeze() {
    const root = this.table._wrapperEl;
    const reason = this.freezeReason();
    root?.classList.toggle("twm-dt--frozen", !!reason);
    if (!reason) {
      for (const [el, saved] of this._frozen) this._thaw(el, saved);
      this._frozen.clear();
      return;
    }
    for (const el of this._frozen.keys()) if (!el.isConnected) this._frozen.delete(el);
    if (!root) return;
    for (const el of root.querySelectorAll(FROZEN_SELECTORS)) {
      if (!this._frozen.has(el)) {
        const saved = {};
        for (const a of SAVED_ATTRS) saved[a] = el.getAttribute(a);
        saved.disabled = "disabled" in el ? el.disabled : null;
        this._frozen.set(el, saved);
      }
      el.setAttribute("data-refusal", reason);
      el.setAttribute("title", reason);
      if (el.hasAttribute("data-tooltip")) el.setAttribute("data-tooltip", reason);
      el.setAttribute("aria-disabled", "true");
      if ("disabled" in el) el.disabled = true;
    }
  }
  _thaw(el, saved) {
    for (const a of SAVED_ATTRS) {
      if (saved[a] == null) el.removeAttribute(a);
      else el.setAttribute(a, saved[a]);
    }
    if (saved.disabled !== null) el.disabled = saved.disabled;
  }
  /** After every change: the freeze, and whoever listens. */
  _changed() {
    this.paintFreeze();
    const fn = this.table.config.onStagedChange;
    if (typeof fn !== "function") return;
    try {
      fn({
        count: this.cells.size,
        canUndo: this.history.canUndo,
        canRedo: this.history.canRedo,
        committing: !!this.committing
      });
    } catch (err) {
      console.error("[DataTable] onStagedChange threw", err);
    }
  }
};

// src/ui/components/fill_handle.js
var key2 = (rowIdx, colIdx) => `${rowIdx}:${colIdx}`;
var FillHandle = class {
  /** @param {import('./cell_grid.js').CellGrid} grid */
  constructor(grid) {
    this.grid = grid;
    this.el = null;
    this.corner = null;
    this.skipped = /* @__PURE__ */ new Set();
    this.preview = /* @__PURE__ */ new Set();
    this.drag = null;
    this._unguard = null;
  }
  // ── painting (called by the grid for every cell it paints) ───────────
  /** One cell: its preview and skipped marks, and the handle when it is
   *  the range's corner. */
  paintCell(td, pos, col) {
    const rowIdx = td.parentNode?.__rowIndex;
    td.classList.toggle("twm-dt-cell--fill-preview", this.preview.has(`${pos}:${col}`));
    td.classList.toggle("twm-dt-cell--fill-skipped", this.skipped.has(key2(rowIdx, col)));
    const r = this.grid.sel.range();
    if (r && r.bottom === pos && r.right === col) this._place(td);
    else if (td === this.corner) this._unplace();
  }
  _handle() {
    if (this.el) return this.el;
    const el = document.createElement("div");
    el.className = "twm-dt-fill-handle";
    el.setAttribute("aria-hidden", "true");
    el.title = "Drag to fill; hold Ctrl to repeat instead of continuing a series";
    el.addEventListener("pointerdown", (ev) => this._begin(ev));
    this.el = el;
    return el;
  }
  _place(td) {
    if (this.grid.isEditing() || this.grid.staged.committing) {
      this._unplace();
      return;
    }
    if (this.corner && this.corner !== td) this.corner.classList.remove("twm-dt-cell--fill-corner");
    this.corner = td;
    td.classList.add("twm-dt-cell--fill-corner");
    const el = this._handle();
    if (el.parentNode !== td) td.appendChild(el);
  }
  _unplace() {
    this.corner?.classList.remove("twm-dt-cell--fill-corner");
    this.corner = null;
    this.el?.remove();
  }
  // ── what a fill covers ───────────────────────────────────────────────
  /**
   * The fill that reaching cell `to` (`{row, col}`, position and data
   * column) from `range` makes: `{direction, count}`, or null when `to` is
   * inside the range's rows and columns. The direction is the one the cell
   * lies furthest out in; up and down win a tie. Clamped to the page drawn.
   */
  plan(range, to) {
    if (!range || !to) return null;
    const cols = this.grid.columns();
    const [first, last] = this.grid.span();
    const row = Math.max(first, Math.min(last, Number(to.row)));
    const ordL = cols.indexOf(range.left);
    const ordR = cols.indexOf(range.right);
    const ordTo = cols.indexOf(to.col);
    const out = [
      ["down", row - range.bottom],
      ["up", range.top - row],
      ["right", ordTo < 0 ? 0 : ordTo - ordR],
      ["left", ordTo < 0 ? 0 : ordL - ordTo]
    ];
    let best = null;
    for (const [direction, count] of out) {
      if (count > 0 && (!best || count > best.count)) best = { direction, count };
    }
    return best;
  }
  /** The cells a plan covers, as `{pos, col}`, line by line in fill order:
   *  `[{seed: [{pos, col}], targets: [{pos, col}]}]`. */
  _lines(range, { direction, count }) {
    const cols = this.grid.columns();
    const ordL = cols.indexOf(range.left);
    const ordR = cols.indexOf(range.right);
    const lines = [];
    if (direction === "down" || direction === "up") {
      const down = direction === "down";
      for (let o = ordL; o <= ordR; o++) {
        const col = cols[o];
        const seed = [];
        for (let p = range.top; p <= range.bottom; p++) seed.push({ pos: p, col });
        if (!down) seed.reverse();
        const targets = [];
        for (let i = 1; i <= count; i++) {
          targets.push({ pos: down ? range.bottom + i : range.top - i, col });
        }
        lines.push({ seed, targets });
      }
    } else {
      const right = direction === "right";
      for (let p = range.top; p <= range.bottom; p++) {
        const seed = [];
        for (let o = ordL; o <= ordR; o++) seed.push({ pos: p, col: cols[o] });
        if (!right) seed.reverse();
        const targets = [];
        for (let i = 1; i <= count; i++) {
          const o = right ? ordR + i : ordL - i;
          if (o >= 0 && o < cols.length) targets.push({ pos: p, col: cols[o] });
        }
        lines.push({ seed, targets });
      }
    }
    return lines;
  }
  // ── the fill ─────────────────────────────────────────────────────────
  /**
   * Fill from the range to cell `to`, staging the values as ONE undo
   * entry. Returns `{direction, count, staged, skipped}` (`skipped` the
   * cells `editable` refused, `{row, col, rowIdx}`), or null when nothing
   * was filled: no range, `to` inside it, an editor open or a commit out.
   */
  fill(to, { forceCopy = false } = {}) {
    const g = this.grid;
    g._sync();
    const range = g.sel.range();
    const plan = this.plan(range, to);
    if (!plan || g.staged.committing || g.isEditing()) return null;
    const cells = [];
    const skipped = [];
    for (const { seed, targets } of this._lines(range, plan)) {
      const values = projectSeries(
        seed.map(({ pos, col }) => g.shownValue(g.rowIndexAt(pos), col)),
        targets.length,
        { forceCopy }
      );
      targets.forEach(({ pos, col }, i) => {
        const rowIdx = g.rowIndexAt(pos);
        if (g.canEdit(pos, col)) cells.push({ rowIdx, colIdx: col, value: values[i] });
        else skipped.push({ row: pos, col, rowIdx });
      });
    }
    const staged = g.staged.stageMany(cells, `fill ${cells.length} cell(s)`);
    const cols = g.columns();
    const ordL = cols.indexOf(range.left);
    const ordR = cols.indexOf(range.right);
    const { direction, count } = plan;
    if (direction === "down") g.set({ row: range.bottom + count, col: range.right }, { row: range.top, col: range.left });
    else if (direction === "up") g.set({ row: range.top - count, col: range.left }, { row: range.bottom, col: range.right });
    else if (direction === "right") g.set({ row: range.bottom, col: cols[Math.min(cols.length - 1, ordR + count)] }, { row: range.top, col: range.left });
    else g.set({ row: range.top, col: cols[Math.max(0, ordL - count)] }, { row: range.bottom, col: range.right });
    for (const s of skipped) this.skipped.add(key2(s.rowIdx, s.col));
    if (skipped.length) g.paint();
    return { direction, count, staged, skipped };
  }
  /** The selection moved, or new rows came: the skipped marks are over. */
  clearMarks() {
    this.skipped.clear();
  }
  // ── the drag ─────────────────────────────────────────────────────────
  _begin(ev) {
    if (ev.button != null && ev.button !== 0) return;
    ev.preventDefault();
    ev.stopPropagation();
    const g = this.grid;
    g._sync();
    const range = g.sel.range();
    if (!range || this.drag || g.isEditing() || g.staged.committing) return;
    const doc = this.el.ownerDocument;
    this._guardClick(doc);
    const onMove = (move) => this._move(move);
    const onUp = (up) => {
      const plan = this.drag?.plan;
      this._end();
      if (plan) this.fill(this._reach(range, plan), { forceCopy: !!(up.ctrlKey || up.metaKey) });
      try {
        g.table._tableEl?.focus({ preventScroll: true });
      } catch (_) {
      }
    };
    const onCancel = () => this._end();
    const onKey = (k) => {
      if (k.key === "Escape") {
        k.preventDefault();
        k.stopPropagation();
        this._end();
      }
    };
    doc.addEventListener("pointermove", onMove);
    doc.addEventListener("pointerup", onUp);
    doc.addEventListener("pointercancel", onCancel);
    doc.addEventListener("keydown", onKey, true);
    this.drag = {
      range,
      plan: null,
      unbind: () => {
        doc.removeEventListener("pointermove", onMove);
        doc.removeEventListener("pointerup", onUp);
        doc.removeEventListener("pointercancel", onCancel);
        doc.removeEventListener("keydown", onKey, true);
      }
    };
  }
  /**
   * A press on the handle and its release make, in a browser, a click (and
   * on a second press a dblclick) of their own, on the element under both:
   * the corner cell, the row, the body. Filled, cancelled by Escape or
   * released where it began, a drag is no click on the table: from the
   * press, the next click in the document is swallowed in the capture
   * phase, and so is every dblclick until the task the release is handled
   * in is over. A cancelled pointer makes no click; the guard ends with it.
   */
  _guardClick(doc) {
    this._unguard?.();
    const view = doc.defaultView;
    let timer = null;
    const swallow = (c) => {
      c.stopPropagation();
      c.preventDefault();
    };
    const swallowOnce = (c) => {
      swallow(c);
      doc.removeEventListener("click", swallowOnce, true);
    };
    const released = () => {
      doc.removeEventListener("pointerup", released, true);
      doc.removeEventListener("pointercancel", unguard, true);
      timer = view.setTimeout(unguard, 0);
    };
    const unguard = () => {
      if (timer !== null) view.clearTimeout(timer);
      doc.removeEventListener("click", swallowOnce, true);
      doc.removeEventListener("dblclick", swallow, true);
      doc.removeEventListener("pointerup", released, true);
      doc.removeEventListener("pointercancel", unguard, true);
      if (this._unguard === unguard) this._unguard = null;
    };
    doc.addEventListener("click", swallowOnce, true);
    doc.addEventListener("dblclick", swallow, true);
    doc.addEventListener("pointerup", released, true);
    doc.addEventListener("pointercancel", unguard, true);
    this._unguard = unguard;
  }
  /** The cell a plan reaches, as `fill` takes it. */
  _reach(range, { direction, count }) {
    const cols = this.grid.columns();
    if (direction === "down") return { row: range.bottom + count, col: range.right };
    if (direction === "up") return { row: range.top - count, col: range.left };
    if (direction === "right") return { row: range.bottom, col: cols[cols.indexOf(range.right) + count] };
    return { row: range.top, col: cols[cols.indexOf(range.left) - count] };
  }
  /** The data cell under the pointer: the event's target, or (a touch,
   *  whose events stay on the handle) the element at its point. */
  _cellUnder(ev) {
    const tbody = this.grid.table._tbodyEl;
    const hit = (el) => {
      const td = el?.closest?.("td");
      if (!td || td.__colIdx === void 0 || !tbody?.contains(td)) return null;
      const pos = td.parentNode?.__cellPos;
      return pos === void 0 ? null : { row: pos, col: td.__colIdx };
    };
    let cell = ev.target === this.el ? null : hit(ev.target);
    const doc = this.el.ownerDocument;
    if (!cell && typeof doc.elementFromPoint === "function") {
      cell = hit(doc.elementFromPoint(ev.clientX, ev.clientY));
    }
    return cell;
  }
  _move(ev) {
    const d = this.drag;
    if (!d) return;
    const cell = this._cellUnder(ev);
    if (!cell) return;
    d.plan = this.plan(d.range, cell);
    this.preview.clear();
    if (d.plan) {
      for (const { targets } of this._lines(d.range, d.plan)) {
        for (const t of targets) this.preview.add(`${t.pos}:${t.col}`);
      }
    }
    this.grid.paint();
  }
  _end() {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    d.unbind();
    this.preview.clear();
    this.grid.paint();
  }
  dispose() {
    this._end();
    this._unguard?.();
    this._unplace();
    this.skipped.clear();
  }
};

// src/ui/components/cell_paste.js
var key3 = (rowIdx, colIdx) => `${rowIdx}:${colIdx}`;
var CellPaste = class {
  /** @param {import('./cell_grid.js').CellGrid} grid */
  constructor(grid) {
    this.grid = grid;
    this.skipped = /* @__PURE__ */ new Set();
    this.busy = false;
  }
  // ── painting (called by the grid for every cell it paints) ───────────
  paintCell(td, col) {
    const rowIdx = td.parentNode?.__rowIndex;
    td.classList.toggle("twm-dt-cell--paste-skipped", this.skipped.has(key3(rowIdx, col)));
  }
  /** The selection moved, or new rows came: the skipped marks are over. */
  clearMarks() {
    this.skipped.clear();
  }
  // ── reading a value ──────────────────────────────────────────────────
  /**
   * The parse a column's pasted text is read with: an injected editor's
   * own (`editors[k].parse`, looked up as the editor is), else the built-in
   * editor's for the column's type, else the text as it is.
   */
  _parserFor(col) {
    const g = this.grid;
    const editors = g._cfg().editors;
    if (editors && typeof editors === "object") {
      for (const k of [col, g._rawType(col), g._typeOf(col)]) {
        const f = editors[k];
        if (typeof f === "function") {
          if (typeof f.parse === "function") return f.parse;
          break;
        }
      }
    }
    const type = g._typeOf(col);
    return Object.prototype.hasOwnProperty.call(CELL_EDITORS, type) ? CELL_EDITORS[type].parse : CELL_EDITORS.text.parse;
  }
  /** One column's reader: `(text) => {ok: true, value} | {ok: false, error}`. */
  _reader(col) {
    const g = this.grid;
    const cfg = g._cfg();
    const spec = g._editSpec(col) || {};
    const parse = this._parserFor(col);
    const ctx = {
      locale: cfg.locale ?? void 0,
      utc: g.table._utc(),
      messages: cfg.editorMessages ?? void 0,
      options: spec.options,
      allowOther: !!spec.allowOther
    };
    return (text) => {
      let r;
      try {
        r = parse(text, ctx);
      } catch (err) {
        return { ok: false, error: err?.message || String(err ?? "Not pasted") };
      }
      if (r && r.ok === true) return { ok: true, value: r.value };
      if (r && r.ok === false) return { ok: false, error: String(r.error ?? "Not pasted") };
      return { ok: false, error: "Not pasted" };
    };
  }
  /** The position of the last loaded row: the rows held in the order shown
   *  (all of them filtered and sorted; a server's page, the rows it sent). */
  _lastLoaded() {
    const t = this.grid.table;
    if (t._isServerSide()) return this.grid.span()[1];
    return t._getProcessedRows().length - 1;
  }
  _warn(message) {
    console.warn(`[DataTable] paste: ${message}`);
    this.grid.table._notify("Paste", message, "warn");
  }
  // ── the paste ────────────────────────────────────────────────────────
  /**
   * Paste tab-separated `text` at the cursor. Resolves `{rows, cols, staged,
   * skipped, refused, droppedColumns, appended}` — `staged` the NUMBER of
   * cells that changed, `skipped` the cells `editable` refused and `refused`
   * the ones whose text did not parse (`{row, col, rowIdx}`, `refused` with
   * its `text` and `error`), `droppedColumns` the columns past the last one,
   * `appended` the rows handed to `onRowsAppend` — or null when nothing was
   * pasted: empty text, no cursor, an editor open, a commit or another paste
   * out, an overrun declined, or new rows while `onPasteOverrun` was asked.
   */
  async paste(text) {
    const g = this.grid;
    const matrix = fromTSV(text);
    if (!matrix.length || this.busy) return null;
    g._sync();
    const at = g.sel.focus ? { ...g.sel.focus } : null;
    if (!at || g.isEditing() || g.staged.committing) return null;
    const cfg = g._cfg();
    const cols = g.columns();
    const width = Math.max(...matrix.map((line) => line.length));
    const targetCols = cols.slice(cols.indexOf(at.col), cols.indexOf(at.col) + width);
    const droppedColumns = width - targetCols.length;
    const last = this._lastLoaded();
    const fit = Math.max(0, Math.min(matrix.length, last - at.row + 1));
    const extra = matrix.length - fit;
    const generation = g.generation;
    if (extra > 0) {
      const ask = cfg.onPasteOverrun;
      let answer = false;
      if (typeof ask === "function") {
        this.busy = true;
        try {
          answer = await ask({ rows: extra });
        } catch (err) {
          console.error("[DataTable] onPasteOverrun threw", err);
          answer = false;
        } finally {
          this.busy = false;
        }
      } else {
        console.warn(`[DataTable] paste: ${extra} row(s) past the last loaded row and no \`onPasteOverrun\`; nothing pasted.`);
      }
      if (answer !== true) return null;
      if (generation !== g.generation || g.isEditing() || g.staged.committing) return null;
    }
    const cells = [];
    const skipped = [];
    const refused = [];
    const readers = new Map(targetCols.map((col) => [col, this._reader(col)]));
    for (let r = 0; r < fit; r++) {
      const pos = at.row + r;
      const rowIdx = g.rowIndexAt(pos);
      targetCols.forEach((col, c) => {
        if (c >= matrix[r].length) return;
        if (!g.canEdit(pos, col)) {
          skipped.push({ row: pos, col, rowIdx });
          return;
        }
        const text2 = matrix[r][c];
        const read = readers.get(col)(text2);
        if (read.ok) cells.push({ rowIdx, colIdx: col, value: read.value });
        else refused.push({ row: pos, col, rowIdx, text: text2, error: read.error });
      });
    }
    let appended = 0;
    if (extra > 0) {
      const n = (cfg.headers || []).length;
      const rows = [];
      const errors = [];
      for (let r = fit; r < matrix.length; r++) {
        const row = new Array(n).fill(null);
        targetCols.forEach((col, c) => {
          if (c >= matrix[r].length) return;
          const text2 = matrix[r][c];
          const read = readers.get(col)(text2);
          if (read.ok) row[col] = read.value;
          else errors.push({ row: rows.length, colIdx: col, text: text2, error: read.error });
        });
        rows.push(row);
      }
      const append = cfg.onRowsAppend;
      if (typeof append === "function") {
        appended = rows.length;
        this.busy = true;
        try {
          await append({ rows, errors });
        } catch (err) {
          console.error("[DataTable] onRowsAppend threw", err);
        } finally {
          this.busy = false;
        }
      } else {
        this._warn(`${rows.length} row(s) past the last loaded row were not pasted (no \`onRowsAppend\`).`);
      }
    }
    const staged = g.staged.stageMany(cells, `paste ${cells.length} cell(s)`);
    const lastCol = targetCols[targetCols.length - 1] ?? at.col;
    const lastRow = at.row + Math.max(0, fit - 1);
    g.set({ row: at.row, col: at.col }, { row: lastRow, col: lastCol });
    for (const s of skipped) this.skipped.add(key3(s.rowIdx, s.col));
    const redraw = /* @__PURE__ */ new Set();
    for (const f of refused) {
      const k = key3(f.rowIdx, f.col);
      g.errors.set(k, { value: f.text, message: f.error });
      g.latest.set(k, {});
      g.pending.delete(k);
      redraw.add(f.rowIdx);
    }
    for (const rowIdx of redraw) g._redraw(rowIdx);
    if (skipped.length) g.paint();
    if (droppedColumns > 0) {
      this._warn(`${droppedColumns} column(s) past the last column were not pasted.`);
    }
    return {
      rows: matrix.length,
      cols: width,
      staged,
      skipped,
      refused,
      droppedColumns,
      appended
    };
  }
  dispose() {
    this.skipped.clear();
  }
};

// src/ui/components/cell_grid.js
function isFilledValue(value) {
  if (value == null) return false;
  if (typeof value === "string") return value !== "";
  if (typeof value === "number") return !Number.isNaN(value);
  return true;
}
function isPrintable(ev) {
  return typeof ev.key === "string" && [...ev.key].length === 1 && !ev.ctrlKey && !ev.metaKey && !ev.altKey;
}
var ARROWS = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1]
};
function copyText(value, { kind, utc }) {
  if (value === null || value === void 0) return "";
  const dated = kind === "date" || kind === "datetime";
  if (value instanceof Date || dated && typeof value === "number") {
    const t = value instanceof Date ? value.getTime() : value;
    if (!Number.isFinite(t)) return "";
    return kind === "date" ? formatDate(t, ISO_DATE, { utc }) : new Date(t).toISOString();
  }
  return String(value);
}
var CellGrid = class {
  /** @param {import('./data_table.js').DataTable} table */
  constructor(table) {
    this.table = table;
    this.sel = new CellSelection();
    this.pending = /* @__PURE__ */ new Map();
    this.errors = /* @__PURE__ */ new Map();
    this.renderWaiting = false;
    this.rowsWaiting = /* @__PURE__ */ new Set();
    this.latest = /* @__PURE__ */ new Map();
    this.generation = 0;
    this.editor = new CellEditorHost({
      onCommit: (s, value, move, reason) => this._committed(s, value, move, reason),
      onCancel: (s, reason) => this._closed(s, reason),
      onRefuse: (s, error, text, reason) => this._refused(s, error, text, reason)
    });
    this.staged = null;
    if (this._cfg().staged) {
      if (this._cfg().editable) this.staged = new StagedEdits(this);
      else console.warn("[DataTable] `staged` needs `editable`; ignored.");
    }
    this.fill = null;
    if (this._cfg().fillHandle) {
      if (this.staged) this.fill = new FillHandle(this);
      else console.warn("[DataTable] `fillHandle` needs `staged`; ignored.");
    }
    this.paste = null;
    if (this._cfg().pasteable) {
      if (this.staged) this.paste = new CellPaste(this);
      else console.warn("[DataTable] `pasteable` needs `staged`; ignored.");
    }
  }
  // ── what the table is, read through its own helpers ──────────────────
  _cfg() {
    return this.table.config;
  }
  /** The data columns shown, in the order shown. */
  columns() {
    return this.table._shownColumns();
  }
  /** The positions of the rows on the page drawn, `[first, last]`. */
  span() {
    const s = this.table._pageSpan || { start: 0, count: 0 };
    return [s.start, s.start + s.count - 1];
  }
  _sync() {
    const [first, last] = this.span();
    this.sel.setBounds(first, last, this.columns());
  }
  /** A position's original row index (the `__rowIndex` space). */
  rowIndexAt(pos) {
    const t = this.table;
    if (t._isServerSide()) return (t.config.dataSource ? 0 : t.config.offset || 0) + pos;
    t._getProcessedRows();
    return t._processedIndexMap?.[pos] ?? pos;
  }
  rowAt(pos) {
    return this.table._getProcessedRows()[pos] ?? null;
  }
  /**
   * The row the table holds NOW for an original row index — the window's
   * row list, else `config.rows` at the place the table draws it from —
   * the one `updateRow` writes. Never a row captured earlier.
   */
  currentRow(rowIdx) {
    const t = this.table;
    const local = t._virtLocalOf(rowIdx);
    if (local >= 0) return t._virt.rows[local] ?? null;
    const rows = t.config.rows;
    if (!Array.isArray(rows)) return null;
    const at = t._isServerSide() ? rowIdx - (t.config.dataSource ? 0 : t.config.offset || 0) : rowIdx;
    return rows[at] ?? null;
  }
  /** What a cell shows: a refused or pending commit's value, else the row's. */
  shownValue(rowIdx, col) {
    const key4 = `${rowIdx}:${col}`;
    const err = this.errors.get(key4);
    if (err) return err.value;
    if (this.pending.has(key4)) return this.pending.get(key4);
    if (this.staged?.has(key4)) return this.staged.value(key4);
    const row = this.currentRow(rowIdx);
    return row ? row[col] : void 0;
  }
  /** Whether the open editor sits in this row element. */
  _holds(tr) {
    const s = this.editor.session;
    return !!s && !!tr && tr.contains(s.td);
  }
  /**
   * `updateRow` on a drawn row: the table has stored the data already. When
   * the row holds the open editor the rebuild — which would take the editor
   * out of the document — waits for that editor to close, the editor's cell
   * left as it is. Returns whether it waits.
   */
  holdRow(tr, rowIdx) {
    if (!this._holds(tr)) return false;
    this.rowsWaiting.add(rowIdx);
    return true;
  }
  valueAt(pos, col) {
    const row = this.rowAt(pos);
    return row ? row[col] : void 0;
  }
  /** The `<td>` drawing a cell, or null when it is not drawn. */
  cellEl(pos, col) {
    const tr = this.table.getRowElement(this.rowIndexAt(pos));
    if (!tr) return null;
    for (const td of tr.children) if (td.__colIdx === col) return td;
    return null;
  }
  // ── the public face (DataTable delegates) ────────────────────────────
  /** `{anchor, focus, range}`; each cell is `{row, col, rowIdx}`, and the
   *  range also lists its `rows` (original indices) and `columns`. */
  get() {
    this._sync();
    const cell = (c) => c ? { row: c.row, col: c.col, rowIdx: this.rowIndexAt(c.row) } : null;
    const r = this.sel.range();
    let range = null;
    if (r) {
      const rows = [];
      for (let p = r.top; p <= r.bottom; p++) rows.push(this.rowIndexAt(p));
      range = { ...r, rows };
    }
    return { anchor: cell(this.sel.anchor), focus: cell(this.sel.focus), range };
  }
  /** Rows (original indices) the range touches, ascending. */
  rowIndices() {
    const r = this.sel.range();
    if (!r) return [];
    const out = [];
    for (let p = r.top; p <= r.bottom; p++) out.push(this.rowIndexAt(p));
    return out.sort((a, b) => a - b);
  }
  /** Select from `anchor` to `focus` (`{row, col}`, positions and data
   *  indices), or put the cursor on `focus` alone. */
  set(focus, anchor = null) {
    this._sync();
    if (!focus) {
      this.sel.clear();
      this._changed();
      return;
    }
    this.sel.setCursor(anchor ? anchor.row : focus.row, anchor ? anchor.col : focus.col);
    if (anchor) this.sel.extendTo(focus.row, focus.col);
    this._changed({ reveal: true });
  }
  /** `setSelection(indices)` in cell mode: whole rows, the first to the last
   *  of them as shown. */
  selectRows(indices) {
    this._sync();
    const t = this.table;
    t._getProcessedRows();
    const map = t._processedIndexMap || [];
    const positions = indices.map((i) => t._isServerSide() ? i - (t.config.dataSource ? 0 : t.config.offset || 0) : map.indexOf(i)).filter((p) => p >= 0);
    const cols = this.sel.cols;
    if (!positions.length || !cols.length) {
      this.sel.clear();
      this._changed();
      return;
    }
    this.sel.setCursor(Math.min(...positions), cols[0]);
    this.sel.extendTo(Math.max(...positions), cols[cols.length - 1]);
    this._changed();
  }
  clear() {
    this.sel.clear();
    this._changed();
  }
  /**
   * STORY-0085. What a copy of the selection puts on the clipboard: the
   * range's cells as text, one array per row in the order SHOWN (after the
   * sort and the filters), its shown columns left to right (a hidden column
   * inside it is not one of them). With no range beyond the cursor, the
   * cursor cell alone. A cell is its RAW value as text (`copyText`), not
   * the text it is drawn as: the value the cell holds now, a staged,
   * pending or refused one included. Null with nothing selected.
   */
  copyMatrix() {
    this._sync();
    const r = this.sel.range();
    if (!r) return null;
    const t = this.table;
    const utc = t._utc();
    const out = [];
    for (let p = r.top; p <= r.bottom; p++) {
      const rowIdx = this.rowIndexAt(p);
      out.push(r.columns.map((col) => copyText(this.shownValue(rowIdx, col), { kind: t._valueKind(col), utc })));
    }
    return out;
  }
  /** New rows (`setData({rows})`): the marks were about the old ones. */
  newRows() {
    this.generation++;
    this.pending.clear();
    this.errors.clear();
    this.latest.clear();
    this.rowsWaiting.clear();
    this.staged?.clear();
    this.fill?.clearMarks();
    this.paste?.clearMarks();
  }
  isEditing() {
    return !!this.editor.session;
  }
  // ── painting ─────────────────────────────────────────────────────────
  /** Called for every row drawn — on render, on a scroll, on `updateRow` —
   *  so a row that arrives later is painted like the rest. */
  decorateRow(tr) {
    const pos = tr.__cellPos;
    if (pos === void 0) return;
    for (const td of tr.children) {
      if (td.__colIdx !== void 0) this._decorateCell(td, pos, tr.__rowIndex, td.__colIdx);
    }
  }
  /** One cell: the selection, its commit's pending or refused mark, and
   *  (STORY-0088) its staged value and a refused batch's mark. */
  _decorateCell(td, pos, rowIdx, col) {
    this._paintCell(td, pos, col);
    const key4 = `${rowIdx}:${col}`;
    const err = this.errors.get(key4);
    const waiting = this.pending.has(key4);
    const staged = !!this.staged?.has(key4);
    if (err || waiting) {
      td.textContent = this.table._formatValue(err ? err.value : this.pending.get(key4), col);
    } else if (staged) {
      td.textContent = this.table._formatValue(this.staged.value(key4), col);
    }
    const message = err ? err.message : this.staged?.errors.get(key4);
    td.classList.toggle("twm-dt-cell--pending", waiting);
    td.classList.toggle("twm-dt-cell--staged", staged);
    td.classList.toggle("twm-dt-cell--error", message != null);
    if (message != null) {
      td.title = message;
      td.setAttribute("data-error", message);
    } else td.removeAttribute("data-error");
    this.fill?.paintCell(td, pos, col);
  }
  _paintCell(td, pos, col) {
    td.classList.toggle("twm-dt-cell--selected", this.sel.contains(pos, col));
    const cursor = this.sel.isCursor(pos, col);
    td.classList.toggle("twm-dt-cell--cursor", cursor);
    if (cursor) td.setAttribute("aria-selected", "true");
    else td.removeAttribute("aria-selected");
    this.fill?.paintCell(td, pos, col);
    this.paste?.paintCell(td, col);
  }
  paint() {
    const tbody = this.table._tbodyEl;
    if (!tbody) return;
    for (const tr of tbody.children) {
      const pos = tr.__cellPos;
      if (pos === void 0) continue;
      for (const td of tr.children) {
        if (td.__colIdx !== void 0) this._paintCell(td, pos, td.__colIdx);
      }
    }
  }
  /** The selection moved: the cells, the rows `getSelection()` answers, and
   *  whoever listens. */
  _changed({ reveal = false } = {}) {
    const t = this.table;
    this.fill?.clearMarks();
    this.paste?.clearMarks();
    if (reveal && this.sel.focus) t.scrollToRow(this.rowIndexAt(this.sel.focus.row));
    this.paint();
    const before = t.getSelection().join();
    const rows = this.rowIndices();
    t._state.selected.clear();
    for (const i of rows) t._state.selected.add(i);
    t._state.anchorIndex = this.sel.anchor ? this.rowIndexAt(this.sel.anchor.row) : null;
    if (rows.join() !== before) t._notifySelectionChange();
    try {
      t.config.onCellSelectionChange?.(this.get());
    } catch (err) {
      console.error("[DataTable] onCellSelectionChange threw", err);
    }
  }
  // ── the pointer and the keys ─────────────────────────────────────────
  /** Bound by `_installInteractions` on every render, BEFORE the table's own
   *  activation, detail and copy listeners, so a key the cell mode takes
   *  goes no further. Listeners go on the table's disposers. */
  install(tbody, table) {
    const t = this.table;
    const on = (el, type, fn) => {
      el.addEventListener(type, fn);
      t._disposers.push(() => el.removeEventListener(type, fn));
    };
    this._sync();
    const cellOf = (target) => {
      const td = target?.closest?.("td");
      if (!td || td.__colIdx === void 0 || !tbody.contains(td)) return null;
      const tr = td.parentNode;
      if (tr?.__cellPos === void 0) return null;
      return { td, row: tr.__cellPos, col: td.__colIdx };
    };
    const inEditor = (target) => !!this.editor.session && this.editor.session.td.contains(target);
    on(tbody, "click", (ev) => {
      if (ev.button != null && ev.button !== 0) return;
      if (inEditor(ev.target)) return;
      const hit = cellOf(ev.target);
      if (!hit) return;
      this._sync();
      if (ev.shiftKey && this.sel.anchor) this.sel.extendTo(hit.row, hit.col);
      else this.sel.setCursor(hit.row, hit.col);
      this._changed();
      try {
        table.focus({ preventScroll: true });
      } catch (_) {
      }
    });
    on(tbody, "dblclick", (ev) => {
      if (inEditor(ev.target)) return;
      const hit = cellOf(ev.target);
      if (!hit || !this.canEdit(hit.row, hit.col)) return;
      this._sync();
      this.sel.setCursor(hit.row, hit.col);
      this._changed();
      if (this.open(hit.row, hit.col)) ev.stopImmediatePropagation();
    });
    on(tbody, "contextmenu", (ev) => {
      if (inEditor(ev.target)) return;
      const hit = cellOf(ev.target);
      if (!hit || this.sel.contains(hit.row, hit.col)) return;
      this._sync();
      this.sel.setCursor(hit.row, hit.col);
      this._changed();
    });
    on(table, "keydown", (ev) => {
      if (ev.isComposing || inEditor(ev.target)) return;
      if (ev.target !== table && ev.target?.closest?.('input, select, textarea, button, [contenteditable="true"]')) return;
      if (this._onKey(ev)) {
        ev.preventDefault();
        ev.stopImmediatePropagation();
      }
    });
    if (this.paste) {
      on(table, "paste", (ev) => {
        if (inEditor(ev.target)) return;
        if (ev.target !== table && ev.target?.closest?.('input, select, textarea, [contenteditable="true"]')) return;
        const text = ev.clipboardData?.getData?.("text/plain");
        if (typeof text !== "string") return;
        ev.preventDefault();
        this.paste.paste(text);
      });
    }
    this.paint();
    this.staged?.paintFreeze();
  }
  /** One key on the focused table. Returns whether the cell mode took it. */
  _onKey(ev) {
    this._sync();
    const ctrl = ev.ctrlKey || ev.metaKey;
    const k = ev.key;
    if (this.staged && ctrl && !ev.altKey) {
      const lower = String(k).toLowerCase();
      if (lower === "z" && !ev.shiftKey) {
        this.staged.undo();
        return true;
      }
      if (lower === "y" || lower === "z" && ev.shiftKey) {
        this.staged.redo();
        return true;
      }
    }
    if (ARROWS[k] && !ev.altKey) {
      const [dr, dc] = ARROWS[k];
      if (ctrl) {
        this.sel.jump(dr, dc, (r, c) => isFilledValue(this.valueAt(r, c)), { extend: ev.shiftKey });
      } else this.sel.move(dr, dc, { extend: ev.shiftKey });
      this._changed({ reveal: true });
      return true;
    }
    if ((k === "Home" || k === "End") && !ev.altKey) {
      this.sel.lineEnd(k === "End", { extend: ev.shiftKey, corner: ctrl });
      this._changed({ reveal: true });
      return true;
    }
    if (k === "Tab" && !ctrl && !ev.altKey) {
      if (this.sel.tabEnds(ev.shiftKey)) return false;
      this.sel.tab(ev.shiftKey);
      this._changed({ reveal: true });
      return true;
    }
    if (ctrl && !ev.altKey && String(k).toLowerCase() === "a") {
      this.sel.selectAll();
      this._changed();
      return true;
    }
    if (k === "Escape") {
      this.sel.collapse();
      this._changed();
      this.table._hideContextMenu();
      return true;
    }
    const f = this.sel.focus;
    if (!f) return false;
    if ((k === "F2" || k === "Enter" && !ctrl && !ev.altKey && !ev.shiftKey) && this.canEdit(f.row, f.col)) {
      return this.open(f.row, f.col);
    }
    if (isPrintable(ev) && this.canEdit(f.row, f.col)) {
      return this.open(f.row, f.col, { initialText: ev.key });
    }
    return false;
  }
  // ── editing ──────────────────────────────────────────────────────────
  /** Whether a cell opens an editor: `editable` says so for its column. */
  canEdit(pos, col) {
    const spec = this._cfg().editable;
    if (!spec) return false;
    if (this.staged?.committing) return false;
    if (spec === true) return true;
    if (Array.isArray(spec)) return spec.includes(col);
    if (typeof spec === "function") {
      try {
        return !!spec(col, this.rowAt(pos), this.rowIndexAt(pos));
      } catch (err) {
        console.error("[DataTable] editable threw", err);
        return false;
      }
    }
    return false;
  }
  /** STORY-0087. The column's `editTypes` entry, as `{type, ...}`, or null. */
  _editSpec(col) {
    const all = this._cfg().editTypes;
    let spec = all && typeof all === "object" ? all[col] : null;
    if (typeof spec === "string") spec = { type: spec };
    return spec && typeof spec === "object" ? spec : null;
  }
  /** The column's type as it is named: `editTypes`', else the declared one
   *  (`columnTypes`), else the detected one. */
  _rawType(col) {
    const spec = this._editSpec(col);
    if (spec?.type) return String(spec.type);
    const declared = this._cfg().columnTypes?.[col];
    return declared || this.table._columnTypes?.[col] || "text";
  }
  /** The column's type as `editors` and the built-in editors know it:
   *  'num' is 'number', 'date' is 'datetime'. */
  _typeOf(col) {
    return editorTypeOf(this._rawType(col));
  }
  /** By column index, then by type (as named, then as the built-ins name
   *  it), then the built-in editor for the type, else the text box. */
  _factoryFor(col) {
    const editors = this._cfg().editors;
    if (editors && typeof editors === "object") {
      for (const k of [col, this._rawType(col), this._typeOf(col)]) {
        if (typeof editors[k] === "function") return editors[k];
      }
    }
    const builtIn = Object.prototype.hasOwnProperty.call(CELL_EDITORS, this._typeOf(col)) ? CELL_EDITORS[this._typeOf(col)] : null;
    return builtIn ? builtIn.create : createTextEditor;
  }
  /**
   * Open the editor on a cell (position, data column). Brings the row into
   * view first. Returns whether an editor opened.
   */
  open(pos, col, { initialText = null } = {}) {
    if (this.editor.session || !this.canEdit(pos, col)) return false;
    this.table.scrollToRow(this.rowIndexAt(pos));
    const td = this.cellEl(pos, col);
    if (!td) return false;
    const rowIdx = this.rowIndexAt(pos);
    const row = this.currentRow(rowIdx);
    const headers = this._cfg().headers || [];
    return this.editor.open({
      td,
      factory: this._factoryFor(col),
      pos,
      colIdx: col,
      rowIdx,
      row,
      generation: this.generation,
      value: this.shownValue(rowIdx, col),
      column: { ...this._editSpec(col), index: col, header: headers[col], type: this._typeOf(col) },
      args: {
        locale: this._cfg().locale ?? void 0,
        utc: this.table._utc(),
        messages: this._cfg().editorMessages ?? void 0
      },
      initialText
    });
  }
  /** The virtual window is taking a row out: an editor in it commits, as a
   *  click elsewhere would — what was typed is not thrown away. An editor
   *  with no `getValue` has nothing to commit, and is cancelled. */
  rowLeaving(tr) {
    const s = this.editor.session;
    if (s && tr.contains(s.td)) this.editor.commit(null, "scroll");
  }
  dispose() {
    this.fill?.dispose();
    this.paste?.dispose();
    this.editor.cancel("dispose");
    this.renderWaiting = false;
    this.rowsWaiting.clear();
  }
  /** After every close: focus back on the table when the keyboard closed it,
   *  and the render that waited for the editor. */
  _closed(s, reason) {
    const t = this.table;
    if (reason === "dispose") return;
    if (reason === "key" || reason === "editor") {
      try {
        t._tableEl?.focus({ preventScroll: true });
      } catch (_) {
      }
    }
    if (this.renderWaiting) {
      this.renderWaiting = false;
      this.rowsWaiting.clear();
      if (reason === "scroll") queueMicrotask(() => {
        if (t._wrapperEl) t.render();
      });
      else t.render();
      return;
    }
    if (this.rowsWaiting.size) {
      const flush = () => {
        const waiting = [...this.rowsWaiting];
        this.rowsWaiting.clear();
        for (const rowIdx of waiting) this._redraw(rowIdx);
      };
      if (reason === "scroll") queueMicrotask(() => {
        if (t._wrapperEl) flush();
      });
      else flush();
    }
  }
  /**
   * Draw a row again after a commit, from the row the table holds now
   * (`currentRow`). `updateRow` rebuilds EVERY cell of the row, so while an
   * editor is open in it (save, Tab, type — the commit settles under the
   * next editor) the row waits for that editor to close (`_closed`), and
   * only the committed cell's marks are painted now.
   */
  _redraw(rowIdx, col = null) {
    const t = this.table;
    const tr = t.getRowElement(rowIdx);
    const row = this.currentRow(rowIdx);
    if (!tr || !row) return;
    if (this._holds(tr)) {
      this.rowsWaiting.add(rowIdx);
      if (col === null || tr.__cellPos === void 0) return;
      const s = this.editor.session;
      for (const td of tr.children) {
        if (td.__colIdx === col && td !== s.td) this._decorateCell(td, tr.__cellPos, rowIdx, col);
      }
      return;
    }
    this.rowsWaiting.delete(rowIdx);
    t.updateRow(rowIdx, row);
  }
  /** STORY-0087. The editor closed holding text that does not parse (the
   *  focus left it, or its row left the window): nothing is committed, and
   *  the cell keeps the text, marked with the message, as a refused commit's
   *  would be. */
  _refused(s, error, text, reason) {
    if (s.generation === this.generation) {
      const key4 = `${s.rowIdx}:${s.colIdx}`;
      this.errors.set(key4, { value: text, message: error });
      this.latest.set(key4, {});
      this.pending.delete(key4);
      this._redraw(s.rowIdx, s.colIdx);
    }
    this._closed(s, reason);
  }
  _committed(s, value, move, reason) {
    if (move) {
      this._sync();
      if (move === "down" || move === "up") this.sel.move(move === "down" ? 1 : -1, 0);
      else this.sel.tab(move === "left");
      this._changed({ reveal: true });
    }
    const live = s.generation === this.generation;
    const key4 = `${s.rowIdx}:${s.colIdx}`;
    if (Object.is(value, s.previous)) {
      this._closed(s, reason);
      return;
    }
    if (this.staged) {
      if (live) this.staged.stage(s.rowIdx, s.colIdx, value);
      this._closed(s, reason);
      return;
    }
    const held = live ? this.currentRow(s.rowIdx) : s.row;
    const stored = held ? held[s.colIdx] : void 0;
    if (live && this.errors.has(key4) && !this.pending.has(key4) && Object.is(value, stored)) {
      this.errors.delete(key4);
      this.latest.delete(key4);
      this._redraw(s.rowIdx, s.colIdx);
      this._closed(s, reason);
      return;
    }
    const fn = this._cfg().onCellCommit;
    const token = {};
    if (live) this.latest.set(key4, token);
    const finish = (result2) => {
      if (!live || s.generation !== this.generation) return;
      const newest = this.latest.get(key4) === token;
      const good = !(result2 && result2.ok === false);
      if (good) {
        const row = this.currentRow(s.rowIdx);
        if (Array.isArray(row)) row[s.colIdx] = value;
      }
      if (newest) {
        this.latest.delete(key4);
        this.pending.delete(key4);
        if (good) this.errors.delete(key4);
        else this.errors.set(key4, { value, message: String(result2.error ?? "Not saved") });
      }
      this._redraw(s.rowIdx, s.colIdx);
    };
    const refused = (err) => ({ ok: false, error: err?.message || String(err ?? "Not saved") });
    let result;
    if (typeof fn === "function") {
      try {
        result = fn({ rowIdx: s.rowIdx, colIdx: s.colIdx, value, previous: stored });
      } catch (err) {
        result = refused(err);
      }
    }
    if (result && typeof result.then === "function") {
      if (live) {
        this.pending.set(key4, value);
        this.errors.delete(key4);
        this._redraw(s.rowIdx, s.colIdx);
      }
      this._closed(s, reason);
      result.then(finish, (err) => finish(refused(err)));
      return;
    }
    finish(result);
    this._closed(s, reason);
  }
};

// src/ui/components/column_order.js
function isColumnOrder(order, n) {
  if (!Array.isArray(order) || order.length !== n) return false;
  const seen = /* @__PURE__ */ new Set();
  for (const c of order) {
    if (!Number.isInteger(c) || c < 0 || c >= n || seen.has(c)) return false;
    seen.add(c);
  }
  return true;
}
function naturalOrder(n) {
  return Array.from({ length: Math.max(0, n) }, (_, i) => i);
}
function cellOrder(order, count) {
  if (!order) return naturalOrder(count);
  const out = order.filter((c) => c < count);
  for (let c = order.length; c < count; c++) out.push(c);
  return out;
}
function moveInOrder(order, from, to) {
  const next = order.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
var ColumnReorder = class {
  /** @param {import('./data_table.js').DataTable} table */
  constructor(table) {
    this.table = table;
    this.dragging = null;
    this.onGrip = false;
  }
  /** Wire the header row of a fresh render. Its cells are new each render,
   *  so nothing needs taking off. */
  install(headRow) {
    if (!headRow) return;
    [...headRow.children].forEach((th, domIdx) => {
      const col = this.table._dataIdxOfDom(domIdx);
      if (col === null) return;
      th.draggable = true;
      th.classList.add("twm-dt-col--movable");
      th.addEventListener("mousedown", (ev) => {
        this.onGrip = !!ev.target?.closest?.(".twm-dt-col-resizer");
      }, true);
      th.addEventListener("dragstart", (ev) => {
        if (this.onGrip || ev.target?.closest?.(".twm-dt-col-resizer")) {
          ev.preventDefault();
          return;
        }
        this.dragging = col;
        try {
          ev.dataTransfer?.setData("text/plain", String(col));
          if (ev.dataTransfer) ev.dataTransfer.effectAllowed = "move";
        } catch (_) {
        }
        th.classList.add("twm-dt-col--dragging");
      });
      th.addEventListener("dragover", (ev) => {
        if (this.dragging === null || this.dragging === col) return;
        ev.preventDefault();
        if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
        const order = this.table.getColumnOrder();
        th.classList.add("twm-dt-col--drop");
        th.classList.toggle("twm-dt-col--drop-after", order.indexOf(col) > order.indexOf(this.dragging));
      });
      th.addEventListener("dragleave", () => th.classList.remove("twm-dt-col--drop", "twm-dt-col--drop-after"));
      th.addEventListener("drop", (ev) => {
        th.classList.remove("twm-dt-col--drop", "twm-dt-col--drop-after");
        const from = this.dragging;
        this.dragging = null;
        if (from === null || from === col) return;
        ev.preventDefault();
        const order = this.table.getColumnOrder();
        this.table.moveColumn(order.indexOf(from), order.indexOf(col));
      });
      th.addEventListener("dragend", () => {
        th.classList.remove("twm-dt-col--dragging");
        this.dragging = null;
      });
    });
  }
  /** "Move left" / "Move right" for the header menu of data column `col`:
   *  past the shown column next to it. */
  menuItems(col) {
    const shown = this.table._shownColumns();
    const at = shown.indexOf(col);
    if (at < 0) return [];
    const order = this.table.getColumnOrder();
    const step = (to) => () => this.table.moveColumn(order.indexOf(col), order.indexOf(to));
    return [
      {
        label: "Move left",
        icon: "arrow_back",
        action: "move-left",
        disabled: at === 0,
        onChoose: at === 0 ? void 0 : step(shown[at - 1])
      },
      {
        label: "Move right",
        icon: "arrow_forward",
        action: "move-right",
        disabled: at === shown.length - 1,
        onChoose: at === shown.length - 1 ? void 0 : step(shown[at + 1])
      }
    ];
  }
};

// src/ui/components/header_actions.js
function callOption(config, name, ...args) {
  const fn = config?.[name];
  if (typeof fn !== "function") return void 0;
  try {
    return fn.apply(config, args);
  } catch (err) {
    console.error(`[DataTable] ${name} threw`, err);
    return void 0;
  }
}
function headerActionButton(className, { icon, label, title, disabled } = {}, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = className;
  if (icon) {
    const span = document.createElement("span");
    span.className = "material-symbols-outlined";
    span.textContent = String(icon);
    b.appendChild(span);
  } else if (label != null) {
    b.appendChild(document.createTextNode(String(label)));
  }
  const name = title ?? label;
  if (name != null) {
    b.title = String(name);
    b.setAttribute("aria-label", String(name));
  }
  if (disabled) b.disabled = true;
  b.addEventListener("mousedown", (ev) => ev.stopPropagation());
  b.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    onClick(ev);
  });
  return b;
}

// src/ui/components/column_groups.js
function normalizeSpans(spec, n, { requireKey = false, defaultLabel = () => "" } = {}) {
  const taken = /* @__PURE__ */ new Set();
  const out = [];
  (Array.isArray(spec) ? spec : []).forEach((g, index) => {
    if (!g || requireKey && g.key == null) return;
    const columns = [];
    for (const c of Array.isArray(g.columns) ? g.columns : []) {
      const i = Number(c);
      if (!Number.isInteger(i) || i < 0 || i >= n || taken.has(i)) continue;
      taken.add(i);
      columns.push(i);
    }
    out.push({ key: g.key, label: g.label == null ? defaultLabel(g) : String(g.label), columns, index });
  });
  return out;
}
function normalize(spec, n) {
  return normalizeSpans(spec, n, { requireKey: true, defaultLabel: (g) => String(g.key) });
}
function blankSpanCell(span) {
  const th = document.createElement("th");
  th.className = "twm-dt-group twm-dt-group--none";
  th.colSpan = span;
  return th;
}
function labelSpanCell(span, label, title = label) {
  const th = document.createElement("th");
  th.className = "twm-dt-group";
  th.colSpan = span;
  th.title = title;
  const el = document.createElement("span");
  el.className = "twm-dt-group__label";
  el.textContent = label;
  th.appendChild(el);
  return th;
}
var ColumnGroups = class {
  /** @param {import('./data_table.js').DataTable} table */
  constructor(table) {
    this.table = table;
    this._memoKey = null;
    this._memo = null;
    this._el = null;
  }
  _cfg() {
    return this.table.config;
  }
  /**
   * The drawn columns after the lead, in order: `{col, group}` for a shown
   * data column (`group` the index in `groups`, or null) and
   * `{placeholder: true, group}` for an empty group's column. The data
   * columns come in the order the table draws them (STORY-0086's
   * `columnOrder`, hidden ones left out). Memoised on the groups' content,
   * the column count and the drawn columns.
   */
  layout() {
    const cfg = this._cfg();
    const n = cfg.headers?.length || 0;
    const shown = this.table._shownColumns();
    const spec = Array.isArray(cfg.columnGroups) ? cfg.columnGroups : [];
    const key4 = `${n}|${shown.join(",")}|${spec.map((g) => g ? `${g.key}${g.label}${(g.columns || []).join(",")}` : "").join("")}`;
    if (key4 === this._memoKey) return this._memo;
    const groups = normalize(spec, n);
    const groupOf = new Array(n).fill(null);
    groups.forEach((g, gi) => {
      for (const c of g.columns) groupOf[c] = gi;
    });
    const empty = groups.map((g) => g.columns.length === 0);
    const placed = /* @__PURE__ */ new Set();
    const slots = [];
    const placeEmptyBefore = (gi) => {
      for (let e = 0; e < gi; e++) {
        if (empty[e] && !placed.has(e)) {
          placed.add(e);
          slots.push({ placeholder: true, group: e });
        }
      }
    };
    for (const c of shown) {
      const gi = groupOf[c];
      if (gi !== null) placeEmptyBefore(gi);
      slots.push({ col: c, group: gi });
    }
    placeEmptyBefore(groups.length);
    const slotOfCol = /* @__PURE__ */ new Map();
    slots.forEach((s, i) => {
      if (!s.placeholder) slotOfCol.set(s.col, i);
    });
    const placeholders = slots.filter((s) => s.placeholder).length;
    this._memoKey = key4;
    this._memo = { groups, slots, slotOfCol, placeholders };
    return this._memo;
  }
  /** How many placeholder columns are drawn. */
  placeholderCount() {
    return this.layout().placeholders;
  }
  /** A shown data column's place after the lead, or -1 when the layout
   *  has no placeholder (the table's own arithmetic then holds). */
  slotOf(colIdx) {
    const l = this.layout();
    if (!l.placeholders) return -1;
    return l.slotOfCol.has(colIdx) ? l.slotOfCol.get(colIdx) : -1;
  }
  /** What the drawn column `i` after the lead is: the data column, null for
   *  a placeholder or past the end, `undefined` when the layout has no
   *  placeholder (the table's own arithmetic then holds). */
  slotAt(i) {
    const l = this.layout();
    if (!l.placeholders) return void 0;
    const s = l.slots[i];
    return s && !s.placeholder ? s.col : null;
  }
  /** Part of the table's column signature: where the placeholders stand. */
  sig() {
    const l = this.layout();
    if (!l.placeholders) return "";
    return `|g${l.slots.map((s, i) => s.placeholder ? i : "").filter((x) => x !== "").join(",")}`;
  }
  /** The drawn positions (after the lead) of the placeholders, ascending,
   *  with their groups. */
  _placeholderSlots() {
    const out = [];
    this.layout().slots.forEach((s, i) => {
      if (s.placeholder) out.push({ at: i, group: s.group });
    });
    return out;
  }
  /** Put the placeholders' cells into a drawn row whose cells are the lead
   *  and the shown data columns, in order. */
  _insert(tr, make) {
    const lead = this.table._lead().all;
    for (const { at, group } of this._placeholderSlots()) {
      const ref = tr.children[lead + at] || null;
      tr.insertBefore(make(this.layout().groups[group]), ref);
    }
  }
  /** STORY-0066. A body row gets an empty cell under each placeholder. */
  fillRow(tr) {
    if (!this.placeholderCount()) return;
    this._insert(tr, () => {
      const td = document.createElement("td");
      td.className = "twm-dt-cell--placeholder";
      return td;
    });
  }
  /**
   * After the header is built and in the header table: the placeholders'
   * header and filter cells, and the group table above the header table.
   */
  decorate(headerWrap, headerTable) {
    this._el = null;
    if (!headerWrap || !headerTable) return;
    const thead = headerTable.querySelector("thead");
    const labelRow = thead?.querySelector("tr");
    if (!labelRow) return;
    if (this.placeholderCount()) {
      this._insert(labelRow, (g) => this._placeholderHead(g));
      for (const tr of thead.querySelectorAll("tr.twm-data-table__filter-row")) {
        this._insert(tr, () => {
          const th = document.createElement("th");
          th.className = "data-table__filter-cell data-table__filter-cell--empty twm-dt-col--placeholder";
          return th;
        });
      }
    }
    const groupTable = this._buildGroupTable(headerTable);
    headerWrap.insertBefore(groupTable, headerTable);
    this._el = groupTable;
    this.align();
  }
  _placeholderHead(group) {
    const th = document.createElement("th");
    th.className = "text twm-dt-col--placeholder";
    if (typeof this._cfg().onColumnAdd === "function") {
      th.appendChild(this._addButton(group));
    }
    return th;
  }
  _addButton(group) {
    return headerActionButton(
      "twm-dt-group__add",
      { icon: "add", title: `Add column to ${group.label}` },
      () => callOption(this._cfg(), "onColumnAdd", group.key)
    );
  }
  _buildGroupTable(headerTable) {
    const { groups, slots } = this.layout();
    const lead = this.table._lead().all;
    const table = document.createElement("table");
    table.className = `${headerTable.className} twm-dt-groups`;
    const colgroup = document.createElement("colgroup");
    for (let i2 = 0; i2 < lead + slots.length; i2++) colgroup.appendChild(document.createElement("col"));
    table.appendChild(colgroup);
    const thead = document.createElement("thead");
    const tr = document.createElement("tr");
    tr.className = "twm-dt-group-row";
    if (lead) {
      const th = document.createElement("th");
      th.className = "twm-dt-group twm-dt-group--lead";
      th.colSpan = lead;
      tr.appendChild(th);
    }
    let i = 0;
    while (i < slots.length) {
      const gi = slots[i].group;
      let j = i + 1;
      while (j < slots.length && slots[j].group === gi) j++;
      tr.appendChild(gi === null ? blankSpanCell(j - i) : this._groupCell(groups[gi], j - i, slots[i].placeholder));
      i = j;
    }
    thead.appendChild(tr);
    table.appendChild(thead);
    return table;
  }
  _groupCell(group, span, empty) {
    const th = labelSpanCell(span, group.label);
    if (empty) th.classList.add("twm-dt-group--empty");
    const actions = document.createElement("span");
    actions.className = "twm-dt-group__actions";
    const cfg = this._cfg();
    const items = callOption(cfg, "groupActions", cfg.columnGroups[group.index], { key: group.key, columns: group.columns.slice(), table: this.table });
    for (const item of Array.isArray(items) ? items.filter(Boolean) : []) {
      actions.appendChild(headerActionButton(
        "twm-dt-group__action",
        item,
        () => callOption(cfg, "onGroupAction", item.action, group.key)
      ));
    }
    if (typeof cfg.onColumnAdd === "function") actions.appendChild(this._addButton(group));
    if (actions.childNodes.length) th.appendChild(actions);
    return th;
  }
  /** The group table follows the header table: the same column widths,
   *  table width, layout and sideways offset. */
  align() {
    const groupTable = this._el;
    const headerTable = this.table._headerTableEl;
    if (!groupTable || !headerTable) return;
    const labelRow = headerTable.querySelector("thead > tr");
    const cols = groupTable.querySelector("colgroup")?.children || [];
    for (let i = 0; i < cols.length; i++) {
      const th = labelRow?.children[i];
      const w = th ? parseFloat(th.style.width) : NaN;
      cols[i].style.width = Number.isFinite(w) ? `${w}px` : "";
    }
    groupTable.style.width = headerTable.style.width;
    groupTable.style.tableLayout = headerTable.style.tableLayout;
    groupTable.style.transform = headerTable.style.transform;
  }
};

// src/ui/components/crosstab.js
var DEFAULT_EMPTY_LABEL = "(none)";
function unzoom(el) {
  return 1 / (el?.currentCSSZoom || 1);
}
var Crosstab = class {
  /** @param {import('./data_table.js').DataTable} table */
  constructor(table) {
    this.table = table;
    this._lefts = [];
    this._leafRow = null;
  }
  _spec() {
    const s = this.table.config.crosstab;
    return s && typeof s === "object" ? s : {};
  }
  /** How many of the drawn data columns are row labels: the leading ones. */
  labelCount() {
    const k = Math.floor(Number(this._spec().labelColumns) || 0);
    return Math.max(0, Math.min(k, this.table._shownColumns().length));
  }
  /** The drawn columns that pin to the left: the select and row-number
   *  columns, and the label columns. */
  pinnedCount() {
    return this.table._lead().all + this.labelCount();
  }
  /** The drawn data columns after the label columns, in order. */
  bodyColumns() {
    return this.table._shownColumns().slice(this.labelCount());
  }
  /** Columns drawn that are no data column: the empty axis's one. */
  extraColumns() {
    return this.bodyColumns().length ? 0 : 1;
  }
  /** The header rows as drawn: per row, `{cell, span}` runs over the body
   *  columns (`cell` null for a run in no cell of that row). None for an
   *  empty axis. */
  headerRuns() {
    const body = this.bodyColumns();
    if (!body.length) return [];
    const spec = this._spec().headerRows;
    const n = this.table.config.headers?.length || 0;
    return (Array.isArray(spec) ? spec : []).map((rowSpec) => {
      const cells = normalizeSpans(rowSpec, n);
      const cellOf = /* @__PURE__ */ new Map();
      cells.forEach((c) => {
        for (const col of c.columns) cellOf.set(col, c);
      });
      const runs = [];
      for (const col of body) {
        const cell = cellOf.get(col) || null;
        const last = runs[runs.length - 1];
        if (last && last.cell === cell) last.span++;
        else runs.push({ cell, span: 1, rowSpec });
      }
      return runs;
    });
  }
  /** STORY-0091. A body row: its pinned cells marked and put at the measured
   *  offsets (a row the virtual window draws later lines up at once), and
   *  the empty axis's cell. */
  fillRow(tr) {
    if (this.extraColumns()) {
      const td = document.createElement("td");
      td.className = "twm-dt-crosstab__none";
      tr.appendChild(td);
    }
    this._pinRowCells(tr);
  }
  _pinRowCells(tr) {
    const p = this.pinnedCount();
    for (let j = 0; j < p && j < tr.children.length; j++) {
      const cell = tr.children[j];
      cell.classList.add("twm-dt-pin");
      if (j === p - 1) cell.classList.add("twm-dt-pin--last");
      cell.__pinCol = j;
      if (this._lefts[j] != null) cell.style.left = `${this._lefts[j]}px`;
    }
  }
  /**
   * After `_createTable`: the header rows above the column headers, the
   * corner, the pinned header cells and the empty axis's header — all in the
   * body table's own `<thead>`.
   */
  decorate(tableEl) {
    this._leafRow = null;
    const thead = tableEl?.querySelector("thead");
    const leaf = thead?.querySelector("tr");
    if (!leaf) return;
    tableEl.classList.add("twm-dt-crosstab");
    this._leafRow = leaf;
    leaf.classList.add("twm-dt-crosstab__leaf");
    const filters = [...thead.querySelectorAll("tr.twm-data-table__filter-row")];
    if (this.extraColumns()) {
      const th = document.createElement("th");
      th.className = "text twm-dt-crosstab__none";
      const label = this._spec().emptyLabel;
      th.textContent = label == null ? DEFAULT_EMPTY_LABEL : String(label);
      leaf.appendChild(th);
      for (const tr of filters) {
        const cell = document.createElement("th");
        cell.className = "data-table__filter-cell data-table__filter-cell--empty twm-dt-crosstab__none";
        tr.appendChild(cell);
      }
    }
    for (const tr of [leaf, ...filters]) this._pinRowCells(tr);
    const levels = this.headerRuns();
    const p = this.pinnedCount();
    levels.forEach((runs, r) => {
      const tr = document.createElement("tr");
      tr.className = "twm-dt-crosstab__band";
      if (r === 0) {
        for (let j = 0; j < p; j++) {
          const th = document.createElement("th");
          th.className = "twm-dt-crosstab__corner twm-dt-pin";
          if (j === p - 1) th.classList.add("twm-dt-pin--last");
          th.rowSpan = levels.length;
          th.__pinCol = j;
          tr.appendChild(th);
        }
      }
      for (const run of runs) tr.appendChild(this._bandCell(run));
      thead.insertBefore(tr, leaf);
    });
  }
  /** A header row's cell: STORY-0066's spanning cells, the consumer's
   *  `className` and `title` on a labelled one. */
  _bandCell({ cell, span, rowSpec }) {
    if (!cell) return blankSpanCell(span);
    const own = rowSpec[cell.index];
    const th = labelSpanCell(span, cell.label, own?.title == null ? cell.label : String(own.title));
    if (own?.className) this.table._addClasses(th, own.className);
    return th;
  }
  /**
   * Once the table is in the document: pin now (a layout already there is
   * used at once), on the next frame (when it has settled), and whenever a
   * header row, a pinned header cell or the table's box changes size. The
   * observer goes with the render (`_disposers`).
   *
   * The split layout's own resize observer and settle frame hang off its
   * header table, which a crosstab has none of; so the virtual window's
   * re-measure and resize (`_virtRemeasure`, `_virtUpdate`) run from here.
   */
  install() {
    const table = this.table;
    const tableEl = table._tableEl;
    if (!tableEl || !this._leafRow) return;
    this.pin();
    requestAnimationFrame(() => {
      if (table._tableEl !== tableEl) return;
      this.pin();
      table._virtRemeasure();
    });
    if (typeof ResizeObserver === "undefined") return;
    const observer = createRafResizeObserver(() => {
      if (table._tableEl !== tableEl) return;
      this.pin();
      table._virtUpdate();
    });
    if (table._wrapperEl) observer.observe(table._wrapperEl);
    const thead = tableEl.querySelector("thead");
    for (const tr of thead.querySelectorAll("tr")) observer.observe(tr);
    for (let j = 0; j < this.pinnedCount(); j++) {
      const cell = this._leafRow.children[j];
      if (cell) observer.observe(cell);
    }
    table._disposers.push(() => {
      try {
        observer.disconnect();
      } catch (_) {
      }
    });
  }
  /** Measure and write every offset: each header row's `top`, each pinned
   *  column's `left`. */
  pin() {
    const tableEl = this.table._tableEl;
    const thead = tableEl?.querySelector("thead");
    if (!thead || !this._leafRow) return;
    const rows = [...thead.rows];
    const scale = unzoom(thead);
    const origin = rows[0].getBoundingClientRect().top;
    for (const tr of rows) {
      const top = Math.max(0, (tr.getBoundingClientRect().top - origin) * scale);
      const css = `${+top.toFixed(2)}px`;
      for (const th of tr.cells) th.style.top = css;
    }
    const p = this.pinnedCount();
    const lefts = [0];
    for (let j = 1; j < p; j++) {
      const cell = this._leafRow.children[j - 1];
      const w = cell ? cell.getBoundingClientRect().width * scale : 0;
      lefts[j] = +(lefts[j - 1] + w).toFixed(2);
    }
    this._lefts = p ? lefts : [];
    for (const cell of tableEl.querySelectorAll(".twm-dt-pin")) {
      const left = this._lefts[cell.__pinCol];
      if (left != null) cell.style.left = `${left}px`;
    }
    this._lockColumns(scale);
  }
  /**
   * Under `virtualize` the rows drawn change with every scroll, and with
   * them the widths an automatic layout gives the columns. The first pass
   * that sees a layout writes the widths it measured on the column headers
   * into the `<colgroup>` and fixes the layout, so the columns hold still.
   * No layout (every width 0) is no measurement, and nothing is written.
   */
  _lockColumns(scale) {
    const cols = this.table._cols();
    const tableEl = this.table._tableEl;
    if (!cols || !tableEl || tableEl.__crosstabLocked) return;
    const cells = this._leafRow.children;
    if (cells.length !== cols.length) return;
    const widths = [...cells].map((c) => c.getBoundingClientRect().width * scale);
    if (!widths.every((w) => w > 0)) return;
    widths.forEach((w, i) => {
      cols[i].style.width = `${+w.toFixed(2)}px`;
    });
    tableEl.style.tableLayout = "fixed";
    tableEl.style.width = `${+widths.reduce((a, b) => a + b, 0).toFixed(2)}px`;
    tableEl.__crosstabLocked = true;
  }
};

// src/ui/components/table_structure.js
var STRUCTURE_OPTIONS = ["columnActions", "onColumnRename", "onColumnDelete", "onRowAdd", "onRowDelete"];
var TableStructure = class {
  /** @param {import('./data_table.js').DataTable} table */
  constructor(table) {
    this.table = table;
    this._renamer = null;
  }
  _cfg() {
    return this.table.config;
  }
  _has(name) {
    return typeof this._cfg()[name] === "function";
  }
  _call(name, ...args) {
    return callOption(this._cfg(), name, ...args);
  }
  /** Whether the header's right-click has items of this module's. */
  hasHeaderItems() {
    return this._has("onColumnRename") || this._has("onColumnDelete") || this._has("onRowAdd");
  }
  /** Whether a row's right-click has items of this module's. */
  hasRowItems() {
    return this._has("onRowAdd") || this._has("onRowDelete");
  }
  /** The header menu's items for the data column `colIdx` (null off one). */
  headerItems(colIdx) {
    const items = [];
    if (colIdx !== null && this._has("onColumnRename")) {
      items.push({ label: "Rename column", icon: "edit", onChoose: () => this.rename(colIdx) });
    }
    if (colIdx !== null && this._has("onColumnDelete")) {
      items.push({
        label: "Delete column",
        icon: "delete",
        danger: true,
        onChoose: () => this._call("onColumnDelete", colIdx)
      });
    }
    if (this._has("onRowAdd")) {
      items.push({ label: "Add row", icon: "add", onChoose: () => this._call("onRowAdd", null) });
    }
    return items;
  }
  /** The body menu's items for the row `rowIdx` (its original index). */
  rowItems(rowIdx) {
    const items = [];
    if (this._has("onRowAdd")) {
      items.push({ label: "Insert row below", icon: "add", onChoose: () => this._call("onRowAdd", rowIdx) });
    }
    if (this._has("onRowDelete")) {
      items.push({
        label: "Delete row",
        icon: "delete",
        danger: true,
        onChoose: () => this._call("onRowDelete", rowIdx)
      });
    }
    return items;
  }
  /**
   * After the header is built: each data column's label in a span the
   * renamer can take over, and the consumer's action buttons.
   */
  decorate(headerTable) {
    this._renamer?.destroy();
    this._renamer = null;
    const labelRow = headerTable?.querySelector("thead > tr");
    if (!labelRow) return;
    const headers = this._cfg().headers || [];
    const rename = this._has("onColumnRename");
    const actions = this._has("columnActions");
    if (!rename && !actions) return;
    for (let colIdx = 0; colIdx < headers.length; colIdx++) {
      const th = labelRow.children[this.table._domIdxOf(colIdx)];
      if (!th) continue;
      if (rename) this._wrapLabel(th, colIdx);
      if (actions) this._addActions(th, colIdx, headers[colIdx]);
    }
  }
  _wrapLabel(th, colIdx) {
    const text = [...th.childNodes].find((n) => n.nodeType === 3);
    if (!text) return;
    const label = document.createElement("span");
    label.className = "twm-dt-col-label";
    th.insertBefore(label, text);
    label.appendChild(text);
    label.addEventListener("keydown", (ev) => ev.stopPropagation());
    if (!this._cfg().sortable) {
      label.addEventListener("dblclick", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        this.rename(colIdx);
      });
    }
  }
  _addActions(th, colIdx, header) {
    const items = this._call("columnActions", colIdx, { colIdx, header, table: this.table });
    const list = Array.isArray(items) ? items.filter(Boolean) : [];
    if (!list.length) return;
    const box = document.createElement("span");
    box.className = "twm-dt-col-actions";
    for (const item of list) {
      box.appendChild(headerActionButton(
        "twm-dt-col-action",
        item,
        () => this._call("onColumnAction", item.action, colIdx)
      ));
    }
    th.appendChild(box);
  }
  /**
   * Open the renamer on the data column's header. Enter (or the focus
   * leaving) with a different, non-empty name calls
   * `onColumnRename(colIdx, name)`; Escape, or the name left as it was,
   * restores the header and calls nothing. Returns whether it opened.
   */
  rename(colIdx) {
    if (!this._has("onColumnRename")) return false;
    const labelRow = this.table._headerTableEl?.querySelector("thead > tr");
    const dom = this.table._domIdxOf(colIdx);
    const label = dom < 0 ? null : labelRow?.children[dom]?.querySelector(".twm-dt-col-label");
    if (!label) return false;
    this._renamer?.cancel();
    const before = label.textContent || "";
    const done = () => {
      if (this._renamer === renamer) this._renamer = null;
    };
    const renamer = attachInlineRenamer({
      label,
      inputClass: "twm-dt-col-rename",
      onCommit: async (raw) => {
        const name = String(raw ?? "").trim();
        if (!name || name === before) return { success: false };
        const answer = await this._call("onColumnRename", colIdx, name);
        if (answer === false || answer && answer.ok === false) return { success: false };
        return { newValue: name };
      },
      onCancel: done,
      onFinish: done
    });
    this._renamer = renamer;
    renamer.start();
    return true;
  }
  dispose() {
    this._renamer?.destroy();
    this._renamer = null;
  }
};

// src/ui/components/data_table.js
var DEFAULT_PAGE_SIZE = 100;
var DIFF_STATUSES = /* @__PURE__ */ new Set(["added", "removed", "changed", "same", "gap"]);
var PAGING_HARD_LIMIT = 1e5;
var PAGING_SOFT_LIMIT = 1e4;
function resolvePaging({
  mode = "scroll",
  total = null,
  atLeast = 0,
  held = 0,
  hasMore = false,
  softLimit = PAGING_SOFT_LIMIT,
  hardLimit = PAGING_HARD_LIMIT
} = {}) {
  const requested = mode === "pages" ? "pages" : "scroll";
  const hard = Number.isFinite(hardLimit) && hardLimit >= 1 ? Math.floor(hardLimit) : PAGING_HARD_LIMIT;
  const soft = Math.min(hard, Number.isFinite(softLimit) && softLimit >= 1 ? Math.floor(softLimit) : PAGING_SOFT_LIMIT);
  const exact = Number.isFinite(total) && total >= 0;
  const known = exact ? total : Math.max(Number.isFinite(atLeast) ? atLeast : 0, (held || 0) + (hasMore ? 1 : 0));
  const forced = requested === "scroll" && known > soft;
  return {
    mode: forced ? "pages" : requested,
    requested,
    forced,
    softLimit: soft,
    hardLimit: hard,
    known,
    exact
  };
}
var PAGING_LOAD_MORE_PX = 400;
var TYPED_COLUMNS = /* @__PURE__ */ new Set(["date", "datetime", "duration"]);
var DESELECTING_CLICKS = /* @__PURE__ */ new WeakSet();
var AUTO_DISPOSE = /* @__PURE__ */ new Map();
var AUTO_REFS = /* @__PURE__ */ new WeakMap();
var weakRef = (table) => typeof WeakRef === "function" ? new WeakRef(table) : { deref: () => table };
function autoDisposeSweep(entry) {
  for (const ref of entry.tables) {
    const table = ref.deref();
    if (!table) {
      entry.tables.delete(ref);
      continue;
    }
    const el = table._wrapperEl;
    if (!el) continue;
    if (el.isConnected) {
      table._autoSeen = true;
      if (table._autoPending) {
        clearTimeout(table._autoTimer);
        table._autoTimer = null;
        table._autoPending = false;
      }
      continue;
    }
    if (!table._autoSeen || table._autoPending) continue;
    const grace = table._detachGrace();
    if (grace === Infinity) continue;
    table._autoPending = true;
    table._autoTimer = setTimeout(() => {
      table._autoPending = false;
      table._autoTimer = null;
      if (!entry.tables.has(ref)) return;
      const now = table._wrapperEl;
      if (now && !now.isConnected) table._disposeOwn();
    }, grace);
  }
  if (entry.tables.size === 0) autoDisposeRelease(entry);
}
function autoDisposeRelease(entry) {
  for (const [doc, e] of AUTO_DISPOSE) {
    if (e !== entry) continue;
    try {
      e.observer.disconnect();
    } catch (_) {
    }
    AUTO_DISPOSE.delete(doc);
  }
}
function autoDisposeWatch(table) {
  const doc = table.container?.ownerDocument;
  const MO = doc?.defaultView?.MutationObserver || globalThis.MutationObserver;
  if (!doc || typeof MO !== "function") return;
  let entry = AUTO_DISPOSE.get(doc);
  if (!entry) {
    entry = { observer: null, tables: /* @__PURE__ */ new Set() };
    entry.observer = new MO(() => autoDisposeSweep(entry));
    entry.observer.observe(doc, { childList: true, subtree: true });
    AUTO_DISPOSE.set(doc, entry);
  }
  let ref = AUTO_REFS.get(table);
  if (!ref) {
    ref = weakRef(table);
    AUTO_REFS.set(table, ref);
  }
  entry.tables.add(ref);
  if (table._wrapperEl?.isConnected) table._autoSeen = true;
}
function autoDisposeUnwatch(table) {
  const ref = AUTO_REFS.get(table);
  if (!ref) return;
  for (const entry of [...AUTO_DISPOSE.values()]) {
    if (entry.tables.delete(ref) && entry.tables.size === 0) autoDisposeRelease(entry);
  }
}
function perColumn(option, colIdx) {
  if (option == null) return null;
  if (Array.isArray(option)) return option[colIdx] ?? null;
  if (typeof option === "object") return option[colIdx] ?? null;
  return option;
}
var DETAIL_SEQ = { n: 0 };
function defaultControlMatch(cell, value) {
  if (Array.isArray(value)) return value.some((v) => String(v ?? "") === String(cell ?? ""));
  if (value && typeof value === "object" && !(value instanceof Date) && ("from" in value || "to" in value)) {
    const asNumber = (x) => {
      if (x == null || x === "") return null;
      if (x instanceof Date) return x.getTime();
      if (typeof x === "number") return x;
      const t = parseDateValue(x);
      if (Number.isFinite(t)) return t;
      const n = parseFloat(x);
      return Number.isFinite(n) ? n : null;
    };
    const c = asNumber(cell);
    if (c === null) return false;
    const lo = asNumber(value.from);
    const hi = asNumber(value.to);
    if (lo !== null && c < lo) return false;
    if (hi !== null && c > hi) return false;
    return true;
  }
  if (typeof value === "string") {
    return String(cell ?? "").toLowerCase().includes(value.toLowerCase());
  }
  return String(value) === String(cell ?? "");
}
function chipsMatch(spec) {
  return (cell, value) => {
    const want = Array.isArray(value) ? value : [value];
    return want.some((v) => String(v ?? "") === String(cell ?? ""));
  };
}
function normaliseSortKey(k) {
  if (k == null) return null;
  if (k instanceof Date) k = k.getTime();
  if (typeof k === "boolean") return k ? 1 : 0;
  if (typeof k === "number") return Number.isFinite(k) ? k : null;
  if (typeof k === "bigint") return Number(k);
  return String(k).toLowerCase();
}
function compareSortKeys(a, b, asc) {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const na = typeof a === "number";
  const nb = typeof b === "number";
  let cmp;
  if (na !== nb) cmp = na ? -1 : 1;
  else cmp = a < b ? -1 : a > b ? 1 : 0;
  return asc ? cmp : -cmp;
}
var AUTOSIZE_MAX_PX = 520;
var VIRTUAL_FALLBACK_VIEWPORT_PX = 1e3;
var COPY_CELLS_MENU_HTML = `
            <div class="twm-context-menu-item" data-action="copy-tsv">
                <span class="material-symbols-outlined">content_copy</span>
                <span class="label">Copy Cells</span>
            </div>`;
var copyMenuHtml = (cells) => cells ? COPY_CELLS_MENU_HTML : `
            <div class="twm-context-menu-item" data-action="copy-tsv">
                <span class="material-symbols-outlined">content_copy</span>
                <span class="label">Copy Row(s)</span>
            </div>
            <div class="twm-context-menu-item" data-action="copy-csv">
                <span class="material-symbols-outlined">table</span>
                <span class="label">Copy as CSV</span>
            </div>
        `;
var DataTable = class {
  /**
   * Create a DataTable instance
   * @param {HTMLElement} container - Container element to render into
   * @param {DataTableConfig} config - Configuration options
   */
  constructor(container, config = {}) {
    this.container = container;
    this.config = {
      headers: [],
      rows: [],
      pageSize: DEFAULT_PAGE_SIZE,
      pagination: true,
      selectable: true,
      copyable: true,
      sortable: false,
      filterable: false,
      readonly: false,
      showRowNumbers: false,
      emptyMessage: "No data",
      onSort: null,
      // OFF unless asked for, for `columnFit`'s reason below: a sort kept
      // the client-side page before this key existed, so turning the
      // reset on for everybody would change every paged table that never
      // asked. See the typedef.
      resetPageOnSort: false,
      onSelectionChange: null,
      formatValue: null,
      getHeaderIcon: null,
      getColumnType: null,
      services: null,
      // Server-side pagination
      totalCount: null,
      offset: 0,
      onPageChange: null,
      onJumpToRow: null,
      // Custom cell rendering
      renderCell: null,
      // Rendering density + bottom-panel hooks (P2)
      mode: "normal",
      onRowClick: null,
      onRowContextMenu: null,
      onCellContextMenu: null,
      showExportButton: false,
      exportFilename: null,
      // The host port. TOP LEVEL, deliberately — NOT inside `services`,
      // which most call sites never pass. Supplies the native save
      // dialog for downloadCSV(); absent => Blob fallback.
      host: null,
      // Opt-in persistence: when set, this table's sort, filters, and
      // column widths survive teardown/reload, keyed by this string
      // inside the injected `stateStore`. Omit it and the table stays
      // ephemeral. WHERE the store persists is the embedder's business.
      persistKey: null,
      stateStore: null,
      // How the automatic fit pass sizes an undragged column — see the
      // typedef. 'container' is exactly what every consumer got before
      // this key existed, so the default is not a preference: it is the
      // promise that adding the key changed no existing layout by a
      // pixel. Only a consumer that asks for 'content' sees anything new.
      columnFit: "container",
      // Off unless asked for — see the typedef. With it the old pager is
      // not drawn: the paging strip says the same and more.
      paging: null,
      // C10. Off unless asked for — see the typedef.
      virtualize: false,
      virtualRowHeight: null,
      onRowsRendered: null,
      // 0.5.0. Every key below is off — or exactly the 0.4 behaviour — until
      // a consumer sets it (D6: additive and back-compatible). The typedef
      // says what each does.
      fitContent: false,
      maxHeight: null,
      autoDispose: false,
      firstColumn: "time",
      clickable: null,
      onRowActivate: null,
      activateOn: "click",
      getRowKey: null,
      activeRow: null,
      rowClass: null,
      rowAttrs: null,
      cellClass: null,
      diff: null,
      scrollLock: null,
      rowIcon: null,
      emptyState: void 0,
      nullDisplay: null,
      columnTypes: null,
      sortValue: null,
      dateFormat: null,
      dateTimeFormat: null,
      durationFormat: null,
      dateTimeZone: "local",
      // 0.7.0. Off — or exactly the 0.6 behaviour — until set. The
      // typedef says what each does.
      rowDetail: null,
      hasRowDetail: null,
      expandedRows: null,
      onRowDetailToggle: null,
      rowDetailLabel: "Details",
      dataSource: null,
      onLoad: null,
      onLoadError: null,
      hasMore: void 0,
      pagerLabels: null,
      pagerPosition: "top",
      maxJumpOffset: null,
      follow: false,
      onFollowChange: null,
      keepWhileDetached: false,
      filterKinds: null,
      onFilterChange: null,
      // STORY-0010. Off — or exactly the 0.9.1 behaviour — until set. The
      // typedef says what each does.
      contextMenuItems: null,
      onContextMenuAction: null,
      onRender: null,
      keyboardNav: false,
      onRowKeyDown: null,
      persistPage: false,
      // STORY-0012. Off — every column drawn, as in 0.9.1 — until set.
      hiddenColumns: null,
      columnChooser: false,
      onColumnsChange: null,
      // STORY-0086. Off — columns in their natural order, as in 0.16.
      reorderable: false,
      columnOrder: null,
      // STORY-0016. Off — no select column, as in 0.11 — until set.
      selectToggle: false,
      selectMode: false,
      onSelectModeChange: null,
      // STORY-0003. Off — rows selected as in 0.16, no editing — until
      // set. The typedef says what each does.
      selectionMode: "rows",
      editable: false,
      editors: null,
      editTypes: null,
      locale: null,
      editorMessages: null,
      onCellCommit: null,
      onCellSelectionChange: null,
      headerMenu: null,
      onHeaderMenuAction: null,
      // STORY-0088. Off — commits go to onCellCommit — until set.
      staged: false,
      historyLimit: 100,
      onCommit: null,
      onStagedChange: null,
      stagedRefusal: null,
      // STORY-0066. Off — one header row, no structural edits — until
      // set. The typedef says what each does.
      columnGroups: null,
      groupActions: null,
      onGroupAction: null,
      onColumnAdd: null,
      columnActions: null,
      onColumnAction: null,
      onColumnRename: null,
      onColumnDelete: null,
      onRowAdd: null,
      onRowDelete: null,
      // STORY-0089. Off — no fill handle — until set.
      fillHandle: false,
      // STORY-0090. Off — Ctrl+V is not the table's — until set.
      pasteable: false,
      onPasteOverrun: null,
      onRowsAppend: null,
      ...config
    };
    this._cellGrid = null;
    this._columnGroups = null;
    this._tableStructure = null;
    this._crosstabLayout = null;
    if (this.config.selectionMode === "cells") {
      const clash = ["selectToggle", "selectMode", "keyboardNav"].filter((k) => !!this.config[k]);
      if (clash.length) {
        console.warn(`[DataTable] ${clash.join("/")} cannot be combined with selectionMode: 'cells'; ignored.`);
        for (const k of clash) this.config[k] = false;
      }
      this._cellGrid = new CellGrid(this);
    } else if (this.config.editable) {
      console.warn("[DataTable] `editable` needs selectionMode: 'cells'; ignored.");
    }
    if (this.config.staged && !this._cellGrid) {
      console.warn("[DataTable] `staged` needs `editable`; ignored.");
    }
    if (this.config.fillHandle && !this._cellGrid) {
      console.warn("[DataTable] `fillHandle` needs `staged`; ignored.");
    }
    if (this.config.pasteable && !this._cellGrid) {
      console.warn("[DataTable] `pasteable` needs `staged`; ignored.");
    }
    if (Array.isArray(this.config.columnGroups) && this.config.columnGroups.length && this._crosstab()) {
      console.warn("[DataTable] `columnGroups` cannot be combined with `crosstab` (use crosstab.headerRows); ignored.");
    }
    {
      const sel = this.config.selectable;
      const asked = !!this.config.selectToggle || !!this.config.selectMode;
      this._gutter = asked && !!sel && sel !== "single";
      if (asked && !this._gutter) {
        console.warn("[DataTable] selectToggle/selectMode need a multi-row `selectable`; ignored.");
      }
      this._selecting = this._gutter && !!this.config.selectMode;
    }
    this._expanded = new Set((this.config.expandedRows || []).map((k) => String(k)));
    this._detailHeights = /* @__PURE__ */ new Map();
    this._source = null;
    this._following = !!this.config.follow && !!this.config.dataSource;
    this._followTimer = null;
    this._newKeys = null;
    this._filterControls = /* @__PURE__ */ new Map();
    this._filterCounts = /* @__PURE__ */ new Map();
    this._pendingFilter = null;
    this._hidden = /* @__PURE__ */ new Set();
    this._setHidden(this.config.hiddenColumns);
    this._order = null;
    this._askedOrder = null;
    this._askedUnchecked = false;
    if (!this._setOrder(this.config.columnOrder, true)) {
      console.warn("[DataTable] columnOrder is not an order of the columns; ignored.");
    }
    this._reorder = this.config.reorderable ? new ColumnReorder(this) : null;
    this._activeKey = this.config.activeRow == null ? null : String(this.config.activeRow);
    this._error = null;
    this._virt = null;
    this._virtBase = null;
    if (this.config.persistKey && !this.config.stateStore) {
      throw new Error(`DataTable: persistKey "${this.config.persistKey}" requires { stateStore }`);
    }
    this._state = {
      offset: 0,
      selected: /* @__PURE__ */ new Set(),
      anchorIndex: null,
      sortColumn: null,
      sortAscending: true,
      filters: /* @__PURE__ */ new Map()
    };
    this._columnTypes = [];
    this._processedRows = null;
    this._processedIndexMap = null;
    this._filterDebounceTimer = null;
    this._wrapperEl = null;
    this._paginationEl = null;
    this._tableEl = null;
    this._tbodyEl = null;
    this._contextMenuEl = null;
    this._contextMenuCtx = null;
    this._contextMenuReturnFocus = null;
    this._navCursor = null;
    this._filterDropdownEl = null;
    this._filterDropdownCleanup = null;
    this._colWidths = {};
    this._colWidthsSig = null;
    this._disposers = [];
    this._contextMenuGlobals = [];
    this._activationOffs = [];
    if (this.config.persistKey) {
      const store = this.config.stateStore;
      this._restorePersisted(store.get(this.config.persistKey));
      store.ready().then(() => {
        const late = store.get(this.config.persistKey);
        if (late && this._restorePersisted(late) && this._wrapperEl) {
          this._invalidateProcessedCache?.();
          this.render();
        }
      });
    }
  }
  /**
   * 0.5.0. Construct AND DRAW, in one call. The constructor draws nothing
   * until `render()`, so every consumer that forgot the second line got an
   * empty box; this is the two lines, once.
   *
   * Called on a class made by `withDefaults`, it builds that class — so the
   * house defaults apply.
   *
   * @param {HTMLElement} container
   * @param {DataTableConfig} [config]
   * @returns {DataTable}
   */
  static mount(container, config = {}) {
    const table = new this(container, config);
    table.render();
    return table;
  }
  /**
   * 0.5.0. A DataTable class with house defaults: `defaults` sit under every
   * config it is constructed (or `mount`ed) with, and the config wins key by
   * key. It is a real subclass — `instanceof DataTable` holds — and it can be
   * narrowed again with its own `withDefaults`.
   *
   *     const ListTable = DataTable.withDefaults({ mode: 'compact', sortable: true,
   *                                                pagination: false, fitContent: true });
   *     const table = ListTable.mount(host, { headers, rows });
   *
   * @param {DataTableConfig} defaults
   * @returns {typeof DataTable}
   */
  static withDefaults(defaults = {}) {
    const house = { ...defaults };
    return class extends this {
      constructor(container, config = {}) {
        super(container, { ...house, ...config });
      }
    };
  }
  /** Apply a persisted blob ({sort, asc, filters, widths}) onto this
   *  table's live state. Returns true if anything was applied. */
  _restorePersisted(blob) {
    if (!blob) return false;
    let applied = false;
    if (typeof blob.sortColumn === "number" || blob.sortColumn === null) {
      this._state.sortColumn = blob.sortColumn;
      this._state.sortAscending = blob.sortAscending !== false;
      applied = true;
    }
    if (Array.isArray(blob.filters)) {
      this._state.filters = new Map(blob.filters);
      applied = true;
    }
    if (Array.isArray(blob.hidden)) {
      this._setHidden(blob.hidden);
      applied = true;
    }
    if (Array.isArray(blob.order) && this._setOrder(blob.order)) {
      applied = true;
    }
    if (blob.colWidths && typeof blob.colWidths === "object") {
      this._colWidths = {};
      const shift = this._lead().select - (Number(blob.colWidthsLead) || 0);
      for (const [k, v] of Object.entries(blob.colWidths)) {
        const i = Number(k) + shift;
        if (i >= this._lead().select) this._colWidths[i] = v;
      }
      this._colWidthsSig = this._colSig();
      applied = true;
    }
    if (this.config.persistPage && Number.isInteger(blob.offset) && blob.offset >= 0) {
      this._state.offset = blob.offset;
      this._clampRestoredPage = true;
      applied = true;
    }
    return applied;
  }
  /** Identity of the current column set — restored widths/sort are
   *  keyed by position, so a schema change invalidates them. */
  _colSig() {
    return (this.config.headers || []).join("") + (this.config.showRowNumbers ? "|#" : "") + (this._hidden?.size ? `|-${this.getHiddenColumns().join(",")}` : "") + (this._columnOrder() ? `|>${this._columnOrder().join(",")}` : "") + (this._colGroups()?.sig() || "");
  }
  /** Snapshot the persistable slice of state to the project store.
   *  No-op unless `persistKey` is set. Debounced inside the store. */
  _savePersisted() {
    if (!this.config.persistKey) return;
    this.config.stateStore.set(this.config.persistKey, {
      sortColumn: this._state.sortColumn,
      sortAscending: this._state.sortAscending,
      filters: [...this._state.filters.entries()],
      colWidths: { ...this._colWidths },
      // STORY-0016. Where the widths start, so a blob read by a table
      // with or without the select column lands on the same columns.
      ...this._gutter ? { colWidthsLead: 1 } : {},
      // STORY-0010. Only for a table that asked: one that did not writes
      // the 0.9.1 blob, key for key.
      ...this.config.persistPage ? { offset: this._state.offset } : {},
      // STORY-0012. Only for a table that hides columns or lets them be
      // hidden.
      ...this._columnsOn() ? { hidden: this.getHiddenColumns() } : {},
      // STORY-0086. Only for a table that orders its columns.
      ...this._orderOn() ? { order: this.getColumnOrder() } : {}
    });
  }
  // ─────────────────────────────────────────────────────────────────
  // STORY-0012 — columns shown and hidden
  // ─────────────────────────────────────────────────────────────────
  /** Whether this table hides columns at all (and so saves the set). */
  _columnsOn() {
    return Array.isArray(this.config.hiddenColumns) || !!this.config.columnChooser || !!this._columnsTouched;
  }
  /** Replace the hidden set: whole indices of existing columns, and never
   *  every column — the first one stays when nothing else would. A table
   *  with no headers yet keeps the set for the headers `setData` brings. */
  _setHidden(list) {
    const n = (this.config.headers || []).length;
    this._hidden = new Set((Array.isArray(list) ? list : []).map(Number).filter((c) => Number.isInteger(c) && c >= 0 && (!n || c < n)));
    if (n && this._hidden.size >= n) this._hidden.delete(0);
  }
  _isHidden(colIdx) {
    return this._hidden.has(colIdx);
  }
  /** The cells a drawn row has: the shown columns, and the row number. */
  _domColCount() {
    const n = Math.max(0, (this.config.headers?.length || 0) - this._hidden.size);
    return n + this._lead().all + (this._colGroups()?.placeholderCount() || 0) + (this._crosstab()?.extraColumns() || 0);
  }
  /** STORY-0066. The column groups (column_groups.js) while `columnGroups`
   *  holds any; null otherwise. */
  _colGroups() {
    const spec = this.config.columnGroups;
    if (!Array.isArray(spec) || !spec.length) return null;
    if (this._crosstab()) return null;
    return this._columnGroups ||= new ColumnGroups(this);
  }
  /** STORY-0091. The crosstab layout (crosstab.js) while `crosstab` is an
   *  object; null otherwise. */
  _crosstab() {
    const spec = this.config.crosstab;
    if (!spec || typeof spec !== "object") return null;
    return this._crosstabLayout ||= new Crosstab(this);
  }
  /** STORY-0066. The structural edits (table_structure.js) while any of
   *  their options is set; null otherwise. */
  _structure() {
    if (!STRUCTURE_OPTIONS.some((k) => typeof this.config[k] === "function")) return null;
    return this._tableStructure ||= new TableStructure(this);
  }
  /** STORY-0016. The drawn columns in front of the data: the select column
   *  (`select`, 0 or 1, always first) and the row number. */
  _lead() {
    const select = this._gutter ? 1 : 0;
    return { select, all: select + (this.config.showRowNumbers ? 1 : 0) };
  }
  /** The data columns drawn, in the order drawn (STORY-0086): the order
   *  without the hidden ones. */
  _shownColumns() {
    return this._rowColumns(this.config.headers?.length || 0);
  }
  /** The data indices of a row of `count` cells to draw, in order: the
   *  shown columns, and any cell past the headers after them. */
  _rowColumns(count) {
    return cellOrder(this._columnOrder(), count).filter((c) => !this._isHidden(c));
  }
  /** A data column's drawn index (row number included), or -1 when hidden. */
  _domIdxOf(colIdx) {
    const slot = this._colGroups()?.slotOf(colIdx) ?? -1;
    if (slot >= 0) return this._lead().all + slot;
    const at = this._shownColumns().indexOf(colIdx);
    return at < 0 ? -1 : this._lead().all + at;
  }
  /** A drawn cell's data column, or null for the row number. */
  _dataIdxOfDom(domIdx) {
    const i = domIdx - this._lead().all;
    if (i < 0) return null;
    const slot = this._colGroups()?.slotAt(i);
    if (slot !== void 0) return slot;
    return this._shownColumns()[i] ?? null;
  }
  /** The columns not drawn, by data index, ascending. */
  getHiddenColumns() {
    return [...this._hidden || []].sort((a, b) => a - b);
  }
  /**
   * Show (`on` true) or hide a column. The last column shown is not hidden.
   * The widths of the other columns stay as they were; a column shown again
   * is measured. Saved under `persistKey`, and `onColumnsChange` is told.
   *
   * @param {number} colIdx
   * @param {boolean} [on=true]
   * @returns {boolean} whether the set changed
   */
  setColumnVisible(colIdx, on = true) {
    const n = this.config.headers?.length || 0;
    if (!Number.isInteger(colIdx) || colIdx < 0 || colIdx >= n) return false;
    if (!!on === !this._isHidden(colIdx)) return false;
    if (!on && n - this._hidden.size <= 1) return false;
    this._columnsTouched = true;
    const next = new Set(this._hidden);
    if (on) next.delete(colIdx);
    else next.add(colIdx);
    this._applyHidden(next);
    return true;
  }
  /** Swap in a new hidden set, carrying the drawn widths of the columns
   *  that stay drawn to their new places, and tell whoever listens. */
  _applyHidden(next) {
    const before = this.getHiddenColumns();
    this._carryWidths(() => this._setHidden([...next]));
    const after = this.getHiddenColumns();
    if (before.join() === after.join()) return;
    this._savePersisted();
    if (this._wrapperEl) this.render();
    this._columnsChanged();
  }
  /** STORY-0012/0086. Run `change` (a new hidden set or order), carrying
   *  the drawn widths of the columns drawn before and after to their new
   *  places. */
  _carryWidths(change) {
    const n = this.config.headers?.length || 0;
    const old = this._colWidths;
    const kept = this._colWidthsSig === this._colSig();
    const domBefore = [];
    for (let c = 0; c < n; c++) domBefore[c] = this._domIdxOf(c);
    change();
    if (kept) {
      const widths = {};
      for (let i = 0; i < this._lead().all; i++) if (old[i] != null) widths[i] = old[i];
      for (let c = 0; c < n; c++) {
        const from = domBefore[c];
        const to = this._domIdxOf(c);
        if (from >= 0 && to >= 0 && old[from] != null) widths[to] = old[from];
      }
      this._colWidths = widths;
      this._colWidthsSig = this._colSig();
    }
  }
  /** `onColumnsChange(hidden, {hidden, order})`, after a change of either. */
  _columnsChanged() {
    const hidden = this.getHiddenColumns();
    try {
      this.config.onColumnsChange?.(hidden, { hidden, order: this.getColumnOrder() });
    } catch (err) {
      console.error("[DataTable] onColumnsChange threw", err);
    }
  }
  // ─────────────────────────────────────────────────────────────────
  // STORY-0086 — the order the columns are drawn in (column_order.js)
  // ─────────────────────────────────────────────────────────────────
  /** Whether this table orders its columns at all (and so saves the order). */
  _orderOn() {
    return !!this.config.reorderable || Array.isArray(this.config.columnOrder) || !!this._orderTouched;
  }
  /** Take `list` as the order (`asked`: it is `columnOrder`, kept apart as
   *  the fallback). Refused (false, nothing changed) when it is no
   *  permutation of the columns; a table with no headers yet keeps it for
   *  the headers `setData` brings, and `_checkAskedOrder` checks it then. */
  _setOrder(list, asked = false) {
    const n = this.config.headers?.length || 0;
    if (list != null && (!Array.isArray(list) || n && !isColumnOrder(list, n))) return false;
    this._order = list == null ? null : list.map(Number);
    if (asked) {
      this._askedOrder = this._order;
      this._askedUnchecked = !!this._order && !n;
    }
    return true;
  }
  /** The first headers have come: a `columnOrder` taken before them, unchecked,
   *  that is no order of them is dropped with the same warning a table with
   *  headers gives at once — once, as the check is made once. */
  _checkAskedOrder() {
    const n = this.config.headers?.length || 0;
    if (!this._askedUnchecked || !n) return;
    this._askedUnchecked = false;
    if (isColumnOrder(this._askedOrder, n)) return;
    console.warn("[DataTable] columnOrder is not an order of the columns; ignored.");
    if (this._order === this._askedOrder) this._order = null;
    this._askedOrder = null;
  }
  /** The order in force, or null for the natural one. One rule, whether the
   *  headers were known when an order came or not: the first of the live
   *  order (dragged, moved or restored) and `columnOrder` that is an order
   *  of today's columns — so a saved order of the wrong length never
   *  displaces `columnOrder`. */
  _columnOrder() {
    const n = this.config.headers?.length || 0;
    for (const o of [this._order, this._askedOrder]) {
      if (o && isColumnOrder(o, n)) return o;
    }
    return null;
  }
  /**
   * Every data column's index, hidden ones included, in the order drawn.
   * @returns {number[]}
   */
  getColumnOrder() {
    return (this._columnOrder() || naturalOrder(this.config.headers?.length || 0)).slice();
  }
  /**
   * Move the column at position `from` of `getColumnOrder()` to position
   * `to`, the others closing up behind it: from the natural order,
   * `moveColumn(3, 1)` draws 0, 3, 1, 2. The widths stay with their columns.
   * Saved under `persistKey`, and `onColumnsChange` is told.
   *
   * @param {number} from
   * @param {number} to
   * @returns {boolean} whether the order changed
   */
  moveColumn(from, to) {
    const order = this.getColumnOrder();
    const n = order.length;
    if (![from, to].every((i) => Number.isInteger(i) && i >= 0 && i < n) || from === to) return false;
    this._applyOrder(moveInOrder(order, from, to));
    return true;
  }
  /** Swap in a new order (a permutation, or null), widths carried, and
   *  tell whoever listens. */
  _applyOrder(next) {
    const before = this.getColumnOrder().join();
    this._orderTouched = true;
    this._carryWidths(() => this._setOrder(next));
    if (this.getColumnOrder().join() === before) return;
    this._savePersisted();
    if (this._wrapperEl) this.render();
    this._columnsChanged();
  }
  /** `columnChooser`'s items: one checkable item a column. */
  _columnChooserItems() {
    const headers = this.config.headers || [];
    const lastShown = headers.length - this._hidden.size <= 1;
    return headers.map((h, c) => {
      const shown = !this._isHidden(c);
      return {
        label: String(h ?? ""),
        icon: shown ? "check" : "",
        checked: shown,
        disabled: shown && lastShown,
        title: shown && lastShown ? "The last column shown cannot be hidden" : "",
        onChoose: () => this.setColumnVisible(c, !shown)
      };
    });
  }
  /**
   * STORY-0003. The header's right-click menu for a press on `target`: the
   * consumer's `headerMenu` items for the data column under it, then — with
   * `columnChooser` — the chooser's items behind a separator. Empty when
   * there is nothing to show.
   */
  _headerMenuItems(target) {
    const items = [];
    const hook = this.config.headerMenu;
    const colIdx = this._headerColumnAt(target);
    if (typeof hook === "function" && colIdx !== null) {
      let asked = null;
      try {
        asked = hook(colIdx, {
          colIdx,
          header: this.config.headers?.[colIdx],
          hiddenColumns: this.getHiddenColumns(),
          table: this
        });
      } catch (err) {
        console.error("[DataTable] headerMenu threw", err);
      }
      for (const item of Array.isArray(asked) ? asked.filter(Boolean) : []) {
        if (item.separator) {
          items.push({ separator: true });
          continue;
        }
        items.push({
          ...item,
          onChoose: () => {
            try {
              this.config.onHeaderMenuAction?.(item.action, colIdx);
            } catch (err) {
              console.error("[DataTable] onHeaderMenuAction threw", err);
            }
          }
        });
      }
    }
    if (this._reorder && colIdx !== null) {
      const moves = this._reorder.menuItems(colIdx);
      if (moves.length && items.length) items.push({ separator: true });
      items.push(...moves);
    }
    const structural = this._structure()?.headerItems(colIdx) || [];
    if (structural.length) {
      if (items.length) items.push({ separator: true });
      items.push(...structural);
    }
    if (this.config.columnChooser) {
      if (items.length) items.push({ separator: true });
      items.push(...this._columnChooserItems());
    }
    return items;
  }
  /** The data column of a header cell (the header row, or the filter row
   *  under it), or null off one — the row number, the select column. */
  _headerColumnAt(target) {
    const cell = target?.closest?.("th, td");
    const tr = cell?.parentNode;
    if (!tr || tr.parentNode?.tagName !== "THEAD") return null;
    if (tr.children.length !== this._domColCount()) return null;
    return this._dataIdxOfDom(Array.prototype.indexOf.call(tr.children, cell));
  }
  /** STORY-0010 `persistPage`: the client page changed, so save it. */
  _savePage() {
    if (this.config.persistPage) this._savePersisted();
  }
  /**
   * Update data and re-render
   * @param {Object} updates - Partial config updates (headers, rows, etc.)
   */
  setData(updates) {
    const keepTicks = updates.rows && this._selecting && typeof this.config.getRowKey === "function" && this._state.selected.size ? new Set(this.getSelection().map((i) => this._rowKey(this.config.rows[i], i)).filter((k) => k !== null)) : null;
    if (updates.headers && this._state.filters.size > 0) {
      const oldHeaders = this.config.headers;
      const newHeaders = updates.headers;
      if (oldHeaders.length !== newHeaders.length || oldHeaders.some((h, i) => h !== newHeaders[i])) {
        this._state.filters.clear();
      }
    }
    if (updates.headers && (this._filterControls.size || this._filterCounts.size)) {
      const oldHeaders = this.config.headers;
      const newHeaders = updates.headers;
      if (oldHeaders.length !== newHeaders.length || oldHeaders.some((h, i) => h !== newHeaders[i])) {
        this._destroyFilterControls();
        this._filterCounts.clear();
      }
    }
    if (Object.prototype.hasOwnProperty.call(updates, "filterKinds")) {
      this._destroyFilterControls();
    }
    Object.assign(this.config, updates);
    if (Object.prototype.hasOwnProperty.call(updates, "hiddenColumns")) {
      const before = this.getHiddenColumns().join();
      this._setHidden(updates.hiddenColumns);
      if (this.getHiddenColumns().join() !== before) {
        this._savePersisted();
        this._columnsChanged();
      }
    } else if (updates.headers && this._hidden.size) {
      this._setHidden([...this._hidden]);
    }
    if (Object.prototype.hasOwnProperty.call(updates, "columnOrder")) {
      const before = this.getColumnOrder().join();
      if (!this._setOrder(updates.columnOrder, true)) {
        console.warn("[DataTable] columnOrder is not an order of the columns; ignored.");
      } else if (this.getColumnOrder().join() !== before) {
        this._savePersisted();
        this._columnsChanged();
      }
    } else if (updates.headers) {
      this._checkAskedOrder();
    }
    if (updates.rows) {
      this._state.selected.clear();
      this._state.anchorIndex = null;
      this._cellGrid?.newRows();
      if (this._state.offset >= updates.rows.length) {
        this._state.offset = 0;
      }
      this._columnTypes = this._detectColumnTypes();
      this._error = null;
    }
    if (Object.prototype.hasOwnProperty.call(updates, "activeRow")) {
      this._activeKey = updates.activeRow == null ? null : String(updates.activeRow);
    }
    if (Object.prototype.hasOwnProperty.call(updates, "columnTypes") && !updates.rows) {
      this._columnTypes = this._detectColumnTypes();
    }
    if (keepTicks) {
      (this.config.rows || []).forEach((r, i) => {
        if (keepTicks.has(this._rowKey(r, i))) this._state.selected.add(i);
      });
    }
    this._processedRows = null;
    this._processedIndexMap = null;
    this.render();
    if (keepTicks) this._notifySelectionChange();
  }
  /**
   * Show / hide a translucent loading overlay over the table body.
   * Used by server-side consumers between firing a fetch and
   * receiving the new rows so the UI doesn't appear frozen.
   * Callers either:
   *   - call `setLoading(true)` before their fetch, `setLoading(false)` after, OR
   *   - return a Promise from `onPageChange` / `onSort` callbacks
   *     — the overlay auto-shows during the await.
   * @param {boolean} on
   */
  setLoading(on) {
    this._loading = !!on;
    if (!this._wrapperEl) return;
    this._wrapperEl.classList.toggle(
      "twm-data-table-component--loading",
      !!on && (this.config.emptyState !== void 0 || !!this.config.dataSource)
    );
    let overlay = this._wrapperEl.querySelector(".twm-data-table__loading");
    if (on) {
      if (!overlay) {
        overlay = document.createElement("div");
        overlay.className = "twm-data-table__loading";
        overlay.innerHTML = '<div class="twm-data-table__spinner"></div>';
        if (!this._wrapperEl.style.position) {
          this._wrapperEl.style.position = "relative";
        }
        this._wrapperEl.appendChild(overlay);
      }
    } else if (overlay) {
      overlay.remove();
    }
  }
  /**
   * Get current selection indices
   * @returns {number[]} Array of selected row indices
   */
  getSelection() {
    return Array.from(this._state.selected).sort((a, b) => a - b);
  }
  /**
   * Set selection programmatically
   * @param {number[]} indices - Row indices to select
   */
  setSelection(indices) {
    if (this._cellGrid) {
      this._cellGrid.selectRows(indices);
      return;
    }
    this._state.selected.clear();
    for (const idx of indices) {
      if (idx >= 0 && idx < this.config.rows.length) {
        if (this.config.selectable === "single") this._state.selected.clear();
        this._state.selected.add(idx);
      }
    }
    if (this.config.selectable === "single") {
      this._state.anchorIndex = this._state.selected.size ? [...this._state.selected][0] : null;
    }
    this._updateRowSelection();
    this._notifySelectionChange();
  }
  // ─────────────────────────────────────────────────────────────────
  // 0.5.0 — the open row, the failure state, column widths
  // ─────────────────────────────────────────────────────────────────
  /**
   * Mark the row that is OPEN — the master of a master-detail — by its key
   * (`getRowKey`; without it, the row's original index). `null` clears it.
   *
   * The mark is NOT the selection: `setData` keeps it (the key is looked for
   * in the new rows), a right-click does not move it, and a sort, a filter or
   * a page change finds it where the row went. Drawn as `twm-dt-row--active`
   * and `aria-current="true"` on the row, in place — no re-render.
   *
   * @param {*} key
   */
  setActiveRow(key4) {
    this._activeKey = key4 == null ? null : String(key4);
    this.config.activeRow = key4 ?? null;
    const tbody = this._tbodyEl;
    if (!tbody) return;
    for (const tr of tbody.children) {
      if (tr.__rowIndex === void 0) continue;
      this._paintActive(tr);
    }
  }
  /** The open row's key, as text, or null. */
  getActiveRow() {
    return this._activeKey;
  }
  /**
   * Show a FAILURE inside the table's own box: text, a node, or an `Error`
   * (its message). The rows already drawn STAY — a failed refresh does not
   * blank a list a person was reading — under a banner saying what failed;
   * with no rows, the failure takes the empty row's place. `setError(null)`
   * clears it, and so does `setData({rows})`: new rows are an answer. A
   * failure also ends `setLoading`.
   *
   * @param {string|Node|Error|null} error
   */
  setError(error) {
    this._error = error == null || error === false ? null : error;
    if (this._error) this.setLoading(false);
    if (this._wrapperEl) this.render();
  }
  /** What `setError` was last given, or null. */
  getError() {
    return this._error;
  }
  /**
   * Forget every column width a person dragged, a double-click fitted or the
   * store restored, and measure the columns again from what is on screen —
   * for an embedder whose content has just changed size under them (a zoom,
   * a font). Persisted widths are cleared too.
   *
   * @returns {boolean} whether there was a table to measure
   */
  resetColumnWidths() {
    this._colWidths = {};
    this._colWidthsSig = this._colSig();
    this._savePersisted();
    if (!this._headerTableEl || !this._tableEl) return false;
    this._syncHeaderWidths();
    return true;
  }
  /**
   * Clear selection
   */
  clearSelection() {
    if (this._cellGrid) {
      this._cellGrid.clear();
      return;
    }
    this._state.selected.clear();
    this._state.anchorIndex = null;
    this._updateRowSelection();
    this._notifySelectionChange();
  }
  // ─────────────────────────────────────────────────────────────────
  // STORY-0003 — cell mode (`selectionMode: 'cells'`), see cell_grid.js
  // ─────────────────────────────────────────────────────────────────
  /**
   * The cell selection: `{anchor, focus, range}`. `anchor` and `focus` (the
   * cursor) are `{row, col, rowIdx}` — `row` the position in the order
   * shown, `col` the data column, `rowIdx` the original row index — and
   * `range` is `{top, bottom, left, right, rows, columns}`: positions,
   * data columns at its edges, and the original row indices and data
   * columns it covers. All null with nothing selected. Null outside cell
   * mode.
   */
  getCellSelection() {
    return this._cellGrid ? this._cellGrid.get() : null;
  }
  /**
   * Put the cursor on a cell (`row` a position in the order shown, `col` a
   * data column) — with `anchor`, select the range from there. `null`
   * clears. The row is brought into view. A no-op outside cell mode.
   *
   * @param {{row:number, col:number}|null} focus
   * @param {{row:number, col:number}} [anchor]
   */
  setCellSelection(focus, anchor = null) {
    this._cellGrid?.set(focus, anchor);
  }
  /** Open the editor on a cell (position, data column), as F2 would.
   *  Returns whether one opened. */
  editCell(row, col) {
    return !!this._cellGrid?.open(row, col);
  }
  /** Whether a cell editor is open. */
  isEditing() {
    return !!this._cellGrid?.isEditing();
  }
  // ── STORY-0088 `staged` ──────────────────────────────────────────────
  /**
   * Send every staged cell to `onCommit({edits})`, in one call. Resolves
   * `{ok: true, committed}` (the staged cells and the undo ring are
   * cleared), or `{ok: false, errors}` (the cells refused are marked and
   * every staged value stays). An open editor's value is staged first.
   * Without `staged`, resolves `{ok: false, errors: []}`.
   *
   * @returns {Promise<{ok: boolean, committed?: number, errors?: Array<{rowIdx:number, colIdx:number, error:string}>}>}
   */
  commit() {
    const st = this._cellGrid?.staged;
    return st ? st.commit() : Promise.resolve({ ok: false, errors: [] });
  }
  /** Drop every staged cell, its marks and the undo ring. Returns whether
   *  there was anything to drop. */
  discard() {
    return !!this._cellGrid?.staged?.discard();
  }
  /** Take the last staged edit back (Ctrl+Z). Returns whether it moved. */
  undo() {
    return !!this._cellGrid?.staged?.undo();
  }
  /** Put the last edit taken back back again (Ctrl+Y). */
  redo() {
    return !!this._cellGrid?.staged?.redo();
  }
  /** Every staged cell, `{rowIdx, colIdx, value, previous}`, by row then
   *  column. Empty without `staged`. */
  getStagedEdits() {
    return this._cellGrid?.staged ? this._cellGrid.staged.edits() : [];
  }
  /**
   * STORY-0089. Fill from the cell range to the cell `to` (`{row, col}`:
   * position in the order shown, data column), as dragging the fill handle
   * there does: staged as ONE undo entry, Ctrl's repeat as `forceCopy`.
   * Returns `{direction, count, staged, skipped}` —
   * `staged` the NUMBER of cells that changed, `skipped` the cells `editable` refused
   * (`{row, col, rowIdx}`) — or null when nothing was filled (no
   * `fillHandle`, no range, `to` inside it, an editor open, a commit out).
   */
  fill(to, { forceCopy = false } = {}) {
    return this._cellGrid?.fill ? this._cellGrid.fill.fill(to, { forceCopy }) : null;
  }
  /**
   * STORY-0090. Paste tab-separated `text` at the cursor cell, as Ctrl+V
   * does: each value read by its column's parse, staged as ONE undo entry.
   * Resolves `{rows, cols, staged, skipped, refused, droppedColumns,
   * appended}` — `staged` the NUMBER of cells that changed, `skipped` the
   * cells `editable` refused (`{row, col, rowIdx}`), `refused` the values
   * that did not parse (`{row, col, rowIdx, text, error}`),
   * `droppedColumns` the columns past the last one, `appended` the rows
   * handed to `onRowsAppend` — or null when nothing was pasted (no
   * `pasteable`, empty text, no cursor, an editor open, a commit or another
   * paste out, an overrun `onPasteOverrun` did not accept).
   *
   * @param {string} text
   * @returns {Promise<object|null>}
   */
  paste(text) {
    return this._cellGrid?.paste ? this._cellGrid.paste.paste(text) : Promise.resolve(null);
  }
  /** Why sort, filters and pages are held — a staged edit — or null; with
   *  a reason, `what` is refused out loud. */
  _stagedRefusal(what) {
    const why = this._cellGrid?.staged?.freezeReason() || null;
    if (why) console.warn(`[DataTable] ${what} refused: ${why}`);
    return why;
  }
  /** STORY-0066. Open the inline renamer on a data column's header (needs
   *  `onColumnRename`). Returns whether it opened. */
  renameColumn(colIdx) {
    return !!this._structure()?.rename(colIdx);
  }
  /**
   * Go to specific page
   * @param {number} page - Page number (0-indexed)
   */
  goToPage(page) {
    if (this._stagedRefusal("goToPage")) return;
    if (this.config.dataSource) {
      const size = this._sourcePageSize();
      let p = Math.max(0, Math.floor(Number(page)) || 0);
      const total = this._source?.total;
      if (typeof total === "number") p = Math.min(p, Math.max(0, Math.ceil(total / size) - 1));
      return this._sourceGoTo(p * size);
    }
    const rowCount = this._getProcessedRows().length;
    const maxPage = Math.ceil(rowCount / this.config.pageSize) - 1;
    this._state.offset = Math.max(0, Math.min(page, maxPage)) * this.config.pageSize;
    this._savePage();
    this.render();
  }
  /**
   * Go to specific row
   * @param {number} rowIndex - Row index
   */
  goToRow(rowIndex) {
    if (this._stagedRefusal("goToRow")) return;
    if (this.config.dataSource) {
      const size = this._sourcePageSize();
      return this.goToPage(Math.floor(Math.max(0, Math.floor(Number(rowIndex)) || 0) / size));
    }
    const rowCount = this._getProcessedRows().length;
    const idx = Math.max(0, Math.min(rowIndex, rowCount - 1));
    this._state.offset = Math.floor(idx / this.config.pageSize) * this.config.pageSize;
    this._savePage();
    this.render();
  }
  /**
   * Sort by column
   * @param {number} colIndex - Column index
   * @param {boolean} [ascending] - Sort direction (toggles if same column)
   */
  sortBy(colIndex, ascending) {
    if (this._stagedRefusal("sortBy")) return;
    if (this._state.sortColumn === colIndex && ascending === void 0) {
      this._state.sortAscending = !this._state.sortAscending;
    } else {
      this._state.sortColumn = colIndex;
      this._state.sortAscending = ascending ?? true;
    }
    this._processedRows = null;
    this._processedIndexMap = null;
    if (this.config.resetPageOnSort) this._state.offset = 0;
    const ret = this.config.onSort?.(colIndex, this._state.sortAscending);
    this._awaitWithSpinner(ret);
    this._savePersisted();
    this.render();
    if (this.config.dataSource) this._sourceLoad({ offset: 0, reason: "sort" });
  }
  /** Internal: if `maybePromise` is a Promise (or thenable),
   * toggle the loading overlay around it. No-op otherwise. */
  _awaitWithSpinner(maybePromise) {
    if (!maybePromise || typeof maybePromise.then !== "function") return;
    this.setLoading(true);
    Promise.resolve(maybePromise).finally(() => this.setLoading(false));
  }
  /**
   * Clear all column filters
   */
  clearFilters() {
    if (this._stagedRefusal("clearFilters")) return;
    this._state.filters.clear();
    this._processedRows = null;
    this._processedIndexMap = null;
    this._state.offset = 0;
    this._pendingFilter = null;
    this._savePersisted();
    for (const { control } of this._filterControls.values()) {
      try {
        control.setValue?.(null);
      } catch (err) {
        console.error("[DataTable] filter control setValue threw", err);
      }
    }
    this._notifyFilterChange();
    if (this.config.dataSource) {
      if (this._wrapperEl) this.render();
      this._sourceLoad({ offset: 0, reason: "filter" });
      return;
    }
    this.render();
  }
  /**
   * Get the number of rows after filtering
   * @returns {number}
   */
  getFilteredRowCount() {
    return this._getProcessedRows().length;
  }
  /**
   * STORY-0010. Give the table the keyboard focus (the body, where the arrow
   * keys and `onRowKeyDown` listen) without scrolling the page. False when
   * there is nothing drawn to focus.
   * @returns {boolean}
   */
  focus() {
    if (!this._tableEl) return false;
    try {
      this._tableEl.focus({ preventScroll: true });
    } catch (_) {
      return false;
    }
    return true;
  }
  /** STORY-0010 `keyboardNav`: the original indices of the page shown, in
   *  the order shown — every row held, when the page is a server's or there
   *  are no pages. */
  _pageOrder() {
    this._getProcessedRows();
    const order = this._processedIndexMap || [];
    if (this._isServerSide() || !this.config.pagination || this._pagingConfig()) return order;
    return order.slice(this._state.offset, this._state.offset + this.config.pageSize);
  }
  /**
   * STORY-0010. The rows the table shows, as row arrays, in the order shown:
   * filtered and sorted, across EVERY page — not only the one on screen. With
   * server-side paging (`onPageChange`, `dataSource`) they are the page the
   * consumer or the source gave, which is all the table holds. A copy:
   * changing it changes nothing in the table.
   * @returns {Array<Array>}
   */
  getDisplayedRows() {
    return this._getProcessedRows().slice();
  }
  /**
   * Render the table
   */
  render() {
    if (this._cellGrid?.isEditing()) {
      this._cellGrid.renderWaiting = true;
      return;
    }
    const activeFilterColIdx = this._getActiveFilterColIdx();
    const doc = this.container.ownerDocument;
    const hadTableFocus = !!this._tableEl && doc?.activeElement === this._tableEl;
    const focus070 = this._captureFocus070(doc);
    const pendingFilter = this.config.dataSource ? this._pendingFilter : null;
    const prevWrap = this._tableWrapEl;
    const prevScroll = prevWrap?.isConnected && this._renderedOffset === this._state.offset ? { top: prevWrap.scrollTop, left: prevWrap.scrollLeft } : null;
    this._cleanup();
    this._retireActivation();
    this.container.innerHTML = "";
    this._virt = null;
    const { rows, pagination, emptyMessage } = this.config;
    const colSig = this._colSig();
    if (this._colWidthsSig !== colSig) {
      this._colWidths = {};
      this._colWidthsSig = colSig;
    }
    if (this._columnTypes.length === 0) {
      this._columnTypes = this._detectColumnTypes();
    }
    if (this._clampRestoredPage && rows.length > 0) {
      this._clampRestoredPage = false;
      if (!this._isServerSide() && !this._pagingConfig()) {
        const size = this.config.pageSize;
        const last = Math.max(0, Math.ceil(this._getProcessedRows().length / size) - 1) * size;
        this._state.offset = Math.min(Math.floor(this._state.offset / size) * size, last);
      }
    }
    this._wrapperEl = document.createElement("div");
    this._wrapperEl.className = "twm-data-table-component" + (this.config.mode === "compact" ? " twm-data-table-component--compact" : "");
    const fit = this._fitsContent();
    if (fit) {
      this._wrapperEl.classList.add("twm-data-table-component--fit");
      const max = this._maxHeightCss();
      this._wrapperEl.style.cssText = "display:flex; flex-direction:column; height:auto; min-height:0;" + (max ? ` max-height:${max};` : "");
    } else {
      this._wrapperEl.style.cssText = "display:flex; flex-direction:column; height:100%; min-height:0;";
    }
    this._loading = false;
    this._paginationEl = null;
    if (pagination && (rows.length > 0 || (this._source?.offset || 0) > 0) && !this._pagingConfig()) {
      this._paginationEl = this._createPagination();
      if (this._paginationEl && this.config.pagerPosition !== "bottom") {
        this._wrapperEl.appendChild(this._paginationEl);
      }
    }
    const tableWrap = document.createElement("div");
    tableWrap.className = this.config.readonly ? "twm-preview-table-wrap twm-preview-table-wrap--wizard" : "twm-preview-table-wrap";
    tableWrap.style.cssText = fit ? "flex:0 1 auto; min-height:0; min-width:0; overflow:auto;" : "flex:1 1 0; min-height:0; min-width:0; overflow:auto;";
    if (this._error && rows.length > 0) {
      this._wrapperEl.appendChild(this._createErrorBanner());
    }
    const keepFilterRow = rows.length === 0 && (!!this.config.dataSource && this.config.filterable || !!this._crosstab());
    if (rows.length === 0 && !keepFilterRow) {
      const { headers, showRowNumbers } = this.config;
      const headerWrap = document.createElement("div");
      headerWrap.className = "twm-preview-table-header-wrap";
      headerWrap.style.cssText = "flex:0 0 auto; overflow:hidden; min-width:0;";
      const headerTable = document.createElement("table");
      headerTable.className = this._tableClassName();
      const thead = document.createElement("thead");
      const tr = document.createElement("tr");
      if (this._gutter) tr.appendChild(this._buildSelectHead());
      if (showRowNumbers) {
        const th = document.createElement("th");
        th.className = "num";
        th.textContent = "#";
        tr.appendChild(th);
      }
      for (const colIdx of this._shownColumns()) {
        const th = document.createElement("th");
        th.className = this._columnTypes[colIdx] || "text";
        th.textContent = headers[colIdx];
        tr.appendChild(th);
      }
      thead.appendChild(tr);
      headerTable.appendChild(thead);
      headerWrap.appendChild(headerTable);
      this._wrapperEl.appendChild(headerWrap);
      this._headerWrapEl = headerWrap;
      this._headerTableEl = headerTable;
      const bodyTable = document.createElement("table");
      bodyTable.className = headerTable.className;
      const tbody = document.createElement("tbody");
      tbody.appendChild(this._buildEmptyRow(this._domColCount(), emptyMessage));
      bodyTable.appendChild(tbody);
      tableWrap.appendChild(bodyTable);
      this._wrapperEl.appendChild(tableWrap);
      this._tableEl = bodyTable;
      this._tableWrapEl = tableWrap;
    } else {
      const fullTable = this._createTable();
      this._tableEl = fullTable;
      const crosstab = this._crosstab();
      const thead = crosstab ? null : fullTable.querySelector("thead");
      if (crosstab) {
        crosstab.decorate(fullTable);
        this._headerTableEl = null;
        this._headerWrapEl = null;
      }
      if (thead) {
        const headerWrap = document.createElement("div");
        headerWrap.className = "twm-preview-table-header-wrap";
        headerWrap.style.cssText = "flex:0 0 auto; overflow:hidden; min-width:0;";
        const headerTable = document.createElement("table");
        headerTable.className = fullTable.className;
        headerTable.appendChild(thead);
        headerWrap.appendChild(headerTable);
        this._wrapperEl.appendChild(headerWrap);
        this._headerTableEl = headerTable;
        this._headerWrapEl = headerWrap;
      } else {
        this._headerTableEl = null;
      }
      if (keepFilterRow && this._tbodyEl) {
        this._tbodyEl.appendChild(this._buildEmptyRow(this._domColCount(), emptyMessage));
      }
      tableWrap.appendChild(fullTable);
      this._wrapperEl.appendChild(tableWrap);
    }
    this._tableWrapEl = tableWrap;
    this._colGroups()?.decorate(this._headerWrapEl, this._headerTableEl);
    this._structure()?.decorate(this._headerTableEl);
    if ((this.config.columnChooser || typeof this.config.headerMenu === "function" || this._reorder || this._structure()?.hasHeaderItems()) && this._headerTableEl) {
      const head = this._headerTableEl;
      const onHeadMenu = (ev) => {
        const items = this._headerMenuItems(ev.target);
        if (!items.length) return;
        ev.preventDefault();
        ev.stopPropagation();
        setTimeout(() => this._showContextMenu(
          ev.clientX,
          ev.clientY,
          { ctx: null, items, copy: false }
        ), 0);
      };
      head.addEventListener("contextmenu", onHeadMenu);
      this._disposers.push(() => head.removeEventListener("contextmenu", onHeadMenu));
    }
    if (this._reorder && this._headerTableEl) {
      this._reorder.install(this._headerTableEl.querySelector("thead > tr"));
    }
    if (this._paginationEl && this.config.pagerPosition === "bottom") {
      this._paginationEl.classList.add("twm-pagination-controls--bottom");
      this._paginationEl.style.borderBottom = "0";
      this._paginationEl.style.borderTop = "1px solid #2a2a2a";
      this._wrapperEl.appendChild(this._paginationEl);
    }
    this._pagingEl = null;
    if (this._pagingConfig()) {
      this._pagingEl = this._createPagingStrip();
      if (this._pagingEl) this._wrapperEl.appendChild(this._pagingEl);
    }
    this.container.appendChild(this._wrapperEl);
    this._crosstab()?.install();
    if (this.config.scrollLock && typeof this.config.scrollLock.attach === "function") {
      this._disposers.push(this.config.scrollLock.attach(tableWrap));
    }
    if (this.config.autoDispose) autoDisposeWatch(this);
    if (prevScroll && this._state.offset === this._renderedOffset) {
      tableWrap.scrollTop = prevScroll.top;
      tableWrap.scrollLeft = prevScroll.left;
    }
    this._renderedOffset = this._state.offset;
    if (this._virt) {
      const onScroll = () => this._virtUpdate();
      tableWrap.addEventListener("scroll", onScroll, { passive: true });
      this._disposers.push(() => tableWrap.removeEventListener("scroll", onScroll));
      this._virtMeasure();
      this._virtUpdate({ force: true, notify: false });
    }
    if (this._pagingConfig()) {
      const onScroll = () => this._pagingMaybeLoadMore();
      tableWrap.addEventListener("scroll", onScroll, { passive: true });
      this._disposers.push(() => tableWrap.removeEventListener("scroll", onScroll));
      requestAnimationFrame(() => {
        if (this._tableWrapEl === tableWrap) this._pagingMaybeLoadMore();
      });
    }
    if (this._headerTableEl && this._tableEl) {
      requestAnimationFrame(() => {
        this._syncHeaderWidths();
        this._virtRemeasure();
      });
      if (this._resizeObserver) {
        try {
          this._resizeObserver.disconnect();
        } catch (_) {
        }
      }
      if (typeof ResizeObserver !== "undefined") {
        this._resizeObserver = createRafResizeObserver(() => {
          this._syncHeaderWidths();
          this._virtUpdate();
        });
        this._resizeObserver.observe(this._wrapperEl);
      }
      this._installHeaderScrollSync();
      if (rows.length > 0) this._installColumnResizers();
    }
    if (rows.length > 0 && (this.config.selectable || this.config.copyable || !this.config.readonly || typeof this.config.onRowActivate === "function" || typeof this.config.rowDetail === "function" || typeof this.config.onRowKeyDown === "function" || this._cellGrid)) {
      this._installInteractions();
    }
    if (activeFilterColIdx !== null) {
      this._restoreFilterFocus(activeFilterColIdx);
    } else if (hadTableFocus && this._tableEl) {
      try {
        this._tableEl.focus({ preventScroll: true });
      } catch (_) {
      }
    } else if (focus070) {
      this._restoreFocus070(focus070);
    }
    if (pendingFilter) this._resumePendingFilter(pendingFilter);
    if (this.config.dataSource) {
      if (!this._source?.started) {
        this._sourceState().started = true;
        Promise.resolve().then(() => this._sourceLoad({ offset: 0, reason: "initial" }));
      } else if (this._source.inFlight && !this._source.pendingAppend) {
        this.setLoading(true);
      }
      if (this._following && !this._followTimer) this._armFollow();
    }
    if (typeof this.config.onRender === "function") {
      try {
        this.config.onRender(this);
      } catch (err) {
        console.error("[DataTable] onRender threw", err);
      }
    }
  }
  /**
   * Copy selected rows to clipboard — in cell mode (STORY-0085) the cells
   * selected, or the cursor cell alone, as tab-separated raw values with no
   * header line; cell mode has no CSV copy
   * @param {'tsv'|'csv'} [format='tsv'] - Output format
   */
  async copyToClipboard(format = "tsv") {
    if (this._cellGrid) {
      if (format === "csv") {
        console.warn("[DataTable] copyToClipboard: cell mode has no CSV copy; nothing copied");
        return;
      }
      return this._copyCells();
    }
    const indices = this.getSelection();
    if (indices.length === 0) {
      this._notify("Copy", "No rows selected.", "warn");
      return;
    }
    const { headers, rows } = this.config;
    const matrix = [this._rowColumns(headers.length).map((c) => headers[c])];
    for (const idx of indices) {
      const row = rows[idx];
      if (row) {
        matrix.push(this._rowColumns(row.length).map((c) => this._formatValue(row[c], c)));
      }
    }
    const separator = format === "csv" ? "," : "	";
    const text = format === "csv" ? matrix.map((row) => row.map((cell) => this._csvEscape(cell)).join(separator)).join("\n") : matrix.map((row) => row.join(separator)).join("\n");
    let ok2 = false;
    try {
      await navigator.clipboard.writeText(text);
      ok2 = true;
    } catch (_) {
      ok2 = this._fallbackCopy(text);
    }
    if (ok2) {
      const desc = indices.length === 1 ? "row" : "rows";
      const suffix = format === "csv" ? " as CSV" : "";
      this._notify("Copy", `Copied ${indices.length} ${desc}${suffix}.`, "info");
    } else {
      this._notify("Copy", "Clipboard unavailable.", "warn");
    }
    this._hideContextMenu();
  }
  /**
   * STORY-0085. Cell mode's copy: the range (or the cursor cell alone), its
   * raw values as TSV — Excel's quoting, `tsv.js` — with no header line.
   */
  async _copyCells() {
    const matrix = this._cellGrid.copyMatrix();
    if (!matrix || !matrix.length) {
      this._notify("Copy", "No cells selected.", "warn");
      this._hideContextMenu();
      return;
    }
    const text = toTSV(matrix);
    let ok2 = false;
    try {
      await navigator.clipboard.writeText(text);
      ok2 = true;
    } catch (_) {
      ok2 = this._fallbackCopy(text);
    }
    if (ok2) {
      const n = matrix.length;
      const m = matrix[0].length;
      const what = n * m === 1 ? "1 cell" : `${n} \xD7 ${m} cells`;
      this._notify("Copy", `Copied ${what}.`, "info");
    } else {
      this._notify("Copy", "Clipboard unavailable.", "warn");
    }
    this._hideContextMenu();
  }
  /**
   * Download all data as CSV
   * @param {string} [filename='data.csv'] - Filename for download
   */
  async downloadCSV(filename = "data.csv") {
    const { headers, rows } = this.config;
    if (rows.length === 0) {
      this._notify("Download", "No data to download.", "warn");
      return;
    }
    const lines = [this._rowColumns(headers.length).map((c) => headers[c]).join(",")];
    for (const row of rows) {
      lines.push(this._rowColumns(row.length).map(
        (c) => this._csvEscape(this._formatValue(row[c], c))
      ).join(","));
    }
    const csv = lines.join("\n");
    const dialogs = this.config.host?.dialogs;
    let result = null;
    if (dialogs) {
      try {
        result = await dialogs.saveFile({ data: csv, filename, kind: "csv" });
      } catch (err) {
        console.error("[DataTable] CSV download failed:", err);
        this._notify("Download", "Failed to save file", "error");
        return;
      }
    }
    if (result) {
      if (result.ok) {
        this._notify("Download", `Saved ${rows.length} rows to ${result.path}`, "success");
      } else if (!result.cancelled) {
        this._notify("Download", result.error || "Failed to save file", "error");
      }
      return;
    }
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    this._notify("Download", "Download started", "info");
  }
  /**
   * Dispose and cleanup. Empties the host, as it always has.
   */
  dispose() {
    this._teardown(true);
  }
  /**
   * 0.5.0 `autoDispose`'s dispose: everything `dispose()` lets go of — but of
   * the host, only the table's OWN wrapper. A table that has been taken out
   * of the page no longer owns its host: in the task before this runs, the
   * consumer may have mounted the next list into it, or written its own
   * message there, and emptying the host would wipe that.
   */
  _disposeOwn() {
    this._teardown(false);
  }
  _teardown(emptyHost) {
    this._cellGrid?.dispose();
    this._tableStructure?.dispose();
    autoDisposeUnwatch(this);
    this._autoSeen = false;
    if (this._autoTimer) {
      clearTimeout(this._autoTimer);
      this._autoTimer = null;
    }
    this._autoPending = false;
    this._disarmFollow();
    if (this._source) {
      this._source.ticket++;
      try {
        this._source.controller?.abort();
      } catch (_) {
      }
      this._source.controller = null;
      this._source.inFlight = false;
    }
    this._destroyFilterControls();
    this._runOffs(this._activationOffs);
    this._activationOffs = [];
    this._cleanup();
    this._closeFilterDropdown();
    this._teardownContextMenu();
    if (this._resizeObserver) {
      try {
        this._resizeObserver.disconnect();
      } catch (_) {
      }
      this._resizeObserver = null;
    }
    if (this._onBodyScroll && this._scrollSyncEl) {
      try {
        this._scrollSyncEl.removeEventListener("scroll", this._onBodyScroll);
      } catch (_) {
      }
      this._onBodyScroll = null;
      this._scrollSyncEl = null;
    }
    if (emptyHost) this.container.innerHTML = "";
    else this._wrapperEl?.remove();
    this._wrapperEl = null;
    this._paginationEl = null;
    this._tableEl = null;
    this._tbodyEl = null;
    this._headerTableEl = null;
    this._headerWrapEl = null;
    this._tableWrapEl = null;
    this._processedRows = null;
    this._processedIndexMap = null;
    this._virt = null;
    this._colgroupEl = null;
  }
  // ─────────────────────────────────────────────────────────────────
  // Processed rows pipeline (filter → sort → cache)
  // ─────────────────────────────────────────────────────────────────
  _getProcessedRows() {
    if (this._processedRows !== null) return this._processedRows;
    const isServerSide = this._isServerSide();
    let rows = this.config.rows;
    let indexMap = rows.map((_, i) => i);
    if (!isServerSide && this._state.filters.size > 0) {
      const result = this._applyFilters(rows, indexMap);
      rows = result.rows;
      indexMap = result.indexMap;
    }
    if (!isServerSide && this.config.sortable && this._state.sortColumn !== null && !this.config.onSort) {
      const result = this._applySorting(rows, indexMap);
      rows = result.rows;
      indexMap = result.indexMap;
    }
    this._processedRows = rows;
    this._processedIndexMap = indexMap;
    return rows;
  }
  _applyFilters(rows, indexMap) {
    const filters = this._state.filters;
    const filteredRows = [];
    const filteredMap = [];
    const matchers = /* @__PURE__ */ new Map();
    for (const colIdx of filters.keys()) matchers.set(colIdx, this._filterMatcher(colIdx));
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      let pass = true;
      for (const [colIdx, filterText] of filters) {
        if (!filterText) continue;
        const value = row[colIdx];
        const kindMatch = matchers.get(colIdx);
        if (kindMatch) {
          if (this._isEmptyFilterValue(filterText)) continue;
          if (!kindMatch(value, filterText, row)) {
            pass = false;
            break;
          }
          continue;
        }
        const colType = this._valueKind(colIdx);
        if (colType === "num") {
          if (!this._matchNumericFilter(value, filterText)) {
            pass = false;
            break;
          }
        } else if (colType === "date" || colType === "datetime") {
          const utc = this._utc();
          if (!matchDateFilter(
            parseDateValue(value, { utc }),
            filterText,
            this._formatValue(value, colIdx),
            { utc }
          )) {
            pass = false;
            break;
          }
        } else if (colType === "duration") {
          if (!matchDurationFilter(
            parseDuration(value),
            filterText,
            this._formatValue(value, colIdx)
          )) {
            pass = false;
            break;
          }
        } else {
          if (!this._matchTextFilter(value, filterText)) {
            pass = false;
            break;
          }
        }
      }
      if (pass) {
        filteredRows.push(row);
        filteredMap.push(indexMap[i]);
      }
    }
    return { rows: filteredRows, indexMap: filteredMap };
  }
  _applySorting(rows, indexMap) {
    const colIdx = this._state.sortColumn;
    const asc = this._state.sortAscending;
    const hook = this._sortValueFor(colIdx);
    const kind = this._valueKind(colIdx);
    if (hook || TYPED_COLUMNS.has(kind)) {
      const utc = this._utc();
      const keyOf = (row) => {
        const value = row[colIdx];
        if (hook) {
          const k = hook(value, colIdx, row);
          if (k !== void 0) return normaliseSortKey(k);
        }
        if (kind === "date" || kind === "datetime") {
          return normaliseSortKey(parseDateValue(value, { utc }));
        }
        if (kind === "duration") return normaliseSortKey(parseDuration(value));
        if (kind === "num") {
          return normaliseSortKey(typeof value === "number" ? value : parseFloat(value));
        }
        return value == null ? null : String(value).toLowerCase();
      };
      const keyed = rows.map((row, i) => ({ row, origIdx: indexMap[i], key: keyOf(row) }));
      keyed.sort((a, b) => compareSortKeys(a.key, b.key, asc));
      return {
        rows: keyed.map((p) => p.row),
        indexMap: keyed.map((p) => p.origIdx)
      };
    }
    const paired = rows.map((row, i) => ({ row, origIdx: indexMap[i] }));
    const isNumeric = this._columnTypes[colIdx] === "num";
    paired.sort((a, b) => {
      let valA = a.row[colIdx];
      let valB = b.row[colIdx];
      if (valA == null && valB == null) return 0;
      if (valA == null) return 1;
      if (valB == null) return -1;
      if (isNumeric) {
        valA = typeof valA === "number" ? valA : parseFloat(valA);
        valB = typeof valB === "number" ? valB : parseFloat(valB);
        if (!Number.isFinite(valA)) return 1;
        if (!Number.isFinite(valB)) return -1;
      } else {
        valA = String(valA).toLowerCase();
        valB = String(valB).toLowerCase();
      }
      let cmp = 0;
      if (valA < valB) cmp = -1;
      else if (valA > valB) cmp = 1;
      return asc ? cmp : -cmp;
    });
    return {
      rows: paired.map((p) => p.row),
      indexMap: paired.map((p) => p.origIdx)
    };
  }
  _matchNumericFilter(value, filterText) {
    const text = filterText.trim();
    if (!text) return true;
    const numVal = typeof value === "number" ? value : parseFloat(value);
    if (!Number.isFinite(numVal)) return false;
    const rangeMatch = text.match(/^(-?[\d.]+)\.\.(-?[\d.]+)$/);
    if (rangeMatch) {
      const lo = parseFloat(rangeMatch[1]);
      const hi = parseFloat(rangeMatch[2]);
      return numVal >= lo && numVal <= hi;
    }
    const opMatch = text.match(/^(>=|<=|!=|>|<|=)\s*(-?[\d.]+)$/);
    if (opMatch) {
      const op = opMatch[1];
      const target = parseFloat(opMatch[2]);
      if (!Number.isFinite(target)) return true;
      switch (op) {
        case ">":
          return numVal > target;
        case "<":
          return numVal < target;
        case ">=":
          return numVal >= target;
        case "<=":
          return numVal <= target;
        case "!=":
          return Math.abs(numVal - target) > 1e-9;
        case "=":
          return Math.abs(numVal - target) <= 1e-9;
      }
    }
    const plain = parseFloat(text);
    if (Number.isFinite(plain)) {
      return Math.abs(numVal - plain) <= 1e-9;
    }
    return true;
  }
  _matchTextFilter(value, filterText) {
    if (!filterText) return true;
    const haystack = (value == null ? "" : String(value)).toLowerCase();
    const text = filterText.trim();
    if (text.startsWith('="') && text.endsWith('"')) {
      return haystack === text.slice(2, -1).toLowerCase();
    }
    if (text.startsWith("!")) {
      return !haystack.includes(text.slice(1).toLowerCase());
    }
    if (text.startsWith("^")) {
      return haystack.startsWith(text.slice(1).toLowerCase());
    }
    if (text.endsWith("$")) {
      return haystack.endsWith(text.slice(0, -1).toLowerCase());
    }
    return haystack.includes(text.toLowerCase());
  }
  _invalidateProcessedCache() {
    this._processedRows = null;
    this._processedIndexMap = null;
  }
  // ─────────────────────────────────────────────────────────────────
  // Filter row
  // ─────────────────────────────────────────────────────────────────
  _createFilterRow(headers) {
    const { showRowNumbers } = this.config;
    const tr = document.createElement("tr");
    tr.className = "twm-data-table__filter-row";
    if (this._gutter) {
      const th = document.createElement("th");
      th.className = "data-table__filter-cell data-table__filter-cell--empty twm-dt-select-cell";
      tr.appendChild(th);
    }
    if (showRowNumbers) {
      const th = document.createElement("th");
      th.className = "data-table__filter-cell data-table__filter-cell--empty";
      tr.appendChild(th);
    }
    this._shownColumns().forEach((colIdx) => {
      const header = headers[colIdx];
      const th = document.createElement("th");
      th.className = "data-table__filter-cell";
      const control = this._filterControlFor(colIdx, header);
      if (control) {
        th.classList.add("data-table__filter-cell--control");
        tr.classList.add("twm-data-table__filter-row--controls");
        th.addEventListener("click", (e) => e.stopPropagation());
        if (control.el) th.appendChild(control.el);
        tr.appendChild(th);
        return;
      }
      const wrapper = document.createElement("div");
      wrapper.className = "twm-data-table__filter-wrapper";
      const input = document.createElement("input");
      input.type = "text";
      input.className = "twm-data-table__filter-input";
      const kind = this._valueKind(colIdx);
      input.placeholder = kind === "num" ? "e.g. >100" : kind === "date" || kind === "datetime" ? "e.g. >2026-01-01" : kind === "duration" ? "e.g. >1s" : "Filter...";
      const existingFilter = this._state.filters.get(colIdx);
      if (existingFilter) {
        input.value = existingFilter;
      }
      const dropdownBtn = document.createElement("button");
      dropdownBtn.type = "button";
      dropdownBtn.className = "twm-data-table__filter-dropdown-btn";
      dropdownBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:14px;">tune</span>';
      dropdownBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this._openFilterDropdown(colIdx, th, input);
      });
      const clearBtn = document.createElement("button");
      clearBtn.type = "button";
      clearBtn.className = "twm-data-table__filter-clear";
      clearBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:12px;">close</span>';
      clearBtn.style.display = existingFilter ? "" : "none";
      clearBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        input.value = "";
        this._onFilterInput(colIdx, "");
        clearBtn.style.display = "none";
        input.focus();
      });
      input.addEventListener("input", () => {
        clearBtn.style.display = input.value ? "" : "none";
        this._onFilterInputDebounced(colIdx, input.value);
      });
      th.addEventListener("click", (e) => e.stopPropagation());
      wrapper.appendChild(input);
      wrapper.appendChild(dropdownBtn);
      wrapper.appendChild(clearBtn);
      th.appendChild(wrapper);
      tr.appendChild(th);
    });
    return tr;
  }
  // ─────────────────────────────────────────────────────────────────
  // Filter dropdown
  // ─────────────────────────────────────────────────────────────────
  _openFilterDropdown(colIdx, anchorEl, filterInput) {
    this._closeFilterDropdown();
    const kind = this._valueKind(colIdx);
    const isNumeric = kind === "num";
    const isDate = kind === "date" || kind === "datetime";
    const isOrdered = isNumeric || isDate || kind === "duration";
    const currentFilter = this._state.filters.get(colIdx) || "";
    const parsed = this._parseFilterForDropdown(currentFilter, isOrdered ? isNumeric ? true : kind : false);
    const panel = document.createElement("div");
    panel.className = "twm-data-table__filter-dropdown";
    const selectLabel = document.createElement("label");
    selectLabel.className = "twm-data-table__filter-dropdown-label";
    selectLabel.textContent = isOrdered ? "Operator" : "Mode";
    const select = document.createElement("select");
    select.className = "twm-data-table__filter-dropdown-select";
    const options = isDate ? [
      { value: "=", label: "On / in" },
      { value: "!=", label: "Not on / in" },
      { value: ">", label: "After" },
      { value: ">=", label: "On or after" },
      { value: "<", label: "Before" },
      { value: "<=", label: "On or before" },
      { value: "..", label: "Between" }
    ] : isOrdered ? [
      { value: "=", label: "Equals" },
      { value: "!=", label: "Not equals" },
      { value: ">", label: "Greater than" },
      { value: ">=", label: "Greater or equal" },
      { value: "<", label: "Less than" },
      { value: "<=", label: "Less or equal" },
      { value: "..", label: "Between" }
    ] : [
      { value: "contains", label: "Contains" },
      { value: "equals", label: "Equals" },
      { value: "starts", label: "Starts with" },
      { value: "ends", label: "Ends with" },
      { value: "not", label: "Not contains" }
    ];
    for (const opt of options) {
      const optEl = document.createElement("option");
      optEl.value = opt.value;
      optEl.textContent = opt.label;
      if (opt.value === parsed.operator) optEl.selected = true;
      select.appendChild(optEl);
    }
    const valueLabel = document.createElement("label");
    valueLabel.className = "twm-data-table__filter-dropdown-label";
    valueLabel.textContent = "Value";
    const operandPlaceholder = isNumeric ? "Number..." : isDate ? "YYYY-MM-DD" : isOrdered ? "e.g. 1.5s" : "Text...";
    const valueInput = document.createElement("input");
    valueInput.type = isNumeric ? "number" : "text";
    valueInput.className = "twm-data-table__filter-dropdown-input";
    valueInput.placeholder = operandPlaceholder;
    valueInput.value = parsed.value;
    const value2Label = document.createElement("label");
    value2Label.className = "twm-data-table__filter-dropdown-label";
    value2Label.textContent = "And";
    const value2Input = document.createElement("input");
    value2Input.type = isOrdered && !isNumeric ? "text" : "number";
    value2Input.className = "twm-data-table__filter-dropdown-input";
    value2Input.placeholder = isOrdered && !isNumeric ? operandPlaceholder : "Number...";
    value2Input.value = parsed.value2;
    const value2Container = document.createElement("div");
    value2Container.className = "twm-data-table__filter-dropdown-between";
    value2Container.style.display = isOrdered && parsed.operator === ".." ? "" : "none";
    value2Container.appendChild(value2Label);
    value2Container.appendChild(value2Input);
    select.addEventListener("change", () => {
      value2Container.style.display = isOrdered && select.value === ".." ? "" : "none";
    });
    const composeMode = isNumeric ? true : isOrdered ? kind : false;
    const actions = document.createElement("div");
    actions.className = "twm-data-table__filter-dropdown-actions";
    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "twm-data-table__filter-dropdown-btn-action twm-data-table__filter-dropdown-btn-action--clear";
    clearBtn.textContent = "Clear";
    clearBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      filterInput.value = "";
      this._onFilterInput(colIdx, "");
      this._closeFilterDropdown();
    });
    const applyBtn = document.createElement("button");
    applyBtn.type = "button";
    applyBtn.className = "twm-data-table__filter-dropdown-btn-action twm-data-table__filter-dropdown-btn-action--apply";
    applyBtn.textContent = "Apply";
    applyBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const composed = this._composeFilterString(select.value, valueInput.value, value2Input.value, composeMode);
      filterInput.value = composed;
      this._onFilterInput(colIdx, composed);
      this._closeFilterDropdown();
    });
    actions.appendChild(clearBtn);
    actions.appendChild(applyBtn);
    panel.appendChild(selectLabel);
    panel.appendChild(select);
    panel.appendChild(valueLabel);
    panel.appendChild(valueInput);
    panel.appendChild(value2Container);
    panel.appendChild(actions);
    document.body.appendChild(panel);
    const anchorRect = anchorEl.getBoundingClientRect();
    let left = anchorRect.left;
    let top = anchorRect.bottom + 4;
    const panelRect = panel.getBoundingClientRect();
    if (left + panelRect.width > window.innerWidth) {
      left = window.innerWidth - panelRect.width - 8;
    }
    if (top + panelRect.height > window.innerHeight) {
      top = anchorRect.top - panelRect.height - 4;
    }
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    requestAnimationFrame(() => valueInput.focus());
    const handleOutsideClick = (e) => {
      if (!panel.contains(e.target)) {
        this._closeFilterDropdown();
      }
    };
    const handleEscape = (e) => {
      if (e.key === "Escape") {
        this._closeFilterDropdown();
      }
    };
    const handleEnter = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const composed = this._composeFilterString(select.value, valueInput.value, value2Input.value, composeMode);
        filterInput.value = composed;
        this._onFilterInput(colIdx, composed);
        this._closeFilterDropdown();
      }
    };
    setTimeout(() => {
      document.addEventListener("click", handleOutsideClick, true);
    }, 0);
    document.addEventListener("keydown", handleEscape);
    panel.addEventListener("keydown", handleEnter);
    this._filterDropdownEl = panel;
    this._filterDropdownCleanup = () => {
      document.removeEventListener("click", handleOutsideClick, true);
      document.removeEventListener("keydown", handleEscape);
    };
  }
  _closeFilterDropdown() {
    if (this._filterDropdownEl?.parentNode) {
      this._filterDropdownEl.parentNode.removeChild(this._filterDropdownEl);
    }
    this._filterDropdownCleanup?.();
    this._filterDropdownEl = null;
    this._filterDropdownCleanup = null;
  }
  _parseFilterForDropdown(filterText, isNumeric) {
    const text = (filterText || "").trim();
    if (!text) {
      return { operator: isNumeric ? "=" : "contains", value: "", value2: "" };
    }
    if (typeof isNumeric === "string") {
      const range = text.match(/^(.+?)\s*\.\.\s*(.+)$/);
      if (range) return { operator: "..", value: range[1], value2: range[2] };
      const op = text.match(/^(>=|<=|!=|>|<|=)\s*(.+)$/);
      if (op) return { operator: op[1], value: op[2], value2: "" };
      return { operator: "=", value: text, value2: "" };
    }
    if (isNumeric) {
      const rangeMatch = text.match(/^(-?[\d.]+)\.\.(-?[\d.]+)$/);
      if (rangeMatch) {
        return { operator: "..", value: rangeMatch[1], value2: rangeMatch[2] };
      }
      const opMatch = text.match(/^(>=|<=|!=|>|<|=)\s*(-?[\d.]+)$/);
      if (opMatch) {
        return { operator: opMatch[1], value: opMatch[2], value2: "" };
      }
      return { operator: "=", value: text, value2: "" };
    }
    if (text.startsWith('="') && text.endsWith('"')) {
      return { operator: "equals", value: text.slice(2, -1), value2: "" };
    }
    if (text.startsWith("!")) {
      return { operator: "not", value: text.slice(1), value2: "" };
    }
    if (text.startsWith("^")) {
      return { operator: "starts", value: text.slice(1), value2: "" };
    }
    if (text.endsWith("$")) {
      return { operator: "ends", value: text.slice(0, -1), value2: "" };
    }
    return { operator: "contains", value: text, value2: "" };
  }
  _composeFilterString(operator, value, value2, isNumeric) {
    if (!value && operator !== "..") return "";
    if (typeof isNumeric === "string") {
      if (operator === "..") return value && value2 ? `${value}..${value2}` : "";
      return `${operator}${value}`;
    }
    if (isNumeric) {
      if (operator === "..") {
        return value && value2 ? `${value}..${value2}` : "";
      }
      if (operator === "=") return value;
      return `${operator}${value}`;
    }
    switch (operator) {
      case "contains":
        return value;
      case "equals":
        return value ? `="${value}"` : "";
      case "starts":
        return value ? `^${value}` : "";
      case "ends":
        return value ? `${value}$` : "";
      case "not":
        return value ? `!${value}` : "";
      default:
        return value;
    }
  }
  _onFilterInputDebounced(colIdx, value) {
    if (this._filterDebounceTimer) {
      clearTimeout(this._filterDebounceTimer);
    }
    this._pendingFilter = { colIdx, value };
    this._filterDebounceTimer = setTimeout(() => {
      this._pendingFilter = null;
      this._onFilterInput(colIdx, value);
    }, 200);
  }
  _onFilterInput(colIdx, value) {
    if (this._stagedRefusal("A filter")) return;
    const empty = typeof value === "string" ? !value : this._isEmptyFilterValue(value);
    if (!empty) {
      this._state.filters.set(colIdx, value);
    } else {
      this._state.filters.delete(colIdx);
    }
    this._pendingFilter = null;
    this._invalidateProcessedCache();
    this._state.offset = 0;
    this._state.selected.clear();
    this._state.anchorIndex = null;
    this._savePersisted();
    const entry = this._filterControls.get(colIdx);
    if (entry) {
      try {
        entry.control.setValue?.(empty ? null : value);
      } catch (err) {
        console.error("[DataTable] filter control setValue threw", err);
      }
    }
    this._notifyFilterChange();
    if (this.config.dataSource) {
      this._sourceLoad({ offset: 0, reason: "filter" });
      return;
    }
    this.render();
  }
  /** 0.7.0. Put back a filter that was still being typed when a render
   *  rebuilt its box: the words, and the debounce that will apply them. */
  _resumePendingFilter({ colIdx, value }) {
    const filterRow = this._wrapperEl?.querySelector(".twm-data-table__filter-row");
    const cell = filterRow?.children[this._domIdxOf(colIdx)];
    const input = cell?.querySelector(".twm-data-table__filter-input");
    if (input && input.value !== value) {
      const focused = input.ownerDocument?.activeElement === input;
      input.value = value;
      const clear = cell.querySelector(".twm-data-table__filter-clear");
      if (clear) clear.style.display = value ? "" : "none";
      if (focused) input.setSelectionRange(value.length, value.length);
    }
    this._onFilterInputDebounced(colIdx, value);
  }
  _getActiveFilterColIdx() {
    const active = document.activeElement;
    if (!active || !active.classList.contains("twm-data-table__filter-input")) return null;
    const cell = active.closest(".data-table__filter-cell");
    if (!cell) return null;
    const row = cell.parentElement;
    if (!row) return null;
    const cells = Array.from(row.children);
    const idx = cells.indexOf(cell);
    return this._dataIdxOfDom(idx);
  }
  _restoreFilterFocus(colIdx) {
    const filterRow = this._wrapperEl?.querySelector(".twm-data-table__filter-row");
    if (!filterRow) return;
    const cellIdx = this._domIdxOf(colIdx);
    const cell = filterRow.children[cellIdx];
    const input = cell?.querySelector(".twm-data-table__filter-input");
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }
  // ─────────────────────────────────────────────────────────────────
  // Private methods
  // ─────────────────────────────────────────────────────────────────
  /** Run (and forget) a list of removers. */
  _runOffs(offs) {
    for (const off of offs || []) {
      try {
        off?.();
      } catch (_) {
      }
    }
  }
  /**
   * 0.5.0. A render takes `onRowActivate`'s listeners off the body it is
   * replacing ONE TASK LATER, not now. The render may be running INSIDE the
   * very click that is about to open a row — an `onSelectionChange` that calls
   * `setData`, an `onRowClick` that calls `render` — and a listener removed
   * during its own event's dispatch is skipped: the row silently did not
   * open. The event's path was fixed when it was dispatched, so it still
   * reaches the old body, whose listener opens the row that was pressed. The
   * old body is out of the page, so nothing else can reach it meanwhile.
   */
  _retireActivation() {
    const offs = this._activationOffs;
    this._activationOffs = [];
    if (offs.length) setTimeout(() => this._runOffs(offs), 0);
  }
  _cleanup() {
    this._disposers.forEach((dispose) => {
      try {
        dispose?.();
      } catch (_) {
      }
    });
    this._disposers = [];
    this._closeFilterDropdown();
    if (this._filterDebounceTimer) {
      clearTimeout(this._filterDebounceTimer);
      this._filterDebounceTimer = null;
    }
  }
  _detectColumnTypes() {
    const { headers, rows, getColumnType, columnTypes } = this.config;
    const types = [];
    for (let colIdx = 0; colIdx < headers.length; colIdx++) {
      const declared = Array.isArray(columnTypes) ? columnTypes[colIdx] : null;
      if (declared) {
        types.push(declared);
        continue;
      }
      if (getColumnType) {
        types.push(getColumnType(colIdx, rows));
        continue;
      }
      let numericCount = 0;
      let sampleCount = 0;
      const maxSamples = Math.min(10, rows.length);
      for (let i = 0; i < maxSamples; i++) {
        const value = rows[i]?.[colIdx];
        if (value != null && value !== "") {
          sampleCount++;
          if (typeof value === "number" || /^-?[\d,.]+%?$/.test(String(value).trim())) {
            numericCount++;
          }
        }
      }
      types.push(sampleCount > 0 && numericCount / sampleCount > 0.5 ? "num" : "text");
    }
    return types;
  }
  _createPagination() {
    if (this._usesPager070()) return this._createPager070();
    const { rows, pageSize, totalCount: configTotalCount, offset: configOffset, onPageChange, onJumpToRow } = this.config;
    const isServerSide = typeof onPageChange === "function";
    const offset = isServerSide ? configOffset || 0 : this._state.offset;
    const processedRows = isServerSide ? rows : this._getProcessedRows();
    const effectiveTotal = isServerSide ? configTotalCount || rows.length : processedRows.length;
    const unfilteredTotal = isServerSide ? configTotalCount || rows.length : rows.length;
    const isFiltered = !isServerSide && this._state.filters.size > 0;
    const displayedRows = isServerSide ? rows.length : Math.min(pageSize, effectiveTotal - offset);
    const endRow = Math.min(offset + displayedRows, effectiveTotal);
    const totalPages = Math.max(1, Math.ceil(effectiveTotal / pageSize));
    if (totalPages <= 1 && !isFiltered) return this._createExportOnlyStrip();
    const currentPage = Math.floor(offset / pageSize) + 1;
    const hasPrev = offset > 0;
    const hasNext = offset + pageSize < effectiveTotal;
    const el = document.createElement("div");
    el.className = "twm-pagination-controls";
    el.style.cssText = "display:flex; align-items:center; gap:6px; padding:2px 8px; border-bottom:1px solid #2a2a2a; font-size:11px;";
    const info = document.createElement("span");
    info.style.cssText = "color:#aaa; white-space:nowrap;";
    if (effectiveTotal === 0) {
      info.textContent = isFiltered ? `0 of ${unfilteredTotal.toLocaleString()} rows match` : "No rows";
    } else if (isFiltered) {
      info.textContent = `Rows ${offset + 1}\u2013${endRow} of ${effectiveTotal.toLocaleString()} (${unfilteredTotal.toLocaleString()} total)`;
    } else {
      info.textContent = `Rows ${offset + 1}\u2013${endRow} of ${effectiveTotal.toLocaleString()}`;
    }
    const spacer = document.createElement("div");
    spacer.style.flex = "1";
    const handlePageChange = (newOffset) => {
      if (this._stagedRefusal("Turning the page")) return;
      if (isServerSide) {
        this._awaitWithSpinner(onPageChange(newOffset, pageSize));
      } else {
        this._state.offset = newOffset;
        this._savePage();
        this.render();
      }
    };
    const firstBtn = this._createPaginationBtn("first_page", "First page", !hasPrev, () => {
      handlePageChange(0);
    });
    const prevBtn = this._createPaginationBtn("chevron_left", "Previous page", !hasPrev, () => {
      handlePageChange(Math.max(0, offset - pageSize));
    });
    const pageInfo = document.createElement("span");
    pageInfo.style.cssText = "color:#aaa; font-size:10px; min-width:72px; text-align:center;";
    pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
    const nextBtn = this._createPaginationBtn("chevron_right", "Next page", !hasNext, () => {
      handlePageChange(offset + pageSize);
    });
    const lastBtn = this._createPaginationBtn("last_page", "Last page", !hasNext, () => {
      handlePageChange(Math.floor((effectiveTotal - 1) / pageSize) * pageSize);
    });
    const jumpInput = document.createElement("input");
    jumpInput.type = "number";
    jumpInput.className = "twm-pagination-input";
    jumpInput.style.cssText = "width:54px; padding:1px 4px; border:1px solid #444; background:#2a2a2a; color:#ccc; font-size:10px;";
    jumpInput.min = "1";
    jumpInput.max = String(effectiveTotal);
    jumpInput.placeholder = "Row #";
    const jumpBtn = this._createPaginationBtn(null, "Go to row", false, () => {
      const target = Number(jumpInput.value);
      if (Number.isFinite(target) && target >= 1) {
        if (isServerSide && onJumpToRow) {
          onJumpToRow(target - 1);
        } else if (isServerSide) {
          const newOffset = Math.floor((target - 1) / pageSize) * pageSize;
          handlePageChange(newOffset);
        } else {
          this.goToRow(target - 1);
        }
      }
    }, "Go");
    el.appendChild(info);
    el.appendChild(spacer);
    el.appendChild(firstBtn);
    el.appendChild(prevBtn);
    el.appendChild(pageInfo);
    el.appendChild(nextBtn);
    el.appendChild(lastBtn);
    el.appendChild(jumpInput);
    el.appendChild(jumpBtn);
    if (this.config.showExportButton) el.appendChild(this._createExportBtn());
    return el;
  }
  /** The export button: downloadCSV() under the configured file name. */
  _createExportBtn() {
    const name = this.config.exportFilename;
    const filename = (typeof name === "function" ? name(this) : name) || "data.csv";
    const btn = this._createPaginationBtn(
      "download",
      "Download visible rows as CSV",
      false,
      () => this.downloadCSV(filename)
    );
    btn.classList.add("twm-pagination-btn--export");
    return btn;
  }
  /**
   * The strip on a table with one page: nothing, as always, unless the export
   * button needs somewhere to be. Then the button alone, with no page
   * buttons (0.14.1).
   */
  _createExportOnlyStrip() {
    if (!this.config.showExportButton) return null;
    const el = document.createElement("div");
    el.className = "twm-pagination-controls twm-pagination-controls--export-only";
    el.style.cssText = "display:flex; align-items:center; gap:6px; padding:2px 8px; border-bottom:1px solid #2a2a2a; font-size:11px;";
    const spacer = document.createElement("div");
    spacer.style.flex = "1";
    el.append(spacer, this._createExportBtn());
    return el;
  }
  _createPaginationBtn(icon, tooltip, disabled, onClick, textLabel = null) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "hoverbutton twm-pagination-btn twm-has-tooltip";
    btn.setAttribute("data-tooltip", tooltip);
    btn.disabled = disabled;
    btn.style.cssText = "padding:1px 3px; background:transparent; border:1px solid #444; color:#aaa; cursor:pointer; display:flex; align-items:center; justify-content:center; line-height:1;";
    if (disabled) {
      btn.style.opacity = "0.4";
      btn.style.cursor = "not-allowed";
    }
    if (icon) {
      const iconEl = document.createElement("span");
      iconEl.className = "material-symbols-outlined";
      iconEl.style.fontSize = "14px";
      iconEl.textContent = icon;
      btn.appendChild(iconEl);
    } else if (textLabel) {
      btn.textContent = textLabel;
      btn.style.fontSize = "10px";
      btn.style.padding = "1px 6px";
    }
    btn.addEventListener("click", onClick);
    return btn;
  }
  // ── `paging` ────────────────────────────────────────────────────────────
  /** The `paging` config with its defaults, or null when it is not set. */
  _pagingConfig() {
    const p = this.config.paging;
    if (!p || typeof p !== "object") return null;
    const size = Number.isFinite(p.pageSize) && p.pageSize >= 1 ? Math.floor(p.pageSize) : this.config.pageSize;
    if (this.config.dataSource) {
      const src = this._source || { offset: 0, total: null, atLeast: 0, hasMore: false };
      return {
        ...p,
        pageSize: size,
        offset: src.offset || 0,
        held: this.config.rows?.length || 0,
        total: src.total,
        atLeast: src.atLeast || 0,
        hasMore: !!src.hasMore,
        loadMorePx: Number.isFinite(p.loadMorePx) ? p.loadMorePx : PAGING_LOAD_MORE_PX,
        onPage: (offset) => this._sourceGoTo(offset),
        onLoadMore: () => this._sourceLoadMore(),
        onLoadAll: () => this._sourceLoadAll(),
        // The switch is drawn, as in 0.6.2, only for a consumer that
        // listens; the table switches and then tells it.
        onModeChange: typeof p.onModeChange === "function" ? (mode) => this._sourceSetMode(mode) : void 0
      };
    }
    return {
      ...p,
      pageSize: size,
      offset: Number.isFinite(p.offset) && p.offset > 0 ? Math.floor(p.offset) : 0,
      // What the table holds of the source. A consumer whose `rows` carry
      // a row the source does not (a blank line to type into) says so.
      held: Number.isFinite(p.held) ? p.held : this.config.rows?.length || 0,
      hasMore: !!p.hasMore,
      loadMorePx: Number.isFinite(p.loadMorePx) ? p.loadMorePx : PAGING_LOAD_MORE_PX
    };
  }
  /**
   * Which way the rows are shown, and why — `resolvePaging` over this
   * table's facts. `null` without `paging`.
   */
  get pagingState() {
    const p = this._pagingConfig();
    if (!p) return null;
    return resolvePaging({
      mode: p.mode,
      total: p.total,
      atLeast: p.atLeast,
      held: p.offset + p.held,
      hasMore: p.hasMore,
      softLimit: p.softLimit,
      hardLimit: p.hardLimit
    });
  }
  /**
   * Change some `paging` facts — a count that arrived, a mode — and redraw
   * the STRIP only. The rows are not touched: a consumer with new rows
   * renders the table as it always has.
   */
  setPaging(patch = {}) {
    if (!this.config.paging) return;
    const before = this.config.dataSource ? this.pagingState?.mode : null;
    this.config.paging = { ...this.config.paging, ...patch };
    if (before && this.pagingState?.mode !== before) {
      this._sourceLoad({ offset: 0, reason: "mode" });
      return;
    }
    this._refreshPagingStrip();
    this._pagingMaybeLoadMore();
  }
  _refreshPagingStrip() {
    if (!this._wrapperEl) return;
    const next = this._pagingConfig() ? this._createPagingStrip() : null;
    const prev = this._pagingEl;
    if (prev && prev.parentNode === this._wrapperEl) {
      if (next) prev.replaceWith(next);
      else prev.remove();
    } else if (next) {
      this._wrapperEl.appendChild(next);
    }
    this._pagingEl = next;
    this._cellGrid?.staged?.paintFreeze();
  }
  /**
   * Call one of the consumer's paging callbacks. A Promise holds every other
   * paging call back until it settles, and the strip shows the table busy —
   * a second `onLoadMore` fired by the next scroll event would fetch the same
   * page twice.
   */
  _pagingCall(kind, fn, ...args) {
    if (typeof fn !== "function" || this._pagingBusy) return;
    if (this._stagedRefusal(`paging ${kind}`)) return;
    let result;
    try {
      result = fn(...args);
    } catch (err) {
      console.error(`[DataTable] paging ${kind} threw`, err);
      return;
    }
    if (result && typeof result.then === "function") {
      this._pagingBusy = kind;
      this._refreshPagingStrip();
      const settle = () => {
        if (this._pagingBusy !== kind) return;
        this._pagingBusy = null;
        if (this._pagingEl?.isConnected) this._refreshPagingStrip();
      };
      result.then(settle, (err) => {
        console.error(`[DataTable] paging ${kind} failed`, err);
        settle();
      });
    }
  }
  /**
   * Scrolling: ask for the next rows when the body is near its end — or does
   * not fill its box, which no scroll can ever change. Never past the hard
   * limit, never in pages, never with no layout (a hidden table's box is 0px
   * tall, and "0 ≤ 0" would ask for the whole source).
   */
  _pagingMaybeLoadMore() {
    const p = this._pagingConfig();
    if (!p || !p.hasMore || this._pagingBusy) return;
    if (this._cellGrid?.staged?.freezeReason()) return;
    if (this.config.dataSource && this._source?.inFlight) return;
    const state = this.pagingState;
    if (state.mode !== "scroll" || p.held >= state.hardLimit) return;
    const wrap = this._tableWrapEl;
    if (!wrap?.isConnected || !(wrap.clientHeight > 0)) return;
    const remaining = wrap.scrollHeight - wrap.scrollTop - wrap.clientHeight;
    if (remaining >= p.loadMorePx) return;
    this._pagingCall("more", p.onLoadMore);
  }
  /** The strip under the body, or null when it would say nothing. */
  _createPagingStrip() {
    const p = this._pagingConfig();
    const state = this.pagingState;
    const { mode, forced, exact, known } = state;
    const busy = this._pagingBusy;
    const n = (x) => Number(x).toLocaleString();
    const pageSize = p.pageSize;
    const held = p.held;
    const total = exact ? p.total : null;
    const morePages = p.offset > 0 || p.hasMore || exact && total > held;
    if (!forced && mode === "scroll" && !p.hasMore && held <= pageSize) return null;
    if (!forced && mode === "pages" && !morePages) return null;
    const el = document.createElement("div");
    el.className = `twm-dt-paging twm-dt-paging--${mode}`;
    el.setAttribute("role", "navigation");
    el.setAttribute("aria-label", "Rows");
    if (busy) el.classList.add("twm-dt-paging--busy");
    const info = document.createElement("span");
    info.className = "twm-dt-paging__info";
    el.appendChild(info);
    if (mode === "pages") {
      const from = held ? p.offset + 1 : p.offset;
      const to = p.offset + held;
      let of = "";
      if (exact) of = ` of ${n(total)}`;
      else if (known > to) of = ` of more than ${n(known - 1)}`;
      info.textContent = held ? `Rows ${n(from)}\u2013${n(to)}${of}` : "No rows on this page";
      const pn = this._pageNav({ offset: p.offset, held, total, hasMore: p.hasMore, pageSize });
      const { hasPrev, hasNext } = pn;
      const lastOffset = exact && total > 0 ? pn.lastOffset : null;
      const go = (offset) => (ev) => {
        if (!ev?.currentTarget?.disabled) this._pagingCall("page", p.onPage, offset, pageSize);
      };
      const nav = document.createElement("span");
      nav.className = "twm-dt-paging__nav";
      const off = !!busy || typeof p.onPage !== "function";
      const words = this._usesPager070();
      const button = (icon, name, tip, disabled, onClick, refusal = null) => words ? this._pagerButton(icon, name, tip, disabled, onClick, refusal) : this._createPaginationBtn(icon, tip, disabled, onClick);
      nav.append(
        button("first_page", "first", "First page", off || !hasPrev, go(0)),
        button(
          "chevron_left",
          "prev",
          "Previous page",
          off || !hasPrev,
          go(Math.max(0, p.offset - pageSize))
        )
      );
      const page = document.createElement("span");
      page.className = "twm-dt-paging__page";
      page.textContent = exact ? `Page ${n(pn.page)} of ${n(pn.pages)}` : `Page ${n(pn.page)}`;
      nav.append(
        page,
        button(
          "chevron_right",
          "next",
          "Next page",
          off || !hasNext,
          go(p.offset + pageSize)
        ),
        // The last page needs the exact count: without it there is no
        // offset to go to, and the button says so by being off.
        words ? button(
          "last_page",
          "last",
          "Last page",
          off || !hasNext || lastOffset === null,
          go(lastOffset),
          pn.lastRefusal
        ) : button(
          "last_page",
          "last",
          lastOffset === null ? "Last page (the total is not known)" : "Last page",
          off || !hasNext || lastOffset === null,
          go(lastOffset)
        )
      );
      el.appendChild(nav);
    } else {
      if (exact && total > held) info.textContent = `${n(held)} of ${n(total)} rows`;
      else if (p.hasMore) info.textContent = `${n(held)} rows, more to come`;
      else info.textContent = `${n(held)} rows`;
      if (p.hasMore && typeof p.onLoadAll === "function") {
        const all = document.createElement("button");
        all.type = "button";
        all.className = "twm-dt-paging__all";
        all.textContent = busy === "all" ? "Loading\u2026" : exact ? `Load all ${n(total)} rows` : "Load all rows";
        all.disabled = !!busy;
        all.addEventListener("click", () => {
          if (!all.disabled) this._pagingCall("all", p.onLoadAll);
        });
        el.appendChild(all);
      }
    }
    const spacer = document.createElement("span");
    spacer.className = "twm-dt-paging__spacer";
    el.appendChild(spacer);
    const why = forced ? `More than ${n(state.softLimit)} rows, so they are shown in pages.` : null;
    if (why) {
      const note = document.createElement("span");
      note.className = "twm-dt-paging__note";
      note.textContent = why;
      el.appendChild(note);
    }
    if (typeof p.onModeChange === "function") {
      const group = document.createElement("span");
      group.className = "twm-dt-paging__modes";
      group.setAttribute("role", "group");
      group.setAttribute("aria-label", "Show rows");
      for (const [value, label] of [["pages", "Pages"], ["scroll", "Scroll"]]) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "twm-dt-paging__mode";
        b.dataset.mode = value;
        b.textContent = label;
        const pressed = mode === value;
        b.setAttribute("aria-pressed", String(pressed));
        b.disabled = !!busy || value === "scroll" && forced;
        if (value === "scroll" && forced) b.title = why;
        b.addEventListener("click", () => {
          if (!b.disabled && mode !== value) this._pagingCall("mode", p.onModeChange, value);
        });
        group.appendChild(b);
      }
      el.appendChild(group);
    }
    return el;
  }
  _createTable() {
    const { headers, rows, pageSize, sortable, filterable, showRowNumbers, readonly, getHeaderIcon } = this.config;
    const { sortColumn, sortAscending } = this._state;
    const configOffset = this.config.dataSource ? 0 : this.config.offset;
    const isServerSide = this._isServerSide();
    const processedRows = isServerSide ? rows : this._getProcessedRows();
    const offset = isServerSide ? configOffset || 0 : this._state.offset;
    const pageRows = isServerSide || !this.config.pagination || this._pagingConfig() ? processedRows : processedRows.slice(offset, offset + pageSize);
    this._pageSpan = {
      start: pageRows === processedRows ? 0 : offset,
      count: pageRows.length
    };
    const table = document.createElement("table");
    table.className = this._tableClassName();
    table.tabIndex = 0;
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    if (this._gutter) headerRow.appendChild(this._buildSelectHead());
    if (showRowNumbers) {
      const th = document.createElement("th");
      th.className = "num";
      th.textContent = "#";
      headerRow.appendChild(th);
    }
    this._shownColumns().forEach((colIdx) => {
      const header = headers[colIdx];
      const th = document.createElement("th");
      th.className = this._columnTypes[colIdx] || "text";
      if (sortable) {
        th.classList.add("sortable");
        th.style.cursor = "pointer";
      }
      if (getHeaderIcon) {
        const iconInfo = getHeaderIcon(header, colIdx);
        if (iconInfo) {
          const iconSpan = document.createElement("span");
          iconSpan.className = "material-symbols-outlined twm-header-icon twm-has-tooltip";
          iconSpan.setAttribute("data-tooltip", iconInfo.title || "");
          iconSpan.style.cssText = "font-size:16px; vertical-align:middle; margin-right:4px; opacity:0.7;";
          iconSpan.textContent = iconInfo.icon;
          th.appendChild(iconSpan);
        }
      }
      th.appendChild(document.createTextNode(header));
      if (sortable) {
        const sortIcon = document.createElement("span");
        sortIcon.className = "material-symbols-outlined twm-sort-icon";
        sortIcon.style.cssText = "font-size:14px; margin-left:4px; opacity:0.5;";
        if (sortColumn === colIdx) {
          sortIcon.textContent = sortAscending ? "arrow_upward" : "arrow_downward";
          sortIcon.style.opacity = "1";
        } else {
          sortIcon.textContent = "unfold_more";
        }
        th.appendChild(sortIcon);
        th.addEventListener("click", () => this.sortBy(colIdx));
      }
      th.title = header;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    if (filterable) {
      const filterRow = this._createFilterRow(headers);
      thead.appendChild(filterRow);
    }
    const virtual = this._isVirtual();
    if (virtual) {
      table.classList.add("twm-dt--virtual");
      table.appendChild(this._createColgroup());
    }
    table.appendChild(thead);
    const globalOf = (localIdx) => {
      const processedIdx = offset + localIdx;
      return isServerSide ? (configOffset || 0) + localIdx : this._processedIndexMap?.[processedIdx] ?? processedIdx;
    };
    this._positionBase = this.config.dataSource ? this._source?.offset || 0 : isServerSide ? configOffset || 0 : this.config.pagination ? offset : 0;
    const paged = this.config.dataSource ? null : this._pagingConfig();
    if (paged && Number.isFinite(paged.offset)) this._positionBase += paged.offset;
    const tbody = document.createElement("tbody");
    table.appendChild(tbody);
    this._tbodyEl = tbody;
    if (virtual) {
      this._virtInit(tbody, pageRows, globalOf, {
        serverSide: isServerSide,
        offset,
        configOffset: configOffset || 0
      });
    } else {
      pageRows.forEach((row, localIdx) => {
        const tr = this._buildBodyRow(row, globalOf(localIdx), localIdx);
        tbody.appendChild(tr);
        if (this._detailOn()) this._appendDetailIfOpen(tr, null);
      });
    }
    return table;
  }
  /** One body row, fully built. The ONE place a `<tr>` for a row is made, so
   *  the full render and the virtual window cannot drift apart: a row drawn
   *  on scroll is the same row a render would have drawn. */
  _buildBodyRow(row, globalIdx, localIdx) {
    const { showRowNumbers } = this.config;
    const tr = document.createElement("tr");
    tr.__rowIndex = globalIdx;
    tr.__position = (this._positionBase || 0) + localIdx;
    tr.className = "data-preview-row";
    if (this._cellGrid) tr.__cellPos = (this._pageSpan?.start || 0) + localIdx;
    if (this._state.selected.has(globalIdx) && !this._cellGrid) {
      tr.classList.add("selected");
    }
    this._decorateRow(tr, row, globalIdx);
    if (this._virt) tr.classList.toggle("twm-dt-row--alt", localIdx % 2 === 1);
    this._fillRowCells(tr, row, globalIdx, showRowNumbers);
    if (this.config.onRowClick) {
      tr.addEventListener("click", (ev) => {
        this.config.onRowClick(globalIdx, row, ev);
      });
    }
    if (this.config.onRowContextMenu) {
      tr.addEventListener("contextmenu", (ev) => {
        this.config.onRowContextMenu(globalIdx, row, ev);
      });
    }
    return tr;
  }
  // ─────────────────────────────────────────────────────────────────
  // C10 — the virtual window
  // ─────────────────────────────────────────────────────────────────
  //
  // ══ WHAT IT IS ═══════════════════════════════════════════════════
  //
  // Only the rows near the viewport are in the DOM: a TOP SPACER row whose
  // height is every row above the window, the window's rows, and a BOTTOM
  // SPACER for everything below it. The scrollbar is therefore sized to the
  // whole table and every row is reachable, while the DOM stays bounded by
  // the viewport — a thousand-row page (or fifty of them) costs the same
  // few dozen `<tr>`s as one screenful.
  //
  // ══ WHAT IT PROMISES ═════════════════════════════════════════════
  //
  //  - A row that stays in the window is NEVER MOVED OR REBUILT when the
  //    window slides. Rows leave from the edges and arrive at the edges; the
  //    ones in the middle are the same nodes. An open editor, a focused
  //    cell, a hover — anything living in a row that is still on screen —
  //    survives a scroll. (Moving a node that holds focus blurs it, which in
  //    an editable grid is a commit nobody asked for.)
  //  - Column widths come from a `<colgroup>`, so the first row changing
  //    moves nothing (see `_createTable`).
  //  - A spacer is in the DOM only while it has a height. A table that fits
  //    in its window has exactly the DOM it had without `virtualize`.
  //  - `onRowsRendered` hears about every row added after `render()`, and
  //    every row taken out.
  //
  // ══ WHAT IT ASSUMES ══════════════════════════════════════════════
  //
  // That a row's height is knowable without drawing it: `baseHeight`,
  // measured from a real row, or what `virtualRowHeight` says. A row that
  // wraps to two lines is drawn correctly and is simply mis-counted in the
  // spacer arithmetic by the difference — the overscan absorbs that.
  _isVirtual() {
    return !!this.config.virtualize;
  }
  _virtOptions() {
    const v = this.config.virtualize;
    const o = v && typeof v === "object" ? v : {};
    return {
      overscan: Number.isFinite(o.overscan) && o.overscan >= 0 ? Math.floor(o.overscan) : 20,
      rowHeight: Number.isFinite(o.rowHeight) && o.rowHeight > 0 ? o.rowHeight : 24
    };
  }
  /** One `<col>` per DOM column (the row-number column included), carrying
   *  any width already pinned for it, so a re-render starts at the widths it
   *  had rather than at a content-sized frame that then snaps. */
  _createColgroup() {
    const n = this._domColCount();
    const colgroup = document.createElement("colgroup");
    for (let i = 0; i < n; i++) {
      const col = document.createElement("col");
      const w = i < this._lead().select ? this._selectColWidth() : this._colWidths?.[i];
      if (w != null && this._colWidthsSig === this._colSig()) col.style.width = `${w}px`;
      colgroup.appendChild(col);
    }
    this._colgroupEl = colgroup;
    return colgroup;
  }
  /** The `<col>`s, when this table has them. */
  _cols() {
    return this._virt && this._colgroupEl ? this._colgroupEl.children : null;
  }
  _virtInit(tbody, rows, globalOf, { serverSide, offset, configOffset }) {
    const { overscan, rowHeight } = this._virtOptions();
    const spacer = (edge) => {
      const tr = document.createElement("tr");
      tr.className = `twm-dt-spacer twm-dt-spacer--${edge}`;
      tr.setAttribute("aria-hidden", "true");
      const td = document.createElement("td");
      td.colSpan = Math.max(1, this._domColCount());
      td.style.cssText = "padding:0;border:0;height:0;min-width:0;max-width:none;";
      tr.appendChild(td);
      return tr;
    };
    const filler = document.createElement("tr");
    filler.className = "twm-dt-spacer twm-dt-spacer--parity";
    filler.setAttribute("aria-hidden", "true");
    filler.hidden = true;
    this._virt = {
      tbody,
      rows,
      globalOf,
      serverSide,
      offset,
      configOffset,
      overscan,
      base: this._virtBase || rowHeight,
      heights: null,
      offsets: null,
      start: 0,
      end: 0,
      map: /* @__PURE__ */ new Map(),
      top: spacer("top"),
      bottom: spacer("bottom"),
      filler
    };
    this._virtComputeOffsets();
    const guess = this.container?.clientHeight || 0;
    this._virtUpdate({ force: true, notify: false, viewport: guess || void 0, top: 0 });
  }
  /** Heights and their running sum. `offsets[i]` is where row `i` starts;
   *  `offsets[n]` is the whole table. O(n), and rerun only when a height can
   *  have changed — a new measurement, or `refreshVirtualLayout()`. */
  _virtComputeOffsets() {
    const v = this._virt;
    if (!v) return;
    const n = v.rows.length;
    const heights = new Float64Array(n);
    const offsets = new Float64Array(n + 1);
    const fn = typeof this.config.virtualRowHeight === "function" ? this.config.virtualRowHeight : null;
    const details = this._detailOn() && this._expanded.size > 0;
    let y = 0;
    for (let i = 0; i < n; i++) {
      let h = v.base;
      if (fn) {
        const asked = fn(v.globalOf(i), v.base);
        h = Number.isFinite(asked) && asked > 0 ? asked : 0;
      }
      if (details && h > 0) h += this._detailHeightOf(v.rows[i], v.globalOf(i), v.base);
      heights[i] = h;
      offsets[i] = y;
      y += h;
    }
    offsets[n] = y;
    v.heights = heights;
    v.offsets = offsets;
  }
  /** The row whose span contains `y`: the LAST `i` with `offsets[i] <= y`,
   *  which steps over rows of zero height at the same offset. */
  _virtIndexAt(y) {
    const v = this._virt;
    const n = v.rows.length;
    if (n === 0) return 0;
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = lo + hi + 1 >> 1;
      if (v.offsets[mid] <= y) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }
  /**
   * Measure the rows that are DRAWN — the median of up to 64 of them. Client
   * pixels, so the zoom is divided back out (`_measureNaturalWidths` explains
   * why), and NOT `offsetHeight`, which is rounded: 21 for a 21.19px row is a
   * 1,100px error over 6,000 rows.
   *
   * 0.6.3: IT USED TO MEASURE ONE ROW, ONCE, AT RENDER, and trust it for the
   * life of the table. A row measured at a bad moment — a box not yet laid
   * out at its width, a font not yet loaded — set every row's height: a
   * Tables grid drawing 22.8px rows was found holding a 134px estimate, so the
   * window took a 650px viewport for five rows, drew rows 1–35 and left the
   * rest of the box blank spacer while the reader scrolled. Now it is asked
   * again on every window update (`_virtUpdate`), on a resize and once the
   * column widths are fixed, and corrects itself the first time real rows
   * are on screen. The first measure is exact; after that a change has to be
   * larger than half a pixel, so rows of mixed heights cannot make the
   * offsets move under the reader on every scroll.
   *
   * 0.7.0 `rowDetail`: AN OPEN DETAIL IS PART OF ITS ROW'S HEIGHT, and is
   * measured at the same moments. It is never one of the rows the median is
   * taken from (the window's map holds the rows, not their details), so a
   * tall detail cannot pass for a row; it is read on its own, into the
   * row's height — and read again here, because a detail's height moves for
   * the same reasons a row's does (the column widths fixed, a font), and
   * more: it wraps across the whole table's width.
   *
   * @returns {boolean} whether the heights changed (the offsets are recomputed).
   */
  _virtMeasure() {
    const v = this._virt;
    if (!v) return false;
    const zoom = this._tableEl?.currentCSSZoom || 1;
    const heights = [];
    for (const tr of v.map.values()) {
      if (!tr.isConnected || tr.hidden) continue;
      const h = tr.getBoundingClientRect().height / zoom;
      if (h > 0) heights.push(h);
      if (heights.length >= 64) break;
    }
    const details = this._detailOn() && this._expanded.size > 0 && this._virtReadDetailHeights(v.map.values());
    let base = false;
    if (heights.length) {
      heights.sort((a, b) => a - b);
      const h = heights[heights.length >> 1];
      const tolerance = v.measured ? 0.5 : 0.01;
      v.measured = true;
      if (Math.abs(h - v.base) > tolerance) {
        v.base = h;
        this._virtBase = h;
        base = true;
      }
    }
    if (!base && !details) return false;
    this._virtComputeOffsets();
    return true;
  }
  /** Measure again, and redraw the window when the heights moved. */
  _virtRemeasure() {
    if (this._virtMeasure()) this._virtUpdate({ force: true });
  }
  /**
   * Slide the window to wherever the scroll box now is.
   *
   * HYSTERESIS, so a scroll of one pixel does not rebuild anything: the
   * window is redrawn only when the visible rows come within a quarter of the
   * overscan of either end of what is drawn, and it is then redrawn with the
   * full overscan on both sides.
   *
   * @param {object}  [o]
   * @param {boolean} [o.force]    redraw even inside the hysteresis band.
   * @param {boolean} [o.notify]   report added and removed rows to `onRowsRendered`.
   * @param {number}  [o.top]      the scroll offset to draw for, instead of
   *   reading one back — `scrollToRow` passes the offset it has just set,
   *   which a DOM with no layout would read back as 0.
   * @param {number}  [o.viewport] the viewport height, likewise.
   * @returns {HTMLElement[]} the rows added.
   */
  _virtUpdate({ force = false, notify = true, top = null, viewport = null, measure = true } = {}) {
    const v = this._virt;
    if (!v || !v.offsets) return [];
    if (measure && this._virtMeasure()) force = true;
    const n = v.rows.length;
    const wrap = this._tableWrapEl;
    const view = viewport || wrap?.clientHeight || VIRTUAL_FALLBACK_VIEWPORT_PX;
    const scrollTop = top ?? (wrap?.scrollTop || 0);
    const vs = this._virtIndexAt(scrollTop);
    const ve = Math.min(n, this._virtIndexAt(scrollTop + view) + 1);
    if (!force && v.end > v.start) {
      const margin = Math.max(1, Math.floor(v.overscan / 4));
      const lowOk = v.start === 0 || vs >= v.start + margin;
      const highOk = v.end === n || ve <= v.end - margin;
      if (lowOk && highOk) return [];
    }
    const start = Math.max(0, vs - v.overscan);
    const end = Math.min(n, ve + v.overscan);
    const removed = [];
    const added = this._virtRender(start, end, removed);
    if (added.length || removed.length) {
      if (added[0]?.isConnected && this._tableEl?.style.tableLayout === "fixed") {
        this._updateCellTooltips(added);
      }
      if (notify) {
        try {
          this.config.onRowsRendered?.({ rows: added, removed });
        } catch (err) {
          console.error("[DataTable] onRowsRendered threw", err);
        }
      }
      if (measure && added.length && this._virtMeasure()) {
        return added.concat(this._virtUpdate({
          force: true,
          notify,
          top,
          viewport,
          measure: false
        }));
      }
    }
    return added;
  }
  /** Make the DOM hold exactly the drawable rows of `[start, end)`, without
   *  moving a row that is already there. See the promises above. */
  _virtRender(start, end, removed = null) {
    const v = this._virt;
    const tbody = v.tbody;
    const want = [];
    for (let i = start; i < end; i++) if (v.heights[i] > 0) want.push(i);
    const wanted = new Set(want);
    for (const [i, tr] of v.map) {
      if (!wanted.has(i)) {
        this._cellGrid?.rowLeaving(tr);
        tr.remove();
        this._removeDetailPieces(tr);
        v.map.delete(i);
        removed?.push(tr);
      }
    }
    v.start = start;
    v.end = end;
    this._virtSpacers();
    const added = [];
    let ref = v.bottom.isConnected ? v.bottom : null;
    for (let k = want.length - 1; k >= 0; k--) {
      const i = want[k];
      const have = v.map.get(i);
      if (have) {
        ref = have;
        continue;
      }
      const tr = this._buildBodyRow(v.rows[i], v.globalOf(i), i);
      v.map.set(i, tr);
      tbody.insertBefore(tr, ref);
      if (this._detailOn()) this._appendDetailIfOpen(tr, ref);
      ref = tr;
      added.push(tr);
    }
    added.reverse();
    if (this._detailOn() && added.length) this._virtMeasureDetails(added);
    return added;
  }
  /**
   * Size the two spacers, and put each in the DOM only while it has a height.
   *
   * AND KEEP THE STRIPE. `tr:nth-child(even)` stripes by POSITION, and in a
   * full render row `i` is child `i + 1`. Here the first drawn row is preceded
   * by the top spacer, so its position is off by one — and by a different one
   * each time the window's start changes parity, which strobes every stripe
   * on the screen as you scroll. A hidden filler row after the spacer, present
   * exactly when `start` is even, puts the parity back: a `display: none` row
   * is still a child, and so still counted by `nth-child`.
   */
  _virtSpacers() {
    const v = this._virt;
    const n = v.rows.length;
    const above = v.offsets[v.start];
    const below = v.offsets[n] - v.offsets[v.end];
    const tbody = v.tbody;
    if (above > 0) {
      v.top.firstChild.style.height = `${above}px`;
      if (tbody.firstChild !== v.top) tbody.insertBefore(v.top, tbody.firstChild);
      const needFiller = v.start % 2 === 0;
      if (needFiller && v.top.nextSibling !== v.filler) v.top.after(v.filler);
      else if (!needFiller) v.filler.remove();
    } else {
      v.top.remove();
      v.filler.remove();
    }
    if (below > 0) {
      v.bottom.firstChild.style.height = `${below}px`;
      if (tbody.lastChild !== v.bottom) tbody.appendChild(v.bottom);
    } else {
      v.bottom.remove();
    }
  }
  /**
   * Recompute every row's height and redraw the window. For an embedder whose
   * `virtualRowHeight` answer has changed — a group folded, a header added.
   * A no-op on a table that is not virtual.
   */
  refreshVirtualLayout() {
    if (!this._virt) return;
    this._virtMeasure();
    this._virtComputeOffsets();
    this._virtUpdate({ force: true });
  }
  /** The element that scrolls the body. Read-only; the table owns it. */
  get scrollElement() {
    return this._tableWrapEl || null;
  }
  /** The `<tr>` drawing row `rowIndex` (the `__rowIndex` space), or null when
   *  it is not in the DOM — outside the window, on another page, or hidden. */
  getRowElement(rowIndex) {
    const v = this._virt;
    if (v) {
      const local = this._virtLocalOf(rowIndex);
      return local < 0 ? null : v.map.get(local) || null;
    }
    const tbody = this._tbodyEl;
    if (!tbody) return null;
    for (const tr of tbody.children) if (tr.__rowIndex === rowIndex) return tr;
    return null;
  }
  /** Keep the window's row list and `config.rows` in step for one row. They
   *  are the same array in server-side mode; in client mode the window reads
   *  the filtered-and-sorted copy, which holds its own reference. */
  _virtSetRow(rowIndex, row) {
    const v = this._virt;
    if (!v) return;
    if (Array.isArray(this.config.rows) && rowIndex >= 0 && rowIndex < this.config.rows.length) {
      this.config.rows[rowIndex] = row;
    }
    const local = this._virtLocalOf(rowIndex);
    if (local >= 0) v.rows[local] = row;
  }
  /** `__rowIndex` → position in the window's row list, or -1. */
  _virtLocalOf(rowIndex) {
    const v = this._virt;
    if (!v) return -1;
    let local;
    if (v.serverSide) local = rowIndex - v.configOffset;
    else {
      const map = this._processedIndexMap;
      const processed = map ? map.indexOf(rowIndex) : rowIndex;
      local = processed < 0 ? -1 : processed - v.offset;
    }
    return local >= 0 && local < v.rows.length ? local : -1;
  }
  /**
   * Scroll the body so row `rowIndex` is on screen, drawing it if it was not,
   * and return its `<tr>` (null when it cannot be shown: another page, or a
   * row the embedder hides). Works with or without `virtualize`.
   *
   * @param {number} rowIndex  in the `__rowIndex` space.
   * @param {{block?: 'nearest'|'center'|'start'}} [opts]
   */
  scrollToRow(rowIndex, { block = "nearest" } = {}) {
    const wrap = this._tableWrapEl;
    const v = this._virt;
    if (!v) {
      const tr = this.getRowElement(rowIndex);
      if (!tr || !wrap) return tr;
      const zoom = this._tableEl?.currentCSSZoom || 1;
      const box = wrap.getBoundingClientRect();
      const r = tr.getBoundingClientRect();
      const rowTop = (r.top - box.top) / zoom + wrap.scrollTop;
      const rowH = r.height / zoom;
      const target2 = this._scrollTarget(
        rowTop,
        rowH,
        wrap.scrollTop,
        wrap.clientHeight,
        block
      );
      if (target2 !== wrap.scrollTop) wrap.scrollTop = target2;
      return tr;
    }
    const local = this._virtLocalOf(rowIndex);
    if (local < 0 || !(v.heights[local] > 0)) return null;
    const view = wrap?.clientHeight || VIRTUAL_FALLBACK_VIEWPORT_PX;
    const current = wrap?.scrollTop || 0;
    let target = this._scrollTarget(
      v.offsets[local],
      v.heights[local],
      current,
      view,
      block
    );
    target = Math.max(0, Math.min(target, Math.max(0, v.offsets[v.rows.length] - view)));
    if (wrap && Math.abs(target - current) >= 1) wrap.scrollTop = target;
    this._virtUpdate({ top: Math.abs(target - current) >= 1 ? target : current });
    return v.map.get(local) || null;
  }
  _scrollTarget(rowTop, rowH, current, view, block) {
    if (block === "start") return rowTop;
    if (block === "center") return rowTop - Math.max(0, (view - rowH) / 2);
    if (rowTop < current) return rowTop;
    if (rowTop + rowH > current + view) return rowTop + rowH - view;
    return current;
  }
  /** The first body row that draws a row of data — never a spacer, and never
   *  a row an embedder injected (a group header spans every column with ONE
   *  cell, so measuring it would report one column). */
  _firstBodyRow() {
    const tbody = this._tableEl?.querySelector?.("tbody");
    if (!tbody) return null;
    for (const tr of tbody.children) {
      if (tr.__rowIndex !== void 0) return tr;
    }
    return null;
  }
  /** Build (or rebuild) one row's cells in place.
   *
   *  Extracted from the body loop so that `updateRow` and the initial
   *  render share ONE cell-building path. Two paths would drift, and the
   *  drift would show as a cell that renders differently after a live
   *  update than it did on load. */
  _fillRowCells(tr, row, globalIdx, showRowNumbers) {
    tr.replaceChildren();
    if (this._gutter) {
      const td = document.createElement("td");
      td.className = "twm-dt-select-cell";
      const box = document.createElement("input");
      box.type = "checkbox";
      box.className = "twm-dt-select-box";
      box.tabIndex = -1;
      box.checked = this._state.selected.has(globalIdx);
      box.setAttribute("aria-label", "Select row");
      td.appendChild(box);
      tr.appendChild(td);
    }
    if (showRowNumbers) {
      const td = document.createElement("td");
      td.className = "num";
      const byPosition = this.config.showRowNumbers === "position" && Number.isInteger(tr.__position);
      td.textContent = String((byPosition ? tr.__position : globalIdx) + 1);
      tr.appendChild(td);
    }
    const { cellClass, nullDisplay } = this.config;
    const diff = this._diffOf(row, globalIdx);
    const gap = diff?.status === "gap";
    const changedCells = diff?.cells ? diff.cells instanceof Set ? diff.cells : new Set(diff.cells) : null;
    for (const colIdx of this._rowColumns(row.length)) {
      const td = document.createElement("td");
      td.className = this._columnTypes[colIdx] || "text";
      if (this._cellGrid) td.__colIdx = colIdx;
      const value = row[colIdx];
      let handled = false;
      if (gap) {
        td.classList.add("twm-dt-diff__gap");
        tr.appendChild(td);
        continue;
      }
      if (changedCells?.has(colIdx)) td.classList.add("twm-dt-diff__cell--changed");
      if (this.config.renderCell) {
        handled = !!this.config.renderCell(td, value, colIdx, globalIdx, row);
        if (!handled) {
          td.textContent = this._formatValue(value, colIdx);
        }
      } else {
        td.textContent = this._formatValue(value, colIdx);
      }
      if (!handled && value == null && nullDisplay != null) {
        td.classList.add("twm-dt-cell--null");
      }
      if (typeof cellClass === "function") {
        this._addClasses(td, cellClass(value, colIdx, row, globalIdx));
      }
      if (colIdx === 0 && typeof this.config.rowIcon === "function") {
        this._prependRowIcon(td, this.config.rowIcon(row, globalIdx));
      }
      if (colIdx === 0 && this._detailOn()) this._prependDetailToggle(td, tr, row, globalIdx);
      if (this.config.onCellContextMenu) {
        const cellColIdx = colIdx;
        td.addEventListener("contextmenu", (ev) => {
          this.config.onCellContextMenu(
            cellColIdx,
            globalIdx,
            value,
            td,
            ev
          );
        });
      }
      tr.appendChild(td);
    }
    this._colGroups()?.fillRow(tr);
    this._crosstab()?.fillRow(tr);
    this._cellGrid?.decorateRow(tr);
  }
  /** Re-render ONE row in place, preserving everything around it.
   *
   *  `render()` rebuilds the entire `<tbody>`, which takes the scroll
   *  position, any open editor, the keyboard focus and the measured column
   *  widths with it. That is fine for a sort or a page change and wrong for
   *  a single-cell commit or a live update arriving over a socket — the
   *  common case in an editable grid, where a full rebuild once per keystroke
   *  is both visible and destructive.
   *
   *  What survives, by construction:
   *   - scroll position, because the tbody is not replaced;
   *   - the separately-rendered thead/tbody column widths, because the
   *     explicit widths live on the header cells and on the FIRST body row,
   *     and all three of the properties `_setCellWidth` writes are re-applied
   *     here when that first row is the one being replaced;
   *   - selection, because the `selected` class is recomputed from the
   *     selection set rather than carried on the old element;
   *   - keyboard focus, because the focused element's position is recorded
   *     before the replace and restored after.
   *
   *  STORY-0003: on the row an open cell editor is in, the data is stored
   *  now and the row is drawn when the editor closes (true is returned).
   *
   *  @param {number} index   row index as tracked by `tr.__rowIndex`
   *  @param {any[]}  row     the new cell values
   *  @returns {boolean}      false when the row is not currently rendered
   *                          (it is on another page, or outside the render
   *                          window) — which is NOT an error: the caller has
   *                          nothing to update on screen.
   */
  updateRow(index, row) {
    const tbody = this._tbodyEl;
    if (!tbody) return false;
    let tr = null;
    for (const candidate of tbody.children) {
      if (candidate.__rowIndex === index) {
        tr = candidate;
        break;
      }
    }
    if (!tr) {
      if (this._virt) this._virtSetRow(index, row);
      return false;
    }
    if (Array.isArray(this.config.rows) && this.config.rows[index]) {
      this.config.rows[index] = row;
    }
    if (this._virt) this._virtSetRow(index, row);
    if (this._cellGrid?.holdRow(tr, index)) return true;
    const active = document.activeElement;
    let focusedCol = -1;
    if (active && tr.contains(active)) {
      focusedCol = Array.prototype.indexOf.call(tr.children, active.closest("td"));
    }
    const isFirstRow = tr === tbody.firstElementChild;
    const widths = isFirstRow ? Array.prototype.map.call(tr.children, (td) => ({
      width: td.style.width,
      minWidth: td.style.minWidth,
      maxWidth: td.style.maxWidth
    })) : null;
    const showRowNumbers = this.config.showRowNumbers !== false && !!tr.querySelector(":scope > td.num");
    this._fillRowCells(tr, row, index, showRowNumbers);
    if (widths) {
      widths.forEach((saved, i) => {
        const cell = tr.children[i];
        if (!saved.width || !cell) return;
        cell.style.width = saved.width;
        cell.style.minWidth = saved.minWidth;
        cell.style.maxWidth = saved.maxWidth;
      });
    }
    tr.classList.toggle("selected", this._state?.selected?.has(index) === true && !this._cellGrid);
    this._decorateRow(tr, row, index);
    if (this._detailOn()) this._redrawDetail(tr);
    if (focusedCol >= 0 && tr.children[focusedCol]) {
      tr.children[focusedCol].focus?.();
    }
    return true;
  }
  // ─────────────────────────────────────────────────────────────────
  // 0.7.0 — a row's detail (#26)
  // ─────────────────────────────────────────────────────────────────
  //
  // A detail is TWO rows after its row: the detail itself (one cell across
  // every column) and a hidden filler. The filler is the stripe: rows are
  // striped by `tr:nth-child(even)`, a question about POSITION, and one extra
  // row would flip the stripe of every row below an open detail. Two keep
  // the parity — the trick `_virtSpacers` already plays for the window.
  //
  // Neither row has a `__rowIndex`, so everything that walks the body for
  // rows of data (selection, the open mark, `_firstBodyRow`, `getRowElement`,
  // the activation and the copy menu) steps over them as it steps over a
  // spacer.
  _detailOn() {
    return typeof this.config.rowDetail === "function";
  }
  _rowHasDetail(row, rowIdx) {
    const fn = this.config.hasRowDetail;
    if (typeof fn !== "function") return true;
    try {
      return !!fn(row, rowIdx);
    } catch (err) {
      console.error("[DataTable] hasRowDetail threw", err);
      return false;
    }
  }
  /** The toggle: a real `<button>` (so Enter and Space work on it, and it is
   *  a control `onRowActivate` leaves alone), its glyph drawn by CSS so the
   *  cell's text, its tooltip and a copy stay the cell's own. */
  _prependDetailToggle(td, tr, row, rowIdx) {
    if (!this._rowHasDetail(row, rowIdx)) {
      const gap = document.createElement("span");
      gap.className = "twm-dt-detail-toggle-gap";
      gap.setAttribute("aria-hidden", "true");
      td.insertBefore(gap, td.firstChild);
      return;
    }
    const key4 = this._rowKey(row, rowIdx);
    const open = key4 !== null && this._expanded.has(key4);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "material-symbols-outlined twm-dt-detail-toggle";
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    btn.setAttribute("aria-label", String(this.config.rowDetailLabel || "Details"));
    btn.title = String(this.config.rowDetailLabel || "Details");
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      this._setRowElExpanded(tr, btn.getAttribute("aria-expanded") !== "true", ev);
    });
    td.insertBefore(btn, td.firstChild);
    td.classList.add("twm-dt-cell--has-detail-toggle");
    tr.classList.add("twm-dt-row--has-detail");
  }
  /** After `tr` has been placed: its open detail, in front of `ref` (the row
   *  after it, or null for the end of the body). */
  _appendDetailIfOpen(tr, ref) {
    const row = tr.__row;
    const idx = tr.__rowIndex;
    if (!this._rowHasDetail(row, idx)) return;
    const key4 = this._rowKey(row, idx);
    if (key4 === null || !this._expanded.has(key4)) return;
    const pieces = this._buildDetailPieces(tr, key4);
    const parent = tr.parentNode;
    if (!parent) return;
    for (const p of pieces) parent.insertBefore(p, ref);
  }
  _buildDetailPieces(tr, key4) {
    const n = this._domColCount();
    const detailTr = document.createElement("tr");
    detailTr.className = "twm-dt-detail-row";
    const td = document.createElement("td");
    td.className = "twm-dt-detail-cell";
    td.colSpan = Math.max(1, n);
    const host = document.createElement("div");
    host.className = "twm-dt-detail";
    DETAIL_SEQ.n += 1;
    host.id = `twm-dt-detail-${DETAIL_SEQ.n}`;
    td.appendChild(host);
    detailTr.appendChild(td);
    const filler = document.createElement("tr");
    filler.className = "twm-dt-detail-filler";
    filler.hidden = true;
    filler.setAttribute("aria-hidden", "true");
    detailTr.__detailOf = tr;
    tr.__detail = [detailTr, filler];
    this._drawDetail(tr, host, key4);
    const btn = tr.querySelector(":scope > td > .twm-dt-detail-toggle");
    if (btn) btn.setAttribute("aria-controls", host.id);
    return tr.__detail;
  }
  _drawDetail(tr, host, key4) {
    host.replaceChildren();
    let out;
    try {
      out = this.config.rowDetail(tr.__row, tr.__rowIndex, { host, key: key4, table: this });
    } catch (err) {
      console.error("[DataTable] rowDetail threw", err);
      out = err?.message || String(err);
    }
    if (out == null || out === false || out === host) return;
    if (typeof Node !== "undefined" && out instanceof Node) host.appendChild(out);
    else host.textContent = String(out);
  }
  _removeDetailPieces(tr) {
    const pieces = tr.__detail;
    if (!pieces) return;
    for (const p of pieces) p.remove();
    tr.__detail = null;
    const btn = tr.querySelector(":scope > td > .twm-dt-detail-toggle");
    if (btn) btn.removeAttribute("aria-controls");
  }
  /** `updateRow`'s half: the detail follows the row's new data. */
  _redrawDetail(tr) {
    const key4 = this._rowKey(tr.__row, tr.__rowIndex);
    const want = this._rowHasDetail(tr.__row, tr.__rowIndex) && key4 !== null && this._expanded.has(key4);
    const pieces = tr.__detail;
    if (!want) {
      if (pieces) this._removeDetailPieces(tr);
      return;
    }
    if (pieces) {
      const host = pieces[0].querySelector(".twm-dt-detail");
      if (host) {
        this._drawDetail(tr, host, key4);
        const btn = tr.querySelector(":scope > td > .twm-dt-detail-toggle");
        if (btn) btn.setAttribute("aria-controls", host.id);
      }
      return;
    }
    if (tr.parentNode) this._appendDetailIfOpen(tr, tr.nextSibling);
  }
  /** Open or close the detail of the row `tr` draws. Returns whether
   *  anything changed. */
  _setRowElExpanded(tr, open, ev = null) {
    if (!this._detailOn() || tr.__rowIndex === void 0) return false;
    if (!this._rowHasDetail(tr.__row, tr.__rowIndex)) return false;
    const key4 = this._rowKey(tr.__row, tr.__rowIndex);
    if (key4 === null || this._expanded.has(key4) === !!open) return false;
    if (open) this._expanded.add(key4);
    else this._expanded.delete(key4);
    this._syncDetailOnScreen(tr, key4);
    this._afterDetailChange();
    try {
      this.config.onRowDetailToggle?.(tr.__rowIndex, tr.__row, !!open, key4, ev);
    } catch (err) {
      console.error("[DataTable] onRowDetailToggle threw", err);
    }
    return true;
  }
  /** Make the row on screen agree with `_expanded` for its key. */
  _syncDetailOnScreen(tr, key4) {
    const open = this._expanded.has(key4);
    const btn = tr.querySelector(":scope > td > .twm-dt-detail-toggle");
    if (btn) btn.setAttribute("aria-expanded", open ? "true" : "false");
    if (open && !tr.__detail && tr.parentNode) {
      const ref = tr.nextSibling;
      for (const p of this._buildDetailPieces(tr, key4)) tr.parentNode.insertBefore(p, ref);
    } else if (!open && tr.__detail) {
      this._removeDetailPieces(tr);
    }
  }
  /** Under `virtualize` an open detail is part of its row's height. */
  _afterDetailChange() {
    if (!this._virt) return;
    this._virtMeasureDetails([...this._virt.map.values()], { force: true });
  }
  /** The detail's height for row `i` of the window's list: 0 closed, the
   *  measured height open, three rows until it has been measured. */
  _detailHeightOf(row, rowIdx, base) {
    if (!this._rowHasDetail(row, rowIdx)) return 0;
    const key4 = this._rowKey(row, rowIdx);
    if (key4 === null || !this._expanded.has(key4)) return 0;
    const h = this._detailHeights.get(key4);
    return h > 0 ? h : base * 3;
  }
  /** Measure the open details among `trs` (client pixels, the zoom divided
   *  out, as `_virtMeasure` does), and re-lay the window if one changed. */
  _virtMeasureDetails(trs, { force = false } = {}) {
    const v = this._virt;
    if (!v) return;
    const changed = this._virtReadDetailHeights(trs) || force;
    if (!changed) return;
    this._virtComputeOffsets();
    this._virtSpacers();
  }
  /** Read the open details drawn under `trs` into `_detailHeights`; true
   *  when one moved by more than half a pixel. Recomputes nothing. */
  _virtReadDetailHeights(trs) {
    let changed = false;
    const zoom = this._tableEl?.currentCSSZoom || 1;
    for (const tr of trs) {
      const d = tr?.__detail?.[0];
      if (!d || !d.isConnected) continue;
      const h = d.getBoundingClientRect().height / zoom;
      if (!(h > 0)) continue;
      const key4 = this._rowKey(tr.__row, tr.__rowIndex);
      if (Math.abs((this._detailHeights.get(key4) || 0) - h) > 0.5) {
        this._detailHeights.set(key4, h);
        changed = true;
      }
    }
    return changed;
  }
  /**
   * Open (or close) the detail of the row whose key is `key` (`getRowKey`,
   * else the row's index). A row not on screen — another page, outside the
   * window, filtered out — opens when it is drawn.
   *
   * @param {*} key
   * @param {boolean} [open=true]
   * @returns {boolean} whether anything changed
   */
  setRowExpanded(key4, open = true) {
    if (key4 == null) return false;
    const k = String(key4);
    if (this._expanded.has(k) === !!open) return false;
    if (open) this._expanded.add(k);
    else this._expanded.delete(k);
    const tr = this._rowElByKey(k);
    if (tr) {
      this._syncDetailOnScreen(tr, k);
      try {
        this.config.onRowDetailToggle?.(tr.__rowIndex, tr.__row, !!open, k, null);
      } catch (err) {
        console.error("[DataTable] onRowDetailToggle threw", err);
      }
    }
    if (this._virt) {
      this._virtComputeOffsets();
      this._virtSpacers();
      this._afterDetailChange();
    }
    return true;
  }
  /** Whether the row whose key is `key` has its detail open. */
  isRowExpanded(key4) {
    return key4 != null && this._expanded.has(String(key4));
  }
  /** The keys of the rows whose detail is open, as text. */
  getExpandedRows() {
    return [...this._expanded];
  }
  /** Close every detail. */
  collapseAllRows() {
    for (const k of [...this._expanded]) this.setRowExpanded(k, false);
  }
  /** The `<tr>` on screen for a key, or null. */
  _rowElByKey(key4) {
    const tbody = this._tbodyEl;
    if (!tbody) return null;
    for (const tr of tbody.children) {
      if (tr.__rowIndex === void 0) continue;
      if (this._rowKey(tr.__row, tr.__rowIndex) === key4) return tr;
    }
    return null;
  }
  // ─────────────────────────────────────────────────────────────────
  // 0.7.0 — rows from a server (#33), the pager for an unknown total
  // (#35), refresh and follow (#36)
  // ─────────────────────────────────────────────────────────────────
  //
  // ONE QUESTION AT A TIME, AND ONLY THE NEWEST ANSWER. Every request takes
  // a ticket; an answer whose ticket is not the latest is dropped, and the
  // request it answered is aborted the moment a newer one is sent. Two
  // requests in flight from a fast typist otherwise race, and the loser
  // painting last is a list that does not match the box above it.
  /** Rows that are the current page of something larger (`onPageChange`,
   *  or 0.7.0's `dataSource`): drawn as given, never filtered, sorted or
   *  sliced here. */
  _isServerSide() {
    return typeof this.config.onPageChange === "function" || !!this.config.dataSource;
  }
  /** `autoDispose`'s grace in ms: one task, `keepWhileDetached`'s number,
   *  or Infinity for `true`. */
  _detachGrace() {
    const k = this.config.keepWhileDetached;
    if (k === true) return Infinity;
    if (typeof k === "number" && Number.isFinite(k) && k > 0) return k;
    if (k === Infinity) return Infinity;
    return 0;
  }
  _sourceState() {
    if (!this._source) {
      this._source = {
        started: false,
        ticket: 0,
        controller: null,
        inFlight: false,
        offset: 0,
        pendingOffset: 0,
        total: null,
        atLeast: 0,
        hasMore: false,
        query: null,
        loaded: false,
        pendingAppend: false
      };
    }
    return this._source;
  }
  /** The column filters, as a query and `onFilterChange` carry them. */
  _filterList() {
    const headers = this.config.headers || [];
    const out = [];
    for (const [column, value] of this._state.filters) {
      if (typeof value === "string" ? !value : this._isEmptyFilterValue(value)) continue;
      out.push({ column, header: headers[column], value });
    }
    return out.sort((a, b) => a.column - b.column);
  }
  /** Rows per question: `paging.pageSize` when the source is paged, else
   *  `pageSize` — one number for the query, `goToPage` and the pager. */
  _sourcePageSize() {
    const size = this._pagingConfig()?.pageSize ?? this.config.pageSize;
    return Math.max(1, size | 0);
  }
  _buildQuery(offset, reason, limit = null) {
    const col = this._state.sortColumn;
    return {
      offset,
      limit: Number.isFinite(limit) && limit >= 1 ? Math.floor(limit) : this._sourcePageSize(),
      sort: col == null ? null : {
        column: col,
        header: (this.config.headers || [])[col],
        ascending: this._state.sortAscending
      },
      filters: this._filterList(),
      reason
    };
  }
  /**
   * Ask the source for the page at `offset`, and draw the answer if it is
   * still the newest by then. Resolves with the answer drawn, or undefined
   * when it was dropped (superseded, failed, or the table was disposed).
   */
  async _sourceLoad({ offset = 0, reason = "reload", keep = false, append = false, limit = null } = {}) {
    const fetch = this.config.dataSource;
    if (typeof fetch !== "function") return void 0;
    const src = this._sourceState();
    src.started = true;
    const ticket = ++src.ticket;
    try {
      src.controller?.abort();
    } catch (_) {
    }
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    src.controller = controller;
    const query = this._buildQuery(Math.max(0, offset | 0), reason, limit);
    src.query = query;
    src.inFlight = true;
    src.pendingOffset = query.offset;
    src.pendingAppend = append;
    if (!append) this.setLoading(true);
    let result;
    try {
      result = await fetch(query, { signal: controller?.signal });
    } catch (err) {
      if (ticket !== src.ticket) return void 0;
      src.inFlight = false;
      src.controller = null;
      src.pendingAppend = false;
      if (err?.name === "AbortError" || controller?.signal?.aborted) {
        this.setLoading(false);
        return void 0;
      }
      this.setError(err);
      try {
        this.config.onLoadError?.(err, query);
      } catch (e) {
        console.error("[DataTable] onLoadError threw", e);
      }
      return void 0;
    }
    if (ticket !== src.ticket) return void 0;
    src.inFlight = false;
    src.controller = null;
    src.pendingAppend = false;
    this._applySourceResult(result, query, { keep, append });
    try {
      this.config.onLoad?.(result, query);
    } catch (e) {
      console.error("[DataTable] onLoad threw", e);
    }
    return result;
  }
  _applySourceResult(result, query, { keep = false, append = false } = {}) {
    const src = this._sourceState();
    const r = Array.isArray(result) ? { rows: result } : result || {};
    const answered = Array.isArray(r.rows) ? r.rows : [];
    const totalRaw = r.total ?? r.totalCount;
    const total = typeof totalRaw === "number" && Number.isFinite(totalRaw) ? totalRaw : null;
    const hasMore = typeof r.hasMore === "boolean" ? r.hasMore : total !== null ? query.offset + answered.length < total : answered.length >= query.limit;
    let rows = append ? (this.config.rows || []).concat(answered) : answered;
    let rowsOffset = append ? src.offset || 0 : query.offset;
    const pc = append ? this._pagingConfig() : null;
    if (pc && resolvePaging({
      mode: pc.mode,
      total,
      atLeast: r.atLeast,
      held: rowsOffset + rows.length,
      hasMore,
      softLimit: pc.softLimit,
      hardLimit: pc.hardLimit
    }).mode === "pages") {
      rows = answered;
      rowsOffset = query.offset;
      append = false;
    }
    if (src.loaded && this._detailOn() && this._expanded.size && typeof this.config.getRowKey !== "function") {
      const before = this.config.rows || [];
      const same = (a, b) => {
        if (a === b) return true;
        try {
          return JSON.stringify(a) === JSON.stringify(b);
        } catch (_) {
          return false;
        }
      };
      for (const k of [...this._expanded]) {
        const i = Number(k);
        if (!Number.isInteger(i) || i < 0 || i >= rows.length || !same(before[i], rows[i])) {
          this._expanded.delete(k);
          this._detailHeights.delete(k);
        }
      }
    }
    src.offset = rowsOffset;
    src.total = total;
    src.atLeast = Number.isFinite(r.atLeast) ? r.atLeast : 0;
    src.hasMore = hasMore;
    src.loaded = true;
    if (r.filterCounts && typeof r.filterCounts === "object") this.setFilterCounts(r.filterCounts);
    const snap = keep ? this._snapshotView() : null;
    const kept = append ? this._tableWrapEl?.scrollTop || 0 : null;
    if (snap && snap.keys && snap.keys.size && typeof this.config.getRowKey === "function") {
      const fresh = /* @__PURE__ */ new Set();
      rows.forEach((row, i) => {
        const k = this._rowKey(row, i);
        if (k !== null && !snap.keys.has(k)) fresh.add(k);
      });
      this._newKeys = fresh.size ? fresh : null;
    } else {
      this._newKeys = null;
    }
    const chosen = append && this._state.selected.size ? { sel: [...this._state.selected], anchor: this._state.anchorIndex } : null;
    this.setData({ rows });
    this._newKeys = null;
    if (chosen) {
      for (const i of chosen.sel) this._state.selected.add(i);
      this._state.anchorIndex = chosen.anchor;
      this._updateRowSelection();
    }
    if (snap) this._restoreView(snap);
    else if (kept !== null) this._scrollBodyTo(kept);
    else this._scrollBodyTo(0);
  }
  /** What a refresh must put back: the keys on screen, the selection by
   *  key, and the first row a reader can see with where it stood. */
  _snapshotView() {
    const rows = this.config.rows || [];
    const keyed = typeof this.config.getRowKey === "function";
    const keys = keyed ? new Set(rows.map((row, i) => this._rowKey(row, i))) : null;
    const selectedKeys = keyed ? this.getSelection().map((i) => this._rowKey(rows[i], i)).filter((k) => k !== null) : null;
    const wrap = this._tableWrapEl;
    let anchor = null;
    const scrollTop = wrap?.scrollTop || 0;
    if (wrap && scrollTop > 0 && this._tbodyEl) {
      const zoom = this._tableEl?.currentCSSZoom || 1;
      const top = wrap.getBoundingClientRect().top;
      for (const tr of this._tbodyEl.children) {
        if (tr.__rowIndex === void 0) continue;
        const box = tr.getBoundingClientRect();
        if (box.bottom > top + 0.5) {
          anchor = { key: this._rowKey(tr.__row, tr.__rowIndex), delta: (box.top - top) / zoom };
          break;
        }
      }
    }
    return { keys, selectedKeys, anchor, scrollTop };
  }
  _restoreView(snap) {
    if (snap.selectedKeys && snap.selectedKeys.length) {
      const want = new Set(snap.selectedKeys);
      const sel = this._state.selected;
      (this.config.rows || []).forEach((row, i) => {
        if (want.has(this._rowKey(row, i))) sel.add(i);
      });
      if (sel.size) {
        this._state.anchorIndex = [...sel][0];
        this._updateRowSelection();
        this._notifySelectionChange();
      }
    }
    const wrap = this._tableWrapEl;
    if (!wrap || !snap.anchor || snap.anchor.key === null) return;
    const rows = this.config.rows || [];
    const idx = rows.findIndex((row, i) => this._rowKey(row, i) === snap.anchor.key);
    if (idx < 0) return;
    const zoom = this._tableEl?.currentCSSZoom || 1;
    if (this._virt) {
      const local = this._virtLocalOf(idx);
      if (local < 0) return;
      this._scrollBodyTo(Math.max(0, this._virt.offsets[local] - snap.anchor.delta));
      return;
    }
    const tr = this.getRowElement(idx);
    if (!tr) return;
    const now = (tr.getBoundingClientRect().top - wrap.getBoundingClientRect().top) / zoom;
    const shift = now - snap.anchor.delta;
    if (Math.abs(shift) >= 0.5) this._scrollBodyTo(wrap.scrollTop + shift);
  }
  _scrollBodyTo(top) {
    const wrap = this._tableWrapEl;
    if (!wrap) return;
    if (Math.abs((wrap.scrollTop || 0) - top) >= 0.5) wrap.scrollTop = top;
    if (this._virt) this._virtUpdate({ force: true, top });
  }
  /** Go to the page at `offset` (paging back stops following). */
  _sourceGoTo(offset) {
    if (this._stagedRefusal("Turning the page")) return void 0;
    const next = Math.max(0, offset | 0);
    if (this._following && next > 0) this.setFollow(false);
    return this._sourceLoad({ offset: next, reason: "page" });
  }
  /**
   * `paging` over a `dataSource`, scrolling: the rows after those held, under
   * them — never past the hard limit. Scrolling down to ask for them is
   * paging away, so it turns following off as a page turn does; rows asked
   * for because the ones held do not fill the box are not (the reader is
   * still at the top).
   */
  _sourceLoadMore() {
    const held = this.config.rows?.length || 0;
    const hard = this.pagingState?.hardLimit ?? PAGING_HARD_LIMIT;
    const limit = Math.min(this._sourcePageSize(), hard - held);
    if (limit < 1) return Promise.resolve(void 0);
    if (this._following && (this._tableWrapEl?.scrollTop || 0) > 0) this.setFollow(false);
    const offset = (this._source?.offset || 0) + held;
    return this._sourceLoad({ offset, limit, reason: "more", append: true });
  }
  /** The strip's *Load all rows*: ONE question for every row left under the
   *  hard limit (`reason: 'all'`); the source answers as many as it will, and
   *  says with `hasMore` whether there are still more. */
  _sourceLoadAll() {
    const held = this.config.rows?.length || 0;
    const hard = this.pagingState?.hardLimit ?? PAGING_HARD_LIMIT;
    if (hard - held < 1) return Promise.resolve(void 0);
    if (this._following) this.setFollow(false);
    const offset = (this._source?.offset || 0) + held;
    return this._sourceLoad({ offset, limit: hard - held, reason: "all", append: true });
  }
  /** The strip's Pages / Scroll switch: the table switches, tells the
   *  consumer (`paging.onModeChange`), and asks again from the start. */
  _sourceSetMode(mode) {
    const next = mode === "pages" ? "pages" : "scroll";
    const p = this.config.paging;
    this.config.paging = { ...p, mode: next };
    try {
      p.onModeChange?.(next);
    } catch (err) {
      console.error("[DataTable] onModeChange threw", err);
    }
    return this._sourceLoad({ offset: 0, reason: "mode" });
  }
  /**
   * Ask the source again from its FIRST page — for a consumer whose own
   * filters (outside the table) changed. Under `dataSource` only; resolves
   * with the answer drawn (undefined when it was superseded or failed).
   */
  reload() {
    if (!this.config.dataSource) return Promise.resolve(void 0);
    return this._sourceLoad({ offset: 0, reason: "reload" });
  }
  /**
   * Read the CURRENT page again, in place: the scroll position (a reader at
   * the top sees what arrived; one scrolled down keeps the rows they were
   * reading where they were), the selection by key, the open row and the
   * open details all stay; rows the last answer did not hold are drawn
   * `twm-dt-row--new` (needs `getRowKey`). What `follow` calls on its tick.
   * Without `dataSource`, it only draws again.
   */
  refresh() {
    if (!this.config.dataSource) {
      if (this._wrapperEl) this.render();
      return Promise.resolve(void 0);
    }
    const src = this._sourceState();
    if (this.pagingState?.mode === "scroll") {
      const held = this.config.rows?.length || 0;
      return this._sourceLoad({
        offset: src.offset || 0,
        limit: Math.max(this._sourcePageSize(), held),
        reason: "refresh",
        keep: true
      });
    }
    const offset = src.inFlight && !src.pendingAppend ? src.pendingOffset : src.offset;
    return this._sourceLoad({ offset, reason: "refresh", keep: true });
  }
  /** The last query sent to `dataSource`, or null. */
  getQuery() {
    return this._source?.query || null;
  }
  /** What the last answer said about the whole: `{offset, total, hasMore}`. */
  getPageInfo() {
    const s = this._source;
    return s ? { offset: s.offset, total: s.total, hasMore: s.hasMore } : null;
  }
  /**
   * Turn following on or off (`follow`). On, the first page is read again
   * every `follow.interval` ms while the table is on it and in the page.
   */
  setFollow(on) {
    const next = !!on;
    if (next === this._following) return;
    this._following = next;
    if (next) this._armFollow();
    else this._disarmFollow();
    try {
      this.config.onFollowChange?.(next);
    } catch (err) {
      console.error("[DataTable] onFollowChange threw", err);
    }
  }
  isFollowing() {
    return this._following;
  }
  _followInterval() {
    const f = this.config.follow;
    const ms = f && typeof f === "object" ? Number(f.interval) : NaN;
    return Number.isFinite(ms) && ms > 0 ? ms : 1e4;
  }
  /** The tick holds the table WEAKLY: a follow timer must never be what keeps
   *  a table nobody holds alive (`keepWhileDetached: true`). */
  _armFollow() {
    this._disarmFollow();
    if (!this._following || !this.config.dataSource || !this._wrapperEl) return;
    const ref = weakRef(this);
    const id = setInterval(() => {
      const t = ref.deref();
      if (!t || t._followTimer !== id) {
        clearInterval(id);
        return;
      }
      const src = t._source;
      if (!t._following || !src || src.inFlight) return;
      if ((src.offset || 0) !== 0) return;
      if (!t._wrapperEl?.isConnected) return;
      if (t._readerIsBusy()) return;
      t.refresh();
    }, this._followInterval());
    this._followTimer = id;
  }
  _disarmFollow() {
    if (this._followTimer) clearInterval(this._followTimer);
    this._followTimer = null;
  }
  /** A TICK WAITS FOR A READER. A refresh redraws every row and every open
   *  detail, so a tick that came while somebody was selecting text in the
   *  table (a stack trace to copy) or working inside an open detail took the
   *  text out from under the selection and the focus out of the detail —
   *  every interval, for as long as they stayed. The tick is skipped
   *  instead, and following resumes on the next one after (the release
   *  review). `refresh()` called by the consumer is not a tick and does not
   *  wait. */
  _readerIsBusy() {
    const wrap = this._tableWrapEl;
    const doc = wrap?.ownerDocument;
    if (!wrap || !doc) return false;
    const active = doc.activeElement;
    if (active && active !== wrap && wrap.contains(active) && active.closest?.(".twm-dt-detail")) return true;
    try {
      const sel = doc.defaultView?.getSelection?.();
      if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
        for (let i = 0; i < sel.rangeCount; i++) {
          const r = sel.getRangeAt(i);
          if (wrap.contains(r.startContainer) || wrap.contains(r.endContainer)) return true;
        }
      }
    } catch (_) {
    }
    return false;
  }
  // ── the pager (#35) ────────────────────────────────────────────────
  _usesPager070() {
    const c = this.config;
    return !!c.dataSource || !!c.pagerLabels || c.maxJumpOffset != null || typeof c.onPageChange === "function" && c.totalCount == null && typeof c.hasMore === "boolean";
  }
  _pagerLabel(name) {
    const labels = this.config.pagerLabels || {};
    return labels[name];
  }
  _pagerRefusalTooDeep() {
    const max = this.config.maxJumpOffset;
    const fn = this._pagerLabel("tooDeep");
    if (typeof fn === "function") return String(fn(max));
    if (typeof fn === "string") return fn;
    return `Past ${Number(max).toLocaleString()} rows. Narrow the filters first.`;
  }
  _pagerButton(icon, name, tip, disabled, onClick, refusal = null) {
    const label = this._pagerLabel(name);
    const btn = this._createPaginationBtn(
      icon,
      typeof label === "string" ? label : tip,
      disabled || !!refusal,
      onClick
    );
    btn.dataset.pager = name;
    if (typeof label === "string" && label) {
      const span = document.createElement("span");
      span.className = "twm-pagination-btn__label";
      span.textContent = label;
      btn.appendChild(span);
      btn.classList.add("twm-pagination-btn--labelled");
      btn.style.padding = "1px 6px 1px 3px";
      btn.style.setProperty("min-width", "max-content", "important");
      btn.style.flexShrink = "0";
    }
    if (refusal) {
      btn.dataset.refusal = refusal;
      btn.setAttribute("data-tooltip", refusal);
      btn.title = refusal;
    }
    return btn;
  }
  /**
   * THE PAGE ARITHMETIC, ONCE — read by the pager above the rows (0.7.0) and
   * by the `paging` strip under them (0.6.2), which each worked it out for
   * themselves. `held` is the rows drawn on this page; `total` a number or
   * null (unknown, when `hasMore` says whether there is a next page).
   *
   * @returns {{known: boolean, hasPrev: boolean, hasNext: boolean, page: number,
   *            pages: number|null, lastOffset: number|null, lastRefusal: string|null}}
   */
  _pageNav({ offset = 0, held = 0, total = null, hasMore = false, pageSize }) {
    const size = Math.max(1, pageSize | 0);
    const known = typeof total === "number" && Number.isFinite(total);
    const lastOffset = known ? Math.floor(Math.max(0, total - 1) / size) * size : null;
    const maxJump = Number.isFinite(this.config.maxJumpOffset) ? this.config.maxJumpOffset : null;
    let lastRefusal = null;
    if (!known) {
      const words = this._pagerLabel("noLast");
      lastRefusal = typeof words === "string" ? words : "The total is not known, so there is no last page.";
    } else if (maxJump !== null && lastOffset > maxJump) {
      lastRefusal = this._pagerRefusalTooDeep();
    }
    return {
      known,
      hasPrev: offset > 0,
      hasNext: known ? offset + held < total : !!hasMore,
      page: Math.floor(offset / size) + 1,
      pages: known ? Math.max(1, Math.ceil(total / size)) : null,
      lastOffset,
      lastRefusal
    };
  }
  /**
   * The pager for any mode, with the two things the 0.6 strip could not do:
   * an UNKNOWN total (no "of N", no last page, Next until a short page) and
   * a REFUSED deep jump (`maxJumpOffset`). For a known total its words are
   * the 0.6 strip's.
   */
  _createPager070() {
    const c = this.config;
    const { rows, pageSize } = c;
    const source = !!c.dataSource;
    const server = !source && typeof c.onPageChange === "function";
    const src = this._source || { offset: 0, total: null, hasMore: false };
    const offset = source ? src.offset : server ? c.offset || 0 : this._state.offset;
    let total;
    let hasMoreKnown;
    if (source) {
      total = src.total;
      hasMoreKnown = src.hasMore;
    } else if (server) {
      const unknown = c.totalCount == null && typeof c.hasMore === "boolean";
      total = unknown ? null : c.totalCount || rows.length;
      hasMoreKnown = unknown ? c.hasMore : null;
    } else {
      total = this._getProcessedRows().length;
      hasMoreKnown = null;
    }
    const known = typeof total === "number" && Number.isFinite(total);
    const isFiltered = !source && !server && this._state.filters.size > 0;
    const unfilteredTotal = !source && !server ? rows.length : total;
    const drawn = source || server ? rows.length : Math.max(0, Math.min(pageSize, total - offset));
    const pn = this._pageNav({ offset, held: drawn, total, hasMore: hasMoreKnown, pageSize });
    const { hasPrev, hasNext, page } = pn;
    const totalPages = pn.pages;
    if (known && totalPages <= 1 && !isFiltered && !hasPrev) return this._createExportOnlyStrip();
    if (!known && !hasPrev && !hasNext) return this._createExportOnlyStrip();
    const maxJump = Number.isFinite(c.maxJumpOffset) ? c.maxJumpOffset : null;
    const go = (newOffset) => {
      if (this._stagedRefusal("Turning the page")) return;
      if (source) {
        this._sourceGoTo(newOffset);
        return;
      }
      if (server) {
        this._awaitWithSpinner(c.onPageChange(newOffset, pageSize));
        return;
      }
      this._state.offset = newOffset;
      this._savePage();
      this.render();
    };
    const el = document.createElement("div");
    el.className = "twm-pagination-controls";
    if (!known) el.classList.add("twm-pagination-controls--unknown-total");
    el.style.cssText = "display:flex; align-items:center; gap:6px; padding:2px 8px; border-bottom:1px solid #2a2a2a; font-size:11px;";
    const info = document.createElement("span");
    info.className = "twm-pagination-info";
    info.style.cssText = "color:#aaa; white-space:nowrap;";
    const from = (offset + 1).toLocaleString();
    const to = (offset + drawn).toLocaleString();
    if (drawn === 0) {
      info.textContent = hasPrev ? `Page ${page} \xB7 no rows` : isFiltered ? `0 of ${unfilteredTotal.toLocaleString()} rows match` : "No rows";
    } else if (!known) {
      info.textContent = `Rows ${from}\u2013${to}`;
    } else if (isFiltered) {
      info.textContent = `Rows ${from}\u2013${to} of ${total.toLocaleString()} (${unfilteredTotal.toLocaleString()} total)`;
    } else {
      info.textContent = `Rows ${from}\u2013${to} of ${total.toLocaleString()}`;
    }
    const spacer = document.createElement("div");
    spacer.style.flex = "1";
    const firstBtn = this._pagerButton("first_page", "first", "First page", !hasPrev, () => go(0));
    const prevBtn = this._pagerButton(
      "chevron_left",
      "prev",
      "Previous page",
      !hasPrev,
      () => go(Math.max(0, offset - pageSize))
    );
    const pageInfo = document.createElement("span");
    pageInfo.className = "twm-pagination-page";
    pageInfo.style.cssText = "color:#aaa; font-size:10px; min-width:72px; text-align:center;";
    pageInfo.textContent = known ? `Page ${page} of ${totalPages.toLocaleString()}` : `Page ${page}`;
    const nextBtn = this._pagerButton(
      "chevron_right",
      "next",
      "Next page",
      !hasNext,
      () => go(offset + pageSize)
    );
    const { lastOffset, lastRefusal } = pn;
    const lastBtn = this._pagerButton(
      "last_page",
      "last",
      "Last page",
      !hasNext || lastOffset === offset,
      () => {
        if (lastOffset !== null) go(lastOffset);
      },
      lastRefusal
    );
    const jumpInput = document.createElement("input");
    jumpInput.type = "number";
    jumpInput.className = "twm-pagination-input";
    jumpInput.style.cssText = "width:54px; padding:1px 4px; border:1px solid #444; background:#2a2a2a; color:#ccc; font-size:10px;";
    jumpInput.min = "1";
    if (known) jumpInput.max = String(total);
    jumpInput.placeholder = "Row #";
    const jumpBtn = this._createPaginationBtn(null, "Go to row", false, () => {
      const target = Math.floor(Number(jumpInput.value));
      if (!Number.isFinite(target) || target < 1) return;
      const row = known ? Math.min(target, Math.max(1, total)) : target;
      const newOffset = Math.floor((row - 1) / pageSize) * pageSize;
      if (maxJump !== null && newOffset > maxJump) {
        const why = this._pagerRefusalTooDeep();
        jumpInput.setAttribute("aria-invalid", "true");
        jumpInput.title = why;
        jumpInput.dataset.refusal = why;
        return;
      }
      jumpInput.removeAttribute("aria-invalid");
      delete jumpInput.dataset.refusal;
      if (server && typeof c.onJumpToRow === "function") {
        c.onJumpToRow(row - 1);
        return;
      }
      go(newOffset);
    }, "Go");
    jumpBtn.dataset.pager = "go";
    el.append(info, spacer, firstBtn, prevBtn, pageInfo, nextBtn, lastBtn, jumpInput, jumpBtn);
    if (c.showExportButton) el.appendChild(this._createExportBtn());
    return el;
  }
  // ─────────────────────────────────────────────────────────────────
  // 0.7.0 — filter controls that are not text boxes (#37)
  // ─────────────────────────────────────────────────────────────────
  /** The spec for a column, normalised: null for the 0.4 text box. */
  _filterKindFor(colIdx, header) {
    const fk = this.config.filterKinds;
    if (fk == null) return null;
    let spec;
    if (typeof fk === "function") {
      try {
        spec = fk(colIdx, header);
      } catch (err) {
        console.error("[DataTable] filterKinds threw", err);
        spec = null;
      }
    } else {
      spec = perColumn(fk, colIdx);
    }
    if (spec == null || spec === "text" || spec === false) return null;
    if (typeof spec === "function") return { kind: "custom", create: spec };
    if (typeof spec === "object") {
      if (spec.kind === "text") return null;
      if (spec.kind === "chips") return spec;
      if (typeof spec.create === "function") return { ...spec, kind: spec.kind || "custom" };
    }
    if (spec === "chips") return null;
    return null;
  }
  /** The column's control — built once, then the same element every render. */
  _filterControlFor(colIdx, header) {
    const spec = this._filterKindFor(colIdx, header);
    if (!spec) return null;
    const have = this._filterControls.get(colIdx);
    if (have && have.kind === spec.kind && have.specKey === (spec.options || spec.create)) {
      return have.control;
    }
    if (have) this._destroyOneControl(have.control);
    const value = this._state.filters.get(colIdx) ?? null;
    const ctx = {
      column: colIdx,
      header,
      value,
      counts: this._filterCounts.get(colIdx) ?? null,
      table: this,
      setValue: (v) => this.setFilter(colIdx, v)
    };
    let control = null;
    try {
      control = spec.kind === "chips" ? createChipsFilter(ctx, spec) : spec.create(ctx);
    } catch (err) {
      console.error("[DataTable] filter control threw while being built", err);
      control = null;
    }
    if (typeof Node !== "undefined" && control instanceof Node) control = { el: control };
    if (!control || !control.el) return null;
    control.el.classList?.add("twm-dt-filter-control");
    this._filterControls.set(colIdx, {
      kind: spec.kind,
      specKey: spec.options || spec.create,
      control,
      match: typeof control.match === "function" ? control.match : spec.kind === "chips" ? chipsMatch(spec) : null
    });
    return control;
  }
  /** The client-side rule for a column with a control, or null. */
  _filterMatcher(colIdx) {
    if (!this._filterControls.size && this.config.filterKinds == null) return null;
    const entry = this._filterControls.get(colIdx);
    if (entry) return entry.match || defaultControlMatch;
    const spec = this._filterKindFor(colIdx, (this.config.headers || [])[colIdx]);
    if (!spec) return null;
    return spec.kind === "chips" ? chipsMatch(spec) : spec.match || defaultControlMatch;
  }
  _isEmptyFilterValue(v) {
    if (v == null || v === "" || v === false) return true;
    if (Array.isArray(v)) return v.length === 0;
    if (typeof v === "object" && !(v instanceof Date)) {
      return Object.values(v).every((x) => x == null || x === "");
    }
    return false;
  }
  _destroyOneControl(control) {
    try {
      control?.destroy?.();
    } catch (err) {
      console.error("[DataTable] filter control destroy threw", err);
    }
    control?.el?.remove?.();
  }
  _destroyFilterControls() {
    for (const { control } of this._filterControls.values()) this._destroyOneControl(control);
    this._filterControls.clear();
  }
  _notifyFilterChange() {
    if (typeof this.config.onFilterChange !== "function") return;
    try {
      this.config.onFilterChange(this._filterList());
    } catch (err) {
      console.error("[DataTable] onFilterChange threw", err);
    }
  }
  /** The column filters in force: `[{column, header, value}]`. */
  getFilters() {
    return this._filterList();
  }
  /**
   * Set one column's filter (`null`, `''` or an empty array clears it). The
   * value is whatever the column's control works in — text for the 0.4 box.
   */
  setFilter(colIdx, value) {
    if (this._stagedRefusal("setFilter")) return;
    const textBox = !this._filterKindFor(colIdx, (this.config.headers || [])[colIdx]);
    const v = textBox && value != null && typeof value !== "string" ? String(value) : value;
    if (textBox) {
      const filterRow = this._wrapperEl?.querySelector(".twm-data-table__filter-row");
      const cell = filterRow?.children[this._domIdxOf(colIdx)];
      const input = cell?.querySelector(".twm-data-table__filter-input");
      if (input) input.value = v || "";
    }
    this._onFilterInput(colIdx, v ?? "");
  }
  /**
   * Counts for a column's filter control — chips draw them beside each
   * option (keyed by the option's value; `''` is "no filter"), a dimmed
   * chip at zero. `setFilterCounts(colIdx, counts)`, or
   * `setFilterCounts({[colIdx]: counts})` for several. They are kept, so a
   * control built later starts with them.
   */
  setFilterCounts(colIdx, counts) {
    if (colIdx && typeof colIdx === "object" && counts === void 0) {
      for (const [k, c] of Object.entries(colIdx)) this.setFilterCounts(Number(k), c);
      return;
    }
    const col = Number(colIdx);
    if (!Number.isInteger(col)) return;
    if (counts == null) this._filterCounts.delete(col);
    else this._filterCounts.set(col, counts);
    const entry = this._filterControls.get(col);
    if (entry) {
      try {
        entry.control.setCounts?.(counts ?? null);
      } catch (err) {
        console.error("[DataTable] filter control setCounts threw", err);
      }
    }
  }
  /** What `setFilterCounts` last gave a column, or null. */
  getFilterCounts(colIdx) {
    return this._filterCounts.get(Number(colIdx)) ?? null;
  }
  // ── focus across a render ──────────────────────────────────────────
  _captureFocus070(doc) {
    const active = doc?.activeElement;
    if (!active || active === doc.body) return null;
    for (const [colIdx, { control }] of this._filterControls) {
      if (control.el?.contains?.(active)) {
        let sel = null;
        try {
          if (typeof active.selectionStart === "number") sel = [active.selectionStart, active.selectionEnd];
        } catch (_) {
        }
        return { kind: "control", colIdx, el: active, sel };
      }
    }
    const detailHost = active.closest?.(".twm-dt-detail");
    if (detailHost && this._tbodyEl?.contains(detailHost)) {
      const tr = detailHost.closest("tr")?.__detailOf;
      if (tr && tr.__rowIndex !== void 0) {
        const path = [];
        for (let n = active; n && n !== detailHost; n = n.parentElement) {
          path.unshift(Array.prototype.indexOf.call(n.parentElement.children, n));
        }
        let sel = null;
        try {
          if (typeof active.selectionStart === "number") sel = [active.selectionStart, active.selectionEnd];
        } catch (_) {
        }
        return { kind: "detail", key: this._rowKey(tr.__row, tr.__rowIndex), path, tag: active.tagName, sel };
      }
    }
    const toggle = active.closest?.(".twm-dt-detail-toggle");
    if (toggle && this._tbodyEl?.contains(toggle)) {
      const tr = toggle.closest("tr");
      if (tr && tr.__rowIndex !== void 0) {
        return { kind: "toggle", key: this._rowKey(tr.__row, tr.__rowIndex) };
      }
    }
    return null;
  }
  _restoreFocus070(f) {
    try {
      if (f.kind === "control") {
        if (!f.el.isConnected) return;
        f.el.focus({ preventScroll: true });
        if (f.sel) f.el.setSelectionRange?.(f.sel[0], f.sel[1]);
      } else if (f.kind === "detail" && f.key !== null) {
        let n = this._rowElByKey(f.key)?.__detail?.[0]?.querySelector(".twm-dt-detail");
        for (const i of f.path) n = n?.children[i];
        if (n && n.tagName === f.tag) {
          n.focus({ preventScroll: true });
          if (f.sel) n.setSelectionRange?.(f.sel[0], f.sel[1]);
        }
      } else if (f.kind === "toggle" && f.key !== null) {
        const tr = this._rowElByKey(f.key);
        tr?.querySelector(":scope > td > .twm-dt-detail-toggle")?.focus({ preventScroll: true });
      }
    } catch (_) {
    }
  }
  /** The one row spanning every column that says there are no rows (or why
   *  they could not be read). Under `dataSource` the plain message is drawn
   *  by class, so it is quiet while the first answer is on its way. */
  _buildEmptyRow(colCount, emptyMessage) {
    const emptyTr = document.createElement("tr");
    emptyTr.className = "data-preview-row data-table__empty-row";
    const emptyTd = document.createElement("td");
    emptyTd.colSpan = colCount;
    if (this._error) {
      emptyTd.className = "twm-data-table__empty-cell twm-data-table__empty-cell--error";
      emptyTd.setAttribute("role", "alert");
      this._appendStateContent(emptyTd, this._errorContent());
    } else if (this.config.emptyState !== void 0) {
      emptyTd.className = "twm-data-table__empty-cell twm-data-table__empty-cell--state";
      const state = typeof this.config.emptyState === "function" ? this.config.emptyState() : this.config.emptyState;
      this._appendStateContent(emptyTd, state);
    } else if (this.config.dataSource) {
      emptyTd.className = "twm-data-table__empty-cell twm-data-table__empty-cell--state";
      emptyTd.textContent = emptyMessage;
    } else {
      emptyTd.style.cssText = "text-align:center; font-style:italic; color:#888; padding:16px;";
      emptyTd.textContent = emptyMessage;
    }
    emptyTr.appendChild(emptyTd);
    return emptyTr;
  }
  // ─────────────────────────────────────────────────────────────────
  // 0.5.0 — decoration, states and the typed columns
  // ─────────────────────────────────────────────────────────────────
  /** The class list both halves of the table carry: the 0.4 pair, plus the
   *  0.5.0 modifiers a consumer asked for. */
  _tableClassName() {
    const names = this.config.readonly ? ["twm-preview-table", "twm-preview-table--readonly"] : ["twm-preview-table"];
    if (this.config.firstColumn === "plain") names.push("twm-dt--first-plain");
    if (this._isClickable()) names.push("twm-dt--clickable");
    if (this._gutter) names.push("twm-dt--select");
    if (this._selecting) names.push("twm-dt--selecting");
    if (this._cellGrid) names.push("twm-dt--cells");
    return names.join(" ");
  }
  /** `clickable` when it is said; otherwise exactly when rows open. */
  _isClickable() {
    const c = this.config.clickable;
    if (c === true || c === false) return c;
    return typeof this.config.onRowActivate === "function";
  }
  _fitsContent() {
    return !!this.config.fitContent || this._maxHeightCss() !== null;
  }
  _maxHeightCss() {
    const m = this.config.maxHeight;
    if (m == null || m === "" || m === false) return null;
    if (typeof m === "number") return Number.isFinite(m) && m > 0 ? `${m}px` : null;
    return String(m);
  }
  _utc() {
    return String(this.config.dateTimeZone || "").toUpperCase() === "UTC";
  }
  /**
   * What a column is drawn, sorted and filtered BY: its type, except that a
   * 'date', 'datetime' or 'duration' counts only when it was DECLARED through
   * `columnTypes`. In 0.4, whatever `getColumnType` returned was the cells'
   * class name and nothing more (only 'num' changed the sort and the
   * filter), so a consumer that returned 'date' there to style its cells gets
   * exactly 0.4 — its `formatValue`, its text sort, its text filter — and
   * the class name it asked for.
   */
  _valueKind(colIdx) {
    const t = this._columnTypes?.[colIdx];
    if (!TYPED_COLUMNS.has(t)) return t;
    const declared = Array.isArray(this.config.columnTypes) ? this.config.columnTypes[colIdx] : null;
    return declared === t ? t : "text";
  }
  /** `classList.add` for whatever a hook returned: a string (space-separated
   *  names allowed), an array of them, or nothing. */
  _addClasses(el, names) {
    if (!names) return [];
    const list = (Array.isArray(names) ? names : String(names).split(/\s+/)).map((n) => String(n || "").trim()).filter(Boolean);
    if (list.length) el.classList.add(...list);
    return list;
  }
  /** A row's key, as text, or null: `getRowKey`, else its original index. */
  _rowKey(row, rowIdx) {
    const fn = this.config.getRowKey;
    let key4;
    if (typeof fn === "function") {
      try {
        key4 = fn(row, rowIdx);
      } catch (err) {
        console.error("[DataTable] getRowKey threw", err);
        key4 = null;
      }
    } else {
      key4 = rowIdx;
    }
    return key4 == null ? null : String(key4);
  }
  /** The gestures `activateOn` names, as a set. */
  _activateOn() {
    const a = this.config.activateOn;
    const list = Array.isArray(a) ? a : [a || "click"];
    return new Set(list.map((g) => String(g).toLowerCase()));
  }
  /**
   * Open a row on the gestures `activateOn` names, by the one rule in
   * `row_activation.js` (a control is its own gesture, a drag that selects
   * text is not a click, the second click of a double-click opens nothing).
   * Delegated on the body, bound after the selection handler.
   *
   * The listeners go in `_activationOffs`, not `_disposers`, and a render
   * retires them a task late (`_retireActivation`): a press whose selection
   * callback re-draws the table still opens the row it pressed — the row
   * as it was drawn (`tr.__row`), with its original index.
   */
  _installActivation(tbody, table) {
    const on = this._activateOn();
    const scope = this._wrapperEl;
    const sel = this.config.selectable;
    const multi = !!sel && sel !== "single";
    const fire = (tr, ev) => {
      if (!this._wrapperEl || typeof this.config.onRowActivate !== "function") return;
      if (this._selecting) return;
      try {
        this.config.onRowActivate(tr.__rowIndex, tr.__row, ev);
      } catch (err) {
        console.error("[DataTable] onRowActivate threw", err);
      }
    };
    const rowFor = (ev) => {
      const tr = ev.target?.closest?.("tr");
      return tr && tr.__rowIndex !== void 0 && tbody.contains(tr) ? tr : null;
    };
    const listen = (el, type, fn) => {
      el.addEventListener(type, fn);
      this._activationOffs.push(() => el.removeEventListener(type, fn));
    };
    if (on.has("click")) {
      listen(tbody, "click", (ev) => {
        if (ev.button != null && ev.button !== 0) return;
        const tr = rowFor(ev);
        if (!tr || !isRowActivation(ev, "click", { scope })) return;
        if (multi && (ev.shiftKey || ev.ctrlKey || ev.metaKey)) return;
        if (DESELECTING_CLICKS.has(ev)) return;
        fire(tr, ev);
      });
    }
    if (on.has("dblclick")) {
      listen(tbody, "dblclick", (ev) => {
        const tr = rowFor(ev);
        if (!tr || !isRowActivation(ev, "dblclick", { scope })) return;
        fire(tr, ev);
      });
    }
    if (on.has("enter")) {
      listen(table, "keydown", (ev) => {
        if (ev.key !== "Enter" || ev.isComposing) return;
        if (ev.ctrlKey || ev.metaKey || ev.altKey || ev.shiftKey) return;
        if (isRowControl(ev.target, table)) return;
        const tr = this._currentRowEl();
        if (!tr) return;
        ev.preventDefault();
        fire(tr, ev);
      });
    }
  }
  /**
   * The row Enter opens: the SELECTED one — the one row selected, or the
   * selection's anchor — because that is the row a person just chose (a
   * double-click opens the row it lands on, and Enter must agree with it);
   * the open row (`activeRow`) only when nothing is selected. A selected row
   * that is not drawn (another page) opens nothing rather than a different
   * row.
   */
  _currentRowEl() {
    const tbody = this._tbodyEl;
    if (!tbody) return null;
    const selected = this._state.selected;
    let idx = null;
    if (selected.size === 1) idx = [...selected][0];
    else if (this._state.anchorIndex != null && selected.has(this._state.anchorIndex)) {
      idx = this._state.anchorIndex;
    }
    if (idx != null) return this.getRowElement(idx);
    if (this._activeKey !== null) {
      for (const tr of tbody.children) {
        if (tr.__rowIndex !== void 0 && tr.classList.contains("twm-dt-row--active")) return tr;
      }
    }
    return null;
  }
  /** 0.6.1. The `diff` answer for one row, or `null` when there is none or
   *  its status is not one this component draws. */
  _diffOf(row, rowIdx) {
    if (typeof this.config.diff !== "function") return null;
    const answer = this.config.diff(row, rowIdx);
    if (!answer || !DIFF_STATUSES.has(answer.status)) return null;
    return answer;
  }
  /** Everything `rowClass`, `rowAttrs` and the open mark put on a `<tr>`,
   *  taken off again first — so `updateRow` cannot leave last state's class
   *  behind. */
  _decorateRow(tr, row, rowIdx) {
    tr.__row = row;
    const { rowClass, rowAttrs } = this.config;
    if (tr.__twmClasses) {
      for (const c of tr.__twmClasses) tr.classList.remove(c);
      tr.__twmClasses = null;
    }
    if (typeof rowClass === "function") {
      const added = this._addClasses(tr, rowClass(row, rowIdx));
      tr.__twmClasses = added.filter((c) => c !== "data-preview-row" && c !== "selected");
    }
    for (const c of [...tr.classList]) {
      if (c === "twm-dt-diff" || c.startsWith("twm-dt-diff--")) tr.classList.remove(c);
    }
    const diff = this._diffOf(row, rowIdx);
    if (diff) tr.classList.add("twm-dt-diff", `twm-dt-diff--${diff.status}`);
    if (tr.__twmAttrs) {
      for (const name of tr.__twmAttrs) tr.removeAttribute(name);
      tr.__twmAttrs = null;
    }
    if (typeof rowAttrs === "function") {
      const attrs = rowAttrs(row, rowIdx) || {};
      const set = [];
      for (const [name, value] of Object.entries(attrs)) {
        if (value == null || value === false) continue;
        try {
          tr.setAttribute(name, value === true ? "" : String(value));
          set.push(name);
        } catch (err) {
          console.error(`[DataTable] rowAttrs: bad attribute "${name}"`, err);
        }
      }
      tr.__twmAttrs = set;
    }
    if (typeof this.config.getRowKey === "function" || this._activeKey !== null) {
      tr.__rowKey = this._rowKey(row, rowIdx);
    }
    this._paintActive(tr);
    if (this._newKeys) {
      tr.classList.toggle("twm-dt-row--new", this._newKeys.has(this._rowKey(row, rowIdx)));
    }
  }
  /** The open mark on one row, from `_activeKey`. */
  _paintActive(tr) {
    if (tr.__rowKey === void 0 && this._activeKey !== null && tr.__rowIndex !== void 0) {
      const rows = this.config.rows;
      const local = this._virt ? this._virtLocalOf(tr.__rowIndex) : -1;
      const row = local >= 0 ? this._virt.rows[local] : rows?.[tr.__rowIndex];
      tr.__rowKey = this._rowKey(row, tr.__rowIndex);
    }
    const on = this._activeKey !== null && tr.__rowKey === this._activeKey;
    tr.classList.toggle("twm-dt-row--active", on);
    if (on) {
      if (tr.getAttribute("aria-current") !== "true") {
        tr.setAttribute("aria-current", "true");
        tr.__twmAriaCurrent = true;
      }
    } else if (tr.__twmAriaCurrent) {
      tr.__twmAriaCurrent = false;
      if (!(tr.__twmAttrs || []).includes("aria-current")) tr.removeAttribute("aria-current");
    }
  }
  /** The row icon, drawn by CSS from `data-twm-icon` so that its name is in
   *  neither `textContent`, the clipped-cell tooltip nor a copy. */
  _prependRowIcon(td, spec) {
    if (!spec) return;
    const s = typeof spec === "string" ? { icon: spec } : spec;
    if (!s.icon) return;
    const icon = document.createElement("span");
    icon.className = "material-symbols-outlined twm-dt-row-icon" + (s.tone ? ` twm-dt-row-icon--${String(s.tone).replace(/[^\w-]/g, "")}` : "");
    icon.dataset.twmIcon = String(s.icon);
    if (s.title) {
      icon.title = String(s.title);
      icon.setAttribute("role", "img");
      icon.setAttribute("aria-label", String(s.title));
    } else {
      icon.setAttribute("aria-hidden", "true");
    }
    td.insertBefore(icon, td.firstChild);
    td.classList.add("twm-dt-cell--has-icon");
  }
  /** Text, a node, or nothing, into an empty-state cell. */
  _appendStateContent(td, content) {
    if (content == null || content === false) return;
    if (typeof Node !== "undefined" && content instanceof Node) td.appendChild(content);
    else td.textContent = String(content);
  }
  /** What `setError` holds, as something `_appendStateContent` can draw. */
  _errorContent() {
    const e = this._error;
    if (e == null) return null;
    if (typeof Node !== "undefined" && e instanceof Node) return e;
    if (e instanceof Error) return e.message || String(e);
    if (typeof e === "object" && e.message) return String(e.message);
    return String(e);
  }
  /** The failure banner over rows that are kept. */
  _createErrorBanner() {
    const banner = document.createElement("div");
    banner.className = "twm-data-table__error";
    banner.setAttribute("role", "alert");
    const icon = document.createElement("span");
    icon.className = "material-symbols-outlined twm-data-table__error-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "error";
    const text = document.createElement("span");
    text.className = "twm-data-table__error-text";
    const content = this._errorContent();
    if (typeof Node !== "undefined" && content instanceof Node) text.appendChild(content);
    else text.textContent = String(content ?? "");
    banner.append(icon, text);
    return banner;
  }
  /** The `sortValue` hook for one column, or null. */
  _sortValueFor(colIdx) {
    const sv = this.config.sortValue;
    if (typeof sv === "function") return sv;
    const fn = perColumn(sv, colIdx);
    return typeof fn === "function" ? fn : null;
  }
  /** The words for a value in a typed column, or `undefined` when the
   *  column is not typed (or the value is empty). */
  _formatTyped(value, colIdx) {
    const kind = this._valueKind(colIdx);
    if (!TYPED_COLUMNS.has(kind) || value == null || value === "") return void 0;
    if (kind === "duration") {
      return formatDuration(value, perColumn(this.config.durationFormat, colIdx) || "auto");
    }
    const pattern = kind === "datetime" ? perColumn(this.config.dateTimeFormat, colIdx) || ISO_DATETIME : perColumn(this.config.dateFormat, colIdx) || ISO_DATE;
    if (typeof pattern === "function") {
      const t = parseDateValue(value, { utc: this._utc() });
      return Number.isFinite(t) ? String(pattern(new Date(t), colIdx, value) ?? "") : String(value);
    }
    return formatDate(value, pattern, { utc: this._utc() });
  }
  /** Sync the (separate) header table's column widths to the body
   *  table's measured widths. Without this, the two tables compute
   *  widths independently and the columns drift apart. Locks both
   *  tables to `table-layout: fixed` and writes explicit width onto
   *  each header cell of every header row (header + filter row). */
  /**
   * Measure every column's NATURAL content width, in one transient reflow.
   *
   * Extracted from `_syncHeaderWidths` so that auto-size can ask the same
   * question the fit pass asks, and get the same answer. Two measurement
   * passes would drift, and the drift would show as a double-click that
   * sized a column differently from the render that follows it.
   *
   * The pass ignores the CSS caps (the 150px-pinned first column, the 80px
   * min on the rest) and the filter-row inputs: `twm-dt-measuring` flips both
   * tables to `table-layout:auto; width:max-content` with those caps off (via
   * `!important`) for a single reflow, then reverts before paint — it is
   * never visible. Clearing inline widths first stops the last sync's forced
   * widths from constraining the measure.
   *
   * C10 — UNDER `virtualize` ONLY THE WINDOW IS IN THE DOM, so `max-content`
   * spans the eighty-odd rows drawn rather than every row loaded. The fit
   * pass that runs on every render is content with that (it is fitting what
   * is on screen). An EXPLICIT auto-size is not: it is a promise to fit the
   * column's content, and the longest value in a 6,000-row table is usually
   * not in the window. So `sample` adds, for the length of this one reflow,
   * the row holding each column's longest value — see `_virtSampleRows`.
   *
   * @param {{sample?: boolean}} [o]
   * @returns {number[]|null} width per DOM column index, or null when there
   *   is nothing laid out to measure.
   */
  _measureNaturalWidths({ sample = false } = {}) {
    const headerTable = this._headerTableEl;
    const bodyTable = this._tableEl;
    if (!headerTable || !bodyTable) return null;
    const firstRow = this._firstBodyRow();
    if (!firstRow) return null;
    const bodyCells = firstRow.children;
    if (!bodyCells.length) return null;
    headerTable.querySelectorAll("thead > tr").forEach((tr) => {
      for (const th of tr.children) this._clearCellWidth(th);
    });
    for (const td of bodyCells) this._clearCellWidth(td);
    for (const col of this._cols() || []) col.style.width = "";
    headerTable.style.width = "";
    bodyTable.style.width = "";
    headerTable.classList.add("twm-dt-measuring");
    bodyTable.classList.add("twm-dt-measuring");
    const sampled = sample ? this._virtSampleRows() : [];
    for (const tr of sampled) this._virt.tbody.appendChild(tr);
    bodyTable.offsetWidth;
    const labelRow = headerTable.querySelector("thead > tr");
    const cols = bodyCells.length;
    const natural = new Array(cols);
    const zoom = bodyTable.currentCSSZoom || 1;
    for (let i = 0; i < cols; i++) {
      const body = bodyCells[i].getBoundingClientRect().width / zoom;
      const head = labelRow && labelRow.children[i] ? labelRow.children[i].getBoundingClientRect().width / zoom : 0;
      natural[i] = Math.max(body, head);
    }
    const floors = new Array(cols).fill(0);
    const filterRow = headerTable.querySelector("thead > tr.twm-data-table__filter-row--controls");
    if (filterRow) {
      for (let i = 0; i < cols && i < filterRow.children.length; i++) {
        const th = filterRow.children[i];
        if (!th.classList.contains("data-table__filter-cell--control")) continue;
        const el = th.firstElementChild;
        if (!el) continue;
        const cs = getComputedStyle(th);
        const pad3 = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0) + (parseFloat(cs.borderLeftWidth) || 0) + (parseFloat(cs.borderRightWidth) || 0);
        floors[i] = Math.ceil(el.getBoundingClientRect().width / zoom + pad3);
        natural[i] = Math.max(natural[i], floors[i]);
      }
    }
    this._filterFloors = floors;
    for (const tr of sampled) tr.remove();
    headerTable.classList.remove("twm-dt-measuring");
    bodyTable.classList.remove("twm-dt-measuring");
    return natural;
  }
  /**
   * The rows an explicit auto-size must measure that the window has not
   * drawn: for each column, the drawable row whose value is LONGEST as a
   * string, plus the last row (the widest row number). Built with
   * `_buildBodyRow` — so a consumer's `renderCell` draws them exactly as it
   * would on screen — and handed back detached, for `_measureNaturalWidths`
   * to put in and take out around its one reflow.
   *
   * The string length is a proxy, not a measurement: in a proportional font
   * forty `i`s are narrower than thirty `W`s. It is the proxy a spreadsheet's
   * own autofit falls short by, and it is right about the case that matters
   * here — a value five times longer than anything in the window. One pass
   * over the loaded rows, on a click and never on a scroll or a resize.
   *
   * @returns {HTMLTableRowElement[]}
   */
  _virtSampleRows() {
    const v = this._virt;
    if (!v || !v.rows.length) return [];
    const longest = [];
    const at = [];
    let last = -1;
    for (let i = 0; i < v.rows.length; i++) {
      if (!(v.heights[i] > 0)) continue;
      last = i;
      const row = v.rows[i];
      if (!Array.isArray(row)) continue;
      for (let c = 0; c < row.length; c++) {
        const value = row[c];
        const len = value == null ? 0 : String(value).length;
        if (len > (longest[c] ?? -1)) {
          longest[c] = len;
          at[c] = i;
        }
      }
    }
    const want = new Set(at.filter((i) => i !== void 0));
    if (last >= 0) want.add(last);
    const rows = [];
    for (const i of want) {
      if (v.map.has(i)) continue;
      const tr = this._buildBodyRow(v.rows[i], v.globalOf(i), i);
      tr.setAttribute("aria-hidden", "true");
      rows.push(tr);
    }
    return rows;
  }
  /**
   * Fit one column to its widest value and pin it there — every loaded
   * row's, under `virtualize` (see `_virtSampleRows`), not only the window's.
   *
   * The gesture is a double-click on the column's resize grip, which is where
   * every spreadsheet has put it — and the grip is this component's, which is
   * why the behaviour is too. A consumer that wanted this had no hook to hang
   * it on: `_installColumnResizers` bound `mousedown` and a `click` that only
   * suppressed the sort, and the measurement, the pin, the table-width
   * invariant and the write-through to `stateStore` are all private here.
   *
   * @param {number} domIdx column index INCLUDING the row-number column when
   *   `showRowNumbers` is on — the same index space as `_colWidths`.
   * @param {{maxWidth?: number}} [opts] ceiling; defaults to AUTOSIZE_MAX_PX.
   * @returns {boolean} whether it had a layout to measure.
   */
  autoSizeColumn(domIdx, opts = {}) {
    const natural = this._measureNaturalWidths({ sample: true });
    if (!natural || domIdx < this._lead().select || domIdx >= natural.length) return false;
    this._colWidths[domIdx] = this._autoWidth(natural[domIdx], opts);
    this._colWidthsSig = this._colSig();
    this._savePersisted();
    this._syncHeaderWidths();
    return true;
  }
  /**
   * The same for every column at once.
   *
   * It REPLACES existing drag overrides rather than sizing around them: "fit
   * every column to its content" that quietly excepted the three columns you
   * had dragged would be a button whose result depends on history nobody can
   * see.
   *
   * The result may well be wider than the container — forty columns of real
   * content usually are — and that is the intended answer, not a failure:
   * `_syncHeaderWidths` honours overrides verbatim, sizes both tables to their
   * total and the body wrap scrolls sideways with the header following it.
   * Squeezing them to fit is what the automatic fit pass does on every render
   * already, so a button that did that would be a button that does nothing.
   */
  autoSizeColumns(opts = {}) {
    const natural = this._measureNaturalWidths({ sample: true });
    if (!natural) return false;
    this._colWidths = {};
    for (let i = this._lead().select; i < natural.length; i++) {
      this._colWidths[i] = this._autoWidth(natural[i], opts);
    }
    this._colWidthsSig = this._colSig();
    this._savePersisted();
    this._syncHeaderWidths();
    return true;
  }
  /** One measured width, floored at the drag-resize minimum and capped, with
   *  the same sub-pixel pad `_fitColumnWidths` adds against ellipsis. */
  _autoWidth(natural, opts = {}) {
    const max = opts.maxWidth ?? AUTOSIZE_MAX_PX;
    return Math.min(max, Math.max(40, Math.ceil((natural || 0) + 2)));
  }
  /**
   * Does every one of the `n` DOM columns already carry an override taken
   * against the column set that is on screen right now?
   *
   * The signature half is not belt-and-braces. `render()` drops `_colWidths`
   * when `_colSig` changes, but `_syncHeaderWidths` is also reached straight
   * from the ResizeObserver, which never goes through `render()` — so a set
   * of overrides measured against the PREVIOUS headers can still be sitting
   * in `_colWidths` when this is asked. Answering "pinned" then would skip
   * the measure and hand `_fitColumnWidths` widths keyed to columns that are
   * no longer there, each one landing on its neighbour.
   *
   * `== null` rather than a falsy test, to match `_fitColumnWidths`' own
   * `overrides[i] != null`: a legitimately-stored 0 must be read the same way
   * in both places or the two disagree about which columns are flexible.
   */
  _allColumnsPinned(n) {
    if (!n || this._colWidthsSig !== this._colSig()) return false;
    for (let i = this._lead().select; i < n; i++) {
      if (this._colWidths[i] == null) return false;
    }
    return true;
  }
  /** Sync the (separate) header table's column widths to the body
   *  table's measured widths. Without this, the two tables compute
   *  widths independently and the columns drift apart. Locks both
   *  tables to `table-layout: fixed` and writes explicit width onto
   *  each header cell of every header row (header + filter row). */
  _syncHeaderWidths() {
    const headerTable = this._headerTableEl;
    const bodyTable = this._tableEl;
    if (!headerTable || !bodyTable) return;
    const cols = this._cols();
    const firstRow = this._firstBodyRow();
    const bodyCells = cols ? [] : firstRow?.children;
    const n = cols ? cols.length : bodyCells?.length || 0;
    if (!n) return;
    const headerRows = headerTable.querySelectorAll("thead > tr");
    const natural = this._allColumnsPinned(n) ? new Array(n).fill(0) : this._measureNaturalWidths();
    if (!natural) return;
    const wrap = this._tableWrapEl;
    const headerWrap = this._headerWrapEl;
    const avail = wrap ? wrap.clientWidth : 0;
    const lead = this._lead().all;
    const firstIdx = lead && n > lead ? lead : 0;
    const widths = this._fitColumnWidths(natural, avail, {
      firstIdx,
      // STORY-0016. The select column is as wide as its controls, always.
      overrides: this._gutter ? { ...this._colWidths, 0: this._selectColWidth() } : this._colWidths,
      fit: this.config.columnFit,
      floors: this._filterFloors
    });
    const total = widths.reduce((a, b) => a + b, 0);
    headerRows.forEach((tr) => {
      for (let i = 0; i < tr.children.length && i < widths.length; i++) {
        this._setCellWidth(tr.children[i], widths[i]);
      }
    });
    if (cols) {
      for (let i = 0; i < cols.length && i < widths.length; i++) {
        cols[i].style.width = `${widths[i]}px`;
      }
    } else {
      for (let i = 0; i < bodyCells.length && i < widths.length; i++) {
        this._setCellWidth(bodyCells[i], widths[i]);
      }
    }
    headerTable.style.tableLayout = "fixed";
    bodyTable.style.tableLayout = "fixed";
    const hasOverride = Object.keys(this._colWidths).length > 0;
    if (hasOverride || total > avail + 1) {
      headerTable.style.width = `${total}px`;
      bodyTable.style.width = `${total}px`;
    } else {
      headerTable.style.width = "";
      bodyTable.style.width = "";
    }
    if (wrap && headerWrap) {
      const sbw = Math.max(0, wrap.offsetWidth - wrap.clientWidth);
      headerWrap.style.paddingRight = sbw ? `${sbw}px` : "";
      this._wrapperEl?.style?.setProperty("--twm-dt-gutter", `${sbw}px`);
    }
    this._syncHeaderScroll();
    this._updateCellTooltips();
  }
  /**
   * Convert measured natural content widths into final column widths.
   *
   * Goals (the "intelligent" sizing):
   *  - every column wants its content width (+a hair), clamped to a
   *    sane [floor, cap]; the FIRST content column gets a more generous
   *    cap so it shows its full value;
   *  - user-dragged columns (`overrides`) are pinned, never grown/shrunk;
   *  - if everything fits, grow the flexible columns evenly to fill the
   *    width (no dead gap on the right);
   *  - if it doesn't fit, protect the first column and water-fill-shrink
   *    the rest (trim the widest first) until it fits; only if even the
   *    floors overflow do we give up and let the body scroll sideways.
   *
   * Under `fit: 'content'` the first and last of those goals invert: each
   * unpinned column asks for its own content width through the same
   * `_autoWidth` the grip double-click uses, and an overflow is the answer
   * rather than a problem — the caller wanted a table that scrolls sideways,
   * not one squeezed toward the floor. The grow-to-fill branch is shared by
   * both, because a table narrower than its container leaves a dead gap on
   * the right under either reading.
   *
   * @param {number[]} natural  measured content width per column (px)
   * @param {number}   avail    usable width of the body wrap (px)
   * @param {{firstIdx?:number, overrides?:Object, fit?:'container'|'content'}} [opts]
   * @returns {number[]} final width per column (px)
   */
  _fitColumnWidths(natural, avail, opts = {}) {
    const FLOOR = 40;
    const CAP = 360;
    const FIRST_CAP = 520;
    const PAD = 2;
    const n = natural.length;
    const firstIdx = opts.firstIdx ?? 0;
    const overrides = opts.overrides || {};
    const floors = Array.isArray(opts.floors) ? opts.floors : [];
    const floorOf = (i) => Math.max(FLOOR, Math.ceil(floors[i] || 0));
    const toContent = opts.fit === "content";
    const desired = new Array(n);
    const pinned = new Array(n).fill(false);
    for (let i = 0; i < n; i++) {
      if (overrides[i] != null) {
        desired[i] = Math.max(FLOOR, Math.round(overrides[i]));
        pinned[i] = true;
        continue;
      }
      if (toContent) {
        desired[i] = this._autoWidth(natural[i]);
        continue;
      }
      const cap = i === firstIdx ? FIRST_CAP : CAP;
      desired[i] = Math.min(cap, Math.max(FLOOR, Math.ceil(natural[i] + PAD)));
    }
    const widths = desired.slice();
    const sum = widths.reduce((a, b) => a + b, 0);
    if (avail <= 1) return widths;
    if (sum <= avail) {
      const flex = [];
      for (let i = 0; i < n; i++) if (!pinned[i]) flex.push(i);
      const slack = avail - sum;
      if (slack > 0) {
        const targets = flex.length ? flex : [n - 1];
        const per = Math.floor(slack / targets.length);
        for (const i of targets) widths[i] += per;
        widths[targets[targets.length - 1]] += slack - per * targets.length;
      }
      return widths;
    }
    if (toContent) return widths;
    let protectedSum = 0;
    const shrinkable = [];
    for (let i = 0; i < n; i++) {
      if (pinned[i] || i === firstIdx) protectedSum += widths[i];
      else shrinkable.push(i);
    }
    const budget = avail - protectedSum;
    if (budget < shrinkable.length * FLOOR) {
      for (const i of shrinkable) widths[i] = floorOf(i);
      return widths;
    }
    shrinkable.sort((a, b) => desired[a] - desired[b]);
    let remaining = budget;
    for (let k = 0; k < shrinkable.length; k++) {
      const colsLeft = shrinkable.length - k;
      const fair = Math.floor(remaining / colsLeft);
      const i = shrinkable[k];
      if (desired[i] <= fair) {
        widths[i] = desired[i];
        remaining -= desired[i];
      } else {
        const level = Math.max(FLOOR, fair);
        for (let j = k; j < shrinkable.length; j++) {
          widths[shrinkable[j]] = Math.max(level, floorOf(shrinkable[j]));
        }
        const leftover = remaining - colsLeft * level;
        if (leftover > 0) widths[shrinkable[shrinkable.length - 1]] += leftover;
        break;
      }
    }
    return widths;
  }
  /** Set an explicit width on a table cell, clearing any CSS min/max
   *  width constraint so the width is honored exactly. The first
   *  ("time") column is pinned to 150px by `min/max-width` in CSS;
   *  without this, dragging it does nothing and the slack leaks to the
   *  other columns. */
  _setCellWidth(cell, w) {
    cell.style.width = `${w}px`;
    cell.style.minWidth = "0";
    cell.style.maxWidth = "none";
  }
  /** Undo `_setCellWidth` so a re-measure sees the cell's natural,
   *  CSS-constrained width again. */
  _clearCellWidth(cell) {
    cell.style.width = "";
    cell.style.minWidth = "";
    cell.style.maxWidth = "";
  }
  /** Wire the body wrap's horizontal scroll to the header. The header
   *  sits in an overflow:hidden wrap, so it can't scroll sideways on
   *  its own — `_syncHeaderScroll` scrolls it programmatically to the
   *  body's `scrollLeft`. Re-installed each render against the freshly-built
   *  wrap. */
  _installHeaderScrollSync() {
    const wrap = this._tableWrapEl;
    if (!wrap) return;
    if (this._onBodyScroll && this._scrollSyncEl) {
      this._scrollSyncEl.removeEventListener("scroll", this._onBodyScroll);
    }
    this._onBodyScroll = () => this._syncHeaderScroll();
    this._scrollSyncEl = wrap;
    wrap.addEventListener("scroll", this._onBodyScroll, { passive: true });
    this._syncHeaderScroll();
  }
  /**
   * Scroll the header wrap to match the body's horizontal scroll so the
   * columns stay aligned when the table overflows sideways.
   *
   * ══ C29. A TRANSFORM IS WHAT MAKES A STICKY COLUMN IMPOSSIBLE ═══════
   *
   * This wrote `headerTable.style.transform = translateX(-scrollLeft)`. It
   * aligns the two tables perfectly and it forecloses `position: sticky`
   * entirely, because the two halves of the table then pin against different
   * things: a sticky cell in the BODY pins to the body wrap's scrollport,
   * while its header counterpart is moved by a transform inside a box that
   * never scrolls at all. Scroll sideways and the pinned body column stands
   * still while its header slides away with everything else — so a table
   * with a trailing verb column (the row-actions column Tables needs pinned
   * to the right edge) can have a sticky body or an aligned header, never
   * both. A transform also establishes a containing block for fixed/sticky
   * descendants, which breaks the header cell independently of the offset.
   *
   * AN `overflow: hidden` BOX IS STILL A SCROLL CONTAINER. It has no
   * scrollbar and no user affordance, and `scrollLeft` moves it exactly like
   * any other. Scrolling the wrap rather than transforming its child gives
   * the header a real scrollport at the same offset as the body's, which is
   * the one arrangement in which a sticky cell on each side pins to the same
   * place. Identical for ordinary content: same pixels, no transform, no new
   * containing block.
   *
   * THE CLAMP IS ALREADY PAID FOR. A scroll container clamps `scrollLeft` to
   * `scrollWidth - clientWidth`, and the body wrap carries a vertical
   * scrollbar the header wrap does not — so the header would clamp short by
   * the scrollbar width and desync at the far right. `_syncHeaderWidths`
   * already pads the header wrap by exactly that gutter (`paddingRight`,
   * :1905), and end padding counts toward `scrollWidth`, so the two maxima
   * coincide. The residual below is the honest belt for the day some engine
   * disagrees about that: it is zero in the ordinary case, so the transform
   * is not set and sticky keeps working, and it is the difference rather
   * than the whole offset if it is ever not.
   */
  _syncHeaderScroll() {
    const wrap = this._tableWrapEl;
    const headerTable = this._headerTableEl;
    if (!wrap || !headerTable) return;
    const x = wrap.scrollLeft;
    const headerWrap = this._headerWrapEl;
    if (!headerWrap) {
      headerTable.style.transform = x ? `translateX(${-x}px)` : "";
      return;
    }
    headerWrap.scrollLeft = x;
    const residual = x - headerWrap.scrollLeft;
    headerTable.style.transform = residual ? `translateX(${-residual}px)` : "";
    this._colGroups()?.align();
  }
  /** Drag-to-resize: hang a thin grab handle off the right edge of
   *  every header cell. Dragging it writes a per-column width override
   *  (keyed by DOM index) that `_syncHeaderWidths` then honors. */
  _installColumnResizers() {
    const headerTable = this._headerTableEl;
    if (!headerTable) return;
    const headRow = headerTable.querySelector("thead > tr");
    if (!headRow) return;
    [...headRow.children].forEach((th, domIdx) => {
      if (th.querySelector(".twm-dt-col-resizer")) return;
      if (th.classList.contains("twm-dt-select-cell")) return;
      th.classList.add("twm-dt-col");
      const grip = document.createElement("div");
      grip.className = "twm-dt-col-resizer";
      grip.addEventListener(
        "mousedown",
        (ev) => this._beginColResize(ev, domIdx)
      );
      grip.addEventListener("click", (ev) => ev.stopPropagation());
      grip.addEventListener("dblclick", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        this.autoSizeColumn(domIdx);
      });
      th.appendChild(grip);
    });
  }
  /**
   * CSS px per screen px. Content inside a zoomed tile reports rects and
   * pointer coordinates in screen pixels, while `style.width` is CSS pixels;
   * mixing them widened every column by the zoom factor on a mere click.
   */
  _zoomFactor() {
    const el = this._tableWrapEl || this._tableEl;
    const css = el?.offsetWidth || 0;
    const screen = el?.getBoundingClientRect?.().width || 0;
    return css > 0 && screen > 0 ? screen / css : 1;
  }
  _beginColResize(ev, domIdx) {
    if (ev.button != null && ev.button !== 0) return;
    ev.preventDefault();
    ev.stopPropagation();
    const headerTable = this._headerTableEl;
    const bodyTable = this._tableEl;
    const headRow = headerTable && headerTable.querySelector("thead > tr");
    if (!headRow) return;
    const startX = ev.clientX;
    const THRESHOLD = 3;
    const MIN = 40;
    let startWidths = null;
    const begin = () => {
      const z = this._zoomFactor();
      startWidths = [...headRow.children].map((c) => {
        const set = parseFloat(c.style.width);
        return Number.isFinite(set) ? set : c.getBoundingClientRect().width / z;
      });
      headerTable.style.tableLayout = "fixed";
      if (bodyTable) bodyTable.style.tableLayout = "fixed";
      startWidths.forEach((w, i) => this._pinColumnWidth(i, w));
      this._applyTableWidth();
      document.body.classList.add("twm-dt-col-resizing");
    };
    const onMove = (mv) => {
      const dx = mv.clientX - startX;
      if (!startWidths) {
        if (Math.abs(dx) < THRESHOLD) return;
        begin();
      }
      const w = Math.max(MIN, Math.round(startWidths[domIdx] + dx / this._zoomFactor()));
      this._pinColumnWidth(domIdx, w);
      this._applyTableWidth(domIdx);
      this._syncHeaderScroll();
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      if (!startWidths) return;
      document.body.classList.remove("twm-dt-col-resizing");
      this._updateCellTooltips();
      this._savePersisted();
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }
  /** Pin one column to an explicit width across BOTH tables (every
   *  header row + the body's first row) and record it as a user
   *  override so `_syncHeaderWidths` honors it on later renders. The
   *  single place that writes a column width during a drag / fill. */
  _pinColumnWidth(i, w) {
    const headerTable = this._headerTableEl;
    const bodyTable = this._tableEl;
    if (!headerTable) return;
    this._colWidths[i] = w;
    headerTable.querySelectorAll("thead > tr").forEach((tr) => {
      if (tr.children[i]) this._setCellWidth(tr.children[i], w);
    });
    const cols = this._cols();
    if (cols) {
      if (cols[i]) cols[i].style.width = `${w}px`;
      return;
    }
    const bodyRow = bodyTable && this._firstBodyRow();
    if (bodyRow && bodyRow.children[i]) this._setCellWidth(bodyRow.children[i], w);
  }
  /** Size both tables so a widened column grows the table (→ horizontal
   *  scroll) rather than stealing from its neighbours — while enforcing
   *  the TABLE WIDTH INVARIANT: the table is never narrower than its
   *  container. Any width freed by dragging a column in stretches a
   *  flexible column (the last one, stepping off the column being
   *  dragged) so the table always spans ≥100% of the wrap.
   *
   * @param {number|null} dragIdx column the user is actively dragging,
   *        so the fill lands on a DIFFERENT column and doesn't fight the
   *        drag. Null (non-drag callers) lets the last column flex. */
  _applyTableWidth(dragIdx = null) {
    const headerTable = this._headerTableEl;
    const bodyTable = this._tableEl;
    const headRow = headerTable && headerTable.querySelector("thead > tr");
    if (!headRow) return;
    const cells = [...headRow.children];
    const cols = cells.length;
    if (cols === 0) return;
    const FLOOR = 40;
    const widthOf = (th) => {
      const px = parseFloat(th.style.width);
      return Number.isFinite(px) ? px : th.getBoundingClientRect().width;
    };
    const cur = cells.map(widthOf);
    const wrap = this._tableWrapEl;
    const avail = wrap ? wrap.clientWidth : 0;
    let flexIdx = cols - 1;
    if (dragIdx != null && flexIdx === dragIdx) flexIdx -= 1;
    if (avail > 1 && flexIdx >= 0 && flexIdx !== dragIdx) {
      let rest = 0;
      for (let i = 0; i < cols; i++) if (i !== flexIdx) rest += cur[i];
      const fill = Math.max(FLOOR, Math.round(avail - rest));
      if (Math.round(fill) !== Math.round(cur[flexIdx])) {
        this._pinColumnWidth(flexIdx, fill);
        cur[flexIdx] = fill;
      }
    }
    let total = 0;
    for (const w of cur) total += w;
    total = Math.ceil(total);
    headerTable.style.width = `${total}px`;
    if (bodyTable) bodyTable.style.width = `${total}px`;
  }
  /** Add a native `title` tooltip to any body cell whose text is
   *  clipped by its column width; remove ours once it fits again.
   *  Leaves caller-supplied titles (e.g. from renderCell) untouched. */
  _updateCellTooltips(rows = null) {
    const bodyTable = this._tableEl;
    if (!bodyTable) return;
    const cells = rows ? rows.flatMap((tr) => [...tr.children]) : bodyTable.querySelectorAll("tbody td");
    cells.forEach((td) => {
      if (td.parentElement?.classList.contains("twm-dt-spacer")) return;
      if (td.closest?.(".twm-dt-detail-row")) return;
      const clipped = td.scrollWidth > td.clientWidth + 1;
      if (clipped) {
        if (!td.title) td.title = td.textContent;
      } else if (td.title && td.title === td.textContent) {
        td.removeAttribute("title");
      }
    });
  }
  _installInteractions() {
    if (!this._tbodyEl || !this._tableEl) return;
    const { selectable, copyable } = this.config;
    const customMenu = this.config.contextMenuItems != null || !!this._structure()?.hasRowItems();
    const tbody = this._tbodyEl;
    const table = this._tableEl;
    if (this._cellGrid) this._cellGrid.install(tbody, table);
    if (selectable && !this._cellGrid) {
      const handleRowClick = (event) => {
        const rowEl = event.target.closest("tr");
        if (!rowEl || rowEl.__rowIndex === void 0) return;
        const idx = rowEl.__rowIndex;
        const selected = this._state.selected;
        if (selectable === "single") {
          const was = selected.has(idx);
          selected.clear();
          if (!(was && (event.metaKey || event.ctrlKey))) selected.add(idx);
          else DESELECTING_CLICKS.add(event);
          this._state.anchorIndex = selected.size ? idx : null;
        } else if (this._selecting) {
          if (event.shiftKey && this._state.anchorIndex != null) {
            const order = this._processedIndexMap || this.config.rows.map((_, i) => i);
            const a = order.indexOf(this._state.anchorIndex);
            const b = order.indexOf(idx);
            if (a >= 0 && b >= 0) {
              for (let i = Math.min(a, b); i <= Math.max(a, b); i++) selected.add(order[i]);
            } else selected.add(idx);
          } else if (selected.has(idx)) selected.delete(idx);
          else selected.add(idx);
          this._state.anchorIndex = idx;
          this._navCursor = idx;
          this._markCursor();
        } else if (event.shiftKey && this._state.anchorIndex != null) {
          const start = Math.min(this._state.anchorIndex, idx);
          const end = Math.max(this._state.anchorIndex, idx);
          selected.clear();
          for (let i = start; i <= end; i++) selected.add(i);
        } else if (event.metaKey || event.ctrlKey) {
          if (selected.has(idx)) selected.delete(idx);
          else selected.add(idx);
          this._state.anchorIndex = idx;
        } else {
          selected.clear();
          selected.add(idx);
          this._state.anchorIndex = idx;
        }
        this._updateRowSelection();
        this._notifySelectionChange();
        try {
          table.focus({ preventScroll: true });
        } catch (_) {
        }
      };
      tbody.addEventListener("click", handleRowClick);
      this._disposers.push(() => tbody.removeEventListener("click", handleRowClick));
    }
    if (typeof this.config.onRowKeyDown === "function") {
      const onRowKey = (ev) => {
        if (ev.isComposing || isRowControl(ev.target, table)) return;
        const tr = this._currentRowEl();
        let handled = false;
        try {
          handled = this.config.onRowKeyDown(tr ? tr.__rowIndex : null, tr ? tr.__row : null, ev) === true;
        } catch (err) {
          console.error("[DataTable] onRowKeyDown threw", err);
        }
        if (handled) {
          ev.preventDefault();
          ev.stopImmediatePropagation();
        }
      };
      table.addEventListener("keydown", onRowKey);
      this._disposers.push(() => table.removeEventListener("keydown", onRowKey));
    }
    if (this.config.keyboardNav && selectable) {
      const NAV_KEYS = ["ArrowDown", "ArrowUp", "Home", "End"];
      const onNavKey = (ev) => {
        if (!NAV_KEYS.includes(ev.key) || ev.ctrlKey || ev.metaKey || ev.altKey) return;
        if (isRowControl(ev.target, table)) return;
        const order = this._pageOrder();
        if (!order.length) return;
        ev.preventDefault();
        const selected = this._state.selected;
        const cur = this._navCursor != null && (this._selecting || selected.has(this._navCursor)) ? this._navCursor : this._state.anchorIndex;
        let pos = order.indexOf(cur);
        if (ev.key === "Home") pos = 0;
        else if (ev.key === "End") pos = order.length - 1;
        else if (pos === -1) pos = ev.key === "ArrowDown" ? 0 : order.length - 1;
        else pos = Math.max(0, Math.min(order.length - 1, pos + (ev.key === "ArrowDown" ? 1 : -1)));
        const idx = order[pos];
        this._navCursor = idx;
        const anchorPos = order.indexOf(this._state.anchorIndex);
        if (this._selecting) {
          if (ev.shiftKey) {
            const from = order.indexOf(cur);
            if (from >= 0) {
              for (let i = Math.min(from, pos); i <= Math.max(from, pos); i++) selected.add(order[i]);
            } else selected.add(idx);
            this._updateRowSelection();
            this._notifySelectionChange();
          }
          this._state.anchorIndex = idx;
          this._markCursor();
          this.scrollToRow(idx);
          return;
        }
        if (ev.shiftKey && selectable !== "single" && anchorPos !== -1) {
          const [a, b] = anchorPos <= pos ? [anchorPos, pos] : [pos, anchorPos];
          selected.clear();
          for (let i = a; i <= b; i++) selected.add(order[i]);
        } else {
          selected.clear();
          selected.add(idx);
          this._state.anchorIndex = idx;
        }
        this._updateRowSelection();
        this._notifySelectionChange();
        this.scrollToRow(idx);
      };
      table.addEventListener("keydown", onNavKey);
      this._disposers.push(() => table.removeEventListener("keydown", onNavKey));
    }
    if (this._gutter) {
      const onSpace = (ev) => {
        if (!this._selecting || ev.key !== " " || ev.ctrlKey || ev.metaKey || ev.altKey) return;
        if (isRowControl(ev.target, table)) return;
        const idx = this._navCursor ?? this._state.anchorIndex;
        if (idx == null || !this.config.rows[idx]) return;
        ev.preventDefault();
        const selected = this._state.selected;
        if (selected.has(idx)) selected.delete(idx);
        else selected.add(idx);
        this._state.anchorIndex = idx;
        this._updateRowSelection();
        this._notifySelectionChange();
      };
      table.addEventListener("keydown", onSpace);
      this._disposers.push(() => table.removeEventListener("keydown", onSpace));
      this._paintSelectHead();
      this._markCursor();
    }
    if (typeof this.config.onRowActivate === "function") {
      this._installActivation(tbody, table);
    }
    if (this._detailOn()) {
      const onDetailKey = (ev) => {
        if (ev.key !== "ArrowRight" && ev.key !== "ArrowLeft") return;
        if (ev.ctrlKey || ev.metaKey || ev.altKey || ev.shiftKey) return;
        const toggle = ev.target?.closest?.(".twm-dt-detail-toggle");
        let tr = null;
        if (toggle && table.contains(toggle)) tr = toggle.closest("tr");
        else if (ev.target === table) tr = this._currentRowEl();
        if (!tr || tr.__rowIndex === void 0) return;
        if (this._setRowElExpanded(tr, ev.key === "ArrowRight", ev)) ev.preventDefault();
      };
      table.addEventListener("keydown", onDetailKey);
      this._disposers.push(() => table.removeEventListener("keydown", onDetailKey));
    }
    if (copyable || customMenu) {
      const handleContextMenu = (event) => {
        const rowEl = event.target.closest("tr");
        if (!rowEl) {
          this._hideContextMenu();
          return;
        }
        if (rowEl.closest(".twm-dt-detail-row")) {
          this._hideContextMenu();
          return;
        }
        const idx = rowEl.__rowIndex;
        let custom = null;
        if (customMenu) {
          const selection = idx !== void 0 && !this._state.selected.has(idx) ? [idx] : this.getSelection();
          const ctx = this._contextMenuCtxFor(rowEl, event.target, selection);
          custom = { ctx, items: this._customMenuItems(ctx) };
        }
        if (!copyable && !custom.items.length) {
          this._hideContextMenu();
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        if (idx !== void 0 && !this._state.selected.has(idx) && !this._selecting) {
          this._state.selected.clear();
          this._state.selected.add(idx);
          this._state.anchorIndex = idx;
          this._updateRowSelection();
          this._notifySelectionChange();
        }
        try {
          table.focus({ preventScroll: true });
        } catch (_) {
        }
        setTimeout(() => this._showContextMenu(event.clientX, event.clientY, custom), 0);
      };
      tbody.addEventListener("contextmenu", handleContextMenu);
      this._disposers.push(() => tbody.removeEventListener("contextmenu", handleContextMenu));
    }
    if (copyable) {
      const handleKeyDown = (event) => {
        const ctrlLike = event.ctrlKey || event.metaKey;
        if (ctrlLike && !event.altKey) {
          const key4 = String(event.key || "").toLowerCase();
          if (key4 === "a" && selectable === "single") {
            event.preventDefault();
          } else if (key4 === "a" && selectable) {
            event.preventDefault();
            this._selectAllShown();
          } else if (key4 === "c" && !(event.shiftKey && this._cellGrid)) {
            event.preventDefault();
            this.copyToClipboard(event.shiftKey ? "csv" : "tsv");
          }
        } else if (event.key === "Escape") {
          if (this._state.selected.size) {
            this.clearSelection();
          } else if (this._selecting && this.config.selectToggle) {
            this.setSelectMode(false);
          }
          this._hideContextMenu();
        }
      };
      table.addEventListener("keydown", handleKeyDown);
      this._disposers.push(() => table.removeEventListener("keydown", handleKeyDown));
    }
  }
  _updateRowSelection() {
    if (!this._tbodyEl) return;
    this._tbodyEl.querySelectorAll("tr").forEach((tr) => {
      const idx = tr.__rowIndex;
      if (idx !== void 0) {
        const on = this._state.selected.has(idx);
        tr.classList.toggle("selected", on && !this._cellGrid);
        const box = this._gutter ? tr.querySelector(":scope > td.twm-dt-select-cell > input") : null;
        if (box) box.checked = on;
      }
    });
    this._paintSelectHead();
  }
  /* ── STORY-0016: select mode ─────────────────────────────────────── */
  /** Whether the table is in select mode. */
  isSelectMode() {
    return !!this._selecting;
  }
  /**
   * Turn select mode on or off. The ticks are kept either way (a selection
   * is a selection); the consumer clears it if leaving means "never mind".
   * Does nothing on a table without the select column.
   *
   * @param {boolean} on
   * @returns {boolean} whether the mode changed
   */
  setSelectMode(on) {
    if (!this._gutter || !!on === this._selecting) return false;
    this._selecting = !!on;
    this._navCursor = this._selecting ? this._state.anchorIndex : null;
    if (this._wrapperEl) this.render();
    try {
      this.config.onSelectModeChange?.(this._selecting);
    } catch (err) {
      console.error("[DataTable] onSelectModeChange threw", err);
    }
    return true;
  }
  /** The rows the filters let through, on every page, by original index. */
  _shownIndices() {
    if (this._isServerSide()) return this.config.rows.map((_, i) => i);
    this._getProcessedRows();
    return this._processedIndexMap ? [...this._processedIndexMap] : this.config.rows.map((_, i) => i);
  }
  /** Ctrl+A and the select-all box: every row the filters let through. */
  _selectAllShown() {
    this._state.selected.clear();
    for (const i of this._shownIndices()) this._state.selected.add(i);
    this._state.anchorIndex = this.config.rows.length - 1;
    this._updateRowSelection();
    this._notifySelectionChange();
  }
  /** The select column's width: its controls, never a drag. */
  _selectColWidth() {
    return this._selecting ? this.config.selectToggle ? 56 : 32 : 32;
  }
  /** The select column's header: the toggle and, in the mode, select-all. */
  _buildSelectHead() {
    const th = document.createElement("th");
    th.className = "twm-dt-select-cell twm-dt-select-head";
    if (this._selecting) {
      const all = document.createElement("input");
      all.type = "checkbox";
      all.className = "twm-dt-select-all";
      all.setAttribute("aria-label", "Select all rows");
      all.title = "Select all rows";
      all.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const shown = this._shownIndices();
        const every = shown.length > 0 && shown.every((i) => this._state.selected.has(i));
        if (every) this.clearSelection();
        else this._selectAllShown();
      });
      th.appendChild(all);
    }
    if (this.config.selectToggle) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "material-symbols-outlined twm-dt-select-toggle";
      btn.textContent = this._selecting ? "close" : "checklist";
      btn.setAttribute("aria-pressed", this._selecting ? "true" : "false");
      const label = this._selecting ? "Stop selecting" : "Select multiple";
      btn.setAttribute("aria-label", label);
      btn.title = label;
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        this.setSelectMode(!this._selecting);
      });
      th.appendChild(btn);
    }
    th.classList.toggle("twm-dt-select-head--on", this._selecting);
    return th;
  }
  /** The select-all box: checked, mixed or clear, as the ticks are. */
  _paintSelectHead() {
    if (!this._gutter || !this._wrapperEl) return;
    const all = this._wrapperEl.querySelector(".twm-dt-select-all");
    if (!all) return;
    const shown = this._shownIndices();
    const n = shown.filter((i) => this._state.selected.has(i)).length;
    all.checked = n > 0 && n === shown.length;
    all.indeterminate = n > 0 && n < shown.length;
  }
  /** The keyboard's row in select mode, marked so it can be seen. */
  _markCursor() {
    if (!this._tbodyEl) return;
    for (const tr of this._tbodyEl.children) {
      if (tr.__rowIndex === void 0) continue;
      tr.classList.toggle("twm-dt-row--cursor", this._selecting && tr.__rowIndex === this._navCursor);
    }
  }
  _notifySelectionChange() {
    this.config.onSelectionChange?.(this.getSelection());
  }
  _ensureContextMenu() {
    if (this._contextMenuEl) return this._contextMenuEl;
    const menu = document.createElement("div");
    menu.className = "twm-context-menu data-context-menu";
    menu.setAttribute("role", "menu");
    menu.style.display = "none";
    menu.style.position = "fixed";
    menu.style.zIndex = "10001";
    menu.innerHTML = copyMenuHtml(!!this._cellGrid);
    document.body.appendChild(menu);
    menu.addEventListener("click", (event) => {
      const item = event.target.closest(".twm-context-menu-item");
      if (!item || item.classList.contains("disabled")) return;
      if (item.__cmItem) {
        event.stopPropagation();
        event.preventDefault();
        const ctx = this._contextMenuCtx;
        this._hideContextMenu();
        if (typeof item.__cmItem.onChoose === "function") {
          item.__cmItem.onChoose();
          return;
        }
        if (!ctx || typeof this.config.onContextMenuAction !== "function") return;
        try {
          this.config.onContextMenuAction(item.__cmItem.action, ctx.rowIdx, ctx.row, ctx);
        } catch (err) {
          console.error("[DataTable] onContextMenuAction threw", err);
        }
        return;
      }
      const action = item.getAttribute("data-action");
      if (action === "copy-tsv") this.copyToClipboard("tsv");
      else if (action === "copy-csv") this.copyToClipboard("csv");
      event.stopPropagation();
      event.preventDefault();
    }, { capture: true });
    menu.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    this._contextMenuEl = menu;
    return menu;
  }
  /**
   * The document-level listeners that close the copy menu — a click
   * elsewhere, a scroll, Escape, a resize — held ONLY WHILE IT IS OPEN
   * (0.5.0). They were installed the first time the menu was built and kept
   * until `dispose()`, so every table anybody had ever right-clicked kept four
   * listeners on the document for as long as the instance lived, and an
   * instance whose host was thrown away without a `dispose()` kept them for
   * the life of the page. A closed menu has nothing for them to do.
   */
  _armContextMenuGlobals() {
    if (this._contextMenuGlobals.length) return;
    const menu = this._contextMenuEl;
    const hideOnGlobal = (event) => {
      if (event?.target && menu?.contains(event.target)) return;
      this._hideContextMenu();
    };
    const onMenuKey = (event) => {
      if (event.key === "Escape") {
        this._hideContextMenu();
        return;
      }
      if (!menu || menu.style.display === "none") return;
      const focused = document.activeElement;
      if ((event.key === "Enter" || event.key === " ") && focused?.classList?.contains("twm-context-menu-item") && menu.contains(focused)) {
        event.preventDefault();
        focused.click();
        return;
      }
      moveMenuFocus(event, this._contextMenuEnabledItems());
    };
    const hideOnResize = () => this._hideContextMenu();
    document.addEventListener("click", hideOnGlobal, true);
    document.addEventListener("scroll", hideOnGlobal, true);
    window.addEventListener("resize", hideOnResize);
    document.addEventListener("keydown", onMenuKey);
    this._contextMenuGlobals.push(() => document.removeEventListener("click", hideOnGlobal, true));
    this._contextMenuGlobals.push(() => document.removeEventListener("scroll", hideOnGlobal, true));
    this._contextMenuGlobals.push(() => document.removeEventListener("keydown", onMenuKey));
    this._contextMenuGlobals.push(() => window.removeEventListener("resize", hideOnResize));
  }
  _disarmContextMenuGlobals() {
    this._contextMenuGlobals.forEach((off) => {
      try {
        off?.();
      } catch (_) {
      }
    });
    this._contextMenuGlobals = [];
  }
  _hideContextMenu() {
    const menu = this._contextMenuEl;
    const returnTo = this._contextMenuReturnFocus;
    this._contextMenuReturnFocus = null;
    const held = !!menu && menu.style.display !== "none" && menu.contains(document.activeElement);
    if (menu) {
      menu.style.display = "none";
    }
    this._disarmContextMenuGlobals();
    if (held && returnTo?.isConnected) returnTo.focus?.({ preventScroll: true });
  }
  /** BUG-0040. The items the keyboard can land on. */
  _contextMenuEnabledItems() {
    const menu = this._contextMenuEl;
    return menu ? [...menu.querySelectorAll(".twm-context-menu-item:not(.disabled)")] : [];
  }
  _showContextMenu(clientX, clientY, custom = null) {
    const menu = this._ensureContextMenu();
    this._drawContextMenuItems(menu, custom);
    this._armContextMenuGlobals();
    const hasSelection = this._state.selected.size > 0;
    menu.querySelectorAll(".twm-context-menu-item").forEach((item) => {
      if (item.__cmItem) return;
      item.classList.toggle("disabled", !hasSelection);
      item.style.pointerEvents = hasSelection ? "" : "none";
    });
    menu.querySelectorAll(".twm-context-menu-item").forEach((item) => {
      item.tabIndex = -1;
      if (!item.hasAttribute("role")) item.setAttribute("role", "menuitem");
    });
    if (!menu.contains(document.activeElement)) this._contextMenuReturnFocus = document.activeElement;
    menu.style.display = "block";
    placeMenuInViewport(menu, clientX, clientY);
    focusMenuItem(this._contextMenuEnabledItems()[0]);
  }
  /**
   * STORY-0010. The `ctx` handed to `contextMenuItems` and, later, to
   * `onContextMenuAction`: the right-clicked row and cell, and `selection`
   * (original indices, ascending) with its rows 1:1.
   */
  _contextMenuCtxFor(rowEl, target, selection) {
    const rows = this.config.rows || [];
    const rowIdx = rowEl.__rowIndex === void 0 ? null : rowEl.__rowIndex;
    const row = rowIdx === null ? null : rows[rowIdx] ?? null;
    let colIdx = null;
    const cellEl = target?.closest?.("td");
    if (cellEl && cellEl.parentNode === rowEl) {
      const domIdx = Array.prototype.indexOf.call(rowEl.children, cellEl);
      const dataIdx = this._dataIdxOfDom(domIdx);
      if (dataIdx !== null) colIdx = dataIdx;
    }
    const sel = [...selection].sort((a, b) => a - b);
    return {
      rowIdx,
      row,
      colIdx,
      value: colIdx !== null && row ? row[colIdx] : null,
      selection: sel,
      selectedRows: sel.map((i) => rows[i])
    };
  }
  /** STORY-0010. `contextMenuItems` for one right-click: none off a data row
   *  (the empty row), and none from a function that threw. */
  _customMenuItems(ctx) {
    if (ctx.rowIdx === null) return [];
    const spec = this.config.contextMenuItems;
    let items = spec;
    if (typeof spec === "function") {
      try {
        items = spec(ctx.row, ctx.rowIdx, ctx);
      } catch (err) {
        console.error("[DataTable] contextMenuItems threw", err);
        items = null;
      }
    }
    const list = Array.isArray(items) ? items.filter(Boolean) : [];
    const structural = this._structure()?.rowItems(ctx.rowIdx) || [];
    if (structural.length && list.length) list.push({ separator: true });
    return list.concat(structural);
  }
  /**
   * STORY-0010. Fill the menu for this right-click: the consumer's items,
   * then (with `copyable`) a separator and the copy items. Without custom
   * items the menu is the 0.9.1 copy menu, and is only rebuilt when the last
   * right-click drew custom ones into it. Built with DOM calls, not markup:
   * the labels are the consumer's text.
   */
  _drawContextMenuItems(menu, custom) {
    this._contextMenuCtx = custom ? custom.ctx : null;
    if (!custom) {
      if (this._contextMenuCustom) {
        menu.innerHTML = copyMenuHtml(!!this._cellGrid);
        this._contextMenuCustom = false;
      }
      return;
    }
    this._contextMenuCustom = true;
    menu.textContent = "";
    for (const item of custom.items) {
      if (item.separator) {
        const sep = document.createElement("div");
        sep.className = "twm-context-menu__separator";
        menu.appendChild(sep);
        continue;
      }
      const el = document.createElement("div");
      el.className = "twm-context-menu-item";
      if (item.action != null) el.setAttribute("data-action", String(item.action));
      if (item.danger) el.classList.add("twm-delete-node");
      if (item.disabled) {
        el.classList.add("disabled");
        el.style.pointerEvents = "none";
        el.setAttribute("aria-disabled", "true");
      }
      if (item.title) el.title = String(item.title);
      if (typeof item.checked === "boolean") {
        el.setAttribute("role", "menuitemcheckbox");
        el.setAttribute("aria-checked", String(item.checked));
      }
      const icon = document.createElement("span");
      icon.className = "material-symbols-outlined";
      icon.textContent = item.icon == null ? "" : String(item.icon);
      const label = document.createElement("span");
      label.className = "label";
      label.textContent = item.label == null ? "" : String(item.label);
      el.append(icon, label);
      el.__cmItem = item;
      menu.appendChild(el);
    }
    if (this.config.copyable && custom.copy !== false) {
      if (custom.items.length) {
        const sep = document.createElement("div");
        sep.className = "twm-context-menu__separator";
        menu.appendChild(sep);
      }
      menu.insertAdjacentHTML("beforeend", copyMenuHtml(!!this._cellGrid));
    }
  }
  _teardownContextMenu() {
    this._contextMenuGlobals.forEach((dispose) => {
      try {
        dispose?.();
      } catch (_) {
      }
    });
    this._contextMenuGlobals = [];
    if (this._contextMenuEl?.parentNode) {
      this._contextMenuEl.parentNode.removeChild(this._contextMenuEl);
    }
    this._contextMenuEl = null;
  }
  _formatValue(value, colIndex) {
    if (value == null && this.config.nullDisplay != null) {
      return String(this.config.nullDisplay);
    }
    const typed = this._formatTyped(value, colIndex);
    if (typed !== void 0) return typed;
    if (this.config.formatValue) {
      return this.config.formatValue(value, colIndex);
    }
    if (value === void 0 || value === null) return "-";
    if (typeof value === "number") {
      if (!Number.isFinite(value)) return "-";
      return Number(value.toFixed(4)).toString();
    }
    return String(value);
  }
  _csvEscape(value) {
    if (value == null) return "";
    const str = String(value);
    if (/[",\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }
  _fallbackCopy(text) {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "absolute";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      const ok2 = document.execCommand("copy");
      document.body.removeChild(textarea);
      return ok2;
    } catch (_) {
      return false;
    }
  }
  _notify(title, message, type = "info") {
    this.config.services?.eventBus?.emit?.("toast:show", { title, message, type });
  }
};

export {
  AutocompleteField,
  createTextEditor,
  CellEditorHost,
  EDITOR_MESSAGES,
  editorTypeOf,
  numberSeparators,
  parseNumber,
  formatNumberForEdit,
  parseBool,
  dateOrder,
  parseDateTime,
  formatDateTimeForEdit,
  normalizeOptions,
  parseChoice,
  createNumberEditor,
  createDateTimeEditor,
  createMultiTextEditor,
  createBoolEditor,
  createChoiceEditor,
  CELL_EDITORS,
  CellSelection,
  createRafResizeObserver,
  ISO_DATE,
  ISO_DATETIME,
  parseDateValue,
  formatDate,
  parseDatePeriod,
  parseDuration,
  formatDuration,
  matchDateFilter,
  matchDurationFilter,
  createChipsFilter,
  ACTIONS,
  DEFAULT_HISTORY_LIMIT,
  StagedHistory,
  detectSeries,
  projectSeries,
  tsvCell,
  toTSV,
  fromTSV,
  attachInlineRenamer,
  PAGING_HARD_LIMIT,
  PAGING_SOFT_LIMIT,
  resolvePaging,
  DataTable
};
//# sourceMappingURL=chunk-NIJEJAZ7.js.map
