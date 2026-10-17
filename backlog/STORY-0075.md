---
id: 75
type: story
title: "Canvas data ports connect under host rules, with port typing, drag-to-connect and a compatible-type picker on empty drop"
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

The canvas editor refuses connections between non-flow ports and allows one line per output (`logic_graph.canConnect`), and its kernel ConnectorRouter (accepts/provides/maxConnections, policy, offers) is unused. A dataflow modeler needs fan-out of data ports and typed legality, as the legacy connector_router.js and canvas_adapter.js startConnectionDrag provided. New option `connections: {dataPorts: 'connect', policy(ctx)}`; ports take the kernel's descriptor keys and legality goes through ConnectorRouter. Drag-to-connect works beside click-then-click; dropping a drag on empty canvas opens openStepPicker filtered to types with a compatible port and connects the new node. Rules for this story (from EPIC-0073): opt-in through createCanvasEditor options or catalogue types only, so a consumer that sets none of them sees no change in behaviour, DOM or serialise() output; no application vocabulary (tests/flow_kit_vocabulary.test.mjs stays green); no runtime dependencies; nothing stored inside FlexDesk; every edit is a closed-list action, so one gesture is one undo entry in FlowHistory.

## Acceptance criteria

- [ ] With `dataPorts: 'connect'`, one output port connects to two different inputs
- [ ] Without the option, every existing refusal happens with unchanged wording (existing tests unchanged)
- [ ] An input with `accepts: ['number']` refuses an output with `provides: ['text']` and shows the refusal reason as a sentence
- [ ] A policy returning `{ok: true, offer}` shows the offer and accepting it applies it
- [ ] While dragging a connection, only compatible ports carry the can-drop class
- [ ] Dropping a drag on empty canvas and picking a type adds the node and the connection as one undo entry; cancelling the picker adds nothing

## History

- 2026-10-17 · norman_agent · status: draft -> refined

## Comments

### 2026-10-17T21:20Z · norman_agent (status: draft -> refined)

Refined: 6 acceptance criteria, 5 points, parented to EPIC-0073. Criteria drafted from the legacy modeler (../EcoSim_legacy) and the current canvas editor code, with norman's 2026-10-17 decisions applied; correct them before anything is built against them.
