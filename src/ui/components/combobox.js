/**
 * createCombobox — A TEXT BOX THAT ALSO OFFERS A LIST. (0.18.0)
 *
 * `createSelect` picks from a list; a bare `<input>` has nothing to pick from. A
 * value that may be anything but usually is one of a few known ones (a code, a
 * unit, a name) needs both at once.
 *
 * THE BOX HOLDS THE VALUE. The text in the input is what the caller gets back. An
 * option's `label` is what the LIST shows for it, and choosing a row puts the row's
 * `value` in the box. A field whose value is an opaque id with a separate name is
 * `createSelect`'s job: free text into an id is not a feature.
 *
 * THE TYPED TEXT IS REPORTED ON EVERY KEYSTROKE. In a dialog, "type a value, click
 * Save" is the normal gesture, and a control that only reports on blur is one click
 * from saving the previous value. `normalise` is therefore applied to what is
 * reported every time but rewrites the BOX only when the text is settled (on a pick,
 * Enter, Tab or blur), because rewriting an input's value moves the caret. Once, at
 * construction, a value `normalise` changed is reported as well: otherwise the box
 * shows one thing and the caller's model holds another.
 *
 * WHICH ROW ENTER TAKES. `autoHighlight` makes the first surviving row active so
 * Enter completes what was typed, and the list searches the label, the description
 * and `keywords` too. Together those have a wrong answer in them: a well-formed code
 * typed in full can be a substring of another row's description, and Enter would
 * take that row. Whether the typed text is ITSELF a well-formed value separates the
 * two cases, and only the caller knows that shape: `isCandidate`.
 *
 * ESCAPE AND ENTER ARE SWALLOWED WHILE THE LIST IS OPEN, and only then, so they
 * close the list and not the dialog around it. Closed, both bubble untouched.
 *
 * `validate` WARNS, it does not refuse: what is wrong with the settled value is said
 * under the box and the value is still reported.
 */
import { openAnchoredLayer } from './anchored_layer.js';
import { choiceSections, filterSections, shownValue } from './choice_controls.js';
import { createOptionList } from './option_list.js';

/** Ms between a keystroke and asking a function of options, by default. */
const DEBOUNCE_MS = 150;

let SEQ = 0;

/**
 * The list under a text box of your own, and everything that makes it behave: the
 * panel, the filter, async answers, the keys, `aria-*` on the box. `createCombobox`
 * and `createTagInput`'s suggestions are this.
 *
 * `options` is an array (filtered here) or `(query, { signal }) => array | Promise`,
 * which does its own filtering: it is asked after `debounce` ms; an answer that is
 * no longer the latest is dropped, and `signal` aborts when a newer one is asked for.
 *
 * Attach it BEFORE your own `keydown` listeners on the box: with a row active,
 * Enter is taken here and yours do not see it.
 *
 * @param {HTMLInputElement} input
 * @param {object} o
 * @param {Array|Function} o.options
 * @param {(option: object) => void} o.onPick  A row was chosen (normalised; the entry
 *     as you gave it is `option.source`).
 * @param {HTMLElement} [o.anchor]  What the list hangs from; else the box.
 * @param {(option: object) => boolean} [o.isCurrent]  Is this row the current value?
 * @param {boolean} [o.autoHighlight]  Make a row active as the reader types.
 * @param {(typed: string) => boolean} [o.isCandidate]  See the file's header.
 * @param {(text: string) => string} [o.normalise]  What a typed text and a row's value are compared as.
 * @param {boolean} [o.openOnFocus]  Focus opens the list.
 * @param {boolean} [o.passEnter]  Enter with no row active closes the list and is left to
 *     your listeners; by default it is swallowed.
 * @param {string} [o.loadingText]  While a function of options is answering, with no rows to show.
 * @param {string} [o.errorText]    When it failed.
 * @param {number} [o.debounce]
 * @param {string} [o.panelClassName]
 * @param {() => void} [o.onSettle]  Enter with no row active, or Tab: the text stays as typed.
 * @returns {{isOpen: boolean, open: Function, close: Function, setOptions: Function, destroy: Function}}
 */
