# Keys, Back and tab layout

> **Package:** `@flexdesk/wm` · **See also:** [Command palette](command-palette.md) · [All docs](../README.md)

The window manager binds a set of keyboard chords: F1 to F12, Backspace, Ctrl+K, Ctrl+Tab, Ctrl/Shift+Arrows, the Alt chords, `?` and Esc. `keymap.bindings` takes any of them back or rebinds it. The same page covers what depends on those keys and on how a user moves around: what Back and the breadcrumb do, the content zoom control (`chrome.zoom`), and the shell options `backToOpenList`, `floatActiveTab` and `tabLayout`.

## Your keys, not the window manager's: `keymap` (0.17.0)

The window manager binds F1..F12, Backspace, Ctrl+K, Ctrl+Tab, Ctrl/Shift+Arrows,
the Alt chords, `?` and Esc, and swallows any other bare Alt+letter. Each of
those chords can be taken back or rebound:

```js
await createShell({
    // …everything above…
    keymap: {
        bindings: {
            'F1': false,               // F1 is the page's: not prevented, nothing clicked
            'F2': 'nav:0',             // F2 opens the first top-nav kind
            'Backspace': false,        // Backspace never calls navigateBack
            'Alt+W': (e, { wm }) => { /* yours; return false to leave e unprevented */ },
        },
    },
});
```

A value is `false`, an action name, or a function. The actions are `palette`,
`palette:close`, `help`, `back`, `nav:N`, `desktop:N`, `toDesktop:N` (all
counted from 0), `desktop:next|prev`, `tab:next|prev`, `panelTab:next|prev`,
`split:h|v`, `splitWith:h|v`, `openInTab`, `openInWindow`, `close`, `float`,
`focus:left|right|up|down`, `move:left|right|up|down` and `suppress`. The chord
ids are the defaults in `src/tiling/keymap.js`: `Ctrl+K`, `Meta+K`, `?`,
`Escape`, `F1`..`F12`, `Backspace`, `Alt+H`, `Alt+Shift+H`, `Alt+ArrowLeft`,
`Alt+Shift+1`, `Ctrl+Tab`, `Shift+ArrowRight` and so on, with `Alt+Letter` for
the Alt+letter suppression. Modifiers may come in any order and case. A chord id
or action the keymap does not know is warned about once, through `logger` (else
`console`), when the shell is built, and is then ignored. Only the window
manager's own chords can be rebound. To add a new key, put your own listener on
the page. `keymap` itself must be an object whose only key is `bindings`:
anything else (a string, a typo such as `{ binding: … }`) makes `createShell`
throw a `TypeError`, so a binding you meant to change never stays in force
unnoticed.

**A key press is read as loosely as before.** With no bindings every key does
what it did in 0.16, and a binding takes over every key press its chord was
read as. Backspace ignores Shift and Alt, so `{ Backspace: false }` also hands
Shift+Backspace and Alt+Backspace to the page. Alt+T/N/W/F ignore Shift. With
Alt held, Ctrl and Meta are ignored, so Alt+Ctrl+H is `Alt+H`. Ctrl+K and
Ctrl+Tab also match with Meta held, and Ctrl wins when both are held:
Ctrl+Meta+K is `Ctrl+K`, and Meta+K is `Meta+K` only without Ctrl. Esc and `?`
ignore every modifier. F1..F12, Shift+Left/Right and Ctrl+Left/Right match only
with exactly those modifiers.

**A key a component handled is the component's.** The keymap skips every
keydown that is already `defaultPrevented`. A list that deletes a row on
Backspace calls `preventDefault()`, and the window manager does not navigate
back as well.

**`?` is installed by the shell.** Importing `HelpModal` no longer adds a
`document` listener as a side effect. A shell binds `?` as one of its chords,
and `shell.dispose()` removes it with the rest. A page that uses the help modal
without a shell calls `installHelpShortcut()` from `@flexdesk/widgets`, which
returns its disposer. `HelpModal.toggle()` is what `?` does.

**The *Keyboard shortcuts* command shows the bindings in effect.** It lists
`keymapShortcuts(bindings)` from `@flexdesk/wm`. That is `KEYMAP_SHORTCUTS`
with each changed row replaced by one line per chord still bound, and no line
for a chord you disabled. `createCommandPalette({ shortcuts })` takes that table.
The command's hint names the keys that open help in it: `?` by default, `F9`
after `{ '?': false, F9: 'help' }`, and none when no key opens help (for
example after `{ '?': 'palette' }`).

