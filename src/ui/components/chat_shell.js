/**
 * ══ THE ASSISTANT CHAT SHELL ══════════════════════════════════════════════
 *
 * A whole assistant chat over the conversation view: conversation tabs, an
 * optional mode toggle, a model picker, a reply that streams (typing dots, tool
 * calls, stop), Markdown bodies, time and copy on every message, and a slot on
 * each assistant message for controls of the caller's. It knows no provider and
 * nothing of what a reply is about. The caller passes a transport and reads
 * back snapshots to keep.
 *
 *     const chat = mountChatShell(el, {
 *         transport: {
 *             send(request, emit) { backend.ask(request, (e) => emit(toChatEvent(e))); },
 *             cancel(request)     { backend.stop(); },
 *         },
 *         modes: [{ id: 'ask', label: 'Ask' }, { id: 'act', label: 'Act' }],
 *         models: { items: [{ id: 'a', label: 'Large' }], activeId: 'a' },
 *         onModelSelect: (item) => chat.setModels({ activeId: item.id }),
 *         renderControls: (el, message) => { ... },
 *         conversations: saved,
 *         onChange: (snapshot) => save(snapshot),
 *     });
 *
 * THE TRANSPORT is `{ send(request, emit), cancel?(request) }`. A request is
 * `{ text, tabId, conversationId, mode, model }`. `emit` takes one event at a
 * time (`CHAT_TRANSPORT_EVENTS`):
 *
 *     { type: 'text-delta',  text }
 *     { type: 'tool-use',    id?, name, label?, status? }      running | done | error
 *     { type: 'message-end', text?, conversationId?, meta? }
 *     { type: 'error',       message }
 *
 * `message-end` and `error` finish the turn. Every `emit` belongs to its turn:
 * what it is handed once that turn has finished or been cancelled is dropped,
 * so a late chunk never lands in the next reply. A `send` that throws, or
 * answers a promise that rejects, is an `error` event. A `tool-use` with the id
 * of one already shown updates it.
 *
 * A TURN: the user's message goes in, then a streamed reply that shows the
 * typing dots while it is empty. Tool calls are listed under the body. The turn
 * ends in one of three ways, and a reply left with no text, no tool call and no
 * `meta` is taken out in each:
 *   - `message-end`: `text` fills the reply only if nothing was streamed; `meta`
 *     is merged into the message's.
 *   - Stop (Cancel, Esc, or `cancel()`): what arrived stays, running tools become
 *     `stopped`, `transport.cancel` is called.
 *   - `error`: as Stop, without `transport.cancel`, and an error message follows.
 *     While it is the last message it carries Retry, which sends the user message
 *     before it again.
 *
 * CONVERSATIONS: the shell owns the tabs. While a turn runs the tab in front
 * cannot be left, closed or cleared; other tabs can still be closed, and the
 * last one never can. `snapshot()` is `{ activeId, tabs: [{ id, title,
 * conversationId, messages }] }`, plain data to keep, and `conversations` takes
 * one back. A message is `{ id, role, text, at?, tools?, meta? }`; `meta` is
 * yours and is handed back untouched. A reply still empty is not in a snapshot.
 *
 * CONTROLS: `renderControls(el, message, chat)` fills an emptied element below an
 * assistant message's body once the reply has finished, and again when the
 * message comes back from a tab switch or `refreshControls(id)`/`updateMeta(id,
 * patch)`. Everything it needs to survive goes in `message.meta`.
 *
 * THE MODEL PICKER is controlled: choosing an item calls `onModelSelect(item)`
 * (an item with an `action` calls `onModelAction(action, item)`), and the picker
 * changes when you call `setModels`, which takes any of `{ items, activeId, label,
 * status }`. With no items and no label there is no button; with no modes either
 * there is no bar.
 *
 * Nothing is stored in the DOM. `destroy()` cancels a running turn and removes
 * everything, the picker's menu on `document.body` included.
 */

import { ActionDropdown } from './action_dropdown.js';
import { CHAT_STATES, ChatStateMachine } from './chat_state_machine.js';
import { showConfirmDialog } from './confirm_dialog.js';
import { mountConversationView } from './conversation_view.js';
import { createTabs } from './tabs.js';
import { renderMarkdown } from '../utils/markdown.js';

