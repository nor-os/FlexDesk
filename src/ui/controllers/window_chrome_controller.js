/**
 * WindowChromeController
 *
 * Handles frameless window management for the desktop application:
 * - Window minimize, maximize, close buttons
 * - Resize handles (edges and corners)
 * - Top bar dragging for window movement
 * - F11 fullscreen toggle
 *
 * Talks to the embedder ONLY through a Host's `window` capability
 * (see src/host/host.js). A host with no `window` capability — a browser
 * tab, a VS Code webview, the standalone demo — is legal: we simply don't
 * install custom chrome. That degraded path is also the production path on
 * Linux, macOS and `--browser`, where the OS/browser draws the title bar.
 *
 * THREE MODES, decided by `host.window.chrome()` (which may answer with a
 * promise: the Photino host asks its native side): a browser tab and a window
 * with native chrome get NOTHING from this class (no handles, no buttons, no
 * body class), and only a window that answers `custom` gets the chrome.
 *
 * NATIVE GESTURES. A host that offers `startNativeDrag()` and
 * `startNativeResize(edge)` gets drags on the top bar and presses on the
 * resize handles handed to the OS, which brings snapping and a resize that
 * keeps up with the pointer. A host without them gets the JS move and resize
 * over getBounds/setBounds.
 *
 * @param {object} [opts]
 * @param {object} [opts.host]          a Host; only its `window` capability is used
 * @param {string|Element} [opts.topBar='.twm-global-top-bar']  the bar that drags the window
 * @param {string|Element} [opts.controls]  where to draw minimise/maximise/close when
 *        the page has no `#win-minimize`/`#win-maximize`/`#win-close` of its own
 *        (default: the top bar's `.twm-bar-right`, else the top bar itself)
 * @param {string} [opts.noDrag]        more selectors that never start a drag
 */

const SUPPORTS_POINTER = typeof window !== 'undefined' && 'onpointerdown' in window;
const MIN_WIDTH = 500;
const MIN_HEIGHT = 350;
const DRAG_THRESHOLD = 4;

export class WindowChromeController {
    constructor({ eventBus, logger, host, topBar = '.twm-global-top-bar', controls = null, noDrag = '' } = {}) {
        this.eventBus = eventBus;
        this.logger = logger || console;
        this._topBarOpt = topBar;
        this._controlsOpt = controls;
        this._noDrag = noDrag;
        this._createdControls = null;

        // The host's window capability, or null. Never throw on a missing
        // one — see the class comment.
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
    async initialize() {
        if (this._disposed) return false;

        let chrome = 'native';
        try { chrome = this.win ? await this.win.chrome() : 'native'; } catch (_) { chrome = 'native'; }
        if (this._disposed) return false;
        if (chrome !== 'custom') {
            // Native window decorations (Linux/macOS) or the browser already
            // provide a title bar + window controls; our custom chrome would be
            // a redundant second set. Skip it entirely.
            this.logger.info?.('[WindowChrome] Native/browser chrome detected — custom window chrome disabled');
            return false;
        }

        document.body.classList.add('twm-custom-chrome');
        this.#createWindowControls();
        this.#wireWindowButtons();
        this.#createResizeHandles();
        this.#wireTopBarDrag();
        this.#wireKeyboardShortcuts();
        this.#wireNativeStateSync();
        this.#initializeState();
        
        this.logger.info?.('[WindowChrome] Initialized');
        return true;
    }

    /** An element from a selector or an element; null when there is none. */
    #resolve(target, within = document) {
        if (!target) return null;
        if (typeof target !== 'string') return target;
        return within.querySelector(target);
    }

