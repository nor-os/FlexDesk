---
id: 103
type: story
title: "0.17.2 ships what EcoSim's shell cutover needs: single-instance props, unknown-kind warning, disabled palette rows, mountable settings categories, prefix-only catalog sources, toast styles"
status: done
parent: 68
phase:
assignee:
reporter: norman
due:
points: 1
subsystem:
labels: [release]
links: [blocked-by 98, blocked-by 99, blocked-by 100, blocked-by 101, blocked-by 102, relates-to BUG-0033]
created: 2026-10-22
updated: 2026-10-22T15:19Z
---

## Description

norman decided on 2026-10-22 (Claude Code session) that the generic capabilities EcoSim's shell cutover needs are built in FlexDesk first and released as 0.17.2, per his principle that FlexDesk provides every generic UI mode and apps configure it. Contents: STORY-0098 to STORY-0102 and BUG-0033. All additive, so it is a patch release.

## Acceptance criteria

- [x] `npm view flexdesk@0.17.2 version` prints 0.17.2
- [x] STORY-0098 to STORY-0102 are done and BUG-0033 is fixed, all on main
- [x] `node build.mjs --check` passes and dist/ matches a fresh build
- [x] CHANGELOG.md has a 0.17.2 section compiled from the README sections headed "(0.17.2)"

## History

- 2026-10-22 · norman_agent · status: draft -> refined
- 2026-10-22 · norman_agent · status: refined -> done

## Comments

### 2026-10-22T11:04Z · norman_agent (status: draft -> refined)

Filed and refined on norman's decision (2026-10-22): 4 criteria, 1 point, parented to EPIC-0068.

### 2026-10-22T15:19Z · norman_agent (status: refined -> done)

Released by the orchestrating session under norman's release authorisation (agents may not push releases or publish). Release commit dc626de "FlexDesk 0.17.2" on main (fast-forward), cut from 8b0e6a1, the tree whose full suite ran green (196 suites, no skips); `node build.mjs --check` OK; CHANGELOG.md has the 0.17.2 section (six entries from the README sections headed "(0.17.2)"); exports only added (SettingsCategories). `npm pack --dry-run`: 248 files; `npm publish` as nor-os. STORY-0098 to STORY-0102 are done and BUG-0033 is fixed on main.
