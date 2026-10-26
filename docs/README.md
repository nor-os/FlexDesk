# FlexDesk documentation

New here? Start with the [quickstart](quickstart.md). The [README](../README.md) is the one-page overview.

- **[Components](#components).** One page per component: what it is, how to use it, and every option.
- **[Concepts](#concepts).** The ideas the components share: the host port, packages, naming, theming.
- **[Best practices](best-practices.md).** The rules the reference states, gathered in one place.

## Packages

FlexDesk is nine entry points that share their code, so you load only what you use. [Packages and entry points](concepts/packages-and-entry-points.md) has the sizes and the reasoning.

| Entry | What is in it | Read |
|---|---|---|
| `@flexdesk/core` | Event bus, settings store, logging, state machine, state guard | [State guard](concepts/state-guard.md), [Settings page](components/settings-view.md), [Storage keys and names](concepts/domain-neutrality.md#storage-keys-and-names-are-yours-0170) |
| `@flexdesk/host` | The host port | [Host port](concepts/host-port.md) |
| `@flexdesk/wm` | Tiling window manager: tabs, splits, desktops, command palette, `createShell()` | [Shell and navigation](components/shell.md) and the three pages after it |
| `@flexdesk/widgets` | DataTable, forms, menus, tabs, toasts, panels and more | [Tables and records](#tables-and-records), [Forms, inputs and menus](#forms-inputs-and-menus), [Layout, content and feedback](#layout-content-and-feedback) |
| `@flexdesk/charts` | Plotly wrapper, plot grid and config editor, plot windows | [Charts](components/charts.md) |
| `@flexdesk/tiles` | Draggable, resizable widget grid and its tiles | [Dashboard tiles](components/tiles.md) |
| `@flexdesk/editor` | Monaco loader, editor factory, tab bar, search, split panes | [Editor](components/editor.md) |
| `@flexdesk/canvas` | The canvas kernel: a pannable, zoomable surface, the edge router, a graph layer | [Flow canvas editor](components/flow-canvas-editor.md) |
| `@flexdesk/flow` | The flow-editor kit and the canvas, outline and lane editors | [Flow editors and the flow kit](components/flow-editors.md) |

## Components

### Window manager

`@flexdesk/wm`

- [Shell and navigation](components/shell.md): `createShell`, kinds, navigating between them, what a pane tells its chrome.
- [Panels and desktops](components/panels-and-desktops.md): which panels a page offers, panel sizes, `mountNavPanel`, the desktop bar, a saved layout that cannot be read.
- [Command palette](components/command-palette.md): grouped results, drill-down, disabled rows, prefix-only sources.
- [Keys, Back and tab layout](components/keymap.md): rebinding the window manager's keys, Back and the breadcrumb, zoom, tab layout.

### Tables and records

`@flexdesk/widgets`

- [DataTable](components/data-table.md): sorting, filtering, paging, rows from a server, row details, CSV export.
- [DataTable as a grid](components/data-table-grid.md): editable cells, staged edits, fill handle, paste from Excel, column groups, crosstabs.
- [Record lists and fact sheets](components/record-list-and-fact-table.md): the parts of a page that are not a table of rows.

### Forms, inputs and menus

`@flexdesk/widgets`

- [Forms and dialogs](components/forms-and-dialogs.md): `openForm`, `openConfirm`, and every field type.
- [Settings page](components/settings-view.md): a settings store's schema drawn as a page.
- [Wizard](components/wizard.md): a multi-step flow, inline or in a window.
- [Input fields: slider and tags](components/input-fields.md): `SliderField` and `createTagInput`.
- [Menus](components/menus.md): `createMenuBar`, `ActionDropdown` and `CategoryPicker`.

### Layout, content and feedback

`@flexdesk/widgets`

- [Tabs, section stacks and scrollbars](components/layout-widgets.md): `createTabs`, `createSectionStack`, `installAutoScrollbars`.
- [Slide-out panel](components/slide-out-panel.md): `SlideOutPanel`, an inline panel that slides in over its host.
- [Markdown and document outline](components/markdown-and-outline.md): `renderMarkdown` and `createDocumentOutline`.
- [Conversation view](components/conversation.md): a transcript above a composer.
- [Notifications and progress](components/notifications.md): toasts, history, the alert log, progress bars, lists and phases.

### Charts, editor and dashboards

- [Charts](components/charts.md): `@flexdesk/charts`, on Plotly.
- [Editor](components/editor.md): `@flexdesk/editor`, on Monaco.
- [Dashboard tiles](components/tiles.md): `@flexdesk/tiles`, a draggable widget grid.

### Flow editors

`@flexdesk/flow`, `@flexdesk/canvas`

- [Flow editors and the flow kit](components/flow-editors.md): what the three editors share.
- [Flow canvas editor](components/flow-canvas-editor.md): nodes and lines, and how to build a modeler.
- [Flow outline editor](components/flow-outline-editor.md): the graph drawn as a list of blocks.
- [Flow lane editor](components/flow-lane-editor.md): data flows as lanes, left to right.

### Not yet documented

These have no page of their own: `ManagedWindow`, modals, `TreeView`, context menus, tooltips, the help modal, the window taskbar, and `@flexdesk/core`'s event bus, logging service and state machine. Where another page mentions one, it is in passing. Their sources are under `src/ui/components/`, `src/help/` and `src/core/`.

## Concepts

- [Packages and entry points](concepts/packages-and-entry-points.md): the nine entries, what they weigh, and why they are separate.
- [Host port](concepts/host-port.md): how FlexDesk reaches storage, dialogs and native windows without touching them.
- [Domain neutrality](concepts/domain-neutrality.md): storage keys, theme names and MIME types are yours; no application globals.
- [State guard](concepts/state-guard.md): who wrote that `data-*` attribute.
- [Peer dependencies](concepts/peer-dependencies.md): Plotly and Monaco, and why there is no default path.
- [Theming and CSS](concepts/styling.md): the three stylesheets and the class-name rules.
- [Build and packaging](concepts/building-and-packaging.md): why `dist/` is committed, and the `exports` map.

## Writing these docs

- A feature is documented in a section of the page for its component. The section's heading carries the release that introduced it, as in `A menu bar: createMenuBar (0.17.0)`.
- The [changelog](../CHANGELOG.md) links to those sections by their heading, so **do not rename a heading that has shipped**. If one must change, update the changelog link in the same commit.
- Some test suites read these pages and assert on specific sections, headings and tables. After editing them, run `node tests/run.mjs`, or the suite for the page you touched. `grep -l "docs/" tests/*.mjs` lists them.
