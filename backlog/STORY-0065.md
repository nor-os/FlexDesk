---
id: 65
type: story
title: "STORY-0006 items: duplicate step, host card-menu items, and upstream-column widgets editable before columns are known"
status: refined
parent: 5
phase:
assignee:
reporter: norman
due:
points: 5
subsystem: flow
labels: [flow, lanes]
links: [relates-to STORY-0006]
created: 2026-10-17
updated: 2026-10-17T07:55Z
---

## Description

Two gaps an embedder porting an existing pipeline editor hits, as items of STORY-0006. (1) A pure 'flow:step:duplicate' edit in LANE_ACTIONS (fresh id, derived label, deep-copied config, same incoming connections, refused with a reason when impossible), a Duplicate card-menu item, Ctrl/Cmd+D, and a menuItems(step) option whose items run through history. (2) When ctx.columns() returns null, 'upstream-column' shows a text input and 'upstream-columns' a free-text chip list with a 'columns not known yet' hint, switching back to select/chips when columns arrive; a stored unknown name keeps the notFound treatment.

Related EcoSim records: EcoSim STORY-0066 (`../EcoSim/backlog/STORY-0066.md`); EcoSim STORY-0064 (`../EcoSim/backlog/STORY-0064.md`).

Filed from the EcoSim -> FlexDesk 0.16 migration analysis (2026-10-17).

## Acceptance criteria

- [ ] Duplicate on a step creates a copy with a new id and the same config, and selects it
- [ ] Ctrl+D on a focused card duplicates it, and Ctrl+Z removes the copy
- [ ] Duplicate is greyed with a reason on a read-only flow
- [ ] A host menu item appears after the built-in items and its edit is undoable
- [ ] With no columns, typing a column name in an upstream-column field stores it
- [ ] When columns become available the same field shows a select with the stored value selected
- [ ] A stored name not among the columns is kept and marked not found

## History

- 2026-10-17 · norman_agent · status: draft -> refined

## Comments

### 2026-10-17T07:55Z · norman_agent (status: draft -> refined)

Refined: 7 acceptance criteria, 5 points, parented to EPIC-0005. Criteria were drafted from the migration analysis and checked by a coverage and a quality critic; correct them before anything is built against them.
