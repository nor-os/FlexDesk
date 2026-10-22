# Changelog

## 0.17.2 (2026-10-22)

A patch release: everything below is additive. Every entry is documented in a
README section headed "(0.17.2)"; each entry links to it.

### Added and changed

- [An open single instance takes new props: `navigate(props)`](README.md#an-open-single-instance-takes-new-props-navigateprops-0172): opening a `single` kind that is already open with new props reveals it and calls its content's `navigate(props)` hook once; the props are recorded on the tab. An open that names no props only reveals.
- [A link to a kind nobody registered](README.md#a-link-to-a-kind-nobody-registered-0172): `wm.navigate` to a kind that is not registered logs one warning, changes nothing and returns `false`.
- [A palette row drawn disabled, with a reason](README.md#a-palette-row-drawn-disabled-with-a-reason-0172): a command with `enabled: () => false` is listed greyed (`aria-disabled`), does nothing when picked, and shows its `disabledReason` as a tooltip.
- [A catalog source only behind its prefix: `scopedOnly`](README.md#a-catalog-source-only-behind-its-prefix-scopedonly-0172): a catalog source with `scopedOnly: true` is searched only when its prefix is typed, in the flat and the grouped palette.
- [The settings categories outside the page: `SettingsCategories`](README.md#the-settings-categories-outside-the-page-settingscategories-0172): `SettingsView` can leave out its own category list and filter, and `SettingsCategories` (new export from `@flexdesk/widgets`) shows them anywhere, kept in step with the view.
- [Toast cards are styled and clickable](README.md#toast-cards-are-styled-and-clickable-0172): toast cards use `twm-notification` and `twm-notification--<severity>`, styled in flexdesk.css and base.css, with their entry animation defined there; cards take pointer events, so their buttons work (BUG-0033). A sheet that targeted `.notification` must target `.twm-notification`.

### Removed or renamed exports

None. Compared with 0.17.1, across every entry point (`core`, `widgets`, `wm`,
`host`, `canvas`, `flow`, `charts`, `tiles`, `editor`) and the package
`exports` map, exports were only added: `SettingsCategories` in `@flexdesk/widgets`.
Not an export but worth knowing: toast cards changed class from `notification`
to `twm-notification` (see above).

## 0.17.1 (2026-10-21)

A patch release: everything below is additive. Every entry is documented in a
README section headed "(0.17.1)"; each entry links to it.

### Added and changed

- [Built-in cell editors](README.md#built-in-cell-editors-0171): an editable DataTable column opens the editor for its type (`text`, `multitext`, `number`, `bool`, `choice`, `datetime`), each with a parse that refuses what it cannot read; `editors` replaces one per type or per column, with `editTypes`, `locale` and `editorMessages`. The editors and their parsers (`CELL_EDITORS`, `createNumberEditor`, `parseNumber`, `parseDateTime` and the rest of `cell_editors.js`) are exported from `@flexdesk/widgets`.
- [Copying cells as tab-separated values](README.md#copying-cells-as-tab-separated-values-0171): in cell mode Ctrl+C copies the selected cell range as the tab-separated text Excel and Google Sheets paste into cells; `toTSV` and `tsvCell` (from `@flexdesk/widgets`) write it.
- [Pasting a block from Excel](README.md#pasting-a-block-from-excel-0171): `pasteable: true` beside `staged` pastes a tab-separated block at the cursor cell, each value read by its column's editor, staged as one undo entry, with column and row overrun handling; `fromTSV` (from `@flexdesk/widgets`) reads it.
- [Building a modeler](README.md#building-a-modeler-0171): the canvas editor's modeler options shown working together, with `demo/flow_modeler.html` (linked from `demo/index.html`).
- [The `development` condition resolves in the installed package](README.md#the-development-condition-resolves-in-the-installed-package-0171): the nine root entry barrels are in `files`, so the `exports` map's `development` targets ship (BUG-0032). An `import` still resolves to `dist/`.

### Removed or renamed exports

None. Compared with 0.17.0, across every entry point (`core`, `widgets`, `wm`,
`host`, `canvas`, `flow`, `charts`, `tiles`, `editor`) and the package
`exports` map, exports were only added.

## 0.17.0 (2026-10-21)

Every feature below is documented in a README section headed "(0.17.0)"; each
entry links to it.

### Added and changed

- [A menu bar: `createMenuBar`](README.md#a-menu-bar-createmenubar-0170): File / Edit / View menus from one declarative model of items, separators, checks, radios and submenus.
- [A kind that exists once: `single`](README.md#a-kind-that-exists-once-single-0170): a taxonomy kind marked `single` is mounted once; opening it again goes to the open one.
- [Panels a page does not offer](README.md#panels-a-page-does-not-offer-0170): a kind declares the panels it offers (`panels: {bottom: false | {reason}}`), content overrides them with `wm.setPanelAvailability`, and withheld panels are left out of the layout.
- [Panels keep the size you dragged them to](README.md#panels-keep-the-size-you-dragged-them-to-0170): each desktop remembers every panel's share of the window and saves it with the layout as `panelShares`.
- [A navigation panel you drive yourself: `mountNavPanel`](README.md#a-navigation-panel-you-drive-yourself-mountnavpanel-0170): a mode strip, a shared filter and lazily mounted panes, switched from code with `select(modeId)`.
- [Buttons that change with the pane: `ctx.setChromeActions`](README.md#buttons-that-change-with-the-pane-ctxsetchromeactions-0170): a pane replaces its chrome buttons at any time, with labels, pressed and disabled states and separators.
- [Your keys, not the window manager's: `keymap`](README.md#your-keys-not-the-window-managers-keymap-0170): every window-manager chord can be disabled or rebound; `?` is installed by the shell, not by importing `HelpModal`.
- [DataTable: columns in the order somebody puts them](README.md#datatable-columns-in-the-order-somebody-puts-them-0170): columns reorder by dragging their headers or from code, and the order is persisted.
- [DataTable: a grid of cells you can edit](README.md#datatable-a-grid-of-cells-you-can-edit-0170): `selectionMode: 'cells'` with keyboard cell navigation, and `editable` cells with in-place editors.
- [Staged edits, undo and redo, one commit](README.md#staged-edits-undo-and-redo-one-commit-0170): `staged: true` keeps edits in the table, with Ctrl+Z / Ctrl+Y, until `commit()` hands them over in one call.
- [Fill handle](README.md#fill-handle-0170): `fillHandle: true` drags a range's values over neighbouring cells as a spreadsheet does, staged.
- [DataTable: column groups and structural edits](README.md#datatable-column-groups-and-structural-edits-0170): a grouped header row and callbacks to add, rename and delete columns and rows.
- [DataTable: a crosstab, with spanned header rows and pinned label columns](README.md#datatable-a-crosstab-with-spanned-header-rows-and-pinned-label-columns-0170): `crosstab` draws a matrix in one table and one scroller, with sticky header rows and label columns.
- [SliderField: a number box, a readout, a default and an enable toggle](README.md#sliderfield-a-number-box-a-readout-a-default-and-an-enable-toggle-0170): opt-in companions for the range input.
- [A stack of collapsible sections: `createSectionStack`](README.md#a-stack-of-collapsible-sections-createsectionstack-0170): inspector-style titled sections, each opened and closed from its header.
- [Node bodies](README.md#node-bodies-0170): a catalogue type draws its own controls inside its canvas node (`render`, `update`, `size`, `accent`).
- [Edited on the node](README.md#edited-on-the-node-0170): `inline` settings drawn and edited on the node, and `renameInPlace` for step titles.
- [Live values and folded steps](README.md#live-values-and-folded-steps-0170): `setNodeValues` paints badges and port values in place; `collapsible` folds a step to its header. The canvas editor also gains `multiSelect`, `groups`, `notes`, `clipboard`, `zoomControls`, `minimap`, `layout: 'layered'` (with `layeredLayout` from `@flexdesk/canvas`) and viewport persistence, documented in the same chapter.
- [Options: typed, unavailable, grouped, and changed while open](README.md#options-typed-unavailable-grouped-and-changed-while-open-0170): form select options keep their type, can be unavailable with a reason, grouped, and replaced while the form is open.
- [Colours: `type: 'color'` and `type: 'colorList'`](README.md#colours-type-color-and-type-colorlist-0170): colour fields in forms (`ColorField`, `ColorListField`).
- [Number bounds and fields side by side: `min`, `max` and `{ row }`](README.md#number-bounds-and-fields-side-by-side-min-max-and--row--0170): bounded number fields and form rows.
- [A switch: `ToggleField` and `type: 'toggle'`](README.md#a-switch-togglefield-and-type-toggle-0170): an on/off switch, standalone or in a form.
- [A settings page: `SettingsView`](README.md#a-settings-page-settingsview-0170): a settings store's schema drawn as a page (`getSettingsStore()` from `@flexdesk/core` for the app-global binding).
- [A step wizard: `Wizard`](README.md#a-step-wizard-wizard-0170): a multi-step flow, inline or in a modal window.
- [Confirms show text, not markup](README.md#confirms-show-text-not-markup-0170): `openConfirm`'s message and labels, and the delete and close confirms' item names, are set as text.
- [Markdown: `renderMarkdown`](README.md#markdown-rendermarkdown-0170): a CommonMark-ish subset rendered to an HTML string, with a highlight hook.
- [A document outline: `createDocumentOutline`](README.md#a-document-outline-createdocumentoutline-0170): a numbered section list that marks the section in view and scrolls to one on click.
- [Action dropdowns: separators](README.md#action-dropdowns-separators-0170): `{ separator: true }` entries in `ActionDropdown` options.
- [A list of tags: `createTagInput`](README.md#a-list-of-tags-createtaginput-0170): removable chips followed by a text box.
- [Progress: bars, lists and phases](README.md#progress-bars-lists-and-phases-0170): `ProgressBar`, `ProgressList` and `StepProgress`, updated in place.
- [Tabs: `createTabs`](README.md#tabs-createtabs-0170): one tab strip keyed by your own ids, with or without panes; `createBottomPanelTabs` is built on it.
- [Progress toasts](README.md#progress-toasts-0170): a toast that tracks a job, with a progress bar, status and counts; the toast helpers emit on the mounted `NotificationCenter`'s bus (`setToastBus`, `getToastBus`).
- [A conversation: `mountConversationView`](README.md#a-conversation-mountconversationview-0170): a transcript of role-tagged messages above a composer.
- [Opening a file: `pickFile`](README.md#opening-a-file-pickfile-0170): one file picker over every host, from `@flexdesk/host`.
- [The state guard: who wrote that attribute](README.md#the-state-guard-who-wrote-that-attribute-0170): writes are attributed to the calling file, `moduleFramePattern` is configurable, and the defaults carry no application's override.
- [The defaults cover FlexDesk's own keys](README.md#the-defaults-cover-flexdesks-own-keys-0170): `DEFAULT_STATE_GUARD_CONFIG` allows every key FlexDesk writes, and camelCase and kebab-case entries are the same key.
- [Auto-height editors: `maxHeight`](README.md#auto-height-editors-maxheight-0170): `createEditor({ maxHeight })` and `setMaxHeight` replace the fixed 400px cap.
- [Storage keys and names are yours](README.md#storage-keys-and-names-are-yours-0170): every storage key, theme name, drag MIME, export file name and log service name is configurable, with FlexDesk's own defaults.
- [Derived series: `seriesTransforms`](README.md#derived-series-seriestransforms-0170): plots draw derived series from transforms the embedder passes in.
- [No application globals: the gallery picker and plot-window events](README.md#no-application-globals-the-gallery-picker-and-plot-window-events-0170): the gallery picker takes `entries` or a host `gallery` capability; `PlotPopoutWindow` listens only to the `streamEvents` it is given.
- [A plot config in any container: `renderPlotGrid`](README.md#a-plot-config-in-any-container-renderplotgrid-0170): the plot window's subplot renderer, exported for any container.
- [Editing a plot config: `renderPlotConfigEditor`](README.md#editing-a-plot-config-renderplotconfigeditor-0170): an in-place editor for a plot config.
- [Figure tiles: one override, the draw is the base's](README.md#figure-tiles-one-override-the-draw-is-the-bases-0170): `FigureTile` is the base of every Plotly tile; a subclass overrides `figure(data)`.
- [A tile's settings as a form: `mountTileConfigForm`](README.md#a-tiles-settings-as-a-form-mounttileconfigform-0170): a tile's `getConfigSchema()` drawn as a form, or opened with `openTileConfig`.

The package also gains the `flexdesk/css/reset` export (`dist/reset.css`).

### Removed or renamed exports

Compared with 0.16.1, across every entry point (`core`, `widgets`, `wm`, `host`,
`canvas`, `flow`, `charts`, `tiles`, `editor`) and the package `exports` map:

| Removed from | Name | Replacement |
|---|---|---|
| `@flexdesk/widgets` | `PanelStateMachine` | None as a class. Which panels a page offers is declared on its kind (`panels` in `createTaxonomy`) and changed at runtime with `wm.setPanelAvailability`; read it with `wm.isPanelAvailable(side)` / `wm.getPanelAvailability()`, hear changes with `wm.onPanelAvailabilityChange(fn)` or the `wm:panels:availability` bus event, and open or close with `wm.togglePanel(side)`, which answers `false` while a panel is withheld. See [Panels a page does not offer](README.md#panels-a-page-does-not-offer-0170). |
| `@flexdesk/widgets` | `PANEL_STATES` | As for `PanelStateMachine`: a panel's state is the desktop's `panels` (open or not) plus its availability. |
| `@flexdesk/widgets` | `PANEL_TRANSITIONS` | As for `PanelStateMachine`: `togglePanel` and `setPanelAvailability` are the only transitions. |

No export was renamed, and no `exports` specifier was removed.

### Other removed or renamed names

Not exports, but names an embedder may depend on:

| What | 0.16.1 | 0.17.0 |
|---|---|---|
| `PlotPopoutWindow` chart cells | `div.plot-tile-chart` | `div.twm-plot-grid__cell` inside a `.twm-plot-grid` ([renderPlotGrid](README.md#a-plot-config-in-any-container-renderplotgrid-0170)) |
| `PlotPopoutWindow` default `streamEvents` | `'streaming:delta'` / `'streaming:complete'` | No defaults: pass `streamEvents: { delta, complete }` ([No application globals](README.md#no-application-globals-the-gallery-picker-and-plot-window-events-0170)) |
| Plot subplot keys | `showHpTrend`, `showHpCycle`, `hpLambda` (ignored now) | `subplot.transforms` with the `seriesTransforms` option ([Derived series](README.md#derived-series-seriestransforms-0170)) |
| Toast helpers' bus | a window global | the mounted `NotificationCenter`'s bus, or `setToastBus(bus)` |
| Gallery picker entries | a pywebview bridge method | `entries`, or the host's `gallery.list(kind)` capability |
| State guard defaults | one application's module override and debug global | `mode: 'warn'`, no overrides; configure `moduleOverrides` / `allow()` and `mode` yourself |
| Settings storage key | `'ecosim.settings.v1'` | `'flexdesk.settings.v1'`; `configureSettings({ storageKey })` |
| ManagedWindow geometry key | `'ecosim.managedWindows.v1'` | `'flexdesk.managedWindows.v1'`; `ManagedWindow.configure({ storageKey })` |
| Built-in Monaco themes | `'ecosim-dark'`, `'ecosim-light'` | `'flexdesk-dark'`, `'flexdesk-light'`; `setEditorThemeNames`, `getEditorThemeNames()` |
| Editor tab drag MIME | `'application/x-ecosim-tab'` | `'application/x-flexdesk-tab'`; `setTabDragMime`, `getTabDragMime()` |
| Chart PNG export file name | `'ecosim_chart'` | `'chart'`; `setChartExportFilename` |
| `LoggingService` service name | `'ecosim'` | `'flexdesk'`; `new LoggingService({ name })` |
| Editor height cap | `data-code-max-height="true"` on a `.notebook-editor-container` ancestor (400px) | `createEditor(el, src, { maxHeight })`, `setMaxHeight(px)` ([Auto-height editors](README.md#auto-height-editors-maxheight-0170)) |
| `?` help shortcut | installed when `HelpModal` was imported | installed by the shell; without one call `installHelpShortcut()` from `@flexdesk/widgets` |
| `createDetailHeader` classes | `detail-header__badge`, `detail-header__btn--<variant>` | `twm-detail-header__badge`, `twm-detail-header__btn--<variant>` (plus `twm-btn`, `twm-btn--primary` / `--danger`) |
| `openConfirm` message and labels | HTML | text; write `\n` for a line break, use `openModal` for markup |
| `installCollapsibleScrollbars()` scope | the `#twm-fixed-200` element | `installCollapsibleScrollbars(root = document.body)` |
| Flow kit CSS | `.twm-flow-field__kept` (unused) | removed |
