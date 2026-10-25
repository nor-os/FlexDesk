---
id: 115
type: story
title: "0.17.10 ships accent colours derived from tokens (BUG-0044) for EcoSim BUG-0073"
status: in-progress
parent: 68
phase:
assignee: norman_agent
reporter: norman
due:
points: 1
subsystem:
labels: [release]
links: [relates-to BUG-0044]
created: 2026-10-25
updated: 2026-10-25T09:45Z
---

## Description

BUG-0044 is needed by EcoSim BUG-0073. Released as 0.17.10, a patch release.

## Acceptance criteria

- [ ] `npm view flexdesk@0.17.10 version` prints 0.17.10
- [ ] BUG-0044 is on main
- [ ] `node build.mjs --check` passes and dist/ matches a fresh build
- [ ] CHANGELOG.md has a 0.17.10 section compiled from the docs sections headed "(0.17.10)", each entry linking to docs/<page>.md#<anchor>

## History

- 2026-10-25 · norman_agent · status: refined -> in-progress

## Comments

### 2026-10-25T09:45Z · norman_agent

Filed, refined and claimed: 4 criteria, 1 point, parented to EPIC-0068 like STORY-0106..0114.
