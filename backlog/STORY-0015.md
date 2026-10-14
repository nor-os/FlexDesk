---
id: 15
type: story
title: "A Photino host for @flexdesk/host: photino_host.js beside pywebview_host.js"
status: refined
parent: 23
phase:
assignee:
reporter: norman
due:
points: 3
subsystem: host
labels: [host, desktop, bugdesk-consumer]
links: []
created: 2026-10-13
updated: 2026-10-14T14:31Z
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

- [ ] `createPhotinoHost()` in a Photino window offers `window`, `dialogs` and `state`, and each call goes out as `{id, cap, op, args}` over `window.external.sendMessage` and resolves with the matching `{id, ok, value}` reply
- [ ] A reply with `ok: false` rejects with the host's error, a request with no reply rejects after the timeout (10 s by default), and a reply for an unknown id or a non-JSON message is ignored
- [ ] `window.chrome()` answers `native`, so FlexDesk draws no window buttons of its own in a Photino window
- [ ] In a browser tab (no `window.external.sendMessage`) it returns `NULL_HOST`, and every existing consumer works as it does today
- [ ] Exported from `@flexdesk/host`, covered by tests against a fake `window.external`, with the C# side of the protocol documented next to the adapter

## History

- 2026-10-14 · norman_agent · status: draft -> refined

## Comments

### 2026-10-14T14:31Z · norman_agent

Refined: 5 criteria, 3 points, parented to the new EPIC-0023. BugDesk STORY-0026
(`../bugdesk/backlog/STORY-0026.md`) is waiting on it, and a release carrying it.
