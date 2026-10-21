---
id: 81
type: story
title: "Canvas connections take host styles (tone, dash, width, arrow, label), optional obstacle routing and hover highlight"
status: done
parent: 73
phase: 
assignee: norman
reporter: norman
due:
points: 3
subsystem: canvas
labels: [flexdesk, modeler]
links: []
created: 2026-10-17
updated: 2026-10-21T07:42Z
---

## Description

Canvas lines are always simple curves (`routeEdge(..., {simple: true})`) with no style hook and no arrowheads. The legacy connection_renderer.js had dashes, source-coloured lines, highlight states and obstacle routing. New option `edgeStyle(connection, ctx) -> {tone, dashed, width, marker: 'arrow' | crow's-foot kind, label}`; option `routing: 'simple' | 'obstacles'` uses the kernel's obstacle routing within its node limit; hovering a node or line highlights the attached lines. Rules for this story (from EPIC-0073): opt-in through createCanvasEditor options or catalogue types only, so a consumer that sets none of them sees no change in behaviour, DOM or serialise() output; no application vocabulary (tests/flow_kit_vocabulary.test.mjs stays green); no runtime dependencies; nothing stored inside FlexDesk; every edit is a closed-list action, so one gesture is one undo entry in FlowHistory.

## Acceptance criteria

- [x] A style with `dashed: true` shows a dash pattern on the drawn path
- [x] `marker: 'arrow'` ends the line with an arrowhead at the input port
- [x] A style `label` is drawn at the line's midpoint and is not hidden behind nodes
- [x] With `routing: 'obstacles'`, a line does not cross a node placed between its ends (probe); above the kernel's node limit it falls back to simple curves and says so through findings
- [x] Hovering a node gives its lines the highlighted class, and leaving removes it

## History

- 2026-10-17 · norman_agent · status: draft -> refined
- 2026-10-18 · norman_agent · status: refined -> in-progress
- 2026-10-18 · norman_agent · assignee: (none) -> norman_agent
- 2026-10-19 · norman_agent · status: in-progress -> review
- 2026-10-19 · norman_agent · assignee: norman_agent -> norman
- 2026-10-21 · norman_agent · status: review -> done

## Comments

### 2026-10-17T21:20Z · norman_agent (status: draft -> refined)

Refined: 5 acceptance criteria, 3 points, parented to EPIC-0073. Criteria drafted from the legacy modeler (../EcoSim_legacy) and the current canvas editor code, with norman's 2026-10-17 decisions applied; correct them before anything is built against them.

### 2026-10-19T15:45Z · norman_agent (status: in-progress -> review)

Landed on main: tip 6751047 (the branch rebased onto origin/main 63e734f, fast-forward). origin/story-0081 still holds the pre-rebase history (tip e51867a, with a merge of origin/main 62ab6c7); it was not force-pushed.

What was built: `createCanvasEditor` takes `edgeStyle(connection, ctx) -> {tone, dashed, width, marker: 'arrow' | crow's-foot kind, label}`, `routing: 'simple' | 'obstacles'` (the kernel's obstacle routing within OBSTACLE_ROUTING_NODE_LIMIT, otherwise plain curves plus a `canvas-routing-simple` finding in the strip) and `hoverHighlight` (a node or line under the pointer gives its lines `twm-flow-graph__edge--highlighted`, toggled in place, not repainted). Tone and width are `--twm-canvas-` properties, mirrored into base.css. The canvas geometry is exported from flow.js as `canvasPathPoints(d, {steps})` and `canvasPathMidpoint(d)`, and the README documents both. Reviewer fixes are in 9066178 (now 6751047 after the rebase): (1) the barrel re-exports, and the test imports them from '../flow.js'; (2) the hover test checks that the line elements are the same before and after each hover move. It re-captures only after `editor.select('c')`, which really does repaint. I checked that this test can fail by making hover() repaint: all 6 'in place' checks failed, then I restored it.

Rebase: conflicts in src/flow/canvas_editor/editor.js (option destructuring) and strings.js, against STORY-0076's multiSelect. I kept both sides: the `multiSelect` option and the align/distribute strings stay, and `edgeStyle`/`routing`/`hoverHighlight` and `routingFallback` sit beside them. Multi-node drag and nudge redraw through the same paintEdges, so styled and routed lines follow them.

Ticked: all 5 criteria (dash pattern; arrowhead at the input port; label at the midpoint, not hidden behind nodes; obstacle routing plus the fallback finding above the limit; hover highlight on and off).

Tests, on the rebased tip: `node tests/run.mjs` (Linux node), seen to finish: 'FLEXDESK TESTS: GREEN — 155 suite(s)', EXIT 0, no SKIPPED lines. `node build.mjs` succeeded; dist/ was reverted and cleaned, not committed.

App check, on the rebased tip: the CDP probe demo/flow_canvas_edges_probe.mjs, run with Windows node in headless Edge, printed 'every check held' (exit 0): computed dash, arrow tip on the port dot, the label is the element at its own centre, no line point inside the step's drawn box, the strip names the fallback above the limit, and a real pointer hover highlights and un-highlights.

### 2026-10-21T07:42Z · norman_agent (status: review -> done)

norman decided on 2026-10-21 (Claude Code session) to release FlexDesk 0.17.0 now and to accept every story on the 0.17.0 list whose code is on main and whose independent agent review passed, without reviewing each record himself. Its code is on main (audited), so it is done and ships in 0.17.0.
