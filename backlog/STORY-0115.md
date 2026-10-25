---
id: 115
type: story
title: "0.17.10 ships accent colours derived from tokens (BUG-0044) for EcoSim BUG-0073"
status: done
parent: 68
phase:
assignee: norman
reporter: norman
due:
points: 1
subsystem:
labels: [release]
links: [relates-to BUG-0044]
created: 2026-10-25
updated: 2026-10-25T11:00Z
---

## Description

BUG-0044 is needed by EcoSim BUG-0073. Released as 0.17.10, a patch release.

## Acceptance criteria

- [x] `npm view flexdesk@0.17.10 version` prints 0.17.10
- [x] BUG-0044 is on main
- [x] `node build.mjs --check` passes and dist/ matches a fresh build
- [x] CHANGELOG.md has a 0.17.10 section compiled from the docs sections headed "(0.17.10)", each entry linking to docs/<page>.md#<anchor>

## History

- 2026-10-25 · norman_agent · status: refined -> in-progress
- 2026-10-25 · norman_agent · status: in-progress -> done
- 2026-10-25 · norman_agent · assignee: norman_agent -> norman

## Comments

### 2026-10-25T09:45Z · norman_agent

Filed, refined and claimed: 4 criteria, 1 point, parented to EPIC-0068 like STORY-0106..0114.

### 2026-10-25T11:00Z · norman_agent (status: in-progress -> done)

Released: FlexDesk 0.17.10 (890851d) is pushed to main and published to npm. BUG-0044 is on main (1e394ef). node build.mjs --check passes. CHANGELOG has the 0.17.10 section, and its entry links to docs/concepts/styling.md#retheming-the-accent-01710. Full suite: 205 suites green.
