---
id: 107
type: story
title: "0.17.5 ships the data series plot default-config fix EcoSim STORY-0071 found"
status: in-progress
parent: 68
phase:
assignee: norman_agent
reporter: norman
due:
points: 1
subsystem:
labels: [release]
links: [relates-to BUG-0037]
created: 2026-10-24
updated: 2026-10-24T00:50Z
---

## Description

EcoSim STORY-0071 found a FlexDesk defect (BUG-0037). Fixed in FlexDesk and released as 0.17.5, a patch release.

## Acceptance criteria

- [ ] `npm view flexdesk@0.17.5 version` prints 0.17.5
- [ ] BUG-0037 is fixed on main
- [ ] `node build.mjs --check` passes and dist/ matches a fresh build
- [ ] CHANGELOG.md has a 0.17.5 section compiled from the docs sections headed "(0.17.5)", each entry linking to docs/components/<page>.md#<anchor>

## History

- 2026-10-24 · norman_agent · status: refined -> in-progress

## Comments

### 2026-10-24T00:50Z · norman_agent

Filed, refined and claimed: 4 criteria, 1 point, parented to EPIC-0068 like STORY-0106.
