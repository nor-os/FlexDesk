/**
 * ManagedWindow - A reusable window component with drag, resize, minimize, and persistence.
 *
 * Usage:
 *   const win = new ManagedWindow({
 *     id: 'my-window',
 *     title: 'My Window',
 *     icon: 'folder_open', // Material Symbols icon name (optional)
 *     content: myDomElement,
 *     minWidth: 400,
 *     minHeight: 300,
 *     defaultWidth: 600,
 *     defaultHeight: 400,
 *     canMaximize: true,
 *     onClose: () => { ... }
 *   });
 *   win.show();
 */

import { getSetting } from '../../core/settings.js';

const STORAGE_KEY = 'ecosim.managedWindows.v1';
const BASE_Z_INDEX = 6000;
const MAX_Z_INDEX = 6999;

// Bar heights for maximize bounds. Must match the tiling shell's
// own constants (host.css locks `.global-bottom-bar` to 22 px) so a
// maximized window stops above the bottom bar instead of slipping
// under it.
const TOP_BAR_HEIGHT = 35;
const BOTTOM_BAR_HEIGHT = 22;

// Default icon for windows
const DEFAULT_ICON = 'web_asset';

// Global state for z-order management
let _zIndexCounter = 0;
let _activeWindows = new Map(); // id -> ManagedWindow instance

/** Collect the focusable elements inside `root`, in DOM order. Used
 *  by the modal focus trap so Tab cycles within the modal frame and
 *  can't escape into the underlying tiles. */
function _collectFocusable(root) {
    if (!root) return [];
    const sel = [
        'a[href]',
        'button:not([disabled])',
        'input:not([disabled]):not([type="hidden"])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        '[tabindex]:not([tabindex="-1"])',
    ].join(',');
    return Array.from(root.querySelectorAll(sel)).filter((el) => {
        // Skip hidden / zero-size elements — Tab visits only what the
        // user can actually see.
        if (el.hidden) return false;
        if (el.closest('[hidden]')) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 || r.height > 0;
    });
}

// Global state cache
let _stateCache = null;

function _loadState() {
    if (_stateCache) return _stateCache;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        _stateCache = raw ? JSON.parse(raw) : {};
    } catch {
        _stateCache = {};
    }
    return _stateCache;
}

function _saveState(state) {
    _stateCache = state;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
        console.warn('[ManagedWindow] Failed to save state:', err);
    }
}

function _getWindowState(id) {
    const state = _loadState();
    return state[id] || null;
}

function _setWindowState(id, windowState) {
    const state = _loadState();
    state[id] = windowState;
    _saveState(state);
}

