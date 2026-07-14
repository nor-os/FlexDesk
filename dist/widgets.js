import {
  StateMachine
} from "./chunk-3PHCPZHT.js";
import {
  HelpModal,
  helpCategories,
  helpCopy,
  helpProvider,
  hideContextMenu,
  openConfirm,
  openForm,
  openModal,
  setHelpProvider,
  showContextMenu
} from "./chunk-DVU44T77.js";
import {
  ActionDropdown
} from "./chunk-TLZUUFOE.js";
import {
  DataTable,
  createRafResizeObserver
} from "./chunk-CT4YXXLP.js";
import {
  ManagedWindow
} from "./chunk-UCJ2WD4D.js";
import {
  getSetting
} from "./chunk-FL5KFNQH.js";
import {
  DragReorder
} from "./chunk-WVFGV5FT.js";
import "./chunk-JYWURG5T.js";

// src/ui/base/component_base.js
var ComponentBase = class _ComponentBase {
  constructor({ eventBus, logger } = {}) {
    if (new.target === _ComponentBase) {
      throw new Error("ComponentBase is abstract \u2013 extend it instead");
    }
    this.eventBus = eventBus;
    this.logger = logger;
    this._mounted = false;
  }
  mount() {
    throw new Error("ComponentBase.mount must be implemented by subclasses");
  }
  update() {
  }
  dispose() {
    this._mounted = false;
  }
};

// src/ui/base/controller_base.js
var ControllerBase = class _ControllerBase {
  constructor({ eventBus, dataManager, logger } = {}) {
    if (new.target === _ControllerBase) {
      throw new Error("ControllerBase is abstract \u2013 extend it instead");
    }
    this.eventBus = eventBus;
    this.dataManager = dataManager;
    this.logger = logger;
    this._disposers = /* @__PURE__ */ new Set();
  }
  /**
   * Register a disposer callback to guarantee teardown.
   */
  trackDisposer(disposer) {
    if (typeof disposer === "function") {
      this._disposers.add(disposer);
    }
  }
  /**
   * Attach controller-specific DOM/event wiring. Subclasses implement this.
   */
  initialize() {
    throw new Error("ControllerBase.initialize must be implemented by subclasses");
  }
  /**
   * Dispose all tracked resources.
   */
  dispose() {
    for (const disposer of this._disposers) {
      try {
        disposer();
      } catch (err) {
        this.logger?.error?.("ui", "Controller disposer failed", err);
      }
    }
    this._disposers.clear();
  }
};

// src/ui/base/page_base.js
var PageBase = class _PageBase {
  constructor({ eventBus, dataManager, notificationCenter, logger } = {}) {
    if (new.target === _PageBase) {
      throw new Error("PageBase is abstract \u2013 extend it instead");
    }
    this.eventBus = eventBus;
    this.dataManager = dataManager;
    this.notificationCenter = notificationCenter;
    this.logger = logger;
    this._mounted = false;
    this._initPromise = null;
  }
  /**
   * Mount the page into a DOM container. Concrete pages must override this.
   * For pages with async initialization, store the init promise:
   * `this._initPromise = this.init();`
   */
  mount() {
    throw new Error("PageBase.mount must be implemented by subclasses");
  }
  /**
   * Wait for the page to complete initialization.
   * Returns immediately if no async init or if already complete.
   * @returns {Promise<void>}
   */
  async waitForReady() {
    if (this._initPromise) {
      try {
        await this._initPromise;
      } catch (err) {
        this.logger?.warn?.("page", "Init promise rejected", err);
      }
    }
  }
  /**
   * Optional hook invoked after the initial mount to hydrate data/state.
   * For pages with async init, this should await waitForReady().
   */
  async hydrate() {
    await this.waitForReady();
  }
  /**
   * Optional hook for when the page becomes active (tab switched, etc.).
   */
  onActivated() {
  }
  /**
   * Optional hook for when the page is hidden/unmounted but not disposed.
   */
  onDeactivated() {
  }
  /**
   * Dispose resources/event subscriptions.
   */
  dispose() {
    this._mounted = false;
    this._initPromise = null;
  }
};

// src/ui/components/about_dialog.js
function createExternalLink(text, url, className) {
  const a = document.createElement("a");
  a.className = className;
  a.textContent = text;
  a.href = url;
  a.title = url;
  a.addEventListener("click", (e) => {
    e.preventDefault();
    window.open(url, "_blank");
  });
  return a;
}
function buildDepSection(title, deps) {
  const section = document.createElement("div");
  section.className = "twm-about-dialog__section";
  const heading = document.createElement("div");
  heading.className = "twm-about-dialog__section-title";
  heading.textContent = title;
  section.appendChild(heading);
  const list = document.createElement("div");
  list.className = "twm-about-dialog__dep-list";
  for (const dep of deps) {
    const row = document.createElement("div");
    row.className = "twm-about-dialog__dep";
    const link = createExternalLink(dep.name, dep.url, "twm-about-dialog__dep-name");
    row.appendChild(link);
    const lic = document.createElement("span");
    lic.className = "twm-about-dialog__dep-license";
    lic.textContent = dep.license;
    row.appendChild(lic);
    list.appendChild(row);
  }
  section.appendChild(list);
  return section;
}
function showAboutDialog(product = {}) {
  const {
    name = "Application",
    version = "",
    tagline = "",
    license = "",
    url = "",
    urlLabel = "Homepage",
    logo = "info",
    credits = []
  } = product;
  return new Promise((resolve) => {
    let resolved = false;
    const finish = () => {
      if (resolved) return;
      resolved = true;
      dialogWindow.close();
      resolve();
    };
    const contentEl = document.createElement("div");
    contentEl.className = "twm-about-dialog__content";
    const header = document.createElement("div");
    header.className = "twm-about-dialog__header";
    const logoEl = document.createElement("span");
    logoEl.className = "twm-about-dialog__logo material-symbols-outlined";
    logoEl.textContent = logo;
    header.appendChild(logoEl);
    const title = document.createElement("h2");
    title.className = "twm-about-dialog__title";
    title.textContent = name;
    header.appendChild(title);
    if (version) {
      const versionEl = document.createElement("div");
      versionEl.className = "twm-about-dialog__version";
      versionEl.textContent = `Version ${version}`;
      header.appendChild(versionEl);
    }
    if (tagline) {
      const taglineEl = document.createElement("div");
      taglineEl.className = "twm-about-dialog__tagline";
      taglineEl.textContent = tagline;
      header.appendChild(taglineEl);
    }
    contentEl.appendChild(header);
    const body = document.createElement("div");
    body.className = "twm-about-dialog__body";
    if (url || license) {
      const projectSection = document.createElement("div");
      projectSection.className = "twm-about-dialog__section";
      const projectTitle = document.createElement("div");
      projectTitle.className = "twm-about-dialog__section-title";
      projectTitle.textContent = "Project";
      projectSection.appendChild(projectTitle);
      const links = document.createElement("div");
      links.className = "twm-about-dialog__links";
      if (url) {
        const link = createExternalLink(urlLabel, url, "twm-about-dialog__link");
        const icon = document.createElement("span");
        icon.className = "material-symbols-outlined";
        icon.textContent = "open_in_new";
        link.prepend(icon);
        links.appendChild(link);
      }
      if (license) {
        const licenseSpan = document.createElement("span");
        licenseSpan.className = "twm-about-dialog__license-text";
        const licIcon = document.createElement("span");
        licIcon.className = "material-symbols-outlined";
        licIcon.textContent = "license";
        licenseSpan.appendChild(licIcon);
        licenseSpan.appendChild(document.createTextNode(`License: ${license}`));
        links.appendChild(licenseSpan);
      }
      projectSection.appendChild(links);
      body.appendChild(projectSection);
    }
    for (const section of credits) {
      body.appendChild(buildDepSection(section.title, section.deps ?? []));
    }
    contentEl.appendChild(body);
    const footer = document.createElement("div");
    footer.className = "twm-about-dialog__footer";
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "twm-about-dialog__btn twm-about-dialog__btn--close";
    closeBtn.textContent = "Close";
    closeBtn.addEventListener("click", finish);
    footer.appendChild(closeBtn);
    contentEl.appendChild(footer);
    const dialogWindow = new ManagedWindow({
      id: "about-dialog",
      title: `About ${name}`,
      icon: "info",
      content: contentEl,
      minWidth: 420,
      minHeight: 400,
      defaultWidth: 460,
      defaultHeight: 540,
      canMinimize: false,
      canMaximize: false,
      canResize: false,
      canDrag: false,
      modal: true,
      onClose: () => {
        if (!resolved) {
          resolved = true;
          resolve();
        }
      }
    });
    dialogWindow.show();
    requestAnimationFrame(() => {
      closeBtn.focus();
    });
  });
}

