---
id: 44
type: story
title: "A colour field and colour-list field for openForm and as standalone inputs"
status: refined
parent: 40
phase:
assignee:
reporter: norman
due:
points: 5
subsystem: widgets
labels: [widgets, new-component, forms]
links: []
created: 2026-10-17
updated: 2026-10-17T07:55Z
---

## Description

FieldTypes.COLOR and the SettingDef 'colorList' type are declared but nothing renders them. Adds 'color' (swatch with native picker plus synced hex entry, palette presets) and 'colorList' (add, remove, reorder) to openForm and as exported components; validateField checks hex for COLOR.

Related EcoSim records: EcoSim STORY-0032 (`../EcoSim/backlog/STORY-0032.md`).

Filed from the EcoSim -> FlexDesk 0.16 migration analysis (2026-10-17).

## Acceptance criteria

- [ ] Picking a colour updates the hex text, and typing a valid hex updates the swatch
- [ ] An invalid hex shows a field error and is not submitted
- [ ] A colorList field returns an ordered array of hex strings after reordering
- [ ] An rgb() default is shown as its hex equivalent

## History

- 2026-10-17 · norman_agent · status: draft -> refined

## Comments

### 2026-10-17T07:55Z · norman_agent (status: draft -> refined)

Refined: 4 acceptance criteria, 5 points, parented to EPIC-0040. Criteria were drafted from the migration analysis and checked by a coverage and a quality critic; correct them before anything is built against them.
