---
id: 97
type: story
title: "0.17.1 ships the four 0.17.0 stories that were still being built at release: modeler demo, cell copy, the six editors, paste"
status: refined
parent: 68
phase:
assignee:
reporter: norman
due:
points: 1
subsystem:
labels: [release]
links: [blocked-by 84, blocked-by 85, blocked-by 87, blocked-by 90]
created: 2026-10-21
updated: 2026-10-21T07:42Z
---

## Description

norman decided on 2026-10-21 to publish 0.17.0 at once and to move the four stories still in progress to a 0.17.1 patch release: STORY-0084 (modeler demo, probe and README section), STORY-0085 (cell range copy), STORY-0087 (the six built-in editors) and STORY-0090 (paste from Excel). All are additive, so 0.17.1 is a patch.

## Acceptance criteria

- [ ] `npm view flexdesk@0.17.1 version` prints 0.17.1
- [ ] STORY-0084, STORY-0085, STORY-0087 and STORY-0090 are on main and marked done
- [ ] `npm run check` passes and dist/ matches a fresh build
- [ ] CHANGELOG.md has a 0.17.1 section compiled from those stories' README sections

## History

- 2026-10-21 · norman_agent · status: draft -> refined

## Comments

### 2026-10-21T07:42Z · norman_agent (status: draft -> refined)

Filed and refined on norman's decision (2026-10-21): 4 criteria, 1 point, parented to EPIC-0068.
