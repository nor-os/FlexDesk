// src/ui/utils/modal_host.js
var host = null;
function setModalHost(el) {
  host = el || null;
}
function modalHost() {
  return host;
}

// src/ui/components/anchored_layer.js
var EDGE_MARGIN = 8;
var GAP = 8;
var NO_BOX = { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 };
function positionAnchored(anchor, panel, { align = "start", gap = GAP, margin = EDGE_MARGIN, matchWidth = false } = {}) {
  if (!panel) return;
  Object.assign(panel.style, {
    position: "fixed",
    top: "auto",
    bottom: "auto",
    left: "auto",
    right: "auto",
    maxHeight: "",
    overflowY: ""
  });
  const box = anchor?.getBoundingClientRect?.() || NO_BOX;
  if (matchWidth) panel.style.minWidth = `${Math.round(box.width)}px`;
  const size = panel.getBoundingClientRect();
  const doc = anchor?.ownerDocument || document;
  const view = doc.defaultView || window;
  const vw = doc.documentElement.clientWidth || view.innerWidth;
  const vh = doc.documentElement.clientHeight || view.innerHeight;
  const spaceBelow = vh - box.bottom - gap - margin;
  const spaceAbove = box.top - gap - margin;
  let top;
  let maxHeight;
  if (size.height <= spaceBelow) {
    top = box.bottom + gap;
    maxHeight = spaceBelow;
  } else if (size.height <= spaceAbove) {
    top = box.top - gap - size.height;
    maxHeight = spaceAbove;
  } else if (spaceBelow >= spaceAbove) {
    top = box.bottom + gap;
    maxHeight = spaceBelow;
  } else {
    maxHeight = spaceAbove;
    top = margin;
  }
  let left;
  if (align === "end") {
    left = box.right - size.width;
    if (left < margin) left = box.left;
  } else {
    left = box.left;
    if (left + size.width > vw - margin) left = box.right - size.width;
  }
  left = Math.max(margin, Math.min(left, vw - size.width - margin));
  Object.assign(panel.style, {
    position: "fixed",
    top: `${Math.round(top)}px`,
    left: `${Math.round(left)}px`,
    maxHeight: `${Math.round(maxHeight)}px`,
    overflowY: "auto"
  });
}
var FOREIGN_FLOATS = ".twm-action-dropdown-menu, .twm-category-picker, .twm-context-menu";
var FOREIGN_ESCAPE = ".twm-action-dropdown-menu:not([hidden]), .twm-category-picker:not([hidden])";
var MODAL_WINDOW = ".twm-managed-window--modal";
var LAYERS = [];
var holds = (node, target) => !!node && typeof node.contains === "function" && node.contains(target);
var modalOver = (win, anchor) => !!win && win.style.display !== "none" && !holds(win, anchor);
function openAnchoredLayer({
  anchor = null,
  el,
  align = "start",
  gap = GAP,
  matchWidth = false,
  inside = null,
  returnFocus = true,
  onClose = null
}) {
  while (LAYERS.length && !holds(LAYERS[LAYERS.length - 1].el, anchor)) LAYERS[LAYERS.length - 1].close("replaced");
  const doc = anchor?.ownerDocument || document;
  const view = doc.defaultView || window;
  (modalHost() || doc.body).appendChild(el);
  let closed = false;
  const place = () => {
    if (closed) return;
    if (anchor && anchor.isConnected === false) {
      layer.close("detached");
      return;
    }
    positionAnchored(anchor, el, { align, gap, matchWidth });
  };
  const pressedInside = (target) => {
    if (holds(el, target) || holds(anchor, target)) return true;
    for (let i = LAYERS.indexOf(layer) + 1; i < LAYERS.length; i += 1) if (holds(LAYERS[i].el, target)) return true;
    if (typeof target?.closest !== "function") return false;
    if (target.closest(FOREIGN_FLOATS) || modalOver(target.closest(MODAL_WINDOW), anchor)) return true;
    return !!inside && !!target.closest(inside);
  };
  const onPress = (ev) => {
    if (!pressedInside(ev.target)) layer.close("outside");
  };
  const onDocKey = (ev) => {
    if (!holds(el, ev.target)) onKey(ev);
  };
  const onKey = (ev) => {
    if (ev.key !== "Escape" || ev.isComposing || ev.defaultPrevented) return;
    if (LAYERS[LAYERS.length - 1] !== layer) return;
    if (doc.querySelector(FOREIGN_ESCAPE)) return;
    if ([...doc.querySelectorAll(MODAL_WINDOW)].some((w) => modalOver(w, anchor))) return;
    ev.preventDefault();
    ev.stopPropagation();
    layer.close("escape");
  };
  const onScroll = (ev) => {
    if (!holds(el, ev.target)) place();
  };
  const sized = typeof ResizeObserver === "function" ? new ResizeObserver(() => place()) : null;
  const layer = {
    el,
    anchor,
    place,
    close(reason = "closed") {
      if (closed) return;
      while (LAYERS[LAYERS.length - 1] !== layer) LAYERS[LAYERS.length - 1].close("parent");
      closed = true;
      const active = doc.activeElement;
      const held = holds(el, active) || active === doc.body;
      doc.removeEventListener("pointerdown", onPress, true);
      doc.removeEventListener("mousedown", onPress, true);
      doc.removeEventListener("keydown", onDocKey, true);
      el.removeEventListener("keydown", onKey);
      view.removeEventListener("resize", place);
      view.removeEventListener("scroll", onScroll, true);
      sized?.disconnect();
      el.remove();
      LAYERS.pop();
      if (returnFocus && held && reason !== "blur" && anchor?.isConnected) anchor.focus?.({ preventScroll: true });
      onClose?.(reason);
    }
  };
  LAYERS.push(layer);
  setTimeout(() => {
    if (closed) return;
    doc.addEventListener("pointerdown", onPress, true);
    doc.addEventListener("mousedown", onPress, true);
  }, 0);
  doc.addEventListener("keydown", onDocKey, true);
  el.addEventListener("keydown", onKey);
  view.addEventListener("resize", place);
  view.addEventListener("scroll", onScroll, true);
  sized?.observe(el);
  place();
  return layer;
}

export {
  setModalHost,
  modalHost,
  positionAnchored,
  openAnchoredLayer
};
//# sourceMappingURL=chunk-TEEYVOUH.js.map
