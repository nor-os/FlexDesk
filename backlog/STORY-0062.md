---
id: 62
type: story
title: "Derived-series transforms are injected, and the plot window ships no built-in transform"
status: in-progress
parent: 59
phase:
assignee: norman_agent
reporter: norman
due:
points: 3
subsystem: charts
labels: [charts, injection]
links: []
created: 2026-10-17
updated: 2026-10-17T20:27Z
---

## Description

Any embedder can add derived series (a trend, a moving average, a decomposition) to a plot. A seriesTransforms option ({id: {label, run(y, params) -> Promise<{[output]: number[]}>, outputs: {[output]: {suffix, lineStyle}}}}) is run once per eligible trace and each output drawn as an extra trace in the source colour. The config panel lists toggles and parameters from the supplied transforms. The current hard-coded HP filter (its backend call, showHpTrend/showHpCycle/hpLambda keys and labels) is removed; without the option no derived traces are drawn.

Related EcoSim records: EcoSim STORY-0078 (`../EcoSim/backlog/STORY-0078.md`).

Filed from the EcoSim -> FlexDesk 0.16 migration analysis (2026-10-17).

## Acceptance criteria

- [ ] The charts source contains no reference to window.pywebview and no 'hp' config key
- [ ] A supplied transform's outputs draw as extra traces with the source colour and the declared dash and suffix
- [ ] A transform that throws is skipped and the chart still renders
- [ ] Without the option the config panel shows no derived-series toggles

## History

- 2026-10-17 · norman_agent · status: draft -> refined
- 2026-10-17 · norman_agent · status: refined -> in-progress
- 2026-10-17 · norman_agent · assignee: (none) -> norman_agent

## Comments

### 2026-10-17T07:55Z · norman_agent (status: draft -> refined)

Refined: 4 acceptance criteria, 3 points, parented to EPIC-0059. Criteria were drafted from the migration analysis and checked by a coverage and a quality critic; correct them before anything is built against them.
