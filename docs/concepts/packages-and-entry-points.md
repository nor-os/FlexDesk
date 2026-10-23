# Packages and entry points

> **Install:** see the [quickstart](../quickstart.md) · **Component pages:** [docs index](../README.md#components) · [All docs](../README.md)

## Nine entry points

Because someone who wants a DataTable should not have to download a window
manager, and neither of them should drag in a plotting engine or a code editor.

| Entry | Size | What is in it |
|---|---|---|
| `@flexdesk/core` | 30 kB | Event bus, settings store, logging, state machine, state guard |
| `@flexdesk/host` | 5 kB | The [host port](host-port.md) |
| `@flexdesk/wm` | 166 kB | Tiling window manager: tabs, splits, desktops, command palette, taxonomy, `createShell()` |
| `@flexdesk/widgets` | 192 kB | DataTable, modals, managed windows, toasts, trees, panels, context menus, menu bars, a document outline, progress, a conversation view |
| `@flexdesk/charts` | 26 kB | Plotly wrapper, chart types, subplot layouts, downsampling, a plot grid, a plot-config editor, plot windows, injected series transforms |
| `@flexdesk/tiles` | 67 kB | Draggable/resizable widget grid, tile base class, widget registry, layout persistence, figure, chart and KPI tiles |
| `@flexdesk/editor` | 62 kB | Monaco loader + factory, multi-file tab bar, search, split panes, undo manager |
| `@flexdesk/canvas` | 14 kB | The canvas kernel: a pannable, zoomable surface, the edge router, a generic graph layer ([Flow editors](../components/flow-editors.md#flow-editors)) |
| `@flexdesk/flow` | 381 kB | The flow-editor kit and the canvas, outline and lane editors ([Flow editors](../components/flow-editors.md#flow-editors)) |

The sizes of `@flexdesk/canvas` and `@flexdesk/flow` are the entry files as
`node build.mjs` reported them for the flow editors' integration build; like
every entry they also import shared chunks. The other rows are older figures.

They share code through chunks, so importing two of them does **not** give you two
event buses — and therefore not two copies of every module-level singleton. A test
asserts each kernel symbol is defined exactly once across the whole `dist/`.

Two different things here are called "tiles", which is unfortunate but honest to
the code: `@flexdesk/wm` tiles the *window*; `@flexdesk/tiles` is a dashboard
*widget grid*.
