---
id: 80
type: story
title: "Canvas Arrange takes a pluggable layered layout with rank hints, crossing reduction and separate components"
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

Canvas Arrange is flow-specific (orders from start-role steps), and the kernel `arrange` sorts columns by label. The legacy auto_layout.js did longest-path layers, sources-left/sinks-right ranks, barycentre crossing reduction and separate components with measured sizes. New pure `layeredLayout(nodes, edges, {rank(node), sizeOf(node), columnGap, rowGap, componentGap})` in src/canvas (the existing `arrange` stays as is for Tables). Editor option `layout: 'flow' | 'layered' | fn(graph, ctx) -> Map` (default 'flow') drives Arrange; Arrange can apply to the selection only. Rules for this story (from EPIC-0073): opt-in through createCanvasEditor options or catalogue types only, so a consumer that sets none of them sees no change in behaviour, DOM or serialise() output; no application vocabulary (tests/flow_kit_vocabulary.test.mjs stays green); no runtime dependencies; nothing stored inside FlexDesk; every edit is a closed-list action, so one gesture is one undo entry in FlowHistory.

## Acceptance criteria

- [x] A chain A->B->C is laid out in three columns, left to right
- [x] A node whose `rank` hint is 'sink' lands in the last column; 'source' in the first
- [x] A crossing-prone two-layer fixture ends with fewer edge crossings than its input order (unit test)
- [x] Two disconnected components do not overlap
- [x] With two nodes selected, Arrange moves only those two, as one undo entry
- [x] A layout of 300 nodes and 400 edges completes in under 200 ms in the unit test

## History

- 2026-10-17 · norman_agent · status: draft -> refined
- 2026-10-18 · norman_agent · status: refined -> in-progress
- 2026-10-18 · norman_agent · assignee:  -> norman_agent
- 2026-10-19 · norman_agent · status: in-progress -> review
- 2026-10-19 · norman_agent · assignee: norman_agent -> norman
- 2026-10-21 · norman_agent · status: review -> done

## Comments

### 2026-10-17T21:20Z · norman_agent (status: draft -> refined)

Refined: 6 acceptance criteria, 5 points, parented to EPIC-0073. Criteria drafted from the legacy modeler (../EcoSim_legacy) and the current canvas editor code, with norman's 2026-10-17 decisions applied; correct them before anything is built against them.

### 2026-10-18T13:07Z · norman_agent

Where this stands: built and pushed on branch `story-0080` (tip e1bdee8, merges cleanly into origin/main). Nothing has landed on main. Status stays as it is.

Built: a pure `layeredLayout(nodes, edges, {rank, sizeOf, columnGap, rowGap, componentGap, passes})` in `src/canvas/layered_layout.js`, exported from canvas.js. It lays out components separately and stacks them largest first, breaks cycles, assigns longest-path columns, honours 'source'/'sink' rank hints, runs barycentre sweeps that keep the order with the fewest crossings, and sizes columns from the measured node sizes. The kernel `arrange` is unchanged. The editor has a new option `layout: 'flow' | 'layered' | fn(graph, ctx) -> Map`. The default is 'flow', so a consumer that does not set it sees no change. Any other value throws at construction. `editor.arrange({ids})` lays out only the named steps and the lines between them; only those move, as one `flow:arrange` undo entry. There is a new string `arrangeLayeredTitle` and README rows for all of it.

Open, for norman: criterion 5 ("With two nodes selected, Arrange moves only those two, as one undo entry") needs multi-selection. That is STORY-0076, which is in progress with nothing pushed, so two nodes cannot be selected on main. I tested the subset behaviour through `editor.arrange({ids: [a, b]})`: only those two move, and one Ctrl+Z takes it back. Criterion 5 is not ticked. I did not build a set selection here because that is 0076's scope. Which do you want?
1. Accept criterion 5 on the `arrange({ids})` API. STORY-0076 then wires the toolbar: when the selection is `{kind:'many', ids}`, Arrange calls `arrangeGraph({ids})`. That is one line, and the refusal for fewer than two steps already covers the subset.
2. Keep this story open until 0076 lands, then add that wiring here.

### 2026-10-19T13:44Z · norman_agent

Where it stands: the work is still on branch `story-0080`. I merged origin/main into it (no conflicts) and pushed it, fast-forward, as 0b9fbf6. Nothing has landed on main. Five of the six criteria pass.

The branch has `layeredLayout` in `src/canvas/layered_layout.js` (exported from the canvas entry), the editor option `layout: 'flow' | 'layered' | fn` (default 'flow'), `editor.arrange({ids})` (arranges only the named steps as one `flow:arrange` undo entry), the string `arrangeLayeredTitle`, README rows, and the suites `tests/canvas_layered_layout.test.mjs` and `tests/flow_canvas_layered.test.mjs`.

