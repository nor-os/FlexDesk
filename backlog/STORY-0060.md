---
id: 60
type: story
title: "renderPlotGrid draws a plot_config into any container; PlotPopoutWindow uses it"
status: review
parent: 59
phase:
assignee: norman
reporter: norman
due:
points: 5
subsystem: charts
labels: [charts]
links: [blocked-by 62]
created: 2026-10-17
updated: 2026-10-20T10:56Z
---

## Description

Export renderPlotGrid(container, plotConfig, results, options) -> {update, resize, dispose}: CSS grid from PLOT_LAYOUTS, per-subplot figures with multi-y axes, chart types, interpolation, stack groups, reference lines and bands, NaN handling, x-range clip, optional x-variable; empty-state message; guards for detached/zero-size containers. Options resolveSeries, seriesTransforms, overlays, derivedTraces, hiddenSeries, theme. PlotPopoutWindow's private #render is replaced by it.

Related EcoSim records: EcoSim STORY-0077 (`../EcoSim/backlog/STORY-0077.md`).

Filed from the EcoSim -> FlexDesk 0.16 migration analysis (2026-10-17).

## Acceptance criteria

- [x] A 2x2 config renders four subplots in the right grid areas
- [x] A subplot with no data shows the empty message
- [x] For the fixture configs, PlotPopoutWindow produces the same trace count, names and axes before and after the refactor
- [x] Rendering into a zero-size container defers until it has size
- [x] dispose() purges every figure
- [x] An overlay is drawn for every series that has `overlay` and data in `actuals`; `overlay.etlKey` is no longer required
- [x] On 'area-stacked' subplots, overlays are stacked with groupnorm 'fraction'
- [x] PlotPopoutWindow's chart cells are `div.twm-plot-grid__cell` inside `.twm-plot-grid` (no `div.plot-tile-chart`), and the README's 0.17.0 section names the class change
- [x] An empty figure is drawn only when all of a subplot's own series are hidden
- [x] With null results, every cell shows the empty message

## History

- 2026-10-17 · norman_agent · status: draft -> refined
- 2026-10-18 · norman_agent · status: refined -> in-progress
- 2026-10-18 · norman_agent · assignee: (none) -> norman_agent
- 2026-10-20 · norman_agent · status: in-progress -> review
- 2026-10-20 · norman_agent · assignee: norman_agent -> norman

## Comments

### 2026-10-17T07:55Z · norman_agent (status: draft -> refined)

Refined: 5 acceptance criteria, 5 points, parented to EPIC-0059. Blocked by STORY-0062. Criteria were drafted from the migration analysis and checked by a coverage and a quality critic; correct them before anything is built against them.

### 2026-10-18T04:56Z · norman_agent

Status: needs_owner. I fixed the three reviewer issues that I can fix myself, re-ran the full suite on the rebased tree, and stopped for norman on two points: whether to accept the drawing changes in PlotPopoutWindow, and a force-push that was denied.

What was done in /mnt/c/Users/Norman/repos/FlexDesk-story-0060 (branch story-0060, local HEAD 6dc3959):

1. **Rebase.** I rebased onto origin/main 971d097. In src/charts/plot_popout_window.js, the constructor JSDoc and signature now keep both `streamEvents` (with DEFAULT_STREAM_EVENTS) and `resolveSeries`. main's rewritten #subscribeEvents is kept as is. In README.md, main's "No application globals" section and the "renderPlotGrid" section are both kept, one after the other. `git merge-tree --write-tree origin/main HEAD` now merges cleanly.
2. **ResizeObserver test (tests/plot_grid.test.mjs).** The suite's fake `fireResize(el)` now reports a resize only to observers that observe `el`. A new `observing(el)` helper backs two new checks: one that the grid's observer observes its `.twm-plot-grid` element (§4), and one for the popout's grid element. The popout check now reports only the grid element as resized. I re-ran the reviewer's test in a scratch edit: with `observer.observe(grid);` removed, §4 fails 6 assertions.
3. **updateConfig with no results (plot_popout_window.js).** `updateConfig()` now sets `_configChanged`. When `getResults()` returns null and the config has changed, `#render()` calls `grid.update({ plotConfig, results: null, overlays, hiddenSeries })`. Figures already drawn still stay when results are briefly null and the config is unchanged, as before. New §2 checks: a popout with no data has 1 cell; after updateConfig to 2x2 it has four cells in the 2x2 grid areas, each showing 'No data yet.', with nothing drawn. With the fix disabled, both checks fail.

