---
id: 3
type: story
title: "The editable grid: selection, keyboard over cells, editors, staged edits, fill handle and paste"
status: refined
parent: 1
phase: 
assignee: 
reporter: norman
points: 8
subsystem: grid
labels: [grid, editing, tables-consumer]
links: []
created: 2026-10-11
updated: 2026-10-18T10:34Z
---
## Description

The FlexDesk half of Tables' STORY-0217. The product owner, 2026-10-05/06: *"B, everything"*: FlexDesk owns the whole Excel grid, editing included (plan features #38–#49). Refined 2026-10-18 into this first slice plus STORY-0085 to STORY-0091.

This slice: an opt-in cell mode on DataTable. A cursor cell plus an anchor/focus range, Excel-style keys over cells, a consumer hook that adds items to the header's right-click menu, and an editor host that opens, commits and cancels one cell through an injected editor factory (a plain text input by default). STORY-0066 builds on the header-menu hook and the cell-edit lifecycle. Column hide already shipped (STORY-0012).

Split out: STORY-0085 range copy as TSV, STORY-0086 column reorder, STORY-0087 the six basic editors, STORY-0088 staged edits with undo/redo, STORY-0089 fill handle with series, STORY-0090 paste from Excel with overrun, STORY-0091 the crosstab grid.

Compatibility to hold: getSelection() keeps returning row indices in cell mode (the rows the range touches); Ctrl+C, Ctrl+A and Escape change meaning only under selectionMode: 'cells'; the header hook adds to the column chooser's items rather than replacing them.

Owner decisions (norman, 2026-10-18): FlexDesk provides every UI operation and mode generically and apps (Tables, BugDesk, EcoSim) configure it; editing lives in DataTable as opt-in options, with the logic in new modules (cell_selection.js, cell_editor_host.js, staged_history.js, series.js), so there is one table component; the whole split ships in 0.17.0 (STORY-0069). A table that sets none of the new options behaves exactly as in 0.16. Tables' switch-over from its own grid is Tables' work (Tables STORY-0217), not a criterion here.

## Acceptance criteria

- [ ] With `selectionMode: 'cells'`, a click selects one cell and Shift+click from (0,0) to (2,3) selects a 3×4 range; `getCellSelection()` returns `{anchor, focus, range}` and every cell in the range carries `twm-dt-cell--selected`
- [ ] Arrows move the cursor cell, Ctrl+arrow jumps to the edge of the block of filled cells, Home/End go to the row's ends, Tab moves right and wraps to the next row, ArrowDown on the last row stays put; under `virtualize` with 1,000 rows, the cursor moved to row 900 is drawn and in view
- [ ] `headerMenu(colIdx, ctx) => items` puts those items in the header's right-click menu and choosing one calls `onHeaderMenuAction(action, colIdx)`; with `columnChooser` the chooser items follow behind a separator; returning `[]` or `null` shows only what would show without the hook
- [ ] With `editable` and `editors: {[colIdx|type]: ({value,row,column,commit,cancel}) => el}`, F2, Enter, a double-click or a printable key opens the editor on the cursor cell; Enter commits and moves down, Tab commits and moves right, Escape restores the original value without calling anything; a commit calls `onCellCommit({rowIdx,colIdx,value,previous})` exactly once
- [ ] `onCellCommit` resolving `{ok:false,error}` or rejecting leaves the typed value in the cell marked with the message; a non-editable column opens no editor; `setData` or `render()` while an editor is open does not destroy it (the redraw waits for commit or cancel)
- [ ] A table with none of these options passes every existing suite unchanged; combining `selectionMode: 'cells'` with `selectToggle` or `keyboardNav` is ignored with a console warning; the README documents the options
- [ ] The generic behaviour Tables' grid/render.test.mjs and virtual_window.test.mjs (cell rendering, cursor and selection over a virtual window) checks has a FlexDesk suite under tests/ that passes (ported, not imported from Tables)

## History

- 2026-10-11 · norman_agent · status: (unset) -> draft
- 2026-10-18 · norman_agent · status: draft -> refined

## Comments

### 2026-10-11T11:56Z · norman_agent

Filed while setting up FlexDesk's own BugDesk store (2026-10-11). Until today FlexDesk's work was tracked in Tables' backlog; carried over from Tables STORY-0217, which keeps the Tables adoption.

### 2026-10-18T10:34Z · norman_agent (status: draft -> refined)

Refined with norman (Claude Code session, 2026-10-18): 7 criteria, 8 points, kept under EPIC-0001 as the first slice; split out STORY-0085 to STORY-0091 (all in 0.17.0, his decision). Criterion "Tables' grid/render.test.mjs, virtual_window.test.mjs and staged_history.test.mjs pass against the FlexDesk grid" is rewritten at his direction to the FlexDesk part only (the generic behaviour is ported into FlexDesk's own tests); Tables' switch-over is Tables STORY-0217. Criterion "released and published" moves to STORY-0069. Editing is DataTable options, not a separate class (his decision).
