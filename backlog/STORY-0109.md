---
id: 109
type: story
title: "The plot-config editor can hide sections, and reference lines can name an embedder constant"
status: refined
parent: 59
phase:
assignee: norman
reporter: norman
due:
points: 3
subsystem: charts
labels: [charts]
links: [relates-to 61]
created: 2026-10-24
updated: 2026-10-24T04:10Z
---

## Description

`renderPlotConfigEditor` always draws every section. An embedder whose plots are always 2D time series has no way to drop the parts that do not apply. A reference line's value can only be a number, so it cannot follow a model parameter whose value changes between runs.

EcoAgent's own `plot_config_panel` does both today, through `hide3d`, `hideStackGroup`, `hideXAxisConfig` and a `constantsProvider` for the reference-line value. Its dashboards hide those sections, and a reference line typed as `<archetype>.<param>` tracks that parameter's live value. EcoAgent's owner chose to keep both behaviours by asking FlexDesk for them. The EcoAgent side is EcoAgent STORY-0051 (`../EcoAgent/backlog/STORY-0051.md`), decision "Plot config editor" in `../EcoAgent/docs/decisions/flexdesk-migration.md`.

Filed from the EcoAgent -> FlexDesk 0.17 migration (2026-10-24).

## Acceptance criteria

- [ ] An option hides named parts of the editor: at least the 3D chart types with the Z axis, the per-series stack group, and the X axis section (the subplot then plots against time)
- [ ] With no such option, the editor draws exactly what it draws today
- [ ] An injected constants provider (`() => [{ name, value, label?, group? }]`) offers its names as suggestions in the reference-line value field; a number still works as before
- [ ] A reference line that stores a name is drawn by `renderPlotGrid` at the value an injected resolver returns for that name, and updates when the plot is redrawn with a new value
- [ ] A name the resolver does not know draws no line and does not throw
- [ ] Tests cover each of the above, and the README documents both options

## History

## Comments
