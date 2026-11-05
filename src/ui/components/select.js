/**
 * createSelect — A SELECT DRAWN IN THE DOM. (0.18.0)
 *
 * A native `<select>` styles down to its closed box: the list is the operating
 * system's, so it cannot show a glyph or a second line, ignores the tokens and
 * opens at the system's type size. `selectBox` (`choice_controls.js`) is the
 * native one, for a list with nothing to say in a tight strip. This one is for
 * the rest: a trigger showing the current value, over a list whose rows have a
 * glyph, a second line and a hint, under group headings, with a search box and,
 * with `allowNew`, a way to type a value nobody listed.
 *
 * THE VALUE IS NEVER SILENTLY CHANGED. A value in none of the options, or naming a
 * disabled one, stays the value and is shown (a disabled option under its label,
 * any other through `notFound`): a list that arrives late or has moved on must not
 * turn it into something else on the next save. Only `null`, `undefined` and `''`
 * with no option of their own read as "nothing chosen", showing `placeholder`.
 *
 * Values keep their type, as in `choice_controls.js`; `loose` lets a stored `'2'`
 * name option `2`.
 *
 * Focus stays on the trigger unless there is a search box, which then holds it.
 * Either way the arrow keys move the highlight, named by `aria-activedescendant`,
 * and Tab closes the list and goes on from the trigger.
 */
import { openAnchoredLayer } from './anchored_layer.js';
import { fireEvent } from '../utils/fire_event.js';
import { choiceSections, filterSections, findChoice, flatChoices, shownValue } from './choice_controls.js';
import { createOptionList } from './option_list.js';

/** More options than this and a select draws a search box unless told otherwise. */
const SEARCH_ABOVE = 7;
/** Printable keys within this many ms are one word for the type-ahead. */
const TYPEAHEAD_MS = 500;

function node(tag, className, text) {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined) n.textContent = String(text);
    return n;
}

function glyphNode(className, text = '') {
    const n = node('span', `material-symbols-outlined ${className}`.trim(), text);
    n.setAttribute('aria-hidden', 'true');
    return n;
}

const isEmptyValue = (v) => v === null || v === undefined || v === '';

/**
 * @param {object} config
 * @param {Array|(() => Array)} [config.options]  Bare values, `{ value, label?, icon?,
 *     description?, hint?, keywords?, disabled?, reason? }`, or `{ group, options }`.
 *     A function is read each time the list opens and the trigger is painted, for a
 *     list that grows while the page lives.
 * @param {*} [config.value]
 * @param {(value: *, option: object|null) => void} [config.onChange]  After the reader
 *     chooses a different value. `option` is the entry as you gave it, `null` for a
 *     new value (`allowNew`). Not called for `value =` or `setOptions`.
 * @param {string} [config.className]    Extra classes on the trigger.
 * @param {string} [config.panelClassName]  Extra classes on the list's panel.
 * @param {string} [config.placeholder]  Shown while nothing is chosen.
 * @param {string} [config.title]        The trigger's tooltip; else it says the value.
 * @param {string} [config.ariaLabel]    When no `<label>` names the control.
 * @param {boolean} [config.disabled]
 * @param {boolean} [config.showIcon=true]  Draw the chosen option's glyph on the trigger too.
 * @param {boolean|{placeholder?: string}} [config.search]  The search box. By default it
 *     is there with `allowNew` or more than seven options.
 * @param {boolean} [config.allowNew]    A value in no option may be typed into the
 *     search box; it is offered as its own row at the end of the list.
 * @param {(typed: string) => string} [config.newLabel]  That row's words.
 * @param {(value: string) => string} [config.notFound]  How an unlisted value reads on the trigger.
 * @param {(typed: string) => string} [config.emptyText]  What a list with no rows says.
 * @param {boolean} [config.loose]       A stored value names an option of the same text.
 * @param {string} [config.name]         A hidden input of this name carries the value
 *     as text, for a surrounding form; it fires a bubbling `change` when the reader chooses.
 * @param {HTMLInputElement} [config.carrier]  That hidden input, yours, for a field something
 *     finds by more than a name (`[data-f]`, an id). Instead of `name`; its attributes are left as they are.
 * @param {'start'|'end'} [config.align]
 * @returns {{el: HTMLElement, input: HTMLInputElement|null, value: *, isOpen: boolean,
 *            setOptions: Function, setPlaceholder: Function, setDisabled: Function,
 *            open: Function, close: Function, focus: Function, destroy: Function}}
 *     `el` is the control to put in your layout: the trigger, or a wrapper round it
 *     and the hidden input when there is a `name` or a `carrier`.
 */
