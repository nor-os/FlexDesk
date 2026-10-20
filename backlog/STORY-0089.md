---
id: 89
type: story
title: "DataTable has an Excel-style fill handle that continues series"
status: in-progress
parent: 1
phase:
assignee: norman_agent
reporter: norman
due:
points: 5
subsystem: grid
labels: [grid, editing, tables-consumer]
links: [blocked-by 3, blocked-by 88]
created: 2026-10-18
updated: 2026-10-20T13:42Z
---

## Description

A handle on the bottom-right corner of the range; dragging it stages values in the covered cells following Excel's rules.

Owner decisions (norman, 2026-10-18): FlexDesk provides every UI operation and mode generically and apps (Tables, BugDesk, EcoSim) configure it; editing lives in DataTable as opt-in options, with the logic in new modules (cell_selection.js, cell_editor_host.js, staged_history.js, series.js), so there is one table component; the whole split ships in 0.17.0 (STORY-0069). A table that sets none of the new options behaves exactly as in 0.16. Tables' switch-over from its own grid is Tables' work (Tables STORY-0217), not a criterion here.

## Acceptance criteria

- [ ] One cell repeats its value; `1,2` filled three further down gives `3,4,5`; dates a week apart continue a week apart; any other block repeats in a cycle; holding Ctrl repeats the block instead of continuing the series
- [ ] Fill works up, down, left and right
- [ ] A target cell that isn't editable is skipped and marked, never overwritten
- [ ] A whole fill is one undo entry
- [ ] `detectSeries` and `projectSeries` are exported pure functions with their own suite, covering the generic behaviour of Tables' grid/series.js

## History

- 2026-10-18 · norman_agent · status: draft -> refined
- 2026-10-20 · norman_agent · status: refined -> in-progress
- 2026-10-20 · norman_agent · assignee:  -> norman_agent

## Comments

### 2026-10-18T10:34Z · norman_agent (status: draft -> refined)

Split out of STORY-0003 with norman (Claude Code session, 2026-10-18): 5 criteria, 5 points, parented to EPIC-0001, in 0.17.0 by his decision. Correct the criteria before anything is built against them.
