---
id: 20
type: story
title: "The bell shows real unread state, mounts anywhere and opens the Alerts tab"
status: draft
parent: 17
phase:
assignee:
reporter: norman
points: 3
subsystem: ui
labels: [alerts, notifications, status-bar, additive]
links: []
created: 2026-10-14
updated: 2026-10-14T09:43Z
---

## Description

Extend NotificationHistory: a configurable mount element (today `.twm-global-bottom-bar .twm-bar-right` is
hard-coded), the count read from an alert log source instead of a seen-count delta, and a click that opens the
Alerts tab (`bottompanel:show`). NotificationCenter's "+N more" can open the same tab.

## Acceptance criteria

- [ ] An embedder mounts the bell into its own element
- [ ] The bell shows the source's unread count and nothing when all is read
- [ ] Clicking it opens the bottom panel on the Alerts tab
- [ ] Without the new options, NotificationHistory behaves as before
- [ ] tests/run.mjs green, build --check OK, released to npm

## History

## Comments
