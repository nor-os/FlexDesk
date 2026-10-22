---
id: 101
type: story
title: "SettingsView's category list and filter can be mounted outside the settings page"
status: refined
parent: 40
phase:
assignee:
reporter: norman
due:
points: 3
subsystem:
labels: [migration, flexdesk]
links: []
created: 2026-10-22
updated: 2026-10-22T11:04Z
---

## Description

EcoSim STORY-0039 shows the settings categories in the left navigator. FlexDesk 0.17.1's SettingsView always draws its category list, filter and 'Reset all' inside its own page. Opt-in and generic: no application vocabulary; a consumer that uses none of it sees no change. Document it in a README section headed "(0.17.2)".

norman decided on 2026-10-22 (Claude Code session) that the generic capabilities EcoSim's shell cutover needs are built in FlexDesk first and released as 0.17.2, per his principle that FlexDesk provides every generic UI mode and apps configure it.

## Acceptance criteria

- [ ] SettingsView takes an option to leave its built-in category list and filter out of the page
- [ ] A separate categories component, mounted anywhere, lists the same categories, filters them, and selecting one shows that category in the SettingsView it is bound to
- [ ] The filter text and the selected category stay in step between the two in both directions
- [ ] 'Reset all' stays available in one of the two places and asks to confirm as before
- [ ] A SettingsView created without the option looks and behaves exactly as in 0.17.1

## History

- 2026-10-22 · norman_agent · status: draft -> refined

## Comments

### 2026-10-22T11:04Z · norman_agent (status: draft -> refined)

Filed and refined on norman's decision (2026-10-22): 5 criteria, 3 points, parented to EPIC-0040, in 0.17.2 (STORY-0103).
