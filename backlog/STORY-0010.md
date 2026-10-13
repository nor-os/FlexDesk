---
id: 10
type: story
title: "DataTable: what BugDesk's copy still adds - a right-click item list, a render hook and displayed rows, a remembered page"
status: review
parent: 1
phase:
assignee: norman
reporter: norman
points: 5
subsystem: datatable
labels: [datatable, bugdesk-consumer]
links: []
created: 2026-10-12
updated: 2026-10-13T04:34Z
---

## Description

BugDesk still ships its own copy of DataTable (`bugdesk/ui/js/ui/components/data_table.js`)
for what FlexDesk's lacks. Its BugDesk STORY-0008
(`../bugdesk/backlog/STORY-0008.md`) deletes the copy once FlexDesk has these, so
every table fix stops being made twice. 0.5.0–0.7.0 already took the row key
(`getRowKey`), sort-to-first-page (`resetPageOnSort`) and opening a row with
its event (`onRowActivate`). Three things are left:

- **Right-click item list:** `contextMenuItems` (an array, or a function of the
  row) and `onContextMenuAction(action, rowIdx, row)`, drawn by the table's
  own context menu. `onRowContextMenu` today hands the event over and leaves
  the menu to the consumer.
- **Render hook and displayed rows:** `onRender` runs after every render, and
  `getDisplayedRows()` returns the rows after filter and sort, across all
  pages. BugDesk puts "12 of 40 open bugs shown" in its status bar from these.
- **A remembered page:** with `persistPage: true`, the client page is saved
  with the sort and filters under `persistKey` and restored on mount. It is off
  by default, because a key shared by different row sets must not reopen on a
  stale page (BugDesk BUG-0013).

All three are opt-in. A table that passes none behaves exactly as 0.9.1.

## Acceptance criteria

- [x] `contextMenuItems` (array or `(row, rowIdx) => items`) puts those items in the table's right-click menu for the row under the pointer, and choosing one calls `onContextMenuAction(action, rowIdx, row)`; separators and disabled items draw as in the existing context menu
- [x] `onRender(table)` is called after every render, and `getDisplayedRows()` returns the filtered, sorted rows across every page, not only the current one
- [x] With `persistPage: true` and a `persistKey`, the client page is restored on mount with the sort and filters; without it, or after a sort while `resetPageOnSort` is on, the table opens on page 1
- [x] A table given none of the new options renders and behaves as in 0.9.1, which the existing suites prove
- [x] Each feature has a test in `tests/`, the README documents the options, `tests/run.mjs` is GREEN and `node build.mjs --check` is OK

## History

- 2026-10-12 · norman_agent · status: refined -> in-progress
- 2026-10-12 · norman_agent · assignee: (unset) -> norman_agent
- 2026-10-13 · norman_agent · status: in-progress -> review
- 2026-10-13 · norman_agent · assignee: norman_agent -> norman

## Comments

### 2026-10-13T04:34Z · norman_agent (status: in-progress -> review)

Released in **0.11.0** (af11fb4, on npm). All criteria are met.

- `contextMenuItems`: an array, or `(row, rowIdx, ctx) => items`. The items go
  first in the table's own right-click menu, then the copy items.
  `onContextMenuAction(action, rowIdx, row, ctx)` fires after the menu closes.
- `onRender(table)` runs after every render. `getDisplayedRows()` returns the
  filtered, sorted rows across every page, as a copy.
- `persistPage` (off by default) saves the client page with the sort and
  filters under `persistKey`, clamped to the last page. A new filter, or a
  sort under `resetPageOnSort`, saves page 1.
- Not in the story, but BugDesk's copy needed it: `keyboardNav` (Up/Down/
  Home/End/Shift move the selection) and `onRowKeyDown(rowIdx, row, ev)`, so a
  consumer can bind Enter, Ctrl+Enter and Alt chords on the highlighted row.
- Tests: `context_menu_items`, `render_hook`, `persist_page`, `row_keys`, each
  with a "without the options" section. README updated. tests/run.mjs GREEN
  (85), build --check OK.
- Not added: remembering the highlighted row by key across a sort or refresh.
  BugDesk can do that from outside with `onSelectionChange` / `setSelection`,
  and I'd file it separately if wanted upstream.
