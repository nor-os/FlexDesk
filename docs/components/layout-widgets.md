# Tabs, section stacks and scrollbars

> **Package:** `@flexdesk/widgets` · [All docs](../README.md)

`createTabs` draws one tab strip keyed by your own ids, with or without the panes behind it. `createSectionStack` draws inspector-style titled sections in a column, each opened and closed from its header. `installAutoScrollbars` replaces the browser's scrollbars with thin overlay bars.

## Scrollbars

`installAutoScrollbars(root)` (from `@flexdesk/widgets`) replaces the browser's
scrollbars under `root` with thin overlay bars that show while an element is
hovered or scrolling and fade out afterwards. Native bars are hidden, so no
element reserves layout width for one. The overlay bars live in one fixed
layer, so a container that redraws its contents cannot lose its bar, and
textareas get one too. Containers that already use `installOverlayScrollbar`
keep their own.

`installCollapsibleScrollbars(root = document.body)` gives every
`.twm-collapsible-content.visible` section under `root` a vertical overlay
bar: the ones already visible at once, and the ones mounted or expanded
later. It watches `root` only and returns a disconnect. (It used to take no
argument and look for a `#twm-fixed-200` that nothing created, so visible
sections got no bar until a class changed — BUG-0006.)

## A stack of collapsible sections: `createSectionStack` (0.17.0)

Inspector-style panel content: titled sections in a column, each opened and
closed from its header. It is built from the tree's `.twm-collapsible-*`
pieces plus `.twm-section-stack*` (`@flexdesk/widgets`).

```js
const stack = createSectionStack(panel, {
    sections: [
        { id: 'notes', title: 'Notes', icon: 'edit_note', content: notesEl },
        { id: 'chat', title: 'Assistant', fill: true,
          actions: [{ icon: 'delete', label: 'Clear', onClick: (id, event) => clear() }] },
        { id: 'params', title: 'Parameters', defaultExpanded: false },
    ],
    key: 'inspector.sections',
    stateStore: { read: (key) => saved[key], write: (key, map) => { saved[key] = map; } },
});
stack.body('params').appendChild(paramsEl);
const off = stack.on('toggled', ({ id, expanded, source }) => { /* … */ });
```

- **The header toggles, its actions do not.** A click anywhere on a header
  opens or closes the section and turns its arrow. A click on one of its
  `actions` runs that action's `onClick(sectionId, event)` and nothing else.
  The toggle is a `<button>`, so Enter and Space work.
- **`defaultExpanded`** is `true` unless a section says `false`.
- **One `fill` section** takes the height the others leave, and its body is
  what scrolls (`min-height: 0`). A long conversation scrolls inside its
  section and the panel stays the size of the window. The stack is
  `height: 100%` of its container, so give the container a height. A closed
  fill section is only its header.
- **Remembering is injected.** `stateStore` is `{ read(key), write(key, map) }`.
  `map` is `{ [sectionId]: expanded }`, and it is written on every open and
  close under `key`. `read` may return a promise. Until it settles the
  sections show their defaults; a section somebody toggled in the meantime
  keeps that choice, and that toggle is written once the read has settled,
  over the stored states of the sections nobody touched. `stack.ready` resolves once the read has been applied. A
  store that throws, rejects or returns anything other than a map leaves every
  section on its `defaultExpanded`. Without a store nothing is remembered.
- **`setVisible(id, false)`** takes a section off the stack and keeps its
  state, so `setVisible(id, true)` brings it back open or closed as it was.
  `isVisible(id)` reads it.
- `expand(id)`, `collapse(id)`, `toggle(id)` and `isExpanded(id)` work on
  any section, hidden or not. An unknown id throws.
- **`toggled`** fires on each change with `{ id, expanded, source }`, where
  `source` is `'user'`, `'api'` or `'restore'` (a stored state that arrived
  after mount). `on('toggled', fn)` returns the function that stops listening.
- **`dispose()`** removes the stack's listener and every node it made, along
  with any `content` you passed in.

`tests/section_stack.test.mjs` covers each of these in jsdom. The fill
layout was also measured in headless Edge.

## Tabs: `createTabs` (0.17.0)

One tab strip, from `@flexdesk/widgets`, keyed by whatever ids you give it — not
by file path (`NotebookTabBar`) and not by a bus event (`createBottomPanelTabs`,
which is now built on it). It is a strip and nothing else, or a strip with the
panes behind it.

