---
id: 65
type: story
title: "STORY-0006 items: duplicate step, host card-menu items, and upstream-column widgets editable before columns are known"
status: done
parent: 5
phase:
assignee: norman
reporter: norman
due:
points: 5
subsystem: flow
labels: [flow, lanes]
links: [relates-to STORY-0006]
created: 2026-10-17
updated: 2026-10-21T07:42Z
---

## Description

Two gaps an embedder porting an existing pipeline editor hits, as items of STORY-0006. (1) A pure 'flow:step:duplicate' edit in LANE_ACTIONS (fresh id, derived label, deep-copied config, same incoming connections, refused with a reason when impossible), a Duplicate card-menu item, Ctrl/Cmd+D, and a menuItems(step) option whose items run through history. (2) When ctx.columns() returns null, 'upstream-column' shows a text input and 'upstream-columns' a free-text chip list with a 'columns not known yet' hint, switching back to select/chips when columns arrive; a stored unknown name keeps the notFound treatment.

Related EcoSim records: EcoSim STORY-0066 (`../EcoSim/backlog/STORY-0066.md`); EcoSim STORY-0064 (`../EcoSim/backlog/STORY-0064.md`).

Filed from the EcoSim -> FlexDesk 0.16 migration analysis (2026-10-17).

## Acceptance criteria

- [x] Duplicate on a step creates a copy with a new id and the same config, and selects it
- [x] Ctrl+D on a focused card duplicates it, and Ctrl+Z removes the copy
- [x] Duplicate is greyed with a reason on a read-only flow
- [x] A host menu item appears after the built-in items and its edit is undoable
- [x] With no columns, typing a column name in an upstream-column field stores it
- [x] When columns become available the same field shows a select with the stored value selected
- [x] A stored name not among the columns is kept and marked not found

## History

- 2026-10-17 · norman_agent · status: draft -> refined
- 2026-10-17 · norman_agent · status: refined -> in-progress
- 2026-10-17 · norman_agent · assignee: (none) -> norman_agent
- 2026-10-18 · norman_agent · status: in-progress -> review
- 2026-10-18 · norman_agent · assignee: norman_agent -> norman
- 2026-10-21 · norman_agent · status: review -> done

## Comments

### 2026-10-17T07:55Z · norman_agent (status: draft -> refined)

Refined: 7 acceptance criteria, 5 points, parented to EPIC-0005. Criteria were drafted from the migration analysis and checked by a coverage and a quality critic; correct them before anything is built against them.

### 2026-10-18T02:18Z · norman_agent (status: in-progress -> review)

Built and landed. Branch `story-0065` was rebased onto origin/main and fast-forwarded onto main; the landed tip on main is e754159 (it was be83d41 before the rebase).

What was built:
- Duplicate: a pure `lanePipeline.duplicateStep(pipeline, catalogue, id, {strings})` in src/flow/lanes/pipeline.js. It gives the copy a new id from the catalogue's id stem and a label "Title (copy)" / "(copy N)" that no other step has. The config and unknown keys are deep-copied, but not `position`. Incoming connections are repeated into the copy and none go out of it. The copy is placed right after the original. If the step is missing or its type is `unavailable`, it returns `{ok:false, reason}`. The default wording is exported as LANE_PIPELINE_STRINGS.
- The lane editor (src/flow/lanes/editor.js) has a Duplicate card-menu item that selects and focuses the copy, and Ctrl/Cmd+D on a focused card or step tab. A refusal shows in a new `twm-flow-lanes__notice` status. A menu item that cannot run is disabled and shows its reason on its own line.
- Host menu items: a new `menuItems(step)` option adds items after the built-in ones, below a separator. Each item's `run({step, pipeline, editor})` changes a draft and may return a promise. The change is applied as one undoable `flow:step:menu` edit. Nothing is applied if `run` returns false, if nothing changed, if another edit happened in the meantime, or if the flow is read-only. Items are disabled with a reason on a read-only flow or when they set `disabled`. LANE_ACTIONS gains 'flow:step:duplicate' and 'flow:step:menu'.
- Columns not known yet (src/flow/kit/widgets.js): when ctx.columns() returns null, 'upstream-column' is a text box and 'upstream-columns' is a chip list you type names into, with the hint "Columns not known yet: type the name." When columns arrive, the field is redrawn as a select or toggle chips with the stored value chosen. A name not among the columns keeps the "(not found)" handling. The editor also redraws when focus leaves the settings, with a guard so the redraw cannot trigger itself.
- Visible changes: the default text of the kit string `noColumns` changed, and the unused `.twm-flow-field__kept` rule was removed. CSS was added to css/base.css and css/flexdesk.css, and the README is updated (0.17.0).

Ticked: all 7 criteria (duplicate creates a copy and selects it; Ctrl+D duplicates and Ctrl+Z removes the copy; Duplicate is greyed with a reason on a read-only flow; a host menu item appears after the built-ins and its edit is undoable; typing a column name with no columns stores it; the field shows a select with the stored value when columns arrive; a stored unknown name is kept and marked not found).

Tests: `node tests/run.mjs` (Linux node) on the rebased branch: "FLEXDESK TESTS: GREEN — 133 suite(s)", exit 0, no `: SKIPPED` lines. New suites: tests/flow_lanes_duplicate.test.mjs and tests/flow_kit_columns_unknown.test.mjs. Updated: flow_kit_widgets §8 and flow_lanes_editor §7. `node build.mjs` succeeded. dist/ was restored and is not committed.

App check: not run in a live app. The criteria are verified by the automated suites above, which drive the lane editor and the widgets in the test DOM.

### 2026-10-21T07:42Z · norman_agent (status: review -> done)

norman decided on 2026-10-21 (Claude Code session) to release FlexDesk 0.17.0 now and to accept every story on the 0.17.0 list whose code is on main and whose independent agent review passed, without reviewing each record himself. Its code is on main (audited), so it is done and ships in 0.17.0.
