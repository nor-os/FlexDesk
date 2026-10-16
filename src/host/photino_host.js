/**
 * photino_host.js — the host port over a Photino.NET window.
 *
 * Photino gives the page exactly two things: `window.external.sendMessage(text)`
 * and `window.external.receiveMessage(callback)`. Strings in, strings out, no
 * replies. This adapter puts a request/reply protocol over them, matched by id:
 *
 *   page → host   {"id": 7, "cap": "window", "op": "setBounds", "args": [{"x":0,"y":0,"width":1200,"height":800}]}
 *   host → page   {"id": 7, "ok": true,  "value": null}
 *   host → page   {"id": 8, "ok": false, "error": "no such op"}
 *   host → page   {"event": "window.maximizedChanged", "value": true}      // unsolicited, no id
 *
 * and offers the port's `window`, `dialogs` and `state` capabilities on top.
 * The C# side — one dispatcher on the window's web-message handler, every op
 * with its args and reply — is documented in `photino_host.md` beside this file.
 *
 * Like pywebview_host.js it knows the transport and NOTHING about the app: an
 * embedder that keeps some capability elsewhere (BugDesk keeps `state` on its
 * own server) passes that capability in, or `null` to leave it out.
 *
 * In a browser tab there is no `window.external.sendMessage`, and
 * createPhotinoHost() returns NULL_HOST — the fallback every FlexDesk consumer
 * already has to survive.
 */

import { createHost, NULL_HOST } from './host.js';

/** True when `ext` (default: `window.external`) is a Photino bridge. */
export function isPhotinoWindow(ext = (typeof window !== 'undefined' ? window.external : undefined)) {
    return !!ext && typeof ext.sendMessage === 'function' && typeof ext.receiveMessage === 'function';
}

/**
 * The bare request/reply layer. `call(cap, op, ...args)` sends one request and
 * resolves with the reply's `value` (`request(cap, op, args, {wait})` is the
 * same with a timeout of its own). It REJECTS when the host answers
 * `ok: false` (with the host's error) and when no reply arrives within
 * `timeoutMs`. A reply for an id nobody is waiting on, a message that is not
 * JSON, and anything that is neither a reply nor an event are dropped.
 *
 * @param {object} opts
 * @param {{sendMessage: Function, receiveMessage: Function}} opts.external
 * @param {number}  [opts.timeoutMs=10000]
 * @param {(name: string, value: any) => void} [opts.onEvent]  id-less `{event, value}` messages
 * @param {object}  [opts.logger]
 */
export function createPhotinoTransport({ external, timeoutMs = 10000, onEvent = null, logger = console }) {
    const pending = new Map();
    let seq = 0;
    external.receiveMessage((text) => {
        let m;
        try { m = typeof text === 'string' ? JSON.parse(text) : text; } catch { return; }
        if (!m || typeof m !== 'object') return;
        if (m.id == null) {
            if (typeof m.event === 'string' && onEvent) {
                try { onEvent(m.event, m.value); }
                catch (e) { logger.warn?.('[host] photino event handler failed', m.event, e); }
            }
            return;
        }
        const p = pending.get(m.id);
        if (!p) return;
        pending.delete(m.id);
        clearTimeout(p.timer);
        if (m.ok) p.resolve(m.value === undefined ? null : m.value);
        else p.reject(new Error(m.error || `${p.what}: refused by the host`));
    });
    // `wait` is this request's timeout in ms; 0 waits for as long as it takes.
    const request = (cap, op, args = [], { wait = timeoutMs } = {}) => new Promise((resolve, reject) => {
        const id = ++seq;
        const what = `${cap}.${op}`;
        const timer = wait > 0 ? setTimeout(() => {
            if (pending.delete(id)) reject(new Error(`${what}: no answer from the host within ${wait} ms`));
        }, wait) : null;
        pending.set(id, { resolve, reject, timer, what });
        try {
            external.sendMessage(JSON.stringify({ id, cap, op, args }));
        } catch (e) {
            pending.delete(id);
            clearTimeout(timer);
            reject(e);
        }
    });
    const call = (cap, op, ...args) => request(cap, op, args);
    return { call, request, pending: () => pending.size };
}

/**
 * Build a Host backed by a Photino window.
 *
 * The capability methods follow pywebview_host.js's contract, so a consumer
 * cannot tell the two apart: they DEGRADE instead of rejecting. A failed query
 * reads as false / null, a failed fire-and-forget is logged, and a save that
 * the host refused or never answered resolves `null` — the host.js meaning of
 * "unavailable", which every caller turns into a Blob download.
 *
 * @param {object} [opts]
 * @param {object} [opts.external=window.external]  the Photino bridge (a fake one in tests)
 * @param {number} [opts.timeoutMs=10000]
 * @param {(name: string, value: any) => void} [opts.onEvent]
 * @param {object} [opts.logger=console]
 * @param {'auto'|'native'|'custom'} [opts.chrome='auto']  who draws the window's
 *        title bar and borders. `auto` asks the native side once (`host.describe`,
 *        its `frame` field), the first time somebody needs to know; `native`
 *        or `custom` fixes the answer without asking. See photino_host.md.
 * @param {object|null} [opts.window]   replace the window capability, or `null` to leave it out
 * @param {object|null} [opts.dialogs]  replace the dialogs capability, or `null` to leave it out
 * @param {object|null} [opts.state]    replace the state capability, or `null` to leave it out
 * @param {object|null} [opts.shell]    replace the shell capability, or `null` to leave it out
 * @returns {Readonly<object>} a Host, or NULL_HOST outside a Photino window
 */
