---
id: 58
type: story
title: "Auto-height editors take a maxHeight option instead of reading a DOM attribute"
status: in-progress
parent: 54
phase:
assignee: norman_agent
reporter: norman
due:
points: 2
subsystem: editor
labels: [editor, monaco]
links: []
created: 2026-10-17
updated: 2026-10-17T22:50Z
---

## Description

createEditor's cap comes from data-code-max-height on a '.notebook-editor-container' ancestor watched by a MutationObserver, a hard-coded 400px. Adds createEditor({maxHeight}) and handle.setMaxHeight(px|Infinity); removes the ancestor lookup and observer.

Related EcoSim records: EcoSim STORY-0081 (`../EcoSim/backlog/STORY-0081.md`).

Filed from the EcoSim -> FlexDesk 0.16 migration analysis (2026-10-17).

## Acceptance criteria

- [ ] An editor with maxHeight 200 and 50 lines is 200px tall and scrolls internally
- [ ] setMaxHeight(Infinity) grows it to its content immediately
- [ ] Below the cap, wheel events reach the outer scroller
- [ ] The source contains no reference to notebook-editor-container or data-code-max-height

## History

- 2026-10-17 · norman_agent · status: draft -> refined
- 2026-10-17 · norman_agent · status: refined -> in-progress
- 2026-10-17 · norman_agent · assignee: (none) -> norman_agent

## Comments

### 2026-10-17T07:55Z · norman_agent (status: draft -> refined)

Refined: 4 acceptance criteria, 2 points, parented to EPIC-0054. Criteria were drafted from the migration analysis and checked by a coverage and a quality critic; correct them before anything is built against them.

### 2026-10-17T22:50Z · norman_agent

**Status: needs_owner.** STORY-0058 criterion 4 says "The source contains no reference to notebook-editor-container or data-code-max-height". Does "the source" mean only createEditor's source (src/editor/monaco_editor_factory.js), which is clean now? Or does it mean all of src/? In that case EditorPane's public CSS class `.notebook-editor-container` (and `--drop-target`) would have to be renamed in editor_pane.js, both stylesheets, README, tests/editor_panes_css.test.mjs and the notebook_search.js comments. That breaks consumers who style or query it. If you want the rename, what should the new class be called (for example `editor-pane__editor`)?

**Summary.** STORY-0058 is built and pushed on branch `story-0058` (commit d10fbf2). createEditor() now takes a `maxHeight` option in px, defaulting to Infinity, and the handle has setMaxHeight(px|Infinity), which applies at once. The `.closest('.notebook-editor-container')` lookup, the data-code-max-height MutationObserver and the hard-coded 400px are gone from src/editor/monaco_editor_factory.js. Monaco's handleMouseWheel is on only when the content is taller than the cap. A cap that is not a positive number throws a RangeError. The full test run is green (119 suites, 0 SKIPPED) and the build succeeds.

**Open.** Criterion 4 can be read two ways. Read as the editor factory's source, it is met. Read as all of src/, it is not: EditorPane still uses `.notebook-editor-container` as its own public CSS class (src/editor/editor_pane.js:129,137,143,153, styled in css/base.css and css/flexdesk.css, documented in README.md:2048), and notebook_search.js mentions it in three comments. Renaming that class would be a breaking change to a public API the record does not cover, so I stopped and did not do it.

**Branch:** `story-0058` @ d10fbf2. No new exports were added: the option and the handle method sit on the existing createEditor. The README has a new section, "Auto-height editors: `maxHeight` (0.17.0)", under Peer dependencies. The old data-code-max-height switch is gone with no fallback, as the record asks. Consumers must pass maxHeight. Nothing landed on the default branch. Waiting on norman.
