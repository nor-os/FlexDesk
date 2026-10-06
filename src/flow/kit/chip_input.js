/**
 * THE CHIP INPUT — text in which references are drawn as chips (36 §3.6).
 * Every chip-bearing widget is built on this one control.
 *
 * ══ CHIPS ARE A VIEW OF TEXT ═══════════════════════════════════════════
 *
 * The stored value is ALWAYS the plain text: a chip is drawn for each
 * reference the field's syntaxes recognise, and it carries the reference's
 * exact text in `data-ref`; reading the field serialises the text nodes plus
 * each chip's `data-ref`. Nothing about a chip — its label, its tone — is ever
 * written back. A value nobody edits is never re-serialised at all, so a field
 * opened and closed hands back exactly what it was given.
 *
 * ══ HOW IT EDITS ═══════════════════════════════════════════════════════
 *
 * The host is a `contenteditable` and each chip a `contenteditable="false"`
 * span, which the browser treats as one unit. Typing is the browser's (so an
 * IME and dead keys work), and after every input the text is read back and
 * RE-TOKENISED: when the text now holds a reference the DOM does not draw as a
 * chip (one was just typed or pasted), or a chip the text no longer holds, the
 * field is redrawn and the caret put back at the same TEXT offset. The rest is
 * done on the text and redrawn, never left to the browser:
 *
 *  - ← and → step over a chip as one unit;
 *  - one Backspace (or Delete) removes a whole chip;
 *  - a paste is plain text — never markup — and a reference in it becomes a chip;
 *  - a copy or a cut puts the exact TEXT on the clipboard, references included;
 *  - Enter adds a line break in a multi-line field and nothing in a single-line one;
 *  - formatting (Ctrl+B and the like) and a drop are refused;
 *  - nothing is touched during an IME composition, until `compositionend`.
 *
 * ══ ITS OWN UNDO ═══════════════════════════════════════════════════════
 *
 * A script that rebuilds a `contenteditable` breaks the browser's undo for it,
 * so the field keeps its own: Ctrl+Z / Ctrl+Y (and the browser's Edit menu,
 * through `beforeinput`) walk the field's own texts, typing merged into one
 * step. An editor's key binding leaves Ctrl+Z to a `contenteditable` (`ownsUndo`),
 * so an undo in the field is the field's and an undo outside it the editor's.
 */

import { el, toneClass } from './dom.js';
import { describeReference, findReferences, tokenize } from './references.js';

const MERGE_MS = 1000;
const TAIL = 'data-twm-tail';

/**
 * @param {object} o
 * @param {string} [o.value]          the text
 * @param {object[]} [o.syntaxes]     reference syntaxes (references.js)
 * @param {boolean} [o.readOnly]
 * @param {(text: string) => void} [o.onInput]   after every change the READER made
 * @param {boolean} [o.multiline]     Enter adds a line break
 * @param {string} [o.placeholder]
 * @param {string} [o.label]          the accessible name
 * @param {boolean} [o.mono]          a monospace face (formulas, JSON)
 * @param {object} [o.describeContext] handed to each syntax's `describe`
 */
