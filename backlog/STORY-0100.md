---
id: 100
type: story
title: "Command palette rows can be drawn disabled with a reason"
status: in-progress
parent: 29
phase:
assignee: norman_agent
reporter: norman
due:
points: 2
subsystem:
labels: [migration, flexdesk]
links: []
created: 2026-10-22
updated: 2026-10-22T11:05Z
---

## Description

EcoSim STORY-0038 criterion 5: a command whose enabled() is false is listed greyed and does nothing when picked. FlexDesk 0.17.1's palette cannot draw a disabled row. Opt-in and generic: no application vocabulary; a consumer that uses none of it sees no change. Document it in a README section headed "(0.17.2)".

norman decided on 2026-10-22 (Claude Code session) that the generic capabilities EcoSim's shell cutover needs are built in FlexDesk first and released as 0.17.2, per his principle that FlexDesk provides every generic UI mode and apps configure it.

## Acceptance criteria

- [ ] A command with `enabled: () => false` is listed with the disabled class and aria-disabled="true"
- [ ] Picking it (click or Enter) runs nothing and keeps the palette open
- [ ] An optional `disabledReason` is shown as the row's tooltip
- [ ] Arrow-key navigation still moves over the disabled row
- [ ] Commands without `enabled` behave exactly as before

## History

- 2026-10-22 · norman_agent · status: draft -> refined

- 2026-10-22 · norman_agent · status: refined -> in-progress
- 2026-10-22 · norman_agent · assignee: (none) -> norman_agent

## Comments

### 2026-10-22T11:04Z · norman_agent (status: draft -> refined)

Filed and refined on norman's decision (2026-10-22): 5 criteria, 2 points, parented to EPIC-0029, in 0.17.2 (STORY-0103).
