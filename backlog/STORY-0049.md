---
id: 49
type: story
title: "ActionDropdown accepts separator entries"
status: done
parent: 40
phase:
assignee: norman
reporter: norman
due:
points: 1
subsystem: widgets
labels: [widgets]
links: []
created: 2026-10-17
updated: 2026-10-21T07:42Z
---

## Description

ActionDropdown maps options one to one to buttons. {separator:true} renders a non-focusable divider with role='separator' that keyboard navigation and onSelect skip; leading, trailing and doubled separators collapse.

Related EcoSim records: EcoSim STORY-0085 (`../EcoSim/backlog/STORY-0085.md`).

Filed from the EcoSim -> FlexDesk 0.16 migration analysis (2026-10-17).

## Acceptance criteria

- [x] A separator renders between options with role='separator'
- [x] Arrow keys skip it and it never reaches onSelect
- [x] Two consecutive separators render as one

## History

- 2026-10-17 · norman_agent · status: draft -> refined
- 2026-10-17 · norman_agent · status: refined -> in-progress
- 2026-10-17 · norman_agent · assignee: (none) -> norman_agent
- 2026-10-18 · norman_agent · status: in-progress -> review
- 2026-10-18 · norman_agent · assignee: norman_agent -> norman
- 2026-10-21 · norman_agent · status: review -> done

## Comments

### 2026-10-17T07:55Z · norman_agent (status: draft -> refined)

Refined: 3 acceptance criteria, 1 points, parented to EPIC-0040. Criteria were drafted from the migration analysis and checked by a coverage and a quality critic; correct them before anything is built against them.

### 2026-10-18T00:20Z · norman_agent (status: in-progress -> review)

Built: ActionDropdown now accepts `{separator: true}` entries in `options`. `_renderOptions` (src/ui/components/action_dropdown.js) draws each as `<div role="separator" class="twm-action-dropdown-separator">`, only when an option precedes it and another follows, so leading, trailing and doubled separators collapse; `setOptions` takes the same path. The divider is not a button, has no tabindex or click handler, and arrow-key navigation only queries `.twm-action-dropdown-option`, so it is skipped and never reaches onSelect. An option's `data-index` stays its index in `options`. Divider styling uses tokens (`var(--border-subtle)`, `var(--space-xs)`) in css/flexdesk.css and its mirror css/base.css. JSDoc and a README section "Action dropdowns: separators (0.17.0)" describe it. No exports added or renamed; the only API change is additive (an entry that used to render as an 'undefined' button is now a divider).

Ticked all three criteria: separator renders between options with role='separator'; arrow keys skip it and it never reaches onSelect; two consecutive separators render as one. Each is asserted by the new suite tests/action_dropdown_separators.test.mjs (33 assertions), which fails against the old action_dropdown.js.

Branch `story-0049`, rebased onto origin/main (README conflict with the renderMarkdown / document outline sections resolved by keeping both), landed on main as 6517ea4 (fast-forward).

Tests: `node tests/run.mjs` (Linux node v18.19.1) on the rebased tip: "FLEXDESK TESTS: GREEN — 127 suite(s)", exit 0, no `: SKIPPED` lines. `node build.mjs` exits 0; dist/ was restored afterwards and not committed.

App check: not run in a live app; the behaviour was checked in jsdom by the suite above.

### 2026-10-21T07:42Z · norman_agent (status: review -> done)

norman decided on 2026-10-21 (Claude Code session) to release FlexDesk 0.17.0 now and to accept every story on the 0.17.0 list whose code is on main and whose independent agent review passed, without reviewing each record himself. Its code is on main (audited), so it is done and ships in 0.17.0.
