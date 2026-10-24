/**
 * menu_viewport.js — keeping a context menu inside the window (BUG-0040).
 *
 * FlexDesk draws three context menus of its own: `showContextMenu`
 * (../components/context_menu.js), the DataTable's right-click menu
 * (../components/data_table.js) and `NotebookTabBar`'s tab menu
 * (../../editor/notebook_tab_bar.js). Each placed itself with its own copy of
 * `top = min(y, innerHeight - height - 8)`, and none had a max-height. A menu
 * taller than the window then opened above its top edge (the DataTable's did
 * not clamp at all: a 101-item row menu opened at y=-2153 in a 761 px window)
 * or ran off its bottom, and nothing scrolled, so the items past the edge could
 * not be reached by any means.
 *
 * One placement now, for all three:
 *   - the menu is at most the window's height less a margin above and below,
 *     and scrolls inside when it is longer (`overflow-y: auto` in flexdesk.css);
 *   - it opens at the pointer, moved left or up just enough to fit, and never
 *     above the window's top or left edge;
 *   - keyboard movement focuses an item and scrolls it into view within the
 *     menu, so every item can be reached with the arrows.
 */

/** The gap kept between a menu and the window's edges, in px. */
export const MENU_VIEWPORT_MARGIN = 8;

/**
 * Size and place an open (displayed) menu at `(x, y)` inside its window.
 *
 * @param {HTMLElement} menu  the menu, already in the document and displayed
 * @param {number} x          client x of the pointer
 * @param {number} y          client y of the pointer
 * @param {number} [margin]   gap to the window's edges
 */
export function placeMenuInViewport(menu, x, y, margin = MENU_VIEWPORT_MARGIN) {
    const view = menu.ownerDocument?.defaultView || window;
    const vw = view.innerWidth;
    const vh = view.innerHeight;
    const maxHeight = Math.max(0, vh - 2 * margin);
    menu.style.maxHeight = `${maxHeight}px`;
    menu.scrollTop = 0;
    // flexdesk.css makes the menu `box-sizing: border-box`, so its measured
    // height (padding and border included) is at most `maxHeight`.
    const rect = menu.getBoundingClientRect();
    const left = Math.min(x, vw - rect.width - margin);
    const top = Math.min(y, vh - rect.height - margin);
    menu.style.left = `${Math.max(0, left)}px`;
    menu.style.top = `${Math.max(0, top)}px`;
}

/**
 * Focus a menu item and bring it into view inside the (scrolling) menu.
 * `preventScroll` keeps the page where it is; `block: 'nearest'` scrolls the
 * menu only as far as the item needs.
 */
export function focusMenuItem(item) {
    if (!item) return;
    item.focus({ preventScroll: true });
    item.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
}

/**
 * Up/Down/Home/End over `items` (the enabled ones), wrapping, from the one
 * that has focus. Returns true when the key moved focus (the caller's event
 * has then been `preventDefault`ed).
 *
 * @param {KeyboardEvent} e
 * @param {HTMLElement[]} items
 */
export function moveMenuFocus(e, items) {
    if (!items.length) return false;
    const at = items.indexOf(items[0].ownerDocument.activeElement);
    let next = null;
    if (e.key === 'ArrowDown')      next = items[(at + 1 + items.length) % items.length];
    else if (e.key === 'ArrowUp')   next = items[(at - 1 + items.length) % items.length];
    else if (e.key === 'Home')      next = items[0];
    else if (e.key === 'End')       next = items[items.length - 1];
    if (!next) return false;
    e.preventDefault();
    focusMenuItem(next);
    return true;
}
