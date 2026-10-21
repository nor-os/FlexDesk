---
id: 84
type: story
title: "A modeler demo page, a headless probe and a README section show the canvas modeler options working together"
status: done
parent: 73
phase: 
assignee: norman
reporter: norman
due:
points: 3
subsystem: canvas
labels: [flexdesk, modeler]
links: [blocked-by 74, blocked-by 75, blocked-by 76, blocked-by 77, blocked-by 78, blocked-by 79, blocked-by 80, blocked-by 81, blocked-by 82, blocked-by 83]
created: 2026-10-17
updated: 2026-10-21T10:10Z
---

## Description

The modeler options are only proven when used together. `demo/flow_modeler.html` builds a neutral signal-flow catalogue (source, gain, sum, display) with every option from STORY-0074 to STORY-0083; a headless-Edge probe in the style of the existing canvas probe drives it; README gains a 'Building a modeler' section. Rules for this story (from EPIC-0073): opt-in through createCanvasEditor options or catalogue types only, so a consumer that sets none of them sees no change in behaviour, DOM or serialise() output; no application vocabulary (tests/flow_kit_vocabulary.test.mjs stays green); no runtime dependencies; nothing stored inside FlexDesk; every edit is a closed-list action, so one gesture is one undo entry in FlowHistory.

## Acceptance criteria

- [x] The demo opens from demo/index.html and shows custom node bodies, data connections, a group, a note and styled lines
- [x] The probe drags a connection, groups two nodes, copies and pastes them, arranges, and undoes each step, checking the measured result after each
- [x] Live badges in the demo update at least once per second without moving focus
- [x] The README section lists every modeler option with a short example
- [x] The vocabulary gate passes over the demo's FlexDesk sources

## History

- 2026-10-17 · norman_agent · status: draft -> refined
- 2026-10-21 · norman_agent · status: refined -> in-progress
- 2026-10-21 · norman_agent · assignee:  -> norman_agent
- 2026-10-21 · norman_agent · status: in-progress -> done
- 2026-10-21 · norman_agent · assignee: norman_agent -> norman

## Comments

### 2026-10-17T21:20Z · norman_agent (status: draft -> refined)

Refined: 5 acceptance criteria, 3 points, parented to EPIC-0073. Criteria drafted from the legacy modeler (../EcoSim_legacy) and the current canvas editor code, with norman's 2026-10-17 decisions applied; correct them before anything is built against them.

### 2026-10-21T10:10Z · norman_agent (status: in-progress -> done)

Done by norman's 2026-10-21 process decision (landed + independently reviewed). Landed on main, tip 2048266 (branch story-0084, last at 25055d3).

Built: demo/flow_modeler.html and .js, demo/flow_modeler_probe.mjs, the demo link in demo/index.html, the README section "#### Building a modeler (0.17.1)", section 4 of tests/flow_kit_vocabulary.test.mjs, tests/flow_modeler_demo.test.mjs, and a fix in src/flow/canvas_editor/editor.js so pasted or duplicated copies keep their data lines under connections {dataPorts:'connect'} (covered by tests/flow_canvas_clipboard.test.mjs; 3 assertions fail with the fix removed). No public API broken, no exports changed.

Ticked all 5 criteria: demo opens from demo/index.html with custom bodies, data connections, a group, a note and styled lines; probe drags a connection, groups, copies/pastes, arranges and undoes each step with measured checks; live badges update at least once per second without moving focus; README lists every modeler option with an example; vocabulary gate passes over the demo's sources.

Tests: `node tests/run.mjs` exits 0, "FLEXDESK TESTS: GREEN — 183 suite(s)", 0 SKIPPED; `node build.mjs` exits 0 (dist/ restored, no untracked chunks); probe `node.exe demo/flow_modeler_probe.mjs` in headless Edge: every check held.

Note: at the probe's window size the demo opens at 100% and the two Display nodes are cut off at the right edge; that is the editor's design (never zoomed out below readable size on open), and Fit shows all of it.
