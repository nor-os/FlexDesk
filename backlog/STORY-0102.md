---
id: 102
type: story
title: "A command-palette catalog source can be listed only behind its prefix"
status: in-progress
parent: 40
phase:
assignee: norman_agent
reporter: norman
due:
points: 2
subsystem:
labels: [migration, flexdesk]
links: []
created: 2026-10-22
updated: 2026-10-22T11:05Z
---

## Description

EcoSim STORY-0044 wants help topics only under 'help:' and nothing but commands and pages with no project open. FlexDesk 0.17.1's palette searches every catalog source on any typed query. Opt-in and generic: no application vocabulary; a consumer that uses none of it sees no change. Document it in a README section headed "(0.17.2)".

norman decided on 2026-10-22 (Claude Code session) that the generic capabilities EcoSim's shell cutover needs are built in FlexDesk first and released as 0.17.2, per his principle that FlexDesk provides every generic UI mode and apps configure it.

## Acceptance criteria

- [ ] createEntityCatalog accepts a per-source `scopedOnly: true`
- [ ] A scopedOnly source contributes no rows to a plain typed query, in both the flat and the grouped palette
- [ ] Typing its prefix (e.g. 'help: solver') lists its rows as before
- [ ] Sources without the option are searched exactly as in 0.17.1

## History

- 2026-10-22 · norman_agent · status: draft -> refined

- 2026-10-22 · norman_agent · status: refined -> in-progress
- 2026-10-22 · norman_agent · assignee: (none) -> norman_agent

## Comments

### 2026-10-22T11:04Z · norman_agent (status: draft -> refined)

Filed and refined on norman's decision (2026-10-22): 4 criteria, 2 points, parented to EPIC-0040, in 0.17.2 (STORY-0103).
