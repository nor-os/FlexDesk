---
id: 50
type: story
title: "A settings view that renders the registered settings schema"
status: in-progress
parent: 40
phase:
assignee: norman_agent
reporter: norman
due:
points: 8
subsystem: settings
labels: [settings, new-component]
links: [blocked-by 43, blocked-by 44]
created: 2026-10-17
updated: 2026-10-19T14:56Z
---

## Description

settings.js promises 'the Settings page renders whatever is in the schema' but none exists. A mountable view (component and content factory) bound to a store: category sidebar by CategoryDef.order with filter, rows grouped by SettingDef.group with label, description and modified marker, search across label/description/path, one control per type (toggle, select, number honouring min/max/step, debounced text, colour list), reset one/category/all (bulk resets confirm), live two-way binding through settings:<path>:changed including slices registered later, dispose(). All user and schema text is rendered as text.

Related EcoSim records: EcoSim STORY-0032 (`../EcoSim/backlog/STORY-0032.md`).

Filed from the EcoSim -> FlexDesk 0.16 migration analysis (2026-10-17).

## Acceptance criteria

- [ ] Every registered category appears in order, and selecting one lists its settings by group
- [ ] Changing a number setting writes it via setSetting and the row shows a modified marker
- [ ] A setSetting call made elsewhere updates the open view
- [ ] Searching matches across categories, and a query containing markup is shown literally
- [ ] Reset all asks to confirm and on Cancel changes nothing
- [ ] A slice registered after mount appears without remounting

## History

- 2026-10-17 · norman_agent · status: draft -> refined
- 2026-10-19 · norman_agent · status: refined -> in-progress
- 2026-10-19 · norman_agent · assignee: (none) -> norman_agent

## Comments

### 2026-10-17T07:55Z · norman_agent (status: draft -> refined)

Refined: 6 acceptance criteria, 8 points, parented to EPIC-0040. Blocked by STORY-0043, STORY-0044. Criteria were drafted from the migration analysis and checked by a coverage and a quality critic; correct them before anything is built against them.
