---
id: 110
type: story
title: "0.17.7 ships the overlay scrollbar styles EcoSim BUG-0040 found"
status: done
parent: 68
phase:
assignee: norman
reporter: norman
due:
points: 1
subsystem:
labels: [release]
links: [relates-to BUG-0039]
created: 2026-10-24
updated: 2026-10-24T13:10Z
---

## Description

EcoSim BUG-0040 found a FlexDesk defect (BUG-0039). Fixed in FlexDesk and released as 0.17.7, a patch release.

## Acceptance criteria

- [x] `npm view flexdesk@0.17.7 version` prints 0.17.7
- [x] BUG-0039 is fixed on main
- [x] `node build.mjs --check` passes and dist/ matches a fresh build
- [x] CHANGELOG.md has a 0.17.7 section compiled from the docs sections headed "(0.17.7)", each entry linking to docs/components/<page>.md#<anchor>

## History

- 2026-10-24 · norman_agent · status: refined -> in-progress
- 2026-10-24 · norman_agent · status: in-progress -> done
- 2026-10-24 · norman_agent · assignee: norman_agent -> norman

## Comments

### 2026-10-24T08:20Z · norman_agent

Filed, refined and claimed: 4 criteria, 1 point, parented to EPIC-0068 like STORY-0106..0108.

### 2026-10-24T13:10Z · norman_agent (status: in-progress -> done)

0.17.7 is on npm (npm view flexdesk@0.17.7 version prints 0.17.7). Release commit e50b278 on main. BUG-0039 is fixed on main (a29b4dc). node build.mjs --check passes. The CHANGELOG has a 0.17.7 section compiled from the docs section headed "(0.17.7)", linking docs/components/layout-widgets.md#installoverlayscrollbar-is-styled-by-flexdeskcss-0177. Published from a tarball packed on the release commit (the Linux npm has no login; the Windows npm published the .tgz).
