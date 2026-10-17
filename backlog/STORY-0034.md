---
id: 34
type: story
title: "Panels can be offered or withheld per content kind, with the toggle showing why"
status: draft
parent: 29
phase:
assignee:
reporter: norman
due:
points: 5
subsystem: shell
labels: [shell, panels]
links: []
created: 2026-10-17
updated: 2026-10-17T07:55Z
---

## Description

Panels are per-desktop booleans that togglePanel flips unconditionally, so an app cannot say 'this page has no console'. A kind declares panels it offers ({bottom: false | {reason}}) and content can override at runtime (wm.setPanelAvailability). Unavailable panels are not inserted, togglePanel returns false, toggles are disabled with the reason, a remembered 'open' state returns when available again, and wm.isPanelAvailable(side) plus a change event exist. The standalone PanelStateMachine is retired.

Related EcoSim records: EcoSim STORY-0040 (`../EcoSim/backlog/STORY-0040.md`); EcoSim STORY-0041 (`../EcoSim/backlog/STORY-0041.md`).

Filed from the EcoSim -> FlexDesk 0.16 migration analysis (2026-10-17).

## Acceptance criteria

- [ ] With the primary kind declaring bottom: {reason:'No console here'}, the bottom toggle is disabled with that tooltip
- [ ] The bottom-panel shortcut and palette chip do nothing while it is unavailable
- [ ] A bottom panel open before switching to such a kind disappears and comes back when switching back
- [ ] togglePanel('bottom') returns false while unavailable and changes no persisted state
- [ ] With no declarations, every panel is available as today
- [ ] A change of availability emits one notification embedders can subscribe to
