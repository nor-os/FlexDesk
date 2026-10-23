# Menus

> **Package:** `@flexdesk/widgets` · [All docs](../README.md)

`createMenuBar` draws File / Edit / View menus from one declarative model, with pointer and keyboard behaviour and the WAI-ARIA menubar roles, and plugs into the shell. `ActionDropdown` draws a dropdown of action buttons from a trigger.

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
`setChecked(id, on)`, `commands()` and `dispose()`.

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
