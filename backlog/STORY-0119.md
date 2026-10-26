---
id: 119
type: story
title: "A shell's menu bar can sit in its own full-width row under the top bar"
status: done
parent: 68
phase:
assignee: norman
reporter: norman
due:
points: 2
subsystem: tiling
labels: [migration, chrome]
links: []
created: 2026-10-26
updated: 2026-10-26T16:30Z
---

## Description

norman wants EcoSim's File / Edit / View / Run / Tools / Help menu bar as a second line under the header (EcoSim STORY-0114). FlexDesk 0.17.12 styles the bar itself (`.twm-menubar`) and a single-row `.twm-global-top-bar` (35px), but has no layout for a menu-bar row: no class, no token, no example. An embedder would have to style its own row, which FlexDesk-first rules out.

## Acceptance criteria

- [x] flexdesk.css has a documented row for a shell's menu bar (e.g. `.twm-global-menu-bar`): a full-width strip directly under `.twm-global-top-bar` in `body.twm-body`'s layout, on FlexDesk tokens (height, background, border, padding), holding the `chrome.menuBar` element. The host area below shrinks by its height, so nothing overlaps.
- [x] The row is not part of the top bar, so a window-drag region bound to `chrome.topBar` does not include it, and its menus open and take clicks normally.
- [x] docs/components/menus.md shows the markup under a section headed "(0.17.13)": the top bar, then the menu row with `chrome.menuBar` in it, then the host.
- [x] A test loads the stylesheet in jsdom and checks the row's layout rules and that it is a sibling after the top bar, not inside it. No export or option is removed or renamed.

## History

- 2026-10-26 · norman_agent · status: refined -> in-progress
- 2026-10-26 · norman_agent · status: in-progress -> done
- 2026-10-26 · norman_agent · assignee: norman_agent -> norman

## Comments

### 2026-10-26T15:40Z · norman_agent

Filed from EcoSim STORY-0114's build, which found the gap (its criterion says to report a missing FlexDesk layout rather than style one in EcoSim). Claimed for 0.17.13.

### 2026-10-26T16:30Z · norman_agent (status: in-progress -> done)

On main as da78452 and released in 0.17.13 (b0cb7d1). Independently reviewed and approved. `.twm-global-menu-bar` is a full-width strip on tokens, placed between the top bar and the host in body.twm-body's flex column, and it is outside the top-bar drag region. ManagedWindow's new _topInset() keeps body windows (clamp, centre, maximise, snap) below the row. Test: tests/menu_row_layout.test.mjs. One review note was settled in the docs: a modal's backdrop starts below the top bar, so the row stays usable while a modal is open, as the top bar does. Minor note left as is: _topInset() measures the row on every resize move, which only happens when a row exists. Full suite: 206 suites green.
