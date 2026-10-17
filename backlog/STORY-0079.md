---
id: 79
type: story
title: "Canvas node titles, notes and chosen fields edit in place on the canvas"
status: refined
parent: 73
phase: 
assignee:
reporter: norman
due:
points: 2
subsystem: canvas
labels: [flexdesk, modeler]
links: [blocked-by 74]
created: 2026-10-17
updated: 2026-10-17T21:20Z
---

## Description

Renaming a canvas node needs F2 or the settings panel; the legacy modeler edited labels in place (node_renderer.js). A double-click on a node title (or a note's text once STORY-0078 lands) edits it in place: Enter or blur commits, Escape cancels, recording flow:node:label. A type may list `inline: ['key']`; those config fields draw on the node through the settings panel's widget registry. Rules for this story (from EPIC-0073): opt-in through createCanvasEditor options or catalogue types only, so a consumer that sets none of them sees no change in behaviour, DOM or serialise() output; no application vocabulary (tests/flow_kit_vocabulary.test.mjs stays green); no runtime dependencies; nothing stored inside FlexDesk; every edit is a closed-list action, so one gesture is one undo entry in FlowHistory.

## Acceptance criteria

- [ ] Double-clicking a node title shows a text box with the name selected
- [ ] Enter or blur commits as one undo entry; Escape restores the previous name and records nothing
- [ ] An `inline` number field on the node and the same field in the settings panel stay in step in both directions
- [ ] An empty title is refused with a reason and the previous name stays
- [ ] In read-only mode a double-click opens no editor

## History

- 2026-10-17 · norman_agent · status: draft -> refined

## Comments

### 2026-10-17T21:20Z · norman_agent (status: draft -> refined)

Refined: 5 acceptance criteria, 2 points, parented to EPIC-0073. Criteria drafted from the legacy modeler (../EcoSim_legacy) and the current canvas editor code, with norman's 2026-10-17 decisions applied; correct them before anything is built against them.
