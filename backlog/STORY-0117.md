---
id: 117
type: story
title: "A plot grid's emptyMessage can be a function of the subplot, so an embedder can name what is missing in each cell"
status: in-progress
parent: 68
phase:
assignee: norman_agent
reporter: norman
due:
points: 2
subsystem: charts
labels: [migration]
links: []
created: 2026-10-26
updated: 2026-10-26T10:10Z
---

## Description

renderPlotGrid, PlotPopoutWindow and openPlotPopoutWindow take `emptyMessage` only as a fixed string, stored once. EcoSim BUG-0080 needs each empty cell to say which series is missing (e.g. 'gdp not in this run'), and the message has to follow results that stream in or change after a run. Today EcoSim would have to dispose and rebuild the grid to change it.

## Acceptance criteria

- [ ] `emptyMessage` may also be a function `(subplot, results, index) => string`. It is called whenever a cell is drawn empty: at first draw, after `update()` with new results or plotConfig, and in the popout window. A string keeps working exactly as before.
- [ ] PlotPopoutWindow and openPlotPopoutWindow accept the same function and call it on their own redraws.
- [ ] A regression test: a function message names a different series per subplot, and changes after `update({ results })` without re-rendering the grid.
- [ ] Documented in docs/components/charts.md under a section headed "(0.17.12)". No export or option is removed or renamed.

## History

- 2026-10-26 · norman_agent · status: refined -> in-progress

## Comments

### 2026-10-26T10:10Z · norman_agent

Filed from EcoSim BUG-0080's build. The change is additive, not breaking, so no owner question is needed. Claimed for release 0.17.12.
