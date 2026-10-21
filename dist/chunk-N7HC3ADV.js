// src/ui/utils/strip_scroll.js
function revealInStrip(strip, tab) {
  if (!strip || !tab) return true;
  if (!strip.isConnected || strip.clientWidth === 0) return false;
  const box = strip.getBoundingClientRect();
  const rect = tab.getBoundingClientRect();
  const scale = (strip.offsetWidth ? box.width / strip.offsetWidth : 1) || 1;
  const left = (rect.left - box.left) / scale + strip.scrollLeft;
  const right = left + rect.width / scale;
  if (left < strip.scrollLeft) strip.scrollLeft = left;
  else if (right > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = right - strip.clientWidth;
  return true;
}
function wheelStripSideways(strip, e) {
  if (!strip || e.ctrlKey || e.shiftKey) return;
  if (Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
  const room = strip.scrollWidth - strip.clientWidth;
  if (room <= 0) return;
  const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? strip.clientWidth : 1;
  const next = Math.max(0, Math.min(room, strip.scrollLeft + e.deltaY * unit));
  if (Math.abs(next - strip.scrollLeft) < 0.5) return;
  e.preventDefault();
  strip.scrollLeft = next;
}

export {
  revealInStrip,
  wheelStripSideways
};
//# sourceMappingURL=chunk-N7HC3ADV.js.map
