---
id: 30
type: story
title: "A menu bar widget with submenus, check items and accelerators that the shell can mount and the palette can list"
status: in-progress
parent: 29
phase:
assignee: norman_agent
reporter: norman
due:
points: 8
subsystem: shell
labels: [shell, menu, new-component]
links: []
created: 2026-10-17
updated: 2026-10-17T17:19Z
---

## Description

FlexDesk has .twm-menu-bar CSS but no component, and showContextMenu has no submenus or check items, so every embedder hand-builds File/Edit/View menus. A MenuBar is driven by a declarative model ([{id,label,items}], items {id,label,shortcut,disabled,checked,radio group,separator,submenu: items | () => items}), mounted via a createShell chrome option, and the same model can feed palette commands() so both list identical verbs.

Related EcoSim records: EcoSim STORY-0048 (`../EcoSim/backlog/STORY-0048.md`).

Filed from the EcoSim -> FlexDesk 0.16 migration analysis (2026-10-17).

## Acceptance criteria

- [ ] Clicking a title opens its menu
- [ ] While a menu is open, hovering another title switches to it
- [ ] Alt or F10 focuses the bar
- [ ] Left and Right move across menus; Up and Down move within one
- [ ] Right opens a submenu and Left closes it
- [ ] Esc closes one level and the last Esc returns focus to where it was
- [ ] A function-valued submenu is rebuilt each time it opens
- [ ] setEnabled(id,false) and setChecked(id,true) update an open menu without rebuilding the bar
- [ ] Disabled items and separators are skipped by the keyboard and never reach onAction
- [ ] Roles menubar, menu, menuitem, menuitemcheckbox and menuitemradio are present (axe check passes)

## History

- 2026-10-17 · norman_agent · status: draft -> refined
- 2026-10-17 · norman_agent · status: refined -> in-progress
- 2026-10-17 · norman_agent · assignee: (none) -> norman_agent

## Comments

### 2026-10-17T07:55Z · norman_agent (status: draft -> refined)

Refined: 10 acceptance criteria, 8 points, parented to EPIC-0029. Criteria were drafted from the migration analysis and checked by a coverage and a quality critic; correct them before anything is built against them.
