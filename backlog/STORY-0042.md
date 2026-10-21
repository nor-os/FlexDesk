---
id: 42
type: story
title: "openForm number fields enforce min and max, and several fields can share a row"
status: done
parent: 40
phase:
assignee: norman
reporter: norman
due:
points: 3
subsystem: widgets
labels: [widgets, forms]
links: [blocked-by 41]
created: 2026-10-17
updated: 2026-10-21T07:42Z
---

## Description

Extends STORY-0011's openForm. Number fields accept only step; layouts like min/max side by side need hand-built DOM. Adds min/max (attributes plus submit validation with a field error) and {row: [field, ...]} entries where each field keeps its own label, hint, error, visibility and value, stacking at narrow widths.

Related EcoSim records: EcoSim STORY-0057 (`../EcoSim/backlog/STORY-0057.md`).

Filed from the EcoSim -> FlexDesk 0.16 migration analysis (2026-10-17).

## Acceptance criteria

- [x] A value outside min/max is rejected on submit with an error under that field
- [x] Two fields in a row render side by side at 600px dialog width and stack below 360px
- [x] setVisible on one field in a row hides only that field
- [x] A form with no rows or min/max renders as before

## History

- 2026-10-17 · norman_agent · status: draft -> refined
- 2026-10-19 · norman_agent · status: refined -> in-progress
- 2026-10-19 · norman_agent · assignee: (none) -> norman_agent
- 2026-10-19 · norman_agent · status: in-progress -> review
- 2026-10-19 · norman_agent · assignee: norman_agent -> norman
- 2026-10-21 · norman_agent · status: review -> done

## Comments

### 2026-10-17T07:55Z · norman_agent (status: draft -> refined)

Refined: 4 acceptance criteria, 3 points, parented to EPIC-0040. Blocked by STORY-0041. Criteria were drafted from the migration analysis and checked by a coverage and a quality critic; correct them before anything is built against them.

### 2026-10-19T23:01Z · norman_agent (status: in-progress -> review)

Landed on main and handing back for review. Main is now at 0f523be. That is story-0042 rebased onto origin/main 1ac0dd8 and fast-forwarded. origin/story-0042 still holds the pre-rebase history (tip 76f7a7c, which includes a merge of main), so its commit ids differ from the ones on main.

What was built: `openForm` number fields take `min` / `max`. These are set as the input's attributes, and on submit a value outside them is refused with a field error under that field ("Must be between 2 and 200."), replacing the browser bubble. `{ row: [field, ...] }` entries put fields side by side. Each field keeps its own label, hint, error, `setVisible`, value and key. A form narrower than 360px stacks them (container query `twm-form`). A form with a row opens at 640px. Latest fix (the reviewer's spacing issue): a field after a leading `{ row }` was getting a second 14px leading margin (a 24px gap). A new rule in css/flexdesk.css (`.twm-modal__field-group ~ .twm-modal__row:first-of-type`, margin-top 0, specificity (0,5,0) over the (0,4,0) leading rule) makes that gap the row's own 10px. tests/open_form_rows_bounds.test.mjs §2 pins this rule and fails against the old sheet. demo/open_form_row_probe.mjs measures 10px gaps for a leading row and for a middle row.

Rebase: main had gained `color` / `colorList` fields (README and modal.js). I resolved the conflicts keeping both sides. The README lists both field kinds and keeps both sections. `_estimateHeight`'s per-field function now also sizes `color` / `colorList`. `_estimateWidth` widens for textarea, colorList, section or row, and the redundant textarea-in-row check was dropped as the branch intended.

Ticked: all four criteria. (1) Out-of-range value refused with a field error: suite plus probe ("Steps = 500 is refused with 'Must be between 2 and 200.' under Steps, the form still open"). (2) Side by side at 600px and stacked at 340px: probe. (3) setVisible(hi, false) hides only hi: suite plus probe. (4) A form with no rows or min/max renders as before: suite.

Tests, on the rebased tip: `node tests/run.mjs` (Linux node) exited 0 with "FLEXDESK TESTS: GREEN — 165 suite(s)" and 0 lines with ': SKIPPED'. `node build.mjs` succeeded. dist/ was reset afterwards and not committed.

App check: the headless-Edge probe (`"/mnt/c/Program Files/nodejs/node.exe" demo/open_form_row_probe.mjs <out-dir>`) on the rebased tip ended with "all checks passed", 10 checks. In 4-leading-row.png I checked by eye that the MIN/MAX row, A and B are evenly spaced.

### 2026-10-21T07:42Z · norman_agent (status: review -> done)

norman decided on 2026-10-21 (Claude Code session) to release FlexDesk 0.17.0 now and to accept every story on the 0.17.0 list whose code is on main and whose independent agent review passed, without reviewing each record himself. Its code is on main (audited), so it is done and ships in 0.17.0.
