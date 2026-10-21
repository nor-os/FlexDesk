---
id: 52
type: story
title: "Progress bar, keyed progress list, stepped progress and determinate progress dialogs"
status: done
parent: 51
phase:
assignee: norman
reporter: norman
due:
points: 5
subsystem: widgets
labels: [widgets, progress, new-component]
links: []
created: 2026-10-17
updated: 2026-10-21T07:42Z
---

## Description

ProgressBar (value/max or fraction, indeterminate, label, percent and count readout, elapsed time, cancel, in-place update), ProgressList (keyed rows with name, completed/total, state pending/running/done/failed, stats line, active pulse, setItems reconciles), StepProgress (ordered phases with state and 'pass n of m'), and progress/steps options on showRunProgressDialog and showComputingWindow with setProgress/setStep, a final success/error state and a Promise result.

Related EcoSim records: EcoSim STORY-0059 (`../EcoSim/backlog/STORY-0059.md`); EcoSim STORY-0069 (`../EcoSim/backlog/STORY-0069.md`).

Filed from the EcoSim -> FlexDesk 0.16 migration analysis (2026-10-17).

## Acceptance criteria

- [x] update(0.42) changes the existing bar's width and text without replacing DOM nodes
- [x] setItems with the same keys at 20 updates per second keeps row elements stable
- [x] An item without total scales against the largest item
- [x] StepProgress marks phases done/active/pending/error in order
- [x] Closing a progress dialog while running resolves its promise with cancelled

## History

- 2026-10-17 · norman_agent · status: draft -> refined
- 2026-10-17 · norman_agent · status: refined -> in-progress
- 2026-10-17 · norman_agent · assignee: (none) -> norman_agent
- 2026-10-18 · norman_agent · status: in-progress -> review
- 2026-10-18 · norman_agent · assignee: norman_agent -> norman
- 2026-10-21 · norman_agent · status: review -> done

## Comments

### 2026-10-17T07:55Z · norman_agent (status: draft -> refined)

Refined: 5 acceptance criteria, 5 points, parented to EPIC-0051. Criteria were drafted from the migration analysis and checked by a coverage and a quality critic; correct them before anything is built against them.

### 2026-10-18T03:27Z · norman_agent (status: in-progress -> review)

Built: `ProgressBar`, `ProgressList` and `StepProgress` in `src/ui/components/progress.js` (exported from `@flexdesk/widgets`), and `progress` / `steps` options on `showRunProgressDialog` and `showComputingWindow` (`src/ui/components/job_progress.js`), with `setProgress`, `setStep`, a final done/error state and a `result` Promise that settles once with `{ status, message }`. Bars and lists update their elements in place. A row without `total` is drawn against the largest item. Closing a running dialog settles `result` with `cancelled`. Review fixes in the last commit: `setProgress()` throws on a dialog opened without `progress`, the same way `setStep` throws without `steps`, so a bar only exists from mount and always sits above the actions. `setState('running')` restarts the elapsed clock when `showElapsed` is on, and `dispose()` stops it for good. The README has a new "Progress: bars, lists and phases" section.

Ticked all 5 criteria: in-place `update(0.42)`; stable row elements across keyed `setItems` at 20/s; scaling without `total`; StepProgress done/active/pending/error order; closing a running dialog resolves `cancelled`. Each one is checked by `tests/progress.test.mjs`.

Branch `story-0052`, rebased onto main and landed by fast-forward. Tip on main: 9607f0e. The rebase had conflicts in README.md and widgets.js, which I resolved by keeping both sides. In README.md, the widgets package row now ends "a document outline, progress", and the main branch's markdown/outline/dropdown/tag-input sections sit before the Progress section. In widgets.js, the barrel header now says 46 modules: main's 45 plus `progress.js`.

Tests: `node tests/run.mjs` (Linux node) on the rebased tip 9607f0e gave "FLEXDESK TESTS: GREEN — 136 suite(s)", exit 0, with 0 `: SKIPPED` lines and no failures. progress.test.mjs printed "all assertions passed". `node build.mjs` exited 0; dist/ was restored afterwards and not committed. App check: not run. These widgets are not wired into an app view on this branch, so the evidence is the jsdom tests only.

### 2026-10-21T07:42Z · norman_agent (status: review -> done)

norman decided on 2026-10-21 (Claude Code session) to release FlexDesk 0.17.0 now and to accept every story on the 0.17.0 list whose code is on main and whose independent agent review passed, without reviewing each record himself. Its code is on main (audited), so it is done and ships in 0.17.0.
