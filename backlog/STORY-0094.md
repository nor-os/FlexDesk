---
id: 94
type: story
title: "Managed tiles: a tile grid always seeds them, and Reset brings removed ones back"
status: in-progress
parent: 29
phase:
assignee: norman_agent
reporter: norman
due:
points: 3
subsystem: tiles
labels: [tiles, layout]
links: []
created: 2026-10-21
updated: 2026-10-21T07:30Z
---

## Description

AI Desk (`../aidesk`, STORY-0181, `../aidesk/backlog/STORY-0181.md`) puts one terminal tile per seat on a `@flexdesk/tiles` grid. norman (2026-10-21): "size / order adjustments are persisted. closing a window would not be though - they would be auto-recreated." Today a removed tile is gone from the saved layout. A grid needs a set of managed tiles that the embedder declares (for example one per seat): the grid always seeds them, a removed one is hidden rather than deleted, and Reset or a new seed brings it back while keeping the saved sizes and order of the others. Generic: any embedder whose tiles mirror a list of entities can use it.

## Acceptance criteria

- [ ] An embedder declares managed tiles (id, widget, config) on a grid; a grid opened with a saved layout shows every managed tile, placing new ones after the saved ones
- [ ] Removing a managed tile hides it; it is not seeded again until Reset or until the embedder seeds again
- [ ] Reset brings back every managed tile and keeps the saved sizes and order of the tiles that were never removed
- [ ] When the embedder drops an id from the managed set, its tile goes away and its saved position is forgotten
- [ ] Grids without managed tiles behave exactly as today (existing layout persistence tests pass unchanged)

## History

- 2026-10-21 · norman_agent · filed as draft
- 2026-10-21 · norman_agent · status: draft -> refined
- 2026-10-21 · norman_agent · status: refined -> in-progress
- 2026-10-21 · norman_agent · assignee -> norman_agent

## Comments

### 2026-10-21T07:19Z · norman_agent

Refined: 5 acceptance criteria, 3 points, parented to EPIC-0029. Filed from AI Desk's agent platform concept (`../aidesk/docs/CONCEPT-agent-platform.md`), norman's decisions of 2026-10-21.
