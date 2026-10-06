/**
 * row_activation.js — WHEN A ROW GESTURE OPENS THE ROW. One rule, shared by
 * `DataTable`'s `onRowActivate` (0.5.0) and the landing helper
 * `attachLandingTableBehavior`, so a list built either way opens on exactly the
 * same gestures and refuses exactly the same ones.
 *
 * A row "activates" — opens the thing it stands for — on a click, a double-click
 * or Enter, as the table asks. Three things that look like a click are not one:
 *
 *  1. **A control in the row is its own gesture.** A button, a link, a field, a
 *     `[data-twm-action]` verb: pressing it does what it says, and must not ALSO
 *     open the row underneath it.
 *  2. **Dragging across a cell to copy it is not a click on the row.** A drag
 *     that ends a text selection fires `click` on the cell it ends on; the
 *     selection being non-empty is how it is told apart. Only a selection that
 *     touches the list counts — one elsewhere on the page is not this gesture.
 *  3. **The second click of a double-click opens nothing.** A double-click is
 *     two `click`s (`detail` 1, then 2) before the `dblclick`; the first one has
 *     already opened the row. A list that draws the thing it opened IN PLACE
 *     would otherwise take the second click as a click on whatever is now under
 *     the pointer. `detail` is the platform's click count, not a timing guess;
 *     a synthetic or keyboard `click` carries 0 and is a single click.
 *
 * A `dblclick` gesture skips rule 2: a double-click on text selects the word
 * under it, so a selection is the ordinary result of the gesture, not evidence
 * of a drag.
 */

/** What a press inside a row is never a ROW gesture on: a control or a verb. */
export const ROW_CONTROL_SELECTOR = [
    'button', 'a', 'input', 'select', 'textarea', 'label', 'summary',
    '[contenteditable=""]', '[contenteditable="true"]', '[data-twm-action]',
].join(', ');

/** Did this press land on a control inside the row (rule 1)? */
export function isRowControl(target, scope = null) {
    const hit = target?.closest?.(ROW_CONTROL_SELECTOR);
    return !!hit && (!scope || scope.contains(hit));
}

/** Does a non-empty text selection touch `scope` (rule 2)? Without a scope,
 *  any non-empty selection in the target's document counts. */
export function endsTextSelection(target, scope = null) {
    const doc = target?.ownerDocument || (typeof document !== 'undefined' ? document : null);
    const sel = doc?.getSelection?.();
    if (!sel || sel.isCollapsed || !String(sel)) return false;
    if (!scope) return true;
    const inside = (node) => !!node && scope.contains(node);
    return inside(sel.anchorNode) || inside(sel.focusNode);
}

/**
 * Is this event a row activation of kind `gesture`, by the three rules above?
 *
 * @param {Event} ev
 * @param {'click'|'dblclick'} [gesture='click']
 * @param {{scope?: Element}} [o]  the list's own element: a control or a
 *   selection outside it is not this list's business
 * @returns {boolean}
 */
export function isRowActivation(ev, gesture = 'click', { scope = null } = {}) {
    const target = ev?.target;
    if (!target?.closest) return false;
    if (isRowControl(target, scope)) return false;
    if (gesture === 'click') {
        if ((ev.detail ?? 0) > 1) return false;
        if (endsTextSelection(target, scope)) return false;
    }
    return true;
}
