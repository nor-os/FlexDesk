---
id: 85
type: story
title: "DataTable copies a selected cell range as tab-separated text"
status: refined
parent: 1
phase:
assignee:
reporter: norman
due:
points: 2
subsystem: grid
labels: [grid, editing, tables-consumer]
links: [blocked-by 3]
created: 2026-10-18
updated: 2026-10-18T10:34Z
---

## Description

Ctrl+C in cell mode (STORY-0003) copies the selected range as TSV, the format Excel and Sheets read. The TSV writer is shared with paste (STORY-0090).

Owner decisions (norman, 2026-10-18): FlexDesk provides every UI operation and mode generically and apps (Tables, BugDesk, EcoSim) configure it; editing lives in DataTable as opt-in options, with the logic in new modules (cell_selection.js, cell_editor_host.js, staged_history.js, series.js), so there is one table component; the whole split ships in 0.17.0 (STORY-0069). A table that sets none of the new options behaves exactly as in 0.16. Tables' switch-over from its own grid is Tables' work (Tables STORY-0217), not a criterion here.

## Acceptance criteria

- [ ] A 3×4 range copies 3 lines of 4 tab-separated values, in the order shown after sort and filter
- [ ] With no range, Ctrl+C copies the cursor cell's value alone
- [ ] Hidden columns are left out, and a value containing a tab, newline or quote is quoted the way Excel quotes it
- [ ] In row mode, Ctrl+C and the copy menu work as before
- [ ] The generic behaviour Tables' grid/clipboard tests (TSV writing) checks has a FlexDesk suite under tests/ that passes (ported, not imported from Tables)

## History

- 2026-10-18 · norman_agent · status: draft -> refined

## Comments

### 2026-10-18T10:34Z · norman_agent (status: draft -> refined)

Split out of STORY-0003 with norman (Claude Code session, 2026-10-18): 5 criteria, 2 points, parented to EPIC-0001, in 0.17.0 by his decision. Correct the criteria before anything is built against them.
