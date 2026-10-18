---
id: 62
type: story
title: "Derived-series transforms are injected, and the plot window ships no built-in transform"
status: review
parent: 59
phase:
assignee: norman
reporter: norman
due:
points: 3
subsystem: charts
labels: [charts, injection]
links: []
created: 2026-10-17
updated: 2026-10-18T01:22Z
---

## Description

Any embedder can add derived series (a trend, a moving average, a decomposition) to a plot. A seriesTransforms option ({id: {label, run(y, params) -> Promise<{[output]: number[]}>, outputs: {[output]: {suffix, lineStyle}}}}) is run once per eligible trace and each output drawn as an extra trace in the source colour. The config panel lists toggles and parameters from the supplied transforms. The current hard-coded HP filter (its backend call, showHpTrend/showHpCycle/hpLambda keys and labels) is removed; without the option no derived traces are drawn.

Related EcoSim records: EcoSim STORY-0078 (`../EcoSim/backlog/STORY-0078.md`).

Filed from the EcoSim -> FlexDesk 0.16 migration analysis (2026-10-17).

## Acceptance criteria

- [x] The charts source contains no reference to window.pywebview and no 'hp' config key
- [x] A supplied transform's outputs draw as extra traces with the source colour and the declared dash and suffix
- [x] A transform that throws is skipped and the chart still renders
- [x] Without the option the config panel shows no derived-series toggles

## History

- 2026-10-17 · norman_agent · status: draft -> refined
- 2026-10-17 · norman_agent · status: refined -> in-progress
- 2026-10-17 · norman_agent · assignee: (none) -> norman_agent
- 2026-10-18 · norman_agent · status: in-progress -> review
- 2026-10-18 · norman_agent · assignee: norman_agent -> norman

## Comments

### 2026-10-17T07:55Z · norman_agent (status: draft -> refined)

Refined: 4 acceptance criteria, 3 points, parented to EPIC-0059. Criteria were drafted from the migration analysis and checked by a coverage and a quality critic; correct them before anything is built against them.

### 2026-10-18T01:22Z · norman_agent (status: in-progress -> review)

Built and landed on main. Embedders now pass their own derived-series transforms, and FlexDesk ships none.

- New module `src/charts/series_transforms.js`, exported from `charts.js`. `deriveSeriesTraces(traces, subplot, seriesTransforms, {onError})` builds the extra traces for one subplot. `renderSeriesTransformControls(container, subplot, seriesTransforms, {onChange})` draws a checkbox per output and a number field per parameter, edits `subplot.transforms` in place, and draws nothing when no transforms are passed.
- `PlotPopoutWindow` takes a new `seriesTransforms` option. The `window.pywebview.api.hp_filter` block is replaced by a call to `deriveSeriesTraces`. A transform that fails is reported to `services.logger.warn` and skipped.
- `makeDefaultSubplot` no longer has `showHpTrend`, `showHpCycle` or `hpLambda`. Saved configs that still contain them are ignored, with no migration.
- `css/flexdesk.css` has a SERIES TRANSFORMS section before the FLOW sections, which must end the sheet. The README has a new section, "Derived series: `seriesTransforms` (0.17.0)", and an updated row in the entry-point table.

Ticked all 4 criteria: no window.pywebview and no hp key in the charts source (checked by grep: the only match is a code comment in plotly_wrapper.js that mentions the pywebview browser); outputs draw in the source colour with the declared dash and suffix; a transform that throws is skipped and the chart still renders; no toggles without the option. The last three are covered by the new suite `tests/series_transforms.test.mjs`.

Decisions for you to check, because the record does not specify them:
1. Parameter declarations: each transform takes an optional `params: {name: {label, default, min?, max?, step?}}`, because the described shape had no way to declare the parameters the panel shows.
2. On/off state lives on the subplot: `subplot.transforms = {[id]: {outputs: {[name]: true}, params: {...}}}`.
3. There is no config panel yet. The full plot-config editor is STORY-0061, so this story ships the transform-controls piece on its own for STORY-0061 to embed.
4. A transform runs on every 2-D line or scatter trace in the subplot, including the actuals overlay traces, as before.

Follow-ups: STORY-0061's renderPlotConfigEditor should mount renderSeriesTransformControls for the active subplot, and STORY-0060's renderPlotGrid should call deriveSeriesTraces, so the logic lives in one place. EcoSim STORY-0078 (`../EcoSim/backlog/STORY-0078.md`) can supply its HP filter as a seriesTransforms entry, as in the README example.

Branch `story-0062`, rebased onto main (conflicts in README.md and css/flexdesk.css; both sides kept: the storage-keys section and the toggle, document-outline and tag-input CSS from main, the series-transforms section and CSS from this branch, and the entry-point table row lists both "a document outline" and "injected series transforms"). Landed tip on main: b5f0ff9.

Tests: `node tests/run.mjs` (Linux node) after the rebase: FLEXDESK TESTS: GREEN, 130 suites, 0 lines with ': SKIPPED'. `node build.mjs` exit 0; dist/ restored, not committed.

App check: not run. No host app was launched in this handback; verification is the test suites above.
