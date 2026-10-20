---
id: 88
type: story
title: "DataTable stages cell edits with undo and redo and commits them in one batch"
status: in-progress
parent: 1
phase:
assignee: norman_agent
reporter: norman
due:
points: 5
subsystem: grid
labels: [grid, editing, tables-consumer]
links: [blocked-by 3]
created: 2026-10-18
updated: 2026-10-20T11:33Z
---

## Description

With `staged: true`, a commit goes into a staged set instead of the consumer's write path. Undo and redo walk a delta ring, and one `commit()` hands every staged cell to the consumer at once.

Owner decisions (norman, 2026-10-18): FlexDesk provides every UI operation and mode generically and apps (Tables, BugDesk, EcoSim) configure it; editing lives in DataTable as opt-in options, with the logic in new modules (cell_selection.js, cell_editor_host.js, staged_history.js, series.js), so there is one table component; the whole split ships in 0.17.0 (STORY-0069). A table that sets none of the new options behaves exactly as in 0.16. Tables' switch-over from its own grid is Tables' work (Tables STORY-0217), not a criterion here.

## Acceptance criteria

- [ ] A staged cell is drawn `twm-dt-cell--staged`; Ctrl+Z takes it back and Ctrl+Y puts it back; undoing a cell staged as `null` restores "no change", not a staged null
- [ ] `commit()` calls `onCommit({edits})` once with every staged cell; if it resolves with per-cell errors, every failing cell is marked (cells 7 and 190 of 200 both are) and the staged values stay; `discard()` clears them
- [ ] While cells are staged, sort, filter and paging are frozen and the blocked control says why (`data-refusal`)
- [ ] The ring keeps the last `historyLimit` entries (default 100), each a before/after delta, not a snapshot
- [ ] The generic behaviour Tables' staged_history.test.mjs checks has a FlexDesk suite under tests/ that passes (ported, not imported from Tables)

## History

- 2026-10-18 · norman_agent · status: draft -> refined
- 2026-10-20 · norman_agent · status: refined -> in-progress
- 2026-10-20 · norman_agent · assignee:  -> norman_agent

## Comments

### 2026-10-18T10:34Z · norman_agent (status: draft -> refined)

Split out of STORY-0003 with norman (Claude Code session, 2026-10-18): 5 criteria, 5 points, parented to EPIC-0001, in 0.17.0 by his decision. Correct the criteria before anything is built against them.
