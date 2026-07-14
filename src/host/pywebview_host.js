/**
 * pywebview_host.js — the REFERENCE host adapter.
 *
 * Knows pywebview. Knows NOTHING about EcoAgent: every domain fact (which
 * bridge ref to use, where a state key lands on disk) arrives as a parameter.
 * This is the adapter a standalone consumer copies; EcoAgent is just its first
 * caller (see ui/js/bootstrap/app_bootstrap.js).
 *
 * It speaks to whatever `window.pywebview.api` currently is — the real
 * pywebview bridge in the desktop app, or the `POST /api/<method>` Proxy
 * polyfill that ui/index.html installs in --browser mode. Both transports are
 * positional-on-the-wire, which is why setBounds() spreads its object back out
 * into positional args.
 */

import { createHost } from './host.js';

const FRAMELESS_BACKENDS = new Set(['edgechromium', 'mshtml']);

/**
 * Custom (frameless) window chrome — the min/max/close buttons, edge resize
 * handles and drag-to-move top bar — only makes sense when our top bar IS the
 * window's title bar. That holds on a native pywebview window the OS draws
 * *without* decorations of its own: Windows (frameless). On Linux/macOS the
 * window manager already draws a native title bar above our top bar, and in
 * `--browser` mode the browser supplies its own chrome — in both cases the
 * custom controls are a redundant second set, so we neither render nor wire
 * them (which also stops us swallowing native F11 fullscreen and showing dead
 * resize cursors at the window edges).
 *
 * Detection keys off the pywebview backend string, which is unambiguous: the
 * browser-mode polyfill in index.html injects only `.api`, never `.platform`,
 * so any `.platform` at all ⇒ running as a native pywebview app. The frameless
 * (custom-title-bar) backends are the Windows WebViews — 'edgechromium' /
 * 'mshtml'. Linux ('gtkwebkit2' / 'qtwebengine') and macOS ('cocoa') draw
 * native decorations, so they return false. Verified live: WebKitGTK reports
 * platform 'gtkwebkit2'.
 */
export function usesCustomWindowChrome() {
    // Authoritative signal from the Python host: run_pywebview_mode() appends
    // `?frameless=1` to the window URL exactly when it created a frameless native
    // window (Windows). Prefer it over the backend sniff below because it's
    // present at document parse — before pywebview finishes injecting
    // `window.pywebview` (and before the browser-mode polyfill, which sets `.api`
    // but no `.platform`, can clobber it). Reading the sniff at shell-build time
    // otherwise races and the whole custom chrome silently fails to render.
    try {
        if (new URLSearchParams(window.location.search).get('frameless') === '1') {
            return true;
        }
    } catch (_) { /* location unavailable (non-browser env) — fall through */ }
    const platform = window.pywebview && window.pywebview.platform;
    return !!platform && FRAMELESS_BACKENDS.has(platform);
}

/**
 * Build a Host backed by the pywebview bridge.
 *
 * @param {object}  opts
 * @param {{current: object|null}} [opts.bridgeRef]  LIVE ref to the bridge.
 *        MUST be a ref, never a snapshot: `setupHostBridgeListener` mutates
 *        `.current` when a late bridge arrives, and `resolveHostBridge` can
 *        resolve `null` after its timeout. Snapshotting the bridge here would
 *        freeze that null and reproduce as an intermittent boot failure.
 * @param {(key: string) => string} [opts.resolvePath]  logical state key ->
 *        storage path. THE domain seam: the framework only ever names keys
 *        ('desktops', 'datatable_state'); the embedder decides where they land.
 * @param {object} [opts.logger]
 */
export function createPywebviewHost({ bridgeRef = null, resolvePath = (k) => `${k}.json`, logger = console } = {}) {
    const api = () => bridgeRef?.current ?? window.pywebview?.api ?? null;

    const call = async (name, args = []) => {
        const a = api();
        if (!a || typeof a[name] !== 'function') return null;
        try { return await a[name](...args); }
        catch (e) { logger.warn?.('[host] call failed', name, e); return null; }
    };

    // Envelope unwrapping, in ONE place. Transcribed from the call sites this
    // replaces, so app.py's catch-all `{ok: true}` reply (which carries no
    // `maximized` key) still reads as false, exactly as it does today.
    const okMax = (r) => Boolean(r && r.ok && r.maximized === true);
    const okFs  = (r) => Boolean(r && r.ok && r.fullscreen);

    // ALL THREE capabilities are ALWAYS advertised. Do NOT gate them on api()
    // being non-null at construction time: the methods late-bind through the
    // ref, and gating here would permanently strand a late-arriving bridge on
    // the fallback paths (Blob download instead of the native save dialog).
    return createHost({
        window: {
            chrome: () => (usesCustomWindowChrome() ? 'custom' : 'native'),
            minimize: () => { void call('window_minimize'); },
            close:    () => { void call('window_close'); },
            isMaximized:      async () => okMax(await call('window_is_maximized')),
            setMaximized:     async (on) => okMax(await call('window_set_maximized', [on])),
            isFullscreen:     async () => okFs(await call('window_is_fullscreen')),
            toggleFullscreen: async () => okFs(await call('window_toggle_fullscreen')),
            async getBounds() {
                const r = await call('window_get_bounds');
                if (!r || !r.ok) return null;
                return { x: r.x, y: r.y, width: r.width, height: r.height };
            },
            // POSITIONAL on the wire — both transports depend on it. Not async:
            // this is a rAF hot path during a window drag/resize; nobody awaits.
            setBounds({ x = null, y = null, width = null, height = null } = {}) {
                void call('window_set_bounds', [x, y, width, height]);
            },
            startNativeDrag: async () => Boolean((await call('window_start_native_drag'))?.ok),
        },
        dialogs: {
            // Resolves to null when the transport has no save_file_dialog behind it.
            // Per host.js that is the contract for "unavailable", and every caller
            // treats it exactly like an absent `dialogs` capability: fall back to a
            // Blob download, never report a failed save. Covered by
            // tests/ui/test_host_save_fallback.mjs.
            saveFile: ({ data, filename, kind }) => call('save_file_dialog', [data, filename, kind]),
        },
        state: {
            async read(key) {
                const blob = await call('workspace_state_read', [{ path: resolvePath(key) }]);
                if (!blob) return null;
                try { return typeof blob === 'string' ? JSON.parse(blob) : blob; }
                catch (e) { logger.warn?.('[host] bad JSON for state key', key, e); return null; }
            },
            async write(key, value) {
                const r = await call('workspace_state_write',
                                     [{ path: resolvePath(key), data: JSON.stringify(value) }]);
                return r !== null;
            },
        },
    });
}
