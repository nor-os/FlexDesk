---
id: 27
type: story
title: "Links leave a native window for the system browser: host shell.openExternal and routeExternalLinks"
status: review
parent: 23
phase:
assignee: norman
reporter: norman
due:
points: 2
subsystem: host
labels: [desktop]
links: []
created: 2026-10-16
updated: 2026-10-16T11:39Z
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

- [x] `HOST_CONTRACT` has an optional `shell` capability whose required method is `openExternal(url)`; `createHost` validates it like the others
- [x] `createPhotinoHost()` offers `shell.openExternal(url)`, sent as `{cap: 'shell', op: 'openExternal', args: [url]}`; it resolves `true` when the native side opened it and `false` when it refused or does not know the op, and an embedder can replace it or leave it out (`shell: null`)
- [x] `routeExternalLinks({ host })`: with `host.shell`, a click on an `<a>` with an http(s) or mailto address that has `target="_blank"` or points to another origin is opened through `host.shell.openExternal` and not in the webview; a same-origin link without a target is left alone
- [x] With `host.shell`, `window.open(url)` of an external http(s) address goes through `openExternal` too; any other call reaches the original `window.open`
- [x] When `openExternal` resolves `false`, the link falls back to the original `window.open`, so a native side without the op still opens something
- [x] Without `host.shell` (a browser tab, NULL_HOST), `routeExternalLinks` changes nothing; it returns a `dispose()` that removes the listener and restores `window.open`
- [x] `photino_host.md` documents `shell.openExternal`, including the schemes the native side should refuse

## History

- 2026-10-16 · norman_agent · status: draft -> refined
- 2026-10-16 · norman_agent · status: refined -> in-progress
- 2026-10-16 · norman_agent · assignee: (unset) -> norman_agent
- 2026-10-16 · norman_agent · status: in-progress -> review
- 2026-10-16 · norman_agent · assignee: norman_agent -> norman

## Comments

### 2026-10-16T11:39Z · norman_agent

Built in d666930, released as **flexdesk@0.16.0** (c3e2e9a, on npm).

- `HOST_CONTRACT.shell`, requiring `openExternal`
- `createPhotinoHost` offers `shell.openExternal` (false when refused; an
  embedder can replace it or pass `shell: null`)
- `routeExternalLinks({ host, root, win })` in `@flexdesk/host`
- `photino_host.md` has the op and the rule to refuse anything but http, https
  and mailto
- a README section (0.16.0)

All 7 criteria ticked. One decision beyond the criteria: a same-origin link
with `target="_blank"` also goes out, because in a native window the
alternative is a bare popup.

Tests: external_links (21 checks) and photino_host (shell cases added); suite
97/97. Verified in BugDesk's real desktop app (BugDesk BUG-0018,
`../bugdesk/bugs/BUG-0018.md`): both the link click and `window.open` reached
the bridge, there was no navigation, and the native side refused `file:`,
`javascript:` and `ms-settings:`.
