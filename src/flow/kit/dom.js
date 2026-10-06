/**
 * THE KIT'S SMALL DOM HELPERS, AND ITS ONE POPOVER.
 *
 * Everything here builds elements; nothing here reads the network, storage or
 * a consumer's vocabulary. The popover is the step picker's and *Insert a
 * value*'s shell (36 §3.5, §3.7):
 *
 *  - it is appended to FlexDesk's modal host (`modalHost()`, C25) or to
 *    `document.body` — the same question a modal and a context menu ask, so a
 *    consumer spanning two browser windows gets it in the window it set;
 *  - it is `position: fixed`, placed under its anchor (above when there is no
 *    room below) and CLAMPED to the viewport;
 *  - it is dismissed by a press outside it, by Escape, or by `close()`, and
 *    **it returns focus to its anchor** when it closes with focus inside it —
 *    a picker that drops focus on `<body>` drops it where an editor's keys
 *    never arrive — except when focus has just left it by Tab, which the
 *    pickers close it for (`'blur'`): that focus is going where it was sent;
 *  - there is ONE at a time: opening a second closes the first, and opening one
 *    from the anchor that holds the open one closes it (a toggle);
 *  - `closeFlowPopovers()` closes whichever is open, which is what an editor's
 *    `destroy()` calls so that nothing it opened outlives it.
 */

import { modalHost } from '../../ui/components/modal.js';

/** The category tones (36 §3.1, §3.12); the stylesheet maps each to tokens. */
export const TONES = Object.freeze(['violet', 'teal', 'amber', 'grey', 'blue', 'indigo']);

export function el(tag, className, text) {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
}

/** A Material Symbols glyph, hidden from assistive technology. */
export function icon(name, className = '') {
    const g = el('span', `material-symbols-outlined${className ? ` ${className}` : ''}`, name || '');
    g.setAttribute('aria-hidden', 'true');
    return g;
}

/** `block--tone`, for a known tone; `block--grey` for anything else. */
export function toneClass(block, tone) {
    return `${block}--${TONES.includes(tone) ? tone : 'grey'}`;
}

/** The tone a value names, or `grey`. */
export function toneOf(tone) {
    return TONES.includes(tone) ? tone : 'grey';
}

/**
 * FlexDesk's canonical button (`.twm-btn`). `iconOnly` keeps the label as the
 * accessible name and the tooltip, and draws only the glyph.
 */
export function button({ label, icon: glyph = null, primary = false, danger = false, iconOnly = false,
                         title = null, className = '', onClick = null, type = 'button' } = {}) {
    const b = el('button', ['twm-btn', primary ? 'twm-btn--primary' : '', danger ? 'twm-btn--danger' : '',
                            className].filter(Boolean).join(' '));
    b.type = type;
    if (glyph) b.appendChild(icon(glyph, 'twm-btn__glyph'));
    if (iconOnly) {
        b.setAttribute('aria-label', label);
        b.title = title || label;
    } else {
        b.appendChild(el('span', 'twm-btn__label', label));
        if (title) b.title = title;
    }
    if (onClick) b.addEventListener('click', onClick);
    return b;
}

let SEQ = 0;
/** A document-unique id, for `aria-activedescendant` and `aria-labelledby`:
 *  `twm-uid-<stem>-<n>` — an id, never a class name. */
export function uid(stem = 'flow') {
    SEQ += 1;
    return `twm-uid-${stem}-${SEQ}`;
}

// ── the popover ──────────────────────────────────────────────────────────

const EDGE = 8;
const GAP = 4;
let ACTIVE = null;

/** Close whichever kit popover is open. */
export function closeFlowPopovers() {
    ACTIVE?.close('closed');
}

/** The open popover's element, or null — for a test. */
export function openFlowPopover() {
    return ACTIVE ? ACTIVE.el : null;
}

/**
 * Put `content` in a popover under `anchor`.
 *
 * @param {object} o
 * @param {HTMLElement} o.anchor     what opened it; focus returns here
 * @param {HTMLElement} o.content    the popover's body
 * @param {string} o.label           its accessible name (`role="dialog"`)
 * @param {string} [o.className]     an extra block class
 * @param {(reason: string) => void} [o.onClose]  after it is gone
 * @param {HTMLElement} [o.focus]    what takes focus on open
 * @returns {{el: HTMLElement, close: (reason?: string) => void, reposition: () => void, toggled: boolean}}
 *          `toggled` is true when the call only CLOSED the popover its anchor held.
 */
