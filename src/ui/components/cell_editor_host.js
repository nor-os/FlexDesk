/**
 * cell_editor_host.js — STORY-0003. ONE CELL BEING EDITED: open an editor in
 * it, and close it exactly once — by a commit or by a cancel.
 *
 * The editor itself comes from a FACTORY, so a consumer can bring any editor
 * it likes (DataTable's `editors` option); the plain text box below is the
 * default. A factory is called with
 *
 *     { ...args, value, row, rowIdx, colIdx, column: {index, header, type},
 *       initialText, commit(value, move?), cancel() }
 *
 * and returns either an element, or
 * `{ el, getValue?, parse?, multiline?, focus?, destroy? }`.
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
 * `getValue` calls `commit(value)` itself. Such an editor has no value the host
 * can read: Enter, Tab and the focus leaving do nothing, and `commit()` from
 * outside (its row leaving a virtual window) CANCELS it. Every key
 * pressed in the editor stops there: the table's own keys (the arrows, Ctrl+A,
 * Ctrl+C) are not the editor's.
 *
 * ══ A VALUE THAT DOES NOT PARSE (STORY-0087) ═══════════════════════════
 *
 * An editor with a `parse()` — `() => {ok: true, value} | {ok: false, error}`
 * — commits what `parse()` reads, not `getValue()`. A refusal on Enter or Tab
 * keeps the editor open, and its cell carries the message
 * (`twm-dt-cell--error`, `title`, `data-error`) until the next keystroke in
 * it; nothing is committed. A refusal when the focus leaves, or on `commit()`
 * from outside, closes the editor and hands `onRefuse` the message and the
 * text (`getValue()`); still nothing is committed. A `multiline` editor
 * keeps Enter for a new line: Ctrl/Cmd+Enter commits it.
 *
 * `commit(value, move?)` takes an optional move ('down', 'up', 'right',
 * 'left'), for an editor that commits on a key of its own.
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
    const parse = typeof own.parse === 'function' ? own.parse : null;
    // What a commit reads: the parse, else the value as it is.
    let read = null;
    if (parse) {
        read = () => {
            let r;
            try { r = parse(); } catch (err) { r = { ok: false, error: err?.message || String(err) }; }
            return r && r.ok === false ? { ok: false, error: String(r.error ?? 'Not valid') }
                : { ok: true, value: r ? r.value : undefined };
        };
    } else if (getValue) read = () => ({ ok: true, value: getValue() });
    return {
        el,
        getValue,
        read,
        multiline: !!own.multiline,
        focus: typeof own.focus === 'function' ? own.focus : null,
        destroy: typeof own.destroy === 'function' ? own.destroy : null,
    };
}

const MOVES = new Set(['down', 'up', 'right', 'left']);

export class CellEditorHost {
    /**
     * @param {object} o
     * @param {(session, value, move, reason) => void} o.onCommit  after the
     *   cell is drawn as it was again; `move` is 'down', 'up', 'right', 'left'
     *   or null; `reason` is 'key', 'blur', 'editor' or 'scroll'.
     * @param {(session, reason) => void} o.onCancel
     * @param {(session, error, text, reason) => void} [o.onRefuse]  a value
     *   that did not parse, when the editor closed with it (the focus left,
     *   `commit()` from outside); without it such a close is a cancel.
     */
    constructor({ onCommit, onCancel, onRefuse = null }) {
        this._onCommit = onCommit;
        this._onCancel = onCancel;
        this._onRefuse = onRefuse;
        /** The open session, or null. */
        this.session = null;
    }

    /**
     * Open an editor in `td`; `args` go to the factory beside the cell's own
     * (DataTable's `locale`, `utc`, `messages`). Returns whether one opened (a factory that
     * throws or returns nothing opens none, and the cell is untouched).
     */
    open({ td, factory, value, row, rowIdx, colIdx, column, initialText = null, args = {}, ...extra }) {
        if (this.session) return false;
        const s = {
            ...extra, td, value, row, rowIdx, colIdx, column,
            previous: value, closed: false, offs: [], saved: null, editor: null,
        };
        let made = null;
        try {
            made = factory({
                ...args, value, row, rowIdx, colIdx, column, initialText,
                commit: (v, move = null) => this._finish(s, v, MOVES.has(move) ? move : null, 'editor'),
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
        s.savedError = {
            on: td.classList.contains('twm-dt-cell--error'),
            message: td.getAttribute('data-error'),
        };
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
            } else if (ev.key === 'Enter' && !ev.altKey && editor.read
                       && (editor.multiline ? (ev.ctrlKey || ev.metaKey) : !(ev.ctrlKey || ev.metaKey))) {
                ev.preventDefault();
                this._tryKey(s, ev.shiftKey ? 'up' : 'down');
            } else if (ev.key === 'Tab' && !ev.altKey && !ev.ctrlKey && !ev.metaKey && editor.read) {
                ev.preventDefault();
                this._tryKey(s, ev.shiftKey ? 'left' : 'right');
            }
        });
        // A refusal's message stands until the text changes.
        on('input', () => this._unmark(s));
        // A press inside the editor is the editor's, not a click on the cell.
        for (const type of ['click', 'dblclick', 'mousedown', 'contextmenu']) {
            on(type, (ev) => ev.stopPropagation());
        }
        on('focusout', (ev) => {
            if (s.closed || !editor.read) return;
            const to = ev.relatedTarget;
            if (to && editor.el.contains(to)) return;
            // The window losing focus (another app) is not a click elsewhere.
            const doc = editor.el.ownerDocument;
            if (!to && doc && typeof doc.hasFocus === 'function' && !doc.hasFocus()) return;
            this._settle(s, null, 'blur');
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
        if (!s.editor.read) { this._cancel(s, reason); return false; }
        return this._settle(s, move, reason);
    }

    /** Enter or Tab: commit what parses; a refusal keeps the editor open,
     *  the message on its cell. */
    _tryKey(s, move) {
        const r = s.editor.read();
        if (r.ok) return this._finish(s, r.value, move, 'key');
        s.td.classList.add('twm-dt-cell--error');
        s.td.setAttribute('data-error', r.error);
        s.td.setAttribute('title', r.error);
        s.marked = true;
        return false;
    }

    _unmark(s) {
        if (!s.marked) return;
        s.marked = false;
        this._restoreMark(s);
    }

    _restoreMark(s) {
        const { on, message } = s.savedError;
        s.td.classList.toggle('twm-dt-cell--error', on);
        if (message == null) s.td.removeAttribute('data-error');
        else s.td.setAttribute('data-error', message);
        if (s.savedTitle == null) s.td.removeAttribute('title');
        else s.td.setAttribute('title', s.savedTitle);
    }

    /** The editor closing with what it holds (the focus left, `commit()`):
     *  committed when it parses, else handed to `onRefuse`. */
    _settle(s, move, reason) {
        const r = s.editor.read();
        if (r.ok) return this._finish(s, r.value, move, reason);
        if (s.closed) return false;
        let text = '';
        try { text = s.editor.getValue ? s.editor.getValue() : ''; } catch (_) { /* gone */ }
        this._close(s);
        if (this._onRefuse) this._onRefuse(s, r.error, text, reason);
        else this._onCancel?.(s, reason);
        return true;
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
        this._restoreMark(s);
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
