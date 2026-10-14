---
id: 25
type: story
title: "DataTable's CSV button is there on a one-page table and names its file"
status: review
parent: 23
phase:
assignee: norman
reporter: norman
due:
points: 1
subsystem: widgets
labels: [desktop, data-table]
links: []
created: 2026-10-14
updated: 2026-10-14T17:35Z
---

## Description

`showExportButton` puts the "Download visible rows as CSV" button in the pagination strip, and the strip is not drawn when everything fits on one page, so on most tables the button never shows. Every table also saves as `data.csv`. In a desktop window the file name is the one thing the native Save dialog suggests. BugDesk's lists are the first user (BugDesk STORY-0026, `../bugdesk/backlog/STORY-0026.md`).

## Acceptance criteria

- [x] With `showExportButton`, the button is there when the table fits on one page, in both pagers, and the strip shows no page buttons there
- [x] Without `showExportButton`, a one-page table still draws no strip, as today
- [x] A new `exportFilename` option (a string, or a function of the table) names the file the button saves; without it the name is `data.csv`, as today
- [x] Covered by tests

## History

- 2026-10-14 · norman_agent · status: draft -> refined
- 2026-10-14 · norman_agent · status: refined -> in-progress
- 2026-10-14 · norman_agent · assignee: (unset) -> norman_agent
- 2026-10-14 · norman_agent · status: in-progress -> review
- 2026-10-14 · norman_agent · assignee: norman_agent -> norman

## Comments

### 2026-10-14T17:20Z · norman_agent

Filed and refined for BugDesk STORY-0026: 4 criteria, 1 point, under EPIC-0023. It ships in 0.14.1 with STORY-0024.

### 2026-10-14T17:35Z · norman_agent

Built in dc4a342, released as 0.14.1 (751beda, on npm). All 4 criteria ticked.

- With `showExportButton`, a table that fits on one page draws a strip holding only the export button (`.twm-pagination-controls--export-only`, no page buttons). That holds for the 0.6 strip and the 0.7 pager, at the top or the bottom. Without the option, nothing changes.
- `exportFilename`, a string or `(table) => string`, names the file; without it the name is `data.csv`. The button code now lives in one place, `_createExportBtn`, shared by both pagers.
- `tests/export_button.test.mjs` is new (11 checks). README has a 0.14.1 section.
- Checked in BugDesk's desktop window: a one-row bug queue shows the button, and it opens "Save active.csv".