export function openPopover({ anchor, content, label, className = '', onClose = null, focus = null }) {
    if (ACTIVE && anchor && ACTIVE.anchor === anchor) {
        ACTIVE.close('toggle');
        return { el: null, close() {}, reposition() {}, toggled: true };
    }
    ACTIVE?.close('replaced');

    const pop = el('div', `twm-flow-popover${className ? ` ${className}` : ''}`);
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', label || '');
    pop.tabIndex = -1;
    pop.appendChild(content);
    (modalHost() || document.body).appendChild(pop);

    let closed = false;
    const place = () => {
        if (closed) return;
        // The CLIENT width: a page scrollbar is not room to draw in.
        const view = { w: document.documentElement.clientWidth || window.innerWidth || 1024,
                       h: document.documentElement.clientHeight || window.innerHeight || 768 };
        const a = anchor?.getBoundingClientRect?.() || { left: 0, top: 0, bottom: 0, right: 0 };
        const box = pop.getBoundingClientRect();
        // Under the anchor, its left edge on the anchor's; an anchor near the
        // right edge gets the popover's RIGHT edge on its own instead.
        let left = a.left;
        if (left + box.width > view.w - EDGE && a.right - box.width >= EDGE) left = a.right - box.width;
        let top = a.bottom + GAP;
        if (top + box.height > view.h - EDGE && a.top - GAP - box.height >= EDGE) top = a.top - GAP - box.height;
        left = Math.max(EDGE, Math.min(left, view.w - box.width - EDGE));
        top = Math.max(EDGE, Math.min(top, view.h - box.height - EDGE));
        pop.style.left = `${Math.round(left)}px`;
        pop.style.top = `${Math.round(top)}px`;
    };

    const onPress = (ev) => {
        if (pop.contains(ev.target)) return;
        if (anchor && anchor.contains?.(ev.target)) return;   // the anchor's own click toggles
        handle.close('outside');
    };
    const onKey = (ev) => {
        if (ev.key !== 'Escape') return;
        ev.preventDefault();
        ev.stopPropagation();
        handle.close('escape');
    };
    const onResize = () => place();

    const handle = {
        el: pop,
        anchor,
        toggled: false,
        reposition: place,
        close(reason = 'closed') {
            if (closed) return;
            closed = true;
            const held = pop.contains(document.activeElement) || document.activeElement === document.body;
            document.removeEventListener('pointerdown', onPress, true);
            document.removeEventListener('mousedown', onPress, true);
            pop.removeEventListener('keydown', onKey);
            window.removeEventListener('resize', onResize);
            pop.remove();
            if (ACTIVE === handle) ACTIVE = null;
            // Focus that LEFT the popover (a Tab out of it) is going somewhere the
            // reader sent it; taking it back to the anchor would fight that move.
            if (held && reason !== 'blur' && anchor?.isConnected) anchor.focus?.({ preventScroll: true });
            onClose?.(reason);
        },
    };
    ACTIVE = handle;
    // The press that OPENED it is still being dispatched; listen from the next turn.
    setTimeout(() => {
        if (closed) return;
        document.addEventListener('pointerdown', onPress, true);
        document.addEventListener('mousedown', onPress, true);
    }, 0);
    pop.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    place();
    (focus || pop).focus?.({ preventScroll: true });
    return handle;
}

/**
 * The listbox walk both pickers share: the options that may be chosen, in
 * document order, and the next one from `current` by `step` (no wrap: the
 * first stays first, as a list with a search box above it should).
 */
export function nextOption(listbox, current, step) {
    const options = [...listbox.querySelectorAll('[role="option"]')]
        .filter((o) => o.getAttribute('aria-disabled') !== 'true' && !o.hidden && !o.closest('[hidden]'));
    if (!options.length) return null;
    const at = options.indexOf(current);
    if (at < 0) return step > 0 ? options[0] : options[options.length - 1];
    return options[Math.max(0, Math.min(options.length - 1, at + step))];
}
