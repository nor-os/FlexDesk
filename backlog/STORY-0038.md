---
id: 38
type: story
title: "Storage keys, theme names and drag MIME types are chosen by the embedder, not baked in"
status: review
parent: 29
phase:
assignee: norman
reporter: norman
due:
points: 3
subsystem: core
labels: [injection, settings, windows]
links: []
created: 2026-10-17
updated: 2026-10-18T00:04Z
---

## Description

The library hard-codes application vocabulary: settings under 'ecosim.settings.v1', ManagedWindow geometry under 'ecosim.managedWindows.v1', Monaco themes 'ecosim-dark'/'ecosim-light', tab drag MIME 'application/x-ecosim-tab' and PNG export name 'ecosim_chart'. Each becomes an option (settings binding storageKey, ManagedWindow.configure({storageKey}), editor theme names, tab MIME, export filename). The defaults are generic FlexDesk names documented in the README with an upgrade note, so an embedder keeps its data by passing its key explicitly.

Related EcoSim records: EcoSim STORY-0019 (`../EcoSim/backlog/STORY-0019.md`); EcoSim STORY-0036 (`../EcoSim/backlog/STORY-0036.md`); EcoSim STORY-0081 (`../EcoSim/backlog/STORY-0081.md`).

Filed from the EcoSim -> FlexDesk 0.16 migration analysis (2026-10-17).

## Acceptance criteria

- [x] `git grep -n -i ecosim -- src` returns nothing
- [x] A settings binding configured with storageKey 'app.settings' reads and writes only that localStorage key
- [x] ManagedWindow configured with storageKey 'app.windows' restores geometry saved under that key
- [x] The README lists every configurable key with its default and the option to set it
- [x] An embedder that passes no keys gets the documented defaults and no console warning

## History

- 2026-10-17 · norman_agent · status: draft -> refined
- 2026-10-17 · norman_agent · status: refined -> in-progress
- 2026-10-17 · norman_agent · assignee: (none) -> norman_agent
- 2026-10-18 · norman_agent · status: in-progress -> review
- 2026-10-18 · norman_agent · assignee: norman_agent -> norman

## Comments

### 2026-10-17T07:55Z · norman_agent

Left in draft: the content passes the refinement checks, but its shape depends on the FlexDesk owner's agreement to change the default storage keys and theme names (breaking for other embedders). Refine it once that is decided.

### 2026-10-17T08:37Z · norman_agent (status: draft -> refined)

Refined. Decision (norman, 2026-10-17): the defaults become generic names, and embedders that relied on the old ones get an upgrade note. EcoSim passes its own keys explicitly (EcoSim STORY-0019, `../EcoSim/backlog/STORY-0019.md`).

### 2026-10-18T00:04Z · norman_agent (status: in-progress -> review)

Built and landed. The library no longer bakes in application vocabulary. These are now options with generic FlexDesk defaults: the settings storage key (`configureSettings({ storageKey })`, default `'flexdesk.settings.v1'`), the ManagedWindow geometry key (`ManagedWindow.configure({ storageKey })`, default `'flexdesk.managedWindows.v1'`), the Monaco theme names (`setEditorThemeNames({ dark, light })`, default `'flexdesk-dark'`/`'flexdesk-light'`), the editor tab drag MIME (`setTabDragMime(mime)`, default `'application/x-flexdesk-tab'`) and the chart PNG export name (`setChartExportFilename(name)`, default `'chart'`). The README section 'Storage keys and names are yours (0.17.0)' lists every key with its default and setter, plus an upgrade note. The tile tab MIME `'application/x-twm-tile-tab'` is listed as fixed, not an option, and is readable as `TILE_TAB_MIME`. Review fixes in the second commit: the settings binding comment now names the configured key, and the README's opening sentence is narrowed to match the fixed MIME row.

Ticked all 5 criteria: no `ecosim` in src, the settings binding honours 'app.settings', ManagedWindow honours 'app.windows', the README table is complete, and the no-keys defaults raise no console warning.

Branch `story-0038` was rebased onto origin/main and landed fast-forward. Tip on main: 764c13f.

Tests, after the rebase: `node tests/run.mjs` (Linux node) exited 0 with 'FLEXDESK TESTS: GREEN — 126 suite(s)', and the log has 0 SKIPPED lines. `node build.mjs` exited 0, and dist/ was reverted afterwards. `git grep -n -i ecosim -- src` returns nothing.

App check: `node tests/embedder_storage_keys.test.mjs` passed every check, covering the configured keys, the defaults with no console warning, and the tab MIME drag and drop. I did not launch an embedding app; EcoSim still has to pass its old keys and theme names explicitly (EcoSim STORY-0019, `../EcoSim/backlog/STORY-0019.md`).
