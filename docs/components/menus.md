# Menus

> **Package:** `@flexdesk/widgets` · [All docs](../README.md)

`createMenuBar` draws File / Edit / View menus from one declarative model, with pointer and keyboard behaviour and the WAI-ARIA menubar roles, and plugs into the shell. `ActionDropdown` draws a dropdown of action buttons from a trigger. `CategoryPicker` draws a categorised picker (search, categories, items, a detail pane) from a trigger.

## Context menus stay inside the window (0.17.9)

FlexDesk's own context menus: `showContextMenu(x, y, items, onAction)`, the
DataTable's right-click menu (its copy items and your `contextMenuItems`), and
`NotebookTabBar`'s tab menu. All three are placed the same way, however many
items they hold:

- **At most the window's height.** A menu is capped at the window's height
  less 8px above and below. A longer menu scrolls inside (flexdesk.css gives
  `.twm-context-menu` and `.nb-context-menu` `overflow-y: auto` and
  `box-sizing: border-box`). Before, a menu had no cap: the DataTable's
  opened above the window's top edge (a 101-item menu at y=-2153 in a 761px
  window), and `showContextMenu`'s ran off the bottom. In both cases the items
  past the edge could not be reached.
- **At the pointer, moved only to fit.** A menu opens with its top-left
  corner at the pointer. When that does not fit, it moves left or up just
  enough, and never past the window's top or left edge.
- **Every item can be reached from the keyboard.** The first enabled item has
  focus when the menu opens. Up/Down (wrapping), Home and End move focus and
  scroll the focused item into view inside the menu. Enter and Space choose,
  and Escape closes. When the menu closes, focus goes back to where it was
  (unless a click elsewhere has already moved it). The DataTable's menu and
  the tab menu now do this too: before, only `showContextMenu` did.
- **Scrolling the menu does not close it.** `showContextMenu` still closes
  when the page scrolls, and the DataTable's menu when anything outside it
  scrolls.

Nothing changes in how you call them.

## A menu bar: `createMenuBar` (0.17.0)

File / Edit / View menus from one declarative model, instead of hand-built
buttons and `showContextMenu` calls. A menu is `{ id, label, items }`; an item
is `{ id, label, shortcut?, disabled?, checked?, radio?, submenu? }` or
`{ separator: true }`:

```js
import { createMenuBar, MenuBar } from '@flexdesk/widgets';

const bar = createMenuBar(document.getElementById('menus'), {
    menus: [
        { id: 'file', label: 'File', items: [
            { id: 'open',   label: 'Open…',       shortcut: 'Ctrl+O' },
            { id: 'recent', label: 'Open recent', submenu: () => recentItems() },  // rebuilt on every open
            { separator: true },
            { id: 'save',   label: 'Save',        shortcut: 'Ctrl+S', disabled: true },
        ] },
        { id: 'view', label: 'View', items: [
            { id: 'grid',  label: 'Show grid', checked: true },                // a check item
            { id: 'light', label: 'Light', radio: 'theme', checked: true },    // a radio group
            { id: 'dark',  label: 'Dark',  radio: 'theme', checked: false },
        ] },
    ],
    onAction: (id, { checked }) => run(id, checked),
});
bar.setEnabled('save', true);     // patches an open menu in place
bar.setChecked('dark', true);     // …and unchecks the rest of the radio group
```

`createMenuBar(el, opts)` returns a `MenuBar` (also exported, for
`instanceof`). Its methods: `open(menuId, { focusItem })`, `close()`,
`focus()`, `isOpen()`, `isEnabled(id)`, `isChecked(id)`, `setEnabled(id, on)`,
`setChecked(id, on)`, `commands()`, `setStyle(style)` (0.17.18, below) and
`dispose()`.

- **Pointer.** Clicking a title opens its menu; while one is open, hovering
  another title switches to it. Hovering an item with a submenu opens it.
- **Keyboard.** Alt (on its own) or F10 focuses the bar. Left/Right move across
  menus, Up/Down/Home/End within one, Right opens a submenu and Left closes it,
  Enter/Space activate. Esc closes one level; the last Esc gives focus back to
  what had it. Disabled items and separators are skipped, and never reach
  `onAction`.
