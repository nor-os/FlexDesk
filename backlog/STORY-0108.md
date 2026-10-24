---
id: 108
type: story
title: "0.17.6 ships the Monaco cancellation fix EcoSim BUG-0028 found"
status: done
parent: 68
phase:
assignee: norman
reporter: norman
due:
points: 1
subsystem:
labels: [release]
links: [relates-to BUG-0038]
created: 2026-10-24
updated: 2026-10-24T05:50Z
---

## Description

EcoSim BUG-0028 found a FlexDesk defect (BUG-0038). Fixed in FlexDesk and released as 0.17.6, a patch release.

## Acceptance criteria

- [x] `npm view flexdesk@0.17.6 version` prints 0.17.6
- [x] BUG-0038 is fixed on main
- [x] `node build.mjs --check` passes and dist/ matches a fresh build
- [x] CHANGELOG.md has a 0.17.6 section compiled from the docs sections headed "(0.17.6)", each entry linking to docs/components/<page>.md#<anchor>

## History

- 2026-10-24 · norman_agent · status: refined -> in-progress
- 2026-10-24 · norman_agent · status: in-progress -> done
- 2026-10-24 · norman_agent · assignee: norman_agent -> norman

## Comments

### 2026-10-24T03:00Z · norman_agent

Filed, refined and claimed: 4 criteria, 1 point, parented to EPIC-0068 like STORY-0106 and STORY-0107.

### 2026-10-24T05:50Z · norman_agent (status: in-progress -> done)

0.17.6 is on npm (npm view flexdesk@0.17.6 version prints 0.17.6). Release commit 266efdc on main. BUG-0038 is fixed on main (b76fa74). node build.mjs --check passes. The CHANGELOG has a 0.17.6 section compiled from the docs section headed "(0.17.6)", linking docs/components/editor.md#monacos-canceled-rejections-are-hidden-0176. Full suite green, 201 suites.
