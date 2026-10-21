/**
 * ══ DICTATION TARGETS ═════════════════════════════════════════════════════
 *
 * Where dictated text goes (FlexDesk STORY-0096). Kept apart from the
 * recorder (`components/dictation.js`) so a widget that only wants to RECEIVE
 * dictation — an editor, a terminal — can register itself without pulling in
 * the microphone code.
 *
 *     const off = registerDictationTarget(terminalEl, (text) => term.paste(text));
 *     off();     // gone again
 *
 * A REGISTERED TARGET is any element with an insert handler. Focus anywhere
 * inside it (a terminal's hidden helper textarea, a code editor's input)
 * finds it, the nearest registration winning, and its handler is used INSTEAD
 * of typing into the DOM. The handler gets `(text, { element })` and may
 * return (or resolve to) `false` to decline — a read-only editor, a terminal
 * whose session has ended — which the caller reports.
 *
 * WITHOUT A REGISTRATION the focused element itself is typed into, when it
 * takes text: an `<input>` of a text-like type, a `<textarea>`, or a
 * contenteditable region (not disabled, not read-only). The text goes in at
 * the cursor, replacing a selection, through `execCommand('insertText')` when
 * the element has focus and the browser does it (native undo, the browser's
 * own `input` event), and otherwise by editing the value or the range and
 * firing an `input` event (`inputType: 'insertText'`) so listeners hear it.
 *
 * TEXT IS ALWAYS ONE LINE: `sanitizeDictatedText` turns line breaks and tabs
 * into spaces and drops every other control character, before any target
 * sees it. Dictation never sends Enter — not to a terminal, where a newline
 * would run the command, and not to a form, where it might submit it.
 */

/** element -> insert handler. A WeakMap, so a removed element takes its registration with it. */
const registry = new WeakMap();

/** The `<input type>`s that hold free text. Others (number, date, checkbox…) are not typed into. */
const TEXT_INPUT_TYPES = new Set(['text', 'search', 'url', 'tel', 'email', 'password', '']);

/**
 * Register `insert(text, { element })` for `element` and everything inside it.
 * Returns the function that removes the registration (only if it is still this one).
 */
export function registerDictationTarget(element, insert) {
    if (!element || typeof element !== 'object') throw new TypeError('registerDictationTarget: an element is required');
    if (typeof insert !== 'function') throw new TypeError('registerDictationTarget: insert must be a function');
    registry.set(element, insert);
    return () => {
        if (registry.get(element) === insert) registry.delete(element);
    };
}

/**
 * The nearest registered element at or above `node` — across shadow roots,
 * so a registration on a custom element's host covers its shadow tree — as
 * `{ element, insert }`, or null.
 */
export function findDictationTarget(node) {
    for (let n = node; n; n = n.parentNode || n.host || null) {
        const insert = registry.get(n);
        if (insert) return { element: n, insert };
    }
    return null;
}

/** Line breaks and tabs become spaces, other control characters go, runs of spaces collapse, ends are trimmed. */
export function sanitizeDictatedText(text) {
    return String(text ?? '')
        .replace(/[\r\n\t\u2028\u2029]+/g, ' ')
        // C0 and C1 controls and DEL: an escape sequence must not reach a terminal.
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
        .replace(/ {2,}/g, ' ')
        .trim();
}

/** The contenteditable region `el` is in, or null (jsdom has no `isContentEditable`, so the attribute is read). */
function editableRoot(el) {
    let root = null;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
        const v = n.getAttribute('contenteditable');
        if (v === null) continue;
        if (v === 'false') break;
        if (v === '' || v === 'true' || v === 'plaintext-only') root = n;
        else break;
    }
    return root;
}

/** `'field'` (input/textarea), `'editable'` (contenteditable) or null: whether, and how, `el` takes typed text. */
export function dictationKind(el) {
    if (!el || el.nodeType !== 1) return null;
    const tag = el.tagName;
    if (tag === 'TEXTAREA') return el.disabled || el.readOnly ? null : 'field';
    if (tag === 'INPUT') {
        const type = (el.getAttribute('type') || '').toLowerCase();
        return TEXT_INPUT_TYPES.has(type) && !el.disabled && !el.readOnly ? 'field' : null;
    }
    return editableRoot(el) ? 'editable' : null;
}

/** Whether `el` can receive dictation: registered (itself or an ancestor) or typed into. */
export function acceptsDictation(el) {
    return !!(findDictationTarget(el) || dictationKind(el));
}

/** A space on either side where the text would otherwise run into the word before or after the cursor. */
function spaced(before, text, after = '') {
    let t = text;
    if (before && !/\s$/.test(before) && !/^[.,;:!?)\]}]/.test(t)) t = ` ${t}`;
    if (after && !/^[\s.,;:!?)\]}]/.test(after)) t = `${t} `;
    return t;
}

