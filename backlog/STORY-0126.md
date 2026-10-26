---
id: 126
type: story
title: "A category picker: search, categories, items and a detail pane, in one popover"
status: done
parent: 68
phase:
assignee: norman
reporter: norman
due:
points: 3
subsystem: widgets
labels: [picker]
links: []
created: 2026-10-26
updated: 2026-10-27T05:00Z
---

## Description

norman, 2026-10-26 (EcoSim's new-cell menu): chose layout B of the design canvas https://claude.ai/artifact/2RXxMg8ezfyjGsR9dvA81o (TwoPane): a search field over three columns — categories (colour dot, name, count), the chosen category's items (icon, label), and a detail pane for the highlighted item (title, description, an optional monospace preview block, an Add button). ActionDropdown is a flat list. A categorised picker with a detail pane is generic (FlexDesk owns generic UI), so it is a FlexDesk widget the app fills.

## Acceptance criteria

- [x] A widget (e.g. `CategoryPicker` / `openCategoryPicker`) anchored to a trigger like ActionDropdown, taking `categories: [{ id, label, color?, items: [{ id, label, icon?, description?, preview? (text, shown monospace), keywords? }] }]` and `onSelect(item, category)`; FlexDesk tokens only.
- [x] Search filters across all categories (label, description, keywords) and shows the hits; arrow keys move within and across columns, Enter picks, Esc closes and returns focus to the trigger; a double-click on an item picks it; mouse hover/selection updates the detail pane.
- [x] Positioned like ActionDropdown (kept inside the window, flips when there is no room), drawn over windows.
- [x] Tests in FlexDesk's suite; docs (with an example).

## History

- 2026-10-26 · norman_agent · created (draft -> in-progress)

- 2026-10-27 · norman_agent · status: in-progress -> done (released in 0.17.16 (40be755, review fixes ec133d4); independent review, one fix round)
- 2026-10-27 · norman_agent · assignee: norman_agent -> norman

## Comments
