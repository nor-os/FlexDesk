---
id: 24
type: story
title: "A chart tile's Download PNG uses the host's save dialog"
status: review
parent: 23
phase:
assignee: norman
reporter: norman
due:
points: 1
subsystem: tiles
labels: [desktop, tiles, charts]
links: []
created: 2026-10-14
updated: 2026-10-14T17:35Z
---

## Description

`ChartTile` (`src/tiles/chart_tiles.js`, STORY-0022) downloads its PNG through an `<a download>` link and never asks the host, although `TileGrid` already hands every tile its `host`. In a native window (Photino, STORY-0015) that skips the native Save dialog that `DataTable`, `DataSeriesPlotWindow` and the plot pop-outs already use. BugDesk's dashboards are the first user (BugDesk STORY-0026, `../bugdesk/backlog/STORY-0026.md`).

## Acceptance criteria

- [x] With a host that offers `dialogs`, Download PNG calls `dialogs.saveFile({ data, filename, kind: 'png' })` with the image as base64 and a file name made from the tile's title
- [x] A save says where the file went; a cancelled save writes nothing and says nothing; a failed save says why
- [x] With no host, or a `saveFile` that answers null (no dialog behind it), it downloads through the link exactly as it does today
- [x] Covered by tests against a fake host

## History

- 2026-10-14 · norman_agent · status: draft -> refined
- 2026-10-14 · norman_agent · status: refined -> in-progress
- 2026-10-14 · norman_agent · assignee: (unset) -> norman_agent
- 2026-10-14 · norman_agent · status: in-progress -> review
- 2026-10-14 · norman_agent · assignee: norman_agent -> norman

## Comments

### 2026-10-14T17:06Z · norman_agent

Filed and refined for BugDesk STORY-0026: 4 criteria, 1 point, under EPIC-0023. It follows the save handling `DataTable` already has.

### 2026-10-14T17:35Z · norman_agent

Built in dc4a342, released as 0.14.1 (751beda, on npm). All 4 criteria ticked.

- `ChartTile._downloadPng` asks `this.host?.dialogs.saveFile({ data, filename, kind: 'png' })`: the base64 part of Plotly's data URL, and the name from the tile's title (`open-bugs-by-status.png`). A save toasts "Chart saved to <path>". A cancel writes nothing and says nothing. A failure toasts the host's error. No host, or a null answer, is the `<a download>` it always was.
- `tests/chart_tiles.test.mjs` §11 covers it against a fake host: all four answers, and no host.
- Checked in BugDesk's real desktop window: Download PNG on a dashboard tile opened "Save bugs-burndown.png", Cancel wrote nothing, and Save wrote a valid PNG and toasted the path. In a browser tab it is still a download.
- All 94 suites pass (run in parallel from a clean worktree), with nothing skipped.
