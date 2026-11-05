/**
 * ONE WAY TO HANG A PANEL OFF AN ELEMENT. (0.18.0)
 *
 * `positionAnchored` is the placement: `ActionDropdown.position`, `CategoryPicker`,
 * a tile's menu, `openPopover`, `createSelect` and `createCombobox` all place
 * through it, so none of them has a second idea of what "below, else above,
 * inside the window" means.
 *
 * `openAnchoredLayer` is the behaviour around the placement:
 *
 *  - the panel is mounted on FlexDesk's modal host (`modalHost()`) or the anchor's
 *    `document.body`, never inside the anchor's parent, so no `overflow: hidden`
 *    ancestor clips it. It is taken off again on close: a closed layer leaves
 *    nothing behind to forget;
 *  - it is placed again when the window resizes, when anything outside it
 *    scrolls and when its own size changes; an anchor that has left the document
 *    closes it;
 *  - it closes on a press outside it and on Escape.
 *
 * LAYERS STACK, because a popover's own controls hang panels too. A select inside
 * a popover is a layer whose anchor is inside the popover; that gives every rule
 * below one answer:
 *
 *  - OPENING a layer closes every open layer that does not contain its anchor (so
 *    there is one popover at a time, and a popover's select does not close it);
 *  - A PRESS in a layer is inside every layer under it;
 *  - ESCAPE goes to the top layer alone and to nothing else, or the `ManagedWindow`
 *    around the field would close too and take a half-filled form with it. From
 *    inside the panel it is heard as it bubbles out, so that the panel's content
 *    may answer it first (a picker climbing a level); from anywhere else, on the
 *    way in;
 *  - CLOSING a layer closes the layers above it first.
 *
 * Other floating things are not layers and are named here instead: a press in an
 * `ActionDropdown` menu, a `CategoryPicker` or a context menu that a layer's
 * content opened is not "outside", and neither is a press in a modal window that
 * does not hold the anchor (a dialog the layer's content opened). Those also get
 * Escape first, while open. A consumer's own floating panel is named with
 * `inside`, a selector, or is itself opened with `openAnchoredLayer`.
 */
import { modalHost } from '../utils/modal_host.js';

/** Viewport margin in px: a placed panel stays this far from the edges. */
const EDGE_MARGIN = 8;
/** Gap between an anchor and its panel in px, unless the caller gives one. */
const GAP = 8;

const NO_BOX = { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 };

/**
 * Place `panel` against `anchor`: `position: fixed`, so no ancestor clips it;
 * under the anchor when it fits there, else above it when it fits there, else on
 * the side with more room, scrolling inside (`max-height` + `overflow-y: auto`);
 * kept `margin` inside the window. The client size is the window: a page
 * scrollbar is not room to draw in.
 *
 * @param {HTMLElement|null} anchor  Null places it at the window's top-left corner.
 * @param {HTMLElement} panel
 * @param {object} [opts]
 * @param {'start'|'end'} [opts.align='start']  Which anchor edge the panel lines up
 *     with first: `'start'` its left, `'end'` its right. Either flips to the other
 *     edge when the panel would leave the window.
 * @param {number} [opts.gap=8]      Px between the anchor and the panel.
 * @param {number} [opts.margin=8]   Px kept clear of the window's edges.
 * @param {boolean} [opts.matchWidth]  The panel is at least as wide as the anchor.
 */
export function positionAnchored(anchor, panel, { align = 'start', gap = GAP, margin = EDGE_MARGIN, matchWidth = false } = {}) {
    if (!panel) return;

    // Reset any prior inline position so natural size can be measured.
    Object.assign(panel.style, {
        position: 'fixed',
        top: 'auto',
        bottom: 'auto',
        left: 'auto',
        right: 'auto',
        maxHeight: '',
        overflowY: '',
    });

    const box = anchor?.getBoundingClientRect?.() || NO_BOX;
    if (matchWidth) panel.style.minWidth = `${Math.round(box.width)}px`;
    const size = panel.getBoundingClientRect();
    const doc = anchor?.ownerDocument || document;
    const view = doc.defaultView || window;
    const vw = doc.documentElement.clientWidth || view.innerWidth;
    const vh = doc.documentElement.clientHeight || view.innerHeight;

    // ── Vertical: prefer below, flip above if insufficient room ───────
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
        // More space below: scroll.
        top = box.bottom + gap;
        maxHeight = spaceBelow;
    } else {
        // More space above: scroll.
        maxHeight = spaceAbove;
        top = margin;
    }

    // ── Horizontal: the chosen edge, the other if off-screen, then clamped ──
    let left;
    if (align === 'end') {
        left = box.right - size.width;
        if (left < margin) left = box.left;
    } else {
        left = box.left;
        if (left + size.width > vw - margin) left = box.right - size.width;
    }
    left = Math.max(margin, Math.min(left, vw - size.width - margin));

    Object.assign(panel.style, {
        position: 'fixed',
        top: `${Math.round(top)}px`,
        left: `${Math.round(left)}px`,
        maxHeight: `${Math.round(maxHeight)}px`,
        overflowY: 'auto',
    });
}

