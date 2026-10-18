---
id: 60
type: story
title: "renderPlotGrid draws a plot_config into any container; PlotPopoutWindow uses it"
status: in-progress
parent: 59
phase:
assignee: norman_agent
reporter: norman
due:
points: 5
subsystem: charts
labels: [charts]
links: [blocked-by 62]
created: 2026-10-17
updated: 2026-10-18T09:31Z
---

## Description

Export renderPlotGrid(container, plotConfig, results, options) -> {update, resize, dispose}: CSS grid from PLOT_LAYOUTS, per-subplot figures with multi-y axes, chart types, interpolation, stack groups, reference lines and bands, NaN handling, x-range clip, optional x-variable; empty-state message; guards for detached/zero-size containers. Options resolveSeries, seriesTransforms, overlays, derivedTraces, hiddenSeries, theme. PlotPopoutWindow's private #render is replaced by it.

Related EcoSim records: EcoSim STORY-0077 (`../EcoSim/backlog/STORY-0077.md`).

Filed from the EcoSim -> FlexDesk 0.16 migration analysis (2026-10-17).

## Acceptance criteria

- [ ] A 2x2 config renders four subplots in the right grid areas
- [ ] A subplot with no data shows the empty message
- [ ] For the fixture configs, PlotPopoutWindow produces the same trace count, names and axes before and after the refactor
- [ ] Rendering into a zero-size container defers until it has size
- [ ] dispose() purges every figure
- [ ] An overlay is drawn for every series that has `overlay` and data in `actuals`; `overlay.etlKey` is no longer required
- [ ] On 'area-stacked' subplots, overlays are stacked with groupnorm 'fraction'
- [ ] PlotPopoutWindow's chart cells are `div.twm-plot-grid__cell` inside `.twm-plot-grid` (no `div.plot-tile-chart`), and the 0.17.0 changelog names the class change
- [ ] An empty figure is drawn only when all of a subplot's own series are hidden
- [ ] With null results, every cell shows the empty message

## History

- 2026-10-17 · norman_agent · status: draft -> refined
- 2026-10-18 · norman_agent · status: refined -> in-progress
- 2026-10-18 · norman_agent · assignee: (none) -> norman_agent

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
