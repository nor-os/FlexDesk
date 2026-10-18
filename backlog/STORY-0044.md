---
id: 44
type: story
title: "A colour field and colour-list field for openForm and as standalone inputs"
status: in-progress
parent: 40
phase:
assignee: norman_agent
reporter: norman
due:
points: 5
subsystem: widgets
labels: [widgets, new-component, forms]
links: []
created: 2026-10-17
updated: 2026-10-17T22:21Z
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
- 2026-10-17 · norman_agent · status: refined -> in-progress
- 2026-10-17 · norman_agent · assignee: (none) -> norman_agent

## Comments

### 2026-10-17T07:55Z · norman_agent (status: draft -> refined)

Refined: 4 acceptance criteria, 5 points, parented to EPIC-0040. Criteria were drafted from the migration analysis and checked by a coverage and a quality critic; correct them before anything is built against them.

### 2026-10-17T22:21Z · norman_agent

Status: blocked. Nothing has landed on main. Waiting on norman.

I fixed the reviewer issue and pushed it to branch `story-0044` (commit 6d5b56b, on top of 0fd761e). I could not finish the full test run. I was told to return while `node tests/run.mjs` was still going. It had reached bottom_panel_tabs.test.mjs, with no FAIL or SKIPPED lines up to that point. The run is not complete, so this is not ready.

The fix is in `src/ui/components/color_list_field.js`. A new private `#dropFields()` disposes and clears `_fields`. It runs before every row rebuild:
- In the SortableList `onChange`, for every change except a row's own edit (add, remove, move, drag). A new `_rowEdit` flag marks a row's own edit, because SortableList does not rebuild the rows for that one.
- In `setValue()`, before `setItems`.
- In `dispose()`.

`#renderRow` no longer trims or disposes `_fields`. It only records the new field for its index. So `_fields` always matches the rows on screen, including when there are none, and `focus()` falls through to the add button when the list is empty.

New checks in tests/color_field.test.mjs §4:
- Remove the only row of a required colorList, then submit: the form shows "Required." and the add button has focus.
- `_fields` holds exactly one field per row, each still in the page, after a remove, after `setValue`, after `setValue([])` (zero fields) and after an add. `focus()` then lands on the row.

Both checks failed on the old code ("active: BODY", and "expected 0, got 1"). Both pass with the fix: the whole suite shows 97 ok, no FAIL, exit 0. `node build.mjs` succeeded, and I removed the generated dist/ files afterwards, so nothing from dist/ is committed. No exports changed, so the entry files and the README did not need updating.

Still open: the full test run. To check it, run `grep -E '^RC=|SKIPPED|FAIL' /tmp/claude-1000/-mnt-c-Users-Norman-repos-EcoSim/6eec44e5-828c-4177-bb23-c04ebe064fc7/scratchpad/s44run.log`. It needs RC=0 with no FAIL or SKIPPED lines. If the log has no RC line yet, the run is still going or was killed. In that case, re-run `node tests/run.mjs` at commit 6d5b56b.
