---
id: 44
type: story
title: "A colour field and colour-list field for openForm and as standalone inputs"
status: review
parent: 40
phase:
assignee: norman
reporter: norman
due:
points: 5
subsystem: widgets
labels: [widgets, new-component, forms]
links: []
created: 2026-10-17
updated: 2026-10-19T14:20Z
---

## Description

FieldTypes.COLOR and the SettingDef 'colorList' type are declared but nothing renders them. Adds 'color' (swatch with native picker plus synced hex entry, palette presets) and 'colorList' (add, remove, reorder) to openForm and as exported components; validateField checks hex for COLOR.

Related EcoSim records: EcoSim STORY-0032 (`../EcoSim/backlog/STORY-0032.md`).

Filed from the EcoSim -> FlexDesk 0.16 migration analysis (2026-10-17).

## Acceptance criteria

- [x] Picking a colour updates the hex text, and typing a valid hex updates the swatch
- [x] An invalid hex shows a field error and is not submitted
- [x] A colorList field returns an ordered array of hex strings after reordering
- [x] An rgb() default is shown as its hex equivalent

## History

- 2026-10-17 · norman_agent · status: draft -> refined
- 2026-10-17 · norman_agent · status: refined -> in-progress
- 2026-10-17 · norman_agent · assignee: (none) -> norman_agent
- 2026-10-19 · norman_agent · status: in-progress -> review
- 2026-10-19 · norman_agent · assignee: norman_agent -> norman

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

### 2026-10-19T08:02Z · norman_agent

Where this stands: blocked, not ready. The full suite (`node tests/run.mjs`) was still running when I had to stop, so there is no green run yet.

Since my last comment (which named 6d5b56b), the branch has gained ae03bc7 (ColorListField converts newColor once), two earlier merges of origin/main, and f1f08c8 (header comment on the widgets barrel). In this session I merged the latest origin/main into the branch as a2efb07. That merge brings in only the bugs/BUG-0003.md record change. I pushed it to origin/story-0044 as a fast-forward. The branch merges cleanly into origin/main. `node build.mjs` succeeded (exit 0), and I removed the generated dist/ files afterwards, so the worktree is clean. `node tests/color_field.test.mjs` passes on its own (all assertions, exit 0). The branch diff for src, css and widgets.js has no EcoSim, pywebview or window.api names.

Still open: the full run, logging to `/tmp/claude-1000/-mnt-c-Users-Norman-repos-EcoSim/6eec44e5-828c-4177-bb23-c04ebe064fc7/scratchpad/s44full.log`. It counts as green only if the log ends with `RC=0` and has no SKIPPED or FAIL lines. If the log has no RC line, the run was killed: re-run `node tests/run.mjs` in /mnt/c/Users/Norman/repos/FlexDesk-story-0044 at a2efb07. Other worktrees (bug-0001, bug-0010, story-0041, story-0048) were running their full suites at the same time, so this run is slow.

Branch: story-0044 @ a2efb07. Nothing has landed. Waiting on norman.

### 2026-10-19T14:20Z · norman_agent

Landed on main and ready for review: main is at a1ad593.

What was built:
- `src/ui/components/color_field.js`: ColorField, plus `normalizeHex` and `isHexColor`.
- `src/ui/components/color_list_field.js`: ColorListField (add, remove, reorder by drag or up / down).
- openForm field types `color` and `colorList`, mounted through openForm's control slots (`src/ui/components/modal.js`).
- A hex check for `FieldTypes.COLOR` in `validateField` (`src/tiles/config_schema.js`).
- Styles in `css/flexdesk.css`, the two modules in the widgets.js barrel (header now says 51 modules) and a README section.
- `tests/color_field.test.mjs`.

How it landed: I rebased the branch onto origin/main (88d1cb8) as one commit, a1ad593. That commit holds the branch's net change from its last merge of main (0766642) to its tip d3ced99. The only conflict was the module count in the widgets.js header, now 51 (main's 49 plus the two new modules). I pushed it to main as a fast-forward. origin/story-0044 still holds the pre-rebase history at d3ced99. I did not push the rebased branch there.

Ticked, all 4 criteria, each checked by tests/color_field.test.mjs in jsdom:
- Picking a colour updates the hex text, and typing a valid hex updates the swatch
- An invalid hex shows a field error and is not submitted
- A colorList field returns an ordered array of hex strings after reordering
- An rgb() default is shown as its hex equivalent

Tests at a1ad593: the full suite (`node tests/run.mjs`) finished with "FLEXDESK TESTS: GREEN — 150 suite(s)", RC=0, and no SKIPPED or FAIL lines. The only line containing "FAIL" is an ok assertion whose name includes "FAILING". `node build.mjs` exited 0. I restored dist/ afterwards, so nothing from dist/ is committed. The diff for src, css, widgets.js and README has no EcoSim, pywebview or window.api names.

App check: none. I did not run a live app. The criteria were checked only by the jsdom tests.

Back to norman for review.
