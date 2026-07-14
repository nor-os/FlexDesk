# Third-party licences

FlexDesk itself is MIT (see `LICENSE`).

## Runtime dependencies: none

FlexDesk has **zero runtime dependencies**. Nothing is bundled into `dist/` except
FlexDesk's own source. The build declares `external: []`, so if a dependency were
ever introduced, the build would fail on an unresolved bare specifier rather than
quietly growing one.

If you install `flexdesk`, you install nothing else.

| | |
|---|---|
| Bare-specifier imports in `src/` | **0** |
| `dependencies` in `package.json` | **none** |
| External assets referenced by `dist/flexdesk.css` | **none** (its one image is an inline `data:` URI) |

## Optional peer dependencies

These are **not installed, not bundled, and not required**. Each is needed only if
you import the entry point that uses it, and FlexDesk never guesses where you keep
it — you tell it (`setPlotlySource()`, `setMonacoBasePath()`).

| Package | Needed by | Licence | Copyright |
|---|---|---|---|
| [plotly.js](https://github.com/plotly/plotly.js) | `@flexdesk/charts` | MIT | Plotly, Inc. |
| [monaco-editor](https://github.com/microsoft/monaco-editor) | `@flexdesk/editor` | MIT | Microsoft Corporation |

## Optional asset

FlexDesk's widgets render icons by applying the `material-symbols-outlined` class.
The font itself is **not shipped** — you supply it, from Google Fonts or self-hosted.
Without it, icons fall back to their text names; nothing breaks.

| Asset | Licence | Copyright |
|---|---|---|
| [Material Symbols](https://github.com/google/material-design-icons) | Apache-2.0 | Google LLC |

## Build-time only

Not shipped, not a dependency of consumers.

| Package | Licence | Copyright |
|---|---|---|
| [esbuild](https://github.com/evanw/esbuild) | MIT | Evan Wallace |

---

Every licence above was read from the package's own `LICENSE` file or from the
licence header in the distributed artifact — not from memory. Material Symbols was
confirmed against `google/material-design-icons/LICENSE`.
