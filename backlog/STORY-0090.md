---
id: 90
type: story
title: "DataTable pastes a block from Excel at the cursor cell, with overrun handling"
status: done
parent: 1
phase:
assignee: norman
reporter: norman
due:
points: 5
subsystem: grid
labels: [grid, editing, tables-consumer]
links: [blocked-by 85, blocked-by 87, blocked-by 88]
created: 2026-10-18
updated: 2026-10-21T19:07Z
---

## Description

A TSV block pasted at the cursor cell fills right and down; each value is parsed by its column's editor and all of it is staged as one batch.

Owner decisions (norman, 2026-10-18): FlexDesk provides every UI operation and mode generically and apps (Tables, BugDesk, EcoSim) configure it; editing lives in DataTable as opt-in options, with the logic in new modules (cell_selection.js, cell_editor_host.js, staged_history.js, series.js), so there is one table component; the whole split ships in 0.17.0 (STORY-0069). A table that sets none of the new options behaves exactly as in 0.16. Tables' switch-over from its own grid is Tables' work (Tables STORY-0217), not a criterion here.

## Acceptance criteria

- [x] A 3×2 block lands at the cursor and stages 6 cells as one undo entry
- [x] Columns past the last one are dropped, with a warning naming how many
- [x] Rows past the last loaded row call `onPasteOverrun({rows: n})`; resolving `false` stages nothing, resolving `true` passes the extra rows to `onRowsAppend`
- [x] A value that won't parse marks its cell and the rest of the block still stages
- [x] A non-editable target cell is skipped and marked
- [x] The generic behaviour Tables' grid/clipboard tests (TSV parsing and paste) checks has a FlexDesk suite under tests/ that passes (ported, not imported from Tables)

## History

- 2026-10-18 · norman_agent · status: draft -> refined
- 2026-10-21 · norman_agent · status: refined -> in-progress
- 2026-10-21 · norman_agent · assignee: (none) -> norman_agent
- 2026-10-21 · norman_agent · status: in-progress -> done
- 2026-10-21 · norman_agent · assignee: norman_agent -> norman

## Comments

### 2026-10-18T10:34Z · norman_agent (status: draft -> refined)

Split out of STORY-0003 with norman (Claude Code session, 2026-10-18): 6 criteria, 5 points, parented to EPIC-0001, in 0.17.0 by his decision. Correct the criteria before anything is built against them.

### 2026-10-21T19:07Z · norman_agent (status: in-progress -> done)

Done by norman's 2026-10-21 process decision (FlexDesk stories go to done once landed and independently reviewed). Landed on main at d848826 (built on story-0090, one commit on 0fa5722).

Built: DataTable opt-in options `pasteable` (needs `staged`), `onPasteOverrun`, `onRowsAppend` and a public `paste(text)`; logic in the new src/ui/components/cell_paste.js; Ctrl+V via the `paste` event on the focused table (editors and form fields keep theirs); `fromTSV` in tsv.js (port of Tables' clipboard reader, exported via widgets.js); values parsed by each column's editor parse; one `staged.stageMany` undo entry, range set to the block; unparseable cells marked like an editor refusal; non-editable targets drawn `twm-dt-cell--paste-skipped`; README section "Pasting a block from Excel (0.17.1)". A table without the options behaves as in 0.16.

Ticked all 6 criteria (3x2 block as one undo entry; column overflow dropped with a warning naming the count; row overrun via onPasteOverrun/onRowsAppend; unparseable value marked while the rest stages; non-editable target skipped and marked; ported FlexDesk suites tests/cell_paste.test.mjs and tests/tsv_read.test.mjs).

Choices for norman to confirm (all additive): paste is a separate opt-in `pasteable: true`; "last loaded row" is the last row in shown order after filter/sort (client-paged tables can continue onto the next page's rows); no `onPasteOverrun` means an overrun stages nothing and warns; `true` without `onRowsAppend` drops the extra rows with a warning; `onRowsAppend({rows, errors})` gets full-width rows (null outside pasted columns and for unparseable values, listed in `errors`), the fitting rows stage after it settles; column overflow warns on the console and as a 'warn' toast; no "Paste" context-menu item.

Tests: `node tests/run.mjs` (node v18.19.1) on d848826: "FLEXDESK TESTS: GREEN — 191 suite(s)", exit 0, no skips; `node build.mjs` exit 0 (dist restored). Individually green: cell_paste, tsv_read, tsv, staged_edits, staged_history, fill_handle, cell_copy, crosstab, cell_editor, cell_editors, cell_editors_ported, cell_selection, no_app_globals, exports_packed, state_guard_defaults, css_exports.
