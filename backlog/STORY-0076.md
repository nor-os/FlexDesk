---
id: 76
type: story
title: "Canvas editor multi-selection with bulk move, delete, nudge, align and distribute"
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
updated: 2026-10-19T15:29Z
---

## Description

Canvas selection is a single `{kind, id}` and the kernel's marquee selection is unused. The legacy modeler (canvas_adapter.js, app_bootstrap.js multi-select) moved and deleted many nodes at once. Selection becomes a set: marquee, Shift/Ctrl-click, Ctrl+A, Escape. Move, Delete and arrow nudge (grid step; Shift = 10 steps) act on all selected nodes; align left/centre/right/top/middle/bottom and distribute horizontally/vertically on the toolbar and as `editor.align(kind)` / `editor.distribute(axis)`. Tab moves focus between nodes (closing the kernel's keyboard gap). onSelect reports `{kind: 'many', ids}` for several. New actions flow:nodes:move, flow:nodes:remove, flow:nodes:align. Undo stays FlowHistory snapshots (owner decision). Rules for this story (from EPIC-0073): opt-in through createCanvasEditor options or catalogue types only, so a consumer that sets none of them sees no change in behaviour, DOM or serialise() output; no application vocabulary (tests/flow_kit_vocabulary.test.mjs stays green); no runtime dependencies; nothing stored inside FlexDesk; every edit is a closed-list action, so one gesture is one undo entry in FlowHistory.

## Acceptance criteria

- [x] A marquee over three nodes selects those three and onSelect reports `{kind: 'many', ids}` with their ids; a single selection still reports the existing shape
- [x] Dragging one of three selected nodes moves all three, and one Ctrl+Z puts all three back
- [x] Delete removes every selected node and their lines as one undo entry
- [x] Align left gives every selected node the same x; distribute horizontally leaves equal gaps (within 1 px)
- [x] An arrow key nudges the selection by gridSize, Shift+arrow by ten grid steps; Tab moves keyboard focus to the next node
- [x] In read-only mode none of these gestures change the graph
- [x] On a 300-node graph, a bulk move of 50 selected nodes and its undo each complete in under 100 ms in the probe

## History

- 2026-10-17 · norman_agent · status: draft -> refined
- 2026-10-18 · norman_agent · status: refined -> in-progress
- 2026-10-18 · norman_agent · assignee: (none) -> norman_agent
- 2026-10-19 · norman_agent · status: in-progress -> review
- 2026-10-19 · norman_agent · assignee: norman_agent -> norman

## Comments

### 2026-10-17T21:20Z · norman_agent (status: draft -> refined)

Refined: 7 acceptance criteria, 5 points, parented to EPIC-0073. Criteria drafted from the legacy modeler (../EcoSim_legacy) and the current canvas editor code, with norman's 2026-10-17 decisions applied; correct them before anything is built against them.

### 2026-10-19T15:29Z · norman_agent (status: in-progress -> review)

Landed on main and handed back to norman for review.

What was built: createCanvasEditor's opt-in `multiSelect` option (0.17.0). Selection is now a set: marquee, Shift/Ctrl-click toggle, Ctrl+A and Escape. Move, Delete and arrow nudge act on all selected nodes; nudge is one gridSize step, or ten with Shift. Align left/centre/right/top/middle/bottom and distribute horizontally/vertically are on the toolbar and also available as `editor.align(kind)` and `editor.distribute(axis)`. Tab moves keyboard focus between nodes. onSelect reports `{kind: 'many', ids}` when several are picked and keeps the existing shape for one. The new closed-list actions are flow:nodes:move, flow:nodes:remove and flow:nodes:align, each one FlowHistory snapshot, so one gesture is one undo entry. A consumer that does not set `multiSelect` sees no change.

Reviewer fixes (commit 614171c):
1. src/flow/canvas_editor/editor.js: `pressed` now lasts exactly one press. A window capture-phase pointerup/pointercancel listener clears it, and destroy() removes it. Tab therefore picks the focused node after a port click, a right-click, or a press let go off the node.
2. The README API row now reads `select(id | [id, …] | 'flow' | null)`.
3. A §5 regression block in tests/flow_canvas_multiselect.test.mjs. Its 6 assertions failed before the fix and pass after it.

Ticked: all 7 criteria (marquee + onSelect shape; group drag + one Ctrl+Z; bulk Delete as one undo entry; align left / distribute horizontally; arrow / Shift+arrow nudge and Tab focus; read-only; 300-node probe timing).

Landed tip on main: 614171c, a fast-forward from 7be01ac. Branch story-0076 was rebased onto origin/main locally (feature 9529e43 + fix 614171c). origin/story-0076 still holds the pre-rebase history (ec38a44 + merge 3a505c7) and was not force-pushed.

Tests: `node tests/run.mjs` (Linux node) ran to completion on the rebased tip: "FLEXDESK TESTS: GREEN — 154 suite(s)", exit 0, no ': SKIPPED' lines. `node build.mjs` succeeded; dist/ was reset and not committed.

App check: the real-browser probe `node.exe demo/flow_canvas_probe.mjs` was re-run on the rebased tip. Every check held, exit 0. The 300-node bulk move of 50 steps took 3.7 ms and its undo 5.4 ms, both under 100 ms.
