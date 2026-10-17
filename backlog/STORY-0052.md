---
id: 52
type: story
title: "Progress bar, keyed progress list, stepped progress and determinate progress dialogs"
status: in-progress
parent: 51
phase:
assignee: norman_agent
reporter: norman
due:
points: 5
subsystem: widgets
labels: [widgets, progress, new-component]
links: []
created: 2026-10-17
updated: 2026-10-17T19:18Z
---

## Description

ProgressBar (value/max or fraction, indeterminate, label, percent and count readout, elapsed time, cancel, in-place update), ProgressList (keyed rows with name, completed/total, state pending/running/done/failed, stats line, active pulse, setItems reconciles), StepProgress (ordered phases with state and 'pass n of m'), and progress/steps options on showRunProgressDialog and showComputingWindow with setProgress/setStep, a final success/error state and a Promise result.

Related EcoSim records: EcoSim STORY-0059 (`../EcoSim/backlog/STORY-0059.md`); EcoSim STORY-0069 (`../EcoSim/backlog/STORY-0069.md`).

Filed from the EcoSim -> FlexDesk 0.16 migration analysis (2026-10-17).

## Acceptance criteria

- [ ] update(0.42) changes the existing bar's width and text without replacing DOM nodes
- [ ] setItems with the same keys at 20 updates per second keeps row elements stable
- [ ] An item without total scales against the largest item
- [ ] StepProgress marks phases done/active/pending/error in order
- [ ] Closing a progress dialog while running resolves its promise with cancelled

## History

- 2026-10-17 · norman_agent · status: draft -> refined
- 2026-10-17 · norman_agent · status: refined -> in-progress
- 2026-10-17 · norman_agent · assignee: (none) -> norman_agent

## Comments

### 2026-10-17T07:55Z · norman_agent (status: draft -> refined)

Refined: 5 acceptance criteria, 5 points, parented to EPIC-0051. Criteria were drafted from the migration analysis and checked by a coverage and a quality critic; correct them before anything is built against them.
