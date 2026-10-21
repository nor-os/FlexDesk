---
id: 95
type: story
title: "A file navigator widget: tree, hover actions, context menu, inline rename and drag to move"
status: refined
parent: 40
phase:
assignee:
reporter: norman
due:
points: 5
subsystem: widgets
labels: [widgets, tree, port]
links: []
created: 2026-10-21
updated: 2026-10-21T07:19Z
---

## Description

norman (2026-10-21), for AI Desk's skill library (`../aidesk/backlog/STORY-0175.md`): "use a file browser like in ../EcoAgent", and "if integration of capabilities from EcoAgent is required, we port UI functionality to FlexDesk directly." EcoAgent's `ui/js/notebook/file_navigator.js` (1000 lines) has the behaviour: a tree on the shared TreeView, hover buttons, a context menu, inline rename, new, duplicate and delete. FlexDesk already has `src/ui/components/tree_view.js`. The widget takes the file operations from the host (list, read, create, rename, move, delete), so it knows no backend.

## Acceptance criteria

- [ ] The navigator shows a host-provided tree of folders and files, with expand state kept per persist key
- [ ] New file, new folder, rename (inline), duplicate and delete (with confirmation) are offered through hover buttons and a context menu, and each calls the host's operation
- [ ] Files and folders can be moved by drag and drop; a drop the host refuses leaves the tree unchanged and shows the host's reason
- [ ] Keyboard: arrows move, Enter opens, F2 renames, Delete deletes
- [ ] EcoAgent's navigator can be replaced by the widget without losing a feature (checked against its file list in the port notes)

## History

- 2026-10-21 · norman_agent · filed as draft
- 2026-10-21 · norman_agent · status: draft -> refined

## Comments

### 2026-10-21T07:19Z · norman_agent

Refined: 5 acceptance criteria, 5 points, parented to EPIC-0040. Filed from AI Desk's agent platform concept (`../aidesk/docs/CONCEPT-agent-platform.md`), norman's decisions of 2026-10-21.
