---
id: 66
type: story
title: "DataTable column groups and add/rename/delete of rows and columns from the headers"
status: in-progress
parent: 1
phase:
assignee: norman_agent
reporter: norman
due:
points: 5
subsystem: datatable
labels: [datatable, editable-grid]
links: [relates-to STORY-0003]
created: 2026-10-17
updated: 2026-10-17T21:17Z
---

## Description

Child of STORY-0003: uses its cell-edit lifecycle and header-menu hook and lands after it. A declarative column-group spec draws a second header row whose cells span their members and stay aligned after column fit; group and column headers expose consumer action slots; opt-in structural callbacks onColumnAdd(groupKey), onColumnRename(colKey, name) via the inline renamer, onColumnDelete, onRowAdd, onRowDelete; an empty group keeps one placeholder column so its add control is reachable. The consumer owns the data.

Related EcoSim records: EcoSim STORY-0099 (`../EcoSim/backlog/STORY-0099.md`).

Filed from the EcoSim -> FlexDesk 0.16 migration analysis (2026-10-17).

## Acceptance criteria

- [ ] Two groups of 3 and 2 columns render a group row with spans 3 and 2 aligned to the body columns
- [ ] Renaming a column header calls onColumnRename with the new name, and Esc cancels
- [ ] The add control on a group header calls onColumnAdd with that group's key
- [ ] An empty group shows a placeholder column with its add control
- [ ] A table with no groups renders exactly as before

## History

- 2026-10-17 · norman_agent · status: draft -> refined
- 2026-10-17 · norman_agent · status: refined -> in-progress
- 2026-10-17 · norman_agent · assignee:  -> norman_agent

## Comments

### 2026-10-17T07:55Z · norman_agent (status: draft -> refined)

Refined: 5 acceptance criteria, 5 points, parented to EPIC-0001. Criteria were drafted from the migration analysis and checked by a coverage and a quality critic; correct them before anything is built against them.
