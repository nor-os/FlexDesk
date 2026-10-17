---
id: 70
type: story
title: "0.18.0 ships the form, content, progress and menu widgets"
status: draft
parent: 68
phase:
assignee:
reporter: norman
due:
points: 3
subsystem: build
labels: [release]
links: [blocked-by 69, blocked-by 30, blocked-by 41, blocked-by 42, blocked-by 45, blocked-by 46, blocked-by 47, blocked-by 48, blocked-by 49, blocked-by 67, blocked-by 52, blocked-by 53, blocked-by 55, blocked-by 57, blocked-by 56, blocked-by 58]
created: 2026-10-17
updated: 2026-10-17T07:55Z
---

## Description

Contents: STORY-0030, STORY-0041, STORY-0042, STORY-0045, STORY-0046, STORY-0047, STORY-0048, STORY-0049, STORY-0067, STORY-0052, STORY-0053, STORY-0055, STORY-0057, STORY-0056, STORY-0058.

Related EcoSim records: EcoSim STORY-0026 (`../EcoSim/backlog/STORY-0026.md`).

Filed from the EcoSim -> FlexDesk 0.16 migration analysis (2026-10-17).

## Acceptance criteria

- [ ] `npm view flexdesk@0.18.0 version` prints 0.18.0
- [ ] Every listed story is marked done in the backlog
- [ ] `npm run check` passes and dist/ matches a fresh build
- [ ] The changelog lists every removed or renamed export with its replacement
