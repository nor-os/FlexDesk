---
id: 99
type: story
title: "wm.navigate to a kind that is not registered warns once and changes nothing"
status: done
parent: 29
phase:
assignee: norman
reporter: norman
due:
points: 1
subsystem:
labels: [migration, flexdesk]
links: []
created: 2026-10-22
updated: 2026-10-22T13:32Z
---

## Description

EcoSim STORY-0035 criterion 4 needs navigation to an unknown kind to be harmless and visible. Opt-in and generic: no application vocabulary; a consumer that uses none of it sees no change. Document it in a README section headed "(0.17.2)".

norman decided on 2026-10-22 (Claude Code session) that the generic capabilities EcoSim's shell cutover needs are built in FlexDesk first and released as 0.17.2, per his principle that FlexDesk provides every generic UI mode and apps configure it.

## Acceptance criteria

- [x] wm.navigate('no-such-kind') logs exactly one console.warn naming the kind and leaves every tile, tab and the history unchanged
- [x] It returns false; a navigation to a registered kind returns true
- [x] No exception reaches the caller

## History

- 2026-10-22 · norman_agent · status: draft -> refined

- 2026-10-22 · norman_agent · status: refined -> in-progress
- 2026-10-22 · norman_agent · assignee: (none) -> norman_agent
- 2026-10-22 · norman_agent · status: in-progress -> done
- 2026-10-22 · norman_agent · assignee: norman_agent -> norman

## Comments

### 2026-10-22T11:04Z · norman_agent (status: draft -> refined)

Filed and refined on norman's decision (2026-10-22): 3 criteria, 1 points, parented to EPIC-0029, in 0.17.2 (STORY-0103).

### 2026-10-22T13:32Z · norman_agent (status: in-progress -> done)

Done by norman's 2026-10-21 process decision: FlexDesk stories go to done once landed and independently reviewed; this one has landed on main and been independently reviewed.

Built: wm.navigate to a kind with no content factory logs one console.warn naming the kind and returns false, touching no tile, tab, window, desktop, per-tab history or change notification, on every destination (main, origin, new tab, window, split, legacy `target`). A registered kind routes as before and returns true; routing moved unchanged into a private `_route` in src/tiling/wm.js, and navigateUp passes navigate's result back. Note for the reviewer: split destinations used to return the new leaf's id and now return true like the others, as criterion 2 requires; nothing in src or tests used the id and wm.splitLeafWith still returns it (README says so). README section 'A link to a kind nobody registered (0.17.2)'; CHANGELOG left to STORY-0103; no new exports.

Ticked all 3 criteria. Built on branch story-0099 (4f466c9), landed on main, tip 343bc2c.

Tests: new tests/navigate_unknown_kind.test.mjs all ok (45 checks fail without the fix); full suite `node tests/run.mjs` GREEN, 192 suites, no SKIPPED lines; `node build.mjs` exit 0, dist/ restored.
