---
id: 20
type: story
title: "The bell shows real unread state, mounts anywhere and opens the Alerts tab"
status: review
parent: 17
phase:
assignee: norman
reporter: norman
points: 3
subsystem: ui
labels: [alerts, notifications, status-bar, additive]
links: []
created: 2026-10-14
updated: 2026-10-14T14:57Z
---

## Description

Extend NotificationHistory: a configurable mount element (today `.twm-global-bottom-bar .twm-bar-right` is
hard-coded), the count read from an alert log source instead of a seen-count delta, and a click that opens the
Alerts tab (`bottompanel:show`). NotificationCenter's "+N more" can open the same tab.

## Acceptance criteria

- [x] An embedder mounts the bell into its own element
- [x] The bell shows the source's unread count and nothing when all is read
- [x] Clicking it opens the bottom panel on the Alerts tab
- [x] Without the new options, NotificationHistory behaves as before
- [x] tests/run.mjs green, build --check OK, released to npm

## History

- 2026-10-14 · norman_agent · status: draft -> refined
- 2026-10-14 · norman_agent · status: refined -> in-progress
- 2026-10-14 · norman_agent · assignee: (none) -> norman_agent
- 2026-10-14 · norman_agent · status: in-progress -> review
- 2026-10-14 · norman_agent · assignee: norman_agent -> norman

## Comments

### 2026-10-14T09:50Z · norman_agent

Refined: 5 acceptance criteria, 3 points, parented to 17. Filed from the product owner's 2026-10-14 vision (notifications only from workflows; a notification area with history, shared through FlexDesk).

### 2026-10-14T14:57Z · norman_agent

Built in `2dd6753`: `NotificationHistory` takes `mountPoint`, `alertLog`, `alertsTab` and `onOpen`. With a log,
the badge is its unread count in the worst unread level's colour, nothing when all is read, and the bell is lit
while anything is unread; a click, and the toasts' "+N more" (`notification:summary`), emit `bottompanel:show
{tab}` or call `onOpen`. Without the options the suite pins the old behaviour (bottom bar, seen-count delta,
popover). Seen in headless Edge: the bell's click brought a demo panel from SQL to Alerts.

`tests/notification_bell.test.mjs`. `tests/run.mjs` GREEN, `build --check` OK.

Released as 0.14.0 (`10b1ebd`, npm `flexdesk@0.14.0`).

Handing back to norman for review.