export class ManagedWindow {
    /**
     * @param {Object} options
     * @param {string} options.id - Unique window ID for persistence
     * @param {string} options.title - Window title
     * @param {string} [options.icon] - Material Symbols icon name (default: 'web_asset')
     * @param {HTMLElement|Function} options.content - Content element or render function
     * @param {number} [options.minWidth=400] - Minimum width
     * @param {number} [options.minHeight=300] - Minimum height
     * @param {number} [options.defaultWidth=600] - Default width
     * @param {number} [options.defaultHeight=400] - Default height
     * @param {boolean} [options.canMinimize=true] - Whether minimize button is shown
     * @param {boolean} [options.canMaximize=true] - Whether maximize button is shown
     * @param {boolean} [options.canResize=true] - Whether window can be resized
     * @param {boolean} [options.canDrag=true] - Whether window can be dragged
     * @param {boolean} [options.modal=false] - Whether to show backdrop
     * @param {Function} [options.onClose] - Callback when window is closed
     * @param {Function} [options.beforeClose] - Guard called before close. Return false (or a Promise resolving to false) to prevent closing.
     * @param {Function} [options.onMinimize] - Callback when window is minimized
     * @param {HTMLElement} [options.container] - Mount point. Defaults to
     *   `document.body` (every call site that exists today). When given, the
     *   window is positioned and CLAMPED inside that element instead of the
     *   viewport, and its taskbar events carry the container so a per-panel
     *   taskbar can filter on them.
     *
     *   The container MUST establish a containing block with
     *   `position: relative` or `position: absolute` — and with NOTHING else.
     *   `transform`, `filter`, `contain` and `will-change` also create a
     *   containing block, and they additionally trap `position: fixed`
     *   descendants. DataTable's filter dropdown (`position: fixed;
     *   z-index: 10001`) and the autocomplete dropdown deliberately ESCAPE
     *   their tile to the viewport; under a transformed ancestor they become
     *   container-relative and get clipped by `overflow: hidden`. The symptom
     *   is "the filter dropdown is cut in half" and the cause is three files
     *   away.
     * @param {Array} [options.titlebarButtons] - Extra buttons left of
     *   minimize: `{icon, title, onClick}`.
     */
    constructor(options) {
        this.id = options.id;
        this.title = options.title || 'Window';
        this.icon = options.icon || DEFAULT_ICON;
        this.content = options.content;
        this.minWidth = options.minWidth || 400;
        this.minHeight = options.minHeight || 300;
        this.defaultWidth = options.defaultWidth || 600;
        this.defaultHeight = options.defaultHeight || 400;
        this.canMinimize = options.canMinimize ?? true;
        this.canMaximize = options.canMaximize ?? true;
        this.canResize = options.canResize ?? true;
        this.modal = options.modal ?? false;
        // Backdrop appearance (modal only). `undefined` → inherit the CSS
        // default (blur 2px over a 50% dim). Override per-modal when the
        // background should stay legible — e.g. a live-applied editor where
        // you want to watch the content behind update.
        //   backdropBlur:    blur radius in px; 0 disables the blur.
        //   backdropOpacity: dim darkness, 0 (clear) … 1 (opaque black).
        this.backdropBlur = options.backdropBlur;
        this.backdropOpacity = options.backdropOpacity;
        // Modals are non-draggable by default
        this.canDrag = options.canDrag ?? !this.modal;
        this.onClose = options.onClose;
        this.beforeClose = options.beforeClose || null;
        this.onMinimize = options.onMinimize;
        // C1. `document.body` is the default and the legacy path; every bounds
        // computation below reduces to today's expression by substitution when
        // it is in force. See `_bounds`.
        this.container = options.container || null;
        this.titlebarButtons = Array.isArray(options.titlebarButtons)
            ? options.titlebarButtons : [];

        this.element = null;
        this.backdropElement = null;
        this.contentContainer = null;
        this.isVisible = false;
        this.isMinimized = false;
        this.isMaximized = false;
        this.zIndex = BASE_Z_INDEX;

        // Position/size state - clamp to the bounds rectangle
        this.x = 0;
        this.y = 0;
        const initial = this._bounds();
        this.width = Math.min(this.defaultWidth, initial.width);
        this.height = Math.min(this.defaultHeight, initial.height);

        // State before maximize (for restore)
        this._preMaximizeState = null;

        // Drag state
        this._dragState = null;
        this._resizeState = null;

        // Bound handlers for cleanup
        this._boundOnPointerMove = this._onPointerMove.bind(this);
        this._boundOnPointerUp = this._onPointerUp.bind(this);
        this._boundOnKeyDown = this._onKeyDown.bind(this);

        // Register globally
        _activeWindows.set(this.id, this);
    }

    /**
     * Show the window.
     */
    show() {
        if (this.isVisible && !this.isMinimized) {
            this.bringToFront();
            return;
        }

        if (!this.element) {
            this._build();
            this._restoreState();
        }

        if (this.isMinimized) {
            this._restore();
        } else {
            this._applyPosition();
            const mount = this.container || document.body;
            // C3. `--contained` switches `position: fixed` to `absolute`; the
            // backdrop follows the same rule so a modal inside a panel dims the
            // panel rather than the page.
            this.element.classList.toggle('twm-managed-window--contained', !!this.container);
            mount.appendChild(this.element);
            if (this.modal && this.backdropElement) {
                this.backdropElement.classList.toggle(
                    'twm-managed-window__backdrop--contained', !!this.container);
                mount.appendChild(this.backdropElement);
            }
            this._installContainerResizeObserver();
            this.isVisible = true;
        }

        this.bringToFront();
        document.addEventListener('keydown', this._boundOnKeyDown);
    }

