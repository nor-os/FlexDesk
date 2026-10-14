---
id: 18
type: story
title: "A bottom-panel tab host with badges, for any embedder"
status: review
parent: 17
phase:
assignee: norman
reporter: norman
points: 5
subsystem: tiling
labels: [bottom-panel, additive]
links: []
created: 2026-10-14
updated: 2026-10-14T14:57Z
---

## Description

Merge the two tab strips into `src/tiling/bottom_panel_tabs.js`: panes `{id, label, mount(el, store)}` returning
`{onShow, persist, destroy}`; `select(id)`, `setBadge(id, count, level)`, the last tab remembered through a storage
adapter, and a `bottompanel:show {tab}` bus event that opens the panel on a tab. On the existing `.twm-bp*` CSS.

## Acceptance criteria

- [x] An embedder can mount panes into the bottom panel and gets a tab strip, the same markup as today's .twm-bp CSS
- [x] setBadge shows a count on a tab, coloured by level, and removes it at zero
- [x] Emitting bottompanel:show opens the panel on the named tab
- [x] The last tab survives a reload through the storage adapter the embedder passes
- [x] tests/run.mjs green, build --check OK, released to npm

## History

- 2026-10-14 · norman_agent · status: draft -> refined
- 2026-10-14 · norman_agent · status: refined -> in-progress
- 2026-10-14 · norman_agent · assignee: (none) -> norman_agent
- 2026-10-14 · norman_agent · status: in-progress -> review
- 2026-10-14 · norman_agent · assignee: norman_agent -> norman

## Comments

### 2026-10-14T09:50Z · norman_agent

Refined: 5 acceptance criteria, 5 points, parented to 17. Filed from the product owner's 2026-10-14 vision (notifications only from workflows; a notification area with history, shared through FlexDesk).

### 2026-10-14T14:57Z · norman_agent

Built in `e4586d8` and `2dd6753`: `createBottomPanelTabs` (`src/tiling/bottom_panel_tabs.js`, exported from `wm`).
It merges bugdesk's strip (`../bugdesk/ui/js/ticketdesk/pages.js`: badges, `bottompanel:show`) and Tables'
(`../Tables/web/js/bottom_panel.js`: a store per pane, lazy mounts, `instance`, `persist`/`destroy`, and the rule
that a caller's choice beats the remembered tab when the read answers late). Panes may be `eager` so a count is
right before the tab is opened. Adds `.twm-bp__badge` with info/warning/alert colours from tokens.

One reading of criterion 3 to check: `bottompanel:show` SELECTS the tab. Whether the panel itself is open is the
embedder's (in Tables it is a tile the shell toggles), so the embedder hears the same event to open it.

Found in headless Edge, not in jsdom: a pane mounted inside the constructor call (`eager`, or the first tab) that
reaches the host through the variable being assigned throws, and that killed the whole strip. A pane that throws
is now one empty tab; the README says to use `mount`'s `api` argument.

`tests/bottom_panel_tabs.test.mjs`. `tests/run.mjs` GREEN, `build --check` OK.

Released as 0.14.0 (`10b1ebd`, npm `flexdesk@0.14.0`).

Handing back to norman for review.
