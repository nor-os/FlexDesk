---
id: 102
type: story
title: "A command-palette catalog source can be listed only behind its prefix"
status: done
parent: 40
phase:
assignee: norman
reporter: norman
due:
points: 2
subsystem:
labels: [migration, flexdesk]
links: []
created: 2026-10-22
updated: 2026-10-22T13:32Z
---

## Description

EcoSim STORY-0044 wants help topics only under 'help:' and nothing but commands and pages with no project open. FlexDesk 0.17.1's palette searches every catalog source on any typed query. Opt-in and generic: no application vocabulary; a consumer that uses none of it sees no change. Document it in a README section headed "(0.17.2)".

norman decided on 2026-10-22 (Claude Code session) that the generic capabilities EcoSim's shell cutover needs are built in FlexDesk first and released as 0.17.2, per his principle that FlexDesk provides every generic UI mode and apps configure it.

## Acceptance criteria

- [x] createEntityCatalog accepts a per-source `scopedOnly: true`
- [x] A scopedOnly source contributes no rows to a plain typed query, in both the flat and the grouped palette
- [x] Typing its prefix (e.g. 'help: solver') lists its rows as before
- [x] Sources without the option are searched exactly as in 0.17.1

## History

- 2026-10-22 · norman_agent · status: draft -> refined

- 2026-10-22 · norman_agent · status: refined -> in-progress
- 2026-10-22 · norman_agent · assignee: (none) -> norman_agent
- 2026-10-22 · norman_agent · status: in-progress -> done
- 2026-10-22 · norman_agent · assignee: norman_agent -> norman

## Comments

### 2026-10-22T11:04Z · norman_agent (status: draft -> refined)

Filed and refined on norman's decision (2026-10-22): 4 criteria, 2 points, parented to EPIC-0040, in 0.17.2 (STORY-0103).

### 2026-10-22T13:32Z · norman_agent (status: in-progress -> done)

Done by norman's 2026-10-21 process decision: FlexDesk stories go to done once landed and independently reviewed; this one has landed on main and been independently reviewed.

Built: createEntityCatalog takes a per-source `scopedOnly` option (boolean, otherwise TypeError). With no type chip the palette leaves those rows out of both the flat and the grouped layout (including `>` commands); with the prefix chip set (navKind or alias, e.g. 'help: solver') they are listed as before. `_public` strips the internal mark, so onPick never sees it. loadAll/loadGrouped/loadOne, the tile menu, commands and empty() rows are unchanged; no exports added or renamed. README section 'A catalog source only behind its prefix: `scopedOnly` (0.17.2)'; CHANGELOG left to STORY-0103.

Ticked all 4 criteria. Built on branch story-0102 (ce93d15), landed on main, tip b036452.

Tests: new tests/command_palette_scoped_only.test.mjs, 30 assertions pass (9 fail with the palette change reverted); tests/command_palette_grouped.test.mjs passes; full suite `node tests/run.mjs` GREEN, 192 suites, no SKIPPED lines; `node build.mjs` completed, dist/ restored.
