/**
 * AN EDITOR'S KEYS, BOUND ON ITS ROOT AND NEVER ON `window` (36 §3.10).
 *
 *   Ctrl/⌘+Z · Ctrl/⌘+Y, Ctrl/⌘+Shift+Z   undo · redo
 *   Delete                                 remove the selection
 *   Ctrl/⌘+D · C · X · V                   duplicate · copy · cut · paste
 *   F2                                     rename
 *   Alt+↑ · Alt+↓ · Alt+←                  move up · down · out of its block
 *   ↑ ↓ ← →                                move the selection
 *   Enter                                  open the selection's settings
 *   Escape                                 close a picker, cancel a gesture
 *
 * ══ UNDO STOPS AT THE ROOT, EVEN IN A TEXT FIELD ═══════════════════════
 *
 * Ctrl+Z inside a text field is the field's own undo — the browser's default
 * action on its text, which stopping propagation leaves alone. It is STOPPED
 * all the same: another tile on the page may listen for Ctrl+Z on `window`
 * (a diagram does), and an editor split beside it would otherwise undo both.
 * A `<select>`, a checkbox or a button has no undo of its own, so Ctrl+Z there
 * is the editor's. `ownsUndo` is the one answer to "does this control undo its
 * own text": a textarea, an editable `contenteditable`, Monaco, an `<input>` of
 * a text-like type.
 *
 * Every other key inside ANY field — a select included — is the field's, and
 * Enter on a button, a link or a summary is that control's own activation.
 *
 * ══ BACKSPACE IS NEVER AN EDITOR'S KEY ═════════════════════════════════
 *
 * It belongs to the host's navigation (a page trail may climb one level on it),
 * so outside a text field an editor neither acts on Backspace nor stops it.
 * Delete removes a step.
 */

/** The `<input>` types whose text the browser can undo. */
const TEXT_INPUTS = new Set(['', 'text', 'search', 'url', 'tel', 'email', 'password', 'number']);
const EDITABLE = '[contenteditable]:not([contenteditable="false"])';

/** Does Ctrl+Z here belong to the control rather than to the editor? */
export function ownsUndo(target) {
    if (!target?.closest) return false;
    if (target.closest(`textarea, ${EDITABLE}, .monaco-editor`)) return true;
    const input = target.closest('input');
    return Boolean(input) && TEXT_INPUTS.has(String(input.getAttribute('type') || '').toLowerCase());
}

/**
 * Is `target` a control whose Enter is its own — a button, a link, a summary?
 * An editor's own item (a row, a card, a node) marks itself
 * `data-twm-flow-item`, and Enter there opens its settings.
 */
export function isOwnControl(target) {
    const c = target?.closest?.('button, a[href], summary, [role="button"], [role="menuitem"], '
                                + '[role="option"], [role="tab"], [role="radio"], [role="checkbox"]');
    return Boolean(c) && !c.closest('[data-twm-flow-item]');
}

/** Is `target` inside a field, whose keys are its own? */
export function isTextField(target) {
    return Boolean(target?.closest?.(`input, textarea, select, ${EDITABLE}, .monaco-editor`));
}

/**
 * Bind the editor keys on `root`. Each handler is optional; a key whose
 * handler is absent is not handled (nothing is prevented). A handler that
 * returns `false` declines the key and it goes on as if unbound.
 *
 * @param {HTMLElement} root
 * @param {object} handlers  undo, redo, remove, duplicate, copy, cut, paste,
 *        rename, moveUp, moveDown, moveOut, up, down, left, right, open, escape
 * @returns {() => void} unbind
 */
export function bindFlowKeys(root, handlers = {}) {
    const run = (name, ev) => {
        const h = handlers[name];
        if (typeof h !== 'function') return false;
        if (h(ev) === false) return false;
        ev.preventDefault();
        return true;
    };

    const onKey = (ev) => {
        if (ev.isComposing || ev.keyCode === 229) return;
        const mod = (ev.ctrlKey || ev.metaKey) && !ev.altKey;
        const k = String(ev.key || '');
        const lower = k.toLowerCase();

        if (mod && (lower === 'z' || lower === 'y')) {
            // HERE AND NO FURTHER, wherever in the editor it was pressed.
            ev.stopPropagation();
            if (ownsUndo(ev.target)) return;
            run(lower === 'y' || ev.shiftKey ? 'redo' : 'undo', ev);
            return;
        }
        if (k === 'Backspace') return;
        if (isTextField(ev.target)) return;
        if (ev.defaultPrevented) return;

        if (mod && !ev.shiftKey) {
            if (lower === 'd') { run('duplicate', ev); return; }
            if (lower === 'c') { run('copy', ev); return; }
            if (lower === 'x') { run('cut', ev); return; }
            if (lower === 'v') { run('paste', ev); return; }
            return;
        }
        if (ev.altKey && !ev.ctrlKey && !ev.metaKey) {
            if (k === 'ArrowUp') run('moveUp', ev);
            else if (k === 'ArrowDown') run('moveDown', ev);
            else if (k === 'ArrowLeft') run('moveOut', ev);
            return;
        }
        if (ev.ctrlKey || ev.metaKey) return;
        switch (k) {
            case 'Delete': run('remove', ev); break;
            case 'F2': run('rename', ev); break;
            case 'ArrowUp': run('up', ev); break;
            case 'ArrowDown': run('down', ev); break;
            case 'ArrowLeft': run('left', ev); break;
            case 'ArrowRight': run('right', ev); break;
            case 'Enter': if (!ev.shiftKey && !isOwnControl(ev.target)) run('open', ev); break;
            case 'Escape': run('escape', ev); break;
            default: break;
        }
    };

    root.addEventListener('keydown', onKey);
    return () => root.removeEventListener('keydown', onKey);
}
