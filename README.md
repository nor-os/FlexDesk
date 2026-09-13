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