    /**
     * Draw minimise, maximise/restore and close, unless the page has its own
     * `#win-*` buttons (an embedder's own markup), which are then wired instead.
     */
    #createWindowControls() {
        if (document.getElementById('win-minimize') || document.getElementById('win-close')) return;
        const bar = this.#resolve(this._topBarOpt);
        const host = this.#resolve(this._controlsOpt)
            || bar?.querySelector('.twm-bar-right')
            || bar;
        if (!host) return;
        const box = document.createElement('div');
        box.className = 'twm-window-controls';
        const button = (id, icon, label, extra = '') => {
            const b = document.createElement('button');
            b.type = 'button';
            b.id = id;
            b.className = `twm-window-controls__btn${extra}`;
            b.setAttribute('aria-label', label);
            b.title = label;
            const i = document.createElement('span');
            i.className = 'material-symbols-outlined';
            i.textContent = icon;
            b.appendChild(i);
            box.appendChild(b);
        };
        button('win-minimize', 'remove', 'Minimize');
        button('win-maximize', 'check_box_outline_blank', 'Maximize');
        button('win-close', 'close', 'Close', ' twm-window-controls__btn--close');
        host.appendChild(box);
        this._createdControls = box;
    }

    /**
     * Wire minimize, maximize, close buttons
     */
    #wireWindowButtons() {
        const minBtn = document.getElementById('win-minimize');
        const maxBtn = document.getElementById('win-maximize');
        const closeBtn = document.getElementById('win-close');

        if (minBtn) {
            const handler = () => this.win.minimize();
            minBtn.addEventListener('click', handler);
            this._disposers.push(() => minBtn.removeEventListener('click', handler));
        }

        if (maxBtn) {
            const handler = async () => {
                try {
                    const isMax = await this.win.setMaximized(!(await this.win.isMaximized()));
                    this.#updateMaximizeIcon(isMax);
                    this.#setResizeHandlesEnabled(!isMax);
                } catch (e) {
                    this.logger.warn?.('[WindowChrome] Maximize toggle failed', e);
                }
            };
            maxBtn.addEventListener('click', handler);
            this._disposers.push(() => maxBtn.removeEventListener('click', handler));
        }

        if (closeBtn) {
            const handler = () => this.win.close();
            closeBtn.addEventListener('click', handler);
            this._disposers.push(() => closeBtn.removeEventListener('click', handler));
        }
    }

    /**
     * Update maximize button icon and body class
     */
    #updateMaximizeIcon(isMax) {
        const maxBtn = document.getElementById('win-maximize');
        if (!maxBtn) return;
        
        const icon = maxBtn.querySelector('.material-symbols-outlined');
        if (icon) {
            icon.textContent = isMax ? 'filter_none' : 'check_box_outline_blank';
        }
        const tooltipText = isMax ? 'Restore' : 'Maximize';
        window.LatexTooltip?.set(maxBtn, tooltipText);
        maxBtn.setAttribute('aria-label', tooltipText);
        maxBtn.title = tooltipText;
        
        document.body.classList.toggle('twm-window-maximized', isMax);
    }

    /**
     * Enable/disable resize handles
     */
    #setResizeHandlesEnabled(enabled) {
        Object.values(this.handles).forEach(handle => {
            if (handle) {
                handle.style.pointerEvents = enabled ? 'auto' : 'none';
            }
        });
    }

    /**
     * Set fullscreen body class
     */
    #setFullscreenClass(isFs) {
        document.body.classList.toggle('window-fullscreen', isFs);
    }

    /**
     * Create all resize handles
     */
    #createResizeHandles() {
        const positions = ['right', 'left', 'top', 'bottom'];
        const corners = ['br', 'bl', 'tr', 'tl'];

        positions.forEach(pos => {
            const handle = document.createElement('div');
            handle.className = `twm-resize-handle ${pos}`;
            document.body.appendChild(handle);
            this.handles[pos] = handle;
            this.#setupResize(handle, pos);
        });

        corners.forEach(corner => {
            const handle = document.createElement('div');
            handle.className = `twm-resize-handle corner ${corner}`;
            document.body.appendChild(handle);
            const mode = 'corner' + corner.toUpperCase();
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

        const EDGE = {
            right: 'e', left: 'w', top: 'n', bottom: 's',
            cornerBR: 'se', cornerBL: 'sw', cornerTR: 'ne', cornerTL: 'nw',
        };

        const startDrag = async (e) => {
            if (e.button != null && e.button !== 0) return;
            e.preventDefault();
            // ── Native resize: the OS runs its own size loop (it blocks until
            // mouse-up), so the edge stays under the pointer. ──
            if (this.win.startNativeResize) {
                this.resizingActive = true;
                let handled = false;
                try { handled = await this.win.startNativeResize(EDGE[mode]); } catch (_) { handled = false; }
                this.resizingActive = false;
                if (handled) return;
            }
            this.resizingActive = true;
            startX = e.clientX;
            startY = e.clientY;
            startScreenX = e.screenX ?? startX;
            startScreenY = e.screenY ?? startY;

            try {
                const res = await this.win.getBounds();
                if (res) {
                    startLeft = typeof res.x === 'number' ? res.x : 0;
                    startTop = typeof res.y === 'number' ? res.y : 0;
                    startW = res.width || document.documentElement.clientWidth;
                    startH = res.height || document.documentElement.clientHeight;
                } else {
                    startLeft = 0;
                    startTop = 0;
                    startW = document.documentElement.clientWidth;
                    startH = document.documentElement.clientHeight;
                }
            } catch (e) {
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

            // Capture pointer for smooth resize even when cursor escapes the handle
            if (SUPPORTS_POINTER && e.pointerId != null && handle.setPointerCapture) {
                try {
                    handle.setPointerCapture(e.pointerId);
                    activePointerId = e.pointerId;
                } catch (_) {}
            }

            if (SUPPORTS_POINTER) {
                window.addEventListener('pointermove', onMove, { passive: false });
                window.addEventListener('pointerup', endDrag, { once: true });
            } else {
                window.addEventListener('mousemove', onMove, { passive: false });
                window.addEventListener('mouseup', endDrag, { once: true });
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

            const isLeft = mode === 'left' || mode === 'cornerBL' || mode === 'cornerTL';
            const isRight = mode === 'right' || mode === 'cornerBR' || mode === 'cornerTR';
            const isTop = mode === 'top' || mode === 'cornerTR' || mode === 'cornerTL';
            const isBottom = mode === 'bottom' || mode === 'cornerBR' || mode === 'cornerBL';

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
                window.removeEventListener('pointermove', onMove);
            } else {
                window.removeEventListener('mousemove', onMove);
            }
            // Release pointer capture
            if (activePointerId != null && handle.releasePointerCapture) {
                try { handle.releasePointerCapture(activePointerId); } catch (_) {}
                activePointerId = null;
            }
            // Flush any pending bounds update that was waiting for rAF
            if (pending && (!lastSent || !boundsEqual(lastSent, pending))) {
                this.win.setBounds({ x: pending.x, y: pending.y, width: pending.w, height: pending.h });
            }
            pending = null;
            lastSent = null;
            this.resizingActive = false;
        };

        const event = SUPPORTS_POINTER ? 'pointerdown' : 'mousedown';
        handle.addEventListener(event, startDrag);
        this._disposers.push(() => handle.removeEventListener(event, startDrag));
    }

    /**
     * Setup top bar dragging for window movement
     */
    #wireTopBarDrag() {
        this.topBar = this.#resolve(this._topBarOpt);
        if (!this.topBar) return;

        // What never starts a drag: anything you can click or type into. An
        // embedder adds its own with `noDrag`. (`.window-controls` and
        // `.panel-toggles` are kept for embedders' own markup of that shape.)
        const NO_DRAG_SELECTOR = [
            '.no-drag', 'button', 'a', 'input', 'select', 'textarea', 'label',
            '[role="button"]', '[role="menuitem"]', '[role="tab"]', '[contenteditable="true"]',
            '.twm-window-controls', '.window-controls', '.panel-toggles',
            this._noDrag,
        ].filter(Boolean).join(', ');

        let dragging = false;
        let startSX = 0, startSY = 0, startX = null, startY = null, winW = 0, winH = 0;
        let wasMax = false;
        let didRestore = false;
        let grabRatio = 0.5;
        let raf = null;
        let lastSentX = null, lastSentY = null;
        let activePointerId = null;

        // Double-click detection (native drag swallows dblclick events)
        const DBL_CLICK_TIME = 500;
        const DBL_CLICK_DIST = 4;
        let lastDownTime = 0;
        let lastDownX = 0;
        let lastDownY = 0;

        const isInteractiveTarget = (t) => !!(t && t.closest && t.closest(NO_DRAG_SELECTOR));

        const onMove = (e) => {
            // IMPORTANT: This must NOT be async to avoid race conditions on first drag
            const sx = e.screenX ?? e.clientX ?? 0;
            const sy = e.screenY ?? e.clientY ?? 0;
            const dx = Math.abs(sx - startSX);
            const dy = Math.abs(sy - startSY);

            if (!dragging) {
                if (wasMax) {
                    if ((dx + dy) <= 0) return;
                    // Handle restore from maximized state
                    if (!didRestore) {
                        didRestore = true;
                        // Fire-and-forget the restore, then reposition
                        this.win.setMaximized(false).then(() => {
                            this.#updateMaximizeIcon(false);
                            this.#setResizeHandlesEnabled(true);
                            return this.win.getBounds();
                        }).then((bounds) => {
                            if (bounds) {
                                const rw = bounds.width || 800;
                                const rh = bounds.height || 600;
                                const targetX = Math.max(0, Math.round(startSX - (rw * grabRatio)));
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
                            this.logger.warn?.('[WindowChrome] Restore on drag failed', err);
                        });
                    }
                    return; // Don't proceed with normal drag until restore completes
                } else {
                    if ((dx + dy) < DRAG_THRESHOLD) return;
                    // startX/startY should already be set by startDrag - if not, skip this move
                    if (startX == null || startY == null) {
                        return;
                    }
                }
                dragging = true;
            }

            // Use the bounds fetched in startDrag (never default to 0)
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
                } catch (e) {}
            }
            activePointerId = null;
            didRestore = false;

            if (SUPPORTS_POINTER) {
                window.removeEventListener('pointermove', onMove, true);
                window.removeEventListener('pointerup', endDrag, true);
            } else {
                window.removeEventListener('mousemove', onMove, true);
                window.removeEventListener('mouseup', endDrag, true);
            }
        };

        const startDrag = async (e) => {
            if (this.resizingActive) return;
            if (isInteractiveTarget(e.target)) return;
            if ((Date.now() - this.lastDblClickTs) < 300) return;

            // Detect double-click before entering native drag (which
            // blocks the message loop and prevents dblclick events).
            const now = Date.now();
            const cx = e.clientX ?? 0;
            const cy = e.clientY ?? 0;
            if ((now - lastDownTime) < DBL_CLICK_TIME
                && Math.abs(cx - lastDownX) < DBL_CLICK_DIST
                && Math.abs(cy - lastDownY) < DBL_CLICK_DIST) {
                lastDownTime = 0;
                this.lastDblClickTs = now;
                e.preventDefault();
                try {
                    const isMax = await this.win.setMaximized(!(await this.win.isMaximized()));
                    this.#updateMaximizeIcon(isMax);
                    this.#setResizeHandlesEnabled(!isMax);
                } catch (err) {
                    this.logger.warn?.('[WindowChrome] Double-click maximize failed', err);
                }
                return;
            }
            lastDownTime = now;
            lastDownX = cx;
            lastDownY = cy;

            try {
                if (!this.win) return;

                // ── Native drag (enables Aero Snap) ──
                // The call blocks until the OS drag loop ends (mouse-up).
                // On return the window has already moved/snapped.
                if (this.win.startNativeDrag) {
                    e.preventDefault();
                    if (await this.win.startNativeDrag()) {
                        // Sync UI state after native drag (may have snapped/maximized)
                        try {
                            const isMax = await this.win.isMaximized();
                            this.#updateMaximizeIcon(isMax);
                            this.#setResizeHandlesEnabled(!isMax);
                        } catch (_) {}
                        return;
                    }
                    // Native drag unavailable — fall through to JS drag
                }

                // ── JS drag fallback (non-Windows) ──
                startSX = e.screenX ?? e.clientX ?? 0;
                startSY = e.screenY ?? e.clientY ?? 0;

                try {
                    wasMax = await this.win.isMaximized();
                } catch (e) {
                    wasMax = false;
                }

                const barWidth = Math.max(1, window.innerWidth || document.documentElement.clientWidth);
                grabRatio = Math.min(1, Math.max(0, (e.clientX || 0) / barWidth));

                if (!wasMax) {
                    const bounds = await this.win.getBounds();
                    if (bounds) {
                        startX = typeof bounds.x === 'number' ? bounds.x : (window.screenX ?? 0);
                        startY = typeof bounds.y === 'number' ? bounds.y : (window.screenY ?? 0);
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
                    } catch (e) {}
                }

                if (SUPPORTS_POINTER) {
                    window.addEventListener('pointermove', onMove, true);
                    window.addEventListener('pointerup', endDrag, true);
                } else {
                    window.addEventListener('mousemove', onMove, true);
                    window.addEventListener('mouseup', endDrag, true);
                }
            } catch (err) {
                this.logger.warn?.('[WindowChrome] Start drag failed', err);
            }
        };

        // Block drag during resize
        const blocker = (e) => {
            if (this.resizingActive) {
                e.preventDefault();
                e.stopPropagation();
            }
        };
        this.topBar.addEventListener('mousedown', blocker, true);
        this.topBar.addEventListener('pointerdown', blocker, true);

        // Double-click to toggle maximize (only on blank surfaces)
        const dblClickHandler = async (e) => {
            // Skip maximize if double-click is on interactive elements
            if (isInteractiveTarget(e.target)) {
                return;
            }

            this.lastDblClickTs = Date.now();
            e.preventDefault();
            e.stopPropagation();
            if (this.resizingActive) return;

            try {
                const isMax = await this.win.setMaximized(!(await this.win.isMaximized()));
                this.#updateMaximizeIcon(isMax);
                this.#setResizeHandlesEnabled(!isMax);
            } catch (e) {
                this.logger.warn?.('[WindowChrome] Double-click maximize failed', e);
            }
        };
        this.topBar.addEventListener('dblclick', dblClickHandler);

        // Start drag
        const event = SUPPORTS_POINTER ? 'pointerdown' : 'mousedown';
        this.topBar.addEventListener(event, startDrag, false);

        this._disposers.push(() => {
            this.topBar.removeEventListener('mousedown', blocker, true);
            this.topBar.removeEventListener('pointerdown', blocker, true);
            this.topBar.removeEventListener('dblclick', dblClickHandler);
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
            } catch (_) {}
        };
        const handler = () => {
            // Debounce: native snap triggers multiple resize events
            clearTimeout(syncTimer);
            syncTimer = setTimeout(syncState, 80);
        };
        window.addEventListener('resize', handler);
        this._disposers.push(() => {
            window.removeEventListener('resize', handler);
            clearTimeout(syncTimer);
        });
    }

    /**
     * Wire F11 fullscreen toggle
     */
    #wireKeyboardShortcuts() {
        const handler = async (e) => {
            if (e.code === 'F11') {
                e.preventDefault();
                try {
                    const isFs = await this.win.toggleFullscreen();
                    this.#setFullscreenClass(isFs);
                    const max = await this.win.isMaximized();
                    this.#setResizeHandlesEnabled(!(isFs || max));
                } catch (e) {
                    this.logger.warn?.('[WindowChrome] F11 toggle failed', e);
                }
            }
        };
        window.addEventListener('keydown', handler, true);
        this._disposers.push(() => window.removeEventListener('keydown', handler, true));
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
            this.logger.warn?.('[WindowChrome] Initial state check failed', e);
        }
    }

    /**
     * Dispose of the controller
     */
    dispose() {
        if (this._disposed) return;
        this._disposed = true;

        this._disposers.forEach(dispose => {
            try {
                dispose();
            } catch (e) {}
        });
        this._disposers = [];

        // Remove resize handles, and the buttons this drew
        Object.values(this.handles).forEach(handle => {
            if (handle && handle.parentNode) {
                handle.parentNode.removeChild(handle);
            }
        });
        this.handles = {};
        this._createdControls?.remove();
        this._createdControls = null;
        document.body.classList.remove('twm-custom-chrome', 'twm-window-maximized', 'window-fullscreen');

        this.logger.info?.('[WindowChrome] Disposed');
    }
}
