# Workspace picker

> **Package:** `@flexdesk/widgets` · **See also:** [Menus](menus.md) · [Host port](../concepts/host-port.md) · [All docs](../README.md)

A field in the top bar that names what the window is working in, a switcher that changes it, and a store for "recently opened". FlexDesk does not know what is being picked: the items, the words and what a pick does are yours.

## A field and a switcher: `createWorkspacePicker` (0.18.0)

```js
import { createWorkspacePicker } from '@flexdesk/widgets';

const picker = createWorkspacePicker(topBar, {
    field: {
        layout: 'centered',
        avoid: '.bar-left > *, .bar-right > *',
        icon: 'folder',
        placeholder: 'Nothing open',
        tooltip: 'Click to switch workspace',
    },
    chord: 'Ctrl+P',                     // none by default
    label: 'Switch workspace',
    placeholder: 'Switch workspace: type to filter, Enter to open',
    glyph: 'folder_open',
    load: () => recent.list(),
    describe: (item, { current }) => ({
        id: item.id,
        name: item.name,
        detail: item.location,
        icon: current ? 'folder_open' : 'folder',
        badge: current ? 'current' : '',
    }),
    onPick: (item) => openWorkspace(item),
    onRemove: (item) => recent.remove(item),
    actions: () => [
        { id: 'new', label: 'New workspace', icon: 'add', run: () => createOne() },
        { id: 'open', label: 'Open…', icon: 'folder_open', run: () => openOne() },
    ],
});

picker.setCurrent(openNow);              // named on the field, marked in the list
```

A click on the field or the chord opens the switcher in the field's place, with its input over the field, so the field reads as a search box growing its results. A pick closes it, gives focus back to where it was, and calls `onPick`, or nothing if the row is the current one. What `onPick` does is yours: navigate the whole window, or swap what is open in place.

It returns `{ el, field, switcher, isOpen, current, open({select}), close(), toggle(), setCurrent(item), refresh(), reload(), destroy() }`. `createWorkspacePicker(hostEl, options)` takes everything `createPickerSwitcher` takes, and:

| Option | |
|---|---|
| `field` | `mountPickerField`'s options, plus `placeholder`: its name while nothing is current (drawn muted). `field.icon` is its icon whatever is current; without it the current item's `icon` is used. |
| `chord` | `'Ctrl+P'`, `'Ctrl+Shift+O'`. None by default. Ctrl also answers to Cmd, modifiers are exact, and a held key does not repeat. It is taken on `window` in the capture phase, ahead of an embedded editor and the browser's own use of the key, and it becomes the field's key hint unless `field.keyHint` says otherwise. It still works while the field is hidden for want of room. |

## The field: `mountPickerField` (0.18.0)

`mountPickerField(hostEl, options)` appends a real `<button>` to `hostEl` and returns `{ el, update(patch), setOpen(open), fit(), destroy() }`.

| Option | Default | |
|---|---|---|
| `name`, `icon`, `keyHint`, `tooltip`, `ariaLabel` | empty | Drawn when given. `update` changes any of them, and `muted`. |
| `muted` | `false` | The name drawn as naming nothing (`update({ name: 'n/a', muted: true })`). |
| `caret` | `false` | A trailing caret, for a field that reads as a dropdown. |
| `className` | | Extra classes. |
| `layout` | `'inline'` | `'centered'` stands it in the middle of `hostEl`, whatever stands left and right. |
| `avoid` | | Centred: a selector, within `hostEl`, of what it must not cover. An element counts on the side its centre is on; one taking no room does not count. |
| `maxWidth`, `minWidth`, `tightWidth`, `gap` | 440, 120, 230, 24 | Centred, its width is the room the tighter side leaves, twice over, less `gap`, up to `maxWidth`. Below `tightWidth` the key hint goes. Below `minWidth` the field is hidden. |
| `onActivate` | | A click. |

A centred field's `hostEl` must be positioned. It measures again whenever `hostEl` resizes and when the fonts arrive; call `fit()` after you change what stands beside it. An inline field's width is its host's, and only the key hint responds, to its own width.

## The switcher: `createPickerSwitcher` (0.18.0)

