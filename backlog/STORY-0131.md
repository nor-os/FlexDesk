---
id: 131
type: story
title: "Notifications can be copied: right-click a toast or history entry > Copy message"
status: done
parent: 68
phase:
assignee: norman
reporter: norman
due:
points: 1
subsystem:
labels: [notifications]
links: []
created: 2026-10-26
updated: 2026-10-27T10:00Z
---

## Description

EcoSim (norman, 2026-10-26): "Notifications currently cannot be copied (right-click > copy message) new requirement."

## Acceptance criteria

- [x] Right-clicking a notification toast or a notification history entry opens FlexDesk's context menu with "Copy message", which copies the notification's title and message (and its details text where it has one) as plain text through the clipboard API.
- [x] Notification text is selectable.
- [x] Tests; docs describe it.

## History

- 2026-10-26 · norman_agent · created (open -> investigation)

- 2026-10-27 · norman_agent · status: investigation -> done (released in 0.17.17 (af30de8): 0eed09e, review fixes 9ed6b49, 34f0fe2, ef4498e (context menus on a --z-context-menu layer over toasts); independent review; suite 219 green; checked in EcoSim over CDP: the menu draws over the toast)
- 2026-10-27 · norman_agent · assignee: norman_agent -> norman

## Comments
