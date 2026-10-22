---
id: 104
type: story
title: "0.17.3 ships the NotificationHistory fix EcoSim's shell cutover needs"
status: refined
parent: 68
phase:
assignee:
reporter: norman
due:
points: 1
subsystem:
labels: [release]
links: [relates-to BUG-0034]
created: 2026-10-22
updated: 2026-10-22T16:58Z
---

## Description

norman decided on 2026-10-22 that the bell-badge defect found by EcoSim STORY-0037 is fixed in FlexDesk and shipped as 0.17.3. Contents: BUG-0034. Additive, so a patch release.

## Acceptance criteria

- [ ] `npm view flexdesk@0.17.3 version` prints 0.17.3
- [ ] BUG-0034 is fixed on main
- [ ] `node build.mjs --check` passes and dist/ matches a fresh build
- [ ] CHANGELOG.md has a 0.17.3 section compiled from the README sections headed "(0.17.3)"

## History

- 2026-10-22 · norman_agent · status: draft -> refined

## Comments

### 2026-10-22T16:58Z · norman_agent (status: draft -> refined)

Filed and refined on norman's decision (2026-10-22): 4 criteria, 1 point, parented to EPIC-0068.
