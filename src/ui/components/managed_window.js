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

/** C11. How close to an edge the POINTER must come for a snap zone to arm.
 *  Small enough that it takes intent, large enough to hit without aiming. */
const SNAP_EDGE = 12;

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
        /** C11. AERO SNAP — drag to an edge, release, the window takes that
         *  region. Opt-in and default OFF, so no existing consumer changes
         *  behaviour by upgrading. Meaningful only for a draggable window that
         *  is allowed to change size. */
        this.snap = (options.snap ?? false) && this.canDrag && this.canResize;
        /** C15. SNAP AS A DELEGATED DECISION.
         *
         *  C11's snap answers "which rectangle" out of three it computes itself
         *  from `_bounds()`. That is the whole and correct answer for a window
         *  floating over a region nothing else owns, and only half of it under a
         *  TILING window manager: there, dropping on an edge does not move a
         *  window, it PROMOTES one — the window stops being a ManagedWindow and
         *  becomes a leaf in a tree this component knows nothing about.
         *
         *  So the decision is delegated. A `snapController` is:
         *
         *      probe(pointerEvent, win) -> { key, rect } | null
         *          `rect` is {left, top, width, height} in VIEWPORT pixels —
         *          the space a hit-test against other people's DOM naturally
         *          produces. `key` is an opaque identity for the zone; the
         *          preview only re-renders when it changes.
         *      commit(probe, win) -> falsy | true | Promise
         *          Called once on release. Falsy means "not mine" and the
         *          window keeps the position the drag left it in. Anything
         *          truthy means the controller took the window AND the preview:
         *          a controller that opens a menu needs the preview to outlive
         *          the pointer-up, so it clears it through `clearSnapPreview()`.
         *
         *  Absent, every line below reduces to C11 exactly. */
        this.snapController = options.snapController || null;
        /** R1. DRAG ACROSS THE CONTAINER BOUNDARY.
         *
         *  A contained window lives inside a box with `overflow: hidden` — for
         *  the WM that box is a tile's leaf wrap — so at rest it cannot show a
         *  single pixel outside it, and a drag that leaves it is a drag that
         *  disappears. `dragHost` names the WIDER box the window is re-parented
         *  into for the duration of a drag: an element or a `(win) => element`
         *  callback, resolved on every pointer-down because the WM's root
         *  outlives any particular tile and a captured tile does not.
         *
         *  Absent — every consumer today — nothing re-parents and the drag is
         *  clamped to the container exactly as before. The host must CONTAIN
         *  the current container: escaping is meant to widen the box the window
         *  may cross, not to move it somewhere it has no business being. */
        this.dragHost = options.dragHost || null;
        /** R12. THE BOX AN ESCAPED WINDOW MAY OCCUPY, in the drag host's own
         *  coordinates: `() => {minX, minY, width, height}`.
         *
         *  R1 widened the drag from one pane to the whole root, and the root is
         *  not all tiles — the docked panels are inside it too. Without this a
         *  window can be dragged down over the bottom panel and left there,
         *  which is the one edge of the four that stopped feeling like an edge.
         *  The host knows which of its children are panels and this component
         *  never will, so it answers rather than guesses.
         *
         *  Consulted only while a drag has escaped: at rest the container is
         *  the box, exactly as before, and a window that never escapes never
         *  reads this. */
        this.dragBounds = options.dragBounds || null;
        /** R7. MAXIMISE IS A GESTURE, NOT NECESSARILY A RECTANGLE.
         *
         *  `(win) => truthy` claims the maximise gesture: `toggleMaximize`
         *  returns without touching the geometry, and the consumer does
         *  whatever it decided maximise means. The WM decides it means "back
         *  into the tree", which is why the separate demote button it used to
         *  inject into this chrome is gone. Falsy — and absent — leaves the
         *  ordinary maximise, so no existing window changes behaviour. */
        this.onMaximize = options.onMaximize || null;
        /** A Material Symbol name replacing the maximize button's square, and
         *  its tooltip. They exist because `onMaximize` can change what the
         *  button DOES, and a button that does something else while drawing a
         *  square is a lie the user only discovers by pressing it. */
        this.maximizeIcon = options.maximizeIcon || null;
        this.maximizeTitle = options.maximizeTitle || 'Maximize';
        this._snapZone = null;
        this._snapProbe = null;
        /** The container a drag escaped FROM, for as long as that drag lasts.
         *  Null at every other moment, including for a window that never
         *  escapes. Read by the consumer's snap controller (`dragOrigin`), which
         *  needs to know which pane is "home" to stay silent inside it. */
        this._escapeOrigin = null;
        this._preSnapState = null;
        this._snapPreviewEl = null;
        // C27. THE TWO ANIMATION TIMERS, HELD SO THEY CAN BE CANCELLED.
        // Each of `minimize`/`_restore` ends in a `setTimeout` that finishes
        // its animation, and each finishes it by writing state the OTHER one
        // owns — `display`, and the three `--mw-target-*` properties. Fired
        // after the opposite gesture has already run, that write is not a late
        // tidy-up, it is a corruption. See `_restore` for the report.
        this._minimizeTimer = null;
        this._restoreTimer = null;
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
            // C27. `show()` IS THE REPAIR PATH, so it repairs. A window that is
            // visible by its own flags and hidden by an inline `display: none`
            // is the state the minimise/restore race used to leave behind, and
            // a consumer holding such a window had nothing to call: this branch
            // raised a window nobody could see. Clearing the property is a
            // no-op for every window that was not in that state — a shown
            // window's `display` is already `''`.
            if (this.element && this.element.style.display === 'none') {
                this.element.style.display = '';
            }
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
            // A window whose PERSISTED state was maximised is maximised before
            // anyone touches the button, so the modifier has to be written here
            // too and not only in `toggleMaximize`.
            this.element?.classList.toggle(
                'twm-managed-window--maximized', this.isMaximized);
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
        // C27. A window can be closed mid-animation — "back to tile" from the
        // taskbar's menu is exactly that, and it closes a MINIMISED window. The
        // pending timer would then write `display: none` and strip the target
        // properties from an element that has been detached, or, for a window
        // `show()` puts back inside the same 200ms, from a live one.
        this._cancelMinimizeAnimation();
        this._cancelRestoreAnimation();
        this._clearTargetProperties();
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

        // C27. The mirror of the cancellation in `_restore`. A restore in
        // flight owns `--restoring` and the target properties, and its timer
        // would strip both out from under the minimise that replaced it —
        // leaving a window that shrinks toward the taskbar and then snaps back
        // to full size for the rest of the 200ms.
        this._cancelRestoreAnimation();

        if (!getSetting('window.animateMinimize', true)) {
            this.element.style.display = 'none';
            return;
        }

        // Calculate animation target toward the taskbar button
        this._setMinimizeTargetProperties();
        this.element.classList.add('twm-managed-window--minimizing');

        this._minimizeTimer = setTimeout(() => {
            this._minimizeTimer = null;
            if (this.element) {
                this.element.style.display = 'none';
                this.element.classList.remove('twm-managed-window--minimizing');
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
        this.element?.classList.remove('twm-managed-window--minimizing');
    }

    /** C27. Abandon a restore animation that has not landed yet. */
    _cancelRestoreAnimation() {
        if (this._restoreTimer !== null) {
            clearTimeout(this._restoreTimer);
            this._restoreTimer = null;
        }
        this.element?.classList.remove('twm-managed-window--restoring');
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

        // Capture taskbar item rect BEFORE dispatching the event (which removes it)
        const taskbarRect = this._getTaskbarItemRect();

        // C27. FIRST, before `display` is cleared: the pending timer would
        // otherwise undo this whole method 200ms from now.
        this._cancelMinimizeAnimation();

        if (this.element) {
            this.element.style.display = '';

            const animate = getSetting('window.animateMinimize', true);
            if (animate) {
                // A restore that interrupts a restore — two clicks on one
                // taskbar button — would otherwise have the first timer strip
                // the second one's class and properties at ITS deadline.
                this._cancelRestoreAnimation();
                this._setRestoreTargetProperties(taskbarRect);
                this.element.classList.add('twm-managed-window--restoring');
                this._restoreTimer = setTimeout(() => {
                    this._restoreTimer = null;
                    if (this.element) {
                        this.element.classList.remove('twm-managed-window--restoring');
                        this._clearTargetProperties();
                    }
                }, 250);
            } else {
                // No animation means no timer to clear the properties, and a
                // minimise that was cancelled mid-flight left three of them
                // set. Harmless while no class reads them and wrong the moment
                // one does.
                this._clearTargetProperties();
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

        // R7. THE CONSUMER MAY OWN THIS GESTURE, and under the window manager
        // it does: `adoptWindow` rewrites `onMaximize` to `bringBackWindow`, so
        // both doors — the button and the topbar's double-click — DOCK.
        //
        // C28. A CLAIM THAT DECLINES MUST FALL THROUGH, which is what makes
        // "expand this window into a tile" a gesture rather than a dead zone.
        // `bringBackWindow` returns false for a window the WM never adopted, so
        // this runs the geometric maximise for it — the answer every other
        // window manager gives a window with nowhere to go back to. When the
        // wrappers returned `true` regardless, the gesture was claimed, nothing
        // docked and nothing maximised: reported twice, as a title bar whose
        // double-click did nothing at all.
        //
        // Guarded like every other consumer callback here: an exception must not
        // leave the window in a half-maximised state — and a `throw` is a
        // DECLINE, not a claim, so it falls through to the rectangle too.
        if (claimable && this.onMaximize) {
            let handled = false;
            try { handled = this.onMaximize(this) ?? false; }
            catch (err) { console.error('[managed-window] onMaximize threw', err); }
            if (handled) return;
        }

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

        // A CLASS THE STYLESHEET HAS ALWAYS KNOWN AND NOTHING EVER SET.
        // `.twm-managed-window--maximized .twm-managed-window__resize
        // { display: none }` is in `css/base.css` — "a maximised window is not
        // resized by dragging its edges" — and it has never matched anything,
        // because no code path adds the modifier. So a maximised window keeps
        // eight live resize handles hanging 3px outside its edges. Exactly the
        // shape of the `.twm-collapsible-content.visible` and
        // `managed-window__resize--${dir}` bugs: a rule for a class that is
        // never written.
        this.element?.classList.toggle('twm-managed-window--maximized', this.isMaximized);
        this._applyPosition();
        this._saveCurrentState();
        // C16. Maximise is a STATE, and until now nothing outside this class
        // could see it change. A consumer that wants to say "a maximised window
        // has no minimize" — the WM does, for the windows it promotes out of
        // tiles — had no edge to hang the rule on and would have had to poll.
        // Same detail shape as the other three window events, `container`
        // included, so a per-region consumer can filter on receipt.
        window.dispatchEvent(new CustomEvent('managed-window-maximized', {
            detail: { id: this.id, maximized: this.isMaximized, container: this.container },
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
            // BOTH SPELLINGS. The `twm-` prefix was missed on this modifier and
            // on `--maximize` when the component was vendored — the same slip
            // C13 found on the resize handles, where it meant no rule matched
            // either spelling. Nothing styles these two today, so nothing is
            // broken by it, but a consumer that wants to reach for one (the WM
            // hides minimize on a maximised window it promoted) should not have
            // to know which of the two conventions this particular button
            // landed on. The unprefixed name stays for whoever already queries
            // it; the prefixed one is the one to use.
            minBtn.className = 'twm-managed-window__btn '
                             + 'twm-managed-window__btn--minimize managed-window__btn--minimize';
            minBtn.type = 'button';
            minBtn.innerHTML = '<svg width="10" height="10" viewBox="0 0 10 10"><path d="M1 5h8" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>';
            minBtn.title = 'Minimize';
            minBtn.addEventListener('click', (e) => { e.stopPropagation(); this.minimize(); });
            buttons.appendChild(minBtn);
        }

        // Maximize button (optional)
        if (this.canMaximize) {
            const maxBtn = document.createElement('button');
            maxBtn.className = 'twm-managed-window__btn '
                             + 'twm-managed-window__btn--maximize managed-window__btn--maximize';
            maxBtn.type = 'button';
            // R7. The square is the default and stays the default. A consumer
            // that redefined the gesture with `onMaximize` draws its own glyph
            // here rather than reaching into this markup afterwards — which is
            // what the WM used to do for its "back to tile" button, with four
            // internal class names and a silent failure if any of them moved.
            if (this.maximizeIcon) {
                const glyph = document.createElement('span');
                glyph.className = 'material-symbols-outlined';
                glyph.textContent = this.maximizeIcon;
                maxBtn.appendChild(glyph);
            } else {
                maxBtn.innerHTML = '<svg width="10" height="10" viewBox="0 0 10 10"><rect x="1" y="1" width="8" height="8" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>';
            }
            maxBtn.title = this.maximizeTitle;
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
            // C26. THE CLAIMED VERB, which under the window manager is "back to
            // tile". This went the other way first, on a reading of *"double
            // click ... always to maximize window"* as the geometric maximise —
            // the product owner then said *"double click on a managed window
            // showing a table needs to maximize to tile"*, which is the claim.
            // `claimable: false` stays on the method for a consumer that wants
            // the rectangle on a window whose maximise is claimed; nothing
            // INSIDE the library passes it, and this binding never has.
            //
            // C28 is what makes this safe for a window with no tile to go back
            // to: the claim may DECLINE — `bringBackWindow` returns false for a
            // window the WM never adopted — and `toggleMaximize` then falls
            // through to the geometric maximise. So the gesture always does
            // something, which is the whole complaint it was reported under.
            topbar.addEventListener('dblclick', () => this.toggleMaximize());
        }
        this.element.addEventListener('pointerdown', () => this.bringToFront());
    }

    _addResizeHandles() {
        const directions = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
        for (const dir of directions) {
            const handle = document.createElement('div');
            // BOTH classes carry the `twm-` prefix. The per-direction one was
            // left unprefixed when the framework was namespaced, and no rule for
            // either spelling exists — so all eight handles were
            // `position: absolute` with no size and no placement, and every
            // window in every consumer was unresizable. The legacy unprefixed
            // class is kept alongside for any embedder still selecting on it.
            handle.className = `twm-managed-window__resize `
                + `twm-managed-window__resize--${dir} managed-window__resize--${dir}`;
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
        // R12. Mid-escape the container is the drag HOST — the root, which
        // contains the panels as well as the tiles. `dragBounds` narrows it to
        // the part a window belongs in; without it the bottom edge is the
        // root's, and the bottom panel is inside that.
        //
        // R13. AND FOR AS LONG AS THE WINDOW IS LEFT THERE. A drop the snap
        // controller CLAIMS ends the escape WITHOUT putting the window back
        // (`_endDragEscape({ taken: true })` returns before re-parenting), and
        // the window manager's aero-snap maximise is exactly that case: the
        // window stays a child of the host, filling the part of it
        // `dragBounds` describes. `_escapeOrigin` is null by then, so the test
        // as it stood stopped applying the moment the drag ended — and the next
        // re-clamp, which the container's ResizeObserver performs on any
        // splitter drag, would re-read the bounds as the WHOLE ROOT and grow
        // the window out over the docked panels.
        //
        // What the two cases share is not "mid-drag", it is THE CONTAINER IS
        // THE DRAG HOST — never true of a window sitting in its own pane, and
        // true of every window the host is currently holding. `dragHost` is
        // resolved rather than remembered for the same reason `_beginDragEscape`
        // resolves it: it is a function so that it can outlive any one tile.
        if (this.dragBounds) {
            const host = typeof this.dragHost === 'function'
                ? this.dragHost(this) : this.dragHost;
            if (this._escapeOrigin || (host && host === this.container)) {
                const b = this.dragBounds(this);
                if (b && b.width > 0 && b.height > 0) return b;
            }
        }
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
            this.element.classList.toggle('twm-managed-window--contained', true);
            if (this.backdropElement) container.appendChild(this.backdropElement);
        }
        this._resizeObserver?.disconnect();
        this._resizeObserver = null;
        this._installContainerResizeObserver();
        // A snapped window's rectangle belonged to the old container, so the
        // snap does not survive the move; its pre-snap size does.
        this._preSnapState = null;
        this.element?.classList.remove('twm-managed-window--snapped');
        if (this.isMaximized) {
            const bounds = this._bounds();
            this.x = bounds.minX; this.y = bounds.minY;
            this.width = bounds.width; this.height = bounds.height;
        }
        this._applyPosition();
        window.dispatchEvent(new CustomEvent('managed-window-moved', {
            detail: { id: this.id, container },
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
    get dragOrigin() { return this._escapeOrigin; }

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
        const host = typeof this.dragHost === 'function'
            ? this.dragHost(this) : this.dragHost;
        // CONTAINS, not merely "different". The host is meant to be the wider
        // box the window may now cross; anything else would teleport it.
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
        this.element?.classList.remove('twm-managed-window--detached');
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
            this.x += (from.left + prev.clientLeft - prev.scrollLeft)
                    - (to.left + next.clientLeft - next.scrollLeft);
            this.y += (from.top + prev.clientTop - prev.scrollTop)
                    - (to.top + next.clientTop - next.scrollTop);
        }
        this.container = next;
        if (this.element) {
            next.appendChild(this.element);
            // Still contained — a drag host is another box on the page, not the
            // page — so the `position: absolute` modifier stays exactly as it
            // was. Toggled rather than assumed, because a window whose container
            // was null cannot reach here but a future caller might.
            this.element.classList.toggle('twm-managed-window--contained', !!next);
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
            outside = e.clientX < r.left || e.clientX > r.right
                   || e.clientY < r.top  || e.clientY > r.bottom;
        }
        this.element.classList.toggle('twm-managed-window--detached', outside);
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
        // Picking up a SNAPPED window restores the size it had before, centred
        // under the pointer — the same gesture Windows uses, and the reason a
        // snap does not have to be undone through a menu.
        if (this.snap && this._preSnapState) {
            const grabRatio = this.width ? (e.clientX - this.x) / this.width : 0.5;
            this.unsnap();
            this.x = Math.round(e.clientX - this.width * grabRatio);
            this._applyPosition();
        }
        // ══ C28. THE ESCAPE WAITS FOR MOVEMENT, AND THAT IS THE WHOLE OF
        //    WHY DOUBLE-CLICKING A TITLE BAR DID NOTHING ══════════════════
        //
        // R1 escaped the pane HERE, on pointerdown, before the pointer had
        // moved a pixel — so every press on a title bar tore the window element
        // out of `.tbl-canvas-pane`, appended it to the WM root, and put it
        // back on release. Two DOM removals per click, for a click.
        //
        // Blink and Gecko both drop the pending click when the element the
        // press landed on leaves the document between press and release:
        // `MouseEventManager::NodeWillBeRemoved` clears `mouse_down_element_`,
        // and `click` is dispatched to the common ancestor of that element and
        // the release target — with it null, no `click` is dispatched at all,
        // and `dblclick`, which counts clicks, never comes. So the `dblclick`
        // listener eleven lines below `_addResizeHandles` has never once fired
        // on a CONTAINED window in a real browser. Reported twice as *"double
        // click does not maximize to tile"*, and re-reading the listener could
        // not find it: the listener is correct, the gesture never reaches it.
        //
        // jsdom cannot see this — it has no click-count model and a test
        // dispatches `dblclick` directly — which is why every existing check
        // says the gesture works. The assertion that CAN see it is the one
        // about the mechanism: a press with no movement must leave the element
        // where it found it, and `web/js/shell/window_lifecycle.test.mjs`
        // asserts exactly that.
        //
        // Deferring costs nothing the escape was buying. R1 exists so a
        // contained window can be dragged past the pane that clips it, and
        // nothing is clipped until something moves; `_onPointerMove` performs
        // it on the first movement and corrects the drag origin by the same
        // delta `_reparentPreservingPosition` applied, so the window still
        // tracks the pointer exactly. `_onPointerUp` already tolerates a drag
        // that never escaped — `_endDragEscape` returns early with no origin.
        this._dragState = {
            startX: e.clientX,
            startY: e.clientY,
            startWinX: this.x,
            startWinY: this.y,
        };

        document.addEventListener('pointermove', this._boundOnPointerMove);
        document.addEventListener('pointerup', this._boundOnPointerUp);
        // A cancelled pointer never produces a `pointerup` — a touch turning
        // into a browser gesture, the tab losing the pointer, a device
        // disconnecting. Before C15 that left a window mid-drag, which the next
        // pointerdown corrected; now it can also leave a `position: fixed`
        // preview rectangle painted over the page with nothing to remove it.
        document.addEventListener('pointercancel', this._boundOnPointerUp);
    }

    _onPointerMove(e) {
        if (this._dragState) {
            // C28. THE ESCAPE, at the first movement rather than at the press —
            // see `_onTopbarPointerDown` for the click it used to eat.
            //
            // `_reparentPreservingPosition` rewrites `this.x`/`this.y` into the
            // host's reference frame so the rectangle on screen does not move.
            // `_dragState.startWinX` was recorded in the PANE's frame a moment
            // ago and is the origin every subsequent delta is added to, so it
            // has to make the same journey — otherwise the window jumps by the
            // offset between the two boxes at the first millimetre of the drag,
            // which is the exact failure R1's "out of the pane FIRST" comment
            // was written to prevent. Same correction, applied where the escape
            // now happens.
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
        // The snap is applied BEFORE the state is saved, so what is persisted is
        // where the window ended up rather than where it was let go.
        let taken = false;
        if (this._dragState && this.snap && this._snapZone) {
            // C15. A controller answers instead of `_applySnap` when there is
            // one. It may answer asynchronously (a three-way choice is a menu),
            // which is why a truthy return also transfers ownership of the
            // preview — clearing it here would blank the affordance the menu is
            // still describing.
            if (this.snapController) {
                // Guarded, exactly as `probe` is. `commit` is not a leaf call —
                // it reaches all the way into somebody else's tree mutation and
                // back out through a window close — and an exception escaping
                // here would leave the drag listeners attached and the window
                // following the pointer for ever.
                try {
                    taken = this.snapController.commit?.(this._snapProbe, this) ?? false;
                } catch (err) {
                    console.error('[managed-window] snap commit threw', err);
                    taken = false;
                }
            } else {
                this._applySnap(this._snapZone);
            }
        }
        if (!taken) this.clearSnapPreview();
        this._snapZone = null;
        // R1. Back into a container before `_saveCurrentState`, or what is
        // persisted is a rectangle in the drag host's space that will be read
        // back as if it were the pane's.
        if (this._dragState) this._endDragEscape({ taken });
        if (this._dragState || this._resizeState) {
            this._saveCurrentState();
        }
        this._dragState = null;
        this._resizeState = null;
        document.removeEventListener('pointermove', this._boundOnPointerMove);
        document.removeEventListener('pointerup', this._boundOnPointerUp);
        document.removeEventListener('pointercancel', this._boundOnPointerUp);
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
            case 'top':   return { x: b.minX, y: b.minY, width: b.width, height: b.height };
            case 'left':  return { x: b.minX, y: b.minY, width: half, height: b.height };
            case 'right': return { x: b.minX + b.width - half, y: b.minY,
                                   width: half, height: b.height };
            default:      return null;
        }
    }

    /** Which zone the POINTER is in — not the window. Using the window's own
     *  edge would make a wide window snap the moment it is picked up, because
     *  it is already touching the edge it did not move towards. */
    _zoneFor(e) {
        const host = this.container || document.documentElement;
        const rect = this.container
            ? host.getBoundingClientRect()
            : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        // Outside the host entirely: no zone. Dragging a contained window over
        // the page chrome must not snap it to the container's edge.
        if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null;
        if (y <= SNAP_EDGE) return 'top';
        if (x <= SNAP_EDGE) return 'left';
        if (x >= rect.width - SNAP_EDGE) return 'right';
        return null;
    }

    _updateSnapZone(e) {
        if (this.snapController) { this._updateControlledSnapZone(e); return; }
        const zone = this._zoneFor(e);
        if (zone === this._snapZone) return;
        this._snapZone = zone;
        if (!zone) { this.clearSnapPreview(); return; }
        this.showSnapPreview(this._snapRect(zone));
    }

    /** C15. The controller's half of `_updateSnapZone`. The probe runs on every
     *  move because the rectangle can change while the KEY does not — a tile
     *  resized underneath the pointer, a menu re-previewing the same zone — but
     *  the DOM is only touched when something actually differs. */
    _updateControlledSnapZone(e) {
        let probe = null;
        try { probe = this.snapController.probe?.(e, this) ?? null; }
        catch (err) { console.warn('[managed-window] snap probe threw', err); }
        this._snapProbe = probe;
        this._snapZone = probe?.key ?? null;
        if (!probe?.rect) { this.clearSnapPreview(); return; }
        this.showSnapPreview(probe.rect, { viewport: true });
    }

    /** Paint the drag affordance. `rect` is container-relative by default —
     *  the same space `_applyPosition` writes — and viewport-relative for a
     *  controller, whose rectangles come from hit-testing other people's DOM.
     *  Public because a controller that survives the pointer-up owns it. */
    showSnapPreview(rect, { viewport = false } = {}) {
        if (!rect) { this.clearSnapPreview(); return; }
        const host = viewport ? document.body : (this.container || document.body);
        if (!this._snapPreviewEl) {
            this._snapPreviewEl = document.createElement('div');
            // `aria-hidden`: it is a drag affordance, not content.
            this._snapPreviewEl.setAttribute('aria-hidden', 'true');
        }
        this._snapPreviewEl.className =
            `twm-snap-preview${viewport ? ' twm-snap-preview--viewport' : ''}`;
        const left = rect.left ?? rect.x;
        const top  = rect.top  ?? rect.y;
        Object.assign(this._snapPreviewEl.style, {
            left: `${left}px`, top: `${top}px`,
            width: `${rect.width}px`, height: `${rect.height}px`,
        });
        if (this._snapPreviewEl.parentNode !== host) host.appendChild(this._snapPreviewEl);
    }

    clearSnapPreview() {
        this._snapPreviewEl?.remove();
        this._snapProbe = null;
    }

    /** @deprecated retained so nothing inside this file has to change spelling
     *  in the same commit that adds the public one. */
    _clearSnapPreview() { this.clearSnapPreview(); }

    /** Applied on release. The pre-snap geometry is remembered so dragging the
     *  window off an edge restores the size it had — a snap that eats the
     *  original size makes the gesture one-way and people stop using it. */
    _applySnap(zone) {
        const rect = this._snapRect(zone);
        if (!rect) return;
        if (!this._preSnapState) {
            this._preSnapState = { x: this._dragState.startWinX, y: this._dragState.startWinY,
                                   width: this.width, height: this.height };
        }
        this.x = rect.x;
        this.y = rect.y;
        this.width = rect.width;
        this.height = rect.height;
        this._applyPosition();
        this.element?.classList.add('twm-managed-window--snapped');
        window.dispatchEvent(new CustomEvent('managed-window-snapped', {
            detail: { id: this.id, zone, container: this.container },
        }));
    }

    /** Restore the geometry a snap replaced. Called when a snapped window is
     *  picked up again, which is the gesture that means "un-snap". */
    unsnap() {
        if (!this._preSnapState) return false;
        const { x, y, width, height } = this._preSnapState;
        this._preSnapState = null;
        this.x = x; this.y = y; this.width = width; this.height = height;
        this._applyPosition();
        this.element?.classList.remove('twm-managed-window--snapped');
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
}
