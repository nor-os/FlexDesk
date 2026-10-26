# Notifications and progress

> **Package:** `@flexdesk/widgets` · [All docs](../README.md)

Toasts, a history of them behind a bell, and an alert log. A toast is the moment; the alert log keeps what came in until it is dismissed. Progress bars, lists and phases change in place, and a toast can track a job with one.

## Progress: bars, lists and phases (0.17.0)

Three classes in `widgets`, each building its own element (`.element`, appended
to `host` when one is given) and changing it **in place**: an update twenty
times a second gets the same nodes back every time, so hover, tooltips and the
fill's transition survive. Names and labels are text.

| Class | Does |
|---|---|
| `new ProgressBar(host, { value, max, indeterminate, label, showPercent, showCount, showElapsed, onCancel })` | `update(0.42)` (a fraction) or `update(21)` with `max` (a count, read "42% · 21 / 50"); `update({ value, max, label, indeterminate })`; `setState('done' \| 'error' \| 'cancelled')` ends it and stops the elapsed clock, `setState('running')` resumes it; `fraction`, `state`, `elapsed` |
| `new ProgressList(host, { items, stats, pulse, emptyText })` | Keyed rows `{ key, name, completed, total?, state, detail? }`, `state` one of `pending`, `running`, `done`, `failed`. `setItems` reconciles by key: a known key keeps its row. A row without `total` is drawn against the largest item. `stats: true` writes a summary line, a function `(items) => string` writes yours, `false` none. Running rows pulse |
| `new StepProgress(host, { steps })` | Ordered phases (`{ key, label }` or a label). `setStep(keyOrIndex, { pass, passes })` makes one active, those before it done and those after pending, and reads "pass 2 of 5"; `fail()` marks the active one error; `complete()` |

```js
const list = new ProgressList(panel, { items: [] });
job.on('tick', (workers) => list.setItems(workers.map((w) => ({
    key: w.id, name: w.label, completed: w.done, total: w.total, state: w.state }))));
```

`showRunProgressDialog` and `showComputingWindow` take `progress` (`true`, or
ProgressBar options) and `steps`, fixed when the dialog opens. Their handles
gain `setProgress(next)` and `setStep(which, opts)`, which throw when the dialog
was opened without `progress` or `steps` respectively, and **`result`**, a
Promise that settles once with
`{ status, message }`: `complete({ ok })` gives `done` or `error` (the bar and
the phases show it), `cancelled()` gives `cancelled`, and so does **closing the
dialog while it runs** (by its ×, Escape, `close()`, or for `showComputingWindow`
opening another). Closing never calls `onCancel`; only the Stop / Cancel button
does, as before. `showComputingWindow` also gains `complete` and `cancelled`,
after which it shows a Close button.

```js
const dlg = showRunProgressDialog({ title: 'Export', steps: ['Prepare', 'Render', 'Write'],
                                    progress: { showElapsed: true }, onCancel: () => job.stop() });
dlg.setStep(1); dlg.setProgress(0.4);
const { status } = await dlg.result;   // 'done' | 'error' | 'cancelled'
```

`tests/progress.test.mjs` holds all of it in jsdom.

## Notifications: `NotificationCenter`

Toasts, from `toast:show` on the bus (or `toastInfo` / `toastWarn` /
`toastError` / `toastSuccess`) or `show()`. A payload with `persistent: true`
stays until its × is clicked. `history` keeps every notification shown, and
`NotificationHistory` puts it behind a bell in the bottom bar (one entry per toast;
`subscribe(fn)` hears each one, 0.17.3).

*New in 0.11.0:* **`overflow: 'collapse'`.** By default, a toast past
`maxVisible` (3) pushes the oldest off the screen. With `'collapse'`, the toasts
on screen stay, and the rest wait behind one **"+N more"** toast whose count
follows them. Each comes in as a visible one closes. A sticky alert is never
pushed off unseen. Clicking the summary calls `summaryAction(held)` and emits
`notification:summary` with `{held}`, so a history panel can open. Every toast
is in `history` as it arrives, waiting or not.

```js
const nc = new NotificationCenter({ eventBus, maxVisible: 3, overflow: 'collapse',
                                    summaryAction: () => history.open() });
nc.mount(document.body);
```

