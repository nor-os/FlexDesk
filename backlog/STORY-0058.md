---
id: 58
type: story
title: "Auto-height editors take a maxHeight option instead of reading a DOM attribute"
status: draft
parent: 54
phase:
assignee:
reporter: norman
due:
points: 2
subsystem: editor
labels: [editor, monaco]
links: []
created: 2026-10-17
updated: 2026-10-17T07:55Z
---

## Description

createEditor's cap comes from data-code-max-height on a '.notebook-editor-container' ancestor watched by a MutationObserver, a hard-coded 400px. Adds createEditor({maxHeight}) and handle.setMaxHeight(px|Infinity); removes the ancestor lookup and observer.

Related EcoSim records: EcoSim STORY-0081 (`../EcoSim/backlog/STORY-0081.md`).

Filed from the EcoSim -> FlexDesk 0.16 migration analysis (2026-10-17).

## Acceptance criteria

- [ ] An editor with maxHeight 200 and 50 lines is 200px tall and scrolls internally
- [ ] setMaxHeight(Infinity) grows it to its content immediately
- [ ] Below the cap, wheel events reach the outer scroller
- [ ] The source contains no reference to notebook-editor-container or data-code-max-height
