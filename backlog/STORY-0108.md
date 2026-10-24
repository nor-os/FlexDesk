---
id: 108
type: story
title: "0.17.6 ships the Monaco cancellation fix EcoSim BUG-0028 found"
status: in-progress
parent: 68
phase:
assignee: norman_agent
reporter: norman
due:
points: 1
subsystem:
labels: [release]
links: [relates-to BUG-0038]
created: 2026-10-24
updated: 2026-10-24T03:00Z
---

## Description

EcoSim BUG-0028 found a FlexDesk defect (BUG-0038). Fixed in FlexDesk and released as 0.17.6, a patch release.

## Acceptance criteria

- [ ] `npm view flexdesk@0.17.6 version` prints 0.17.6
- [ ] BUG-0038 is fixed on main
- [ ] `node build.mjs --check` passes and dist/ matches a fresh build
- [ ] CHANGELOG.md has a 0.17.6 section compiled from the docs sections headed "(0.17.6)", each entry linking to docs/components/<page>.md#<anchor>

## History

- 2026-10-24 · norman_agent · status: refined -> in-progress

## Comments

### 2026-10-24T03:00Z · norman_agent

Filed, refined and claimed: 4 criteria, 1 point, parented to EPIC-0068 like STORY-0106 and STORY-0107.
