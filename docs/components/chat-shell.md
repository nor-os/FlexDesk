# Assistant chat shell

> **Package:** `@flexdesk/widgets` · [All docs](../README.md)

A whole assistant chat over the [conversation view](conversation.md): conversation tabs, an optional mode toggle, a model picker, a reply that streams, Markdown bodies, time and copy on every message, and a slot for your own controls. It knows no provider and nothing of what a reply is about.

## An assistant chat: `mountChatShell` (0.18.0)

```js
import { mountChatShell } from '@flexdesk/widgets';

const chat = mountChatShell(el, {
    transport: {
        send(request, emit) { backend.ask(request, (e) => emit(toChatEvent(e))); },
        cancel(request)     { backend.stop(); },
    },
    modes: [{ id: 'ask', label: 'Ask' }, { id: 'act', label: 'Act' }],
    models: { items: [{ id: 'large', label: 'Large' }, { id: 'small', label: 'Small' }], activeId: 'large' },
    onModelSelect: (item) => chat.setModels({ activeId: item.id }),
    renderControls: (el, message) => drawMyControls(el, message.meta),
    conversations: JSON.parse(localStorage.getItem('chat') ?? 'null'),
    onChange: (snapshot) => localStorage.setItem('chat', JSON.stringify(snapshot)),
    placeholder: 'Ask anything',
    welcome: { icon: 'smart_toy', text: 'What can I help you with?' },
});
```

The chat fills its host. It needs `flexdesk.css`, and the Material Symbols font for its icons.

