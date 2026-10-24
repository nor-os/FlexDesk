/**
 * context_menu.js — small popup menu in the `.context-menu` idiom the
 * DataTable's own right-click menu uses (./data_table.js).
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
 *
 * ── It stays inside the window (BUG-0040) ─────────────────────────────
 * The top was clamped at 0 but nothing capped the height, so a long menu ran
 * off the bottom and could not scroll. `placeMenuInViewport` caps it at the
 * window's height less a margin; it scrolls inside, the arrows scroll the
 * focused item into view, and scrolling the menu itself does not close it.
 */

import { modalHost } from './modal.js';
import { placeMenuInViewport, moveMenuFocus, focusMenuItem } from '../utils/menu_viewport.js';

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

    // Position inside the window, scrolling when taller than it (BUG-0040).
    placeMenuInViewport(menu, x, y);

    // Close on outside click / scroll / Escape. A scroll INSIDE the menu is
    // the menu being read, not the page moving under it.
    setTimeout(() => {
        document.addEventListener('mousedown', _outsideHandler, { once: true, capture: true });
    }, 0);
    document.addEventListener('keydown', _keyHandler);
    window.addEventListener('scroll', _scrollHandler, { capture: true });

    // Focus the first item the keyboard can actually use. `preventScroll` so a
    // menu opened near the bottom of a long page does not jump it.
    focusMenuItem(_enabledItems(menu)[0]);
}

export function hideContextMenu() {
    if (!_activeMenu) return;
    const returnTo = _returnFocusTo;
    const held = _activeMenu.contains(document.activeElement);
    _activeMenu.remove();
    _activeMenu = null;
    _returnFocusTo = null;
    document.removeEventListener('keydown', _keyHandler);
    window.removeEventListener('scroll', _scrollHandler, { capture: true });
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
    moveMenuFocus(e, _enabledItems(_activeMenu));
}

function _scrollHandler(e) {
    if (_activeMenu && e.target?.nodeType && _activeMenu.contains(e.target)) return;
    hideContextMenu();
}

function _outsideHandler(e) {
    if (_activeMenu && !_activeMenu.contains(e.target)) hideContextMenu();
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
}
