/**
 * context_menu.js — small popup menu that matches Ecosim's `.context-menu`
 * idiom (see main_new.css line 9713 and ui/js/ui/components/data_table.js).
 *
 * Usage:
 *   showContextMenu(x, y, [
 *     { label: 'Open',   icon: 'open_in_new', action: 'open' },
 *     { separator: true },
 *     { label: 'Delete', icon: 'delete',      action: 'delete', danger: true },
 *   ], (action) => { ... });
 *
 * The menu auto-closes on outside click / scroll / Escape.
 *
 * ── It is operable by keyboard ────────────────────────────────────────
 * Items were bare `<div>`s with a click listener: no role, no tab stop, no
 * arrow-key movement, and `showContextMenu` never moved focus into the menu.
 * A consumer that opened this from Shift+F10 — the rail in Tables does — put a
 * menu on screen that the keyboard could only dismiss. Every command in it was
 * unreachable without a pointer, and nothing said so.
 *
 * So an item is a `<button role="menuitem">`, the first enabled one takes focus
 * when the menu opens, Up/Down/Home/End move between them and wrap, Enter and
 * Space activate, Escape closes, and focus returns to whatever had it before.
 * Disabled items are skipped by the arrows rather than focusable-but-inert.
 * `<button>` rather than a div with `tabindex`: the browser then gives Enter and
 * Space for free and screen readers announce it without further help.
 */

import { modalHost } from './modal.js';

let _activeMenu = null;
let _returnFocusTo = null;

export function showContextMenu(x, y, items, onAction) {
    hideContextMenu();

    // Whatever had focus when the menu opened gets it back when the menu
    // closes. Without this a keyboard user who presses Escape is returned to
    // `document.body` and has to tab back to where they were.
    _returnFocusTo = document.activeElement;

    const menu = document.createElement('div');
    menu.className = 'twm-context-menu ea-context-menu';
    menu.setAttribute('role', 'menu');

    for (const it of items) {
        if (it.separator) {
            const sep = document.createElement('div');
            sep.className = 'twm-context-menu__separator';
            sep.setAttribute('role', 'separator');
            menu.appendChild(sep);
            continue;
        }
        const row = document.createElement('button');
        row.type = 'button';
        row.setAttribute('role', 'menuitem');
        let cls = 'twm-context-menu-item';
        if (it.danger) cls += ' twm-delete-node';
        if (it.disabled) cls += ' disabled';
        row.className = cls;
        if (it.disabled) {
            row.disabled = true;
            row.setAttribute('aria-disabled', 'true');
        }
        // A DISABLED ROW WITH NO EXPLANATION IS A DEAD CONTROL. `title` was
        // accepted by callers and rendered by nothing — the item was built with
        // one, the row silently dropped it, and the user got a greyed line with
        // no way to learn why. It is the same shape as the classes this
        // repository keeps finding: no error, no throw, and invisible to every
        // test that checks the row is disabled.
        if (it.title) row.title = it.title;
        row.innerHTML = `
            <span class="material-symbols-outlined">${it.icon || ''}</span>
            <span>${escapeHtml(it.label)}</span>
        `;
        if (!it.disabled) {
            row.addEventListener('click', (e) => {
                e.stopPropagation();
                hideContextMenu();
                onAction?.(it.action);
            });
        }
        menu.appendChild(row);
    }

    // C25. THE SAME QUESTION A MODAL ASKS: which window is the user in? A
    // consumer spanning two browser windows sets the host when its focus moves;
    // null — every consumer today — is `document.body`, exactly as before. A
    // menu in the wrong window is worse than a modal in the wrong window,
    // because it is positioned at coordinates from the OTHER one.
    (modalHost() || document.body).appendChild(menu);
    menu.style.display = 'block';
    _activeMenu = menu;

    // Position with viewport clamping.
    const rect = menu.getBoundingClientRect();
    const left = Math.min(x, window.innerWidth  - rect.width  - 8);
    const top  = Math.min(y, window.innerHeight - rect.height - 8);
    menu.style.left = `${Math.max(0, left)}px`;
    menu.style.top  = `${Math.max(0, top)}px`;

    // Close on outside click / scroll / Escape.
    setTimeout(() => {
        document.addEventListener('mousedown', _outsideHandler, { once: true, capture: true });
    }, 0);
    document.addEventListener('keydown', _keyHandler);
    window.addEventListener('scroll', hideContextMenu, { once: true, capture: true });

    // Focus the first item the keyboard can actually use. `preventScroll` so a
    // menu opened near the bottom of a long page does not jump it.
    _enabledItems(menu)[0]?.focus({ preventScroll: true });
}

export function hideContextMenu() {
    if (!_activeMenu) return;
    const returnTo = _returnFocusTo;
    const held = _activeMenu.contains(document.activeElement);
    _activeMenu.remove();
    _activeMenu = null;
    _returnFocusTo = null;
    document.removeEventListener('keydown', _keyHandler);
    // Only take focus back if the menu still had it. A click elsewhere has
    // already moved focus deliberately and must not be undone.
    if (held && returnTo?.isConnected) returnTo.focus?.({ preventScroll: true });
}

function _enabledItems(menu) {
    return [...menu.querySelectorAll('.twm-context-menu-item:not(.disabled)')];
}

/** Up/Down/Home/End move; the list WRAPS, which is what a menu of four items
 *  wants and what every desktop menu does. Enter and Space are the button's
 *  own, so they are not bound here. */
function _keyHandler(e) {
    if (!_activeMenu) return;
    if (e.key === 'Escape') { e.preventDefault(); hideContextMenu(); return; }
    const items = _enabledItems(_activeMenu);
    if (items.length === 0) return;
    const at = items.indexOf(document.activeElement);
    let next = null;
    if (e.key === 'ArrowDown')      next = items[(at + 1 + items.length) % items.length];
    else if (e.key === 'ArrowUp')   next = items[(at - 1 + items.length) % items.length];
    else if (e.key === 'Home')      next = items[0];
    else if (e.key === 'End')       next = items[items.length - 1];
    if (!next) return;
    e.preventDefault();
    next.focus({ preventScroll: true });
}

function _outsideHandler(e) {
    if (_activeMenu && !_activeMenu.contains(e.target)) hideContextMenu();
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
}
