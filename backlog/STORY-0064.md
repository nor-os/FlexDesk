---
id: 64
type: story
title: "mountTileConfigForm renders TileBase config schemas inline, with an opt-in grid:config-modal-show handler"
status: draft
parent: 21
phase:
assignee:
reporter: norman
due:
points: 5
subsystem: tiles
labels: [tiles, forms]
links: [relates-to BUG-0021]
created: 2026-10-17
updated: 2026-10-17T07:55Z
---

## Description

Nothing subscribes to grid:config-modal-show, and STORY-0022's built-in tile schemas use 'name'/'help' while config_schema.js reads 'key'/'description'. mountTileConfigForm(host, {schema, config, data, onChange, renderers}) -> {getValues, setValues, dispose} covers every FieldTypes entry plus readonly, options via getFieldOptions, visibleWhen without rebuild, inline validateField errors, mergeWithDefaults and consumer renderers for custom types. openTileConfig(eventBus, opts) shows it in a slide-out or modal. Built-in tile schemas move to 'key'/'description'.

Related EcoSim records: EcoSim STORY-0076 (`../EcoSim/backlog/STORY-0076.md`).

Filed from the EcoSim -> FlexDesk 0.16 migration analysis (2026-10-17).

## Acceptance criteria

- [ ] A schema with each FieldTypes entry renders one control per field
- [ ] Editing a field calls onChange(key, value, config) with the field's key
- [ ] A number below min shows an inline error and is not applied
- [ ] A field with visibleWhen toggles visibility without rebuilding the focused control
- [ ] A custom renderer registered for type 'variable' is used for that field
- [ ] validateConfig({decimals: 99}, KpiTile schema) reports the decimals error
