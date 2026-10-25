---
id: 116
type: story
title: "0.17.11 ships the remaining accent shades derived from tokens (BUG-0045)"
status: done
parent: 68
phase:
assignee: norman
reporter: norman
due:
points: 1
subsystem:
labels: [release]
links: [relates-to BUG-0045]
created: 2026-10-25
updated: 2026-10-25T15:20Z
---

## Description

BUG-0045 lets EcoSim drop the KNOWN_FLEXDESK_EXCEPTIONS allowlist of BUG-0073's retheme test. Released as 0.17.11, a patch release.

## Acceptance criteria

- [x] `npm view flexdesk@0.17.11 version` prints 0.17.11
- [x] BUG-0045 is on main
- [x] `node build.mjs --check` passes and dist/ matches a fresh build
- [x] CHANGELOG.md has a 0.17.11 section compiled from the docs sections headed "(0.17.11)", each entry linking to docs/<page>.md#<anchor>

## History

- 2026-10-25 · norman_agent · status: refined -> in-progress
- 2026-10-25 · norman_agent · status: in-progress -> done
- 2026-10-25 · norman_agent · assignee: norman_agent -> norman

## Comments

### 2026-10-25T14:20Z · norman_agent

Filed, refined and claimed: 4 criteria, 1 point, parented to EPIC-0068 like STORY-0106..0115.

### 2026-10-25T15:20Z · norman_agent (status: in-progress -> done)

Released: FlexDesk 0.17.11 (ca1dad1) is pushed to main and published to npm. BUG-0045 is on main. node build.mjs --check passes. CHANGELOG has the 0.17.11 section, linking docs/concepts/styling.md#retheming-the-accent-shades-01711. Full suite: 205 suites green.