    /**
     * Hide/close the window.
     * @param {{ force?: boolean }} [options] - Pass force:true to bypass the beforeClose guard.
     */
    close({ force = false } = {}) {
        if (!this.isVisible) return;

        if (!force && this.beforeClose) {
            const result = this.beforeClose();
            if (result && typeof result.then === 'function') {
                result.then(allowed => { if (allowed !== false) this._doClose(); });
                return;
            }
            if (result === false) return;
        }

        this._doClose();
    }

    /** Internal close — always executes, no guard. */
    _doClose() {
        if (!this.isVisible) return;

        this._saveCurrentState();

        // Call onClose BEFORE removing elements so content can still read its state
        // (e.g., expression modal needs to read the editor value before DOM is detached)
        if (this.onClose) {
            this.onClose();
        }

        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
        if (this.backdropElement && this.backdropElement.parentNode) {
            this.backdropElement.parentNode.removeChild(this.backdropElement);
        }

        this.isVisible = false;
        this.isMinimized = false;
        document.removeEventListener('keydown', this._boundOnKeyDown);

        // Notify taskbar
        this._teardownContainerResizeObserver();
        // C5. `container` rides on all three window events so a NON-SINGLETON
        // taskbar can filter on receipt: an in-panel taskbar shows only the
        // windows mounted in its own panel, and the viewport taskbar shows only
        // the ones with no container.
        window.dispatchEvent(new CustomEvent('managed-window-closed', {
            detail: { id: this.id, container: this.container }
        }));
    }

    /**
     * Minimize to taskbar with animation.
     */
    minimize() {
        if (!this.isVisible || this.isMinimized) return;

        this._saveCurrentState();
        this.isMinimized = true;

        if (this.onMinimize) {
            this.onMinimize();
        }

        if (this.backdropElement) {
            this.backdropElement.style.display = 'none';
        }

        // Dispatch event first so the taskbar button is created synchronously
        window.dispatchEvent(new CustomEvent('managed-window-minimized', {
            detail: {
                id: this.id, title: this.title, icon: this.icon,
                container: this.container,
            }
        }));

        if (!this.element) return;

        if (!getSetting('window.animateMinimize', true)) {
            this.element.style.display = 'none';
            return;
        }

        // Calculate animation target toward the taskbar button
        this._setMinimizeTargetProperties();
        this.element.classList.add('twm-managed-window--minimizing');

        setTimeout(() => {
            if (this.element) {
                this.element.style.display = 'none';
                this.element.classList.remove('twm-managed-window--minimizing');
                this._clearTargetProperties();
            }
        }, 200);
    }

    /**
     * Restore from minimized state with animation.
     */
    _restore() {
        if (!this.isMinimized) return;

        // Capture taskbar item rect BEFORE dispatching the event (which removes it)
        const taskbarRect = this._getTaskbarItemRect();

        if (this.element) {
            this.element.style.display = '';

            const animate = getSetting('window.animateMinimize', true);
            if (animate) {
                this._setRestoreTargetProperties(taskbarRect);
                this.element.classList.add('twm-managed-window--restoring');
                setTimeout(() => {
                    if (this.element) {
                        this.element.classList.remove('twm-managed-window--restoring');
                        this._clearTargetProperties();
                    }
                }, 250);
            }
        }
        if (this.modal && this.backdropElement) {
            this.backdropElement.style.display = '';
        }

        this.isMinimized = false;
        this.bringToFront();

        // Notify taskbar (removes the taskbar button)
        window.dispatchEvent(new CustomEvent('managed-window-restored', {
            detail: { id: this.id, container: this.container }
        }));
    }

