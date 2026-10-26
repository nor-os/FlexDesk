import {
  getSetting
} from "./chunk-HNU6MM2B.js";

// src/ui/components/managed_window.js
var DEFAULT_WINDOW_STORAGE_KEY = "flexdesk.managedWindows.v1";
var _storageKey = DEFAULT_WINDOW_STORAGE_KEY;
var DEFAULT_MAX_SAVED_WINDOWS = 50;
var MINTED_ID_PREFIX = "twm-mw-";
var _maxSavedWindows = DEFAULT_MAX_SAVED_WINDOWS;
var BASE_Z_INDEX = 6e3;
var MAX_Z_INDEX = 6999;
var TOP_BAR_HEIGHT = 35;
var BOTTOM_BAR_HEIGHT = 22;
function _topInset() {
  const row = typeof document !== "undefined" ? document.querySelector("body > .twm-global-menu-bar") : null;
  return TOP_BAR_HEIGHT + (row ? row.getBoundingClientRect().height : 0);
}
var SNAP_EDGE = 12;
var DEFAULT_ICON = "web_asset";
var _zIndexCounter = 0;
var _activeWindows = /* @__PURE__ */ new Map();
var _escAnswered = /* @__PURE__ */ new WeakSet();
function _collectFocusable(root) {
  if (!root) return [];
  const sel = [
    "a[href]",
    "button:not([disabled])",
    'input:not([disabled]):not([type="hidden"])',
    "select:not([disabled])",
    "textarea:not([disabled])",
    '[tabindex]:not([tabindex="-1"])'
  ].join(",");
  return Array.from(root.querySelectorAll(sel)).filter((el2) => {
    if (el2.hidden) return false;
    if (el2.closest("[hidden]")) return false;
    const r = el2.getBoundingClientRect();
    return r.width > 0 || r.height > 0;
  });
}
var _stateCache = null;
function _loadState() {
  if (_stateCache) return _stateCache;
  try {
    const raw = localStorage.getItem(_storageKey);
    const parsed = raw ? JSON.parse(raw) : {};
    _stateCache = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    for (const k of Object.keys(_stateCache)) {
      if (k.startsWith(MINTED_ID_PREFIX)) delete _stateCache[k];
    }
  } catch {
    _stateCache = {};
  }
  return _stateCache;
}
function _saveState(state) {
  _stateCache = state;
  try {
    localStorage.setItem(_storageKey, JSON.stringify(state));
  } catch (err) {
    console.warn("[ManagedWindow] Failed to save state:", err);
  }
}
function _getWindowState(id) {
  const state = _loadState();
  return state[id] || null;
}
function _setWindowState(id, windowState) {
  const state = _loadState();
  let latest = 0;
  for (const k of Object.keys(state)) latest = Math.max(latest, Number(state[k]?.u) || 0);
  for (const k of Object.keys(state)) {
    if (!(Number(state[k]?.u) > 0) && state[k] && typeof state[k] === "object") {
      state[k] = { ...state[k], u: ++latest };
    }
  }
  state[id] = { ...windowState, u: latest + 1 };
  const ids = Object.keys(state);
  if (ids.length > _maxSavedWindows) {
    ids.sort((a, b) => (Number(state[a]?.u) || 0) - (Number(state[b]?.u) || 0));
    for (const k of ids.slice(0, ids.length - _maxSavedWindows)) delete state[k];
  }
  _saveState(state);
}
function _focusFirstIn(root) {
  if (!root) return false;
  const sel = [
    "a[href]",
    "button:not([disabled])",
    'input:not([disabled]):not([type="hidden"])',
    "select:not([disabled])",
    "textarea:not([disabled])",
    '[contenteditable="true"]',
    '[tabindex]:not([tabindex="-1"])'
  ].join(",");
  for (const el2 of root.querySelectorAll(sel)) {
    if (el2.hidden || el2.closest("[hidden]")) continue;
    try {
      el2.focus({ preventScroll: true });
    } catch {
      continue;
    }
    if (el2.ownerDocument.activeElement === el2) return true;
  }
  return false;
}
function _escAnswerer() {
  const visible = Array.from(_activeWindows.values()).filter((w) => w.isVisible && !w.isMinimized && w.element).sort((a, b) => b.zIndex - a.zIndex);
  if (visible[0]?.modal) return visible[0];
  const active = document.activeElement;
  const holder = active ? visible.find((w) => w.element.contains(active)) : null;
  return holder || visible.find((w) => w.modal) || null;
}
var ManagedWindow = class {
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
   * @param {boolean} [options.persistGeometry=true] - Save and restore this
   *   window's position and size under its id. Pass false for a window whose
   *   id is minted per opening, so it never writes an entry.
   * @param {boolean|'window'} [options.focusOnOpen=true] - When the window
   *   opens, move focus to the first focusable element of its content (the
   *   window itself when it has none; always the window itself with
   *   `'window'`), and on close give focus back to the element that had it
   *   before, if that element is still in the document and focus is still in
   *   this window or nowhere.
   */
  constructor(options) {
    this.id = options.id;
    this.title = options.title || "Window";
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
    this.backdropBlur = options.backdropBlur;
    this.backdropOpacity = options.backdropOpacity;
    this.canDrag = options.canDrag ?? !this.modal;
    this.onClose = options.onClose;
    this.beforeClose = options.beforeClose || null;
    this.onMinimize = options.onMinimize;
    this.container = options.container || null;
    this.snap = (options.snap ?? false) && this.canDrag && this.canResize;
    this.snapController = options.snapController || null;
    this.dragHost = options.dragHost || null;
    this.dragBounds = options.dragBounds || null;
    this.onMaximize = options.onMaximize || null;
    this.maximizeIcon = options.maximizeIcon || null;
    this.maximizeTitle = options.maximizeTitle || "Maximize";
    this._snapZone = null;
    this._snapProbe = null;
    this._escapeOrigin = null;
    this._preSnapState = null;
    this._snapPreviewEl = null;
    this._minimizeTimer = null;
    this._restoreTimer = null;
    this.titlebarButtons = Array.isArray(options.titlebarButtons) ? options.titlebarButtons : [];
    this.persistGeometry = options.persistGeometry ?? true;
    this.focusOnOpen = options.focusOnOpen ?? true;
    this._returnFocusTo = null;
    this._closed = false;
    this.element = null;
    this.backdropElement = null;
    this.contentContainer = null;
    this.isVisible = false;
    this.isMinimized = false;
    this.isMaximized = false;
    this.zIndex = BASE_Z_INDEX;
    this.x = 0;
    this.y = 0;
    const initial = this._bounds();
    this.width = Math.min(this.defaultWidth, initial.width);
    this.height = Math.min(this.defaultHeight, initial.height);
    this._preMaximizeState = null;
    this._dragState = null;
    this._resizeState = null;
    this._boundOnPointerMove = this._onPointerMove.bind(this);
    this._boundOnPointerUp = this._onPointerUp.bind(this);
    this._boundOnKeyDown = this._onKeyDown.bind(this);
    _activeWindows.set(this.id, this);
  }
  /**
   * Show the window.
   */
  show() {
    if (this._closed) {
      console.warn(`[ManagedWindow] show() on closed window "${this.id}"; build a new ManagedWindow to reopen it`);
      return;
    }
    if (this.isVisible && !this.isMinimized) {
      if (this.element && this.element.style.display === "none") {
        this.element.style.display = "";
      }
      this.bringToFront();
      return;
    }
    let opened = false;
    if (!this.element) {
      this._build();
      this._restoreState();
    }
    if (this.isMinimized) {
      this._restore();
    } else {
      this.element?.classList.toggle(
        "twm-managed-window--maximized",
        this.isMaximized
      );
      this._applyPosition();
      const mount = this.container || document.body;
      this.element.classList.toggle("twm-managed-window--contained", !!this.container);
      mount.appendChild(this.element);
      if (this.modal && this.backdropElement) {
        this.backdropElement.classList.toggle(
          "twm-managed-window__backdrop--contained",
          !!this.container
        );
        mount.appendChild(this.backdropElement);
      }
      this._installContainerResizeObserver();
      this.isVisible = true;
      opened = true;
    }
    this.bringToFront();
    document.addEventListener("keydown", this._boundOnKeyDown);
    if (opened && this.focusOnOpen) this._moveFocusIn();
  }
  /** BUG-0053. Focus into the content on open, remembering where it was. */
  _moveFocusIn() {
    const active = document.activeElement;
    this._returnFocusTo = active && active !== document.body && !this.element.contains(active) ? active : null;
    if (this.focusOnOpen !== "window" && _focusFirstIn(this.contentContainer)) return;
    try {
      this.element.focus({ preventScroll: true });
    } catch {
    }
  }
  /** BUG-0053. Give focus back on close — only when it is still in this
   *  window (or nowhere): a window closed while the user works elsewhere
   *  must not pull focus away from where they are. */
  _returnFocus() {
    const back = this._returnFocusTo;
    this._returnFocusTo = null;
    if (!back || !back.isConnected) return;
    const active = document.activeElement;
    const held = !active || active === document.body || this.element && this.element.contains(active);
    if (!held) return;
    try {
      back.focus({ preventScroll: true });
    } catch {
    }
  }
  /**
   * Hide/close the window.
   * @param {{ force?: boolean }} [options] - Pass force:true to bypass the beforeClose guard.
   */
  close({ force = false } = {}) {
    if (!this.isVisible) return;
    if (!force && this.beforeClose) {
      const result = this.beforeClose();
      if (result && typeof result.then === "function") {
        result.then((allowed) => {
          if (allowed !== false) this._doClose();
        });
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
    if (this.onClose) {
      this.onClose();
    }
    if (this.focusOnOpen) this._returnFocus();
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
    if (this.backdropElement && this.backdropElement.parentNode) {
      this.backdropElement.parentNode.removeChild(this.backdropElement);
    }
    this.isVisible = false;
    this.isMinimized = false;
    this._cancelMinimizeAnimation();
    this._cancelRestoreAnimation();
    this._clearTargetProperties();
    document.removeEventListener("keydown", this._boundOnKeyDown);
    this._teardownContainerResizeObserver();
    window.dispatchEvent(new CustomEvent("managed-window-closed", {
      detail: { id: this.id, container: this.container }
    }));
    this._release();
  }
  /** BUG-0053. A closed window leaves the registry and lets go of what it
   *  held: its content, its DOM and every consumer callback (an `onClose`
   *  typically captures its owner). Until now the registry kept all of it
   *  alive until the same id opened again, and `get(id)` answered with the
   *  dead window. */
  _release() {
    if (_activeWindows.get(this.id) === this) _activeWindows.delete(this.id);
    this._closed = true;
    if (!this._dragState && !this._resizeState) {
      document.removeEventListener("pointermove", this._boundOnPointerMove);
      document.removeEventListener("pointerup", this._boundOnPointerUp);
      document.removeEventListener("pointercancel", this._boundOnPointerUp);
    }
    this.content = null;
    this.element = null;
    this.contentContainer = null;
    this.backdropElement = null;
    this.onClose = null;
    this.beforeClose = null;
    this.onMinimize = null;
    this.onMaximize = null;
    this.snapController = null;
    this.dragHost = null;
    this.dragBounds = null;
    this.titlebarButtons = [];
  }
  /** True once the window has closed. A closed window cannot be shown
   *  again; `ManagedWindow.get(id)` no longer returns it. */
  get isClosed() {
    return this._closed;
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
      this.backdropElement.style.display = "none";
    }
    window.dispatchEvent(new CustomEvent("managed-window-minimized", {
      detail: {
        id: this.id,
        title: this.title,
        icon: this.icon,
        container: this.container
      }
    }));
    if (!this.element) return;
    this._cancelRestoreAnimation();
    if (!getSetting("window.animateMinimize", true)) {
      this.element.style.display = "none";
      return;
    }
    this._setMinimizeTargetProperties();
    this.element.classList.add("twm-managed-window--minimizing");
    this._minimizeTimer = setTimeout(() => {
      this._minimizeTimer = null;
      if (this.element) {
        this.element.style.display = "none";
        this.element.classList.remove("twm-managed-window--minimizing");
        this._clearTargetProperties();
      }
    }, 200);
  }
  /** C27. Abandon a minimise animation that has not landed yet.
   *
   *  The timer is dropped AND the class is removed, because the class is half
   *  the damage: `--minimizing` is `opacity: 0` plus a transform that parks
   *  the window over the taskbar plus `pointer-events: none`, so a window
   *  that keeps it is invisible and unclickable for the rest of the 200ms
   *  even before the timer hides it outright. */
  _cancelMinimizeAnimation() {
    if (this._minimizeTimer !== null) {
      clearTimeout(this._minimizeTimer);
      this._minimizeTimer = null;
    }
    this.element?.classList.remove("twm-managed-window--minimizing");
  }
  /** C27. Abandon a restore animation that has not landed yet. */
  _cancelRestoreAnimation() {
    if (this._restoreTimer !== null) {
      clearTimeout(this._restoreTimer);
      this._restoreTimer = null;
    }
    this.element?.classList.remove("twm-managed-window--restoring");
  }
  /**
   * Restore from minimized state with animation.
   *
   * ══ C27. THE WINDOW THAT COULD NOT BE BROUGHT BACK ══════════════════
   *
   * `minimize` hides the element inside a `setTimeout(..., 200)` so the
   * shrink-toward-the-taskbar animation has time to play, and this method
   * cleared the `display` IMMEDIATELY. Minimise a window and restore it from
   * the taskbar inside those 200ms — which is not a stress test, it is what
   * "I clicked the wrong button" looks like — and the sequence ran:
   *
   *     minimize()   isMinimized = true,  timer armed for +200ms
   *     _restore()   display = '', isMinimized = FALSE, taskbar button gone
   *     +200ms       the timer fires and writes `display: none`
   *
   * leaving a window that is off screen with `isMinimized === false`. Every
   * route back is closed at once: `static restore` and `show` both funnel
   * through the `isMinimized` guard above and return without doing anything,
   * and a taskbar built from `ManagedWindow.all().filter(isMinimized)` —
   * which is how `syncTaskbars` builds it — has no button for it either. The
   * window is live, holding its content and its staged edits, and there is no
   * gesture in the product that can reach it. Reported twice.
   *
   * The `--minimizing` CLASS is the same defect one layer up and it bites
   * even before the timer does: it is `opacity: 0` with a transform parking
   * the window over the taskbar and `pointer-events: none`, and it was left
   * on for the remainder of the animation, so the restored window was
   * invisible and unclickable for up to 200ms before disappearing outright.
   *
   * Both are cancelled here rather than worked around in a consumer. A
   * consumer cannot see either one: nothing throws, no state is inconsistent
   * at any moment a caller can observe, and the corruption is written by a
   * timer with no name.
   */
  _restore() {
    if (!this.isMinimized) return;
    const taskbarRect = this._getTaskbarItemRect();
    this._cancelMinimizeAnimation();
    if (this.element) {
      this.element.style.display = "";
      const animate = getSetting("window.animateMinimize", true);
      if (animate) {
        this._cancelRestoreAnimation();
        this._setRestoreTargetProperties(taskbarRect);
        this.element.classList.add("twm-managed-window--restoring");
        this._restoreTimer = setTimeout(() => {
          this._restoreTimer = null;
          if (this.element) {
            this.element.classList.remove("twm-managed-window--restoring");
            this._clearTargetProperties();
          }
        }, 250);
      } else {
        this._clearTargetProperties();
      }
    }
    if (this.modal && this.backdropElement) {
      this.backdropElement.style.display = "";
    }
    this.isMinimized = false;
    this.bringToFront();
    window.dispatchEvent(new CustomEvent("managed-window-restored", {
      detail: { id: this.id, container: this.container }
    }));
  }
  /**
   * Toggle maximize state.
   */
  /**
   * @param {{claimable?: boolean}} [opts] `claimable: false` performs the
   *   GEOMETRIC maximise even when a consumer has claimed the gesture. NOTHING
   *   INSIDE THE LIBRARY PASSES IT — this docstring used to say the topbar's
   *   double-click did, and the binding at `:890` has never passed anything
   *   (C26 settled the other way; see the note there). It has had two callers
   *   outside it and it now has none: the window manager's aero-snap top edge
   *   used it for R13's maximise-onto-the-layer, and Tables' window menu drew
   *   a "Maximize" beside "Back to tile" and got its rectangle from here. R14
   *   collapsed both into the dock — maximise means back to tile, everywhere
   *   — so the escape hatch is now a LIBRARY API with no caller in this repo
   *   rather than a shared secret between two.
   *
   *   IT IS KEPT, and deliberately. A window that came out of a tile has a
   *   tile to go back to; a window that never did has only the rectangle, and
   *   `openModal`'s dialogs are exactly that case (`modal.js`, `maximizable`)
   *   — they reach the same rectangle through the ordinary claimless path
   *   because they set no `onMaximize` at all. Removing this would leave a
   *   consumer that HAS claimed the gesture with no way to ask for the other
   *   verb, which is the situation the flag was added to fix.
   *
   *   A doc that names a caller that does not exist is worse than no doc — it
   *   is the reason a reader concludes the double-click is already handled.
   */
  toggleMaximize({ claimable = true } = {}) {
    if (!this.canMaximize) return;
    if (claimable && this.onMaximize) {
      let handled = false;
      try {
        handled = this.onMaximize(this) ?? false;
      } catch (err) {
        console.error("[managed-window] onMaximize threw", err);
      }
      if (handled) return;
    }
    if (this.isMaximized) {
      if (this._preMaximizeState) {
        this.x = this._preMaximizeState.x;
        this.y = this._preMaximizeState.y;
        this.width = this._preMaximizeState.width;
        this.height = this._preMaximizeState.height;
        this._preMaximizeState = null;
      }
      this.isMaximized = false;
    } else {
      this._preMaximizeState = { x: this.x, y: this.y, width: this.width, height: this.height };
      const bounds = this._bounds();
      this.x = bounds.minX;
      this.y = bounds.minY;
      this.width = bounds.width;
      this.height = bounds.height;
      this.isMaximized = true;
    }
    this.element?.classList.toggle("twm-managed-window--maximized", this.isMaximized);
    this._applyPosition();
    this._saveCurrentState();
    window.dispatchEvent(new CustomEvent("managed-window-maximized", {
      detail: { id: this.id, maximized: this.isMaximized, container: this.container }
    }));
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
    this.element.style.setProperty("--mw-target-x", `${dx}px`);
    this.element.style.setProperty("--mw-target-y", `${dy}px`);
    this.element.style.setProperty("--mw-target-scale", scale);
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
    this.element.style.setProperty("--mw-target-x", `${dx}px`);
    this.element.style.setProperty("--mw-target-y", `${dy}px`);
    this.element.style.setProperty("--mw-target-scale", scale);
  }
  /**
   * Clear animation CSS custom properties.
   */
  _clearTargetProperties() {
    if (!this.element) return;
    this.element.style.removeProperty("--mw-target-x");
    this.element.style.removeProperty("--mw-target-y");
    this.element.style.removeProperty("--mw-target-scale");
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
      const titleEl = this.element.querySelector(".twm-managed-window__title");
      if (titleEl) titleEl.textContent = title;
    }
  }
  // ========== Private Methods ==========
  _build() {
    if (this.modal) {
      this.backdropElement = document.createElement("div");
      this.backdropElement.className = "twm-managed-window__backdrop";
      if (this.backdropBlur !== void 0 && this.backdropBlur !== null) {
        this.backdropElement.style.backdropFilter = this.backdropBlur > 0 ? `blur(${this.backdropBlur}px)` : "none";
      }
      if (this.backdropOpacity !== void 0 && this.backdropOpacity !== null) {
        this.backdropElement.style.background = `rgba(0, 0, 0, ${this.backdropOpacity})`;
      }
    }
    this.element = document.createElement("div");
    this.element.className = "twm-managed-window";
    if (!this.canDrag) {
      this.element.classList.add("twm-managed-window--no-drag");
    }
    if (this.modal) {
      this.element.classList.add("twm-managed-window--modal");
    }
    this.element.setAttribute("data-window-id", this.id);
    this.element.tabIndex = -1;
    const topbar = document.createElement("div");
    topbar.className = "twm-managed-window__topbar";
    const icon = document.createElement("span");
    icon.className = "twm-managed-window__icon material-symbols-outlined";
    icon.textContent = this.icon;
    const title = document.createElement("div");
    title.className = "twm-managed-window__title";
    title.textContent = this.title;
    const buttons = document.createElement("div");
    buttons.className = "twm-managed-window__buttons";
    for (const spec of this.titlebarButtons) {
      const btn = document.createElement("button");
      btn.className = "twm-managed-window__btn twm-managed-window__btn--custom";
      btn.type = "button";
      btn.title = spec.title || "";
      if (spec.icon) {
        const glyph = document.createElement("span");
        glyph.className = "material-symbols-outlined";
        glyph.textContent = spec.icon;
        btn.appendChild(glyph);
      } else {
        btn.textContent = spec.label || "";
      }
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        spec.onClick?.(this, e);
      });
      buttons.appendChild(btn);
    }
    if (this.canMinimize) {
      const minBtn = document.createElement("button");
      minBtn.className = "twm-managed-window__btn twm-managed-window__btn--minimize managed-window__btn--minimize";
      minBtn.type = "button";
      minBtn.innerHTML = '<svg width="10" height="10" viewBox="0 0 10 10"><path d="M1 5h8" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>';
      minBtn.title = "Minimize";
      minBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.minimize();
      });
      buttons.appendChild(minBtn);
    }
    if (this.canMaximize) {
      const maxBtn = document.createElement("button");
      maxBtn.className = "twm-managed-window__btn twm-managed-window__btn--maximize managed-window__btn--maximize";
      maxBtn.type = "button";
      if (this.maximizeIcon) {
        const glyph = document.createElement("span");
        glyph.className = "material-symbols-outlined";
        glyph.textContent = this.maximizeIcon;
        maxBtn.appendChild(glyph);
      } else {
        maxBtn.innerHTML = '<svg width="10" height="10" viewBox="0 0 10 10"><rect x="1" y="1" width="8" height="8" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>';
      }
      maxBtn.title = this.maximizeTitle;
      maxBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.toggleMaximize();
      });
      buttons.appendChild(maxBtn);
    }
    const closeBtn = document.createElement("button");
    closeBtn.className = "twm-managed-window__btn twm-managed-window__btn--close";
    closeBtn.type = "button";
    closeBtn.innerHTML = '<svg width="10" height="10" viewBox="0 0 10 10"><path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>';
    closeBtn.title = "Close";
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.close();
    });
    buttons.appendChild(closeBtn);
    topbar.appendChild(icon);
    topbar.appendChild(title);
    topbar.appendChild(buttons);
    this.contentContainer = document.createElement("div");
    this.contentContainer.className = "twm-managed-window__content";
    if (this.content instanceof HTMLElement) {
      this.contentContainer.appendChild(this.content);
    } else if (typeof this.content === "function") {
      const rendered = this.content();
      if (rendered instanceof HTMLElement) {
        this.contentContainer.appendChild(rendered);
      }
    }
    this.element.appendChild(topbar);
    this.element.appendChild(this.contentContainer);
    if (this.canResize) {
      this._addResizeHandles();
    }
    topbar.addEventListener("pointerdown", (e) => this._onTopbarPointerDown(e));
    if (this.canMaximize) {
      topbar.addEventListener("dblclick", () => this.toggleMaximize());
    }
    this.element.addEventListener("pointerdown", () => {
      this.bringToFront();
      if (this.element && !this.element.contains(document.activeElement)) {
        try {
          this.element.focus({ preventScroll: true });
        } catch {
        }
      }
    });
  }
  _addResizeHandles() {
    const directions = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
    for (const dir of directions) {
      const handle = document.createElement("div");
      handle.className = `twm-managed-window__resize twm-managed-window__resize--${dir} managed-window__resize--${dir}`;
      handle.addEventListener("pointerdown", (e) => this._onResizePointerDown(e, dir));
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
   *  (STORY-0119: TOP_BAR_HEIGHT here is `_topInset()`, which is
   *  TOP_BAR_HEIGHT on a page without a menu row and adds the row's height
   *  on a page with one.)
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
   *  Embedders' modals depend on that arithmetic; prove the
   *  equivalence in review by substitution rather than by testing.
   */
  _bounds() {
    if (this.dragBounds) {
      const host = typeof this.dragHost === "function" ? this.dragHost(this) : this.dragHost;
      if (this._escapeOrigin || host && host === this.container) {
        const b = this.dragBounds(this);
        if (b && b.width > 0 && b.height > 0) return b;
      }
    }
    if (this.container) {
      return {
        minX: 0,
        minY: 0,
        width: this.container.clientWidth,
        height: this.container.clientHeight
      };
    }
    const top = _topInset();
    return {
      minX: 0,
      minY: top,
      width: window.innerWidth,
      height: window.innerHeight - top - BOTTOM_BAR_HEIGHT
    };
  }
  _applyPosition() {
    if (!this.element) return;
    const bounds = this._bounds();
    const maxWidth = bounds.width;
    const maxHeight = bounds.height;
    this.width = Math.max(this.minWidth, Math.min(this.width, maxWidth));
    this.height = Math.max(this.minHeight, Math.min(this.height, maxHeight));
    const maxX = Math.max(bounds.minX, bounds.minX + maxWidth - this.width);
    const maxY = Math.max(bounds.minY, bounds.minY + maxHeight - this.height);
    this.x = Math.max(bounds.minX, Math.min(this.x, maxX));
    this.y = Math.max(bounds.minY, Math.min(this.y, maxY));
    this.element.style.left = `${this.x}px`;
    this.element.style.top = `${this.y}px`;
    this.element.style.width = `${this.width}px`;
    this.element.style.height = `${this.height}px`;
  }
  /** C12. Re-clamp on demand.
   *
   *  The ResizeObserver below covers a container that changes size on its
   *  own. A container that changes size because a SIBLING did — a splitter
   *  drag moves two panels at once — needs the caller to say so, and a
   *  private `_applyPosition` is not something a caller may reach for. */
  reclamp() {
    this._applyPosition();
  }
  /** C12. Move this window into a different container.
   *
   *  Re-parents the element and re-clamps against the new bounds, because a
   *  window carried into a narrower region would otherwise keep coordinates
   *  that put it outside and out of reach. The ResizeObserver follows the new
   *  container, or the old one would keep driving the clamp.
   */
  moveTo(container) {
    if (!container || container === this.container) return false;
    this.container = container;
    if (this.element) {
      container.appendChild(this.element);
      this.element.classList.toggle("twm-managed-window--contained", true);
      if (this.backdropElement) container.appendChild(this.backdropElement);
    }
    this._resizeObserver?.disconnect();
    this._resizeObserver = null;
    this._installContainerResizeObserver();
    this._preSnapState = null;
    this.element?.classList.remove("twm-managed-window--snapped");
    if (this.isMaximized) {
      const bounds = this._bounds();
      this.x = bounds.minX;
      this.y = bounds.minY;
      this.width = bounds.width;
      this.height = bounds.height;
    }
    this._applyPosition();
    window.dispatchEvent(new CustomEvent("managed-window-moved", {
      detail: { id: this.id, container }
    }));
    return true;
  }
  /** R1/R3. The container this drag started in, or null when the drag did
   *  not have to escape one (an uncontained window, or no `dragHost`).
   *
   *  Public because the decision that needs it is not this component's: a snap
   *  controller has to know which pane is HOME so that moving a window around
   *  inside the pane it already lives in arms nothing. That was the complaint
   *  about the old behaviour — in-pane, virtually any movement was a dock. */
  get dragOrigin() {
    return this._escapeOrigin;
  }
  /** R1. Take the window out of its container for the duration of a drag.
   *
   *  A contained window is clipped by its container (`.twm-leaf` is
   *  `overflow: hidden`), so without this it cannot be dragged one pixel past
   *  the pane it lives in — the gesture the tiling model is built on is not
   *  merely awkward, it is invisible. The window is re-parented into the
   *  wider `dragHost` and its coordinates are converted so the rectangle on
   *  screen does not move: same viewport pixels, different reference frame.
   *
   *  Deliberately NOT `moveTo` (C12), which is the same re-parent for a
   *  different purpose. `moveTo` re-CLAMPS into the new container without
   *  converting anything, which is right when a window is carried between
   *  regions by a menu and wrong here — the window would jump out from under
   *  the pointer at the first millimetre of every drag. It also drops the snap
   *  and announces `managed-window-moved`, and an escape is neither a move the
   *  user asked for nor one anybody should hear about: it is undone on
   *  release, either by `_endDragEscape` or by the drop taking the window.
   */
  _beginDragEscape() {
    if (this._escapeOrigin || !this.container || !this.dragHost) return false;
    const host = typeof this.dragHost === "function" ? this.dragHost(this) : this.dragHost;
    if (!host || host === this.container || !host.contains(this.container)) return false;
    const origin = this.container;
    this._escapeOrigin = origin;
    this._reparentPreservingPosition(host);
    return true;
  }
  /** R1. Put the window back into a container when the drag ends.
   *
   *  `taken` means the drop was claimed by the snap controller: the window is
   *  being docked into a tree and closed, so re-parenting it into a pane it is
   *  about to leave would be work done for a frame nobody sees.
   *
   *  Otherwise it goes back where the drag started — including when the drag
   *  ended over nothing (the rail, the gap between two panes, off the edge).
   *  A window that lives in a pane has to end every drag in SOME pane, and the
   *  one it came from is the only answer that never surprises anyone. The one
   *  case that cannot be honoured is an origin that stopped being in the
   *  document mid-drag — a repaint rebuilt the leaf wrap — and there the
   *  window stays on the host rather than being orphaned into a detached
   *  node; the WM's own re-home pass adopts it on the next render.
   */
  _endDragEscape({ taken = false } = {}) {
    const origin = this._escapeOrigin;
    this._escapeOrigin = null;
    this.element?.classList.remove("twm-managed-window--detached");
    if (!origin || taken) return false;
    if (!origin.isConnected) return false;
    this._reparentPreservingPosition(origin);
    return true;
  }
  /** Move the element into `next` and rewrite `x`/`y` so it occupies the same
   *  viewport rectangle it did a moment ago.
   *
   *  `x`/`y` are written against the containing block, which for an absolutely
   *  positioned child is the PADDING box — hence `clientLeft`/`clientTop`,
   *  which are the border widths `getBoundingClientRect` includes and the
   *  offset does not. `scrollLeft`/`scrollTop` are zero for every box either
   *  side of this today (panes and the WM root both clip rather than scroll)
   *  and are in the expression anyway: the day one of them scrolls, this is
   *  the line that would be silently half a screen out.
   *
   *  The container's ResizeObserver is deliberately NOT re-pointed. It exists
   *  to re-clamp (C4), it re-clamps against whichever container is current
   *  because `_applyPosition` reads `_bounds()` afresh, and an escape is
   *  transient by construction — undone on release, or ended by the window
   *  closing into a tree. `moveTo`, which is a permanent move, does re-point
   *  it, and that difference is the reason these are two methods.
   */
  _reparentPreservingPosition(next) {
    const prev = this.container;
    if (!next || next === prev) return false;
    if (this.element && prev) {
      const from = prev.getBoundingClientRect();
      const to = next.getBoundingClientRect();
      this.x += from.left + prev.clientLeft - prev.scrollLeft - (to.left + next.clientLeft - next.scrollLeft);
      this.y += from.top + prev.clientTop - prev.scrollTop - (to.top + next.clientTop - next.scrollTop);
    }
    this.container = next;
    if (this.element) {
      next.appendChild(this.element);
      this.element.classList.toggle("twm-managed-window--contained", !!next);
      if (this.backdropElement) next.appendChild(this.backdropElement);
    }
    this._applyPosition();
    return true;
  }
  /** R3. HALF TRANSPARENT THE MOMENT IT LEAVES THE TILE IT CAME FROM.
   *
   *  The signal that releasing now will dock the window somewhere, and the
   *  complement of the rule that keeps the origin pane silent: inside it, this
   *  is just a window being moved and it stays opaque. Only for a window with
   *  a snap controller — nothing else on the page can be docked, so nothing
   *  else has anything to promise.
   *
   *  A window that never had a pane (opened with Alt+N, floating over the
   *  whole root) has no "inside" to be in, so it reads as detached for the
   *  whole drag. That is not a special case being papered over: every pane
   *  under it genuinely is foreign, and every drop on one genuinely docks.
   */
  _syncDragTransparency(e) {
    if (!this.snapController || !this.element) return;
    const origin = this._escapeOrigin;
    let outside = true;
    if (origin && origin.isConnected) {
      const r = origin.getBoundingClientRect();
      outside = e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    }
    this.element.classList.toggle("twm-managed-window--detached", outside);
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
    const saved = this.modal || !this.persistGeometry ? null : _getWindowState(this.id);
    if (saved) {
      this.x = saved.x ?? this.x;
      this.y = saved.y ?? this.y;
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
      this.x = Math.max(0, (maxWidth - this.width) / 2);
      const top = _topInset();
      this.y = Math.max(top, top + (maxHeight - this.height) / 2);
    }
  }
  _saveCurrentState() {
    if (this.modal || !this.persistGeometry || this._closed) return;
    _setWindowState(this.id, {
      x: this._preMaximizeState?.x ?? this.x,
      y: this._preMaximizeState?.y ?? this.y,
      width: this._preMaximizeState?.width ?? this.width,
      height: this._preMaximizeState?.height ?? this.height,
      maximized: this.isMaximized
    });
  }
  // ========== Drag Handling ==========
  _onTopbarPointerDown(e) {
    if (e.target.closest(".twm-managed-window__buttons")) return;
    if (this.isMaximized) return;
    if (!this.canDrag) return;
    e.preventDefault();
    if (this.snap && this._preSnapState) {
      const grabRatio = this.width ? (e.clientX - this.x) / this.width : 0.5;
      this.unsnap();
      this.x = Math.round(e.clientX - this.width * grabRatio);
      this._applyPosition();
    }
    this._dragState = {
      startX: e.clientX,
      startY: e.clientY,
      startWinX: this.x,
      startWinY: this.y
    };
    document.addEventListener("pointermove", this._boundOnPointerMove);
    document.addEventListener("pointerup", this._boundOnPointerUp);
    document.addEventListener("pointercancel", this._boundOnPointerUp);
  }
  _onPointerMove(e) {
    if (this._dragState) {
      if (!this._escapeOrigin) {
        const fromX = this.x;
        const fromY = this.y;
        if (this._beginDragEscape()) {
          this._dragState.startWinX += this.x - fromX;
          this._dragState.startWinY += this.y - fromY;
        }
      }
      const dx = e.clientX - this._dragState.startX;
      const dy = e.clientY - this._dragState.startY;
      this.x = this._dragState.startWinX + dx;
      this.y = this._dragState.startWinY + dy;
      this._applyPosition();
      this._syncDragTransparency(e);
      if (this.snap) this._updateSnapZone(e);
    } else if (this._resizeState) {
      this._handleResize(e);
    }
  }
  _onPointerUp() {
    let taken = false;
    if (this._dragState && this.snap && this._snapZone) {
      if (this.snapController) {
        try {
          taken = this.snapController.commit?.(this._snapProbe, this) ?? false;
        } catch (err) {
          console.error("[managed-window] snap commit threw", err);
          taken = false;
        }
      } else {
        this._applySnap(this._snapZone);
      }
    }
    if (!taken) this.clearSnapPreview();
    this._snapZone = null;
    if (this._dragState) this._endDragEscape({ taken });
    if (this._dragState || this._resizeState) {
      this._saveCurrentState();
    }
    this._dragState = null;
    this._resizeState = null;
    document.removeEventListener("pointermove", this._boundOnPointerMove);
    document.removeEventListener("pointerup", this._boundOnPointerUp);
    document.removeEventListener("pointercancel", this._boundOnPointerUp);
  }
  // ========== C11. Aero Snap ==========
  /** The rectangle a zone would give this window, in the SAME coordinate
   *  space `_applyPosition` writes — container-relative when contained,
   *  viewport-relative otherwise. One source for the preview and the apply,
   *  so the preview cannot promise a rectangle the drop does not deliver. */
  _snapRect(zone) {
    const b = this._bounds();
    const half = Math.round(b.width / 2);
    switch (zone) {
      case "top":
        return { x: b.minX, y: b.minY, width: b.width, height: b.height };
      case "left":
        return { x: b.minX, y: b.minY, width: half, height: b.height };
      case "right":
        return {
          x: b.minX + b.width - half,
          y: b.minY,
          width: half,
          height: b.height
        };
      default:
        return null;
    }
  }
  /** Which zone the POINTER is in — not the window. Using the window's own
   *  edge would make a wide window snap the moment it is picked up, because
   *  it is already touching the edge it did not move towards. */
  _zoneFor(e) {
    const host = this.container || document.documentElement;
    const rect = this.container ? host.getBoundingClientRect() : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null;
    if (y <= SNAP_EDGE) return "top";
    if (x <= SNAP_EDGE) return "left";
    if (x >= rect.width - SNAP_EDGE) return "right";
    return null;
  }
  _updateSnapZone(e) {
    if (this.snapController) {
      this._updateControlledSnapZone(e);
      return;
    }
    const zone = this._zoneFor(e);
    if (zone === this._snapZone) return;
    this._snapZone = zone;
    if (!zone) {
      this.clearSnapPreview();
      return;
    }
    this.showSnapPreview(this._snapRect(zone));
  }
  /** C15. The controller's half of `_updateSnapZone`. The probe runs on every
   *  move because the rectangle can change while the KEY does not — a tile
   *  resized underneath the pointer, a menu re-previewing the same zone — but
   *  the DOM is only touched when something actually differs. */
  _updateControlledSnapZone(e) {
    let probe = null;
    try {
      probe = this.snapController.probe?.(e, this) ?? null;
    } catch (err) {
      console.warn("[managed-window] snap probe threw", err);
    }
    this._snapProbe = probe;
    this._snapZone = probe?.key ?? null;
    if (!probe?.rect) {
      this.clearSnapPreview();
      return;
    }
    this.showSnapPreview(probe.rect, { viewport: true });
  }
  /** Paint the drag affordance. `rect` is container-relative by default —
   *  the same space `_applyPosition` writes — and viewport-relative for a
   *  controller, whose rectangles come from hit-testing other people's DOM.
   *  Public because a controller that survives the pointer-up owns it. */
  showSnapPreview(rect, { viewport = false } = {}) {
    if (!rect) {
      this.clearSnapPreview();
      return;
    }
    const host = viewport ? document.body : this.container || document.body;
    if (!this._snapPreviewEl) {
      this._snapPreviewEl = document.createElement("div");
      this._snapPreviewEl.setAttribute("aria-hidden", "true");
    }
    this._snapPreviewEl.className = `twm-snap-preview${viewport ? " twm-snap-preview--viewport" : ""}`;
    const left = rect.left ?? rect.x;
    const top = rect.top ?? rect.y;
    Object.assign(this._snapPreviewEl.style, {
      left: `${left}px`,
      top: `${top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`
    });
    if (this._snapPreviewEl.parentNode !== host) host.appendChild(this._snapPreviewEl);
  }
  clearSnapPreview() {
    this._snapPreviewEl?.remove();
    this._snapProbe = null;
  }
  /** @deprecated retained so nothing inside this file has to change spelling
   *  in the same commit that adds the public one. */
  _clearSnapPreview() {
    this.clearSnapPreview();
  }
  /** Applied on release. The pre-snap geometry is remembered so dragging the
   *  window off an edge restores the size it had — a snap that eats the
   *  original size makes the gesture one-way and people stop using it. */
  _applySnap(zone) {
    const rect = this._snapRect(zone);
    if (!rect) return;
    if (!this._preSnapState) {
      this._preSnapState = {
        x: this._dragState.startWinX,
        y: this._dragState.startWinY,
        width: this.width,
        height: this.height
      };
    }
    this.x = rect.x;
    this.y = rect.y;
    this.width = rect.width;
    this.height = rect.height;
    this._applyPosition();
    this.element?.classList.add("twm-managed-window--snapped");
    window.dispatchEvent(new CustomEvent("managed-window-snapped", {
      detail: { id: this.id, zone, container: this.container }
    }));
  }
  /** Restore the geometry a snap replaced. Called when a snapped window is
   *  picked up again, which is the gesture that means "un-snap". */
  unsnap() {
    if (!this._preSnapState) return false;
    const { x, y, width, height } = this._preSnapState;
    this._preSnapState = null;
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this._applyPosition();
    this.element?.classList.remove("twm-managed-window--snapped");
    return true;
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
      startHeight: this.height
    };
    document.addEventListener("pointermove", this._boundOnPointerMove);
    document.addEventListener("pointerup", this._boundOnPointerUp);
  }
  _handleResize(e) {
    const state = this._resizeState;
    if (!state) return;
    const dx = e.clientX - state.startX;
    const dy = e.clientY - state.startY;
    const dir = state.direction;
    const maxWidth = window.innerWidth;
    const top = _topInset();
    const maxHeight = window.innerHeight - top - BOTTOM_BAR_HEIGHT;
    let newX = state.startWinX;
    let newY = state.startWinY;
    let newW = state.startWidth;
    let newH = state.startHeight;
    if (dir.includes("e")) {
      newW = Math.max(this.minWidth, Math.min(state.startWidth + dx, maxWidth - newX));
    }
    if (dir.includes("w")) {
      const maxDx = state.startWidth - this.minWidth;
      const actualDx = Math.min(dx, maxDx);
      newX = Math.max(0, state.startWinX + actualDx);
      newW = state.startWidth - (newX - state.startWinX);
    }
    if (dir.includes("s")) {
      newH = Math.max(this.minHeight, Math.min(state.startHeight + dy, maxHeight - (newY - top)));
    }
    if (dir.includes("n")) {
      const maxDy = state.startHeight - this.minHeight;
      const actualDy = Math.min(dy, maxDy);
      newY = Math.max(top, state.startWinY + actualDy);
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
    const topWindow = Array.from(_activeWindows.values()).filter((w) => w.isVisible && !w.isMinimized).sort((a, b) => b.zIndex - a.zIndex)[0];
    if (e.key === "Escape") {
      if (e.defaultPrevented || e.isComposing || _escAnswered.has(e)) return;
      if (_escAnswerer() === this) {
        _escAnswered.add(e);
        this.close();
      }
      return;
    }
    if (topWindow !== this) return;
    if (e.key === "Tab" && this.modal && this.element) {
      const focusables = _collectFocusable(this.element);
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
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
   * Choose where window geometry is saved and restored. Call once at boot,
   * before the first window opens; from then on windows read and write only
   * `storageKey`. The geometry already read from another key is dropped, so
   * a window shown afterwards restores what `storageKey` holds.
   *
   * @param {object} [opts]
   * @param {string} [opts.storageKey=DEFAULT_WINDOW_STORAGE_KEY]
   * @param {number} [opts.maxSavedWindows=DEFAULT_MAX_SAVED_WINDOWS] How many
   *   ids keep saved geometry; the least recently saved go first.
   */
  static configure({
    storageKey = DEFAULT_WINDOW_STORAGE_KEY,
    maxSavedWindows = DEFAULT_MAX_SAVED_WINDOWS
  } = {}) {
    _storageKey = storageKey;
    _maxSavedWindows = Math.max(1, Math.floor(maxSavedWindows) || DEFAULT_MAX_SAVED_WINDOWS);
    _stateCache = null;
  }
  /** @returns {string} The localStorage key window geometry uses. */
  static get storageKey() {
    return _storageKey;
  }
  /**
   * Get a window by ID.
   */
  static get(id) {
    return _activeWindows.get(id) || null;
  }
  /**
   * Every window this class currently holds, newest last.
   *
   * `get`/`restore` answer about a window whose id you already have, which is
   * enough for a consumer reacting to an EVENT — it carries the id. It is not
   * enough for one that has to repaint from scratch: a taskbar rebuilt with
   * its pane has missed every event that came before it existed, and the only
   * honest source for "which windows are minimised right now" is the registry
   * itself. Returned as an array rather than the live map, so a consumer
   * iterating it cannot mutate what it is iterating.
   */
  static all() {
    return [..._activeWindows.values()];
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
};

// src/ui/components/toggle_field.js
var ToggleField = class {
  /**
   * @param {object}    o
   * @param {boolean}  [o.checked=false]
   * @param {string?}  [o.label]      text beside the switch, and its accessible name
   * @param {string?}  [o.ariaLabel]  accessible name when there is no visible label
   * @param {string?}  [o.onText]     state text shown while on
   * @param {string?}  [o.offText]    state text shown while off
   * @param {boolean}  [o.disabled=false]
   * @param {boolean}  [o.compact=false]  a smaller track, for dense rows
   * @param {string?}  [o.name]       the input's name, for a surrounding form
   * @param {string?}  [o.id]         the input's id
   * @param {Function?}[o.onChange]   `(checked: boolean)` after a user toggle
   */
  constructor({
    checked = false,
    label = null,
    ariaLabel = null,
    onText = null,
    offText = null,
    disabled = false,
    compact = false,
    name = null,
    id = null,
    onChange = null
  } = {}) {
    this._initial = !!checked;
    this._label = label == null ? null : String(label);
    this._ariaLabel = ariaLabel == null ? null : String(ariaLabel);
    this._onText = onText == null ? null : String(onText);
    this._offText = offText == null ? null : String(offText);
    this._disabled = !!disabled;
    this._compact = !!compact;
    this._name = name == null ? null : String(name);
    this._id = id == null ? null : String(id);
    this._onChange = typeof onChange === "function" ? onChange : null;
    this.root = null;
    this.input = null;
    this._stateEl = null;
    this._disposers = [];
  }
  /** Build the switch once and hand back its root; later calls return it. */
  render() {
    if (this.root) return this.root;
    const root = document.createElement("label");
    root.className = "twm-toggle";
    if (this._compact) root.classList.add("twm-toggle--compact");
    const control = document.createElement("span");
    control.className = "twm-toggle__control";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = "twm-toggle__input";
    input.setAttribute("role", "switch");
    if (this._name) input.name = this._name;
    if (this._id) input.id = this._id;
    if (this._ariaLabel && !this._label) input.setAttribute("aria-label", this._ariaLabel);
    input.checked = this._initial;
    const track = document.createElement("span");
    track.className = "twm-toggle__track";
    track.setAttribute("aria-hidden", "true");
    const knob = document.createElement("span");
    knob.className = "twm-toggle__knob";
    track.appendChild(knob);
    control.append(input, track);
    root.appendChild(control);
    if (this._onText != null || this._offText != null) {
      this._stateEl = document.createElement("span");
      this._stateEl.className = "twm-toggle__state";
      this._stateEl.setAttribute("aria-hidden", "true");
      root.appendChild(this._stateEl);
    }
    if (this._label != null) {
      const labelEl = document.createElement("span");
      labelEl.className = "twm-toggle__label";
      labelEl.textContent = this._label;
      root.appendChild(labelEl);
    }
    this.root = root;
    this.input = input;
    this.setDisabled(this._disabled);
    this._sync();
    const onKeyDown = (e) => {
      if (e.key !== " " && e.key !== "Enter") return;
      e.preventDefault();
      if (e.repeat) return;
      input.click();
    };
    const onKeyUp = (e) => {
      if (e.key === " ") e.preventDefault();
    };
    const onChange = () => {
      this._sync();
      this._onChange?.(input.checked);
    };
    input.addEventListener("keydown", onKeyDown);
    input.addEventListener("keyup", onKeyUp);
    input.addEventListener("change", onChange);
    this._disposers.push(
      () => input.removeEventListener("keydown", onKeyDown),
      () => input.removeEventListener("keyup", onKeyUp),
      () => input.removeEventListener("change", onChange)
    );
    return root;
  }
  /** Whether the switch is on. */
  get() {
    return this.input ? this.input.checked : this._initial;
  }
  /** Turn it on or off. Does NOT call `onChange`. */
  set(checked) {
    if (!this.input) {
      this._initial = !!checked;
      return;
    }
    this.input.checked = !!checked;
    this._sync();
  }
  /** A disabled switch ignores clicks and keys alike. */
  setDisabled(disabled) {
    this._disabled = !!disabled;
    if (!this.input) return;
    this.input.disabled = this._disabled;
    this.root.classList.toggle("twm-toggle--disabled", this._disabled);
  }
  dispose() {
    for (const d of this._disposers) {
      try {
        d();
      } catch {
      }
    }
    this._disposers = [];
    this.root?.remove();
    this.root = null;
    this.input = null;
    this._stateEl = null;
  }
  _sync() {
    const on = this.input.checked;
    this.input.setAttribute("aria-checked", on ? "true" : "false");
    if (this._stateEl) this._stateEl.textContent = (on ? this._onText : this._offText) ?? "";
  }
};

// src/ui/components/color_field.js
var HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
var RGB_RE = /^rgba?\(\s*([^)]*)\)$/i;
function isHexColor(value) {
  return typeof value === "string" && HEX_RE.test(value.trim());
}
function normalizeHex(value) {
  if (typeof value !== "string") return null;
  const s = value.trim();
  if (HEX_RE.test(s)) {
    const h = s.slice(1).toLowerCase();
    return h.length === 3 ? `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}` : `#${h}`;
  }
  const m = RGB_RE.exec(s);
  if (!m) return null;
  const parts = m[1].split(/\s*[,/]\s*|\s+/).filter(Boolean);
  if (parts.length < 3 || parts.length > 4) return null;
  const channels = [];
  for (const p of parts.slice(0, 3)) {
    const pct = p.endsWith("%");
    const n = Number(pct ? p.slice(0, -1) : p);
    if (!Number.isFinite(n)) return null;
    const v = pct ? n / 100 * 255 : n;
    if (v < 0 || v > 255) return null;
    channels.push(Math.round(v));
  }
  return `#${channels.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}
function displayText(value) {
  if (value == null) return "";
  return normalizeHex(String(value)) ?? String(value);
}
var ColorField = class {
  /**
   * @param {Object}   [o]
   * @param {string}   [o.value]     initial colour (hex or rgb()); '' for none
   * @param {string[]} [o.presets]   preset colours drawn as buttons; ones that
   *                                 are not colours are left out
   * @param {string}   [o.name]      `name` of the hex box, for a host form
   * @param {string}   [o.label]     accessible name of the swatch and the box
   * @param {Function} [o.onChange]  `(value, { commit })`, value as `getValue()`
   */
  constructor({ value = "", presets = [], name = null, label = null, onChange = null } = {}) {
    this.initial = displayText(value);
    this.presets = (Array.isArray(presets) ? presets : []).map(normalizeHex).filter(Boolean);
    this.name = name;
    this.label = label;
    this.onChange = typeof onChange === "function" ? onChange : null;
    this.root = null;
    this.swatch = null;
    this.hex = null;
    this._disposers = [];
  }
  render() {
    if (this.root) return this.root;
    const root = document.createElement("div");
    root.className = "twm-color-field";
    const swatch = document.createElement("input");
    swatch.type = "color";
    swatch.className = "twm-color-field__swatch";
    swatch.value = normalizeHex(this.initial) ?? "#000000";
    if (this.label) swatch.title = this.label;
    const hex = document.createElement("input");
    hex.type = "text";
    hex.className = "twm-color-field__hex";
    hex.value = this.initial;
    hex.placeholder = "#rrggbb";
    hex.spellcheck = false;
    hex.autocomplete = "off";
    hex.maxLength = 7;
    if (this.name) hex.name = this.name;
    if (this.label) hex.setAttribute("aria-label", this.label);
    root.append(swatch, hex);
    this.root = root;
    this.swatch = swatch;
    this.hex = hex;
    if (this.presets.length) {
      const strip = document.createElement("div");
      strip.className = "twm-color-field__presets";
      for (const color of this.presets) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "twm-color-field__preset";
        btn.style.backgroundColor = color;
        btn.title = color;
        btn.setAttribute("aria-label", color);
        this.#listen(btn, "click", () => this.#writeBox(color, true));
        strip.appendChild(btn);
      }
      root.appendChild(strip);
    }
    this.#listen(swatch, "input", () => this.#writeBox(swatch.value, false));
    this.#listen(swatch, "change", () => this.#writeBox(swatch.value, true));
    this.#listen(hex, "input", () => this.#sync(false));
    this.#listen(hex, "change", () => {
      const v = this.getValue();
      if (v) hex.value = v;
      this.#sync(true);
    });
    this.#sync(null);
    return root;
  }
  /** `#rrggbb`, `''` when empty, or `null` when the box holds no hex colour. */
  getValue() {
    const text = this.getText().trim();
    if (text === "") return "";
    return isHexColor(text) ? normalizeHex(text) : null;
  }
  /** The box as it stands. */
  getText() {
    return this.hex ? this.hex.value : this.initial;
  }
  isValid() {
    return this.getValue() !== null;
  }
  /** Write a colour (hex or rgb()) without firing `onChange`. */
  setValue(value) {
    const text = displayText(value);
    if (!this.hex) {
      this.initial = text;
      return;
    }
    this.hex.value = text;
    this.#sync(null);
  }
  focus() {
    this.hex?.focus();
  }
  dispose() {
    for (const d of this._disposers) {
      try {
        d();
      } catch {
      }
    }
    this._disposers = [];
    this.root = null;
    this.swatch = null;
    this.hex = null;
  }
  #listen(el2, type, fn) {
    el2.addEventListener(type, fn);
    this._disposers.push(() => el2.removeEventListener(type, fn));
  }
  /** Put `text` in the box and fire the box's own events, as typing would. */
  #writeBox(text, commit) {
    this.hex.value = text;
    this.hex.dispatchEvent(new Event("input", { bubbles: true }));
    if (commit) this.hex.dispatchEvent(new Event("change", { bubbles: true }));
  }
  /** Swatch and invalid mark follow the box; `commit === null` is silent. */
  #sync(commit) {
    const v = this.getValue();
    if (v) this.swatch.value = v;
    this.root.classList.toggle("twm-color-field--invalid", v === null);
    if (commit !== null) this.onChange?.(v, { commit });
  }
};

