---
id: 2
type: story
title: "Table display remainder: columns over objects, row furniture, keyboard, checkbox column, toolbar, picker, groups and trees"
status: draft
parent: 1
phase: 
assignee: 
reporter: norman
points: 
subsystem: datatable
labels: [datatable, tables-consumer]
links: []
created: 2026-10-11
updated: 2026-10-11T11:56Z
---
## Description

The FlexDesk half of Tables' STORY-0216. Plan features (numbering from Tables' plan):

- #18 columns over objects (`columns`, `items`, `getRowKey`)
- #19 tones, pills, cell titles
- #20 column width rules
- #21 row actions: sticky column, refusals, a row menu (the row's own actions, Copy at the bottom)
- #22 keyboard over rows: every list keyboard-usable
- #23 checkbox column with tri-state select-all
- #24 toolbar, non-column filter, quick search
- #25 caption
- #29 searchable picker dialog
- #30 focus kept across a redraw
- #31 group header rows
- #32 tree rows (Tables' `ui/tree_rows.js` moves upstream)

Check each against 0.6.0/0.7.0 first: 0.7.0 shipped groups, trees and server-driven rows, so #31/#32 may be
partly done. Domain-neutral (the vocabulary gate), additive and off by default.

## Acceptance criteria

- [ ] each feature is opt-in, with a test that fails without it
- [ ] released and published; the release number comes from the integrator
- [ ] Tables can delete `row_verbs.js` and its copies, the parallel-array builders, `holdRouteColumn`, `tree_rows.js` and the principal picker's list (tracked in Tables STORY-0216)

## History

- 2026-10-11 · norman_agent · status: (unset) -> draft

## Comments

### 2026-10-11T11:56Z · norman_agent

Filed while setting up FlexDesk's own BugDesk store (2026-10-11). Until today FlexDesk's work was tracked in Tables' backlog; carried over from Tables STORY-0216, which keeps the Tables adoption.