    /**
     * Toggle maximize state.
     */
    toggleMaximize() {
        if (!this.canMaximize) return;

        if (this.isMaximized) {
            // Restore
            if (this._preMaximizeState) {
                this.x = this._preMaximizeState.x;
                this.y = this._preMaximizeState.y;
                this.width = this._preMaximizeState.width;
                this.height = this._preMaximizeState.height;
                this._preMaximizeState = null;
            }
            this.isMaximized = false;
        } else {
            // Maximize - respect top and bottom bars
            this._preMaximizeState = { x: this.x, y: this.y, width: this.width, height: this.height };
            const bounds = this._bounds();
            this.x = bounds.minX;
            this.y = bounds.minY;
            this.width = bounds.width;
            this.height = bounds.height;
            this.isMaximized = true;
        }

        this._applyPosition();
        this._saveCurrentState();
    }

    /**
     * Find the taskbar button for this window.
     * @returns {DOMRect|null}
     */
    _getTaskbarItemRect() {
        const btn = document.querySelector(`.twm-bar-windows__item[data-window-id="${this.id}"]`);
        return btn ? btn.getBoundingClientRect() : null;
    }

    /**
     * Set CSS custom properties to animate minimize toward the taskbar item.
     */
    _setMinimizeTargetProperties() {
        const targetRect = this._getTaskbarItemRect();
        if (!targetRect || !this.element) return;

        const winRect = this.element.getBoundingClientRect();
        const winCenterX = winRect.left + winRect.width / 2;
        const winCenterY = winRect.top + winRect.height / 2;
        const targetCenterX = targetRect.left + targetRect.width / 2;
        const targetCenterY = targetRect.top + targetRect.height / 2;

        const dx = targetCenterX - winCenterX;
        const dy = targetCenterY - winCenterY;
        const scale = Math.min(targetRect.width / winRect.width, targetRect.height / winRect.height, 0.15);

        this.element.style.setProperty('--mw-target-x', `${dx}px`);
        this.element.style.setProperty('--mw-target-y', `${dy}px`);
        this.element.style.setProperty('--mw-target-scale', scale);
    }

    /**
     * Set CSS custom properties to animate restore from the taskbar item position.
     * @param {DOMRect|null} taskbarRect
     */
    _setRestoreTargetProperties(taskbarRect) {
        if (!taskbarRect || !this.element) return;

        const winRect = this.element.getBoundingClientRect();
        const winCenterX = winRect.left + winRect.width / 2;
        const winCenterY = winRect.top + winRect.height / 2;
        const targetCenterX = taskbarRect.left + taskbarRect.width / 2;
        const targetCenterY = taskbarRect.top + taskbarRect.height / 2;

        const dx = targetCenterX - winCenterX;
        const dy = targetCenterY - winCenterY;
        const scale = Math.min(taskbarRect.width / winRect.width, taskbarRect.height / winRect.height, 0.15);

        this.element.style.setProperty('--mw-target-x', `${dx}px`);
        this.element.style.setProperty('--mw-target-y', `${dy}px`);
        this.element.style.setProperty('--mw-target-scale', scale);
    }

    /**
     * Clear animation CSS custom properties.
     */
    _clearTargetProperties() {
        if (!this.element) return;
        this.element.style.removeProperty('--mw-target-x');
        this.element.style.removeProperty('--mw-target-y');
        this.element.style.removeProperty('--mw-target-scale');
    }

    /**
     * Bring window to front of z-order.
     */
    bringToFront() {
        _zIndexCounter++;
        this.zIndex = Math.min(BASE_Z_INDEX + _zIndexCounter, MAX_Z_INDEX);
        if (this.element) {
            this.element.style.zIndex = this.zIndex.toString();
        }
        if (this.backdropElement) {
            this.backdropElement.style.zIndex = (this.zIndex - 1).toString();
        }
    }

    /**
     * Update window title.
     */
    setTitle(title) {
        this.title = title;
        if (this.element) {
            const titleEl = this.element.querySelector('.twm-managed-window__title');
            if (titleEl) titleEl.textContent = title;
        }
    }

