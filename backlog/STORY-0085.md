---
id: 85
type: story
title: "DataTable copies a selected cell range as tab-separated text"
status: in-progress
parent: 1
phase:
assignee: norman_agent
reporter: norman
due:
points: 2
subsystem: grid
labels: [grid, editing, tables-consumer]
links: [blocked-by 3]
created: 2026-10-18
updated: 2026-10-21T06:09Z
---

## Description

Ctrl+C in cell mode (STORY-0003) copies the selected range as TSV, the format Excel and Sheets read. The TSV writer is shared with paste (STORY-0090).

Owner decisions (norman, 2026-10-18): FlexDesk provides every UI operation and mode generically and apps (Tables, BugDesk, EcoSim) configure it; editing lives in DataTable as opt-in options, with the logic in new modules (cell_selection.js, cell_editor_host.js, staged_history.js, series.js), so there is one table component; the whole split ships in 0.17.0 (STORY-0069). A table that sets none of the new options behaves exactly as in 0.16. Tables' switch-over from its own grid is Tables' work (Tables STORY-0217), not a criterion here.

## Acceptance criteria

- [ ] A 3×4 range copies 3 lines of 4 tab-separated values, in the order shown after sort and filter
- [ ] With no range, Ctrl+C copies the cursor cell's value alone
- [ ] A copied cell is its raw value, not the text it shows: a Price cell showing `1,234.50` (value 1234.5) copies as `1234.5`; dates copy as ISO
- [ ] In cell mode the right-click menu offers "Copy Cells" (the same tab-separated raw values as Ctrl+C) and no "Copy as CSV"; Ctrl+Shift+C is not bound
- [ ] Hidden columns are left out, and a value containing a tab, newline or quote is quoted the way Excel quotes it
- [ ] In row mode, Ctrl+C and the copy menu work as before
- [ ] The generic behaviour Tables' grid/clipboard tests (TSV writing) checks has a FlexDesk suite under tests/ that passes (ported, not imported from Tables)

## History

- 2026-10-18 · norman_agent · status: draft -> refined
- 2026-10-20 · norman_agent · status: refined -> in-progress
- 2026-10-20 · norman_agent · assignee: (none) -> norman_agent

## Comments

### 2026-10-18T10:34Z · norman_agent (status: draft -> refined)

Split out of STORY-0003 with norman (Claude Code session, 2026-10-18): 5 criteria, 2 points, parented to EPIC-0001, in 0.17.0 by his decision. Correct the criteria before anything is built against them.

### 2026-10-20T12:53Z · norman_agent

Status: needs_owner. norman, please confirm or change two STORY-0085 choices that the record does not settle. Neither breaks a released API, because 0.16.1 has no cell mode.

1. In cell mode, "Copy as CSV" and Ctrl+Shift+C copy the selected cells as CSV with no header line, the same cells Ctrl+C copies as TSV. The criteria only cover Ctrl+C/TSV, and the 0.17-dev README said the copy menu copied rows in cell mode. Is cells-as-CSV right?
2. A copied cell is the text the cell shows: typed-column formatting, formatValue and 4-decimal numbers all apply, and a refused or pending value is copied as shown. It is not the raw value, although criterion 2 says "the cursor cell's value". One exception: an empty (null) cell copies as '' unless nullDisplay is set, even when formatValue or a typed column would draw something else. Is the shown text right, or should a copy use raw values?

Also confirm the new label "Copy Cells" for the cell-mode copy item.

Since the last handback I fixed the reviewer's label issue and pushed commit 61960fa to story-0085 (fast-forward from 21935c9):
- In cell mode the first item of the right-click menu now reads "Copy Cells". "Copy as CSV" keeps its label, and row mode still says "Copy Row(s)", so tests/context_menu_items.test.mjs passes unchanged.
- In src/ui/components/data_table.js, the constant COPY_MENU_HTML became `copyMenuHtml(cells)`. All three places that draw the menu call `copyMenuHtml(!!this._cellGrid)`. Cell mode is fixed for the table's whole life, so the label cannot go stale.
- tests/cell_copy.test.mjs §4 checks the "Copy Cells" and "Copy as CSV" labels in cell mode; §5 checks row mode still says "Copy Row(s)".
- README.md line 1294 says how the label differs in cell mode.

Checks: full suite green (175 suites, exit 0, no SKIPPED lines); `node build.mjs` succeeded, dist reverted afterwards, worktree clean; origin/main had no new commits, so nothing needed merging.

Open: once norman answers, record his decision here. If he approves all three points (cells as CSV, shown text, the "Copy Cells" label), the branch is ready for review as it stands at story-0085 @ 61960fa. If he decides otherwise, the code to change is _copyCells in src/ui/components/data_table.js and copyMatrix in cell_grid.js. Nothing landed. Waiting on norman.

### 2026-10-21T06:09Z · norman_agent

Two criteria added by norman (Claude Code session, 2026-10-21), answering the question above: (1) a copy carries raw values, not the shown text; (2) cell mode has no CSV copy at all: the menu offers only "Copy Cells", and Copy as CSV needs no keyboard shortcut anywhere, so Ctrl+Shift+C is not bound. Row mode is unchanged.
