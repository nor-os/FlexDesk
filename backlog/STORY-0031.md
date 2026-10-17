---
id: 31
type: story
title: "Embedders can disable or rebind built-in WM chords, and the help shortcut is installed by the shell"
status: in-progress
parent: 29
phase:
assignee: norman_agent
reporter: norman
due:
points: 5
subsystem: shell
labels: [shell, keymap]
links: []
created: 2026-10-17
updated: 2026-10-17T17:20Z
---

## Description

installKeymap hard-binds F1-F8, Backspace (navigateBack), Ctrl/Shift+Arrows, Ctrl+Tab and suppresses bare Alt+letter; importing the help module adds an unremovable '?' listener. createShell gains keymap: {bindings: {chord: action | false | fn}}, the handler skips events already defaultPrevented, the help shortcut is installed by the shell with a disposer, and the shortcuts help reflects effective bindings.

Related EcoSim records: EcoSim STORY-0034 (`../EcoSim/backlog/STORY-0034.md`).

Filed from the EcoSim -> FlexDesk 0.16 migration analysis (2026-10-17).

## Acceptance criteria

- [ ] With bindings {'F1': false}, pressing F1 reaches the app's own handler and no top-nav button is clicked
- [ ] With bindings {'F2': 'nav:0'}, F2 opens the first top-nav kind
- [ ] With bindings {'Backspace': false}, Backspace outside inputs never calls navigateBack
- [ ] A component that calls preventDefault on Backspace keeps its own behaviour and the WM does not navigate back
- [ ] Importing the help module installs no document listener, and shell.dispose() removes the '?' shortcut
- [ ] An unknown chord id in bindings is reported once with a warning and ignored

## History

- 2026-10-17 · norman_agent · status: draft -> refined
- 2026-10-17 · norman_agent · status: refined -> in-progress
- 2026-10-17 · norman_agent · assignee:  -> norman_agent

## Comments

### 2026-10-17T07:55Z · norman_agent (status: draft -> refined)

Refined: 6 acceptance criteria, 5 points, parented to EPIC-0029. Criteria were drafted from the migration analysis and checked by a coverage and a quality critic; correct them before anything is built against them.
