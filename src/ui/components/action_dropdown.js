/**
 * action_dropdown.js
 *
 * Reusable dropdown component for action buttons (Add Scenario, Add Widget, etc).
 * Handles opening, closing, auto-positioning, keyboard navigation, and outside clicks.
 *
 * Auto-positioning: measures available viewport space around the trigger element
 * and picks the best direction (above/below) and alignment (left/right).
 * Adds scrolling when the menu would exceed available vertical space.
 */

/** Viewport margin in px — dropdown stays this far from edges. */
const EDGE_MARGIN = 8;
/** Gap between trigger and dropdown in px. */
const GAP = 8;

/**
 * ActionDropdown - A reusable dropdown component with smart auto-positioning.
 *
 * Usage:
 * ```javascript
 * const dropdown = new ActionDropdown({
 *     trigger: buttonElement,
 *     options: [
 *         { type: 'option1', label: 'Option 1', icon: 'icon_name', description: 'Description' },
 *         { type: 'option2', label: 'Option 2', icon: 'icon_name', description: 'Description' }
 *     ],
 *     onSelect: (option) => console.log('Selected:', option.type),
 * });
 *
 * // Control programmatically
 * dropdown.open();
 * dropdown.close();
 * dropdown.toggle();
 * dropdown.destroy();
 * ```
 */
export class ActionDropdown {
    /**
     * @param {Object} config
     * @param {HTMLElement} config.trigger - Button element that triggers the dropdown
     * @param {Array} config.options - Array of option objects with { type, label, icon, description? }
     * @param {Function} config.onSelect - Callback when an option is selected
     * @param {string} [config.className=''] - Additional CSS class for the dropdown
     * @param {string} [config.menuId] - Optional ID for the menu element
     */
    constructor(config) {
        this.trigger = config.trigger;
        this.options = config.options || [];
        this.onSelect = config.onSelect;
        this.className = config.className || '';
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
            console.warn('[ActionDropdown] No trigger element provided');
            return;
        }

