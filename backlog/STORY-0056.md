---
id: 56
type: story
title: "A document outline with numbering and scroll-spy"
status: draft
parent: 54
phase:
assignee:
reporter: norman
due:
points: 3
subsystem: widgets
labels: [widgets, new-component]
links: []
created: 2026-10-17
updated: 2026-10-17T07:55Z
---

## Description

Takes entries {id, level, label}, optional hierarchical numbering, level indentation with max depth, onSelect(id), scroll-spy over a given scroll container and target resolver with configurable rootMargin, tracking suppressed during a click-started scroll (resume on scrollend with timeout fallback), setEntries/refresh/setActive/getActive/onActiveChange/dispose.

Related EcoSim records: EcoSim STORY-0089 (`../EcoSim/backlog/STORY-0089.md`).

Filed from the EcoSim -> FlexDesk 0.16 migration analysis (2026-10-17).

## Acceptance criteria

- [ ] Entries with levels 1,2,2,1 are numbered 1, 1.1, 1.2, 2
- [ ] Scrolling the container marks the topmost visible section active
- [ ] Clicking an entry keeps it active during the resulting scroll
- [ ] An entry whose target cannot be resolved is listed but never marked active
- [ ] dispose() disconnects the observer and clears timers
