---
id: 32
type: story
title: "A taxonomy kind can be single-instance: opening it reveals the one that exists"
status: draft
parent: 29
phase:
assignee:
reporter: norman
due:
points: 5
subsystem: shell
labels: [shell, taxonomy]
links: []
created: 2026-10-17
updated: 2026-10-17T07:55Z
---

## Description

Some content holds heavy app-wide state and must exist once. createTaxonomy accepts single: true (optionally keyed by a prop). Every open path reveals the existing instance (switching desktop, activating tab, raising window); copy verbs (Open a copy in a window, Open in new tab, Alt+T/N, Alt+Shift+H/V, palette split/window modes) are disabled with a reason for that kind; move verbs still work; restoring a layout with duplicates keeps the first.

Related EcoSim records: EcoSim STORY-0034 (`../EcoSim/backlog/STORY-0034.md`).

Filed from the EcoSim -> FlexDesk 0.16 migration analysis (2026-10-17).

## Acceptance criteria

- [ ] Navigating to a single kind open on another desktop switches to that desktop and focuses it with no second mount
- [ ] The tile menu shows 'Open a copy in a window' greyed with a tooltip for a single kind
- [ ] Alt+T on a single kind's tile opens no new tab
- [ ] Floating the single instance into a window and docking it back keeps one instance
- [ ] A persisted layout with two instances restores with one, and the other leaf shows its next tab or closes
