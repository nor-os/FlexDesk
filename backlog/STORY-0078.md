---
id: 78
type: story
title: "Canvas graphs carry flat groups and free-text notes that move, edit and undo with the nodes"
status: review
parent: 73
phase: 
assignee: norman
reporter: norman
due:
points: 8
subsystem: canvas
labels: [flexdesk, modeler]
links: [blocked-by 74, blocked-by 76]
created: 2026-10-17
updated: 2026-10-20T09:37Z
---

## Description

The legacy modeler had named, coloured groups whose members moved together, and free-text captions (data/dtos/group.js, caption.js). The canvas graph drops every field it does not know (normalise/serialise keep id, type, label, config, position). The graph gains optional `groups: [{id, label, tone, nodes: [ids]}]` and `notes: [{id, text, position, size?}]`, emitted only when non-empty. Groups are flat, one group per node (owner decision). Groups draw behind nodes as framed areas with a title; dragging the frame moves the members; Ctrl+G groups the selection, Ctrl+Shift+G ungroups. Actions flow:group:add/remove/label/members and flow:note:add/remove/edit/move. Rules for this story (from EPIC-0073): opt-in through createCanvasEditor options or catalogue types only, so a consumer that sets none of them sees no change in behaviour, DOM or serialise() output; no application vocabulary (tests/flow_kit_vocabulary.test.mjs stays green); no runtime dependencies; nothing stored inside FlexDesk; every edit is a closed-list action, so one gesture is one undo entry in FlowHistory.

## Acceptance criteria

- [x] A graph without groups or notes serialises to exactly the same bytes as before this story (test)
- [x] Ctrl+G on two nodes draws one frame around both; dragging the frame moves both as one undo entry
- [x] Grouping a node that already belongs to a group moves it to the new group (a node is never in two groups)
- [x] Removing a grouped node shrinks its group; removing the last member removes the group
- [x] A note can be added, edited in place, moved and each step undone
- [x] A marquee selects notes and nodes together, and copy/paste (STORY-0077) carries both
- [x] Groups and notes survive serialise -> load unchanged

## History

- 2026-10-17 · norman_agent · status: draft -> refined
- 2026-10-19 · norman_agent · status: refined -> in-progress
- 2026-10-19 · norman_agent · assignee:  -> norman_agent
- 2026-10-20 · norman_agent · status: in-progress -> review
- 2026-10-20 · norman_agent · assignee: norman_agent -> norman

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

### 2026-10-19T23:02Z · norman_agent

Status: blocked. I fixed the reviewer's blocking issue and pushed it. I cannot report STORY-0078 as ready yet: the harness made me return before the full suite finished, so I have not seen a green run. When I returned, the run (started at 1ef58cd's content) had reached list_tiles.test.mjs and every suite before it had passed. I also have not run `node build.mjs` this round.

- **The fix:** in src/flow/canvas_editor/editor.js, the group title bar's pointerdown guard (line 2127) is now `editing?.kind === 'group' && editing.id === id`, and the note's pointerdown guard (line 2296) is now `editing?.kind === 'note' && editing.id === id`. Before, a group and a note with the same id blocked each other's drag while one of them was being edited.
- **Regression check:** new §10 in tests/flow_canvas_groups_notes.test.mjs. It loads a graph with group 'x' and note 'x'. It then drags group 'x''s title bar while note 'x' is open for typing, and drags note 'x' while group 'x' is being renamed. Each drag must move its item as one history entry. Without the fix both checks fail and the suite exits 1. With the fix the suite passes and exits 0.
- **Branch:** I committed 1ef58cd on story-0078 and pushed it as a fast-forward (287a02e..1ef58cd). origin/main was already merged in at 2e358ac. There are no dist/, backlog/ or bugs/ edits on the branch.

Open: run `node tests/run.mjs` in the worktree at 1ef58cd and let it finish (it takes more than 10 minutes), then run `node build.mjs` followed by `git checkout -- dist && git clean -fdq dist`. If both are green, the item is ready for review.

Branch: story-0078 @ 1ef58cd. Nothing landed. Waiting on norman.

### 2026-10-20T09:37Z · norman_agent

Landed on main and handed back for review. All 7 criteria are ticked.

**What was built.** Canvas graphs now carry flat groups and free-text notes. Both are opt-in through createCanvasEditor `groups: true` / `notes: true` and are serialised only when non-empty. Groups are frames drawn behind their nodes: Ctrl/Cmd+G groups the pick and Ctrl/Cmd+Shift+G ungroups, the title bar drags every member as one entry, and a double-click renames the group in place. Notes are added from the toolbar, edited in place, moved and deleted. A marquee, Shift/Ctrl+click and Ctrl+A pick notes along with nodes. Every edit is one closed-list action (flow:group:add/remove/label/members, flow:note:add/remove/edit/move). Criterion 6's copy/paste half is f87551e, built on STORY-0077's copyNodes/pasteNodes: picked notes are pasted under fresh ids, and groups wholly inside the copy are re-created with remapped ids. The fixes from the review rounds are 1ef58cd, acf6a0c, a24251a and 2d4ea92. The 2026-10-17T21:20Z and 2026-10-19 comments describe the API, CSS, strings and README changes.

**Ticked (each checked):**
- Criterion 1, same bytes without groups or notes: §0 of tests/flow_canvas_groups_notes.test.mjs. serialise() and the editor with and without the options give the old text.
- Criterion 2, Ctrl+G frames two nodes and the frame drag is one undo entry: §1, and in a real browser in the probe.
- Criterion 3, a regrouped node moves to the new group: §2.
- Criterion 4, removing members shrinks the group and the last one removes it: §3.
- Criterion 5, a note is added, edited in place, moved, and each step undone: §4, and real input in the probe.
- Criterion 6, a marquee picks notes and nodes together, and copy/paste carries both: §5 and §9, and a real marquee in the probe.
- Criterion 7, groups and notes survive serialise -> load: §6. Load gives the same text and the same graph, and normalise/serialise is a fixed point.

**Landed.** main is now at 4c71520, a fast-forward from 7eebb64 (`git push origin HEAD:main`). The branch already contained origin/main through its merge commit 4c71520, and main had nothing newer. A linear `git rebase origin/main` would have re-opened the merge conflicts that 4c71520 already resolves (10 files, starting with the first feature commit 78d6395), so I aborted it and landed the tip as it was. main already carries merge commits. origin/story-0078 is also at 4c71520, so nothing was rewritten and nothing was force-pushed. The branch is kept; the worktree is removed.

**Tests.**
- `node tests/run.mjs` (Linux node v18.19.1) in the worktree at 4c71520 finished with "FLEXDESK TESTS: GREEN — 168 suite(s)", exit 0, and no `: SKIPPED` lines. I watched it finish.
- `node build.mjs` exited 0. I reverted dist/ afterwards, so no dist/ changes are committed.

**App check.** `demo/flow_canvas_probe.mjs` in headless Edge over CDP (Windows node), at 4c71520: exit 0, 94 ok lines, 0 FAIL. Its groups section passes 11 checks with real input:
- a real Ctrl+G frames two steps but not the third
- a title-bar drag moves both steps as one entry, and one Ctrl+Z puts them back
- the note opens on a real double-click, takes typed text and Ctrl+Enter, and moves on a drag
- a real marquee picks the steps and the note together
