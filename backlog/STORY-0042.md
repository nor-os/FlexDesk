---
id: 42
type: story
title: "openForm number fields enforce min and max, and several fields can share a row"
status: refined
parent: 40
phase:
assignee:
reporter: norman
due:
points: 3
subsystem: widgets
labels: [widgets, forms]
links: [blocked-by 41]
created: 2026-10-17
updated: 2026-10-17T07:55Z
---

## Description

Extends STORY-0011's openForm. Number fields accept only step; layouts like min/max side by side need hand-built DOM. Adds min/max (attributes plus submit validation with a field error) and {row: [field, ...]} entries where each field keeps its own label, hint, error, visibility and value, stacking at narrow widths.

Related EcoSim records: EcoSim STORY-0057 (`../EcoSim/backlog/STORY-0057.md`).

Filed from the EcoSim -> FlexDesk 0.16 migration analysis (2026-10-17).

## Acceptance criteria

- [ ] A value outside min/max is rejected on submit with an error under that field
- [ ] Two fields in a row render side by side at 600px dialog width and stack below 360px
- [ ] setVisible on one field in a row hides only that field
- [ ] A form with no rows or min/max renders as before

## History

- 2026-10-17 · norman_agent · status: draft -> refined

## Comments

### 2026-10-17T07:55Z · norman_agent (status: draft -> refined)

Refined: 4 acceptance criteria, 3 points, parented to EPIC-0040. Blocked by STORY-0041. Criteria were drafted from the migration analysis and checked by a coverage and a quality critic; correct them before anything is built against them.
