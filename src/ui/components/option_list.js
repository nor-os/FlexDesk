/**
 * THE ROWS `createSelect`, `createCombobox` AND `createTagInput`'s SUGGESTIONS
 * DRAW: a `role="listbox"` of options, each with a glyph, a label, a second line,
 * a hint at the end of the row and, when disabled, its reason; `{ group, options }`
 * sections under a heading; one active row that the arrow keys walk.
 *
 * Focus never comes here. The text box or trigger that holds it names the active
 * row with `aria-activedescendant` (`onActive`), and a press on a row is
 * prevented from taking focus, so that a list row can be chosen with the box
 * still holding the caret, and no blur closes the list under the pointer.
 *
 * `aria-selected` says which row IS the current value; the active row is a class.
 * They are different things in a select, where the highlight walks away from the
 * value and comes back. Every word is built with `textContent`: these lists carry
 * text users wrote.
 *
 * An internal part: not exported from `@flexdesk/widgets`.
 */

let SEQ = 0;

function node(tag, className, text) {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
}

/** `text` with the first run of `needle` in a `<mark>`, so it is plain why a row is offered. */
function marked(target, text, needle) {
    const at = needle ? text.toLowerCase().indexOf(needle.toLowerCase()) : -1;
    if (at < 0) { target.textContent = text; return; }
    target.append(text.slice(0, at), node('mark', 'twm-option-list__match', text.slice(at, at + needle.length)),
                  text.slice(at + needle.length));
}

/**
 * @param {object} o
 * @param {(option: object) => void} o.onPick   A row was clicked. Never a disabled one.
 * @param {(id: string|null) => void} [o.onActive]  The active row's id changed.
 */
export function createOptionList({ onPick, onActive = null }) {
    const id = `twm-option-list-${++SEQ}`;
    const el = node('div', 'twm-option-list');
    el.id = id;
    el.setAttribute('role', 'listbox');

    /** Every row drawn: `{ option, row }`. */
    let rows = [];
    let active = -1;

    const paintActive = () => {
        rows.forEach(({ row }, i) => row.classList.toggle('twm-option-list__row--active', i === active));
        const row = rows[active]?.row;
        // jsdom does not implement it, and a test harness is no reason to drop it.
        row?.scrollIntoView?.({ block: 'nearest' });
        onActive?.(row ? row.id : null);
    };

    const rowFor = (option, { glyphs, mark, isCurrent }) => {
        const row = node('div', 'twm-option-list__row');
        row.id = `${id}-${rows.length}`;
        row.setAttribute('role', 'option');
        row.setAttribute('aria-selected', String(!!isCurrent?.(option)));
        if (option.disabled) row.setAttribute('aria-disabled', 'true');
        row.title = option.description ? `${option.label} — ${option.description}` : option.label;
        if (glyphs) {
            const glyph = node('span', 'twm-option-list__glyph material-symbols-outlined', option.icon || '');
            glyph.setAttribute('aria-hidden', 'true');
            row.appendChild(glyph);
        }
        const words = node('span', 'twm-option-list__words');
        const label = node('span', 'twm-option-list__label');
        marked(label, option.label, mark);
        words.appendChild(label);
        if (option.description) words.appendChild(node('span', 'twm-option-list__description', option.description));
        if (option.disabled && option.reason) words.appendChild(node('span', 'twm-choice__reason', option.reason));
        row.appendChild(words);
        if (option.hint) row.appendChild(node('span', 'twm-option-list__hint', option.hint));
        return row;
    };

    const enabled = () => rows.map((r, i) => (r.option.disabled ? -1 : i)).filter((i) => i >= 0);

    // A press on the list leaves focus where it is. See the header.
    el.addEventListener('mousedown', (ev) => ev.preventDefault());
    el.addEventListener('click', (ev) => {
        const row = ev.target.closest?.('[role="option"]');
        const hit = rows.find((r) => r.row === row);
        if (hit && !hit.option.disabled) onPick(hit.option);
    });

    return {
        el,
        id,
        /**
         * Draw `sections` (`[{ heading, items }]`, as `choiceSections` gives them).
         * @param {object} [opts]
         * @param {string} [opts.mark]  The text to mark in each label.
         * @param {(option: object) => boolean} [opts.isCurrent]  Is this the current value?
         */
        setRows(sections, { mark = '', isCurrent = null } = {}) {
            rows = [];
            active = -1;
            el.replaceChildren();
            const glyphs = sections.some((s) => s.items.some((o) => o.icon));
            for (const { heading, items } of sections) {
                let parent = el;
                if (heading != null) {
                    parent = node('div', 'twm-option-list__section');
                    parent.setAttribute('role', 'group');
                    parent.setAttribute('aria-label', heading);
                    const title = node('div', 'twm-choice__group', heading);
                    title.setAttribute('aria-hidden', 'true');
                    parent.appendChild(title);
                    el.appendChild(parent);
                }
                for (const option of items) {
                    const row = rowFor(option, { glyphs, mark, isCurrent });
                    rows.push({ option, row });
                    parent.appendChild(row);
                }
            }
            paintActive();
        },
        /** One line of text in place of the rows: nothing matched, still loading, a failure. */
        setMessage(text) {
            rows = [];
            active = -1;
            el.replaceChildren(node('div', 'twm-option-list__message', text));
            paintActive();
        },
        /** How many rows are drawn. */
        get size() { return rows.length; },
        /** The drawn options, in order. */
        options: () => rows.map((r) => r.option),
        /** The active row's option, or null. */
        activeOption: () => rows[active]?.option ?? null,
        /** Make row `index` active; -1, or a row that is disabled, makes none active. */
        setActive(index) {
            active = rows[index] && !rows[index].option.disabled ? index : -1;
            paintActive();
        },
        /** The next row that may be chosen, by `step`, wrapping. From none: the first or the last. */
        move(step) {
            const stops = enabled();
            if (!stops.length) return;
            const at = stops.indexOf(active);
            const next = at < 0 ? (step > 0 ? 0 : stops.length - 1) : (at + step + stops.length) % stops.length;
            active = stops[next];
            paintActive();
        },
        /** The first (`step` 1) or last (`step` -1) row that may be chosen. */
        moveToEnd(step) {
            const stops = enabled();
            active = stops.length ? stops[step > 0 ? 0 : stops.length - 1] : -1;
            paintActive();
        },
    };
}
