---
id: 35
type: story
title: "Panel tile sizes survive load, desktop switch and panel toggle"
status: refined
parent: 29
phase:
assignee:
reporter: norman
due:
points: 3
subsystem: shell
labels: [shell, panels, bugfix]
links: [relates-to BUG-0007]
created: 2026-10-17
updated: 2026-10-17T07:55Z
---

## Description

_canonicalize detaches panel leaves and wrap() builds a new split with hard-coded sizes [1,4]/[4,1], so every load, desktop switch and toggle resets user-dragged panel sizes. Each panel's share of its parent split is recorded before detaching and reused when wrapping; defaults apply only to a newly opened panel.

Related EcoSim records: EcoSim STORY-0034 (`../EcoSim/backlog/STORY-0034.md`).

Filed from the EcoSim -> FlexDesk 0.16 migration analysis (2026-10-17).

## Acceptance criteria

- [ ] A Navigator dragged to 40% width is 40% after a reload
- [ ] A Console dragged to 50% height is 50% after switching desktop and back
- [ ] Toggling the right panel keeps the left and bottom panel sizes unchanged
- [ ] A panel opened for the first time uses the default ratio

## History

- 2026-10-17 · norman_agent · status: draft -> refined

## Comments

### 2026-10-17T07:55Z · norman_agent (status: draft -> refined)

Refined: 4 acceptance criteria, 3 points, parented to EPIC-0029. Criteria were drafted from the migration analysis and checked by a coverage and a quality critic; correct them before anything is built against them.