`createPickerSwitcher(options)` is the panel alone, on any anchor or on none. `createWorkspacePicker` is this plus a field.

**Where it opens.** `placement: 'over'` (the default) lays the input over `anchor`, at least `minWidth` (520) wide, kept inside the window; an anchor in the lower half of the window grows the panel upward instead. `placement: 'below'` hangs from it through `ActionDropdown.position`, flipped above when there is no room. With no `anchor`, or one that takes no room, it stands centred over a dimmed page. A window resize places it again.

**What it lists.** `load({ query, offset, limit, signal })` answers an array or `{ items, total?, status? }`, now or in a promise, and is asked on every open, so a list edited behind the page is never stale for long. The last unsearched answer per `cacheKey()` is drawn at once while it is asked again. `status` is the footer's left end, a string or `{ text, error }`. Only the newest question's answer paints; `signal` aborts the older ones.

| `search` | |
|---|---|
| `'local'` (default) | Asked once per open. Typing filters what it answered, on the name, `detail` and `keywords`, with name matches first. |
| `'remote'` | Typing is debounced (`debounceMs`, 200) and asked again. A `total` above what is drawn offers **Load more**, `pageSize` (20) at a time. A server that hands back only what is drawn has no more, whatever it said before. A failed page keeps the rows and says so. |

`describe(item, { current })` turns an item into a row:

| Field | |
|---|---|
| `id` | Required. Two items with one `id` are one row. Make it the form you compare by: `setCurrent` and `open({ select })` go through it. |
| `name` | Required. |
| `detail` | A second line. |
| `icon`, `badge` | An icon, and a short word on the right (the word for the current row, if you want one; the check mark is always drawn). |
| `keywords` | A string or an array: searched, not drawn. |
| `disabled` | Drawn greyed, stepped over by the arrows. |
| `removable` | `false` takes the bin off this row. |
| `title` | The row's tooltip; by default its name and detail. |

**The rest of the panel**, every part optional:

| Option | |
|---|---|
| `onRemove(item)` | A bin on each row, and Shift+Delete on the highlighted one. May answer a promise: while it is unsettled the panel stays open and it and its dimmed page step below managed windows, so a confirmation dialog can be answered with the mouse. Answering `false` keeps the row, rejecting keeps it and shows the error, anything else drops it and asks `load` again. The highlight moves to the next row. |
| `actions({ query })` | Rows after the items: `{ id, label, detail?, icon?, always?, run({ query }) }`. Typing narrows them on their `label` unless `always`, which is how a row offering to create what was typed stays; when nothing else matches, it is what Enter takes. |
| `heading({ query, shown, total })` | `{ title, count }` over the list. |
| `card({ current, row })` | A panel under the list for the current item: `{ heading?, icon?, name, detail?, open?: { label, icon?, run }, columns?, tiles?: [{ id, label, icon?, run }] }`, or `null`. `row` is the current item as the list read it, when it has. |
| `footer()` | `{ start?, end?, keys? }`. `start` and `end` are buttons, `{ id, label, icon?, trailing?, primary?, run }`. `keys`, `[{ keys: ['Shift', 'Del'], label: 'remove' }]`, are drawn only when the panel is centred. |
| `visibleRows` | Scroll past this many two-line rows. |
| `labels` | Any of `loading`, `empty()`, `noMatch(query)`, `failed(err)`, `failedMore(err)`, `failedRemove(err)`, `loadMore({ next, shown, total })`, `remove(name)`. |
| `label`, `listLabel`, `placeholder`, `glyph`, `className`, `onOpenChange(open)` | The panel's and the list's accessible names, the input's placeholder and icon, extra classes, and a callback. |

`refresh()` asks `actions`, `card` and `footer` again. `reload()` asks `load` again. `open({ select })` highlights the row with that `id` when the answer lands. `setCurrent(item)` takes the item whether or not any page holds it.

**Nothing is rebuilt under a pointer.** Every part is reconciled by key, so an answer landing while a row is being pressed leaves that row's node in place and the click still fires.

### The keyboard (0.18.1)

Focus is real: what the keyboard is on is `document.activeElement`, so a screen reader says each stop, the card's and the footer's buttons included, and Tab and the arrows agree about where the reader is.

