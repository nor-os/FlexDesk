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
updated: 2026-10-18T02:20Z
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

### 2026-10-18T02:20Z · norman_agent

Where this stands: the work is on branch `story-0030` (origin tip 826e0a4). After two fix rounds, an independent review still finds problems, so the branch has not landed. No criteria are ticked here. The axe check still runs by hand, outside the suite. Putting it inside tests/ would need axe-core as a devDependency.

Still open:

- `src/ui/components/menu_bar.js:629-649` (listeners at :151-153 and :232-234): an Alt+Tab round trip focuses the menu bar. When Alt is pressed, `_altArmed` becomes true. The Tab goes to the OS, so no other keydown reaches the page to clear it. There is no window blur listener, so nothing clears it when the window loses focus either. When the user comes back with Alt+Tab, the Alt keyup reaches the page with `_altArmed` still true, and `_toggle()` takes focus from wherever the user was. Reproduced in jsdom against HEAD (keydown Alt, window 'blur', keyup Alt): focus moves from an input to the 'File' title. Alt+F4 and Alt+Space behave the same way. This breaks criterion 3 as the module header states it ("Alt (pressed and released on its own)"). Done looks like this: clear `_altArmed` on the document's window 'blur' (registered in the constructor and removed in dispose(), like the other document listeners), and add a check to `tests/menu_bar.test.mjs` §3 (keydown Alt, window blur, keyup Alt: focus stays on `outside`). That check must fail on the current HEAD.
- `src/ui/components/menu_bar.js:329-330` (minor, fix while there): `_enter` copies its parameter into a local for no reason (`const a = from;`). Use `from` directly.