```js
const tabs = createTabs(el, {
    items: [
        { id: 'inputs',  label: 'Inputs', icon: 'tune', title: 'Model inputs' },
        { id: 'results', label: 'Results', badge: { count: 3, level: 'warning' } },
        { id: 'draft',   label: 'Draft', dirty: true, closable: true },
    ],
    active: 'inputs',
    onSelect: (id, item) => …,
    onReselect: (id, item) => …,                                       // optional: a click on the tab in front
    onClose: (id) => tabs.update(items.filter((i) => i.id !== id)),   // optional
    onReorder: (ids) => …,                                             // optional: tabs drag
    onContextMenu: (id, event, item) => …,                             // optional
    mountPane: (item, paneEl, tabs) => ({ onShow() {}, destroy() {} }), // optional: strip only
    compact: false,
    label: 'Views',
});
tabs.update(nextItems, 'results');
tabs.setBadge('results', 7, 'alert');
tabs.setIndicator('inputs', 'info');
```

| Member | Does |
|---|---|
| `update(items, activeId?)` | Replaces the items, keeping the button of every id it keeps. In front: `activeId` if present, else the tab in front now if it is still there, else the first (none when no items are left). Panes of items that went are destroyed |
| `select(id)`, `active()`, `has(id)`, `ids()` | The tab in front; `select` answers false for an id it does not have |
| `setBadge(id, n, level?)` | A count, `99+` above 99, none at zero; `level` is `info`, `warning` or `alert` (`TAB_LEVELS`) |
| `setIndicator(id, value)` | A dot: a level, `true` for the neutral one, falsy for none |
| `instance(id)`, `instances()` | The mounted panes' instances |
| `destroy()` | Destroys the panes, lets the bus go, removes the markup |

- **Panes mount on first selection.** The tab in front at creation counts;
  `eager: true` on an item mounts its pane at once — at creation, or in the
  `update` that brings the item in, before the tab in front is settled. Each
  instance hears `onShow()` whenever its tab comes to the front and `destroy()`
  when its item goes.
- **`onSelect` hears changes**, not the tab chosen at creation. A click on the
  tab already in front is not a change; `onReselect(id, item)` hears it. An
  `update` that leaves no items empties the front, heard as `onSelect(null, null)`.
- **The bus is opt-in:** pass `eventBus` *and* `selectEvent: 'views:show'` and
  that event selects `payload.id` (or `selectFrom(payload)`). No event name, no
  subscription.
- **Keys** follow the ARIA tabs pattern with automatic activation:
  ArrowLeft/ArrowRight (wrapping), Home, End; Delete (and a middle click) closes
  a closable tab. Only the tab in front is in the tab order. When an `update`
  removes the tab that has focus (Delete, then your `onClose` drops it), focus
  moves to the tab now in front instead of falling to the page. Focus that the
  update put somewhere else (a pane that focuses itself in `onShow`) stays there.
- **Overflow scrolls**, never wraps: a vertical wheel moves the strip sideways and
  the tab coming to the front is scrolled into view (`revealInStrip`,
  `wheelStripSideways`, shared with `NotebookTabBar`).
- **Classes** are BEM under `block` (default `twm-tabs`): `__tabs`, `__tab`,
  `__tab--on`, `__tab--dirty`, `__tab--closable` (it has a close mark), `__icon`,
  `__label`, `__badge`, `__indicator`, `__dirty`, `__close`, `__body`,
  `--compact`, and `twm-tabs-pane`. A dirty tab shows its dot until hovered,
  then its close mark; one with no close mark keeps the dot. Tabs and panes
  carry the id in `data-tab-id` (`dataKey`), as a string; callbacks and `ids()`
  hand back the id as you gave it, so a numeric id stays a number.

`tests/tabs.test.mjs` covers it in jsdom; `tests/bottom_panel_tabs.test.mjs`
runs on the bottom panel built over it. The bottom panel behaves as it did:
`api.root` is set inside a pane's `mount`, and a click on the tab in front
re-shows its pane, fires `onSelect` and is remembered, as `select` does. A
remembered tab that is already in front when `remember.read` answers is shown
again: its pane hears `onShow` and `onSelect` fires, and nothing is written back.
