---
id: 43
type: story
title: "A themed toggle switch component and an openForm 'toggle' field"
status: draft
parent: 40
phase:
assignee:
reporter: norman
due:
points: 3
subsystem: widgets
labels: [widgets, new-component]
links: []
created: 2026-10-17
updated: 2026-10-17T07:55Z
---

## Description

There is no .twm-toggle anywhere; consumers build their own switches. A ToggleField renders track and knob over a real input with role='switch', aria-checked, Space/Enter, focus ring, optional label and on/off text, disabled, compact variant, onChange, get/set/setDisabled/dispose; openForm 'toggle' uses it and reads a boolean.

Related EcoSim records: EcoSim STORY-0032 (`../EcoSim/backlog/STORY-0032.md`).

Filed from the EcoSim -> FlexDesk 0.16 migration analysis (2026-10-17).

## Acceptance criteria

- [ ] Space and Enter toggle the focused switch and aria-checked follows
- [ ] A disabled switch ignores clicks and keys
- [ ] openForm with a toggle field resolves true or false
- [ ] Its CSS contains no hex literal