export function createChipInput({ value = '', syntaxes = [], readOnly = false, onInput = null, multiline = false,
                                  placeholder = '', label = '', mono = false, describeContext = null } = {}) {
    const host = el('div', `twm-flow-chipinput${mono ? ' twm-flow-chipinput--mono' : ''}`
                            + `${multiline ? ' twm-flow-chipinput--multiline' : ''}`);
    host.setAttribute('role', 'textbox');
    host.setAttribute('aria-multiline', multiline ? 'true' : 'false');
    if (label) host.setAttribute('aria-label', label);
    if (placeholder) {
        host.dataset.placeholder = placeholder;
        host.setAttribute('aria-placeholder', placeholder);
    }
    host.spellcheck = false;

    let text = String(value ?? '');
    let ro = Boolean(readOnly);
    let composing = false;
    let lastCaret = null;
    let destroyed = false;
    // The field's own undo: a list of states and where we are in it.
    let states = [{ text, caret: { start: text.length, end: text.length }, kind: 'load', at: 0 }];
    let index = 0;
    let travelled = true;

    // ── drawing ────────────────────────────────────────────────────────

    function chipFor(part) {
        const d = describeReference(part.match, describeContext || {});
        const chip = el('span', ['twm-flow-chip', toneClass('twm-flow-chip', d.tone || 'blue'),
                                 d.known ? '' : 'twm-flow-chip--unknown'].filter(Boolean).join(' '), d.label);
        chip.contentEditable = 'false';
        chip.setAttribute('contenteditable', 'false');
        chip.setAttribute('draggable', 'false');
        chip.dataset.ref = part.text;
        chip.title = part.text;
        if (part.match?.syntax?.name) chip.dataset.syntax = part.match.syntax.name;
        return chip;
    }

    function render() {
        const parts = tokenize(text, syntaxes);
        const nodes = parts.map((p) => (p.kind === 'ref' ? chipFor(p) : document.createTextNode(p.text)));
        if (text.endsWith('\n')) {
            const br = document.createElement('br');
            br.setAttribute(TAIL, '');
            nodes.push(br);
        }
        host.replaceChildren(...nodes);
        paintEmpty();
    }

    function paintEmpty() {
        host.classList.toggle('twm-flow-chipinput--empty', text === '');
    }

    function setEditable() {
        host.setAttribute('contenteditable', ro ? 'false' : 'true');
        host.setAttribute('aria-readonly', ro ? 'true' : 'false');
        host.tabIndex = 0;
    }

    // ── reading the DOM back as text ───────────────────────────────────

    const chipOf = (node) => {
        const e = node?.nodeType === 1 ? node : node?.parentElement;
        const c = e?.closest?.('[data-ref]');
        return c && host.contains(c) ? c : null;
    };

    /** A line the browser made (a `<div>` or `<p>` after something): it starts with a line break. */
    const isLine = (node) => node?.nodeType === 1 && (node.tagName === 'DIV' || node.tagName === 'P')
        && Boolean(node.previousSibling);

    /** How many characters of text `node` stands for. */
    function measure(node) {
        if (node.nodeType === 3) return node.data.length;
        if (node.nodeType !== 1) return 0;
        if (node.dataset?.ref !== undefined) return node.dataset.ref.length;
        if (node.tagName === 'BR') return node.hasAttribute(TAIL) ? 0 : 1;
        let n = isLine(node) ? 1 : 0;
        for (const c of node.childNodes) n += measure(c);
        return n;
    }

    function serialiseNode(node) {
        if (node.nodeType === 3) return node.data;
        if (node.nodeType !== 1) return '';
        if (node.dataset?.ref !== undefined) return node.dataset.ref;
        if (node.tagName === 'BR') return node.hasAttribute(TAIL) ? '' : '\n';
        let s = isLine(node) ? '\n' : '';
        for (const c of node.childNodes) s += serialiseNode(c);
        return s;
    }

    const read = () => [...host.childNodes].map(serialiseNode).join('');

    /** The text offset of a DOM point; a point inside a chip is its `edge`. */
    function offsetOf(container, offset, edge = 'end') {
        if (!host.contains(container)) return null;
        const chip = chipOf(container);
        let node;
        let total = 0;
        if (chip) {
            node = chip;
            if (edge === 'end') total += measure(chip);
        } else if (container.nodeType === 3) {
            total += offset;
            node = container;
        } else {
            const kids = container.childNodes;
            for (let i = 0; i < Math.min(offset, kids.length); i += 1) total += measure(kids[i]);
            if (container === host) return total;
            if (isLine(container)) total += 1;
            node = container;
        }
        while (node && node !== host) {
            for (let s = node.previousSibling; s; s = s.previousSibling) total += measure(s);
            const parent = node.parentNode;
            if (parent && parent !== host && isLine(parent)) total += 1;
            node = parent;
        }
        return total;
    }

    /** The DOM point at text offset `at` in the field as drawn (flat). */
    function locate(at) {
        let acc = 0;
        const kids = [...host.childNodes];
        for (let i = 0; i < kids.length; i += 1) {
            const k = kids[i];
            if (k.nodeType === 1 && k.hasAttribute(TAIL)) return { node: host, offset: i };
            const len = measure(k);
            if (k.nodeType === 3) {
                if (at <= acc + len) return { node: k, offset: Math.max(0, at - acc) };
            } else if (k.dataset?.ref !== undefined) {
                if (at <= acc) return { node: host, offset: i };
                if (at < acc + len) return { node: host, offset: i + 1 };
            } else if (at <= acc) {
                return { node: host, offset: i };
            }
            acc += len;
        }
        return { node: host, offset: kids.length };
    }

    /** The selection as text offsets `{start, end}`, or null when it is not in the field. */
    function selectionOffsets() {
        const sel = host.ownerDocument.getSelection?.();
        if (!sel || sel.rangeCount === 0) return null;
        const r = sel.getRangeAt(0);
        if (!host.contains(r.startContainer) || !host.contains(r.endContainer)) return null;
        const a = offsetOf(r.startContainer, r.startOffset, r.collapsed ? 'end' : 'start');
        const b = r.collapsed ? a : offsetOf(r.endContainer, r.endOffset, 'end');
        if (a === null || b === null) return null;
        return { start: Math.min(a, b), end: Math.max(a, b) };
    }

    function placeCaret(start, end = start) {
        const len = text.length;
        const s = Math.max(0, Math.min(start, len));
        const e = Math.max(0, Math.min(end, len));
        const sel = host.ownerDocument.getSelection?.();
        if (!sel) return;
        const a = locate(s);
        const b = e === s ? a : locate(e);
        const range = host.ownerDocument.createRange();
        range.setStart(a.node, a.offset);
        range.setEnd(b.node, b.offset);
        sel.removeAllRanges();
        sel.addRange(range);
        lastCaret = { start: s, end: e };
    }

    /** Does the DOM draw `text` the way `tokenize` would? */
    function drawnAsTokens() {
        const want = tokenize(text, syntaxes).map((p) => (p.kind === 'ref' ? `r${p.text}` : `t${p.text}`));
        const have = [];
        for (const k of host.childNodes) {
            if (k.nodeType === 3) {
                if (!k.data) continue;
                if (have.length && have[have.length - 1].startsWith('t')) have[have.length - 1] += k.data;
                else have.push(`t${k.data}`);
            } else if (k.nodeType === 1 && k.dataset?.ref !== undefined) {
                have.push(`r${k.dataset.ref}`);
            } else if (k.nodeType === 1 && k.hasAttribute(TAIL) && k === host.lastChild) {
                continue;
            } else {
                return false;
            }
        }
        const tail = host.lastChild?.nodeType === 1 && host.lastChild.hasAttribute(TAIL);
        if (text.endsWith('\n') !== Boolean(tail)) return false;
        return want.length === have.length && want.every((w, i) => w === have[i]);
    }

    // ── changing the text ──────────────────────────────────────────────

    function record(kind, caret) {
        const now = Date.now();
        const top = states[index];
        if (kind === 'type' && top.kind === 'type' && !travelled && now - top.at < MERGE_MS
            && index === states.length - 1) {
            states[index] = { text, caret, kind, at: now };
        } else {
            states = states.slice(0, index + 1);
            states.push({ text, caret, kind, at: now });
            index = states.length - 1;
        }
        travelled = false;
    }

    function changed(kind, caret) {
        record(kind, caret);
        onInput?.(text);
    }

    /** Replace `[start, end)` of the text with `insert`, redraw, caret after it. */
    function replaceRange(start, end, insert, kind = 'edit') {
        text = text.slice(0, start) + insert + text.slice(end);
        render();
        const at = start + insert.length;
        placeCaret(at);
        changed(kind, { start: at, end: at });
    }

    function travel(to) {
        if (to < 0 || to >= states.length) return false;
        index = to;
        travelled = true;
        text = states[index].text;
        render();
        const c = states[index].caret || { start: text.length, end: text.length };
        placeCaret(c.start, c.end);
        onInput?.(text);
        return true;
    }

    function handleInput() {
        if (destroyed || composing) return;
        const caret = selectionOffsets();
        const next = read();
        if (next === text) {
            // Nothing the reader typed, but the browser may have left markup of
            // its own (a stray <br>): draw the text again, record nothing.
            if (!drawnAsTokens()) {
                render();
                if (caret) placeCaret(caret.start, caret.end);
            }
            return;
        }
        text = next;
        if (!drawnAsTokens()) {
            render();
            if (caret) placeCaret(caret.start, caret.end);
        } else {
            paintEmpty();
        }
        changed('type', caret || { start: text.length, end: text.length });
    }

    const chipEndingAt = (at) => findReferences(text, syntaxes).find((r) => r.end === at) || null;
    const chipStartingAt = (at) => findReferences(text, syntaxes).find((r) => r.start === at) || null;

    // ── events ─────────────────────────────────────────────────────────

    function onKeyDown(ev) {
        if (destroyed || ev.isComposing || composing || ev.keyCode === 229) return;
        const mod = (ev.ctrlKey || ev.metaKey) && !ev.altKey;
        const k = String(ev.key || '');
        if (mod && (k.toLowerCase() === 'z' || k.toLowerCase() === 'y')) {
            ev.preventDefault();
            if (ro) return;
            if (k.toLowerCase() === 'y' || ev.shiftKey) travel(index + 1); else travel(index - 1);
            return;
        }
        if (mod && ['b', 'i', 'u'].includes(k.toLowerCase())) { ev.preventDefault(); return; }
        if (ro) return;
        const sel = selectionOffsets();
        if (!sel) return;
        const collapsed = sel.start === sel.end;
        if (k === 'Enter') {
            ev.preventDefault();
            if (multiline && !mod) replaceRange(sel.start, sel.end, '\n');
            return;
        }
        if (k === 'Backspace' || k === 'Delete') {
            if (!collapsed) { ev.preventDefault(); replaceRange(sel.start, sel.end, ''); return; }
            const chip = k === 'Backspace' ? chipEndingAt(sel.start) : chipStartingAt(sel.start);
            if (chip) { ev.preventDefault(); replaceRange(chip.start, chip.end, ''); }
            return;
        }
        if ((k === 'ArrowLeft' || k === 'ArrowRight') && !ev.shiftKey && !mod && !ev.altKey && collapsed) {
            const chip = k === 'ArrowLeft' ? chipEndingAt(sel.start) : chipStartingAt(sel.start);
            if (chip) {
                ev.preventDefault();
                placeCaret(k === 'ArrowLeft' ? chip.start : chip.end);
            }
        }
    }

    function onBeforeInput(ev) {
        if (destroyed) return;
        const t = String(ev.inputType || '');
        if (t === 'historyUndo' || t === 'historyRedo') {
            ev.preventDefault();
            if (!ro) travel(t === 'historyUndo' ? index - 1 : index + 1);
            return;
        }
        if (t.startsWith('format') || t === 'insertFromDrop' || t === 'deleteByDrag') { ev.preventDefault(); return; }
        if ((t === 'insertParagraph' || t === 'insertLineBreak') && !composing) {
            ev.preventDefault();
            const sel = selectionOffsets();
            if (multiline && sel && !ro) replaceRange(sel.start, sel.end, '\n');
        }
    }

    function onPaste(ev) {
        if (destroyed) return;
        ev.preventDefault();
        if (ro) return;
        let pasted = ev.clipboardData?.getData?.('text/plain') ?? '';
        pasted = pasted.replace(/\r\n?/g, '\n');
        if (!multiline) pasted = pasted.replace(/\n+/g, ' ');
        const sel = selectionOffsets() || { start: text.length, end: text.length };
        replaceRange(sel.start, sel.end, pasted, 'paste');
    }

    function onCopy(ev, cut = false) {
        const sel = selectionOffsets();
        if (!sel || sel.start === sel.end) return;
        ev.preventDefault();
        ev.clipboardData?.setData?.('text/plain', text.slice(sel.start, sel.end));
        if (cut && !ro) replaceRange(sel.start, sel.end, '', 'cut');
    }

    const onSelection = () => {
        const s = selectionOffsets();
        if (s) lastCaret = s;
    };

    host.addEventListener('keydown', onKeyDown);
    host.addEventListener('beforeinput', onBeforeInput);
    host.addEventListener('input', handleInput);
    host.addEventListener('paste', onPaste);
    host.addEventListener('copy', (ev) => onCopy(ev, false));
    host.addEventListener('cut', (ev) => onCopy(ev, true));
    host.addEventListener('drop', (ev) => ev.preventDefault());
    host.addEventListener('compositionstart', () => { composing = true; });
    host.addEventListener('compositionend', () => {
        composing = false;
        queueMicrotask(handleInput);
    });
    host.addEventListener('keyup', onSelection);
    host.addEventListener('mouseup', onSelection);
    host.addEventListener('blur', onSelection);
    const doc = host.ownerDocument;
    doc.addEventListener('selectionchange', onSelection);

    setEditable();
    render();

    return {
        el: host,
        getValue: () => text,
        /** Replace the text from outside (not an edit the reader made: no `onInput`). */
        setValue(next) {
            text = String(next ?? '');
            render();
            states = [{ text, caret: { start: text.length, end: text.length }, kind: 'load', at: 0 }];
            index = 0;
            travelled = true;
        },
        /** Insert `snippet` where the caret is, or was when the field lost focus; else at the end. */
        insert(snippet) {
            if (ro) return;
            const sel = selectionOffsets() || lastCaret || { start: text.length, end: text.length };
            host.focus({ preventScroll: true });
            replaceRange(Math.min(sel.start, text.length), Math.min(sel.end, text.length), String(snippet), 'insert');
        },
        focus() { host.focus({ preventScroll: true }); },
        caret: () => selectionOffsets() || lastCaret,
        restoreCaret(c) {
            if (!c) return;
            host.focus({ preventScroll: true });
            placeCaret(c.start ?? 0, c.end ?? c.start ?? 0);
        },
        setReadOnly(next) {
            ro = Boolean(next);
            setEditable();
        },
        /** Redraw the chips (a consumer's `describe` learned something). */
        refresh() {
            const c = selectionOffsets();
            render();
            if (c) placeCaret(c.start, c.end);
        },
        get canUndo() { return index > 0; },
        get canRedo() { return index < states.length - 1; },
        destroy() {
            destroyed = true;
            doc.removeEventListener('selectionchange', onSelection);
        },
    };
}
