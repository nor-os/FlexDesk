---
id: 77
type: story
title: "Canvas editor copy, cut, paste and duplicate of nodes and the lines between them"
status: review
parent: 73
phase: 
assignee: norman
reporter: norman
due:
points: 3
subsystem: canvas
labels: [flexdesk, modeler]
links: [blocked-by 76, relates-to 65]
created: 2026-10-17
updated: 2026-10-19T17:43Z
---

## Description

The canvas editor binds no clipboard. The legacy modeler copied nodes with their internal connections and pasted them offset (app_bootstrap.js). Copy puts the selected nodes and the lines among them on an in-memory clipboard, or on a host `clipboard: {read, write}` hook. Paste remaps ids with nextId, offsets the copy, selects it and applies an optional `prepareCopy(node)` hook. Ctrl+C/X/V/D; actions flow:paste and flow:node:duplicate, using STORY-0065's naming rules (fresh id, derived label). Rules for this story (from EPIC-0073): opt-in through createCanvasEditor options or catalogue types only, so a consumer that sets none of them sees no change in behaviour, DOM or serialise() output; no application vocabulary (tests/flow_kit_vocabulary.test.mjs stays green); no runtime dependencies; nothing stored inside FlexDesk; every edit is a closed-list action, so one gesture is one undo entry in FlowHistory.

## Acceptance criteria

- [x] Copy then paste of two connected nodes yields two new ids, the line between them, and the copy offset from the original and selected
- [x] Lines to nodes outside the selection are not copied
- [x] Ctrl+D duplicates the selection, and one Ctrl+Z removes the whole duplicate
- [x] A `prepareCopy` hook can clear a config key on the copy while the original keeps it
- [x] A host `clipboard` hook receives the copied JSON and supplies what is pasted
- [x] In read-only mode Paste and Cut are refused with a reason and change nothing

## History

- 2026-10-17 · norman_agent · status: draft -> refined
- 2026-10-19 · norman_agent · status: refined -> in-progress
- 2026-10-19 · norman_agent · assignee: (none) -> norman_agent
- 2026-10-19 · norman_agent · status: in-progress -> review
- 2026-10-19 · norman_agent · assignee: norman_agent -> norman

## Comments

### 2026-10-17T21:20Z · norman_agent (status: draft -> refined)

Refined: 6 acceptance criteria, 3 points, parented to EPIC-0073. Criteria drafted from the legacy modeler (../EcoSim_legacy) and the current canvas editor code, with norman's 2026-10-17 decisions applied; correct them before anything is built against them.

### 2026-10-19T17:43Z · norman_agent (status: in-progress -> review)

Built and landed on main: tip e410973 (the feature, rebased onto origin/main 4d91716). origin/story-0077 still holds the pre-rebase history (feature d289827, then merge 4db4ec9); it was not force-pushed.

What it adds: a new opt-in `clipboard` option on createCanvasEditor. `true` keeps the copy in memory inside the editor; `{read(), write(text)}` hands it to the host. A second option, `prepareCopy(node, {from, via})`, lets the host change a copy's config or label before it is added.
- Keys: Ctrl/Cmd+C, X, V and D, bound only when `clipboard` is set. With nothing selected, C, X and D are left to the browser.
- Methods: `copy()`, `cut()`, `paste(text?)` and `duplicate()` answer `{ok, ids}` or `{ok: false, reason}`. `paste()` returns a promise when the host's `read` is async. Without the option they answer `{ok: false, reason: null}`.
- What is copied: the selected steps and the lines among them, as the graph's own serialise() text `{nodes, connections}`. Lines to steps outside the selection are left out, and so are steps whose type the palette does not offer (such as a start step) or that are `unavailable`.
- Paste: every step gets a fresh id from nextId and the lines between them are re-made. The copy is offset two grid steps right and down, one more step for each further paste of the same text; the first paste after a cut lands where the steps were. The copy ends up selected, and each paste is one `flow:paste` undo entry.
- Duplicate: the same beside the selection without touching the clipboard, as one `flow:node:duplicate` entry.
- Cut: one `flow:node:remove` or `flow:nodes:remove` entry.
- Labels: a name already in the flow gets a derived label, `Title (copy)`, then `(copy 2)`, the lanes editor's duplicate rule, so a cut-then-paste keeps its names.
- Refusals: text that is not steps, or names a type the flow does not have, is refused with a sentence on the message line. In read-only mode Paste, Cut and Duplicate are refused with the read-only reason; Copy still works.

Other changes: `flow:paste` and `flow:node:duplicate` added to CANVAS_ACTIONS (additive, as EPIC-0073 lists), with the action-list check in tests/flow_canvas_editor.test.mjs extended the way STORY-0076 did it; new words in CANVAS_STRINGS; README rows for the two options and four methods, the action list, a *Copy and paste* paragraph and the new suite in the list of checking suites. Files: src/flow/canvas_editor/editor.js, src/flow/canvas_editor/strings.js, README.md, tests/flow_canvas_editor.test.mjs, tests/flow_canvas_clipboard.test.mjs (new). No new exports; without `clipboard` the keys, DOM and serialise() output are unchanged (§0 of the new suite checks this).

Ticked all six criteria, each checked by tests/flow_canvas_clipboard.test.mjs: copy/paste of two connected nodes (new ids, the line, offset, selected); lines to outside nodes not copied; Ctrl+D duplicates and one Ctrl+Z removes it; `prepareCopy` clears a config key on the copy only; host `clipboard` hook receives the JSON and supplies the paste; read-only refuses Paste and Cut with a reason and changes nothing.

Tests: on the rebased tip, `node tests/run.mjs` (Linux node) ran to the end: "FLEXDESK TESTS: GREEN — 159 suite(s)", exit 0, no FAIL or SKIPPED lines. `node build.mjs` succeeded; dist/ was restored and not committed.

App check: the real-browser probe `node.exe demo/flow_canvas_probe.mjs` was re-run on the rebased tip; every check held, exit 0. That probe does not drive the clipboard keys, so the clipboard itself is checked by the jsdom suite only; it confirms the editor's existing real-browser behaviour is unchanged.
