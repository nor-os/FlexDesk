// src/ui/utils/menu_viewport.js
var MENU_VIEWPORT_MARGIN = 8;
function placeMenuInViewport(menu, x, y, margin = MENU_VIEWPORT_MARGIN) {
  const view = menu.ownerDocument?.defaultView || window;
  const vw = view.innerWidth;
  const vh = view.innerHeight;
  const maxHeight = Math.max(0, vh - 2 * margin);
  menu.style.maxHeight = `${maxHeight}px`;
  menu.scrollTop = 0;
  const rect = menu.getBoundingClientRect();
  const left = Math.min(x, vw - rect.width - margin);
  const top = Math.min(y, vh - rect.height - margin);
  menu.style.left = `${Math.max(0, left)}px`;
  menu.style.top = `${Math.max(0, top)}px`;
}
function focusMenuItem(item) {
  if (!item) return;
  item.focus({ preventScroll: true });
  item.scrollIntoView?.({ block: "nearest", inline: "nearest" });
}
function moveMenuFocus(e, items) {
  if (!items.length) return false;
  const at = items.indexOf(items[0].ownerDocument.activeElement);
  let next = null;
  if (e.key === "ArrowDown") next = items[(at + 1 + items.length) % items.length];
  else if (e.key === "ArrowUp") next = items[(at - 1 + items.length) % items.length];
  else if (e.key === "Home") next = items[0];
  else if (e.key === "End") next = items[items.length - 1];
  if (!next) return false;
  e.preventDefault();
  focusMenuItem(next);
  return true;
}

export {
  placeMenuInViewport,
  focusMenuItem,
  moveMenuFocus
};
//# sourceMappingURL=chunk-QXAOTGCC.js.map
