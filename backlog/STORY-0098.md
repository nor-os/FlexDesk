---
id: 98
type: story
title: "An already-open single-instance kind receives new props when navigated to again"
status: in-progress
parent: 29
phase:
assignee: norman_agent
reporter: norman
due:
points: 3
subsystem:
labels: [migration, flexdesk]
links: []
created: 2026-10-22
updated: 2026-10-22T11:22Z
---

## Description

EcoSim STORY-0035 (`../EcoSim/backlog/STORY-0035.md`) routes every in-app navigation through wm.navigate. Navigating to a single-instance kind that is already open only reveals it today; the new props are lost. Opt-in and generic: no application vocabulary; a consumer that uses none of it sees no change. Document it in a README section headed "(0.17.2)".

norman decided on 2026-10-22 (Claude Code session) that the generic capabilities EcoSim's shell cutover needs are built in FlexDesk first and released as 0.17.2, per his principle that FlexDesk provides every generic UI mode and apps configure it.

## Acceptance criteria

- [ ] wm.navigate(kind, props) on an open single-instance kind reveals it and calls its content's `navigate(props)` hook once with the new props
- [ ] The props are recorded on the tab, so a page restore reopens it with the latest props
- [ ] A content without a `navigate` hook is revealed unchanged and nothing throws
- [ ] Navigating with the same props twice calls the hook twice (no deduplication) and creates no second instance

## History

- 2026-10-22 · norman_agent · status: draft -> refined
- 2026-10-22 · norman_agent · status: refined -> in-progress
- 2026-10-22 · norman_agent · assignee: (none) -> norman_agent

## Comments

### 2026-10-22T11:04Z · norman_agent (status: draft -> refined)

Filed and refined on norman's decision (2026-10-22): 4 criteria, 3 points, parented to EPIC-0029, in 0.17.2 (STORY-0103).

### 2026-10-22T11:22Z · norman_agent

Status: blocked, waiting on norman. Nothing landed.

Implemented, committed (8c8ec40) and pushed to origin/story-0098 (worktree /mnt/c/Users/Norman/repos/FlexDesk-story-0098, branched from origin/main b79a1c6). Not yet ready: the full `node tests/run.mjs` had reached flow_lanes_duplicate with no failures when the run was stopped, and `node build.mjs` has not been run.

What changed:
- `WindowManager.revealInstance` (src/tiling/wm.js) calls a new `_deliverProps` once after a successful reveal. It re-finds the instance (a reveal from a page archive moves it into the tile's tabs), gets the mounted content via `_scopeContent`, and if the content returned a `navigate(props)` hook, records a copy of the props on the tab (leaf tab, the tile's `content` mirror and `rebaselineLeaf` for a tile; `rec.tabs[idx]` and `rec.original` for a window), persists, then calls the hook. A throwing hook becomes `console.warn('[wm] content navigate threw')`.
- Every open path goes through `revealInstance`, so top nav, openInPrimary, openInTab*, splitLeafWith and Back all deliver.
- Fixed: writing only `tabs[idx].props` made the next tab activation re-mirror `leaf.content.props`, changing the tile key and rebuilding the tile; `content` is now kept in step with the tab.
- No new exports. The hook is part of the content-factory contract, noted in src/tiling/content_registry.js. README section "### An open single instance takes new props: `navigate(props)` (0.17.2)" after the `single` (0.17.0) section; no application vocabulary; a consumer without the hook sees no change.

Question for norman: is it acceptable that an open naming no props (top-nav button, `openInPrimary(kind)`, `navigate(kind)`) only reveals the instance and does not call navigate({})? The hook is not called and the tab keeps its props; otherwise every top-nav click on an open single kind would wipe its recorded props with {}. Documented in the wm.js docstring and the README.

Left to do: in the worktree, let `node tests/run.mjs` finish with no FAIL or `: SKIPPED` lines, then `node build.mjs`, `git checkout -- dist`, and remove any new untracked dist chunk files.
