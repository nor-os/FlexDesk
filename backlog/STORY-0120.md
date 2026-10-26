---
id: 120
type: story
title: "0.17.13 ships the menu-bar row (STORY-0119) for EcoSim STORY-0114"
status: in-progress
parent: 68
phase:
assignee: norman_agent
reporter: norman
due:
points: 1
subsystem:
labels: [release]
links: [relates-to 119]
created: 2026-10-26
updated: 2026-10-26T15:40Z
---

## Description

STORY-0119 is needed by EcoSim STORY-0114. Released as 0.17.13, a patch release (additive).

## Acceptance criteria

- [ ] `npm view flexdesk@0.17.13 version` prints 0.17.13
- [ ] STORY-0119 is on main
- [ ] `node build.mjs --check` passes and dist/ matches a fresh build
- [ ] CHANGELOG.md has a 0.17.13 section compiled from the docs sections headed "(0.17.13)", each entry linking to docs/components/<page>.md#<anchor>

## History

- 2026-10-26 · norman_agent · status: refined -> in-progress

## Comments

### 2026-10-26T15:40Z · norman_agent

Filed, refined and claimed: 4 criteria, 1 point, parented to EPIC-0068 like STORY-0106..0118.
