---
id: 3
type: story
title: "The editable grid: selection, keyboard over cells, editors, staged edits, fill handle and paste"
status: draft
parent: 1
phase: 
assignee: 
reporter: norman
points: 
subsystem: grid
labels: [grid, editing, tables-consumer]
links: []
created: 2026-10-11
updated: 2026-10-11T11:56Z
---
## Description

The FlexDesk half of Tables' STORY-0217. The product owner, 2026-10-05/06: *"B, everything"*: FlexDesk owns the
whole Excel grid, editing included. Plan features #38–#49:

- cell and range selection with a cursor cell; keyboard over cells; TSV copy
- a header-menu hook; column reorder and hide
- the pivot's crosstab drawing
- the editor host and six basic editors (consumers inject their domain editors)
- staged edits with undo/redo
- the fill handle with series; paste from Excel with overrun

The consumer keeps its domain editors (injected), the write path behind `onCommit`, its toolbar, server reads, live
updates, history and sharing, and its row form. The grid's `onPageChange` goes with the move to `dataSource`.

## Acceptance criteria

- [ ] each feature opt-in, with tests in FlexDesk
- [ ] Tables' `grid/render.test.mjs`, `virtual_window.test.mjs` and `staged_history.test.mjs` pass against the FlexDesk grid
- [ ] released and published

## History

- 2026-10-11 · norman_agent · status: (unset) -> draft

## Comments

### 2026-10-11T11:56Z · norman_agent

Filed while setting up FlexDesk's own BugDesk store (2026-10-11). Until today FlexDesk's work was tracked in Tables' backlog; carried over from Tables STORY-0217, which keeps the Tables adoption.
