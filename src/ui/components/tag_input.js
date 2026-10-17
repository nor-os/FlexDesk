/**
 * tag_input.js — A LIST OF SHORT STRINGS, drawn as removable chips followed by
 * a text box. (0.17.0)
 *
 *     ┌──────────────────────────────────────────────────┐
 *     │ [baseline ×] [stress ×] [q3 ×]  Add a tag…        │
 *     └──────────────────────────────────────────────────┘
 *
 * The text box commits what was typed — trimmed, split at commas — on Enter,
 * on a comma and when it loses focus. Empty pieces are dropped, and so is a
 * piece already in the list unless `allowDuplicates`. Backspace in an empty
 * box removes the last chip. A paste that carries a comma is split into
 * chips at once; a paste without one is ordinary text in the box.
 *
 * Every chip has a remove button with an `aria-label` (`removeLabel(tag)`,
 * "Remove <tag>" by default). `readOnly` draws the chips alone: no remove
 * buttons and no text box.
 *
 * `onChange(list)` is called with a fresh copy of the list after every change
 * the reader makes — never for `setValue`, and never for a commit that added
 * nothing.
 *
 *     const tags = createTagInput(host, {
 *         value: ['baseline'],
 *         placeholder: 'Add a tag…',
 *         onChange: (list) => save(list),
 *     });
 *     tags.getValue();          // ['baseline']
 *     tags.setValue(['a', 'b']);
 *     tags.dispose();
 */

/** The list as strings, the empty ones left out. */
const normalise = (list) => (Array.isArray(list) ? list : [])
    .map((v) => (v == null ? '' : String(v).trim()))
    .filter((v) => v !== '');

/**
 * @typedef {Object} TagInputOptions
 * @property {string[]} [value] - The tags it opens with.
 * @property {string} [placeholder] - The empty text box's placeholder.
 * @property {boolean} [readOnly] - Chips only: no remove buttons, no text box.
 * @property {boolean} [allowDuplicates] - Keep a tag that is already in the list.
 * @property {(list: string[]) => void} [onChange] - After each change the reader makes.
 * @property {string} [label] - The text box's accessible name.
 * @property {(tag: string) => string} [removeLabel] - A remove button's `aria-label`.
 * @property {string} [className] - Extra classes on the root.
 */

/**
 * @param {HTMLElement} host
 * @param {TagInputOptions} [options]
 */
export function createTagInput(host, options = {}) {
    if (!host || typeof host.appendChild !== 'function') {
        throw new Error('[TagInput] host must be an HTMLElement');
    }
    const readOnly = !!options.readOnly;
    const allowDuplicates = !!options.allowDuplicates;
    const removeLabel = typeof options.removeLabel === 'function'
        ? options.removeLabel : (tag) => `Remove ${tag}`;

    let tags = normalise(options.value);
    let disposed = false;

    const root = document.createElement('div');
    root.className = ['twm-tag-input', readOnly ? 'twm-tag-input--readonly' : '', options.className || '']
        .join(' ').replace(/\s+/g, ' ').trim();
    root.setAttribute('role', 'group');
    if (options.label) root.setAttribute('aria-label', options.label);

    const chips = document.createElement('ul');
    chips.className = 'twm-tag-input__chips';
    root.appendChild(chips);

    let input = null;
    if (!readOnly) {
        input = document.createElement('input');
        input.type = 'text';
        input.className = 'twm-tag-input__input';
        input.spellcheck = false;
        input.autocomplete = 'off';
        if (options.placeholder) input.placeholder = options.placeholder;
        if (options.label) input.setAttribute('aria-label', options.label);
        root.appendChild(input);
    }

    const changed = () => {
        if (typeof options.onChange === 'function') options.onChange([...tags]);
    };

    const paint = () => {
        chips.replaceChildren();
        tags.forEach((tag, idx) => {
            const chip = document.createElement('li');
            chip.className = 'twm-tag-input__chip';
            const text = document.createElement('span');
            text.className = 'twm-tag-input__text';
            text.textContent = tag;
            text.title = tag;
            chip.appendChild(text);
            if (!readOnly) {
                const remove = document.createElement('button');
                remove.type = 'button';
                remove.className = 'twm-tag-input__remove';
                remove.setAttribute('aria-label', removeLabel(tag));
                remove.textContent = '×';
                // The text box keeps the focus: a blur would commit its text
                // and redraw the chips under the pointer before the click.
                remove.addEventListener('mousedown', (ev) => ev.preventDefault());
                remove.addEventListener('click', (ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    removeAt(idx);
                    input?.focus();
                });
                chip.appendChild(remove);
            }
            chips.appendChild(chip);
        });
    };

    function removeAt(idx) {
        if (disposed || readOnly || idx < 0 || idx >= tags.length) return;
        tags = tags.filter((_, i) => i !== idx);
        paint();
        changed();
    }

    /** Adds the comma-separated pieces of `text`; true when any was added. */
    const commitText = (text) => {
        if (disposed || readOnly) return false;
        const next = [...tags];
        for (const piece of String(text).split(',')) {
            const tag = piece.trim();
            if (tag === '') continue;
            if (!allowDuplicates && next.includes(tag)) continue;
            next.push(tag);
        }
        if (next.length === tags.length) return false;
        tags = next;
        paint();
        changed();
        return true;
    };

    const commitInput = () => {
        if (!input) return;
        const text = input.value;
        input.value = '';
        commitText(text);
    };

    if (input) {
        input.addEventListener('keydown', (ev) => {
            if (ev.isComposing) return;
            if (ev.key === 'Enter' || ev.key === ',') {
                ev.preventDefault();
                commitInput();
            } else if (ev.key === 'Backspace' && input.value === '' && tags.length) {
                ev.preventDefault();
                removeAt(tags.length - 1);
            }
        });
        // A comma that arrives without its keydown (a soft keyboard, an IME,
        // a drop) commits all the same.
        input.addEventListener('input', () => {
            if (input.value.includes(',')) commitInput();
        });
        input.addEventListener('blur', commitInput);
        input.addEventListener('paste', (ev) => {
            const pasted = ev.clipboardData?.getData('text/plain') ?? ev.clipboardData?.getData('text') ?? '';
            if (!pasted.includes(',')) return;
            ev.preventDefault();
            const start = input.selectionStart ?? input.value.length;
            const end = input.selectionEnd ?? start;
            const text = input.value.slice(0, start) + pasted + input.value.slice(end);
            input.value = '';
            commitText(text);
        });
        root.addEventListener('mousedown', (ev) => {
            if (ev.target === root || ev.target === chips) {
                ev.preventDefault();
                input.focus();
            }
        });
    }

    paint();
    host.appendChild(root);

    return {
        element: root,
        input,
        getValue: () => [...tags],
        /** Replaces the list. Does not call `onChange`. */
        setValue(list) {
            if (disposed) return;
            tags = normalise(list);
            paint();
        },
        focus() { input?.focus(); },
        dispose() {
            if (disposed) return;
            disposed = true;
            root.remove();
        },
    };
}
