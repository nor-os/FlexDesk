import {
  positionAnchored
} from "./chunk-Q7BALEPX.js";

// src/ui/components/action_dropdown.js
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
   * Position a dropdown menu relative to a trigger element: `positionAnchored`
   * (`anchored_layer.js`), the one placement every floating panel uses.
   *
   * @param {HTMLElement} trigger - The element the dropdown opens from
   * @param {HTMLElement} menu - The dropdown menu element to position
   * @param {Object} [opts]
   * @param {'start'|'end'} [opts.align='start'] - Which trigger edge the menu
   *     lines up with first: `'start'` its left edge, `'end'` its right edge.
   *     Either flips to the other edge when it would leave the window.
   */
  static position(trigger, menu, { align = "start" } = {}) {
    if (!trigger || !menu) return;
    positionAnchored(trigger, menu, { align });
  }
};

export {
  ActionDropdown
};
//# sourceMappingURL=chunk-PAI2ZUWV.js.map
