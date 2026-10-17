---
id: 38
type: story
title: "Storage keys, theme names and drag MIME types are chosen by the embedder, not baked in"
status: draft
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
updated: 2026-10-17T07:55Z
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