export function createSelect({
    options = [], value = null, onChange = null, className = '', panelClassName = '', placeholder = 'Choose…',
    title = '', ariaLabel = '', disabled = false, showIcon = true, search = undefined, allowNew = false,
    newLabel = (typed) => `Use “${typed}”`, notFound = (v) => v,
    emptyText = (typed) => (typed ? `Nothing matches “${typed}”.` : 'Nothing to choose from.'),
    loose = false, name = null, carrier = null, align = 'start',
} = {}) {
    let source = options;
    let current = value;
    let emptyLabel = placeholder;
    let layer = null;
    let typedKeys = '';
    let typedTimer = null;

    const given = () => (typeof source === 'function' ? source() : source) || [];

    const trigger = node('button', `twm-select${className ? ` ${className}` : ''}`);
    trigger.type = 'button';
    trigger.setAttribute('role', 'combobox');
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    if (ariaLabel) trigger.setAttribute('aria-label', ariaLabel);
    const icon = glyphNode('twm-select__icon');
    const label = node('span', 'twm-select__label');
    trigger.append(icon, label, glyphNode('twm-select__caret', 'expand_more'));

    let root = trigger;
    let hidden = carrier;
    if (name && !hidden) {
        hidden = node('input');
        hidden.type = 'hidden';
        hidden.name = name;
    }
    if (hidden) {
        root = node('div', 'twm-select-field');
        root.append(trigger, hidden);
    }

    // Whichever holds focus names the active row.
    let focusHolder = trigger;
    const list = createOptionList({
        onPick: (option) => choose(option),
        onActive: (id) => {
            if (id) focusHolder.setAttribute('aria-activedescendant', id);
            else focusHolder.removeAttribute('aria-activedescendant');
        },
    });
    trigger.setAttribute('aria-controls', list.id);

    const panel = node('div', `twm-option-panel${panelClassName ? ` ${panelClassName}` : ''}`);
    const searchRow = node('div', 'twm-option-panel__search');
    searchRow.appendChild(glyphNode('', 'search'));
    const searchInput = node('input', 'twm-option-panel__search-input');
    searchInput.type = 'text';
    searchInput.autocomplete = 'off';
    searchInput.spellcheck = false;
    searchInput.setAttribute('role', 'combobox');
    searchInput.setAttribute('aria-expanded', 'true');
    searchInput.setAttribute('aria-autocomplete', 'list');
    searchInput.setAttribute('aria-controls', list.id);
    searchRow.appendChild(searchInput);
    panel.append(searchRow, list.el);

    const hasSearch = () => (search === undefined
        ? allowNew || flatChoices(given()).length > SEARCH_ABOVE
        : !!search);

    function paint() {
        const flat = flatChoices(given());
        const chosen = findChoice(flat, current, loose);
        const none = !chosen && isEmptyValue(current);
        label.textContent = chosen ? chosen.label : none ? emptyLabel : notFound(shownValue(current));
        trigger.classList.toggle('twm-select--empty', none);
        trigger.title = title || label.textContent;
        const glyph = showIcon ? (chosen?.icon || '') : '';
        icon.textContent = glyph;
        icon.hidden = !glyph;
        if (hidden) hidden.value = isEmptyValue(current) ? '' : shownValue(current);
    }

    /** The rows for what is typed, a new-value row after them when it is offered. */
    function draw(typed) {
        const text = typed.trim();
        const all = choiceSections(given());
        const flat = all.flatMap((s) => s.items);
        const taken = (o) => [o.value, o.label].some((v) => shownValue(v).toLowerCase() === text.toLowerCase());
        const shown = filterSections(all, text);
        if (allowNew && text !== '' && !flat.some(taken)) {
            shown.push({ heading: null, items: [{ value: text, label: newLabel(text), icon: 'add', description: null,
                                                  hint: null, disabled: false, reason: null, keywords: null,
                                                  source: null }] });
        }
        const chosen = findChoice(flat, current, loose);
        if (shown.length) {
            list.setRows(shown, { mark: text, isCurrent: (o) => o === chosen });
            // On the current value when it is showing, else on the first row that may be chosen.
            const at = list.options().indexOf(chosen);
            if (at >= 0 && !chosen.disabled) list.setActive(at);
            else list.moveToEnd(1);
        } else {
            list.setMessage(emptyText(text));
        }
        layer?.place();
    }

    function choose(option) {
        const changed = !(option.value === current || (loose && String(option.value) === String(current)));
        current = option.value;
        paint();
        layer?.close('pick');
        if (!changed) return;
        if (hidden) fireEvent(hidden, 'change', { bubbles: true });
        onChange?.(current, option.source);
    }

    function open() {
        if (layer || trigger.disabled) return;
        const searching = hasSearch();
        searchRow.hidden = !searching;
        focusHolder = searching ? searchInput : trigger;
        if (searching) {
            const word = (typeof search === 'object' && search?.placeholder)
                || (allowNew ? 'Search, or type a new one…' : 'Search…');
            searchInput.placeholder = word;
            searchInput.setAttribute('aria-label', word);
            searchInput.value = '';
        }
        panel.style.width = '';
        layer = openAnchoredLayer({
            anchor: trigger, el: panel, align, gap: 4, matchWidth: true,
            onClose() {
                layer = null;
                trigger.classList.remove('twm-is-open');
                trigger.setAttribute('aria-expanded', 'false');
                focusHolder.removeAttribute('aria-activedescendant');
            },
        });
        if (!layer) return;      // the trigger is not on the page
        trigger.classList.add('twm-is-open');
        trigger.setAttribute('aria-expanded', 'true');
        // Once it is on the page: the current value has to scroll into view.
        draw('');
        if (searching) {
            // PINNED, or the panel narrows and widens under the pointer as each
            // keystroke hides or shows the longest name in it.
            const width = Math.round(panel.getBoundingClientRect().width);
            if (width > 0) panel.style.width = `${width}px`;
            searchInput.focus({ preventScroll: true });
        }
    }

    const close = () => layer?.close('closed');

    /** Printable keys on a trigger with no search box walk to the label they begin. */
    function typeAhead(ch) {
        clearTimeout(typedTimer);
        typedTimer = setTimeout(() => { typedKeys = ''; }, TYPEAHEAD_MS);
        typedKeys += ch.toLowerCase();
        const at = list.options().findIndex((o) => !o.disabled && o.label.toLowerCase().startsWith(typedKeys));
        if (at >= 0) list.setActive(at);
    }

    function onKey(ev) {
        if (ev.isComposing) return;
        const inSearch = ev.target === searchInput;
        if (!layer) {
            if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp' || ev.key === 'Enter' || ev.key === ' ') {
                ev.preventDefault();
                open();
            }
            return;
        }
        if (ev.key === 'Tab') {
            // Not taken: focus goes back to the trigger, and the Tab goes on from there.
            layer.close('tab');
            return;
        }
        if (ev.key === 'ArrowDown') list.move(1);
        else if (ev.key === 'ArrowUp') list.move(-1);
        else if (ev.key === 'Home' && !inSearch) list.moveToEnd(1);
        else if (ev.key === 'End' && !inSearch) list.moveToEnd(-1);
        else if (ev.key === 'Enter' || (ev.key === ' ' && !inSearch)) {
            const option = list.activeOption();
            if (option) choose(option);
            else if (!inSearch) close();
        } else if (!inSearch && ev.key.length === 1 && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
            typeAhead(ev.key);
        } else {
            return;
        }
        ev.preventDefault();
        ev.stopPropagation();
    }

    trigger.addEventListener('click', () => { if (layer) close(); else open(); });
    trigger.addEventListener('keydown', onKey);
    // Some browsers click a button on Space's keyup whatever its keydown did.
    trigger.addEventListener('keyup', (ev) => { if (ev.key === ' ') ev.preventDefault(); });
    searchInput.addEventListener('keydown', onKey);
    searchInput.addEventListener('input', () => draw(searchInput.value));

    function setDisabled(off) {
        trigger.disabled = !!off;
        if (off) close();
    }

    paint();
    setDisabled(disabled);

    return {
        el: root,
        /** The hidden input carrying the value, when there is one. */
        input: hidden,
        get value() { return current; },
        set value(next) { current = next; paint(); },
        get isOpen() { return !!layer; },
        /** Replace the list. Pass `nextValue` to change the value as well; left out, it stays. */
        setOptions(nextOptions, nextValue) {
            source = nextOptions;
            if (arguments.length > 1) current = nextValue;
            paint();
            if (layer) draw(searchInput.value);
        },
        /** The text shown while nothing is chosen: "Loading…", the failure, "Choose…". */
        setPlaceholder(text) { emptyLabel = text; paint(); },
        setDisabled,
        open,
        close,
        focus() { trigger.focus(); },
        /** Closes the list and takes the control off the page. */
        destroy() {
            clearTimeout(typedTimer);
            close();
            root.remove();
        },
    };
}
