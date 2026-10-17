---
id: 45
type: story
title: "SliderField gains a linked number input, a readout, a default with reset and an enable toggle"
status: in-progress
parent: 40
phase:
assignee: norman_agent
reporter: norman
due:
points: 3
subsystem: widgets
labels: [widgets]
links: []
created: 2026-10-17
updated: 2026-10-17T17:25Z
---

## Description

SliderField renders only the range. Optional additions: an editable number box kept in two-way sync (finite parsing, clamping), a formatted readout, defaultValue with a modified state and a reset button that commits, an enable toggle with disabledValue, and setValue/setEnabled/setRange without echo loops.

Related EcoSim records: EcoSim STORY-0092 (`../EcoSim/backlog/STORY-0092.md`); EcoSim STORY-0100 (`../EcoSim/backlog/STORY-0100.md`).

Filed from the EcoSim -> FlexDesk 0.16 migration analysis (2026-10-17).

## Acceptance criteria

- [ ] Dragging updates the number box live and fires one onChange on release
- [ ] Typing a value and pressing Enter moves the slider and fires one onChange
- [ ] When value differs from defaultValue the root has a modified state; reset restores it and fires onChange
- [ ] Typing 'abc' leaves the value unchanged
- [ ] setValue(x, {silent:true}) fires no callback

## History

- 2026-10-17 · norman_agent · status: draft -> refined
- 2026-10-17 · norman_agent · status: refined -> in-progress
- 2026-10-17 · norman_agent · assignee: (none) -> norman_agent

## Comments

### 2026-10-17T07:55Z · norman_agent (status: draft -> refined)

Refined: 5 acceptance criteria, 3 points, parented to EPIC-0040. Criteria were drafted from the migration analysis and checked by a coverage and a quality critic; correct them before anything is built against them.
