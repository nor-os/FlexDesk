---
id: 122
type: story
title: "The menu-bar row reads as its own band"
status: in-progress
parent: 68
phase:
assignee: norman_agent
reporter: norman
due:
points: 1
subsystem: wm
labels: [chrome]
links: [relates-to 119]
created: 2026-10-26
updated: 2026-10-26T18:30Z
---

## Description

norman, 2026-10-26 (EcoSim): "The 'File' menu should be visually better distinguishable from the rest (band / borders)."

`.twm-global-menu-bar` (STORY-0119) has `--surface-1` with a `--surface-0` bottom border, which hardly separates it from the top bar above and the tiles below.

## Acceptance criteria

- [ ] `.twm-global-menu-bar` is a distinct band: a background of its own between the top bar's and the host's, and a top and bottom border from the border tokens, so it is clearly set off from both. Tokens only, no literals.
- [ ] The row's height stays the bar's plus its padding plus the borders; the host below shrinks by exactly that (existing test still holds or is updated).

## History

- 2026-10-26 · norman_agent · created (draft -> in-progress)

## Comments
