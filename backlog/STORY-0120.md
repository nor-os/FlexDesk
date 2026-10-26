---
id: 120
type: story
title: "0.17.13 ships the menu-bar row (STORY-0119) for EcoSim STORY-0114"
status: done
parent: 68
phase:
assignee: norman
reporter: norman
due:
points: 1
subsystem:
labels: [release]
links: [relates-to 119]
created: 2026-10-26
updated: 2026-10-26T16:30Z
---

## Description

STORY-0119 is needed by EcoSim STORY-0114. Released as 0.17.13, a patch release (additive).

## Acceptance criteria

- [x] `npm view flexdesk@0.17.13 version` prints 0.17.13
- [x] STORY-0119 is on main
- [x] `node build.mjs --check` passes and dist/ matches a fresh build
- [x] CHANGELOG.md has a 0.17.13 section compiled from the docs sections headed "(0.17.13)", each entry linking to docs/components/<page>.md#<anchor>

## History

- 2026-10-26 · norman_agent · status: refined -> in-progress
- 2026-10-26 · norman_agent · status: in-progress -> done
- 2026-10-26 · norman_agent · assignee: norman_agent -> norman

## Comments

### 2026-10-26T15:40Z · norman_agent

Filed, refined and claimed: 4 criteria, 1 point, parented to EPIC-0068 like STORY-0106..0118.

### 2026-10-26T16:30Z · norman_agent (status: in-progress -> done)

Released: FlexDesk 0.17.13 (b0cb7d1) is pushed to main and published to npm. STORY-0119 is on main. node build.mjs --check passes. CHANGELOG has the 0.17.13 section, linking docs/components/menus.md#the-menu-bar-in-its-own-row-under-the-top-bar-01713. Full suite: 206 suites green.
