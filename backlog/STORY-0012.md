---
id: 12
type: story
title: "DataTable: a column chooser - columns hidden by default, shown and hidden from the header menu, remembered"
status: review
parent: 1
phase:
assignee: norman
reporter: norman
points: 3
subsystem: datatable
labels: [datatable, bugdesk-consumer]
links: []
created: 2026-10-12
updated: 2026-10-13T04:34Z
---

## Description

BugDesk lets a project give its records custom fields, and its lists must offer
those as columns that are **not shown until somebody asks for them** (BugDesk
STORY-0016, `../bugdesk/backlog/STORY-0016.md`). Neither FlexDesk's DataTable nor
BugDesk's copy can hide a column today, so a list either shows every custom field
or none. A table with a dozen optional columns needs the user to pick which ones
they see, and to find them still picked tomorrow.

Opt-in: a table that does not ask for it draws every column, as in 0.9.1.

## Acceptance criteria

- [x] `hiddenColumns: [colIdx, ...]` hides those columns on first render; they are not drawn, not in the width fit and not copied, but stay in the row data
- [x] With `columnChooser: true`, the header's context menu lists every column with a check mark, and choosing one shows or hides it; the last visible column cannot be hidden
- [x] With a `persistKey`, the shown/hidden set is saved with the sort and filters and restored on mount; a remembered set wins over `hiddenColumns`
- [x] `setColumnVisible(colIdx, on)` and `getHiddenColumns()` do the same from code, and an `onColumnsChange(hidden)` callback reports every change
- [x] Sorting and filtering by a hidden column's value keep working through the API, and a column sorted on when it is hidden drops its sort indicator but keeps the order
- [x] A table given none of these options behaves as in 0.9.1; the feature has a test in `tests/`, the README documents it, `tests/run.mjs` is GREEN and `node build.mjs --check` is OK

## History

- 2026-10-13 · norman_agent · status: refined -> in-progress
- 2026-10-13 · norman_agent · assignee: (unset) -> norman_agent
- 2026-10-13 · norman_agent · status: in-progress -> review
- 2026-10-13 · norman_agent · assignee: norman_agent -> norman

## Comments

### 2026-10-13T04:34Z · norman_agent (status: in-progress -> review)

Released in **0.11.0** (af11fb4, on npm). All criteria are met. The work was
done on the STORY-0010 branch by the same agent, before this record was
claimed; the claim above was written afterwards.

- `hiddenColumns: [...]`: those columns are not drawn, not fitted and not
  copied, but stay in the data. The last visible column can't be hidden.
- `columnChooser: true`: a header right-click lists every column with a check
  (`menuitemcheckbox`), and choosing one toggles it.
- With `persistKey` the hidden set is saved with the sort and filters, and a
  saved set wins over `hiddenColumns`.
- `setColumnVisible / getHiddenColumns / onColumnsChange`.
- A hidden column still sorts and filters through the API. Its arrow returns
  with it.
- Suite `column_chooser.test.mjs`; README updated.
