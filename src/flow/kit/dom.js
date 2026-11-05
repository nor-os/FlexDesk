/**
 * THE KIT'S SMALL DOM HELPERS, AND ITS POPOVER.
 *
 * Everything here builds elements; nothing here reads the network, storage or
 * a consumer's vocabulary. The popover, the step picker's and *Insert a value*'s
 * shell (36 §3.5, §3.7), is FlexDesk's `openPopover`, which says how it is placed,
 * dismissed and toggled and that it returns focus to its anchor: a picker that
 * drops focus on `<body>` drops it where an editor's keys never arrive. What the
 * kit adds is `closeFlowPopovers()`, which closes whichever of its own is open:
 * what an editor's `destroy()` calls so that nothing it opened outlives it.
 */

import { openPopover as openAnchoredPopover } from '../../ui/components/popover.js';

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

/** The kit's open popovers, oldest first. */
const OPEN = [];

/** Close every kit popover that is open. */
export function closeFlowPopovers() {
    OPEN[0]?.close('closed');
}

/** The open popover's element (the innermost's), or null — for a test. */
export function openFlowPopover() {
    return OPEN.length ? OPEN[OPEN.length - 1].el : null;
}

/**
 * FlexDesk's popover (`openPopover` in `ui/components/popover.js`), wearing the
 * kit's class and remembered so that an editor can close what it opened.
 *
 * @param {object} o  What `openPopover` takes.
 * @returns {{el: HTMLElement, close: (reason?: string) => void, reposition: () => void, toggled: boolean}}
 *          `toggled` is true when the call only CLOSED the popover its anchor held.
 */
export function openPopover({ className = '', onClose = null, ...rest }) {
    const handle = openAnchoredPopover({
        ...rest,
        className: `twm-flow-popover${className ? ` ${className}` : ''}`,
        onClose(reason) {
            OPEN.splice(OPEN.indexOf(handle), 1);
            onClose?.(reason);
        },
    });
    if (!handle.toggled) OPEN.push(handle);
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
