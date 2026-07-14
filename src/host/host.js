/**
 * host.js — the host port.
 *
 * The framework declares what it needs from its embedder. A Host is a bag of
 * INDEPENDENTLY OPTIONAL capability objects:
 *
 *   - absent capability  => absent key (never a stub)
 *   - present capability => must be complete (validated at boot)
 *
 * There is NO module-level default host and NO getHost(). Hosts are injected —
 * a module singleton here would just be `window.pywebview` wearing a hat, and
 * would make a second host (mock, browser tab, VS Code webview) impossible.
 *
 * Zero pywebview. Zero EcoAgent. See pywebview_host.js for the reference
 * adapter that implements this port against the pywebview / HTTP transports.
 */

export const HOST_CONTRACT = Object.freeze({
    window: Object.freeze({
        required: Object.freeze(['chrome', 'minimize', 'close', 'isMaximized', 'setMaximized',
                                 'isFullscreen', 'toggleFullscreen', 'getBounds', 'setBounds']),
        optional: Object.freeze(['startNativeDrag']),
    }),
    dialogs: Object.freeze({ required: Object.freeze(['saveFile']), optional: Object.freeze([]) }),
    state:   Object.freeze({ required: Object.freeze(['read', 'write']), optional: Object.freeze([]) }),
});

/**
 * Validate ONE capability object. We validate the capability the adapter
 * authored — a plain object literal with real closures — not the raw bridge:
 * `index.html`'s browser-mode polyfill installs a `new Proxy({}, {get})` that
 * returns a function for EVERY property name, so duck-typing the bridge is
 * vacuously true and validates nothing. A Proxy cannot forge a missing key in
 * an object literal.
 *
 * @returns {{ ok: boolean, missing: string[] }}
 */
export function validateCapability(name, cap) {
    const spec = HOST_CONTRACT[name];
    if (!spec) return { ok: false, missing: [`unknown capability '${name}'`] };
    if (!cap || typeof cap !== 'object') return { ok: false, missing: [...spec.required] };
    const missing = spec.required.filter((m) => typeof cap[m] !== 'function');
    return { ok: missing.length === 0, missing };
}

/**
 * Validate + freeze a set of capabilities into a Host.
 * Throws at boot on an incomplete capability — a half-wired host is a bug,
 * and a bug at boot beats a silent degrade at click time.
 *
 * @param {{ window?: object, dialogs?: object, state?: object }} caps
 * @returns {Readonly<object>} the Host
 */
export function createHost(caps = {}) {
    const host = {};
    for (const name of Object.keys(HOST_CONTRACT)) {
        const cap = caps[name];
        if (cap == null) continue;                       // legitimately absent
        const v = validateCapability(name, cap);
        if (!v.ok) {
            throw new Error(`Host capability '${name}' is incomplete: missing ${v.missing.join(', ')}`);
        }
        host[name] = Object.freeze(cap);
    }
    return Object.freeze(host);
}

/** The zero-capability host. Every framework consumer MUST survive it. */
export const NULL_HOST = createHost({});
