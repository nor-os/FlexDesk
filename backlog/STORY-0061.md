---
id: 61
type: story
title: "A plot-config editor panel for the charts plot_config model"
status: review
parent: 59
phase:
assignee: norman
reporter: norman
due:
points: 8
subsystem: charts
labels: [charts, new-component]
links: [blocked-by 60]
created: 2026-10-17
updated: 2026-10-20T14:45Z
---

## Description

renderPlotConfigEditor(container, config, options) edits {layout, subplots} in place with onChange: layout picker and subplot tabs, X (time or series), Y axes list (label, scale, position, min/max/step), Z axis for 3D, series rows (picker via AutocompleteField fed by seriesProvider, label, colour, width, dash, stack group, optional overlay source), chart type, legend, interpolation, NaN handling, reference lines and shaded bands, the toggles of any injected series transforms, plus an extraSeriesFields hook. Fits PlotPopoutWindow's configRenderer slot.

Related EcoSim records: EcoSim STORY-0077 (`../EcoSim/backlog/STORY-0077.md`).

Filed from the EcoSim -> FlexDesk 0.16 migration analysis (2026-10-17).

## Acceptance criteria

- [x] Choosing layout 1x2 creates a second subplot tab with a default subplot
- [x] Adding a series calls onChange and the series appears in the config
- [x] Selecting a 3D chart type shows the Z axis and disables extra Y axes
- [x] The series picker shows suggestions from seriesProvider
- [x] A seriesProvider that rejects shows no suggestions and keeps the typed text
- [x] dispose() disposes every AutocompleteField it created

## History

- 2026-10-17 · norman_agent · status: draft -> refined
- 2026-10-20 · norman_agent · status: refined -> in-progress
- 2026-10-20 · norman_agent · assignee: (none) -> norman_agent
- 2026-10-20 · norman_agent · status: in-progress -> review
- 2026-10-20 · norman_agent · assignee: norman_agent -> norman

## Comments

### 2026-10-17T07:55Z · norman_agent (status: draft -> refined)

Refined: 6 acceptance criteria, 8 points, parented to EPIC-0059. Blocked by STORY-0060. Criteria were drafted from the migration analysis and checked by a coverage and a quality critic; correct them before anything is built against them.

### 2026-10-20T14:45Z · norman_agent (status: in-progress -> review)

Handing back to norman for review.

What was built: `renderPlotConfigEditor(container, config, options)` in `src/charts/plot_config_editor.js`. It edits `{layout, subplots}` in place and calls `onChange`. It covers the layout picker and subplot tabs, X, the Y axes list, a Z axis for 3D, series rows (the picker is an AutocompleteField fed by `seriesProvider`), chart type, legend, interpolation, NaN handling, reference lines and bands, transform toggles and the `extraSeriesFields` hook. Tests are in `tests/plot_config_editor.test.mjs`. The original code reached main at ad0a342, before it was reviewed. Whether that landing stands is your call.

The review follow-up landed on main as 89d9c3b. That is b7feaf5 rebased onto dfe5c0f, as a fast-forward with nothing rewritten. It does two things:
1. The editor's `disposeBody` no longer swallows teardown errors silently. Each one goes to `opts.logger?.warn?.('[plot config editor] a field failed to dispose', error)`, and the loop goes on disposing the rest.
2. `src/charts/plot_config.js` exports `makeDefaultYAxis(index)` and `makeDefaultSeries(index)`. `makeDefaultSubplot`, `migrateSingleChart` and the editor all build from them, and the README's 0.17.0 section documents them. One small change in output: an axis that `migrateSingleChart` builds from the legacy format now has `step: null`.

`origin/story-0061` still holds the pre-rebase history (tip b7feaf5).

Ticked all 6 criteria. Each is checked by its own section of `tests/plot_config_editor.test.mjs`:
- §1: layout 1x2 creates a second subplot tab with a default subplot.
- §2: adding a series calls onChange.
- §3: a 3D chart type shows the Z axis and disables the extra Y axes.
- §4: the series picker shows suggestions from seriesProvider.
- §5: a rejecting provider shows no suggestions and keeps the typed text.
- §6: dispose() disposes every AutocompleteField it created.

Tests: after the rebase, the full suite `node tests/run.mjs` (Linux node) ran to completion with `FLEXDESK TESTS: GREEN — 176 suite(s)`, exit 0, and no `: SKIPPED` lines. `plot_config_editor.test.mjs` reported "all assertions passed". `node build.mjs` succeeded, and dist/ was restored without being committed.

App check: none in the running app. FlexDesk is a library, and the editor is not used in EcoSim yet (EcoSim STORY-0077). It was checked only in the jsdom suite.
