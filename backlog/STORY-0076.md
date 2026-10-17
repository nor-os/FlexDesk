---
id: 76
type: story
title: "Canvas editor multi-selection with bulk move, delete, nudge, align and distribute"
status: draft
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

Canvas selection is a single `{kind, id}` and the kernel's marquee selection is unused. The legacy modeler (canvas_adapter.js, app_bootstrap.js multi-select) moved and deleted many nodes at once. Selection becomes a set: marquee, Shift/Ctrl-click, Ctrl+A, Escape. Move, Delete and arrow nudge (grid step; Shift = 10 steps) act on all selected nodes; align left/centre/right/top/middle/bottom and distribute horizontally/vertically on the toolbar and as `editor.align(kind)` / `editor.distribute(axis)`. Tab moves focus between nodes (closing the kernel's keyboard gap). onSelect reports `{kind: 'many', ids}` for several. New actions flow:nodes:move, flow:nodes:remove, flow:nodes:align. Undo stays FlowHistory snapshots (owner decision). Rules for this story (from EPIC-0073): opt-in through createCanvasEditor options or catalogue types only, so a consumer that sets none of them sees no change in behaviour, DOM or serialise() output; no application vocabulary (tests/flow_kit_vocabulary.test.mjs stays green); no runtime dependencies; nothing stored inside FlexDesk; every edit is a closed-list action, so one gesture is one undo entry in FlowHistory.

## Acceptance criteria

- [ ] A marquee over three nodes selects those three and onSelect reports `{kind: 'many', ids}` with their ids; a single selection still reports the existing shape
- [ ] Dragging one of three selected nodes moves all three, and one Ctrl+Z puts all three back
- [ ] Delete removes every selected node and their lines as one undo entry
- [ ] Align left gives every selected node the same x; distribute horizontally leaves equal gaps (within 1 px)
- [ ] An arrow key nudges the selection by gridSize, Shift+arrow by ten grid steps; Tab moves keyboard focus to the next node
- [ ] In read-only mode none of these gestures change the graph
- [ ] On a 300-node graph, a bulk move of 50 selected nodes and its undo each complete in under 100 ms in the probe
