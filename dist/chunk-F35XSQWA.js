import {
  modalHost
} from "./chunk-BE2PU3LL.js";
import {
  focusMenuItem,
  moveMenuFocus,
  placeMenuInViewport
} from "./chunk-WUFLGETN.js";

// src/ui/components/context_menu.js
var _activeMenu = null;
var _returnFocusTo = null;
function showContextMenu(x, y, items, onAction) {
  hideContextMenu();
  _returnFocusTo = document.activeElement;
  const menu = document.createElement("div");
  menu.className = "twm-context-menu ea-context-menu";
  menu.setAttribute("role", "menu");
  for (const it of items) {
    if (it.separator) {
      const sep = document.createElement("div");
      sep.className = "twm-context-menu__separator";
      sep.setAttribute("role", "separator");
      menu.appendChild(sep);
      continue;
    }
    const row = document.createElement("button");
    row.type = "button";
    row.setAttribute("role", "menuitem");
    let cls = "twm-context-menu-item";
    if (it.danger) cls += " twm-delete-node";
    if (it.disabled) cls += " disabled";
    row.className = cls;
    if (it.disabled) {
      row.disabled = true;
      row.setAttribute("aria-disabled", "true");
    }
    if (it.title) row.title = it.title;
    row.innerHTML = `
            <span class="material-symbols-outlined">${it.icon || ""}</span>
            <span>${escapeHtml(it.label)}</span>
        `;
    if (!it.disabled) {
      row.addEventListener("click", (e) => {
        e.stopPropagation();
        hideContextMenu();
        onAction?.(it.action);
      });
    }
    menu.appendChild(row);
  }
  (modalHost() || document.body).appendChild(menu);
  menu.style.display = "block";
  _activeMenu = menu;
  placeMenuInViewport(menu, x, y);
  setTimeout(() => {
    document.addEventListener("mousedown", _outsideHandler, { once: true, capture: true });
  }, 0);
  document.addEventListener("keydown", _keyHandler);
  window.addEventListener("scroll", _scrollHandler, { capture: true });
  focusMenuItem(_enabledItems(menu)[0]);
}
function hideContextMenu() {
  if (!_activeMenu) return;
  const returnTo = _returnFocusTo;
  const held = _activeMenu.contains(document.activeElement);
  _activeMenu.remove();
  _activeMenu = null;
  _returnFocusTo = null;
  document.removeEventListener("keydown", _keyHandler);
  window.removeEventListener("scroll", _scrollHandler, { capture: true });
  if (held && returnTo?.isConnected) returnTo.focus?.({ preventScroll: true });
}
function _enabledItems(menu) {
  return [...menu.querySelectorAll(".twm-context-menu-item:not(.disabled)")];
}
function _keyHandler(e) {
  if (!_activeMenu) return;
  if (e.key === "Escape") {
    e.preventDefault();
    hideContextMenu();
    return;
  }
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
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c]);
}

export {
  showContextMenu,
  hideContextMenu
};
//# sourceMappingURL=chunk-F35XSQWA.js.map