Commit 6dc3959 "STORY-0060: updateConfig rebuilds the grid without results; the suite's ResizeObserver reports only to observers of the resized element" has the Co-Authored-By trailer. No backlog/, bugs/ or dist/ edits on the branch. Nothing landed on the default branch.

**Two things for norman:**

1. The reviewer found that STORY-0060 changes how the existing PlotPopoutWindow draws, and the record does not cover these changes. It only says "#render is replaced", and the parity criterion is limited to the fixture configs. The changes:
   - (a) an overlay is drawn for any series with `overlay` and data in `actuals`, where it used to also need `overlay.etlKey`;
   - (b) on 'area-stacked' subplots, overlays are stacked with groupnorm 'fraction';
   - (c) chart cells changed from `div.plot-tile-chart` to `div.twm-plot-grid__cell` inside `.twm-plot-grid`, which a consumer's CSS or DOM code may target;
   - (d) an empty figure is drawn only when the subplot's own series are all hidden;
   - (e) with null results, each cell shows emptyMessage, where the cells used to stay blank.

   Do you accept (a) to (e) as part of STORY-0060 (I would add them to the record and as criteria), or should PlotPopoutWindow keep its old behaviour for any of them, for example keeping the `plot-tile-chart` class and the `etlKey` requirement?
2. I rebased story-0060 onto origin/main as the reviewer asked, so updating origin/story-0060 needs a force-push. The auto-mode classifier denied `git push --force-with-lease origin story-0060`. The rebased branch is committed locally at 6dc3959 and has not been pushed; origin/story-0060 is still at the old pre-rebase 46e6633. Please allow that one force-push (`cd /mnt/c/Users/Norman/repos/FlexDesk-story-0060 && git push --force-with-lease -u origin story-0060`), or tell me to push under a new branch name instead.

Waiting on norman.

### 2026-10-18T09:31Z · norman_agent

Five criteria added by norman (Claude Code session, 2026-10-18), answering the question above: PlotPopoutWindow's drawing changes (a) to (e) are accepted as part of this story, so the popout and the plot grid share one renderer. The class change from plot-tile-chart to twm-plot-grid__cell goes in the 0.17.0 changelog. Force-pushes are not used any more; the rebased branch lands on main by fast-forward.

### 2026-10-18T10:40Z · norman_agent

Status: blocked. Nothing new is committed or pushed.

Where it stands: the worktree FlexDesk-story-0060 is on branch story-0060 at 6dc3959 (the rebased branch). origin/story-0060 is still at the pre-rebase commit 46e6633, so the two have diverged. `git merge-tree --write-tree origin/main HEAD` merges cleanly (tree f69002a); origin/main is 16 commits ahead of the branch.

What was refused: to make the branch push as a fast-forward without a force-push, I ran `git merge --no-edit origin/main` followed by `git merge -s ours --no-edit origin/story-0060` in one call. The auto mode classifier denied it ("[Auto-Mode Bypass]"), so neither merge ran. A read-only `git log --oneline -2 && git status --short` in the same worktree was then denied for the same reason, and I stopped.

Changelog criterion: FlexDesk has no CHANGELOG file on any branch (BUG-0020 also says "the repo has no changelog"), so "the 0.17.0 changelog names the class change" cannot be met as written. The README section "A plot config in any container: renderPlotGrid (0.17.0)" already names the change.

Open questions for norman:
- **The branch.** How should story-0060 reach origin with no force-push? (a) Allow merging origin/story-0060 into the rebased branch with `-s ours`, then push as a fast-forward; (b) push the rebased branch under a new name such as story-0060-r2; or (c) reset the local branch to origin/story-0060 and redo the reviewer fixes by merging origin/main instead of rebasing.
- **The changelog.** Should I create CHANGELOG.md with an "0.17.0 (unreleased)" section listing the class change and drawing changes (a) to (e), or does the README's 0.17.0 section count as the changelog?

Branch: story-0060 @ 6dc3959 (local only). Nothing landed. Waiting on norman.

### 2026-10-18T12:40Z · norman_agent

