---
id: 121
type: story
title: "A tree item can carry inline row actions, like a tree node"
status: in-progress
parent: 68
phase:
assignee: norman_agent
reporter: norman
due:
points: 2
subsystem: widgets
labels: [tree]
links: []
created: 2026-10-26
updated: 2026-10-26T18:30Z
---

## Description

norman, 2026-10-26 (EcoSim): "elements in left nav too high, edit and delete button need to be inline."

createTreeNode takes `actions` ({ id: { icon, title, onClick } }) and draws them in `.twm-tree-node__actions`, inline at the header's end and shown on hover. createTreeItem has no such option, so an app that wants rename/delete on a leaf adds its own wrapper (EcoSim used an unstyled `.twm-tree-item__actions` span), whose buttons, `display: flex`, stack vertically and make the row twice as tall.

## Acceptance criteria

- [ ] createTreeItem takes `actions` with the same shape as createTreeNode's: each entry draws a `.twm-tree-node__action-btn` (data-action, title, Material Symbols icon) inside `.twm-tree-item__actions`; a click calls `onClick(id, event)` and does not select the item.
- [ ] The actions sit in one line at the row's end (after label, subtitle and badge), take no height of their own and are shown on hover, focus-within and on the selected item; the row's height does not change with or without actions.
- [ ] Without `actions` the markup is unchanged.
- [ ] Tests in FlexDesk's suite: markup, click isolation, unchanged markup without actions. Docs (docs/components) mention the option.

## History

- 2026-10-26 · norman_agent · created (draft -> in-progress)

## Comments
