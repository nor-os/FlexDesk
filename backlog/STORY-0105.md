---
id: 105
type: story
title: "MenuBar items show a tooltip with the reason when disabled"
status: dropped
parent: 29
phase:
assignee:
reporter: norman
due:
points: 1
subsystem:
labels: [migration, flexdesk]
links: []
created: 2026-10-23
updated: 2026-10-23T15:35Z
---

## Description

EcoSim STORY-0049 (`../EcoSim/backlog/STORY-0049.md`) needs Edit > Undo to say why it is disabled when the focused page has no undo. FlexDesk 0.17.3's MenuBar draws a disabled item with the --disabled class and aria-disabled but has no tooltip. norman decided on 2026-10-23 that the FlexDesk gaps EcoSim's post-cutover stories found are fixed in FlexDesk first and released as 0.17.4. Opt-in and generic; documented in a README section headed "(0.17.4)".

## Acceptance criteria

- [ ] A menu item with `disabledReason` (a string or a function returning one) shows it as the item's tooltip while the item is disabled
- [ ] The tooltip is gone when the item becomes enabled
- [ ] Items without `disabledReason` behave exactly as in 0.17.3
- [ ] A disabled item still does nothing when clicked or activated from the keyboard

## History

- 2026-10-23 · norman_agent · status: draft -> refined
- 2026-10-23 · norman_agent · status: refined -> dropped

## Comments

### 2026-10-23T15:25Z · norman_agent (status: draft -> refined)

Filed and refined on norman's decision (2026-10-23): 4 criteria, 1 point, parented to EPIC-0029, in 0.17.4 (STORY-0106).

### 2026-10-23T15:35Z · norman_agent (status: refined -> dropped)

Dropped by norman's FlexDesk-first decision (2026-10-23, EcoSim docs/decisions/flexdesk-migration.md#flexdesk-first): EcoSim takes FlexDesk's behaviour where they differ, so a disabled menu item needs no tooltip; EcoSim STORY-0049's palette already says why Undo is disabled. Nothing was built.
