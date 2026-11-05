import {
  collectFocusable,
  openAnchoredLayer
} from "./chunk-OPT6DQQP.js";

// src/ui/components/popover.js
var OPEN = /* @__PURE__ */ new Set();
var nothingOpened = (toggled) => ({ el: null, close() {
}, closed: Promise.resolve(), reposition() {
}, toggled });
function keepTabInside(el) {
  el.addEventListener("keydown", (ev) => {
    if (ev.key !== "Tab" || ev.defaultPrevented) return;
    const controls = collectFocusable(el);
    if (!controls.length) {
      ev.preventDefault();
      return;
    }
    const first = controls[0];
    const last = controls[controls.length - 1];
    const active = el.ownerDocument.activeElement;
    if (ev.shiftKey ? active === first || active === el : active === last) {
      ev.preventDefault();
      (ev.shiftKey ? last : first).focus();
    }
  });
}
function openPopover({
  anchor,
  content,
  label = "",
  className = "",
  focus = null,
  align = "start",
  inside = null,
  onClose = null
}) {
  for (const open of OPEN) {
    if (anchor && open.anchor === anchor) {
      open.close("toggle");
      return nothingOpened(true);
    }
  }
  const el = document.createElement("div");
  el.className = `twm-popover${className ? ` ${className}` : ""}`;
  el.setAttribute("role", "dialog");
  if (label) el.setAttribute("aria-label", label);
  el.tabIndex = -1;
  el.appendChild(content);
  keepTabInside(el);
  let settle;
  const closed = new Promise((resolve) => {
    settle = resolve;
  });
  const layer = openAnchoredLayer({
    anchor,
    el,
    align,
    gap: 4,
    inside,
    onClose(reason) {
      OPEN.delete(handle);
      anchor?.classList?.remove("twm-is-open");
      anchor?.setAttribute?.("aria-expanded", "false");
      onClose?.(reason);
      settle();
    }
  });
  if (!layer) return nothingOpened(false);
  const handle = { el, anchor, closed, toggled: false, close: layer.close, reposition: layer.place };
  OPEN.add(handle);
  anchor?.classList?.add("twm-is-open");
  if (anchor && !anchor.hasAttribute?.("aria-haspopup")) anchor.setAttribute?.("aria-haspopup", "dialog");
  anchor?.setAttribute?.("aria-expanded", "true");
  (focus || el).focus?.({ preventScroll: true });
  return handle;
}

export {
  openPopover
};
//# sourceMappingURL=chunk-P4TU6QLA.js.map