| Option | Is |
|---|---|
| `transport` | **Required.** `{ send(request, emit), cancel?(request) }` |
| `renderControls(el, message, chat)` | Fills the slot on an assistant message |
| `markdown` | Options for [`renderMarkdown`](markdown-and-outline.md) (`highlight`, `math`, `inlineRules`, ...) |
| `onChange(snapshot)` | Something worth keeping changed: a message arrived or finished, a conversation or its meta changed. Not called per text delta |
| `onConversationChange(conversation, reason)` | Another conversation is in front; `reason` is `new`, `switch`, `close` or `reset`. `conversation` is `{ id, title, conversationId, messages }` |
| `modes`, `mode`, `onModeChange(id)` | `[{ id, label, title? }]`. The labels are yours. No modes, no toggle |
| `models`, `onModelSelect(item)`, `onModelAction(action, item)` | See [The model picker](#the-model-picker) |
| `conversations` | A `snapshot()` to restore |
| `titleFrom(text)` | A new conversation's title, from its first message. Default: the first 30 characters |
| `formatTime(at, message)` | A message's time; `''` shows none. Default: the locale's hours and minutes |
| `placeholder`, `welcome: { icon?, text }` | The composer's placeholder; what an empty transcript shows |
| `labels` | Over `CHAT_SHELL_LABELS`, every text the chat shows |
| `eventBus`, `logger` | `eventBus` gets `CHAT_BUS_EVENTS` |

### The transport

`send(request, emit)` starts a turn. A request is `{ text, tabId, conversationId, mode, model }`: `tabId` is the conversation's tab, `conversationId` is your backend's id (`null` until you give one), `model` is the picker's `activeId`.

`emit` takes normalised events, one at a time (`CHAT_TRANSPORT_EVENTS`):

| Event | Does |
|---|---|
| `{ type: 'text-delta', text }` | Adds to the reply, which re-renders |
| `{ type: 'tool-use', id?, name, label?, status? }` | Lists a tool call under the reply, or updates the one with that `id`. `status` is `running` (the default), `done` or `error`; `label` is shown instead of `name` |
| `{ type: 'message-end', text?, conversationId?, meta? }` | Ends the turn. `text` fills the reply only if nothing was streamed; `conversationId` is kept; `meta` is merged into the message's |
| `{ type: 'error', message }` | Ends the turn with an error message in the transcript |

Every `emit` belongs to its turn, and what it is handed after that turn ended or was cancelled is dropped. So a late chunk, or a backend's own report that it was cancelled, needs no filtering of yours. A `send` that throws, or answers a promise that rejects, is an `error` event. To tell the chat a backend id before the turn ends, call `setConversationId(request.tabId, id)`.

A backend that pushes to a global is one small adapter:

```js
let emit = null;
window.myBridge = {
    onChunk: ({ chunk }) => emit?.({ type: 'text-delta', text: chunk }),
    onDone: ({ text, id, changes }) => emit?.({ type: 'message-end', text, conversationId: id, meta: { changes } }),
    onError: ({ error }) => emit?.({ type: 'error', message: error }),
};
const transport = {
    async send(request, e) {
        emit = e;
        const result = await api.ask(request);
        if (!result.ok) throw new Error(result.error);
    },
    cancel: () => api.stop(),
};
```

### A turn

The user's message goes in, then a streamed assistant message that shows the typing dots while it is empty. While the turn runs, Send is Cancel and Esc cancels, as in the conversation view, and the New and Clear buttons are disabled. A turn ends in one of three ways:

- **`message-end`.** Running tools become `done`. The message gets its controls, its time and its copy button.
- **Stop.** Cancel, Esc or `chat.cancel()`. What arrived stays, running tools become `stopped`, and `transport.cancel(request)` is called once. The chat can send again at once, whatever the backend does next.
- **`error`.** As Stop without `transport.cancel`, and an error message follows. While it is the last message it carries *Retry*, which sends the user message before it again.

In all three, a reply left with no text, no tool call and no `meta` is taken out. `chat.isBusy()` answers at once.

### Conversations

The chat owns the tabs: one per conversation, with a close mark while there is more than one, double-click or F2 to rename, a New button and a Clear button (which asks first when there is something to clear). A new conversation takes its title from its first message unless you renamed it. While a turn runs, the conversation in front cannot be left, closed or cleared; a switch is refused and the strip stays where it was.

`chat.snapshot()` is plain data to keep, and `conversations` takes it back:

```js
{ activeId, tabs: [{ id, title, conversationId, messages: [{ id, role, text, at?, tools?, meta? }] }] }
```

A reply still empty is not in a snapshot, and a tool that was `running` when a snapshot was taken comes back `stopped`.

| Method | Does |
|---|---|
| `send(text)`, `cancel()` → bool | As the user would; false when refused |
| `isBusy()`, `messages()`, `snapshot()` | A turn is running; the messages in front; everything to keep |
| `activeConversation()`, `newConversation()` → id, `switchTo(id)`, `close(id)`, `rename(id, title)`, `reset()` | The tabs. `reset` empties the one in front. Refused ones answer false (`newConversation`: null) |
| `setConversationId(tabId, id)` | Your backend's id for a conversation |
| `setMessages(tabId, messages)` | Replaces a conversation's messages, when your backend knows better. The one a turn is writing to refuses |
| `updateMeta(id, patch)`, `refreshControls(id)`, `controlsSlot(id)` | A message's controls, below |
| `mode()`, `setMode(id)`, `setModels(patch)` | The bar |
| `getText()`, `setText(text)`, `focus()`, `destroy()` | The composer, and teardown. `destroy` cancels a running turn |
| `root`, `stateMachine` | The element, and the machine below |

### Your controls on a message

Each assistant message has a slot between its tool calls and its footer. `renderControls(el, message, chat)` fills an emptied `el` when the reply has finished, and again when the message comes back on a tab switch or a restore, after `updateMeta(id, patch)`, and on `refreshControls(id)`. It is not called while a reply streams. Whatever it needs to survive goes in `message.meta`, which is kept in snapshots and handed back untouched:

```js
renderControls(el, message, chat) {
    if (!message.meta?.changes) return;
    const button = document.createElement('button');
    button.textContent = message.meta.undone ? 'Redo' : 'Undo';
    button.onclick = () => chat.updateMeta(message.id, { undone: !message.meta.undone });
    el.append(button);
}
```

A `renderControls` that throws is logged and the chat carries on.

### The model picker

An [`ActionDropdown`](menus.md) on a button in the bar. It is controlled: choosing an entry calls your callback, and the picker changes when you call `setModels`. `setModels` takes any of these; what you leave out stays.

| Key | Is |
|---|---|
| `items` | Entries: `{ id, label, description?, icon? }` (a model), `{ action, label, description?, icon? }` (a command), `{ separator: true }`. Labels and descriptions are text, never markup |
| `activeId` | The model marked, and `request.model` |
| `label` | The button's text. Default: the active item's label, then `labels.selectModel` |
| `status` | `{ state?: 'ready' \| 'pending', label? }`: a dot on the button, its tooltip the label. None without `status` |

A model calls `onModelSelect(item)`; a command calls `onModelAction(action, item)`. You get your own item back, with whatever else you put on it. With no items and no label there is no button; with no modes either there is no bar.

### The state machine

`ChatStateMachine` is the conversation lifecycle with no view in it, exported for a chat of your own. `chat.stateMachine` is the shell's.

| State | Goes to |
|---|---|
| `idle` | `waiting` (`sendMessage`) |
| `waiting` | `streaming` (`streamStart`), `idle` (`streamComplete`, `cancel`, `reset`), `error` (`error`) |
| `streaming` | `idle` (`streamComplete`, `cancel`, `reset`), `error` (`error`) |
| `error` | `waiting` (`sendMessage`), `idle` (`reset`) |

`newConversation()` and `loadConversation(id)` go back to `idle` from anywhere. `canSend()`, `isProcessing()`, `mode`, `setMode(mode)`, `conversationId` and `lastError` read and set the rest; a mode is any string of yours.

Calls are queued in order, because text can arrive in the same tick as the request that asked for it, and each answers a promise of `{ transitioned, reason? }`. A transition the state does not have is refused, not thrown. So `getState()` lags a call by some microtasks, and is `null` until the machine has entered `idle`; `settled()` resolves when everything called so far has taken effect.

`new ChatStateMachine({ eventBus, logger, mode, onChange })`: `onChange({ state, conversationId, mode })` hears every state entered. `eventBus` gets `CHAT_BUS_EVENTS`:

| Constant | Event | Payload |
|---|---|---|
| `STATE_CHANGED` | `chat:state:changed` | `{ state, conversationId, mode }` |
| `MESSAGE_SENT` | `chat:message:sent` | `{ conversationId, text, mode }` |
| `STREAM_COMPLETE` | `chat:stream:completed` | `{ conversationId, text, meta }` from the shell |
| `MODE_CHANGED` | `chat:mode:changed` | `{ mode }` |
| `CONVERSATION_NEW` | `chat:conversation:new` | `{}` |
| `CONVERSATION_LOADED` | `chat:conversation:loaded` | `{ conversationId }` |
| `ERROR` | `chat:error:raised` | `{ conversationId, message, detail }` |

### Classes

The block is `twm-chat-shell`, around the conversation view's `twm-chat`: `__tab-bar`, `__tabs`, `__tab-btn` (`--clear`), `__rename`, `__conversation`, `__welcome`, `__welcome-icon`, `__welcome-text`, `__typing`, `__tools`, `__tool` (`--running`, `--done`, `--error`, `--stopped`), `__tool-icon`, `__tool-label`, `__controls`, `__footer`, `__time`, `__copy` (`--done`), `__retry`, `__bar`, `__bar-spacer`, `__modes`, `__mode` (`--on`), `__model-btn`, `__model-label`, `__model-chevron`, `__model-menu`, `__status` (`--ready`, `--pending`).

A message's role is the view's modifier, `twm-chat__msg--<role>`; the shell uses `user`, `assistant` and `error`. Every rule reads FlexDesk's tokens. Nothing is stored in a `data-` attribute beyond the tab strip's `data-tab-id` and the dropdown's own keys.

`tests/chat_shell.test.mjs` and `tests/chat_state_machine.test.mjs` cover all of this in jsdom.