// src/ui/components/choice_controls.js
var shownValue = (v) => v === void 0 ? "" : typeof v === "string" ? v : JSON.stringify(v);
function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== void 0 && text !== null) n.textContent = String(text);
  return n;
}
var isGroup = (o) => o !== null && typeof o === "object" && Array.isArray(o.options) && "group" in o;
function choiceOption(o) {
  if (o === null || typeof o !== "object") {
    return { value: o, label: shownValue(o), description: null, disabled: false, reason: null };
  }
  return {
    value: o.value,
    label: o.label != null ? String(o.label) : shownValue(o.value),
    description: o.description != null ? String(o.description) : null,
    disabled: Boolean(o.disabled),
    reason: o.reason != null && o.reason !== "" ? String(o.reason) : null
  };
}
function flatChoices(options) {
  const out = [];
  for (const o of options || []) {
    if (isGroup(o)) for (const inner of o.options) out.push(choiceOption(inner));
    else out.push(choiceOption(o));
  }
  return out;
}
function groupHeads(options) {
  const heads = /* @__PURE__ */ new Map();
  let at = 0;
  for (const o of options || []) {
    if (!isGroup(o)) {
      at += 1;
      continue;
    }
    if (o.options.length) heads.set(at, String(o.group ?? ""));
    at += o.options.length;
  }
  return heads;
}
var groupHeading = (text) => el("div", "twm-choice__group", text);
function sameChoice(v, value, loose = false) {
  if (v === value) return true;
  if (!loose || v === void 0 || value === void 0 || v === null || value === null) return false;
  return String(v) === String(value);
}
function choiceIndex(list, v, loose = false, from = 0) {
  for (let i = from; i < list.length; i += 1) if (list[i].value === v) return i;
  if (!loose) return -1;
  for (let i = from; i < list.length; i += 1) if (sameChoice(list[i].value, v, true)) return i;
  return -1;
}
function findChoice(list, v, loose = false) {
  const i = choiceIndex(list, v, loose);
  return i >= 0 ? list[i] : void 0;
}
var optionText = (o) => o.disabled && o.reason ? `${o.label} \u2014 ${o.reason}` : o.label;
function selectBox(options, value, {
  empty = null,
  label = "",
  notFound = (v) => `${v} (not found)`,
  keepMissing = true,
  valueAttr = "index",
  loose = false,
  className = "twm-flow-input twm-flow-input--select"
} = {}) {
  const box = el("select", className);
  if (label) box.setAttribute("aria-label", label);
  let entries = [];
  const add = (parent, o) => {
    const attr = valueAttr === "index" ? String(entries.length) : o.value === void 0 ? "" : String(o.value);
    const opt = el("option", "", optionText(o));
    opt.value = attr;
    if (o.disabled) {
      opt.disabled = true;
      if (o.reason) opt.title = o.reason;
    }
    parent.appendChild(opt);
    entries.push(o);
  };
  const firstEnabled = () => {
    const i = entries.findIndex((e) => !e.disabled);
    return i >= 0 ? i : 0;
  };
  const select = (v) => {
    const start = empty !== null ? 1 : 0;
    const at = choiceIndex(entries, v, loose, start);
    if (at < 0 || entries[at].disabled || entries[at].stray) return false;
    box.selectedIndex = at;
    return true;
  };
  const place = (v) => {
    if (select(v)) return;
    if (keepMissing && v !== void 0 && v !== null && v !== "") {
      add(box, {
        value: v,
        label: notFound(shownValue(v)),
        description: null,
        disabled: false,
        reason: null,
        stray: true
      });
      box.selectedIndex = entries.length - 1;
      return;
    }
    box.selectedIndex = empty !== null ? 0 : firstEnabled();
  };
  const fill = (opts, v) => {
    box.replaceChildren();
    entries = [];
    if (empty !== null) add(box, {
      value: void 0,
      label: String(empty),
      description: null,
      disabled: false,
      reason: null
    });
    for (const o of opts || []) {
      if (isGroup(o)) {
        const g = el("optgroup");
        g.label = String(o.group ?? "");
        for (const inner of o.options) add(g, choiceOption(inner));
        box.appendChild(g);
      } else {
        add(box, choiceOption(o));
      }
    }
    place(v);
  };
  const entry = () => box.selectedIndex < 0 ? null : entries[box.selectedIndex] ?? null;
  const valueOf = () => entry()?.value;
  fill(options, value);
  return {
    box,
    valueOf,
    entry,
    select,
    setOptions(opts, v = valueOf()) {
      fill(opts, v);
    }
  };
}
function toggleChips({
  options,
  value,
  label,
  readOnly,
  onChange,
  notFound = (v) => `${v} (not found)`,
  keepMissing = true,
  loose = false
}) {
  const root = el("div", "twm-flow-togglechips");
  root.setAttribute("role", "group");
  if (label) root.setAttribute("aria-label", label);
  let shown = [];
  let list = [];
  let chosen = /* @__PURE__ */ new Set();
  let strays = [];
  const emit = () => {
    const out = valueOf();
    onChange?.(out.length ? out : void 0);
  };
  const chipFor = (text, pressed, toggle, { stray = false, reason = null, disabled = false } = {}) => {
    const b = el("button", `twm-flow-togglechip${stray ? " twm-flow-togglechip--missing" : ""}`, text);
    b.type = "button";
    b.setAttribute("aria-pressed", pressed ? "true" : "false");
    b.disabled = Boolean(readOnly) || disabled;
    if (reason) {
      b.title = reason;
      b.appendChild(el("span", "twm-choice__reason", reason));
    }
    b.addEventListener("click", () => {
      const on = toggle();
      b.setAttribute("aria-pressed", on ? "true" : "false");
      emit();
    });
    return b;
  };
  const draw = (opts, stored) => {
    shown = opts || [];
    list = flatChoices(shown);
    const heads = groupHeads(shown);
    const wanted = Array.isArray(stored) ? stored : [];
    const offered = (v) => {
      const o = findChoice(list, v, loose);
      return o && !o.disabled ? o : void 0;
    };
    chosen = new Set(wanted.map(offered).filter(Boolean).map((o) => o.value));
    strays = keepMissing ? wanted.filter((v) => !offered(v)) : [];
    root.replaceChildren();
    list.forEach((o, i) => {
      if (heads.has(i)) root.appendChild(groupHeading(heads.get(i)));
      root.appendChild(chipFor(o.label, chosen.has(o.value), () => {
        if (o.disabled) return false;
        if (chosen.has(o.value)) chosen.delete(o.value);
        else chosen.add(o.value);
        return chosen.has(o.value);
      }, { disabled: o.disabled, reason: o.disabled ? o.reason : null }));
    });
    for (const v of [...strays]) {
      root.appendChild(chipFor(notFound(shownValue(v)), true, () => {
        const i = strays.indexOf(v);
        if (i >= 0) {
          strays.splice(i, 1);
          return false;
        }
        strays.push(v);
        return true;
      }, { stray: true }));
    }
  };
  const valueOf = () => [...list.filter((o) => chosen.has(o.value)).map((o) => o.value), ...strays];
  draw(options, value);
  return {
    el: root,
    valueOf,
    setValue: (stored) => draw(shown, stored),
    setOptions: (opts) => draw(opts, valueOf())
  };
}
function choiceList({
  options,
  value,
  name,
  label,
  readOnly,
  onChange,
  notFound = (v) => `${v} (not found)`,
  keepMissing = true,
  loose = false
}) {
  const root = el("div", "twm-flow-choices");
  root.setAttribute("role", "radiogroup");
  if (label) root.setAttribute("aria-label", label);
  let list = [];
  let radios = [];
  const draw = (opts, current) => {
    list = flatChoices(opts);
    const heads = groupHeads(opts);
    radios = [];
    root.replaceChildren();
    const named = choiceIndex(list, current, loose);
    const at = named >= 0 && !list[named].disabled ? named : -1;
    list.forEach((o, i) => {
      if (heads.has(i)) root.appendChild(groupHeading(heads.get(i)));
      const row = el("label", `twm-flow-choice${o.disabled ? " twm-choice--disabled" : ""}`);
      const radio = el("input", "twm-flow-choice__radio");
      radio.type = "radio";
      radio.name = name;
      radio.checked = i === at;
      radio.disabled = Boolean(readOnly) || o.disabled;
      radio.addEventListener("change", () => {
        if (radio.checked) onChange?.(o.value);
      });
      radios.push(radio);
      const words = el("span", "twm-flow-choice__words");
      words.appendChild(el("span", "twm-flow-choice__label", o.label));
      if (o.description !== null) words.appendChild(el("span", "twm-flow-choice__sub", o.description));
      if (o.disabled && o.reason) words.appendChild(el("span", "twm-choice__reason", o.reason));
      row.append(radio, words);
      root.appendChild(row);
    });
    if (keepMissing && current !== void 0 && named < 0) {
      root.appendChild(el("p", "twm-flow-field__note", notFound(shownValue(current))));
    }
  };
  const checkedAt = () => radios.findIndex((r) => r.checked);
  const entry = () => list[checkedAt()] ?? null;
  const api = {
    el: root,
    focus: () => (radios.find((r) => r.checked && !r.disabled) || radios.find((r) => !r.disabled))?.focus({ preventScroll: true }),
    entry,
    valueOf: () => entry()?.value,
    select(v) {
      const named = choiceIndex(list, v, loose);
      const at = named >= 0 && !list[named].disabled ? named : -1;
      radios.forEach((r, i) => {
        r.checked = i === at;
      });
      return at >= 0;
    },
    setOptions(opts) {
      draw(opts, api.valueOf());
    }
  };
  draw(options, value);
  return api;
}

