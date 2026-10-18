---
id: 77
type: story
title: "Canvas editor copy, cut, paste and duplicate of nodes and the lines between them"
status: refined
parent: 73
phase: 
assignee:
reporter: norman
due:
points: 3
subsystem: canvas
labels: [flexdesk, modeler]
links: [blocked-by 76, relates-to 65]
created: 2026-10-17
updated: 2026-10-17T21:20Z
---

## Description

The canvas editor binds no clipboard. The legacy modeler copied nodes with their internal connections and pasted them offset (app_bootstrap.js). Copy puts the selected nodes and the lines among them on an in-memory clipboard, or on a host `clipboard: {read, write}` hook. Paste remaps ids with nextId, offsets the copy, selects it and applies an optional `prepareCopy(node)` hook. Ctrl+C/X/V/D; actions flow:paste and flow:node:duplicate, using STORY-0065's naming rules (fresh id, derived label). Rules for this story (from EPIC-0073): opt-in through createCanvasEditor options or catalogue types only, so a consumer that sets none of them sees no change in behaviour, DOM or serialise() output; no application vocabulary (tests/flow_kit_vocabulary.test.mjs stays green); no runtime dependencies; nothing stored inside FlexDesk; every edit is a closed-list action, so one gesture is one undo entry in FlowHistory.

## Acceptance criteria

- [ ] Copy then paste of two connected nodes yields two new ids, the line between them, and the copy offset from the original and selected
- [ ] Lines to nodes outside the selection are not copied
- [ ] Ctrl+D duplicates the selection, and one Ctrl+Z removes the whole duplicate
- [ ] A `prepareCopy` hook can clear a config key on the copy while the original keeps it
- [ ] A host `clipboard` hook receives the copied JSON and supplies what is pasted
- [ ] In read-only mode Paste and Cut are refused with a reason and change nothing

## History

- 2026-10-17 · norman_agent · status: draft -> refined

## Comments

### 2026-10-17T21:20Z · norman_agent (status: draft -> refined)

Refined: 6 acceptance criteria, 3 points, parented to EPIC-0073. Criteria drafted from the legacy modeler (../EcoSim_legacy) and the current canvas editor code, with norman's 2026-10-17 decisions applied; correct them before anything is built against them.
