---
id: 58
type: story
title: "Auto-height editors take a maxHeight option instead of reading a DOM attribute"
status: review
parent: 54
phase:
assignee: norman
reporter: norman
due:
points: 2
subsystem: editor
labels: [editor, monaco]
links: []
created: 2026-10-17
updated: 2026-10-19T14:37Z
---

## Description

createEditor's cap comes from data-code-max-height on a '.notebook-editor-container' ancestor watched by a MutationObserver, a hard-coded 400px. Adds createEditor({maxHeight}) and handle.setMaxHeight(px|Infinity); removes the ancestor lookup and observer.

Related EcoSim records: EcoSim STORY-0081 (`../EcoSim/backlog/STORY-0081.md`).

Filed from the EcoSim -> FlexDesk 0.16 migration analysis (2026-10-17).

## Acceptance criteria

- [x] An editor with maxHeight 200 and 50 lines is 200px tall and scrolls internally
- [x] setMaxHeight(Infinity) grows it to its content immediately
- [x] Below the cap, wheel events reach the outer scroller
- [x] createEditor's source (src/editor/monaco_editor_factory.js) contains no reference to notebook-editor-container or data-code-max-height

## History

- 2026-10-17 · norman_agent · status: draft -> refined
- 2026-10-17 · norman_agent · status: refined -> in-progress
- 2026-10-17 · norman_agent · assignee: (none) -> norman_agent
- 2026-10-19 · norman_agent · status: in-progress -> review
- 2026-10-19 · norman_agent · assignee: norman_agent -> norman

## Comments

### 2026-10-17T07:55Z · norman_agent (status: draft -> refined)

Refined: 4 acceptance criteria, 2 points, parented to EPIC-0054. Criteria were drafted from the migration analysis and checked by a coverage and a quality critic; correct them before anything is built against them.

### 2026-10-17T22:50Z · norman_agent

**Status: needs_owner.** STORY-0058 criterion 4 says "The source contains no reference to notebook-editor-container or data-code-max-height". Does "the source" mean only createEditor's source (src/editor/monaco_editor_factory.js), which is clean now? Or does it mean all of src/? In that case EditorPane's public CSS class `.notebook-editor-container` (and `--drop-target`) would have to be renamed in editor_pane.js, both stylesheets, README, tests/editor_panes_css.test.mjs and the notebook_search.js comments. That breaks consumers who style or query it. If you want the rename, what should the new class be called (for example `editor-pane__editor`)?

**Summary.** STORY-0058 is built and pushed on branch `story-0058` (commit d10fbf2). createEditor() now takes a `maxHeight` option in px, defaulting to Infinity, and the handle has setMaxHeight(px|Infinity), which applies at once. The `.closest('.notebook-editor-container')` lookup, the data-code-max-height MutationObserver and the hard-coded 400px are gone from src/editor/monaco_editor_factory.js. Monaco's handleMouseWheel is on only when the content is taller than the cap. A cap that is not a positive number throws a RangeError. The full test run is green (119 suites, 0 SKIPPED) and the build succeeds.

**Open.** Criterion 4 can be read two ways. Read as the editor factory's source, it is met. Read as all of src/, it is not: EditorPane still uses `.notebook-editor-container` as its own public CSS class (src/editor/editor_pane.js:129,137,143,153, styled in css/base.css and css/flexdesk.css, documented in README.md:2048), and notebook_search.js mentions it in three comments. Renaming that class would be a breaking change to a public API the record does not cover, so I stopped and did not do it.

**Branch:** `story-0058` @ d10fbf2. No new exports were added: the option and the handle method sit on the existing createEditor. The README has a new section, "Auto-height editors: `maxHeight` (0.17.0)", under Peer dependencies. The old data-code-max-height switch is gone with no fallback, as the record asks. Consumers must pass maxHeight. Nothing landed on the default branch. Waiting on norman.

### 2026-10-18T09:31Z · norman_agent

Criterion 4 amended by norman (Claude Code session, 2026-10-18), answering the question above: "the source" means createEditor's source only. EditorPane keeps its public .notebook-editor-container class; nothing is renamed.

### 2026-10-19T14:37Z · norman_agent (status: in-progress -> review)

**Landed on main @ d60403c.** Handing back to norman for review.

**What was built.** createEditor() takes a `maxHeight` option (px, default Infinity), and the handle has setMaxHeight(px|Infinity), which applies at once. A cap that is not a positive number throws a RangeError. Monaco's handleMouseWheel is on only when the content is taller than the cap, so below the cap the wheel reaches the outer scroller. The `.closest('.notebook-editor-container')` lookup, the data-code-max-height MutationObserver and the hard-coded 400px are removed from src/editor/monaco_editor_factory.js, with no fallback. EditorPane keeps its public `.notebook-editor-container` class, per norman's decision on criterion 4. README has a new section, "Auto-height editors: `maxHeight` (0.17.0)". New suite: tests/editor_max_height.test.mjs.

**Ticked:** all four criteria. 1-3 are checked by tests/editor_max_height.test.mjs §1-§3 (200px container and wheel on at 50 lines; setMaxHeight(Infinity) re-lays out to the content height at once and gives the wheel back; below the cap the 80px minimum holds and the wheel passes through). Those sections use a stand-in for Monaco (Monaco is a peer dependency and is not installed in FlexDesk), so "scrolls internally" is verified as Monaco's `scrollbar.handleMouseWheel` being on, not in a real browser. Criterion 4 is checked by §7 and by grep: the factory source has no `notebook-editor-container`, `data-code-max-height` or `.closest(`.

**Landing.** Branch `story-0058` was rebased onto origin/main locally (one README conflict: the new maxHeight section and main's new "Storage keys and names are yours" section were both kept, maxHeight first under the Monaco/peer-dependencies section) and pushed fast-forward to main as d60403c. origin/story-0058 still holds the pre-rebase history (433d309, with the merge commits); it was not force-pushed.

**Tests.** `node tests/run.mjs` (Linux node) ran to completion, exit 0: "FLEXDESK TESTS: GREEN — 151 suite(s)", 0 `: SKIPPED` lines, editor_max_height: all passed. `node build.mjs` exit 0; dist/ reset afterwards, nothing in dist/ committed.

**App check.** None in a real app: FlexDesk has no Monaco installed, and the EcoSim side is EcoSim STORY-0081 (`../EcoSim/backlog/STORY-0081.md`), which must now pass `maxHeight` instead of setting data-code-max-height.
