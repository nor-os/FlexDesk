---
id: 72
type: story
title: "List and people tiles, and one scope every tile on a board follows"
status: review
parent: 21
phase:
assignee: norman
reporter: norman
due:
points: 3
subsystem: tiles
labels: [dashboards, tiles, additive]
links: [relates-to 22]
created: 2026-10-17
updated: 2026-10-17T11:20Z
---

## Description

BugDesk's Tracker home becomes a standard dashboard (BugDesk STORY-0047,
`../bugdesk/backlog/STORY-0047.md`). What it shows needs more than charts and
KPIs: lists of records (what is late, what falls due this week), who has what,
and one "Everyone / Assigned by me / Out with others" switch that every tile on
the board follows. None of that is BugDesk-specific, so it belongs next to
`flexdesk.chart` and `flexdesk.kpi` (norman, 2026-10-17):

- `flexdesk.list`: rows the embedder supplies, with a count, an empty line, a
  bar button, click / keyboard activation and a right-click menu per row
- `flexdesk.people`: one row per person, with a count and pills
- `createScopePicker` and `TileGrid.setScope`: a board-wide scope handed to
  every tile

What the rows ARE (which records, in what order, what a menu entry does) stays
the embedder's.

## Acceptance criteria

- [x] `registerListTiles()` registers `flexdesk.list` and `flexdesk.people`, idempotently, and nothing registers at import
- [x] A list tile draws the rows it is handed (icon, lead, title, cells with a tone or the embedder's class), says "n of m" when it shows fewer, and keeps its bar and an empty line for an empty list
- [x] Click, Enter and Space call `onRowActivate` with the event; Up/Down/Home/End move between rows; the bar's button calls `onAction`
- [x] Right-click, the context-menu key and Shift+F10 show the row's menu from `rowMenu`, and the choice reaches `onRowMenuAction`
- [x] A people tile draws one row per person with a count, pills and a muted "nobody" row; `groupByPerson` groups items most first
- [x] `createScopePicker` presses one button, calls `onChange` only on a change, and `setValue` presses without calling
- [x] `TileGrid.setScope` hands the scope to every tile (`tile.scope`, `onScopeChange`), to tiles added later and to the grid's `onScopeChange`, reloads a data-source grid, and is not part of the layout
- [x] Covered by `tests/list_tiles.test.mjs`; released in 0.16.1 and documented in the README

## History

- 2026-10-17 · norman_agent · status: draft -> in-progress
- 2026-10-17 · norman_agent · assignee: (unset) -> norman_agent
- 2026-10-17 · norman_agent · status: in-progress -> review
- 2026-10-17 · norman_agent · assignee: norman_agent -> norman

## Comments

### 2026-10-17T11:20Z · norman_agent

Filed, built and released in one go for BugDesk STORY-0047, as norman asked
(the tiles are generic, so upstream; publishing approved for this run).

`src/tiles/list_tiles.js` (`ListTile`, `PeopleTile`, `groupByPerson`,
`registerListTiles`), `src/tiles/scope_picker.js` (`createScopePicker`), and
`TileGrid` gains `scope` / `onScopeChange` / `setScope()`, `TileBase` gains
`scope` and an `onScopeChange()` hook. Both new modules are in the tiles
barrel; the CSS is in `css/flexdesk.css`. `tests/list_tiles.test.mjs`: 73
assertions over jsdom, every other suite still green.

Released as **0.16.1**, not 0.17.0: STORY-0069 reserves 0.17.0 for the one
release that carries the EcoSim-migration fixes now in flight on their bug
branches, and this change is purely additive (like `ctx.setTitle` in 0.12.1).