// src/ui/components/sortable_list.js
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
        this._dragReorder = new DragReorder({
          container: this.listEl,
          itemSelector: ".sortable-list__row",
          keyAttr: "index",
          axis: "y",
          indicatorClass: "twm-sortable-list__drop",
          draggableGuard: (e) => !!e.target.closest(".twm-sortable-list__handle"),
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
    row.className = "twm-sortable-list__row";
    row.dataset.index = index;
    if (this.allowReorder) {
      const handle = document.createElement("div");
      handle.className = "twm-sortable-list__handle";
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

// src/ui/components/attribute_list_editor.js
var SCALAR_TYPES = ["number", "integer", "string", "boolean"];
var DEFAULT_TYPES = [...SCALAR_TYPES, "expression"];
function refTypesFor(kinds = []) {
  return [
    ...kinds.map((k) => `ref:${k}`),
    ...kinds.map((k) => `list[ref:${k}]`)
  ];
}
var DEFAULT_COLUMNS = ["name", "type", "default", "value", "description"];
var COLUMN_TEMPLATES = {
  name: { label: "name", width: "minmax(140px, 1.2fr)" },
  type: { label: "type", width: "140px" },
  default: { label: "default", width: "minmax(110px, 1fr)" },
  value: { label: "value", width: "minmax(110px, 1fr)" },
  description: { label: "description", width: "minmax(160px, 2fr)" },
  required: { label: "req", width: "60px" },
  readonly: { label: "r/o", width: "60px" },
  expression: { label: "expression", width: "minmax(160px, 2fr)" },
  // Layer N3 — extended AttributeSpec fields. Opt-in via showColumns
  // so existing single-table layouts (asset_kind editor) stay tight;
  // the agent params surface includes them.
  min: { label: "min", width: "90px" },
  max: { label: "max", width: "90px" },
  step: { label: "step", width: "70px" },
  unit: { label: "unit", width: "80px" },
  distribution: { label: "dist", width: "110px" },
  // Distribution and "selection set" are two different concepts —
  // numeric params sample from a continuous distribution (uniform /
  // normal / lognormal / …), choice params pick from a discrete
  // option set. Keep them in separate columns so the user can tell
  // which is which at a glance.
  choices: { label: "choices", width: "130px" },
  // Variation-override flags — R7 in
  // docs/ARCHETYPE_RETHINK_REQUIREMENTS.md. Tight columns so they
  // stay readable next to the scalar fields.
  enabled: { label: "on", width: "50px" },
  force: { label: "lock", width: "50px" },
  optional: { label: "opt", width: "50px" }
};
var DISTRIBUTION_OPTIONS = [
  "",
  "constant",
  "uniform",
  "normal",
  "lognormal",
  "choice"
];
function _classifyRow(row, parentByName) {
  if (!parentByName) return "neutral";
  const p = parentByName.get(row.name);
  if (!p) return "neutral";
  const ourValue = row.value !== void 0 && row.value !== null ? row.value : row.default;
  const parentValue = p.value !== void 0 && p.value !== null ? p.value : p.default;
  if (ourValue === void 0 || ourValue === null) return "neutral";
  if (parentValue === void 0 || parentValue === null) return "overridden";
  if (String(ourValue) === String(parentValue)) return "inherited";
  return "overridden";
}
function mountAttributeListEditor(hostEl, options = {}) {
  const {
    items = [],
    types = DEFAULT_TYPES,
    showColumns = DEFAULT_COLUMNS,
    refResolvers = {},
    onChange = () => {
    },
    onFlush = () => {
    },
    addButtonText = "",
    emptyMessage = "No entries yet.",
    containerId = `attrs-${Math.random().toString(36).slice(2, 8)}`,
    allowReorder = true,
    allowRemove = true,
    // Layer 8.J1: parent-archetype attributes (the inherited baseline).
    // The editor uses this to classify each row as inherited / overridden /
    // neutral and to provide a revert action. Pass [] when no archetype
    // applies; the editor degrades gracefully (all rows render neutral).
    parentAttributes = null,
    createItem = () => ({
      name: "",
      type: "string",
      default: null,
      value: null,
      description: ""
    }),
    // Layer N3 — per-column renderer overrides. Callers can supply
    // `cellOverrides: {column_name: (item, callbacks, ctx) => HTMLElement | null}`
    // to swap in a custom cell. Returning `null` falls through to
    // the default renderer. The `ctx` object exposes:
    //    refreshRow()  — force a re-render (the wider list refreshes
    //                    when the row's items change, e.g. type swap).
    // Use cases: agent params' distribution-dict button cell;
    // structured-type modal openers on the default cell.
    cellOverrides = null,
    // R7 — when true, this editor is mounted as a *variation* of the
    // parent archetype (not on the archetype itself). Rows where
    // the parent has `force=true` lock their editable cells; the
    // `enabled/force/optional` flag columns themselves stay
    // read-only (variations don't author flags, only the
    // archetype does).
    variationMode = false
  } = options;
  const parentByName = parentAttributes ? new Map(parentAttributes.map((p) => [p.name, p])) : null;
  if (!hostEl) {
    return { refresh() {
    }, addItem() {
    }, dispose() {
    } };
  }
  hostEl.classList.add("twm-attr-editor");
  hostEl.style.setProperty(
    "--cols",
    showColumns.map((c) => COLUMN_TEMPLATES[c]?.width || "1fr").join(" ")
  );
  const refsCache = /* @__PURE__ */ new Map();
  const resolveRefOptions = async (target) => {
    if (refsCache.has(target)) return refsCache.get(target);
    const resolver = refResolvers[`ref:${target}`] || refResolvers[`list[ref:${target}]`];
    let list2 = [];
    if (typeof resolver === "function") {
      try {
        list2 = await resolver() || [];
      } catch (e) {
        console.warn("ref resolver failed", target, e);
      }
    }
    const normalised = (list2 || []).map((o) => {
      if (typeof o === "string") return { id: o, label: o };
      return { id: o.id ?? o.value ?? "", label: o.label ?? o.id ?? "" };
    }).filter((o) => o.id);
    refsCache.set(target, normalised);
    return normalised;
  };
  const header = document.createElement("div");
  header.className = "twm-sortable-list__row twm-attr-editor__header-row";
  if (allowReorder) {
    const handlePh = document.createElement("span");
    handlePh.className = "twm-sortable-list__handle twm-attr-editor__header-placeholder";
    header.appendChild(handlePh);
  }
  const headerContent = document.createElement("div");
  headerContent.className = "twm-sortable-list__content twm-attr-editor__headers";
  for (const col of showColumns) {
    const span = document.createElement("span");
    span.textContent = COLUMN_TEMPLATES[col]?.label ?? col;
    headerContent.appendChild(span);
  }
  header.appendChild(headerContent);
  if (allowRemove) {
    const removePh = document.createElement("span");
    removePh.className = "twm-sortable-list__remove twm-attr-editor__header-placeholder";
    header.appendChild(removePh);
  }
  hostEl.appendChild(header);
  const listHost = document.createElement("div");
  listHost.className = "ea-attr-editor__rows";
  hostEl.appendChild(listHost);
  let list = null;
  const renderRow = (contentEl, item, _idx, callbacks) => {
    contentEl.classList.add("twm-attr-editor__row");
    const cls = _classifyRow(item, parentByName);
    contentEl.classList.remove(
      "twm-attr-editor__row--inherited",
      "twm-attr-editor__row--overridden",
      "twm-attr-editor__row--neutral"
    );
    contentEl.classList.add(`twm-attr-editor__row--${cls}`);
    const parentRow = parentByName?.get(item.name);
    const flagSource = variationMode && parentRow ? parentRow : item;
    contentEl.classList.toggle(
      "twm-attr-editor__row--disabled",
      flagSource.enabled === false
    );
    contentEl.classList.toggle(
      "twm-attr-editor__row--forced",
      flagSource.force === true
    );
    contentEl.classList.toggle(
      "twm-attr-editor__row--optional",
      flagSource.optional === true
    );
    if (cls === "overridden") {
      const attention = document.createElement("span");
      attention.className = "twm-attr-editor__attention material-symbols-outlined";
      attention.textContent = "fiber_manual_record";
      attention.title = "Value overrides the parent default";
      contentEl.appendChild(attention);
    }
    for (const col of showColumns) {
      const cell = renderCell(col, item, callbacks);
      contentEl.appendChild(cell);
    }
    const FLAG_COLS = /* @__PURE__ */ new Set(["enabled", "force", "optional"]);
    if (variationMode && flagSource.force === true) {
      contentEl.querySelectorAll(
        'input:not([type="checkbox"]), select, textarea'
      ).forEach((el) => {
        el.disabled = true;
      });
    }
    if (variationMode) {
      contentEl.querySelectorAll(
        'input[type="checkbox"].ea-attr-editor__cell--flag'
      ).forEach((el) => {
        el.disabled = true;
      });
    }
    void FLAG_COLS;
    if (cls === "overridden" && parentByName) {
      const p = parentByName.get(item.name);
      const parentDefault = p?.value !== void 0 && p?.value !== null ? p.value : p?.default;
      const revert = document.createElement("button");
      revert.type = "button";
      revert.className = "twm-attr-editor__revert material-symbols-outlined";
      revert.textContent = "undo";
      revert.title = `Revert to inherited default (${parentDefault ?? "\u2014"})`;
      revert.addEventListener("click", (e) => {
        e.stopPropagation();
        callbacks.update({ value: parentDefault });
        onFlush();
        list?.setItems(currentItems());
      });
      contentEl.appendChild(revert);
    }
  };
  const renderCell = (col, item, callbacks) => {
    if (cellOverrides && typeof cellOverrides[col] === "function") {
      const ctx = { refreshRow: () => list?.setItems(currentItems()) };
      const custom = cellOverrides[col](item, callbacks, ctx);
      if (custom) return custom;
    }
    if (col === "name") return renderTextCell(item, "name", callbacks, "attr_name");
    if (col === "type") return renderTypeCell(item, callbacks);
    if (col === "description") return renderTextCell(item, "description", callbacks, "optional");
    if (col === "required") return renderBoolCell(item, "required", callbacks);
    if (col === "readonly") return renderBoolCell(item, "readonly", callbacks);
    if (col === "enabled") return renderFlagCell(item, "enabled", callbacks, true);
    if (col === "force") return renderFlagCell(item, "force", callbacks, false);
    if (col === "optional") return renderFlagCell(item, "optional", callbacks, false);
    if (col === "expression") return renderTextCell(item, "expression", callbacks, "expr");
    if (col === "min") return renderNumericCell(item, "min", callbacks);
    if (col === "max") return renderNumericCell(item, "max", callbacks);
    if (col === "step") return renderTextCell(item, "step", callbacks, "any");
    if (col === "unit") return renderTextCell(item, "unit", callbacks, "USD/%/\u2026");
    if (col === "distribution") return renderDistributionCell(item, callbacks);
    if (col === "default" || col === "value") return renderTypedValueCell(col, item, callbacks);
    const stub = document.createElement("span");
    stub.textContent = "";
    return stub;
  };
  const renderNumericCell = (item, field, callbacks) => {
    const el = document.createElement("input");
    el.type = "number";
    el.className = "twm-sortable-list__input twm-attr-editor__cell";
    el.step = "any";
    el.value = item[field] === null || item[field] === void 0 ? "" : String(item[field]);
    el.placeholder = "\u2014";
    el.addEventListener("input", () => {
      const v = el.value === "" ? null : Number(el.value);
      callbacks.update({ [field]: v });
    });
    el.addEventListener("blur", () => onFlush());
    return el;
  };
  const renderDistributionCell = (item, callbacks) => {
    const el = document.createElement("select");
    el.className = "twm-attr-editor__cell";
    for (const d of DISTRIBUTION_OPTIONS) {
      const o = document.createElement("option");
      o.value = d;
      o.textContent = d || "(none)";
      if ((item.distribution || "") === d) o.selected = true;
      el.appendChild(o);
    }
    el.addEventListener("change", () => {
      callbacks.update({ distribution: el.value || null });
      onFlush();
    });
    return el;
  };
  const renderTextCell = (item, field, callbacks, placeholder) => {
    const el = document.createElement("input");
    el.type = "text";
    el.className = "twm-sortable-list__input twm-attr-editor__cell";
    el.value = item[field] ?? "";
    el.placeholder = placeholder;
    el.addEventListener("input", () => {
      callbacks.update({ [field]: el.value });
    });
    el.addEventListener("blur", () => onFlush());
    return el;
  };
  const renderBoolCell = (item, field, callbacks) => {
    const el = document.createElement("input");
    el.type = "checkbox";
    el.className = "twm-attr-editor__cell";
    el.checked = !!item[field];
    el.addEventListener("change", () => {
      callbacks.update({ [field]: el.checked });
      onFlush();
    });
    return el;
  };
  const renderFlagCell = (item, field, callbacks, defaultIfMissing) => {
    const el = document.createElement("input");
    el.type = "checkbox";
    el.className = "twm-attr-editor__cell ea-attr-editor__cell--flag";
    const cur = item[field];
    el.checked = cur === void 0 || cur === null ? !!defaultIfMissing : !!cur;
    el.addEventListener("change", () => {
      callbacks.update({ [field]: el.checked });
      onFlush();
    });
    return el;
  };
  const renderTypeCell = (item, callbacks) => {
    const el = document.createElement("select");
    el.className = "twm-attr-editor__cell";
    const seen = /* @__PURE__ */ new Set();
    const addOpts = (label, optList) => {
      if (optList.length === 0) return;
      const grp = document.createElement("optgroup");
      grp.label = label;
      for (const t of optList) {
        const o = document.createElement("option");
        o.value = t;
        o.textContent = t;
        if (t === item.type) o.selected = true;
        grp.appendChild(o);
        seen.add(t);
      }
      el.appendChild(grp);
    };
    addOpts("scalar", types.filter((t) => SCALAR_TYPES.includes(t)));
    addOpts("expression", types.filter((t) => t === "expression"));
    addOpts("typed reference", types.filter((t) => t.startsWith("ref:")));
    addOpts(
      "list of references",
      types.filter((t) => t.startsWith("list[ref:"))
    );
    addOpts("other", types.filter((t) => !seen.has(t)));
    el.addEventListener("change", () => {
      callbacks.update({ type: el.value });
      onFlush();
      list?.setItems(currentItems());
    });
    return el;
  };
  const renderTypedValueCell = (field, item, callbacks) => {
    const t = item.type || "string";
    if (t === "boolean") {
      return renderBoolCell(item, field, callbacks);
    }
    if (t === "integer" || t === "number") {
      const el2 = document.createElement("input");
      el2.type = "number";
      el2.className = "twm-sortable-list__input twm-attr-editor__cell";
      el2.step = t === "integer" ? "1" : "any";
      el2.value = item[field] === null || item[field] === void 0 ? "" : item[field];
      el2.placeholder = field;
      el2.addEventListener("input", () => {
        const v = el2.value === "" ? null : t === "integer" ? parseInt(el2.value, 10) : Number(el2.value);
        callbacks.update({ [field]: v });
      });
      el2.addEventListener("blur", () => onFlush());
      return el2;
    }
    if (t === "expression") {
      const el2 = document.createElement("span");
      el2.className = "twm-attr-editor__cell twm-attr-editor__cell--readonly";
      el2.textContent = item.expression ? `\u2192 ${item.expression}` : "\u2014 (engine-evaluated)";
      return el2;
    }
    if (t.startsWith("ref:")) {
      return renderRefCell(t.slice(4), field, item, callbacks);
    }
    if (t.startsWith("list[ref:") && t.endsWith("]")) {
      return renderListRefCell(t.slice(9, -1), field, item, callbacks);
    }
    if (Array.isArray(item.options) && item.options.length > 0) {
      return renderEnumCell(item.options, field, item, callbacks);
    }
    const el = document.createElement("input");
    el.type = "text";
    el.className = "twm-sortable-list__input twm-attr-editor__cell";
    el.value = item[field] ?? "";
    el.placeholder = field;
    el.addEventListener("input", () => {
      callbacks.update({ [field]: el.value });
    });
    el.addEventListener("blur", () => onFlush());
    return el;
  };
  const renderRefCell = (target, field, item, callbacks) => {
    const el = document.createElement("select");
    el.className = "twm-attr-editor__cell";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = `\u2014 pick ${target} \u2014`;
    el.appendChild(placeholder);
    const populate = (opts) => {
      while (el.childNodes.length > 1) el.removeChild(el.lastChild);
      for (const o of opts) {
        const node = document.createElement("option");
        node.value = o.id;
        node.textContent = o.label;
        if (o.id === item[field]) node.selected = true;
        el.appendChild(node);
      }
    };
    if (refsCache.has(target)) {
      populate(refsCache.get(target));
    } else {
      resolveRefOptions(target).then(populate);
    }
    el.addEventListener("change", () => {
      callbacks.update({ [field]: el.value || null });
      onFlush();
    });
    return el;
  };
  const renderListRefCell = (target, field, item, callbacks) => {
    const el = document.createElement("input");
    el.type = "text";
    el.className = "twm-sortable-list__input twm-attr-editor__cell";
    const arr = Array.isArray(item[field]) ? item[field] : [];
    el.value = arr.join(", ");
    el.placeholder = `${target}, ${target}, \u2026`;
    el.addEventListener("input", () => {
      const next = el.value.split(",").map((s) => s.trim()).filter(Boolean);
      callbacks.update({ [field]: next });
    });
    el.addEventListener("blur", () => onFlush());
    return el;
  };
  const renderEnumCell = (options2, field, item, callbacks) => {
    const el = document.createElement("select");
    el.className = "twm-attr-editor__cell";
    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = "\u2014";
    if (item[field] === null || item[field] === void 0 || item[field] === "") {
      blank.selected = true;
    }
    el.appendChild(blank);
    for (const opt of options2) {
      const o = document.createElement("option");
      if (opt !== null && typeof opt === "object") {
        o.value = String(opt.value ?? opt.id ?? "");
        o.textContent = String(opt.label ?? opt.value ?? opt.id ?? "");
      } else {
        o.value = String(opt);
        o.textContent = String(opt);
      }
      if (o.value === String(item[field] ?? "")) o.selected = true;
      el.appendChild(o);
    }
    el.addEventListener("change", () => {
      callbacks.update({ [field]: el.value === "" ? null : el.value });
      onFlush();
    });
    return el;
  };
  const itemsCopy = (src) => (src || []).map((it) => ({ ...it }));
  const currentItems = () => list?.getItems?.() || itemsCopy(items);
  const buildList = (current) => {
    try {
      list?.dispose?.();
    } catch {
    }
    listHost.innerHTML = "";
    list = new SortableList({
      containerId,
      items: itemsCopy(current),
      allowReorder,
      allowRemove,
      minItems: 0,
      emptyMessage,
      addButtonText,
      createItem,
      renderItem: renderRow,
      onChange: (next) => onChange(next.map((it) => ({ ...it })))
    });
    listHost.appendChild(list.render());
  };
  buildList(items);
  return {
    addItem() {
      list?.addItem();
    },
    refresh(nextItems) {
      buildList(nextItems !== void 0 ? nextItems : currentItems());
    },
    items() {
      return currentItems();
    },
    dispose() {
      try {
        list?.dispose?.();
      } catch {
      }
      list = null;
      hostEl.innerHTML = "";
      hostEl.classList.remove("twm-attr-editor");
    }
  };
}

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
    try {
      const items = this.provider({
        value: fragment,
        scope: this.scope,
        namespace: this.selectedNamespace
      }) || [];
      this._items = Array.isArray(items) ? items : [];
      this._activeIndex = items.length > 0 ? 0 : -1;
      this.#renderDropdown();
      if (items.length > 0) {
        this.#open();
      } else {
        this.#close();
      }
    } catch (err) {
      this.logger?.warn?.("autocomplete", "Provider error", { err });
      this._items = [];
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

// src/ui/components/computing_status_window.js
var _activeWindow = null;
function showComputingWindow({ title = "Computing...", message = "", icon = "hourglass_top", onCancel } = {}) {
  if (_activeWindow) {
    _activeWindow.close();
    _activeWindow = null;
  }
  const content = document.createElement("div");
  content.className = "twm-computing-status";
  content.innerHTML = `
        <div class="twm-computing-status__spinner"></div>
        <div class="twm-computing-status__message">${message}</div>
    `;
  if (typeof onCancel === "function") {
    const btn = document.createElement("button");
    btn.className = "twm-computing-status__cancel-btn";
    btn.textContent = "Cancel";
    btn.addEventListener("click", () => {
      btn.disabled = true;
      const msgEl = content.querySelector(".twm-computing-status__message");
      if (msgEl) msgEl.textContent = "Cancelling...";
      onCancel();
    }, { once: true });
    content.appendChild(btn);
  }
  _activeWindow = new ManagedWindow({
    id: "computing-status-window",
    title,
    icon,
    content,
    minWidth: 320,
    minHeight: 140,
    defaultWidth: 380,
    defaultHeight: onCancel ? 190 : 160,
    canMinimize: true,
    canMaximize: false,
    canResize: false,
    canDrag: true,
    modal: false,
    onClose: () => {
      _activeWindow = null;
    }
  });
  _activeWindow.show();
  return {
    update(msg) {
      const el = content.querySelector(".twm-computing-status__message");
      if (el) el.textContent = msg;
    },
    close() {
      if (_activeWindow) {
        _activeWindow.close();
        _activeWindow = null;
      }
    }
  };
}

// src/ui/components/confirm_dialog.js
var dialogIdCounter = 0;
async function showConfirmDialog(options = {}) {
  const {
    title = "Confirm",
    message = "Are you sure?",
    icon = "warning",
    okLabel = "OK",
    cancelLabel = "Cancel",
    okVariant = "primary"
  } = options;
  return openConfirm({
    title,
    message,
    icon,
    confirmLabel: okLabel,
    cancelLabel,
    danger: okVariant === "danger"
  });
}
async function showDeleteConfirmDialog(options = {}) {
  const {
    itemName = "",
    itemType = "item",
    additionalMessage = ""
  } = options;
  let message = `Delete ${itemType}`;
  if (itemName) message += ` "${itemName}"`;
  message += "?";
  if (additionalMessage) message += `<br><br>${escapeHtml(additionalMessage)}`;
  return openConfirm({
    title: `Delete ${capitalize(itemType)}`,
    message,
    icon: "delete",
    confirmLabel: "Delete",
    cancelLabel: "Cancel",
    danger: true
  });
}
async function showCloseConfirmDialog(options = {}) {
  const {
    itemName = "",
    itemType = "tab"
  } = options;
  let message = `Close ${itemType}`;
  if (itemName) message += ` "${itemName}"`;
  message += "?";
  return openConfirm({
    title: `Close ${capitalize(itemType)}`,
    message,
    icon: "close",
    confirmLabel: "Close",
    cancelLabel: "Cancel"
  });
}
async function showChoiceDialog(options = {}) {
  const {
    title = "Choose",
    message = "",
    icon = "warning",
    actions = []
  } = options;
  const content = document.createElement("div");
  content.className = "twm-confirm-dialog__body";
  content.innerHTML = `
        <span class="twm-confirm-dialog__icon material-symbols-outlined">${escapeHtml(icon)}</span>
        <div class="twm-confirm-dialog__message">${escapeHtml(message)}</div>
    `;
  return openModal({
    title,
    icon,
    content,
    width: 480,
    height: 220,
    actions: actions.map((a) => ({
      label: a.label,
      value: a.value,
      primary: a.variant === "primary",
      danger: a.variant === "danger"
    }))
  });
}
async function showSelectDialog(options = {}) {
  const {
    title = "Select",
    message = "",
    items = [],
    okLabel = "OK",
    cancelLabel = "Cancel"
  } = options;
  const fields = [];
  if (message) {
    fields.push({ section: message });
  }
  fields.push({
    name: "_choice",
    label: "Choice",
    type: "select",
    default: items[0]?.value || "",
    options: items.map((i) => ({ value: i.value, label: i.label }))
  });
  void cancelLabel;
  const data = await openForm({
    title,
    submitLabel: okLabel,
    fields
  });
  if (!data) return null;
  return data._choice;
}
function escapeHtml(str) {
  if (!str) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function capitalize(str) {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}
function showRunProgressDialog(options = {}) {
  const {
    title = "Running Pipeline",
    message = "Starting\u2026",
    onCancel
  } = options;
  const dialogId = `run-progress-${++dialogIdCounter}`;
  let finished = false;
  const contentEl = document.createElement("div");
  contentEl.className = "twm-confirm-dialog__content run-progress";
  const bodyEl = document.createElement("div");
  bodyEl.className = "twm-run-progress__body";
  bodyEl.innerHTML = `
        <div class="twm-run-progress__spinner"></div>
        <div class="twm-run-progress__message">${escapeHtml(message)}</div>
    `;
  contentEl.appendChild(bodyEl);
  let stopBtn = null;
  if (typeof onCancel === "function") {
    const stopActionsEl = document.createElement("div");
    stopActionsEl.className = "twm-confirm-dialog__actions twm-run-progress__stop-actions";
    stopBtn = document.createElement("button");
    stopBtn.type = "button";
    stopBtn.className = "twm-confirm-dialog__btn twm-run-progress__stop-btn";
    stopBtn.innerHTML = '<span class="material-symbols-outlined">stop</span> Stop';
    stopBtn.addEventListener("click", () => {
      stopBtn.disabled = true;
      stopBtn.innerHTML = '<span class="material-symbols-outlined">hourglass_top</span> Stopping\u2026';
      onCancel();
    });
    stopActionsEl.appendChild(stopBtn);
    contentEl.appendChild(stopActionsEl);
  }
  const actionsEl = document.createElement("div");
  actionsEl.className = "twm-confirm-dialog__actions";
  actionsEl.style.display = "none";
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "twm-confirm-dialog__btn twm-confirm-dialog__btn--primary";
  closeBtn.textContent = "Close";
  closeBtn.addEventListener("click", () => dialogWindow.close());
  actionsEl.appendChild(closeBtn);
  contentEl.appendChild(actionsEl);
  const dialogWindow = new ManagedWindow({
    id: dialogId,
    title,
    icon: "play_arrow",
    content: contentEl,
    minWidth: 320,
    minHeight: 120,
    defaultWidth: 420,
    defaultHeight: 200,
    canMinimize: false,
    canMaximize: false,
    canResize: false,
    canDrag: false,
    modal: true
  });
  dialogWindow.show();
  const messageEl = bodyEl.querySelector(".twm-run-progress__message");
  const spinnerEl = bodyEl.querySelector(".twm-run-progress__spinner");
  return {
    update(msg) {
      if (finished || !messageEl) return;
      messageEl.textContent = msg;
    },
    complete(result) {
      if (finished) return;
      finished = true;
      if (spinnerEl) spinnerEl.style.display = "none";
      if (stopBtn) stopBtn.parentElement.style.display = "none";
      if (messageEl) {
        messageEl.textContent = result?.message || "";
        messageEl.className = `twm-run-progress__message ${result?.ok ? "is-ok" : "is-err"}`;
      }
      actionsEl.style.display = "";
    },
    cancelled(msg) {
      if (finished) return;
      finished = true;
      if (spinnerEl) spinnerEl.style.display = "none";
      if (stopBtn) stopBtn.parentElement.style.display = "none";
      if (messageEl) {
        messageEl.textContent = msg || "Cancelled.";
        messageEl.className = "twm-run-progress__message is-cancelled";
      }
      actionsEl.style.display = "";
    },
    close() {
      try {
        dialogWindow.close();
      } catch {
      }
    }
  };
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

// src/ui/components/detail_header.js
function createDetailHeader(config) {
  const header = document.createElement("header");
  header.className = "twm-detail-header";
  _populate(header, config);
  return header;
}
function updateDetailHeader(headerEl, config) {
  headerEl._renamer?.destroy();
  headerEl._renamer = null;
  headerEl.innerHTML = "";
  _populate(headerEl, config);
}
function _populate(header, config) {
  const { title, subtitle, icon, badges = [], actions = [], extraElements = [], renameable = false, onRename } = config;
  const titleRow = document.createElement("div");
  titleRow.className = "twm-detail-header__title-row";
  if (icon) {
    const iconEl = document.createElement("span");
    iconEl.className = "twm-detail-header__icon material-symbols-outlined";
    iconEl.textContent = icon;
    titleRow.appendChild(iconEl);
  }
  const nameEl = document.createElement("h2");
  nameEl.className = "twm-detail-header__name";
  nameEl.textContent = title || "";
  if (renameable) {
    nameEl.dataset.renameable = "";
    nameEl.title = "Double-click to rename";
  }
  titleRow.appendChild(nameEl);
  for (const badge of badges) {
    const badgeEl = document.createElement("span");
    badgeEl.className = `detail-header__badge${badge.className ? ` ${badge.className}` : ""}`;
    if (badge.icon) {
      const bi = document.createElement("span");
      bi.className = "material-symbols-outlined";
      bi.textContent = badge.icon;
      badgeEl.appendChild(bi);
    }
    badgeEl.appendChild(document.createTextNode(badge.text));
    titleRow.appendChild(badgeEl);
  }
  header.appendChild(titleRow);
  if (subtitle) {
    const sub = document.createElement("div");
    sub.className = "twm-detail-header__subtitle";
    sub.innerHTML = subtitle;
    header.appendChild(sub);
  }
  if (actions.length > 0 || extraElements.length > 0) {
    const actionsEl = document.createElement("div");
    actionsEl.className = "twm-detail-header__actions";
    for (const extra of extraElements) {
      actionsEl.appendChild(extra);
    }
    for (const action of actions) {
      const btn = document.createElement("button");
      btn.type = "button";
      const variant = action.variant || "secondary";
      btn.className = `twm-detail-header__btn detail-header__btn--${variant}`;
      btn.dataset.action = action.key;
      if (action.disabled) btn.disabled = true;
      if (action.title) btn.title = action.title;
      const iconSpan = document.createElement("span");
      iconSpan.className = "material-symbols-outlined";
      iconSpan.textContent = action.icon;
      btn.appendChild(iconSpan);
      btn.appendChild(document.createTextNode(` ${action.label}`));
      btn.addEventListener("click", () => action.handler?.());
      actionsEl.appendChild(btn);
    }
    header.appendChild(actionsEl);
  }
  if (renameable && onRename) {
    const renamer = attachInlineRenamer({
      label: nameEl,
      onCommit: async (newName) => {
        if (!newName?.trim()) return { success: false };
        return await onRename(newName.trim());
      }
    });
    nameEl.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      renamer.start(e);
    });
    header._renamer = renamer;
  }
}

// src/ui/components/gallery_picker.js
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c]);
}
async function mountGalleryPicker(hostEl, opts = {}) {
  const {
    kind = null,
    selectedId = null,
    onChange = () => {
    },
    entries = null,
    emptyLabel = "No starters available for this kind."
  } = opts;
  if (!hostEl) throw new Error("mountGalleryPicker: hostEl is required");
  let catalog = entries;
  if (!catalog) {
    const api = window.pywebview?.api;
    try {
      catalog = await api?.gallery_list?.(kind) || [];
    } catch (err) {
      console.warn("[gallery-picker] gallery_list failed", err);
      catalog = [];
    }
  }
  catalog = Array.isArray(catalog) ? catalog : [];
  hostEl.classList.add("twm-gallery-picker");
  if (catalog.length === 0) {
    hostEl.innerHTML = `<div class="twm-gallery-picker__empty">${esc(emptyLabel)}</div>`;
    return {
      getSelected: () => null,
      setSelectedById: () => false,
      dispose: () => {
        hostEl.classList.remove("twm-gallery-picker");
      }
    };
  }
  let selected = catalog.find((e) => e?.id === selectedId) || catalog[0];
  const render = () => {
    hostEl.innerHTML = catalog.map((e, i) => {
      const isSel = e === selected;
      const desc = e?.description ? `<p class="twm-gallery-card__desc">${esc(e.description)}</p>` : "";
      return `
                <button type="button"
                        class="twm-gallery-card ${isSel ? "is-selected" : ""}"
                        data-idx="${i}"
                        title="${esc(e?.id || "")}">
                    <span class="twm-gallery-card__label">${esc(e?.label || e?.id || "")}</span>
                    ${desc}
                </button>
            `;
    }).join("");
  };
  render();
  const onClick = (ev) => {
    const card = ev.target.closest?.(".twm-gallery-card");
    if (!card || !hostEl.contains(card)) return;
    const idx = Number(card.dataset.idx);
    const next = catalog[idx];
    if (!next || next === selected) return;
    selected = next;
    render();
    try {
      onChange(selected);
    } catch (err) {
      console.warn("[gallery-picker] onChange threw", err);
    }
  };
  hostEl.addEventListener("click", onClick);
  try {
    onChange(selected);
  } catch (err) {
    console.warn("[gallery-picker] initial onChange threw", err);
  }
  return {
    getSelected: () => selected ? { ...selected } : null,
    setSelectedById: (id) => {
      const next = catalog.find((e) => e?.id === id);
      if (!next || next === selected) return false;
      selected = next;
      render();
      try {
        onChange(selected);
      } catch (err) {
        console.warn("[gallery-picker] onChange threw", err);
      }
      return true;
    },
    dispose: () => {
      hostEl.removeEventListener("click", onClick);
      hostEl.innerHTML = "";
      hostEl.classList.remove("twm-gallery-picker");
    }
  };
}

// src/ui/components/notification_history.js
var NotificationHistory = class {
  constructor({ notificationCenter, eventBus, logger } = {}) {
    this.notificationCenter = notificationCenter;
    this.eventBus = eventBus || null;
    this.logger = logger || console;
    this.triggerEl = null;
    this.badgeEl = null;
    this.lastSeenCount = 0;
    this._popoverCleanup = null;
    this._subscriptions = [];
  }
  mount() {
    const barRight = document.querySelector(".twm-global-bottom-bar .twm-bar-right");
    if (!barRight) {
      this.logger.warn?.("[NotificationHistory] .bar-right not found");
      return;
    }
    this.triggerEl = document.createElement("button");
    this.triggerEl.className = "twm-notification-history__trigger twm-has-tooltip";
    this.triggerEl.setAttribute("data-tooltip", "Notification history");
    this.triggerEl.setAttribute("aria-label", "Notification history");
    this.triggerEl.innerHTML = '<span class="material-symbols-outlined">notifications</span><span class="twm-notification-history__badge" style="display:none">0</span>';
    this.badgeEl = this.triggerEl.querySelector(".twm-notification-history__badge");
    barRight.appendChild(this.triggerEl);
    this.triggerEl.addEventListener("click", (e) => {
      e.stopPropagation();
      this.#togglePanel();
    });
    this.lastSeenCount = this.notificationCenter?.history?.length ?? 0;
    this.#subscribeEvents();
  }
  unmount() {
    this.#closePanel();
    this._subscriptions.forEach((unsub) => {
      if (typeof unsub === "function") unsub();
    });
    this._subscriptions = [];
    if (this.triggerEl?.parentNode) {
      this.triggerEl.parentNode.removeChild(this.triggerEl);
    }
    this.triggerEl = null;
    this.badgeEl = null;
  }
  #subscribeEvents() {
    if (!this.eventBus) return;
    const badgeUpdate = () => queueMicrotask(() => this.#updateBadge());
    const events = [
      "toast:show",
      "notification:show",
      "log:entry",
      "workspace:save:failed",
      "workspace:import:failed"
    ];
    events.forEach((name) => {
      this.eventBus.on(name, badgeUpdate);
      this._subscriptions.push(() => this.eventBus.off(name, badgeUpdate));
    });
  }
  #updateBadge() {
    const historyLen = this.notificationCenter?.history?.length ?? 0;
    const unread = Math.max(0, historyLen - this.lastSeenCount);
    if (!this.badgeEl) return;
    if (unread > 0) {
      this.badgeEl.textContent = unread > 99 ? "99+" : String(unread);
      this.badgeEl.style.display = "";
    } else {
      this.badgeEl.style.display = "none";
    }
  }
  #togglePanel() {
    if (this._popoverCleanup) {
      this.#closePanel();
    } else {
      this.#openPanel();
    }
  }
  #closePanel() {
    if (typeof this._popoverCleanup === "function") {
      try {
        this._popoverCleanup();
      } catch (_) {
      }
      this._popoverCleanup = null;
    }
  }
  #openPanel() {
    this.#closePanel();
    this.lastSeenCount = this.notificationCenter?.history?.length ?? 0;
    this.#updateBadge();
    const panel = document.createElement("div");
    panel.className = "twm-notification-history__panel";
    const header = document.createElement("div");
    header.className = "twm-notification-history__header";
    header.innerHTML = '<span class="twm-notification-history__title">Notifications</span><button class="twm-notification-history__clear-btn twm-has-tooltip" data-tooltip="Clear all" aria-label="Clear all"><span class="material-symbols-outlined">delete_sweep</span></button><button class="twm-notification-history__close-btn twm-has-tooltip" data-tooltip="Close" aria-label="Close"><span class="material-symbols-outlined">close</span></button>';
    panel.appendChild(header);
    const list = document.createElement("div");
    list.className = "twm-notification-history__list";
    panel.appendChild(list);
    this.#renderList(list);
    header.querySelector(".twm-notification-history__close-btn").addEventListener("click", () => this.#closePanel());
    header.querySelector(".twm-notification-history__clear-btn").addEventListener("click", () => {
      this.notificationCenter.history.splice(0);
      this.lastSeenCount = 0;
      this.#updateBadge();
      this.#renderList(list);
    });
    document.body.appendChild(panel);
    this.#positionPanel(panel);
    const cleanup = () => {
      document.removeEventListener("mousedown", onDocDown, true);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", onResize, true);
      try {
        panel.remove();
      } catch (_) {
      }
      this._popoverCleanup = null;
    };
    this._popoverCleanup = cleanup;
    const onDocDown = (ev) => {
      if (!panel.contains(ev.target) && !this.triggerEl.contains(ev.target)) cleanup();
    };
    const onKey = (ev) => {
      if (ev.key === "Escape") cleanup();
    };
    const onResize = () => cleanup();
    document.addEventListener("mousedown", onDocDown, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", onResize, true);
  }
  #renderList(listEl) {
    listEl.innerHTML = "";
    const history = this.notificationCenter?.history ?? [];
    if (history.length === 0) {
      const empty = document.createElement("div");
      empty.className = "twm-notification-history__empty";
      empty.textContent = "No notifications";
      listEl.appendChild(empty);
      return;
    }
    const fragment = document.createDocumentFragment();
    for (let i = history.length - 1; i >= 0; i--) {
      const entry = history[i];
      const item = document.createElement("div");
      const severity = entry.severity || "info";
      item.className = `twm-notification-history__item notification-history__item--${severity}`;
      const itemHeader = document.createElement("div");
      itemHeader.className = "twm-notification-history__item-header";
      if (entry.title) {
        const titleEl = document.createElement("span");
        titleEl.className = "twm-notification-history__item-title";
        titleEl.textContent = entry.title;
        itemHeader.appendChild(titleEl);
      }
      const timeEl = document.createElement("span");
      timeEl.className = "twm-notification-history__item-time";
      timeEl.textContent = this.#formatTime(entry.timestamp);
      itemHeader.appendChild(timeEl);
      item.appendChild(itemHeader);
      const body = document.createElement("div");
      body.className = "twm-notification-history__item-body";
      body.textContent = entry.message || "";
      item.appendChild(body);
      fragment.appendChild(item);
    }
    listEl.appendChild(fragment);
  }
  #positionPanel(panel) {
    if (!this.triggerEl) return;
    const triggerRect = this.triggerEl.getBoundingClientRect();
    const panelWidth = panel.getBoundingClientRect().width;
    const gap = 8;
    let left = triggerRect.right - panelWidth;
    const vw = window.innerWidth;
    left = Math.max(8, Math.min(left, vw - panelWidth - 8));
    const bottom = window.innerHeight - (triggerRect.top - gap);
    const available = triggerRect.top - gap - 8;
    panel.style.maxHeight = `${Math.max(0, Math.min(420, Math.round(available)))}px`;
    panel.style.left = `${Math.round(left)}px`;
    panel.style.bottom = `${Math.round(bottom)}px`;
    panel.style.top = "auto";
  }
  #formatTime(timestamp) {
    if (!timestamp) return "";
    const d = new Date(timestamp);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }
};

