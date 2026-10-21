---
id: 83
type: story
title: "Canvas nodes show host-driven live values and can collapse to their header"
status: done
parent: 73
phase: 
assignee: norman
reporter: norman
due:
points: 3
subsystem: canvas
labels: [flexdesk, modeler]
links: [blocked-by 74, relates-to 7]
created: 2026-10-17
updated: 2026-10-21T07:42Z
---

## Description

A modeler shows live values on nodes and ports while something runs (legacy node_renderer.updateDisplay), and large graphs need nodes folded away. `editor.setNodeValues({id: {badge, tone, ports: {name: text}}})` paints host-driven values through STORY-0074's `update` path, with no rebuild, no undo entry and no onChange; it extends setRunOverlay. A node can collapse to its header (`node.collapsed`, serialised only when true); its lines then attach to the header, following the kernel's collapsedPorts idea. Action flow:node:collapse. Rules for this story (from EPIC-0073): opt-in through createCanvasEditor options or catalogue types only, so a consumer that sets none of them sees no change in behaviour, DOM or serialise() output; no application vocabulary (tests/flow_kit_vocabulary.test.mjs stays green); no runtime dependencies; nothing stored inside FlexDesk; every edit is a closed-list action, so one gesture is one undo entry in FlowHistory.

## Acceptance criteria

- [x] Ten setNodeValues calls per second update the badge text and never take focus away from a field in the settings panel
- [x] setNodeValues creates no undo entry and fires no onChange
- [x] Collapsing a node hides its ports and keeps its lines attached to the header; Ctrl+Z expands it again
- [x] A collapsed flag survives serialise -> load; an expanded node writes no collapsed key

## History

- 2026-10-17 · norman_agent · status: draft -> refined
- 2026-10-19 · norman_agent · status: refined -> in-progress
- 2026-10-19 · norman_agent · assignee:  -> norman_agent
- 2026-10-19 · norman_agent · status: in-progress -> review
- 2026-10-19 · norman_agent · assignee: norman_agent -> norman
- 2026-10-21 · norman_agent · status: review -> done

## Comments

### 2026-10-17T21:20Z · norman_agent (status: draft -> refined)

Refined: 4 acceptance criteria, 3 points, parented to EPIC-0073. Criteria drafted from the legacy modeler (../EcoSim_legacy) and the current canvas editor code, with norman's 2026-10-17 decisions applied; correct them before anything is built against them.

### 2026-10-19T18:03Z · norman_agent (status: in-progress -> review)

Landed on main at d6885f0 (rebased onto f062ef0, STORY-0077's handback). origin/story-0083 still holds the pre-rebase history (7bb1e8b); it was not force-pushed.

What was built (src/flow/canvas_editor/{editor,layout,strings}.js, src/flow/kit/logic_graph.js, css/{base,flexdesk}.css):
- `editor.setNodeValues({[id]: {badge, tone, ports: {[name]: text}}} | null)` replaces what the host showed last time. The badge sits on the node header before the id tag, in a tone when it is one of TONES; each port value is a span beside its port. It extends the setRunOverlay idea: no node is rebuilt, no undo entry, no onChange, the settings panel is not touched. A type's own body reads the values as `ctx.values` (new getter on STORY-0074's ctx); its `update` runs only for nodes whose values changed, and a setConfig from there is refused. The badge and port-value elements exist only while there is a value, so a consumer that never calls it gets identical DOM.
- Opt-in option `collapsible: true`: a fold button on each header folds the node to its header and back, one `flow:node:collapse` entry each way; `editor.setCollapsed(id, bool)` does the same from code. While folded, port rows, body and everything under the header are hidden (`.twm-flow-graph__node--collapsed`); the lines stay, meeting the middle of the header on its left and right sides. portAnchor, nodeBottom and layoutGraph honour a `folded(node)` predicate on the box (the editor folds only with `collapsible`; plain callers fold on `node.collapsed === true`). Read only refuses folding.
- normalise()/serialise() carry `collapsed: true` only when true, written last after position; graphs that never folded a node give byte-identical text. Without `collapsible`, a `collapsed` flag is carried through untouched and the node is drawn unfolded.
- CANVAS_ACTIONS gains 'flow:node:collapse' (the additive change the epic lists); the action-list check in tests/flow_canvas_editor.test.mjs section 0 is the one expectation that changed.
- README documents the option, setNodeValues, setCollapsed, `ctx.values`, the new action and a "Live values and folded steps (0.17.0)" subsection with the probe claims. demo/flow_canvas_probe.mjs gains a `live` section (screenshots renumbered 7-bodies, 8-minimap, 9-narrow).
- No new module exports, no public API broken.

Rebase: conflicts with STORY-0077 (clipboard) in README.md, editor.js and tests/flow_canvas_editor.test.mjs were textual only; both sides kept (header comment blocks, options `clipboard, prepareCopy, collapsible`, CANVAS_ACTIONS ending `flow:paste`, `flow:node:duplicate`, `flow:node:collapse`, the README action list and test-suite list).

Ticked all four criteria: ten setNodeValues calls per second update the badge and keep the settings field's focus; no undo entry and no onChange; folding hides ports, lines stay on the header, Ctrl+Z unfolds; collapsed survives serialise -> load and an expanded node writes no key.

Tests, on the rebased tip: `node tests/run.mjs` (Linux node) ran to completion, "FLEXDESK TESTS: GREEN — 160 suite(s)", exit 0, no ": SKIPPED" lines (includes tests/flow_canvas_live_values.test.mjs and flow_kit_vocabulary). `node build.mjs` exit 0; dist/ reverted, not committed.

App check: `node.exe demo/flow_canvas_probe.mjs` (headless Edge) on the rebased tip: every check held, including the new `live` section (real keys into a settings field during ten setNodeValues calls 100 ms apart, real fold-button click, real Ctrl+Z) and every existing section.

### 2026-10-21T07:42Z · norman_agent (status: review -> done)

norman decided on 2026-10-21 (Claude Code session) to release FlexDesk 0.17.0 now and to accept every story on the 0.17.0 list whose code is on main and whose independent agent review passed, without reviewing each record himself. Its code is on main (audited), so it is done and ships in 0.17.0.
