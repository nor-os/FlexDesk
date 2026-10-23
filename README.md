# FlexDesk

A tiling window manager and widget set for desktop-class web applications.

Tiles that split and tab, a command palette, dockable panels, virtual desktops, a DataTable with sticky headers and CSV export, managed windows, modals, toasts, trees and context menus. Charts, a code editor, a dashboard grid and flow editors are separate entry points you add when you need them.

- **Zero runtime dependencies.** No React, no framework, nothing. If you install FlexDesk, you install FlexDesk.
- **No application vocabulary.** FlexDesk was extracted from [EcoAgent](https://github.com/nor-os/EcoAgent), a macroeconomic simulation platform, and it knows nothing about economics. You bring the ontology, the host and the storage keys.
- **No build step needed.** The package ships a prebuilt `dist/`, so a plain import map is enough.

## Install

```bash
npm install flexdesk
```

Then follow the [quickstart](docs/quickstart.md): a page, a shell and a table.

## Packages

Import only what you use. The entries share their code, so loading several does not duplicate the event bus.

| Entry | What it is |
|---|---|
| `@flexdesk/core` | Event bus, settings, logging, state machine, state guard |
| `@flexdesk/host` | The host port: how the library reaches storage, dialogs and native windows |
| `@flexdesk/wm` | The tiling window manager: tabs, splits, desktops, command palette, `createShell()` |
| `@flexdesk/widgets` | DataTable, forms, menus, tabs, toasts, panels, windows, trees |
| `@flexdesk/charts` | Plotly charts (Plotly is a peer dependency) |
| `@flexdesk/tiles` | A draggable, resizable dashboard widget grid |
| `@flexdesk/editor` | A Monaco multi-file editor (Monaco is a peer dependency) |
| `@flexdesk/canvas` | A pannable, zoomable canvas with an edge router and a graph layer |
| `@flexdesk/flow` | Flow editors: canvas, outline and lanes |

With npm the entries are imported as `flexdesk/wm`, `flexdesk/widgets` and so on. The docs write them as `@flexdesk/…`, the names an import map gives them. [Packages and entry points](docs/concepts/packages-and-entry-points.md) has the sizes.

## Documentation

| | |
|---|---|
| [Quickstart](docs/quickstart.md) | Install, boot a shell, put a table in a tile |
| [Components](docs/README.md#components) | One page per component |
| [Concepts](docs/README.md#concepts) | The host port, domain neutrality, theming, packaging |
| [Best practices](docs/best-practices.md) | The rules the reference states, in one place |
| [Changelog](CHANGELOG.md) | What changed in each release |

`demo/` holds a runnable standalone demo. The [quickstart](docs/quickstart.md#see-the-full-demo) says how to open it.

## Licence

MIT. See [`LICENSE`](LICENSE) and [`THIRD_PARTY_LICENSES.md`](THIRD_PARTY_LICENSES.md).
