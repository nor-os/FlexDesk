---
id: 118
type: story
title: "0.17.12 ships emptyMessage as a function (STORY-0117) for EcoSim BUG-0080"
status: done
parent: 68
phase:
assignee: norman
reporter: norman
due:
points: 1
subsystem:
labels: [release]
links: [relates-to 117]
created: 2026-10-26
updated: 2026-10-26T11:00Z
---

## Description

STORY-0117 is needed by EcoSim BUG-0080. Released as 0.17.12, a patch release (additive).

## Acceptance criteria

- [x] `npm view flexdesk@0.17.12 version` prints 0.17.12
- [x] STORY-0117 is on main
- [x] `node build.mjs --check` passes and dist/ matches a fresh build
- [x] CHANGELOG.md has a 0.17.12 section compiled from the docs sections headed "(0.17.12)", each entry linking to docs/components/<page>.md#<anchor>

## History

- 2026-10-26 · norman_agent · status: refined -> in-progress
- 2026-10-26 · norman_agent · status: in-progress -> done
- 2026-10-26 · norman_agent · assignee: norman_agent -> norman

## Comments

### 2026-10-26T10:10Z · norman_agent

Filed, refined and claimed: 4 criteria, 1 point, parented to EPIC-0068 like STORY-0106..0116.

### 2026-10-26T11:00Z · norman_agent (status: in-progress -> done)

Released: FlexDesk 0.17.12 (f9d0f19) is pushed to main and published to npm. STORY-0117 is on main. node build.mjs --check passes. CHANGELOG has the 0.17.12 section, linking docs/components/charts.md#an-empty-cell-can-name-what-is-missing-emptymessage-as-a-function-01712. Full suite: 205 suites green.
