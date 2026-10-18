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
links: [blocked-by 31, blocked-by 32, blocked-by 33, blocked-by 34, blocked-by 35, blocked-by 36, blocked-by 37, blocked-by 38, blocked-by 62, blocked-by 39, blocked-by 43, blocked-by 44, blocked-by 50, blocked-by 30, blocked-by 41, blocked-by 42, blocked-by 45, blocked-by 46, blocked-by 47, blocked-by 48, blocked-by 49, blocked-by 67, blocked-by 52, blocked-by 53, blocked-by 55, blocked-by 57, blocked-by 56, blocked-by 58, blocked-by 60, blocked-by 61, blocked-by 63, blocked-by 64, blocked-by 65, blocked-by 66, blocked-by 3, blocked-by 85, blocked-by 86, blocked-by 87, blocked-by 88, blocked-by 89, blocked-by 90, blocked-by 91, blocked-by 74, blocked-by 75, blocked-by 76, blocked-by 77, blocked-by 78, blocked-by 79, blocked-by 80, blocked-by 81, blocked-by 82, blocked-by 83, blocked-by 84, relates-to BUG-0003, relates-to BUG-0004, relates-to BUG-0005, relates-to BUG-0006, relates-to BUG-0008, relates-to BUG-0009, relates-to BUG-0026, relates-to BUG-0011, relates-to BUG-0012, relates-to BUG-0013, relates-to BUG-0014, relates-to BUG-0015, relates-to BUG-0016, relates-to BUG-0017, relates-to BUG-0018, relates-to BUG-0019, relates-to BUG-0020, relates-to BUG-0023, relates-to BUG-0024, relates-to BUG-0025, relates-to BUG-0027, relates-to BUG-0028]
created: 2026-10-17
updated: 2026-10-18T10:34Z
---

## Description

One release carries all of it (decision by norman, 2026-10-17). Contents: STORY-0031, STORY-0032, STORY-0033, STORY-0034, STORY-0035, STORY-0036, STORY-0037, STORY-0038, STORY-0062, STORY-0039, STORY-0043, STORY-0044, STORY-0050; the bugs listed in fixes_bugs; and the existing BUG-0001 (latex tooltip never visible) and BUG-0002 (flow popovers behind ManagedWindow); the form, content, progress and menu widgets STORY-0030, STORY-0041, STORY-0042, STORY-0045, STORY-0046, STORY-0047, STORY-0048, STORY-0049, STORY-0067, STORY-0052, STORY-0053, STORY-0055, STORY-0057, STORY-0056, STORY-0058; and the charts, tiles, flow and grid work STORY-0060, STORY-0061, STORY-0063, STORY-0064, STORY-0065, STORY-0066; and the generic node modeler EPIC-0073, STORY-0074 to STORY-0084 (folded in by norman, 2026-10-17).

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

### 2026-10-17T21:21Z · norman_agent

Scope added by norman (2026-10-17): the generic node modeler, EPIC-0073 with STORY-0074 to STORY-0084, ships in 0.17.0 too. The eleven stories are now in the blocked-by list and the contents above, and the changelog criterion covers their additive API changes (new CANVAS_ACTIONS ids, onSelect `kind: 'many'`, optional graph keys).

### 2026-10-18T09:31Z · norman_agent

Scope added by norman (2026-10-18): STORY-0003 (the editable grid) ships in 0.17.0 because STORY-0066 builds on it. Added to blocked-by.

### 2026-10-18T10:34Z · norman_agent

Scope added by norman (2026-10-18): the whole editable-grid split ships in 0.17.0, STORY-0085 to STORY-0091 (range copy, column reorder, six editors, staged edits, fill handle, paste, crosstab grid), on top of STORY-0003. Added to blocked-by.
