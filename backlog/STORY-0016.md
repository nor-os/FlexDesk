---
id: 16
type: story
title: "DataTable: a select mode - a per-table toggle, a checkbox column, and a click that ticks rows instead of opening them"
status: in-progress
parent: 1
phase:
assignee: norman_agent
reporter: norman
points: 3
subsystem: datatable
labels: [datatable, bugdesk-consumer]
links: []
created: 2026-10-14
updated: 2026-10-14T06:29Z
---

## Description

BugDesk wants to act on many records at once (BugDesk STORY-0029,
`../bugdesk/backlog/STORY-0029.md`: change the assignee or the status of every
selected record). DataTable can already hold a multi-row selection (Ctrl and
Shift), but a list whose click opens a row (`onRowActivate`, or a consumer's
`onRowClick`) makes picking twenty rows a Ctrl-click marathon with no way to see
which rows are picked except the highlight, and touch has no Ctrl at all.

A table should be able to offer a **select mode**: a toggle in the table itself,
a checkbox per row while it is on, and a plain click that ticks a row rather than
opening it. It is opt-in and sits beside the existing options, so a table built
without it draws and behaves exactly as before.

## Acceptance criteria

- [ ] A table built with `selectToggle: true` (and a multi-row `selectable`) shows a toggle button in a narrow leading column header; a table without it renders exactly as before
- [ ] Pressing the toggle (or `setSelectMode(true)`) shows a checkbox in every row of that column and a select-all checkbox in its header; pressing it again hides them; `isSelectMode()` and `onSelectModeChange(on)` report it
- [ ] In select mode a plain click on a row (or its checkbox) ticks or unticks just that row, Shift-click adds the range from the last ticked row, and Space ticks the current row
- [ ] In select mode no gesture opens a row: `onRowActivate` does not fire for click, double-click or Enter
- [ ] The header checkbox selects every row the filters let through (on every page) when not all are selected, clears the selection otherwise, and shows checked / mixed / unchecked to match
- [ ] Remembered column widths, hidden columns, sort, filters and copy keep working with the extra column, and a remembered width does not shift onto a different column when the mode flips
- [ ] `selectToggle` on a `selectable: 'single'` or `false` table is ignored with a console warning
- [ ] Tests cover the above; the full suite passes

## History

- 2026-10-14 · norman_agent · status: draft -> refined
- 2026-10-14 · norman_agent · status: refined -> in-progress
- 2026-10-14 · norman_agent · assignee:  -> norman_agent

## Comments

### 2026-10-14T06:29Z · norman_agent

Filed, refined and taken on together, for the user's request in a BugDesk
session ("a button for each table to toggle select multiple"; the user placed it
in FlexDesk). 8 criteria, 3 points, under EPIC-0001.
