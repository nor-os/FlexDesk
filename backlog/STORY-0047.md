---
id: 47
type: story
title: "A wizard with step indicator, Back/Next/Finish and per-step gating"
status: review
parent: 40
phase:
assignee: norman
reporter: norman
due:
points: 5
subsystem: widgets
labels: [widgets, new-component]
links: []
created: 2026-10-17
updated: 2026-10-18T01:56Z
---

## Description

Multi-step flows (imports, guided setups) are hand-built by every embedder. A Wizard takes steps {id, label, icon, render(bodyEl, ctx), canAdvance(ctx) -> {ok, hint}}, draws done/current/upcoming/error states joined by a connector (done steps clickable), a body slot and a footer; revalidate(), goTo/next/back/setStepState, async finish with busy state, cancel; mountable inline or in a window; transitions through the core StateMachine.

Related EcoSim records: EcoSim STORY-0091 (`../EcoSim/backlog/STORY-0091.md`); EcoSim STORY-0094 (`../EcoSim/backlog/STORY-0094.md`); EcoSim STORY-0098 (`../EcoSim/backlog/STORY-0098.md`).

Filed from the EcoSim -> FlexDesk 0.16 migration analysis (2026-10-17).

## Acceptance criteria

- [x] Next is disabled and shows the hint while canAdvance returns {ok:false}
- [x] revalidate() after input changes enables Next without re-rendering the body
- [x] Clicking a done step jumps back; clicking an upcoming step does nothing
- [x] An async finish disables the buttons until it settles
- [x] A rejected finish marks the current step as error and shows the message
- [x] Cancel closes the wizard and calls onCancel exactly once

## History

- 2026-10-17 · norman_agent · status: draft -> refined
- 2026-10-17 · norman_agent · status: refined -> in-progress
- 2026-10-17 · norman_agent · assignee: (none) -> norman_agent
- 2026-10-18 · norman_agent · status: in-progress -> review
- 2026-10-18 · norman_agent · assignee: norman_agent -> norman

## Comments

### 2026-10-17T07:55Z · norman_agent (status: draft -> refined)

Refined: 6 acceptance criteria, 5 points, parented to EPIC-0040. Criteria were drafted from the migration analysis and checked by a coverage and a quality critic; correct them before anything is built against them.

### 2026-10-18T01:56Z · norman_agent (status: in-progress -> review)

Built `Wizard` (src/ui/components/wizard.js, exported from `@flexdesk/widgets`): a step indicator drawn done / current / upcoming / error and joined by a connector, a body slot and a footer with Cancel, Back and Next (Finish on the last step). It mounts inline with `mount(el)` or in a modal `ManagedWindow` with `openInWindow(...)`, and every transition goes through the core `StateMachine`. `canAdvance(ctx)` gates Next and shows its hint, and `revalidate()` redraws only the indicator and the footer, never the body. A done step jumps back, and an upcoming step is inert. An async `onFinish` disables every button until it settles, and a rejection marks the step as error and shows the message. Cancel (button, `cancel()`, the window close or Escape) calls `onCancel` exactly once. A step's `render` may return a cleanup function, which runs when the step is left and on `dispose()`. The README has an "A step wizard" section, and the styles are in `css/flexdesk.css` (WIZARD block). Review fixes: the cleanup is a function only, and the dead `#stepsEl` field is gone.

Ticked all 6 criteria: Next disabled with the hint while canAdvance is {ok:false}; revalidate() enables Next without re-rendering the body; done step jumps back, upcoming step does nothing; async finish disables the buttons until it settles; rejected finish marks the step as error and shows the message; Cancel closes and calls onCancel exactly once. tests/wizard.test.mjs covers each of them.

Branch `story-0047`, rebased onto origin/main and landed fast-forward on main at e5aadc8. The rebase had conflicts in README.md, css/flexdesk.css and widgets.js, all from both sides adding entries (ToggleField / tag input / document outline from main, Wizard from this branch). I kept both sides, and the widgets.js barrel header now counts 45 modules.

Tests after the rebase: `node tests/run.mjs` (Linux node v18.19.1), exit 0, "FLEXDESK TESTS: GREEN — 131 suite(s)", 0 lines with ": SKIPPED". `node build.mjs` exit 0, and dist/ was restored afterwards, so no dist changes were committed. App check: not run. This is a library component, so it is covered by the jsdom tests and the build, and no app was launched.
