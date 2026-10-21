---
id: 90
type: story
title: "DataTable pastes a block from Excel at the cursor cell, with overrun handling"
status: in-progress
parent: 1
phase:
assignee: norman_agent
reporter: norman
due:
points: 5
subsystem: grid
labels: [grid, editing, tables-consumer]
links: [blocked-by 85, blocked-by 87, blocked-by 88]
created: 2026-10-18
updated: 2026-10-21T17:55Z
---

## Description

A TSV block pasted at the cursor cell fills right and down; each value is parsed by its column's editor and all of it is staged as one batch.

Owner decisions (norman, 2026-10-18): FlexDesk provides every UI operation and mode generically and apps (Tables, BugDesk, EcoSim) configure it; editing lives in DataTable as opt-in options, with the logic in new modules (cell_selection.js, cell_editor_host.js, staged_history.js, series.js), so there is one table component; the whole split ships in 0.17.0 (STORY-0069). A table that sets none of the new options behaves exactly as in 0.16. Tables' switch-over from its own grid is Tables' work (Tables STORY-0217), not a criterion here.

## Acceptance criteria

- [ ] A 3×2 block lands at the cursor and stages 6 cells as one undo entry
- [ ] Columns past the last one are dropped, with a warning naming how many
- [ ] Rows past the last loaded row call `onPasteOverrun({rows: n})`; resolving `false` stages nothing, resolving `true` passes the extra rows to `onRowsAppend`
- [ ] A value that won't parse marks its cell and the rest of the block still stages
- [ ] A non-editable target cell is skipped and marked
- [ ] The generic behaviour Tables' grid/clipboard tests (TSV parsing and paste) checks has a FlexDesk suite under tests/ that passes (ported, not imported from Tables)

## History

- 2026-10-18 · norman_agent · status: draft -> refined
- 2026-10-21 · norman_agent · status: refined -> in-progress
- 2026-10-21 · norman_agent · assignee: (none) -> norman_agent

## Comments

### 2026-10-18T10:34Z · norman_agent (status: draft -> refined)

Split out of STORY-0003 with norman (Claude Code session, 2026-10-18): 6 criteria, 5 points, parented to EPIC-0001, in 0.17.0 by his decision. Correct the criteria before anything is built against them.
