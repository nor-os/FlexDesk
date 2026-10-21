---
id: 89
type: story
title: "DataTable has an Excel-style fill handle that continues series"
status: review
parent: 1
phase:
assignee: norman
reporter: norman
due:
points: 5
subsystem: grid
labels: [grid, editing, tables-consumer]
links: [blocked-by 3, blocked-by 88]
created: 2026-10-18
updated: 2026-10-20T16:36Z
---

## Description

A handle on the bottom-right corner of the range; dragging it stages values in the covered cells following Excel's rules.

Owner decisions (norman, 2026-10-18): FlexDesk provides every UI operation and mode generically and apps (Tables, BugDesk, EcoSim) configure it; editing lives in DataTable as opt-in options, with the logic in new modules (cell_selection.js, cell_editor_host.js, staged_history.js, series.js), so there is one table component; the whole split ships in 0.17.0 (STORY-0069). A table that sets none of the new options behaves exactly as in 0.16. Tables' switch-over from its own grid is Tables' work (Tables STORY-0217), not a criterion here.

## Acceptance criteria

- [x] One cell repeats its value; `1,2` filled three further down gives `3,4,5`; dates a week apart continue a week apart; any other block repeats in a cycle; holding Ctrl repeats the block instead of continuing the series
- [x] Fill works up, down, left and right
- [x] A target cell that isn't editable is skipped and marked, never overwritten
- [x] A whole fill is one undo entry
- [x] `detectSeries` and `projectSeries` are exported pure functions with their own suite, covering the generic behaviour of Tables' grid/series.js

## History

- 2026-10-18 · norman_agent · status: draft -> refined
- 2026-10-20 · norman_agent · status: refined -> in-progress
- 2026-10-20 · norman_agent · assignee:  -> norman_agent
- 2026-10-20 · norman_agent · status: in-progress -> review
- 2026-10-20 · norman_agent · assignee: norman_agent -> norman

## Comments

### 2026-10-18T10:34Z · norman_agent (status: draft -> refined)

Split out of STORY-0003 with norman (Claude Code session, 2026-10-18): 5 criteria, 5 points, parented to EPIC-0001, in 0.17.0 by his decision. Correct the criteria before anything is built against them.

### 2026-10-20T16:36Z · norman_agent (status: in-progress -> review)

Landed on main at 079ffe5 (fast-forward ccee7d4..079ffe5). Branch `story-0089` was rebased onto origin/main (which had gained STORY-0066's column groups) as ea5d6e6, f30c811, 079ffe5; origin/story-0089 still holds the pre-rebase history (tip dcb4b05, with the merge commit). The rebase conflicted only in README.md (the Fill handle section now sits under the staged-edits section, before STORY-0066's column-groups section) and in DataTable's defaults (both option blocks kept); the rebased diff against main is line-for-line the approved one.

What was built: `fillHandle: true` beside `staged` puts a fill handle (`.twm-dt-fill-handle`, fill_handle.js) on the range's corner cell; a drag up, down, left or right previews the covered cells and on release stages them as one undo entry, each column (row, sideways) continued by `projectSeries` (series.js); Ctrl/Cmd at release repeats the block; refused cells are skipped and drawn `twm-dt-cell--fill-skipped`; Escape or pointercancel ends the drag without filling; `fill(to, {forceCopy})` does the same from code. Review fix (4bd9b06, now 079ffe5): a handle drag swallows the click and dblclick the browser makes of it, filled or not, so `onRowClick`/`onRowActivate` never fire from a drag; `_cellUnder` uses the handle's own document. README §Fill handle documents it.

Ticked all five criteria: series rules (copy, numeric step, dates a week apart, cycle, Ctrl copy), four directions, skipped and marked non-editable cells, one undo entry per fill, and `detectSeries`/`projectSeries` as exported pure functions with their own suite (tests/series.test.mjs; the handle in tests/fill_handle.test.mjs).

Tests: full suite `node tests/run.mjs` (Linux node v18.19.1) on the rebased branch, run to the end: "FLEXDESK TESTS: GREEN — 181 suite(s)", exit 0, no `: SKIPPED` lines. `node build.mjs` exit 0; dist/ restored afterwards and not committed. No backlog, bugs or dist files in the branch's diff.

App check: none in this landing step; this is library work, checked by the jsdom suites above (the reviewer's Edge reproductions are covered by the §5 regression block in tests/fill_handle.test.mjs).