/** What floats without being a layer. See the header. */
const FOREIGN_FLOATS = '.twm-action-dropdown-menu, .twm-category-picker, .twm-context-menu';
/** Which of those answer Escape themselves while open. */
const FOREIGN_ESCAPE = '.twm-action-dropdown-menu:not([hidden]), .twm-category-picker:not([hidden])';
const MODAL_WINDOW = '.twm-managed-window--modal';

/** The open layers, bottom first. */
const LAYERS = [];

const holds = (node, target) => !!node && typeof node.contains === 'function' && node.contains(target);

/** Is `win` a modal window over a layer on `anchor`: shown, and not holding the anchor? */
const modalOver = (win, anchor) => !!win && win.style.display !== 'none' && !holds(win, anchor);

/**
 * Open `el` as a layer against `anchor`.
 *
 * @param {object} o
 * @param {HTMLElement|null} o.anchor
 * @param {HTMLElement} o.el  The panel. Mounted here, removed on close; reusable.
 * @param {'start'|'end'} [o.align]
 * @param {number} [o.gap]
 * @param {boolean} [o.matchWidth]
 * @param {string} [o.inside]  A selector for floating things of the caller's own:
 *     a press in one is not outside this layer.
 * @param {boolean} [o.returnFocus=true]  Closed with focus inside the panel, or on
 *     nothing, focus goes back to the anchor, unless the reason is `'blur'`: focus
 *     that left is going where it was sent.
 * @param {(reason: string) => void} [o.onClose]  After it is gone. The reasons are
 *     `'outside'`, `'escape'`, `'replaced'`, `'parent'`, `'detached'`, and whatever
 *     the caller passes to `close`.
 * @returns {{el: HTMLElement, anchor: HTMLElement|null, place: () => void,
 *            close: (reason?: string) => void}}
 */
export function openAnchoredLayer({ anchor = null, el, align = 'start', gap = GAP, matchWidth = false, inside = null,
                                    returnFocus = true, onClose = null }) {
    while (LAYERS.length && !holds(LAYERS[LAYERS.length - 1].el, anchor)) LAYERS[LAYERS.length - 1].close('replaced');

    const doc = anchor?.ownerDocument || document;
    const view = doc.defaultView || window;
    (modalHost() || doc.body).appendChild(el);

    let closed = false;
    const place = () => {
        if (closed) return;
        if (anchor && anchor.isConnected === false) { layer.close('detached'); return; }
        positionAnchored(anchor, el, { align, gap, matchWidth });
    };

    const pressedInside = (target) => {
        if (holds(el, target) || holds(anchor, target)) return true;
        for (let i = LAYERS.indexOf(layer) + 1; i < LAYERS.length; i += 1) if (holds(LAYERS[i].el, target)) return true;
        if (typeof target?.closest !== 'function') return false;
        if (target.closest(FOREIGN_FLOATS) || modalOver(target.closest(MODAL_WINDOW), anchor)) return true;
        return !!inside && !!target.closest(inside);
    };
    const onPress = (ev) => { if (!pressedInside(ev.target)) layer.close('outside'); };
    const onDocKey = (ev) => { if (!holds(el, ev.target)) onKey(ev); };
    const onKey = (ev) => {
        if (ev.key !== 'Escape' || ev.isComposing || ev.defaultPrevented) return;
        if (LAYERS[LAYERS.length - 1] !== layer) return;
        if (doc.querySelector(FOREIGN_ESCAPE)) return;
        if ([...doc.querySelectorAll(MODAL_WINDOW)].some((w) => modalOver(w, anchor))) return;
        ev.preventDefault();
        ev.stopPropagation();
        layer.close('escape');
    };
    const onScroll = (ev) => { if (!holds(el, ev.target)) place(); };
    // Placed before a caller fills it, and it changes with a filter: placed again
    // whenever its size changes, or it would run past the window's edge.
    const sized = typeof ResizeObserver === 'function' ? new ResizeObserver(() => place()) : null;

    const layer = {
        el,
        anchor,
        place,
        close(reason = 'closed') {
            if (closed) return;
            while (LAYERS[LAYERS.length - 1] !== layer) LAYERS[LAYERS.length - 1].close('parent');
            closed = true;
            const active = doc.activeElement;
            const held = holds(el, active) || active === doc.body;
            doc.removeEventListener('pointerdown', onPress, true);
            doc.removeEventListener('mousedown', onPress, true);
            doc.removeEventListener('keydown', onDocKey, true);
            el.removeEventListener('keydown', onKey);
            view.removeEventListener('resize', place);
            view.removeEventListener('scroll', onScroll, true);
            sized?.disconnect();
            el.remove();
            LAYERS.pop();
            if (returnFocus && held && reason !== 'blur' && anchor?.isConnected) anchor.focus?.({ preventScroll: true });
            onClose?.(reason);
        },
    };
    LAYERS.push(layer);

    // The press that OPENED it is still being dispatched; listen from the next turn.
    setTimeout(() => {
        if (closed) return;
        doc.addEventListener('pointerdown', onPress, true);
        doc.addEventListener('mousedown', onPress, true);
    }, 0);
    doc.addEventListener('keydown', onDocKey, true);
    el.addEventListener('keydown', onKey);
    view.addEventListener('resize', place);
    view.addEventListener('scroll', onScroll, true);
    sized?.observe(el);
    place();
    return layer;
}
