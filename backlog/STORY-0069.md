---
id: 69
type: story
title: "0.17.0 ships every defect fix and capability an embedder migration needs, in one release"
status: refined
parent: 68
phase:
assignee:
reporter: norman
due:
points: 3
subsystem: build
labels: [release]
links: [blocked-by 31, blocked-by 32, blocked-by 33, blocked-by 34, blocked-by 35, blocked-by 36, blocked-by 37, blocked-by 38, blocked-by 62, blocked-by 39, blocked-by 43, blocked-by 44, blocked-by 50, blocked-by 30, blocked-by 41, blocked-by 42, blocked-by 45, blocked-by 46, blocked-by 47, blocked-by 48, blocked-by 49, blocked-by 67, blocked-by 52, blocked-by 53, blocked-by 55, blocked-by 57, blocked-by 56, blocked-by 58, blocked-by 60, blocked-by 61, blocked-by 63, blocked-by 64, blocked-by 65, blocked-by 66, relates-to BUG-0003, relates-to BUG-0004, relates-to BUG-0005, relates-to BUG-0006, relates-to BUG-0008, relates-to BUG-0009, relates-to BUG-0026, relates-to BUG-0011, relates-to BUG-0012, relates-to BUG-0013, relates-to BUG-0014, relates-to BUG-0015, relates-to BUG-0016, relates-to BUG-0017, relates-to BUG-0018, relates-to BUG-0019, relates-to BUG-0020, relates-to BUG-0023, relates-to BUG-0024, relates-to BUG-0025, relates-to BUG-0027, relates-to BUG-0028]
created: 2026-10-17
updated: 2026-10-17T08:37Z
---

## Description

One release carries all of it (decision by norman, 2026-10-17). Contents: STORY-0031, STORY-0032, STORY-0033, STORY-0034, STORY-0035, STORY-0036, STORY-0037, STORY-0038, STORY-0062, STORY-0039, STORY-0043, STORY-0044, STORY-0050; the bugs listed in fixes_bugs; and the existing BUG-0001 (latex tooltip never visible) and BUG-0002 (flow popovers behind ManagedWindow); the form, content, progress and menu widgets STORY-0030, STORY-0041, STORY-0042, STORY-0045, STORY-0046, STORY-0047, STORY-0048, STORY-0049, STORY-0067, STORY-0052, STORY-0053, STORY-0055, STORY-0057, STORY-0056, STORY-0058; and the charts, tiles, flow and grid work STORY-0060, STORY-0061, STORY-0063, STORY-0064, STORY-0065, STORY-0066.

Related EcoSim records: EcoSim STORY-0025 (`../EcoSim/backlog/STORY-0025.md`).

Filed from the EcoSim -> FlexDesk 0.16 migration analysis (2026-10-17).

## Acceptance criteria

- [ ] `npm view flexdesk@0.17.0 version` prints 0.17.0
- [ ] Every listed story is marked done in the backlog
- [ ] Each listed bug's steps to reproduce no longer reproduce against the published package
- [ ] `npm run check` passes and dist/ matches a fresh build
- [ ] The changelog lists every removed or renamed export with its replacement

## History

- 2026-10-17 · norman_agent · status: draft -> refined

## Comments

### 2026-10-17T07:55Z · norman_agent

Left in draft: the content passes the refinement checks, but its shape depends on the FlexDesk owner's agreement on the 0.17/0.18/0.19 release grouping. Refine it once that is decided.

### 2026-10-17T08:37Z · norman_agent (status: draft -> refined)

Refined. Decision (norman, 2026-10-17): one release instead of 0.17/0.18/0.19. STORY-0070 and STORY-0071 are folded in, and their contents and blockers are now listed here.
