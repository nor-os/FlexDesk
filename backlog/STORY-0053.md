---
id: 53
type: story
title: "NotificationCenter toasts can carry live, collapsible progress"
status: refined
parent: 51
phase:
assignee:
reporter: norman
due:
points: 3
subsystem: notifications
labels: [notifications, progress]
links: [blocked-by 52]
created: 2026-10-17
updated: 2026-10-17T07:55Z
---

## Description

show() accepts progress (fraction, {value,total} or null for indeterminate), a status line and a counts label; update(id, patch) changes only the affected nodes; progress toasts are persistent, collapsible, keep their state across other toasts' renders, and can finish into success/error with optional auto-dismiss. Interaction with STORY-0014's '+N more' collapse: a running progress toast is never folded into the '+N more' summary; it counts toward maxVisible, and finished progress toasts fold like any other.

Related EcoSim records: EcoSim STORY-0059 (`../EcoSim/backlog/STORY-0059.md`).

Filed from the EcoSim -> FlexDesk 0.16 migration analysis (2026-10-17).

## Acceptance criteria

- [ ] update(id, {progress:0.5}) moves the bar without re-rendering other toasts
- [ ] A new info toast does not reset a progress toast's collapsed state or bar
- [ ] update(id, {progress:1, severity:'success', durationMs:3000}) shows success and dismisses after 3 seconds
- [ ] With overflow 'collapse' and four info toasts, a running progress toast stays visible and is not counted in '+N more'
- [ ] An action button on a progress toast calls its handler

## History

- 2026-10-17 · norman_agent · status: draft -> refined

## Comments

### 2026-10-17T07:55Z · norman_agent (status: draft -> refined)

Refined: 5 acceptance criteria, 3 points, parented to EPIC-0051. Blocked by STORY-0052. Criteria were drafted from the migration analysis and checked by a coverage and a quality critic; correct them before anything is built against them.
