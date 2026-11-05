import {
  openAnchoredLayer
} from "./chunk-TEEYVOUH.js";

// src/ui/components/popover.js
var OPEN = /* @__PURE__ */ new Set();
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
      return { el: null, close() {
      }, closed: Promise.resolve(), reposition() {
      }, toggled: true };
    }
  }
  const el = document.createElement("div");
  el.className = `twm-popover${className ? ` ${className}` : ""}`;
  el.setAttribute("role", "dialog");
  if (label) el.setAttribute("aria-label", label);
  el.tabIndex = -1;
  el.appendChild(content);
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
//# sourceMappingURL=chunk-YGSXAKCK.js.map
