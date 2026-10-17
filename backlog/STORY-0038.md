---
id: 38
type: story
title: "Storage keys, theme names and drag MIME types are chosen by the embedder, not baked in"
status: refined
parent: 29
phase:
assignee:
reporter: norman
due:
points: 3
subsystem: core
labels: [injection, settings, windows]
links: []
created: 2026-10-17
updated: 2026-10-17T08:37Z
---

## Description

The library hard-codes application vocabulary: settings under 'ecosim.settings.v1', ManagedWindow geometry under 'ecosim.managedWindows.v1', Monaco themes 'ecosim-dark'/'ecosim-light', tab drag MIME 'application/x-ecosim-tab' and PNG export name 'ecosim_chart'. Each becomes an option (settings binding storageKey, ManagedWindow.configure({storageKey}), editor theme names, tab MIME, export filename). The defaults are generic FlexDesk names documented in the README with an upgrade note, so an embedder keeps its data by passing its key explicitly.

Related EcoSim records: EcoSim STORY-0019 (`../EcoSim/backlog/STORY-0019.md`); EcoSim STORY-0036 (`../EcoSim/backlog/STORY-0036.md`); EcoSim STORY-0081 (`../EcoSim/backlog/STORY-0081.md`).

Filed from the EcoSim -> FlexDesk 0.16 migration analysis (2026-10-17).

## Acceptance criteria

- [ ] `git grep -n -i ecosim -- src` returns nothing
- [ ] A settings binding configured with storageKey 'app.settings' reads and writes only that localStorage key
- [ ] ManagedWindow configured with storageKey 'app.windows' restores geometry saved under that key
- [ ] The README lists every configurable key with its default and the option to set it
- [ ] An embedder that passes no keys gets the documented defaults and no console warning

## History

- 2026-10-17 · norman_agent · status: draft -> refined

## Comments

### 2026-10-17T07:55Z · norman_agent

Left in draft: the content passes the refinement checks, but its shape depends on the FlexDesk owner's agreement to change the default storage keys and theme names (breaking for other embedders). Refine it once that is decided.

### 2026-10-17T08:37Z · norman_agent (status: draft -> refined)

Refined. Decision (norman, 2026-10-17): the defaults become generic names, and embedders that relied on the old ones get an upgrade note. EcoSim passes its own keys explicitly (EcoSim STORY-0019, `../EcoSim/backlog/STORY-0019.md`).
