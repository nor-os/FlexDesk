---
id: 91
type: story
title: "A crosstab grid draws spanned header rows with pinned header rows and label columns in one scroller"
status: in-progress
parent: 1
phase:
assignee: norman_agent
reporter: norman
due:
points: 5
subsystem: grid
labels: [grid, editing, tables-consumer]
links: [blocked-by 66]
created: 2026-10-18
updated: 2026-10-20T15:57Z
---

## Description

Tables built its own PivotGrid (Tables web/js/pivot/pivot_grid.js) only because DataTable had one header row and no spans. Under the owner's principle the drawing is a generic FlexDesk mode: k header rows of spans, header rows pinned to the top with offsets measured after layout, row-label columns pinned to the left (one in compact layout, one per row field in outline and tabular), the corner pinned both ways, all in one scroller. The app supplies the data, totals and labels; FlexDesk contains no pivot or aggregation vocabulary. Reuses STORY-0066's group header rows. Tables' switch from its own PivotGrid is a Tables record.

Owner decisions (norman, 2026-10-18): FlexDesk provides every UI operation and mode generically and apps (Tables, BugDesk, EcoSim) configure it; editing lives in DataTable as opt-in options, with the logic in new modules (cell_selection.js, cell_editor_host.js, staged_history.js, series.js), so there is one table component; the whole split ships in 0.17.0 (STORY-0069). A table that sets none of the new options behaves exactly as in 0.16. Tables' switch-over from its own grid is Tables' work (Tables STORY-0217), not a criterion here.

## Acceptance criteria

- [ ] A 2-level column axis draws 2 header rows whose spans add up to the body's columns
- [ ] Header rows stay pinned while the body scrolls vertically, and each one's top offset equals the measured height of the rows above it, also after a header label wraps
- [ ] Row-label columns stay pinned while the body scrolls sideways, in compact (one label column) and outline/tabular (one per row field) layouts; the corner stays pinned both ways
- [ ] An empty axis draws a single "(none)" column header, not a broken table
- [ ] Totals rows and columns and every label come from the consumer; the source contains no pivot vocabulary (vocabulary gate)
- [ ] With 1,000 rows and 50 body columns, the first draw completes in under 300 ms in jsdom

## History

- 2026-10-18 · norman_agent · status: draft -> refined
- 2026-10-20 · norman_agent · status: refined -> in-progress
- 2026-10-20 · norman_agent · assignee: (none) -> norman_agent

## Comments

### 2026-10-18T10:34Z · norman_agent (status: draft -> refined)

Split out of STORY-0003 with norman (Claude Code session, 2026-10-18): 6 criteria, 5 points, parented to EPIC-0001, in 0.17.0 by his decision. Correct the criteria before anything is built against them.

### 2026-10-18T10:35Z · norman_agent

The Tables half is Tables STORY-0297 (`../Tables/backlog/STORY-0297.md`): its pivot matrix draws through this grid once it ships.
