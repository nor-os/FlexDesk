import {
  modalHost
} from "./chunk-NNFTETK3.js";

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
  const rect = menu.getBoundingClientRect();
  const left = Math.min(x, window.innerWidth - rect.width - 8);
  const top = Math.min(y, window.innerHeight - rect.height - 8);
  menu.style.left = `${Math.max(0, left)}px`;
  menu.style.top = `${Math.max(0, top)}px`;
  setTimeout(() => {
    document.addEventListener("mousedown", _outsideHandler, { once: true, capture: true });
  }, 0);
  document.addEventListener("keydown", _keyHandler);
  window.addEventListener("scroll", hideContextMenu, { once: true, capture: true });
  _enabledItems(menu)[0]?.focus({ preventScroll: true });
}
function hideContextMenu() {
  if (!_activeMenu) return;
  const returnTo = _returnFocusTo;
  const held = _activeMenu.contains(document.activeElement);
  _activeMenu.remove();
  _activeMenu = null;
  _returnFocusTo = null;
  document.removeEventListener("keydown", _keyHandler);
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
  const items = _enabledItems(_activeMenu);
  if (items.length === 0) return;
  const at = items.indexOf(document.activeElement);
  let next = null;
  if (e.key === "ArrowDown") next = items[(at + 1 + items.length) % items.length];
  else if (e.key === "ArrowUp") next = items[(at - 1 + items.length) % items.length];
  else if (e.key === "Home") next = items[0];
  else if (e.key === "End") next = items[items.length - 1];
  if (!next) return;
  e.preventDefault();
  next.focus({ preventScroll: true });
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
//# sourceMappingURL=chunk-B5Q53LAJ.js.map
