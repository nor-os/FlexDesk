---
id: 128
type: story
title: "A double-click on a tile's title strip opens its config, like its cogwheel"
status: in-progress
parent: 68
phase:
assignee: norman_agent
reporter: norman
due:
points: 1
subsystem: tiles
labels: [tiles]
links: []
created: 2026-10-27
updated: 2026-10-27T02:00Z
---

## Description

norman, 2026-10-26 (EcoSim): "configure cells and dashboard tiles only via a cogwheel icon (or double-click)". FlexDesk's tiles have a cogwheel (`.tile-config-btn`) but no double-click; EcoSim built one on FlexDesk's private DOM (finding `.tile-header`, clicking `.tile-config-btn`), which belongs in FlexDesk.

## Acceptance criteria

- [ ] A double-click on a tile's title strip (not on its buttons or an editable title) does what its cogwheel does, through the same callback; an option turns it off.
- [ ] Tests; docs.

## History

- 2026-10-27 · norman_agent · created (draft -> in-progress)

## Comments
