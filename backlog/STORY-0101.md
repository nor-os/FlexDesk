---
id: 101
type: story
title: "SettingsView's category list and filter can be mounted outside the settings page"
status: done
parent: 40
phase:
assignee: norman
reporter: norman
due:
points: 3
subsystem:
labels: [migration, flexdesk]
links: []
created: 2026-10-22
updated: 2026-10-22T13:32Z
---

## Description

EcoSim STORY-0039 shows the settings categories in the left navigator. FlexDesk 0.17.1's SettingsView always draws its category list, filter and 'Reset all' inside its own page. Opt-in and generic: no application vocabulary; a consumer that uses none of it sees no change. Document it in a README section headed "(0.17.2)".

norman decided on 2026-10-22 (Claude Code session) that the generic capabilities EcoSim's shell cutover needs are built in FlexDesk first and released as 0.17.2, per his principle that FlexDesk provides every generic UI mode and apps configure it.

## Acceptance criteria

- [x] SettingsView takes an option to leave its built-in category list and filter out of the page
- [x] A separate categories component, mounted anywhere, lists the same categories, filters them, and selecting one shows that category in the SettingsView it is bound to
- [x] The filter text and the selected category stay in step between the two in both directions
- [x] 'Reset all' stays available in one of the two places and asks to confirm as before
- [x] A SettingsView created without the option looks and behaves exactly as in 0.17.1

## History

- 2026-10-22 · norman_agent · status: draft -> refined

- 2026-10-22 · norman_agent · status: refined -> in-progress
- 2026-10-22 · norman_agent · assignee: (none) -> norman_agent
- 2026-10-22 · norman_agent · status: in-progress -> done
- 2026-10-22 · norman_agent · assignee: norman_agent -> norman

## Comments

### 2026-10-22T11:04Z · norman_agent (status: draft -> refined)

Filed and refined on norman's decision (2026-10-22): 5 criteria, 3 points, parented to EPIC-0040, in 0.17.2 (STORY-0103).

### 2026-10-22T13:32Z · norman_agent (status: in-progress -> done)

Done by norman's 2026-10-21 process decision: FlexDesk stories go to done once landed and independently reviewed; this one has landed on main and been independently reviewed.

Built: `new SettingsView({ ..., sidebar: false })` draws no sidebar (heading, filter, category list, 'Reset all'); the default draws exactly as in 0.17.1. New `SettingsCategories({ view })` in @flexdesk/widgets, mountable anywhere, draws filter, category list and 'Reset all' for its bound view with no state of its own (setQuery / selectCategory / resetAll, whose confirm runs as before) and redraws on the view's changes. SettingsView gains `subscribe(fn)` (returns unsubscribe) and `isFiltering()`; additions only. Both sidebars share the same drawing helpers. Token-only `.twm-settings-categories` rule in css/flexdesk.css; README section 'The settings categories outside the page: `SettingsCategories` (0.17.2)'.

Ticked all 5 criteria. Built on branch story-0101 (19d9ee3, pushed at 51d03df), landed on main by fast-forward, tip ff71e5f.

Tests: tests/settings_view.test.mjs passes §1-§14 (new §11-§14). Full suite `node tests/run.mjs`: 190 of 191 suites passed, no SKIPPED lines; the one failure was the timing check in flow_canvas_live_values.test.mjs §2 reporting a negative elapsed time (-1439 ms) while four other full suites ran concurrently, code this change does not touch; that suite passed 3 of 3 runs on its own. `node build.mjs` exit 0, dist/ restored.
