---
id: 3
type: story
title: "The editable grid: selection, keyboard over cells, editors, staged edits, fill handle and paste"
status: done
parent: 1
phase: 
assignee: norman
reporter: norman
points: 8
subsystem: grid
labels: [grid, editing, tables-consumer]
links: []
created: 2026-10-11
updated: 2026-10-21T07:42Z
---
## Description

The FlexDesk half of Tables' STORY-0217. The product owner, 2026-10-05/06: *"B, everything"*: FlexDesk owns the whole Excel grid, editing included (plan features #38–#49). Refined 2026-10-18 into this first slice plus STORY-0085 to STORY-0091.

This slice: an opt-in cell mode on DataTable. A cursor cell plus an anchor/focus range, Excel-style keys over cells, a consumer hook that adds items to the header's right-click menu, and an editor host that opens, commits and cancels one cell through an injected editor factory (a plain text input by default). STORY-0066 builds on the header-menu hook and the cell-edit lifecycle. Column hide already shipped (STORY-0012).

Split out: STORY-0085 range copy as TSV, STORY-0086 column reorder, STORY-0087 the six basic editors, STORY-0088 staged edits with undo/redo, STORY-0089 fill handle with series, STORY-0090 paste from Excel with overrun, STORY-0091 the crosstab grid.

Compatibility to hold: getSelection() keeps returning row indices in cell mode (the rows the range touches); Ctrl+C, Ctrl+A and Escape change meaning only under selectionMode: 'cells'; the header hook adds to the column chooser's items rather than replacing them.

Owner decisions (norman, 2026-10-18): FlexDesk provides every UI operation and mode generically and apps (Tables, BugDesk, EcoSim) configure it; editing lives in DataTable as opt-in options, with the logic in new modules (cell_selection.js, cell_editor_host.js, staged_history.js, series.js), so there is one table component; the whole split ships in 0.17.0 (STORY-0069). A table that sets none of the new options behaves exactly as in 0.16. Tables' switch-over from its own grid is Tables' work (Tables STORY-0217), not a criterion here.

## Acceptance criteria

- [x] With `selectionMode: 'cells'`, a click selects one cell and Shift+click from (0,0) to (2,3) selects a 3×4 range; `getCellSelection()` returns `{anchor, focus, range}` and every cell in the range carries `twm-dt-cell--selected`
- [x] Arrows move the cursor cell, Ctrl+arrow jumps to the edge of the block of filled cells, Home/End go to the row's ends, Tab moves right and wraps to the next row, ArrowDown on the last row stays put; under `virtualize` with 1,000 rows, the cursor moved to row 900 is drawn and in view
- [x] `headerMenu(colIdx, ctx) => items` puts those items in the header's right-click menu and choosing one calls `onHeaderMenuAction(action, colIdx)`; with `columnChooser` the chooser items follow behind a separator; returning `[]` or `null` shows only what would show without the hook
- [x] With `editable` and `editors: {[colIdx|type]: ({value,row,column,commit,cancel}) => el}`, F2, Enter, a double-click or a printable key opens the editor on the cursor cell; Enter commits and moves down, Tab commits and moves right, Escape restores the original value without calling anything; a commit calls `onCellCommit({rowIdx,colIdx,value,previous})` exactly once
- [x] `onCellCommit` resolving `{ok:false,error}` or rejecting leaves the typed value in the cell marked with the message; a non-editable column opens no editor; `setData` or `render()` while an editor is open does not destroy it (the redraw waits for commit or cancel)
- [x] A table with none of these options passes every existing suite unchanged; combining `selectionMode: 'cells'` with `selectToggle` or `keyboardNav` is ignored with a console warning; the README documents the options
- [x] The generic behaviour Tables' grid/render.test.mjs and virtual_window.test.mjs (cell rendering, cursor and selection over a virtual window) checks has a FlexDesk suite under tests/ that passes (ported, not imported from Tables)

## History

