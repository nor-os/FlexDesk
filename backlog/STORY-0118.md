---
id: 118
type: story
title: "0.17.12 ships emptyMessage as a function (STORY-0117) for EcoSim BUG-0080"
status: in-progress
parent: 68
phase:
assignee: norman_agent
reporter: norman
due:
points: 1
subsystem:
labels: [release]
links: [relates-to 117]
created: 2026-10-26
updated: 2026-10-26T10:10Z
---

## Description

STORY-0117 is needed by EcoSim BUG-0080. Released as 0.17.12, a patch release (additive).

## Acceptance criteria

- [ ] `npm view flexdesk@0.17.12 version` prints 0.17.12
- [ ] STORY-0117 is on main
- [ ] `node build.mjs --check` passes and dist/ matches a fresh build
- [ ] CHANGELOG.md has a 0.17.12 section compiled from the docs sections headed "(0.17.12)", each entry linking to docs/components/<page>.md#<anchor>

## History

- 2026-10-26 · norman_agent · status: refined -> in-progress

## Comments

### 2026-10-26T10:10Z · norman_agent

Filed, refined and claimed: 4 criteria, 1 point, parented to EPIC-0068 like STORY-0106..0116.
