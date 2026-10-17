---
id: 57
type: story
title: "A conversation view with streaming messages and a composer"
status: draft
parent: 54
phase:
assignee:
reporter: norman
due:
points: 5
subsystem: widgets
labels: [widgets, new-component]
links: []
created: 2026-10-17
updated: 2026-10-17T07:55Z
---

## Description

Role-tagged messages (append, replaceAll, clear), beginStream/appendChunk/endStream re-rendering only the streaming message, caller render callback for bodies and a per-message extra slot, auto-scroll pinned to bottom within a threshold with a jump-to-latest affordance, readable/settable scroll position, growing textarea composer (Enter submits, Shift+Enter newline, Esc cancels), setBusy switching send to cancel, submit/cancel callbacks. No markdown or LLM dependency.

Related EcoSim records: EcoSim STORY-0088 (`../EcoSim/backlog/STORY-0088.md`).

Filed from the EcoSim -> FlexDesk 0.16 migration analysis (2026-10-17).

## Acceptance criteria

- [ ] appendChunk updates only the last message's DOM
- [ ] Scrolling up during streaming stops auto-scroll and shows jump-to-latest; clicking it resumes
- [ ] Enter submits the text and clears the composer; Shift+Enter inserts a newline
- [ ] setBusy(true) turns send into cancel, and Esc or a click calls cancel once
- [ ] A render callback that throws shows the message as plain text and the view keeps working
- [ ] replaceAll restores 100 messages and scrolls to the bottom
