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

## Seven entry points

Because someone who wants a DataTable should not have to download a window
manager, and neither of them should drag in a plotting engine or a code editor.

| Entry | Size | What is in it |
|---|---|---|
| `@flexdesk/core` | 30 kB | Event bus, settings store, logging, state machine, state guard |
| `@flexdesk/host` | 5 kB | The host port (below) |
| `@flexdesk/wm` | 166 kB | Tiling window manager: tabs, splits, desktops, command palette, taxonomy, `createShell()` |
| `@flexdesk/widgets` | 192 kB | DataTable, modals, managed windows, toasts, trees, panels, context menus |
| `@flexdesk/charts` | 26 kB | Plotly wrapper, chart types, subplot layouts, downsampling, plot windows |
| `@flexdesk/tiles` | 67 kB | Draggable/resizable widget grid, tile base class, widget registry, layout persistence |
| `@flexdesk/editor` | 62 kB | Monaco loader + factory, multi-file tab bar, search, split panes, undo manager |

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
    chrome: {
        topNav: document.getElementById('nav'),
        zoom:   document.getElementById('status-bar'),   // content zoom, 50–200%
    },
});
```

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
and any without `onClick`, is drawn as plain text.

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
did in 0.4. This was measured in headless Edge: 109 cells in 7 default tables
computed the same under 0.4.7 and 0.5.0.

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
| `--twm-dt-cell-pad-block`, `--twm-dt-cell-pad-inline`, `--twm-dt-cell-line-height` | Three CSS tokens. Set them on `:root` or on any ancestor to give both densities one row height. They are unset by default, and then each density keeps its own 0.4 values. In Edge, with the tokens set to `2px`, `6px` and `1.35`, normal and compact rows both measured 21.19px. Without them, normal rows measured 27px. |

**Opening a row, and which one is open**

| Option | What it does |
|---|---|
| `onRowActivate(rowIdx, row, ev)` | Opens a row. It fires after the selection has been updated (`onRowClick` still fires before it, as in 0.4). It does not fire for a press on a control in the row (a button, link, field, or `[data-twm-action]`), for a click that ends a drag selecting text in the table, or for the second click of a double-click. `ev.type` tells you which gesture fired it. |
| `activateOn` | Which gestures open a row: `'click'` (the default), `'dblclick'`, `'enter'`, or an array of them. A pick list, where one click selects, uses `['dblclick', 'enter']`. Enter opens the active row; if there is none, it opens the one selected row. |
| `clickable` | Adds `twm-dt--clickable` to the table, which gives rows a pointer cursor and a hover, readonly tables included. It defaults to on exactly when `onRowActivate` is set. |
| `selectable: 'single'` | Lets a click select exactly one row. Shift and Ctrl do not extend the selection, Ctrl+A selects nothing, and `setSelection` keeps the last index it is given. |
| `getRowKey(row, idx)`, `activeRow`, `setActiveRow(key)`, `getActiveRow()` | Mark the open row: `twm-dt-row--active` and `aria-current="true"`, drawn as an accent on the left edge. The mark is not the selection. It survives `setData`, sorting, filtering and paging, and a right-click does not move it. |

The landing helper `attachLandingTableBehavior` now uses the same rule as
`onRowActivate` to decide whether a click opens a row. As a result, a
double-click opens the row once, not twice, and a click that ends a text
selection does not open it.

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
| `columnTypes: [..., 'date' \| 'datetime' \| 'duration']` (or `getColumnType`) | Sorts and filters the column by its value: an ISO string, a `Date` or epoch ms for dates, and milliseconds or text such as `'3.2 s'` for durations. Text that cannot be read is shown as it came. A date-only value such as `2026-10-05` is a calendar date, so the time zone never moves it. |
| `dateFormat`, `dateTimeFormat` | **Default ISO: `YYYY-MM-DD` and `YYYY-MM-DD HH:mm`.** Pass a pattern (`DD.MM.YYYY`, `D MMM YYYY, h:mm a`, with `[literal]` text) or a function `(date) => string`, for every column or per column index. |
| `durationFormat` | `'auto'` (`850 ms`, `3.2 s`, `2m 5s`, `1h 2m`), `'clock'` (`1:02:05`), or a function. |
| `dateTimeZone: 'UTC'` | Reads and draws typed dates in UTC instead of the local zone. |
| `sortValue(value, colIdx, row)` | Sets what a column sorts by, for every column or (as an object or array) per column. Return `undefined` to fall back to the column's own rule. |

The column filters work on values. On a date column, `2026-10` matches October,
`>2026-10` matches after October, `<=2026-10-05` includes the 5th, and
`2026-01..2026-03` matches January through the end of March. On a duration
column, `>1s`, `<500ms` and `1s..1m` work. Text without an operator is matched
against the cell as drawn. `formatDate`, `formatDuration`, `parseDateValue` and
`parseDuration` are exported, so text drawn elsewhere can use the same words
as the table.

**Housekeeping**

| Option | What it does |
|---|---|
| `DataTable.mount(host, config)` | Builds the table and draws it. The constructor still draws nothing until `render()`. |
| `DataTable.withDefaults(defaults)` | Returns a subclass whose `defaults` sit under every config it is given. `instanceof DataTable` holds, and it can be narrowed again. |
| `autoDispose: true` | Calls `dispose()` once the table has been taken out of the document and is still out a task later. Do not set it on a table you detach and attach again later, such as a cached tab, because a disposed table comes back empty. |
| `resetColumnWidths()` | Forgets every dragged, fitted or restored width, the persisted ones included, and measures the columns again. Use it after a zoom or a font change. |

One change needs no option. The copy menu's document listeners (click, scroll,
Escape, resize) now exist only while the menu is open. Before 0.5.0, a table
that had ever been right-clicked kept them until `dispose()`.

### Scrollbars

`installAutoScrollbars(root)` (from `@flexdesk/widgets`) replaces the browser's
scrollbars under `root` with thin overlay bars that show while an element is
hovered or scrolling and fade out afterwards. Native bars are hidden, so no
element reserves layout width for one. The overlay bars live in one fixed
layer, so a container that redraws its contents cannot lose its bar, and
textareas get one too. Containers that already use `installOverlayScrollbar`
keep their own.

## The host port

FlexDesk never touches `pywebview`, `fetch`, `localStorage` or the filesystem. It
asks a **Host**, and you supply one. `createHost({...})` validates the capabilities
you pass and freezes the result; anything you leave out is simply absent, and the
library degrades rather than throwing.

```js
createHost({
    state:   { read, write },              // layout persistence
    dialogs: { saveFile },                 // optional — CSV export falls back to a Blob
    window:  { minimize, maximize, ... },  // optional — no native chrome buttons without it
})
```

`NULL_HOST` is a valid host with nothing behind it.

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

If you already load Plotly yourself (a `<script>` tag that sets `window.Plotly`),
the chart loader short-circuits and you can skip `setPlotlySource`.

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

## Styling

Three stylesheets, and that is the whole CSS contract:

| | |
|---|---|
| `dist/tokens.css` | Every rule reads `var(--…)` from here. Swap this one file and the shell restyles. |
| `dist/reset.css` | The reset. |
| `dist/flexdesk.css` | The library. Every class is `twm-` prefixed (the original working name; the prefix is stable and not worth a breaking rename). |

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
