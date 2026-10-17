---
id: 37
type: story
title: "Content can replace its tile chrome actions after mount, with labels, disabled and pressed states"
status: in-progress
parent: 29
phase:
assignee: norman_agent
reporter: norman
due:
points: 3
subsystem: shell
labels: [shell, tile-chrome]
links: []
created: 2026-10-17
updated: 2026-10-17T17:23Z
---

## Description

chromeActions are read once at mount and drawn icon-only. ctx.setChromeActions(specs) works like setTitle (works during mount, later call wins, ignored on a stale ctx, survives repaint, null/[] clears). Specs add label, disabled (tooltip kept), pressed (aria-pressed) and {separator:true}.

Related EcoSim records: EcoSim STORY-0042 (`../EcoSim/backlog/STORY-0042.md`).

Filed from the EcoSim -> FlexDesk 0.16 migration analysis (2026-10-17).

## Acceptance criteria

- [ ] Calling setChromeActions after mount repaints the tile's action buttons without remounting the content
- [ ] A spec with pressed:true renders aria-pressed='true' and a pressed style
- [ ] A disabled action is not clickable and keeps its tooltip
- [ ] A setChromeActions call from a ctx of a rebuilt leaf changes nothing
- [ ] Specs with only {icon,title,onClick} render exactly as today

## History

- 2026-10-17 · norman_agent · status: draft -> refined
- 2026-10-17 · norman_agent · status: refined -> in-progress
- 2026-10-17 · norman_agent · assignee: (none) -> norman_agent

## Comments

### 2026-10-17T07:55Z · norman_agent (status: draft -> refined)

Refined: 5 acceptance criteria, 3 points, parented to EPIC-0029. Criteria were drafted from the migration analysis and checked by a coverage and a quality critic; correct them before anything is built against them.
