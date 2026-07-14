/**
 * panel_keys.js — central keyboard router for panel-local navigation.
 *
 * THE PROBLEM IT SOLVES
 * ---------------------
 * Several panels want plain-key navigation (↑/↓ to move a cursor, Enter to
 * open, single letters for actions): the landing tables, the top-nav
 * overview pages, and any future browser panel. Each one used to attach its
 * OWN `document` keydown listener gated by the heuristic
 *
 *     hostEl.contains(document.activeElement) || activeElement === <body>
 *
 * That heuristic is wrong as soon as there is more than one tile. When the
 * user selects a different tile, focus usually rests on `<body>`, so EVERY
 * mounted landing's listener still fires — the "main" panel keeps eating
 * arrow keys even though another panel is selected, and two panels can move
 * their cursors at once. The selected tile is never actually consulted.
 *
 * THE CONCEPT
 * -----------
 * One listener, one authority. Panels do not listen on `document`
 * themselves; they REGISTER a handler bound to their host element. On each
 * keydown the router asks the window manager which leaf is currently
 * focused (the single source of truth — `WindowManager.focusedLeafEl()`)
 * and dispatches the event to the handler whose host lives inside that leaf
 * — and to no one else. A panel automatically receives keys exactly when,
 * and only when, it is the selected tile.
 *
 * Content rendered OUTSIDE the tile tree (a promoted managed window or a
 * floating shell) has no focused-leaf concept; for those hosts the router
 * falls back to the focus-containment scope so they keep working.
 *
 * USAGE
 * -----
 *     import { registerPanelKeys } from './panel_keys.js';
 *     const off = registerPanelKeys(hostEl, (ev) => { ... });
 *     // later, on teardown:
 *     off();
 *
 * The handler is responsible for its own key semantics (which keys, whether
 * to skip editable targets, when to preventDefault). The router only decides
 * WHETHER this panel is the active keyboard target. A handler that calls
 * `ev.preventDefault()` stops the event from reaching any other handler in
 * the same leaf.
 *
 * When no router has been installed (unit tests, or a landing used outside
 * the WM), `registerPanelKeys` degrades to a self-contained listener using
 * the legacy focus-containment scope, so callers work in isolation too.
 */

let _router = null;

/** Install the singleton router. Called once by the WindowManager. */
export function installPanelKeyRouter(wm) {
    if (_router) _router.destroy();
    _router = new PanelKeyRouter(wm);
    return _router;
}

/** The installed router, or null if the WM hasn't built one yet. */
export function getPanelKeyRouter() { return _router; }

/** Tear down the singleton (test cleanup / shell teardown). */
export function uninstallPanelKeyRouter() {
    _router?.destroy();
    _router = null;
}

/**
 * Register `handler` as the key handler for `hostEl`'s panel. Returns an
 * unregister function — call it on teardown. Routes through the installed
 * router when present, otherwise falls back to a legacy scoped listener so
 * the panel still works outside the WM.
 */
export function registerPanelKeys(hostEl, handler) {
    if (!hostEl || typeof handler !== 'function') return () => {};
    if (_router) return _router.register(hostEl, handler);
    return _legacyRegister(hostEl, handler);
}

export class PanelKeyRouter {
    constructor(wm) {
        this._wm = wm;
        this._entries = [];                 // { hostEl, handler }
        this._onKey = this._dispatch.bind(this);
        document.addEventListener('keydown', this._onKey);
    }

    register(hostEl, handler) {
        const entry = { hostEl, handler };
        this._entries.push(entry);
        return () => {
            const i = this._entries.indexOf(entry);
            if (i >= 0) this._entries.splice(i, 1);
        };
    }

    destroy() {
        document.removeEventListener('keydown', this._onKey);
        this._entries.length = 0;
    }

    /** Is `hostEl` the panel that should receive keys right now? */
    _isActiveTarget(hostEl) {
        if (!hostEl?.isConnected) return false;
        const leaf = hostEl.closest?.('.twm-leaf');
        if (leaf) {
            // Inside the tile tree: only the focused leaf is live. This is
            // the whole point — compare against the WM's single source of
            // truth, not against `document.activeElement`.
            return leaf === this._wm?.focusedLeafEl?.();
        }
        // Outside any tile (managed window / floating shell): no focused
        // leaf to consult, so fall back to focus containment.
        return hostEl.contains(document.activeElement)
            || document.activeElement === document.body;
    }

    _dispatch(ev) {
        // Snapshot: a handler may unregister (e.g. navigate away) mid-loop.
        for (const entry of [...this._entries]) {
            if (!this._isActiveTarget(entry.hostEl)) continue;
            try { entry.handler(ev); }
            catch (err) { console.warn('[panel-keys] handler threw', err); }
            // A handler that consumed the key ends the chain so a second
            // handler in the same leaf (e.g. the action-footer shortcuts)
            // doesn't double-fire on the same press.
            if (ev.defaultPrevented) return;
        }
    }
}

/** Legacy fallback used only when no router is installed. Mirrors the old
 *  per-panel scope check so isolated/test usage keeps its previous
 *  behavior. */
function _legacyRegister(hostEl, handler) {
    const wrapped = (ev) => {
        if (!hostEl.isConnected) return;
        if (!hostEl.contains(document.activeElement)
            && document.activeElement !== document.body) return;
        handler(ev);
    };
    document.addEventListener('keydown', wrapped);
    return () => document.removeEventListener('keydown', wrapped);
}