// src/ui/components/row_activation.js
var ROW_CONTROL_SELECTOR = [
  "button",
  "a",
  "input",
  "select",
  "textarea",
  "label",
  "summary",
  '[contenteditable=""]',
  '[contenteditable="true"]',
  "[data-twm-action]"
].join(", ");
function isRowControl(target, scope = null) {
  const hit = target?.closest?.(ROW_CONTROL_SELECTOR);
  return !!hit && (!scope || scope.contains(hit));
}
function endsTextSelection(target, scope = null) {
  const doc = target?.ownerDocument || (typeof document !== "undefined" ? document : null);
  const sel = doc?.getSelection?.();
  if (!sel || sel.isCollapsed || !String(sel)) return false;
  if (!scope) return true;
  const inside = (node) => !!node && scope.contains(node);
  return inside(sel.anchorNode) || inside(sel.focusNode);
}
function isRowActivation(ev, gesture = "click", { scope = null } = {}) {
  const target = ev?.target;
  if (!target?.closest) return false;
  if (isRowControl(target, scope)) return false;
  if (gesture === "click") {
    if ((ev.detail ?? 0) > 1) return false;
    if (endsTextSelection(target, scope)) return false;
  }
  return true;
}

export {
  DEFAULT_WINDOW_STORAGE_KEY,
  DEFAULT_MAX_SAVED_WINDOWS,
  ManagedWindow,
  ToggleField,
  isHexColor,
  normalizeHex,
  ColorField,
  shownValue,
  flatChoices,
  findChoice,
  selectBox,
  toggleChips,
  choiceList,
  ROW_CONTROL_SELECTOR,
  isRowControl,
  endsTextSelection,
  isRowActivation
};
//# sourceMappingURL=chunk-PGZ4EHSE.js.map
