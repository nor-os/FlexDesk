/**
 * strip_scroll.js — the two things a sideways-scrolling strip with a hidden
 * scrollbar owes a mouse user (1.5): a plain wheel moves it, and the tab that
 * has just become active is brought into it.
 *
 * Shared by `NotebookTabBar` (`../../editor/notebook_tab_bar.js`) and
 * `createTabs` (`../components/tabs.js`). The third way in — the edges
 * scrolling while a tab is dragged toward them — is `DragReorder`'s.
 */

/**
 * Bring `tab` fully into `strip` — and ONLY the strip. Not `scrollIntoView`,
 * which scrolls every scrollable ancestor as well and would drag the tile, the
 * window or the page along with the tab.
 *
 * @returns {boolean} false when the strip is not laid out yet (detached, or
 *          zero wide), so the caller can try once more on the next frame
 */
export function revealInStrip(strip, tab) {
    if (!strip || !tab) return true;
    if (!strip.isConnected || strip.clientWidth === 0) return false;
    const box = strip.getBoundingClientRect();
    const rect = tab.getBoundingClientRect();
    // Client pixels to the strip's own: 1 unless something above it zooms.
    const scale = (strip.offsetWidth ? box.width / strip.offsetWidth : 1) || 1;
    const left = (rect.left - box.left) / scale + strip.scrollLeft;
    const right = left + rect.width / scale;
    if (left < strip.scrollLeft) strip.scrollLeft = left;
    else if (right > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = right - strip.clientWidth;
    return true;
}

/**
 * A VERTICAL WHEEL SCROLLS THE STRIP SIDEWAYS. Chromium and Firefox scroll an
 * element that overflows only horizontally with Shift+wheel or a touchpad, and
 * not with the plain wheel most people have — so with the scrollbar hidden,
 * every tab past the edge was unreachable with a mouse.
 *
 * The wheel is taken from the page only while the strip can actually move that
 * way: at either end it is left alone, so a wheel over a strip that has nothing
 * more to show still scrolls whatever is behind it. A gesture that is already
 * horizontal (a touchpad, Shift+wheel) and Ctrl+wheel (zoom) are the browser's,
 * untouched. Bind it NOT passive: it has to be able to take the wheel.
 */
export function wheelStripSideways(strip, e) {
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