- 2026-10-11 · norman_agent · status: (unset) -> draft
- 2026-10-18 · norman_agent · status: draft -> refined
- 2026-10-19 · norman_agent · status: refined -> in-progress
- 2026-10-19 · norman_agent · assignee: (unset) -> norman_agent
- 2026-10-20 · norman_agent · status: in-progress -> review
- 2026-10-20 · norman_agent · assignee: norman_agent -> norman
- 2026-10-21 · norman_agent · status: review -> done

## Comments

### 2026-10-11T11:56Z · norman_agent

Filed while setting up FlexDesk's own BugDesk store (2026-10-11). Until today FlexDesk's work was tracked in Tables' backlog; carried over from Tables STORY-0217, which keeps the Tables adoption.

### 2026-10-18T10:34Z · norman_agent (status: draft -> refined)

Refined with norman (Claude Code session, 2026-10-18): 7 criteria, 8 points, kept under EPIC-0001 as the first slice; split out STORY-0085 to STORY-0091 (all in 0.17.0, his decision). Criterion "Tables' grid/render.test.mjs, virtual_window.test.mjs and staged_history.test.mjs pass against the FlexDesk grid" is rewritten at his direction to the FlexDesk part only (the generic behaviour is ported into FlexDesk's own tests); Tables' switch-over is Tables STORY-0217. Criterion "released and published" moves to STORY-0069. Editing is DataTable options, not a separate class (his decision).

### 2026-10-20T11:30Z · norman_agent (status: in-progress -> review)

Built: an opt-in cell mode on DataTable. `selectionMode: 'cells'` gives a cursor cell and an anchor/focus range (`getCellSelection()` returns `{anchor, focus, range}`, cells in the range carry `twm-dt-cell--selected`); Excel-style keys over cells (arrows, Ctrl+arrow to the edge of the filled block, Home/End, Tab/Shift+Tab with row wrap, the cursor kept drawn and in view under `virtualize`); the `headerMenu(colIdx, ctx)` hook with `onHeaderMenuAction`, its items ahead of the column chooser's behind a separator; and the editor host (`editable`, `editors` by column index or type, a text input by default) that opens on F2, Enter, double-click or a printable key, commits with Enter (down) or Tab (right), cancels with Escape, calls `onCellCommit` once, keeps the typed value marked on `{ok:false,error}` or a rejection, and defers `setData`/`render()` until the editor closes. The logic is in src/ui/components/cell_selection.js, cell_grid.js and cell_editor_host.js; the README documents the options. Combining cell mode with `selectToggle` or `keyboardNav` is ignored with a console warning.

Review fix: Tab on the grid's last cell and Shift+Tab on its first are no longer taken (`CellSelection.tabEnds(back)`; `CellGrid._onKey` returns false there), so focus leaves the table and there is no keyboard trap. Everywhere else Tab still moves right and wraps. The README and tests/cell_selection.test.mjs cover it.

Ticked all 7 criteria. Suites: tests/cell_selection.test.mjs, cell_editor.test.mjs, cell_virtual_window.test.mjs (the generic behaviour of Tables' grid/render and virtual_window tests, ported) and header_menu.test.mjs.

Landed: rebased branch story-0003 onto origin/main and fast-forwarded main to d075e71. origin/story-0003 still holds the pre-rebase history (98eb7af, with merge commits); it was not force-pushed.

Tests: full suite `node tests/run.mjs` on the rebased tree (d075e71): "FLEXDESK TESTS: GREEN — 173 suite(s)", exit 0, 0 SKIPPED lines. `node build.mjs` succeeded; dist/ was restored, not committed.

App check: none in this landing step. This is library code that no app uses yet; the suites above exercise it in jsdom. Tables adopts it in Tables STORY-0217.

### 2026-10-21T07:42Z · norman_agent (status: review -> done)

norman decided on 2026-10-21 (Claude Code session) to release FlexDesk 0.17.0 now and to accept every story on the 0.17.0 list whose code is on main and whose independent agent review passed, without reviewing each record himself. Its code is on main (audited), so it is done and ships in 0.17.0.
