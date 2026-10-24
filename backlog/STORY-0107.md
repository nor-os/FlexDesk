---
id: 107
type: story
title: "0.17.5 ships the data series plot default-config fix EcoSim STORY-0071 found"
status: done
parent: 68
phase:
assignee: norman
reporter: norman
due:
points: 1
subsystem:
labels: [release]
links: [relates-to BUG-0037]
created: 2026-10-24
updated: 2026-10-24T03:00Z
---

## Description

EcoSim STORY-0071 found a FlexDesk defect (BUG-0037). Fixed in FlexDesk and released as 0.17.5, a patch release.

## Acceptance criteria

- [x] `npm view flexdesk@0.17.5 version` prints 0.17.5
- [x] BUG-0037 is fixed on main
- [x] `node build.mjs --check` passes and dist/ matches a fresh build
- [x] CHANGELOG.md has a 0.17.5 section compiled from the docs sections headed "(0.17.5)", each entry linking to docs/components/<page>.md#<anchor>

## History

- 2026-10-24 · norman_agent · status: refined -> in-progress
- 2026-10-24 · norman_agent · status: in-progress -> done
- 2026-10-24 · norman_agent · assignee: norman_agent -> norman

## Comments

### 2026-10-24T00:50Z · norman_agent

Filed, refined and claimed: 4 criteria, 1 point, parented to EPIC-0068 like STORY-0106.

### 2026-10-24T03:00Z · norman_agent (status: in-progress -> done)

0.17.5 is on npm (npm publish answered + flexdesk@0.17.5). Release commit 47c8f7d on main. BUG-0037 is fixed on main. node build.mjs --check passes. The CHANGELOG has a 0.17.5 section compiled from the docs section headed "(0.17.5)", linking docs/components/charts.md#a-data-series-with-no-saved-plot-config-opens-0175. Full suite green, 200 suites.