    // ========== Private Methods ==========

    _build() {
        // Create backdrop for modal windows
        if (this.modal) {
            this.backdropElement = document.createElement('div');
            this.backdropElement.className = 'twm-managed-window__backdrop';
            // Apply backdrop overrides as inline styles only when the caller
            // set them; otherwise the CSS default governs (single source of
            // truth for the default look).
            if (this.backdropBlur !== undefined && this.backdropBlur !== null) {
                this.backdropElement.style.backdropFilter =
                    this.backdropBlur > 0 ? `blur(${this.backdropBlur}px)` : 'none';
            }
            if (this.backdropOpacity !== undefined && this.backdropOpacity !== null) {
                this.backdropElement.style.background =
                    `rgba(0, 0, 0, ${this.backdropOpacity})`;
            }
        }

        // Create window element
        this.element = document.createElement('div');
        this.element.className = 'twm-managed-window';
        if (!this.canDrag) {
            this.element.classList.add('twm-managed-window--no-drag');
        }
        if (this.modal) {
            this.element.classList.add('twm-managed-window--modal');
        }
        this.element.setAttribute('data-window-id', this.id);

        // Top bar
        const topbar = document.createElement('div');
        topbar.className = 'twm-managed-window__topbar';

        // Icon
        const icon = document.createElement('span');
        icon.className = 'twm-managed-window__icon material-symbols-outlined';
        icon.textContent = this.icon;

        const title = document.createElement('div');
        title.className = 'twm-managed-window__title';
        title.textContent = this.title;

        const buttons = document.createElement('div');
        buttons.className = 'twm-managed-window__buttons';

        // C6. Extra titlebar buttons, immediately LEFT of minimize — which is
        // exactly where the concept asks for the table cogwheel. Added before
        // the built-in buttons so the ordering is positional rather than
        // something each caller has to get right.
        for (const spec of this.titlebarButtons) {
            const btn = document.createElement('button');
            btn.className = 'twm-managed-window__btn twm-managed-window__btn--custom';
            btn.type = 'button';
            btn.title = spec.title || '';
            if (spec.icon) {
                const glyph = document.createElement('span');
                glyph.className = 'material-symbols-outlined';
                glyph.textContent = spec.icon;
                btn.appendChild(glyph);
            } else {
                btn.textContent = spec.label || '';
            }
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                spec.onClick?.(this, e);
            });
            buttons.appendChild(btn);
        }

        // Minimize button (optional)
        if (this.canMinimize) {
            const minBtn = document.createElement('button');
            minBtn.className = 'twm-managed-window__btn managed-window__btn--minimize';
            minBtn.type = 'button';
            minBtn.innerHTML = '<svg width="10" height="10" viewBox="0 0 10 10"><path d="M1 5h8" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>';
            minBtn.title = 'Minimize';
            minBtn.addEventListener('click', (e) => { e.stopPropagation(); this.minimize(); });
            buttons.appendChild(minBtn);
        }

        // Maximize button (optional)
        if (this.canMaximize) {
            const maxBtn = document.createElement('button');
            maxBtn.className = 'twm-managed-window__btn managed-window__btn--maximize';
            maxBtn.type = 'button';
            maxBtn.innerHTML = '<svg width="10" height="10" viewBox="0 0 10 10"><rect x="1" y="1" width="8" height="8" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>';
            maxBtn.title = 'Maximize';
            maxBtn.addEventListener('click', (e) => { e.stopPropagation(); this.toggleMaximize(); });
            buttons.appendChild(maxBtn);
        }

        // Close button
        const closeBtn = document.createElement('button');
        closeBtn.className = 'twm-managed-window__btn twm-managed-window__btn--close';
        closeBtn.type = 'button';
        closeBtn.innerHTML = '<svg width="10" height="10" viewBox="0 0 10 10"><path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>';
        closeBtn.title = 'Close';
        closeBtn.addEventListener('click', (e) => { e.stopPropagation(); this.close(); });
        buttons.appendChild(closeBtn);

        topbar.appendChild(icon);
        topbar.appendChild(title);
        topbar.appendChild(buttons);

        // Content container
        this.contentContainer = document.createElement('div');
        this.contentContainer.className = 'twm-managed-window__content';

        if (this.content instanceof HTMLElement) {
            this.contentContainer.appendChild(this.content);
        } else if (typeof this.content === 'function') {
            const rendered = this.content();
            if (rendered instanceof HTMLElement) {
                this.contentContainer.appendChild(rendered);
            }
        }

        this.element.appendChild(topbar);
        this.element.appendChild(this.contentContainer);

        // Resize handles (only if resizable)
        if (this.canResize) {
            this._addResizeHandles();
        }

        // Event listeners
        topbar.addEventListener('pointerdown', (e) => this._onTopbarPointerDown(e));
        if (this.canMaximize) {
            topbar.addEventListener('dblclick', () => this.toggleMaximize());
        }
        this.element.addEventListener('pointerdown', () => this.bringToFront());
    }

    _addResizeHandles() {
        const directions = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
        for (const dir of directions) {
            const handle = document.createElement('div');
            handle.className = `twm-managed-window__resize managed-window__resize--${dir}`;
            handle.addEventListener('pointerdown', (e) => this._onResizePointerDown(e, dir));
            this.element.appendChild(handle);
        }
    }

    /** C2. The bounds rectangle this window is clamped inside.
     *
     *  ONE computation replacing four inline copies. The `document.body` case —
     *  every call site that exists today — reduces to the previous expression
     *  BY SUBSTITUTION, not by "should be equivalent":
     *
     *      minX   = 0
     *      minY   = TOP_BAR_HEIGHT
     *      width  = window.innerWidth
     *      height = window.innerHeight - TOP_BAR_HEIGHT - BOTTOM_BAR_HEIGHT
     *
     *  so, substituting into the clamps below:
     *
     *      maxWidth  = width                          = window.innerWidth                      ✓
     *      maxHeight = height                         = innerHeight - TOP - BOTTOM              ✓
     *      maxX      = max(minX, minX + width - w)    = max(0, innerWidth - w)                  ✓
     *      maxY      = max(minY, minY + height - h)   = max(TOP, innerHeight - BOTTOM - h)      ✓
     *      x         = max(minX, min(x, maxX))        = max(0, min(x, maxX))                    ✓
     *      y         = max(minY, min(y, maxY))        = max(TOP, min(y, maxY))                  ✓
     *
     *  EcoAgent's and EcoSim's modals depend on that arithmetic; prove the
     *  equivalence in review by substitution rather than by testing.
     */
    _bounds() {
        if (this.container) {
            // Contained: coordinates are relative to the container, which is a
            // positioned ancestor, so the bars do not apply.
            return {
                minX: 0,
                minY: 0,
                width: this.container.clientWidth,
                height: this.container.clientHeight,
            };
        }
        return {
            minX: 0,
            minY: TOP_BAR_HEIGHT,
            width: window.innerWidth,
            height: window.innerHeight - TOP_BAR_HEIGHT - BOTTOM_BAR_HEIGHT,
        };
    }

    _applyPosition() {
        if (!this.element) return;

        const bounds = this._bounds();
        const maxWidth = bounds.width;
        const maxHeight = bounds.height;

        // Clamp width and height to the bounds (but respect minWidth/minHeight)
        this.width = Math.max(this.minWidth, Math.min(this.width, maxWidth));
        this.height = Math.max(this.minHeight, Math.min(this.height, maxHeight));

        // Ensure the window is within the bounds rectangle
        const maxX = Math.max(bounds.minX, bounds.minX + maxWidth - this.width);
        const maxY = Math.max(bounds.minY, bounds.minY + maxHeight - this.height);
        this.x = Math.max(bounds.minX, Math.min(this.x, maxX));
        this.y = Math.max(bounds.minY, Math.min(this.y, maxY));

        this.element.style.left = `${this.x}px`;
        this.element.style.top = `${this.y}px`;
        this.element.style.width = `${this.width}px`;
        this.element.style.height = `${this.height}px`;
    }

    /** C4. Re-clamp when the container resizes.
     *
     *  `managed_window.js` has NO resize listener at all today: a viewport
     *  resize simply leaves windows where they were until the next pointer
     *  move re-clamps them. That is survivable for the viewport, which resizes
     *  rarely, and not for a panel, which resizes every time someone drags a
     *  splitter — a window would end up outside its own panel and unreachable.
     */
    _installContainerResizeObserver() {
        if (!this.container || this._resizeObserver) return;
        this._resizeObserver = new ResizeObserver(() => {
            if (this.isMaximized) {
                const bounds = this._bounds();
                this.x = bounds.minX;
                this.y = bounds.minY;
                this.width = bounds.width;
                this.height = bounds.height;
            }
            this._applyPosition();
        });
        this._resizeObserver.observe(this.container);
    }

    _teardownContainerResizeObserver() {
        this._resizeObserver?.disconnect();
        this._resizeObserver = null;
    }

    _restoreState() {
        const bounds = this._bounds();
        const maxWidth = bounds.width;
        const maxHeight = bounds.height;

        // Modal windows always center on screen - never restore saved position
        const saved = this.modal ? null : _getWindowState(this.id);
        if (saved) {
            this.x = saved.x ?? this.x;
            this.y = saved.y ?? this.y;
            // Clamp restored dimensions to current viewport
            this.width = Math.min(saved.width ?? this.width, maxWidth);
            this.height = Math.min(saved.height ?? this.height, maxHeight);
            this.isMaximized = saved.maximized ?? false;

            if (this.isMaximized && this.canMaximize) {
                this._preMaximizeState = { x: saved.x, y: saved.y, width: saved.width, height: saved.height };
                this.x = bounds.minX;
                this.y = bounds.minY;
                this.width = maxWidth;
                this.height = maxHeight;
            }
        } else {
            // Center on screen (between top and bottom bars)
            this.x = Math.max(0, (maxWidth - this.width) / 2);
            this.y = Math.max(TOP_BAR_HEIGHT, TOP_BAR_HEIGHT + (maxHeight - this.height) / 2);
        }
    }

    _saveCurrentState() {
        // Modal windows always center - no need to persist position
        if (this.modal) return;

        _setWindowState(this.id, {
            x: this._preMaximizeState?.x ?? this.x,
            y: this._preMaximizeState?.y ?? this.y,
            width: this._preMaximizeState?.width ?? this.width,
            height: this._preMaximizeState?.height ?? this.height,
            maximized: this.isMaximized,
        });
    }

    // ========== Drag Handling ==========

    _onTopbarPointerDown(e) {
        // Don't start drag if clicking on buttons
        if (e.target.closest('.twm-managed-window__buttons')) return;
        if (this.isMaximized) return;
        if (!this.canDrag) return;

        e.preventDefault();
        this._dragState = {
            startX: e.clientX,
            startY: e.clientY,
            startWinX: this.x,
            startWinY: this.y,
        };

        document.addEventListener('pointermove', this._boundOnPointerMove);
        document.addEventListener('pointerup', this._boundOnPointerUp);
    }

    _onPointerMove(e) {
        if (this._dragState) {
            const dx = e.clientX - this._dragState.startX;
            const dy = e.clientY - this._dragState.startY;
            this.x = this._dragState.startWinX + dx;
            this.y = this._dragState.startWinY + dy;
            this._applyPosition();
        } else if (this._resizeState) {
            this._handleResize(e);
        }
    }

    _onPointerUp() {
        if (this._dragState || this._resizeState) {
            this._saveCurrentState();
        }
        this._dragState = null;
        this._resizeState = null;
        document.removeEventListener('pointermove', this._boundOnPointerMove);
        document.removeEventListener('pointerup', this._boundOnPointerUp);
    }

    // ========== Resize Handling ==========

    _onResizePointerDown(e, direction) {
        if (this.isMaximized) return;

        e.preventDefault();
        e.stopPropagation();

        this._resizeState = {
            direction,
            startX: e.clientX,
            startY: e.clientY,
            startWinX: this.x,
            startWinY: this.y,
            startWidth: this.width,
            startHeight: this.height,
        };

        document.addEventListener('pointermove', this._boundOnPointerMove);
        document.addEventListener('pointerup', this._boundOnPointerUp);
    }

    _handleResize(e) {
        const state = this._resizeState;
        if (!state) return;

        const dx = e.clientX - state.startX;
        const dy = e.clientY - state.startY;
        const dir = state.direction;

        // Calculate max available dimensions
        const maxWidth = window.innerWidth;
        const maxHeight = window.innerHeight - TOP_BAR_HEIGHT - BOTTOM_BAR_HEIGHT;

        let newX = state.startWinX;
        let newY = state.startWinY;
        let newW = state.startWidth;
        let newH = state.startHeight;

        // Handle horizontal resize
        if (dir.includes('e')) {
            newW = Math.max(this.minWidth, Math.min(state.startWidth + dx, maxWidth - newX));
        }
        if (dir.includes('w')) {
            const maxDx = state.startWidth - this.minWidth;
            const actualDx = Math.min(dx, maxDx);
            newX = Math.max(0, state.startWinX + actualDx);
            newW = state.startWidth - (newX - state.startWinX);
        }

        // Handle vertical resize
        if (dir.includes('s')) {
            newH = Math.max(this.minHeight, Math.min(state.startHeight + dy, maxHeight - (newY - TOP_BAR_HEIGHT)));
        }
        if (dir.includes('n')) {
            const maxDy = state.startHeight - this.minHeight;
            const actualDy = Math.min(dy, maxDy);
            newY = Math.max(TOP_BAR_HEIGHT, state.startWinY + actualDy);
            newH = state.startHeight - (newY - state.startWinY);
        }

        this.x = newX;
        this.y = newY;
        this.width = newW;
        this.height = newH;
        this._applyPosition();
    }

    // ========== Keyboard Handling ==========

    _onKeyDown(e) {
        if (!this.isVisible || this.isMinimized) return;
        // Only the top-most window owns global keydowns — otherwise a
        // background window would steal focus from an open modal.
        const topWindow = Array.from(_activeWindows.values())
            .filter(w => w.isVisible && !w.isMinimized)
            .sort((a, b) => b.zIndex - a.zIndex)[0];
        if (topWindow !== this) return;

        if (e.key === 'Escape') {
            this.close();
            return;
        }
        // Focus trap for modals: Tab and Shift+Tab cycle through the
        // focusable elements inside the modal's frame instead of
        // escaping to underlying tiles. Without this, Tab moves the
        // active element into the background — bad UX, and a
        // genuine WCAG focus-trap violation for accessibility tools.
        if (e.key === 'Tab' && this.modal && this.element) {
            const focusables = _collectFocusable(this.element);
            if (focusables.length === 0) {
                e.preventDefault();
                return;
            }
            const first = focusables[0];
            const last  = focusables[focusables.length - 1];
            const active = document.activeElement;
            if (e.shiftKey) {
                if (active === first || !this.element.contains(active)) {
                    e.preventDefault();
                    last.focus();
                }
            } else {
                if (active === last || !this.element.contains(active)) {
                    e.preventDefault();
                    first.focus();
                }
            }
        }
    }

    // ========== Static Methods ==========

    /**
     * Get a window by ID.
     */
    static get(id) {
        return _activeWindows.get(id) || null;
    }

    /**
     * Restore a minimized window by ID.
     */
    static restore(id) {
        const win = _activeWindows.get(id);
        if (win && win.isMinimized) {
            win._restore();
            win.bringToFront();
        }
    }
}
