---
id: 87
type: story
title: "DataTable has six built-in cell editors that consumers can replace per type"
status: done
parent: 1
phase:
assignee: norman
reporter: norman
due:
points: 5
subsystem: grid
labels: [grid, editing, tables-consumer]
links: [blocked-by 3]
created: 2026-10-18
updated: 2026-10-21T17:55Z
---

## Description

Built-in editors for text, multitext, number, bool, choice and datetime, each with a `parse(text)` that paste (STORY-0090) reuses. Consumers inject their own editors over them through STORY-0003's `editors` option.

Owner decisions (norman, 2026-10-18): FlexDesk provides every UI operation and mode generically and apps (Tables, BugDesk, EcoSim) configure it; editing lives in DataTable as opt-in options, with the logic in new modules (cell_selection.js, cell_editor_host.js, staged_history.js, series.js), so there is one table component; the whole split ships in 0.17.0 (STORY-0069). A table that sets none of the new options behaves exactly as in 0.16. Tables' switch-over from its own grid is Tables' work (Tables STORY-0217), not a criterion here.

## Acceptance criteria

- [x] Each of the six opens on its column type and commits a value of that type: number -> Number, bool -> true/false, datetime -> Date
- [x] Number parses `1.234,56` and `1,234.56` according to a `locale` option; datetime parses `31/12/2026` and ISO
- [x] An input that won't parse (`abc` in a number) is refused with a message on the cell, and nothing is committed
- [x] Choice offers the column's `options` through AutocompleteField; a value not in the options is refused unless `allowOther` is set
- [x] An injected editor for a type replaces the built-in one for that type only
- [x] The generic behaviour Tables' grid editor tests (the generic editors and their parsing) checks has a FlexDesk suite under tests/ that passes (ported, not imported from Tables)

## History

- 2026-10-18 · norman_agent · status: draft -> refined
- 2026-10-20 · norman_agent · status: refined -> in-progress
- 2026-10-20 · norman_agent · assignee:  -> norman_agent
- 2026-10-21 · norman_agent · status: in-progress -> done
- 2026-10-21 · norman_agent · assignee: norman_agent -> norman

## Comments

### 2026-10-18T10:34Z · norman_agent (status: draft -> refined)

Split out of STORY-0003 with norman (Claude Code session, 2026-10-18): 6 criteria, 5 points, parented to EPIC-0001, in 0.17.0 by his decision. Correct the criteria before anything is built against them.

### 2026-10-21T17:55Z · norman_agent (status: in-progress -> done)

Done by norman's 2026-10-21 process decision (landed + independently reviewed). Landed on main, tip 217901d.

Built: six built-in cell editors in src/ui/components/cell_editors.js (text, multitext, number, bool, choice, datetime), each with a `parse`; opt-in DataTable options `editTypes`, `locale`, `editorMessages`; parse/refusal handling in cell_editor_host.js, cell_grid.js and staged_edits.js; exports added to widgets.js; README section "Built-in cell editors (0.17.1)". origin/main was merged in cleanly, and a check ported from Tables' editor tests was added (a timestamp '2026-08-24 10:00:00+00:00' reads as that exact time).

Ticked: all six criteria (types committed, locale/datetime parsing, refusal with message, choice via AutocompleteField with `allowOther`, per-type injected editors, ported FlexDesk suite).

Behaviour note: a 0.17.0 table that sets `editable` without `editors` now opens the built-in editor for each column's detected type (a numeric column commits a Number, not the typed text), as the first criterion requires. A table with no editing options still behaves as in 0.16.

Tests: cell_editors_parse, cell_editors, cell_editors_ported and cell_editor suites exit 0; full `node tests/run.mjs` "FLEXDESK TESTS: GREEN — 189 suite(s)", exit 0, no SKIPPED lines; `node build.mjs` exit 0.
