/**
 * ══ THE CONVERSATION VIEW ═════════════════════════════════════════════════
 *
 * A transcript of role-tagged messages above a composer (FlexDesk STORY-0057).
 * It knows nothing about what a message says or where it came from: no
 * markdown, no model, no provider. The caller draws a message's body (or
 * leaves it as plain text) and is told when the user submits or cancels.
 *
 *     const view = mountConversationView(el, {
 *         render:   (message, bodyEl, { streaming }) => { bodyEl.innerHTML = toHtml(message.text); },
 *         onSubmit: (text) => send(text),
 *         onCancel: () => stop(),
 *     });
 *     view.append({ role: 'user', text: 'Hello' });
 *     view.beginStream({ role: 'assistant' });
 *     view.appendChunk('Hi');            // re-renders ONLY the streaming message
 *     view.endStream();
 *
 * MESSAGES are `{ id?, role, text, meta? }`. `id` is assigned when absent;
 * `role` becomes a modifier class (`twm-chat__msg--<role>`); `meta` is the
 * caller's and is handed back untouched. `append`, `replaceAll` and `clear`
 * change the list; `messages()` reads it. An id already in the transcript (or
 * repeated within one `replaceAll`) is refused with a throw, and a refused
 * call changes nothing. Each message has an EXTRA SLOT
 * (`slot(id)`), an element below the body the caller fills with whatever
 * belongs to that message — tool output, buttons, a diff — and which a
 * re-render of the body never touches.
 *
 * THE RENDER CALLBACK draws one body: `render(message, bodyEl, { streaming })`.
 * The body is emptied before every call. One that throws leaves the message
 * as its plain text (`twm-chat__body--plain`) and the view carries on; the
 * error goes to `onRenderError(error, message)` when given.
 *
 * STREAMING: `beginStream(message?)` appends a message marked streaming,
 * `appendChunk(text)` adds to its text and re-renders that message's body
 * alone, `endStream()` renders it a last time, unmarked. Nothing is deferred to
 * a frame: every call has drawn by the time it returns.
 *
 * PINNED TO THE BOTTOM: while the transcript is scrolled to within
 * `pinThreshold` px of its end it follows new content. A scroll UP past that
 * stops the following and shows *Jump to latest*; clicking it — or scrolling
 * back down to the end — follows again. Content growing below a pinned view
 * never unpins it: only the scroll position moving up does, and a wheel over
 * a nested scroller (a `<pre>` in a body, say) scrolls that, not the view;
 * nor does a wheel a handler inside the transcript cancelled. `scrollTop` is
 * readable and settable (`getScrollTop` / `setScrollTop`) so an embedder can
 * keep it across a remount.
 *
 * THE COMPOSER is a textarea that grows with its text up to
 * `composerMaxHeight`. Enter submits (the trimmed-empty text is ignored) and
 * clears it; Shift+Enter is left to the browser, which inserts the newline
 * (native undo, `input` events). `setBusy(true)` turns Send into Cancel: Enter
 * then submits nothing, and Esc — wherever focus is inside the view — or a
 * click on Cancel calls `onCancel`, once per busy period, however often it is
 * pressed. That Esc stops there: it never reaches a window or panel around
 * the view that would close on Escape.
 *
 * `destroy()` removes the view. Every listener sits on an element the view
 * created, so they go with it; none is on the host or the document.
 */

/** How near the end of the transcript still counts as "at the bottom". */
export const CONVERSATION_PIN_WITHIN_PX = 32;

/** The tallest the composer grows before it scrolls instead. */
export const CONVERSATION_COMPOSER_MAX_PX = 200;

/**
 * @param {HTMLElement} host
 * @param {object}   [opts]
 * @param {Function} [opts.render]          `(message, bodyEl, { streaming })` — draws a body; plain text without it
 * @param {Function} [opts.onSubmit]        `(text)` — Enter or Send
 * @param {Function} [opts.onCancel]        `()` — Esc or Cancel while busy
 * @param {Function} [opts.onRenderError]   `(error, message)` — a render that threw
 * @param {number}   [opts.pinThreshold]    px from the end that still follows new content
 * @param {number}   [opts.composerMaxHeight] px the composer grows to
 * @param {string}   [opts.placeholder]     the composer's placeholder
 * @param {object}   [opts.labels]          `{ send, cancel, jump, input }` — button and field texts
 * @returns {object} the view (see the methods below)
 */
