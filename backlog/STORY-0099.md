---
id: 99
type: story
title: "wm.navigate to a kind that is not registered warns once and changes nothing"
status: in-progress
parent: 29
phase:
assignee: norman_agent
reporter: norman
due:
points: 1
subsystem:
labels: [migration, flexdesk]
links: []
created: 2026-10-22
updated: 2026-10-22T11:05Z
---

## Description

EcoSim STORY-0035 criterion 4 needs navigation to an unknown kind to be harmless and visible. Opt-in and generic: no application vocabulary; a consumer that uses none of it sees no change. Document it in a README section headed "(0.17.2)".

norman decided on 2026-10-22 (Claude Code session) that the generic capabilities EcoSim's shell cutover needs are built in FlexDesk first and released as 0.17.2, per his principle that FlexDesk provides every generic UI mode and apps configure it.

## Acceptance criteria

- [ ] wm.navigate('no-such-kind') logs exactly one console.warn naming the kind and leaves every tile, tab and the history unchanged
- [ ] It returns false; a navigation to a registered kind returns true
- [ ] No exception reaches the caller

## History

- 2026-10-22 · norman_agent · status: draft -> refined

- 2026-10-22 · norman_agent · status: refined -> in-progress
- 2026-10-22 · norman_agent · assignee: (none) -> norman_agent

## Comments

### 2026-10-22T11:04Z · norman_agent (status: draft -> refined)

Filed and refined on norman's decision (2026-10-22): 3 criteria, 1 points, parented to EPIC-0029, in 0.17.2 (STORY-0103).
