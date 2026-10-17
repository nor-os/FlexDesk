---
id: 46
type: story
title: "A standalone tag-list input"
status: refined
parent: 40
phase:
assignee:
reporter: norman
due:
points: 2
subsystem: widgets
labels: [widgets, new-component]
links: []
created: 2026-10-17
updated: 2026-10-17T07:55Z
---

## Description

The only string-list control lives inside the flow settings panel. createTagInput(host, {value, placeholder, readOnly, allowDuplicates, onChange}) shows removable chips plus a text input; Enter, comma or blur commits trimmed text; Backspace on empty removes the last chip; paste with commas splits.

Related EcoSim records: EcoSim STORY-0093 (`../EcoSim/backlog/STORY-0093.md`).

Filed from the EcoSim -> FlexDesk 0.16 migration analysis (2026-10-17).

## Acceptance criteria

- [ ] Typing 'a, b' and Enter adds two chips and onChange receives ['a','b']
- [ ] Empty text, and duplicates with allowDuplicates false, are ignored
- [ ] Each chip's remove button has an aria-label and removes it
- [ ] readOnly shows chips without remove buttons or input

## History

- 2026-10-17 · norman_agent · status: draft -> refined

## Comments

### 2026-10-17T07:55Z · norman_agent (status: draft -> refined)

Refined: 4 acceptance criteria, 2 points, parented to EPIC-0040. Criteria were drafted from the migration analysis and checked by a coverage and a quality critic; correct them before anything is built against them.
