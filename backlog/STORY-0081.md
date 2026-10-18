---
id: 81
type: story
title: "Canvas connections take host styles (tone, dash, width, arrow, label), optional obstacle routing and hover highlight"
status: refined
parent: 73
phase: 
assignee:
reporter: norman
due:
points: 3
subsystem: canvas
labels: [flexdesk, modeler]
links: []
created: 2026-10-17
updated: 2026-10-17T21:20Z
---

## Description

Canvas lines are always simple curves (`routeEdge(..., {simple: true})`) with no style hook and no arrowheads. The legacy connection_renderer.js had dashes, source-coloured lines, highlight states and obstacle routing. New option `edgeStyle(connection, ctx) -> {tone, dashed, width, marker: 'arrow' | crow's-foot kind, label}`; option `routing: 'simple' | 'obstacles'` uses the kernel's obstacle routing within its node limit; hovering a node or line highlights the attached lines. Rules for this story (from EPIC-0073): opt-in through createCanvasEditor options or catalogue types only, so a consumer that sets none of them sees no change in behaviour, DOM or serialise() output; no application vocabulary (tests/flow_kit_vocabulary.test.mjs stays green); no runtime dependencies; nothing stored inside FlexDesk; every edit is a closed-list action, so one gesture is one undo entry in FlowHistory.

## Acceptance criteria

- [ ] A style with `dashed: true` shows a dash pattern on the drawn path
- [ ] `marker: 'arrow'` ends the line with an arrowhead at the input port
- [ ] A style `label` is drawn at the line's midpoint and is not hidden behind nodes
- [ ] With `routing: 'obstacles'`, a line does not cross a node placed between its ends (probe); above the kernel's node limit it falls back to simple curves and says so through findings
- [ ] Hovering a node gives its lines the highlighted class, and leaving removes it

## History

- 2026-10-17 · norman_agent · status: draft -> refined

## Comments

### 2026-10-17T21:20Z · norman_agent (status: draft -> refined)

Refined: 5 acceptance criteria, 3 points, parented to EPIC-0073. Criteria drafted from the legacy modeler (../EcoSim_legacy) and the current canvas editor code, with norman's 2026-10-17 decisions applied; correct them before anything is built against them.
