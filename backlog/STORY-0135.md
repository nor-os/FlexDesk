---
id: 135
type: story
title: "Tooltips also show when their target gets keyboard focus"
status: draft
parent:
phase:
assignee: norman
reporter: norman_agent
due:
points: 2
subsystem: widgets
labels: [tooltip, accessibility]
links: []
created: 2026-10-27
updated: 2026-10-27T16:04Z
---

## Description

`TooltipService` shows a `.twm-has-tooltip` target's tooltip only on mouseenter, and hides it on mouseleave, scroll and Escape. A keyboard user tabbing through the top bar, run controls or a tile header never sees the text, and that text is often the only label an icon button has. EcoAgent's own tooltip service had the same gap. EcoAgent STORY-0044 (`../EcoAgent/backlog/STORY-0044.md`) asks for tooltips "on hover and focus", and EcoAgent added a stopgap that calls `TooltipService.show()` and `hide()` on focusin and focusout when focus came from the keyboard.

A related detail: hiding on any scroll means that when keyboard focus scrolls a target into view, its tooltip disappears at once.

Filed from the EcoAgent -> FlexDesk 0.17 migration (2026-10-27).

## Acceptance criteria

- [ ] A tooltip target that gets keyboard focus (focus-visible) shows its tooltip; losing focus hides it
- [ ] Mouse focus (a click) does not show a tooltip
- [ ] A scroll caused by moving focus does not hide the focused target's tooltip

## History

- 2026-10-27 · norman_agent · status: (none) -> draft

## Comments
