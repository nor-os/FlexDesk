/**
 * external_links.js — links that leave the app open in the system browser.
 *
 * In a browser tab, `target="_blank"` and `window.open()` open a new tab, which
 * is what everyone expects. In a native window (Photino, a webview) they open
 * either nothing or a bare popup with no address bar and no way back. The host
 * knows how to hand a URL to the OS (`host.shell.openExternal`); this routes
 * the page's outbound links there.
 *
 * Without a `shell` capability it changes nothing, so an app can call it
 * unconditionally at boot: in a browser tab it is a no-op.
 */

const SCHEMES = new Set(['http:', 'https:', 'mailto:']);

/** The URL as an absolute URL when it is one we would send out, else null. */
function outbound(href, base) {
    let url;
    try { url = new URL(String(href), base); } catch { return null; }
    return SCHEMES.has(url.protocol) ? url : null;
}

/**
 * Send external link clicks and `window.open` calls to `host.shell.openExternal`.
 *
 * A link goes out when it is http(s) or mailto AND it has `target="_blank"`,
 * points to another origin, or is mailto. A same-origin link without a target
 * is the app's own navigation and is left alone; a same-origin `_blank` goes
 * out too, because in a native window the alternative is a bare popup. A
 * handler that already called `preventDefault()` on the click keeps it.
 *
 * When `openExternal` resolves false (the native side refused it), the original
 * `window.open` runs instead, so the click still does something.
 *
 * @param {object} opts
 * @param {object} opts.host                  a Host; does nothing without `host.shell`
 * @param {EventTarget} [opts.root=document]  where clicks are listened for
 * @param {Window} [opts.win=window]          whose `open` is wrapped
 * @returns {{ dispose: () => void }}
 */
export function routeExternalLinks({ host, root, win } = {}) {
    const w = win ?? (typeof window !== 'undefined' ? window : null);
    const r = root ?? (typeof document !== 'undefined' ? document : null);
    const shell = host?.shell;
    if (!shell || typeof shell.openExternal !== 'function' || !w || !r) return { dispose() {} };

    const base = () => w.location?.href;
    const origin = () => { try { return new URL(base()).origin; } catch { return null; } };
    const nativeOpen = w.open;
    const fallback = (href) => { try { nativeOpen?.call(w, href, '_blank', 'noopener'); } catch { /* blocked */ } };
    const send = (href) => {
        Promise.resolve()
            .then(() => shell.openExternal(href))
            .then((opened) => { if (opened !== true) fallback(href); }, () => fallback(href));
    };

    const onClick = (e) => {
        if (e.defaultPrevented) return;
        // Left click, or a middle click (auxclick): both open a new window.
        if (e.type === 'click' ? e.button !== 0 : e.button !== 1) return;
        const a = e.target?.closest?.('a[href]');
        if (!a || a.hasAttribute('download')) return;
        const url = outbound(a.getAttribute('href'), base());
        if (!url) return;
        const leaves = url.protocol === 'mailto:'
            || (a.getAttribute('target') || '').toLowerCase() === '_blank'
            || url.origin !== origin()
            || e.button === 1;
        if (!leaves) return;
        e.preventDefault();
        send(url.href);
    };

    const routedOpen = function open(href, target, features) {
        const url = href == null ? null : outbound(href, base());
        if (url && (url.protocol === 'mailto:' || url.origin !== origin())) {
            send(url.href);
            return null;
        }
        return nativeOpen.call(w, href, target, features);
    };

    r.addEventListener('click', onClick);
    r.addEventListener('auxclick', onClick);
    w.open = routedOpen;

    return {
        dispose() {
            r.removeEventListener('click', onClick);
            r.removeEventListener('auxclick', onClick);
            if (w.open === routedOpen) w.open = nativeOpen;
        },
    };
}
