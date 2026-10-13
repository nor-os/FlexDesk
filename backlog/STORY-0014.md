---
id: 14
type: story
title: "NotificationCenter: toasts past the visible limit collapse into one \"+N more\" toast instead of pushing the oldest out"
status: review
parent:
phase:
assignee: norman
reporter: norman
points: 2
subsystem: notifications
labels: [notifications, bugdesk-consumer]
links: []
created: 2026-10-12
updated: 2026-10-13T04:34Z
---

## Description

BugDesk's alerts (BugDesk STORY-0005, `../bugdesk/backlog/STORY-0005.md`) show as
toasts, and some are sticky: they close only with ×. With `maxVisible = 3` the
NotificationCenter today drops the OLDEST toast when a fourth arrives. A sticky
alert nobody has read then disappears without anyone seeing it, and a burst of
twenty alerts flickers past. BugDesk needs the opposite: the toasts already on
screen stay, and anything past the limit gathers in one "+N more" toast that
grows as more arrive.

Opt-in: without the option, overflow behaves as in 0.10.0.

## Acceptance criteria

- [x] `new NotificationCenter({ overflow: 'collapse' })`: when `maxVisible` toasts are showing, a further one is not drawn; one summary toast reads "+N more" (N counting every held-back toast) and its count rises with each new one
- [x] Closing a visible toast brings the oldest held-back one in, and the summary's count drops; the summary disappears when nothing is held back
- [x] Clicking the summary (or a `summaryAction` callback) is reported, so a consumer can open its history; every held-back toast is in `history` as it arrives
- [x] Without `overflow: 'collapse'`, overflow drops the oldest as in 0.10.0, which the existing suites prove
- [x] A test in `tests/`, the README documents the option, `tests/run.mjs` is GREEN and `node build.mjs --check` is OK

## History

- 2026-10-12 · norman_agent · status: refined -> in-progress
- 2026-10-12 · norman_agent · assignee: (unset) -> norman_agent
- 2026-10-13 · norman_agent · status: in-progress -> review
- 2026-10-13 · norman_agent · assignee: norman_agent -> norman

## Comments

### 2026-10-13T04:34Z · norman_agent (status: in-progress -> review)

Released in **0.11.0** (af11fb4, on npm). All criteria are met.

- `new NotificationCenter({ overflow: 'collapse', summaryAction })`: past
  `maxVisible`, toasts wait behind one "+N more", and its count follows them.
  Closing a visible toast brings the oldest waiting one in. The summary goes
  when nothing waits.
- A click on the summary calls `summaryAction(held)` and emits
  `notification:summary`. Every toast is in `history` as it arrives.
- Without the option, overflow drops the oldest as before.
- Suite `notification_overflow.test.mjs`; README section "Notifications:
  `NotificationCenter`". The summary's CSS sits with the notification rules,
  not after the flow sections, as `flow_kit_scaffold` requires.
