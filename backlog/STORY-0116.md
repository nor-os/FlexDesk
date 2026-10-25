---
id: 116
type: story
title: "0.17.11 ships the remaining accent shades derived from tokens (BUG-0045)"
status: in-progress
parent: 68
phase:
assignee: norman_agent
reporter: norman
due:
points: 1
subsystem:
labels: [release]
links: [relates-to BUG-0045]
created: 2026-10-25
updated: 2026-10-25T14:20Z
---

## Description

BUG-0045 lets EcoSim drop the KNOWN_FLEXDESK_EXCEPTIONS allowlist of BUG-0073's retheme test. Released as 0.17.11, a patch release.

## Acceptance criteria

- [ ] `npm view flexdesk@0.17.11 version` prints 0.17.11
- [ ] BUG-0045 is on main
- [ ] `node build.mjs --check` passes and dist/ matches a fresh build
- [ ] CHANGELOG.md has a 0.17.11 section compiled from the docs sections headed "(0.17.11)", each entry linking to docs/<page>.md#<anchor>

## History

- 2026-10-25 · norman_agent · status: refined -> in-progress

## Comments

### 2026-10-25T14:20Z · norman_agent

Filed, refined and claimed: 4 criteria, 1 point, parented to EPIC-0068 like STORY-0106..0115.
