---
id: 130
type: story
title: "Single-instance kinds can be single per desktop: navigate opens or reveals them on the active desktop"
status: done
parent: 68
phase:
assignee: norman
reporter: norman
due:
points: 3
subsystem:
labels: [wm, desktops]
links: [relates-to EcoSim STORY-0123]
created: 2026-10-26
updated: 2026-10-27T10:00Z
---

## Description

EcoSim (norman, 2026-10-26): a virtual desktop is the configuration of tiles and panels on it; clicking a page in the top nav must open that page on the current desktop, not switch to another desktop that already has it. Today `single: true` makes `findInstance` (wm.js ~364) search every desktop and `_revealAtQuietly` switch there (single_instance_kinds.test.mjs §1 asserts it). Additive: `single: true` keeps its meaning.

## Acceptance criteria

- [x] A taxonomy kind may say `single: 'desktop'`: at most one instance per desktop. `findInstance`/`revealInstance` for it search only the active desktop (its tiles, archived page tabs and the windows it contains); open/navigate/top-nav open it on the active desktop when it has none, and reveal it there when it has one. Copy verbs stay refused within a desktop; deduping on restore and page swaps is per desktop.
- [x] `single: true` is unchanged (app-wide).
- [x] Tests: navigate and the top-nav button on desktop 2 open a second instance there, desktop 1 keeps its own; reload keeps one per desktop; existing single tests pass. docs/components/shell.md and panels-and-desktops.md describe it.

## History

- 2026-10-26 · norman_agent · created (open -> investigation)

- 2026-10-27 · norman_agent · status: investigation -> done (released in 0.17.17 (af30de8): 9a0959f, review fixes 0551271, ecd76d7, cecb9b6 (navigating inside a window looks on the window's own desktop; removing a desktop never closes a window); independent review; suite 219 green)
- 2026-10-27 · norman_agent · assignee: norman_agent -> norman

## Comments
