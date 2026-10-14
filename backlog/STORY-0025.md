---
id: 25
type: story
title: "DataTable's CSV button is there on a one-page table and names its file"
status: in-progress
parent: 23
phase:
assignee: norman_agent
reporter: norman
due:
points: 1
subsystem: widgets
labels: [desktop, data-table]
links: []
created: 2026-10-14
updated: 2026-10-14T17:21Z
---

## Description

`showExportButton` puts the "Download visible rows as CSV" button in the pagination strip, and the strip is not drawn when everything fits on one page, so on most tables the button never shows. Every table also saves as `data.csv`. In a desktop window the file name is the one thing the native Save dialog suggests. BugDesk's lists are the first user (BugDesk STORY-0026, `../bugdesk/backlog/STORY-0026.md`).

## Acceptance criteria

- [ ] With `showExportButton`, the button is there when the table fits on one page, in both pagers, and the strip shows no page buttons there
- [ ] Without `showExportButton`, a one-page table still draws no strip, as today
- [ ] A new `exportFilename` option (a string, or a function of the table) names the file the button saves; without it the name is `data.csv`, as today
- [ ] Covered by tests

## History

- 2026-10-14 · norman_agent · status: draft -> refined
- 2026-10-14 · norman_agent · status: refined -> in-progress
- 2026-10-14 · norman_agent · assignee: (unset) -> norman_agent

## Comments

### 2026-10-14T17:20Z · norman_agent

Filed and refined for BugDesk STORY-0026: 4 criteria, 1 point, under EPIC-0023. It ships in 0.14.1 with STORY-0024.
