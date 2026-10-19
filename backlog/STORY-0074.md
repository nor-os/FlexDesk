---
id: 74
type: story
title: "Canvas node types draw their own body, size and accent, and can be registered after the editor opens"
status: review
parent: 73
phase: 
assignee: norman
reporter: norman
due:
points: 5
subsystem: canvas
labels: [flexdesk, modeler]
links: []
created: 2026-10-17
updated: 2026-10-19T16:04Z
---

## Description

Today every canvas node is the same header + port rows + summary (`buildNode` in editor.js), rebuilt only when type or label changes, with geometry from fixed CANVAS_NODE arithmetic. A modeler needs nodes that show their own controls and values (the legacy node_renderer.js render/updateDisplay and the node_addons idea). A catalogue type may carry `render(body, node, ctx)` and `update(body, node, ctx)`, an optional `size: {w, h}` (or measured), and an `accent` tone token; `ctx` offers `setConfig(patch)` (records flow:node:config), `readOnly` and the host `services`. `editor.setCatalogue()` / catalogue registration after load adds types at runtime. Extends catalogue.js, editor.js (buildNode, paintNodes) and layout.js (port anchors per type size). Rules for this story (from EPIC-0073): opt-in through createCanvasEditor options or catalogue types only, so a consumer that sets none of them sees no change in behaviour, DOM or serialise() output; no application vocabulary (tests/flow_kit_vocabulary.test.mjs stays green); no runtime dependencies; nothing stored inside FlexDesk; every edit is a closed-list action, so one gesture is one undo entry in FlowHistory.

## Acceptance criteria

- [x] A type with `render` shows its own DOM below its ports; a type without one renders exactly as today (existing CSS and geometry tests unchanged)
- [x] `update` runs on every repaint and the body element keeps its identity: a focused input inside it keeps focus and its value across 10 repaints
- [x] Changing a value through `ctx.setConfig` from a body control creates exactly one undo entry, and Ctrl+Z restores the previous config
- [x] On a node with a custom `size`, every line end meets its port dot within 1 px (probe)
- [x] A type registered after `load` appears in the palette and its nodes draw without reloading the graph
- [x] A `render` that throws leaves that node drawn with the default body and reports the error through the editor's findings, without breaking other nodes

## History

- 2026-10-17 · norman_agent · status: draft -> refined
- 2026-10-18 · norman_agent · status: refined -> in-progress
- 2026-10-18 · norman_agent · assignee: (none) -> norman_agent
- 2026-10-19 · norman_agent · status: in-progress -> review
- 2026-10-19 · norman_agent · assignee: norman_agent -> norman

## Comments

### 2026-10-17T21:20Z · norman_agent (status: draft -> refined)

Refined: 6 acceptance criteria, 5 points, parented to EPIC-0073. Criteria drafted from the legacy modeler (../EcoSim_legacy) and the current canvas editor code, with norman's 2026-10-17 decisions applied; correct them before anything is built against them.

### 2026-10-19T16:04Z · norman_agent (status: in-progress -> review)

Landed on main and handed back for review.

What was built: a catalogue type can carry `render(body, node, ctx)` and `update(body, node, ctx)`, `size: {w, h}` and an `accent` tone. The body sits below the ports and is built once with the node. `update` runs on the same element on every repaint. `ctx` is `{setConfig(patch), readOnly, services}`, and `setConfig` is one `flow:node:config` undo entry. It clones the whole patch first, so a patch that cannot be copied is refused (`false`) and writes nothing; that was the reviewer's last point. Lines are anchored at each type's own width. `editor.setCatalogue()` swaps the types while the editor is open: the palette is redrawn, and only nodes whose type definition actually changed are rebuilt. A `render` or `update` that throws becomes one of the editor's own findings, shown beside the consumer's. A type without these keys draws exactly as before. The code is in src/flow/canvas_editor/{editor,layout,index}.js and src/flow/kit/catalogue.js, with tests in tests/flow_canvas_node_body.test.mjs and the `bodies` section of demo/flow_canvas_probe.mjs. The README has a "Node bodies" section.

Ticked: all 6 criteria (own body below the ports, with types without a body unchanged; `update` on every repaint keeping body identity, focus and value; `setConfig` as one undo entry that Ctrl+Z restores; line ends within 1 px on a sized node, by probe; a type registered after `load` appears in the palette and draws; a throwing `render` leaves the default body plus a finding, and other nodes are unaffected).

Landed tip on main: 2190c39. I rebased story-0074 locally onto origin/main f5a58c5 and pushed it fast-forward (0c4c59a, 3fa3e2f, 2190c39). origin/story-0074 still holds the pre-rebase history (7f77911, with merges of main). The rebase conflicted with STORY-0076 (multiSelect) and STORY-0081 (edgeStyle/routing) in editor.js, index.js, README.md and the probe. The two sides were combined like this:
- multiSelect's align, distribute, marquee hit-test and Tab bring-into-view now use each type's own width (`widthOf`) instead of the fixed box width.
- Obstacle routing boxes use it too.
- paintNode takes the picked set.
- The routing-fallback strip (`paintStrip`) now shows the editor's own body findings along with the consumer's.
- The probe screenshots are renumbered (5-many, 6-bodies, 7-narrow).

Tests: full suite `node tests/run.mjs` (Linux node), run to completion on the rebased tip: "FLEXDESK TESTS: GREEN — 156 suite(s)", exit 0, no ": SKIPPED" and no failed assertion. `node build.mjs` exit 0, and dist/ was reverted afterwards (not committed).

App check: `node.exe demo/flow_canvas_probe.mjs` (headless Edge) exit 0, every check held, including all `bodies` checks (palette, 280x170 box, body below ports, accent, every line end within 1 px of its dot) and STORY-0076's `many` checks on the merged code. `node.exe demo/flow_canvas_edges_probe.mjs` exit 0, every check held.
