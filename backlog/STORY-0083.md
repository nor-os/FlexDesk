---
id: 83
type: story
title: "Canvas nodes show host-driven live values and can collapse to their header"
status: refined
parent: 73
phase: 
assignee:
reporter: norman
due:
points: 3
subsystem: canvas
labels: [flexdesk, modeler]
links: [blocked-by 74, relates-to 7]
created: 2026-10-17
updated: 2026-10-17T21:20Z
---

## Description

A modeler shows live values on nodes and ports while something runs (legacy node_renderer.updateDisplay), and large graphs need nodes folded away. `editor.setNodeValues({id: {badge, tone, ports: {name: text}}})` paints host-driven values through STORY-0074's `update` path, with no rebuild, no undo entry and no onChange; it extends setRunOverlay. A node can collapse to its header (`node.collapsed`, serialised only when true); its lines then attach to the header, following the kernel's collapsedPorts idea. Action flow:node:collapse. Rules for this story (from EPIC-0073): opt-in through createCanvasEditor options or catalogue types only, so a consumer that sets none of them sees no change in behaviour, DOM or serialise() output; no application vocabulary (tests/flow_kit_vocabulary.test.mjs stays green); no runtime dependencies; nothing stored inside FlexDesk; every edit is a closed-list action, so one gesture is one undo entry in FlowHistory.

## Acceptance criteria

- [ ] Ten setNodeValues calls per second update the badge text and never take focus away from a field in the settings panel
- [ ] setNodeValues creates no undo entry and fires no onChange
- [ ] Collapsing a node hides its ports and keeps its lines attached to the header; Ctrl+Z expands it again
- [ ] A collapsed flag survives serialise -> load; an expanded node writes no collapsed key

## History

- 2026-10-17 · norman_agent · status: draft -> refined

## Comments

### 2026-10-17T21:20Z · norman_agent (status: draft -> refined)

Refined: 4 acceptance criteria, 3 points, parented to EPIC-0073. Criteria drafted from the legacy modeler (../EcoSim_legacy) and the current canvas editor code, with norman's 2026-10-17 decisions applied; correct them before anything is built against them.