- **Roles.** The WAI-ARIA menubar pattern: `menubar`, `menu`, `menuitem`,
  `menuitemcheckbox`, `menuitemradio`, with `aria-checked`, `aria-disabled`
  and `aria-expanded`.
- `shortcut` is a label: the bar binds no key for it.
- `bar.commands()` returns the model as palette rows (`{ id, label, shortcut,
  context: 'File › Open recent', action }`), so the palette and the bar list the
  same verbs.

In a shell, pass the model as `menuBar` and the element as `chrome.menuBar`
(each needs the other; either alone throws at boot);
`shell.chrome.menuBar` is that `MenuBar`, and its enabled items follow the palette's
own `commands` unless `menuBar.palette` is `false`:

```js
const shell = await createShell({
    // …
    menuBar: { menus, onAction },
    chrome:  { menuBar: document.getElementById('menus') },
});
shell.chrome.menuBar.setEnabled('save', dirty);
```

The bar is `.twm-menubar` (not the older `.twm-menu-bar` icon strip).
`tests/menu_bar.test.mjs` drives it in jsdom; `tests/menu_bar_css.test.mjs`
holds its stylesheet.

## A hamburger instead of the bar: `style: 'hamburger'` (0.17.18)

The same menus can be drawn as one icon button in place of the row of titles,
for a top bar with no room for File / Edit / Help. Its menu lists the menus,
and each one flies out its items: ☰ › File › Open…

```js
const bar = createMenuBar(el, { menus, onAction, style: 'hamburger', label: 'Main menu' });
bar.setStyle('bar');        // and back: bar.setStyle('hamburger')
bar.style;                  // 'bar' | 'hamburger'
```

- **Options.** `style` is `'bar'` (the default) or `'hamburger'`; anything
  else is a boot error. `icon` is the button's Material Symbols glyph
  (`'menu'`). `label` names the button (its `aria-label` and its tooltip).
- **The same model.** `onAction`, `setEnabled`, `setChecked`, `isEnabled`,
  `isChecked` and `commands()` work as in the bar; an item fires with its own
  id, never a hamburger id.
- **`open(menuId, { focusItem })`** opens the hamburger with that menu flown
  out, focus on its row (or, with `focusItem`, on its first item).
- **Keyboard.** Alt or F10 focuses the button; Down, Enter or Space opens it.
  In its menu Up/Down move across the menus, Right flies one out and Left
  closes it. There is no next or previous title, so Left/Right on the button
  itself, and at the top level of its menu, go nowhere. Esc closes one level.
- **`setStyle(style)`** switches at run time (a setting, a narrow window). It
  closes whatever is open and keeps every `setEnabled` / `setChecked`; if the
  bar had focus, the first title (or the button) gets it.
- **Styling.** The bar gets `.twm-menubar--hamburger`, the button
  `.twm-menubar__title--icon`, the size of the top bar's other icon buttons
  (`.twm-panel-toggle-btn`).

In a shell, pass it with the model: `menuBar: { menus, onAction, style:
'hamburger' }`, and switch later through `shell.chrome.menuBar.setStyle(…)`.
A hamburger belongs in the top bar itself (at the left, before the app's
icon), not in the `.twm-global-menu-bar` row below.

## The menu bar in its own row under the top bar (0.17.13)

A shell's menu bar can sit on a second line, as a full-width strip directly
under the top bar. Put `chrome.menuBar` in a `.twm-global-menu-bar` that is a
child of `body.twm-body`, between `.twm-global-top-bar` and the host:

```html
<body class="twm-body">
  <div class="twm-global-top-bar">
    <div class="twm-bar-left">…</div>
    <div class="twm-bar-center twm-top-nav">…</div>
    <div class="twm-bar-right">…</div>
  </div>
  <div class="twm-global-menu-bar">
    <div id="menus"></div>            <!-- chrome.menuBar -->
  </div>
  <div class="twm-host">…</div>     <!-- createShell's root -->
  <div class="twm-global-bottom-bar">…</div>
</body>
```