*New in 0.17.0:* **the toast helpers read no global.** `toastInfo` / `toastWarn` /
`toastError` / `toastSuccess` emit on the bus of the `NotificationCenter` mounted
last; its `dispose()` hands them back. `setToastBus(bus)` points them at another
bus (and returns the one it replaced), `setToastBus(null)` back at the console,
and `getToastBus()` says which is current. With no bus — before any centre is
mounted — a helper logs to the console and throws nothing. Until 0.17.0 they
looked for one application's bus on a window global.

### Progress toasts (0.17.0)

A toast can track a job. `show({ progress })` takes a 0..1 fraction,
`{ value, total }`, or `null` for indeterminate, and draws a `ProgressBar` in
the toast; `status` is a line under the message and `counts` a label beside the
bar. A progress toast is persistent, has a collapse toggle (or `collapsed: true`),
and is not closed by a click on its body or on one of its actions while it runs.

`update(id, patch)` changes only that toast's nodes: `progress`, `status`,
`counts`, `collapsed`, `message`, `title`, `description`, `severity`. No other
toast is redrawn, by an update or by toasts arriving and leaving, so a bar, a
collapsed state and a hover survive (a toast whose title or description appears
or goes is rebuilt in its place). `update()` also reaches a toast held behind
"+N more", and `progress` on a plain toast turns it into a running progress
toast. The toast **runs until a patch gives it an outcome severity**: `success`
ends the bar done, `error` / `fatal` error; any other severity only restyles it.
Once finished the bar keeps that state, whatever severity comes later. A
`durationMs` in a patch to a toast that is not running (re)starts its
auto-dismiss, and `0` keeps it until closed.

With `overflow: 'collapse'`, a running progress toast is never held behind
"+N more" and never counted in it (a held toast that starts running through
`update()` comes on screen at once). It counts toward `maxVisible`, so when the
screen is full the newest other toast steps back into the queue (first in line
to return). Once finished it folds like any other toast. With `'drop'`, the
oldest toast that is not a running job leaves.

```js
const id = nc.show({ title: 'Batch', message: 'Running', progress: 0, counts: '0 / 200',
                     actions: [{ label: 'Stop', handler: () => job.stop() }] });
job.on('tick', (done) => nc.update(id, { progress: { value: done, total: 200 },
                                         counts: `${done} / 200`, status: job.current }));
job.on('end', () => nc.update(id, { progress: 1, severity: 'success', message: 'Done', durationMs: 3000 }));
```

`tests/notification_progress.test.mjs` holds it in jsdom.

### Toast cards are styled and clickable (0.17.2)