function fireInput(el, data) {
    const win = el.ownerDocument.defaultView;
    const Ctor = typeof win?.InputEvent === 'function' ? win.InputEvent : win.Event;
    el.dispatchEvent(new Ctor('input', { bubbles: true, inputType: 'insertText', data }));
}

/** `execCommand('insertText')` when `el` has focus and the browser does it; false otherwise. */
function nativeInsert(el, text) {
    const doc = el.ownerDocument;
    if (doc.activeElement !== el && !(editableRoot(el) && editableRoot(el).contains(doc.activeElement))) return false;
    if (typeof doc.execCommand !== 'function') return false;
    try { return doc.execCommand('insertText', false, text) === true; } catch { return false; }
}

function insertIntoField(el, text) {
    const value = el.value ?? '';
    let start = null;
    let end = null;
    try { start = el.selectionStart; end = el.selectionEnd; } catch { /* a type without a selection */ }
    if (start === null || end === null) { start = value.length; end = value.length; }
    const t = spaced(value.slice(0, start), text, value.slice(end));
    if (nativeInsert(el, t) && el.value !== value) return true;
    if (typeof el.setRangeText === 'function' && el.selectionStart !== null) {
        el.setRangeText(t, start, end, 'end');
    } else {
        el.value = value.slice(0, start) + t + value.slice(end);
    }
    fireInput(el, t);
    return true;
}

/**
 * A range to insert at in the contenteditable `root`: the live selection when
 * it is inside, else `saved` (the selection when dictation began) when that is
 * still inside, else the end of the region.
 */
function editableRange(root, saved) {
    const doc = root.ownerDocument;
    const sel = doc.getSelection?.();
    if (sel && sel.rangeCount && root.contains(sel.getRangeAt(0).startContainer)) return sel.getRangeAt(0);
    if (saved && root.contains(saved.startContainer)) return saved;
    const r = doc.createRange();
    r.selectNodeContents(root);
    r.collapse(false);
    return r;
}

function textBefore(range) {
    const c = range.startContainer;
    return c.nodeType === 3 ? c.data.slice(0, range.startOffset) : (c.childNodes[range.startOffset - 1]?.textContent ?? '');
}

function textAfter(range) {
    const c = range.endContainer;
    return c.nodeType === 3 ? c.data.slice(range.endOffset) : (c.childNodes[range.endOffset]?.textContent ?? '');
}

function insertIntoEditable(el, text, saved) {
    const root = editableRoot(el);
    const doc = root.ownerDocument;
    const range = editableRange(root, saved);
    const t = spaced(textBefore(range), text, textAfter(range));
    const sel = doc.getSelection?.();
    if (sel && doc.activeElement && root.contains(doc.activeElement)) {
        sel.removeAllRanges();
        sel.addRange(range);
        const before = root.textContent;
        if (nativeInsert(root, t) && root.textContent !== before) return true;
    }
    range.deleteContents();
    const node = doc.createTextNode(t);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    if (sel && doc.activeElement && root.contains(doc.activeElement)) {
        sel.removeAllRanges();
        sel.addRange(range);
    }
    fireInput(root, t);
    return true;
}

/**
 * Put `text` (sanitized here, whatever the caller did) into `element`: its
 * registered handler when it or an ancestor has one, else at its cursor.
 * Resolves to true when it went in, false when the target declined or does
 * not take text. `savedRange` is a contenteditable selection to fall back on.
 */
export async function insertDictatedText(element, text, { savedRange = null } = {}) {
    const clean = sanitizeDictatedText(text);
    if (!clean || !element) return false;
    const reg = findDictationTarget(element);
    if (reg) return (await reg.insert(clean, { element: reg.element })) !== false;
    if (!element.isConnected) return false;
    const kind = dictationKind(element);
    if (kind === 'field') return insertIntoField(element, clean);
    if (kind === 'editable') return insertIntoEditable(element, clean, savedRange);
    return false;
}

/**
 * The element that really has focus in `doc`: through open shadow roots and
 * into same-origin iframes. `doc.activeElement` stops at the host or the frame.
 */
export function deepActiveElement(doc) {
    let el = doc?.activeElement ?? null;
    for (;;) {
        if (el?.shadowRoot?.activeElement) { el = el.shadowRoot.activeElement; continue; }
        if (el?.tagName === 'IFRAME') {
            let inner = null;
            try { inner = el.contentDocument?.activeElement ?? null; } catch { /* cross-origin */ }
            if (inner && inner !== el.contentDocument.body) { el = inner; continue; }
        }
        return el;
    }
}
