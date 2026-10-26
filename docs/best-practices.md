# Best practices

The rules the reference pages state, gathered in one place. Each item says what to do and why, and links to the page that explains it.

## Wiring FlexDesk into an application

**1. Describe your domain in the taxonomy, and nowhere else.** Your kinds, their ancestors, which are single-instance and which panels each page offers are all declared once, in `createTaxonomy`. FlexDesk has no ontology of its own, and which panels a page offers is "said once, in the taxonomy". Likewise hand the shell elements, not selectors: the library never guesses at your markup. See [kinds that exist once](components/shell.md#a-kind-that-exists-once-single-0170), [panels a page does not offer](components/panels-and-desktops.md#panels-a-page-does-not-offer-0170) and the [quickstart](quickstart.md#hello-shell).

**2. Start with the smallest host.** Pass `createHost` only the capabilities you have. A capability you leave out is absent and the library degrades instead of throwing: no native window buttons without `window`, a Blob download for CSV without `dialogs`. An in-memory `Map` is a perfectly good `state`, and `NULL_HOST` is a valid host with nothing behind it. See [the host port](concepts/host-port.md#the-host-port).

**3. Load every entry from one copy.** The entries share code through chunks, so importing several does not give you several event buses or several copies of a module-level singleton. Keep it that way: map all entries to the same install or the same import map, rather than mixing a vendored `dist/` with a second bundled copy. See [packages and entry points](concepts/packages-and-entry-points.md#nine-entry-points).

**4. Name your storage before anything reads it.** Every key FlexDesk writes is an option, with a generic default. Set them at boot, before the first read. Tile layouts are the sharp edge: the store is a singleton, and one built before you supply your key uses the default, so every layout your users saved becomes silently invisible, with no error. If users already have data under older keys, pass those keys explicitly and nothing is lost. See [storage keys and names](concepts/domain-neutrality.md#storage-keys-and-names-are-yours-0170) and [layouts are keyed by whatever you key them by](components/tiles.md#layouts-are-keyed-by-whatever-you-key-them-by).

**5. Set the peer-dependency paths yourself, and show the failure.** Plotly and Monaco are not bundled and their locations are not guessed. `initMonaco()` and `getEditorFactory()` reject when no path is set or loading fails, so catch that and show a message instead of waiting for an editor that never appears. A failure in Monaco's own loader is final for the page: fix the path and reload. If your page already loads Plotly, you can skip `setPlotlySource`. See [peer dependencies](concepts/peer-dependencies.md#peer-dependencies).

**6. Adopt new options one at a time.** Options are opt-in across the library. Most sections of the reference say what a component that sets none of the options does, and the answer is that it behaves as it did in the previous release. Turn a feature on where you need it and leave the rest alone.

## Building screens

**7. Give a table values, not formatted text.** Pass `rows` as values and declare `columnTypes` (`'date'`, `'datetime'`, `'duration'`) so sorting and filtering work on the value, then format for display with `dateFormat`, `durationFormat` and `nullDisplay`. See [DataTable options in 0.5.0](components/data-table.md#datatable-options-in-050-lists-that-need-no-help).

**8. Set house rules once.** `DataTable.withDefaults({ … })` returns a subclass whose defaults sit under every config it is given, so each list is one `mount` call.

**9. Say how long a table lives.** `autoDispose: true` disposes a table that has left the document, which suits lists you rebuild. Do not set it on a table you detach and attach again later, such as a cached tab: a disposed table comes back empty. For that case add `keepWhileDetached`. See [DataTable options in 0.5.0](components/data-table.md#datatable-options-in-050-lists-that-need-no-help) and [0.7.0](components/data-table.md#datatable-options-in-070-details-rows-from-a-server-and-filters-that-are-not-text).

**10. Let the server be the server.** For large or live data, use `dataSource` instead of fetching and slicing in your code, and give the table a `getRowKey`: without it a row's index is only its place in the page drawn, so an open detail survives a new answer only where the same row sits at the same place. Only the newest answer is drawn. When a filter of your own, outside the table, changes, call `reload()`. See [paging](components/data-table.md#a-servers-rows-in-pages-or-as-one-list-paging) and [dataSource](components/data-table.md#datatable-options-in-070-details-rows-from-a-server-and-filters-that-are-not-text).

**11. Pass text as text.** A confirm's message and labels, and a progress bar's names and labels, are set as text, so `<` shows as `<`. Do not build HTML strings for them. See [confirms](components/forms-and-dialogs.md#confirms-show-text-not-markup-0170) and [progress](components/notifications.md#progress-bars-lists-and-phases-0170).

**12. Leave a key to the component that handled it.** The keymap skips any keydown that is already `defaultPrevented`. A list that deletes a row on Backspace calls `preventDefault()`, and the window manager does not also navigate back. To take a chord away from the window manager altogether, set it to `false` in `keymap.bindings`. See [keys](components/keymap.md#your-keys-not-the-window-managers-keymap-0170).

**13. Keep I/O out of the editors.** The flow editors never fetch, never save and never start a timer that writes. Step types, reference grammar, findings and all I/O are yours, passed in as options and returned through callbacks. See [flow editors](components/flow-editors.md#flow-editors).

## Looking right, staying right

**14. Restyle through the tokens.** Every rule reads its values from `tokens.css`, so swapping that one file restyles the shell. Library classes are `twm-` prefixed, and that prefix is stable; the editor components and the help modal keep the class names they were extracted with. Supply the icon font, or accept that icons show their text names. See [theming and CSS](concepts/styling.md#styling).

**15. Run the state guard strictly in your own code.** `StateGuardService` defaults to `mode: 'warn'`. FlexDesk's own widgets run clean under `'strict'`, so choose strict for your code and add your application's keys on top of `DEFAULT_STATE_GUARD_CONFIG`: a key you write that no FlexDesk widget does is yours to list. The defaults also still allow some keys that no widget writes, which a strict guard lets through unless you filter them out ([what 0.18.0 removed and what stayed](concepts/state-guard.md#thirteen-application-keys-leave-the-defaults-0180)). See [state guard](concepts/state-guard.md#the-state-guard-who-wrote-that-attribute-0170) and [the default allow-list](concepts/state-guard.md#the-defaults-cover-flexdesks-own-keys-0170).

**16. Dispose what you create.** `shell.dispose()` removes the `?` shortcut and the desktop bar along with the rest of the shell. A `NotificationCenter`'s `dispose()` hands the toast helpers back. Menu bars, tables and lists have `dispose()` too.

## One page, browser and native window

**17. Call the native helpers unconditionally.** The same app runs in a browser tab, a native window with the OS frame, and a native window with its own chrome, and the page needs no switch. `routeExternalLinks({ host })` is a no-op without `host.shell`. `WindowChromeController` asks `host.window.chrome()` and draws handles and buttons only for a custom frame. `suppressNativeContextMenu()` leaves the native menu in editable and selected text. See [links out](concepts/host-port.md#links-out-and-the-browsers-right-click-menu-0160) and [a window with its own chrome](concepts/host-port.md#a-window-with-its-own-chrome-0150).
