---
id: 86
type: story
title: "DataTable columns can be reordered by drag and from code, and the order is kept"
status: in-progress
parent: 1
phase:
assignee: norman_agent
reporter: norman
due:
points: 3
subsystem: grid
labels: [grid, editing, tables-consumer]
links: [blocked-by 3]
created: 2026-10-18
updated: 2026-10-20T11:32Z
---

## Description

Columns can be dragged into a new order, kept by data index so hiddenColumns, filters and sort stay correct. The header menu (STORY-0003) offers Move left / Move right.

Owner decisions (norman, 2026-10-18): FlexDesk provides every UI operation and mode generically and apps (Tables, BugDesk, EcoSim) configure it; editing lives in DataTable as opt-in options, with the logic in new modules (cell_selection.js, cell_editor_host.js, staged_history.js, series.js), so there is one table component; the whole split ships in 0.17.0 (STORY-0069). A table that sets none of the new options behaves exactly as in 0.16. Tables' switch-over from its own grid is Tables' work (Tables STORY-0217), not a criterion here.

## Acceptance criteria

- [ ] With `reorderable: true`, dragging header 3 onto header 1 draws columns in order 0,3,1,2 with body cells to match; `moveColumn(from,to)`, `getColumnOrder()` and `columnOrder: [...]` do the same from code, and `onColumnsChange` reports each change
- [ ] With `persistKey` the order is saved and restored; a saved order whose column count differs from today's is ignored and the natural order is drawn
- [ ] A drag that starts on a resize grip resizes and does not reorder; the row-number and select-mode columns cannot be moved and nothing can be dropped in front of them
- [ ] Copy and CSV follow the order shown
- [ ] A state blob saved before this story still loads

## History

- 2026-10-18 · norman_agent · status: draft -> refined
- 2026-10-20 · norman_agent · status: refined -> in-progress
- 2026-10-20 · norman_agent · assignee: (none) -> norman_agent

## Comments

### 2026-10-18T10:34Z · norman_agent (status: draft -> refined)

Split out of STORY-0003 with norman (Claude Code session, 2026-10-18): 5 criteria, 3 points, parented to EPIC-0001, in 0.17.0 by his decision. Correct the criteria before anything is built against them.
