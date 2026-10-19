# FlexDesk

A tiling window manager and widget set for desktop-class web applications.

Tiles that split and tab, a command palette, dockable panels, virtual desktops, a
DataTable with sticky headers and CSV export, managed windows, modals, toasts,
trees and context menus.

**Zero runtime dependencies.** No React, no framework, nothing. If you install
FlexDesk, you install FlexDesk.

FlexDesk was extracted from [EcoAgent](https://github.com/nor-os/EcoAgent), a
macroeconomic simulation platform, and it knows nothing about economics: no
application vocabulary, no import of anything application-specific, in any
shipped file.

```bash
npm install flexdesk
```

Or vendor `dist/` and load it through an import map — no bundler, no build step.
That is exactly what EcoAgent does:

```html
<script type="importmap">
{ "imports": {
    "@flexdesk/core":    "./vendor/flexdesk/core.js",
    "@flexdesk/host":    "./vendor/flexdesk/host.js",
    "@flexdesk/wm":      "./vendor/flexdesk/wm.js",
    "@flexdesk/widgets": "./vendor/flexdesk/widgets.js"
} }
</script>
<link href="./vendor/flexdesk/flexdesk.css" rel="stylesheet" />
```

## Nine entry points

Because someone who wants a DataTable should not have to download a window
manager, and neither of them should drag in a plotting engine or a code editor.

| Entry | Size | What is in it |
|---|---|---|
| `@flexdesk/core` | 30 kB | Event bus, settings store, logging, state machine, state guard |
| `@flexdesk/host` | 5 kB | The host port (below) |
| `@flexdesk/wm` | 166 kB | Tiling window manager: tabs, splits, desktops, command palette, taxonomy, `createShell()` |
| `@flexdesk/widgets` | 192 kB | DataTable, modals, managed windows, toasts, trees, panels, context menus, a document outline, progress |
| `@flexdesk/charts` | 26 kB | Plotly wrapper, chart types, subplot layouts, downsampling, plot windows, injected series transforms |
| `@flexdesk/tiles` | 67 kB | Draggable/resizable widget grid, tile base class, widget registry, layout persistence, chart and KPI tiles |
| `@flexdesk/editor` | 62 kB | Monaco loader + factory, multi-file tab bar, search, split panes, undo manager |
| `@flexdesk/canvas` | 14 kB | The canvas kernel: a pannable, zoomable surface, the edge router, a generic graph layer ([Flow editors](#flow-editors)) |
| `@flexdesk/flow` | 381 kB | The flow-editor kit and the canvas, outline and lane editors ([Flow editors](#flow-editors)) |

The sizes of `@flexdesk/canvas` and `@flexdesk/flow` are the entry files as
`node build.mjs` reported them for the flow editors' integration build; like
every entry they also import shared chunks. The other rows are older figures.

They share code through chunks, so importing two of them does **not** give you two
event buses — and therefore not two copies of every module-level singleton. A test
asserts each kernel symbol is defined exactly once across the whole `dist/`.

Two different things here are called "tiles", which is unfortunate but honest to
the code: `@flexdesk/wm` tiles the *window*; `@flexdesk/tiles` is a dashboard
*widget grid*.

## Hello, shell

```js
import { createShell, createTaxonomy, createEntityCatalog } from '@flexdesk/wm';
import { createHost } from '@flexdesk/host';
import { DataTable } from '@flexdesk/widgets';

const store = new Map();

const shell = await createShell({
    root: document.getElementById('app'),

    // YOUR ontology. FlexDesk has none.
    taxonomy: createTaxonomy({
        root: 'cosmos',
        kinds: {
            cosmos: { label: 'Cosmos', isTopNav: true, sources: ['planet'] },
            planet: { label: 'Planet', icon: 'circle' },
            moon: {
                label: 'Moon',
                // "jupiter/europa" — your naming convention, not the library's.
                ancestors: ({ id }) => {
                    const i = String(id).indexOf('/');
                    return i > 0 ? [{ kind: 'planet', id: String(id).slice(0, i) }] : [];
                },
            },
        },
    }),

    entities: createEntityCatalog({ sources: [/* what the palette searches */] }),
    content:  { planet: (hostEl, props) => { /* render a tile */ } },

    // Where persistence goes. An in-memory Map is a perfectly good host.
    host: createHost({
        state: {
            read:  async (k) => store.get(k) ?? null,
            write: async (k, v) => (store.set(k, v), true),
        },
    }),

    // Chrome is ELEMENTS, not selectors. The library never guesses at your markup.
    chrome: { topNav: document.getElementById('nav') },
});
```

A working version of exactly this — planets and moons, a mock host, no backend —
lives in `demo/`.

### Opt-in shell features

These change what the user sees, so all of them are off until you ask:

```js
await createShell({
    // …everything above…
    snapPromotion: true,     // drag a floating window onto a tile: it snaps, and docks back in
    promoteInPlace: true,    // a window floated out of a tile stays inside that tile's pane
    backToOpenList: true,    // Back in a record opened beside its list closes onto that list
    floatActiveTab: true,    // floating a tile takes the tab on screen, not the whole pane
    tabLayout: 'header',     // tabs in the tile header, in place of its title, with a + (0.8.0)
    newTabButton: false,     // …and without the + (0.8.1)
    chrome: {
        topNav: document.getElementById('nav'),
        zoom:   document.getElementById('status-bar'),   // content zoom, 50–200%
    },
});
```

### A kind that exists once: `single` (0.17.0)

Some content holds heavy app-wide state and must not be mounted twice. Mark its
kind `single` in the taxonomy:

```js
createTaxonomy({
    root: 'cosmos',
    kinds: {
        cosmos:      { label: 'Cosmos', isTopNav: true },
        observatory: { label: 'Observatory', isTopNav: true, single: true },  // one, ever
        planet:      { label: 'Planet', single: 'id' },                       // one per props.id
    },
});
```

- **Every open path reveals the instance that exists** — `navigate`, the top
  nav, `openInPrimary`, `openInTab*`, `splitLeafWith`, Back. It switches to the
  desktop it is on, activates its tab (bringing back a top-nav page the tile
  had switched away from) and focuses its tile, or raises its window. Nothing
  is mounted twice, and a reveal is one `onChange` / `wm:changed`
  (`'single-reveal'`), however many steps it took.
- **A page restore never brings back a copy.** A tile's archived top-nav page
  can still list an instance that has since moved to another tile or a window;
  switching back to that page (top nav, `openInPrimary`, Back) leaves it out.
- **The copy verbs refuse.** Alt+T, Alt+N, Alt+Shift+H/V do nothing; the tile
  menu's *Open in new tab* and *Open a copy in a window* are greyed with the
  reason as their tooltip (`taxonomy.singleReason(kind)`); the palette draws its
  split and window hints greyed, and Ctrl/Shift+Enter on such a row does nothing.
- **The move verbs still work**: float, dock, drag a tab, move to a desktop.
- **A restored layout keeps the first** of any duplicates (desktop order, then
  tile order): the other leaf shows its next tab, or closes if it held nothing
  else.

The root kind cannot be `single` — every new pane, tab and desktop is seeded
with it. The taxonomy answers `isSingle(kind)`, `instanceKey(kind, props)` and
`singleReason(kind)`; the window manager answers `isSingleKind(kind)`,
`findInstance(kind, props)` and `revealInstance(kind, props)`.

### A pane that names what it shows: `ctx.setTitle` (0.12.1)

A content factory receives `(hostEl, props, ctx)`, and `ctx` carries, per pane,
`setTitle(text)`. It renames the pane's chrome title, at mount or any time
after, and the title survives repaints — including a panel's, whose tree title
the shell resets to Navigator / Inspector / Console on every layout pass:

```js
content: {
    'panel:bottom': (hostEl, props, ctx) => {
        // …a panel with tabs of its own…
        const show = (tab) => { /* swap the body */ ctx.setTitle(tab.label); };
        show(tabs[0]);
        return { destroy() {} };
    },
},
```

`setTitle(null)` or `''` gives the title back to the tree. It changes what the
chrome shows only — the tree, the tab labels and the saved layout are left
alone — and a call from content whose pane has since been rebuilt does nothing.

### Buttons that change with the pane: `ctx.setChromeActions` (0.17.0)

A factory may return `chromeActions` — `[{icon, title, onClick}]`, drawn in the
pane's chrome left of the split/float/close buttons — but those are read once.
`ctx.setChromeActions(specs)` replaces them at any time, the way `setTitle`
replaces the title: called during the mount it wins over the returned list, the
later call wins, the list survives repaints, `null` or `[]` clears it, and a
call from content whose pane has since been rebuilt does nothing. The content is
never re-mounted.

```js
content: {
    page: (hostEl, props, ctx) => {
        let wide = false;
        const paint = () => ctx.setChromeActions([
            { icon: wide ? 'width_normal' : 'width_wide', title: 'Page width',
              pressed: wide, onClick: () => { wide = !wide; paint(); } },
            { separator: true },
            { icon: 'add', label: 'New', title: 'Add a page', onClick: addPage },
            { icon: 'publish', title: 'Nothing to publish yet', disabled: true },
        ]);
        paint();
        return { destroy() {} };
    },
},
```

A spec may add **`label`** (text beside the glyph, or instead of it),
**`pressed`** (`aria-pressed`, plus a pressed style; leave it out for a button
that is not a toggle), **`disabled`** (greyed and inert, with its tooltip kept —
it is `aria-disabled`, not the `disabled` attribute) and **`{separator: true}`**
(a divider). A spec with none of them renders exactly as before.

### Panels a page does not offer (0.17.0)

A kind says which panels it offers while it is the primary tile. Each side is
`true`, `false` or `{ reason }`; a side it does not name is offered, and a kind
that does not name a side takes it from its top-nav kind, so one declaration on
a page covers every record opened under it:

```js
kinds: {
    paper: { label: 'Paper', isTopNav: true, panels: { bottom: { reason: 'No console here' } } },
    sheet: { label: 'Sheet', topNav: 'paper' },                        // withholds it too
    slide: { label: 'Slide', topNav: 'paper', panels: { bottom: true } }, // offers it
},
```

While a panel is withheld it is not in the layout, `wm.togglePanel(side)`
answers `false` and changes nothing (nor what is saved), `wm.isPanelOpen(side)`
is `false`, and the shell's toggle button and the palette chip carry
`aria-disabled="true"` with the reason as their tooltip (`data-tooltip` on a
`twm-has-tooltip` button, `title` otherwise; the button's own comes back after).
The desktop still remembers the panel was open, and it comes back open when the
user returns to a page that offers it. With no declarations every panel is
offered, exactly as before.

Content overrides its kind at runtime, until it clears the override with `null`:

```js
ctx.wm.setPanelAvailability('bottom', { reason: 'Run the model first' });
ctx.wm.setPanelAvailability('bottom', null);           // e.g. in destroy()
```

`wm.isPanelAvailable(side)` and `wm.getPanelAvailability(side)` (`{ available,
reason }`) read it, and a change is announced once — whatever caused it and
however many sides it moved — to `wm.onPanelAvailabilityChange(fn)` (which
returns the unsubscribe) and on the bus as `wm:panels:availability`, both with
`{ panels, changed }`. `togglePanel` now answers `true` when it flipped a panel.

`PanelStateMachine`, `PANEL_STATES` and `PANEL_TRANSITIONS` are gone from
`@flexdesk/widgets`: nothing in the library used them, and which panels a page
offers is now said once, in the taxonomy.

`tests/panel_availability.test.mjs` drives all of it against a real shell.

### A navigation panel you drive yourself: `mountNavPanel` (0.17.0)

`mountNavPanel(hostEl, { modes })` (from `@flexdesk/wm`) builds a mode strip, a
shared filter box and one lazily-mounted pane per mode. A strip click is no
longer the only way to switch: the handle's `select(modeId)` takes the same
path — it mounts the mode on first use, runs its `activate()`, restores that
mode's filter text — and its promise resolves once `activate()` has run. An
unknown id is ignored. `active()` names the mode shown.

```js
const nav = mountNavPanel(hostEl, {
    modes: [
        { id: 'files',  icon: 'folder',   label: 'Files',  mount: mountFiles },
        { id: 'runs',   icon: 'history',  label: 'Runs',   mount: mountRuns,
          filter: false },                // a pane with controls of its own
    ],
    showModeStrip: false,   // no strip: the app switches with select()
    initialMode: 'runs',    // the mode shown at mount (default: the first)
});
await nav.select('files');  // mounted and activated
nav.active();               // 'files'
```

A mode with `filter: false` hides the filter box while it is active, and its
pane is never handed a query; the next mode with a filter shows its own saved
text again. `showFilter: false` renders no filter box at all. All three options
default to the old behaviour, so a panel built without them renders exactly as
before.

### Your desktops beside the app's (0.10.0)

Pass `chrome.desktops` and the shell paints a desktop bar: a chip per desktop
and a `+`. An app that keeps desktops of its own (one per page, say) marks them
on the desktop objects themselves:

```js
const shell = await createShell({ /* … */ eventBus,
    chrome: { desktops: barEl }, desktopBar: { switchOnAdd: true } });
shell.wm.desktops.ensureCount(pages.length);
shell.wm.desktops.desktops.slice(0, pages.length)
    .forEach((d) => { d.group = 'Workbench'; d.fixed = true; });
eventBus.emit('wm:changed', {});          // repaint the bar
```

Desktops that share a **`group`** are one chip, labelled by the group, and one
stop for Ctrl+Left/Right; the chip goes back to the member that was on screen
last (`wm.desktops.chips()` says what the bar draws). A **`fixed`** desktop is
the app's: the bar offers no rename and no delete, no menu offers it as a
*Move to desktop* target, and `removeDesktop`, `moveFocusedToDesktop` and
`moveWindowToDesktop` refuse it. Both are persisted. A desktop the user adds is
numbered among the ungrouped ones, and `desktopBar.switchOnAdd` puts it on
screen. With neither set anywhere, the bar is what it always was.

*Move to desktop* now carries every tab of the pane and adds them to the target's
main pane; it used to replace that pane with the active tab alone. A target still
holding only its seed is replaced, as before. `dispose()` removes the bar, so a
rebuilt shell paints a fresh one.

### The palette that finds anything (0.9.0; matching tightened in 0.9.1)

Ctrl+K's grouped layout. Every option is off unless you pass it, so a shell that
passes none of them keeps the chip strip, the panel toggles and the flat list:

```js
await createShell({
    // …everything above…
    palette: {
        placeholder: 'Search everything…',
        layout: 'grouped',                       // a header per kind, matches marked
        chrome: { pages: false, panels: false }, // nothing between the input and the results
        groupCap: 4,                             // then "Show all N", which scopes to the kind
        cache: true,                             // a re-open draws the last catalogue at once
        empty: async () => recentRows(),         // shown before anything is typed, under "Recent"
        commands: () => commandRows(),           // `{label, action}`; `>` restricts to them
        drill: (pick) => pick.kind === 'planet'  // Tab on a row enters a scope
            ? { label: `${pick.label} › moons`, search: (q, signal) => findMoons(pick.id, q, signal) }
            : null,
        onPick: (pick, { mode, scope }) => openSomewhere(pick, mode), // 'open' | 'split' | 'window'
    },
});
```

A row may carry `context` (drawn, not searched), `keywords` (searched, not
drawn), `modes` (which of `split`/`window` its keys offer), `drillLabel` (the Tab
hint), `boost`, `group`/`groupLabel`, `kindLabel`, `shortcut` and `verb`. A group's
header is the taxonomy's `plural` for the kind, else its `label`. Matching ranks
exact, prefix, word starts (`ord li` finds *Order lines*), substring, then an
abbreviation: it starts at a word, and the letters it skips outside word starts are
at most half the query (`cstmr` finds *customer*; `cour` does not find *Scroll up
to*). A drill's `search` is debounced, and a stale answer is aborted and
never drawn. `palette.invalidate()` drops the cache.

**The built-in *Keyboard shortcuts* command** opens the help topic
`keyboard-shortcuts`. If your `HelpProvider` defines that id, your topic is
shown. If it does not, or you register no help at all, the modal shows the window
manager's own bindings, `KEYMAP_SHORTCUTS` from `@flexdesk/wm`, as a table
(`keyboardShortcutsTopic()`). Before this the modal showed *Failed to load help
topic.* The fallback comes from `HelpModal.open(id, { fallback })`
(`@flexdesk/widgets`), and you can pass one yourself. A topic id that nobody
provides now shows *Help topic not found.* where it used to raise a load error.

### Your keys, not the window manager's: `keymap` (0.17.0)

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

### Column sizing

`fitColumns(columns, avail)` (from `@flexdesk/widgets`) turns per-column
measurements into widths. Pass each column's widest cell (`natural`), the width
most cells fit (`typical`), the header label (`header`) and any user-dragged
width (`pinned`). Short columns such as ids, dates and statuses keep their full
values, and free-text columns (`text`, or anything 240px and wider) take the
rest. When space runs short, short columns lose their rare outliers first,
then text shrinks to a floor. The widths are fractional and add up to `avail`
exactly whenever the floors fit. `DataTable` does not use it yet; an embedder
that measures its own columns can.

### Sorting a paged DataTable

A client-paged `DataTable` (no `onPageChange`) keeps its page when it is
sorted, so a sort on page 3 shows rows 201–300 of the new order. Pass
`resetPageOnSort: true` (0.4.7) to start every new order at the first page, a
header click included, the way a new filter already does. It is off by default
because keeping the page is what every earlier release did. Server-side paging
is not affected: its page is your `offset`, which a sort never changes.

### DataTable options in 0.5.0: lists that need no help

0.5.0 adds options for the ordinary list in an application: one that sits in a
page, opens a row, marks the open one, and sorts dates as dates. Every option
is off until you set it. A table that sets none of them looks and behaves as it
did in 0.4, apart from the few changes listed at the end of this section. This
was measured in headless Edge: 64 cells in 7 default tables, an empty and a
loading one among them, computed the same under 0.4.7 and 0.5.0.

```js
import { DataTable } from '@flexdesk/widgets';

// House rules once, then one call per list: build AND draw.
const ListTable = DataTable.withDefaults({
    mode: 'compact', sortable: true, pagination: false,
    fitContent: true, firstColumn: 'plain', autoDispose: true,
});

const table = ListTable.mount(host, {
    headers: ['Name', 'Role', 'Last seen', 'Took'],
    rows,                                    // values, not formatted text
    columnTypes: [null, null, 'datetime', 'duration'],
    getRowKey: (row) => row[0],
    activeRow: openName,
    onRowActivate: (i, row) => open(row),    // one click opens
    rowClass: (row) => (row[1] === 'Suspended' ? 'is-off' : null),
    emptyState: 'Nobody yet.',
});
```

**Layout**

| Option | What it does |
|---|---|
| `fitContent: true` | Makes the table as tall as its rows. By default the wrapper is `height: 100%`. In a parent without a height (an ordinary block in a page that scrolls) that resolves to nothing, so the header draws and the rows do not. |
| `maxHeight: 240` | Implies `fitContent` and caps the table at this height. A number is px; a string is used as CSS. Past the cap, the body scrolls under its header. |
| `firstColumn: 'plain'` | Styles the first column like the others. By default it is styled as a time column: 120–150px wide, grey, weight 500. |
| `--twm-dt-cell-pad-block`, `--twm-dt-cell-pad-inline`, `--twm-dt-cell-line-height` | Three CSS tokens. Set them on `:root` or on any ancestor to give both densities one row height. They are unset by default, and then each density keeps its own 0.4 values. In Edge, with the tokens set to `2px`, `6px` and `1.35`, normal and compact rows both measured 21.19px. Without them, normal rows measured 27px. The normal density reads the line-height token on the table's `thead`/`tbody` and the cells inherit it, so your own line-height for the cells, the rows or the table still wins, from a cascade layer too. |

**Opening a row, and which one is open**

| Option | What it does |
|---|---|
| `onRowActivate(rowIdx, row, ev)` | Opens a row. It fires after the selection has been updated (`onRowClick` still fires before it, as in 0.4). It does not fire for a press on a control in the row (a button, link, field, label, `<summary>`, editable text, or `[data-twm-action]`), for a click that ends a drag selecting text in the table, for the second click of a double-click, or for the Ctrl click that takes a `selectable: 'single'` table's row off the selection. `ev.type` tells you which gesture fired it. If your `onSelectionChange` or `onRowClick` redraws the table (`setData`, `render`), the row that was pressed still opens; `row` is that row as it was drawn. |
| `activateOn` | Which gestures open a row: `'click'` (the default), `'dblclick'`, `'enter'`, or an array of them. A pick list, where one click selects, uses `['dblclick', 'enter']`. Enter opens the selected row (the one row selected, or the selection's anchor), which is the row a double-click on it would open. If nothing is selected, Enter opens the active row. |
| `clickable` | Adds `twm-dt--clickable` to the table, which gives rows a pointer cursor and a hover, readonly tables included. It defaults to on exactly when `onRowActivate` is set. |
| `selectable: 'single'` | Lets a click select exactly one row. Shift and Ctrl do not extend the selection, Ctrl+A selects nothing, and `setSelection` keeps the last index it is given. |
| `getRowKey(row, idx)`, `activeRow`, `setActiveRow(key)`, `getActiveRow()` | Mark the open row: `twm-dt-row--active` and `aria-current="true"`, drawn as an accent on the left edge. The mark is not the selection. It survives `setData`, sorting, filtering and paging, and a right-click does not move it. |

The landing helper `attachLandingTableBehavior` now uses the same rule as
`onRowActivate` to decide whether a click opens a row. That changes three
things, with no option (see the list at the end of this section).

**Row state**

| Option | What it does |
|---|---|
| `rowClass(row, idx)`, `rowAttrs(row, idx)` | Add classes and attributes to the row's `<tr>`. They follow the row through sorts and filters, and `updateRow` asks again, so a class the row no longer earns is removed. |
| `cellClass(value, colIdx, row, idx)` | Adds classes to a cell, after its type class. |
| `rowIcon(row, idx)` | Draws an icon (`'name'` or `{ icon, title, tone }`) at the start of the first cell. It is drawn from an attribute, so the icon's name is not part of the cell's text, its tooltip or a copy. |
| `emptyState` | Text, a node, or a function, shown in place of `emptyMessage`. It is hidden while `setLoading(true)` is on. |
| `setError(message \| node \| Error \| null)` | Shows a failure inside the table. If there are rows on screen, they stay, under a `role="alert"` banner. If there are none, the failure takes the place of the empty row. `setData({ rows })` and `setError(null)` clear it. |
| `showRowNumbers: 'position'` | Numbers rows 1, 2, 3 in the order shown, after a sort, a filter, or on a later page. `true` still numbers rows by their original index. |
| `nullDisplay: 'NULL'` | Draws `null` and `undefined` as this text, adds `twm-dt-cell--null` to the cell, and copies the text as well. |

**Values, not text**

| Option | What it does |
|---|---|
| `columnTypes: [..., 'date' \| 'datetime' \| 'duration']` | Sorts and filters the column by its value: an ISO 8601 string, a `Date` or epoch ms for dates, and milliseconds or text such as `'3.2 s'` for durations. A date-only value such as `2026-10-05` is a calendar date, so the time zone never moves it. Any other text, and a date that does not exist (`2026-02-31`), is shown as it came and sorts last. Non-ISO text is not passed to `Date.parse`, because browsers read it differently (V8 reads `'12'` as a date in 2001). Only `columnTypes` makes a column a typed column. A `getColumnType` that returns `'date'` still sets only the cell's class name, as in 0.4. |
| `dateFormat`, `dateTimeFormat` | **Default ISO: `YYYY-MM-DD` and `YYYY-MM-DD HH:mm`.** Pass a pattern (`DD.MM.YYYY`, `D MMM YYYY, h:mm a`, with `[literal]` text) or a function `(date) => string`, for every column or per column index. |
| `durationFormat` | `'auto'` (`850 ms`, `3.2 s`, `2m 5s`, `1h 2m`), `'clock'` (`1:02:05`), or a function. |
| `dateTimeZone: 'UTC'` | Reads and draws typed dates in UTC instead of the local zone. |
| `sortValue(value, colIdx, row)` | Sets what a column sorts by, for every column or (as an object or array) per column. Return `undefined` to fall back to the column's own rule. |

The column filters work on values. On a date column, `2026-10` matches October,
`>2026-10` matches after October, `<=2026-10-05` includes the 5th, and
`2026-01..2026-03` matches January through the end of March. A date operand is
ISO with two-digit parts, so an operator over a half-typed one (`>20`,
`>2026-1`) filters nothing until it is complete. Text without an operator that
is not such a date (`5 Oct`, `Oct`, `2026-1`) is matched against the cell as
drawn, so a filter narrows as you type it. On a duration column, `>1s`,
`<500ms` and `1s..1m` work. `formatDate`, `formatDuration`, `parseDateValue`
and `parseDuration` are exported, so text drawn elsewhere can use the same
words as the table.

**Housekeeping**

| Option | What it does |
|---|---|
| `DataTable.mount(host, config)` | Builds the table and draws it. The constructor still draws nothing until `render()`. |
| `DataTable.withDefaults(defaults)` | Returns a subclass whose `defaults` sit under every config it is given. `instanceof DataTable` holds, and it can be narrowed again. |
| `autoDispose: true` | Disposes the table once it has been taken out of the document and is still out a task later. It lets go of everything `dispose()` does, but it removes only the table's own elements and never empties the host. By then you may have mounted the next list into the host or written your own message there, and that stays. Do not set it on a table you detach and attach again later, such as a cached tab, because a disposed table comes back empty. |
| `resetColumnWidths()` | Forgets every dragged, fitted or restored width, the persisted ones included, and measures the columns again. Use it after a zoom or a font change. |

**Changes that need no option.** A table that sets none of the options above
behaves as it did in 0.4, except for these:

- The copy menu's document listeners (click, scroll, Escape, resize) now exist
  only while the menu is open. Before 0.5.0, a table that had ever been
  right-clicked kept them until `dispose()`.
- `attachLandingTableBehavior` judges a click by the `onRowActivate` rule:
  - A double-click opens the row once, not twice.
  - A click while text in the host is selected does not open the row. That is
    the click that ends a drag across a cell.
  - A click on a `<label>`, a `<summary>` or editable (`contenteditable`) text
    in a row does not open the row either. 0.4.7 skipped only buttons, links
    and form fields. A `[data-twm-action]` control still runs its action.
- The CSS reads the new tokens with the 0.4 values as fallbacks, so the
  computed styles are the same while the tokens are unset. One exception: the
  normal density's line-height token is declared on the `thead` and `tbody`.
  A line-height rule of yours aimed at those two elements themselves now loses
  to it if it is in a cascade layer, or has zero specificity and loads before
  `flexdesk.css`. A rule for the cells, the rows or the table does not.

### Comparing two tables: `diff` and `createScrollLock`

A side-by-side comparison is two `DataTable`s drawn from ONE aligned row list:
the rows as they are on one side, as they were on the other, and a gap where
a side has no row. Both options are off until you set them.

```js
import { DataTable, createScrollLock } from '@flexdesk/widgets';

const lock = createScrollLock({ axis: 'y' });   // 'x', 'y' or 'both'
const side = (host, pick) => DataTable.mount(host, {
    headers, rows: aligned.map((r) => pick(r) ?? blank), pagination: false,
    scrollLock: lock,
    diff: (_row, i) => ({ status: statusOf(aligned[i], pick), cells: changedCols(aligned[i]) }),
});
side(left,  (r) => r.now);
side(right, (r) => r.then);
lock.setEnabled(false);   // scroll each side on its own; true brings them level
```

- `diff: (row, rowIdx) => {status, cells?}` draws the row
  `twm-dt-diff twm-dt-diff--<status>`, for `added`, `removed`, `changed`,
  `same` or `gap`, and each column index in `cells` (an array or a Set)
  `twm-dt-diff__cell--changed`. `null` or any other status draws the row as
  without `diff`. A `gap` row's cells are drawn empty, whatever its values and
  `renderCell`, so the two sides keep their rows level. `updateRow` asks again.
- `scrollLock` takes a group from `createScrollLock()`. The table's body box
  joins it on every render and leaves on the next render and on `dispose()`.
  Any element can join with `lock.attach(el)`, which returns its detach. A
  box that joins starts at the group's last position, and the echo of a
  position the lock itself wrote moves nobody back. The lock copies pixels, so
  it lines rows up only when both sides draw rows of the same height.

### A server's rows in pages or as one list: `paging`

`paging` (off unless you set it) shows rows that your code fetches from a
server either one page at a time or as one list that loads more as the reader
scrolls. A strip under the body shows which rows are loaded. It has the page
buttons or a *Load all rows* button, and a Pages / Scroll switch if you pass
`onModeChange`. Set `paging` and the old pager (`pagination`) is not drawn.

```js
new DataTable(host, {
    headers, rows,                       // the rows you hold: one page, or all scrolled so far
    virtualize: true,
    paging: {
        mode: 'scroll',                  // what was asked for: 'pages' or 'scroll'
        pageSize: 1000,
        softLimit: 10000,                // above this many rows the table is always paged
        total: 22521,                    // exact count, or null if unknown
        atLeast: 0,                      // a lower bound when the count is not known
        offset: 0,                       // in pages: where rows[0] is in the source
        hasMore: true,
        onPage: (offset, limit) => fetchPage(offset),
        onLoadMore: () => fetchNext(),   // called near the end of the scroll
        onLoadAll: () => fetchRest(),
        onModeChange: (mode) => remember(mode),
    },
});
```

Your code holds the rows and fetches them. The table decides how to show them
with `resolvePaging`, which is exported so your code gets the same answer when
it decides what to fetch. A source with more rows than `softLimit` is shown in
pages even if scroll was asked for. The strip says so, and Scroll is disabled
with the reason. `softLimit` can't be more than `hardLimit` (default and
ceiling `PAGING_HARD_LIMIT`, 100,000), and a scrolling table never asks for rows
past it. If no count is known, the rows already loaded count as evidence: a
table that has loaded more than `softLimit` rows and still has more is paged.
While scrolling, `onLoadMore` is called within 400px of the end, or after
render when the rows don't fill the box. It is never called when the box has
no height, for example in a hidden tab. A callback that returns a Promise
blocks the next call until it settles, and the strip shows the table busy.
`setPaging(patch)` redraws the strip only, for example when a count arrives.
In pages, `showRowNumbers: 'position'` numbers rows from `offset`. Row indexes
(`__rowIndex`, the selection, `onRowClick`) still refer to positions in `rows`.
In 0.7.0 the table can fetch the rows for you: see `dataSource` with `paging`
below.

### Record lists and fact sheets (0.7.0)

Two read-only components for the parts of an application page that are not a
table of rows. Both are new: nothing that exists changes, and a page that does
not call them looks as it did. Neither needs a height: each is exactly as tall
as its contents, in any parent.

**`createRecordList(host, config)`** draws a list of records, each as a name
with a quiet line of facts under it, pills and verbs beside them, and a state.
It is for the administration list of a few records with their own actions
(keys, connections, deliveries, members), where a table would be the wrong
shape.

```js
import { createRecordList } from '@flexdesk/widgets';

const list = createRecordList(host, {
    records: keys,
    describe: (k) => ({
        name: k.name,
        facts: [k.key_id, k.role, k.expires ? `expires ${k.expires}` : 'never expires'],
        pills: [k.paused ? { text: 'paused', tone: 'warn' } : { text: 'live', tone: 'success' }],
        state: k.revoked ? 'off' : k.paused ? 'paused' : 'active',
        verbs: [
            { label: k.paused ? 'Resume' : 'Pause', onClick: (key) => toggle(key),
              refusal: k.revoked ? 'This key is revoked.' : null },
            { label: 'Revoke', danger: true, onClick: (key) => revoke(key) },
        ],
    }),
    getKey: (k) => k.key_id,
    rowAttrs: (k) => ({ 'data-key-id': k.key_id }),
    onActivate: (k) => open(k),        // one click, or Enter
    activeKey: openKeyId,
    emptyState: 'No keys yet.',
});
list.setRecords(next);                 // focus stays on the same record's same verb
```

What `describe(record, idx)` returns (without `describe`, each record is
this object itself):

| Field | What it is |
|---|---|
| `name` | The first line: text or a node. `mono: true` draws it in the monospace face. |
| `facts` | The quiet line: text, a node, or an array whose `null`, `false` and `''` parts are left out and the rest joined with `factSeparator` (`' — '`). A part may be a node. |
| `pills` | Strings or `{ text, tone, title }`. The tones drawn are `muted`, `info`, `success`, `warn` and `danger`. |
| `verbs` | `{ label, onClick(record, ev), refusal, danger, primary, icon, title, name }`. A verb with a `refusal` is a disabled button with the reason on its `title` and `data-refusal`, **and the reason is a line of text under the facts** (`twm-record__refusal`, named by `data-refusal-for`, which the button is `aria-describedby`). A reason shared by every verb is said once. `null` and `false` verbs are left out. |
| `state` | A word: `data-state` and `twm-record--state-<word>` on the row. `paused`, `off` and `dead` dim the words and pills but never the verbs; `dead` and `error` mark the left edge in the danger colour. |
| `error` | A line in the error colour under the facts. |
| `key` | The record's key, over `getKey`. |

| Option | What it does |
|---|---|
| `getKey(record, idx)` | The key (`data-record-key`). Defaults to `spec.key`, then `record.key`, then `record.id`, then the index. Keys compare as strings. |
| `onActivate(record, idx, ev)` | Opens a record. It follows `DataTable`'s `onRowActivate` rule (`row_activation.js`): not for a press on a verb or any control, not for the click that ends a drag selecting text in the list, not for the second click of a double-click. Rows get a pointer and a hover. |
| `activateOn` | `'click'`, `'dblclick'`, `'enter'`, or an array. Default `['click', 'enter']`. |
| `keyboard` | Defaults to on exactly when `onActivate` is set. The records are then one tab stop (the last focused, else the open one, else the first), each enabled verb keeps its own, ArrowUp/ArrowDown move between records (from a record or one of its verbs), Home/End go to the ends, and Enter on a record opens it. |
| `activeKey`, `setActiveKey(key)`, `getActiveKey()` | The record that is open: `twm-record--active` and `aria-current="true"`, drawn as an accent on the left edge. It survives `setRecords`. |
| `rowClass(record, idx)`, `rowAttrs(record, idx)` | Classes and attributes for the record's `<li>`, as `DataTable`'s (`null`/`false` leaves an attribute off, `true` sets it empty). |
| `emptyState` | Text, a node, or a function returning either, shown when there are no records. |
| `facts: 'ellipsis'` | Keeps every fact line to one line and puts the whole line on its `title`. By default a long fact line wraps. |
| `verbClass` | A class string, or `(verb) => string`, for a consumer with its own buttons. By default verbs are FlexDesk's `twm-btn`, with `--primary` and `--danger`. |
| `label`, `className` | The list's `aria-label`; a class on the root. |

Methods: `setRecords(records)` (keeps the focus on the same record's same verb,
by key), `getRecords()`, `refresh(key)` (asks `describe` again for that record
only; with no key, all), `getItem(key)`, `focusRecord(key)`, `dispose()`, and
`element` (the root).

**`createFactTable(host, config)`** draws a sheet of facts: a name and its
value, row after row. A `DataTable` is the wrong tool for this, because it
draws a header row, clips a long value to one line and needs a box with a
height. A fact sheet has no header row, never truncates (a value wraps at
spaces, inside a long word or URL when it must, and keeps its own line breaks),
and is as tall as its rows. The label column stays on one line.

```js
import { createFactTable } from '@flexdesk/widgets';

createFactTable(host, {
    rows: [
        { label: 'Server', value: 'db-main-01.internal' },
        { label: 'Connection string', value: dsn, mono: true },
        { label: 'Options', value: { pool: { min: 2, max: 16 } } },   // drawn as indented JSON
        { label: 'Replica', value: null },
    ],
    nullDisplay: '—',
});

// Before and after:
createFactTable(host, {
    compare: true,
    headers: ['Field', 'Now', 'After the restore'],
    rows: [{ label: 'Amount', before: 1200, after: 950 }, { label: 'Reviewer', after: 'Bea Beta' }],
});
```

| Option | What it does |
|---|---|
| `rows` | Objects `{ label, value }` (or `{ label, before, after }` with `compare`), with optional `mono`, `numeric`, `labelTitle` (a tooltip on the label), `key` (`data-key`) and `status`; or arrays of cells, `[label, value, …]`. A value is text, a number, a node, or an object (drawn as indented JSON). |
| `compare: true` | Each row draws its label, its before, an arrow and its after. A row is `twm-facts__row--changed`, `--same`, `--added` (no `before`) or `--removed` (no `after`), worked out from the two sides (objects by their JSON, a node always changed) unless the row's `status` says otherwise; `data-status` says the same. An absent side reads as `missing` (`'—'`). A row with a plain `value` spans both sides. |
| `headers` | Adds a header row (there is none by default). With `compare`, three names stand over the label, before and after columns. |
| `numeric` | Column indices drawn in tabular numerals (`twm-facts__num`), header included. |
| `mono` | Every value in the monospace face. A row's own `mono` does it for that row. |
| `nullDisplay` | What `null` and `undefined` read as (`twm-facts__null`). By default the cell is empty. |
| `labelColumn: false` | The first column is ordinary data, not a label. |
| `wrapLabels: true` | Lets a long label wrap. |
| `wrap` | How a value wraps. `'anywhere'` (the default) wraps at spaces, and inside a long word or URL when it must. `'words'` wraps at spaces only, so a long word stays whole and the sheet grows wider; use it inside a sideways scroller. `'none'` keeps only the value's own line breaks. |
| `rowClass(row, idx)`, `rowAttrs(row, idx)` | Classes and attributes for each `<tr>`. |
| `emptyState`, `label`, `className` | Shown (spanning the sheet) when there are no rows; the `aria-label`; a class on the `<table>`. |

Methods: `setRows(rows)`, `getRows()`, `getRow(idx)` (the `<tr>`), `dispose()`,
and `element` (the `<table>`).

Both were measured in headless Edge with real input (`demo/records.html`,
driven by `demo/records_probe.mjs`): no list, record, sheet or row has zero
height and none overflows its card; a long fact line, a long URL, a connection
string and a JSON value wrap inside their column while labels stay on one line;
every verb, refused ones included, is what `elementFromPoint` finds at its
centre, and a real press runs it without opening the record; real Tab,
ArrowDown and Enter open a record; at 300px the verbs go under the record's
words, inside the card.

### DataTable options in 0.7.0: details, rows from a server, and filters that are not text

0.7.0 adds what a log viewer needs: a row's detail folded under it, rows read
page by page from a server, a pager that does not need a total, a live tail,
and column filters that are not text boxes. Every option is off until you set
it, and a table that sets none of them draws and behaves as in 0.6.

```js
import { DataTable } from '@flexdesk/widgets';

const LEVELS = { kind: 'chips', options: [
    { value: '', label: 'All', icon: 'list_alt' },
    { value: 'warn', label: 'Warn', icon: 'warning' },
    { value: 'error', label: 'Error', icon: 'error' },
] };
const entryOf = new WeakMap();             // each drawn row -> the entry it came from

const log = DataTable.mount(host, {
    headers: ['When', 'Level', 'Who', 'What'],
    columnTypes: ['datetime', null, null, null],
    getRowKey: (row) => entryOf.get(row)?.id,
    pageSize: 100,
    sortable: true, filterable: true,
    filterKinds: { 1: LEVELS },
    // Rows from the server. Only the newest answer is drawn; `signal` aborts the rest.
    dataSource: async (query, { signal }) => {
        const [page, facets] = await Promise.all([api.audit(query, { signal }), api.facets(query)]);
        const rows = page.data.map((e) => {
            const row = [e.at, e.level, e.who, e.action];
            entryOf.set(row, e);
            return row;
        });
        return { rows, total: facets.total ?? null, hasMore: page.meta.has_more,
                 filterCounts: { 1: { '': facets.total, ...facets.levels } } };
    },
    pagerLabels: { first: 'Newest', prev: 'Newer', next: 'Older', last: 'Oldest' },
    pagerPosition: 'bottom',
    maxJumpOffset: 50_000,
    follow: { interval: 10_000 },
    onFollowChange: (on) => followButton.setAttribute('aria-pressed', String(on)),
    rowDetail: (row) => {
        const pre = document.createElement('pre');
        pre.textContent = JSON.stringify(entryOf.get(row).detail, null, 2);
        return pre;
    },
    hasRowDetail: (row) => !!entryOf.get(row)?.detail,
});
// Your own filters, outside the table, ask again from the first page:
searchBox.oninput = () => log.reload();
```

**A row's detail**

| Option | What it does |
|---|---|
| `rowDetail(row, idx, { host, key })` | Gives each row a toggle at the start of its first cell. Opening it draws a row under the row, one cell across every column; the function fills `host` or returns a node or text for it. The detail is drawn when opened and dropped when closed. Its content does not change the column widths, wraps instead of being clipped, and is not part of a copy. A click in it selects nothing, and a right-click there opens the browser's own menu. |
| `hasRowDetail(row, idx)` | Which rows have a detail. A row without one gets no toggle. |
| `expandedRows`, `setRowExpanded(key, open)`, `isRowExpanded(key)`, `getExpandedRows()`, `collapseAllRows()` | Which details are open, by key (`getRowKey`, or the row's index). The state survives a sort, a filter, a page, `setData` and `refresh()`. A key that is not on screen opens when its row is drawn. Under `dataSource`, give `getRowKey`: without it a row's index is only its place in the page drawn, so a detail stays open across a new answer only where that answer has the same row (equal values) at the same place. |
| `onRowDetailToggle(idx, row, open, key)` | Called after a detail opens or closes. |
| `rowDetailLabel` | The toggle's accessible name (default `'Details'`). Its state is `aria-expanded`, and `aria-controls` names the detail. |

The toggle is a button, so Tab reaches it and Enter or Space opens it. It
neither selects the row nor opens it (`onRowActivate`). On the focused table,
ArrowRight opens the current row's detail and ArrowLeft closes it; the same
keys work on a toggle. Rows under an open detail keep their stripes. Under
`virtualize`, an open detail counts in its row's height, and it leaves and
re-enters the window with its row. It is measured when it is drawn and again
whenever the rows are (0.6.3: on every window update, on a resize and once the
column widths are fixed), so a detail that wraps differently at the final
widths does not leave the offsets wrong. A detail is never one of the rows the
row height is measured from.

**Rows from a server**

| Option | What it does |
|---|---|
| `dataSource(query, { signal })` | Asks for a page whenever the sort, a column filter or the page changes. `query` is `{ offset, limit, sort: { column, header, ascending } \| null, filters: [{ column, header, value }], reason }`, and `reason` is `'initial'`, `'sort'`, `'filter'`, `'page'`, `'reload'` or `'refresh'` (and, with `paging`, `'more'`, `'all'` or `'mode'`). Return `{ rows, total, hasMore, filterCounts }`, or just the rows. The answer is drawn as given, with no sort, filter or slice in the browser. |
| Only the newest answer is drawn | A request sent while another is out aborts the older one (`signal`), and an older answer that still arrives is dropped. So is an older request's failure. |
| A failure keeps the rows | The rows on screen stay, under `setError`'s banner with the error's message, and `onLoadError(error, query)` is called. The next answer clears it. |
| `onLoad(result, query)` | Called after each answer that was drawn. |
| `reload()` | Asks again from the first page. Call it when a filter of your own, outside the table, changes. It resolves with the answer, or with `undefined` if a newer request replaced it. |
| `getQuery()`, `getPageInfo()` | The last query sent, and `{ offset, total, hasMore }` for the page drawn. |
| `goToPage(page)`, `goToRow(idx)` | Ask the source for that page (the one holding row `idx`), up to the last page when the total is known, and resolve when it is drawn. |

While a request is out, the loading overlay shows and the empty state stays
hidden. An empty answer under a filter keeps the filter row, so the filter can
be cleared. A filter that is still being typed when an answer arrives keeps its
text, its focus and its pending request. Row indices (`onRowActivate`,
`getSelection`, `updateRow`) are positions in the page drawn, so they always
point at a row on screen. `showRowNumbers: 'position'` numbers rows from the
page's offset.

**A pager for an unknown total**

| Option | What it does |
|---|---|
| `total: null` in the answer | The total is unknown. The pager says `Rows 101–200` and `Page 2`, with no total. Next is enabled while `hasMore` is true or, without `hasMore`, while pages come back full. Last is disabled, and the reason is on the button (`data-refusal`, and its tooltip). |
| `hasMore` (with `onPageChange`) | The same pager for a table that pages through `onPageChange`: with `totalCount: null`, set `hasMore` to `true` or `false`. |
| `pagerLabels` | `{ first, prev, next, last }` draw a word beside each button's icon, such as `Newest`, `Newer`, `Older` and `Oldest` for a log read newest first; a labelled button is never narrower than its word. `noLast` is the reason given when there is no total, and `tooDeep(max)` the reason given past `maxJumpOffset`. |
| `maxJumpOffset` | The deepest offset that Last and Go-to-row may jump to. Past it, Last is disabled with its reason, and Go asks for nothing and marks the box `aria-invalid`, with the reason on it. Use it where a deep `OFFSET` would be slow. |
| `pagerPosition: 'bottom'` | Puts the pager under the rows. |

An empty page after the first says `Page 4 · no rows` and keeps the pager, so
you can go back. A table without these options keeps the 0.6 pager.

**Pages or one scrolling list from a server: `dataSource` with `paging`**

0.6.2's `paging` and 0.7.0's `dataSource` answer two different questions, and
they combine. `paging` decides how the rows are shown: in pages, or as one list
that loads more near the end, with its strip under the body and its soft and
hard limits. `dataSource` decides who fetches them: the table. Without
`dataSource`, your code fetches, exactly as in 0.6.2. With it, the table is its
own `paging` consumer:

```js
DataTable.mount(host, {
    headers, virtualize: true,
    dataSource: (query, { signal }) => api.rows(query, { signal }),   // { rows, total, hasMore }
    paging: { mode: 'scroll', pageSize: 1000, softLimit: 10000, onModeChange: remember },
});
```

| `paging` key | Without `dataSource` (0.6.2) | With `dataSource` (0.7.0) |
|---|---|---|
| `mode`, `pageSize`, `softLimit`, `hardLimit`, `loadMorePx` | Yours | Yours. `pageSize` is also each question's `limit`. |
| `offset`, `total`, `atLeast`, `hasMore`, `held` | Yours, kept up to date with `setPaging` | Read from the source's answers (`atLeast` may be in the answer). What you pass is ignored. |
| `onPage(offset, limit)` | Yours: fetch the page | The table's: asks `{ offset, reason: 'page' }`. |
| `onLoadMore()` | Yours: fetch the next rows | The table's: asks `{ offset: rows held, limit: pageSize, reason: 'more' }` and draws the answer under the rows held. |
| `onLoadAll()` | Yours | The table's: one question, `{ limit: hardLimit − rows held, reason: 'all' }`. The source answers as many rows as it will, and `hasMore` says whether there are more. |
| `onModeChange(mode)` | Yours: show the rows the other way | Called after the table has switched and asked again from the first row (`reason: 'mode'`). Without it there is no switch, as in 0.6.2. |

So there is one strip, one set of limits and one load trigger. With `paging`
the 0.7.0 pager is not drawn, and `pagerPosition` does nothing. `pagerLabels`
and `maxJumpOffset` apply to the strip's page buttons.

- While the source answers a sort, a filter or a refresh, the table asks for no
  more rows. A sort or filter sent while more rows are on their way aborts that
  request, as any newer question does. More rows do not show the loading
  overlay; the strip shows the table is busy.
- More rows keep the scroll position, the selection and the open details.
- When the rows scrolled in prove the source holds more than `softLimit`, the
  table is shown in pages from then on (`resolvePaging`, as in 0.6.2). The page
  shown is the rows just loaded, so nothing is fetched again and the reader
  carries on where they were.
- `refresh()` and `follow` in scroll mode read the rows held again, in one
  question from the first row. Scrolling down to load more turns following
  off, the way paging away does. Rows loaded only because the first ones did not
  fill the box do not, since the reader is still at the top.
- `setPaging({ mode })` that changes how the rows are shown asks again from the
  first row. Other patches only redraw the strip, as in 0.6.2.
- `goToPage`, `goToRow` and `getPageInfo` work as they do without `paging`,
  in `paging.pageSize` pages.

**Refresh and follow**

| Option | What it does |
|---|---|
| `refresh()` | Reads the current page again in place. A reader at the top sees the rows that arrived. A reader scrolled down keeps the rows they were reading at the same place on screen, because new rows above move the scroll position instead of the rows. The selection is kept by key, as are the active row and the open details. Rows that the last answer did not hold are drawn `twm-dt-row--new` (a short highlight); this needs `getRowKey`. |
| `follow: true` or `{ interval }` | Calls `refresh()` every `interval` ms (default 10 000) while the table is on its first page, in the document, and has no request out. A tick also waits while somebody is reading: while text inside the table is selected, or the focus is inside an open detail, it reads nothing, and following resumes at the next tick after. A `refresh()` you call yourself does not wait, and puts the focus back on the same place in a detail it draws again. Paging away turns following off and calls `onFollowChange(false)`. Coming back to the first page does not turn it on again. |
| `setFollow(on)`, `isFollowing()`, `onFollowChange(on)` | Turn following on and off from your own toggle, and hear when the table turns it off. |

The follow timer holds the table weakly, so it never keeps a discarded table
alive, and it stops on `dispose()`.

**Filters that are not text**

| Option | What it does |
|---|---|
| `filterKinds` | A filter control per column, as an object or array keyed by column index, or a function `(colIdx, header) => spec`. `'text'` (or nothing) is the usual text box. `{ kind: 'chips', options: [{ value, label, icon, title }], multiple }` draws chips. `{ create(ctx) }`, or a function, is your own control. A column is never narrower than its control at its narrowest (for chips, the widest chip); above that the cell wraps the control. |
| The chips | One chip per option, each with a count. An option whose value is `''` or `null` means no filter, and it is pressed when nothing is chosen. Pressing the chosen chip again clears the filter. With `multiple`, each chip toggles its value in a list. A chip whose count is 0 is dimmed, not hidden. `createChipsFilter(ctx, spec)` builds the same control outside a table. |
| Your own control | `create(ctx)` receives `{ column, header, value, counts, setValue(v), table }` and returns `{ el, setValue(v), setCounts(c), destroy(), match(cell, value, row) }`. Only `el` is required. Call `ctx.setValue` with the new value, which can be anything, such as `{ from, to }` for a date range or a person's id. |
| `setFilterCounts(colIdx, counts)` or `setFilterCounts({ [colIdx]: counts })` | Gives a column's control its counts, keyed by option value. They are kept, so a control built later starts with them. A `dataSource` answer can carry them as `filterCounts`. `getFilterCounts(colIdx)` reads them back. |
| `setFilter(colIdx, value)`, `getFilters()`, `onFilterChange(filters)` | Set one column's filter from code (an empty value clears it), read the filters in force as `[{ column, header, value }]`, and hear every change. `clearFilters()` resets each control as well. |

Under `dataSource`, a filter's value goes to the server as it is. Without a
server, the control's `match` decides which rows pass. If it has none, the
chips use equality (or membership, with `multiple`), a `{ from, to }` value is
an inclusive range over dates or numbers, a list means "one of these", and text
means "contains". A control is built once, and the same element is put back
after every render, so its own state, the focus and the text selection inside
it survive a redraw. It is destroyed when the columns change or the table is
disposed.

**Housekeeping**

| Option | What it does |
|---|---|
| `keepWhileDetached` | With `autoDispose`, how long a table may be out of the document and still come back drawn. A number is a grace period in ms. `true` keeps the table for as long as it is out: it is disposed only by `dispose()`, and while out it holds nothing on the document. A table put back within its grace is not disposed, however many tasks it was out, and the grace counts from its last departure, not its first. Use it for a tab whose content you detach and attach again later. Without it, `autoDispose` gives one task's grace, as in 0.5.0. |

**One change that needs no option.** `autoDispose` now cancels a pending
dispose when the table is put back. Before 0.7.0, a table taken out, put back
and taken out again could be disposed by the first departure's timer.

### DataTable: your own right-click items, a render hook, the keyboard, a remembered page

These options let an application drop a private copy of the DataTable kept for
them. Every one is off until you set it, and a table that sets none of them
draws and behaves as in 0.9.1.

```js
const queue = DataTable.mount(host, {
    headers, rows, pagination: true, sortable: true, filterable: true,
    stateStore, persistKey: `queue:${view}`,
    persistPage: !!savedView,              // an ad-hoc view shares its key: start it on page 1
    getRowKey: (row) => row[0],
    contextMenuItems: (row, rowIdx, ctx) => [
        { label: ctx.selection.length > 1 ? `Open ${ctx.selection.length}` : 'Open',
          icon: 'open_in_new', action: 'open' },
        { separator: true },
        { label: 'Delete…', icon: 'delete', action: 'delete', danger: true,
          disabled: !canDelete(row), title: canDelete(row) ? '' : 'Closed records stay' },
    ],
    onContextMenuAction: (action, rowIdx, row, ctx) => run(action, ctx.selectedRows),
    onRender: (t) => status.textContent = `${t.getDisplayedRows().length} of ${rows.length} shown`,
    keyboardNav: true,
    onRowKeyDown: (rowIdx, row, ev) => {
        if (row && ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { openElsewhere(row); return true; }
        if (row && ev.altKey && ev.key.toLowerCase() === 't') { openInTab(row); return true; }
    },
    onRowActivate: (i, row) => open(row),
    activateOn: ['click', 'enter'],
});
queue.focus();
```

**The right-click menu**

| Option | What it does |
|---|---|
| `contextMenuItems` | Your items in the table's own right-click menu: an array, or `(row, rowIdx, ctx) => items`, asked on every right-click of a row. An item is `{ label, icon, action, disabled, danger, title }` or `{ separator: true }`, drawn like the copy items (`disabled` greys it out, `danger` draws it red, `title` says why). `ctx` is `{ rowIdx, row, colIdx, value, selection, selectedRows }`: the row and the cell under the pointer (`colIdx` is null on the row-number column) and the selection, which by then includes the row. Your items come first; with `copyable`, a separator and the two copy items follow. Set without `copyable`, the menu has your items only, and a row you give no items gets the browser's own menu. |
| `onContextMenuAction(action, rowIdx, row, ctx)` | Called when one of your items is chosen, after the menu has closed. The copy items never call it, so an action may be named anything. |

**What the table shows**

| Option | What it does |
|---|---|
| `onRender(table)` | Called at the end of every render: the first one, `setData`, a sort, a filter, a page. A hook that throws is reported on the console and the table still draws. |
| `getDisplayedRows()` | The rows the table shows, filtered and sorted, across every page and not only the one on screen. It returns a copy. With server-side paging it is the page held. |

**The keyboard**

| Option | What it does |
|---|---|
| `keyboardNav: true` | On the focused table, ArrowUp and ArrowDown move the selection one row through the page shown, in the order shown, and Home and End go to its first and last row. With Shift they select the range from the anchor, as Shift-click does (not on a `selectable: 'single'` table). The row is scrolled into view and `onSelectionChange` is told. Keys pressed in a control inside the table are left alone. Needs `selectable`. |
| `onRowKeyDown(rowIdx, row, ev)` | Called for every key pressed on the focused table, before the table's own keys, with the row Enter would open (the one row selected, the selection's anchor, or else the active row) or `null`. Return `true` to take the key: its default is prevented and nothing after it sees it, neither the table (Enter's `onRowActivate`, the arrows, copy) nor the page. Use it for the keys `activateOn` does not take, such as Ctrl+Enter or Alt+T. |
| `focus()` | Puts the keyboard focus on the table's body without scrolling the page. Returns `false` when nothing is drawn yet. |

**A remembered page**

| Option | What it does |
|---|---|
| `persistPage: true` | With `persistKey` and `stateStore`, saves the client page with the sort and filters, and opens the table on it again. If the rows have shrunk since, it opens on the last page. A new filter, and a sort under `resetPageOnSort`, go to the first page and save that. Rows given after mounting (`rows: []`, then `setData`) still open on the saved page. Server-side paging is not affected: its page is your `offset`. Off by default, because a key shared by different row sets, such as ad-hoc filters or search results, must not reopen on a page of the previous list. Without it, the saved state is exactly what 0.9.1 saves. |

### DataTable: columns hidden until somebody asks for them

A column can be part of the row data without being drawn. People choose which
columns they see from the header's right-click menu, and the choice is
remembered. A table that sets none of these options draws every column, as in
0.9.1.

```js
const list = DataTable.mount(host, {
    headers: ['Id', 'Summary', 'Status', ...customFields.map((f) => f.label)],
    rows,
    hiddenColumns: customFields.map((_, i) => 3 + i),   // not shown until picked
    columnChooser: true,
    stateStore, persistKey: 'bugs:queue',
    onColumnsChange: (hidden) => console.log('hidden now', hidden),
});
list.setColumnVisible(3, true);
```

| Option | What it does |
|---|---|
| `hiddenColumns: [colIdx, ...]` | These columns are not drawn: no header, no filter box, no cell, no width in the fit, and they are left out of a copy and of `downloadCSV()`. They stay in the row data, so `renderCell`, `contextMenuItems`, `sortBy` and `setFilter` still see them. The last column shown can never be hidden; a list that hides all of them keeps the first. `setData({ hiddenColumns })` applies a new list. Column indices are positions, so a new `headers` list keeps the set by position. |
| `columnChooser: true` | A right-click on the header opens a menu that lists every column, with a check mark on those shown. Choosing one shows or hides it. The last column shown is greyed out and says why. Without the option the header keeps the browser's menu. |
| `setColumnVisible(colIdx, on)` | Shows or hides a column from code. Returns whether anything changed. The widths of the other columns, dragged or fitted, stay with their columns; a column shown again is measured. |
| `getHiddenColumns()` | The hidden columns' indices, ascending. |
| `onColumnsChange(hidden)` | Called after every change of the set: the chooser, `setColumnVisible` and `setData({ hiddenColumns })`. |
| With `persistKey` | The set is saved with the sort and the filters and restored on mount. A saved set wins over `hiddenColumns`, so a column somebody chose stays chosen. A table without these options saves exactly what 0.9.1 saves. |

A column sorted on and then hidden keeps the order; its arrow comes back with
the column.

### DataTable: the CSV button on every table (0.14.1)

`showExportButton: true` draws "Download visible rows as CSV" in the pagination
strip, and now draws the strip for it on a table that fits on one page too (the
button alone, no page buttons). `exportFilename` — a string, or `(table) =>
string` — names the file (default `data.csv`). With a `host` that has `dialogs`
the button opens the native Save dialog, suggesting that name; without one it
is a browser download.

```js
DataTable.mount(el, { headers, rows, pagination: true, showExportButton: true,
                      exportFilename: 'bugs.csv', host });
```

### DataTable: a select mode (0.12.0)

A list whose click opens a row can still let people pick many rows: a toggle
in the table's own header turns on a select mode, with a checkbox per row and
a click that ticks instead of opening. A table that sets none of these options
draws and behaves as in 0.11.

```js
const list = DataTable.mount(host, {
    headers, rows,
    getRowKey: (row) => row[0],            // keeps the ticks across new rows
    onRowActivate: (i, row) => open(row),  // not called while selecting
    selectToggle: true,
    onSelectModeChange: (on) => bar.hidden = !on,
    onSelectionChange: (ticked) => bar.count = ticked.length,
});
list.setSelectMode(true);
```

| Option | What it does |
|---|---|
| `selectToggle: true` | Draws a narrow leading column whose header holds a toggle button. While the mode is on, every row shows a checkbox and the header a select-all box. Needs a multi-row `selectable` (on `false` or `'single'` it is ignored, with a console warning). |
| `selectMode: true` | Starts in the mode. Draws the column even without `selectToggle`; the consumer then leaves the mode with `setSelectMode(false)`. |
| `setSelectMode(on)` / `isSelectMode()` | Turns the mode on or off from code (returns whether it changed), and says whether it is on. The selection is kept either way. |
| `onSelectModeChange(on)` | Called after every change of the mode: the toggle, Escape, `setSelectMode`. |
| In the mode | A plain click or Space ticks or unticks one row; Shift-click adds the range from the last row ticked. The arrows move a cursor without changing the ticks (Shift ticks the rows passed). A right-click keeps the ticks. Escape clears them, and a second Escape leaves the mode. Nothing opens a row: `onRowActivate` is not called (`onRowClick` still is, so a consumer that opens rows from it checks `isSelectMode()`). New rows (`setData`) keep the ticks by `getRowKey`. |
| Select-all | Ticks every row the filters let through, on every page; when all are ticked it clears them. It shows checked, mixed or clear. |

The select column is not a data column: it is not in a copy, a CSV,
`ctx.colIdx` or `hiddenColumns`, and it cannot be resized. It is drawn for the
table's whole life, so remembered widths stay on their columns when the mode
flips, and widths saved by a table without it land on the same columns.

### Scrollbars

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

### SliderField: a number box, a readout, a default and an enable toggle (0.17.0)

`new SliderField({ fieldId, field, onChange })` (from `@flexdesk/widgets`)
draws a range input. Its companions are opt-in through `field`; with none of
them the DOM is the range and the helper line, as it always was.

```js
import { SliderField } from '@flexdesk/widgets';

const slider = new SliderField({
    fieldId: 'rate',
    field: {
        min: 0, max: 1, step: 0.01, value: 0.25,
        numberInput: true,                         // an editable box, kept in sync both ways
        readout: (v) => `${Math.round(v * 100)}%`, // or true for the plain value
        defaultValue: 0.25,                        // --modified state and a reset button
        toggleable: true, disabledValue: null,     // an enable checkbox before the slider
    },
    onChange: (value, { immediate }) => save(value),
});
host.appendChild(slider.render());
```

| Field / method | What it does |
| --- | --- |
| `numberInput` | A text box beside the slider. Dragging updates it on every frame; Enter (or leaving the box) commits what was typed, clamped to `[min, max]` and snapped to `step`. Text that is not a finite number (`abc`, empty, `Infinity`) changes nothing and the box shows the value again; Escape does the same |
| `readout` | A span after the slider: `true` shows the value, a function `(value: number) => string` formats it. It follows the drag live |
| `defaultValue` | While the value differs from it the root carries `twm-slider-field--modified` and the reset button shows; reset restores it and reports it through `onChange`, like a release |
| `toggleable`, `enabled`, `disabledValue` | A checkbox before the slider (`enabled: false` starts it off). While off, the inputs are disabled, the root carries `twm-slider-field--off`, and `onChange`/`getValue()` report `disabledValue` (default `null`) |
| `onChange(value, { immediate })` | Called once per commit: a drag release, a typed Enter, a reset, a toggle. The value is the slider's value as a string, as before. With `emitOnInput` it is also called on every drag frame with `immediate: true` |
| `setValue(x, { silent })`, `setRange({ min, max, step }, { silent })`, `setEnabled(on, { silent })`, `reset({ silent })` | Change the field from code. Each reports at most once, nothing with `silent: true`, and nothing when the reported value did not move, so a caller that writes back from its own `onChange` does not loop. `setValue` refuses a non-finite value (returns `false`); `setRange` refits the value and the default |
| `getValue()`, `isEnabled()`, `isModified()` | What `onChange` would report now, the toggle state, and whether the value differs from `defaultValue` |

### A stack of collapsible sections: `createSectionStack` (0.17.0)

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

## Flow editors

*New in 0.6.0.* Both entries first ship in FlexDesk 0.6.0.

`@flexdesk/flow` holds three editors for flows — a graph of steps, each with
settings — and the kit they share: a **canvas** (nodes and lines), an
**outline** (the graph drawn as a list of blocks) and **lanes** (data flows,
left to right). All three are domain-neutral. An editor never fetches, never
saves and never starts a timer that writes: the step types, the reference
grammar, every finding and every byte of I/O are the consumer's, handed in as
options and handed back through callbacks. `@flexdesk/canvas` is the kernel
under the canvas editor (and under any other diagram), on its own so that a
diagram does not download the editors.

Nothing here changes an existing entry. Both are new entry points, and their
CSS is four new sections at the end of `flexdesk.css`, read only by the classes
these modules set.

```js
import {
    createStepCatalogue, createWidgetRegistry, createSettingsPanel,
    TEMPLATE_REFERENCES, FlowHistory, bindFlowKeys,
} from '@flexdesk/flow';
```

### The kit

The parts every editor stands on, exported for a consumer that builds its own.
A test (`tests/flow_kit_vocabulary.test.mjs`) fails when a file under
`src/flow/` or `src/canvas/` names a consumer's vocabulary, calls `fetch` or
touches browser storage — and is shown to fail on a planted one.

| Part | What it does |
|---|---|
| `createStepCatalogue(types, {categories, idBase})` | The step types the consumer passes in, read as they arrive (`type_id`, `label`, `category`, `role`, `description`, `icon`, `ports`, `config_schema`, `unavailable`; any other key is kept). `get`, `list`, `byCategory`, `role`, `tone`, `inputs(typeId, {flow})`, `outputs`, `port`, `idBase`, and `problems` — a broken type is listed there, never thrown. **Ports keep their declared order**: a lane reads the first input as its own and an outline draws the other outputs as arms in order, so nothing sorts them |
| `checkSettingsSchema(schema)` | The JSON-Schema subset a step's settings may use: `type`, `enum`, `const`, `required`, `properties`, `additionalProperties` (a boolean), `items`, `minItems`/`maxItems`, `minimum`/`maximum`, `minLength`/`maxLength`, `format: "uuid"`, the annotations and any `x-` hint. Returns the first refusal as the server's own sentence, or `null`. `oneOf`, `anyOf`, `$ref` and `pattern` are refused. `tests/fixtures/flow_kit_settings_schema.json` holds 30 schemas and their verdicts. Tables' own `check_schema` gave the same 30 verdicts when the file was written, and is meant to read this file in a test of its own |
| `createWidgetRegistry()` | The controls, by name. The ten generic widgets are registered already; `register(name, widget)` throws for a name that exists, and replacing one takes `{replace: true}`. A widget is `(spec, value, ctx) => {el, destroy?, focus?, caret?, restoreCaret?}` and reports with `ctx.set(value)`; `undefined` removes the setting |
| `createSettingsPanel(options)` | One step's settings, or the flow's own, drawn from the schema (below) |
| `createReferenceSyntax({name, pattern, format, describe, stepScope})` | What a chip is. Three are ready: `TEMPLATE_REFERENCES` (`${a.b[0]}`), `FORMULA_REFERENCES` (`[a.b]`), `PARAMETER_REFERENCES` (`{{name}}`). `find`, `format`, `rename(text, map)` and the consumer's `describe(match, ctx) → {label, tone, known}` |
| `createChipInput({value, syntaxes, multiline, readOnly, onInput})` | Text with references drawn as chips. **The value is always the plain text**; a chip is a view of it |
| `openStepPicker({anchor, entries, categories, where, paste})` | What "+" opens: grouped, searchable, ↑ ↓ and Enter; a refused entry is shown greyed with its reason. Resolves `{entry}`, `{paste: true}` or `null` |
| `openValuePicker({anchor, groups, note, onPick})` | *Insert a value*: the consumer's groups of values, a level down for a value with children (`body ›`), searchable across levels |
| `alwaysBefore(graph, catalogue, stepId, {loopPorts, waitsForAll})` | The steps that run before this one on every path, nearest first: the only ones *Insert a value* should offer. A parallel whose merge waits for every branch counts each branch's steps; a loop's body never counts for a step after the loop. `enclosingLoops` lists the loops around a step |
| `groupFindings(list)`, `createFindingsStrip({onGoTo, nameOf})` | The consumer's findings (`{code, message, severity, node_id?, field?}`) by step, and the strip: *"N things to fix before this can be published."*, a line each, *Go to it* |
| `new FlowHistory({actions, restore, onState, limit, mergeMs})` | Undo and redo over whole snapshots. The editor passes its own list of actions and `commit` throws on any other, so an edit nobody named fails its first test. Loading and publishing are `baseline`s, never entries. Keyed commits within `mergeMs` merge (typing a name is one entry), never across an undo. `keep()` and `adopt(kept, state)` carry the stacks to a successor that loaded the same bytes |
| `bindFlowKeys(root, handlers)`, `ownsUndo(target)` | An editor's keys, bound on its root, never on `window` (below) |
| `emptyGraph`, `normalise`, `serialise`, `nextId`, `addNode`, `removeNode`, `connect`, `canConnect`, `disconnect`, `inputNamesOf` | A logic flow's graph — `{nodes: [{id, type, label?, config, position}], connections: [{source, target, sourcePort, targetPort}]}`, the shape the canvas and the outline both save. `serialise` is byte-stable: a graph opened and saved with no edit is the same text |
| `createStrings(...layers)`, `FLOW_STRINGS` | Every word drawn, English and domain-free by default; an editor lays its own words over these, and the consumer lays its words over both |

**The settings panel.**

```js
const panel = createSettingsPanel({
    widgets, references: { template: TEMPLATE_REFERENCES },
    onChange: (stepId, key, value) => apply(stepId, key, value),   // you write it into your graph
    onRename: (stepId, label) => rename(stepId, label),
    onFocusLost: () => surface.focus(),
    values: async ({ stepId, field }) => groupsFor(stepId),         // Insert a value; absent, no "{ }"
    columns: (step) => inputColumnsOf(step),                         // upstream-column(s); null in a logic flow
    host,
});
panel.show({ step, type, title, typeLabel, where, description, idLine, icon, tone,
             rename: true, extra: [...], actions: [...], slots: { before, after } });
panel.setFindings(findings);     // under each field, the rest at the top; rebuilds nothing
panel.focusField('retry.max_attempts');
panel.repaintSlots();            // your areas only; no field is rebuilt
```

It never writes into the step: a change is reported to `onChange`, and the
consumer writes it. A redraw puts focus back on the rebuilt control of the same
field, with the caret where it was, or hands it to `onFocusLost`, never to
`<body>`. Findings and slot redraws rebuild no field, so a run overlay that
refreshes every second leaves a name being typed alone. A control that cannot
be used is disabled and its reason is shown next to it, not only in a tooltip.
`extra` holds the editor's own fields (a port shown as a setting) and notes,
placed with `after: '<key>'` or `at: 'start'`.

**The widgets.** A schema type with no `x-ui-widget` draws its plain control: an
`enum` a select (writing the enum's own value, so a number stays a number), a
string a text box, a number a number box, a boolean a checkbox, an object with
properties a group of its own fields. A control never writes a value the reader
did not give it. An untouched setting stays absent, and emptying one removes it.
A list or map entry keeps its stored type when another entry is edited. A widget
name nobody registered is refused on screen, by name, and its value is kept.

**A widget is built before it is in the document.** The panel calls the widget,
then attaches what it returns, and a field inside a folded (`x-ui-fold`) group
is built inside a closed `<details>`. A widget that measures itself — a Monaco
editor registered as `expression` — must create that editor once its element is
connected and has a size (a `ResizeObserver` on `el` will tell it), never inside
the widget call: an editor built into a box with no size measures a zero
character width and paints a viewport of no lines, and nothing repaints it.

| Generic widget | Draws |
|---|---|
| `template` | Text with chips and *Insert a value*. A setting that may also be a list or an object is shown as JSON and written back as one when the text parses |
| `expression` | A formula: monospace, with chips. Replace it with your own editor (`{replace: true}`) |
| `json-body` | JSON when the text parses, text otherwise |
| `key-value-map` | Names to values |
| `key-value-list` | Ordered assignments: `{variable, value}` or `{variable, expression}` |
| `string-list` | Short strings |
| `enum-chips` | A multi-select of `items.enum`, as chips, in the enum's order |
| `choice-cards` | One of N as radio rows, each with its words |
| `upstream-column`, `upstream-columns` | One or several columns of the step's input, by name, from the panel's `columns`. While `columns` answers `null` (the columns are not known yet) the name is typed instead — a text box, or a chip list that takes a name on Enter or a comma — under the hint *Columns not known yet*; once columns arrive the same setting is a select (or toggle chips) with the stored name chosen, and a name the columns lack is kept and marked *(not found)* (0.17.0) |

| Schema hint | Meaning |
|---|---|
| `x-ui-widget` | The widget that draws the field |
| `x-ui-references` | The syntaxes its chips are recognised in, by name. Without it, `template`, `json-body` and the two key-value widgets use `template`, and `expression` uses `formula` |
| `x-ui-when` | `{field, in}`: drawn only while that sibling holds one of those values (its stored value, else its default) |
| `x-ui-placeholder`, `x-ui-multiline` | A placeholder; a string as a growing textarea |
| `x-ui-enum-labels`, `x-ui-enum-descriptions` | An enum's words, and a sentence under each choice card |
| `x-ui-fold` | An object drawn folded, with a one-line summary of what is set in it |
| `x-ui-add-label` | The words on a list's *Add* button |
| `x-ui-formula-references` | `key-value-list`: the syntaxes of a formula row (default `formula`) |

**References and chips.** A syntax recognises references in order to draw them.
It is not a grammar. A reference your server would refuse is still drawn as a chip
(`describe` can mark it `known: false`) and kept as text. Each syntax has a
default tone for its chips (`PARAMETER_REFERENCES` is violet, the others blue),
so two syntaxes in one field read as two kinds of chip. In the chip input the
browser does the typing, so an IME works. After every input the text is read
back and re-tokenised. Everything else the control does on the text itself:
← and → step over a chip, one Backspace removes a whole chip, a paste is plain
text, a copy puts the exact text on the clipboard, and Enter adds a line only in
a multi-line field. It keeps its own undo, because a script that redraws a
`contenteditable` breaks the browser's. `rename(text, map)` rewrites only the
path segment that names a step, and only once the syntax is told which segment
that is (`stepScope: 'steps'`, or a `stepSegment` function). A syntax nobody
configured renames nothing.

**Keys.** `bindFlowKeys(root, handlers)` binds Ctrl/⌘+Z (`undo`), Ctrl/⌘+Y and
Ctrl/⌘+Shift+Z (`redo`), Delete (`remove`), Ctrl/⌘+D, C, X and V (`duplicate`,
`copy`, `cut`, `paste`), F2 (`rename`), Alt+↑, Alt+↓ and Alt+← (`moveUp`,
`moveDown`, `moveOut`), the arrows (`up`, `down`, `left`, `right`), Enter
(`open`) and Escape (`escape`), and returns an unbind. A key whose handler is
absent, or returns `false`, is not taken. An editor's own row or card marks
itself `data-twm-flow-item`, so Enter on it opens it. Inside a text field Ctrl+Z is the field's own, but it is
still stopped at the editor's root, so a tile beside the editor never hears it.
In a field every other key belongs to the field, and Enter on a button belongs
to the button. **Backspace is never an editor key.** It is not handled and not
stopped, because a host may use it to go back a level.

**Tones and strings.** A category names a tone (`violet`, `teal`, `amber`,
`grey`, `blue`, `indigo`), and `tokens.css` maps each tone to colours:
`--twm-flow-<tone>-bg`, `-fg`, `-line`, `-icon-bg`, `-text-bg` and `-dot`.

**What it does not do.** It does not validate a value against its schema, decide
whether a reference is valid, save, fetch, or keep anything between page loads.
Those belong to the consumer.

**Where each claim was checked.** jsdom computes no layout and does no editing,
so the suites (`tests/flow_kit_*.test.mjs`) assert the DOM, the events and the
text. The rest was checked in headless Edge with real input over the DevTools
protocol: `demo/flow_kit_probe.mjs` serves the repository, opens
`demo/flow_kit.html` and drives it (`demo/flow_cdp.mjs` is the small driver it
uses, for the editors' pages too). The demo pages load the source barrels;
`FLOW_DIST=1 node demo/flow_<kit|canvas|outline|lanes>_probe.mjs` redirects
`flow.js`, `canvas.js` and the three sheets to `dist/`, so the same checks run
against the built bundle. All four probes passed both ways on the integration
build. In the chip input, typing on either side of
a chip, ← and → over it, one Backspace removing it, a real paste of `${a.b}`
becoming a chip, a real copy giving the exact text, an IME composition leaving
the text alone until it committed, and the field's own Ctrl+Z all passed. The
same Backspace in a plain `contenteditable` whose chips are not
`contenteditable="false"` split its chip. A pointer drag across a chip started
no native drag. `elementFromPoint` at the centre of Undo, "+", the panel's
first field, its title, a field's "{ }", an action, a choice and the strip's
*Go to it* returned each one. Both pickers opened inside the viewport, their
search box focused, and gave the focus back to "+" on Escape.

### The canvas editor

A flow drawn as nodes and lines: a palette of step types, a pannable canvas and
the settings of whatever is picked, under a toolbar. It stands on the
`@flexdesk/canvas` kernel, which is also usable on its own for any diagram.

**The kernel** (`@flexdesk/canvas`).

| Part | What it does |
|---|---|
| `new CanvasAdapter({container, gridSize = 16, onViewportChange, onBackgroundMenu, nodeSelector})` | A surface you put nodes and lines on: right-, middle- or Shift-drag pans, Ctrl + the wheel zooms about the pointer, a left press on the background draws a marquee (`onMarquee(box)`, `onSelectionChange(selection)`). Fields `root`, `surface`, `edgeLayer` (an SVG), `nodeLayer`, `marquee`, `selection`, `scale`, `tx`, `ty`, `gridSize`. Methods `clientToCanvas`, `canvasToClient`, `snap`, `setViewport`, `viewport`, `zoomAt`, `fit`, `visibleBox`, `contains`, `bringIntoView` (pans and never zooms, and does nothing when the box is already in view), `consumeRightDrag`, `clear`, `destroy`. **A node is whatever you put in `nodeLayer`**: a press inside one starts no pan and no marquee, and a right-click on one keeps your menu (or the browser's). Pass `nodeSelector` when the node layer holds other things too. `onViewportChange` fires once, synchronously, from the constructor, so declare what it reads before you build the adapter |
| `routeEdge(from, to, {obstacles, simple})`, `selfLoop`, `returnEdge(from, to, {floor})` | SVG path data between two anchors `{x, y, side}`: a line with horizontal lead-outs (bent round obstacles up to `OBSTACLE_ROUTING_NODE_LIMIT` nodes), a node's line to itself, and a loop's line back, which runs under both nodes |
| `crowsFoot(point, side, kind)`, `footAnchor(point, side, kind)`, `cardinality({kind, optional})` | Crow's-foot ends (`many`, `one`, `zero-or-many`, `one-or-many`, `zero-or-one`, `exactly-one`) as an SVG group `twm-edge__marker twm-edge__marker--<kind>`, where the line should start so it meets the mark, and the two ends a reference implies |
| `arrange(nodes, edges, {columnGap, rowGap})` | A layered layout. **Two quirks, kept on purpose:** an edge points from child to parent (a node sits one column right of what it points at), and each column is sorted by `label`, which every node must have |
| `new NodePlatform({collapsedPorts})` | The nodes and their ports: `hydrate(nodes)`, `get`, `all`, `port`, `setPosition`, `setCollapsed`, `visiblePorts(id)`, `on(event, fn)` (`hydrated`, `moved`, `collapsed`). A node is `{id, position, size, collapsed, ports, …}`; any other key is kept |
| `new ConnectorRouter({platform, selfReference, policy, endsOf, disabledEnds, strings})` | Edges and whether a drop may become one. `canConnect(source, target, {pendingEdges})` refuses, in order, a node that is gone, a port that is gone, a disabled port (with its `disabledReason`), a self-reference (unless `selfReference`), and a port at its `maxConnections`. Only then does it ask your `policy(ctx)`, which may refuse, allow, or answer `{ok: true, offer}`. Also `hydrate`, `edges` (a Map), `edgesFor`, `stage`, `unstage`, `remapNodeConnections(nodeId, portIds)` (keeps the edges whose ports survive and reports the rest) |
| `new HistoryService({actions, apply, onState, limit, requires, refusal})` | Undo over recorded edits (deltas), behind a closed action list: `record` throws on any action you did not declare. Nothing is recorded before `hydrated()`, and a batch (`startBatch`/`endBatch`) is one entry. Also `undo`, `redo`, `reset`, `adopt`, `undoStack`, `redoStack`, `canUndo`, `canRedo`. A missing `actions`, `apply` or anything named in `requires` throws at construction, not at the first silent no-op |

A diagram with its own rules subclasses the three and passes them in. For
example, a schema diagram's router answers the generic refusals in its own
words and keeps its foreign-key rules in the policy:

```js
class ConnectorRouter extends Base.ConnectorRouter {
    constructor({ platform }) {
        super({ platform, selfReference: true, disabledEnds: ['source'],
                endsOf: (e) => ({ from: `col:${e.from_col}`, to: `col:${e.to_col}` }),
                strings: { nodeGone: 'That table is no longer on the diagram.' },
                policy: (ctx) => myForeignKeyRules(ctx) });
    }
}
```

`tests/canvas_graph.test.mjs` §7 builds such a diagram on the generic layer.

**The editor.**

```js
import { createCanvasEditor, createStepCatalogue } from '@flexdesk/flow';

const editor = createCanvasEditor(host, {
    catalogue: createStepCatalogue(types, { categories }),
    flowSettings: { title: 'Sync', schema, value },          // the flow's own settings, shown when nothing is picked
    actions: [{ id: 'publish', label: 'Publish', icon: 'publish', primary: true, run: (ed) => publish(ed) }],
    onChange: ({ graph, flowSettings, text, action, key, via }) => autosave(text),
    values: async ({ stepId, field, before, loops }) => groups,   // Insert a value
    dataPortRead: (node, port) => `\${steps.${node.id}.${port.name}}`,
    summariseReads: (node) => `Later steps read it as \${steps.${node.id}.…}`,
});
editor.load({ graph });                  // a baseline: there is nothing to undo after it
editor.setFindings(validatorResult);     // on the nodes, under the fields, in the strip
editor.setRunOverlay({ steps, ports, banner });
```

| Option | Meaning |
|---|---|
| `catalogue` | `createStepCatalogue(...)`, or the raw list of types. The palette shows them by category, except start-role types (`paletteTypes(type)` decides). A type with `unavailable` is shown greyed, with its sentence under it |
| `widgets`, `references`, `strings`, `services` | The kit's widget registry, the reference syntaxes by name, your words (`CANVAS_STRINGS` and the kit's), and your bag, handed to every widget unchanged |
| `values` | *Insert a value*: called with `{graph, stepId, field, key, before, loops}`, where `before` is the steps that always run before this one (`alwaysBefore`, nearest first) and `loops` the loops around it. Returns groups, or `{groups, note}` |
| `summarise(node, type)` | A line under a node's ports. `summariseReads(node, type)` is the panel's id line |
| `dataPortRead(node, port)` | How a data port is read, in your syntax. It is shown on the port, which cannot be connected |
| `flowSettings` | `{title, schema, value}` — the flow's own settings, edited as `flow:settings` |
| `readOnly` | `false`, or `{reason}`, which is shown above the editor. Every verb is then refused with that reason, and no gesture writes |
| `actions` | Your toolbar verbs, `[{id, label, icon, primary, danger, title, run(editor)}]`, after Undo, Redo, Arrange and Fit |
| `slots` | `toolbarEnd(el)`, `flowPanel(el, editor)` and `stepPanel(el, node, editor)`, drawn by you; `setRunOverlay` redraws the panel slots and nothing else |
| `onChange`, `onSelect` | After every committed edit. An undo or a redo is a change too (`action: null`, `via: 'undo' \| 'redo'`), because you autosave what is undone. `onSelect({kind, id})`: `step`, `flow`, `connection` (with `connection`) or `null` |
| `loop`, `waitsForAll` | The loop's port names (`{entry: 'in', next, body, done}`): a line into a loop-role step on any input but `entry` is its body going back round, drawn dashed under both steps. `waitsForAll(join)` goes to `alwaysBefore` |
| `removable(node, type)` | Whether a step may be removed. By default every step except a start step |
| `node` | `{width: 208, header: 34, row: 22}` (`CANVAS_NODE`). Lines are anchored by arithmetic over these numbers, and the stylesheet is held to them |
| `history`, `gridSize`, `label` | `{limit, mergeMs}`, the snap grid, and the canvas's accessible name |

| Method | Does |
|---|---|
| `load({graph, flowSettings}, {baseline = true, fit = true})` | Replaces the content. A baseline clears both stacks. With `baseline: false` the stacks are kept, and the loaded content becomes the present they undo from |
| `getGraph()`, `serialise()`, `snapshot()`, `getFlowSettings()` | A copy of the graph; its byte-stable text; the text the history holds (graph and settings); the settings |
| `setFindings(list)`, `setRunOverlay(overlay \| null)`, `setReadOnly(false \| {reason})` | — |
| `setActionState(id, {disabled, reason, busy})`, `setStatus(text)`, `setMessage(text, tone)` | A verb refused in place, with its reason printed beside the toolbar; the status line; the gesture line |
| `select(id \| 'flow' \| null)`, `repaintPanel()`, `focus()`, `undo()`, `redo()`, `arrange()`, `fit({whole})` | — |
| `history`, `canvas` | The editor's `FlowHistory` (`keep()`, `adopt(kept, editor.snapshot())`, `baseline(editor.snapshot())` for your publish) and its `CanvasAdapter` |
| `destroy()` | Removes every listener, the ghost of a drag and any picker it opened. It saves nothing, because the editor holds nothing |

Its edits are the closed list `CANVAS_ACTIONS`: `flow:node:add`,
`flow:node:remove`, `flow:node:move` (one per drag), `flow:edge:connect`,
`flow:edge:disconnect`, `flow:node:label`, `flow:node:config`,
`flow:settings`, `flow:arrange` (one entry for the whole layout). Typing a name
or a setting is one entry. The geometry under it is exported as well, all of it
pure: `CANVAS_NODE`, `arrangeCanvasGraph(graph, catalogue, {loopEntry})` (where
Arrange puts each step: a Map of id → `{x, y}` from the origin),
`canvasPortAnchor`, `canvasNodeBottom` and `isCanvasReturnEdge`.

**Gestures.** A node's header moves it. A connection is made by clicking an
output and then an input, and Escape cancels one in progress. A line is picked
by clicking it, and Delete removes it or the picked step. A palette step is
added by clicking it (at the centre of the view) or by dragging it onto the
canvas (where it is dropped). The drag uses pointer events and a ghost on
`document.body`. It never uses `draggable`, which cancels the pointer after
about 5px, and never `setPointerCapture`, which would send the release, and so
a second click, to the palette button. No press rebuilds a node, so a click lands
on the node it went down on. Arrange lays the run out left to right, a branch's
arms in their declared order, from the graph's own top-left corner. Fit frames
the graph at natural size or smaller; pressing Fit frames all of it.

**Keys** (bound on the editor's root): Ctrl/⌘+Z and Ctrl/⌘+Y or Ctrl/⌘+Shift+Z,
stopped at the root even inside a text field; Delete; F2 renames the picked
step; Enter on a focused node opens its settings; Escape. Backspace is never
the editor's.

**What it does not do.** It does not load, save, validate, publish or run
anything, and it does not keep the stacks across page loads. Those belong to
the consumer. Nor does it add anything a flow must have: a consumer whose new
flow opens on a start step adds that step to the graph before `load`, so it is
part of the baseline and the first Ctrl+Z does not take it away.

**Where each claim was checked.** `tests/canvas_adapter.test.mjs`,
`canvas_edge_router`, `canvas_graph`, `flow_canvas_layout`, `flow_canvas_editor`
and `flow_canvas_css` check the DOM, the events, the geometry and the stylesheet
as text. In headless Edge, `demo/flow_canvas_probe.mjs` drives
`demo/flow_canvas.html` with real input:
- `elementFromPoint` at the centre of Undo, Arrange, Fit, a consumer verb, a
  palette item, a node's header, a port, and the panel's name box, first field
  and Remove step returned each one, and the panel was not covered.
- Every line began and ended within 1px of its ports' dots, measured.
- The loop's line back ran below both of its steps.
- A real pointer drag from the palette added exactly one step, under the
  pointer, with a `dragstart` counter of 0. A drag ending off the canvas added
  nothing.
- A real click-then-click connected two steps.
- A header drag moved its node, and a real Ctrl+Z put it back. Backspace removed
  nothing, Delete removed the step, and the focus stayed on the canvas.
- At 700px the canvas took the editor's whole width.

### The outline editor

`createOutlineEditor` draws a logic flow as a list of blocks: *If … otherwise*,
*For each row* with its *Next row* foot, *At the same time* with its *Then wait
for every branch* foot, and a step's other ports (an error port, an empty-result
port) as arms under it. **The outline is the graph.** It reads the same
`{nodes, connections}` JSON the canvas edits, holds no second model, and every
edit is an operation on that graph. A graph opened and saved with no edit is the
same text, byte for byte, and node positions are kept and never used. A graph
that is not block-shaped is refused, never repaired: it opens read-only, as a
flat list in the order it runs, with the reason above it.

```js
import { createOutlineEditor, createStepCatalogue, createWidgetRegistry, TEMPLATE_REFERENCES } from '@flexdesk/flow';

const editor = createOutlineEditor(host, {
    catalogue, widgets: createWidgetRegistry(), references: { template: TEMPLATE_REFERENCES },
    blocks,                                            // which roles are blocks, and their words (below)
    values: async ({ stepId, field, before, loops }) => groupsFor(before, loops),   // Insert a value
    valuesNote: 'Only steps that always run before this one are listed.',
    summarise: (node, type) => oneLine(node),          // a row's line; {text, mono: true} for code
    summariseReads: (node, type) => howLaterStepsRead(node),   // the panel's id line
    flowSettings: { schema, value, title, typeLabel, where, description, idLine },
    actions: [{ id: 'publish', label: 'Publish', icon: 'publish', primary: true, run: () => publish() }],
    slots: { toolbarEnd: (el) => {}, flowPanel: (el) => {}, stepPanel: (el, node) => {} },
    initialFolds: saved, onFoldChange: (ids) => keep(ids),
    onChange: ({ graph, flowSettings, text, action, key }) => autosave(text),
    onSelect: ({ kind, id }) => {},                    // kind: 'flow' or 'step'
    readOnly: false,                                   // or {reason}
    history: { limit: 100, mergeMs: 1000 },
});
editor.load({ graph, flowSettings });                  // a baseline: nothing to undo
```

| Method | Does |
|---|---|
| `load({graph, flowSettings}, {baseline = true})` | Replaces the content; a baseline clears both undo stacks and emits nothing |
| `getGraph()`, `serialise()`, `getFlowSettings()` | A copy of the graph; its byte-stable text; the flow's own settings |
| `setFindings(list)` | A finding with a `node_id` replaces that row's line with its message, in the error or warning tone, marks the row, and is drawn under its field; the others go to the strip, with *Go to it* |
| `setRunOverlay({steps, ports, banner} \| null)` | A run drawn on the outline (below) |
| `setReadOnly(false \| {reason})`, `setActionState(id, {disabled, reason, busy})`, `setStatus(text)` | A refused verb is disabled with its reason beside it |
| `select(id \| 'flow' \| null)`, `focus()`, `undo()`, `redo()`, `history`, `folds`, `setFolds(ids)` | `select` unfolds the blocks around the step |
| `describe()`, `refusal` | The outline as text (`describeOutline`), or why the graph could not be drawn as one |
| `destroy()` | Removes every listener, popover and ghost. It flushes nothing, because it holds nothing |

**The block mapping.** The consumer says which catalogue roles are blocks and
what their parts are called. Nothing here guesses a domain:

```js
const blocks = {
    start:  { role: 'start', label: 'When it runs' },        // the flow row
    end:    { role: 'end', entry: { label: 'End the run', sub: 'End' } },
    step:   { input: 'in', continue: 'out' },                 // an ordinary step's two ports
    branch: { role: 'branch', arms: { true: 'Then', false: 'Otherwise' },
              entry: { label: 'If … otherwise', sub: 'Condition' }, note: 'Either arm may be empty.' },
    fanout: { role: 'fanout', join: { role: 'join', type: 'merge', field: 'join',
                                      foot: { all: 'Then wait for every branch', any: 'Then go on when the first finishes' } },
              arm: 'Branch {n}', addArm: 'Add a branch', entry: { label: 'At the same time', sub: 'Parallel + Merge' } },
    loop:   { role: 'loop', ports: { entry: 'in', next: 'next', body: 'body', done: 'done' },
              foot: 'Next row', skip: 'Go on with the next row', addInside: 'Add a step to the loop',
              entry: { label: 'For each row', sub: 'Loop over rows' } },
    arms:   { error: { label: (step) => `If ${step.label} fails`, unconnected: 'fail',
                       setting: { label: 'If it fails', unconnected: 'Fail the run', after: 'timeout_seconds',
                                  connected: (arm) => `Run the steps under “${arm}”` } } },
    types:  { 'http-request': { arms: { error: { label: 'If the request fails' } } } },
};
```

`unconnected` is what your runtime does with a port nothing is connected to,
`'fail'` or `'stop'`, and only you can say it. An ordinary step's other flow
outputs are its arms, in the order the type declares them. **Ports become
settings** in the panel. An arm is a choice between "Fail the run" (or "Stop
here") and "Run the steps under …", which connects or disconnects the port. An
arm inside a loop also chooses between carrying on with the next step and going
on with the next row. A parallel step carries its merge's *When the branches
finish*, written to the merge step's config.

**What "block-shaped" means.** From the start step, every step is placed exactly
once: as a step, a branch, a parallel closed by one merge, a loop whose body
ends at its Next, or an end. An arm ends by rejoining what follows its block,
by going on with the loop's next row, by ending, or by leaving its port
unconnected. Anything else is refused with a code and the step it names:
`outline_no_start`, `outline_two_starts`, `outline_unknown_type`,
`outline_unknown_port`, `outline_broken_line`, `outline_unreachable`,
`outline_shared_step`, `outline_jump_out`, `outline_two_continuations`,
`outline_parallel_unjoined`, `outline_merge_unpaired`, `outline_loop_shape`,
`outline_after_end`, `outline_cycle`. Where a branch's arms meet nowhere
(every arm but one ends), the arm that goes on holds the rest of its list. The
lines cannot say more than that, and the outline does not pretend they do.

**Edits.** "+" between rows (shown on hover and on focus) and the add rows open
the kit's step picker. It says where the step will land (*"inside For each new
application, after Check eligibility"*) and offers the blocks as blocks: *At
the same time* is one entry and two steps. A step's menu (its "…", a
right-click, or the ContextMenu key) moves it up, down or out, wraps it in a
block, duplicates, copies, cuts, pastes after, renames and removes it. An entry
or a verb that would leave a graph the outline cannot draw is shown greyed with
its reason: *"Move down — already last in For each new application"*. A step is
dragged by its grip, with pointer events and a ghost after 4 px, never
`draggable` and never `setPointerCapture`. Its drop line names the place
(*"Into Branch 2 · after Write a summary"*) or says why the place is refused.
Each edit is one history entry from a closed list: `flow:step:add`, `remove`,
`move`, `wrap`, `duplicate`, `paste`, `label` and `config`, `flow:arm`,
`flow:branch:add`, `flow:branch:remove` and `flow:settings`.

**Keys.** ↑ and ↓ move the selection, ← and → fold and unfold, and Enter opens
the settings at their first field. Alt+↑, Alt+↓ and Alt+← move a step, Ctrl+D
duplicates, Ctrl+C, Ctrl+X and Ctrl+V copy, cut and paste after the selection,
F2 renames, Delete removes, and Ctrl+Z and Ctrl+Y undo and redo. All of them are
bound on the editor's root. Backspace is never the editor's.

***Insert a value*.** A field's "{ }" calls your `values` provider with
`before`, the steps that always run before this one, nearest first
(`alwaysBefore`), and `loops`, the loops the step is inside, innermost first. A
step on the other arm of a condition is never in `before`, and neither is a
loop's body for a step after the loop.

**A run drawn on the outline.** `setRunOverlay({steps: {[id]: {state, line,
tone}}, ports: {[id]: {[port]: {taken, count}}}, banner})` puts a pill beside
each step. The pill shows `line` as you give it, toned by `state`
(`completed`, `failed`, `skipped`, `running`, `cancelled`, `not-reached`). Each
arm says *taken*, *not taken* or a count, an untaken arm and its steps are
dimmed, a loop's *Next row* shows its count (`ports[loop].next.count`), and
your banner is shown above the list. It draws only what you pass, and it
rebuilds no field in the panel. A redraw you did not ask for (findings, a run
refresh, a read-only switch) waits while a press is held in the editor, because
a browser fires a click only when the press and the release land on the same
element.

**The pure parts** are exported for a consumer that reads or checks an outline
without drawing one. `outlineFromGraph(graph, catalogue, blocks)` returns
`{ok: true, tree}` or `{ok: false, code, message, node_id}`, and
`graphFromOutline(tree)` is its inverse (`outlineGraphsEqual(a, b)` compares
two graphs as sets). `describeOutline(tree)` gives the tree as text.
`createOutlineOperations({catalogue, blocks, references})` gives every edit as
a function from a graph to `{ok, graph, select}` or `{ok: false, reason}`. Also
exported: `createOutlineBlocks`, `outlineRunOrder`, `outlineFlatOrder`,
`indexOutline`, `openOutlineStepMenu`, `OUTLINE_STRINGS`, `OUTLINE_ACTIONS` and
`OUTLINE_INDENT` (22 px a level, which the stylesheet also uses).

**What it does not do.** It does not fetch, save, validate or start a timer
that writes. Your validator's findings are drawn, never made. The folds are
yours to keep (`initialFolds`, `onFoldChange`).

**Where each claim was checked.** The round trip is tested over a corpus
(`tests/fixtures/flow_outline_corpus.json`). Every block-shaped graph is
recognised as the tree the corpus states and written back equal as sets (I1).
Opened and saved with no edit, it is the same text (I2). Random sequences of
operations keep it block-shaped (I3). Every refusal names a code and a step and
leaves the graph untouched (I4). `tests/flow_outline_editor.test.mjs` mounts
the editor in jsdom, and `tests/flow_outline_css.test.mjs` checks that every
class the editor sets has a rule and every rule names a class it sets. jsdom
computes no layout and starts no drag, so `demo/flow_outline_probe.mjs` drives
`demo/flow_outline.html` in headless Edge with real input. `elementFromPoint`
at the centre of Undo, an action, Fold all, the find box, the flow row, a row,
its menu, its "+" (with its row hovered), an add row, the panel's first field,
a port drawn as a setting and the strip's *Go to it* returned each one. A "+"
whose row was not hovered caught no press, and a level measured 22 px. The step
picker and the step menu opened inside the viewport on a real press, real keys
filtered and chose, and Escape gave the focus back. Real Alt+↑, Ctrl+Z, Ctrl+D
and Delete edited the flow, and Backspace reached the window unprevented. A real
grip drag drew its ghost and a drop line naming the place, moved the step as
one edit and started no native drag (a `dragstart` counter at 0). A refused
place said why and moved nothing, and Escape cancelled the drag.

**In a narrow editor** (under 1000px the list, the settings and the aside are
stacked and the body scrolls as one), a step picked with the mouse, with Enter,
with *Go to it* or with `select()` scrolls its settings on screen (`'nearest'`)
when they lie outside the body's visible box. ↑ and ↓ leave the list where it
is, and side by side nothing scrolls. `demo/flow_outline_narrow_probe.mjs`
pressed a step at a 900px viewport and found the panel's first field with
`elementFromPoint`. At 1440px the same press moved no scroll position.

### The lane editor

`createLaneEditor(host, options)` draws a data flow as lanes, left to right.
Every source starts a lane, and each step follows the one before it. A join
brings another lane in from below, and its line is laid out for you. Cards sit
where the layout puts them: **nothing is dragged and no line is drawn by
hand.** A step is added with the "+" on a card's right tip, which splices it in
between the card and what the card led to (`A → new → B`). *Add a source* starts
a new lane. A join's other lanes are settings (*Joined with*), not lines. Under
the lanes are a tab per step and a dock: the kit's settings panel on the left,
and on the right what the step gives — **Preview**, **Columns** and, for a sink,
**Would be rejected**. A toolbar toggle, **Steps show: The preview | The last
run**, picks what each card's status line says.

```js
import { createLaneEditor, createStepCatalogue, createWidgetRegistry, PARAMETER_REFERENCES } from '@flexdesk/flow';

const editor = createLaneEditor(host, {
    catalogue: createStepCatalogue(types, { categories }),   // roles: source | transform | operation | sink
    widgets: createWidgetRegistry(),
    references: { parameter: PARAMETER_REFERENCES },
    summarise: (step, type) => '…',            // a card's second line
    preview: async ({ pipeline, text, parameters, signal }) => ({ nodes: { [id]: {
        status, rows, total, columns: [{ name, type }], head: [[…]], caption, rejects, error } } }),
    describe: async ({ pipeline, text, parameters, signal }) => ({ nodes: { [id]: {
        columns: [{ name, type, origin, change }] } } }),
    lastRun: async ({ pipeline, signal }) => runOverlay,      // asked when Steps show turns to The last run
    actions: [{ id: 'publish', label: 'Publish', primary: true, run }],
    onChange: ({ pipeline, text, action, key }) => save(text),   // after every edit, undo and redo
});
editor.load({ graph: pipeline });
```

It edits the data flow's JSON — `{nodes: [{id, type, label?, config, position?}],
connections: [{id, sourceId, sourcePort, targetId, targetPort}], parameters:
{name: {type, default?, description?}}}` — with two rules added. A step's name
is a top-level `label`, never a key inside `config`. Connection ids are
deterministic: `c1`, `c2`, … the lowest free number. `serialisePipeline` is
byte-stable, so a flow opened and saved with no edit is the same text. Keys the
editor does not know are kept, and a node's `position` is kept and never used.
**A step's ports keep their declared order**: the first FLOW input is the lane
input, and every further input takes another lane. The first output is the
continuation.

**The layout** is `layoutLanes(pipeline, catalogue)` and `placeLanes(layout,
size)`. Both are pure, and the wires are computed from the grid, never measured
from the page. A step belongs to the lane that feeds its lane input, not to
whichever lane reaches it first. An output that feeds two steps' lane inputs
forks a new lane below. A feeder lane is moved right until its last card sits
one column before the join it feeds, and never so far that the join moves.
Under each lane come its feeders, then its forks. A wire that would run through a card that is not one of its ends (a feeder that goes on past its feed, a fork drawn under a feeder) goes round by the gutters, the gaps between columns and between lanes, which hold no card. A step two lines feed on one
input (`lanes_two_inputs`), a cycle (`lanes_cycle`) or two steps with one id
(`lanes_duplicate_step`) cannot be drawn honestly as lanes. Such a flow opens
read only with the sentence, is drawn as well as it can be, and is never
repaired. The sizes are `LANE_GEOMETRY`: `regular` is 200 × 62 (the editor),
`small` is 160 × 50 (two lines a card, for a narrower host) and `strip` is
92 × 26 (`compact`). The pure edits — splice, add a source, remove, duplicate,
set an input, the input candidates, parameters — are `lanePipeline`.
`lanePipeline.duplicateStep(pipeline, catalogue, id)` (0.17.0) puts a copy right
after the step: a fresh id, a label derived from its title (`Title (copy)`, then
`(copy 2)`, …, words in `LANE_PIPELINE_STRINGS`), a deep copy of its config and
the same lines in, none out. It answers `{ok: true, node}`, or `{ok: false,
reason}` and changes nothing when there is no such step or its type is
`unavailable`.

| Option | Meaning |
|---|---|
| `catalogue` | The kit's step catalogue (or a list of types and `categories`) |
| `widgets`, `references`, `services`, `strings` | As for the kit's panel. `references.parameter` decides how the parameters strip spells a reference |
| `values` | *Insert a value*: `({pipeline, stepId, field, key, upstream, parameters}) => groups`. `upstream` is every step whose output reaches this one, nearest first |
| `summarise(step, type)`, `summariseReads(step, type)` | A card's second line; the panel's id line |
| `preview`, `describe` | The providers (above). Absent, the dock has no Preview, or no Columns |
| `previewDelayMs` | The debounce, 800 by default |
| `lastRun` | Asked once, when *Steps show* first turns to *The last run* and no overlay is set |
| `flowSettings` | `{schema, value}`: the flow's own settings, under a first tab, *The flow* |
| `readOnly` | `false`, or `{reason}`, drawn above the editor |
| `actions` | Toolbar verbs after Undo and Redo: `[{id, label, icon?, primary?, run}]` |
| `slots` | `toolbarStart(el)`, `toolbarEnd(el)`, `flowPanel(el)`, `stepPanel(el, step)` |
| `size` | `'regular'` or `'small'` |
| `stepTabs`, `parameters` | `false` leaves out the step tabs or the parameters strip |
| `height` | `'fill'` (the default: the editor fills its host, which must have a height) or `'auto'` (the editor flows, and the dock is `dockHeight`, 360 by default) |
| `compact` | `true` (or `{size: 'small'}`): the lanes alone, read only, nothing to press. This is what a step that runs a data flow shows as *What it does, left to right* |
| `parameterTypes` | The parameter types a parameter may be: `text`, `number`, `integer`, `boolean`, `date` by default |
| `select` | The step chosen on load (the first step, left to right, by default) |
| `history` | `{limit, mergeMs}` |
| `menuItems(step)` | Your own items on a card's menu, after the built-in ones: `[{id, label, icon?, danger?, disabled?, reason?, run}]`. `run({step, pipeline, editor})` gets a DRAFT of the flow to change in place (it may answer later, with a promise); what it changed is one undoable edit, `flow:step:menu`. Answering `false` takes nothing, and neither does a draft that answers after another edit. `disabled` greys the item with its `reason`; a read-only flow greys every one with the read-only reason (0.17.0) |
| `onChange`, `onSelect({kind, id})`, `onStepsShow(mode)` | Callbacks |

| Method | Does |
|---|---|
| `load({graph, flowSettings}, {baseline = true})` | Replaces the content. A baseline clears both undo stacks, and a preview is asked for at once |
| `getGraph()`, `serialise()`, `getFlowSettings()` | A copy of the flow; its byte-stable text |
| `setFindings(list)` | On the card (its status line becomes the message), under the field, and in the strip with *Go to it* |
| `setRunOverlay({steps: {[id]: {state, line, tone}}, banner})` | The last run, shown when *Steps show* is *The last run*. `line` is drawn as given |
| `setStepsShow('preview' \| 'run')`, `stepsShow` | — |
| `setReadOnly(false \| {reason})`, `readOnly` | — |
| `setActionState(id, {disabled, reason, busy})`, `setStatus(text)` | A refused verb shows its reason beside it |
| `select(id \| 'flow' \| null)`, `selected`, `focus()` | — |
| `undo()`, `redo()`, `history` | Over whole snapshots. The actions are `LANE_ACTIONS` (`flow:step:add`, `:remove`, `:label`, `:config`, `:duplicate`, `:menu`, `flow:join:set`, `flow:source:add`, `flow:parameter:add`, `:change`, `:remove`, `flow:settings`) |
| `refreshPreview()` | Asks the providers now, without the debounce |
| `inputColumns(stepId, port?)` | The columns of the frame a step reads, from the last description, else the last preview. The `upstream-column(s)` widgets read the same |
| `layout`, `placed` | The current layout and its coordinates |
| `destroy()` | Removes every listener, popover and table, and aborts the preview in flight |

**Columns that arrive while you are in the settings** are drawn when the focus
leaves them, so a column typed by name before the columns were known becomes a
choice then, and nothing is rebuilt under the reader's caret.

**The preview** is one request for the whole flow to each provider. It is sent
800 ms after the last edit and once after a load. A rename does not send one,
because it changes no row. Every request carries a sequence number and an
`AbortSignal`. A newer edit aborts the request in flight, and an answer that is
not the newest is dropped even when it arrives. A failure is shown as the
provider's own sentence in the dock, and nothing else changes. The rows are a
FlexDesk `DataTable` in a box with a definite height. How many rows a preview
reads, as whom it reads them and that it writes nothing are all the provider's
business; the editor knows only what it is handed.

**Keys.** These are the kit's, on the editor's root. ← → ↑ ↓ move between cards
and between the step tabs. Enter opens a step's settings on their first field,
and Escape goes back to the card. Delete removes the step, Ctrl/⌘+D duplicates
it (the copy is chosen and focused) and F2 renames it.
Ctrl/⌘+Z and Ctrl/⌘+Y undo and redo, and are stopped at the editor even inside
a field. The context-menu key or a right press opens a card's menu: *Open its
settings*, *Add a step after it*, *Duplicate*, *Remove step*, then your
`menuItems`. An item that cannot be chosen — *Duplicate* on a read-only flow, or
on a step whose type is not available — is greyed with its reason in its own
line, and a refused Ctrl/⌘+D says the reason beside the status. Backspace is never the
editor's. The cards are one Tab stop, the chosen one, and its "+" comes next in
the Tab order. The "+" shows on hover, on focus and on the chosen card, never
on hover alone.

**What it does not do.** It does not fetch, save, validate, propagate a schema,
coerce a value or run anything. Steps are never dragged and lines are never
drawn by hand. The editor does not draw a page trail, a breadcrumb or a "you
are editing the shared flow" banner either: a host draws those around it.

**Where each claim was checked.** The layout, the JSON, the edits and the
preview runner are pure, and `tests/flow_lanes_layout.test.mjs`,
`flow_lanes_pipeline.test.mjs` and `flow_lanes_preview.test.mjs` test them under
plain node. The layout suite reproduces the mock and shows that the earlier
layout (EcoSim's `buildLanes`, copied verbatim) puts the join in the feeder's
lane when the feeder is listed first. The preview suite has a provider that
answers out of order, and the stale answer is shown to be dropped.
`flow_lanes_editor.test.mjs` mounts the editor in jsdom: choosing a card
rebuilds no node, every edit is one undo entry, and a flow that cannot be drawn
is never written. `flow_lanes_css.test.mjs` holds the classes and the rules to
each other and the sheet's card sizes to `LANE_GEOMETRY`. The rest was checked
in headless Edge with real input (`node demo/flow_lanes_probe.mjs`, which opens
`demo/flow_lanes.html` at all three sizes). In a laid-out page every wire
starts at its card's tip and ends in the next card's notch, and the join's line
and its port dot meet the join's bottom centre. `elementFromPoint` at the centre
of Undo, a card, a "+", *Add a source*, a step tab, *Steps show*, a parameter,
the panel's first field, its name, *Remove step*, a dock tab and a preview cell
returns each one, and the settings are covered by nothing. The preview's
`DataTable` draws its rows with a height, and every card's words stay inside
the card. A real press on "+" opens the picker inside the viewport with its
search focused, and real keys filter it and add the step. A real drag across a
card starts no native drag (a `dragstart` counter at 0) and moves nothing. Real
arrows, Delete, Ctrl+Z and Backspace do what is said above, and three real
keystrokes ask the preview once.

## Forms: `openForm`

`openForm({ title, fields, defaults, submitLabel })` (in `@flexdesk/widgets`)
opens a modal form and resolves with `{ [name]: value }`, or `null` when it is
cancelled. Fields are `text`, `number`, `password`, `select`, `textarea`,
`checkbox`, `toggle` and `picker`; `{ section: 'Label' }` entries are headings.
Each of the additions below is opt-in, and a form that uses none of them renders
and submits exactly as in 0.9.1.

### A form that adapts: `onFieldChange`

```js
openForm({
    fields: [
        { name: 'type', label: 'Type', type: 'select', options: ['bug', 'story'] },
        { section: 'Story', name: 'story' },          // a NAMED section can be hidden
        { name: 'points', label: 'Points', type: 'number', required: true },
    ],
    onFieldChange: (name, value, api) => {
        const story = api.get('type') === 'story';
        api.setVisible('story', story);
        api.setVisible('points', story);
    },
});
```

`onFieldChange(name, value, api)` is called once when the form opens (with
`name === null`, so the form starts consistent with its defaults) and after
every field's `change`. `api` addresses fields and named sections by name:

- `setVisible(name, on)` hides or shows the row. A hidden row keeps its value
  and is still submitted, but it is not asked about: its `required` and its
  `validator` stand down until it is shown again.
- `get(name)` reads the control as it stands: a checkbox as a boolean,
  anything else as its string.
- `set(name, value)` writes it. It does not call `onFieldChange` back, so a
  hook that fills one field from another cannot loop.

A hook that throws is logged and the form carries on.

### Hidden rows stay hidden

`.twm-modal__row` is a grid, and a grid rule beats the `display: none` that
the `hidden` attribute gets from the browser, so a hidden row stayed on
screen. `flexdesk.css` now has `.twm-modal__row[hidden],
.twm-modal__section[hidden] { display: none !important }`, and `setVisible`
also sets the row's inline `display`, so it holds under a stylesheet of your
own as well.

### A value you look up: `type: 'picker'`

```js
{ name: 'parent', label: 'Parent', type: 'picker', required: true,
  pick: async (current) => ({ value: 'EPIC-0001', label: 'EPIC-0001 — Auth rewrite' }),
  displayFor: (value) => titleOf(value) }
```

The row shows a read-only box and a search button. The button, or a click on
the box, awaits `pick(currentValue)`. Return `{ value, label }` (the label is
shown, the value is submitted), a bare value (shown through `displayFor`, or
as itself), or `null` to leave the field as it was. `displayFor(value)` gives
the text for the value the form opens with and for `api.set`. The value is
kept in a hidden input, which the browser's own `required` check skips, so
`required: true` on a picker is checked by the form instead. The markup is
`.twm-picker` > `.twm-picker__display` + `.twm-btn.twm-picker__btn`.

### A select you may type into: `create`

A `select` with a `create` spec is a type-ahead combobox: pick an option or
type a new value. `create: { onCreate, hint }` makes the typed value into an
entity before the form resolves, and shows "↳ will create *hint* …" while you
type. `create: true` is the plain case: the typed value is submitted as typed,
with no hint, because nothing is created. Until now `create: true` failed the
submit with "onCreate is not a function".

`tests/open_form.test.mjs` mounts the real `openForm` in jsdom and covers all
four, plus a plain form submitting as before.

### A switch: `ToggleField` and `type: 'toggle'` (0.17.0)

```js
import { ToggleField } from '@flexdesk/widgets';

const autosave = new ToggleField({
    label: 'Autosave', onText: 'On', offText: 'Off',   // all optional
    checked: true, compact: false, disabled: false,
    onChange: (on) => settings.set('autosave', on),
});
host.appendChild(autosave.render());
autosave.get();              // true
autosave.set(false);         // does not call onChange
autosave.setDisabled(true);
autosave.dispose();
```

A track and a knob drawn over a real checkbox with `role="switch"` and an
`aria-checked` that follows it. Space and Enter toggle the focused switch, a
click on the track, the state text or the label toggles it, the focused input
draws a ring on the track, and a disabled switch ignores clicks and keys alike.
`ariaLabel` names a switch with no visible label. The markup is
`label.twm-toggle` (`--compact`, `--disabled`) > `.twm-toggle__control` >
`input.twm-toggle__input` + `.twm-toggle__track` > `.twm-toggle__knob`, then
`.twm-toggle__state` and `.twm-toggle__label`; `flexdesk.css` styles it from
tokens alone, with no colour literal.

In a form, `{ name, label, type: 'toggle', onText?, offText?, disabled?,
compact? }` mounts one and submits a boolean, like a checkbox; `api.get` reads
it as a boolean and `api.set` moves it. `tests/toggle_field.test.mjs` covers
both.

## A step wizard: `Wizard` (0.17.0)

`new Wizard({ steps, data, onFinish, onCancel, labels })` (in `@flexdesk/widgets`)
draws a multi-step flow: a step indicator, a body slot and a footer with Cancel,
Back and Next (Finish on the last step). Mount it inline with `mount(el)`, or in a
modal `ManagedWindow` with `openInWindow({ id, title, ... })`.

```js
const wizard = new Wizard({
    data: { file: null },
    steps: [
        { id: 'source', label: 'Source', icon: 'upload_file',
          render(bodyEl, ctx) {            // once per visit; may return a cleanup function
              const input = picker(bodyEl);
              input.onchange = () => { ctx.data.file = input.files[0]; ctx.revalidate(); };
          },
          canAdvance: (ctx) => ctx.data.file
              ? { ok: true } : { ok: false, hint: 'Choose a file first' } },
        { id: 'review', label: 'Review', render: (bodyEl, ctx) => review(bodyEl, ctx.data) },
    ],
    onFinish: async (ctx) => api.import(ctx.data),   // a rejection marks the step as error
    onCancel: () => {},
});
wizard.openInWindow({ id: 'import', title: 'Import' });
```

- **Gating.** While the current step's `canAdvance(ctx)` answers `{ok: false, hint}`,
  Next is disabled and the hint is shown in the footer. `revalidate()` (also
  `ctx.revalidate()`) asks again and redraws the indicator and the footer; it never
  re-renders the body, so an input keeps its focus and its value.
- **Steps** are drawn done / current / upcoming / error, joined by a connector. A
  done step is a button that jumps back to it; an upcoming step is inert, so the
  only way forward is Next.
- **Moves.** `next()`, `back()` and `goTo(idOrIndex)` (back to any earlier step, or
  forward one step through the gate) resolve `true` when they moved.
  `setStepState(id, 'error' | null, message)` marks or clears a step.
- **Finish.** On the last step Next reads Finish and calls `onFinish(ctx)`. Until
  it settles every button is disabled and moves, cancels and closes are refused,
  not queued. Resolved, the wizard closes; rejected, the step is marked as error
  and the rejection's message is shown, and Finish can be pressed again.
- **Cancel** (the button, `cancel()`, or the window's close button and Escape)
  closes the wizard and calls `onCancel(ctx)` exactly once. `dispose()` tears it
  down without calling either callback.

Every transition goes through a core `StateMachine` (`step`, `finishing`,
`finished`, `cancelled`; pass `eventBus` to see its `fsm:*` events). `ctx` is
`{data, step, index, revalidate, next, back, goTo, setStepState}`, with `data`
the object you passed.

## Confirms show text, not markup (0.17.0)

`openConfirm({ title, message, confirmLabel, cancelLabel, danger, icon })`
resolves `true` or `false`. Its `message` and both labels are **text**: they
are set with `textContent`, so a `<` shows as a `<`. Until 0.17.0 they went into
`innerHTML`, and `showDeleteConfirmDialog` / `showCloseConfirmDialog` put
`itemName` and `itemType` into that message raw: a flow named
`<img src=x onerror=…>` rendered an image and ran its handler, and a name with
an unclosed `<` swallowed the rest of the message.

A caller that passed markup in `message` now sees the tags; write a `\n` for a
line break instead (the message body is `white-space: pre-line`).
`additionalMessage` on `showDeleteConfirmDialog` follows on its own paragraph
exactly as before. A body that needs real markup is `openModal`'s job: it takes
the caller's own DOM.

`tests/confirm_escaping.test.mjs` opens each of them in jsdom with hostile
names and labels.

## Markdown: `renderMarkdown` (0.17.0)

`renderMarkdown(source, options)` (`@flexdesk/widgets`) returns an HTML
string. It covers a CommonMark-ish subset — ATX headings, paragraphs,
emphasis, strong, `~~strike~~`, code spans, fenced code, block quotes, nested
ordered and unordered lists, GFM pipe tables, rules, links, images, autolinks,
hard breaks and `$…$` / `$$…$$` math — and is **safe by default**:

- raw HTML is escaped: `<img src=x onerror=alert(1)>` shows as that text.
  `allowHtml: ['kbd', 'br']` lets named tags through, the tag only and never
  its attributes; a tag that runs or embeds anything (`script`, `iframe`,
  `svg`, `img`, …) throws. An allowed tag left open is closed at the end of its
  paragraph.
- a link goes out only to `http(s):`, `mailto:` or a `#anchor`, always with
  `rel="noopener noreferrer"`; a `javascript:` link (or any other) renders its
  text and no anchor. An image loads from `http(s):` or a relative path, or
  shows its alt text.

```js
import { renderMarkdown } from '@flexdesk/widgets';

el.innerHTML = renderMarkdown(source, {
    highlight: (code, lang) => myHighlighter(code, lang),   // null: escaped
    math: undefined,      // default: window.katex when present, else the escaped source
                          // false: `$` is text; or (tex, { display }) => html | null
    inlineRules: [{ pattern: /\[\[ref:([\w-]+)\]\]/, render: (m, ctx) => `<a href="#${ctx.escape(m[1])}">…</a>` }],
    blockRules:  [{ start: /^:::(\w+)/, end: /^:::$/, render: ({ lines, match, closed }, ctx) => '…' }],
    inline: false,        // true: inline markup only, no blocks, no <p>
});
```

What the caller returns — the highlighter's, the math hook's and the rules'
HTML — is trusted and goes in as it is; a rule answering `null` declines.
`ctx` gives a rule `escape(text)` and `inline(text)`. Not in the subset:
setext headings, indented code blocks, reference links, raw HTML blocks.

**Streaming.** Every element it opens it closes, so each prefix of a document
arriving token by token renders to balanced HTML: an open fence is closed at
the end of the input, and an emphasis or link whose closer has not arrived is
still text. `tests/markdown.test.mjs` renders every prefix of a document using
every construct and checks the tags balance; `tests/help_modal_markdown.test.mjs`
checks jsdom has nothing to repair.

**Help topics in markdown.** A `HelpProvider`'s `loadTopic` may now answer
`{ title, markdown }`; the modal renders it with `renderMarkdown` and the
provider's optional `markdownOptions`. `{ title, html }` is unchanged:
pre-rendered, **trusted** HTML, inserted as it is.

## A document outline: `createDocumentOutline` (0.17.0)

A long document's sections, listed and numbered, the one in view marked while
the document scrolls, and a click that goes to one (in `@flexdesk/widgets`):

```js
const outline = createDocumentOutline(sidebarEl, {
    entries: [{ id: 'intro', level: 1, label: 'Introduction' },
              { id: 'scope', level: 2, label: 'Scope' }],
    numbering: true,                 // 1, 1.1, 1.2, 2 …
    maxDepth: 3,                     // deeper entries are drawn at depth 3
    scrollContainer: articleEl,      // the element that scrolls; the spy's root
    resolveTarget: (entry, container) => container.querySelector(`[data-section="${entry.id}"]`),
    rootMargin: '0px 0px -70% 0px',  // the default: the top 30% is "in view"
    onSelect: (id, entry) => { /* … */ },
    emptyState: 'No headings',
});
outline.setEntries(next);            // the document has other sections now
outline.refresh();                   // the same sections, re-rendered: resolve again
outline.setActive('scope');  outline.getActive();
const off = outline.onActiveChange((id, entry) => { /* … */ });
outline.dispose();
```

Where the entries come from is yours: the outline is told `{id, level, label}`
and, through `resolveTarget` (by default the element in the container whose
`id` is the entry's), which element each one stands for. Labels are text.
Numbers are hierarchical, and a skipped level is one step deeper, not two:
levels 1, 3, 3, 2 are 1, 1.1, 1.2, 1.3.

Of the targets an IntersectionObserver rooted at `scrollContainer` reports in
view, the one listed first is active; with none in view the last one stays. An
entry whose target does not resolve is listed, but never watched and never
active, and `setActive` refuses it (`false`). A click marks its entry at once,
scrolls its target into view (`scrollOnSelect: false` leaves that to
`onSelect`) and suppresses the spy while the scroll passes the sections in
between, until the container's `scrollend` or, without one, `scrollEndTimeout`
(1000 ms). `dispose()` disconnects the observer and clears that timer. The
indent per level is `--twm-doc-outline-indent` (12px).

`tests/document_outline.test.mjs` drives it in jsdom with a hand-fired
observer.

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

## A list of tags: `createTagInput` (0.17.0)

`createTagInput(host, { value, placeholder, readOnly, allowDuplicates, onChange })`
(in `@flexdesk/widgets`) draws a list of short strings as removable chips
followed by a text box, and appends it to `host`.

```js
const tags = createTagInput(host, {
    value: ['baseline'],
    placeholder: 'Add a tag…',
    onChange: (list) => save(list),   // a fresh copy after each change the reader makes
});
tags.getValue();            // ['baseline']
tags.setValue(['a', 'b']);  // redraws; does not call onChange
tags.dispose();
```

- **Enter**, a **comma** and **blur** commit what was typed: it is split at
  commas and each piece trimmed, so `a, b` then Enter adds two chips and
  `onChange` receives `['a', 'b']`.
- Empty pieces are ignored, and so is a piece already in the list unless
  `allowDuplicates` is set. A commit that adds nothing calls no `onChange`.
- **Backspace** in an empty box removes the last chip.
- A **paste** that carries a comma is split into chips at once; a paste
  without one is ordinary text in the box.
- Each chip's remove button has an `aria-label`, "Remove <tag>" by default;
  `removeLabel(tag)` words it (for another language). `label` names the text
  box and the group.
- `readOnly` draws the chips alone: no remove buttons and no text box.

The handle is `{ element, input, getValue, setValue, focus, dispose }`
(`input` is `null` when read-only). The styles are the `twm-tag-input` block in
`flexdesk.css`. `tests/tag_input.test.mjs` covers each of the above in jsdom.

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
`NotificationHistory` puts it behind a bell in the bottom bar.

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

### Alerts with history: a log, a pane, a tab host and a bell (0.14.0)

A toast is the moment. The **alert log** keeps what came in until it is
dismissed, and four pieces draw it. Each works without the others:

| Piece | Entry point | Does |
|---|---|---|
| `createAlertLog({ source, limit })` | `widgets` | Entries `{id, at, level, title, body?, ref?, read}`, newest first; `add`, `receive`, `markRead`, `dismiss`, `unreadCount`, `worstUnread`, `subscribe`, `loadMore` |
| `localSource({ read, write })` | `widgets` | Keeps the whole log in one stored value (localStorage, a workspace file) |
| `mountAlertsPane(el, { log, onOpen, onBadge, rules?, stillMatches? })` | `widgets` | Level chips with counts, a filter, day groups, relative times, Open / Dismiss / Mark all read / Clear, *Load older* |
| `createBottomPanelTabs(el, { panes, remember, store, eventBus })` | `wm` | The `.twm-bp` tab strip: `select`, `setBadge(id, n, level)`, `bottompanel:show {tab}` |
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

## The host port

FlexDesk never touches `pywebview`, `fetch`, `localStorage` or the filesystem. It
asks a **Host**, and you supply one. `createHost({...})` validates the capabilities
you pass and freezes the result; anything you leave out is simply absent, and the
library degrades rather than throwing.

```js
createHost({
    state:   { read, write },              // layout persistence
    dialogs: { saveFile, openFile? },      // optional — CSV export falls back to a Blob;
                                           // openFile (itself optional) to pickFile()
    window:  { minimize, maximize, ... },  // optional — no native chrome buttons without it
    gallery: { list },                     // optional (0.17.0) — mountGalleryPicker's entries
})
```

`NULL_HOST` is a valid host with nothing behind it.

Two adapters ship ready-made. `createPywebviewHost()` speaks to a pywebview
window, and `createPhotinoHost()` (0.14.0) to a Photino.NET window over
`window.external.sendMessage` / `receiveMessage`:

```js
import { createPhotinoHost } from '@flexdesk/host';

// In a browser tab this is NULL_HOST. Keep a capability of your own by passing
// it in, or leave one out with null.
const host = createPhotinoHost({ state: myServerState, onEvent: (name, value) => {} });
```

`dialogs.saveFile` falls back to a Blob download when the window refuses, and
the messages the C# side has to answer are in
[`src/host/photino_host.md`](src/host/photino_host.md).

**The dialogs a pywebview bridge answers.** `createPywebviewHost()` calls these
methods on `window.pywebview.api`, positionally. Each is optional: a missing
one makes its capability answer `null`, and FlexDesk degrades.

| Bridge method | Arguments | Reply | Behind |
|---|---|---|---|
| `save_file_dialog` | `(data, filename, kind)`: the file's text (`csv`) or base64 bytes (`png`), the suggested name, the type | `{ok: true, path}` \| `{ok: false, cancelled: true}` \| `{ok: false, error}` | `dialogs.saveFile` |
| `read_file_dialog` (0.17.0) | `(accept, kind, encoding)`: a list of extensions or MIME types to filter by (`['.json']`, may be empty), a label for the filter or `null`, and `'text'` or `'base64'` | `{ok: true, name, path, text}` (`'text'`, read as UTF-8) or `{ok: true, name, path, data}` (`'base64'`, the bytes) \| `{ok: false, cancelled: true}` \| `{ok: false, error}` | `dialogs.openFile` |

### Opening a file: `pickFile` (0.17.0)

```js
import { pickFile } from '@flexdesk/host';

const r = await pickFile(host, { accept: ['.json'], kind: 'json' });   // encoding: 'text' (default) or 'base64'
if (r.ok) load(JSON.parse(r.text));
else if (r.error) toast(r.error);                                     // r.cancelled: say nothing
```

`pickFile(host, {accept, kind, encoding})` takes `accept` as a list or as a
comma-separated string (`'.json,.csv'`); the host always receives the list
(`['.json', '.csv']`). It asks the host's
`dialogs.openFile` first, a new optional member of `dialogs`: a host whose
`dialogs` has only `saveFile` is still complete. Without it, or when it
answers `null` (no dialog behind it), a transient hidden
`<input type="file">` opens the browser's chooser, so the same call works in a
browser tab, under `NULL_HOST`. Either way it resolves one of

```
{ok: true, name, path?, text}      encoding 'text'
{ok: true, name, path?, data}      encoding 'base64': the file's bytes
{ok: false, cancelled: true}       the user closed the chooser
{ok: false, error}                 show it
```

`path` comes only from a native host. The pywebview adapter maps `openFile` to
`read_file_dialog(accept, kind, encoding)` (the table above); the Photino
adapter sends `dialogs.openFile`, documented in
[`photino_host.md`](src/host/photino_host.md). The browser chooser reports a
cancel through the input's `cancel` event, which every current engine fires.

### A window with its own chrome (0.15.0)

The same app runs three ways, and the page needs no switch for it:

| | title bar and borders | FlexDesk draws |
|---|---|---|
| a browser tab | the browser's | nothing |
| a Photino window, native frame | the OS's | nothing |
| a Photino window, custom frame | none: your top bar is the title bar | minimise / maximise / close, resize handles, drag |

```js
import { WindowChromeController } from '@flexdesk/widgets';

new WindowChromeController({
    host,                                  // createPhotinoHost(), or any Host
    topBar: '.my-top-bar',                 // drags the window (default .twm-global-top-bar)
    controls: '.my-top-bar .right',        // where the three buttons go (default: the bar's .twm-bar-right)
    noDrag: '.my-search',                  // more that never starts a drag
}).initialize();                           // resolves true only with custom chrome
```

`host.window.chrome()` decides. The Photino host asks its native side once
(`host.describe`, its `frame` field) and answers `'custom'` only when the
window was made frameless, so a browser tab and a native-frame window get no
handles, no buttons and no CSS. With custom chrome, a drag on the top bar and
a press on a resize handle go to the host's `startNativeDrag()` /
`startNativeResize(edge)`. On Windows the native side hands them to the OS,
so the window snaps, takes Win+arrows and resizes like any other.
[`photino_host.md`](src/host/photino_host.md) has the native half: keep the
frame styles, return the whole window from `WM_NCCALCSIZE`, start gestures with
`WM_NCLBUTTONDOWN`. Don't use Photino's `SetChromeless`, which loses all of that.

### Links out, and the browser's right-click menu (0.16.0)

In a native window a `target="_blank"` link or a `window.open()` opens nothing,
or a bare popup with no way back. Hand them to the system browser instead:

```js
import { routeExternalLinks } from '@flexdesk/host';
import { suppressNativeContextMenu } from '@flexdesk/widgets';

routeExternalLinks({ host });    // a no-op without host.shell, so call it anywhere
suppressNativeContextMenu();     // only your own menus, plus the native one in text
```

`routeExternalLinks` sends http(s) and mailto links that leave the app (a
`_blank` target, another origin, a middle click) and external `window.open`
calls to `host.shell.openExternal(url)`. That is a new optional host
capability, which `createPhotinoHost()` offers as `shell.openExternal`. If the
native side refuses, the original `window.open` runs. In a browser tab the
host has no `shell`, and nothing changes.

`suppressNativeContextMenu` prevents the browser's or webview's own menu (Back,
Reload, Print, Inspect) on any right-click that no handler claimed with
`preventDefault()`. It keeps the native menu in editable text and on selected
text, where Paste and Copy are the point, and wherever `allow(event)` says so.
Both calls return `{ dispose }`.

## The state guard: who wrote that attribute (0.17.0)

`StateGuardService` blocks (`strict`) or reports (`warn`) `data-*` writes that
are on no allow-list. A module override lets one module write a key nobody
else may:

```js
import { StateGuardService, DEFAULT_STATE_GUARD_CONFIG } from '@flexdesk/core';

const guard = new StateGuardService({ eventBus, config: { ...DEFAULT_STATE_GUARD_CONFIG, mode: 'strict' } });
guard.allow('src/app/my_widget.js', ['data-foo']);   // a literal substring of the module, or a RegExp
```

A write is attributed to the frame that made it: the URL or path of the file
that called `setAttribute`, `removeAttribute` or `dataset`, without line and
column, whatever your directory layout. A FlexDesk widget's write is the
widget's, not that of the app module that called the widget. To attribute
writes further up the stack instead, pass `moduleFramePattern`: the first
frame from the writer up whose location matches names the module, by the
pattern's first capture group if it has one.

```js
config: { ...DEFAULT_STATE_GUARD_CONFIG, moduleFramePattern: /(src\/app\/[^/]+\.js)/ }
// a write made inside @flexdesk/widgets on behalf of src/app/my_widget.js
// is now attributed to 'src/app/my_widget.js'
```

The defaults are `mode: 'warn'`, no module overrides and no frame pattern.
Before 0.17.0 the module was only found under a `js_new/` path, the defaults
carried one application's override, and the mode read one application's debug
global; choose strict mode in your own code.

## Peer dependencies

`@flexdesk/charts` needs Plotly (4.4 MB). `@flexdesk/editor` needs Monaco (14 MB).
Neither is bundled, and **neither is guessed at**:

```js
import { setPlotlySource } from '@flexdesk/charts';
import { setMonacoBasePath, setDefaultLanguage } from '@flexdesk/editor';

setPlotlySource('/vendor/plotly/plotly.min.js');
setMonacoBasePath('/vendor/monaco');
setDefaultLanguage('my-dsl');              // default: 'plaintext'
```

There is deliberately **no default path**. A hardcoded `'vendor/monaco'` is one
application's directory layout, and for everyone else it is a 404 that surfaces as
an editor which silently never appears. `initMonaco()` throws instead.

`getEditorFactory()` and `initMonaco()` **reject** when no path was set, when
`vs/loader.js` fails to load, or when Monaco's AMD loader reports an error, so a
consumer can show a message instead of waiting forever. What happens next
depends on which of those it was:

- **`vs/loader.js` failed to load** (a 404, a wrong path): not sticky. Fix the
  path (`setMonacoBasePath`, or pass it to `initMonaco`) and the next call
  tries again.
- **Monaco's AMD loader reported an error** (`vs/editor/editor.main` or a
  dependency failed): **final for the page**. Monaco's loader caches the failed
  module and has no way to forget it, so every later call rejects with that
  same first error, whatever path it is given. Fix the path and reload.

Loading is shared: if you call `initMonaco(path)` yourself, `getEditorFactory()`
uses that load and needs no `setMonacoBasePath()`. `monacoReady` only ever
resolves — it is the "Monaco has arrived" signal, not the place to learn that
an attempt failed.

If you already load Plotly yourself (a `<script>` tag that sets `window.Plotly`),
the chart loader short-circuits and you can skip `setPlotlySource`.

## Storage keys and names are yours (0.17.0)

Every localStorage key FlexDesk writes is an option, and so is each name in the
table below that it registers where other code can see it, except the last row:
the tile tab MIME is fixed. The defaults are FlexDesk's own; pass yours at boot,
before the first read:

| What | Default | Set it with |
|---|---|---|
| Settings (the `getSetting`/`setSetting` binding) | `'flexdesk.settings.v1'` | `configureSettings({ storageKey })` from `@flexdesk/core` |
| ManagedWindow geometry | `'flexdesk.managedWindows.v1'` | `ManagedWindow.configure({ storageKey })` from `@flexdesk/widgets` |
| Saved tile layouts | `'twm.tiles.layouts'` | `configureLayoutPersistence({ layoutsKey })` from `@flexdesk/tiles` |
| Saved tile configurations | `'twm.tiles.configs'` | `configureLayoutPersistence({ configsKey })` from `@flexdesk/tiles` |
| Built-in Monaco themes | `'flexdesk-dark'`, `'flexdesk-light'` | `setEditorThemeNames({ dark, light })` from `@flexdesk/editor` |
| MIME type of a dragged editor tab | `'application/x-flexdesk-tab'` | `setTabDragMime(mime)` from `@flexdesk/editor` |
| Chart PNG export file name | `'chart'` (saved as `chart.png`) | `setChartExportFilename(name)` from `@flexdesk/charts` |
| `LoggingService` service name on each entry | `'flexdesk'` | `new LoggingService({ name })` from `@flexdesk/core` |
| MIME type of a dragged tile tab | `'application/x-twm-tile-tab'` | fixed: not an option; read it as `TILE_TAB_MIME` (or `TileRenderer.TAB_MIME`) from `@flexdesk/wm` |

```js
import { configureSettings } from '@flexdesk/core';
import { ManagedWindow } from '@flexdesk/widgets';
import { setEditorThemeNames, setTabDragMime } from '@flexdesk/editor';
import { setChartExportFilename } from '@flexdesk/charts';

configureSettings({ storageKey: 'myapp.settings.v1' });
ManagedWindow.configure({ storageKey: 'myapp.windows.v1' });
setEditorThemeNames({ dark: 'myapp-dark', light: 'myapp-light' });
setTabDragMime('application/x-myapp-tab');
setChartExportFilename('myapp_chart');
```

Each default is exported beside its setter (`DEFAULT_SETTINGS_STORAGE_KEY`,
`DEFAULT_WINDOW_STORAGE_KEY`, `DEFAULT_EDITOR_THEME_NAMES`,
`DEFAULT_TAB_DRAG_MIME`, `DEFAULT_CHART_EXPORT_FILENAME`), and each setter has a
getter (`getSettingsStorageKey()`, `ManagedWindow.storageKey`,
`getEditorThemeNames()`, `getTabDragMime()`, `getChartExportFilename()`). An
embedder that passes nothing gets the defaults silently: nothing is logged.

- **Settings** are read lazily: importing `@flexdesk/core` touches no storage,
  and the binding reads its key on the first `getSetting`/`setSetting`/reset.
  `registerSettings()` and `registerSettingsEventBus()` may come before or after
  `configureSettings()`. Configured after the binding was in use, it moves: values
  return to their defaults, are reloaded from the new key, and one
  `settings:changed` (`path: null`) is emitted. The old key is not touched. A
  private store from `createSettingsStore()` moves the same way with
  `store.setStorageKey(key)` (and answers `store.getStorageKey()`).
- **ManagedWindow** reads geometry when a window is first shown; configure it
  before the first `show()`.
- **Editor themes**: a factory starts on the dark name current when it is
  created, and `init()` defines the built-in themes under the names current
  then. An app with a theme of its own defines it with `monaco.editor.defineTheme`
  and passes its name to `factory.setTheme(name)`.
- **The tab MIME** is read at drag time by every `NotebookTabBar` and
  `EditorPane`, so the two always agree.

**Upgrading from 0.16.** The old defaults were one application's names:
`'ecosim.settings.v1'`, `'ecosim.managedWindows.v1'`, `'ecosim-dark'` /
`'ecosim-light'`, `'application/x-ecosim-tab'`, `'ecosim_chart'` and the log
service name `'ecosim'`. If your users have settings or window geometry saved
under the old keys, pass those keys explicitly and nothing is lost:

```js
configureSettings({ storageKey: 'ecosim.settings.v1' });
ManagedWindow.configure({ storageKey: 'ecosim.managedWindows.v1' });
```

Code that called `factory.setTheme('ecosim-light')` now calls
`factory.setTheme(getEditorThemeNames().light)` (or names the themes back with
`setEditorThemeNames`), and code that read `'application/x-ecosim-tab'` off a drag
reads `getTabDragMime()`.

## Derived series: `seriesTransforms` (0.17.0)

A plot can draw series worked out from its own: a trend, a moving average, a
decomposition. `@flexdesk/charts` ships none; you pass them to
`PlotPopoutWindow` (or `openPlotPopoutWindow`) as `seriesTransforms`:

```js
import { openPlotPopoutWindow, renderSeriesTransformControls } from '@flexdesk/charts';

const seriesTransforms = {
    hp: {
        label: 'HP filter',
        params: { lambda: { label: 'Lambda', default: 1600, min: 1, step: 100 } },
        outputs: {
            trend: { label: 'Trend', suffix: ' (HP Trend)', lineStyle: 'dashed' },
            cycle: { label: 'Cycle', suffix: ' (HP Cycle)', lineStyle: 'dotted', lineWidth: 1 },
        },
        run: (y, { lambda }) => myBackend.hpFilter(y, lambda),   // -> { trend: [...], cycle: [...] }
    },
};

openPlotPopoutWindow({ id, title, plotConfig, getResults, services, seriesTransforms,
    configRenderer: (el) => renderSeriesTransformControls(el, plotConfig.subplots[0],
                                                           seriesTransforms, { onChange: redraw }) });
```

What a subplot switches on is in the subplot:
`subplot.transforms = { hp: { outputs: { trend: true }, params: { lambda: 100 } } }`.
For every transform with an output switched on, `run(y, params)` is called
once per line or scatter trace of the subplot (params: the declared defaults
under the subplot's own), and each switched-on output it returns is drawn as
an extra trace in the source trace's colour, on its axis, named
`<source name><suffix>`, with the output's `lineStyle` and `lineWidth`
(default 2). A transform that throws or rejects is skipped for that trace,
reported to `services.logger.warn`, and the figure is drawn without it.
`deriveSeriesTraces(traces, subplot, seriesTransforms, { onError })` is that
step on its own, for a renderer of your own.

`renderSeriesTransformControls(container, subplot, seriesTransforms, { onChange })`
renders, per transform, a toggle for each output and a number field for each
parameter (disabled while no output is on); it edits `subplot.transforms` in
place and returns `{ dispose }`. With no transforms it renders nothing.

Until 0.17.0 the plot window called one application's backend for a
Hodrick-Prescott filter, and every default subplot carried `showHpTrend`,
`showHpCycle` and `hpLambda`. Those keys are gone and are ignored in saved
configs; without `seriesTransforms` no derived trace is drawn.
`tests/series_transforms.test.mjs` pins all of it.

## No application globals: the gallery picker and plot-window events (0.17.0)

Nothing under `src/` outside `src/host` reads `window.pywebview` or an
application's global; `tests/no_app_globals.test.mjs` pins it, with the toast
helpers ([Notifications](#notifications-notificationcenter)) and these two:

**`mountGalleryPicker(el, { entries | host, kind, ... })`** takes its entries from
`entries`, or else from the host's optional `gallery` capability:
`host.gallery.list(kind)` answers `[{id, kind, label, description?, fields?}]`
(or a promise of them). Neither shipped adapter advertises it; add your own:

```js
const host = createHost({ ...createPywebviewHost({ bridgeRef }),
                          gallery: { list: (kind) => myBackend.starters(kind) } });
await mountGalleryPicker(el, { host, kind: 'report', onChange });
```

With neither `entries` nor the capability, the picker shows its `emptyLabel`
and logs one warning; a `list` that throws does the same. Until 0.17.0 it
called one application's bridge method.

**`PlotPopoutWindow({ streamEvents })`** names the bus events a live data
source emits, next to `refreshEvent`: `{ delta, complete }`, defaulting to
`'streaming:delta'` and `'streaming:complete'`. The window redraws on each
while live update is on; a name given as `null` is not listened for.

```js
openPlotPopoutWindow({ id, title, plotConfig, getResults, services,
                       refreshEvent: 'run:finished',
                       streamEvents: { delta: 'sim:delta', complete: 'sim:done' } });
```

## Layouts are keyed by whatever you key them by

`@flexdesk/tiles` stores layouts under keys **you** choose and resolves a starting
layout through a callback **you** supply:

```js
import { configureLayoutPersistence } from '@flexdesk/tiles';

configureLayoutPersistence({
    layoutsKey: 'myapp.layouts',                          // default: 'twm.tiles.layouts'
    resolveTemplate: (ctx) => pickTemplate(ctx) ?? null,  // null => empty grid
});
```

**Configure it before anything reads it.** The store is a singleton; built before
you supply your key, it is built with the default, and every layout your users have
saved becomes silently invisible. That is a data-loss bug that raises no error, so
the configuration step is explicit rather than lazy.

A layout is keyed by *something* — a document, a user, a run — and the library has
no opinion about which. It calls that a `contextId`.

### Chart and KPI tiles (0.13.0)

`@flexdesk/tiles` ships two widgets: `flexdesk.chart` (line, bar, area, scatter,
pie, donut, funnel, histogram — Plotly, so `setPlotlySource` first) and
`flexdesk.kpi` (one number, a label and an optional delta; plain DOM, no Plotly).
Nothing registers at import — call `registerChartTiles()` (idempotent). You hand
a tile **already-computed** series; turning records into series is yours:

```js
import { registerChartTiles } from '@flexdesk/tiles';
registerChartTiles();
const chart = grid.addTile('flexdesk.chart', { x: 0, y: 0, w: 6, h: 4 },
                           { chart_type: 'line', title: 'Burndown', unit: 'pts' });
chart.onPointClick = ({ customdata }) => openItem(customdata);
chart.setData({
    series: [
        { x: days, y: remaining, name: 'Remaining', interpolation: 'step', customdata: ids },
        { x: days, y: ideal, name: 'Ideal', lineStyle: 'dashed' },
    ],
    markers: [{ x: today, label: 'Today' }],   // vertical lines
    note: 'From 41 stories',                    // a line under the figure
});
grid.addTile('flexdesk.kpi', { x: 6, y: 0, w: 3, h: 2 }, { title: 'Open', unit: 'bugs' })
    .setData({ value: 42, reference: 37 });     // ▲ +5 bugs
```

`setData(null)` or an empty series is the empty state, and it releases any figure
still drawing. A pie takes `{labels, values}`, a histogram `{values}`. The config
(`chart_type`, `title`, `unit`, …) round-trips through `getLayout()`/`setLayout()`.
`buildOverlayShapes` gained `verticalLines: [{x, label?, color?, lineStyle?}]` for
the same marker outside a tile.

A chart tile's **Download PNG** (0.14.1) goes through the grid's `host`
(`new TileGrid({ host })`): with `dialogs`, the native Save dialog — a save
toasts where the file went, a cancel says nothing — and with no host, or a
`saveFile` that answers null, the browser download it always was.

### List and people tiles, and one scope for the board (0.16.1)

Two more widgets, registered by `registerListTiles()` (idempotent, nothing at
import). Like the chart tile they take **rows you have already worked out**;
what they own is what every list on a board needs: the count ("7 of 12"), the
line that says what empty means, a button in the bar, a click, the keyboard and
a right-click menu per row.

```js
import { registerListTiles, createScopePicker } from '@flexdesk/tiles';
registerListTiles();
const late = grid.addTile('flexdesk.list', { x: 0, y: 0, w: 12, h: 4 },
                          { title: 'Overdue', empty_text: 'Nothing is late.', max_rows: 0 });
late.onRowActivate = ({ row, event }) => open(row.key, { modified: event.ctrlKey });
late.rowMenu = ({ row }) => [{ label: 'Open', icon: 'open_in_new', action: 'open' }];
late.onRowMenuAction = ({ action, row }) => { /* … */ };
late.onAction = () => openAsList();
late.setData({
    rows: [{ key: '7', icon: 'task', lead: 'TASK-0007', title: 'Sign-off',
             cells: [{ text: 'priya' }, { text: '9 days late', tone: 'danger' }] }],
    action: { label: 'Open as a list', icon: 'list' },
});
grid.addTile('flexdesk.people', { x: 0, y: 4, w: 6, h: 4 }, { title: 'Who has what' })
    .setData({ people: [{ key: '', name: 'Nobody', muted: true, count: 2,
                          pills: [{ text: '2 undated', tone: 'muted' }] }] });
```

- A row is `role="button"`: click, Enter and Space call `onRowActivate` with the
  event; Up/Down/Home/End move. Right-click, the context-menu key and Shift+F10
  open the row's menu (`showContextMenu`'s items; none means no menu). A row
  carries `data-row-key`; `rowsDraggable` makes rows draggable.
- `{rows: []}` keeps the bar and says `empty` (or `config.empty_text`) where the
  rows would be; `setData(null)` is the empty state. Text is always text.
- `tone` (`danger`, `warning`, `ok`, `muted`) picks a colour only; `className`
  on a row or a cell is yours, added as it is.
- `groupByPerson(items, personOf)` groups for a people tile, most first.

**One scope for the whole board.** `createScopePicker({options, value, onChange})`
is a row of buttons, one pressed. `grid.setScope(value)` (or
`new TileGrid({ scope, onScopeChange })`) hands the value to every tile as
`tile.scope` and `tile.onScopeChange(scope)`, a tile added later starts with
it, a grid with a data source reloads its tiles, and the grid's `onScopeChange`
is told. What a scope means is yours; it is not part of the layout.

## Styling

Three stylesheets, and that is the whole CSS contract:

| | Specifier | Resolves to | |
|---|---|---|---|
| `dist/tokens.css` | `flexdesk/css/tokens` | `css/tokens.css` | Every rule reads `var(--…)` from here. Swap this one file and the shell restyles. |
| `dist/reset.css` | `flexdesk/css/reset` | `dist/reset.css` | The reset. |
| `dist/flexdesk.css` | `flexdesk/css` | `dist/flexdesk.css` | The library. Every class is `twm-` prefixed (the original working name; the prefix is stable and not worth a breaking rename). |

A bundler, an import-map generator or `require.resolve` reaches each one by its
specifier, through the package's `exports` map, which closes every other path
into the package. The map sends `flexdesk/css/tokens` to the source
`css/tokens.css`, not `dist/tokens.css`. The two are identical in a release,
since `dist/` is rebuilt in the release commit, but can differ on a working
checkout. `flexdesk/css/reset` is missing from 0.16.1 and earlier,
where it fails with `ERR_PACKAGE_PATH_NOT_EXPORTED`.

`createDetailHeader` follows the prefix too: a badge is a `.twm-detail-header__badge`
pill (a badge's `className` is added beside it, to recolour it), and an action is a
`.twm-btn` — `variant: 'primary'` adds `.twm-btn--primary`, `'danger'` adds
`.twm-btn--danger` — that also carries `.twm-detail-header__btn` and
`.twm-detail-header__btn--<variant>`. The unprefixed `detail-header__badge` and
`detail-header__btn--<variant>` it emitted before, which no FlexDesk rule styled, are
gone.

`@flexdesk/editor`'s components keep the class names they were extracted with, and
`flexdesk.css` styles them: `SplitPaneContainer` (`.split-pane-container`,
`.split-pane`, a 4px `.split-pane-divider` with a 10px hit target),
`EditorPane` (`.editor-pane`, `.editor-pane__body`, `.notebook-editor-container`)
and `NotebookSearchBar` (`.nb-search-bar*`). `setPanes()` adds `.split-pane` to the
elements you hand it and leaves their own classes alone (it used to replace them,
which stripped `.editor-pane` off an `EditorPane`).

One exception to the prefix: `HelpModal` (`@flexdesk/widgets`) keeps its older
`help-` classes (`help-modal-overlay`, `help-modal`, `help-index`, …), and
`flexdesk.css` styles them — a centred dialog on a dimmed overlay, drawn over
managed windows. `.help-article` holds your provider's rendered HTML and styles
its plain elements (headings, code, tables, lists).

Icons are rendered by applying the `material-symbols-outlined` class. FlexDesk does
not ship the font — supply it from Google Fonts or self-host. Without it, icons fall
back to their text names and nothing breaks.

## Build

```bash
npm install
npm run build      # -> dist/
```

`dist/` is committed. The packaging decision is *prebuilt dist*: this repo owns the
build so that a consumer with no bundler can load the library through a plain import
map. See `.gitignore` — it says so there too, because it is the kind of thing someone
"tidies up" later.

## Licence

MIT. See [`LICENSE`](LICENSE) and [`THIRD_PARTY_LICENSES.md`](THIRD_PARTY_LICENSES.md).
