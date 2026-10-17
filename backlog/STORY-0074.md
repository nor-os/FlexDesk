---
id: 74
type: story
title: "Canvas node types draw their own body, size and accent, and can be registered after the editor opens"
status: refined
parent: 73
phase: 
assignee:
reporter: norman
due:
points: 5
subsystem: canvas
labels: [flexdesk, modeler]
links: []
created: 2026-10-17
updated: 2026-10-17T21:20Z
---

## Description

Today every canvas node is the same header + port rows + summary (`buildNode` in editor.js), rebuilt only when type or label changes, with geometry from fixed CANVAS_NODE arithmetic. A modeler needs nodes that show their own controls and values (the legacy node_renderer.js render/updateDisplay and the node_addons idea). A catalogue type may carry `render(body, node, ctx)` and `update(body, node, ctx)`, an optional `size: {w, h}` (or measured), and an `accent` tone token; `ctx` offers `setConfig(patch)` (records flow:node:config), `readOnly` and the host `services`. `editor.setCatalogue()` / catalogue registration after load adds types at runtime. Extends catalogue.js, editor.js (buildNode, paintNodes) and layout.js (port anchors per type size). Rules for this story (from EPIC-0073): opt-in through createCanvasEditor options or catalogue types only, so a consumer that sets none of them sees no change in behaviour, DOM or serialise() output; no application vocabulary (tests/flow_kit_vocabulary.test.mjs stays green); no runtime dependencies; nothing stored inside FlexDesk; every edit is a closed-list action, so one gesture is one undo entry in FlowHistory.

## Acceptance criteria

- [ ] A type with `render` shows its own DOM below its ports; a type without one renders exactly as today (existing CSS and geometry tests unchanged)
- [ ] `update` runs on every repaint and the body element keeps its identity: a focused input inside it keeps focus and its value across 10 repaints
- [ ] Changing a value through `ctx.setConfig` from a body control creates exactly one undo entry, and Ctrl+Z restores the previous config
- [ ] On a node with a custom `size`, every line end meets its port dot within 1 px (probe)
- [ ] A type registered after `load` appears in the palette and its nodes draw without reloading the graph
- [ ] A `render` that throws leaves that node drawn with the default body and reports the error through the editor's findings, without breaking other nodes

## History

- 2026-10-17 · norman_agent · status: draft -> refined

## Comments

### 2026-10-17T21:20Z · norman_agent (status: draft -> refined)

Refined: 6 acceptance criteria, 5 points, parented to EPIC-0073. Criteria drafted from the legacy modeler (../EcoSim_legacy) and the current canvas editor code, with norman's 2026-10-17 decisions applied; correct them before anything is built against them.
