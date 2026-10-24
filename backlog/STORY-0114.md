---
id: 114
type: story
title: "0.17.9 ships the context-menu, plot-config and tile-menu fixes EcoSim's real-app checks found"
status: done
parent: 68
phase:
assignee: norman
reporter: norman
due:
points: 1
subsystem:
labels: [release]
links: [relates-to BUG-0040, relates-to BUG-0041, relates-to BUG-0042, relates-to BUG-0043]
created: 2026-10-25
updated: 2026-10-25T09:10Z
---

## Description

BUG-0040..0043 were found by EcoSim's EPIC-0052, EPIC-0070 and EPIC-0101 real-app checks; EcoSim BUG-0057 waits on BUG-0040. Released as 0.17.9, a patch release (fixes, plus 'auto' as an accepted interpolation value).

## Acceptance criteria

- [x] `npm view flexdesk@0.17.9 version` prints 0.17.9
- [x] BUG-0040..0043 are on main
- [x] `node build.mjs --check` passes and dist/ matches a fresh build
- [x] CHANGELOG.md has a 0.17.9 section compiled from the docs sections headed "(0.17.9)", each entry linking to docs/components/<page>.md#<anchor>

## History

- 2026-10-25 · norman_agent · status: refined -> in-progress
- 2026-10-25 · norman_agent · status: in-progress -> done
- 2026-10-25 · norman_agent · assignee: norman_agent -> norman

## Comments

### 2026-10-25T08:15Z · norman_agent

Filed, refined and claimed: 4 criteria, 1 point, parented to EPIC-0068 like STORY-0106..0112.

### 2026-10-25T09:10Z · norman_agent (status: in-progress -> done)

Released: FlexDesk 0.17.9 (3fe27a2) is pushed to main and published to npm. BUG-0040..0043 are on main. node build.mjs --check passes. CHANGELOG has the 0.17.9 section, and its entries link to the docs sections headed (0.17.9) (anchors checked). Full suite: 204 suites green. Before release, one wording mismatch from review was fixed in the docs and CHANGELOG: how the tile menu and ActionDropdown choose to open above or below.
