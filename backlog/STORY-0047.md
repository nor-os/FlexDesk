---
id: 47
type: story
title: "A wizard with step indicator, Back/Next/Finish and per-step gating"
status: refined
parent: 40
phase:
assignee:
reporter: norman
due:
points: 5
subsystem: widgets
labels: [widgets, new-component]
links: []
created: 2026-10-17
updated: 2026-10-17T07:55Z
---

## Description

Multi-step flows (imports, guided setups) are hand-built by every embedder. A Wizard takes steps {id, label, icon, render(bodyEl, ctx), canAdvance(ctx) -> {ok, hint}}, draws done/current/upcoming/error states joined by a connector (done steps clickable), a body slot and a footer; revalidate(), goTo/next/back/setStepState, async finish with busy state, cancel; mountable inline or in a window; transitions through the core StateMachine.

Related EcoSim records: EcoSim STORY-0091 (`../EcoSim/backlog/STORY-0091.md`); EcoSim STORY-0094 (`../EcoSim/backlog/STORY-0094.md`); EcoSim STORY-0098 (`../EcoSim/backlog/STORY-0098.md`).

Filed from the EcoSim -> FlexDesk 0.16 migration analysis (2026-10-17).

## Acceptance criteria

- [ ] Next is disabled and shows the hint while canAdvance returns {ok:false}
- [ ] revalidate() after input changes enables Next without re-rendering the body
- [ ] Clicking a done step jumps back; clicking an upcoming step does nothing
- [ ] An async finish disables the buttons until it settles
- [ ] A rejected finish marks the current step as error and shows the message
- [ ] Cancel closes the wizard and calls onCancel exactly once

## History

- 2026-10-17 · norman_agent · status: draft -> refined

## Comments

### 2026-10-17T07:55Z · norman_agent (status: draft -> refined)

Refined: 6 acceptance criteria, 5 points, parented to EPIC-0040. Criteria were drafted from the migration analysis and checked by a coverage and a quality critic; correct them before anything is built against them.
