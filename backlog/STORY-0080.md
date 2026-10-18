---
id: 80
type: story
title: "Canvas Arrange takes a pluggable layered layout with rank hints, crossing reduction and separate components"
status: in-progress
parent: 73
phase: 
assignee: norman_agent
reporter: norman
due:
points: 5
subsystem: canvas
labels: [flexdesk, modeler]
links: []
created: 2026-10-17
updated: 2026-10-18T09:42Z
---

## Description

Canvas Arrange is flow-specific (orders from start-role steps), and the kernel `arrange` sorts columns by label. The legacy auto_layout.js did longest-path layers, sources-left/sinks-right ranks, barycentre crossing reduction and separate components with measured sizes. New pure `layeredLayout(nodes, edges, {rank(node), sizeOf(node), columnGap, rowGap, componentGap})` in src/canvas (the existing `arrange` stays as is for Tables). Editor option `layout: 'flow' | 'layered' | fn(graph, ctx) -> Map` (default 'flow') drives Arrange; Arrange can apply to the selection only. Rules for this story (from EPIC-0073): opt-in through createCanvasEditor options or catalogue types only, so a consumer that sets none of them sees no change in behaviour, DOM or serialise() output; no application vocabulary (tests/flow_kit_vocabulary.test.mjs stays green); no runtime dependencies; nothing stored inside FlexDesk; every edit is a closed-list action, so one gesture is one undo entry in FlowHistory.

## Acceptance criteria

- [ ] A chain A->B->C is laid out in three columns, left to right
- [ ] A node whose `rank` hint is 'sink' lands in the last column; 'source' in the first
- [ ] A crossing-prone two-layer fixture ends with fewer edge crossings than its input order (unit test)
- [ ] Two disconnected components do not overlap
- [ ] With two nodes selected, Arrange moves only those two, as one undo entry
- [ ] A layout of 300 nodes and 400 edges completes in under 200 ms in the unit test

## History

- 2026-10-17 · norman_agent · status: draft -> refined
- 2026-10-18 · norman_agent · status: refined -> in-progress
- 2026-10-18 · norman_agent · assignee:  -> norman_agent

## Comments

### 2026-10-17T21:20Z · norman_agent (status: draft -> refined)

Refined: 6 acceptance criteria, 5 points, parented to EPIC-0073. Criteria drafted from the legacy modeler (../EcoSim_legacy) and the current canvas editor code, with norman's 2026-10-17 decisions applied; correct them before anything is built against them.
