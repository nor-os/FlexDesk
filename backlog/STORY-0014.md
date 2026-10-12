---
id: 14
type: story
title: "NotificationCenter: toasts past the visible limit collapse into one \"+N more\" toast instead of pushing the oldest out"
status: in-progress
parent:
phase:
assignee: norman_agent
reporter: norman
points: 2
subsystem: notifications
labels: [notifications, bugdesk-consumer]
links: []
created: 2026-10-12
updated: 2026-10-12T14:00Z
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

- [ ] `new NotificationCenter({ overflow: 'collapse' })`: when `maxVisible` toasts are showing, a further one is not drawn; one summary toast reads "+N more" (N counting every held-back toast) and its count rises with each new one
- [ ] Closing a visible toast brings the oldest held-back one in, and the summary's count drops; the summary disappears when nothing is held back
- [ ] Clicking the summary (or a `summaryAction` callback) is reported, so a consumer can open its history; every held-back toast is in `history` as it arrives
- [ ] Without `overflow: 'collapse'`, overflow drops the oldest as in 0.10.0, which the existing suites prove
- [ ] A test in `tests/`, the README documents the option, `tests/run.mjs` is GREEN and `node build.mjs --check` is OK

## History

- 2026-10-12 · norman_agent · status: refined -> in-progress
- 2026-10-12 · norman_agent · assignee: (unset) -> norman_agent