        this._createMenu();
        this.trigger.addEventListener('click', this._boundHandleTriggerClick);
    }

    /**
     * Create the dropdown menu element.
     * @private
     */
    _createMenu() {
        const menu = document.createElement('div');
        menu.className = `twm-action-dropdown-menu ${this.className}`.trim();
        menu.setAttribute('role', 'menu');
        menu.hidden = true;

        if (this.menuId) {
            menu.id = this.menuId;
        }

        this._renderOptions(menu);

        // Append to body so position:fixed works without clipping.
        document.body.appendChild(menu);

        this.menuEl = menu;
    }

    /**
     * Render option buttons into a container element.
     * @param {HTMLElement} container
     * @private
     */
    _renderOptions(container) {
        container.innerHTML = '';
        this.options.forEach((opt, index) => {
            const optionBtn = document.createElement('button');
            optionBtn.type = 'button';
            optionBtn.className = 'twm-action-dropdown-option';
            optionBtn.dataset.index = index;
            optionBtn.dataset.type = opt.type;
            optionBtn.setAttribute('role', 'menuitem');

            const iconHtml = opt.icon
                ? `<span class="material-symbols-outlined twm-option-icon">${opt.icon}</span>`
                : '';

            const descHtml = opt.description
                ? `<span class="twm-option-desc">${opt.description}</span>`
                : '';

            optionBtn.innerHTML = `
                ${iconHtml}
                <span class="option-text">
                    <span class="twm-option-label">${opt.label}</span>
                    ${descHtml}
                </span>
            `;

            optionBtn.addEventListener('click', (e) => {
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
        const shouldOpen = typeof forceState === 'boolean' ? forceState : !this.isOpen;
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

        // Position against trigger
        ActionDropdown.position(this.trigger, this.menuEl);

        // Animate in.
        //
        // OPTIONAL CHAINING, AND IT IS LOAD-BEARING. This callback runs a frame
        // after `open()` returned, and `destroy()` sets `this.menuEl = null`
        // (see below) — so a dropdown that is opened and then destroyed inside
        // one frame threw an uncaught `TypeError: Cannot read properties of
        // null` out of an animation-frame callback, where no caller has a stack
        // to catch it. That is not a hypothetical: it is what a user does every
        // time they open a picker and then click something that unmounts the
        // pane around it, and it was reproduced eighteen times in one run of a
        // consumer's settings suite. Nothing is lost by skipping the class — the
        // element it would have been added to no longer exists.
        requestAnimationFrame(() => {
            this.menuEl?.classList.add('visible');
        });

        // Update trigger state
        this.trigger?.classList.add('twm-is-open');
        if (this.trigger?.hasAttribute('aria-expanded')) {
            this.trigger.setAttribute('aria-expanded', 'true');
        }

        // Add document listeners
        document.addEventListener('click', this._boundHandleDocumentClick, true);
        document.addEventListener('keydown', this._boundHandleKeydown);

        // Focus first option for keyboard accessibility
        const firstOption = this.menuEl.querySelector('.twm-action-dropdown-option');
        firstOption?.focus();
    }

    /**
     * Close the dropdown.
     */
    close() {
        if (!this.isOpen) return;

        this.isOpen = false;

        if (this.menuEl) {
            this.menuEl.classList.remove('visible');
            this.menuEl.hidden = true;
        }

        // Update trigger state. `aria-expanded` belongs on the TRIGGER and has
        // to be written on every close, not only on the ones a click caused —
        // an embedder that synced it from its own click handler was announcing
        // an expanded menu to a screen reader every time Escape or an outside
        // click dismissed one. The component knows when it closed; nothing else
        // reliably does.
        this.trigger?.classList.remove('twm-is-open');
        if (this.trigger?.hasAttribute('aria-expanded')) {
            this.trigger.setAttribute('aria-expanded', 'false');
        }

        // Remove document listeners
        document.removeEventListener('click', this._boundHandleDocumentClick, true);
        document.removeEventListener('keydown', this._boundHandleKeydown);
    }

    /**
     * Handle document click (close on outside click).
     * @param {MouseEvent} e
     * @private
     */
    _handleDocumentClick(e) {
        if (!this.isOpen) return;

        // Don't close if clicking inside dropdown or trigger
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
        if (e.key === 'Escape') {
            // AND NOBODY ELSE GETS IT. An open dropdown is the innermost thing
            // on screen, so Escape means "close this" and nothing further —
            // but the event was left to bubble, and inside a `ManagedWindow`
            // (which binds its own Escape to dismiss) that meant one keystroke
            // closed the dropdown AND the dialog around it. The user loses a
            // form they were filling in because they changed their mind about
            // one field.
            e.preventDefault();
            e.stopPropagation();
            this.close();
            this.trigger?.focus();
            return;
        }

        // Arrow key navigation
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            this._navigateOptions(e.key === 'ArrowDown' ? 1 : -1);
        }
    }

    /**
     * Navigate options with arrow keys.
     * @param {number} direction - 1 for down, -1 for up
     * @private
     */
    _navigateOptions(direction) {
        const options = this.menuEl?.querySelectorAll('.twm-action-dropdown-option');
        if (!options || options.length === 0) return;

        const currentIndex = Array.from(options).findIndex(opt => opt === document.activeElement);
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

        // Remove trigger listener
        this.trigger?.removeEventListener('click', this._boundHandleTriggerClick);

        // Remove menu element
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

        // Reset any prior inline position so natural size can be measured.
        Object.assign(menu.style, {
            position: 'fixed',
            top: 'auto',
            bottom: 'auto',
            left: 'auto',
            right: 'auto',
            maxHeight: '',
            overflowY: ''
        });

        const triggerRect = trigger.getBoundingClientRect();
        const menuRect = menu.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        // ── Vertical: prefer below, flip above if insufficient room ───────
        const spaceBelow = vh - triggerRect.bottom - GAP - EDGE_MARGIN;
        const spaceAbove = triggerRect.top - GAP - EDGE_MARGIN;

        let top;
        let maxHeight;

        if (menuRect.height <= spaceBelow) {
            // Fits below — use natural height.
            top = triggerRect.bottom + GAP;
            maxHeight = spaceBelow;
        } else if (menuRect.height <= spaceAbove) {
            // Fits above — use natural height.
            top = triggerRect.top - GAP - menuRect.height;
            maxHeight = spaceAbove;
        } else if (spaceBelow >= spaceAbove) {
            // More space below — scroll.
            top = triggerRect.bottom + GAP;
            maxHeight = spaceBelow;
        } else {
            // More space above — scroll.
            maxHeight = spaceAbove;
            top = EDGE_MARGIN;
        }

        // ── Horizontal: align left-edge with trigger, flip if off-screen ──
        let left = triggerRect.left;

        if (left + menuRect.width > vw - EDGE_MARGIN) {
            // Align right edges instead.
            left = triggerRect.right - menuRect.width;
        }

        // Still off-screen? Clamp to edges.
        left = Math.max(EDGE_MARGIN, Math.min(left, vw - menuRect.width - EDGE_MARGIN));

        Object.assign(menu.style, {
            position: 'fixed',
            top: `${Math.round(top)}px`,
            left: `${Math.round(left)}px`,
            maxHeight: `${Math.round(maxHeight)}px`,
            overflowY: 'auto'
        });
    }
}

export default ActionDropdown;