export function attachInputOptions(input, {
    options = [], onPick, anchor = null, isCurrent = null, autoHighlight = false, isCandidate = null,
    normalise = (text) => text, openOnFocus = false, passEnter = false, loadingText = 'Loading…',
    errorText = 'Could not load the options.', debounce = DEBOUNCE_MS, panelClassName = '', onSettle = null,
} = {}) {
    let source = options;
    let layer = null;
    /** The reader wants the list open; a late answer must not open what they closed. */
    let wanted = false;
    /** `null`: opened without typing, which shows everything. A string filters. */
    let query = null;
    let asked = 0;
    let timer = null;
    let controller = null;
    /** A pick is settling: its `input.focus()` is not a reader asking for the list. */
    let picking = false;

    const list = createOptionList({
        onPick: (option) => take(option),
        onActive: (id) => {
            if (id) input.setAttribute('aria-activedescendant', id);
            else input.removeAttribute('aria-activedescendant');
        },
    });
    const panel = document.createElement('div');
    panel.className = `twm-option-panel${panelClassName ? ` ${panelClassName}` : ''}`;
    panel.appendChild(list.el);

    // Not the browser's own autofill list on top of ours.
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-controls', list.id);

    const show = () => {
        if (layer) { layer.place(); return; }
        layer = openAnchoredLayer({
            anchor: anchor || input, el: panel, gap: 4, matchWidth: true, returnFocus: false,
            onClose() {
                layer = null;
                wanted = false;
                input.setAttribute('aria-expanded', 'false');
                input.removeAttribute('aria-activedescendant');
            },
        });
        input.setAttribute('aria-expanded', 'true');
    };

    /** Whatever is being asked is no longer wanted. */
    function forget() {
        clearTimeout(timer);
        asked += 1;
        controller?.abort();
        controller = null;
    }

    function close(reason = 'closed') {
        wanted = false;
        forget();
        layer?.close(reason);
    }

    /** Which row Enter would take, when `autoHighlight` is on. See the file's header. */
    function highlight(typed) {
        const text = normalise(typed.trim());
        if (!autoHighlight || !text) { list.setActive(-1); return; }
        const exact = list.options().findIndex((o) => normalise(shownValue(o.value)) === text);
        if (exact >= 0) list.setActive(exact);
        else if (isCandidate?.(text)) list.setActive(-1);
        else list.moveToEnd(1);
    }

    function drawRows(sections) {
        if (!wanted) return;
        // NOTHING TO SUGGEST, NOTHING TO SHOW. An empty panel under the box reads as a
        // broken control; an unlisted value is fine. Still wanted: the next answer may have rows.
        if (!sections.length) {
            layer?.close('empty');
            wanted = true;
            return;
        }
        const text = query ?? '';
        list.setRows(sections, { mark: text.trim(), isCurrent });
        show();
        highlight(text);
    }

    function ask(text) {
        controller = new AbortController();
        const token = asked;
        const failed = (err) => {
            if (token !== asked) return;
            console.warn('[createCombobox] options failed', err);
            if (!wanted) return;
            list.setMessage(errorText);
            show();
        };
        let answer;
        try { answer = source(text, { signal: controller.signal }); }
        catch (err) { failed(err); return; }
        if (typeof answer?.then !== 'function') { drawRows(choiceSections(answer)); return; }
        // Rows already drawn stay until the answer, so the list does not flicker per keystroke.
        if (!list.size && wanted) { list.setMessage(loadingText); show(); }
        answer.then((rows) => { if (token === asked) drawRows(choiceSections(rows)); }, failed);
    }

    /** The list, for the current query. */
    function refresh() {
        forget();
        if (typeof source !== 'function') {
            const all = choiceSections(source);
            drawRows(query === null ? all : filterSections(all, query));
            return;
        }
        const text = query ?? '';
        if (query === null || debounce <= 0) { ask(text); return; }
        const token = asked;
        timer = setTimeout(() => { if (token === asked) ask(text); }, debounce);
    }

    function take(option) {
        close('pick');
        picking = true;
        onPick?.(option);
        picking = false;
    }

    const openFor = (text) => { query = text; wanted = true; refresh(); };

    const onInput = () => openFor(input.value);
    const onClick = () => openFor(null);
    const onFocus = () => { if (openOnFocus && !layer && !picking) openFor(input.value || null); };
    const onBlur = () => close('blur');
    const onKey = (ev) => {
        if (ev.isComposing) return;
        if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
            ev.preventDefault();
            ev.stopPropagation();
            if (!layer) openFor(null);
            list.move(ev.key === 'ArrowDown' ? 1 : -1);
            return;
        }
        if (ev.key === 'Enter') {
            if (!layer) return;                     // the dialog's Enter, untouched
            const option = list.activeOption();
            if (option) {
                ev.preventDefault();
                ev.stopImmediatePropagation();
                take(option);
                return;
            }
            close();
            if (passEnter) return;
            ev.preventDefault();
            ev.stopPropagation();
            onSettle?.();
            return;
        }
        if (ev.key === 'Tab') {
            close('blur');
            onSettle?.();
        }
    };

    input.addEventListener('input', onInput);
    input.addEventListener('click', onClick);
    input.addEventListener('focus', onFocus);
    input.addEventListener('blur', onBlur);
    input.addEventListener('keydown', onKey);

    return {
        get isOpen() { return !!layer; },
        /** Open it showing everything, or for `text`. */
        open(text = null) { openFor(text); },
        close,
        /** Replace the options; an open list redraws. */
        setOptions(next) {
            source = next;
            if (wanted) refresh();
        },
        destroy() {
            close();
            input.removeEventListener('input', onInput);
            input.removeEventListener('click', onClick);
            input.removeEventListener('focus', onFocus);
            input.removeEventListener('blur', onBlur);
            input.removeEventListener('keydown', onKey);
        },
    };
}

