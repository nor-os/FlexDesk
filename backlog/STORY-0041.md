---
id: 41
type: story
title: "openForm selects take dependent, disabled and grouped options; multi-select and radio fields exist"
status: draft
parent: 40
phase:
assignee:
reporter: norman
due:
points: 5
subsystem: widgets
labels: [widgets, forms]
links: []
created: 2026-10-17
updated: 2026-10-17T07:55Z
---

## Description

Extends the onFieldChange api from STORY-0011 (status review); lands after it. openForm renders select options once, flat, with no disabled flag, and values are only scalar. Adds api.setOptions(name, options) (keeps the value if still present), option {disabled, reason}, grouped options ({group, options} as optgroup), a 'checklist' field returning an array (required = at least one), and a 'radio' field with per-choice descriptions. Option values come back with their original type. Built on the flow kit's select/choice widgets so there is one implementation.

Related EcoSim records: EcoSim STORY-0057 (`../EcoSim/backlog/STORY-0057.md`); EcoSim STORY-0075 (`../EcoSim/backlog/STORY-0075.md`); EcoSim STORY-0093 (`../EcoSim/backlog/STORY-0093.md`).

Filed from the EcoSim -> FlexDesk 0.16 migration analysis (2026-10-17).

## Acceptance criteria

- [ ] setOptions on a select replaces its options while the form is open and keeps the current value when present
- [ ] A disabled option shows its reason and can never be the submitted value
- [ ] Grouped options render under their headings
- [ ] A checklist field submits an array of the checked values
- [ ] A required checklist with nothing checked shows a field error on submit
- [ ] A select whose option values are numbers resolves numbers, not strings
- [ ] Existing openForm tests pass unchanged
