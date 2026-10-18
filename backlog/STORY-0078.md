---
id: 78
type: story
title: "Canvas graphs carry flat groups and free-text notes that move, edit and undo with the nodes"
status: refined
parent: 73
phase: 
assignee:
reporter: norman
due:
points: 8
subsystem: canvas
labels: [flexdesk, modeler]
links: [blocked-by 74, blocked-by 76]
created: 2026-10-17
updated: 2026-10-17T21:20Z
---

## Description

The legacy modeler had named, coloured groups whose members moved together, and free-text captions (data/dtos/group.js, caption.js). The canvas graph drops every field it does not know (normalise/serialise keep id, type, label, config, position). The graph gains optional `groups: [{id, label, tone, nodes: [ids]}]` and `notes: [{id, text, position, size?}]`, emitted only when non-empty. Groups are flat, one group per node (owner decision). Groups draw behind nodes as framed areas with a title; dragging the frame moves the members; Ctrl+G groups the selection, Ctrl+Shift+G ungroups. Actions flow:group:add/remove/label/members and flow:note:add/remove/edit/move. Rules for this story (from EPIC-0073): opt-in through createCanvasEditor options or catalogue types only, so a consumer that sets none of them sees no change in behaviour, DOM or serialise() output; no application vocabulary (tests/flow_kit_vocabulary.test.mjs stays green); no runtime dependencies; nothing stored inside FlexDesk; every edit is a closed-list action, so one gesture is one undo entry in FlowHistory.

## Acceptance criteria

- [ ] A graph without groups or notes serialises to exactly the same bytes as before this story (test)
- [ ] Ctrl+G on two nodes draws one frame around both; dragging the frame moves both as one undo entry
- [ ] Grouping a node that already belongs to a group moves it to the new group (a node is never in two groups)
- [ ] Removing a grouped node shrinks its group; removing the last member removes the group
- [ ] A note can be added, edited in place, moved and each step undone
- [ ] A marquee selects notes and nodes together, and copy/paste (STORY-0077) carries both
- [ ] Groups and notes survive serialise -> load unchanged

## History

- 2026-10-17 · norman_agent · status: draft -> refined

## Comments

### 2026-10-17T21:20Z · norman_agent (status: draft -> refined)

Refined: 7 acceptance criteria, 8 points, parented to EPIC-0073. Criteria drafted from the legacy modeler (../EcoSim_legacy) and the current canvas editor code, with norman's 2026-10-17 decisions applied; correct them before anything is built against them.
