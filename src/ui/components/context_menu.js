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
 */

let _activeMenu = null;

export function showContextMenu(x, y, items, onAction) {
    hideContextMenu();

    const menu = document.createElement('div');
    menu.className = 'twm-context-menu ea-context-menu';

    for (const it of items) {
        if (it.separator) {
            const sep = document.createElement('div');
            sep.className = 'twm-context-menu__separator';
            menu.appendChild(sep);
            continue;
        }
        const row = document.createElement('div');
        let cls = 'twm-context-menu-item';
        if (it.danger) cls += ' twm-delete-node';
        if (it.disabled) cls += ' disabled';
        row.className = cls;
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

    document.body.appendChild(menu);
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
    document.addEventListener('keydown', _escHandler);
    window.addEventListener('scroll', hideContextMenu, { once: true, capture: true });
}

export function hideContextMenu() {
    if (!_activeMenu) return;
    _activeMenu.remove();
    _activeMenu = null;
    document.removeEventListener('keydown', _escHandler);
}

function _outsideHandler(e) {
    if (_activeMenu && !_activeMenu.contains(e.target)) hideContextMenu();
}

function _escHandler(e) {
    if (e.key === 'Escape') hideContextMenu();
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
}
