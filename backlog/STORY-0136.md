---
id: 136
type: story
title: "renderPlotGrid draws candlestick and sankey charts"
status: draft
parent:
phase:
assignee: norman
reporter: norman_agent
due:
points: 3
subsystem: charts
labels: [charts, migration]
links: []
created: 2026-10-30
updated: 2026-10-30T21:20Z
---

## Description

`@flexdesk/charts` has no candlestick (OHLC) and no sankey chart type, so `renderPlotGrid` and `buildTrace` can't draw either from a plot config. EcoAgent's market price chart (EcoAgent STORY-0054, `../EcoAgent/backlog/STORY-0054.md`) and its SFC sankey (STORY-0053) build raw Plotly traces in the app and pass them through. EcoSim's SankeyTile does the same. The app ends up owning the trace shape, the colours and the theme for these two kinds, while every other kind follows FlexDesk's theme from the config.

Filed from the EcoAgent -> FlexDesk 0.17 migration (2026-10-30).

## Acceptance criteria

- [ ] A plot config series can be a candlestick (open, high, low, close, optional volume coloured by direction), drawn in FlexDesk's chart theme
- [ ] A plot config can draw a sankey from node and link data, in FlexDesk's chart theme
- [ ] Both work in renderPlotGrid subplots and in the pop-out plot window, including PNG export

## History

- 2026-10-30 · norman_agent · status: (none) -> draft

## Comments
