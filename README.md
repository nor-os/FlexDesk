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
| `@flexdesk/widgets` | 192 kB | DataTable, modals, managed windows, toasts, trees, panels, context menus |
| `@flexdesk/charts` | 26 kB | Plotly wrapper, chart types, subplot layouts, downsampling, plot windows |
| `@flexdesk/tiles` | 67 kB | Draggable/resizable widget grid, tile base class, widget registry, layout persistence |
| `@flexdesk/editor` | 62 kB | Monaco loader + factory, multi-file tab bar, search, split panes, undo manager |
| `@flexdesk/canvas` | — | The canvas kernel: a pannable, zoomable surface, the edge router, a generic graph layer ([Flow editors](#flow-editors)) |
| `@flexdesk/flow` | — | The flow-editor kit and the canvas, outline and lane editors ([Flow editors](#flow-editors)) |

The two new entries' sizes are measured when `dist/` is next built.

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

### Scrollbars

`installAutoScrollbars(root)` (from `@flexdesk/widgets`) replaces the browser's
scrollbars under `root` with thin overlay bars that show while an element is
hovered or scrolling and fade out afterwards. Native bars are hidden, so no
element reserves layout width for one. The overlay bars live in one fixed
layer, so a container that redraws its contents cannot lose its bar, and
textareas get one too. Containers that already use `installOverlayScrollbar`
keep their own.

## Flow editors

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
| `upstream-column`, `upstream-columns` | One or several columns of the step's input, by name, from the panel's `columns` |

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
uses, for the editors' pages too). In the chip input, typing on either side of
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

`createCanvasEditor` and the `@flexdesk/canvas` kernel (36 §4–§5). Owned by the
canvas work; this subsection is filled when it lands.

### The outline editor

`createOutlineEditor` (36 §6). Owned by the outline work; this subsection is
filled when it lands.

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
Under each lane come its feeders, then its forks. A step two lines feed on one
input (`lanes_two_inputs`), a cycle (`lanes_cycle`) or two steps with one id
(`lanes_duplicate_step`) cannot be drawn honestly as lanes. Such a flow opens
read only with the sentence, is drawn as well as it can be, and is never
repaired. The sizes are `LANE_GEOMETRY`: `regular` is 200 × 62 (the editor),
`small` is 160 × 50 (two lines a card, for a narrower host) and `strip` is
92 × 26 (`compact`). The pure edits — splice, add a source, remove, set an
input, the input candidates, parameters — are `lanePipeline`.

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
| `undo()`, `redo()`, `history` | Over whole snapshots. The actions are `LANE_ACTIONS` (`flow:step:add`, `:remove`, `:label`, `:config`, `flow:join:set`, `flow:source:add`, `flow:parameter:add`, `:change`, `:remove`, `flow:settings`) |
| `refreshPreview()` | Asks the providers now, without the debounce |
| `inputColumns(stepId, port?)` | The columns of the frame a step reads, from the last description, else the last preview. The `upstream-column(s)` widgets read the same |
| `layout`, `placed` | The current layout and its coordinates |
| `destroy()` | Removes every listener, popover and table, and aborts the preview in flight |

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
and Escape goes back to the card. Delete removes the step and F2 renames it.
Ctrl/⌘+Z and Ctrl/⌘+Y undo and redo, and are stopped at the editor even inside
a field. The context-menu key or a right press opens a card's menu: *Open its
settings*, *Add a step after it*, *Remove step*. Backspace is never the
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
