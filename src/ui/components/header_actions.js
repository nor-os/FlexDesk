/**
 * header_actions.js — STORY-0066. The pieces DataTable's column groups
 * (column_groups.js) and structural edits (table_structure.js) share: the
 * consumer callback called behind a guard, and the action button drawn in a
 * header cell. INTERNAL to the table, and not part of the widgets barrel.
 */

/** Call the table option `name` (a function on `config`) with `args`. An
 *  option that is not a function answers undefined; one that throws is
 *  logged and answers undefined too, so a consumer's bug never breaks a
 *  render or a click. */
export function callOption(config, name, ...args) {
    const fn = config?.[name];
    if (typeof fn !== 'function') return undefined;
    try {
        return fn.apply(config, args);
    } catch (err) {
        console.error(`[DataTable] ${name} threw`, err);
        return undefined;
    }
}

/**
 * A button in a header cell for the item `{icon?, label?, title?, disabled?}`:
 * the material-symbols icon, or the label when there is no icon; the title
 * and aria-label from `title ?? label`; disabled when `disabled`. Its press
 * is its own: neither the mousedown nor the click reaches the header (no
 * sort, no drag under it).
 */
export function headerActionButton(className, { icon, label, title, disabled } = {}, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = className;
    if (icon) {
        const span = document.createElement('span');
        span.className = 'material-symbols-outlined';
        span.textContent = String(icon);
        b.appendChild(span);
    } else if (label != null) {
        b.appendChild(document.createTextNode(String(label)));
    }
    const name = title ?? label;
    if (name != null) {
        b.title = String(name);
        b.setAttribute('aria-label', String(name));
    }
    if (disabled) b.disabled = true;
    b.addEventListener('mousedown', (ev) => ev.stopPropagation());
    b.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        onClick(ev);
    });
    return b;
}
