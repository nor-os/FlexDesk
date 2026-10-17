---
id: 49
type: story
title: "ActionDropdown accepts separator entries"
status: in-progress
parent: 40
phase:
assignee: norman_agent
reporter: norman
due:
points: 1
subsystem: widgets
labels: [widgets]
links: []
created: 2026-10-17
updated: 2026-10-17T17:28Z
---

## Description

ActionDropdown maps options one to one to buttons. {separator:true} renders a non-focusable divider with role='separator' that keyboard navigation and onSelect skip; leading, trailing and doubled separators collapse.

Related EcoSim records: EcoSim STORY-0085 (`../EcoSim/backlog/STORY-0085.md`).

Filed from the EcoSim -> FlexDesk 0.16 migration analysis (2026-10-17).

## Acceptance criteria

- [ ] A separator renders between options with role='separator'
- [ ] Arrow keys skip it and it never reaches onSelect
- [ ] Two consecutive separators render as one

## History

- 2026-10-17 · norman_agent · status: draft -> refined
- 2026-10-17 · norman_agent · status: refined -> in-progress
- 2026-10-17 · norman_agent · assignee: (none) -> norman_agent

## Comments

### 2026-10-17T07:55Z · norman_agent (status: draft -> refined)

Refined: 3 acceptance criteria, 1 points, parented to EPIC-0040. Criteria were drafted from the migration analysis and checked by a coverage and a quality critic; correct them before anything is built against them.