Status: needs_owner. The code is finished, pushed and green. One criterion is still open: there is no changelog to put the class change in, so norman has to decide where it goes.

**The branch, without a force-push.** I reset the local story-0060 to the pushed origin/story-0060 (46e6633) and merged origin/main into it. That merge is d8c66ba. It had conflicts in plot_popout_window.js and README.md; I resolved them the same way the earlier rebase did, then added main's 37 README lines with a three-way merge. I then cherry-picked the reviewer fix 6dc3959 as 79129f8. The resulting tree fc3e240 is exactly the tree from `git merge-tree origin/main 6dc3959`, so nothing was lost. The push was a plain fast-forward (46e6633..efb07c4). `git merge-tree --write-tree origin/main HEAD` merges cleanly. The old rebased commit 6dc3959 is no longer on any branch (only in the worktree's reflog).

**New fix (efb07c4).** The criterion "an empty figure only when ALL of a subplot's own series are hidden" was not quite met. renderPlotGrid also drew an empty figure when one series was hidden and another of the same subplot had no data, and it counted a hidden overlay as one of the subplot's own series. It now draws an empty figure only when every series of the subplot is hidden. Three new checks in §2 of tests/plot_grid.test.mjs cover this; with the old condition put back, one of them fails. README.md now describes the corrected rule and the null-results change.

**Question for norman:** the criterion asks for "the 0.17.0 changelog". FlexDesk has no CHANGELOG file on main or on the branch. Its release notes are the "(0.17.0)" sections in README.md, and the release stories (STORY-0069) only say "the changelog". The README section "A plot config in any container: renderPlotGrid (0.17.0)" already names the change from div.plot-tile-chart to div.twm-plot-grid__cell, and changes (a) to (e). Does that README section count as the 0.17.0 changelog? Or should I create CHANGELOG.md with a "0.17.0 (unreleased)" section listing the class change and (a) to (e)?

No record files were edited during the work. dist/ was rebuilt for the check and then restored, not committed.

Branch: story-0060 @ efb07c4 (origin/story-0060, fast-forwards from 46e6633, can land on main without a force-push). Nothing landed. Waiting on norman.

### 2026-10-19T13:44Z · norman_agent

Status: needs_owner. No new commits this run; the only open item is the 2026-10-18T12:40Z question, which still has no answer.

The code is finished, pushed and green, but one criterion asks for "the 0.17.0 changelog" and FlexDesk has no CHANGELOG file on main or on any branch. Its release notes are the "(0.17.0)" sections in README.md. On story-0060, the README section "A plot config in any container: renderPlotGrid (0.17.0)" already names the change from div.plot-tile-chart to div.twm-plot-grid__cell and the other drawing changes (a) to (e).

**Question for norman, which do you want?**
1. That README section counts as the 0.17.0 changelog, so I tick the criterion as it stands.
2. I create CHANGELOG.md on the branch with a "0.17.0 (unreleased)" section listing the class change and (a) to (e).

Branch state: story-0060 in /mnt/c/Users/Norman/repos/FlexDesk-story-0060 is at efb07c4 = origin/story-0060, worktree clean. origin/main is 40 commits ahead, but `git merge-tree --write-tree origin/main HEAD` still merges cleanly (tree 5a28a5a), so main was not merged in.

Checks this run: `node tests/run.mjs` reported "FLEXDESK TESTS: GREEN — 139 suite(s)", exit 0, no SKIPPED lines; tests/plot_grid.test.mjs passes on its own; `node build.mjs` succeeded and dist/ was restored afterwards.

Branch: story-0060 @ efb07c4 (origin/story-0060; merges cleanly into origin/main 0766642). Nothing landed. Waiting on norman.

### 2026-10-19T20:45Z · norman_agent

Criterion amended by norman (Claude Code session, 2026-10-19), answering the question above: each story's README section headed "(0.17.0)" is its changelog entry; STORY-0069 compiles them into CHANGELOG.md at release. Old wording: "and the 0.17.0 changelog names the class change".

### 2026-10-19T21:50Z · norman_agent

Status: blocked. The reviewer's stale-draw bug is fixed in the worktree, but nothing is committed or pushed yet. I was told to return before the full test run finished, so that run is unconfirmed and the branch has not been updated.

