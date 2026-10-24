---
id: 112
type: story
title: "0.17.8 ships series-transform context and choice parameters for EcoSim STORY-0077"
status: done
parent: 68
phase:
assignee: norman
reporter: norman
due:
points: 1
subsystem:
labels: [release]
links: [relates-to 111]
created: 2026-10-24
updated: 2026-10-24T16:20Z
---

## Description

STORY-0111 is needed by EcoSim STORY-0077. Released as 0.17.8, a patch release (additive).

## Acceptance criteria

- [x] `npm view flexdesk@0.17.8 version` prints 0.17.8
- [x] STORY-0111 is on main
- [x] `node build.mjs --check` passes and dist/ matches a fresh build
- [x] CHANGELOG.md has a 0.17.8 section compiled from the docs sections headed "(0.17.8)", each entry linking to docs/components/<page>.md#<anchor>

## History

- 2026-10-24 · norman_agent · status: refined -> in-progress
- 2026-10-24 · norman_agent · status: in-progress -> done
- 2026-10-24 · norman_agent · assignee: norman_agent -> norman

## Comments

### 2026-10-24T15:00Z · norman_agent

Filed, refined and claimed: 4 criteria, 1 point, parented to EPIC-0068 like STORY-0106..0110.

### 2026-10-24T16:20Z · norman_agent (status: in-progress -> done)

0.17.8 is on npm (npm view flexdesk@0.17.8 version prints 0.17.8). Release commit 374bf7e on main. STORY-0111 is on main (c44a4ef, f07e1f5). node build.mjs --check passes. The CHANGELOG has a 0.17.8 section compiled from the docs section headed "(0.17.8)", linking docs/components/charts.md#a-series-transform-knows-its-series-and-takes-a-choice-parameter-0178. Full suite: 202 suites green. A first release attempt was dropped before it was pushed: it stopped running transforms on overlays, which is not additive. Published from a tarball packed on the release commit with the Windows npm.
