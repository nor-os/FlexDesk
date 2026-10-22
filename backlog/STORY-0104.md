---
id: 104
type: story
title: "0.17.3 ships the NotificationHistory fix EcoSim's shell cutover needs"
status: done
parent: 68
phase:
assignee: norman
reporter: norman
due:
points: 1
subsystem:
labels: [release]
links: [relates-to BUG-0034]
created: 2026-10-22
updated: 2026-10-22T19:20Z
---

## Description

norman decided on 2026-10-22 that the bell-badge defect found by EcoSim STORY-0037 is fixed in FlexDesk and shipped as 0.17.3. Contents: BUG-0034. Additive, so a patch release.

## Acceptance criteria

- [x] `npm view flexdesk@0.17.3 version` prints 0.17.3
- [x] BUG-0034 is fixed on main
- [x] `node build.mjs --check` passes and dist/ matches a fresh build
- [x] CHANGELOG.md has a 0.17.3 section compiled from the README sections headed "(0.17.3)"

## History

- 2026-10-22 · norman_agent · status: draft -> refined
- 2026-10-22 · norman_agent · status: refined -> in-progress
- 2026-10-22 · norman_agent · assignee: (none) -> norman_agent
- 2026-10-22 · norman_agent · status: in-progress -> done
- 2026-10-22 · norman_agent · assignee: norman_agent -> norman

## Comments

### 2026-10-22T16:58Z · norman_agent (status: draft -> refined)

Filed and refined on norman's decision (2026-10-22): 4 criteria, 1 point, parented to EPIC-0068.

### 2026-10-22T19:20Z · norman_agent (status: in-progress -> done)

Released by the orchestrating session under norman's release authorisation. Release commit af567f6 "FlexDesk 0.17.3" (prepared by the release agent on release-0.17.3, cut from ba233e4) fast-forwarded onto main; `node build.mjs --check` OK; CHANGELOG 0.17.3 section from the README section "One toast, one history entry, one unread (0.17.3)"; exports unchanged (new method NotificationCenter.subscribe). `npm pack --dry-run` 248 files; `npm publish` as nor-os. The one behaviour change (NotificationHistory follows the centre's subscribe() instead of the bus) was checked against consumers: BugDesk already passes notificationCenter, Tables vendors an older copy, EcoSim's own NotificationHistory is replaced by STORY-0037.