| Key | |
|---|---|
| The arrows | Walk focus over every stop, wrapping: the input, the rows that can be chosen (a disabled one is stepped over), Load more, the action rows, the card's buttons, the footer's. |
| Tab | The rows are one tab stop: the row last focused, else the current one, else the first. So are the action rows. Out of the panel closes it. |
| A character | Goes to the input from anywhere in the panel, and to nothing else: a keymap does not read it as a shortcut. |
| Enter in the input | Takes what wears the highlight: the first row or action row of what is shown, or, while the answer to what was typed is on its way, the first one when it lands. |
| Enter or Space elsewhere | Takes the row or runs the button with focus. |
| Shift+Delete | Removes the row with focus, or the highlighted one from the input. Focus goes on to the next row. |
| Backspace | The input's in the input. Elsewhere it stops at the panel, where a window manager's keymap would read it as "up one level". |
| Esc | Closes, and gives focus back to where it was. |

A press outside closes and leaves focus where it was pressed. A row that held focus and went away, because an answer no longer holds it, gives focus to the input.

### A trigger of your own (0.18.1)

The field is optional. `createPickerSwitcher` opens on any anchor, so a control of yours can be the trigger:

```js
const switcher = createPickerSwitcher({
    anchor: trigger,
    placement: 'below',
    visibleRows: 5,
    load, describe, onPick, card, footer,
    onOpenChange: (open) => trigger.setAttribute('aria-expanded', String(open)),
});
trigger.addEventListener('click', () => switcher.toggle());
```

A press on the anchor does not count as a press outside, and Esc, a pick or a verb give focus back to it when it had focus. `setCurrent(item)` on the switcher marks the row; naming it on your trigger is yours.

## The field's look: tokens (0.18.1)

Set these over FlexDesk's defaults (`css/tokens.css`) instead of overriding the field's rules:

| Token | Default | |
|---|---|---|
| `--twm-wspicker-field-icon` | `var(--accent-bright)` | Its icon. |
| `--twm-wspicker-field-focus-border` | `var(--accent-bright)` | Its border, focused by keyboard and while open. |
| `--twm-wspicker-field-muted-icon` | `var(--text-muted)` | Its icon while it names nothing (`muted`). |
| `--twm-wspicker-field-muted-style` | `italic` | Its name's `font-style` while muted. |
| `--twm-wspicker-field-muted-opacity` | `0.55` | Its name's opacity while muted. |

## Recently opened: `createRecentItems` (0.18.0)

A most-recent-first list kept through the [host's](../concepts/host-port.md) `state` capability.

```js
import { createRecentItems } from '@flexdesk/widgets';

const recent = createRecentItems({
    host,
    key: 'recent-workspaces',
    identity: (entry) => entry.path.replace(/\\/g, '/'),
    isValid: (entry) => typeof entry?.path === 'string' && entry.path !== '',
    onChange: () => bus.emit('recent:changed'),
    logger,
});
await recent.load();

recent.add({ path, name });     // stamped `openedAt`, moved to the top
recent.remove({ path });        // by identity
recent.clear();
recent.list();                  // frozen copies, most recent first
```

| Option | Default | |
|---|---|---|
| `host`, `key` | required | The host, and the state key. |
| `identity` | `entry.id` | Which two entries are the same one. |
| `isValid` | `identity` answers something | Stored entries failing this are dropped on read, as is one that makes it, `identity` or `groupOf` throw, so `identity` may assume an entry's shape. |
| `capacity` | 10 | The most entries kept, per group. |
| `groupOf` | one group | Counted per group, so one busy kind of entry never pushes another out. |
| `onChange` | | After every change, and after a read that replayed changes. |
| `logger` | | Its `warn` hears a failed read or write. |

**A read that fails is not an empty list.** While `host.state.read` rejects, `load()` answers `false` and the stored list is never written, because writing would replace entries nobody has seen. Changes made meanwhile show in `list()` at once, each asks for the read again, and they are replayed onto the stored list when it is read, which is then written. A read answering something other than an array is a read of an empty store. Once a read has succeeded, `load()` does not read again.

Writes run one at a time and the last carries the latest list, so a host answering out of order cannot leave the older list stored. A host with no `state` keeps the list in memory for the session.
