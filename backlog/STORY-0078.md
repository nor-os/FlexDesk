---
id: 78
type: story
title: "Canvas graphs carry flat groups and free-text notes that move, edit and undo with the nodes"
status: in-progress
parent: 73
phase: 
assignee: norman_agent
reporter: norman
due:
points: 8
subsystem: canvas
labels: [flexdesk, modeler]
links: [blocked-by 74, blocked-by 76]
created: 2026-10-17
updated: 2026-10-19T17:14Z
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
- 2026-10-19 · norman_agent · status: refined -> in-progress
- 2026-10-19 · norman_agent · assignee:  -> norman_agent

## Comments

### 2026-10-17T21:20Z · norman_agent (status: draft -> refined)

Refined: 7 acceptance criteria, 8 points, parented to EPIC-0073. Criteria drafted from the legacy modeler (../EcoSim_legacy) and the current canvas editor code, with norman's 2026-10-17 decisions applied; correct them before anything is built against them.

### 2026-10-19T17:14Z · norman_agent

Status: blocked on criterion 6. Criterion 6 ("copy/paste (STORY-0077) carries both") needs STORY-0077's clipboard on main, and it is not there yet. It exists only on origin/story-0077 (d289827 + merge 4db4ec9: copyNodes, pasteNodes and copyText in editor.js). Building on an unlanded branch would tie this branch to it, so I did not. The marquee half of criterion 6 is done and tested.

Choose one:
- (a) STORY-0078 waits until STORY-0077 lands. Then I extend its copyNodes/pasteNodes so picked notes are copied and pasted under fresh ids, and groups that lie wholly inside the copy are re-created with remapped ids.
- (b) The copy/paste half moves to STORY-0077 or a follow-up story, and STORY-0078 is reviewed now on the other 6 criteria plus the marquee half.

Where it stands: built on branch story-0078 (worktree /mnt/c/Users/Norman/repos/FlexDesk-story-0078) and pushed as a fast-forward. origin/story-0078 = 7daf72b: feature commit 78d6395 plus a merge of origin/main. The branch merges cleanly into origin/main, which has only record commits (c31cb73) beyond it. The full suite and the browser probe pass. 6 of the 7 criteria are met.

What was built (all opt-in):
- **Graph data** (src/flow/kit/logic_graph.js). normalise() and serialise() carry `groups: [{id, label?, tone?, nodes}]` and `notes: [{id, text, position, size?}]`, only when there are some. Groups are flat: a node stays in the first group that names it, ids that are not nodes are dropped, and an empty group is dropped. removeNode shrinks the node's group and removes the group with its last member.
- **Editor options.** createCanvasEditor gains `groups: true` and `notes: true`.
  - Groups are drawn as frames behind their nodes. The title bar is the drag handle and moves every member as one flow:nodes:move. A double-click renames the group in place. The frame body takes no pointer, so a marquee can start inside it.
  - Ctrl/Cmd+G groups the picked nodes, moving each out of its old group. Ctrl/Cmd+Shift+G ungroups.
  - The toolbar gains Group, Ungroup and Note, each refused in place with a reason when it cannot act.
  - A note is added from the toolbar and edited in place (double-click, or Enter on it; Ctrl+Enter or leaving the box keeps the text, Escape puts it back). It is moved by dragging and removed with Delete.
  - With multiSelect, a marquee, Shift/Ctrl+click and Ctrl+A pick notes along with nodes. Drag, nudge and Delete then act on all of them as one entry. onSelect reports `{kind:'note', id}`, and `{kind:'many', ids, notes}` when notes are in the pick.
- **New API:** group, ungroup, setGroup, setGroupMembers, addNote, editNote, moveNote, removeNote.
- **CANVAS_ACTIONS** gains flow:group:add/remove/label/members and flow:note:add/remove/edit/move.
- **Keys:** bindFlowKeys gains `group` and `ungroup` handlers (src/flow/kit/keys.js).
- CSS added to both css/base.css and css/flexdesk.css; strings to src/flow/canvas_editor/strings.js; README sections for the new options and API.
- **Tests:** new suite tests/flow_canvas_groups_notes.test.mjs. tests/flow_canvas_editor.test.mjs §0 now lists the 8 new action ids (the same kind of edit STORY-0076 made). tests/flow_canvas_css.test.mjs also collects the classes of an editor with groups and notes on. demo/flow_canvas_probe.mjs has a new `groups` section.

STORY-0077 will conflict with this branch: whichever of the two lands second has to merge the CANVAS_ACTIONS list (code and the contract test) and editor.js.

Branch: story-0078 @ 7daf72b. Nothing landed. Waiting on norman.
