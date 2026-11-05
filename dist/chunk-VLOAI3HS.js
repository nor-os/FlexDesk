// src/ui/components/row_activation.js
var ROW_CONTROL_SELECTOR = [
  "button",
  "a",
  "input",
  "select",
  "textarea",
  "label",
  "summary",
  '[contenteditable=""]',
  '[contenteditable="true"]',
  "[data-twm-action]"
].join(", ");
function isRowControl(target, scope = null) {
  const hit = target?.closest?.(ROW_CONTROL_SELECTOR);
  return !!hit && (!scope || scope.contains(hit));
}
function endsTextSelection(target, scope = null) {
  const doc = target?.ownerDocument || (typeof document !== "undefined" ? document : null);
  const sel = doc?.getSelection?.();
  if (!sel || sel.isCollapsed || !String(sel)) return false;
  if (!scope) return true;
  const inside = (node) => !!node && scope.contains(node);
  return inside(sel.anchorNode) || inside(sel.focusNode);
}
function isRowActivation(ev, gesture = "click", { scope = null } = {}) {
  const target = ev?.target;
  if (!target?.closest) return false;
  if (isRowControl(target, scope)) return false;
  if (gesture === "click") {
    if ((ev.detail ?? 0) > 1) return false;
    if (endsTextSelection(target, scope)) return false;
  }
  return true;
}

export {
  ROW_CONTROL_SELECTOR,
  isRowControl,
  endsTextSelection,
  isRowActivation
};
//# sourceMappingURL=chunk-VLOAI3HS.js.map
