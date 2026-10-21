---
id: 75
type: story
title: "Canvas data ports connect under host rules, with port typing, drag-to-connect and a compatible-type picker on empty drop"
status: done
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
updated: 2026-10-21T07:42Z
---

## Description

The canvas editor refuses connections between non-flow ports and allows one line per output (`logic_graph.canConnect`), and its kernel ConnectorRouter (accepts/provides/maxConnections, policy, offers) is unused. A dataflow modeler needs fan-out of data ports and typed legality, as the legacy connector_router.js and canvas_adapter.js startConnectionDrag provided. New option `connections: {dataPorts: 'connect', policy(ctx)}`; ports take the kernel's descriptor keys and legality goes through ConnectorRouter. Drag-to-connect works beside click-then-click; dropping a drag on empty canvas opens openStepPicker filtered to types with a compatible port and connects the new node. Rules for this story (from EPIC-0073): opt-in through createCanvasEditor options or catalogue types only, so a consumer that sets none of them sees no change in behaviour, DOM or serialise() output; no application vocabulary (tests/flow_kit_vocabulary.test.mjs stays green); no runtime dependencies; nothing stored inside FlexDesk; every edit is a closed-list action, so one gesture is one undo entry in FlowHistory.

## Acceptance criteria

- [x] With `dataPorts: 'connect'`, one output port connects to two different inputs
- [x] Without the option, every existing refusal happens with unchanged wording (existing tests unchanged)
- [x] An input with `accepts: ['number']` refuses an output with `provides: ['text']` and shows the refusal reason as a sentence
- [x] A policy returning `{ok: true, offer}` shows the offer and accepting it applies it
- [x] While dragging a connection, only compatible ports carry the can-drop class
- [x] Dropping a drag on empty canvas and picking a type adds the node and the connection as one undo entry; cancelling the picker adds nothing

## History

- 2026-10-17 · norman_agent · status: draft -> refined
- 2026-10-18 · norman_agent · status: refined -> in-progress
- 2026-10-18 · norman_agent · assignee: (none) -> norman_agent
- 2026-10-19 · norman_agent · status: in-progress -> review
- 2026-10-19 · norman_agent · assignee: norman_agent -> norman
- 2026-10-21 · norman_agent · status: review -> done

## Comments

### 2026-10-17T21:20Z · norman_agent (status: draft -> refined)

Refined: 6 acceptance criteria, 5 points, parented to EPIC-0073. Criteria drafted from the legacy modeler (../EcoSim_legacy) and the current canvas editor code, with norman's 2026-10-17 decisions applied; correct them before anything is built against them.

### 2026-10-19T18:59Z · norman_agent (status: in-progress -> review)

Landed on main as b05d903. Handing back to norman for review.

What was built: a new `connections: {dataPorts: 'connect', policy}` option on createCanvasEditor. Each line it allows is checked by `connectionRules` (src/flow/canvas_editor/connections.js), which runs the kernel's ConnectorRouter over the port descriptors, then the port types (`accepts`/`provides`), then the host's policy. Data ports can connect, with any number of lines out of one output. You can drag from an output: dropping on an input connects it, and dropping on empty canvas opens the step picker, filtered to the types that have a compatible input, and connects the new step in one undo entry. While a line is being dragged, only the compatible inputs carry `--can-drop`. A policy's `{ok: true, offer}` is shown with Accept and Not now, and Accept applies it in one undo entry. Without the option, nothing is drawn, bound or changed. Also included: both review fixes (suite §9 in tests/flow_canvas_multiselect.test.mjs for Delete with several steps picked keeping a body's finding; the data-port test read once in port()).

Ticked: all 6 criteria. Each is covered by tests/flow_canvas_connections.test.mjs: §2 fan-out; §1 plus the existing suites, unchanged, for the refusals without the option; §3 port types with the sentence; §4 offer and Accept; §5 can-drop while dragging; §6 empty-canvas drop as one undo entry, with cancel adding nothing.

Landed tip: main b05d903, on top of 4cc71d0 (STORY-0050). Replaying the branch commits one at a time onto main conflicted with main's paintNode split (STORY-0077/0083). So the rebase is a single commit, and its tree is exactly the reviewed merge 371a4f6 combined with main (`git merge-tree` 371a4f6 origin/main was clean, tree 3834d05). origin/story-0075 still holds the pre-rebase history (371a4f6, six commits plus the merge of d6885f0). Its commit list is in the b05d903 message.

Tests: `node tests/run.mjs` (Linux node v18.19.1) on b05d903 ran to completion: "FLEXDESK TESTS: GREEN — 162 suite(s)", exit 0, 0 lines with ': SKIPPED'. `node build.mjs` succeeded, and dist/ was restored afterwards. No app check in a running app was done at landing. The criteria are verified by the suites above.

### 2026-10-21T07:42Z · norman_agent (status: review -> done)

norman decided on 2026-10-21 (Claude Code session) to release FlexDesk 0.17.0 now and to accept every story on the 0.17.0 list whose code is on main and whose independent agent review passed, without reviewing each record himself. Its code is on main (audited), so it is done and ships in 0.17.0.
