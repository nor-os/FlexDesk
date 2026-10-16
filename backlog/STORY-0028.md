---
id: 28
type: story
title: "Right-click shows the browser's menu only where it is useful: suppressNativeContextMenu"
status: in-progress
parent: 23
phase:
assignee: norman_agent
reporter: norman
due:
points: 1
subsystem: widgets
labels: [desktop]
links: []
created: 2026-10-16
updated: 2026-10-16T07:13Z
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

- [ ] `suppressNativeContextMenu({ root = document })` prevents the native menu on a right-click that no handler has already claimed (`defaultPrevented`)
- [ ] A FlexDesk menu or an app handler that calls `preventDefault()` keeps working unchanged, including handlers on DataTable rows and headers, tabs and tiles
- [ ] In an `<input>` (text-like types), `<textarea>`, `<select>` or a `contenteditable` element, the native menu still appears
- [ ] A right-click on selected text inside the target still shows the native menu, so Copy stays one click away
- [ ] An `allow(event)` option lets the app keep the native menu on more targets; it returns `dispose()`

## History

- 2026-10-16 · norman_agent · status: draft -> refined
- 2026-10-16 · norman_agent · status: refined -> in-progress
- 2026-10-16 · norman_agent · assignee: (unset) -> norman_agent
