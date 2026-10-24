# Dashboard tiles

> **Package:** `@flexdesk/tiles` · [All docs](../README.md)

A draggable, resizable widget grid: the tile base class, the grid, a widget registry, layout persistence, chart and KPI tiles, list and people tiles, the figure tile every Plotly tile draws through, and a form for a tile's settings.

Two different things in FlexDesk are called "tiles". `@flexdesk/wm` tiles the *window* (see [Shell and navigation](shell.md)); `@flexdesk/tiles` is this dashboard *widget grid*.

**On this page**

- [Layouts are keyed by whatever you key them by](#layouts-are-keyed-by-whatever-you-key-them-by)
- [Chart and KPI tiles (0.13.0)](#chart-and-kpi-tiles-0130)
- [Figure tiles: one override, the draw is the base's (0.17.0)](#figure-tiles-one-override-the-draw-is-the-bases-0170)
- [List and people tiles, and one scope for the board (0.16.1)](#list-and-people-tiles-and-one-scope-for-the-board-0161)
- [A tile's settings as a form: `mountTileConfigForm` (0.17.0)](#a-tiles-settings-as-a-form-mounttileconfigform-0170)
- [The ⋯ menu is drawn over the page (0.17.9)](#the--menu-is-drawn-over-the-page-0179)

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

## Chart and KPI tiles (0.13.0)

`@flexdesk/tiles` ships two widgets: `flexdesk.chart` (line, bar, area, scatter,
pie, donut, funnel, histogram — Plotly, so `setPlotlySource` first) and
`flexdesk.kpi` (one number, a label and an optional delta; plain DOM, no Plotly).
Nothing registers at import — call `registerChartTiles()` (idempotent). You hand
a tile **already-computed** series; turning records into series is yours:

```js
import { registerChartTiles } from '@flexdesk/tiles';
registerChartTiles();
const chart = grid.addTile('flexdesk.chart', { x: 0, y: 0, w: 6, h: 4 },
                           { chart_type: 'line', title: 'Burndown', unit: 'pts' });
chart.onPointClick = ({ customdata }) => openItem(customdata);
chart.setData({
    series: [
        { x: days, y: remaining, name: 'Remaining', interpolation: 'step', customdata: ids },
        { x: days, y: ideal, name: 'Ideal', lineStyle: 'dashed' },
    ],
    markers: [{ x: today, label: 'Today' }],   // vertical lines
    note: 'From 41 stories',                    // a line under the figure
});
grid.addTile('flexdesk.kpi', { x: 6, y: 0, w: 3, h: 2 }, { title: 'Open', unit: 'bugs' })
    .setData({ value: 42, reference: 37 });     // ▲ +5 bugs
```

`setData(null)` or an empty series is the empty state, and it releases any figure
still drawing. A pie takes `{labels, values}`, a histogram `{values}`. The config
(`chart_type`, `title`, `unit`, …) round-trips through `getLayout()`/`setLayout()`.
`buildOverlayShapes` gained `verticalLines: [{x, label?, color?, lineStyle?}]` for
the same marker outside a tile.

A chart tile's **Download PNG** (0.14.1) goes through the grid's `host`
(`new TileGrid({ host })`): with `dialogs`, the native Save dialog — a save
toasts where the file went, a cancel says nothing — and with no host, or a
`saveFile` that answers null, the browser download it always was.

## Figure tiles: one override, the draw is the base's (0.17.0)

`FigureTile` is the base every Plotly tile draws through — `ChartTile` is one.
A subclass overrides **one** method, `figure(data)`, answering
`{traces, layout?, config?, frames?}` or `null`, synchronously:

```js
import { FigureTile, registerWidget } from '@flexdesk/tiles';
import { buildHistogramTrace } from '@flexdesk/charts';

class SpreadTile extends FigureTile {
    static TYPE = 'myapp.spread';
    static TITLE = 'Spread';
    figure(data) {
        if (!data?.values?.length) return null;          // the empty state
        return { traces: [buildHistogramTrace({ x: data.values })], layout: { margin: { t: 8 } } };
    }
}
registerWidget(SpreadTile);
```

The base awaits `ensurePlotly()` (so a page using `setPlotlySource` draws on
first view, and data that changes while Plotly loads draws once), draws through
`createChart` with `scrollZoom` and the mode bar off (`config` goes over that),
adds `frames`, and discards a draw that lands after a newer one. `null` is the
empty state with `static EMPTY_MESSAGE` — call `this.showEmpty(why)` yourself
first to say why. A `figure()` that throws, or a draw that fails, is the error
state plus `tile:render-failed {tileId, message}`. Loading, empty, error and
`dispose()` purge the figure; a resize that settles relayouts it once. The ⋯
menu is `TileBase`'s entries plus **Download PNG** (through `host.dialogs`, as
above); extend it with `[...super.menuItems(), …]` and route your actions
through `_onMenuAction`, calling `super` for the rest. **Expand** opens
`openRawTracesWindow` with the last figure drawn (`getExpandData()`), and
`onPointClick({customdata, point, tile})` — an option or a property — hears a
click on a mark. `setData(data)` feeds one tile; `null` clears it.

`ChartTile` is now a `FigureTile`: its menu stays Download PNG alone, and its
header gains the Expand button.

## List and people tiles, and one scope for the board (0.16.1)

Two more widgets, registered by `registerListTiles()` (idempotent, nothing at
import). Like the chart tile they take **rows you have already worked out**;
what they own is what every list on a board needs: the count ("7 of 12"), the
line that says what empty means, a button in the bar, a click, the keyboard and
a right-click menu per row.

```js
import { registerListTiles, createScopePicker } from '@flexdesk/tiles';
registerListTiles();
const late = grid.addTile('flexdesk.list', { x: 0, y: 0, w: 12, h: 4 },
                          { title: 'Overdue', empty_text: 'Nothing is late.', max_rows: 0 });
late.onRowActivate = ({ row, event }) => open(row.key, { modified: event.ctrlKey });
late.rowMenu = ({ row }) => [{ label: 'Open', icon: 'open_in_new', action: 'open' }];
late.onRowMenuAction = ({ action, row }) => { /* … */ };
late.onAction = () => openAsList();
late.setData({
    rows: [{ key: '7', icon: 'task', lead: 'TASK-0007', title: 'Sign-off',
             cells: [{ text: 'priya' }, { text: '9 days late', tone: 'danger' }] }],
    action: { label: 'Open as a list', icon: 'list' },
});
grid.addTile('flexdesk.people', { x: 0, y: 4, w: 6, h: 4 }, { title: 'Who has what' })
    .setData({ people: [{ key: '', name: 'Nobody', muted: true, count: 2,
                          pills: [{ text: '2 undated', tone: 'muted' }] }] });
```

- A row is `role="button"`: click, Enter and Space call `onRowActivate` with the
  event; Up/Down/Home/End move. Right-click, the context-menu key and Shift+F10
  open the row's menu (`showContextMenu`'s items; none means no menu). A row
  carries `data-row-key`; `rowsDraggable` makes rows draggable.
- `{rows: []}` keeps the bar and says `empty` (or `config.empty_text`) where the
  rows would be; `setData(null)` is the empty state. Text is always text.
- `tone` (`danger`, `warning`, `ok`, `muted`) picks a colour only; `className`
  on a row or a cell is yours, added as it is.
- `groupByPerson(items, personOf)` groups for a people tile, most first.

**One scope for the whole board.** `createScopePicker({options, value, onChange})`
is a row of buttons, one pressed. `grid.setScope(value)` (or
`new TileGrid({ scope, onScopeChange })`) hands the value to every tile as
`tile.scope` and `tile.onScopeChange(scope)`, a tile added later starts with
it, a grid with a data source reloads its tiles, and the grid's `onScopeChange`
is told. What a scope means is yours; it is not part of the layout.

## A tile's settings as a form: `mountTileConfigForm` (0.17.0)

`getConfigSchema()` answers `{fields}`; `mountTileConfigForm` draws them, so a
config panel is no longer a control written by hand per field:

```js
import { mountTileConfigForm, openTileConfig } from '@flexdesk/tiles';
const form = mountTileConfigForm(host, {
    schema: tile.getConfigSchema(),
    config: tile.config,                       // defaults filled by mergeWithDefaults
    data,                                      // what getFieldOptions reads for dynamic options
    onChange: (key, value, config) => tile.update(undefined, config),
    renderers: { variable: ({ field, value, data, readonly, commit }) => myPicker(...) },
});
form.getValues(); form.setValues(next); form.isValid(); form.focusFirstInvalid();
form.flush(); form.dispose();
```

- A field is `{key, type, label?, description?, default?, required?, readonly?,
  min?, max?, step?, options?, visibleWhen?}`. Without a `label` the field is
  called by its `key`, on its label and in its error messages. Every `FieldTypes` entry has a
  control (text, number, checkbox, select, multiselect, color, range); any other
  `type` needs a renderer, which answers an element or
  `{element, setValue?, dispose?}` and calls `commit(value)` on an edit.
- An edit is checked by `validateField`. An invalid one shows its error under the
  field and is **not applied**; a valid one calls `onChange` with the field's key.
  `isValid()` is false while a shown row has an error; `focusFirstInvalid()`
  focuses the first such row's control (a renderer's element, or the first
  focusable element inside it) and answers whether there was one.
- `commitOn: 'input'` (the default) checks text, number, range and colour
  controls on every keystroke; `commitOn: 'change'` checks them once the edit is
  finished (blur, Enter, a released slider), for an `onChange` that is expensive.
  `flush()` commits an edit typed but not yet finished.
- `visibleWhen: {field, in: [...]}` (or `{field, equals}`) hides the row, never
  rebuilds the form, so the control being typed into keeps its focus.
- A field with no `key` throws. **The built-in tiles' schemas now use `key` and
  `description`** (they said `name` and `help`, which `validateConfig` and
  `mergeWithDefaults` never read: BUG-0021). A consumer that read `field.name`
  or `field.help` from them reads `field.key` and `field.description`.

The grid's cogwheel emits `grid:config-modal-show`, which now also carries the
grid's `data`. Nothing listens unless you ask:
`openTileConfig(eventBus, {mode: 'slide-out', host})` shows the form in a
`SlideOutPanel` over `host` and saves every finished, valid edit (it runs the
form with `commitOn: 'change'`, so typing a title is one save, not one per
keystroke; closing the panel saves an edit still being typed);
`{mode: 'modal'}` (the default) saves on Save, and refuses Save while a field
shows an error (the modal stays open and the first invalid field is focused). A request that arrives while a
modal is open is ignored. It answers a function that unsubscribes and closes the
slide-out; an open modal is left to the user, keeps its form and still saves on
Save. A renderer's `commit` on a `readonly` field applies nothing and answers
`{valid: false, error}`.

## The ⋯ menu is drawn over the page (0.17.9)

A tile's **More actions** menu (`.tile-menu-dropdown`, the entries of
`menuItems()`) is no longer drawn inside the tile. While it is open it is
moved to `document.body` (or to the open modal's host, as `showContextMenu`
does) and placed with `ActionDropdown.position(button, menu, { align: 'end' })`:

- **Nothing clips it.** It is `position: fixed`, on `--z-over-windows`, so it
  draws over neighbouring tiles, and over the managed window a grid sits in.
- **It stays in the window.** Its right edge lines up with the ⋯ button's
  when there is room; otherwise its left edge does, clamped 8px inside the
  window. It opens under the button, or above it when there is more room
  there, and scrolls when it is taller than either.
- **It goes back when it closes.** Choosing an entry, a press outside it, or
  the ⋯ button again closes it and puts it back in the tile's header, so
  `tile.element.querySelector('.tile-menu-item')` finds the entries while it
  is closed. `dispose()` closes an open menu first, so none is left on the
  page.

Until 0.17.8 the menu was `position: absolute` inside the tile, so in a tile
narrower than about 220px its left part and its labels were cut off
(BUG-0043). `tests/tile_menu_unclipped.test.mjs` holds it.

