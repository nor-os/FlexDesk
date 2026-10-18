---
id: 64
type: story
title: "mountTileConfigForm renders TileBase config schemas inline, with an opt-in grid:config-modal-show handler"
status: in-progress
parent: 21
phase:
assignee: norman_agent
reporter: norman
due:
points: 5
subsystem: tiles
labels: [tiles, forms]
links: [relates-to BUG-0021]
created: 2026-10-17
updated: 2026-10-18T03:28Z
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

## History

- 2026-10-17 · norman_agent · status: draft -> refined
- 2026-10-17 · norman_agent · status: refined -> in-progress
- 2026-10-17 · norman_agent · assignee:  -> norman_agent

## Comments

### 2026-10-17T07:55Z · norman_agent (status: draft -> refined)

Refined: 6 acceptance criteria, 5 points, parented to EPIC-0021. Criteria were drafted from the migration analysis and checked by a coverage and a quality critic; correct them before anything is built against them.

### 2026-10-18T03:28Z · norman_agent

Where this stands: built on branch `story-0064` (tip 22c9b50), but an independent review still finds problems after two fix rounds, so it is not landed. A full test run takes about 11 minutes because the other FlexDesk worktrees (story-0056, story-0038) are running their suites at the same time.

Verified: all 6 acceptance criteria hold. I read src/tiles/tile_config_form.js, ran `node tests/tile_config_form.test.mjs` (all assertions passed) and ran the full `node tests/run.mjs` (FLEXDESK TESTS: GREEN, 119 suites, nothing SKIPPED or FAILED). `node build.mjs` succeeds; I reverted the dist/ it wrote and the worktree is clean. §6 is a real regression test: on origin/main the schemas use `name`, so validateConfig reads config[undefined] and reports valid. The branch has no backlog/, bugs/ or dist/ edits and no TODOs. The new code uses no EcoSim, pywebview or app vocabulary. The barrel (tiles.js) and README are updated. The name->key schema change is covered by this record, so it is not a STOP.

Open: two defects in the new code block approval.

1. src/tiles/tile_config_form.js:254 and :269: a renderer's control can lose its label. `label.htmlFor = id` is set to the generated id before `element.id ||= id`. If the renderer's element already has an id, that id is kept and the <label> points at an id no element has. Clicking the label does not focus the control, and assistive technology does not announce the label for it. Done looks like: set `label.htmlFor` after the control exists, to the id the control actually carries (`label.htmlFor = r.control.element.id` for the custom branch, or set it after both branches). Add an assertion in tests/tile_config_form.test.mjs §5 where the renderer returns an element with a preset id and `label.htmlFor === element.id`.

2. src/tiles/tile_config_form.js:408-409: in modal mode, a refused Save does not move focus to an invalid field drawn by a renderer. The focus query looks only for `input, select` inside `.fd-tile-config__row--invalid`, so a renderer's control (for example a picker built from a div or button) gets no focus. README and the module header both promise that "the first invalid field is focused". Done looks like: focus the first invalid visible row's control through the form itself (for example a `focusFirstInvalid()` on the form handle that focuses `r.control.element`, or the first focusable element inside it). Cover it in §8 with an invalid renderer field.
