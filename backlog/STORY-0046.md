---
id: 46
type: story
title: "A standalone tag-list input"
status: review
parent: 40
phase:
assignee: norman
reporter: norman
due:
points: 2
subsystem: widgets
labels: [widgets, new-component]
links: []
created: 2026-10-17
updated: 2026-10-18T01:01Z
---

## Description

The only string-list control lives inside the flow settings panel. createTagInput(host, {value, placeholder, readOnly, allowDuplicates, onChange}) shows removable chips plus a text input; Enter, comma or blur commits trimmed text; Backspace on empty removes the last chip; paste with commas splits.

Related EcoSim records: EcoSim STORY-0093 (`../EcoSim/backlog/STORY-0093.md`).

Filed from the EcoSim -> FlexDesk 0.16 migration analysis (2026-10-17).

## Acceptance criteria

- [x] Typing 'a, b' and Enter adds two chips and onChange receives ['a','b']
- [x] Empty text, and duplicates with allowDuplicates false, are ignored
- [x] Each chip's remove button has an aria-label and removes it
- [x] readOnly shows chips without remove buttons or input

## History

- 2026-10-17 · norman_agent · status: draft -> refined
- 2026-10-17 · norman_agent · status: refined -> in-progress
- 2026-10-17 · norman_agent · assignee: (none) -> norman_agent
- 2026-10-18 · norman_agent · status: in-progress -> review
- 2026-10-18 · norman_agent · assignee: norman_agent -> norman

## Comments

### 2026-10-17T07:55Z · norman_agent (status: draft -> refined)

Refined: 4 acceptance criteria, 2 points, parented to EPIC-0040. Criteria were drafted from the migration analysis and checked by a coverage and a quality critic; correct them before anything is built against them.

### 2026-10-18T01:01Z · norman_agent

Built and landed: `createTagInput(host, { value, placeholder, readOnly, allowDuplicates, onChange })` in `src/ui/components/tag_input.js`, exported from `@flexdesk/widgets`. It draws removable chips and a text box. Enter, a comma or blur commits the text, split at commas and trimmed. Backspace in an empty box removes the last chip. A paste that contains a comma is split into chips. The styles are the `twm-tag-input` block in `css/base.css` and `css/flexdesk.css`, placed before the flow sections. There is a README section, and `tests/tag_input.test.mjs` covers the behaviour in jsdom. After the review, two fixes went in. First, a commit that adds chips now appends only the new chips and leaves the existing ones in place, so a focused remove button keeps the focus and does not drop to `<body>`. Second, the paste handler reads `text/plain` with no dead fallback.

Ticked all 4 criteria: 'a, b' + Enter gives two chips and onChange gets ['a','b']; empty text and duplicates are ignored when allowDuplicates is false; every remove button has an aria-label and removes its chip; readOnly shows the chips with no remove buttons and no input.

Branch `story-0046`, rebased twice. The first rebase put it on d039971. The second, done at landing, put it on 7eebc2d, the origin/main tip at that point. That moved it past STORY-0034's 96a0ca2, which main already contained. The rebase had conflicts in README.md (both new sections kept), widgets.js (the tag_input export added next to the new toggle_field one; the header now says "44 modules", keeping the export-count-minus-one convention) and the CSS (the tag-input block moved to just before FLOW · KIT, after DOCUMENT OUTLINE). Landed on main as a fast-forward: tip ae44499.

Tests: `node tests/run.mjs` exited 0 with "FLEXDESK TESTS: GREEN — 129 suite(s)" and no `: SKIPPED` lines. `node build.mjs` exited 0, and dist/ was restored afterwards (not committed). App check: none run in a live app; the only verification is the jsdom suite.
