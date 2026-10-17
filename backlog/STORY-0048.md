---
id: 48
type: story
title: "A public tab strip with optional pane host, decoupled from bus names and file paths"
status: draft
parent: 40
phase:
assignee:
reporter: norman
due:
points: 5
subsystem: widgets
labels: [widgets, new-component, tabs]
links: []
created: 2026-10-17
updated: 2026-10-17T07:55Z
---

## Description

createTabStrip is internal to wm.js, createBottomPanelTabs (STORY-0018, status review) is tied to the bottom panel and its bus event, and NotebookTabBar is keyed by file path. One exported tab strip: items {id,label,icon,title,badge,indicator,closable,dirty}, update(items, activeId), select/active/setBadge/setIndicator, onSelect, optional onClose/onReorder/onContextMenu, lazy pane mounting or strip-only, ARIA tabs with arrows/Home/End, overflow scroll, compact variant. createBottomPanelTabs from STORY-0018 is rebuilt on it once that story is released.

Related EcoSim records: EcoSim STORY-0092 (`../EcoSim/backlog/STORY-0092.md`); EcoSim STORY-0100 (`../EcoSim/backlog/STORY-0100.md`); EcoSim STORY-0069 (`../EcoSim/backlog/STORY-0069.md`); EcoSim STORY-0086 (`../EcoSim/backlog/STORY-0086.md`).

Filed from the EcoSim -> FlexDesk 0.16 migration analysis (2026-10-17).

## Acceptance criteria

- [ ] Arrow keys move selection and Home/End jump to the ends
- [ ] update() keeps the selection when the active id still exists and selects the first item otherwise
- [ ] A pane is mounted only on its first selection
- [ ] No bus subscription is made unless the caller passes an event name
- [ ] createBottomPanelTabs's tests pass on top of the new strip
