---
id: 111
type: story
title: "A series transform knows which series it runs on, and can take a choice parameter"
status: in-progress
parent: 59
phase:
assignee: norman_agent
reporter: norman
due:
points: 3
subsystem: charts
labels: [charts, migration]
links: []
created: 2026-10-24
updated: 2026-10-24T16:00Z
---

## Description

A series transform is called as `run(y, params)` with a copy of the drawn values (after NaN handling and any embedder rebase) and nothing saying which series they are. A transform that needs the series itself, such as EcoSim's scenario delta (the same series in a baseline scenario, minus this one), has to guess by comparing values, which is wrong whenever two series share values. Its parameters can only be numbers, so a transform cannot offer a choice such as which scenario to compare with.

EcoSim's owner chose this FlexDesk change for EcoSim STORY-0077 (`../EcoSim/backlog/STORY-0077.md`, comment 2026-10-24T15:00Z). Both additions are additive: existing transforms keep working unchanged.

## Acceptance criteria

- [ ] `run(y, params, context)` receives a third argument `{ series, subplot, results }`: the series config the trace was drawn from (the subplot's series entry, with its variable and scenario), the subplot config, and the results the figure was drawn from; `renderPlotGrid` and `PlotPopoutWindow` both pass it
- [ ] Each trace drawn from a configured series gets its own series' context; every other trace a transform ran on before (an overlay) still gets derived traces exactly as before, with `context.series` null; derived traces themselves are not run on <!-- was: "Derived traces are only made for traces drawn from a configured series (not for overlays or other derived traces), and each gets its own series' context" (amended 2026-10-24: excluding overlays changed existing behaviour in a patch release) -->
- [ ] A parameter declared `{ type: 'choice', options }` (options an array of `{ value, label }` or a function returning one) is drawn by `renderSeriesTransformControls` as a FlexDesk select, saved under `subplot.transforms.<id>.params`, and passed to `run` like a number parameter
- [ ] A transform written for `run(y, params)` with number parameters behaves exactly as before
- [ ] Tests cover each of the above, and docs/components/charts.md has a section headed "(0.17.8)" describing both additions

## History

- 2026-10-24 · norman_agent · status: refined -> in-progress
- 2026-10-24 · norman_agent · assignee: norman -> norman_agent

## Comments

### 2026-10-24T15:00Z · norman_agent

Filed, refined and claimed for EcoSim STORY-0077 (owner decision: FlexDesk passes context; the delta keeps its baseline as a choice parameter).

### 2026-10-24T16:00Z · norman_agent

Criterion 2 amended (orchestrator): the first build stopped running transforms on overlay traces, which changes what existing transforms draw. 0.17.8 is meant to be purely additive, so overlays keep their derived traces and get context.series null. A transform that needs a series, such as EcoSim's delta, skips those traces itself.
