---
id: 84
type: story
title: "A modeler demo page, a headless probe and a README section show the canvas modeler options working together"
status: refined
parent: 73
phase: 
assignee:
reporter: norman
due:
points: 3
subsystem: canvas
labels: [flexdesk, modeler]
links: [blocked-by 74, blocked-by 75, blocked-by 76, blocked-by 77, blocked-by 78, blocked-by 79, blocked-by 80, blocked-by 81, blocked-by 82, blocked-by 83]
created: 2026-10-17
updated: 2026-10-17T21:20Z
---

## Description

The modeler options are only proven when used together. `demo/flow_modeler.html` builds a neutral signal-flow catalogue (source, gain, sum, display) with every option from STORY-0074 to STORY-0083; a headless-Edge probe in the style of the existing canvas probe drives it; README gains a 'Building a modeler' section. Rules for this story (from EPIC-0073): opt-in through createCanvasEditor options or catalogue types only, so a consumer that sets none of them sees no change in behaviour, DOM or serialise() output; no application vocabulary (tests/flow_kit_vocabulary.test.mjs stays green); no runtime dependencies; nothing stored inside FlexDesk; every edit is a closed-list action, so one gesture is one undo entry in FlowHistory.

## Acceptance criteria

- [ ] The demo opens from demo/index.html and shows custom node bodies, data connections, a group, a note and styled lines
- [ ] The probe drags a connection, groups two nodes, copies and pastes them, arranges, and undoes each step, checking the measured result after each
- [ ] Live badges in the demo update at least once per second without moving focus
- [ ] The README section lists every modeler option with a short example
- [ ] The vocabulary gate passes over the demo's FlexDesk sources

## History

- 2026-10-17 · norman_agent · status: draft -> refined

## Comments

### 2026-10-17T21:20Z · norman_agent (status: draft -> refined)

Refined: 5 acceptance criteria, 3 points, parented to EPIC-0073. Criteria drafted from the legacy modeler (../EcoSim_legacy) and the current canvas editor code, with norman's 2026-10-17 decisions applied; correct them before anything is built against them.
