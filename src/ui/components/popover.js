/**
 * A POPOVER — a panel of rich content hung off the element that opened it. (0.18.0)
 *
 * `role="dialog"`, on an anchored layer (`anchored_layer.js`, which says how it is
 * placed and what closes it). Focus moves into it on open and comes back to the
 * anchor on close. Opening one from the anchor that holds an open one closes it,
 * a toggle; opening one anywhere else closes the open one, unless that one owns
 * the new anchor (`anchored_layer.js`).
 *
 * TAB STAYS INSIDE, cycling the panel's controls, as a modal's and a `CategoryPicker`'s
 * do. The panel is mounted at the end of the page, so past its edge lies whatever comes
 * next in the document, which is not the anchor's neighbour and, over a modal, is behind
 * it. Escape is the way out.
 */
import { openAnchoredLayer } from './anchored_layer.js';
import { collectFocusable } from '../utils/focusable.js';

/** The open popovers, to find the one an anchor holds. */
const OPEN = new Set();

/** What a call answers when nothing opened. */
const nothingOpened = (toggled) => ({ el: null, close() {}, closed: Promise.resolve(), reposition() {}, toggled });

/** Tab at the panel's edge goes round to the other edge. */
function keepTabInside(el) {
    el.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Tab' || ev.defaultPrevented) return;
        const controls = collectFocusable(el);
        if (!controls.length) { ev.preventDefault(); return; }
        const first = controls[0];
        const last = controls[controls.length - 1];
        const active = el.ownerDocument.activeElement;
        if (ev.shiftKey ? (active === first || active === el) : active === last) {
            ev.preventDefault();
            (ev.shiftKey ? last : first).focus();
        }
    });
}

/**
 * @param {object} o
 * @param {HTMLElement} o.anchor     What opened it; focus returns here.
 * @param {HTMLElement} o.content    The popover's body.
 * @param {string} [o.label]         Its accessible name.
 * @param {string} [o.className]     Extra classes on the panel.
 * @param {HTMLElement} [o.focus]    What takes focus on open; else the panel.
 * @param {'start'|'end'} [o.align]  Which anchor edge it lines up with first.
 * @param {string} [o.inside]        A selector for floating things of your own that
 *                                   are not "outside" it.
 * @param {(reason: string) => void} [o.onClose]  After it is gone.
 * @returns {{el: HTMLElement|null, close: (reason?: string) => void, closed: Promise<void>,
 *            reposition: () => void, toggled: boolean}}
 *          `el` is null when nothing opened, and `onClose` is not called for it: `toggled`
 *          is true when the call only CLOSED the popover its anchor held, false when
 *          the anchor has left the document.
 */
export function openPopover({ anchor, content, label = '', className = '', focus = null, align = 'start',
                              inside = null, onClose = null }) {
    for (const open of OPEN) {
        if (anchor && open.anchor === anchor) {
            open.close('toggle');
            return nothingOpened(true);
        }
    }

    const el = document.createElement('div');
    el.className = `twm-popover${className ? ` ${className}` : ''}`;
    el.setAttribute('role', 'dialog');
    if (label) el.setAttribute('aria-label', label);
    el.tabIndex = -1;
    el.appendChild(content);
    keepTabInside(el);

    let settle;
    const closed = new Promise((resolve) => { settle = resolve; });
    const layer = openAnchoredLayer({
        anchor, el, align, gap: 4, inside,
        onClose(reason) {
            OPEN.delete(handle);
            anchor?.classList?.remove('twm-is-open');
            anchor?.setAttribute?.('aria-expanded', 'false');
            onClose?.(reason);
            settle();
        },
    });
    if (!layer) return nothingOpened(false);
    const handle = { el, anchor, closed, toggled: false, close: layer.close, reposition: layer.place };
    OPEN.add(handle);
    anchor?.classList?.add('twm-is-open');
    if (anchor && !anchor.hasAttribute?.('aria-haspopup')) anchor.setAttribute?.('aria-haspopup', 'dialog');
    anchor?.setAttribute?.('aria-expanded', 'true');
    (focus || el).focus?.({ preventScroll: true });
    return handle;
}
