---
id: 87
type: story
title: "DataTable has six built-in cell editors that consumers can replace per type"
status: refined
parent: 1
phase:
assignee:
reporter: norman
due:
points: 5
subsystem: grid
labels: [grid, editing, tables-consumer]
links: [blocked-by 3]
created: 2026-10-18
updated: 2026-10-18T10:34Z
---

## Description

Built-in editors for text, multitext, number, bool, choice and datetime, each with a `parse(text)` that paste (STORY-0090) reuses. Consumers inject their own editors over them through STORY-0003's `editors` option.

Owner decisions (norman, 2026-10-18): FlexDesk provides every UI operation and mode generically and apps (Tables, BugDesk, EcoSim) configure it; editing lives in DataTable as opt-in options, with the logic in new modules (cell_selection.js, cell_editor_host.js, staged_history.js, series.js), so there is one table component; the whole split ships in 0.17.0 (STORY-0069). A table that sets none of the new options behaves exactly as in 0.16. Tables' switch-over from its own grid is Tables' work (Tables STORY-0217), not a criterion here.

## Acceptance criteria

- [ ] Each of the six opens on its column type and commits a value of that type: number -> Number, bool -> true/false, datetime -> Date
- [ ] Number parses `1.234,56` and `1,234.56` according to a `locale` option; datetime parses `31/12/2026` and ISO
- [ ] An input that won't parse (`abc` in a number) is refused with a message on the cell, and nothing is committed
- [ ] Choice offers the column's `options` through AutocompleteField; a value not in the options is refused unless `allowOther` is set
- [ ] An injected editor for a type replaces the built-in one for that type only
- [ ] The generic behaviour Tables' grid editor tests (the generic editors and their parsing) checks has a FlexDesk suite under tests/ that passes (ported, not imported from Tables)

## History

- 2026-10-18 · norman_agent · status: draft -> refined

## Comments

### 2026-10-18T10:34Z · norman_agent (status: draft -> refined)

Split out of STORY-0003 with norman (Claude Code session, 2026-10-18): 6 criteria, 5 points, parented to EPIC-0001, in 0.17.0 by his decision. Correct the criteria before anything is built against them.