export function createPhotinoHost(opts = {}) {
    const {
        external = (typeof window !== 'undefined' ? window.external : undefined),
        timeoutMs = 10000,
        onEvent = null,
        logger = console,
        chrome = 'auto',
    } = opts;
    if (!isPhotinoWindow(external)) return NULL_HOST;

    const { call, request } = createPhotinoTransport({ external, timeoutMs, onEvent, logger });
    const warn = (cap, op, e) => logger.warn?.('[host] photino call failed', `${cap}.${op}`, e);
    const soft = async (fallback, cap, op, ...args) => {
        try { return await call(cap, op, ...args); }
        catch (e) { warn(cap, op, e); return fallback; }
    };
    const fire = (cap, op, ...args) => { void soft(null, cap, op, ...args); };

    // Who draws the frame. Asked once and remembered: a string once known, the
    // pending question before that. A native side that predates `frame`, or
    // doesn't answer within 3 s, has native chrome.
    let frame = chrome === 'custom' || chrome === 'native' ? chrome : null;
    let asking = null;
    const askFrame = () => {
        if (frame) return frame;
        asking ??= request('host', 'describe', [], { wait: 3000 })
            .then((d) => (d && d.frame === 'custom' ? 'custom' : 'native'), () => 'native')
            .then((f) => { frame = f; return f; });
        return asking;
    };
    // A drag or resize handed to the OS: the reply comes when the mouse is
    // released, however long that takes. Refused (a native side without the op,
    // or a window with native chrome) means "not handled": the caller does it in JS.
    const gesture = async (op, ...args) => {
        try { await request('window', op, args, { wait: 0 }); return true; }
        catch (e) { return false; }
    };

    const defaults = {
        window: {
            // 'native' (the OS draws the frame: FlexDesk's own buttons would be
            // a second set) or 'custom' (the native side made the window
            // frameless). A promise until the native side has said which.
            chrome: () => askFrame(),
            minimize: () => { fire('window', 'minimize'); },
            close: () => { fire('window', 'close'); },
            isMaximized: async () => (await soft(false, 'window', 'isMaximized')) === true,
            setMaximized: async (on) => (await soft(false, 'window', 'setMaximized', !!on)) === true,
            isFullscreen: async () => (await soft(false, 'window', 'isFullscreen')) === true,
            toggleFullscreen: async () => (await soft(false, 'window', 'toggleFullscreen')) === true,
            async getBounds() {
                const b = await soft(null, 'window', 'getBounds');
                if (!b || typeof b !== 'object') return null;
                return { x: b.x, y: b.y, width: b.width, height: b.height };
            },
            startNativeDrag: () => gesture('startDrag'),
            startNativeResize: (edge) => gesture('startResize', String(edge || '')),
            // Not async, like pywebview's: a rAF hot path during a drag; nobody awaits.
            setBounds({ x = null, y = null, width = null, height = null } = {}) {
                fire('window', 'setBounds', { x, y, width, height });
            },
        },
        dialogs: {
            // `{ok: true, path}` | `{ok: false, cancelled: true}` | `{ok: false, error}`,
            // or null when the host refused: fall back to a download. NO TIMEOUT —
            // the dialog is open for as long as the user takes, and giving up on it
            // would download the file a second time behind the dialog.
            async saveFile({ data, filename, kind } = {}) {
                let r = null;
                try { r = await request('dialogs', 'saveFile', [{ data, filename, kind }], { wait: 0 }); }
                catch (e) { warn('dialogs', 'saveFile', e); }
                return r && typeof r === 'object' ? r : null;
            },
        },
        shell: {
            // True when the native side opened it in the system browser; false
            // when it refused (a scheme it won't open, an older native side
            // without the op): the caller falls back to window.open.
            openExternal: async (url) => (await soft(false, 'shell', 'openExternal', String(url || ''))) === true,
        },
        state: {
            async read(key) {
                const v = await soft(null, 'state', 'read', key);
                if (typeof v !== 'string') return v ?? null;
                try { return JSON.parse(v); }
                catch (e) { logger.warn?.('[host] bad JSON for state key', key, e); return null; }
            },
            async write(key, value) {
                return (await soft(false, 'state', 'write', key, value)) !== false;
            },
        },
    };

    const caps = {};
    for (const name of Object.keys(defaults)) {
        if (!(name in opts)) caps[name] = defaults[name];
        else if (opts[name] != null) caps[name] = opts[name];
    }
    return createHost(caps);
}