// src/ui/components/slide_out_panel.js
var SlideOutPanel = class extends ComponentBase {
  /** @type {HTMLElement} */
  #container = null;
  /** @type {HTMLElement} */
  #backdrop = null;
  /** @type {HTMLElement} */
  #panel = null;
  /** @type {HTMLElement} */
  #headerIcon = null;
  /** @type {HTMLElement} */
  #headerTitle = null;
  /** @type {HTMLElement} */
  #body = null;
  /** @type {number} */
  #width;
  /** @type {Function|null} */
  #onClose;
  /** @type {boolean} */
  #open = false;
  /**
   * @param {object}   opts
   * @param {number}   [opts.width=380]  Panel width in px.
   * @param {Function} [opts.onClose]    Called after the panel closes.
   */
  constructor({ width = 700, onClose } = {}) {
    super();
    this.#width = width;
    this.#onClose = onClose ?? null;
  }
  // ─── Lifecycle ──────────────────────────────────────────────────────────
  /**
   * Mount the panel DOM into a host container.
   * @param {HTMLElement} container  Must have position:relative; overflow:hidden.
   */
  mount(container) {
    if (this._mounted) return;
    this.#container = container;
    this.#backdrop = document.createElement("div");
    this.#backdrop.className = "twm-slide-out-panel__backdrop";
    this.#backdrop.addEventListener("click", this.#handleBackdropClick);
    this.#panel = document.createElement("div");
    this.#panel.className = "twm-slide-out-panel";
    this.#panel.style.width = `${this.#width}px`;
    const header = document.createElement("div");
    header.className = "twm-slide-out-panel__header";
    this.#headerIcon = document.createElement("span");
    this.#headerIcon.className = "material-symbols-outlined";
    this.#headerTitle = document.createElement("span");
    this.#headerTitle.className = "twm-slide-out-panel__title";
    const closeBtn = document.createElement("button");
    closeBtn.className = "twm-slide-out-panel__close twm-btn-icon";
    closeBtn.type = "button";
    closeBtn.title = "Close";
    closeBtn.innerHTML = '<span class="material-symbols-outlined">close</span>';
    closeBtn.addEventListener("click", this.#handleCloseClick);
    header.append(this.#headerIcon, this.#headerTitle, closeBtn);
    this.#body = document.createElement("div");
    this.#body.className = "twm-slide-out-panel__body";
    this.#panel.append(header, this.#body);
    this.#container.append(this.#backdrop, this.#panel);
    this._mounted = true;
  }
  dispose() {
    this.close();
    this.#backdrop?.remove();
    this.#panel?.remove();
    this.#backdrop = null;
    this.#panel = null;
    this.#body = null;
    this.#container = null;
    super.dispose();
  }
  // ─── Public API ─────────────────────────────────────────────────────────
  /** The inner content element — callers render config into this. */
  get contentEl() {
    return this.#body;
  }
  get isOpen() {
    return this.#open;
  }
  /**
   * Open (or re-open) the panel with a new title/icon.
   * Clears previous content. Returns contentEl for rendering.
   * @param {string} title
   * @param {string} icon  Material Symbols icon name.
   * @returns {HTMLElement} contentEl
   */
  open(title, icon) {
    if (!this._mounted) return null;
    this.#body.innerHTML = "";
    this.#headerIcon.textContent = icon || "";
    this.#headerIcon.style.display = icon ? "" : "none";
    this.#headerTitle.textContent = title || "";
    if (!this.#open) {
      this.#open = true;
      this.#backdrop.classList.add("twm-slide-out-panel__backdrop--visible");
      this.#panel.classList.add("twm-slide-out-panel--open");
      document.addEventListener("keydown", this.#handleEsc);
      this.#trackGeometry();
      window.addEventListener("scroll", this.#trackGeometry, true);
      window.addEventListener("resize", this.#trackGeometry);
    }
    return this.#body;
  }
  /** Close the panel and clear content. */
  close() {
    if (!this.#open) return;
    this.#open = false;
    this.#panel.classList.remove("twm-slide-out-panel--open");
    this.#backdrop.classList.remove("twm-slide-out-panel__backdrop--visible");
    document.removeEventListener("keydown", this.#handleEsc);
    window.removeEventListener("scroll", this.#trackGeometry, true);
    window.removeEventListener("resize", this.#trackGeometry);
    this.#body.innerHTML = "";
    this.#onClose?.();
  }
  // ─── Event handlers (arrow fns for stable `this`) ───────────────────────
  #handleBackdropClick = () => {
    this.close();
  };
  #handleCloseClick = () => {
    this.close();
  };
  #handleEsc = (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      this.close();
    }
  };
  /** Pin the panel to the right edge of its host's *visible* frame
   *  using `position: fixed`. Re-run on every scroll/resize so the
   *  panel always overlays the host correctly even when the host
   *  itself sits inside a scrolled ancestor. */
  #trackGeometry = () => {
    if (!this.#open || !this.#panel || !this.#container) return;
    const r = this.#container.getBoundingClientRect();
    const s = this.#panel.style;
    s.position = "fixed";
    s.top = `${Math.round(r.top)}px`;
    s.left = `${Math.round(r.right - this.#width)}px`;
    s.right = "auto";
    s.height = `${Math.round(r.height)}px`;
  };
};

// src/ui/components/slider_field.js
var SliderField = class {
  constructor({ fieldId, field = {}, onChange = null, logger = null } = {}) {
    if (!fieldId) {
      throw new Error("SliderField requires a fieldId");
    }
    this.fieldId = fieldId;
    this.field = field;
    this.logger = logger;
    this.onChange = typeof onChange === "function" ? onChange : null;
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
    this.root = document.createElement("div");
    this.root.className = "twm-slider-field";
    this.sliderInput = document.createElement("input");
    this.sliderInput.type = "range";
    this.sliderInput.className = "twm-slider-field__input";
    this.sliderInput.min = this.#coerceNumber(this.field.min, 0);
    this.sliderInput.max = this.#coerceNumber(this.field.max, 100);
    this.sliderInput.step = this.#coercePositiveNumber(this.field.step, 1);
    this.sliderInput.value = this.#coerceNumber(this.field.value, Number(this.sliderInput.min));
    if (this.field.disabled) {
      this.sliderInput.disabled = true;
    }
    const stopDrag = (evt) => {
      evt.stopPropagation();
      evt.stopImmediatePropagation();
    };
    this.sliderInput.addEventListener("mousedown", stopDrag, { capture: true });
    this.sliderInput.addEventListener("touchstart", stopDrag, { passive: false, capture: true });
    this._disposers.push(() => this.sliderInput.removeEventListener("mousedown", stopDrag, { capture: true }));
    this._disposers.push(() => this.sliderInput.removeEventListener("touchstart", stopDrag, { passive: false, capture: true }));
    this.helperEl = document.createElement("div");
    this.helperEl.className = "twm-slider-field__helper";
    if (this.field.helperText) {
      this.helperEl.textContent = this.field.helperText;
    }
    this.root.appendChild(this.sliderInput);
    this.root.appendChild(this.helperEl);
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
    this.sliderInput.addEventListener("input", handleInput);
    this.sliderInput.addEventListener("change", handleChange);
    this._disposers.push(() => this.sliderInput.removeEventListener("input", handleInput));
    this._disposers.push(() => this.sliderInput.removeEventListener("change", handleChange));
    return this.root;
  }
  dispose() {
    this._disposers.forEach((dispose) => {
      try {
        dispose?.();
      } catch (error) {
        this.logger?.warn?.("twm-slider-field", "Failed to dispose slider listener", { error });
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
};

// src/ui/components/table_state_store.js
function createTableStateStore({ host, key, logger = console, debounceMs = 500 }) {
  if (!key) throw new Error("createTableStateStore requires { key }");
  const state = host?.state || null;
  let cache = null;
  let loadPromise = null;
  let saveTimer = null;
  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      saveTimer = null;
      if (!state || !cache) return;
      try {
        await state.write(key, cache);
      } catch (err) {
        logger.warn?.("[table-state] save failed", err);
      }
    }, debounceMs);
  };
  return {
    /** Resolve once the persisted blob has been read into the cache. Safe
     *  to call repeatedly — the read happens at most once per project. */
    ready() {
      if (loadPromise) return loadPromise;
      loadPromise = (async () => {
        if (!state) {
          cache = {};
          return cache;
        }
        try {
          cache = await state.read(key) || {};
        } catch (err) {
          logger.warn?.("[table-state] load failed", err);
          cache = {};
        }
        return cache;
      })();
      return loadPromise;
    },
    /** Synchronous read of a table's persisted state. Returns null until
     *  the cache is loaded (await `ready()` first to be sure). */
    get(k) {
      if (!k || !cache) return null;
      return cache[k] || null;
    },
    /** Merge-and-persist a table's state (debounced). Pass null to forget
     *  a key. Writes the whole map back atomically through the host. */
    set(k, s) {
      if (!k) return;
      if (!cache) cache = {};
      if (s == null) delete cache[k];
      else cache[k] = s;
      scheduleSave();
    },
    /** Drop the cache + pending read so the next access reloads from the
     *  newly-opened project. Cancels any in-flight save for the old one. */
    reset() {
      cache = null;
      loadPromise = null;
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
    }
  };
}

// src/ui/components/toast.js
function _bus() {
  return window.__ecoagent?.eventBus ?? null;
}
function _emit(severity, persistent, titleOrMsg, msg) {
  const bus = _bus();
  const title = msg !== void 0 ? titleOrMsg : null;
  const message = msg !== void 0 ? msg : titleOrMsg;
  if (!bus) {
    (severity === "error" || severity === "warn" ? console.warn : console.info)(
      `[toast/${severity}]`,
      title ? `${title}:` : "",
      message
    );
    return;
  }
  bus.emit("toast:show", {
    title,
    message,
    severity,
    persistent,
    durationMs: persistent ? 0 : 5e3
  });
}
function toastError(titleOrMsg, msg) {
  _emit("error", true, titleOrMsg, msg);
}
function toastWarn(titleOrMsg, msg) {
  _emit("warn", false, titleOrMsg, msg);
}
function toastInfo(titleOrMsg, msg) {
  _emit("info", false, titleOrMsg, msg);
}
function toastSuccess(titleOrMsg, msg) {
  _emit("success", false, titleOrMsg, msg);
}
function reportBridgeError(opName, resOrErr) {
  if (!resOrErr) return true;
  if (resOrErr instanceof Error) {
    toastError(opName, resOrErr.message || String(resOrErr));
    return false;
  }
  if (resOrErr && resOrErr.ok === false) {
    toastError(opName, resOrErr.error || "operation refused");
    return false;
  }
  return true;
}

// src/ui/components/tree_view.js
function createTreeCategory(options) {
  const {
    id,
    label,
    icon = "folder",
    iconClass = "",
    count = 0,
    expanded = false,
    readonly = false
  } = options;
  const node = document.createElement("div");
  node.className = "twm-collapsible-box twm-tree-category";
  node.dataset.categoryId = id;
  node.dataset.collapsibleId = `tree-category-${id}`;
  node.dataset.collapsibleDefault = expanded ? "expanded" : "collapsed";
  if (readonly) node.dataset.readonly = "true";
  node.innerHTML = `
        <div class="twm-collapsible-header" data-collapsible-header="true">
            <button class="twm-arrow-toggle" type="button">
                <span class="twm-collapsible-arrow material-symbols-outlined${expanded ? "" : " collapsed"}">expand_more</span>
            </button>
            <span class="twm-tree-category__icon ${iconClass}">
                <span class="material-symbols-outlined">${icon}</span>
            </span>
            <span class="twm-tree-category__label">${label}</span>
            <span class="twm-tree-category__count">(${count})</span>
        </div>
        <div class="twm-collapsible-content${expanded ? " visible" : ""}" data-collapsible-content="true"></div>
    `;
  return node;
}
function createTreeNode(options) {
  const {
    id,
    label,
    icon = null,
    count = 0,
    expanded = false,
    readonly = false,
    actions = null
  } = options;
  const node = document.createElement("div");
  node.className = `twm-tree-node${readonly ? " readonly" : ""}`;
  node.dataset.nodeId = id;
  const iconHtml = icon ? `<span class="twm-tree-node__icon"><span class="material-symbols-outlined">${icon}</span></span>` : "";
  const actionsHtml = actions ? '<span class="twm-tree-node__actions"></span>' : "";
  node.innerHTML = `
        <div class="twm-tree-node__header">
            <span class="twm-tree-node__toggle">
                <span class="material-symbols-outlined">${expanded ? "expand_more" : "chevron_right"}</span>
            </span>
            ${iconHtml}
            <span class="twm-tree-node__label">${label}</span>
            <span class="twm-tree-node__count">(${count})</span>
            ${actionsHtml}
        </div>
        <div class="twm-tree-node__children" style="display: ${expanded ? "block" : "none"};"></div>
    `;
  if (actions) {
    const actionsEl = node.querySelector(".twm-tree-node__actions");
    Object.entries(actions).forEach(([actionId, actionConfig]) => {
      const btn = document.createElement("button");
      btn.className = "twm-tree-node__action-btn";
      btn.dataset.action = actionId;
      btn.title = actionConfig.title || actionId;
      btn.innerHTML = `<span class="material-symbols-outlined">${actionConfig.icon}</span>`;
      if (actionConfig.onClick) {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          actionConfig.onClick(id, e);
        });
      }
      actionsEl.appendChild(btn);
    });
  }
  return node;
}
function createTreeItem(options) {
  const {
    id,
    label,
    icon = null,
    isMaterialIcon = true,
    readonly = false,
    selected = false,
    subtitle = null,
    data = null,
    badge = null
  } = options;
  const item = document.createElement("div");
  item.className = `twm-tree-item${readonly ? " readonly" : ""}${selected ? " selected" : ""}`;
  item.dataset.itemId = id;
  if (data) {
    Object.entries(data).forEach(([key, value]) => {
      item.dataset[key] = value;
    });
  }
  const iconHtml = icon ? isMaterialIcon ? `<span class="twm-tree-item__icon"><span class="material-symbols-outlined">${icon}</span></span>` : `<span class="twm-tree-item__icon twm-tree-item__icon--symbol">${icon}</span>` : "";
  const subtitleHtml = subtitle ? `<span class="twm-tree-item__subtitle">${subtitle}</span>` : "";
  let badgeHtml = "";
  if (badge) {
    const variant = badge.variant || "muted";
    if (badge.text) {
      badgeHtml = `<span class="twm-tree-item__badge tree-item__badge--${variant}">${badge.text}</span>`;
    } else {
      badgeHtml = `<span class="twm-tree-item__status-dot tree-item__status-dot--${variant}"></span>`;
    }
  }
  item.innerHTML = `
        ${iconHtml}
        <span class="twm-tree-item__label">${label}</span>
        ${subtitleHtml}
        ${badgeHtml}
    `;
  return item;
}
function toggleCategory(categoryEl, force) {
  if (!categoryEl) return;
  const arrow = categoryEl.querySelector(":scope > .twm-collapsible-header .twm-collapsible-arrow");
  const content = categoryEl.querySelector(":scope > .twm-collapsible-content");
  if (!content) return;
  const isCurrentlyExpanded = content.classList.contains("visible");
  const shouldExpand = force !== void 0 ? force : !isCurrentlyExpanded;
  if (shouldExpand) {
    if (arrow) {
      arrow.classList.remove("collapsed");
    }
    content.classList.add("visible");
  } else {
    if (arrow) {
      arrow.classList.add("collapsed");
    }
    content.classList.remove("visible");
  }
}
function toggleNode(nodeEl, force) {
  if (!nodeEl) return;
  const toggle = nodeEl.querySelector(":scope > .twm-tree-node__header .twm-tree-node__toggle .material-symbols-outlined");
  const children = nodeEl.querySelector(":scope > .twm-tree-node__children");
  if (!children) return;
  const isExpanded = force !== void 0 ? force : children.style.display === "none";
  if (isExpanded) {
    children.style.display = "block";
    if (toggle) toggle.textContent = "expand_more";
  } else {
    children.style.display = "none";
    if (toggle) toggle.textContent = "chevron_right";
  }
}
function filterTree(container, filter, options = {}) {
  const { expandMatches = true } = options;
  const normalizedFilter = (filter || "").toLowerCase().trim();
  const items = container.querySelectorAll(".twm-tree-item");
  const nodes = container.querySelectorAll(".twm-tree-node");
  const categories = container.querySelectorAll(".twm-tree-category");
  items.forEach((item) => {
    const label = item.querySelector(".twm-tree-item__label")?.textContent || "";
    const matches = !normalizedFilter || label.toLowerCase().includes(normalizedFilter);
    item.style.display = matches ? "" : "none";
    item.classList.toggle("twm-filter-match", matches && !!normalizedFilter);
  });
  nodes.forEach((node) => {
    const visibleChildren = node.querySelectorAll('.twm-tree-item:not([style*="display: none"])');
    const hasVisibleChildren = visibleChildren.length > 0;
    node.style.display = hasVisibleChildren ? "" : "none";
    if (expandMatches && hasVisibleChildren && normalizedFilter) {
      toggleNode(node, true);
    }
  });
  categories.forEach((category) => {
    const visibleNodes = category.querySelectorAll('.twm-tree-node:not([style*="display: none"])');
    const hasVisibleNodes = visibleNodes.length > 0;
    category.style.display = hasVisibleNodes ? "" : "none";
    if (expandMatches && hasVisibleNodes && normalizedFilter) {
      toggleCategory(category, true);
    }
  });
}
function selectItem(container, itemId, options = {}) {
  const { scrollIntoView = true, expandParents = true } = options;
  container.querySelectorAll(".twm-tree-item.selected").forEach((el) => {
    el.classList.remove("selected");
  });
  const item = container.querySelector(`.twm-tree-item[data-item-id="${itemId}"]`);
  if (!item) return null;
  item.classList.add("selected");
  if (expandParents) {
    let parent = item.parentElement;
    while (parent && parent !== container) {
      if (parent.classList.contains("twm-tree-node__children")) {
        const node = parent.closest(".twm-tree-node");
        if (node) toggleNode(node, true);
      }
      if (parent.classList.contains("twm-collapsible-content")) {
        const category = parent.closest(".twm-tree-category");
        if (category) toggleCategory(category, true);
      }
      parent = parent.parentElement;
    }
  }
  if (scrollIntoView) {
    item.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  return item;
}
var TreeView = class {
  constructor(container, options = {}) {
    this.container = container;
    this.options = {
      onItemClick: null,
      onItemDoubleClick: null,
      onNodeToggle: null,
      onCategoryToggle: null,
      ...options
    };
    this._boundHandleClick = this._handleClick.bind(this);
    this._boundHandleDblClick = this._handleDoubleClick.bind(this);
    if (container) {
      container.classList.add("twm-tree-view");
      container.addEventListener("click", this._boundHandleClick);
      container.addEventListener("dblclick", this._boundHandleDblClick);
    }
  }
  _handleClick(e) {
    const collapsibleHeader = e.target.closest(".twm-collapsible-header");
    if (collapsibleHeader) {
      const category = collapsibleHeader.closest(".twm-tree-category");
      if (category) {
        toggleCategory(category);
        this.options.onCategoryToggle?.(category.dataset.categoryId, category);
      }
      return;
    }
    const nodeHeader = e.target.closest(".twm-tree-node__header");
    if (nodeHeader) {
      const node = nodeHeader.closest(".twm-tree-node");
      if (node) {
        toggleNode(node);
        this.options.onNodeToggle?.(node.dataset.nodeId, node);
      }
      return;
    }
    const item = e.target.closest(".twm-tree-item");
    if (item) {
      this.select(item.dataset.itemId);
      this.options.onItemClick?.(item.dataset.itemId, item, e);
    }
  }
  _handleDoubleClick(e) {
    const item = e.target.closest(".twm-tree-item");
    if (item) {
      this.options.onItemDoubleClick?.(item.dataset.itemId, item, e);
    }
  }
  addCategory(options) {
    const category = createTreeCategory(options);
    this.container.appendChild(category);
    return category;
  }
  addNode(categoryId, options) {
    const category = this.container.querySelector(`.twm-tree-category[data-category-id="${categoryId}"]`);
    const content = category?.querySelector(".twm-collapsible-content");
    if (!content) return null;
    const node = createTreeNode(options);
    content.appendChild(node);
    return node;
  }
  addItem(nodeId, options) {
    const node = this.container.querySelector(`.twm-tree-node[data-node-id="${nodeId}"]`);
    const children = node?.querySelector(".twm-tree-node__children");
    if (!children) return null;
    const item = createTreeItem(options);
    children.appendChild(item);
    return item;
  }
  select(itemId) {
    return selectItem(this.container, itemId);
  }
  filter(text) {
    filterTree(this.container, text);
  }
  clear() {
    this.container.innerHTML = "";
  }
  dispose() {
    if (this.container) {
      this.container.removeEventListener("click", this._boundHandleClick);
      this.container.removeEventListener("dblclick", this._boundHandleDblClick);
    }
  }
};

// src/ui/components/window_taskbar.js
var WindowTaskbarManager = class {
  constructor() {
    this._minimizedWindows = /* @__PURE__ */ new Map();
    this._containerEl = null;
    this._leftDivider = null;
    this._rightDivider = null;
    this._initialized = false;
  }
  /**
   * Initialize the taskbar. Call once after DOM is ready.
   */
  init() {
    if (this._initialized) return;
    const bottomBar = document.querySelector(".twm-global-bottom-bar");
    if (!bottomBar) {
      console.warn("[WindowTaskbar] twm-global-bottom-bar not found");
      return;
    }
    this._leftDivider = document.createElement("div");
    this._leftDivider.className = "twm-bar-windows__divider twm-bar-windows__divider--left";
    this._containerEl = document.createElement("div");
    this._containerEl.className = "twm-bar-windows";
    this._rightDivider = document.createElement("div");
    this._rightDivider.className = "twm-bar-windows__divider twm-bar-windows__divider--right";
    const barCenter = bottomBar.querySelector(".twm-bar-center");
    if (barCenter) {
      bottomBar.insertBefore(this._rightDivider, barCenter);
      bottomBar.insertBefore(this._containerEl, this._rightDivider);
      bottomBar.insertBefore(this._leftDivider, this._containerEl);
    } else {
      bottomBar.appendChild(this._leftDivider);
      bottomBar.appendChild(this._containerEl);
      bottomBar.appendChild(this._rightDivider);
    }
    window.addEventListener("managed-window-minimized", (e) => this._onWindowMinimized(e));
    window.addEventListener("managed-window-restored", (e) => this._onWindowRestored(e));
    window.addEventListener("managed-window-closed", (e) => this._onWindowClosed(e));
    this._initialized = true;
    this._updateDividers();
  }
  /**
   * Handle window minimized event.
   */
  _onWindowMinimized(e) {
    const { id, title, icon } = e.detail;
    this._minimizedWindows.set(id, { title, icon });
    this._render();
  }
  /**
   * Handle window restored event.
   */
  _onWindowRestored(e) {
    const { id } = e.detail;
    this._minimizedWindows.delete(id);
    this._render();
  }
  /**
   * Handle window closed event.
   */
  _onWindowClosed(e) {
    const { id } = e.detail;
    this._minimizedWindows.delete(id);
    this._render();
  }
  /**
   * Update divider visibility based on window count.
   */
  _updateDividers() {
    const hasWindows = this._minimizedWindows.size > 0;
    if (this._leftDivider) {
      this._leftDivider.style.display = hasWindows ? "" : "none";
    }
    if (this._rightDivider) {
      this._rightDivider.style.display = hasWindows ? "" : "none";
    }
  }
  /**
   * Render the taskbar buttons.
   */
  _render() {
    if (!this._containerEl) return;
    this._containerEl.innerHTML = "";
    for (const [id, { title, icon }] of this._minimizedWindows) {
      const btn = document.createElement("button");
      btn.className = "twm-bar-windows__item";
      btn.setAttribute("data-window-id", id);
      btn.title = `Restore: ${title}`;
      if (icon) {
        const iconEl = document.createElement("span");
        iconEl.className = "twm-bar-windows__item-icon material-symbols-outlined";
        iconEl.textContent = icon;
        btn.appendChild(iconEl);
      }
      const titleEl = document.createElement("span");
      titleEl.className = "twm-bar-windows__item-title";
      titleEl.textContent = title;
      btn.appendChild(titleEl);
      btn.addEventListener("click", () => {
        ManagedWindow.restore(id);
      });
      this._containerEl.appendChild(btn);
    }
    this._updateDividers();
  }
};
var WindowTaskbar = new WindowTaskbarManager();

// src/ui/controllers/panel_state_machine.js
var PANEL_STATES = Object.freeze({
  DISABLED: "disabled",
  HIDDEN: "hidden",
  ON_DEMAND: "on-demand",
  PINNED: "pinned"
});
var PANEL_TRANSITIONS = Object.freeze({
  ENABLE: "panel:mode:enable",
  ENABLE_PINNED: "panel:mode:enable-pinned",
  ENABLE_HIDDEN: "panel:mode:enable-hidden",
  DISABLE: "panel:mode:disable",
  PIN: "panel:pin",
  UNPIN: "panel:unpin",
  SHOW: "panel:show",
  HIDE: "panel:hide"
});
var PanelStateMachine = class {
  /** @type {StateMachine} */
  #machine;
  /** @type {import('../../core/event_bus.js').default} */
  #eventBus;
  /** @type {object|null} */
  #logger;
  // ── Identity ────────────────────────────────────────────────────────────
  #name;
  // ── DOM delegation ──────────────────────────────────────────────────────
  #callbacks;
  // ── Persistence / config ────────────────────────────────────────────────
  #persistenceKey;
  #supportsCollapse = false;
  // ── Trigger-based visibility (on-demand state) ──────────────────────────
  #triggerCount = 0;
  // ── Orthogonal state ────────────────────────────────────────────────────
  // null initial value ensures the first #applyVisibility call always fires
  // onShow/onHide to synchronize DOM with FSM state (the DOM starts without
  // any hidden class, so we must not assume it matches #visible = false).
  #visible = null;
  #collapsed = false;
  #height = null;
  // ── Overrides ───────────────────────────────────────────────────────────
  #overrideHidden = false;
  #widgetConfigActive = false;
  // ── Persisted pin (read before first enable) ────────────────────────────
  #persistedPinned = false;
  // ── Config: which state to enter when enable() is called and not pinned ──
  #unpinnedState;
  /**
   * @param {object} config
   * @param {string} config.name                Panel identity ('right', 'bottom', etc.)
   * @param {import('../../core/event_bus.js').default} config.eventBus
   * @param {object}  [config.logger]
   * @param {string}  config.persistenceKey     localStorage key
   * @param {boolean} [config.defaultPinned]     Default pin state when no persisted data exists
   * @param {string}  [config.unpinnedState]     State for enable() when not pinned: 'on-demand' (default) or 'hidden'
   * @param {object}  config.callbacks           DOM manipulation hooks:
   * @param {Function} config.callbacks.onShow             (reason) => void
   * @param {Function} config.callbacks.onHide             (reason) => void
   * @param {Function} config.callbacks.onDisable          () => void
   * @param {Function} config.callbacks.onEnable           () => void
   * @param {Function} [config.callbacks.onPinChanged]     (pinned) => void
   * @param {Function} [config.callbacks.onVisibilityChanged] (visible) => void
   * @param {Function} [config.callbacks.onCollapseChanged]   (collapsed, height) => void
   */
  constructor(config) {
    this.#name = config.name;
    this.#eventBus = config.eventBus;
    this.#logger = config.logger ?? null;
    this.#callbacks = config.callbacks;
    this.#persistenceKey = config.persistenceKey;
    this.#persistedPinned = config.defaultPinned ?? false;
    this.#unpinnedState = config.unpinnedState ?? PANEL_STATES.ON_DEMAND;
    const self = this;
    this.#machine = new StateMachine({
      name: `panel-${config.name}`,
      initialState: PANEL_STATES.DISABLED,
      states: {
        [PANEL_STATES.DISABLED]: {
          onEnter() {
            self.#onEnterDisabled();
          },
          transitions: {
            [PANEL_TRANSITIONS.ENABLE]: { target: PANEL_STATES.ON_DEMAND },
            [PANEL_TRANSITIONS.ENABLE_PINNED]: { target: PANEL_STATES.PINNED },
            [PANEL_TRANSITIONS.ENABLE_HIDDEN]: { target: PANEL_STATES.HIDDEN }
          }
        },
        [PANEL_STATES.HIDDEN]: {
          onEnter() {
            self.#onEnterHidden();
          },
          transitions: {
            [PANEL_TRANSITIONS.DISABLE]: { target: PANEL_STATES.DISABLED },
            [PANEL_TRANSITIONS.SHOW]: { target: PANEL_STATES.PINNED }
          }
        },
        [PANEL_STATES.ON_DEMAND]: {
          onEnter() {
            self.#onEnterOnDemand();
          },
          onExit() {
            self.#onExitOnDemand();
          },
          transitions: {
            [PANEL_TRANSITIONS.DISABLE]: { target: PANEL_STATES.DISABLED },
            [PANEL_TRANSITIONS.PIN]: { target: PANEL_STATES.PINNED }
          }
        },
        [PANEL_STATES.PINNED]: {
          onEnter() {
            self.#onEnterPinned();
          },
          transitions: {
            [PANEL_TRANSITIONS.DISABLE]: { target: PANEL_STATES.DISABLED },
            [PANEL_TRANSITIONS.UNPIN]: { target: PANEL_STATES.ON_DEMAND },
            [PANEL_TRANSITIONS.HIDE]: { target: PANEL_STATES.HIDDEN }
          }
        }
      },
      eventBus: config.eventBus,
      logger: config.logger
    });
  }
  // ═══════════════════════════════════════════════════════════════════════
  //  Queries
  // ═══════════════════════════════════════════════════════════════════════
  /** Current FSM state. */
  getState() {
    return this.#machine.getState();
  }
  /** True when in pinned state. */
  isPinned() {
    return this.getState() === PANEL_STATES.PINNED;
  }
  /** True when in disabled state. */
  isDisabled() {
    return this.getState() === PANEL_STATES.DISABLED;
  }
  /** True when in hidden state (not visible, but toggle enabled). */
  isHidden() {
    return this.getState() === PANEL_STATES.HIDDEN;
  }
  /** True when the panel is currently visible to the user. */
  isVisible() {
    return this.#visible;
  }
  /** True when the panel is collapsed (bottom panel only). */
  isCollapsed() {
    return this.#collapsed;
  }
  /** Current stored height (for collapse restore). */
  getHeight() {
    return this.#height;
  }
  /** Whether widget config override is active. */
  get widgetConfigActive() {
    return this.#widgetConfigActive;
  }
  /** Whether collapse operations are supported (runtime-configurable per mode). */
  get supportsCollapse() {
    return this.#supportsCollapse;
  }
  set supportsCollapse(value) {
    this.#supportsCollapse = Boolean(value);
  }
  // ═══════════════════════════════════════════════════════════════════════
  //  Mode transitions (called by ApplicationShell._switchMode)
  // ═══════════════════════════════════════════════════════════════════════
  /**
   * Enable the panel for the current mode.
   *
   * With no argument, transitions from disabled → on-demand, hidden, or
   * pinned based on persisted pin state and unpinnedState config.
   *
   * With an explicit `initialState`, forces that specific target state
   * regardless of persistence. Useful when a mode always needs a specific
   * starting state (e.g. ETL designer always starts as on-demand).
   *
   * If already enabled (hidden, on-demand, or pinned), this is a no-op.
   *
   * Note: getState() can return null during the StateMachine's async init
   * microtask. We treat null the same as disabled — the transition() call
   * internally awaits _ready, so the machine will be in 'disabled' by the
   * time the transition executes.
   *
   * @param {string} [initialState] Force a specific target state: 'on-demand', 'hidden', or 'pinned'
   */
  enable(initialState) {
    const state = this.getState();
    if (state !== PANEL_STATES.DISABLED && state !== null) return;
    if (initialState === PANEL_STATES.ON_DEMAND) {
      this.#machine.transition(PANEL_TRANSITIONS.ENABLE);
    } else if (initialState === PANEL_STATES.HIDDEN) {
      this.#machine.transition(PANEL_TRANSITIONS.ENABLE_HIDDEN);
    } else if (initialState === PANEL_STATES.PINNED) {
      this.#machine.transition(PANEL_TRANSITIONS.ENABLE_PINNED);
    } else if (this.#persistedPinned) {
      this.#machine.transition(PANEL_TRANSITIONS.ENABLE_PINNED);
    } else if (this.#unpinnedState === PANEL_STATES.HIDDEN) {
      this.#machine.transition(PANEL_TRANSITIONS.ENABLE_HIDDEN);
    } else {
      this.#machine.transition(PANEL_TRANSITIONS.ENABLE);
    }
  }
  /**
   * Disable the panel for the current mode.
   * Transitions from any enabled state → disabled.
   * If already disabled (or null during async init), this is a no-op.
   */
  disable() {
    const state = this.getState();
    if (state === PANEL_STATES.DISABLED || state === null) return;
    this.#machine.transition(PANEL_TRANSITIONS.DISABLE);
  }
  // ═══════════════════════════════════════════════════════════════════════
  //  Pin (called by toggle button click)
  // ═══════════════════════════════════════════════════════════════════════
  /** Toggle between on-demand and pinned. No-op if disabled. */
  togglePin() {
    const state = this.getState();
    if (state === PANEL_STATES.ON_DEMAND) {
      this.pin();
    } else if (state === PANEL_STATES.PINNED) {
      this.unpin();
    }
  }
  /** on-demand → pinned. */
  pin() {
    if (this.getState() !== PANEL_STATES.ON_DEMAND) return;
    this.#machine.transition(PANEL_TRANSITIONS.PIN);
  }
  /** pinned → on-demand. */
  unpin() {
    if (this.getState() !== PANEL_STATES.PINNED) return;
    this.#machine.transition(PANEL_TRANSITIONS.UNPIN);
  }
  // ═══════════════════════════════════════════════════════════════════════
  //  Show / Hide (hidden ↔ pinned, for panels without trigger-based visibility)
  // ═══════════════════════════════════════════════════════════════════════
  /** hidden → pinned. No-op if not in hidden state. */
  show() {
    if (this.getState() !== PANEL_STATES.HIDDEN) return;
    this.#machine.transition(PANEL_TRANSITIONS.SHOW);
  }
  /** pinned → hidden. No-op if not in pinned state. */
  hide() {
    if (this.getState() !== PANEL_STATES.PINNED) return;
    this.#machine.transition(PANEL_TRANSITIONS.HIDE);
  }
  /** Toggle between hidden and pinned. No-op if disabled or on-demand. */
  toggleShow() {
    const state = this.getState();
    if (state === PANEL_STATES.HIDDEN) {
      this.show();
    } else if (state === PANEL_STATES.PINNED) {
      this.hide();
    }
  }
  // ═══════════════════════════════════════════════════════════════════════
  //  Smart toggle (toolbar click handler)
  // ═══════════════════════════════════════════════════════════════════════
  /**
   * The default action for a toolbar toggle click.
   * Delegates to the appropriate operation based on FSM state and config:
   *   - Pinned + supportsCollapse → toggleCollapse
   *   - On-demand or pinned (no collapse) → togglePin
   *   - Hidden → show
   */
  toggle() {
    const state = this.getState();
    if (state === PANEL_STATES.DISABLED) return;
    if (this.#supportsCollapse && state === PANEL_STATES.PINNED) {
      this.toggleCollapse();
    } else if (state === PANEL_STATES.HIDDEN) {
      this.show();
    } else {
      this.togglePin();
    }
  }
  // ═══════════════════════════════════════════════════════════════════════
  //  On-demand triggers
  // ═══════════════════════════════════════════════════════════════════════
  /**
   * Increment or decrement the trigger count and sync visibility.
   * In on-demand state, the panel is visible when triggerCount > 0.
   * In pinned state, triggers are tracked but don't affect visibility.
   * In disabled state, triggers are tracked but have no effect.
   */
  setTriggerActive(active) {
    if (active) {
      this.#triggerCount++;
    } else {
      this.#triggerCount = Math.max(0, this.#triggerCount - 1);
    }
    this.#syncVisibility("trigger");
  }
  /** Reset all triggers to 0 and sync visibility. */
  clearTriggers() {
    this.#triggerCount = 0;
    this.#syncVisibility("triggers-cleared");
  }
  // ═══════════════════════════════════════════════════════════════════════
  //  Re-apply (mode switch support)
  // ═══════════════════════════════════════════════════════════════════════
  /**
   * Force re-apply DOM callbacks from the current FSM state.
   *
   * Use after mode switches where external code changed the DOM (swapped
   * panel content, cleared tabs) while the FSM remained in an enabled
   * state. The cached `#visible` flag is invalidated so `#applyVisibility`
   * is guaranteed to fire `onShow`/`onHide` + `onCollapseChanged`.
   *
   * No-op when the FSM is disabled — disable() handles its own cleanup.
   */
  reapply() {
    if (this.isDisabled()) return;
    this.#visible = !this.#visible;
    this.#syncVisibility("reapply");
  }
  // ═══════════════════════════════════════════════════════════════════════
  //  Collapse (bottom panel only)
  // ═══════════════════════════════════════════════════════════════════════
  collapse() {
    if (!this.#supportsCollapse || !this.isVisible() || this.#collapsed) return;
    this.#collapsed = true;
    this.#callbacks.onCollapseChanged?.(true, this.#height);
    this.#emitBus(`panel:${this.#name}:collapse:changed`, { collapsed: true });
    this.#persist();
  }
  expand() {
    if (!this.#supportsCollapse || !this.isVisible() || !this.#collapsed) return;
    this.#collapsed = false;
    this.#callbacks.onCollapseChanged?.(false, this.#height);
    this.#emitBus(`panel:${this.#name}:collapse:changed`, { collapsed: false });
    this.#persist();
  }
  toggleCollapse() {
    if (this.#collapsed) {
      this.expand();
    } else {
      this.collapse();
    }
  }
  /** Store the last expanded height (called during resize or before collapse). */
  setHeight(px) {
    if (typeof px === "number" && px > 40) {
      this.#height = px;
      this.#persist();
    }
  }
  // ═══════════════════════════════════════════════════════════════════════
  //  Overrides
  // ═══════════════════════════════════════════════════════════════════════
  /**
   * Force-hide the panel regardless of FSM state (welcome screen).
   * When lifted, visibility re-derives from current state + triggers.
   */
  setOverrideHidden(hidden) {
    this.#overrideHidden = hidden;
    if (hidden) {
      this.#applyVisibility(false, "override-hidden");
      this.#callbacks.onDisable?.();
    } else {
      if (!this.isDisabled()) {
        this.#callbacks.onEnable?.();
      }
      this.#syncVisibility("override-lifted");
    }
  }
  /**
   * Widget config special case (right panel).
   * When active, the toggle button stays enabled even in disabled state
   * so the user can click it to close the config panel.
   */
  setWidgetConfigActive(active) {
    this.#widgetConfigActive = active;
    if (this.isDisabled()) {
      if (active) {
        this.#callbacks.onEnable?.();
      } else {
        this.#callbacks.onDisable?.();
      }
    }
    this.#callbacks.onVisibilityChanged?.(this.#visible);
  }
  // ═══════════════════════════════════════════════════════════════════════
  //  Persistence
  // ═══════════════════════════════════════════════════════════════════════
  /**
   * Read persisted state from localStorage and apply it.
   * Must be called after construction, before the first enable().
   */
  hydrate() {
    try {
      if (typeof localStorage === "undefined") return;
      const raw = localStorage.getItem(this.#persistenceKey);
      if (raw == null) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return;
      if (typeof parsed.pinned === "boolean") {
        this.#persistedPinned = parsed.pinned;
      }
      if (typeof parsed.collapsed === "boolean") {
        this.#collapsed = parsed.collapsed;
      }
      if (typeof parsed.height === "number" && parsed.height > 40) {
        this.#height = parsed.height;
      }
      this.#log("debug", "Hydrated persisted state", {
        pinned: this.#persistedPinned,
        collapsed: this.#collapsed,
        height: this.#height
      });
    } catch (err) {
      this.#log("warn", "Failed to hydrate persisted state", { error: err });
    }
  }
  // ═══════════════════════════════════════════════════════════════════════
  //  Lifecycle
  // ═══════════════════════════════════════════════════════════════════════
  dispose() {
    this.#machine = null;
    this.#eventBus = null;
    this.#callbacks = null;
  }
  // ═══════════════════════════════════════════════════════════════════════
  //  Private: state entry/exit hooks
  // ═══════════════════════════════════════════════════════════════════════
  #onEnterDisabled() {
    this.#applyVisibility(false, "disabled");
    this.#callbacks.onDisable?.();
    this.#callbacks.onPinChanged?.(false);
    this.#emitStateChanged();
  }
  #onEnterHidden() {
    this.#callbacks.onEnable?.();
    this.#callbacks.onPinChanged?.(false);
    this.#applyVisibility(false, "hidden");
    this.#persistedPinned = false;
    this.#persist();
    this.#emitStateChanged();
  }
  #onEnterOnDemand() {
    this.#callbacks.onEnable?.();
    this.#callbacks.onPinChanged?.(false);
    this.#persistedPinned = false;
    this.#persist();
    this.#syncVisibility("on-demand-entered");
    this.#emitStateChanged();
  }
  #onExitOnDemand() {
  }
  #onEnterPinned() {
    this.#callbacks.onEnable?.();
    this.#callbacks.onPinChanged?.(true);
    this.#persistedPinned = true;
    this.#persist();
    this.#applyVisibility(true, "pinned");
    this.#emitStateChanged();
  }
  // ═══════════════════════════════════════════════════════════════════════
  //  Private: visibility logic
  // ═══════════════════════════════════════════════════════════════════════
  /**
   * Derive whether the panel should be visible based on FSM state, triggers,
   * and overrides. Call the appropriate show/hide callback if changed.
   */
  #syncVisibility(reason) {
    const state = this.getState();
    let shouldBeVisible;
    if (state === PANEL_STATES.DISABLED || state === PANEL_STATES.HIDDEN) {
      shouldBeVisible = false;
    } else if (state === PANEL_STATES.PINNED) {
      shouldBeVisible = true;
    } else {
      shouldBeVisible = this.#triggerCount > 0;
    }
    if (this.#overrideHidden) {
      shouldBeVisible = false;
    }
    this.#applyVisibility(shouldBeVisible, reason);
  }
  /**
   * Apply visibility change if it differs from current state.
   *
   * Callback ordering matters:
   *   1. onShow/onHide      — basic DOM setup/teardown
   *   2. onVisibilityChanged — toggle button active state (active = visible)
   *   3. onCollapseChanged   — override toggle active if collapsed (active = !collapsed)
   *
   * This ensures collapse-aware panels (flow mode) get the correct toggle state
   * while trigger-based panels (ETL) where supportsCollapse=false just use visibility.
   */
  #applyVisibility(visible, reason) {
    if (visible === this.#visible) return;
    this.#visible = visible;
    if (visible) {
      this.#callbacks.onShow?.(reason);
    } else {
      this.#callbacks.onHide?.(reason);
    }
    this.#callbacks.onVisibilityChanged?.(visible);
    if (visible && this.#supportsCollapse) {
      this.#callbacks.onCollapseChanged?.(this.#collapsed, this.#height);
    }
    this.#emitBus(`panel:${this.#name}:visibility:changed`, { visible, reason });
    this.#log("debug", `Panel ${visible ? "shown" : "hidden"}`, { reason });
  }
  // ═══════════════════════════════════════════════════════════════════════
  //  Private: persistence
  // ═══════════════════════════════════════════════════════════════════════
  #persist() {
    try {
      if (typeof localStorage === "undefined") return;
      const payload = {
        pinned: this.#persistedPinned,
        collapsed: this.#collapsed,
        height: this.#height
      };
      localStorage.setItem(this.#persistenceKey, JSON.stringify(payload));
    } catch (err) {
      this.#log("warn", "Failed to persist panel state", { error: err });
    }
  }
  // ═══════════════════════════════════════════════════════════════════════
  //  Private: EventBus + logging
  // ═══════════════════════════════════════════════════════════════════════
  #emitStateChanged() {
    const state = this.getState();
    const previous = this.#machine.previousState;
    this.#emitBus(`panel:${this.#name}:state:changed`, { state, previousState: previous });
  }
  #emitBus(event, detail) {
    try {
      this.#eventBus?.emit?.(event, detail);
    } catch {
    }
  }
  #log(level, msg, data) {
    this.#logger?.[level]?.("panel-fsm", `[${this.#name}] ${msg}`, data);
  }
};

