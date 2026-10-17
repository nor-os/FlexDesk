---
id: 60
type: story
title: "renderPlotGrid draws a plot_config into any container; PlotPopoutWindow uses it"
status: draft
parent: 59
phase:
assignee:
reporter: norman
due:
points: 5
subsystem: charts
labels: [charts]
links: [blocked-by 62]
created: 2026-10-17
updated: 2026-10-17T07:55Z
---

## Description

Export renderPlotGrid(container, plotConfig, results, options) -> {update, resize, dispose}: CSS grid from PLOT_LAYOUTS, per-subplot figures with multi-y axes, chart types, interpolation, stack groups, reference lines and bands, NaN handling, x-range clip, optional x-variable; empty-state message; guards for detached/zero-size containers. Options resolveSeries, seriesTransforms, overlays, derivedTraces, hiddenSeries, theme. PlotPopoutWindow's private #render is replaced by it.

Related EcoSim records: EcoSim STORY-0077 (`../EcoSim/backlog/STORY-0077.md`).

Filed from the EcoSim -> FlexDesk 0.16 migration analysis (2026-10-17).

## Acceptance criteria

- [ ] A 2x2 config renders four subplots in the right grid areas
- [ ] A subplot with no data shows the empty message
- [ ] For the fixture configs, PlotPopoutWindow produces the same trace count, names and axes before and after the refactor
- [ ] Rendering into a zero-size container defers until it has size
- [ ] dispose() purges every figure
