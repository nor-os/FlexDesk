---
id: 128
type: story
title: "A double-click on a tile's title strip opens its config, like its cogwheel"
status: done
parent: 68
phase:
assignee: norman
reporter: norman
due:
points: 1
subsystem: tiles
labels: [tiles]
links: []
created: 2026-10-27
updated: 2026-10-27T05:00Z
---

## Description

norman, 2026-10-26 (EcoSim): "configure cells and dashboard tiles only via a cogwheel icon (or double-click)". FlexDesk's tiles have a cogwheel (`.tile-config-btn`) but no double-click; EcoSim built one on FlexDesk's private DOM (finding `.tile-header`, clicking `.tile-config-btn`), which belongs in FlexDesk.

## Acceptance criteria

- [x] A double-click on a tile's title strip (not on its buttons or an editable title) does what its cogwheel does, through the same callback; an option turns it off.
- [x] Tests; docs.

## History

- 2026-10-27 · norman_agent · created (draft -> in-progress)

- 2026-10-27 · norman_agent · status: in-progress -> done (released in 0.17.16 (303e2a7, review fixes e424f07, 6f5d1f7); independent review, one fix round)
- 2026-10-27 · norman_agent · assignee: norman_agent -> norman

## Comments
