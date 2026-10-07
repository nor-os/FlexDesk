/**
 * A STEP'S MENU (36 §6.6, the StepMenu mock) — a `role="menu"` in the kit's
 * popover: one shared shell, so it is dismissed by a press outside, closed
 * by Escape, gives the focus back to the button that opened it and never
 * outlives the editor (`closeFlowPopovers`).
 *
 *     openStepMenu({ anchor, label, items, onClose })
 *     // item: { id, label, keys?, danger?, refusal?, run?, items? }   items: a flyout (Wrap in ›)
 *     //       { separator: true }
 *
 * A REFUSED ITEM SAYS WHY IN ITS OWN LINE — "Move down — already last in the
 * loop" — disabled, skipped by the arrows, never only greyed: a greyed line
 * nobody can read the reason of is a dead control. ↑ ↓ (and Home, End) move,
 * → opens a flyout and ← closes it, Enter and Space choose, Escape closes.
 */

import { el, icon, openPopover, toneClass, uid } from '../kit/dom.js';
import { createStrings, say } from '../kit/strings.js';
import { OUTLINE_STRINGS } from './strings.js';

/**
 * @param {object} o
 * @param {HTMLElement} o.anchor
 * @param {string} o.label     the menu's accessible name (the step's name)
 * @param {object[]} o.items
 * @param {object} [o.strings]
 * @param {() => void} [o.onClose]
 * @returns {{close: () => void, el: HTMLElement}}
 */
export function openStepMenu({ anchor, label, items, strings = null, onClose = null }) {
    const S = createStrings(OUTLINE_STRINGS, strings);
    const root = el('div', 'twm-flow-outline__menu-list');
    root.setAttribute('role', 'menu');
    root.setAttribute('aria-label', label || '');
    root.id = uid('outline-menu');
    let sub = null;

    function build(list, host, depth) {
        const rows = [];
        for (const it of list) {
            if (it.separator) {
                const sep = el('div', 'twm-flow-outline__menu-sep');
                sep.setAttribute('role', 'separator');
                host.appendChild(sep);
                continue;
            }
            const b = el('button', `twm-flow-outline__menu-item${it.danger ? ' twm-flow-outline__menu-item--danger' : ''}`);
            b.type = 'button';
            b.setAttribute('role', 'menuitem');
            b.dataset.item = it.id ?? '';
            b.tabIndex = -1;
            const words = el('span', 'twm-flow-outline__menu-words');
            if (it.icon) {
                const chip = el('span', `twm-flow-outline__menu-chip ${toneClass('twm-flow-outline__menu-chip', it.tone)}`);
                chip.appendChild(icon(it.icon));
                words.appendChild(chip);
            }
            words.appendChild(el('span', 'twm-flow-outline__menu-label',
                it.refusal ? say(S, 'refusedLine', it.label, it.refusal) : it.label));
            b.appendChild(words);
            if (it.items) {
                b.setAttribute('aria-haspopup', 'menu');
                b.setAttribute('aria-expanded', 'false');
                b.appendChild(icon('chevron_right', 'twm-flow-outline__menu-key'));
            } else if (it.keys) {
                b.appendChild(el('span', 'twm-flow-outline__menu-key', it.keys));
            }
            if (it.refusal) {
                b.disabled = true;
                b.setAttribute('aria-disabled', 'true');
            }
            b.addEventListener('mousedown', (ev) => ev.preventDefault());
            b.addEventListener('click', () => {
                if (b.disabled) return;
                if (it.items) { openSub(b, it); return; }
                handle.close('chosen');
                it.run?.();
            });
            b.addEventListener('mouseenter', () => {
                if (b.disabled) return;
                if (depth === 0 && sub && sub.owner !== b) closeSub();
                b.focus({ preventScroll: true });
            });
            host.appendChild(b);
            rows.push(b);
        }
        return rows;
    }

    function enabled(container) {
        return [...container.querySelectorAll(':scope > [role="menuitem"]')].filter((b) => !b.disabled);
    }

    function openSub(owner, it) {
        if (sub?.owner === owner) { enabled(sub.el)[0]?.focus({ preventScroll: true }); return; }
        closeSub();
        const box = el('div', 'twm-flow-outline__menu-list twm-flow-outline__menu-sub');
        box.setAttribute('role', 'menu');
        box.setAttribute('aria-label', it.label);
        build(it.items, box, 1);
        owner.setAttribute('aria-expanded', 'true');
        owner.classList.add('twm-flow-outline__menu-item--open');
        owner.after(box);
        // Beside its owner, inside the menu's own box (the popover clips nothing).
        box.style.top = `${owner.offsetTop}px`;
        sub = { owner, el: box };
        enabled(box)[0]?.focus({ preventScroll: true });
    }

    function closeSub() {
        if (!sub) return;
        sub.owner.setAttribute('aria-expanded', 'false');
        sub.owner.classList.remove('twm-flow-outline__menu-item--open');
        const owner = sub.owner;
        sub.el.remove();
        sub = null;
        return owner;
    }

    build(items, root, 0);

    root.addEventListener('keydown', (ev) => {
        const inSub = sub && sub.el.contains(document.activeElement);
        const box = inSub ? sub.el : root;
        const list = enabled(box);
        const at = list.indexOf(document.activeElement);
        const go = (i) => { ev.preventDefault(); list[Math.max(0, Math.min(list.length - 1, i))]?.focus({ preventScroll: true }); };
        switch (ev.key) {
            case 'ArrowDown': go(at < 0 ? 0 : at + 1); break;
            case 'ArrowUp': go(at < 0 ? list.length - 1 : at - 1); break;
            case 'Home': go(0); break;
            case 'End': go(list.length - 1); break;
            case 'ArrowRight': {
                const b = document.activeElement;
                if (!inSub && b?.getAttribute('aria-haspopup') === 'menu' && !b.disabled) { ev.preventDefault(); b.click(); }
                break;
            }
            case 'ArrowLeft':
                if (inSub) { ev.preventDefault(); closeSub()?.focus({ preventScroll: true }); }
                break;
            case 'Escape':
                if (inSub) { ev.preventDefault(); ev.stopPropagation(); closeSub()?.focus({ preventScroll: true }); }
                break;
            case 'Tab': ev.preventDefault(); break;
            default: break;
        }
    });

    const handle = openPopover({
        anchor, content: root, label: label || '', className: 'twm-flow-popover--menu',
        focus: enabled(root)[0] || root, onClose: () => onClose?.(),
    });
    return { el: root, close: () => handle.close('closed'), toggled: handle.toggled };
}
