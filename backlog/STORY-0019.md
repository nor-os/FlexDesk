---
id: 19
type: story
title: "An alert log and an Alerts pane with history, filters and read state"
status: review
parent: 17
phase:
assignee: norman
reporter: norman
points: 8
subsystem: ui
labels: [alerts, notifications, additive]
links: []
created: 2026-10-14
updated: 2026-10-14T14:57Z
---

## Description

From bugdesk's `alerts.js`: an alert log store (entries `{id, at, level, title, body, ref, read}`, mark read,
dismiss, mark all read, unread count, a limit) with a **pluggable source**: bugdesk keeps it locally in workspace
state, Tables reads its server (paged, read and read-all routes). And the pane: level chips with counts, a text
filter, grouped by day with relative times, unread marks, Open / Dismiss / Mark all read, an optional rules column
and "still matches" for bugdesk. Neutral `twm-alerts__*` classes; never rebuilt under the pointer. Helpers
`worstLevel`, `ago`, `dayLabel` with the level map info/warning/alert.

## Acceptance criteria

- [x] A pane mounted on a local source and on a paged remote source shows the same layout
- [x] Chips and the text filter narrow the list; days are grouped with relative times
- [x] Open calls the embedder's onOpen with the entry; Dismiss and Mark all read update the unread count
- [x] A click on a row survives a source update arriving between mousedown and mouseup
- [x] tests/run.mjs green, build --check OK, released to npm

## History

- 2026-10-14 · norman_agent · status: draft -> refined
- 2026-10-14 · norman_agent · status: refined -> in-progress
- 2026-10-14 · norman_agent · assignee: (none) -> norman_agent
- 2026-10-14 · norman_agent · status: in-progress -> review
- 2026-10-14 · norman_agent · assignee: norman_agent -> norman

## Comments

### 2026-10-14T09:50Z · norman_agent

Refined: 5 acceptance criteria, 8 points, parented to 17. Filed from the product owner's 2026-10-14 vision (notifications only from workflows; a notification area with history, shared through FlexDesk).

### 2026-10-14T14:57Z · norman_agent

Built in `2dd6753`: `createAlertLog` and `localSource` (`src/ui/components/alert_log.js`) and
`mountAlertsPane` (`alerts_pane.js`), both from `widgets`, with `ago`, `dayLabel`, `worstLevel`, `normalizeLevel`
and `ALERT_LEVELS`. A source is `load({offset, limit}) → {entries, more?, unread?}`, `markRead(ids|null)` and an
optional `dismiss`; without it the pane offers no Dismiss or Clear (Tables has no dismiss route today). Changes
apply locally first; a source that refuses is logged and the log re-read.

The pane keeps the bar (chips, filter, buttons) as built once, so typing keeps the caret; a repaint that arrives
while a button is down waits until it is up. bugdesk's rules column, "still matches" and its store tag are
options (`rules`, `stillMatches`, `describe`). Seen in headless Edge in a demo bottom panel; it now fills the panel
(`.twm-bp-pane:has(> .twm-alerts)`).

`tests/alerts_pane.test.mjs`. `tests/run.mjs` GREEN, `build --check` OK.

Released as 0.14.0 (`10b1ebd`, npm `flexdesk@0.14.0`).

Handing back to norman for review.