// src/ui/controllers/window_chrome_controller.js
var SUPPORTS_POINTER = typeof window !== "undefined" && "onpointerdown" in window;
var MIN_WIDTH = 500;
var MIN_HEIGHT = 350;
var DRAG_THRESHOLD = 4;
var WindowChromeController = class {
  constructor({ eventBus, logger, host } = {}) {
    this.eventBus = eventBus;
    this.logger = logger || console;
    this.win = host?.window || null;
    this.resizingActive = false;
    this.lastDblClickTs = 0;
    this.handles = {};
    this.topBar = null;
    this._disposed = false;
    this._disposers = [];
  }
  /**
   * Initialize the window chrome controller
   */
  initialize() {
    if (this._disposed) return;
    if (!this.win || this.win.chrome() !== "custom") {
      this.logger.info?.("[WindowChrome] Native/browser chrome detected \u2014 custom window chrome disabled");
      return;
    }
    this.#wireWindowButtons();
    this.#createResizeHandles();
    this.#wireTopBarDrag();
    this.#wireKeyboardShortcuts();
    this.#wireNativeStateSync();
    this.#initializeState();
    this.logger.info?.("[WindowChrome] Initialized");
  }
  /**
   * Wire minimize, maximize, close buttons
   */
  #wireWindowButtons() {
    const minBtn = document.getElementById("win-minimize");
    const maxBtn = document.getElementById("win-maximize");
    const closeBtn = document.getElementById("win-close");
    if (minBtn) {
      const handler = () => this.win.minimize();
      minBtn.addEventListener("click", handler);
      this._disposers.push(() => minBtn.removeEventListener("click", handler));
    }
    if (maxBtn) {
      const handler = async () => {
        try {
          const isMax = await this.win.setMaximized(!await this.win.isMaximized());
          this.#updateMaximizeIcon(isMax);
          this.#setResizeHandlesEnabled(!isMax);
        } catch (e) {
          this.logger.warn?.("[WindowChrome] Maximize toggle failed", e);
        }
      };
      maxBtn.addEventListener("click", handler);
      this._disposers.push(() => maxBtn.removeEventListener("click", handler));
    }
    if (closeBtn) {
      const handler = () => this.win.close();
      closeBtn.addEventListener("click", handler);
      this._disposers.push(() => closeBtn.removeEventListener("click", handler));
    }
  }
  /**
   * Update maximize button icon and body class
   */
  #updateMaximizeIcon(isMax) {
    const maxBtn = document.getElementById("win-maximize");
    if (!maxBtn) return;
    const icon = maxBtn.querySelector(".material-symbols-outlined");
    if (icon) {
      icon.textContent = isMax ? "filter_none" : "check_box_outline_blank";
    }
    const tooltipText = isMax ? "Restore" : "Maximize";
    window.LatexTooltip?.set(maxBtn, tooltipText);
    maxBtn.setAttribute("aria-label", tooltipText);
    document.body.classList.toggle("twm-window-maximized", isMax);
  }
  /**
   * Enable/disable resize handles
   */
  #setResizeHandlesEnabled(enabled) {
    Object.values(this.handles).forEach((handle) => {
      if (handle) {
        handle.style.pointerEvents = enabled ? "auto" : "none";
      }
    });
  }
  /**
   * Set fullscreen body class
   */
  #setFullscreenClass(isFs) {
    document.body.classList.toggle("window-fullscreen", isFs);
  }
  /**
   * Create all resize handles
   */
  #createResizeHandles() {
    const positions = ["right", "left", "top", "bottom"];
    const corners = ["br", "bl", "tr", "tl"];
    positions.forEach((pos) => {
      const handle = document.createElement("div");
      handle.className = `twm-resize-handle ${pos}`;
      document.body.appendChild(handle);
      this.handles[pos] = handle;
      this.#setupResize(handle, pos);
    });
    corners.forEach((corner) => {
      const handle = document.createElement("div");
      handle.className = `twm-resize-handle corner ${corner}`;
      document.body.appendChild(handle);
      const mode = "corner" + corner.toUpperCase();
      this.handles[mode] = handle;
      this.#setupResize(handle, mode);
    });
  }
  /**
   * Setup resize behavior for a handle
   */
  #setupResize(handle, mode) {
    let startX = 0, startY = 0, startScreenX = 0, startScreenY = 0;
    let startW = 0, startH = 0, startLeft = 0, startTop = 0;
    let pending = null;
    let rafScheduled = false;
    let lastSent = null;
    const boundsEqual = (a, b) => {
      return !!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
    };
    const sendBounds = () => {
      rafScheduled = false;
      if (!pending) return;
      if (lastSent && boundsEqual(lastSent, pending)) return;
      this.win.setBounds({ x: pending.x, y: pending.y, width: pending.w, height: pending.h });
      lastSent = pending;
    };
    const scheduleSend = () => {
      if (!rafScheduled) {
        rafScheduled = true;
        requestAnimationFrame(sendBounds);
      }
    };
    let activePointerId = null;
    const startDrag = async (e) => {
      e.preventDefault();
      this.resizingActive = true;
      startX = e.clientX;
      startY = e.clientY;
      startScreenX = e.screenX ?? startX;
      startScreenY = e.screenY ?? startY;
      try {
        const res = await this.win.getBounds();
        if (res) {
          startLeft = typeof res.x === "number" ? res.x : 0;
          startTop = typeof res.y === "number" ? res.y : 0;
          startW = res.width || document.documentElement.clientWidth;
          startH = res.height || document.documentElement.clientHeight;
        } else {
          startLeft = 0;
          startTop = 0;
          startW = document.documentElement.clientWidth;
          startH = document.documentElement.clientHeight;
        }
      } catch (e2) {
        startLeft = 0;
        startTop = 0;
        startW = document.documentElement.clientWidth;
        startH = document.documentElement.clientHeight;
      }
      startLeft = Math.round(startLeft);
      startTop = Math.round(startTop);
      startW = Math.round(startW);
      startH = Math.round(startH);
      pending = null;
      lastSent = null;
      rafScheduled = false;
      if (SUPPORTS_POINTER && e.pointerId != null && handle.setPointerCapture) {
        try {
          handle.setPointerCapture(e.pointerId);
          activePointerId = e.pointerId;
        } catch (_) {
        }
      }
      if (SUPPORTS_POINTER) {
        window.addEventListener("pointermove", onMove, { passive: false });
        window.addEventListener("pointerup", endDrag, { once: true });
      } else {
        window.addEventListener("mousemove", onMove, { passive: false });
        window.addEventListener("mouseup", endDrag, { once: true });
      }
    };
    const onMove = (e) => {
      const sx = e.screenX ?? e.clientX ?? 0;
      const sy = e.screenY ?? e.clientY ?? 0;
      const dx = sx - startScreenX;
      const dy = sy - startScreenY;
      let newX = startLeft;
      let newY = startTop;
      let newW = startW;
      let newH = startH;
      const isLeft = mode === "left" || mode === "cornerBL" || mode === "cornerTL";
      const isRight = mode === "right" || mode === "cornerBR" || mode === "cornerTR";
      const isTop = mode === "top" || mode === "cornerTR" || mode === "cornerTL";
      const isBottom = mode === "bottom" || mode === "cornerBR" || mode === "cornerBL";
      if (isLeft) {
        const candidateWidth = startW - dx;
        newW = Math.max(MIN_WIDTH, candidateWidth);
        const shift = startW - newW;
        newX = startLeft + shift;
      } else if (isRight) {
        newW = Math.max(MIN_WIDTH, startW + dx);
      }
      if (isTop) {
        const candidateHeight = startH - dy;
        newH = Math.max(MIN_HEIGHT, candidateHeight);
        const shiftY = startH - newH;
        newY = startTop + shiftY;
      } else if (isBottom) {
        newH = Math.max(MIN_HEIGHT, startH + dy);
      }
      newX = Math.round(newX);
      newY = Math.round(newY);
      newW = Math.max(MIN_WIDTH, Math.round(newW));
      newH = Math.max(MIN_HEIGHT, Math.round(newH));
      pending = { x: newX, y: newY, w: newW, h: newH };
      scheduleSend();
    };
    const endDrag = () => {
      if (SUPPORTS_POINTER) {
        window.removeEventListener("pointermove", onMove);
      } else {
        window.removeEventListener("mousemove", onMove);
      }
      if (activePointerId != null && handle.releasePointerCapture) {
        try {
          handle.releasePointerCapture(activePointerId);
        } catch (_) {
        }
        activePointerId = null;
      }
      if (pending && (!lastSent || !boundsEqual(lastSent, pending))) {
        this.win.setBounds({ x: pending.x, y: pending.y, width: pending.w, height: pending.h });
      }
      pending = null;
      lastSent = null;
      this.resizingActive = false;
    };
    const event = SUPPORTS_POINTER ? "pointerdown" : "mousedown";
    handle.addEventListener(event, startDrag);
    this._disposers.push(() => handle.removeEventListener(event, startDrag));
  }
  /**
   * Setup top bar dragging for window movement
   */
  #wireTopBarDrag() {
    this.topBar = document.querySelector(".twm-global-top-bar");
    if (!this.topBar) return;
    const NO_DRAG_SELECTOR = ".no-drag, button, input, select, textarea, .menu-item, .menu-dropdown, .window-controls, .panel-toggles, .global-search-dropdown";
    let dragging = false;
    let startSX = 0, startSY = 0, startX = null, startY = null, winW = 0, winH = 0;
    let wasMax = false;
    let didRestore = false;
    let grabRatio = 0.5;
    let raf = null;
    let lastSentX = null, lastSentY = null;
    let activePointerId = null;
    const DBL_CLICK_TIME = 500;
    const DBL_CLICK_DIST = 4;
    let lastDownTime = 0;
    let lastDownX = 0;
    let lastDownY = 0;
    const isInteractiveTarget = (t) => !!(t && t.closest && t.closest(NO_DRAG_SELECTOR));
    const onMove = (e) => {
      const sx = e.screenX ?? e.clientX ?? 0;
      const sy = e.screenY ?? e.clientY ?? 0;
      const dx = Math.abs(sx - startSX);
      const dy = Math.abs(sy - startSY);
      if (!dragging) {
        if (wasMax) {
          if (dx + dy <= 0) return;
          if (!didRestore) {
            didRestore = true;
            this.win.setMaximized(false).then(() => {
              this.#updateMaximizeIcon(false);
              this.#setResizeHandlesEnabled(true);
              return this.win.getBounds();
            }).then((bounds) => {
              if (bounds) {
                const rw = bounds.width || 800;
                const rh = bounds.height || 600;
                const targetX = Math.max(0, Math.round(startSX - rw * grabRatio));
                const targetY = Math.max(0, Math.round(sy - 10));
                this.win.setBounds({ x: targetX, y: targetY, width: rw, height: rh });
                startX = targetX;
                startY = targetY;
                winW = rw;
                winH = rh;
                startSX = sx;
                startSY = sy;
              }
            }).catch((err) => {
              this.logger.warn?.("[WindowChrome] Restore on drag failed", err);
            });
          }
          return;
        } else {
          if (dx + dy < DRAG_THRESHOLD) return;
          if (startX == null || startY == null) {
            return;
          }
        }
        dragging = true;
      }
      if (startX == null || startY == null) return;
      const nx = Math.round(startX + (sx - startSX));
      const ny = Math.round(startY + (sy - startSY));
      if (lastSentX === nx && lastSentY === ny) return;
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        lastSentX = nx;
        lastSentY = ny;
        this.win.setBounds({ x: nx, y: ny });
      });
    };
    const endDrag = () => {
      dragging = false;
      if (raf) {
        cancelAnimationFrame(raf);
        raf = null;
      }
      if (activePointerId != null && this.topBar.releasePointerCapture) {
        try {
          this.topBar.releasePointerCapture(activePointerId);
        } catch (e) {
        }
      }
      activePointerId = null;
      didRestore = false;
      if (SUPPORTS_POINTER) {
        window.removeEventListener("pointermove", onMove, true);
        window.removeEventListener("pointerup", endDrag, true);
      } else {
        window.removeEventListener("mousemove", onMove, true);
        window.removeEventListener("mouseup", endDrag, true);
      }
    };
    const startDrag = async (e) => {
      if (this.resizingActive) return;
      if (isInteractiveTarget(e.target)) return;
      if (Date.now() - this.lastDblClickTs < 300) return;
      const now = Date.now();
      const cx = e.clientX ?? 0;
      const cy = e.clientY ?? 0;
      if (now - lastDownTime < DBL_CLICK_TIME && Math.abs(cx - lastDownX) < DBL_CLICK_DIST && Math.abs(cy - lastDownY) < DBL_CLICK_DIST) {
        lastDownTime = 0;
        this.lastDblClickTs = now;
        e.preventDefault();
        try {
          const isMax = await this.win.setMaximized(!await this.win.isMaximized());
          this.#updateMaximizeIcon(isMax);
          this.#setResizeHandlesEnabled(!isMax);
        } catch (err) {
          this.logger.warn?.("[WindowChrome] Double-click maximize failed", err);
        }
        return;
      }
      lastDownTime = now;
      lastDownX = cx;
      lastDownY = cy;
      try {
        if (!this.win) return;
        if (this.win.startNativeDrag) {
          e.preventDefault();
          if (await this.win.startNativeDrag()) {
            try {
              const isMax = await this.win.isMaximized();
              this.#updateMaximizeIcon(isMax);
              this.#setResizeHandlesEnabled(!isMax);
            } catch (_) {
            }
            return;
          }
        }
        startSX = e.screenX ?? e.clientX ?? 0;
        startSY = e.screenY ?? e.clientY ?? 0;
        try {
          wasMax = await this.win.isMaximized();
        } catch (e2) {
          wasMax = false;
        }
        const barWidth = Math.max(1, window.innerWidth || document.documentElement.clientWidth);
        grabRatio = Math.min(1, Math.max(0, (e.clientX || 0) / barWidth));
        if (!wasMax) {
          const bounds = await this.win.getBounds();
          if (bounds) {
            startX = typeof bounds.x === "number" ? bounds.x : window.screenX ?? 0;
            startY = typeof bounds.y === "number" ? bounds.y : window.screenY ?? 0;
            winW = bounds.width || document.documentElement.clientWidth;
            winH = bounds.height || document.documentElement.clientHeight;
          } else {
            startX = window.screenX ?? 0;
            startY = window.screenY ?? 0;
            winW = document.documentElement.clientWidth;
            winH = document.documentElement.clientHeight;
          }
        }
        e.preventDefault();
        if (SUPPORTS_POINTER && e.pointerId != null && this.topBar.setPointerCapture) {
          try {
            this.topBar.setPointerCapture(e.pointerId);
            activePointerId = e.pointerId;
          } catch (e2) {
          }
        }
        if (SUPPORTS_POINTER) {
          window.addEventListener("pointermove", onMove, true);
          window.addEventListener("pointerup", endDrag, true);
        } else {
          window.addEventListener("mousemove", onMove, true);
          window.addEventListener("mouseup", endDrag, true);
        }
      } catch (err) {
        this.logger.warn?.("[WindowChrome] Start drag failed", err);
      }
    };
    const blocker = (e) => {
      if (this.resizingActive) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    this.topBar.addEventListener("mousedown", blocker, true);
    this.topBar.addEventListener("pointerdown", blocker, true);
    const dblClickHandler = async (e) => {
      const interactiveSelector = 'button, input, select, textarea, a, [role="button"], [role="menuitem"], .menu-bar, .fl-bar, .fl-item, .global-search-wrapper, .panel-toggle-btn';
      if (e.target.closest(interactiveSelector)) {
        return;
      }
      this.lastDblClickTs = Date.now();
      e.preventDefault();
      e.stopPropagation();
      if (this.resizingActive) return;
      try {
        const isMax = await this.win.setMaximized(!await this.win.isMaximized());
        this.#updateMaximizeIcon(isMax);
        this.#setResizeHandlesEnabled(!isMax);
      } catch (e2) {
        this.logger.warn?.("[WindowChrome] Double-click maximize failed", e2);
      }
    };
    this.topBar.addEventListener("dblclick", dblClickHandler);
    const event = SUPPORTS_POINTER ? "pointerdown" : "mousedown";
    this.topBar.addEventListener(event, startDrag, false);
    this._disposers.push(() => {
      this.topBar.removeEventListener("mousedown", blocker, true);
      this.topBar.removeEventListener("pointerdown", blocker, true);
      this.topBar.removeEventListener("dblclick", dblClickHandler);
      this.topBar.removeEventListener(event, startDrag, false);
    });
  }
  /**
   * Listen for browser resize events to sync UI with native state changes
   * (e.g. Win+Arrow maximize/restore, Win+Down minimize).
   */
  #wireNativeStateSync() {
    let syncTimer = null;
    const syncState = async () => {
      if (this.resizingActive || this._disposed) return;
      try {
        if (!this.win) return;
        const isMax = await this.win.isMaximized();
        this.#updateMaximizeIcon(isMax);
        this.#setResizeHandlesEnabled(!isMax);
      } catch (_) {
      }
    };
    const handler = () => {
      clearTimeout(syncTimer);
      syncTimer = setTimeout(syncState, 80);
    };
    window.addEventListener("resize", handler);
    this._disposers.push(() => {
      window.removeEventListener("resize", handler);
      clearTimeout(syncTimer);
    });
  }
  /**
   * Wire F11 fullscreen toggle
   */
  #wireKeyboardShortcuts() {
    const handler = async (e) => {
      if (e.code === "F11") {
        e.preventDefault();
        try {
          const isFs = await this.win.toggleFullscreen();
          this.#setFullscreenClass(isFs);
          const max = await this.win.isMaximized();
          this.#setResizeHandlesEnabled(!(isFs || max));
        } catch (e2) {
          this.logger.warn?.("[WindowChrome] F11 toggle failed", e2);
        }
      }
    };
    window.addEventListener("keydown", handler, true);
    this._disposers.push(() => window.removeEventListener("keydown", handler, true));
  }
  /**
   * Initialize window state on startup
   */
  async #initializeState() {
    try {
      if (!this.win) return;
      const isMax = await this.win.isMaximized();
      this.#updateMaximizeIcon(isMax);
      this.#setResizeHandlesEnabled(!isMax);
      const isFs = await this.win.isFullscreen();
      this.#setFullscreenClass(isFs);
      if (isFs) this.#setResizeHandlesEnabled(false);
    } catch (e) {
      this.logger.warn?.("[WindowChrome] Initial state check failed", e);
    }
  }
  /**
   * Dispose of the controller
   */
  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this._disposers.forEach((dispose) => {
      try {
        dispose();
      } catch (e) {
      }
    });
    this._disposers = [];
    Object.values(this.handles).forEach((handle) => {
      if (handle && handle.parentNode) {
        handle.parentNode.removeChild(handle);
      }
    });
    this.handles = {};
    this.logger.info?.("[WindowChrome] Disposed");
  }
};

