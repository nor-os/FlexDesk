---
id: 82
type: story
title: "Canvas editor viewport API, zoom buttons and an optional minimap"
status: in-progress
parent: 73
phase: 
assignee: norman_agent
reporter: norman
due:
points: 3
subsystem: canvas
labels: [flexdesk, modeler]
links: [relates-to 7]
created: 2026-10-17
updated: 2026-10-18T09:43Z
---

## Description

The canvas editor has no viewport API and no zoom controls, and auto-fits on load. The legacy modeler had zoom in/out/reset and a stored viewport. New options `viewport` (start value) and `onViewportChange` (the host stores it; FlexDesk stores nothing), `editor.getViewport()` / `setViewport()`, zoom -/+/100% buttons on the toolbar, and an optional `minimap: true` overview where a click pans the view. STORY-0007 can use the same hook to remember zoom per person. Rules for this story (from EPIC-0073): opt-in through createCanvasEditor options or catalogue types only, so a consumer that sets none of them sees no change in behaviour, DOM or serialise() output; no application vocabulary (tests/flow_kit_vocabulary.test.mjs stays green); no runtime dependencies; nothing stored inside FlexDesk; every edit is a closed-list action, so one gesture is one undo entry in FlowHistory.

## Acceptance criteria

- [ ] `load` with `viewport` opens at that scale and position and does not auto-fit
- [ ] `onViewportChange` fires once per finished pan or zoom gesture, not per pointer move
- [ ] The zoom buttons change scale in fixed steps and stop at the kernel's limits
- [ ] With `minimap: true`, clicking the minimap centres the view on that point; without it no minimap is in the DOM

## History

- 2026-10-17 · norman_agent · status: draft -> refined
- 2026-10-18 · norman_agent · status: refined -> in-progress
- 2026-10-18 · norman_agent · assignee:  -> norman_agent

## Comments

### 2026-10-17T21:20Z · norman_agent (status: draft -> refined)

Refined: 4 acceptance criteria, 3 points, parented to EPIC-0073. Criteria drafted from the legacy modeler (../EcoSim_legacy) and the current canvas editor code, with norman's 2026-10-17 decisions applied; correct them before anything is built against them.