A toast card is `.twm-notification` with `.twm-notification--<severity>`
(`info`, `success`, `warn`, `error`, `fatal`), and the "+N more" summary is
`.twm-notification.twm-notification--summary`. `flexdesk.css` gives the card its
background, a left border in the severity's colour (`--color-success`,
`--color-warning`, `--color-danger`; info keeps the blue) and the entry
animation `twm-notification-in`, which the sheet now defines. The card sets
`pointer-events: auto` over the root's `none`, so its buttons and its
click-to-close work. Since [Copy message](#copy-message), click-to-close takes
only a click on the card outside its text.

Until 0.17.2 the card carried the bare `notification` / `notification--<severity>`
classes, which no FlexDesk sheet styled: the card had no background and no
border, and inherited `pointer-events: none`, so its buttons could not be
clicked. A consumer stylesheet that targeted `.notification` should target
`.twm-notification` instead. The live region is `.twm-notification-center__live-region`.
`tests/notification_toast_styles.test.mjs` holds the classes, the cascade and
the sheets.

### One toast, one history entry, one unread (0.17.3)

`history` holds **one entry per toast**, however it was raised: `show()`, the
`warn()` / `error()` / `info()` / `success()` helpers, `toast:show`,
`notification:show` or `log:entry`. A toast that leaves (timeout, ×, overflow,
`clearAll`) marks its own entry `dismissed: true` with the `reason`, and adds
no entry. **`nc.subscribe(fn)`** calls `fn(entry, center)` once for each entry
added, after it is in `history` (not for a `skipHistory` toast, and not for a
dismissal), and answers the unsubscribe; `dispose()` drops every listener.

`NotificationHistory` follows the centre through `subscribe()`: every entry
recorded is one unread on the bell until the popover is opened, also past
`historyLimit`. It no longer watches the bus for toasts, so its
`notificationCenter` is a `NotificationCenter` (or anything with `history` and
`subscribe`).

```js
const off = nc.subscribe((entry) => console.log('recorded', entry.severity, entry.message));
nc.warn('Disk almost full');          // the bell says 1
```

Until 0.17.3 the bell counted only on bus events, so a toast raised through
`show()` / `warn()` / `error()` / `info()` never raised its badge, and a dismissal
was pushed as a second entry: a toast that timed out was in `history` twice
and counted twice. `tests/notification_history_follows_center.test.mjs` holds it.

### Copy message

Right-clicking a toast, or its entry in the `NotificationHistory` popover, opens
the context menu (`showContextMenu`) with **Copy message**. It copies the
notification's title, message and description, one per line and skipping any
that is empty, as plain text through `navigator.clipboard.writeText`. The menu
replaces the browser's native one there. The history popover stays open while
its menu is used. Every context menu draws on `--z-context-menu` (tokens.css),
over toasts (`--z-toast`) and managed windows, so the menu opens over the toast
that was right-clicked.

The text of a toast and of a history entry (title, message, description,
status) is selectable: the sheets give it `user-select: text` over the body's
`none`. A click or double-click on a toast's text (title, message,
description, status) selects it and does not close the toast, nor does a click
that ends a selection inside it. Only a click on the card outside the text (the
header's empty space, the padding, the timestamp) closes it, besides the ×
button. `notificationText(notification)` returns the copied
text, and `showNotificationMenu(event, notification, logger)` opens the menu.
Both are exported from `widgets`. `tests/notification_copy.test.mjs` covers it.

### Alerts with history: a log, a pane, a tab host and a bell (0.14.0)

A toast is the moment. The **alert log** keeps what came in until it is
dismissed, and four pieces draw it. Each works without the others:

| Piece | Entry point | Does |
|---|---|---|
| `createAlertLog({ source, limit })` | `widgets` | Entries `{id, at, level, title, body?, ref?, read}`, newest first; `add`, `receive`, `markRead`, `dismiss`, `unreadCount`, `worstUnread`, `subscribe`, `loadMore` |
| `localSource({ read, write })` | `widgets` | Keeps the whole log in one stored value (localStorage, a workspace file) |
| `mountAlertsPane(el, { log, onOpen, onBadge, rules?, stillMatches? })` | `widgets` | Level chips with counts, a filter, day groups, relative times, Open / Dismiss / Mark all read / Clear, *Load older* |
| `createBottomPanelTabs(el, { panes, remember, store, eventBus })` | `wm` | The `.twm-bp` tab strip, on [`createTabs`](layout-widgets.md#tabs-createtabs-0170): `select`, `setBadge(id, n, level)`, `bottompanel:show {tab}` |
| `new NotificationHistory({ alertLog, mountPoint, alertsTab, onOpen })` | `widgets` | The bell shows the log's unread count in the worst level's colour; a click (and "+N more") opens the Alerts tab |

A **source** is where entries live: `load({offset, limit})` answers
`{entries, more?, unread?}`, plus `markRead(ids | null)` and, optionally,
`dismiss(ids | null)`. Without `dismiss`, the pane offers no Dismiss or Clear.
Levels are `info`, `warning` and `alert`; `warn`, `error` and `danger` are read as
those.

```js
const log = createAlertLog({ source: {
    load: ({ offset, limit }) => api.notifications({ offset, limit }),
    markRead: (ids) => (ids ? Promise.all(ids.map(api.readNotification)) : api.readAll()),
} });
const tabs = createBottomPanelTabs(panelEl, { eventBus, panes: [
    { id: 'alerts', label: 'Alerts', eager: true,
      mount: (el, store, api) => mountAlertsPane(el, { log, onOpen: openRef,
          onBadge: ({ unread, level }) => api.setBadge('alerts', unread, level) }) },
] });
new NotificationHistory({ notificationCenter: nc, eventBus, alertLog: log, mountPoint: statusBarEl }).mount();
```

An eager pane, and the first one shown, mount inside `createBottomPanelTabs`
before it returns. Reach the host through `mount`'s `api` argument, not the
variable being assigned. Without `alertLog` and `mountPoint`, `NotificationHistory`
is the bell it was.
