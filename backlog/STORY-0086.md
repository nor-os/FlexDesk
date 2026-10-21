---
id: 86
type: story
title: "DataTable columns can be reordered by drag and from code, and the order is kept"
status: done
parent: 1
phase:
assignee: norman
reporter: norman
due:
points: 3
subsystem: grid
labels: [grid, editing, tables-consumer]
links: [blocked-by 3]
created: 2026-10-18
updated: 2026-10-21T07:42Z
---

## Description

Columns can be dragged into a new order, kept by data index so hiddenColumns, filters and sort stay correct. The header menu (STORY-0003) offers Move left / Move right.

Owner decisions (norman, 2026-10-18): FlexDesk provides every UI operation and mode generically and apps (Tables, BugDesk, EcoSim) configure it; editing lives in DataTable as opt-in options, with the logic in new modules (cell_selection.js, cell_editor_host.js, staged_history.js, series.js), so there is one table component; the whole split ships in 0.17.0 (STORY-0069). A table that sets none of the new options behaves exactly as in 0.16. Tables' switch-over from its own grid is Tables' work (Tables STORY-0217), not a criterion here.

## Acceptance criteria

- [x] With `reorderable: true`, dragging header 3 onto header 1 draws columns in order 0,3,1,2 with body cells to match; `moveColumn(from,to)`, `getColumnOrder()` and `columnOrder: [...]` do the same from code, and `onColumnsChange` reports each change
- [x] With `persistKey` the order is saved and restored; a saved order whose column count differs from today's is ignored and the natural order is drawn
- [x] A drag that starts on a resize grip resizes and does not reorder; the row-number and select-mode columns cannot be moved and nothing can be dropped in front of them
- [x] Copy and CSV follow the order shown
- [x] A state blob saved before this story still loads

## History

- 2026-10-18 · norman_agent · status: draft -> refined
- 2026-10-20 · norman_agent · status: refined -> in-progress
- 2026-10-20 · norman_agent · assignee: (none) -> norman_agent
- 2026-10-20 · norman_agent · status: in-progress -> review
- 2026-10-20 · norman_agent · assignee: norman_agent -> norman
- 2026-10-21 · norman_agent · status: review -> done

## Comments

### 2026-10-18T10:34Z · norman_agent (status: draft -> refined)

Split out of STORY-0003 with norman (Claude Code session, 2026-10-18): 5 criteria, 3 points, parented to EPIC-0001, in 0.17.0 by his decision. Correct the criteria before anything is built against them.

### 2026-10-20T15:09Z · norman_agent (status: in-progress -> review)

Landed on main and handed back for review.

What was built: DataTable columns can be reordered by dragging a header (`reorderable: true`) and from code (`moveColumn(from,to)`, `getColumnOrder()`, `columnOrder: [...]`). Each change is reported through `onColumnsChange`. The order is kept by data index, so hiddenColumns, filters and sort stay correct. The order logic is in the new src/ui/components/column_order.js, and tests are in tests/column_reorder.test.mjs. With `persistKey` the order is saved and restored, and state blobs saved before this story still load. A drag that starts on a resize grip only resizes. The row-number and select-mode columns are fixed, and nothing can be dropped in front of them. Copy and CSV follow the order shown.

Reviewer issue 1, fixed in code (option a): a `columnOrder` passed while `headers` is still empty is now marked unchecked. When the first headers arrive through `setData`, it is checked once. If it is not a permutation of those headers (for example [0,0] or [0,1]), it gives one console warning, is dropped, and the natural order is drawn. A pending order that fits is drawn with no warning. README.md (the `columnOrder` row) and the JSDoc say this, and column_reorder.test.mjs §1 tests it.

FOR NORMAN TO CONFIRM (reviewer issue 2, no code change): criterion 2 says a saved order with a different column count "is ignored and the natural order is drawn". The natural order is drawn only when no `columnOrder` is set. When one is set, that order is drawn instead, which is consistent with criterion 1. This is tested in column_reorder.test.mjs §3 and documented in the README's persistKey row. Please accept this reading or correct the criterion.

Ticked: all five criteria (drag/moveColumn/getColumnOrder/columnOrder/onColumnsChange; persistKey save/restore with a wrong-length order ignored; resize grip and fixed columns; copy and CSV order; old state blobs load).

Landed tip on main: b812de4. The branch was rebased onto origin/main (ba8edee) before landing, giving three commits: eb342ba, 454c646, b812de4. origin/story-0086 still holds the pre-rebase history (tip a48396c, with merges of origin/main) and was not force-pushed.

Tests: on b812de4, the full suite `node tests/run.mjs` (Linux node) finished with "FLEXDESK TESTS: GREEN — 177 suite(s)", exit 0, and 0 ": SKIPPED" lines. `node build.mjs` exits 0. dist/ was restored and not committed. App check: none. This is a library component covered by its jsdom suite, and no consuming app was run for this story.

### 2026-10-21T07:42Z · norman_agent (status: review -> done)

norman decided on 2026-10-21 (Claude Code session) to release FlexDesk 0.17.0 now and to accept every story on the 0.17.0 list whose code is on main and whose independent agent review passed, without reviewing each record himself. Its code is on main (audited), so it is done and ships in 0.17.0.
