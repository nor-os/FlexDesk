# Changelog

## 0.17.15 (2026-10-26)

A patch release with no API change. Its entries change what embedders see: a top-level tile loses its one-segment breadcrumb strip, every `openForm` row lays its inputs out anew, and a slide-out panel no longer crosses what lies right of its host. Each entry links to its section of the docs.

### Added and changed

- [A tile breadcrumb of one segment is not drawn](docs/components/shell.md#a-tile-breadcrumb-of-one-segment-is-not-drawn-01715): while `mountTileBreadcrumb`'s path is a single segment or none (a top-nav page with no root crumb, trail or entity; an `appGlobal` kind), the strip is `hidden` and the page shell's `.twm-page-shell__breadcrumb` slot takes no room, so a top-level page no longer shows its name twice. `refresh()` shows it again at two segments; longer paths and `renderBreadcrumb` are unchanged (STORY-0124).
- [The inputs of a row are equally wide](docs/components/forms-and-dialogs.md#the-inputs-of-a-row-are-equally-wide-01715): in an `openForm` `{ row }` each field's basis is its label (the first one's, the 130px label column) and the free space is shared equally, so every input of a row has the same width (up to each control's own padding); until 0.17.14 the first input was squeezed by the label column. A form whose widest row has three or more fields opens at `170 + 230 × fields` px: at least 640px, otherwise at most 90% of the window (BUG-0050).

- [A slide-out panel is never drawn outside its host](docs/components/slide-out-panel.md#never-drawn-outside-its-host-01715): opening or closing, `SlideOutPanel` slides behind a clip that runs with it (`clip-path` with the same 200ms ease-out as the slide), so it no longer crosses the dock panel right of its host (BUG-0051).

### Removed or renamed exports

None. Compared with 0.17.14, across every entry point and the package
`exports` map, no export or option was added, removed or renamed. flexdesk.css
has no new class and defines no new custom property.

## 0.17.14 (2026-10-26)

A patch release. Everything below is additive except one changed default (see
"Changed default"). Each entry with a docs section links to it.

### Added and changed

- [Tree items with row actions](docs/components/layout-widgets.md#tree-items-with-row-actions-01714): `createTreeItem` takes `actions` in the shape `createTreeNode` takes them (`{ id: { icon, title, onClick(id, event) } }`). The buttons (`.twm-tree-node__action-btn`) sit in one line in a `.twm-tree-item__actions` slot at the row's end, shown on hover, on focus within and on the selected item; the slot takes no height, so a row is as tall with actions as without; it is hidden by opacity, so Tab still reaches the buttons; a click on an action does not select the item and a double-click does not reach `onItemDoubleClick`. Without `actions` the markup is unchanged. `createTreeNode`'s action buttons, built by the same code, are now `type="button"`, so inside a form they no longer submit it (STORY-0121).
- [The digit chords follow the key's position](docs/components/keymap.md#the-digit-chords-follow-the-keys-position-not-its-character-01714): Alt+1..9 and Alt+Shift+1..9 match `event.code` (`Digit1`..`Digit9`), so Alt+Shift+N moves the focused tile to desktop N from a real key press on any layout (BUG-0046).
- [Spinners turn without keyframes of your own](docs/concepts/styling.md#spinners-turn-without-keyframes-of-your-own-01714): flexdesk.css defines the `@keyframes` its tile-loading, data-table, computing-status and run-progress spinners name (BUG-0047).
- [A saved layout that cannot be read](docs/components/panels-and-desktops.md#a-saved-layout-that-cannot-be-read-01714): a saved `desktops` layout that is JSON but not a layout is ignored with one warning, and the shell opens its default layout instead of throwing (BUG-0048).
- `flexdesk/css/tokens` resolves to `dist/tokens.css`, the file the docs name, like `flexdesk/css` and `flexdesk/css/reset` (BUG-0030).
- [The menu-bar row is a band of its own](docs/components/menus.md#the-menu-bar-in-its-own-row-under-the-top-bar-01713): `.twm-global-menu-bar` has background `var(--surface-0)`, darker than the top bar, and a `1px solid var(--border-strong)` border above and below (was `var(--surface-1)` with a `var(--surface-0)` bottom border), so it is set off from the top bar and the tiles. The row is 1px taller (STORY-0122).

### Changed default

- `DEFAULT_STATE_GUARD_CONFIG.allowedDatasetKeys` no longer lists thirteen keys that one embedding application had left in it and no FlexDesk widget writes: `scenario-id`, `run-id`, `run-state`, `mirror-input`, `mirror-input-bound`, `mirror-change-bound`, `override-type`, `info-for`, `dsl-state`, `dsl-section-registered`, `dsl-scrollbars-installed`, `dsl-tabs-bound` and `dsl-controls-bound`. An app that writes one of them under a guard built on the defaults lists it on top of them; a strict guard otherwise throws on the write (BUG-0029).

### Removed or renamed exports

None. Compared with 0.17.13, across every entry point (`core`, `widgets`, `wm`,
`host`, `canvas`, `flow`, `charts`, `tiles`, `editor`) and the package
`exports` map, no export was added, removed or renamed, and no option was
removed or renamed; `createTreeItem` has one new option, `actions`. Not an
export but worth knowing: flexdesk.css has one new class,
`.twm-tree-item__actions`, and defines no new custom property.

## 0.17.13 (2026-10-26)

A patch release: everything below is additive. Every fix is documented in a
section of the docs headed "(0.17.13)"; each entry links to it.

### Added and changed

- [The menu bar in its own row under the top bar](docs/components/menus.md#the-menu-bar-in-its-own-row-under-the-top-bar-01713): a shell's menu bar can sit on a second line, as a full-width strip directly under the top bar. Put `chrome.menuBar` in a `.twm-global-menu-bar` that is a child of `body.twm-body`, between `.twm-global-top-bar` and the host. The row is a fixed-size item in the body's flex column (`flex: 0 0 auto`), so the host is shorter by the row's height and nothing is drawn under it. It is styled with FlexDesk tokens (`padding: var(--space-xxs) var(--space-xs)`, background `var(--surface-1)`, text `var(--text-body)`, a bottom border `var(--surface-0)` like the top bar's), and the `.twm-menubar` inside it keeps its own styles. It is a sibling of the top bar, not part of it: a window-drag region bound to the top bar (`WindowChromeController`'s `topBar`) does not include it, so a press on the row never drags the window, and it sets no `z-index`, so the top bar's dropdowns are drawn over it. A `ManagedWindow` on `document.body` (no `container`) is clamped, centred and maximised below the top bar and the row. A modal's backdrop starts below the top bar, so the row, like the top bar, stays usable while a modal is open. A shell without the row looks exactly as before; the row works only inside `body.twm-body` (STORY-0119).

### Removed or renamed exports

None. Compared with 0.17.12, across every entry point (`core`, `widgets`, `wm`,
`host`, `canvas`, `flow`, `charts`, `tiles`, `editor`) and the package
`exports` map, no export was added, removed or renamed, and no option was
removed or renamed. Not an export but worth knowing: flexdesk.css has one new
class, `.twm-global-menu-bar`, and defines no new custom property.

## 0.17.12 (2026-10-26)

A patch release: everything below is additive. Every fix is documented in a
section of the docs headed "(0.17.12)"; each entry links to it.

### Added and changed

- [An empty cell can name what is missing: `emptyMessage` as a function](docs/components/charts.md#an-empty-cell-can-name-what-is-missing-emptymessage-as-a-function-01712): `renderPlotGrid`, `PlotPopoutWindow` and `openPlotPopoutWindow` take `emptyMessage` as a string, as before, or as a function `(subplot, results, index) => string`. It is called each time a cell is drawn empty, with that cell's subplot, the grid's results at that moment (as the grid was given them, so null or undefined when there are none) and the cell's index in the layout: on the first draw, on every `update()` (new `results`, a new `plotConfig`, `overlays` or `hiddenSeries`), on a resize that draws a deferred cell, and when a subplot fails to draw, so the message follows results that stream in or change without rebuilding the grid. The plot window hands its `emptyMessage` to its grid, so the function is also called on the window's refresh and stream events and `updateConfig()`; `openPlotPopoutWindow` forwards it. A slot with no subplot still shows `noSubplotMessage`, the Data tab's `tableEmptyMessage` stays a string, and a string `emptyMessage` is shown exactly as before (STORY-0117).

### Removed or renamed exports

None. Compared with 0.17.11, across every entry point (`core`, `widgets`, `wm`,
`host`, `canvas`, `flow`, `charts`, `tiles`, `editor`) and the package
`exports` map, no export was added, removed or renamed, and no option was
removed or renamed: `emptyMessage` accepts a function as well as a string.

## 0.17.11 (2026-10-25)

A patch release: everything below is additive. Every fix is documented in a
section of the docs headed "(0.17.11)"; each entry links to it.

### Added and changed

- [Retheming the accent shades](docs/concepts/styling.md#retheming-the-accent-shades-01711): the accent blues that 0.17.10 left as literals, in shades no mix of an accent token gives exactly, are now derived from the accent tokens too, so setting `--accent`, `--accent-hover` and `--accent-bright` on `:root` rethemes the primary buttons' hover, the selected tile, the row cursor, the window bar, the plot window, the spinner and the flow lanes as well. Three tokens are new in tokens.css: `--accent-bright-hover` (`color-mix(in srgb, var(--accent-bright) 90%, white)`, about `#1987d1`), `--accent-pressed` (`color-mix(in srgb, var(--accent-hover) 90%, black)`, about `#0f6ba8`) and `--accent-lightest` (`color-mix(in srgb, var(--accent-bright) 36%, white)`, about `#a3cfed`). None of the old colours is an exact mix, so each moves to the nearest one (ΔE in OKLab × 100, tints measured over `--surface-0`): `.twm-btn--primary:hover` `#1486cf` → `#1987d1` (0.4); the modal's primary button hover `#1683c4` → `#1987d1` (2.2); `.twm-bar-windows__item:hover` `#268bd2` → `#1987d1` (1.3); `.twm-bar-windows__item:active` `#1a6aa5` → `#0f6ba8` (0.6); the plot series and plot config checkboxes' `accent-color` and the plot config select's focus border `#268bd2` → `#218bd3` (0.3); the plot window toolbar's active button and the computing spinner `#4a90d9` → `#3395d6` (2.1), with the active button's tint and hover tint and the plot table's hovered row (`rgba(74, 144, 217, a)`) following at the same alpha (0.5 to 0.9); the selected tile's border and title, the tile header buttons' and tile menu's hover icons and the action dropdown's icons `#78b9ff` → `#73b6e3` (`--accent-lighter`, 4.1, the largest shift), with the selected tile's ring and header tint (`rgba(120, 185, 255, a)`) following (1.6, 0.6); the action dropdown's hovered or focused icon `#9ecfff` → `#a3cfed` (2.6); the notebook autocomplete's focused border `#79b8f8` → `#73b6e3` (3.2); `.twm-row-cursor`, the focused landing pane's head, `.twm-action-btn:hover` (`rgba(17, 119, 179, a)`) and `.twm-snap-preview` (`rgba(23, 119, 179, 0.18)`) now `--accent-hover` at the same alpha (0.2); `--twm-lanes-wire` `#5b9bd5` → `var(--accent-light)`, about `#4da2db` (2.0); `--twm-lanes-ring` `#1683c4` → `var(--accent-bright-hover)`, about `#1987d1` (2.2); the flow lanes' pressed show button `#0f6fa8` → `#0f6ba8` (1.2); the selected card's glow and a new or changed cell and column (`rgba(22, 131, 196, a)`) now `--twm-lanes-ring` at the same alpha (0.3 to 1.7); a new or changed column's type `#9fd0f0` → `#a3cfed` (0.6). `--accent` and `--accent-bright` stay two tokens. Still literals, because they are not the accent: the colours listed in the (0.17.10) section, the charts' series palette and the Monaco editor theme's selection colours (BUG-0045).

### Removed or renamed exports

None. Compared with 0.17.10, across every entry point (`core`, `widgets`, `wm`,
`host`, `canvas`, `flow`, `charts`, `tiles`, `editor`) and the package
`exports` map, no export was added, removed or renamed. Not an export but
worth knowing: tokens.css defines three new custom properties,
`--accent-bright-hover`, `--accent-pressed` and `--accent-lightest`;
`--twm-lanes-wire` and `--twm-lanes-ring` keep their names but default to
`var(--accent-light)` and `var(--accent-bright-hover)` (were `#5b9bd5` and
`#1683c4`); and the default colours listed above move by up to 4.1 ΔE, the
largest being the selected tile's `#78b9ff`, now about `#73b6e3` (see above).

## 0.17.10 (2026-10-25)

A patch release: everything below is additive. Every fix is documented in a
section of the docs headed "(0.17.10)"; each entry links to it.

### Added and changed

- [Retheming the accent](docs/concepts/styling.md#retheming-the-accent-01710): the accent colours in flexdesk.css that were the literal `#007acc` (`rgb(0, 122, 204)`), its tints, and the light accent `#569cd6` / `#6eb3e9` are now derived from `--accent-bright`, so setting `--accent`, `--accent-hover` and `--accent-bright` on `:root` rethemes all of them. In tokens.css, `--state-selected` and `--shadow-glow` are now mixes of `--accent-bright` (the same colours as before), and three tokens are new: `--twm-dt-new-bg` (the colour a DataTable row or cell that has just arrived flashes from, which the stylesheet read before with an `rgba(0, 122, 204, 0.22)` fallback but nothing defined), `--accent-light` (about `#4da2db`, replacing `#569cd6`) and `--accent-lighter` (about `#73b6e3`, replacing `#6eb3e9`). The `rgba(0, 122, 204, a)` tints are now `color-mix(in srgb, var(--accent-bright) a%, transparent)`, with the same colour by default: the DataTable's selected rows and cells, the filter chip when on, the autocomplete's namespace pill and active item, `.add-widget-btn`, `.tile.resizing`, `.tile-ghost`, the focused leaf's inset shadow, the document outline's active link, the canvas marquee and the flow graph's port dots. The SliderField thumb, the SortableList drop line, add button and input focus, the DataTable filter inputs' focus border and the notebook autocomplete's border read `--accent-light`, and the active thumb `--accent-lighter`; since `#569cd6` cannot be mixed exactly from `#007acc`, these move to the nearest mix with white, a difference of about 1.5 to 1.7 ΔE (OKLab × 100). `var(--accent-bright, …)`, `var(--state-selected, …)`, `var(--ea-accent, …)` and `var(--accent, …)` no longer carry fallbacks, so no computed colour changes but flexdesk.css now needs tokens.css (or your own definitions of these tokens). Accent blues in other shades that no mix of an accent token gives exactly stay literals (BUG-0044).

### Removed or renamed exports

None. Compared with 0.17.9, across every entry point (`core`, `widgets`, `wm`,
`host`, `canvas`, `flow`, `charts`, `tiles`, `editor`) and the package
`exports` map, no export was added, removed or renamed. Not an export but
worth knowing: tokens.css defines three new custom properties,
`--accent-light`, `--accent-lighter` and `--twm-dt-new-bg`, and derives
`--state-selected` and `--shadow-glow` from `--accent-bright`; flexdesk.css
reads the accent tokens without fallbacks, so it needs tokens.css; and the
SliderField thumb is about `#4da2db` (was `#569cd6`) and its active state
about `#73b6e3` (was `#6eb3e9`) (see above).

## 0.17.9 (2026-10-25)

A patch release: everything below is additive. Every fix is documented in a
section of the docs headed "(0.17.9)"; each entry links to it.

### Added and changed

- [Context menus stay inside the window](docs/components/menus.md#context-menus-stay-inside-the-window-0179): `showContextMenu(x, y, items, onAction)`, the DataTable's right-click menu and `NotebookTabBar`'s tab menu are placed the same way, however many items they hold. A menu is capped at the window's height less 8px above and below and scrolls inside when it is longer (flexdesk.css gives `.twm-context-menu` and `.nb-context-menu` `overflow-y: auto` and `box-sizing: border-box`); it opens with its top-left corner at the pointer and moves left or up only as far as it must to fit, never past the window's top or left edge. Before, a menu had no cap: the DataTable's opened above the window's top edge and `showContextMenu`'s ran off the bottom, so the items past the edge could not be reached. All three now take focus on the first enabled item, move it with Up/Down (wrapping), Home and End, scrolling the focused item into view, choose with Enter or Space, close with Escape and give focus back when they close (before, only `showContextMenu` did); scrolling the menu itself does not close it. Nothing changes in how you call them (BUG-0040).
- [The plot config editor writes no stray "null"](docs/components/charts.md#the-plot-config-editor-writes-no-stray-null-0179): `renderPlotConfigEditor` appended the sections a subplot does not have as `null`, which `Element.append()` writes as the text `null`, so every 2D subplot showed a `null` line where a 3D chart's **Z axis** goes, and an editor without `seriesTransforms` showed another where **Derived series** goes. A section the subplot does not have is now left out; nothing else about the editor changed (BUG-0041).
- [Interpolation `'auto'` is a listed choice](docs/components/charts.md#interpolation-auto-is-a-listed-choice-0179): a subplot's `interpolation` is `'linear'`, `'step'`, `'cubic'` or `'auto'`, and `'auto'` draws straight segments exactly as `'linear'` does (`buildTrace` gives both the Plotly line shape `linear`, as it always has). `renderPlotConfigEditor`'s **Interpolation** select now offers **Auto**, **Linear**, **Step** and **Cubic spline**, so a subplot saved with `'auto'` opens with Auto chosen instead of `auto (not found)` and keeps `'auto'` until another value is picked. A new subplot is still `'linear'`, and every value draws as before (BUG-0042).
- [Action dropdowns: positioning against the end edge](docs/components/menus.md#action-dropdowns-positioning-against-the-end-edge-0179): `ActionDropdown.position(trigger, menu, { align })` takes an optional third argument. `align: 'start'` (the default, and what it did before) lines the menu up with the trigger's left edge first, `'end'` with its right edge; either flips to the other edge when the menu would leave the window (BUG-0043).
- [A tile's ⋯ menu is drawn over the page](docs/components/tiles.md#the--menu-is-drawn-over-the-page-0179): a tile's **More actions** menu (`.tile-menu-dropdown`) is no longer drawn inside the tile. While it is open it is moved to `document.body` (or to the open modal's host, as `showContextMenu` does), placed with `ActionDropdown.position(button, menu, { align: 'end' })` as `position: fixed` on `--z-over-windows`, so neighbouring tiles and the managed window a grid sits in no longer clip it, and it stays 8px inside the window, opening under the button when it fits there, else above it when it fits there, else on the side with more room, scrolling inside. Choosing an entry, a press outside it or the ⋯ button again closes it and puts it back in the tile's header; `dispose()` closes an open menu first. Until 0.17.8 the menu was `position: absolute` inside the tile, so in a tile narrower than about 220px its left part and its labels were cut off (BUG-0043).

### Removed or renamed exports

None. Compared with 0.17.8, across every entry point (`core`, `widgets`, `wm`,
`host`, `canvas`, `flow`, `charts`, `tiles`, `editor`) and the package
`exports` map, no export was added, removed or renamed. Not an export but
worth knowing: `ActionDropdown.position` takes an optional third argument,
`{ align }`; `renderPlotConfigEditor` lists `'auto'` among the interpolations;
an open tile ⋯ menu lives outside `tile.element` until it closes; and
flexdesk.css caps `.twm-context-menu` and `.nb-context-menu` at the window's
height with `overflow-y: auto`, and draws `.tile-menu-dropdown` on
`--z-over-windows` (see above).

## 0.17.8 (2026-10-24)

A patch release: everything below is additive. Every fix is documented in a
section of the docs headed "(0.17.8)"; each entry links to it.

### Added and changed

- [A series transform knows its series, and takes a choice parameter](docs/components/charts.md#a-series-transform-knows-its-series-and-takes-a-choice-parameter-0178): a `seriesTransforms` entry's `run` gets a third argument, `run(y, params, { series, subplot, results, resolveSeries })`: the subplot's series entry the trace was drawn from (null for any other trace, such as an overlay), the subplot config, the results the figure was drawn from and the `resolveSeries` it was drawn with, so a transform can resolve the same series from other results (a baseline scenario) the same way. `renderPlotGrid`, and so `PlotPopoutWindow`, run transforms on the same traces as in 0.17.7 and draw the same derived traces; `deriveSeriesTraces` takes the new optional `seriesOf`, `results` and `resolveSeries` options, and without them passes `series`, `results` and `resolveSeries` as null. A parameter declared `{ type: 'choice', options }` (an array of `{ value, label }`, or a function `(subplot) => options`) is drawn by `renderSeriesTransformControls` as a select (choice_controls' `selectBox`, styled by the new `.twm-series-transforms__select` rule) instead of a number field; the pick is saved under `subplot.transforms.<id>.params` and passed to `run` like a number, and without a `default` or a saved value it is the first enabled option. A transform written as `run(y, params)` with number parameters works and draws exactly as before (STORY-0111).

### Removed or renamed exports

None. Compared with 0.17.7, across every entry point (`core`, `widgets`, `wm`,
`host`, `canvas`, `flow`, `charts`, `tiles`, `editor`) and the package
`exports` map, no export was added, removed or renamed. Not an export but
worth knowing: a series transform's `run` gets a third argument and
`deriveSeriesTraces` takes three more options, all optional, and flexdesk.css
gains a `.twm-series-transforms__select` rule (see above).

## 0.17.7 (2026-10-24)

A patch release: everything below is additive. Every fix is documented in a
section of the docs headed "(0.17.7)"; each entry links to it.

### Added and changed

- [`installOverlayScrollbar` is styled by flexdesk.css](docs/components/layout-widgets.md#installoverlayscrollbar-is-styled-by-flexdeskcss-0177): the `.overlay-scrollbar-v` and `.overlay-scrollbar-h` bars that `installOverlayScrollbar` (and `installCollapsibleScrollbars`, `installTabsScrollbars` and `installWorkspaceScrollbars`, which build on it) appends now have rules in flexdesk.css, so they work with only FlexDesk's stylesheets loaded. The bar is `position: absolute` at the container's right or bottom edge, `--scrollbar-size` thick, on `--z-scrollbar`; it starts at `opacity: 0` and shows on hover while the container overflows; it takes no pointer events except on its thumb, which is at least 30px long. Its colours and rounding are the new tokens `--scrollbar-track`, `--scrollbar-thumb`, `--scrollbar-thumb-hover`, `--scrollbar-thumb-active` and `--scrollbar-radius` in tokens.css. Until now no FlexDesk stylesheet styled these classes, so the bar was `position: static`, fed the container's content height and grew it without limit unless the embedder brought its own CSS (BUG-0039).

### Removed or renamed exports

None. Compared with 0.17.6, across every entry point (`core`, `widgets`, `wm`,
`host`, `canvas`, `flow`, `charts`, `tiles`, `editor`) and the package
`exports` map, no export was added, removed or renamed. Not an export but
worth knowing: tokens.css gains the `--scrollbar-*` and `--z-scrollbar`
custom properties, and flexdesk.css gains rules for `.overlay-scrollbar-v`,
`.overlay-scrollbar-h` and their `.track` and `.thumb` (see above).

## 0.17.6 (2026-10-24)

A patch release: everything below is additive. Every fix is documented in a
section of the docs headed "(0.17.6)"; each entry links to it.

### Added and changed

- [Monaco's `Canceled` rejections are hidden](docs/components/editor.md#monacos-canceled-rejections-are-hidden-0176): disposing an editor within 50 ms of it getting focus (re-rendering a view right after focus moves back to it, as an Edit > Undo from the menu bar does) no longer logs an uncaught `Canceled: Canceled` from Monaco's `Delayer.cancel`. The first `initMonaco()` that starts a load installs one window `unhandledrejection` listener that calls `preventDefault()` only when the reason has `name === 'Canceled'` and `message === 'Canceled'` (Monaco's CancellationError); every other rejection still reaches the page and its console. It is installed once per page, however often `initMonaco()` is called or retried, and stays for the life of the page (BUG-0038).

### Removed or renamed exports

None. Compared with 0.17.5, across every entry point (`core`, `widgets`, `wm`,
`host`, `canvas`, `flow`, `charts`, `tiles`, `editor`) and the package
`exports` map, no export was added, removed or renamed. Not an export but
worth knowing: the first `initMonaco()` that starts a load now adds a window
`unhandledrejection` listener, which hides Monaco's `Canceled` rejections and
nothing else (see above).

## 0.17.5 (2026-10-24)

A patch release: everything below is additive. Every fix is documented in a
section of the docs headed "(0.17.5)"; each entry links to it.

### Added and changed

- [A data series with no saved plot config opens](docs/components/charts.md#a-data-series-with-no-saved-plot-config-opens-0175): `openDataSeriesPlotWindow` (and `new DataSeriesPlotWindow`) no longer throws `TypeError: this.classifyHeader is not a function` when `getPlotConfig(seriesId)` answers nothing. `DataSeriesPlotWindow.createDefaultConfig(headers, numericColumns, classifyHeader)` takes the header classifier as a third, optional parameter (the default classifier calls `t`, `time`, `step` and `period` time); the window passes the `classifyHeader` it was given, so the first numeric column it calls `'time'` is on X (else the first numeric column) and up to three other numeric columns are on Y (BUG-0037).

### Removed or renamed exports

None. Compared with 0.17.4, across every entry point (`core`, `widgets`, `wm`,
`host`, `canvas`, `flow`, `charts`, `tiles`, `editor`) and the package
`exports` map, no export was added, removed or renamed. Not an export but
worth knowing: the static `DataSeriesPlotWindow.createDefaultConfig` gained an
optional third parameter, `classifyHeader`; called with two arguments it uses
the default classifier (see above).

## 0.17.4 (2026-10-23)

A patch release: everything below is additive. Every fix is documented in a
section of the docs headed "(0.17.4)"; each entry links to it.

### Added and changed

- [A slide-out stays inside its host](docs/components/slide-out-panel.md#a-slide-out-stays-inside-its-host-0174): a `SlideOutPanel` is never wider than its host. While open it carries the host's width as `--twm-slide-out-host-w`, which `.twm-slide-out-panel` uses as its `max-width` and as the ceiling of its 400px `min-width`; in a host narrower than the panel's `width` it is the host's width and starts at the host's left edge, at any content zoom and again after every host resize. The header icon and the close button's icon are 18px, by rules that win over `.material-symbols-outlined`'s 24px (BUG-0035).
- [A pane at the window's edge keeps its bar](docs/components/layout-widgets.md#a-pane-at-the-windows-edge-keeps-its-bar-0174): the window's `.twm-resize-handle` strips and corners are not cover when an overlay scrollbar checks what sits over its track, so a pane flush against the right or bottom edge of a non-maximized window shows its bar again; a popover over the pane still hides it (BUG-0036).
- `installAutoScrollbars` drops the overlay bars of an element taken out of the page (a managed window closed) at once, instead of leaving them on screen through the hide delay and fade.
- The reference documentation moved from the README into `docs/` ([docs/README.md](docs/README.md): one page per component and per concept, headings unchanged); the README is a short overview, and `docs/` ships in the package.

### Removed or renamed exports

None. Compared with 0.17.3, across every entry point (`core`, `widgets`, `wm`,
`host`, `canvas`, `flow`, `charts`, `tiles`, `editor`) and the package
`exports` map, no export was added, removed or renamed. Not an export but
worth knowing: `.twm-slide-out-panel` has a `max-width` while open, and the
slide-out's header and close icons are 18px instead of the page's icon size
(see above).

## 0.17.3 (2026-10-22)

A patch release: everything below is additive. Every entry is documented in a
section of the docs headed "(0.17.3)"; each entry links to it.

### Added and changed

- [One toast, one history entry, one unread](docs/components/notifications.md#one-toast-one-history-entry-one-unread-0173): `NotificationCenter.history` holds one entry per toast however it was raised (`show()`, `warn()` / `error()` / `info()` / `success()`, `toast:show`, `notification:show`, `log:entry`), and a toast that leaves marks its own entry `dismissed: true` with the `reason` instead of adding a second one. `nc.subscribe(fn)` calls `fn(entry, center)` once per entry added and answers the unsubscribe. `NotificationHistory` follows the centre through `subscribe()`, so every toast counts once on the bell, also one raised through the API (BUG-0034). It no longer watches the bus for toasts: its `notificationCenter` is a `NotificationCenter` (or anything with `history` and `subscribe`).

### Removed or renamed exports

None. Compared with 0.17.2, across every entry point (`core`, `widgets`, `wm`,
`host`, `canvas`, `flow`, `charts`, `tiles`, `editor`) and the package
`exports` map, no export was added, removed or renamed. Not an export but worth
knowing: `NotificationCenter` gained the `subscribe(fn)` method (see above).

## 0.17.2 (2026-10-22)

A patch release: everything below is additive. Every entry is documented in a
section of the docs headed "(0.17.2)"; each entry links to it.

### Added and changed

- [An open single instance takes new props: `navigate(props)`](docs/components/shell.md#an-open-single-instance-takes-new-props-navigateprops-0172): opening a `single` kind that is already open with new props reveals it and calls its content's `navigate(props)` hook once; the props are recorded on the tab. An open that names no props only reveals.
- [A link to a kind nobody registered](docs/components/shell.md#a-link-to-a-kind-nobody-registered-0172): `wm.navigate` to a kind that is not registered logs one warning, changes nothing and returns `false`.
- [A palette row drawn disabled, with a reason](docs/components/command-palette.md#a-palette-row-drawn-disabled-with-a-reason-0172): a command with `enabled: () => false` is listed greyed (`aria-disabled`), does nothing when picked, and shows its `disabledReason` as a tooltip.
- [A catalog source only behind its prefix: `scopedOnly`](docs/components/command-palette.md#a-catalog-source-only-behind-its-prefix-scopedonly-0172): a catalog source with `scopedOnly: true` is searched only when its prefix is typed, in the flat and the grouped palette.
- [The settings categories outside the page: `SettingsCategories`](docs/components/settings-view.md#the-settings-categories-outside-the-page-settingscategories-0172): `SettingsView` can leave out its own category list and filter, and `SettingsCategories` (new export from `@flexdesk/widgets`) shows them anywhere, kept in step with the view.
- [Toast cards are styled and clickable](docs/components/notifications.md#toast-cards-are-styled-and-clickable-0172): toast cards use `twm-notification` and `twm-notification--<severity>`, styled in flexdesk.css and base.css, with their entry animation defined there; cards take pointer events, so their buttons work (BUG-0033). A sheet that targeted `.notification` must target `.twm-notification`.

### Removed or renamed exports

None. Compared with 0.17.1, across every entry point (`core`, `widgets`, `wm`,
`host`, `canvas`, `flow`, `charts`, `tiles`, `editor`) and the package
`exports` map, exports were only added: `SettingsCategories` in `@flexdesk/widgets`.
Not an export but worth knowing: toast cards changed class from `notification`
to `twm-notification` (see above).

## 0.17.1 (2026-10-21)

A patch release: everything below is additive. Every entry is documented in a
section of the docs headed "(0.17.1)"; each entry links to it.

### Added and changed

- [Built-in cell editors](docs/components/data-table-grid.md#built-in-cell-editors-0171): an editable DataTable column opens the editor for its type (`text`, `multitext`, `number`, `bool`, `choice`, `datetime`), each with a parse that refuses what it cannot read; `editors` replaces one per type or per column, with `editTypes`, `locale` and `editorMessages`. The editors and their parsers (`CELL_EDITORS`, `createNumberEditor`, `parseNumber`, `parseDateTime` and the rest of `cell_editors.js`) are exported from `@flexdesk/widgets`.
- [Copying cells as tab-separated values](docs/components/data-table-grid.md#copying-cells-as-tab-separated-values-0171): in cell mode Ctrl+C copies the selected cell range as the tab-separated text Excel and Google Sheets paste into cells; `toTSV` and `tsvCell` (from `@flexdesk/widgets`) write it.
- [Pasting a block from Excel](docs/components/data-table-grid.md#pasting-a-block-from-excel-0171): `pasteable: true` beside `staged` pastes a tab-separated block at the cursor cell, each value read by its column's editor, staged as one undo entry, with column and row overrun handling; `fromTSV` (from `@flexdesk/widgets`) reads it.
- [Building a modeler](docs/components/flow-canvas-editor.md#building-a-modeler-0171): the canvas editor's modeler options shown working together, with `demo/flow_modeler.html` (linked from `demo/index.html`).
- [The `development` condition resolves in the installed package](docs/concepts/building-and-packaging.md#the-development-condition-resolves-in-the-installed-package-0171): the nine root entry barrels are in `files`, so the `exports` map's `development` targets ship (BUG-0032). An `import` still resolves to `dist/`.

### Removed or renamed exports

None. Compared with 0.17.0, across every entry point (`core`, `widgets`, `wm`,
`host`, `canvas`, `flow`, `charts`, `tiles`, `editor`) and the package
`exports` map, exports were only added.

## 0.17.0 (2026-10-21)

Every feature below is documented in a section of the docs headed "(0.17.0)"; each
entry links to it.

### Added and changed

- [A menu bar: `createMenuBar`](docs/components/menus.md#a-menu-bar-createmenubar-0170): File / Edit / View menus from one declarative model of items, separators, checks, radios and submenus.
- [A kind that exists once: `single`](docs/components/shell.md#a-kind-that-exists-once-single-0170): a taxonomy kind marked `single` is mounted once; opening it again goes to the open one.
- [Panels a page does not offer](docs/components/panels-and-desktops.md#panels-a-page-does-not-offer-0170): a kind declares the panels it offers (`panels: {bottom: false | {reason}}`), content overrides them with `wm.setPanelAvailability`, and withheld panels are left out of the layout.
- [Panels keep the size you dragged them to](docs/components/panels-and-desktops.md#panels-keep-the-size-you-dragged-them-to-0170): each desktop remembers every panel's share of the window and saves it with the layout as `panelShares`.
- [A navigation panel you drive yourself: `mountNavPanel`](docs/components/panels-and-desktops.md#a-navigation-panel-you-drive-yourself-mountnavpanel-0170): a mode strip, a shared filter and lazily mounted panes, switched from code with `select(modeId)`.
- [Buttons that change with the pane: `ctx.setChromeActions`](docs/components/shell.md#buttons-that-change-with-the-pane-ctxsetchromeactions-0170): a pane replaces its chrome buttons at any time, with labels, pressed and disabled states and separators.
- [Your keys, not the window manager's: `keymap`](docs/components/keymap.md#your-keys-not-the-window-managers-keymap-0170): every window-manager chord can be disabled or rebound; `?` is installed by the shell, not by importing `HelpModal`.
- [DataTable: columns in the order somebody puts them](docs/components/data-table.md#datatable-columns-in-the-order-somebody-puts-them-0170): columns reorder by dragging their headers or from code, and the order is persisted.
- [DataTable: a grid of cells you can edit](docs/components/data-table-grid.md#datatable-a-grid-of-cells-you-can-edit-0170): `selectionMode: 'cells'` with keyboard cell navigation, and `editable` cells with in-place editors.
- [Staged edits, undo and redo, one commit](docs/components/data-table-grid.md#staged-edits-undo-and-redo-one-commit-0170): `staged: true` keeps edits in the table, with Ctrl+Z / Ctrl+Y, until `commit()` hands them over in one call.
- [Fill handle](docs/components/data-table-grid.md#fill-handle-0170): `fillHandle: true` drags a range's values over neighbouring cells as a spreadsheet does, staged.
- [DataTable: column groups and structural edits](docs/components/data-table-grid.md#datatable-column-groups-and-structural-edits-0170): a grouped header row and callbacks to add, rename and delete columns and rows.
- [DataTable: a crosstab, with spanned header rows and pinned label columns](docs/components/data-table-grid.md#datatable-a-crosstab-with-spanned-header-rows-and-pinned-label-columns-0170): `crosstab` draws a matrix in one table and one scroller, with sticky header rows and label columns.
- [SliderField: a number box, a readout, a default and an enable toggle](docs/components/input-fields.md#sliderfield-a-number-box-a-readout-a-default-and-an-enable-toggle-0170): opt-in companions for the range input.
- [A stack of collapsible sections: `createSectionStack`](docs/components/layout-widgets.md#a-stack-of-collapsible-sections-createsectionstack-0170): inspector-style titled sections, each opened and closed from its header.
- [Node bodies](docs/components/flow-canvas-editor.md#node-bodies-0170): a catalogue type draws its own controls inside its canvas node (`render`, `update`, `size`, `accent`).
- [Edited on the node](docs/components/flow-canvas-editor.md#edited-on-the-node-0170): `inline` settings drawn and edited on the node, and `renameInPlace` for step titles.
- [Live values and folded steps](docs/components/flow-canvas-editor.md#live-values-and-folded-steps-0170): `setNodeValues` paints badges and port values in place; `collapsible` folds a step to its header. The canvas editor also gains `multiSelect`, `groups`, `notes`, `clipboard`, `zoomControls`, `minimap`, `layout: 'layered'` (with `layeredLayout` from `@flexdesk/canvas`) and viewport persistence, documented in the same chapter.
- [Options: typed, unavailable, grouped, and changed while open](docs/components/forms-and-dialogs.md#options-typed-unavailable-grouped-and-changed-while-open-0170): form select options keep their type, can be unavailable with a reason, grouped, and replaced while the form is open.
- [Colours: `type: 'color'` and `type: 'colorList'`](docs/components/forms-and-dialogs.md#colours-type-color-and-type-colorlist-0170): colour fields in forms (`ColorField`, `ColorListField`).
- [Number bounds and fields side by side: `min`, `max` and `{ row }`](docs/components/forms-and-dialogs.md#number-bounds-and-fields-side-by-side-min-max-and--row--0170): bounded number fields and form rows.
- [A switch: `ToggleField` and `type: 'toggle'`](docs/components/forms-and-dialogs.md#a-switch-togglefield-and-type-toggle-0170): an on/off switch, standalone or in a form.
- [A settings page: `SettingsView`](docs/components/settings-view.md#a-settings-page-settingsview-0170): a settings store's schema drawn as a page (`getSettingsStore()` from `@flexdesk/core` for the app-global binding).
- [A step wizard: `Wizard`](docs/components/wizard.md#a-step-wizard-wizard-0170): a multi-step flow, inline or in a modal window.
- [Confirms show text, not markup](docs/components/forms-and-dialogs.md#confirms-show-text-not-markup-0170): `openConfirm`'s message and labels, and the delete and close confirms' item names, are set as text.
- [Markdown: `renderMarkdown`](docs/components/markdown-and-outline.md#markdown-rendermarkdown-0170): a CommonMark-ish subset rendered to an HTML string, with a highlight hook.
- [A document outline: `createDocumentOutline`](docs/components/markdown-and-outline.md#a-document-outline-createdocumentoutline-0170): a numbered section list that marks the section in view and scrolls to one on click.
- [Action dropdowns: separators](docs/components/menus.md#action-dropdowns-separators-0170): `{ separator: true }` entries in `ActionDropdown` options.
- [A list of tags: `createTagInput`](docs/components/input-fields.md#a-list-of-tags-createtaginput-0170): removable chips followed by a text box.
- [Progress: bars, lists and phases](docs/components/notifications.md#progress-bars-lists-and-phases-0170): `ProgressBar`, `ProgressList` and `StepProgress`, updated in place.
- [Tabs: `createTabs`](docs/components/layout-widgets.md#tabs-createtabs-0170): one tab strip keyed by your own ids, with or without panes; `createBottomPanelTabs` is built on it.
- [Progress toasts](docs/components/notifications.md#progress-toasts-0170): a toast that tracks a job, with a progress bar, status and counts; the toast helpers emit on the mounted `NotificationCenter`'s bus (`setToastBus`, `getToastBus`).
- [A conversation: `mountConversationView`](docs/components/conversation.md#a-conversation-mountconversationview-0170): a transcript of role-tagged messages above a composer.
- [Opening a file: `pickFile`](docs/concepts/host-port.md#opening-a-file-pickfile-0170): one file picker over every host, from `@flexdesk/host`.
- [The state guard: who wrote that attribute](docs/concepts/state-guard.md#the-state-guard-who-wrote-that-attribute-0170): writes are attributed to the calling file, `moduleFramePattern` is configurable, and the defaults carry no application's override.
- [The defaults cover FlexDesk's own keys](docs/concepts/state-guard.md#the-defaults-cover-flexdesks-own-keys-0170): `DEFAULT_STATE_GUARD_CONFIG` allows every key FlexDesk writes, and camelCase and kebab-case entries are the same key.
- [Auto-height editors: `maxHeight`](docs/components/editor.md#auto-height-editors-maxheight-0170): `createEditor({ maxHeight })` and `setMaxHeight` replace the fixed 400px cap.
- [Storage keys and names are yours](docs/concepts/domain-neutrality.md#storage-keys-and-names-are-yours-0170): every storage key, theme name, drag MIME, export file name and log service name is configurable, with FlexDesk's own defaults.
- [Derived series: `seriesTransforms`](docs/components/charts.md#derived-series-seriestransforms-0170): plots draw derived series from transforms the embedder passes in.
- [No application globals: the gallery picker and plot-window events](docs/concepts/domain-neutrality.md#no-application-globals-the-gallery-picker-and-plot-window-events-0170): the gallery picker takes `entries` or a host `gallery` capability; `PlotPopoutWindow` listens only to the `streamEvents` it is given.
- [A plot config in any container: `renderPlotGrid`](docs/components/charts.md#a-plot-config-in-any-container-renderplotgrid-0170): the plot window's subplot renderer, exported for any container.
- [Editing a plot config: `renderPlotConfigEditor`](docs/components/charts.md#editing-a-plot-config-renderplotconfigeditor-0170): an in-place editor for a plot config.
- [Figure tiles: one override, the draw is the base's](docs/components/tiles.md#figure-tiles-one-override-the-draw-is-the-bases-0170): `FigureTile` is the base of every Plotly tile; a subclass overrides `figure(data)`.
- [A tile's settings as a form: `mountTileConfigForm`](docs/components/tiles.md#a-tiles-settings-as-a-form-mounttileconfigform-0170): a tile's `getConfigSchema()` drawn as a form, or opened with `openTileConfig`.

The package also gains the `flexdesk/css/reset` export (`dist/reset.css`).

### Removed or renamed exports

Compared with 0.16.1, across every entry point (`core`, `widgets`, `wm`, `host`,
`canvas`, `flow`, `charts`, `tiles`, `editor`) and the package `exports` map:

| Removed from | Name | Replacement |
|---|---|---|
| `@flexdesk/widgets` | `PanelStateMachine` | None as a class. Which panels a page offers is declared on its kind (`panels` in `createTaxonomy`) and changed at runtime with `wm.setPanelAvailability`; read it with `wm.isPanelAvailable(side)` / `wm.getPanelAvailability()`, hear changes with `wm.onPanelAvailabilityChange(fn)` or the `wm:panels:availability` bus event, and open or close with `wm.togglePanel(side)`, which answers `false` while a panel is withheld. See [Panels a page does not offer](docs/components/panels-and-desktops.md#panels-a-page-does-not-offer-0170). |
| `@flexdesk/widgets` | `PANEL_STATES` | As for `PanelStateMachine`: a panel's state is the desktop's `panels` (open or not) plus its availability. |
| `@flexdesk/widgets` | `PANEL_TRANSITIONS` | As for `PanelStateMachine`: `togglePanel` and `setPanelAvailability` are the only transitions. |

No export was renamed, and no `exports` specifier was removed.

### Other removed or renamed names

Not exports, but names an embedder may depend on:

| What | 0.16.1 | 0.17.0 |
|---|---|---|
| `PlotPopoutWindow` chart cells | `div.plot-tile-chart` | `div.twm-plot-grid__cell` inside a `.twm-plot-grid` ([renderPlotGrid](docs/components/charts.md#a-plot-config-in-any-container-renderplotgrid-0170)) |
| `PlotPopoutWindow` default `streamEvents` | `'streaming:delta'` / `'streaming:complete'` | No defaults: pass `streamEvents: { delta, complete }` ([No application globals](docs/concepts/domain-neutrality.md#no-application-globals-the-gallery-picker-and-plot-window-events-0170)) |
| Plot subplot keys | `showHpTrend`, `showHpCycle`, `hpLambda` (ignored now) | `subplot.transforms` with the `seriesTransforms` option ([Derived series](docs/components/charts.md#derived-series-seriestransforms-0170)) |
| Toast helpers' bus | a window global | the mounted `NotificationCenter`'s bus, or `setToastBus(bus)` |
| Gallery picker entries | a pywebview bridge method | `entries`, or the host's `gallery.list(kind)` capability |
| State guard defaults | one application's module override and debug global | `mode: 'warn'`, no overrides; configure `moduleOverrides` / `allow()` and `mode` yourself |
| Settings storage key | `'ecosim.settings.v1'` | `'flexdesk.settings.v1'`; `configureSettings({ storageKey })` |
| ManagedWindow geometry key | `'ecosim.managedWindows.v1'` | `'flexdesk.managedWindows.v1'`; `ManagedWindow.configure({ storageKey })` |
| Built-in Monaco themes | `'ecosim-dark'`, `'ecosim-light'` | `'flexdesk-dark'`, `'flexdesk-light'`; `setEditorThemeNames`, `getEditorThemeNames()` |
| Editor tab drag MIME | `'application/x-ecosim-tab'` | `'application/x-flexdesk-tab'`; `setTabDragMime`, `getTabDragMime()` |
| Chart PNG export file name | `'ecosim_chart'` | `'chart'`; `setChartExportFilename` |
| `LoggingService` service name | `'ecosim'` | `'flexdesk'`; `new LoggingService({ name })` |
| Editor height cap | `data-code-max-height="true"` on a `.notebook-editor-container` ancestor (400px) | `createEditor(el, src, { maxHeight })`, `setMaxHeight(px)` ([Auto-height editors](docs/components/editor.md#auto-height-editors-maxheight-0170)) |
| `?` help shortcut | installed when `HelpModal` was imported | installed by the shell; without one call `installHelpShortcut()` from `@flexdesk/widgets` |
| `createDetailHeader` classes | `detail-header__badge`, `detail-header__btn--<variant>` | `twm-detail-header__badge`, `twm-detail-header__btn--<variant>` (plus `twm-btn`, `twm-btn--primary` / `--danger`) |
| `openConfirm` message and labels | HTML | text; write `\n` for a line break, use `openModal` for markup |
| `installCollapsibleScrollbars()` scope | the `#twm-fixed-200` element | `installCollapsibleScrollbars(root = document.body)` |
| Flow kit CSS | `.twm-flow-field__kept` (unused) | removed |
