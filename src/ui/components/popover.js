/**
 * A POPOVER — a panel of rich content hung off the element that opened it. (0.18.0)
 *
 * `role="dialog"`, on an anchored layer (`anchored_layer.js`, which says how it is
 * placed and what closes it). Focus moves into it on open and comes back to the
 * anchor on close. Opening one from the anchor that holds an open one closes it,
 * a toggle; opening one anywhere else closes the open one, unless that one holds
 * the new anchor.
 */
import { openAnchoredLayer } from './anchored_layer.js';

/** The open popovers, to find the one an anchor holds. */
const OPEN = new Set();

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
 *          `toggled` is true when the call only CLOSED the popover its anchor held;
 *          `el` is null then.
 */
export function openPopover({ anchor, content, label = '', className = '', focus = null, align = 'start',
                              inside = null, onClose = null }) {
    for (const open of OPEN) {
        if (anchor && open.anchor === anchor) {
            open.close('toggle');
            return { el: null, close() {}, closed: Promise.resolve(), reposition() {}, toggled: true };
        }
    }

    const el = document.createElement('div');
    el.className = `twm-popover${className ? ` ${className}` : ''}`;
    el.setAttribute('role', 'dialog');
    if (label) el.setAttribute('aria-label', label);
    el.tabIndex = -1;
    el.appendChild(content);

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
    const handle = { el, anchor, closed, toggled: false, close: layer.close, reposition: layer.place };
    OPEN.add(handle);
    anchor?.classList?.add('twm-is-open');
    if (anchor && !anchor.hasAttribute?.('aria-haspopup')) anchor.setAttribute?.('aria-haspopup', 'dialog');
    anchor?.setAttribute?.('aria-expanded', 'true');
    (focus || el).focus?.({ preventScroll: true });
    return handle;
}
