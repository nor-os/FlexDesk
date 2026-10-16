---
id: 28
type: story
title: "Right-click shows the browser's menu only where it is useful: suppressNativeContextMenu"
status: review
parent: 23
phase:
assignee: norman
reporter: norman
due:
points: 1
subsystem: widgets
labels: [desktop]
links: []
created: 2026-10-16
updated: 2026-10-16T11:39Z
---

## Description

An app built on FlexDesk defines its own context menus (rows, tabs, tiles, the
top bar). Everywhere else, a right-click shows the browser's or the webview's
own menu (Back, Reload, Save as, Print, Inspect). That makes a desktop app look
like a web page and offers moves that break it.

Add `suppressNativeContextMenu()` to `@flexdesk/widgets`. It prevents the
native menu unless one of FlexDesk's menus or the app's own handler took the
event, the pointer is in editable text (the native menu is how you paste
there), or the click is on selected text (how you copy it).

The application half is BugDesk BUG-0017 (`../bugdesk/bugs/BUG-0017.md`).

## Acceptance criteria

- [x] `suppressNativeContextMenu({ root = document })` prevents the native menu on a right-click that no handler has already claimed (`defaultPrevented`)
- [x] A FlexDesk menu or an app handler that calls `preventDefault()` keeps working unchanged, including handlers on DataTable rows and headers, tabs and tiles
- [x] In an `<input>` (text-like types), `<textarea>`, `<select>` or a `contenteditable` element, the native menu still appears
- [x] A right-click on selected text inside the target still shows the native menu, so Copy stays one click away
- [x] An `allow(event)` option lets the app keep the native menu on more targets; it returns `dispose()`

## History

- 2026-10-16 · norman_agent · status: draft -> refined
- 2026-10-16 · norman_agent · status: refined -> in-progress
- 2026-10-16 · norman_agent · assignee: (unset) -> norman_agent
- 2026-10-16 · norman_agent · status: in-progress -> review
- 2026-10-16 · norman_agent · assignee: norman_agent -> norman

## Comments

### 2026-10-16T11:39Z · norman_agent

Built in d666930, released as **flexdesk@0.16.0** (c3e2e9a, on npm).
`suppressNativeContextMenu({ root, allow })` is in `@flexdesk/widgets`, and all
5 criteria are ticked.

Tests: native_context_menu (16 checks); suite 97/97. Verified in BugDesk
(BugDesk BUG-0017, `../bugdesk/bugs/BUG-0017.md`) in headless Edge: plain
areas prevented, a text input kept the native menu, and a row with its own
handler showed BugDesk's menu.
