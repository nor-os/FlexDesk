---
id: 91
type: story
title: "A crosstab grid draws spanned header rows with pinned header rows and label columns in one scroller"
status: done
parent: 1
phase:
assignee: norman
reporter: norman
due:
points: 5
subsystem: grid
labels: [grid, editing, tables-consumer]
links: [blocked-by 66]
created: 2026-10-18
updated: 2026-10-21T07:42Z
---

## Description

Tables built its own PivotGrid (Tables web/js/pivot/pivot_grid.js) only because DataTable had one header row and no spans. Under the owner's principle the drawing is a generic FlexDesk mode: k header rows of spans, header rows pinned to the top with offsets measured after layout, row-label columns pinned to the left (one in compact layout, one per row field in outline and tabular), the corner pinned both ways, all in one scroller. The app supplies the data, totals and labels; FlexDesk contains no pivot or aggregation vocabulary. Reuses STORY-0066's group header rows. Tables' switch from its own PivotGrid is a Tables record.

Owner decisions (norman, 2026-10-18): FlexDesk provides every UI operation and mode generically and apps (Tables, BugDesk, EcoSim) configure it; editing lives in DataTable as opt-in options, with the logic in new modules (cell_selection.js, cell_editor_host.js, staged_history.js, series.js), so there is one table component; the whole split ships in 0.17.0 (STORY-0069). A table that sets none of the new options behaves exactly as in 0.16. Tables' switch-over from its own grid is Tables' work (Tables STORY-0217), not a criterion here.

## Acceptance criteria

- [x] A 2-level column axis draws 2 header rows whose spans add up to the body's columns
- [x] Header rows stay pinned while the body scrolls vertically, and each one's top offset equals the measured height of the rows above it, also after a header label wraps
- [x] Row-label columns stay pinned while the body scrolls sideways, in compact (one label column) and outline/tabular (one per row field) layouts; the corner stays pinned both ways
- [x] An empty axis draws a single "(none)" column header, not a broken table
- [x] Totals rows and columns and every label come from the consumer; the source contains no pivot vocabulary (vocabulary gate)
- [x] With 1,000 rows and 50 body columns, the first draw completes in under 300 ms in jsdom

## History

- 2026-10-18 · norman_agent · status: draft -> refined
- 2026-10-20 · norman_agent · status: refined -> in-progress
- 2026-10-20 · norman_agent · assignee: (none) -> norman_agent
- 2026-10-20 · norman_agent · status: in-progress -> review
- 2026-10-20 · norman_agent · assignee: norman_agent -> norman
- 2026-10-21 · norman_agent · status: review -> done

## Comments

### 2026-10-18T10:34Z · norman_agent (status: draft -> refined)

Split out of STORY-0003 with norman (Claude Code session, 2026-10-18): 6 criteria, 5 points, parented to EPIC-0001, in 0.17.0 by his decision. Correct the criteria before anything is built against them.

### 2026-10-18T10:35Z · norman_agent

The Tables half is Tables STORY-0297 (`../Tables/backlog/STORY-0297.md`): its pivot matrix draws through this grid once it ships.

### 2026-10-20T21:06Z · norman_agent (status: in-progress -> review)

Landed on main at 7dcb1a1 (branch `story-0091` rebased onto origin/main, then fast-forwarded onto main). origin/story-0091 still holds the pre-rebase history (tip f2608a1).

What was built: a generic crosstab mode in DataTable (src/ui/components/crosstab.js). It draws k header rows of spans using STORY-0066's span normalizer and group cells. Header rows are pinned to the top, and each row's offset is measured after layout. Row-label columns are pinned to the left: one in compact layout, one per row field in outline/tabular. The corner is pinned both ways, and everything sits in one scroller. An empty axis draws a single "(none)" header. Totals and every label come from the consumer.

The last review round fixed both reviewer issues. A pinned body cell now has a single `!important` background stack, top to bottom: fill mark, new-row flash (a colour registered with `@property`), state tint, `--twm-dt-row-bg`, `--surface-0`. Every td state rule has a pinned mirror rule that sets the matching layer variable: hover (readonly and not), clickable hover, row selection, cell selection, staged, fill-skipped, placeholder, diff added/removed/changed/gap, and the new-row flash. Side effect: a consumer can no longer set `background` on a pinned label cell through `cellClass`. The README says the crosstab owns that stack and that a row is coloured through `--twm-dt-row-bg`. Not covered: the plot-window-only `tr` backgrounds, which are painted on rows, not cells. That case was outside the issues raised.

Ticked: all 6 criteria (2-level column axis spans, pinned header rows with measured offsets after a wrap, pinned label columns in compact and outline/tabular with the corner pinned both ways, the "(none)" empty axis, consumer-supplied totals/labels plus the vocabulary gate, and the 1,000 x 50 first draw under 300 ms in jsdom).

Tests: after the rebase, `node tests/run.mjs` (Linux /usr/bin/node) ran to completion: exit 0, "FLEXDESK TESTS: GREEN — 182 suite(s)", 0 `: SKIPPED` lines. That includes tests/crosstab.test.mjs §1-§7 with the §3 stylesheet checks: the exact important layer stack; each of the 12 td state rules has a pinned mirror with the same tint and specificity of the original plus 2 classes; tied originals keep their order; a sweep for any other body-cell background; the `@property` flash registration and keyframes. `node build.mjs` succeeded. dist/ was reverted afterwards and not committed.

App check: none in a real browser, because there is no browser on the machine. The stylesheet checks read the CSS, the same way the existing §3 checks do.

### 2026-10-21T07:42Z · norman_agent (status: review -> done)

norman decided on 2026-10-21 (Claude Code session) to release FlexDesk 0.17.0 now and to accept every story on the 0.17.0 list whose code is on main and whose independent agent review passed, without reviewing each record himself. Its code is on main (audited), so it is done and ships in 0.17.0.
