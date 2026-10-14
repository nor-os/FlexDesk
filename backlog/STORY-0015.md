---
id: 15
type: story
title: "A Photino host for @flexdesk/host: photino_host.js beside pywebview_host.js"
status: review
parent: 23
phase:
assignee: norman
reporter: norman
due:
points: 3
subsystem: host
labels: [host, desktop, bugdesk-consumer]
links: []
created: 2026-10-13
updated: 2026-10-14T15:04Z
---

## Description

BugDesk's desktop spike (BugDesk STORY-0009, `../bugdesk/docs/desktop-spike.md`)
runs a FlexDesk app in a Photino.NET window. The window can only be reached over
`window.external.sendMessage` / `receiveMessage`. A host adapter here, beside
`pywebview_host.js`, puts a request/reply protocol over them
(`{id, cap, op, args}` → `{id, ok, value|error}`, plus id-less events) and
offers the port's `window`, `dialogs` and `state` capabilities, falling back
to `NULL_HOST` in a browser tab. The design and an adapter sketch are in that
note; so is the C# dispatcher it talks to. EcoSim can move onto the same bridge
later.

## Acceptance criteria

- [x] `createPhotinoHost()` in a Photino window offers `window`, `dialogs` and `state`, and each call goes out as `{id, cap, op, args}` over `window.external.sendMessage` and resolves with the matching `{id, ok, value}` reply
- [x] A reply with `ok: false` rejects with the host's error, a request with no reply rejects after the timeout (10 s by default), and a reply for an unknown id or a non-JSON message is ignored
- [x] `window.chrome()` answers `native`, so FlexDesk draws no window buttons of its own in a Photino window
- [x] In a browser tab (no `window.external.sendMessage`) it returns `NULL_HOST`, and every existing consumer works as it does today
- [x] Exported from `@flexdesk/host`, covered by tests against a fake `window.external`, with the C# side of the protocol documented next to the adapter

## History

- 2026-10-14 · norman_agent · status: draft -> refined
- 2026-10-14 · norman_agent · status: refined -> in-progress
- 2026-10-14 · norman_agent · assignee: (unset) -> norman_agent
- 2026-10-14 · norman_agent · status: in-progress -> review
- 2026-10-14 · norman_agent · assignee: norman_agent -> norman

## Comments

### 2026-10-14T14:31Z · norman_agent

Refined: 5 criteria, 3 points, parented to the new EPIC-0023. BugDesk STORY-0026
(`../bugdesk/backlog/STORY-0026.md`) is waiting on it, and a release carrying it.

### 2026-10-14T15:04Z · norman_agent (status: in-progress -> review)

Built in e4217f2; ships in FlexDesk 0.14.0, which tables-5d is cutting (it
also carries STORY-0018..0020). All five criteria ticked.

- **`src/host/photino_host.js`**, exported from `@flexdesk/host`:
  `createPhotinoHost({ external, timeoutMs = 10000, onEvent, logger, window, dialogs, state })`,
  plus `createPhotinoTransport()` (the bare request/reply layer) and
  `isPhotinoWindow()`. Requests go out as `{id, cap, op, args}`; replies are
  matched by id; id-less `{event, value}` go to `onEvent`; junk and unknown
  ids are dropped.
- **The capabilities degrade like pywebview's.** The transport rejects on
  `ok: false` and on timeout, but `isMaximized` and the like read `false`,
  `getBounds` reads `null`, and fire-and-forget calls only log.
  `dialogs.saveFile` resolves `null` when refused, so callers download
  instead.
- **One decision beyond the design: `saveFile` has no timeout.** The dialog
  stays open as long as the user takes. Giving up after 10 s would have started
  a browser download behind a dialog that then also saved.
- **Embedders choose capabilities.** Passing a capability replaces Photino's,
  and `null` leaves it out. BugDesk will pass its server-backed `state`.
- **Browser tab:** it returns `NULL_HOST`. The full suite is green (91 suites).
- **Tests:** `tests/photino_host.test.mjs` runs against a fake
  `window.external`: out-of-order replies, refusals, timeouts, late replies,
  events, junk, and capability overrides.
- **C# contract:** every op with its args and reply, the `saveFile` reply
  shapes, and a dispatcher sketch are in `src/host/photino_host.md`; the
  README's host section points to it.

Not checked in a real Photino window. That happens with BugDesk STORY-0026,
so EPIC-0023's criterion stays unticked.
