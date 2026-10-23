---
id: 106
type: story
title: "0.17.4 ships the fixes EcoSim's post-cutover stories need: SlideOutPanel clamp and icons, scrollbars beside resize handles, MenuBar disabled tooltips"
status: refined
parent: 68
phase:
assignee:
reporter: norman
due:
points: 1
subsystem:
labels: [release]
links: [blocked-by 105, relates-to BUG-0035, relates-to BUG-0036]
created: 2026-10-23
updated: 2026-10-23T15:25Z
---

## Description

norman decided on 2026-10-23 that the FlexDesk gaps EcoSim's post-cutover stories found are fixed in FlexDesk first and released as 0.17.4. Contents: BUG-0035, BUG-0036 and STORY-0105. Additive, so a patch release.

## Acceptance criteria

- [ ] `npm view flexdesk@0.17.4 version` prints 0.17.4
- [ ] BUG-0035 and BUG-0036 are fixed and STORY-0105 is done, all on main
- [ ] `node build.mjs --check` passes and dist/ matches a fresh build
- [ ] CHANGELOG.md has a 0.17.4 section compiled from the README sections headed "(0.17.4)"

## History

- 2026-10-23 · norman_agent · status: draft -> refined

## Comments

### 2026-10-23T15:25Z · norman_agent (status: draft -> refined)

Filed and refined on norman's decision (2026-10-23): 4 criteria, 1 point, parented to EPIC-0068.
