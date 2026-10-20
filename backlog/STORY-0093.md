---
id: 93
type: story
title: "A public 'return to the open list' for wrapper kinds"
status: draft
parent: 29
phase:
assignee:
reporter: norman
due:
points:
subsystem: tiling
labels: [tiling, additive, aidesk-consumer]
links: []
created: 2026-10-20
updated: 2026-10-20T15:20Z
---

## Description

BugDesk's section crumbs ('Bugs', 'Backlog') close a record onto the nearest open list of the same section, through the WindowManager's back-to-open-list behaviour. That behaviour matches on kind names, so it cannot see through a wrapper kind: in AI Desk (`../aidesk`) every embedded BugDesk page is the wrapper `ad:late`, so the stock behaviour finds no open list. AI Desk works around it by calling FlexDesk 0.16.1's internal scope and tab-action methods, feature-detected, with an in-place fallback when they are missing (AI Desk `ui/js/bugdesk/routed_wm.js`).

Offer a public API for it: given a tile or window and a predicate (or a resolver that maps a wrapped tab to its real kind), return to the nearest open matching tab, or report that none is open. Then hosts need no internals, and the workaround can go. From AI Desk phase 1 (AI Desk STORY-0103, `../aidesk/backlog/STORY-0103.md`).

## Acceptance criteria

_(not refined yet)_

## History

## Comments

### 2026-10-20T15:20Z · norman_agent

Filed from AI Desk phase 1, where AI Desk embeds BugDesk's pages through one wrapper kind. Left draft for norman to refine; the AI Desk side keeps its workaround until this ships.
