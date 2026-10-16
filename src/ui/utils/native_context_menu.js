/**
 * native_context_menu.js — the browser's own right-click menu, only where it helps.
 *
 * A FlexDesk app draws its own context menus (DataTable rows and headers, tabs,
 * tiles, the top bar). Everywhere else a right-click shows the browser's or the
 * webview's menu: Back, Reload, Save as, Print, Inspect. In a desktop window
 * that makes the app look like a web page and offers moves that break it.
 *
 * This keeps the native menu where it is the useful one, editable text (Paste)
 * and selected text (Copy), and prevents it everywhere nobody else claimed the
 * right-click.
 */

/** Input types that take typed text, where Paste belongs. */
const TEXT_INPUTS = new Set(['', 'text', 'search', 'url', 'tel', 'email', 'password', 'number',
    'date', 'datetime-local', 'month', 'week', 'time']);

function isEditable(el) {
    if (!el || el.nodeType !== 1) return false;
    const tag = el.tagName;
    if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (tag === 'INPUT') return TEXT_INPUTS.has(String(el.getAttribute('type') || '').toLowerCase());
    return !!el.closest?.('[contenteditable=""],[contenteditable="true"],[contenteditable="plaintext-only"]');
}

/** A non-empty selection that the click landed inside. */
function onSelection(target, doc) {
    const sel = doc?.getSelection?.();
    if (!sel || sel.isCollapsed || !String(sel).trim()) return false;
    for (let i = 0; i < sel.rangeCount; i += 1) {
        if (sel.getRangeAt(i).intersectsNode?.(target)) return true;
    }
    return false;
}

/**
 * Prevent the native context menu wherever no handler claimed the right-click.
 *
 * Listens in the bubble phase, so every element handler runs first: one that
 * shows its own menu calls `preventDefault()`, and this leaves it alone. A
 * handler that stops propagation never reaches here at all.
 *
 * @param {object} [opts]
 * @param {EventTarget} [opts.root=document]
 * @param {(e: MouseEvent) => boolean} [opts.allow]  true keeps the native menu for that event
 * @returns {{ dispose: () => void }}
 */
export function suppressNativeContextMenu({ root, allow } = {}) {
    const r = root ?? (typeof document !== 'undefined' ? document : null);
    if (!r) return { dispose() {} };
    const onMenu = (e) => {
        if (e.defaultPrevented) return;
        const t = e.target;
        if (isEditable(t)) return;
        if (onSelection(t, t?.ownerDocument)) return;
        if (allow?.(e)) return;
        e.preventDefault();
    };
    r.addEventListener('contextmenu', onMenu);
    return { dispose() { r.removeEventListener('contextmenu', onMenu); } };
}
