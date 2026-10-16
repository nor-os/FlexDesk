---
id: 27
type: story
title: "Links leave a native window for the system browser: host shell.openExternal and routeExternalLinks"
status: refined
parent: 23
phase:
assignee:
reporter: norman
due:
points: 2
subsystem: host
labels: [desktop]
links: []
created: 2026-10-16
updated: 2026-10-16T07:12Z
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

- [ ] `HOST_CONTRACT` has an optional `shell` capability whose required method is `openExternal(url)`; `createHost` validates it like the others
- [ ] `createPhotinoHost()` offers `shell.openExternal(url)`, sent as `{cap: 'shell', op: 'openExternal', args: [url]}`; it resolves `true` when the native side opened it and `false` when it refused or does not know the op, and an embedder can replace it or leave it out (`shell: null`)
- [ ] `routeExternalLinks({ host })`: with `host.shell`, a click on an `<a>` with an http(s) or mailto address that has `target="_blank"` or points to another origin is opened through `host.shell.openExternal` and not in the webview; a same-origin link without a target is left alone
- [ ] With `host.shell`, `window.open(url)` of an external http(s) address goes through `openExternal` too; any other call reaches the original `window.open`
- [ ] When `openExternal` resolves `false`, the link falls back to the original `window.open`, so a native side without the op still opens something
- [ ] Without `host.shell` (a browser tab, NULL_HOST), `routeExternalLinks` changes nothing; it returns a `dispose()` that removes the listener and restores `window.open`
- [ ] `photino_host.md` documents `shell.openExternal`, including the schemes the native side should refuse

## History

- 2026-10-16 · norman_agent · status: draft -> refined
