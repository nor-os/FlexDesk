---
id: 19
type: story
title: "An alert log and an Alerts pane with history, filters and read state"
status: refined
parent: 17
phase:
assignee:
reporter: norman
points: 8
subsystem: ui
labels: [alerts, notifications, additive]
links: []
created: 2026-10-14
updated: 2026-10-14T09:50Z
---

## Description

From bugdesk's `alerts.js`: an alert log store (entries `{id, at, level, title, body, ref, read}`, mark read,
dismiss, mark all read, unread count, a limit) with a **pluggable source**: bugdesk keeps it locally in workspace
state, Tables reads its server (paged, read and read-all routes). And the pane: level chips with counts, a text
filter, grouped by day with relative times, unread marks, Open / Dismiss / Mark all read, an optional rules column
and "still matches" for bugdesk. Neutral `twm-alerts__*` classes; never rebuilt under the pointer. Helpers
`worstLevel`, `ago`, `dayLabel` with the level map info/warning/alert.

## Acceptance criteria

- [ ] A pane mounted on a local source and on a paged remote source shows the same layout
- [ ] Chips and the text filter narrow the list; days are grouped with relative times
- [ ] Open calls the embedder's onOpen with the entry; Dismiss and Mark all read update the unread count
- [ ] A click on a row survives a source update arriving between mousedown and mouseup
- [ ] tests/run.mjs green, build --check OK, released to npm

## History

- 2026-10-14 · norman_agent · status: draft -> refined

## Comments

### 2026-10-14T09:50Z · norman_agent

Refined: 5 acceptance criteria, 8 points, parented to 17. Filed from the product owner's 2026-10-14 vision (notifications only from workflows; a notification area with history, shared through FlexDesk).