**`chrome.zoom`** paints a − / track / + / readout control into the element you
pass, restores the saved zoom through the host's `state` capability, and scales
the content of tiles and floating windows. It deliberately scales *content only*
— never the root, a tile's frame or a window's frame — because CSS `zoom`
establishes a scaled coordinate space and every window drag, resize and snap
measures in real pixels. `shell.chrome.zoom` exposes `get()` and `set(percent)`
for a settings pane. An embedder that builds its own `WindowManager` instead of
calling `createShell` mounts the same control with `mountZoomControl(el, { root,
host })`.

**`backToOpenList`** is for apps that open a record from a list in a new tab.
Without it, Back in that record has no history to pop, so it walks the taxonomy
up and rewrites the record into its parent, and the tile now shows the list
twice. With it, Back closes the record tab and activates the list it came from:
the nearest tab to the left, else to the right, that is not a record (no
`props.id`) and belongs to the same top-nav section. Per-tab history still comes
first, and a record with no such list beside it still walks up in place.

**`floatActiveTab`** is for apps whose tabs are separate records rather than
views of one pane. The float button, Alt+F and the tile menu take only the tab
on screen and leave its siblings in the tile, so the window holds one tab and
draws no strip. Without it the whole pane floats, strip and all.

**`tabLayout`** says where a tile draws its tabs. `'bottom'` (the default) is
the spreadsheet strip under the body, shown from two tabs. `'top'` is the
editor tab bar between the header and the body, also from two tabs.
`'header'` (0.8.0) puts that tab bar inside the header in place of the title,
on every tile, one tab included, with a `+` after the last tab that opens the
taxonomy root in a new tab (`wm.newTab(leafId)`, the same seed a split uses).
Pass `newTabButton: false` (0.8.1) to leave the `+` out.
A panel tile has no tabs and keeps its title. Under `'header'` the tab, not
the header, is what you drag to move a single-tab pane; the empty part of the
header still floats the pane on a pull-down or a double-click. Set
`data-twm-tabs` on the shell's root, or call `wm.setTabLayout()`, to switch
live; nothing mounted in a tile is unmounted.

**Back and the breadcrumb are one rule.** `wm.navigateBack()` (Backspace) and
`wm.navigateUp(kind, props, { ctx })` (every breadcrumb crumb) share it. With
`backToOpenList`, a record whose section has a list open closes onto that list;
otherwise Back walks the taxonomy up and a crumb navigates to its level, in
place. A crumb naming an entity, such as an epic above a story, opens that
entity. `navigate` stays the verb for going to exactly a target; use
`navigateUp` for anything that means "up to this level".

A filter or other props passed to `openInPrimary` for a list that is already
showing are applied to it. A bare open, such as a top-nav click, keeps the tab
as you left it.

**Back in a floating window** always acts on that window, whichever option is
set. The last click decides: inside a window, Backspace walks that window up;
anywhere else, it walks the focused tile as before. With `backToOpenList`, a
record in a window closes onto an open list of its section, first among the
window's own tabs and then in any tile of its desktop.

**A page's own levels come first** (0.4.7). A page can have levels that are not
tabs, such as a section whose list opens one member in place of itself. Return
`navigateBack()` from the content factory's mount, and Backspace asks it before
anything above: it climbs one of the page's own levels and returns `true`. Only
a strict `true` counts. `false`, any other value, a missing function or a throw
(logged as a warning) all let Back walk the tab history, the open list and the
taxonomy exactly as before. It is asked in the same place as the rest of Back:
the window you last clicked in, else the focused tile. Return
`canNavigateBack()` as well, and `wm.canNavigateBack()` reports the page's own
levels, for that same window or tile. `TileRenderer.contentOf(leafId)` reads
what a tile's factory returned. To draw the page's levels, call
`renderBreadcrumb(container, segments)` from `@flexdesk/wm`, with
`segments = [{ label, icon?, onClick? }]`. It uses the tile breadcrumb's
markup, so it looks the same, and each `onClick` is yours: the last segment,
and any without `onClick`, is drawn as plain text. The current segment's item
carries `aria-current="page"`, and every label has a `title` with its full text,
so a label your CSS truncates still reads whole (0.15.1).