// src/ui/notification_center.js
var SEVERITIES = ["info", "success", "warn", "error", "fatal"];
var LOG_SEVERITY_MAP = {
  trace: "info",
  debug: "info",
  info: "info",
  warn: "warn",
  error: "error",
  fatal: "fatal"
};
var DEFAULT_LOG_LEVELS = /* @__PURE__ */ new Set(["warn", "error", "fatal"]);
var SUPPRESSED_NAMESPACE_TITLES = /* @__PURE__ */ new Set(["bootstrap", "app"]);
var NotificationCenter = class _NotificationCenter extends ComponentBase {
  constructor({
    eventBus,
    logger,
    maxVisible = 3,
    historyLimit = 50,
    defaultDurationMs = 6e3,
    logLevels = DEFAULT_LOG_LEVELS
  } = {}) {
    super({ eventBus, logger });
    this.maxVisible = maxVisible;
    this.historyLimit = historyLimit;
    this.defaultDurationMs = defaultDurationMs;
    this.logLevels = new Set(logLevels ?? DEFAULT_LOG_LEVELS);
    this.notifications = [];
    this.history = [];
    this.sequence = 0;
    this.activeTimers = /* @__PURE__ */ new Map();
    this.eventDisposers = [];
    this.container = null;
    this.rootEl = null;
    this.listEl = null;
    this.liveRegionEl = null;
  }
  mount(container, props = {}) {
    const existingContainer = document.getElementById("notification-center-root");
    if (existingContainer) {
      this.container = existingContainer;
      this.rootEl = existingContainer.querySelector(".twm-notification-center");
      this.listEl = existingContainer.querySelector(".twm-notification-center__list");
      this.liveRegionEl = existingContainer.querySelector(".notification-center__live-region");
      this._mounted = true;
      this.#subscribeEvents();
      return this;
    }
    this.container = document.createElement("div");
    this.container.id = "notification-center-root";
    this.container.style.cssText = "position: fixed; right: 16px; bottom: 24px; z-index: 10000; pointer-events: none;";
    this.rootEl = document.createElement("div");
    this.rootEl.className = "twm-notification-center";
    this.listEl = document.createElement("div");
    this.listEl.className = "twm-notification-center__list";
    this.liveRegionEl = document.createElement("div");
    this.liveRegionEl.className = "notification-center__live-region";
    this.liveRegionEl.setAttribute("aria-live", "polite");
    this.liveRegionEl.setAttribute("aria-atomic", "true");
    this.liveRegionEl.style.position = "absolute";
    this.liveRegionEl.style.width = "1px";
    this.liveRegionEl.style.height = "1px";
    this.liveRegionEl.style.overflow = "hidden";
    this.liveRegionEl.style.clip = "rect(1px, 1px, 1px, 1px)";
    this.rootEl.appendChild(this.listEl);
    this.rootEl.appendChild(this.liveRegionEl);
    this.container.appendChild(this.rootEl);
    document.body.appendChild(this.container);
    this._mounted = true;
    this.#subscribeEvents();
    if (Array.isArray(props.initialNotifications)) {
      props.initialNotifications.forEach((notification) => this.show(notification));
    }
    return this;
  }
  dispose() {
    this.#clearTimers();
    this.#unsubscribeEvents();
    if (this.rootEl?.parentNode) {
      this.rootEl.parentNode.removeChild(this.rootEl);
    }
    this.container = null;
    this.rootEl = null;
    this.listEl = null;
    this.liveRegionEl = null;
    super.dispose();
  }
  show(notification) {
    const normalized = this.#normalizeNotification(notification);
    this.#consoleLog(normalized);
    this.notifications.push(normalized);
    if (this.notifications.length > this.maxVisible) {
      const removed = this.notifications.shift();
      this.#stopTimer(removed.id);
      this.#recordHistory({ ...removed, dismissed: true, reason: "overflow" });
    }
    this.#recordHistory(normalized);
    this.#scheduleAutoDismiss(normalized);
    this.#render();
    this.#announce(normalized);
    return normalized.id;
  }
  dismiss(notificationId, reason = "dismissed") {
    const idx = this.notifications.findIndex((item) => item.id === notificationId);
    if (idx === -1) {
      return false;
    }
    const [removed] = this.notifications.splice(idx, 1);
    this.#stopTimer(notificationId);
    this.#recordHistory({ ...removed, dismissed: true, reason });
    this.#render();
    return true;
  }
  /**
   * Update an existing notification's message in place without re-rendering.
   * This prevents the flicker caused by dismiss+show.
   * @param {string} notificationId - The ID of the notification to update
   * @param {Object} updates - Object with fields to update (message, title, etc.)
   * @returns {boolean} True if the notification was found and updated
   */
  update(notificationId, updates = {}) {
    const notification = this.notifications.find((item) => item.id === notificationId);
    if (!notification) {
      return false;
    }
    if (updates.message !== void 0) notification.message = updates.message;
    if (updates.title !== void 0) notification.title = updates.title;
    if (updates.severity !== void 0) notification.severity = this.#normalizeSeverity(updates.severity);
    if (updates.meta !== void 0) notification.meta = updates.meta;
    const notificationEl = this.listEl?.querySelector(`[data-notification-id="${notificationId}"]`);
    if (notificationEl) {
      const bodyEl = notificationEl.querySelector(".twm-notification__body");
      if (bodyEl && updates.message !== void 0) {
        bodyEl.textContent = updates.message;
      }
      const titleEl = notificationEl.querySelector(".twm-notification__title");
      if (titleEl && updates.title !== void 0) {
        titleEl.textContent = updates.title;
      }
    } else {
      this.#render();
    }
    return true;
  }
  clearAll(reason = "cleared") {
    [...this.notifications].forEach((notification) => this.dismiss(notification.id, reason));
  }
  ingestLogEntry(entry) {
    if (!entry || !this.logLevels.has(entry.level)) {
      return;
    }
    if (entry.namespace === "state-guard") {
      return;
    }
    const severity = LOG_SEVERITY_MAP[entry.level] ?? "info";
    const suppressTitle = SUPPRESSED_NAMESPACE_TITLES.has(entry.namespace);
    const title = suppressTitle ? null : _NotificationCenter.#formatNamespaceTitle(entry.namespace);
    const skipHistory = severity === "info" && suppressTitle;
    this.show({
      title,
      message: entry.message,
      severity,
      namespace: entry.namespace,
      meta: entry.data,
      skipHistory
    });
  }
  #consoleLog(notification) {
    if (notification.severity !== "warn" && notification.severity !== "error" && notification.severity !== "fatal") {
      return;
    }
    const method = notification.severity === "warn" ? console.warn : console.error;
    const prefix = notification.title ? `[${notification.title}]` : "[Notification]";
    const details = notification.meta ?? notification.description ?? "";
    method(`${prefix} ${notification.message}`, details);
  }
  #normalizeNotification(notification) {
    if (!notification) {
      throw new TypeError("Notification payload is required");
    }
    const id = notification.id ?? `notification-${++this.sequence}`;
    const severity = this.#normalizeSeverity(notification.severity ?? "info");
    return {
      id,
      title: notification.title ?? null,
      message: notification.message ?? "",
      description: notification.description ?? null,
      timestamp: notification.timestamp ?? Date.now(),
      severity,
      namespace: notification.namespace ?? null,
      durationMs: this.#coerceDuration(notification.durationMs),
      persistent: Boolean(notification.persistent),
      skipHistory: Boolean(notification.skipHistory),
      actions: this.#normalizeActions(notification.actions),
      meta: notification.meta ?? null
    };
  }
  #normalizeSeverity(severity) {
    const value = typeof severity === "string" ? severity.toLowerCase() : "info";
    if (!SEVERITIES.includes(value)) {
      return "info";
    }
    return value;
  }
  #coerceDuration(duration) {
    if (duration === null || duration === void 0) {
      return this.defaultDurationMs;
    }
    const value = Number(duration);
    if (!Number.isFinite(value) || value < 0) {
      return this.defaultDurationMs;
    }
    return value;
  }
  toast(title, message, type = "info") {
    this.show({
      title,
      message,
      severity: type,
      persistent: type === "error" || type === "fatal"
    });
  }
  error(titleOrMessage, message) {
    const hasTitle = message !== void 0;
    return this.show({
      title: hasTitle ? titleOrMessage : null,
      message: hasTitle ? message : titleOrMessage,
      severity: "error",
      persistent: true
    });
  }
  warn(titleOrMessage, message) {
    const hasTitle = message !== void 0;
    return this.show({
      title: hasTitle ? titleOrMessage : null,
      message: hasTitle ? message : titleOrMessage,
      severity: "warn"
    });
  }
  info(titleOrMessage, message) {
    const hasTitle = message !== void 0;
    return this.show({
      title: hasTitle ? titleOrMessage : null,
      message: hasTitle ? message : titleOrMessage,
      severity: "info"
    });
  }
  success(titleOrMessage, message) {
    const hasTitle = message !== void 0;
    return this.show({
      title: hasTitle ? titleOrMessage : null,
      message: hasTitle ? message : titleOrMessage,
      severity: "success"
    });
  }
  #normalizeActions(actions) {
    if (!Array.isArray(actions) || actions.length === 0) {
      return [];
    }
    return actions.map((action, idx) => ({
      id: action.id ?? `action-${idx}`,
      label: action.label ?? "Action",
      handler: typeof action.handler === "function" ? action.handler : null,
      eventName: action.eventName ?? null,
      payload: action.payload ?? null
    }));
  }
  #scheduleAutoDismiss(notification) {
    if (notification.persistent || notification.durationMs === 0) {
      return;
    }
    const timer = setTimeout(() => {
      this.dismiss(notification.id, "timeout");
    }, notification.durationMs);
    this.activeTimers.set(notification.id, timer);
  }
  #stopTimer(notificationId) {
    const timer = this.activeTimers.get(notificationId);
    if (timer) {
      clearTimeout(timer);
      this.activeTimers.delete(notificationId);
    }
  }
  #clearTimers() {
    this.activeTimers.forEach((timer) => clearTimeout(timer));
    this.activeTimers.clear();
  }
  #recordHistory(entry) {
    if (entry.skipHistory) return;
    this.history.push(entry);
    if (this.history.length > this.historyLimit) {
      this.history.shift();
    }
  }
  #render() {
    if (!this._mounted || !this.listEl) {
      return;
    }
    this.listEl.innerHTML = "";
    const fragment = document.createDocumentFragment();
    this.notifications.forEach((notification) => {
      const item = document.createElement("div");
      item.className = `notification notification--${notification.severity}`;
      item.setAttribute("data-notification-id", notification.id);
      const header = document.createElement("div");
      header.className = "twm-notification__header";
      if (notification.title) {
        const titleEl = document.createElement("span");
        titleEl.className = "twm-notification__title";
        titleEl.textContent = notification.title;
        header.appendChild(titleEl);
      }
      const timeEl = document.createElement("span");
      timeEl.className = "twm-notification__timestamp";
      timeEl.textContent = this.#formatTimestamp(notification.timestamp);
      header.appendChild(timeEl);
      const closeBtn = document.createElement("button");
      closeBtn.className = "twm-notification__close";
      closeBtn.type = "button";
      closeBtn.setAttribute("aria-label", "Dismiss notification");
      closeBtn.innerHTML = '<span class="material-symbols-outlined">close</span>';
      closeBtn.addEventListener("click", () => this.dismiss(notification.id, "manual"));
      header.appendChild(closeBtn);
      item.appendChild(header);
      const body = document.createElement("div");
      body.className = "twm-notification__body";
      body.textContent = notification.message;
      item.appendChild(body);
      if (notification.description) {
        const descriptionEl = document.createElement("div");
        descriptionEl.className = "twm-notification__description";
        descriptionEl.textContent = notification.description;
        item.appendChild(descriptionEl);
      }
      if (notification.actions.length > 0) {
        const actionsEl = document.createElement("div");
        actionsEl.className = "twm-notification__actions";
        notification.actions.forEach((action) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "twm-notification__action-btn";
          button.textContent = action.label;
          button.addEventListener("click", () => {
            try {
              if (action.handler) {
                action.handler(notification, action);
              } else if (action.eventName && this.eventBus) {
                this.eventBus.emit(action.eventName, action.payload ?? { notificationId: notification.id });
              }
            } catch (err) {
              this.logger?.error?.("twm-notification-center", "Notification action failed", { err });
            } finally {
              if (notification.severity !== "error" && notification.severity !== "fatal") {
                this.dismiss(notification.id, "action");
              }
            }
          });
          actionsEl.appendChild(button);
        });
        item.appendChild(actionsEl);
      }
      item.addEventListener("click", (event) => {
        if (event.target.closest("button")) {
          return;
        }
        this.dismiss(notification.id, "click");
      });
      fragment.appendChild(item);
    });
    this.listEl.appendChild(fragment);
  }
  #formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }
  #announce(notification) {
    if (!this.liveRegionEl) {
      return;
    }
    const parts = [notification.title, notification.message].filter(Boolean);
    this.liveRegionEl.textContent = parts.join(": ");
  }
  #handleToast(payload = {}) {
    const message = payload.text ?? payload.message ?? (typeof payload === "string" ? payload : "");
    if (!message) {
      return;
    }
    const persistent = payload.persistent === true || payload.autoHide === false;
    const durationMs = persistent ? 0 : payload.durationMs ?? payload.duration ?? payload.timeout;
    this.show({
      title: payload.title ?? null,
      message,
      severity: payload.type ?? payload.severity ?? "info",
      durationMs,
      persistent,
      namespace: payload.namespace ?? null,
      actions: payload.actions,
      meta: payload.meta ?? null
    });
  }
  #subscribeEvents() {
    if (!this.eventBus) {
      return;
    }
    this.eventDisposers.push(
      this.eventBus.on("toast:show", (payload) => this.#handleToast(payload)),
      this.eventBus.on("notification:show", (payload) => this.show(payload)),
      this.eventBus.on("notification:update", (payload) => {
        if (payload?.id) {
          this.update(payload.id, payload);
        }
      }),
      this.eventBus.on("log:entry", (entry) => this.ingestLogEntry(entry)),
      this.eventBus.on("workspace:save:failed", (payload) => {
        if (getSetting("workspace.save.showErrorToast", true)) {
          this.show({
            title: "Workspace Save Failed",
            message: payload?.reason ? `Save failed: ${payload.reason}` : "Workspace save failed",
            severity: "error",
            meta: payload,
            persistent: true
          });
        }
      }),
      this.eventBus.on("workspace:save:completed", (payload) => {
        if (getSetting("workspace.save.showToast", false)) {
          this.show({
            title: "Workspace Saved",
            message: "Changes saved successfully",
            severity: "success",
            durationMs: 3e3,
            meta: payload,
            skipHistory: true
          });
        }
      }),
      this.eventBus.on("workspace:import:failed", (payload) => {
        if (getSetting("workspace.import.showErrorToast", true)) {
          this.show({
            title: "Workspace Import Failed",
            message: payload?.error?.message || "Import failed",
            severity: "error",
            meta: payload,
            persistent: true
          });
        }
      }),
      this.eventBus.on("workspace:import:completed", (payload) => {
        if (getSetting("workspace.import.showToast", true)) {
          this.show({
            title: "Workspace Ready",
            message: "Workspace import completed",
            severity: "success",
            durationMs: 3e3,
            meta: payload,
            skipHistory: true
          });
        }
      })
    );
  }
  #unsubscribeEvents() {
    this.eventDisposers.forEach((disposer) => {
      try {
        disposer?.dispose?.();
      } catch (err) {
        this.logger?.warn?.("twm-notification-center", "Failed to remove event listener", { err });
      }
    });
    this.eventDisposers = [];
  }
  static #formatNamespaceTitle(namespace) {
    if (!namespace) return null;
    return namespace.split(/[-_]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  }
};
NotificationCenter.SEVERITIES = SEVERITIES;

