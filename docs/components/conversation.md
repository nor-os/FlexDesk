# Conversation view

> **Package:** `@flexdesk/widgets` · [All docs](../README.md)

A transcript of role-tagged messages above a composer. It has no Markdown and no model in it: you draw a message's body, and it tells you when the user submits or cancels.

## A conversation: `mountConversationView` (0.17.0)

A transcript of role-tagged messages above a composer, in `@flexdesk/widgets`.
It has no markdown and no model in it: you draw a message's body, and it tells
you when the user submits or cancels.

```js
const view = mountConversationView(el, {
    render:   (message, bodyEl, { streaming }) => { bodyEl.innerHTML = toHtml(message.text); },
    onSubmit: (text) => { view.append({ role: 'user', text }); view.setBusy(true); ask(text); },
    onCancel: () => abort(),
    placeholder: 'Ask anything',
});
view.beginStream({ role: 'assistant' });
for await (const chunk of reply) view.appendChunk(chunk);  // re-renders this message only
view.endStream();
view.setBusy(false);
```

| Method | Does |
|---|---|
| `append({ id?, role, text, meta? })` → id | Adds a message; `role` becomes `twm-chat__msg--<role>` |
| `replaceAll(messages)`, `clear()` | Restores a transcript (and scrolls to its end), or empties it |
| `beginStream(message?)` → id, `appendChunk(text)`, `endStream()` | A message that grows; each chunk re-renders that message's body and nothing else |
| `slot(id)` | The element below a message's body, yours to fill (tool output, buttons); a re-render leaves it alone |
| `messages()`, `streamingId()` | Copies of the messages; the one streaming |
| `getScrollTop()`, `setScrollTop(px)`, `scrollToBottom()`, `isPinned()` | The transcript's scroll position, to keep across a remount |
| `setBusy(bool)`, `isBusy()` | `true` turns Send into Cancel |
| `getText()`, `setText(text)`, `focus()`, `destroy()` | The composer, and teardown |

- **`render(message, bodyEl, { streaming })`** fills an emptied body. One that
  throws leaves that message as its plain text and the view carries on; the
  error goes to `onRenderError(error, message)`. Without `render`, every body
  is plain text (`textContent`, never markup).
- **Pinned to the bottom.** The transcript starts out following new content.
  Any scroll up, even a few px from the end (the first frame of a smooth wheel
  or arrow-key scroll), stops that and shows *Jump to latest*, and later chunks
  leave the reader where they are. It follows again only after a scroll down
  that ends within `pinThreshold` px (32) of the end, a click on *Jump to
  latest*, `scrollToBottom()`, `replaceAll()` / `clear()`, or a
  `setScrollTop(px)` that lands within the threshold. Content growing below
  never unpins it, nor does content shrinking under it (the browser moves
  `scrollTop` back to the new end, which is not the reader scrolling). A wheel
  over a scroller nested in a body or a slot (a `<pre>`, a tool-output box)
  scrolls that scroller (or, at its top with `overscroll-behavior: contain`,
  keeps the wheel), and a wheel a handler in the transcript cancels, a
  Ctrl+wheel (page zoom, or a trackpad pinch) and a wheel up over a transcript
  already at its top move nothing, so in all these cases the transcript keeps
  following.
- **The composer** grows with its text up to `composerMaxHeight` (200 px).
  Enter submits and clears it (blank text is ignored, and so is Enter during
  IME composition); Shift+Enter is left to the browser, which inserts the
  newline (so undo and `input` listeners see it). While busy, Enter submits
  nothing, and Esc (wherever focus is inside the view) or a click on Cancel
  calls `onCancel` once per busy period. That Esc goes no further
  (`stopPropagation`), so a `ManagedWindow` or panel holding the view that
  closes on Escape stays open. An Esc a handler inside the view has already
  consumed (`preventDefault`, e.g. an inline popup in the transcript closing
  itself) is left alone: it neither cancels nor is stopped.
- **Ids are unique.** `append`, `beginStream` or `replaceAll` with an id already
  in the transcript (or repeated within the `replaceAll` list) throws, and the
  refused call changes nothing: no row, no open stream, the old transcript kept.
- `labels: { send, cancel, jump, input }` replaces the four texts.

`tests/conversation_view.test.mjs` drives all of it in jsdom with a fake
scroll geometry.