```js
const shell = await createShell({
    // …
    menuBar: { menus, onAction },
    chrome:  { menuBar: document.getElementById('menus') },
});
```

- **The host gives up the row's height.** `body.twm-body` is a flex column,
  and the row is a fixed-size item in it (`flex: 0 0 auto`). The host still
  takes whatever is left, so it is shorter by the row's height and nothing is
  drawn under the row. The row's height is the bar's (24px) plus its padding
  and its two 1px borders.
- **It is a band of its own, on FlexDesk tokens (0.17.14).** It is a flex row
  with `padding: var(--space-xxs) var(--space-xs)`, background
  `var(--surface-0)` (darker than the top bar), text `var(--text-body)` and a
  `1px solid var(--border-strong)` border above and below, so it is set off
  from the top bar and from the tiles under it. Until 0.17.13 it had
  `var(--surface-1)` and only a `var(--surface-0)` bottom border, and barely
  stood out (STORY-0122). The `.twm-menubar` inside it keeps its own styles.
- **It is not part of the top bar.** It is a sibling of `.twm-global-top-bar`,
  not inside it. A window-drag region bound to the top bar
  (`WindowChromeController`'s `topBar`, which defaults to
  `.twm-global-top-bar`) does not include the row. A press on the row never
  drags the window, and its menus open and take clicks as usual. The row sets
  no `z-index`, so the top bar's dropdowns are drawn over it, and the bar's
  menus (`position: fixed`) are drawn over the page.
- **Windows on the page stop under it.** A `ManagedWindow` on `document.body`
  (no `container`) is clamped, centred and maximised below the top bar and
  the row, not under the row. Windows inside the shell already stay within
  the host.
- **A modal leaves it usable, like the top bar.** A modal `ManagedWindow`'s
  backdrop starts below the top bar (`top: 35px`), so the row, like the top
  bar, is not dimmed and its menus can still be opened while a modal is open.

A shell without the row looks exactly as before: nothing changes until the
page has a `.twm-global-menu-bar`. The row works only inside `body.twm-body`.
Outside it, the top bar is `position: fixed` and would cover the row.
`tests/menu_row_layout.test.mjs` loads flexdesk.css in jsdom and checks the
row's rules, its place after the top bar, the drag region and the window
bounds.

## Action dropdowns: separators (0.17.0)

`new ActionDropdown({ trigger, options, onSelect })` draws one button per
option. An entry `{ separator: true }` in `options` draws a divider instead: a
`<div role="separator" class="twm-action-dropdown-separator">` that takes no
focus, that ArrowUp/ArrowDown pass over, and that never reaches `onSelect`.
A separator only separates: one at the start or end of the list, or right
after another, is dropped, so groups that come out empty leave no stray or
doubled rule. `setOptions` follows the same rules, and an option's
`data-index` stays its index in `options`.

`tests/action_dropdown_separators.test.mjs` drives it in jsdom.

## Action dropdowns: positioning against the end edge (0.17.9)

