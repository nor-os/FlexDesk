/**
 * cell_editor_host.js — STORY-0003. ONE CELL BEING EDITED: open an editor in
 * it, and close it exactly once — by a commit or by a cancel.
 *
 * The editor itself comes from a FACTORY, so a consumer can bring any editor
 * it likes (DataTable's `editors` option); the plain text box below is the
 * default. A factory is called with
 *
 *     { value, row, rowIdx, colIdx, column: {index, header, type},
 *       initialText, commit(value), cancel() }
 *
 * and returns either an element, or `{ el, getValue?, focus?, destroy? }`.
 * `initialText` is the character typed to open the editor (null when it was
 * opened by F2, Enter or a double-click): the editor starts with it in place
 * of the value, as a spreadsheet does.
 *
 * ══ THE KEYS, WHICH THE HOST OWNS ════════════════════════════════════════
 *
 *   Enter       commit, and the table moves the cursor down (Shift: up)
 *   Tab         commit, and the cursor moves right (Shift: left)
 *   Escape      cancel: the cell is drawn as it was, and nothing is called
 *   focus out   commit, without moving — a click elsewhere keeps the edit
 *
 * Enter and Tab commit `getValue()` — an input, select or textarea's `value`
 * when the factory returned the field itself; any other editor without a
 * `getValue` calls `commit(value)` itself. Every key
 * pressed in the editor stops there: the table's own keys (the arrows, Ctrl+A,
 * Ctrl+C) are not the editor's.
 *
 * ══ EXACTLY ONCE ═════════════════════════════════════════════════════════
 *
 * A session closes once. Escape's own repaint takes the focused input out of
 * the document, and a browser fires `focusout` for that — the commit listener.
 * The session is marked closed BEFORE anything is taken out, so that late
 * `focusout` (and a second Enter, and an editor that calls `commit` twice)
 * finds nothing to do.
 */

/**
 * The default editor: a text box holding the value as text (or the character
 * that opened it). Left unchanged, it commits the value it was given — not
 * that value turned into a string — so opening and leaving a number cell is
 * no edit at all.
 */
export function createTextEditor({ value, initialText = null }) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'twm-dt-editor';
    input.spellcheck = false;
    input.setAttribute('autocomplete', 'off');
    const start = value == null ? '' : String(value);
    input.value = initialText != null ? String(initialText) : start;
    return {
        el: input,
        getValue: () => (initialText == null && input.value === start ? value : input.value),
        focus: () => {
            input.focus({ preventScroll: true });
            const end = input.value.length;
            try { input.setSelectionRange(end, end); } catch (_) { /* not a text type */ }
        },
    };
}

/** What a factory returned, as one shape — or null when it returned nothing. */
function normalise(made) {
    if (!made) return null;
    const isNode = typeof Node !== 'undefined' && made instanceof Node;
    const el = isNode ? made : made.el;
    if (!el || (typeof Node !== 'undefined' && !(el instanceof Node))) return null;
    const own = isNode ? {} : made;
    let getValue = typeof own.getValue === 'function' ? own.getValue : null;
    // A form field's value is the editor's; any other element says for itself.
    if (!getValue && el.matches?.('input, select, textarea')) getValue = () => el.value;
    return {
        el,
        getValue,
        focus: typeof own.focus === 'function' ? own.focus : null,
        destroy: typeof own.destroy === 'function' ? own.destroy : null,
    };
}

export class CellEditorHost {
    /**
     * @param {object} o
     * @param {(session, value, move, reason) => void} o.onCommit  after the
     *   cell is drawn as it was again; `move` is 'down', 'up', 'right', 'left'
     *   or null; `reason` is 'key', 'blur', 'editor' or 'scroll'.
     * @param {(session, reason) => void} o.onCancel
     */
    constructor({ onCommit, onCancel }) {
        this._onCommit = onCommit;
        this._onCancel = onCancel;
        /** The open session, or null. */
        this.session = null;
    }

