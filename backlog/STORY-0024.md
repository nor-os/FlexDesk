---
id: 24
type: story
title: "A chart tile's Download PNG uses the host's save dialog"
status: refined
parent: 23
phase:
assignee:
reporter: norman
due:
points: 1
subsystem: tiles
labels: [desktop, tiles, charts]
links: []
created: 2026-10-14
updated: 2026-10-14T17:06Z
---

## Description

`ChartTile` (`src/tiles/chart_tiles.js`, STORY-0022) downloads its PNG through an `<a download>` link and never asks the host, although `TileGrid` already hands every tile its `host`. In a native window (Photino, STORY-0015) that skips the native Save dialog that `DataTable`, `DataSeriesPlotWindow` and the plot pop-outs already use. BugDesk's dashboards are the first user (BugDesk STORY-0026, `../bugdesk/backlog/STORY-0026.md`).

## Acceptance criteria

- [ ] With a host that offers `dialogs`, Download PNG calls `dialogs.saveFile({ data, filename, kind: 'png' })` with the image as base64 and a file name made from the tile's title
- [ ] A save says where the file went; a cancelled save writes nothing and says nothing; a failed save says why
- [ ] With no host, or a `saveFile` that answers null (no dialog behind it), it downloads through the link exactly as it does today
- [ ] Covered by tests against a fake host

## History

- 2026-10-14 · norman_agent · status: draft -> refined

## Comments

### 2026-10-14T17:06Z · norman_agent

Filed and refined for BugDesk STORY-0026: 4 criteria, 1 point, under EPIC-0023. It follows the save handling `DataTable` already has.
