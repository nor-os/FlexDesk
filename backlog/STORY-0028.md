---
id: 28
type: story
title: "Right-click shows the browser's menu only where it is useful: suppressNativeContextMenu"
status: draft
parent: 23
phase:
assignee:
reporter: norman
due:
points:
subsystem: widgets
labels: [desktop]
links: []
created: 2026-10-16
updated: 2026-10-16T07:10Z
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

_(not refined yet)_