export const CHAT_TRANSPORT_EVENTS = Object.freeze({
    TEXT_DELTA: 'text-delta',
    TOOL_USE: 'tool-use',
    MESSAGE_END: 'message-end',
    ERROR: 'error',
});

/** Every text the shell shows; pass `labels` to replace any of them. */
export const CHAT_SHELL_LABELS = Object.freeze({
    send: 'Send',
    cancel: 'Cancel',
    jump: 'Jump to latest',
    input: 'Message',
    conversations: 'Conversations',
    newConversation: 'New chat',
    add: 'New conversation',
    clear: 'Clear conversation',
    clearTitle: 'Clear conversation',
    clearMessage: 'Clear this conversation? This cannot be undone.',
    clearOk: 'Clear',
    clearCancel: 'Cancel',
    rename: 'Conversation name',
    modes: 'Mode',
    selectModel: 'Select model...',
    typing: 'The assistant is replying',
    copy: 'Copy message',
    retry: 'Retry',
    retryTitle: 'Send the message again',
    unknownError: 'Unknown error',
});

const TITLE_CHARS = 30;
const COPIED_MS = 1500;
const TOOL_ICONS = Object.freeze({ running: 'build', done: 'check', error: 'error', stopped: 'block' });

const defaultTitle = (text) => (text.length > TITLE_CHARS ? `${text.slice(0, TITLE_CHARS)}...` : text);

