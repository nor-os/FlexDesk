# Quickstart

From an empty folder to a shell with a table in it. You need a text editor and a static file server. There is no bundler, no framework and no build step.

## Install

```bash
npm install flexdesk
```

The package ships a prebuilt `dist/`. Copy it into your site (the examples below call the copy `vendor/flexdesk/`) and load it through an import map:

```bash
mkdir -p vendor && cp -r node_modules/flexdesk/dist vendor/flexdesk
```

Under a bundler you need none of that. Import the entries as `flexdesk/core`, `flexdesk/host`, `flexdesk/wm`, `flexdesk/widgets` (and `flexdesk/charts`, `flexdesk/tiles`, `flexdesk/editor`, `flexdesk/canvas`, `flexdesk/flow`), and the stylesheets as `flexdesk/css/tokens`, `flexdesk/css/reset` and `flexdesk/css`. The rest of these docs write the entries as `@flexdesk/wm` and so on, which is the name the import map below gives them.

## The page

```html
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <title>My first shell</title>
    <script type="importmap">
    { "imports": {
        "@flexdesk/core":    "./vendor/flexdesk/core.js",
        "@flexdesk/host":    "./vendor/flexdesk/host.js",
        "@flexdesk/wm":      "./vendor/flexdesk/wm.js",
        "@flexdesk/widgets": "./vendor/flexdesk/widgets.js"
    } }
    </script>

    <!-- Optional: the icon font. Without it, icons show their text names. -->
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined" />

    <!-- The whole CSS contract, in this order. -->
    <link href="./vendor/flexdesk/tokens.css"   rel="stylesheet" />
    <link href="./vendor/flexdesk/reset.css"    rel="stylesheet" />
    <link href="./vendor/flexdesk/flexdesk.css" rel="stylesheet" />

    <style>
        html, body { height: 100%; margin: 0; }
        body {
            background: var(--surface-0);
            color: var(--text-primary);
            font-family: var(--font-family-sans);
            display: flex; flex-direction: column;
        }
        #nav { flex: 0 0 auto; }
        #app { flex: 1 1 0; min-height: 0; position: relative; }   /* the shell fills this */
    </style>
</head>
<body class="twm-body">
    <div id="nav"></div>
    <div id="app"></div>
    <script type="module" src="./main.js"></script>
</body>
</html>
```

The three stylesheets are the whole CSS contract. `tokens.css` defines every colour, space and font the rules read, `reset.css` is the reset, and `flexdesk.css` is the library. It reads the tokens but does not define them, so without `tokens.css` its colours, spacing and fonts are undefined. See [Theming and CSS](concepts/styling.md#styling).

FlexDesk does not ship the icon font (Material Symbols Outlined). Load it from Google Fonts or self-host it. Nothing else breaks without it.

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
            cosmos: { label: 'Cosmos', icon: 'public', isTopNav: true, sources: ['planet'] },
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

Save that as `main.js`. What each part is:

- **`taxonomy`** is your ontology: the kinds of thing your application has and how they nest. FlexDesk has none of its own.
- **`entities`** is what the command palette (Ctrl+K) searches.
- **`content`** is one factory per kind. It renders that kind into a tile.
- **`host`** is where persistence goes. An in-memory `Map` is a perfectly good host; [the host port](concepts/host-port.md#the-host-port) covers the real ones.
- **`chrome`** is the elements the shell paints into, not selectors. The library never guesses at your markup.

## Put a table in a tile

Give the root kind a content factory that mounts a [DataTable](components/data-table.md). `DataTable` is in `@flexdesk/widgets`, which the first snippet already imports.

```js
const PLANETS = [
    ['Mercury', '0', '0.39'],
    ['Venus',   '0', '0.72'],
    ['Earth',   '1', '1.00'],
    ['Mars',    '2', '1.52'],
];

const planetsTable = (hostEl) => {
    // A tile body is a flex column. Give the table a box that fills it, in normal flow:
    // absolute positioning would let the table escape the tile.
    const box = document.createElement('div');
    box.style.cssText = 'height:100%; display:flex; flex-direction:column; min-height:0;';
    hostEl.appendChild(box);
    DataTable.mount(box, {
        headers: ['Planet', 'Moons', 'Distance (AU)'],
        rows: PLANETS,
        sortable: true,
    });
};

// …and in createShell({ … }), in place of the planet factory:
content: {
    cosmos: planetsTable,
    // The three panels ask for content by these names. Without a factory they show a placeholder.
    'panel:left':   (hostEl) => { hostEl.textContent = 'Left panel'; },
    'panel:right':  (hostEl) => { hostEl.textContent = 'Right panel'; },
    'panel:bottom': (hostEl) => { hostEl.textContent = 'Bottom panel'; },
},
```

`cosmos` is the root kind and a top-nav kind, so the shell opens it first. Click a header to sort. The placeholder a panel shows when nothing is registered for it reads "no factory registered yet": the registry working, though it looks like a bug.

## See the full demo

`demo/` in the repository is a complete version of this page: planets and moons, an in-memory host, panels, desktops and the command palette, with no backend. It loads `dist/`, and ES modules do not load from `file://`, so serve the repository root with any static file server and open `/demo/`:

```bash
git clone https://github.com/nor-os/FlexDesk.git
cd FlexDesk
python3 -m http.server 8080      # or any static server
# then open http://localhost:8080/demo/
```

The other pages in `demo/` are one-component pages: `datatable_070.html`, `records.html`, `flow_canvas.html`, `flow_outline.html`, `flow_lanes.html`, `flow_kit.html` and `flow_modeler.html`.

## Where next

- **A component.** Each has a page: [Shell and navigation](components/shell.md), [DataTable](components/data-table.md), [Forms and dialogs](components/forms-and-dialogs.md), and the rest in the [component index](README.md#components).
- **How the pieces fit.** [Packages and entry points](concepts/packages-and-entry-points.md), the [host port](concepts/host-port.md), [domain neutrality](concepts/domain-neutrality.md) and [theming](concepts/styling.md).
- **Doing it well.** [Best practices](best-practices.md).
- **What changed.** The [changelog](../CHANGELOG.md).
