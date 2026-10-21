---
id: 50
type: story
title: "A settings view that renders the registered settings schema"
status: done
parent: 40
phase:
assignee: norman
reporter: norman
due:
points: 8
subsystem: settings
labels: [settings, new-component]
links: [blocked-by 43, blocked-by 44]
created: 2026-10-17
updated: 2026-10-21T07:42Z
---

## Description

settings.js promises 'the Settings page renders whatever is in the schema' but none exists. A mountable view (component and content factory) bound to a store: category sidebar by CategoryDef.order with filter, rows grouped by SettingDef.group with label, description and modified marker, search across label/description/path, one control per type (toggle, select, number honouring min/max/step, debounced text, colour list), reset one/category/all (bulk resets confirm), live two-way binding through settings:<path>:changed including slices registered later, dispose(). All user and schema text is rendered as text.

Related EcoSim records: EcoSim STORY-0032 (`../EcoSim/backlog/STORY-0032.md`).

Filed from the EcoSim -> FlexDesk 0.16 migration analysis (2026-10-17).

## Acceptance criteria

- [x] Every registered category appears in order, and selecting one lists its settings by group
- [x] Changing a number setting writes it via setSetting and the row shows a modified marker
- [x] A setSetting call made elsewhere updates the open view
- [x] Searching matches across categories, and a query containing markup is shown literally
- [x] Reset all asks to confirm and on Cancel changes nothing
- [x] A slice registered after mount appears without remounting

## History

- 2026-10-17 · norman_agent · status: draft -> refined
- 2026-10-19 · norman_agent · status: refined -> in-progress
- 2026-10-19 · norman_agent · assignee: (none) -> norman_agent
- 2026-10-19 · norman_agent · status: in-progress -> review
- 2026-10-19 · norman_agent · assignee: norman_agent -> norman
- 2026-10-21 · norman_agent · status: review -> done

## Comments

### 2026-10-17T07:55Z · norman_agent (status: draft -> refined)

Refined: 6 acceptance criteria, 8 points, parented to EPIC-0040. Blocked by STORY-0043, STORY-0044. Criteria were drafted from the migration analysis and checked by a coverage and a quality critic; correct them before anything is built against them.

### 2026-10-19T18:21Z · norman_agent (status: in-progress -> review)

Landed on main and handing back to norman for review.

What was built: SettingsView (`src/ui/components/settings_view.js`, component and content factory) renders the registered settings schema. It has a category sidebar ordered by CategoryDef.order with a filter, rows grouped by SettingDef.group with label, description and modified marker, and search across label, description and path. There is one control per type: toggle, select, number on the step grid inside min/max, debounced text, and colour list. Reset works for one setting, a category or everything, and the bulk resets ask to confirm. Binding is live and two-way through settings:<path>:changed, including slices registered later, and dispose() is provided. The store emits settings:registered, and getSettingsStore() is exported. All user and schema text is rendered as text. Tests are in `tests/settings_view.test.mjs`.

Reviewer fix in this round: a slice registered after mount no longer changes which category is on screen. Before, a view mounted without a `category` option kept `_category` null and recomputed `getCategories()[0]` each time, so a category ordered earlier moved the sidebar marker and getCategory() without repainting the page. Now #paintContent sets `this._category = cat.id` whenever it draws a category, so the sidebar marker, getCategory(), resetCategory() with no argument and the drawn page always name the same category. selectCategory still changes it explicitly, and with no categories registered the first one to arrive is shown. A regression block in `tests/settings_view.test.mjs` §6 covers this: 3 of its assertions fail against the unfixed code and pass with the fix.

Ticked: all 6 criteria (category order and grouping; number write via setSetting with modified marker; external setSetting updates the open view; cross-category search with markup shown literally; Reset all confirm with Cancel changing nothing; a slice registered after mount appears without remounting). Each is asserted in `tests/settings_view.test.mjs`.

Landed tip on main: 765c455 (fast-forward fd3aa2d..765c455). The branch was rebased onto origin/main by cherry-picking its six first-parent commits. The old "ours" merge 56ddc6f was tree-identical to 8778f45 and was dropped. The rebased tree diff matches the pre-rebase branch diff exactly. origin/story-0050 still holds the pre-rebase history (tip cdf1bfe) and was not force-pushed.

Tests: on the rebased tip, the full suite `node tests/run.mjs` (Linux /usr/bin/node) ran to completion with exit 0 and printed "FLEXDESK TESTS: GREEN — 161 suite(s)". There were 0 ": SKIPPED" lines and 0 "FAIL " lines. `node tests/settings_view.test.mjs` passed all assertions. `node build.mjs` succeeded, and dist/ was restored and not committed.

App check: none in this round. This is a library component and is checked by the DOM test suite. No running-app check was made.

### 2026-10-21T07:42Z · norman_agent (status: review -> done)

norman decided on 2026-10-21 (Claude Code session) to release FlexDesk 0.17.0 now and to accept every story on the 0.17.0 list whose code is on main and whose independent agent review passed, without reviewing each record himself. Its code is on main (audited), so it is done and ships in 0.17.0.
