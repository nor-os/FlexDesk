---
id: 63
type: story
title: "A public figure tile: subclasses return {traces, layout} and the base runs the draw lifecycle"
status: draft
parent: 21
phase:
assignee:
reporter: norman
due:
points: 5
subsystem: tiles
labels: [tiles, charts]
links: []
created: 2026-10-17
updated: 2026-10-17T07:55Z
---

## Description

Follow-up to STORY-0022: lands after its review closes and rebuilds STORY-0022's ChartTile on the new base. FigureTile has one override figure(data) -> {traces, layout, config?, frames?} | null. The base awaits ensurePlotly, draws via createChart, discards stale draws, purges on loading/empty/error/dispose, relayouts after resize settles, adds Download PNG via host.dialogs.saveFile, default getExpandData from the last figure, optional point-click callback; menuItems extend the base items.

Related EcoSim records: EcoSim STORY-0072 (`../EcoSim/backlog/STORY-0072.md`); EcoSim STORY-0073 (`../EcoSim/backlog/STORY-0073.md`).

Filed from the EcoSim -> FlexDesk 0.16 migration analysis (2026-10-17).

## Acceptance criteria

- [ ] A subclass returning null shows the empty state
- [ ] A subclass whose figure() throws shows the error state and emits tile:render-failed
- [ ] With Plotly loaded lazily via setPlotlySource the first draw succeeds
- [ ] A draw finishing after a newer draw is discarded
- [ ] Expand opens openRawTracesWindow with the last figure
- [ ] ChartTile's existing tests pass on the new base