`ActionDropdown.position(trigger, menu, { align })` places any menu against
any trigger: `position: fixed`, under the trigger when it fits there (else above it
when it fits there, else on the side with more room, scrolling inside), and kept 8px
inside the window. `align` says which trigger edge the menu lines up with
first: `'start'` (the default, and what it did before) its left edge, `'end'`
its right edge. Either flips to the other edge when the menu would leave the
window. A tile's ⋯ menu uses `'end'`
([Dashboard tiles](tiles.md#the--menu-is-drawn-over-the-page-0179)).

## A categorised picker: `CategoryPicker` (0.17.16)

An `ActionDropdown` is a flat list. When the choices fall into categories and
each needs a sentence (and perhaps a sample) before it is chosen, use
`CategoryPicker`: a search field over three columns — the categories (a
colour dot, the label, the item count), the active category's items (an icon
and the label), and a detail pane for the highlighted item (its title,
description, an optional monospace preview and an Add button).

```js
import { CategoryPicker } from '@flexdesk/widgets';

const picker = new CategoryPicker({
    trigger: addCellButton,
    categories: [
        { id: 'text', label: 'Text', color: 'var(--accent-light)', items: [
            { id: 'heading', label: 'Heading', badge: 'H',
              description: 'A section heading; it shapes the outline.',
              preview: '## Debt dynamics' },
            { id: 'doc', label: 'Documentation', icon: 'description',
              description: 'Markdown with LaTeX math.', keywords: ['markdown', 'latex'] },
        ] },
        { id: 'functions', label: 'Functions', color: 'var(--color-warning)', items: [
            { id: 'lag', label: 'Delay / Lag', badge: 'Δt',
              description: 'The value of an expression some time ago.',
              preview: 'expected = lag(inflation, 2)', keywords: 'delay history' },
        ] },
    ],
    onSelect: (item, category) => insertCell(category.id, item.id),
    placeholder: 'Search cells…',   // the search field's placeholder (default 'Search…')
    addLabel: 'Add cell',            // the detail pane's button (default 'Add')
    previewLabel: 'Writes',          // a caption over the preview (none by default)
    align: 'start',                  // or 'end', as ActionDropdown.position takes it
    label: 'Add a cell',             // the popover's accessible name (default 'Pick')
});
// The trigger's click toggles it; or drive it:
picker.open(); picker.close(); picker.toggle(); picker.position();
picker.setCategories(next);          // finds the active category and the highlight again by id
picker.destroy();
```

An item has `id` and `label`, and optionally `icon` (a Material Symbols
ligature) or `badge` (a short text drawn as a monospace badge in the
category's colour), `description`, `preview` (text, shown monospace and
pre-wrapped) and `keywords` (an array or a string; searched, never shown). A
category's `color` is any CSS colour; it reaches the rows as
`--twm-category-picker-color`, and without one the dot and badge are muted.
`onSelect(item, category)` gets your own objects back.

- **Anchored like ActionDropdown.** It is appended to `body`, placed by
  `ActionDropdown.position` (`position: fixed`, under the trigger when it fits,
  flipped above it when it does not, kept 8px inside the window, capped to the
  room there), and drawn on `--z-over-windows`, over the managed window it
  opened from. Its columns scroll inside; the popover itself does not. The
  trigger gets `aria-haspopup="dialog"`, `aria-expanded` and `twm-is-open`.
- **Search.** Focus is in the search field on open (the query starts empty).
  Typing filters every category's items by label, description and keywords:
  each word must appear, case-insensitively. While a query is set the items
  column is one hit list grouped under the category labels, the counts are hit
  counts (a category with none is dimmed), and the first hit is highlighted.
  Clicking a category then jumps to its first hit.
- **Keyboard.** With no query, Up/Down move within the current column (the
  categories, or the items) and wrap; Left/Right move between the two. With a
  query, Up/Down walk the hit list across categories and Left/Right stay the
  caret's. Enter picks the highlighted item. A printable key typed while a row
  has focus goes to the search field. Tab and Shift+Tab stay inside: they
  cycle the search field and Add (when it is enabled), as a modal
  ManagedWindow's focus trap does. Keys an IME is composing with are left to
  it. Escape closes the picker and nothing
  else (it is caught first and stopped, so a ManagedWindow around it stays
  open). Escape and a pick give focus back to the trigger.
- **Pointer.** Hovering or clicking an item shows it in the detail pane;
  double-clicking it, or Add, picks it. A click outside closes the picker.
  Pressing anywhere inside but the search field keeps focus where it is, so
  the keyboard keeps working (the preview's text cannot be drag-selected).
- **Accessibility.** The popover is a named `role="dialog"`. The search field
  is a combobox whose `aria-activedescendant` is the active category while the
  categories column is current, else the highlighted item. While a query is
  set, each category's hits are a `role="group"` named by its header.

The Add button is FlexDesk's `twm-btn twm-btn--primary`; everything else is
styled from the tokens (`tests/category_picker.test.mjs` checks there is no
colour literal in its rules, and that base.css and flexdesk.css carry the same
block).
