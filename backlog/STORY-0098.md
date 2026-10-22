---
id: 98
type: story
title: "An already-open single-instance kind receives new props when navigated to again"
status: refined
parent: 29
phase:
assignee:
reporter: norman
due:
points: 3
subsystem:
labels: [migration, flexdesk]
links: []
created: 2026-10-22
updated: 2026-10-22T11:04Z
---

## Description

EcoSim STORY-0035 (`../EcoSim/backlog/STORY-0035.md`) routes every in-app navigation through wm.navigate. Navigating to a single-instance kind that is already open only reveals it today; the new props are lost. Opt-in and generic: no application vocabulary; a consumer that uses none of it sees no change. Document it in a README section headed "(0.17.2)".

norman decided on 2026-10-22 (Claude Code session) that the generic capabilities EcoSim's shell cutover needs are built in FlexDesk first and released as 0.17.2, per his principle that FlexDesk provides every generic UI mode and apps configure it.

## Acceptance criteria

- [ ] wm.navigate(kind, props) on an open single-instance kind reveals it and calls its content's `navigate(props)` hook once with the new props
- [ ] The props are recorded on the tab, so a page restore reopens it with the latest props
- [ ] A content without a `navigate` hook is revealed unchanged and nothing throws
- [ ] Navigating with the same props twice calls the hook twice (no deduplication) and creates no second instance

## History

- 2026-10-22 · norman_agent · status: draft -> refined

## Comments

### 2026-10-22T11:04Z · norman_agent (status: draft -> refined)

Filed and refined on norman's decision (2026-10-22): 4 criteria, 3 points, parented to EPIC-0029, in 0.17.2 (STORY-0103).
