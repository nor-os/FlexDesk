---
id: 79
type: story
title: "Canvas node titles, notes and chosen fields edit in place on the canvas"
status: review
parent: 73
phase: 
assignee: norman
reporter: norman
due:
points: 2
subsystem: canvas
labels: [flexdesk, modeler]
links: [blocked-by 74]
created: 2026-10-17
updated: 2026-10-19T19:46Z
---

## Description

Renaming a canvas node needs F2 or the settings panel; the legacy modeler edited labels in place (node_renderer.js). A double-click on a node title (or a note's text once STORY-0078 lands) edits it in place: Enter or blur commits, Escape cancels, recording flow:node:label. A type may list `inline: ['key']`; those config fields draw on the node through the settings panel's widget registry. Rules for this story (from EPIC-0073): opt-in through createCanvasEditor options or catalogue types only, so a consumer that sets none of them sees no change in behaviour, DOM or serialise() output; no application vocabulary (tests/flow_kit_vocabulary.test.mjs stays green); no runtime dependencies; nothing stored inside FlexDesk; every edit is a closed-list action, so one gesture is one undo entry in FlowHistory.

## Acceptance criteria

- [x] Double-clicking a node title shows a text box with the name selected
- [x] Enter or blur commits as one undo entry; Escape restores the previous name and records nothing
- [x] An `inline` number field on the node and the same field in the settings panel stay in step in both directions
- [x] An empty title is refused with a reason and the previous name stays
- [x] In read-only mode a double-click opens no editor

## History

- 2026-10-17 · norman_agent · status: draft -> refined
- 2026-10-19 · norman_agent · status: refined -> in-progress
- 2026-10-19 · norman_agent · assignee: (none) -> norman_agent
- 2026-10-19 · norman_agent · status: in-progress -> review
- 2026-10-19 · norman_agent · assignee: norman_agent -> norman

## Comments

### 2026-10-17T21:20Z · norman_agent (status: draft -> refined)

Refined: 5 acceptance criteria, 2 points, parented to EPIC-0073. Criteria drafted from the legacy modeler (../EcoSim_legacy) and the current canvas editor code, with norman's 2026-10-17 decisions applied; correct them before anything is built against them.

### 2026-10-19T19:46Z · norman_agent (status: in-progress -> review)

Built and landed on main. What it does, all opt-in, so a consumer that sets none of it sees the same DOM and the same serialise() output:
- `renameInPlace: true`. A double-click on a step's title opens a text box with the whole name selected. Enter or blur commits one `flow:node:label` entry, and none if the name is unchanged. Escape puts the name back and records nothing. An empty name is refused with a sentence on the gesture line and the old name stays. Read only, a double-click opens nothing, and going read only closes an open box without writing.
- A type's `inline: ['key']`. These settings are drawn on the node through the panel's widget registry. A change on the node is a `flow:node:config` edit that the panel shows at once. A change in the panel, or an undo, redraws the node's control. A focused control is redrawn with its focus and caret kept, but the control being typed in is not redrawn under the reader.
- The three reviewer issues are fixed: a focused inline control now redraws, the dead edit fields are gone, and the demo turns the feature on and is probed in real Edge. The demo uses `renameInPlace` and http-request `inline: ['timeout_seconds']`.

Ticked, all 5 criteria. Each is covered by tests/flow_canvas_edit_in_place.test.mjs. The first three are also checked in real headless Edge by the "in place" section of demo/flow_canvas_probe.mjs, with a real double-click, select-all, blur commit, Ctrl+Z, and keys on the node control and in the panel. Editing a note's text in place still waits on STORY-0078. The criteria do not cover it.

Landed tip on main: f03fe54. The branch was rebased onto origin/main, which had moved on to STORY-0075 (b554489), and pushed as a fast-forward. The rebase had conflicts with STORY-0077, 0083, 0050 and 0075 in editor.js, strings.js, README.md and the probe, and I kept both sides. One example: the setCatalogue row keeps both `inline` and the `connections` sentence. A rebase does not replay merge commits, so the README sentence about the focused control, which was written in merge b559661, is restored by its own commit, f03fe54. I checked the rebased tree against the reviewed merge tip 7dfffce: the only differences are STORY-0075's changes. origin/story-0079 still holds the pre-rebase history (tip 7dfffce), and the local branch was not pushed back.

Tests: `node tests/run.mjs` (Linux node) on f03fe54 gave "FLEXDESK TESTS: GREEN — 163 suite(s)", exit 0, with no FAIL and no `: SKIPPED` lines. `node build.mjs` succeeded; dist/ was restored and cleaned, not committed.

App check: `node.exe demo/flow_canvas_probe.mjs` (real headless Edge) on f03fe54 printed "every check held", including the "in place" section.
