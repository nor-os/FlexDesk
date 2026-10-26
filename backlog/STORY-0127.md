---
id: 127
type: story
title: "A content kind can live in a window only, with its own window size"
status: done
parent: 68
phase:
assignee: norman
reporter: norman
due:
points: 2
subsystem: wm
labels: [windows]
links: []
created: 2026-10-27
updated: 2026-10-27T05:00Z
---

## Description

EcoSim STORY-0120 (norman, 2026-10-26: Parameter Estimation "in a window - like impulse response") opens its content with `wm.navigate(kind, {}, { dest: 'window' })`. The window opens at ManagedWindow's default 600px (the old tool window was 1100x700) because neither the kind nor navigate can say a window size, and a saved layout that still holds a tile of that kind restores it as a tile (and navigate then reveals that tile instead of opening a window).

## Acceptance criteria

- [x] A taxonomy kind can declare `window: { width, height }` (initial size of a window it opens in, clamped to the screen as ManagedWindow does) and `windowOnly: true`.
- [x] A `windowOnly` kind always opens in a window (navigate with any dest), is never mounted in a tile: a restored layout drops a tile/tab of that kind (the rest of the layout stays), with one warning.
- [x] Additive: kinds without these keys behave as before. Tests; docs.

## History

- 2026-10-27 · norman_agent · created (draft -> in-progress)

- 2026-10-27 · norman_agent · status: in-progress -> done (released in 0.17.16 (e7f52bf, review fixes 50b658b); independent review, one fix round)
- 2026-10-27 · norman_agent · assignee: norman_agent -> norman

## Comments
