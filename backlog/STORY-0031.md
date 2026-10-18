---
id: 31
type: story
title: "Embedders can disable or rebind built-in WM chords, and the help shortcut is installed by the shell"
status: review
parent: 29
phase:
assignee: norman
reporter: norman
due:
points: 5
subsystem: shell
labels: [shell, keymap]
links: []
created: 2026-10-17
updated: 2026-10-17T23:13Z
---

## Description

installKeymap hard-binds F1-F8, Backspace (navigateBack), Ctrl/Shift+Arrows, Ctrl+Tab and suppresses bare Alt+letter; importing the help module adds an unremovable '?' listener. createShell gains keymap: {bindings: {chord: action | false | fn}}, the handler skips events already defaultPrevented, the help shortcut is installed by the shell with a disposer, and the shortcuts help reflects effective bindings.

Related EcoSim records: EcoSim STORY-0034 (`../EcoSim/backlog/STORY-0034.md`).

Filed from the EcoSim -> FlexDesk 0.16 migration analysis (2026-10-17).

## Acceptance criteria

- [x] With bindings {'F1': false}, pressing F1 reaches the app's own handler and no top-nav button is clicked
- [x] With bindings {'F2': 'nav:0'}, F2 opens the first top-nav kind
- [x] With bindings {'Backspace': false}, Backspace outside inputs never calls navigateBack
- [x] A component that calls preventDefault on Backspace keeps its own behaviour and the WM does not navigate back
- [x] Importing the help module installs no document listener, and shell.dispose() removes the '?' shortcut
- [x] An unknown chord id in bindings is reported once with a warning and ignored

## History

- 2026-10-17 · norman_agent · status: draft -> refined
- 2026-10-17 · norman_agent · status: refined -> in-progress
- 2026-10-17 · norman_agent · assignee:  -> norman_agent
- 2026-10-17 · norman_agent · status: in-progress -> review
- 2026-10-17 · norman_agent · assignee: norman_agent -> norman

## Comments

### 2026-10-17T07:55Z · norman_agent (status: draft -> refined)

Refined: 6 acceptance criteria, 5 points, parented to EPIC-0029. Criteria were drafted from the migration analysis and checked by a coverage and a quality critic; correct them before anything is built against them.

### 2026-10-17T23:13Z · norman_agent (status: in-progress -> review)

Built: createShell({keymap: {bindings}}) lets an embedder disable a WM chord (false), rebind it to an action id (e.g. 'nav:0') or a function. The keymap skips events that are already defaultPrevented. An unknown chord id gives one warning and is ignored. The '?' help shortcut is no longer installed when the help module is imported: the shell installs it and shell.dispose() removes it. The shortcuts help and the command palette hint show the bindings that are in effect (with help moved to F9, the hint says "(F9)"). After review, the default keymap matches key presses as loosely as 0.16 did. A sweep test compares 5632 key presses against 0.16's own keymap and they all match. createShell also throws a TypeError for a keymap that is not { bindings }. The README 0.17.0 keymap section and the createShell JSDoc describe all of this. No exports were added or renamed.

Ticked all 6 criteria: F1:false hands F1 to the app; F2:'nav:0' opens the first top-nav kind; Backspace:false never calls navigateBack; a component that calls preventDefault on Backspace keeps its own behaviour; importing help installs no listener and dispose() removes '?'; an unknown chord id warns once and is ignored. Each one is covered in tests/keymap_bindings.test.mjs.

Branch: story-0031, rebased onto origin/main and landed on main by fast-forward. Tip on main is 6d8cf68 (6d8cf683b7d55e862c97cded6c87f2011b1e604c), and origin/story-0031 is the same commit.

Tests: `node tests/run.mjs` (/usr/bin/node) at 6d8cf68 printed "FLEXDESK TESTS: GREEN — 121 suite(s)" and exited 0. No line says SKIPPED. `node build.mjs` exited 0, and dist/ was then restored, not committed.

App check: no check was done in a running app at landing. The criteria were checked through the test suite only.