Open, for norman: criterion 5 ("With two nodes selected, Arrange moves only those two, as one undo entry") needs a set selection. That is STORY-0076, which is still in progress with nothing on origin/main. On the branch, `editor.arrange({ids: [a, b]})` moves only those two steps, and one Ctrl+Z puts both back. Criterion 5 is not ticked. The question from 2026-10-18T13:07Z has no answer yet, and the record has no decision. Which do you want?
1. Accept criterion 5 on the `arrange({ids})` API. STORY-0076 then wires the toolbar Arrange button to `arrangeGraph({ids})` when the selection is `{kind:'many', ids}` (a one-line change).
2. Keep STORY-0080 open until 0076 lands, then add that wiring and a selection-driven test here.

### 2026-10-19T23:23Z · norman_agent (status: in-progress -> review)

Landed on main, tip 4db1af5 (fast-forward 96eda85..4db1af5). Handing back to norman for review. The branch was rebased onto origin/main into two linear commits: 8f72c7d (layeredLayout, the `layout` option, `arrange({ids})`, and the toolbar's Arrange laying out only the pick, which was the selection wiring from the old merge commit 7e626ff) and 4db1af5 (the review fixes). The rebased tree has the same changes as the reviewed branch tip 2372f0e, checked by diff. origin/story-0080 still holds the pre-rebase history (2372f0e, with its merge commits). I did not push the rebased branch there, because that would have needed a force-push.

What was built:
- `layeredLayout(nodes, edges, {rank, sizeOf, columnGap, rowGap, componentGap, passes})` is in `src/canvas/layered_layout.js`, exported from the canvas entry. It does components laid out separately, cycle breaking, longest-path columns, 'source'/'sink' rank hints, barycentre crossing reduction and measured column sizes. The kernel `arrange` is unchanged.
- The editor option `layout: 'flow' | 'layered' | fn(graph, ctx) -> Map` defaults to 'flow', so a consumer that sets nothing sees no change. Any other value throws at construction.
- `editor.arrange({ids})` lays out only the named steps, as one `flow:arrange` undo entry. With a `{kind:'many', ids}` selection (STORY-0076), the toolbar's Arrange lays out only the picked steps.
- The catalogue reads and checks `rank`. Only 'source' or 'sink' are accepted, and anything else becomes a `problems` line. It answers `rank(typeId)`, which is null when a type has no rank. Its internal category helper was renamed `categoryIndex`.
- A `layout` function's place must be finite `{x, y}`, or Arrange throws before anything moves or is committed. A step the Map leaves out stays where it is.
- There is a new string `arrangeLayeredTitle` and README rows for all of the above.

Ticked, all six:
- A chain A->B->C in three columns
- sink/source ranks
- fewer crossings on the two-layer fixture
- disconnected components do not overlap
- two selected nodes, only they move, as one undo entry
- 300 nodes and 400 edges in under 200 ms

They are covered by `tests/canvas_layered_layout.test.mjs`, `tests/flow_canvas_layered.test.mjs` (§3b selects two steps by Shift-click, §4 covers bad places) and `tests/flow_kit_catalogue.test.mjs` §6.

Tests: I ran `node tests/run.mjs` (Linux node v18.19.1) in the worktree on the rebased tip 4db1af5 and watched it finish: 'FLEXDESK TESTS: GREEN — 167 suite(s)', exit 0, no ': SKIPPED' lines. The only 'FAIL' match in the log is an assertion name. `node build.mjs` succeeded. dist/ was restored and not committed.

App check: `demo/flow_canvas_probe.mjs` (Windows node, headless Edge over CDP) passed every check: "every check held". That covers the editor with the default 'flow' layout (Arrange present and hit-testable, marquee multi-select, moves and undo), so default behaviour is unchanged. The probe does not drive `layout: 'layered'` in the browser. That path is covered by the jsdom suites above.

The flake mentioned earlier (`flow_canvas_live_values.test.mjs` §2 measures time with Date.now()) did not show up in this run. It is unchanged and could be filed as a separate bug if wanted.

### 2026-10-21T07:42Z · norman_agent (status: review -> done)

norman decided on 2026-10-21 (Claude Code session) to release FlexDesk 0.17.0 now and to accept every story on the 0.17.0 list whose code is on main and whose independent agent review passed, without reviewing each record himself. Its code is on main (audited), so it is done and ships in 0.17.0.