    /**
     * Open an editor in `td`. Returns whether one opened (a factory that
     * throws or returns nothing opens none, and the cell is untouched).
     */
    open({ td, factory, value, row, rowIdx, colIdx, column, initialText = null, ...extra }) {
        if (this.session) return false;
        const s = {
            ...extra, td, value, row, rowIdx, colIdx, column,
            previous: value, closed: false, offs: [], saved: null, editor: null,
        };
        let made = null;
        try {
            made = factory({
                value, row, rowIdx, colIdx, column, initialText,
                commit: (v) => this._finish(s, v, null, 'editor'),
                cancel: () => this._cancel(s, 'editor'),
            });
        } catch (err) {
            console.error('[DataTable] cell editor factory threw', err);
            return false;
        }
        const editor = normalise(made);
        if (!editor) return false;
        s.editor = editor;
        s.saved = [...td.childNodes];
        s.savedTitle = td.getAttribute('title');
        this.session = s;
        td.classList.add('twm-dt-cell--editing');
        td.replaceChildren(editor.el);

        const on = (type, fn) => {
            editor.el.addEventListener(type, fn);
            s.offs.push(() => editor.el.removeEventListener(type, fn));
        };
        on('keydown', (ev) => {
            if (ev.isComposing) return;
            ev.stopPropagation();
            if (ev.key === 'Escape') {
                ev.preventDefault();
                this._cancel(s, 'key');
            } else if (ev.key === 'Enter' && !ev.altKey && !ev.ctrlKey && !ev.metaKey && editor.getValue) {
                ev.preventDefault();
                this._finish(s, editor.getValue(), ev.shiftKey ? 'up' : 'down', 'key');
            } else if (ev.key === 'Tab' && !ev.altKey && !ev.ctrlKey && !ev.metaKey && editor.getValue) {
                ev.preventDefault();
                this._finish(s, editor.getValue(), ev.shiftKey ? 'left' : 'right', 'key');
            }
        });
        // A press inside the editor is the editor's, not a click on the cell.
        for (const type of ['click', 'dblclick', 'mousedown', 'contextmenu']) {
            on(type, (ev) => ev.stopPropagation());
        }
        on('focusout', (ev) => {
            if (s.closed || !editor.getValue) return;
            const to = ev.relatedTarget;
            if (to && editor.el.contains(to)) return;
            // The window losing focus (another app) is not a click elsewhere.
            const doc = editor.el.ownerDocument;
            if (!to && doc && typeof doc.hasFocus === 'function' && !doc.hasFocus()) return;
            this._finish(s, editor.getValue(), null, 'blur');
        });

        try {
            if (editor.focus) editor.focus();
            else editor.el.focus?.({ preventScroll: true });
        } catch (_) { /* not focusable */ }
        return true;
    }

    /** Commit the open session with what its editor holds. */
    commit(move = null, reason = 'editor') {
        const s = this.session;
        if (!s) return false;
        if (!s.editor.getValue) { this._cancel(s, reason); return false; }
        return this._finish(s, s.editor.getValue(), move, reason);
    }

    /** Cancel the open session: the cell is drawn as it was. */
    cancel(reason = 'editor') {
        const s = this.session;
        if (!s) return false;
        return this._cancel(s, reason);
    }

    /** Take the editor out and put the cell's own content back. */
    _close(s) {
        s.closed = true;
        if (this.session === s) this.session = null;
        for (const off of s.offs) { try { off(); } catch (_) { /* gone */ } }
        s.offs = [];
        try { s.editor.destroy?.(); } catch (err) {
            console.error('[DataTable] cell editor destroy threw', err);
        }
        s.td.classList.remove('twm-dt-cell--editing');
        s.td.replaceChildren(...s.saved);
        if (s.savedTitle == null) s.td.removeAttribute('title');
        else s.td.setAttribute('title', s.savedTitle);
    }

    _finish(s, value, move, reason) {
        if (s.closed) return false;
        this._close(s);
        this._onCommit?.(s, value, move, reason);
        return true;
    }

    _cancel(s, reason) {
        if (s.closed) return false;
        this._close(s);
        this._onCancel?.(s, reason);
        return true;
    }
}
