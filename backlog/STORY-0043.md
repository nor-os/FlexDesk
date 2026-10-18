---
id: 43
type: story
title: "A themed toggle switch component and an openForm 'toggle' field"
status: review
parent: 40
phase:
assignee: norman
reporter: norman
due:
points: 3
subsystem: widgets
labels: [widgets, new-component]
links: []
created: 2026-10-17
updated: 2026-10-17T22:19Z
---

## Description

There is no .twm-toggle anywhere; consumers build their own switches. A ToggleField renders track and knob over a real input with role='switch', aria-checked, Space/Enter, focus ring, optional label and on/off text, disabled, compact variant, onChange, get/set/setDisabled/dispose; openForm 'toggle' uses it and reads a boolean.

Related EcoSim records: EcoSim STORY-0032 (`../EcoSim/backlog/STORY-0032.md`).

Filed from the EcoSim -> FlexDesk 0.16 migration analysis (2026-10-17).

## Acceptance criteria

- [x] Space and Enter toggle the focused switch and aria-checked follows
- [x] A disabled switch ignores clicks and keys
- [x] openForm with a toggle field resolves true or false
- [x] Its CSS contains no hex literal

## History

- 2026-10-17 · norman_agent · status: draft -> refined
- 2026-10-17 · norman_agent · status: refined -> in-progress
- 2026-10-17 · norman_agent · assignee: (none) -> norman_agent
- 2026-10-17 · norman_agent · status: in-progress -> review
- 2026-10-17 · norman_agent · assignee: norman_agent -> norman

## Comments

### 2026-10-17T07:55Z · norman_agent (status: draft -> refined)

Refined: 4 acceptance criteria, 3 points, parented to EPIC-0040. Criteria were drafted from the migration analysis and checked by a coverage and a quality critic; correct them before anything is built against them.

### 2026-10-17T22:19Z · norman_agent (status: in-progress -> review)

Built and landed on main. Branch `story-0043`, landed tip on main 173f20f (two commits, rebased onto origin/main 96a0ca2: 3ae0071 ToggleField and the openForm 'toggle' field, 173f20f the TOGGLE CSS section placed before the FLOW sections that close the sheet).

What was built:
- `src/ui/components/toggle_field.js`: ToggleField, a track and knob over a real checkbox input with role="switch" and aria-checked that follows its state. Space and Enter toggle it; focus ring; label, ariaLabel, on/off text, disabled, compact variant, onChange; get, set (does not fire onChange), setDisabled, dispose.
- `src/ui/components/modal.js`: openForm accepts `type: 'toggle'` (onText, offText, disabled, compact pass through), submits a boolean, onFieldChange api.get/api.set read and write it as a boolean, toggles disposed on submit and close.
- CSS: a TOGGLE section in css/flexdesk.css, mirrored byte for byte into css/base.css, tokens only (every token defined in tokens.css), placed after HELP MODAL.
- widgets.js exports toggle_field.js (header now 41 modules); README openForm section gains the switch subsection, marked 0.17.0; new suite tests/toggle_field.test.mjs.
- No existing public API changed: one new export and one new field type.

Ticked: all four criteria (Space/Enter toggle and aria-checked follows; a disabled switch ignores clicks and keys; openForm with a toggle field resolves true or false; its CSS contains no hex literal).

Tests: after the rebase, `node tests/run.mjs` with the Linux node (/usr/bin/node) ran to completion in one go: FLEXDESK TESTS: GREEN, 119 suites, rc=0, no `: SKIPPED` line. `node build.mjs` exits 0; dist/ was restored afterwards and nothing in it was committed.

App check: none run in a live app; the evidence is the jsdom suites above plus the build.
