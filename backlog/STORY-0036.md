---
id: 36
type: story
title: "A collapsible section stack for inspector-style panel content"
status: draft
parent: 29
phase:
assignee:
reporter: norman
due:
points: 5
subsystem: widgets
labels: [widgets, new-component]
links: []
created: 2026-10-17
updated: 2026-10-17T07:55Z
---

## Description

Only tree categories are collapsible today. createSectionStack(container, {sections, stateStore?}) mounts titled sections with header actions that do not toggle, defaultExpanded, persisted expanded state per id (injectable store), a fill section taking remaining height with min-height:0 scrolling, setVisible without losing state, expand/collapse/toggle/isExpanded/dispose and a toggled event. Uses twm-collapsible-* styling.

Related EcoSim records: EcoSim STORY-0040 (`../EcoSim/backlog/STORY-0040.md`).

Filed from the EcoSim -> FlexDesk 0.16 migration analysis (2026-10-17).

## Acceptance criteria

- [ ] Clicking a section header toggles it and its arrow; clicking a header action button does not
- [ ] Expanded states persist under the given key and are restored on the next mount
- [ ] A fill section takes the remaining height and long content scrolls inside it
- [ ] setVisible(id,false) hides a section and setVisible(id,true) restores its previous expanded state
- [ ] A stateStore that throws on read falls back to each section's defaultExpanded
- [ ] dispose() removes every listener and DOM node it created
