---
id: 18
type: story
title: "A bottom-panel tab host with badges, for any embedder"
status: in-progress
parent: 17
phase:
assignee: norman_agent
reporter: norman
points: 5
subsystem: tiling
labels: [bottom-panel, additive]
links: []
created: 2026-10-14
updated: 2026-10-14T14:27Z
---

## Description

Merge the two tab strips into `src/tiling/bottom_panel_tabs.js`: panes `{id, label, mount(el, store)}` returning
`{onShow, persist, destroy}`; `select(id)`, `setBadge(id, count, level)`, the last tab remembered through a storage
adapter, and a `bottompanel:show {tab}` bus event that opens the panel on a tab. On the existing `.twm-bp*` CSS.

## Acceptance criteria

- [ ] An embedder can mount panes into the bottom panel and gets a tab strip, the same markup as today's .twm-bp CSS
- [ ] setBadge shows a count on a tab, coloured by level, and removes it at zero
- [ ] Emitting bottompanel:show opens the panel on the named tab
- [ ] The last tab survives a reload through the storage adapter the embedder passes
- [ ] tests/run.mjs green, build --check OK, released to npm

## History

- 2026-10-14 · norman_agent · status: draft -> refined
- 2026-10-14 · norman_agent · status: refined -> in-progress
- 2026-10-14 · norman_agent · assignee: (none) -> norman_agent

## Comments

### 2026-10-14T09:50Z · norman_agent

Refined: 5 acceptance criteria, 5 points, parented to 17. Filed from the product owner's 2026-10-14 vision (notifications only from workflows; a notification area with history, shared through FlexDesk).
