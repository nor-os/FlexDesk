---
id: 32
type: story
title: "A taxonomy kind can be single-instance: opening it reveals the one that exists"
status: review
parent: 29
phase:
assignee: norman
reporter: norman
due:
points: 5
subsystem: shell
labels: [shell, taxonomy]
links: []
created: 2026-10-17
updated: 2026-10-18T03:04Z
---

## Description

Some content holds heavy app-wide state and must exist once. createTaxonomy accepts single: true (optionally keyed by a prop). Every open path reveals the existing instance (switching desktop, activating tab, raising window); copy verbs (Open a copy in a window, Open in new tab, Alt+T/N, Alt+Shift+H/V, palette split/window modes) are disabled with a reason for that kind; move verbs still work; restoring a layout with duplicates keeps the first.

Related EcoSim records: EcoSim STORY-0034 (`../EcoSim/backlog/STORY-0034.md`).

Filed from the EcoSim -> FlexDesk 0.16 migration analysis (2026-10-17).

## Acceptance criteria

- [x] Navigating to a single kind open on another desktop switches to that desktop and focuses it with no second mount
- [x] The tile menu shows 'Open a copy in a window' greyed with a tooltip for a single kind
- [x] Alt+T on a single kind's tile opens no new tab
- [x] Floating the single instance into a window and docking it back keeps one instance
- [x] A persisted layout with two instances restores with one, and the other leaf shows its next tab or closes

## History

- 2026-10-17 · norman_agent · status: draft -> refined
- 2026-10-17 · norman_agent · status: refined -> in-progress
- 2026-10-17 · norman_agent · assignee: (none) -> norman_agent
- 2026-10-18 · norman_agent · status: in-progress -> review
- 2026-10-18 · norman_agent · assignee: norman_agent -> norman

## Comments

### 2026-10-17T07:55Z · norman_agent (status: draft -> refined)

Refined: 5 acceptance criteria, 5 points, parented to EPIC-0029. Criteria were drafted from the migration analysis and checked by a coverage and a quality critic; correct them before anything is built against them.

### 2026-10-18T03:04Z · norman_agent (status: in-progress -> review)

Built and landed. createTaxonomy accepts `single: true` (optionally keyed by a prop); every open path in the window manager reveals the existing instance (switching desktop, activating the tab, raising the window); the copy verbs (tile menu "Open a copy in a window", Open in new tab, Alt+T/N, Alt+Shift+H/V, palette split/window modes) are disabled with a reason for a single kind; move verbs still work; a page/layout restore with duplicates keeps the first. This last round (reviewer fixes) made `wm.js`, `command_palette.js` and `shell.js` call the taxonomy's `instanceKey`/`isSingle` directly, with no optional-call fallback.

Ticked all 5 criteria: switching desktop and focusing with no second mount; greyed "Open a copy in a window" with tooltip; Alt+T opens no new tab; float and dock back keeps one instance; a persisted layout with two instances restores with one, the other leaf showing its next tab or closing. All are covered by `tests/single_instance_kinds.test.mjs` §0-§8.

Branch `story-0032`, rebased onto origin/main and fast-forwarded to main: landed tip on main is `53c606c`. The rebased branch was not force-pushed (that push was refused here), so origin/story-0032 still points at the pre-rebase tip `434fec6`, which has the same content.

Tests: `node tests/run.mjs` (Linux node) on the rebased tip ends "FLEXDESK TESTS: GREEN — 135 suite(s)", exit 0, 0 lines with ': SKIPPED'; `node tests/single_instance_kinds.test.mjs` prints "all assertions passed"; `node build.mjs` exits 0 (dist/ restored, not committed). App check: no interactive run of the app was done; verification is the test suites above.
