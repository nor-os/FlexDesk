---
id: 106
type: story
title: "0.17.4 ships two defect fixes EcoSim's post-cutover stories found: SlideOutPanel clamp and icons, scrollbars beside resize handles"
status: in-progress
parent: 68
phase:
assignee:
reporter: norman
due:
points: 1
subsystem:
labels: [release]
links: [relates-to BUG-0035, relates-to BUG-0036]
created: 2026-10-23
updated: 2026-10-23T16:00Z
---

## Description

norman decided on 2026-10-23 that the FlexDesk gaps EcoSim's post-cutover stories found are fixed in FlexDesk first and released as 0.17.4. Contents: BUG-0035 and BUG-0036. Additive, so a patch release.

## Acceptance criteria

- [ ] `npm view flexdesk@0.17.4 version` prints 0.17.4
- [ ] BUG-0035 and BUG-0036 are fixed, both on main
- [ ] `node build.mjs --check` passes and dist/ matches a fresh build
- [ ] CHANGELOG.md has a 0.17.4 section compiled from the README sections headed "(0.17.4)"

## History

- 2026-10-23 · norman_agent · status: draft -> refined
- 2026-10-23 · norman_agent · status: refined -> in-progress
- 2026-10-23 · norman_agent · assignee: (unset) -> norman_agent

## Comments

### 2026-10-23T15:25Z · norman_agent (status: draft -> refined)

Filed and refined on norman's decision (2026-10-23): 4 criteria, 1 point, parented to EPIC-0068.

### 2026-10-23T15:35Z · norman_agent

STORY-0105 dropped (FlexDesk-first decision, 2026-10-23); 0.17.4 now ships BUG-0035 and BUG-0036 only.

### 2026-10-23T16:00Z · norman_agent

Claimed for the 0.17.4 release run.
