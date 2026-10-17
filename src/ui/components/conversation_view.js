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
 * change the list; `messages()` reads it. Each message has an EXTRA SLOT
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
 * never unpins it: only the scroll position moving up does. `scrollTop` is
 * readable and settable (`getScrollTop` / `setScrollTop`) so an embedder can
 * keep it across a remount.
 *
 * THE COMPOSER is a textarea that grows with its text up to
 * `composerMaxHeight`. Enter submits (the trimmed-empty text is ignored) and
 * clears it; Shift+Enter inserts a newline. `setBusy(true)` turns Send into
 * Cancel: Enter then submits nothing, and Esc or a click on Cancel calls
 * `onCancel` — once per busy period, however often it is pressed.
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
    /** After every change to the transcript: follow it, or leave the reader where they are. */
    const settle = () => { if (pinned) toBottom(); };

    function onScroll() {
        const top = log.scrollTop;
        const movedUp = top < lastScrollTop;
        lastScrollTop = top;
        if (distanceFromEnd() <= pinThreshold) { if (!pinned) setPinned(true); return; }
        if (movedUp && pinned) setPinned(false);
    }
    /** A wheel up stops following at once, before the scroll it causes is reported. */
    function onWheel(e) { if (e.deltaY < 0 && pinned && log.scrollTop > 0) setPinned(false); }
    function onJump() { setPinned(true); toBottom(); }
    log.addEventListener('scroll', onScroll);
    log.addEventListener('wheel', onWheel, { passive: true });
    jump.addEventListener('click', onJump);

    // ── messages ─────────────────────────────────────────────────────────
    /** A fresh id, never one a caller's message already holds. */
    const newId = () => {
        let id;
        do id = `m${nextId++}`; while (entries.has(id));
        return id;
    };
    const roleClass = (role) => String(role ?? '').toLowerCase().replace(/[^a-z0-9-]+/g, '-') || 'none';
    const snapshot = (message) => ({ ...message });

    function drawBody(entry) {
        const { message, body } = entry;
        const streaming = message.id === streamId;
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

    function build(spec) {
        const message = {
            ...spec,
            id: spec?.id ?? newId(),
            role: spec?.role ?? 'assistant',
            text: String(spec?.text ?? ''),
        };
        if (entries.has(message.id)) throw new Error(`conversation view: duplicate message id "${message.id}"`);
        const row = el('div', `twm-chat__msg twm-chat__msg--${roleClass(message.role)}`);
        const body = el('div', 'twm-chat__body');
        const extra = el('div', 'twm-chat__extra');
        row.append(body, extra);
        const entry = { message, row, body, extra };
        entries.set(message.id, entry);
        drawBody(entry);
        return entry;
    }

    function append(message) {
        const entry = build(message);
        log.append(entry.row);
        settle();
        return entry.message.id;
    }

    function replaceAll(messages = []) {
        streamId = null;
        entries.clear();
        const frag = doc.createDocumentFragment();
        for (const m of messages) frag.append(build(m).row);
        log.replaceChildren(frag);
        setPinned(true);
        toBottom();
    }

    function clear() { replaceAll([]); }

    // ── streaming ────────────────────────────────────────────────────────
    function beginStream(message = {}) {
        if (streamId !== null) endStream();
        const id = message.id ?? newId();
        streamId = id;
        const entry = build({ role: 'assistant', text: '', ...message, id });
        entry.row.classList.add('twm-chat__msg--streaming');
        log.append(entry.row);
        settle();
        return id;
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

    function onKey(e) {
        if (e.isComposing) return;
        if (e.key === 'Enter' && e.shiftKey) {
            e.preventDefault();
            input.setRangeText('\n', input.selectionStart, input.selectionEnd, 'end');
            grow();
            return;
        }
        if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            submit();
            return;
        }
        if (e.key === 'Escape' && busy) {
            e.preventDefault();
            cancel();
        }
    }
    input.addEventListener('keydown', onKey);
    input.addEventListener('input', grow);
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
            log.removeEventListener('scroll', onScroll);
            log.removeEventListener('wheel', onWheel);
            jump.removeEventListener('click', onJump);
            entries.clear();
            root.remove();
        },
    };
}
