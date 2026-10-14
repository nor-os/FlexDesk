---
id: 22
type: story
title: "Chart and KPI tiles that render @flexdesk/charts traces on a TileGrid"
status: draft
parent: 21
phase:
assignee:
reporter: norman
points: 5
subsystem: tiles
labels: [dashboards, charts, tiles, additive]
links: []
created: 2026-10-14
updated: 2026-10-14T10:20Z
---

## Description

A `ChartTile` (TileBase subclass over `buildTrace` + `createChart`/`updateChart`) and a `KpiTile`
(`buildIndicatorTrace`, or plain DOM when Plotly is absent), registered through `registerWidget`. The tile takes
already-computed series (`{x, y, name, ...}` or `{labels, values}`) plus overlay shapes (a "today" line, an ideal
line); computing the series from records is the embedder's job. Both follow the light/dark theme, resize with
the tile, and show TileBase's empty/loading/error states.

BugDesk's dashboards (BugDesk STORY-0036 and STORY-0037, `../bugdesk/backlog/`) are the first user; the
burndown there needs step interpolation, a dashed second series and a vertical "today" marker.

## Acceptance criteria

- [ ] A registered chart tile renders line, bar, area, pie, donut and histogram from data passed to `setData`, without the embedder subclassing TileBase
- [ ] A line chart can mix a step series, a dashed series and a vertical marker at a given x (enough for a burndown)
- [ ] A KPI tile shows one number with a label and an optional delta
- [ ] Tiles redraw on resize and on a light/dark theme switch, and show the empty state when given no data
- [ ] Without Plotly loaded, a chart tile shows a clear error state instead of throwing; the KPI tile still renders
- [ ] The tiles' config (chart type, title, unit) round-trips through `getLayout()`/`setLayout()`

## History

## Comments