function defaultTime(at) {
    const date = new Date(at);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * @param {HTMLElement} host
 * @param {object}   opts
 * @param {object}   opts.transport               `{ send(request, emit), cancel?(request) }`
 * @param {Function} [opts.renderControls]        `(el, message, chat)` — an assistant message's controls
 * @param {object}   [opts.markdown]              options for `renderMarkdown`
 * @param {Function} [opts.onChange]              `(snapshot)` — something worth keeping changed
 * @param {Function} [opts.onConversationChange]  `(conversation, reason)` — another conversation is in front; reason is `new`, `switch`, `close` or `reset`
 * @param {Array}    [opts.modes]                 `[{ id, label, title? }]`; none, no toggle
 * @param {string}   [opts.mode]                  the mode to start in; the first without it
 * @param {Function} [opts.onModeChange]          `(id)` — the user chose a mode
 * @param {object}   [opts.models]                `{ items, activeId, label, status }`, as `setModels`
 * @param {Function} [opts.onModelSelect]         `(item)`
 * @param {Function} [opts.onModelAction]         `(action, item)`
 * @param {object}   [opts.conversations]         a `snapshot()` to restore
 * @param {Function} [opts.titleFrom]             `(text)` — a new conversation's title, from its first message
 * @param {Function} [opts.formatTime]            `(at, message)` — a message's time; `''` shows none
 * @param {string}   [opts.placeholder]           the composer's placeholder
 * @param {object}   [opts.welcome]               `{ icon?, text }`, shown while the transcript is empty
 * @param {object}   [opts.labels]                over `CHAT_SHELL_LABELS`
 * @param {object}   [opts.eventBus]              gets `CHAT_BUS_EVENTS`
 * @param {object}   [opts.logger]
 * @returns {object} the chat (see the methods below)
 */
export function mountChatShell(host, {
    transport, renderControls = null, markdown = {}, onChange = null, onConversationChange = null,
    modes = [], mode = null, onModeChange = null, models = null, onModelSelect = null, onModelAction = null,
    conversations = null, titleFrom = defaultTitle, formatTime = defaultTime, placeholder = '', welcome = null,
    labels = {}, eventBus = null, logger = null,
} = {}) {
    if (typeof transport?.send !== 'function') {
        throw new TypeError('mountChatShell: a transport with send(request, emit) is required');
    }
    const text = { ...CHAT_SHELL_LABELS, ...labels };
    const doc = host.ownerDocument;
    const el = (tag, cls, content) => {
        const n = doc.createElement(tag);
        if (cls) n.className = cls;
        if (content !== undefined) n.textContent = content;
        return n;
    };
    const icon = (name, cls = '') => {
        const i = el('span', `material-symbols-outlined ${cls}`.trim(), name);
        i.setAttribute('aria-hidden', 'true');
        return i;
    };
    const button = (cls, title) => {
        const b = el('button', cls);
        b.type = 'button';
        b.title = title;
        b.setAttribute('aria-label', title);
        return b;
    };
    /** A callback of the caller's: one that throws is logged, and the chat carries on. */
    const safely = (fn, ...args) => {
        try { return fn?.(...args); } catch (error) {
            logger?.error?.('chat-shell', 'A callback threw', { error });
            return undefined;
        }
    };

    let destroyed = false;
    /** The exchange in flight: `{ token, replyId, request, started }`, or null. */
    let turn = null;
    /** id → { at, tools, meta, toolsEl, controlsEl, footerEl }, for the messages on show. */
    const extras = new Map();
    const copyTimers = new Set();

    const modeIds = modes.map((m) => m.id);
    const machine = new ChatStateMachine({
        eventBus,
        logger,
        mode: modeIds.includes(mode) ? mode : (modeIds[0] ?? null),
        onChange: ({ state }) => { if (!destroyed) showState(state); },
    });

    // ── the frame ────────────────────────────────────────────────────────
    const root = el('div', 'twm-chat-shell');
    const tabBar = el('div', 'twm-chat-shell__tab-bar');
    const tabsHost = el('div', 'twm-chat-shell__tabs');
    const addBtn = button('twm-chat-shell__tab-btn', text.add);
    addBtn.append(icon('add'));
    const clearBtn = button('twm-chat-shell__tab-btn twm-chat-shell__tab-btn--clear', text.clear);
    clearBtn.append(icon('delete_sweep'));
    tabBar.append(tabsHost, addBtn, clearBtn);
    const conversationHost = el('div', 'twm-chat-shell__conversation');
    const bar = el('div', 'twm-chat-shell__bar');
    root.append(tabBar, conversationHost, bar);
    host.append(root);

    const view = mountConversationView(conversationHost, {
        render: drawBody,
        onSubmit: (value) => send(value),
        onCancel: () => cancel(),
        onRenderError: (error, message) => logger?.error?.('chat-shell', 'Could not draw a message', { error, message }),
        placeholder,
        labels: { send: text.send, cancel: text.cancel, jump: text.jump, input: text.input },
    });

    const welcomeEl = welcome ? el('div', 'twm-chat-shell__welcome') : null;
    if (welcomeEl) {
        if (welcome.icon) welcomeEl.append(icon(welcome.icon, 'twm-chat-shell__welcome-icon'));
        welcomeEl.append(el('p', 'twm-chat-shell__welcome-text', welcome.text ?? ''));
        view.root.querySelector('.twm-chat__viewport').prepend(welcomeEl);
    }
    const syncWelcome = () => { if (welcomeEl) welcomeEl.hidden = view.messages().length > 0; };

    function showState(state) {
        const busy = state === CHAT_STATES.WAITING || state === CHAT_STATES.STREAMING;
        view.setBusy(busy);
        addBtn.disabled = busy;
        clearBtn.disabled = busy;
    }

    // ── bodies ───────────────────────────────────────────────────────────
    /** An assistant's body is Markdown, with the typing dots while it is empty and streaming; any other is text. */
    function drawBody(message, body, { streaming }) {
        if (message.role !== 'assistant') {
            body.textContent = message.text;
            return;
        }
        if (streaming && !message.text) {
            const dots = el('span', 'twm-chat-shell__typing');
            dots.setAttribute('role', 'img');
            dots.setAttribute('aria-label', text.typing);
            dots.append(el('span'), el('span'), el('span'));
            body.append(dots);
            return;
        }
        body.innerHTML = renderMarkdown(message.text, markdown);
    }

    // ── what sits below a body ───────────────────────────────────────────
    const viewMessage = (id) => view.messages().find((m) => m.id === id) ?? null;

    /** A message as it is kept and as callers see it. */
    function kept({ id, role, text: body }) {
        const { at, tools, meta } = extras.get(id) ?? {};
        const message = { id, role, text: body };
        if (at) message.at = at;
        if (tools?.length) message.tools = tools.map((t) => ({ ...t }));
        if (meta !== undefined) message.meta = meta;
        return message;
    }

    /** The messages worth showing a caller: a reply with nothing in it yet is not one. */
    function keptMessages() {
        const streaming = view.streamingId();
        return view.messages()
            .filter((m) => m.id !== streaming || m.text || extras.get(m.id)?.tools.length)
            .map(kept);
    }

    /** Puts a message's three blocks in its slot and remembers what it carries. */
    function register(id, { at, tools = [], meta }) {
        const entry = {
            at,
            tools,
            meta,
            toolsEl: el('div', 'twm-chat-shell__tools'),
            controlsEl: el('div', 'twm-chat-shell__controls'),
            footerEl: el('div', 'twm-chat-shell__footer'),
        };
        extras.set(id, entry);
        view.slot(id).append(entry.toolsEl, entry.controlsEl, entry.footerEl);
        return entry;
    }

    function drawTools(id) {
        const entry = extras.get(id);
        entry.toolsEl.replaceChildren(...entry.tools.map((tool) => {
            const row = el('div', `twm-chat-shell__tool twm-chat-shell__tool--${tool.status}`);
            row.append(
                icon(TOOL_ICONS[tool.status], 'twm-chat-shell__tool-icon'),
                el('span', 'twm-chat-shell__tool-label', tool.label ?? tool.name),
            );
            return row;
        }));
    }

    function drawControls(id) {
        const message = viewMessage(id);
        const entry = extras.get(id);
        if (!renderControls || !message || !entry) return;
        if (message.role !== 'assistant' || id === view.streamingId()) return;
        entry.controlsEl.replaceChildren();
        safely(renderControls, entry.controlsEl, kept(message), chat);
    }

    function copyButton(id) {
        const copy = button('twm-chat-shell__copy', text.copy);
        const glyph = icon('content_copy');
        copy.append(glyph);
        copy.addEventListener('click', () => {
            Promise.resolve()
                .then(() => doc.defaultView.navigator.clipboard.writeText(viewMessage(id)?.text ?? ''))
                .then(() => {
                    copy.classList.add('twm-chat-shell__copy--done');
                    glyph.textContent = 'check';
                    const timer = setTimeout(() => {
                        copyTimers.delete(timer);
                        copy.classList.remove('twm-chat-shell__copy--done');
                        glyph.textContent = 'content_copy';
                    }, COPIED_MS);
                    copyTimers.add(timer);
                })
                .catch((error) => logger?.warn?.('chat-shell', 'Could not copy a message', { error }));
        });
        return copy;
    }

    /** The user message a failed request sent, while that failure is the last message. */
    function retryable(id, list) {
        const last = list.at(-1);
        if (last?.id !== id || last.role !== 'error') return null;
        return list.slice(0, -1).reverse().find((m) => m.role === 'user') ?? null;
    }

    function drawFooter(id, list = view.messages()) {
        const entry = extras.get(id);
        entry.footerEl.replaceChildren();
        if (id === view.streamingId()) return;
        const user = retryable(id, list);
        if (user) {
            const retry = el('button', 'twm-chat-shell__retry');
            retry.type = 'button';
            retry.title = text.retryTitle;
            retry.append(icon('refresh'), doc.createTextNode(text.retry));
            retry.addEventListener('click', () => send(user.text));
            entry.footerEl.append(retry);
        }
        const message = list.find((m) => m.id === id);
        const time = entry.at ? safely(formatTime, entry.at, kept(message)) : '';
        if (time) entry.footerEl.append(el('span', 'twm-chat-shell__time', time));
        entry.footerEl.append(copyButton(id));
    }

    /** The slots grew too, and the view only follows changes of its own. */
    const follow = () => { if (view.isPinned()) view.scrollToBottom(); };

    /** A message just took the last place: the failure before it loses its Retry. */
    function redrawFailures() {
        const list = view.messages();
        for (const { id, role } of list) if (role === 'error') drawFooter(id, list);
    }

    function appendMessage(role, body) {
        const id = view.append({ role, text: body });
        register(id, { at: new Date().toISOString() });
        redrawFailures();
        drawFooter(id);
        follow();
        return id;
    }

    // ── conversations ────────────────────────────────────────────────────
    const newTab = (id) => ({
        id, title: text.newConversation, conversationId: null, messages: [], scrollTop: null,
    });
    const tabs = [];
    let activeId = null;
    let nextTab = 1;
    const tabOf = (id) => tabs.find((t) => t.id === String(id)) ?? null;
    const activeTab = () => tabOf(activeId);
    function freshTab() {
        let id;
        do id = `chat-${nextTab++}`; while (tabOf(id));
        const tab = newTab(id);
        tabs.push(tab);
        return tab;
    }

    /** Kept data back into a message list: a tool cannot still be running after a restart. */
    function restored(messages) {
        return (messages ?? [])
            .filter((m) => m && typeof m.role === 'string')
            .map((m) => {
                const tools = m.tools?.map((t) => (t.status === 'running' ? { ...t, status: 'stopped' } : { ...t }));
                return tools ? { ...m, tools } : { ...m };
            });
    }

    const strip = createTabs(tabsHost, {
        items: [],
        compact: true,
        label: text.conversations,
        onSelect: (id) => {
            if (id == null || id === activeId) return;
            switchTo(id);
            // A switch refused leaves the conversation in front where it was.
            if (strip.active() !== activeId) strip.update(tabItems(), activeId);
        },
        onClose: (id) => close(id),
    });
    function tabItems() {
        const closable = tabs.length > 1;
        return tabs.map(({ id, title }) => ({ id, label: title, title, closable }));
    }
    const drawTabs = () => strip.update(tabItems(), activeId);

    /** Rename over the tab (a tab is a button, whose content cannot be edited). Enter or leaving commits; Escape does not. */
    function beginRename(id, tabEl) {
        if (tabBar.querySelector('.twm-chat-shell__rename')) return;
        const original = tabOf(id)?.title ?? '';
        const barRect = tabBar.getBoundingClientRect();
        const tabRect = tabEl.getBoundingClientRect();
        const input = el('input', 'twm-chat-shell__rename');
        input.type = 'text';
        input.value = original;
        input.spellcheck = false;
        input.setAttribute('aria-label', text.rename);
        input.style.left = `${Math.max(0, tabRect.left - barRect.left)}px`;
        input.style.width = `${Math.max(tabRect.width, 120)}px`;
        tabBar.append(input);
        input.focus();
        input.select();
        let done = false;
        const finish = (commit) => {
            if (done) return;
            done = true;
            input.remove();
            const name = input.value.trim();
            if (commit && name && name !== original) rename(id, name);
        };
        input.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' && e.key !== 'Escape') return;
            e.preventDefault();
            e.stopPropagation();
            finish(e.key === 'Enter');
        });
        input.addEventListener('blur', () => finish(true));
    }
    const renameTarget = (e) => {
        const tab = e.target.closest?.('.twm-tabs__tab');
        if (tab) beginRename(tab.dataset.tabId, tab);
    };
    strip.root.addEventListener('dblclick', renameTarget);
    strip.root.addEventListener('keydown', (e) => { if (e.key === 'F2') renameTarget(e); });

    /** The live transcript back into its tab. */
    function stash() {
        const tab = activeTab();
        tab.messages = keptMessages();
        tab.scrollTop = view.getScrollTop();
    }

    function showTab(tab) {
        const messages = restored(tab.messages);
        extras.clear();
        view.replaceAll(messages.map(({ id, role, text: body }) => ({ id, role, text: body })));
        const list = view.messages();
        list.forEach(({ id }, i) => {
            const { at, tools, meta } = messages[i];
            register(id, { at, tools: tools ?? [], meta });
            drawTools(id);
            drawControls(id);
            drawFooter(id, list);
        });
        if (tab.scrollTop !== null) view.setScrollTop(tab.scrollTop);
        else view.scrollToBottom();
        syncWelcome();
    }

    function snapshot() {
        stash();
        return {
            activeId,
            tabs: tabs.map(({ id, title, conversationId, messages }) => ({
                id, title, conversationId, messages: messages.map((m) => ({ ...m })),
            })),
        };
    }
    const changed = () => { if (onChange) safely(onChange, snapshot()); };

    function bringToFront(tab, reason) {
        activeId = tab.id;
        if (tab.conversationId) machine.loadConversation(tab.conversationId);
        else machine.newConversation();
        showTab(tab);
        drawTabs();
        const { id, title, conversationId } = tab;
        safely(onConversationChange, { id, title, conversationId, messages: restored(tab.messages) }, reason);
        changed();
    }

    function newConversation() {
        if (turn) return null;
        stash();
        const tab = freshTab();
        bringToFront(tab, 'new');
        return tab.id;
    }

    function switchTo(id) {
        const tab = tabOf(id);
        if (turn || !tab || tab.id === activeId) return false;
        stash();
        bringToFront(tab, 'switch');
        return true;
    }

    function close(id) {
        const tab = tabOf(id);
        if (!tab || tabs.length <= 1 || (turn && tab.id === activeId)) return false;
        const wasActive = tab.id === activeId;
        tabs.splice(tabs.indexOf(tab), 1);
        if (wasActive) {
            bringToFront(tabs[0], 'close');
        } else {
            drawTabs();
            changed();
        }
        return true;
    }

    function rename(id, title) {
        const tab = tabOf(id);
        const name = String(title ?? '').trim();
        if (!tab || !name) return false;
        tab.title = name;
        drawTabs();
        changed();
        return true;
    }

    /** Empties the conversation in front and forgets its title and id. */
    function reset() {
        if (turn) return false;
        const tab = activeTab();
        Object.assign(tab, { title: text.newConversation, conversationId: null, messages: [], scrollTop: null });
        bringToFront(tab, 'reset');
        return true;
    }

    addBtn.addEventListener('click', () => newConversation());
    clearBtn.addEventListener('click', async () => {
        if (view.messages().length > 0) {
            const confirmed = await showConfirmDialog({
                title: text.clearTitle,
                message: text.clearMessage,
                icon: 'delete_sweep',
                okLabel: text.clearOk,
                cancelLabel: text.clearCancel,
                okVariant: 'danger',
            });
            if (!confirmed || destroyed) return;
        }
        reset();
    });

    // ── the turn ─────────────────────────────────────────────────────────
    function send(value) {
        const message = String(value ?? '').trim();
        if (!message || turn) return false;
        const tab = activeTab();
        appendMessage('user', message);
        if (tab.title === text.newConversation) {
            const title = safely(titleFrom, message);
            if (title) {
                tab.title = String(title);
                drawTabs();
            }
        }
        const replyId = view.beginStream({ role: 'assistant' });
        register(replyId, { at: new Date().toISOString() });
        redrawFailures();
        syncWelcome();
        const token = {};
        const request = {
            text: message,
            tabId: tab.id,
            conversationId: tab.conversationId,
            mode: machine.mode,
            model: currentModels.activeId ?? null,
        };
        turn = { token, replyId, request, started: false };
        machine.sendMessage(message, tab.conversationId);
        changed();

        const emit = (event) => { if (turn?.token === token) handle(event); };
        const fail = (error) => emit({ type: CHAT_TRANSPORT_EVENTS.ERROR, message: error?.message ?? String(error) });
        try {
            Promise.resolve(transport.send(request, emit)).catch(fail);
        } catch (error) {
            fail(error);
        }
        return true;
    }

    function handle(event) {
        switch (event?.type) {
            case CHAT_TRANSPORT_EVENTS.TEXT_DELTA:
                if (!event.text) return;
                markStarted();
                view.appendChunk(event.text);
                return;
            case CHAT_TRANSPORT_EVENTS.TOOL_USE:
                markStarted();
                useTool(event);
                return;
            case CHAT_TRANSPORT_EVENTS.MESSAGE_END:
                endMessage(event);
                return;
            case CHAT_TRANSPORT_EVENTS.ERROR:
                failTurn(event);
                return;
            default:
                logger?.warn?.('chat-shell', 'Unknown transport event', { event });
        }
    }

    function markStarted() {
        if (turn.started) return;
        turn.started = true;
        machine.streamStart();
    }

    function useTool({ id, name, label, status = 'running' }) {
        const entry = extras.get(turn.replyId);
        const known = status in TOOL_ICONS ? status : 'running';
        const tool = id != null ? entry.tools.find((t) => t.id === id) : null;
        if (tool) {
            Object.assign(tool, { status: known, name: name ?? tool.name, label: label ?? tool.label });
        } else {
            entry.tools.push({ id: id ?? `tool-${entry.tools.length + 1}`, name, label, status: known });
        }
        drawTools(turn.replyId);
        follow();
    }

    /** Ends the reply. Tools still running take `toolStatus`; a reply with nothing to show is taken out. */
    function closeReply(toolStatus) {
        const id = turn.replyId;
        turn = null;
        const entry = extras.get(id);
        for (const tool of entry.tools) if (tool.status === 'running') tool.status = toolStatus;
        if (!viewMessage(id).text && !entry.tools.length && entry.meta === undefined) {
            view.remove(id);
            extras.delete(id);
            return;
        }
        view.endStream();
        drawTools(id);
        drawControls(id);
        drawFooter(id);
        follow();
    }

    function endMessage({ text: final, conversationId, meta }) {
        const id = turn.replyId;
        const entry = extras.get(id);
        if (final && !viewMessage(id).text) view.appendChunk(final);
        if (meta !== undefined) entry.meta = { ...(entry.meta ?? {}), ...meta };
        if (conversationId) setConversationId(activeId, conversationId);
        const reply = viewMessage(id).text;
        closeReply('done');
        machine.streamComplete({ text: reply, meta: entry.meta });
        syncWelcome();
        changed();
    }

    function failTurn({ message }) {
        const body = message || text.unknownError;
        closeReply('stopped');
        machine.error(body);
        appendMessage('error', body);
        syncWelcome();
        changed();
    }

    /** Stops the reply: the chat can send again at once, whatever the backend does next. */
    function cancel() {
        if (!turn) return false;
        const { request } = turn;
        closeReply('stopped');
        machine.cancel();
        callCancel(request);
        syncWelcome();
        changed();
        return true;
    }

    function callCancel(request) {
        const failed = (error) => logger?.warn?.('chat-shell', 'Cancel failed', { error });
        try {
            Promise.resolve(transport.cancel?.(request)).catch(failed);
        } catch (error) {
            failed(error);
        }
    }

    function setConversationId(tabId, conversationId) {
        const tab = tabOf(tabId);
        if (!tab) return false;
        tab.conversationId = conversationId ?? null;
        if (tab.id === activeId) machine.conversationId = tab.conversationId;
        return true;
    }

    /** Replaces a conversation's messages (a backend knew better). The one a turn is writing to refuses. */
    function setMessages(tabId, messages) {
        const tab = tabOf(tabId);
        if (!tab || (turn && tab.id === activeId)) return false;
        tab.messages = restored(messages);
        tab.scrollTop = null;
        if (tab.id === activeId) showTab(tab);
        changed();
        return true;
    }

    // ── the bar: modes ───────────────────────────────────────────────────
    const modeButtons = new Map();
    if (modes.length) {
        const group = el('div', 'twm-chat-shell__modes');
        group.setAttribute('role', 'group');
        group.setAttribute('aria-label', text.modes);
        for (const { id, label, title } of modes) {
            const b = el('button', 'twm-chat-shell__mode', label);
            b.type = 'button';
            if (title) b.title = title;
            b.addEventListener('click', () => {
                if (id === machine.mode) return;
                setMode(id);
                safely(onModeChange, id);
            });
            modeButtons.set(id, b);
            group.append(b);
        }
        bar.append(group);
    }
    function drawMode() {
        for (const [id, b] of modeButtons) {
            const on = id === machine.mode;
            b.classList.toggle('twm-chat-shell__mode--on', on);
            b.setAttribute('aria-pressed', String(on));
        }
    }
    function setMode(id) {
        if (!modeButtons.has(id)) return false;
        machine.setMode(id);
        drawMode();
        return true;
    }
    drawMode();
    bar.append(el('div', 'twm-chat-shell__bar-spacer'));

    // ── the bar: the model picker ────────────────────────────────────────
    let currentModels = { items: [], activeId: null, label: null, status: null };
    const modelBtn = el('button', 'twm-chat-shell__model-btn');
    modelBtn.type = 'button';
    modelBtn.setAttribute('aria-haspopup', 'menu');
    const modelDot = el('span', 'twm-chat-shell__status');
    const modelLabel = el('span', 'twm-chat-shell__model-label');
    modelBtn.append(modelDot, modelLabel, icon('expand_more', 'twm-chat-shell__model-chevron'));
    bar.append(modelBtn);
    /** ActionDropdown puts an option's label and description in as markup; these are text. */
    const asMarkup = (value) => {
        const span = el('span');
        span.textContent = String(value ?? '');
        return span.innerHTML;
    };
    const modelMenu = new ActionDropdown({
        trigger: modelBtn,
        options: [],
        className: 'twm-chat-shell__model-menu',
        onSelect: ({ item }) => {
            if (item.action !== undefined) safely(onModelAction, item.action, item);
            else safely(onModelSelect, item);
        },
    });

    /**
     * Any of `{ items, activeId, label, status }`; what is left out stays. An item
     * is `{ id, label, description?, icon? }`, `{ action, label, description?, icon? }`
     * or `{ separator: true }`. `label` is the button's text (the active item's
     * without it); `status` is `{ state?: 'ready' | 'pending', label? }`, a dot on it.
     */
    function setModels(patch = {}) {
        currentModels = { ...currentModels, ...patch };
        const { items, activeId: active, label, status } = currentModels;
        modelMenu.setOptions(items.map((item) => {
            if (item.separator) return { separator: true };
            const isAction = item.action !== undefined;
            const radio = item.id === active ? 'radio_button_checked' : 'radio_button_unchecked';
            return {
                type: isAction ? 'action' : 'model',
                item,
                label: asMarkup(item.label),
                icon: item.icon ?? (isAction ? undefined : radio),
                description: item.description ? asMarkup(item.description) : undefined,
            };
        }));
        modelLabel.textContent = label ?? items.find((i) => !i.separator && i.id === active)?.label ?? text.selectModel;
        modelDot.className = status?.state
            ? `twm-chat-shell__status twm-chat-shell__status--${status.state}` : 'twm-chat-shell__status';
        modelDot.title = status?.label ?? '';
        modelDot.hidden = !status;
        modelBtn.hidden = !items.length && !label;
        bar.hidden = modelBtn.hidden && !modes.length;
    }
    setModels(models ?? {});

    // ── the chat ─────────────────────────────────────────────────────────
    const chat = {
        root,
        /** Sends as the user would; false when a turn is running or the text is blank. */
        send,
        /** Stops the running reply; false when there is none. */
        cancel,
        /** A turn is running. Answers at once, where `stateMachine` follows in microtasks. */
        isBusy: () => turn !== null,
        stateMachine: machine,

        /** The messages of the conversation in front. */
        messages: keptMessages,
        /** Merges into a message's `meta`, redraws its controls, and reports a change. */
        updateMeta(id, patch) {
            const entry = extras.get(id);
            if (!entry) return false;
            entry.meta = { ...(entry.meta ?? {}), ...patch };
            drawControls(id);
            changed();
            return true;
        },
        refreshControls: (id) => drawControls(id),
        /** The element holding a message's controls, or null. */
        controlsSlot: (id) => extras.get(id)?.controlsEl ?? null,

        snapshot,
        activeConversation: () => activeId,
        newConversation,
        switchTo,
        close,
        rename,
        reset,
        setConversationId,
        setMessages,

        mode: () => machine.mode,
        setMode,
        setModels,

        getText: () => view.getText(),
        setText: (value) => view.setText(value),
        focus: () => view.focus(),

        destroy() {
            if (destroyed) return;
            destroyed = true;
            if (turn) {
                const { request } = turn;
                turn = null;
                callCancel(request);
            }
            for (const timer of copyTimers) clearTimeout(timer);
            copyTimers.clear();
            extras.clear();
            modelMenu.destroy();
            strip.destroy();
            view.destroy();
            root.remove();
        },
    };

    // ── what it starts with ──────────────────────────────────────────────
    for (const saved of conversations?.tabs ?? []) {
        tabs.push({
            ...newTab(String(saved.id)),
            title: saved.title || text.newConversation,
            conversationId: saved.conversationId ?? null,
            messages: restored(saved.messages),
        });
    }
    const first = tabOf(conversations?.activeId) ?? tabs[0] ?? freshTab();
    activeId = first.id;
    if (first.conversationId) machine.loadConversation(first.conversationId);
    showTab(first);
    drawTabs();
    return chat;
}
