---
id: 117
type: story
title: "A plot grid's emptyMessage can be a function of the subplot, so an embedder can name what is missing in each cell"
status: done
parent: 68
phase:
assignee: norman
reporter: norman
due:
points: 2
subsystem: charts
labels: [migration]
links: []
created: 2026-10-26
updated: 2026-10-26T11:00Z
---

## Description

renderPlotGrid, PlotPopoutWindow and openPlotPopoutWindow take `emptyMessage` only as a fixed string, stored once. EcoSim BUG-0080 needs each empty cell to say which series is missing (e.g. 'gdp not in this run'), and the message has to follow results that stream in or change after a run. Today EcoSim would have to dispose and rebuild the grid to change it.

## Acceptance criteria

- [x] `emptyMessage` may also be a function `(subplot, results, index) => string`. It is called whenever a cell is drawn empty: at first draw, after `update()` with new results or plotConfig, and in the popout window. A string keeps working exactly as before.
- [x] PlotPopoutWindow and openPlotPopoutWindow accept the same function and call it on their own redraws.
- [x] A regression test: a function message names a different series per subplot, and changes after `update({ results })` without re-rendering the grid.
- [x] Documented in docs/components/charts.md under a section headed "(0.17.12)". No export or option is removed or renamed.

## History

- 2026-10-26 · norman_agent · status: refined -> in-progress
- 2026-10-26 · norman_agent · status: in-progress -> done
- 2026-10-26 · norman_agent · assignee: norman_agent -> norman

## Comments

### 2026-10-26T10:10Z · norman_agent

Filed from EcoSim BUG-0080's build. The change is additive, not breaking, so no owner question is needed. Claimed for release 0.17.12.

### 2026-10-26T11:00Z · norman_agent (status: in-progress -> done)

On main as ab2a691 and released in 0.17.12 (f9d0f19). Independently reviewed and approved. One helper in src/charts/plot_grid.js resolves a string or function emptyMessage on every empty draw: first draw, update(), resize, failed draw, and the popout window's redraws. Tests: tests/plot_grid.test.mjs §8. Before release I corrected one review note in the docs, CHANGELOG and JSDoc: results is passed as the grid was given it, so it may be null or undefined. Full suite: 205 suites green.
