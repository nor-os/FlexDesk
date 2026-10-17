---
id: 61
type: story
title: "A plot-config editor panel for the charts plot_config model"
status: draft
parent: 59
phase:
assignee:
reporter: norman
due:
points: 8
subsystem: charts
labels: [charts, new-component]
links: [blocked-by 60]
created: 2026-10-17
updated: 2026-10-17T07:55Z
---

## Description

renderPlotConfigEditor(container, config, options) edits {layout, subplots} in place with onChange: layout picker and subplot tabs, X (time or series), Y axes list (label, scale, position, min/max/step), Z axis for 3D, series rows (picker via AutocompleteField fed by seriesProvider, label, colour, width, dash, stack group, optional overlay source), chart type, legend, interpolation, NaN handling, reference lines and shaded bands, the toggles of any injected series transforms, plus an extraSeriesFields hook. Fits PlotPopoutWindow's configRenderer slot.

Related EcoSim records: EcoSim STORY-0077 (`../EcoSim/backlog/STORY-0077.md`).

Filed from the EcoSim -> FlexDesk 0.16 migration analysis (2026-10-17).

## Acceptance criteria

- [ ] Choosing layout 1x2 creates a second subplot tab with a default subplot
- [ ] Adding a series calls onChange and the series appears in the config
- [ ] Selecting a 3D chart type shows the Z axis and disables extra Y axes
- [ ] The series picker shows suggestions from seriesProvider
- [ ] A seriesProvider that rejects shows no suggestions and keeps the typed text
- [ ] dispose() disposes every AutocompleteField it created