// src/ui/utils/overlay_scrollbar.js
function normalizeOrientation(value) {
  return String(value || "horizontal").toLowerCase() === "vertical" ? "vertical" : "horizontal";
}
function ensureInstallState(container) {
  if (!container.__overlayScrollbarInstalled) {
    Object.defineProperty(container, "__overlayScrollbarInstalled", {
      value: {},
      writable: true,
      configurable: true
    });
  }
}
function installOverlayScrollbar(container, options = {}) {
  if (!container) return null;
  const orientation = normalizeOrientation(options.orientation);
  const className = options.className || "overlay-scrollbar";
  const isHorizontal = orientation !== "vertical";
  const orientationKey = isHorizontal ? "horizontal" : "vertical";
  ensureInstallState(container);
  if (container.__overlayScrollbarInstalled[orientationKey]) {
    return container.__overlayScrollbarInstalled[orientationKey];
  }
  if (options.setOverflow !== false) {
    container.style.overflow = options.overflow || "auto";
  }
  if (options.setPosition !== false && getComputedStyle(container).position === "static") {
    container.style.position = "relative";
  }
  const externalBar = !!options.externalBar;
  const barHost = externalBar ? container.parentElement : container;
  if (externalBar && barHost && getComputedStyle(barHost).position === "static") {
    barHost.style.position = "relative";
  }
  const bar = document.createElement("div");
  bar.className = className;
  bar.classList.add(`overlay-scrollbar-${isHorizontal ? "h" : "v"}`);
  const track = document.createElement("div");
  track.className = "track";
  const thumb = document.createElement("div");
  thumb.className = "thumb";
  bar.appendChild(track);
  bar.appendChild(thumb);
  (barHost || container).appendChild(bar);
  const getScrollProps = () => ({
    scrollSize: isHorizontal ? container.scrollWidth : container.scrollHeight,
    clientSize: isHorizontal ? container.clientWidth : container.clientHeight,
    scrollPos: isHorizontal ? container.scrollLeft || 0 : container.scrollTop || 0
  });
  let dragging = false;
  let hovered = false;
  let startPos = 0;
  let thumbStartPos = 0;
  let previousHasOverflow = null;
  let previousClientSize = null;
  let isResettingScroll = false;
  const update = () => {
    if (isResettingScroll) return;
    const { scrollSize, clientSize, scrollPos } = getScrollProps();
    const scrollLeft = container.scrollLeft || 0;
    const scrollTop = container.scrollTop || 0;
    const maxScroll = scrollSize - clientSize;
    const hasOverflow = maxScroll > 2;
    if (previousClientSize !== null && clientSize > previousClientSize && hasOverflow && scrollPos > 0) {
      const delta = clientSize - previousClientSize;
      const targetScroll = Math.max(0, scrollPos - delta);
      if (targetScroll !== scrollPos) {
        isResettingScroll = true;
        if (isHorizontal) {
          container.scrollLeft = targetScroll;
        } else {
          container.scrollTop = targetScroll;
        }
        requestAnimationFrame(() => {
          isResettingScroll = false;
          update();
        });
        previousClientSize = clientSize;
        previousHasOverflow = hasOverflow;
        return;
      }
    }
    previousClientSize = clientSize;
    if (previousHasOverflow === true && !hasOverflow && scrollPos > 0) {
      isResettingScroll = true;
      if (isHorizontal) {
        container.scrollLeft = 0;
      } else {
        container.scrollTop = 0;
      }
      requestAnimationFrame(() => {
        isResettingScroll = false;
        update();
      });
      previousHasOverflow = hasOverflow;
      return;
    }
    const clampedMaxScroll = Math.max(0, maxScroll);
    if (hasOverflow && scrollPos > clampedMaxScroll) {
      isResettingScroll = true;
      if (isHorizontal) {
        container.scrollLeft = clampedMaxScroll;
      } else {
        container.scrollTop = clampedMaxScroll;
      }
      requestAnimationFrame(() => {
        isResettingScroll = false;
        update();
      });
      previousHasOverflow = hasOverflow;
      return;
    }
    previousHasOverflow = hasOverflow;
    container.dataset.scrollable = hasOverflow ? "1" : "0";
    if (externalBar) {
      if (isHorizontal) {
        bar.style.left = `${container.offsetLeft}px`;
        bar.style.bottom = "auto";
        bar.style.top = `${container.offsetTop + container.offsetHeight - 6}px`;
        bar.style.width = `${container.clientWidth}px`;
      } else {
        bar.style.top = `${container.offsetTop}px`;
        bar.style.right = "auto";
        bar.style.left = `${container.offsetLeft + container.offsetWidth - 6}px`;
        bar.style.height = `${container.clientHeight}px`;
      }
    } else {
      if (isHorizontal) {
        bar.style.left = `${scrollLeft}px`;
        bar.style.top = `${scrollTop + container.clientHeight - bar.offsetHeight}px`;
        bar.style.bottom = "auto";
        bar.style.width = `${clientSize}px`;
      } else {
        bar.style.top = `${scrollTop}px`;
        bar.style.left = `${scrollLeft + container.clientWidth - bar.offsetWidth}px`;
        bar.style.right = "auto";
        bar.style.height = `${clientSize}px`;
      }
    }
    if (!hasOverflow) {
      bar.style.opacity = "0";
      bar.style.pointerEvents = "none";
      thumb.style[isHorizontal ? "width" : "height"] = "0px";
      thumb.style[isHorizontal ? "left" : "top"] = "0px";
      return;
    }
    if (!dragging && !hovered) {
      bar.style.opacity = "0";
      bar.style.pointerEvents = "none";
    }
    const ratio = clientSize / scrollSize;
    const thumbSize = Math.max(30, Math.floor(ratio * clientSize));
    const maxThumbPos = clientSize - thumbSize;
    const scrollRatio = maxScroll > 0 ? scrollPos / maxScroll : 0;
    const thumbPos = Math.round(maxThumbPos * scrollRatio);
    if (isHorizontal) {
      thumb.style.width = `${thumbSize}px`;
      thumb.style.left = `${thumbPos}px`;
    } else {
      thumb.style.height = `${thumbSize}px`;
      thumb.style.top = `${thumbPos}px`;
    }
  };
  const onScroll = () => update();
  container.addEventListener("scroll", onScroll, { passive: true });
  const onMouseEnter = () => {
    hovered = true;
    update();
    if (container.dataset.scrollable === "1") {
      bar.style.opacity = "1";
      bar.style.pointerEvents = "";
    }
  };
  const onMouseLeave = () => {
    hovered = false;
    if (dragging) return;
    bar.style.opacity = "0";
    bar.style.pointerEvents = "none";
  };
  container.addEventListener("mouseenter", onMouseEnter, { passive: true });
  container.addEventListener("mouseleave", onMouseLeave, { passive: true });
  if (externalBar) {
    bar.addEventListener("mouseenter", onMouseEnter, { passive: true });
    bar.addEventListener("mouseleave", onMouseLeave, { passive: true });
  }
  container.addEventListener("focusin", onMouseEnter, { passive: true });
  container.addEventListener("focusout", onMouseLeave, { passive: true });
  const resizeObserver = createRafResizeObserver(update);
  try {
    resizeObserver.observe(container);
  } catch (_) {
  }
  const mo = new MutationObserver(update);
  try {
    mo.observe(container, { childList: true, subtree: options.watchSubtree !== false });
  } catch (_) {
  }
  let resizeTimeout;
  const onWindowResize = () => {
    update();
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(update, 150);
  };
  window.addEventListener("resize", onWindowResize, { passive: true });
  const onMouseDown = (e) => {
    dragging = true;
    startPos = isHorizontal ? e.clientX : e.clientY;
    thumbStartPos = parseFloat(thumb.style[isHorizontal ? "left" : "top"]) || 0;
    bar.style.opacity = "1";
    bar.style.pointerEvents = "";
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp, { once: true });
    e.preventDefault();
    e.stopPropagation();
  };
  const onMouseMove = (e) => {
    if (!dragging) return;
    e.preventDefault();
    const { scrollSize, clientSize } = getScrollProps();
    const maxScroll = scrollSize - clientSize;
    if (maxScroll <= 0) return;
    const thumbSize = parseFloat(thumb.style[isHorizontal ? "width" : "height"]) || 30;
    const maxThumbPos = clientSize - thumbSize;
    const delta = (isHorizontal ? e.clientX : e.clientY) - startPos;
    let newThumbPos = thumbStartPos + delta;
    newThumbPos = Math.max(0, Math.min(maxThumbPos, newThumbPos));
    const thumbRatio = maxThumbPos > 0 ? newThumbPos / maxThumbPos : 0;
    if (isHorizontal) {
      container.scrollLeft = thumbRatio * maxScroll;
    } else {
      container.scrollTop = thumbRatio * maxScroll;
    }
  };
  const onMouseUp = () => {
    dragging = false;
    document.removeEventListener("mousemove", onMouseMove);
    const rect = container.getBoundingClientRect();
    const isMouseOver = document.elementsFromPoint(
      (rect.left + rect.right) / 2,
      (rect.top + rect.bottom) / 2
    ).includes(container);
    if (!isMouseOver) {
      bar.style.opacity = "0";
      bar.style.pointerEvents = "none";
    }
  };
  thumb.addEventListener("mousedown", onMouseDown);
  let onWheel = null;
  if (isHorizontal) {
    onWheel = (e) => {
      const { scrollSize, clientSize } = getScrollProps();
      if (scrollSize <= clientSize) return;
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      if (container.scrollHeight > container.clientHeight) return;
      e.preventDefault();
      container.scrollLeft += e.deltaY;
    };
    container.addEventListener("wheel", onWheel, { passive: false });
  }
  requestAnimationFrame(() => {
    requestAnimationFrame(update);
  });
  setTimeout(update, 50);
  const cleanup = () => {
    container.removeEventListener("scroll", onScroll);
    container.removeEventListener("mouseenter", onMouseEnter);
    container.removeEventListener("mouseleave", onMouseLeave);
    container.removeEventListener("focusin", onMouseEnter);
    container.removeEventListener("focusout", onMouseLeave);
    if (externalBar) {
      bar.removeEventListener("mouseenter", onMouseEnter);
      bar.removeEventListener("mouseleave", onMouseLeave);
    }
    if (onWheel) container.removeEventListener("wheel", onWheel);
    window.removeEventListener("resize", onWindowResize);
    try {
      resizeObserver.disconnect();
    } catch (_) {
    }
    try {
      mo.disconnect();
    } catch (_) {
    }
    bar.remove();
  };
  const handle = { update, cleanup, bar, thumb };
  container.__overlayScrollbarInstalled[orientationKey] = handle;
  return handle;
}
function installWorkspaceScrollbars(workspace, options = {}) {
  if (!workspace) return null;
  if (workspace.__workspaceOverlayScrollbarsInstalled) return workspace.__workspaceOverlayScrollbarsUpdate;
  installOverlayScrollbar(workspace, {
    orientation: "vertical",
    className: options.verticalClass || "panel-scrollbar",
    watchSubtree: options.watchSubtree ?? true
  });
  installOverlayScrollbar(workspace, {
    orientation: "horizontal",
    className: options.horizontalClass || "tabs-scrollbar",
    watchSubtree: options.watchSubtree ?? true
  });
  const update = () => {
    const maxX = Math.max(0, workspace.scrollWidth - workspace.clientWidth);
    const maxY = Math.max(0, workspace.scrollHeight - workspace.clientHeight);
    workspace.dataset.scrollableX = maxX > 1 ? "1" : "0";
    workspace.dataset.scrollableY = maxY > 1 ? "1" : "0";
  };
  workspace.__workspaceOverlayScrollbarsInstalled = true;
  workspace.__workspaceOverlayScrollbarsUpdate = update;
  workspace.addEventListener("scroll", update, { passive: true });
  const ro = createRafResizeObserver(update);
  try {
    ro.observe(workspace);
  } catch (_) {
  }
  const mo = new MutationObserver(update);
  try {
    mo.observe(workspace, { childList: true, subtree: true });
  } catch (_) {
  }
  requestAnimationFrame(update);
  return update;
}
function installCollapsibleScrollbars() {
  const installOnElement = (el) => {
    installOverlayScrollbar(el, {
      orientation: "vertical",
      setOverflow: false,
      watchSubtree: true
    });
  };
  const root = document.getElementById("twm-fixed-200");
  if (root) {
    root.querySelectorAll(".twm-collapsible-content.visible").forEach(installOnElement);
  }
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "attributes" && mutation.attributeName === "class") {
        const el = mutation.target;
        if (el.classList.contains("twm-collapsible-content") && el.classList.contains("visible")) {
          installOnElement(el);
        }
        continue;
      }
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.classList?.contains("twm-collapsible-content") && node.classList?.contains("visible")) {
          installOnElement(node);
        }
        node.querySelectorAll?.(".twm-collapsible-content.visible")?.forEach(installOnElement);
      }
    }
  });
  const target = root || document.body;
  observer.observe(target, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class"]
  });
  return () => observer.disconnect();
}
function installTabsScrollbars(selectors = [".tabs"]) {
  const selector = selectors.join(", ");
  const classes = selectors.filter((s) => s.startsWith(".")).map((s) => s.slice(1));
  const installOnElement = (el) => {
    installOverlayScrollbar(el, {
      orientation: "horizontal",
      className: "tabs-scrollbar",
      setOverflow: false,
      externalBar: true,
      watchSubtree: true
    });
  };
  const cleanupElement = (el) => {
    el.__overlayScrollbarInstalled?.horizontal?.cleanup?.();
    delete el.__overlayScrollbarInstalled;
  };
  const matches = (el) => classes.some((c) => el.classList?.contains(c));
  document.querySelectorAll(selector).forEach(installOnElement);
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (matches(node)) installOnElement(node);
        node.querySelectorAll?.(selector)?.forEach(installOnElement);
      }
      for (const node of mutation.removedNodes) {
        if (node.nodeType !== 1) continue;
        if (matches(node)) cleanupElement(node);
        node.querySelectorAll?.(selector)?.forEach(cleanupElement);
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  return () => observer.disconnect();
}

