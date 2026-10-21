---
id: 88
type: story
title: "DataTable stages cell edits with undo and redo and commits them in one batch"
status: done
parent: 1
phase:
assignee: norman
reporter: norman
due:
points: 5
subsystem: grid
labels: [grid, editing, tables-consumer]
links: [blocked-by 3]
created: 2026-10-18
updated: 2026-10-21T07:42Z
---

## Description

With `staged: true`, a commit goes into a staged set instead of the consumer's write path. Undo and redo walk a delta ring, and one `commit()` hands every staged cell to the consumer at once.

Owner decisions (norman, 2026-10-18): FlexDesk provides every UI operation and mode generically and apps (Tables, BugDesk, EcoSim) configure it; editing lives in DataTable as opt-in options, with the logic in new modules (cell_selection.js, cell_editor_host.js, staged_history.js, series.js), so there is one table component; the whole split ships in 0.17.0 (STORY-0069). A table that sets none of the new options behaves exactly as in 0.16. Tables' switch-over from its own grid is Tables' work (Tables STORY-0217), not a criterion here.

## Acceptance criteria

- [x] A staged cell is drawn `twm-dt-cell--staged`; Ctrl+Z takes it back and Ctrl+Y puts it back; undoing a cell staged as `null` restores "no change", not a staged null
- [x] `commit()` calls `onCommit({edits})` once with every staged cell; if it resolves with per-cell errors, every failing cell is marked (cells 7 and 190 of 200 both are) and the staged values stay; `discard()` clears them
- [x] While cells are staged, sort, filter and paging are frozen and the blocked control says why (`data-refusal`)
- [x] The ring keeps the last `historyLimit` entries (default 100), each a before/after delta, not a snapshot
- [x] The generic behaviour Tables' staged_history.test.mjs checks has a FlexDesk suite under tests/ that passes (ported, not imported from Tables)

## History

- 2026-10-18 · norman_agent · status: draft -> refined
- 2026-10-20 · norman_agent · status: refined -> in-progress
- 2026-10-20 · norman_agent · assignee:  -> norman_agent
- 2026-10-20 · norman_agent · status: in-progress -> review
- 2026-10-20 · norman_agent · assignee: norman_agent -> norman
- 2026-10-21 · norman_agent · status: review -> done

## Comments

### 2026-10-18T10:34Z · norman_agent (status: draft -> refined)

Split out of STORY-0003 with norman (Claude Code session, 2026-10-18): 5 criteria, 5 points, parented to EPIC-0001, in 0.17.0 by his decision. Correct the criteria before anything is built against them.

### 2026-10-20T13:41Z · norman_agent (status: in-progress -> review)

Handing back to norman for review. STORY-0088 landed on main at 225f005, rebased onto STORY-0061's merge ad0a342. origin/story-0088 still holds the history from before the rebase (tip 1acced7). The rebase had no conflicts: STORY-0087's cell_grid.js `_committed` change is not on main yet, so the conflict expected there will come up when STORY-0087 lands.

What was built: editing stays opt-in. The new DataTable options are `staged`, `historyLimit` (default 100), `onCommit`, `onStagedChange` and `stagedRefusal`. The new methods are `commit()`, `discard()`, `undo()`, `redo()` and `getStagedEdits()`. No existing public API changed.
- src/ui/components/staged_history.js: the undo ring. It is public and exported from widgets.js as `StagedHistory`, `ACTIONS` and `DEFAULT_HISTORY_LIMIT`. Each entry holds one cell's before and after. Each side records whether the cell is staged as well as its value, so "no change" and "staged as null" stay different. It has `beginGroup()`/`endGroup()`, so a whole fill (STORY-0089) or paste (STORY-0090) can be one undo entry through `this.staged.stage(rowIdx, colIdx, value)`.
- src/ui/components/staged_edits.js: internal to the table. It holds the staged cells, `commit()` and `discard()`, and the freeze that disables sort, filter and paging controls and puts the reason in `data-refusal`.
- cell_grid.js: the staged path in `_committed`, Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z, no editing while a commit is out, and the staged class and error marks.
- data_table.js: the typedef, defaults and public methods, a refusal guard on every sort, filter and paging entry point, a silent skip when scrolling would load more rows, and a re-freeze when the paging strip is redrawn.
- The export button gets the class `twm-pagination-btn--export` so the freeze leaves it alone. A class, because a new data attribute failed the state-guard suite.
- css/flexdesk.css: styles for `twm-dt-cell--staged` and for frozen controls. README.md: a new "Staged edits" section.

Ticked: all five criteria. The staged class with Ctrl+Z / Ctrl+Y and the staged-null undo; `commit()` calling `onCommit({edits})` once, with cells 7 and 190 of 200 marked, values kept and `discard()` clearing them; the sort, filter and paging freeze with `data-refusal`; the `historyLimit` ring of deltas; and the ported suite. They are checked by tests/staged_edits.test.mjs (jsdom) and tests/staged_history.test.mjs (the ring suite ported from Tables, no DOM, not imported from Tables).

Tests: full suite `node tests/run.mjs` (Linux node v18.19.1) on 225f005, watched to the end: "FLEXDESK TESTS: GREEN — 176 suite(s)", exit 0, no SKIPPED lines. An earlier run on the first rebase onto 4e73f9b was also green (175 suites). `node build.mjs` succeeded, and dist/ was restored and not committed.

App check: none. This is library code, and no consuming app uses `staged` yet (Tables' switch-over is Tables STORY-0217). The behaviour is covered by the jsdom suites only.

Choices for norman to confirm:
1. A commit that comes back with per-cell errors counts as writing nothing: every staged value stays, not only the failing ones.
2. `{ok:false, error}`, a rejection or a throw marks every staged cell with that one message.
3. `setData({rows})` drops the staged cells and the undo ring.
4. While a commit is out, no editor opens, and undo, redo and discard do nothing.

### 2026-10-21T07:42Z · norman_agent (status: review -> done)

norman decided on 2026-10-21 (Claude Code session) to release FlexDesk 0.17.0 now and to accept every story on the 0.17.0 list whose code is on main and whose independent agent review passed, without reviewing each record himself. Its code is on main (audited), so it is done and ships in 0.17.0.