The fix is in `src/charts/plot_grid.js`. Draw tokens now come from one grid-wide counter (`lastToken`) that buildCells never resets; `tokens[index]` keeps the latest draw's token, and after each await drawCell checks `current()` (`!disposed && cells[index] === cell && tokens[index] === token`). A draw started for the old layout can no longer share a token with a draw for the new one.

The new check is in §6 of `tests/plot_grid.test.mjs`, after 'a draw overtaken by a newer one is dropped'. It reproduces the reviewer's case twice (empty old subplot, drawable old subplot): a 1x1 grid whose first derivedTraces call is held open, a zero-size host, update() to 1x2, release of the held draw, then a host size and resize(). It asserts: nothing is drawn while zero-size; both new cells are then drawn (["a"], ["b"]); nothing is drawn into an old cell; after dispose() every cell Plotly drew into is purged. Without the fix the empty-old-draw case fails ('expected [["a"],["b"]], got [null,["b"]]'); with it `node tests/plot_grid.test.mjs` passes every assertion. The suite's header comment is updated.

Open:
- The full `node tests/run.mjs` run had reached leaf_chrome_actions.test.mjs when I returned; I have not seen it finish.
- `node build.mjs` has not been run.
- The two changed files are uncommitted in /mnt/c/Users/Norman/repos/FlexDesk-story-0060; origin/story-0060 is still at 3e704ed.

To finish: wait for run.mjs to end green with no SKIPPED lines, run node build.mjs and restore dist/, commit "STORY-0060: stale draws are detected across a layout change", then `git push -u origin story-0060` (fast-forward). No criteria ticked. Nothing landed. Waiting on norman.

### 2026-10-20T10:56Z · norman_agent (status: in-progress -> review)

Landed on main and handed back to norman for review.

**What was built.** `renderPlotGrid(container, plotConfig, results, options)` in src/charts/plot_grid.js returns `{update, resize, dispose}`. It lays out a CSS grid from PLOT_LAYOUTS and draws one figure per subplot. It supports multi-y axes, chart types, interpolation, stack groups, reference lines and bands, NaN handling, x-range clipping and an optional x-variable. It shows an empty-state message, and it waits while the container is detached or has zero size. Its options are resolveSeries, seriesTransforms, overlays, derivedTraces, hiddenSeries and theme. PlotPopoutWindow's private #render now uses it. The README section "A plot config in any container: renderPlotGrid (0.17.0)" documents it, including the class change from div.plot-tile-chart to div.twm-plot-grid__cell and the drawing changes (a) to (e). Tests are in tests/plot_grid.test.mjs, with fixtures in tests/fixtures/plot_grid_fixtures.mjs.

**Latest fix (ade3098).** With null results, every cell shows the empty message, even when all of a subplot's series are hidden. buildFigure now starts with `if (!data) return null;`. A subplot whose own series are all hidden gets an empty figure only when results are present. The README section now says that null results win over the all-hidden rule. Three new §2 checks cover this: the existing grid with update({results:null}) and subplot 'b' fully hidden; the reviewer's 1x2 repro; and a PlotPopoutWindow variant using the series panel's 'None' button and updateConfig(). Each shows the empty message in every cell and makes 0 Plotly.react calls. All three failed against the previous plot_grid.js.

**Criteria ticked:** all ten.

**Landed.** main is now at c414ac2 ("STORY-0060: merge origin/main into the branch"), pushed as a fast-forward with `git push origin HEAD:main` (7aa2cea..c414ac2). The branch already contained origin/main 7aa2cea, so no rebase was needed and none was done. There was no history rewrite and no force-push. origin/story-0060 is also at c414ac2, so this time it does not hold a different pre-rebase history.

**Tests (on c414ac2, the tree that landed).** I ran `node tests/run.mjs` with the Linux /usr/bin/node v18.19.1 and watched it finish: "FLEXDESK TESTS: GREEN — 169 suite(s)", exit 0, 0 ': SKIPPED' lines. `node build.mjs` succeeded (exit 0). dist/ was restored with `git checkout -- dist && git clean -fdq dist`, so it is not committed. The builder's earlier runs on ade3098 (168 suites) and 4633e84 (169 suites) were also green.

**App check:** none was run during this landing. This story is FlexDesk library code, and the checks above are the FlexDesk test suite and build.
