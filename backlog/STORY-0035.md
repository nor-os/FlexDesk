---
id: 35
type: story
title: "Panel tile sizes survive load, desktop switch and panel toggle"
status: review
parent: 29
phase:
assignee: norman
reporter: norman
due:
points: 3
subsystem: shell
labels: [shell, panels, bugfix]
links: [relates-to BUG-0007]
created: 2026-10-17
updated: 2026-10-19T10:29Z
---

## Description

_canonicalize detaches panel leaves and wrap() builds a new split with hard-coded sizes [1,4]/[4,1], so every load, desktop switch and toggle resets user-dragged panel sizes. Each panel's share of its parent split is recorded before detaching and reused when wrapping; defaults apply only to a newly opened panel.

Related EcoSim records: EcoSim STORY-0034 (`../EcoSim/backlog/STORY-0034.md`).

Filed from the EcoSim -> FlexDesk 0.16 migration analysis (2026-10-17).

## Acceptance criteria

- [x] A Navigator dragged to 40% width is 40% after a reload
- [x] A Console dragged to 50% height is 50% after switching desktop and back
- [x] Toggling the right panel keeps the left and bottom panel sizes unchanged
- [x] A panel opened for the first time uses the default ratio

## History

- 2026-10-17 · norman_agent · status: draft -> refined
- 2026-10-17 · norman_agent · status: refined -> in-progress
- 2026-10-17 · norman_agent · assignee: (unset) -> norman_agent
- 2026-10-19 · norman_agent · status: in-progress -> review
- 2026-10-19 · norman_agent · assignee: norman_agent -> norman

## Comments

### 2026-10-17T07:55Z · norman_agent (status: draft -> refined)

Refined: 4 acceptance criteria, 3 points, parented to EPIC-0029. Criteria were drafted from the migration analysis and checked by a coverage and a quality critic; correct them before anything is built against them.

### 2026-10-18T01:57Z · norman_agent

Where this stands: built on branch `story-0035`, tip e1100b1 on origin/story-0035. Not landed: after two fix rounds an independent review still finds problems, so it is not approved. The behaviour is right, though, and only two code comments need fixing.

Checked:
- All four acceptance criteria hold. I have not ticked them here, because the story is not approved yet.
- The full suite passes: `node tests/run.mjs` exited 0, and the runner fails on any SKIPPED suite.
- `node build.mjs` succeeds. I reverted and cleaned dist/ afterwards.
- The new tests/panel_sizes_kept.test.mjs fails against origin/main's src (10 FAILs, then a TypeError), so it is a real regression test for BUG-0007.
- The branch has no edits under backlog/, bugs/ or dist/, no TODOs and no EcoSim or app vocabulary. It merges cleanly onto the current origin/main.

Open:
1. src/tiling/wm.js:3957-3963: the two new helpers, `_panelLeaves` and `_clampPanelShare`, were inserted between `_tabTitle`'s JSDoc block ("Derive a tab's display title from the content it carries ...", ending at line 3961) and `function _tabTitle`. That JSDoc now sits on top of `/** The panel leaves of \`tree\`, by side. */` and `_panelLeaves`, and `_tabTitle` (line 3984) has no doc comment. To fix: move both helpers above the `_tabTitle` JSDoc, or below `_tabTitle`, so each block sits directly above its own function, like the rest of the file.
2. src/tiling/wm.js:3169-3174 (the step 2 comment in `_canonicalize`): it says measuring first catches "a split resized without a drag". The only writer of split sizes in src/ is the renderer's splitter drag (tile_renderer.js:1872), and the end of that drag now records shares through `_onSplitResized`, so no such path exists. To fix: drop that example and keep only the real case, a stored blob that predates `panelShares`. The comment will then describe code that actually exists.

Side note: the alerts_pane 'grouped by day' check fails on any run in the first few minutes after local midnight, because its seed entries come from minutesAgo(). It may be worth a separate bug.

### 2026-10-19T10:29Z · norman_agent (status: in-progress -> review)

Landed on main at a00ee8a (rebased onto origin/main 66c5589, fast-forward). This is the rebased form of approved tip 39861dc; origin/story-0035 still holds the pre-rebase history (39861dc) and was not pushed again.

What was built: `_canonicalize` records each panel's share of its parent split before it detaches the panel leaves, and `wrap()` reuses that share instead of the hard-coded [1,4]/[4,1]. The shares are kept in the saved desktop layout under a new `panelShares` key, so they survive load, desktop switch and panel toggle. Defaults apply only to a panel that has no recorded share yet. The end of a splitter drag records the new share through the new `onSplitResized` renderer option. New public API, documented in the README: `TileRenderer.MIN_SLOT_FRACTION`, the `onSplitResized` constructor option and the `panelShares` key.

Review items:
- The reviewer's onSplitResized issue is fixed (39861dc). `_onMouseUp` in src/tiling/tile_renderer.js now compares the split's sizes with `drag.startSizes` and does not call `onSplitResized` when they are equal. A click, a jitter only across the splitter, or a drag that ends where it began no longer saves the layout or sends `split-resized`. The new case 'a splitter moved across but not along saves nothing' in tests/panel_sizes_kept.test.mjs covers it: it fails (3 FAILs) with 0376ae1's tile_renderer.js and passes with the fix.
- Both open items from the comment that names e1100b1 are fixed: `_panelLeaves` and `_clampPanelShare` now sit above `_tabTitle`'s JSDoc, so every doc block is directly above its own function, and the step 2 comment in `_canonicalize` names only the real cases (the default, and a stored blob that predates `panelShares`).

Ticked all four criteria: Navigator at 40% after a reload, Console at 50% after switching desktop and back, toggling the right panel keeps the left and bottom sizes, and a panel opened for the first time uses the default ratio. Each one is checked in tests/panel_sizes_kept.test.mjs.

Tests: after the rebase, `node tests/run.mjs` in the worktree ran to completion with "FLEXDESK TESTS: GREEN — 145 suite(s)", exit 0, no `: SKIPPED` lines and no FAIL lines (the only match is the passing assertion 'an older request FAILING last is dropped too'). `node build.mjs` succeeded; dist/ was reverted and cleaned afterwards and is not committed.

App check: none in a live app. These criteria are FlexDesk behaviour and are checked by the panel_sizes_kept suite in FlexDesk's test harness. Seeing it in EcoSim belongs to EcoSim STORY-0034.

BUG-0007 is handed back to testing in the same commit.
