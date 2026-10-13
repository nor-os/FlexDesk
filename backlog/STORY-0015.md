---
id: 15
type: story
title: "A Photino host for @flexdesk/host: photino_host.js beside pywebview_host.js"
status: draft
parent:
phase:
assignee:
reporter: norman
due:
points:
subsystem: host
labels: [host, desktop, bugdesk-consumer]
links: []
created: 2026-10-13
updated: 2026-10-13T05:11Z
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

_(not refined yet)_
