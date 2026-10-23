# Domain neutrality: your names, keys and globals

> **Packages:** `@flexdesk/core`, `@flexdesk/widgets`, `@flexdesk/editor`, `@flexdesk/charts`, `@flexdesk/tiles` · [All docs](../README.md)

FlexDesk was extracted from [EcoAgent](https://github.com/nor-os/EcoAgent), a macroeconomic simulation platform, and it knows nothing about economics: no application vocabulary, and no import of anything application-specific, in any shipped file. For you that means everything with a name is yours to choose. Storage keys, theme names, drag MIME types and export file names are options with generic defaults, and nothing reads an application's globals. The two sections here list what you can set and where.

## Storage keys and names are yours (0.17.0)

Every localStorage key FlexDesk writes is an option, and so is each name in the
table below that it registers where other code can see it, except the last row:
the tile tab MIME is fixed. The defaults are FlexDesk's own; pass yours at boot,
before the first read:

| What | Default | Set it with |
|---|---|---|
| Settings (the `getSetting`/`setSetting` binding) | `'flexdesk.settings.v1'` | `configureSettings({ storageKey })` from `@flexdesk/core` |
| ManagedWindow geometry | `'flexdesk.managedWindows.v1'` | `ManagedWindow.configure({ storageKey })` from `@flexdesk/widgets` |
| Saved tile layouts | `'twm.tiles.layouts'` | `configureLayoutPersistence({ layoutsKey })` from `@flexdesk/tiles` |
| Saved tile configurations | `'twm.tiles.configs'` | `configureLayoutPersistence({ configsKey })` from `@flexdesk/tiles` |
| Built-in Monaco themes | `'flexdesk-dark'`, `'flexdesk-light'` | `setEditorThemeNames({ dark, light })` from `@flexdesk/editor` |
| MIME type of a dragged editor tab | `'application/x-flexdesk-tab'` | `setTabDragMime(mime)` from `@flexdesk/editor` |
| Chart PNG export file name | `'chart'` (saved as `chart.png`) | `setChartExportFilename(name)` from `@flexdesk/charts` |
| `LoggingService` service name on each entry | `'flexdesk'` | `new LoggingService({ name })` from `@flexdesk/core` |
| MIME type of a dragged tile tab | `'application/x-twm-tile-tab'` | fixed: not an option; read it as `TILE_TAB_MIME` (or `TileRenderer.TAB_MIME`) from `@flexdesk/wm` |

```js
import { configureSettings } from '@flexdesk/core';
import { ManagedWindow } from '@flexdesk/widgets';
import { setEditorThemeNames, setTabDragMime } from '@flexdesk/editor';
import { setChartExportFilename } from '@flexdesk/charts';

configureSettings({ storageKey: 'myapp.settings.v1' });
ManagedWindow.configure({ storageKey: 'myapp.windows.v1' });
setEditorThemeNames({ dark: 'myapp-dark', light: 'myapp-light' });
setTabDragMime('application/x-myapp-tab');
setChartExportFilename('myapp_chart');
```

Each default is exported beside its setter (`DEFAULT_SETTINGS_STORAGE_KEY`,
`DEFAULT_WINDOW_STORAGE_KEY`, `DEFAULT_EDITOR_THEME_NAMES`,
`DEFAULT_TAB_DRAG_MIME`, `DEFAULT_CHART_EXPORT_FILENAME`), and each setter has a
getter (`getSettingsStorageKey()`, `ManagedWindow.storageKey`,
`getEditorThemeNames()`, `getTabDragMime()`, `getChartExportFilename()`). An
embedder that passes nothing gets the defaults silently: nothing is logged.

- **Settings** are read lazily: importing `@flexdesk/core` touches no storage,
  and the binding reads its key on the first `getSetting`/`setSetting`/reset.
  `registerSettings()` and `registerSettingsEventBus()` may come before or after
  `configureSettings()`. Configured after the binding was in use, it moves: values
  return to their defaults, are reloaded from the new key, and one
  `settings:changed` (`path: null`) is emitted. The old key is not touched. A
  private store from `createSettingsStore()` moves the same way with
  `store.setStorageKey(key)` (and answers `store.getStorageKey()`).
- **ManagedWindow** reads geometry when a window is first shown; configure it
  before the first `show()`.
- **Editor themes**: a factory starts on the dark name current when it is
  created, and `init()` defines the built-in themes under the names current
  then. An app with a theme of its own defines it with `monaco.editor.defineTheme`
  and passes its name to `factory.setTheme(name)`.
- **The tab MIME** is read at drag time by every `NotebookTabBar` and
  `EditorPane`, so the two always agree.

**Upgrading from 0.16.** The old defaults were one application's names:
`'ecosim.settings.v1'`, `'ecosim.managedWindows.v1'`, `'ecosim-dark'` /
`'ecosim-light'`, `'application/x-ecosim-tab'`, `'ecosim_chart'` and the log
service name `'ecosim'`. If your users have settings or window geometry saved
under the old keys, pass those keys explicitly and nothing is lost:

```js
configureSettings({ storageKey: 'ecosim.settings.v1' });
ManagedWindow.configure({ storageKey: 'ecosim.managedWindows.v1' });
```

Code that called `factory.setTheme('ecosim-light')` now calls
`factory.setTheme(getEditorThemeNames().light)` (or names the themes back with
`setEditorThemeNames`), and code that read `'application/x-ecosim-tab'` off a drag
reads `getTabDragMime()`.

## No application globals: the gallery picker and plot-window events (0.17.0)

Nothing under `src/` outside `src/host` reads `window.pywebview` or an
application's global; `tests/no_app_globals.test.mjs` pins it, with the toast
helpers ([Notifications](../components/notifications.md#notifications-notificationcenter)) and these two:

**`mountGalleryPicker(el, { entries | host, kind, ... })`** takes its entries from
`entries`, or else from the host's optional `gallery` capability:
`host.gallery.list(kind)` answers `[{id, kind, label, description?, fields?}]`
(or a promise of them). Neither shipped adapter advertises it; add your own:

```js
const host = createHost({ ...createPywebviewHost({ bridgeRef }),
                          gallery: { list: (kind) => myBackend.starters(kind) } });
await mountGalleryPicker(el, { host, kind: 'report', onChange });
```

With neither `entries` nor the capability, the picker shows its `emptyLabel`
and logs one warning; a `list` that throws does the same. Until 0.17.0 it
called one application's bridge method.

**`PlotPopoutWindow({ streamEvents })`** names the bus events a live data
source emits, next to `refreshEvent`: `{ delta, complete }`. The window
redraws on each while live update is on. There are no default names: without
`streamEvents`, or for a name left out or given as `null`, nothing is listened
for, and the window updates through `refreshEvent` and explicit calls only.

```js
openPlotPopoutWindow({ id, title, plotConfig, getResults, services,
                       refreshEvent: 'run:finished',
                       streamEvents: { delta: 'sim:delta', complete: 'sim:done' } });
```
