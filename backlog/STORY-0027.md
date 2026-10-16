---
id: 27
type: story
title: "Links leave a native window for the system browser: host shell.openExternal and routeExternalLinks"
status: draft
parent: 23
phase:
assignee:
reporter: norman
due:
points:
subsystem: host
labels: [desktop]
links: []
created: 2026-10-16
updated: 2026-10-16T07:10Z
---

## Description

In a Photino (or any native) window, a link with `target="_blank"` or a
`window.open()` of a web address should open in the user's default browser, not
in the webview, which either does nothing or opens a bare popup window with no
way back. FlexDesk's host port has no way to ask for that today.

Add an optional `shell` capability (`openExternal(url)`) to the host contract,
implemented by `createPhotinoHost` as a `shell.openExternal` request. Add
`routeExternalLinks({ host })` to `@flexdesk/host`. It sends external link
clicks and `window.open` calls through the host when the host has `shell`, and
does nothing when it doesn't (a browser tab keeps opening a new tab).

The application half is BugDesk BUG-0018 (`../bugdesk/bugs/BUG-0018.md`):
BugDesk's NativeBridge answers `shell.openExternal`.

## Acceptance criteria

_(not refined yet)_
