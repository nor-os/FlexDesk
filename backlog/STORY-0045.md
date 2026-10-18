---
id: 45
type: story
title: "SliderField gains a linked number input, a readout, a default with reset and an enable toggle"
status: review
parent: 40
phase:
assignee: norman
reporter: norman
due:
points: 3
subsystem: widgets
labels: [widgets]
links: []
created: 2026-10-17
updated: 2026-10-18T00:39Z
---

## Description

SliderField renders only the range. Optional additions: an editable number box kept in two-way sync (finite parsing, clamping), a formatted readout, defaultValue with a modified state and a reset button that commits, an enable toggle with disabledValue, and setValue/setEnabled/setRange without echo loops.

Related EcoSim records: EcoSim STORY-0092 (`../EcoSim/backlog/STORY-0092.md`); EcoSim STORY-0100 (`../EcoSim/backlog/STORY-0100.md`).

Filed from the EcoSim -> FlexDesk 0.16 migration analysis (2026-10-17).

## Acceptance criteria

- [x] Dragging updates the number box live and fires one onChange on release
- [x] Typing a value and pressing Enter moves the slider and fires one onChange
- [x] When value differs from defaultValue the root has a modified state; reset restores it and fires onChange
- [x] Typing 'abc' leaves the value unchanged
- [x] setValue(x, {silent:true}) fires no callback

## History

- 2026-10-17 · norman_agent · status: draft -> refined
- 2026-10-17 · norman_agent · status: refined -> in-progress
- 2026-10-17 · norman_agent · assignee: (none) -> norman_agent
- 2026-10-18 · norman_agent · status: in-progress -> review
- 2026-10-18 · norman_agent · assignee: norman_agent -> norman

## Comments

### 2026-10-17T07:55Z · norman_agent (status: draft -> refined)

Refined: 5 acceptance criteria, 3 points, parented to EPIC-0040. Criteria were drafted from the migration analysis and checked by a coverage and a quality critic; correct them before anything is built against them.

### 2026-10-18T00:39Z · norman_agent (status: in-progress -> review)

Built: SliderField (src/ui/components/slider_field.js) gains an optional editable number box kept in two-way sync with the range (finite parsing, clamping), a formatted readout, defaultValue with a modified state on the root and a reset button that commits, an enable toggle with disabledValue, and setValue/setEnabled/setRange that do not echo. Review follow-up: #syncCompanions() is now the only writer of the slider's disabled state (the dead early `field.disabled` write in render() is gone), the README section heading carries (0.17.0), and tests/slider_field.test.mjs gained a field.disabled block (plain slider; with companions range, number box and toggle all disabled; re-enabling the toggle keeps the range disabled).

Ticked all 5 criteria: live number-box update while dragging with one onChange on release; Enter in the number box moves the slider with one onChange; modified state when value differs from defaultValue, reset restores it and fires onChange; 'abc' leaves the value unchanged; setValue(x, {silent:true}) fires no callback. Each is covered by tests/slider_field.test.mjs.

Branch `story-0045`, rebased onto origin/main and landed on main fast-forward at d7bad06.

Tests: `node tests/run.mjs` (Linux node) exits 0 with 'FLEXDESK TESTS: GREEN — 128 suite(s)' and 0 SKIPPED lines after the rebase; `node build.mjs` exits 0 (dist/ restored, not committed).

App check: not performed in a running app; verification is the unit suite above, so please exercise the slider in the gallery/app during review.
