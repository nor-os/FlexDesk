---
id: 66
type: story
title: "DataTable column groups and add/rename/delete of rows and columns from the headers"
status: review
parent: 1
phase:
assignee: norman
reporter: norman
due:
points: 5
subsystem: datatable
labels: [datatable, editable-grid]
links: [blocked-by 3]
created: 2026-10-17
updated: 2026-10-20T15:56Z
---

## Description

Child of STORY-0003: uses its cell-edit lifecycle and header-menu hook and lands after it. A declarative column-group spec draws a second header row whose cells span their members and stay aligned after column fit; group and column headers expose consumer action slots; opt-in structural callbacks onColumnAdd(groupKey), onColumnRename(colKey, name) via the inline renamer, onColumnDelete, onRowAdd, onRowDelete; an empty group keeps one placeholder column so its add control is reachable. The consumer owns the data.

Related EcoSim records: EcoSim STORY-0099 (`../EcoSim/backlog/STORY-0099.md`).

Filed from the EcoSim -> FlexDesk 0.16 migration analysis (2026-10-17).

## Acceptance criteria

- [x] Two groups of 3 and 2 columns render a group row with spans 3 and 2 aligned to the body columns
- [x] Renaming a column header calls onColumnRename with the new name, and Esc cancels
- [x] The add control on a group header calls onColumnAdd with that group's key
- [x] An empty group shows a placeholder column with its add control
- [x] A table with no groups renders exactly as before

## History

- 2026-10-17 · norman_agent · status: draft -> refined
- 2026-10-17 · norman_agent · status: refined -> in-progress
- 2026-10-17 · norman_agent · assignee:  -> norman_agent
- 2026-10-20 · norman_agent · status: in-progress -> review
- 2026-10-20 · norman_agent · assignee: norman_agent -> norman

## Comments

### 2026-10-17T07:55Z · norman_agent (status: draft -> refined)

Refined: 5 acceptance criteria, 5 points, parented to EPIC-0001. Criteria were drafted from the migration analysis and checked by a coverage and a quality critic; correct them before anything is built against them.

### 2026-10-17T23:35Z · norman_agent

Status: needs_owner. This story says it lands after STORY-0003 and uses STORY-0003's header-menu hook and cell-edit lifecycle. STORY-0003 is still a draft (no assignee, no points, not refined or built), and none of that exists in the DataTable yet: src/ui/components/data_table.js (6945 lines on origin/main 3a34992) has neither a header-menu hook nor a cell-edit lifecycle, and a grep across every local branch for headerMenu, onColumnRename and columnGroups finds nothing.

I stopped before writing any code. Renaming could use the existing attachInlineRenamer (src/ui/components/inline_renamer.js:25), but the consumer action slots on group and column headers would be a new public DataTable API designed without the header-menu hook STORY-0003 is meant to define. That could leave two overlapping header-extension APIs, which the repo rules forbid (DRY, one implementation per feature).

Which way do you want it?

- (a) Wait: mark this story blocked-by STORY-0003 until that is refined and built.
- (b) Build this story on its own now: header action slots for groups and columns, renaming through attachInlineRenamer, and the opt-in callbacks onColumnAdd, onColumnRename, onColumnDelete, onRowAdd and onRowDelete, with STORY-0003's later header-menu hook built on top of these slots. That means dropping "uses its cell-edit lifecycle and header-menu hook and lands after it" from the description.

If (b): should onColumnDelete, onRowAdd and onRowDelete, and "stays aligned after column fit", also get acceptance criteria? The description asks for them but the five criteria don't cover them.

Branch: story-0066 (worktree /mnt/c/Users/Norman/repos/FlexDesk-story-0066, from origin/main, node_modules symlinked), no commits, nothing pushed. Nothing landed on main. Waiting on norman.

### 2026-10-18T09:31Z · norman_agent

norman (Claude Code session, 2026-10-18), answering the question above: STORY-0003 (the editable grid) is refined and built first, and goes into 0.17.0; this story builds on its header-menu hook and cell-edit lifecycle. The link is now blocked-by 3. Work here waits until STORY-0003 has landed.

### 2026-10-20T15:56Z · norman_agent

Landed on main, handing back to norman for review. Landed tip on main: e08c09f0a0807b22380a93ae2d9e686f52739536.

What was built: `columnGroups` in DataTable (src/ui/components/column_groups.js). It draws a group row as its own `table.twm-dt-groups` in the header wrap. That row copies the header's column widths, table width and sideways scroll after every fit, auto-size and drag. An empty group keeps one placeholder column (header with its add control, empty filter cell, empty body cell, and no data column). Structural edits come from the headers (src/ui/components/table_structure.js): `onColumnRename` through `attachInlineRenamer` (Enter or blur commits, Esc cancels), `onColumnDelete`, `onRowAdd`, `onRowDelete`, and the `groupActions`/`onGroupAction` and `columnActions`/`onColumnAction` button slots. Both use one shared header action button (src/ui/components/header_actions.js). The reviewer's stale-spec fix is in: `groupActions` is always asked with the group object from the live `columnGroups`, and the §3 case in tests/column_groups.test.mjs fails on the old code.

Ticked, all 5: spans 3 and 2 aligned to the body columns; rename calls onColumnRename and Esc cancels; the group add control calls onColumnAdd with the group's key; an empty group shows a placeholder column with its add control; a table with no groups renders exactly as before.

Landing: the branch was rebased onto origin/main, which linearised it and dropped the two merge commits. The rebase conflicted with STORY-0088 (staged edits) and STORY-0086 (column reorder) in README.md, css/flexdesk.css and data_table.js, and I kept both sides. `_domIdxOf`/`_dataIdxOfDom` ask the groups' layout when a placeholder is drawn, and otherwise use 0086's drawn order. The column signature carries both the order and the placeholders. The header menu shows Move left/right, then the structural items, then the chooser. One new commit makes the group layout follow 0086's drawn order (`_shownColumns()`), not natural order: e08c09f "STORY-0066: the group row and the placeholders follow STORY-0086's drawn column order". It comes with a new §6 in tests/column_groups.test.mjs (columnOrder splits a group into runs, moveColumn redraws the row, and a placeholder plus a reorder keeps body cells under their headers). That §6 fails on the code before the commit (8 assertions) and passes with it. origin/story-0066 still holds the pre-rebase history (tip ad5a7be, with merges). It was not force-pushed.

Tests: `node tests/run.mjs` with Linux node, run to completion on the final tip after the last rebase onto e53c64a: "FLEXDESK TESTS: GREEN — 179 suite(s)", EXIT=0, no ': SKIPPED' lines. `node build.mjs` succeeded, and dist/ was reverted and not committed.

App check: none in a live app. FlexDesk is the library, and all checking was in the jsdom suites. The EcoSim side is EcoSim STORY-0099 (`../EcoSim/backlog/STORY-0099.md`).