// src/ui/utils/tooltip_service.js
var tooltipElement = null;
var currentTarget = null;
var listenersAttached = false;
var mouseCheckInterval = null;
var lastMousePosition = { x: 0, y: 0 };
function createTooltipElement() {
  if (tooltipElement) return tooltipElement;
  tooltipElement = document.createElement("div");
  tooltipElement.className = "twm-latex-tooltip";
  document.body.appendChild(tooltipElement);
  return tooltipElement;
}
function positionTooltip(target, tooltip) {
  const rect = target.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  const gap = 12;
  const margin = 10;
  const requestedPlacement = (target.dataset?.tooltipPlacement || target.getAttribute("data-tooltip-placement") || "").toLowerCase() || (target.dataset?.latexPlacement || target.getAttribute("data-latex-placement") || "").toLowerCase() || (target.closest(".twm-global-top-bar") ? "bottom" : target.closest(".twm-fl-bar") ? "right" : "top");
  let placement = requestedPlacement || "top";
  const isExplicitPlacement = target.hasAttribute("data-tooltip-placement") || target.hasAttribute("data-latex-placement");
  if (!isExplicitPlacement) {
    const spaceAbove = rect.top - margin;
    const spaceBelow = window.innerHeight - rect.bottom - margin;
    const spaceLeft = rect.left - margin;
    const spaceRight = window.innerWidth - rect.right - margin;
    if (placement === "top" && tooltipRect.height > spaceAbove && spaceBelow > spaceAbove) {
      placement = "bottom";
    } else if (placement === "bottom" && tooltipRect.height > spaceBelow && spaceAbove > spaceBelow) {
      placement = "top";
    } else if (placement === "left" && tooltipRect.width > spaceLeft && spaceRight > spaceLeft) {
      placement = "right";
    } else if (placement === "right" && tooltipRect.width > spaceRight && spaceLeft > spaceRight) {
      placement = "left";
    }
  }
  let left, top;
  if (placement === "top") {
    left = rect.left + rect.width / 2 - tooltipRect.width / 2;
    top = rect.top - tooltipRect.height - gap;
  } else if (placement === "bottom") {
    left = rect.left + rect.width / 2 - tooltipRect.width / 2;
    top = rect.bottom + gap;
  } else if (placement === "left") {
    left = rect.left - tooltipRect.width - gap;
    top = rect.top + rect.height / 2 - tooltipRect.height / 2;
  } else if (placement === "right") {
    left = rect.right + gap;
    top = rect.top + rect.height / 2 - tooltipRect.height / 2;
  }
  const clampedLeft = Math.max(margin, Math.min(left, window.innerWidth - tooltipRect.width - margin));
  const clampedTop = Math.max(margin, Math.min(top, window.innerHeight - tooltipRect.height - margin));
  tooltip.style.left = `${clampedLeft}px`;
  tooltip.style.top = `${clampedTop}px`;
  const targetCenterX = rect.left + rect.width / 2;
  const targetCenterY = rect.top + rect.height / 2;
  let notchOffset = 0;
  if (placement === "top" || placement === "bottom") {
    const tooltipCenterX = clampedLeft + tooltipRect.width / 2;
    notchOffset = targetCenterX - tooltipCenterX;
    const maxOffset = tooltipRect.width / 2 - 16;
    notchOffset = Math.max(-maxOffset, Math.min(notchOffset, maxOffset));
  } else {
    const tooltipCenterY = clampedTop + tooltipRect.height / 2;
    notchOffset = targetCenterY - tooltipCenterY;
    const maxOffset = tooltipRect.height / 2 - 16;
    notchOffset = Math.max(-maxOffset, Math.min(notchOffset, maxOffset));
  }
  const setAttributes = () => {
    tooltip.setAttribute("data-placement", placement);
    tooltip.style.setProperty("--notch-offset", `${notchOffset}px`);
  };
  const guard = window.stateGuard;
  if (guard?.executeWithBypass) {
    guard.executeWithBypass("latex-tooltip:set-placement", setAttributes);
  } else {
    setAttributes();
  }
}
function showTooltip(target) {
  if (!target || !target.getAttribute) return;
  const hasLatex = target.classList && target.classList.contains("has-latex-tooltip");
  const hasPlain = target.classList && target.classList.contains("twm-has-tooltip");
  if (!hasLatex && !hasPlain) return;
  currentTarget = target;
  const tooltip = createTooltipElement();
  if (hasLatex) {
    const latex = target.getAttribute("data-latex-tooltip");
    if (!latex) return;
    try {
      if (typeof katex !== "undefined") {
        katex.render(latex, tooltip, {
          displayMode: true,
          throwOnError: false,
          trust: false
        });
      } else {
        tooltip.textContent = latex;
      }
    } catch (err) {
      window.logger?.error("nodes", "KaTeX rendering error:", err);
      tooltip.textContent = latex;
    }
  } else if (hasPlain) {
    const text = target.getAttribute("data-tooltip");
    if (!text) return;
    const formattedText = text.replace(/&#10;/g, "\n");
    const lines = formattedText.split("\n");
    tooltip.innerHTML = "";
    lines.forEach((line, index) => {
      if (index === 0) {
        const header = document.createElement("strong");
        header.textContent = line;
        tooltip.appendChild(header);
      } else {
        tooltip.appendChild(document.createElement("br"));
        const textNode = document.createTextNode(line);
        tooltip.appendChild(textNode);
      }
    });
  }
  const widthOverride = target.getAttribute("data-tooltip-max-width");
  tooltip.style.maxWidth = widthOverride || "";
  requestAnimationFrame(() => {
    positionTooltip(target, tooltip);
    tooltip.classList.add("visible");
    startMouseCheck();
  });
}
function hideTooltip() {
  if (tooltipElement) {
    tooltipElement.classList.remove("visible");
  }
  currentTarget = null;
  if (mouseCheckInterval) {
    clearInterval(mouseCheckInterval);
    mouseCheckInterval = null;
  }
}
function startMouseCheck() {
  if (mouseCheckInterval) {
    clearInterval(mouseCheckInterval);
  }
  mouseCheckInterval = setInterval(() => {
    if (!currentTarget) {
      clearInterval(mouseCheckInterval);
      mouseCheckInterval = null;
      return;
    }
    const elementUnderMouse = document.elementFromPoint(lastMousePosition.x, lastMousePosition.y);
    if (elementUnderMouse) {
      const isStillOnTarget = elementUnderMouse === currentTarget || currentTarget.contains(elementUnderMouse) || elementUnderMouse.closest(".twm-has-tooltip, .has-latex-tooltip") === currentTarget;
      if (!isStillOnTarget) {
        hideTooltip();
      }
    } else {
      hideTooltip();
    }
  }, 3e3);
}
function attachListeners() {
  if (listenersAttached) return;
  listenersAttached = true;
  document.querySelectorAll(".twm-has-tooltip, .has-latex-tooltip").forEach((el) => {
    el.removeAttribute("title");
  });
  document.addEventListener("mousemove", (event) => {
    lastMousePosition.x = event.clientX;
    lastMousePosition.y = event.clientY;
  }, { passive: true });
  document.addEventListener("mouseenter", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const tooltipTarget = target.closest(".has-latex-tooltip, .twm-has-tooltip");
    if (!tooltipTarget) return;
    if (tooltipTarget.closest(".panel.twm-fixed-200 .node.template")) {
      return;
    }
    showTooltip(tooltipTarget);
  }, true);
  document.addEventListener("mouseleave", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const tooltipTarget = target.closest(".has-latex-tooltip, .twm-has-tooltip");
    if (!tooltipTarget) return;
    if (tooltipTarget.closest(".panel.twm-fixed-200 .node.template")) {
      return;
    }
    hideTooltip();
  }, true);
  document.addEventListener("scroll", hideTooltip, true);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      hideTooltip();
    }
  }, true);
}
function initializeTooltips() {
  const initInterval = setInterval(() => {
    if (typeof katex !== "undefined") {
      clearInterval(initInterval);
      if (!listenersAttached) {
        attachListeners();
      }
    }
  }, 100);
  setTimeout(() => {
    clearInterval(initInterval);
    if (!listenersAttached) {
      attachListeners();
    }
  }, 2e3);
}
function setTooltip(element, text, isLatex = false) {
  if (!element || !text) return;
  element.removeAttribute("title");
  if (isLatex) {
    element.classList.add("has-latex-tooltip");
    element.classList.remove("twm-has-tooltip");
    element.setAttribute("data-latex-tooltip", text);
  } else {
    element.classList.add("twm-has-tooltip");
    element.classList.remove("has-latex-tooltip");
    element.setAttribute("data-tooltip", text);
  }
}
function refreshTooltips(container = document) {
  container.querySelectorAll(".twm-has-tooltip, .has-latex-tooltip").forEach((el) => {
    el.removeAttribute("title");
  });
}
var TooltipService = {
  show: showTooltip,
  hide: hideTooltip,
  set: setTooltip,
  refresh: refreshTooltips,
  init: initializeTooltips
};
if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeTooltips);
  } else {
    initializeTooltips();
  }
}
if (typeof window !== "undefined") {
  window.LatexTooltip = TooltipService;
}
export {
  ActionDropdown,
  AutocompleteField,
  ComponentBase,
  ControllerBase,
  DEFAULT_TYPES,
  DataTable,
  DragReorder,
  HelpModal,
  ManagedWindow,
  NotificationCenter,
  NotificationHistory,
  PANEL_STATES,
  PANEL_TRANSITIONS,
  PageBase,
  PanelStateMachine,
  SCALAR_TYPES,
  SlideOutPanel,
  SliderField,
  SortableList,
  TooltipService,
  TreeView,
  WindowChromeController,
  WindowTaskbar,
  attachInlineRenamer,
  createDetailHeader,
  createRafResizeObserver,
  createTableStateStore,
  createTreeCategory,
  createTreeItem,
  createTreeNode,
  filterTree,
  helpCategories,
  helpCopy,
  helpProvider,
  hideContextMenu,
  installCollapsibleScrollbars,
  installOverlayScrollbar,
  installTabsScrollbars,
  installWorkspaceScrollbars,
  mountAttributeListEditor,
  mountGalleryPicker,
  openConfirm,
  openForm,
  openModal,
  refTypesFor,
  reportBridgeError,
  selectItem,
  setHelpProvider,
  showAboutDialog,
  showChoiceDialog,
  showCloseConfirmDialog,
  showComputingWindow,
  showConfirmDialog,
  showContextMenu,
  showDeleteConfirmDialog,
  showRunProgressDialog,
  showSelectDialog,
  toastError,
  toastInfo,
  toastSuccess,
  toastWarn,
  toggleCategory,
  toggleNode,
  updateDetailHeader
};
//# sourceMappingURL=widgets.js.map
