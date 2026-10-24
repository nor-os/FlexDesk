---
id: 114
type: story
title: "0.17.9 ships the context-menu, plot-config and tile-menu fixes EcoSim's real-app checks found"
status: in-progress
parent: 68
phase:
assignee: norman_agent
reporter: norman
due:
points: 1
subsystem:
labels: [release]
links: [relates-to BUG-0040, relates-to BUG-0041, relates-to BUG-0042, relates-to BUG-0043]
created: 2026-10-25
updated: 2026-10-25T08:15Z
---

## Description

BUG-0040..0043 were found by EcoSim's EPIC-0052, EPIC-0070 and EPIC-0101 real-app checks; EcoSim BUG-0057 waits on BUG-0040. Released as 0.17.9, a patch release (fixes, plus 'auto' as an accepted interpolation value).

## Acceptance criteria

- [ ] `npm view flexdesk@0.17.9 version` prints 0.17.9
- [ ] BUG-0040..0043 are on main
- [ ] `node build.mjs --check` passes and dist/ matches a fresh build
- [ ] CHANGELOG.md has a 0.17.9 section compiled from the docs sections headed "(0.17.9)", each entry linking to docs/components/<page>.md#<anchor>

## History

- 2026-10-25 · norman_agent · status: refined -> in-progress

## Comments

### 2026-10-25T08:15Z · norman_agent

Filed, refined and claimed: 4 criteria, 1 point, parented to EPIC-0068 like STORY-0106..0112.
