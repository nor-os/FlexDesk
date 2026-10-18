---
id: 33
type: story
title: "mountNavPanel can be driven from outside, hide its strip and omit its filter per mode"
status: review
parent: 29
phase:
assignee: norman
reporter: norman
due:
points: 3
subsystem: shell
labels: [shell, nav-panel]
links: []
created: 2026-10-17
updated: 2026-10-17T22:48Z
---

## Description

mountNavPanel switches modes only on a strip click and always renders a shared filter. Its handle gains select(modeId) (same lazy mount/activate path, restoring that mode's filter) and active(); options showModeStrip (default true), showFilter and a per-mode filter: false, and initialMode.

Related EcoSim records: EcoSim STORY-0039 (`../EcoSim/backlog/STORY-0039.md`).

Filed from the EcoSim -> FlexDesk 0.16 migration analysis (2026-10-17).

## Acceptance criteria

- [x] select('b') mounts mode b on first use, calls its activate and resolves after activate runs
- [x] select of an unknown id is ignored and returns a resolved promise
- [x] With showModeStrip false no strip is rendered and select still switches panes
- [x] A mode with filter: false hides the filter box while active, and the next mode with a filter shows its own saved text
- [x] Existing callers that pass none of the new options render exactly as before

## History

- 2026-10-17 · norman_agent · status: draft -> refined
- 2026-10-17 · norman_agent · status: refined -> in-progress
- 2026-10-17 · norman_agent · assignee: (none) -> norman_agent
- 2026-10-17 · norman_agent · status: in-progress -> review
- 2026-10-17 · norman_agent · assignee: norman_agent -> norman

## Comments

### 2026-10-17T07:55Z · norman_agent (status: draft -> refined)

Refined: 5 acceptance criteria, 3 points, parented to EPIC-0029. Criteria were drafted from the migration analysis and checked by a coverage and a quality critic; correct them before anything is built against them.

### 2026-10-17T22:48Z · norman_agent (status: in-progress -> review)

Built and landed. All changes are in src/tiling/nav_panel.js, which wm.js re-exports unchanged through `export *`. The README has a new section, "A navigation panel you drive yourself: `mountNavPanel` (0.17.0)". The new suite is tests/nav_panel_select.test.mjs.

- The handle gains `select(modeId)` and `active()`. `select` takes the same path as a strip click (lazy mount, then `activate()`, then that mode's saved filter is restored) and returns a promise that resolves after `activate()` has run. An unknown id does nothing and returns a resolved promise. `active()` returns the current mode id.
- New options: `showModeStrip` (default true), `showFilter` (default true) and `initialMode` (default: the first mode; an unknown id falls back to the first mode).
- A mode can set `filter: false`. While that mode is active the shared filter box is hidden and its pane is never sent a query. The next mode that has a filter gets its own saved text back.
- The filter box's style is only touched when a mode without a filter is involved. With no new options, the version on the old origin/main and the new one produce byte-identical outerHTML, and that output matches the snapshot in the test. The change adds API only: nothing breaks and nothing is app-specific.

Ticked all 5 criteria: select mounts and activates, unknown id ignored, showModeStrip false, filter: false per mode, and existing callers unchanged.

Branch `story-0033`, rebased onto origin/main and fast-forwarded there. Landed tip on main: 1eb315c.

Tests: after the rebase, `node tests/run.mjs` (Linux node) ended "FLEXDESK TESTS: GREEN — 120 suite(s)" with exit 0 and no `: SKIPPED` lines. `node build.mjs` exited 0, and the dist/ changes were thrown away afterwards. App check: this is a library change, so I did not launch an app. Behaviour is covered by the new suite, plus the outerHTML comparison for existing callers.
