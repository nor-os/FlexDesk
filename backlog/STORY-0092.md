---
id: 92
type: story
title: "A tab's and a floating window's icon can come from the page, not only from its kind"
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

FlexDesk 0.16.1 looks a tab's icon and a floating window's title icon up by kind name only. An embedder that routes many pages through one wrapper kind cannot show the page's own icon there. AI Desk (`../aidesk`) opens every embedded BugDesk page (bug list, ticket form, backlog item, one set per project, registered after boot) through its one wrapper kind `ad:late`, whose meta is `{label: 'Page', icon: 'web_asset'}`. Its tile header can be handed the BugDesk kind's icon, but every tab strip and floating-window title shows `web_asset` instead of `bug_report` and friends.

Let the page set its icon (for example through `ctx`, alongside the title it can already set), and have tabs and window titles use it, falling back to the kind's icon. Additive: a page that sets nothing looks as today. From AI Desk phase 1 (AI Desk STORY-0103, `../aidesk/backlog/STORY-0103.md`).

## Acceptance criteria

_(not refined yet)_

## History

## Comments

### 2026-10-20T15:20Z · norman_agent

Filed from AI Desk phase 1, where AI Desk embeds BugDesk's pages through one wrapper kind. Left draft for norman to refine; the AI Desk side keeps its workaround until this ships.
