---
id: 37
type: story
title: "Content can replace its tile chrome actions after mount, with labels, disabled and pressed states"
status: in-progress
parent: 29
phase:
assignee: norman_agent
reporter: norman
due:
points: 3
subsystem: shell
labels: [shell, tile-chrome]
links: []
created: 2026-10-17
updated: 2026-10-17T21:43Z
---

## Description

chromeActions are read once at mount and drawn icon-only. ctx.setChromeActions(specs) works like setTitle (works during mount, later call wins, ignored on a stale ctx, survives repaint, null/[] clears). Specs add label, disabled (tooltip kept), pressed (aria-pressed) and {separator:true}.

Related EcoSim records: EcoSim STORY-0042 (`../EcoSim/backlog/STORY-0042.md`).

Filed from the EcoSim -> FlexDesk 0.16 migration analysis (2026-10-17).

## Acceptance criteria

- [ ] Calling setChromeActions after mount repaints the tile's action buttons without remounting the content
- [ ] A spec with pressed:true renders aria-pressed='true' and a pressed style
- [ ] A disabled action is not clickable and keeps its tooltip
- [ ] A setChromeActions call from a ctx of a rebuilt leaf changes nothing
- [ ] Specs with only {icon,title,onClick} render exactly as today

## History

- 2026-10-17 · norman_agent · status: draft -> refined
- 2026-10-17 · norman_agent · status: refined -> in-progress
- 2026-10-17 · norman_agent · assignee: (none) -> norman_agent

## Comments

### 2026-10-17T07:55Z · norman_agent (status: draft -> refined)

Refined: 5 acceptance criteria, 3 points, parented to EPIC-0029. Criteria were drafted from the migration analysis and checked by a coverage and a quality critic; correct them before anything is built against them.

### 2026-10-17T21:43Z · norman_agent

Status: blocked. Waiting on norman.

STORY-0037 is built, committed and pushed (branch `story-0037`, commit 2131ea9, rebased onto origin/main a481224), but I can't mark it ready: the full `node tests/run.mjs` had not finished when I had to report. It was still running (it reached help_modal_css.test.mjs), with no FAIL lines and no `: SKIPPED` lines so far. No criteria are ticked.

An earlier run had left the work uncommitted in the worktree, so I reused it. I reviewed it, made one test stronger, committed and pushed it.

What it adds is `ctx.setChromeActions(specs)` on the per-leaf ctx in src/tiling/tile_renderer.js. It behaves like `setTitle`:
- During the mount it wins over the `chromeActions` the factory returns, and a later call wins.
- The buttons survive repaints, because a cached repaint keeps the same strip element.
- `null` or `[]` clears and hides the strip.
- A call from the ctx of a rebuilt leaf is ignored.

`_paintContentActions` now also handles `label` (plain text), `pressed` (sets `aria-pressed` and adds `twm-leaf__btn--pressed`), `disabled` (uses `aria-disabled` and a class rather than the `disabled` attribute so the tooltip still shows; the click handler skips `onClick`) and `{separator:true}`. New styles are in both css/base.css and css/flexdesk.css, and the hover highlight no longer applies to `.twm-leaf__btn--disabled`. README.md (section 0.17.0) and the doc comment in content_registry.js describe the API. No exports added or renamed, so entry files are unchanged. Nothing app-specific was added.

Test change: the stale-ctx section first passed even with the guard deleted, because the old strip is already detached. It now also checks that the stale ctx does not paint into its own old strip; with the guard removed that check fails, with it back it passes.

`node build.mjs` exits 0. Afterwards I restored dist/ (checkout plus removing the three new chunk files) so it is not committed. Nothing landed on the default branch.

Next step: rerun `node tests/run.mjs` in the worktree without starting anything else at the same time. If it is green with no `: SKIPPED` lines, the story is ready; the code and tests are already on origin/story-0037.
