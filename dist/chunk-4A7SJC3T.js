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

// src/ui/components/action_dropdown.js
var EDGE_MARGIN = 8;
var GAP = 8;
var ActionDropdown = class _ActionDropdown {
  /**
   * @param {Object} config
   * @param {HTMLElement} config.trigger - Button element that triggers the dropdown
   * @param {Array} config.options - Array of option objects with { type, label, icon, description? },
   *     or `{ separator: true }` for a divider between them
   * @param {Function} config.onSelect - Callback when an option is selected
   * @param {string} [config.className=''] - Additional CSS class for the dropdown
   * @param {string} [config.menuId] - Optional ID for the menu element
   */
  constructor(config) {
    this.trigger = config.trigger;
    this.options = config.options || [];
    this.onSelect = config.onSelect;
    this.className = config.className || "";
    this.menuId = config.menuId;
    this.isOpen = false;
    this.menuEl = null;
    this._boundHandleDocumentClick = this._handleDocumentClick.bind(this);
    this._boundHandleKeydown = this._handleKeydown.bind(this);
    this._boundHandleTriggerClick = this._handleTriggerClick.bind(this);
    this._init();
  }
  /**
   * Initialize the dropdown.
   * @private
   */
  _init() {
    if (!this.trigger) {
      console.warn("[ActionDropdown] No trigger element provided");
      return;
    }
    this._createMenu();
    this.trigger.addEventListener("click", this._boundHandleTriggerClick);
  }
  /**
   * Create the dropdown menu element.
   * @private
   */
  _createMenu() {
    const menu = document.createElement("div");
    menu.className = `twm-action-dropdown-menu ${this.className}`.trim();
    menu.setAttribute("role", "menu");
    menu.hidden = true;
    if (this.menuId) {
      menu.id = this.menuId;
    }
    this._renderOptions(menu);
    document.body.appendChild(menu);
    this.menuEl = menu;
  }
  /**
   * Render option buttons, and dividers for separator entries, into a
   * container element. `data-index` stays the entry's index in `options`.
   * @param {HTMLElement} container
   * @private
   */
  _renderOptions(container) {
    container.innerHTML = "";
    let pendingSeparator = false;
    this.options.forEach((opt, index) => {
      if (opt?.separator) {
        pendingSeparator = container.childElementCount > 0;
        return;
      }
      if (pendingSeparator) {
        const sep = document.createElement("div");
        sep.className = "twm-action-dropdown-separator";
        sep.setAttribute("role", "separator");
        container.appendChild(sep);
        pendingSeparator = false;
      }
      const optionBtn = document.createElement("button");
      optionBtn.type = "button";
      optionBtn.className = "twm-action-dropdown-option";
      optionBtn.dataset.index = index;
      optionBtn.dataset.type = opt.type;
      optionBtn.setAttribute("role", "menuitem");
      const iconHtml = opt.icon ? `<span class="material-symbols-outlined twm-option-icon">${opt.icon}</span>` : "";
      const descHtml = opt.description ? `<span class="twm-option-desc">${opt.description}</span>` : "";
      optionBtn.innerHTML = `
                ${iconHtml}
                <span class="option-text">
                    <span class="twm-option-label">${opt.label}</span>
                    ${descHtml}
                </span>
            `;
      optionBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._selectOption(opt);
      });
      container.appendChild(optionBtn);
    });
  }
  /**
   * Handle trigger button click.
   * @param {MouseEvent} e
   * @private
   */
  _handleTriggerClick(e) {
    e.preventDefault();
    e.stopPropagation();
    this.toggle();
  }
  /**
   * Toggle the dropdown open/closed.
   * @param {boolean} [forceState] - Optional forced state
   */
  toggle(forceState) {
    const shouldOpen = typeof forceState === "boolean" ? forceState : !this.isOpen;
    if (shouldOpen) {
      this.open();
    } else {
      this.close();
    }
  }
  /**
   * Open the dropdown with auto-positioning.
   */
  open() {
    if (this.isOpen || !this.menuEl) return;
    this.isOpen = true;
    this.menuEl.hidden = false;
    _ActionDropdown.position(this.trigger, this.menuEl);
    requestAnimationFrame(() => {
      this.menuEl?.classList.add("visible");
    });
    this.trigger?.classList.add("twm-is-open");
    if (this.trigger?.hasAttribute("aria-expanded")) {
      this.trigger.setAttribute("aria-expanded", "true");
    }
    document.addEventListener("click", this._boundHandleDocumentClick, true);
    document.addEventListener("keydown", this._boundHandleKeydown);
    const firstOption = this.menuEl.querySelector(".twm-action-dropdown-option");
    firstOption?.focus();
  }
  /**
   * Close the dropdown.
   */
  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    if (this.menuEl) {
      this.menuEl.classList.remove("visible");
      this.menuEl.hidden = true;
    }
    this.trigger?.classList.remove("twm-is-open");
    if (this.trigger?.hasAttribute("aria-expanded")) {
      this.trigger.setAttribute("aria-expanded", "false");
    }
    document.removeEventListener("click", this._boundHandleDocumentClick, true);
    document.removeEventListener("keydown", this._boundHandleKeydown);
  }
  /**
   * Handle document click (close on outside click).
   * @param {MouseEvent} e
   * @private
   */
  _handleDocumentClick(e) {
    if (!this.isOpen) return;
    if (this.menuEl?.contains(e.target) || this.trigger?.contains(e.target)) {
      return;
    }
    this.close();
  }
  /**
   * Handle keyboard events.
   * @param {KeyboardEvent} e
   * @private
   */
  _handleKeydown(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      this.close();
      this.trigger?.focus();
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      this._navigateOptions(e.key === "ArrowDown" ? 1 : -1);
    }
  }
  /**
   * Navigate options with arrow keys.
   * @param {number} direction - 1 for down, -1 for up
   * @private
   */
  _navigateOptions(direction) {
    const options = this.menuEl?.querySelectorAll(".twm-action-dropdown-option");
    if (!options || options.length === 0) return;
    const currentIndex = Array.from(options).findIndex((opt) => opt === document.activeElement);
    let nextIndex = currentIndex + direction;
    if (nextIndex < 0) nextIndex = options.length - 1;
    if (nextIndex >= options.length) nextIndex = 0;
    options[nextIndex]?.focus();
  }
  /**
   * Handle option selection.
   * @param {Object} option - The selected option
   * @private
   */
  _selectOption(option) {
    this.close();
    if (this.onSelect) {
      this.onSelect(option);
    }
  }
  /**
   * Update the options dynamically.
   * @param {Array} newOptions - New options array
   */
  setOptions(newOptions) {
    this.options = newOptions;
    if (this.menuEl) {
      this._renderOptions(this.menuEl);
    }
  }
  /**
   * Destroy the dropdown and clean up.
   */
  destroy() {
    this.close();
    this.trigger?.removeEventListener("click", this._boundHandleTriggerClick);
    this.menuEl?.remove();
    this.menuEl = null;
    this.trigger = null;
    this.options = [];
    this.onSelect = null;
  }
  // =========================================================================
  // STATIC — shared auto-positioning for any trigger + menu pair
  // =========================================================================
  /**
   * Position a dropdown menu relative to a trigger element.
   * Uses `position: fixed` to avoid overflow clipping.
   * Picks above/below based on available space, aligns left/right edge,
   * and applies `max-height` + `overflow-y: auto` when the menu is taller
   * than the available space.
   *
   * @param {HTMLElement} trigger - The element the dropdown opens from
   * @param {HTMLElement} menu - The dropdown menu element to position
   */
  static position(trigger, menu) {
    if (!trigger || !menu) return;
    Object.assign(menu.style, {
      position: "fixed",
      top: "auto",
      bottom: "auto",
      left: "auto",
      right: "auto",
      maxHeight: "",
      overflowY: ""
    });
    const triggerRect = trigger.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const spaceBelow = vh - triggerRect.bottom - GAP - EDGE_MARGIN;
    const spaceAbove = triggerRect.top - GAP - EDGE_MARGIN;
    let top;
    let maxHeight;
    if (menuRect.height <= spaceBelow) {
      top = triggerRect.bottom + GAP;
      maxHeight = spaceBelow;
    } else if (menuRect.height <= spaceAbove) {
      top = triggerRect.top - GAP - menuRect.height;
      maxHeight = spaceAbove;
    } else if (spaceBelow >= spaceAbove) {
      top = triggerRect.bottom + GAP;
      maxHeight = spaceBelow;
    } else {
      maxHeight = spaceAbove;
      top = EDGE_MARGIN;
    }
    let left = triggerRect.left;
    if (left + menuRect.width > vw - EDGE_MARGIN) {
      left = triggerRect.right - menuRect.width;
    }
    left = Math.max(EDGE_MARGIN, Math.min(left, vw - menuRect.width - EDGE_MARGIN));
    Object.assign(menu.style, {
      position: "fixed",
      top: `${Math.round(top)}px`,
      left: `${Math.round(left)}px`,
      maxHeight: `${Math.round(maxHeight)}px`,
      overflowY: "auto"
    });
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
  /** @type {ResizeObserver|null} */
  #hostObserver = null;
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
      this.#observeHost();
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
    this.#hostObserver?.disconnect();
    this.#hostObserver = null;
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
  /** The host moves or resizes without any window event when a tile
   *  splitter is dragged or a dock panel toggles, and the fixed geometry
   *  would then stay at the old coordinates. Observe the host AND each
   *  ancestor: a host can move without changing size of its own (a dock
   *  panel toggling beside a fixed-width tile shrinks the content area,
   *  an ancestor, and the tile only shifts). The callback runs
   *  synchronously, after layout and before paint, so the panel follows
   *  a drag without a frame of lag; it only writes the panel's own
   *  `position: fixed` geometry, which is out of flow and resizes
   *  nothing observed, so it cannot loop. */
  #observeHost() {
    this.#hostObserver = new ResizeObserver(this.#trackGeometry);
    for (let el = this.#container; el; el = el.parentElement) {
      this.#hostObserver.observe(el);
    }
  }
  /** Pin the panel to the right edge of its host's *visible* frame
   *  using `position: fixed`. Re-run on every window scroll/resize and
   *  every host resize (#observeHost) so the panel always overlays the
   *  host correctly even when the host itself sits inside a scrolled
   *  ancestor.
   *
   *  UNDER A CSS `zoom` (the shell's content zoom scales a tile body),
   *  `getBoundingClientRect()` answers in screen pixels, which already
   *  carry the zoom, while the panel's own `top`/`left`/`height` are
   *  CSS pixels that the same zoom multiplies again. Copied across
   *  unchanged, every length was scaled twice: at 150% the panel landed
   *  right of and below its host, at 50% it was half the host's height.
   *  So the rect is divided by the panel's effective zoom
   *  (`currentCSSZoom`: 1 when nothing above it zooms, `undefined` in an
   *  engine that predates it), and the width subtracted is the panel's
   *  laid-out one, which `min-width` may hold above the requested
   *  width. Rounding happens in screen pixels, so at 100% the output is
   *  exactly what it always was. */
  #trackGeometry = () => {
    if (!this.#open || !this.#panel || !this.#container) return;
    const r = this.#container.getBoundingClientRect();
    const zoom = this.#panel.currentCSSZoom || 1;
    const width = this.#panel.offsetWidth || this.#width;
    const s = this.#panel.style;
    s.position = "fixed";
    s.top = `${Math.round(r.top) / zoom}px`;
    s.left = `${Math.round(r.right - width * zoom) / zoom}px`;
    s.right = "auto";
    s.height = `${Math.round(r.height) / zoom}px`;
  };
};

export {
  ComponentBase,
  ActionDropdown,
  SlideOutPanel
};
//# sourceMappingURL=chunk-4A7SJC3T.js.map
