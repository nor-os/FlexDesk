---
id: 100
type: story
title: "Command palette rows can be drawn disabled with a reason"
status: done
parent: 29
phase:
assignee: norman
reporter: norman
due:
points: 2
subsystem:
labels: [migration, flexdesk]
links: []
created: 2026-10-22
updated: 2026-10-22T13:32Z
---

## Description

EcoSim STORY-0038 criterion 5: a command whose enabled() is false is listed greyed and does nothing when picked. FlexDesk 0.17.1's palette cannot draw a disabled row. Opt-in and generic: no application vocabulary; a consumer that uses none of it sees no change. Document it in a README section headed "(0.17.2)".

norman decided on 2026-10-22 (Claude Code session) that the generic capabilities EcoSim's shell cutover needs are built in FlexDesk first and released as 0.17.2, per his principle that FlexDesk provides every generic UI mode and apps configure it.

## Acceptance criteria

- [x] A command with `enabled: () => false` is listed with the disabled class and aria-disabled="true"
- [x] Picking it (click or Enter) runs nothing and keeps the palette open
- [x] An optional `disabledReason` is shown as the row's tooltip
- [x] Arrow-key navigation still moves over the disabled row
- [x] Commands without `enabled` behave exactly as before

## History

- 2026-10-22 · norman_agent · status: draft -> refined

- 2026-10-22 · norman_agent · status: refined -> in-progress
- 2026-10-22 · norman_agent · assignee: (none) -> norman_agent
- 2026-10-22 · norman_agent · status: in-progress -> done
- 2026-10-22 · norman_agent · assignee: norman_agent -> norman

## Comments

### 2026-10-22T11:04Z · norman_agent (status: draft -> refined)

Filed and refined on norman's decision (2026-10-22): 5 criteria, 2 points, parented to EPIC-0029, in 0.17.2 (STORY-0103).

### 2026-10-22T13:32Z · norman_agent (status: in-progress -> done)

Done by norman's 2026-10-21 process decision (landed and independently reviewed). Built: palette rows take an optional `enabled: () => boolean` and `disabledReason`; a row whose `enabled()` is false is listed with `.twm-cmdpal__item--disabled` and aria-disabled="true", the reason as its tooltip, and picking it (click or Enter) runs nothing and keeps the palette open. `enabled()` is re-asked on every draw and pick; one that throws counts as false (console.warn). Works in flat and grouped layouts; `createShell` palette rows get it too. README section "A palette row drawn disabled, with a reason (0.17.2)"; CHANGELOG left for the 0.17.2 release story (STORY-0103).

Ticked: all 5 criteria. Landed on main, tip 6790a23 (developed on story-0100).

Tests: new tests/command_palette_disabled.test.mjs passes, and fails against the old source; full suite `node tests/run.mjs` GREEN, 192 suites, no skips; `node build.mjs` exit 0.
