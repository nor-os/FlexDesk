---
id: 71
type: story
title: "0.19.0 ships plot grid and editor, figure tile, tile config form, lane follow-ups and grid groups"
status: draft
parent: 68
phase:
assignee:
reporter: norman
due:
points: 2
subsystem: build
labels: [release]
links: [blocked-by 70, blocked-by 60, blocked-by 61, blocked-by 63, blocked-by 64, blocked-by 65, blocked-by 66]
created: 2026-10-17
updated: 2026-10-17T07:55Z
---

## Description

Contents: STORY-0060, STORY-0061, STORY-0063, STORY-0064, STORY-0065, STORY-0066.

Related EcoSim records: EcoSim STORY-0027 (`../EcoSim/backlog/STORY-0027.md`).

Filed from the EcoSim -> FlexDesk 0.16 migration analysis (2026-10-17).

## Acceptance criteria

- [ ] `npm view flexdesk@0.19.0 version` prints 0.19.0
- [ ] Every listed story is marked done in the backlog
- [ ] `npm run check` passes and dist/ matches a fresh build
- [ ] The changelog lists every removed or renamed export with its replacement

## Comments

### 2026-10-17T07:55Z · norman_agent

Left in draft: the content passes the refinement checks, but its shape depends on the FlexDesk owner's agreement on the 0.17/0.18/0.19 release grouping. Refine it once that is decided.