export function mountConversationView(host, {
    render = null, onSubmit = null, onCancel = null, onRenderError = null,
    pinThreshold = CONVERSATION_PIN_WITHIN_PX, composerMaxHeight = CONVERSATION_COMPOSER_MAX_PX,
    placeholder = '', labels = {},
} = {}) {
    const text = {
        send: 'Send', cancel: 'Cancel', jump: 'Jump to latest', input: 'Message', ...labels,
    };
    const doc = host.ownerDocument;
    const el = (tag, cls, content) => {
        const n = doc.createElement(tag);
        if (cls) n.className = cls;
        if (content !== undefined) n.textContent = content;
        return n;
    };
    const icon = (name) => {
        const i = el('span', 'material-symbols-outlined', name);
        i.setAttribute('aria-hidden', 'true');
        return i;
    };

    /** id → { message, row, body, extra } in transcript order. */
    const entries = new Map();
    let nextId = 1;
    let streamId = null;
    let pinned = true;
    let lastScrollTop = 0;
    let busy = false;
    let cancelled = false;
    let destroyed = false;

    // ── the frame ────────────────────────────────────────────────────────
    const root = el('div', 'twm-chat');
    const viewport = el('div', 'twm-chat__viewport');
    const log = el('div', 'twm-chat__log');
    log.setAttribute('role', 'log');
    log.setAttribute('aria-live', 'polite');
    const jump = el('button', 'twm-chat__jump');
    jump.type = 'button';
    jump.append(icon('arrow_downward'), doc.createTextNode(` ${text.jump}`));
    jump.hidden = true;
    viewport.append(log, jump);

    const composer = el('div', 'twm-chat__composer');
    const input = el('textarea', 'twm-chat__input');
    input.rows = 1;
    input.placeholder = placeholder;
    input.setAttribute('aria-label', text.input);
    const send = el('button', 'twm-chat__send');
    send.type = 'button';
    composer.append(input, send);
    root.append(viewport, composer);
    host.append(root);

    // ── scrolling ────────────────────────────────────────────────────────
    const distanceFromEnd = () => log.scrollHeight - log.scrollTop - log.clientHeight;
    const toBottom = () => {
        log.scrollTop = log.scrollHeight;
        lastScrollTop = log.scrollTop;
    };
    const setPinned = (value) => {
        pinned = value;
        jump.hidden = pinned;
    };
    /**
     * Reads the position the reader left: a move up that ends past
     * `pinThreshold` from the end stops following. Returns whether the view
     * is within the threshold. Shared by the `scroll` event and by settle(),
     * because a scrollbar drag, a key or a touch moves `scrollTop` before its
     * `scroll` event is dispatched, and a change arriving in between must not
     * snap the reader back.
     */
    function noticeMove() {
        const top = log.scrollTop;
        const movedUp = top < lastScrollTop;
        lastScrollTop = top;
        const near = distanceFromEnd() <= pinThreshold;
        if (movedUp && !near && pinned) setPinned(false);
        return near;
    }
    /** After every change to the transcript: follow it, or leave the reader where they are. */
    const settle = () => {
        noticeMove();
        if (pinned) toBottom();
    };

    function onScroll() { if (noticeMove() && !pinned) setPinned(true); }
    /**
     * Whether a wheel up over `target` is kept by something nested inside the
     * transcript — a scrollable block in a body or an extra slot that is not
     * at its own top, or one at its top whose `overscroll-behavior` keeps the
     * scroll from chaining out — rather than moving the transcript itself.
     */
    function innerTakesWheelUp(target) {
        const view = doc.defaultView;
        for (let n = target; n && n !== log; n = n.parentElement) {
            if (n.nodeType !== 1 || n.scrollHeight <= n.clientHeight) continue;
            const style = view?.getComputedStyle(n);
            const overflow = style?.overflowY;
            if (overflow !== 'auto' && overflow !== 'scroll' && overflow !== 'overlay') continue;
            if (n.scrollTop > 0) return true;
            const chain = style.getPropertyValue('overscroll-behavior-y')
                || style.getPropertyValue('overscroll-behavior').split(/\s+/).pop();
            if (chain === 'contain' || chain === 'none') return true;
        }
        return false;
    }
    /**
     * A wheel up that will move the transcript stops following at once, before
     * the scroll it causes is reported. One that a nested scroller keeps, or
     * one a handler inside the transcript cancelled (a zoomable chart in a
     * slot, say), leaves the transcript where it is, so it changes nothing.
     */
    function onWheel(e) {
        if (e.deltaY < 0 && pinned && !e.defaultPrevented && log.scrollTop > 0
            && !innerTakesWheelUp(e.target)) setPinned(false);
    }
    function onJump() { setPinned(true); toBottom(); }
    log.addEventListener('scroll', onScroll);
    log.addEventListener('wheel', onWheel, { passive: true });
    jump.addEventListener('click', onJump);

    // ── messages ─────────────────────────────────────────────────────────
    /** A fresh id, never one `taken` holds. */
    const newId = (taken = (id) => entries.has(id)) => {
        let id;
        do id = `m${nextId++}`; while (taken(id));
        return id;
    };
    const duplicate = (id) => new Error(`conversation view: duplicate message id "${id}"`);
    const roleClass = (role) => String(role ?? '').toLowerCase().replace(/[^a-z0-9-]+/g, '-') || 'none';
    const snapshot = (message) => ({ ...message });

    function drawBody(entry, streaming = entry.message.id === streamId) {
        const { message, body } = entry;
        body.replaceChildren();
        body.classList.remove('twm-chat__body--plain');
        if (render) {
            try {
                render(snapshot(message), body, { streaming });
                return;
            } catch (error) {
                body.replaceChildren();
                if (onRenderError) {
                    try { onRenderError(error, snapshot(message)); } catch { /* the view keeps working */ }
                }
            }
        }
        body.classList.add('twm-chat__body--plain');
        body.textContent = message.text;
    }

    /**
     * One entry, drawn, and added to `into` (the transcript unless a
     * replaceAll is building its own). Throws on an id `into` already holds,
     * before anything is changed.
     */
    function build(spec, { into = entries, taken, streaming = false } = {}) {
        const message = {
            ...spec,
            id: spec?.id ?? newId(taken ?? ((id) => into.has(id))),
            role: spec?.role ?? 'assistant',
            text: String(spec?.text ?? ''),
        };
        if (into.has(message.id)) throw duplicate(message.id);
        const row = el('div', `twm-chat__msg twm-chat__msg--${roleClass(message.role)}`);
        if (streaming) row.classList.add('twm-chat__msg--streaming');
        const body = el('div', 'twm-chat__body');
        const extra = el('div', 'twm-chat__extra');
        row.append(body, extra);
        const entry = { message, row, body, extra };
        into.set(message.id, entry);
        drawBody(entry, streaming);
        return entry;
    }

    function append(message) {
        const entry = build(message);
        log.append(entry.row);
        settle();
        return entry.message.id;
    }

    /** All or nothing: a repeated id throws before the transcript is touched. */
    function replaceAll(messages = []) {
        const list = [...messages];
        const given = new Set();
        for (const m of list) {
            if (m?.id == null) continue;
            if (given.has(m.id)) throw duplicate(m.id);
            given.add(m.id);
        }
        const next = new Map();
        const taken = (id) => given.has(id) || next.has(id);
        const frag = doc.createDocumentFragment();
        for (const m of list) frag.append(build(m, { into: next, taken }).row);
        streamId = null;
        entries.clear();
        for (const [id, entry] of next) entries.set(id, entry);
        log.replaceChildren(frag);
        setPinned(true);
        toBottom();
    }

    function clear() { replaceAll([]); }

    // ── streaming ────────────────────────────────────────────────────────
    /**
     * Refused (a throw, nothing changed, an open stream left open) on an id
     * already present. No message (undefined or null) streams an empty
     * assistant message, as `append` treats them.
     */
    function beginStream(message) {
        if (message?.id != null && entries.has(message.id)) throw duplicate(message.id);
        if (streamId !== null) endStream();
        const entry = build({ role: 'assistant', text: '', ...(message ?? {}) }, { streaming: true });
        streamId = entry.message.id;
        log.append(entry.row);
        settle();
        return streamId;
    }

    function appendChunk(chunk) {
        const entry = streamId !== null ? entries.get(streamId) : null;
        if (!entry) return;
        entry.message.text += String(chunk ?? '');
        drawBody(entry);
        settle();
    }

    function endStream() {
        const entry = streamId !== null ? entries.get(streamId) : null;
        streamId = null;
        if (!entry) return null;
        entry.row.classList.remove('twm-chat__msg--streaming');
        drawBody(entry);
        settle();
        return entry.message.id;
    }

    // ── the composer ─────────────────────────────────────────────────────
    function grow() {
        input.style.height = 'auto';
        input.style.height = `${Math.min(input.scrollHeight, composerMaxHeight)}px`;
        input.style.overflowY = input.scrollHeight > composerMaxHeight ? 'auto' : 'hidden';
    }

    function drawSend() {
        send.replaceChildren(icon(busy ? 'stop' : 'send'));
        send.setAttribute('aria-label', busy ? text.cancel : text.send);
        send.title = busy ? text.cancel : text.send;
        send.classList.toggle('twm-chat__send--cancel', busy);
        root.classList.toggle('twm-chat--busy', busy);
    }

    function submit() {
        if (busy) return;
        const value = input.value;
        if (!value.trim()) return;
        input.value = '';
        grow();
        onSubmit?.(value);
    }

    function cancel() {
        if (!busy || cancelled) return;
        cancelled = true;
        onCancel?.();
    }

    /** Enter submits; Shift+Enter (and Ctrl/Meta/Alt+Enter) is the browser's to handle. */
    function onInputKey(e) {
        if (e.isComposing || e.key !== 'Enter') return;
        if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
        e.preventDefault();
        submit();
    }
    /**
     * Esc while busy cancels wherever focus is inside the view, and it is the
     * view's alone: it goes no further, so a window or panel holding the view
     * that closes on Escape stays open — on the cancelling Esc and on any
     * repeat in the same busy period.
     */
    function onRootKey(e) {
        if (e.isComposing || e.key !== 'Escape' || !busy) return;
        e.preventDefault();
        e.stopPropagation();
        cancel();
    }
    input.addEventListener('keydown', onInputKey);
    input.addEventListener('input', grow);
    root.addEventListener('keydown', onRootKey);
    send.addEventListener('click', () => (busy ? cancel() : submit()));
    drawSend();

    return {
        root,
        append,
        replaceAll,
        clear,
        beginStream,
        appendChunk,
        endStream,
        /** A copy of every message, in order. */
        messages: () => [...entries.values()].map((e) => snapshot(e.message)),
        /** The extra slot below a message's body, or null for an unknown id. */
        slot: (id) => entries.get(id)?.extra ?? null,
        /** The id of the message being streamed, or null. */
        streamingId: () => streamId,
        isPinned: () => pinned,
        getScrollTop: () => log.scrollTop,
        /** Scrolls the transcript; pinned again only when that lands at the end. */
        setScrollTop(px) {
            log.scrollTop = px;
            lastScrollTop = log.scrollTop;
            setPinned(distanceFromEnd() <= pinThreshold);
        },
        scrollToBottom: onJump,
        /** `true` turns Send into Cancel; every busy period may cancel once. */
        setBusy(value) {
            if (busy === !!value) return;
            busy = !!value;
            cancelled = false;
            drawSend();
        },
        isBusy: () => busy,
        getText: () => input.value,
        setText(value) { input.value = String(value ?? ''); grow(); },
        focus: () => input.focus(),
        destroy() {
            if (destroyed) return;
            destroyed = true;
            streamId = null;
            busy = false;
            cancelled = false;
            entries.clear();
            root.remove();
        },
    };
}