/**
 * @param {object} config
 * @param {Array|Function} [config.options]  What `createSelect` takes: the list is a
 *     SUGGESTION, never a constraint. Or `(query, { signal }) => array | Promise` for
 *     options found as the reader types: it filters them itself, and is asked with `''`
 *     when the list opens without typing.
 * @param {string} [config.value]
 * @param {(value: string, option: object|null) => void} [config.onChange]  On every
 *     keystroke and pick, and once at construction when `normalise` changed the value it
 *     was handed. `option` is the entry as you gave it when one was picked, else `null`.
 * @param {string} [config.className]    Extra classes on the root.
 * @param {string} [config.panelClassName]
 * @param {string} [config.placeholder]
 * @param {string} [config.title]        The input's tooltip.
 * @param {string} [config.ariaLabel]    When no `<label>` names the control.
 * @param {string} [config.name]         The input's name.
 * @param {boolean} [config.disabled]
 * @param {(text: string) => string} [config.normalise]  Upper-casing a code, say.
 * @param {boolean} [config.autoHighlight=true]  See the file's header.
 * @param {(typed: string) => boolean} [config.isCandidate]  See the file's header.
 * @param {(value: string) => string|null} [config.validate]  What is wrong with the settled value.
 * @param {string} [config.loadingText]
 * @param {string} [config.errorText]
 * @param {number} [config.debounce=150]  Ms before a function of options is asked.
 * @returns {{el: HTMLElement, input: HTMLInputElement, value: string, error: string|null,
 *            isOpen: boolean, setOptions: Function, open: Function, close: Function,
 *            focus: Function, destroy: Function}}
 */
export function createCombobox({
    options = [], value = '', onChange = null, className = '', panelClassName = '', placeholder = '', title = '',
    ariaLabel = '', name = null, disabled = false, normalise = (text) => text, autoHighlight = true, isCandidate = null,
    validate = null, loadingText, errorText, debounce,
} = {}) {
    const handed = String(value ?? '');
    let current = normalise(handed);

    const el = document.createElement('div');
    el.className = `twm-combobox${className ? ` ${className}` : ''}`;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'twm-combobox__input';
    input.spellcheck = false;
    input.value = current;
    input.disabled = !!disabled;
    if (name) input.name = name;
    if (placeholder) input.placeholder = placeholder;
    if (title) input.title = title;
    if (ariaLabel) input.setAttribute('aria-label', ariaLabel);

    const error = document.createElement('p');
    error.className = 'twm-combobox__error';
    error.hidden = true;
    error.id = `twm-combobox-error-${++SEQ}`;
    el.append(input, error);

    function report(next, option) {
        const settled = normalise(String(next ?? ''));
        if (settled === current) return;
        current = settled;
        onChange?.(current, option ?? null);
    }

    const clearValidity = () => {
        error.hidden = true;
        error.textContent = '';
        input.removeAttribute('aria-invalid');
        input.removeAttribute('aria-describedby');
    };

    /** The complaint appears when the text is settled: "too short" is noise mid-word. */
    function paintValidity() {
        const message = validate && current ? (validate(current) || null) : null;
        if (!message) { clearValidity(); return; }
        error.textContent = message;
        error.hidden = false;
        input.setAttribute('aria-invalid', 'true');
        input.setAttribute('aria-describedby', error.id);
    }

    /** Put the canonical text in the box. Only when it is settled: see the file's header. */
    function settle() {
        report(input.value, null);
        if (input.value !== current) input.value = current;
        paintValidity();
    }

    // Before the list's own listener: it marks the current value in the rows it draws.
    input.addEventListener('input', () => {
        // EVERY KEYSTROKE REACHES THE CALLER. See the file's header.
        report(input.value, null);
        clearValidity();
    });

    const menu = attachInputOptions(input, {
        options,
        autoHighlight,
        isCandidate,
        normalise,
        panelClassName,
        loadingText,
        errorText,
        debounce,
        isCurrent: (o) => normalise(shownValue(o.value)) === current,
        onSettle: settle,
        onPick(option) {
            input.value = shownValue(option.value);
            report(option.value, option.source);
            settle();
            input.focus();
            // A value set by script fires nothing; a surrounding form listens for this.
            input.dispatchEvent(new Event('change', { bubbles: true }));
        },
    });

    input.addEventListener('blur', settle);

    paintValidity();
    if (onChange && current !== handed) onChange(current, null);

    return {
        el,
        input,
        get value() { return current; },
        set value(next) {
            current = normalise(String(next ?? ''));
            input.value = current;
            paintValidity();
        },
        /** The complaint on screen, or `null`. A caller that wants to refuse Save has this. */
        get error() { return error.hidden ? null : error.textContent; },
        get isOpen() { return menu.isOpen; },
        setOptions: menu.setOptions,
        /** Open the list showing everything, or for `text`. */
        open: menu.open,
        close: () => menu.close(),
        focus() { input.focus(); },
        destroy() {
            menu.destroy();
            el.remove();
        },
    };
}
