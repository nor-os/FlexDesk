---
id: 82
type: story
title: "Canvas editor viewport API, zoom buttons and an optional minimap"
status: done
parent: 73
phase: 
assignee: norman
reporter: norman
due:
points: 3
subsystem: canvas
labels: [flexdesk, modeler]
links: [relates-to 7]
created: 2026-10-17
updated: 2026-10-21T07:42Z
---

## Description

The canvas editor has no viewport API and no zoom controls, and auto-fits on load. The legacy modeler had zoom in/out/reset and a stored viewport. New options `viewport` (start value) and `onViewportChange` (the host stores it; FlexDesk stores nothing), `editor.getViewport()` / `setViewport()`, zoom -/+/100% buttons on the toolbar, and an optional `minimap: true` overview where a click pans the view. STORY-0007 can use the same hook to remember zoom per person. Rules for this story (from EPIC-0073): opt-in through createCanvasEditor options or catalogue types only, so a consumer that sets none of them sees no change in behaviour, DOM or serialise() output; no application vocabulary (tests/flow_kit_vocabulary.test.mjs stays green); no runtime dependencies; nothing stored inside FlexDesk; every edit is a closed-list action, so one gesture is one undo entry in FlowHistory.

## Acceptance criteria

- [x] `load` with `viewport` opens at that scale and position and does not auto-fit
- [x] `onViewportChange` fires once per finished pan or zoom gesture, not per pointer move
- [x] The zoom buttons change scale in fixed steps and stop at the kernel's limits
- [x] With `minimap: true`, clicking the minimap centres the view on that point; without it no minimap is in the DOM

## History

- 2026-10-17 · norman_agent · status: draft -> refined
- 2026-10-18 · norman_agent · status: refined -> in-progress
- 2026-10-18 · norman_agent · assignee:  -> norman_agent
- 2026-10-19 · norman_agent · status: in-progress -> review
- 2026-10-19 · norman_agent · assignee: norman_agent -> norman
- 2026-10-21 · norman_agent · status: review -> done

## Comments

### 2026-10-17T21:20Z · norman_agent (status: draft -> refined)

Refined: 4 acceptance criteria, 3 points, parented to EPIC-0073. Criteria drafted from the legacy modeler (../EcoSim_legacy) and the current canvas editor code, with norman's 2026-10-17 decisions applied; correct them before anything is built against them.

### 2026-10-19T16:39Z · norman_agent (status: in-progress -> review)

Landed on main at 15e73cb, rebased onto origin/main (c1a0ce6) as two commits, ece1f56 and 15e73cb. origin/story-0082 still holds the history from before the rebase (tip fa58a79, with its two merges of main). It was not force-pushed.

What was built, all opt-in through createCanvasEditor options (a consumer that sets none of them sees no change):
- The `viewport` option: `load` opens at that scale and position instead of fitting.
- `onViewportChange`: one report per finished gesture of the reader's. That covers a pan's release, a wheel run once it has been still for WHEEL_SETTLE_MS, a zoom button, Fit, Arrange, a minimap click and Go to it. It never fires per pointer move, and never for what the consumer set itself.
- `editor.getViewport()` / `setViewport()`.
- With `zoomControls`, zoom -, + and 100% buttons on the toolbar. They step the scale in fixed steps and stop at the kernel's limits.
- With `minimap: true`, an overview in the canvas's lower right corner. A click there centres the view on that point. While the minimap is on, a ResizeObserver redraws its frame when the canvas changes size, and `destroy` disconnects it. Without the option, no minimap is in the DOM.
- The README rows, the strings and the CSS (base.css and flexdesk.css) were updated. tests/flow_canvas_viewport.test.mjs covers it, including the resize section (§5).

The rebase had conflicts with STORY-0076 (multiSelect), 0081 (edgeStyle/routing/labels) and 0074 (setCatalogue/bodies), in src/flow/canvas_editor/editor.js and the demo/probe. I kept both sides each time:
- Both doc sections and both option sets.
- The toolbar order is now undo, redo, arrange, fit, zoom buttons, align/distribute, the consumer's verbs.
- setCatalogue and getViewport/setViewport are both kept.
- The public `arrange`/`fit` re-baseline the viewport, and align/distribute are kept.
- The edge paint fills the label layer and then repaints the minimap.
- The demo's `window.__flowCanvas` exposes the types/catalogue and the `views` counter.
- The probe's many, bodies and viewport sections all run, and the screenshots are renumbered 5 to 8.

Ticked: all four criteria.
- `load` with `viewport`.
- `onViewportChange` once per finished gesture.
- The zoom buttons' fixed steps and limits.
- The minimap click centring, and no minimap without the option.

Tests on the rebased tip: `node tests/run.mjs` with Linux node v18.19.1 finished GREEN, 158 suites, exit 0, with no ': SKIPPED' line. `node build.mjs` exits 0, and dist/ was restored and cleaned, not committed.

App check: `demo/flow_canvas_probe.mjs` run with Windows node in headless Edge on the rebased tip printed 'every check held'. That includes the zoom buttons' layout checks, the minimap's placement and its cover over a step, a real minimap click (centred, same scale, one viewport report), a real Zoom out, and the minimap frame following a resize to 700px. Alongside these, the many and bodies checks from main held too.

### 2026-10-21T07:42Z · norman_agent (status: review -> done)

norman decided on 2026-10-21 (Claude Code session) to release FlexDesk 0.17.0 now and to accept every story on the 0.17.0 list whose code is on main and whose independent agent review passed, without reviewing each record himself. Its code is on main (audited), so it is done and ships in 0.17.0.
