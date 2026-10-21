---
id: 69
type: story
title: "0.17.0 ships every defect fix and capability an embedder migration needs, in one release"
status: done
parent: 68
phase:
assignee: norman
reporter: norman
due:
points: 3
subsystem: build
labels: [release]
links: [relates-to 97, blocked-by 31, blocked-by 32, blocked-by 33, blocked-by 34, blocked-by 35, blocked-by 36, blocked-by 37, blocked-by 38, blocked-by 62, blocked-by 39, blocked-by 43, blocked-by 44, blocked-by 50, blocked-by 30, blocked-by 41, blocked-by 42, blocked-by 45, blocked-by 46, blocked-by 47, blocked-by 48, blocked-by 49, blocked-by 67, blocked-by 52, blocked-by 53, blocked-by 55, blocked-by 57, blocked-by 56, blocked-by 58, blocked-by 60, blocked-by 61, blocked-by 63, blocked-by 64, blocked-by 65, blocked-by 66, blocked-by 3, blocked-by 86, blocked-by 88, blocked-by 89, blocked-by 91, blocked-by 74, blocked-by 75, blocked-by 76, blocked-by 77, blocked-by 78, blocked-by 79, blocked-by 80, blocked-by 81, blocked-by 82, blocked-by 83, relates-to BUG-0003, relates-to BUG-0004, relates-to BUG-0005, relates-to BUG-0006, relates-to BUG-0008, relates-to BUG-0009, relates-to BUG-0026, relates-to BUG-0011, relates-to BUG-0012, relates-to BUG-0013, relates-to BUG-0014, relates-to BUG-0015, relates-to BUG-0016, relates-to BUG-0017, relates-to BUG-0018, relates-to BUG-0019, relates-to BUG-0020, relates-to BUG-0023, relates-to BUG-0024, relates-to BUG-0025, relates-to BUG-0027, relates-to BUG-0028, relates-to BUG-0031]
created: 2026-10-17
updated: 2026-10-21T08:31Z
---

## Description

One release carries all of it (decision by norman, 2026-10-17). Contents: STORY-0031, STORY-0032, STORY-0033, STORY-0034, STORY-0035, STORY-0036, STORY-0037, STORY-0038, STORY-0062, STORY-0039, STORY-0043, STORY-0044, STORY-0050; the bugs listed in fixes_bugs; and the existing BUG-0001 (latex tooltip never visible) and BUG-0002 (flow popovers behind ManagedWindow); the form, content, progress and menu widgets STORY-0030, STORY-0041, STORY-0042, STORY-0045, STORY-0046, STORY-0047, STORY-0048, STORY-0049, STORY-0067, STORY-0052, STORY-0053, STORY-0055, STORY-0057, STORY-0056, STORY-0058; and the charts, tiles, flow and grid work STORY-0060, STORY-0061, STORY-0063, STORY-0064, STORY-0065, STORY-0066; and the generic node modeler EPIC-0073, STORY-0074 to STORY-0084 (folded in by norman, 2026-10-17).

Related EcoSim records: EcoSim STORY-0025 (`../EcoSim/backlog/STORY-0025.md`).

Filed from the EcoSim -> FlexDesk 0.16 migration analysis (2026-10-17).

## Acceptance criteria

- [x] `npm view flexdesk@0.17.0 version` prints 0.17.0
- [x] Every listed story is marked done in the backlog
- [x] Each listed bug's steps to reproduce no longer reproduce against the published package
- [x] `npm run check` passes and dist/ matches a fresh build
- [x] CHANGELOG.md, created in this release, compiles every story's README "(0.17.0)" section and lists every removed or renamed export with its replacement

## History

- 2026-10-17 · norman_agent · status: draft -> refined
- 2026-10-21 · norman_agent · status: refined -> in-progress
- 2026-10-21 · norman_agent · assignee: (unset) -> norman_agent
- 2026-10-21 · norman_agent · status: in-progress -> review
- 2026-10-21 · norman_agent · assignee: norman_agent -> norman
- 2026-10-21 · norman_agent · status: review -> done

## Comments

### 2026-10-17T07:55Z · norman_agent

Left in draft: the content passes the refinement checks, but its shape depends on the FlexDesk owner's agreement on the 0.17/0.18/0.19 release grouping. Refine it once that is decided.

### 2026-10-17T08:37Z · norman_agent (status: draft -> refined)

Refined. Decision (norman, 2026-10-17): one release instead of 0.17/0.18/0.19. STORY-0070 and STORY-0071 are folded in, and their contents and blockers are now listed here.

### 2026-10-17T21:21Z · norman_agent

Scope added by norman (2026-10-17): the generic node modeler, EPIC-0073 with STORY-0074 to STORY-0084, ships in 0.17.0 too. The eleven stories are now in the blocked-by list and the contents above, and the changelog criterion covers their additive API changes (new CANVAS_ACTIONS ids, onSelect `kind: 'many'`, optional graph keys).

### 2026-10-18T09:31Z · norman_agent

Scope added by norman (2026-10-18): STORY-0003 (the editable grid) ships in 0.17.0 because STORY-0066 builds on it. Added to blocked-by.

### 2026-10-18T10:34Z · norman_agent

Scope added by norman (2026-10-18): the whole editable-grid split ships in 0.17.0, STORY-0085 to STORY-0091 (range copy, column reorder, six editors, staged edits, fill handle, paste, crosstab grid), on top of STORY-0003. Added to blocked-by.

### 2026-10-19T20:45Z · norman_agent

Criterion amended by norman (2026-10-19): FlexDesk has no CHANGELOG yet; each 0.17.0 story documents itself in a README section headed "(0.17.0)", and this release creates CHANGELOG.md compiling them, with every removed or renamed export and its replacement. Old wording: "The changelog lists every removed or renamed export with its replacement". BUG-0031 (PlotPopoutWindow's default stream event names, filed today) is added to the release.

### 2026-10-21T07:42Z · norman_agent

Taking this on to release. norman decided on 2026-10-21 (Claude Code session) to release FlexDesk 0.17.0 now and to accept every story on the 0.17.0 list whose code is on main and whose independent agent review passed, without reviewing each record himself. Every listed story is now done and every listed bug closed (this commit). STORY-0084, STORY-0085, STORY-0087 and STORY-0090 were still being built, so by norman's decision they move to 0.17.1 (STORY-0097) and are removed from this list. norman has authorised the npm publish.

### 2026-10-21T08:29Z · norman_agent (status: in-progress -> review)

Released. Handing back to norman for review.

- **Release commit:** 10b3e1a "FlexDesk 0.17.0" on main (fast-forward from 82108c8). It bumps package.json and package-lock.json to 0.17.0, adds CHANGELOG.md to package.json `files`, and commits the rebuilt dist/. No tag: no earlier release (0.16.0 c3e2e9a, 0.16.1 7a832ee) has one, so none was made.
- **npm:** `npm publish` from the release worktree as nor-os, no OTP needed. `npm view flexdesk@0.17.0 version` prints `0.17.0`, and dist-tag latest is 0.17.0. `npm pack --dry-run` showed 238 files: dist/, src/, css/, README.md, CHANGELOG.md, LICENSE, THIRD_PARTY_LICENSES.md, package.json. It had nothing from backlog/, bugs/, tests/, demo/ or node_modules.
- **Gates:** `node build.mjs`, then `node build.mjs --check` (what `npm run check` runs) printed OK. A second `node build.mjs` changed nothing, so the committed dist/ is a fresh build. `node tests/run.mjs` reported GREEN with 182 suites and no `: SKIPPED` line.
- **CHANGELOG.md:** a 0.17.0 section with one entry for each of the 44 README headings marked "(0.17.0)". Each entry links its README anchor. It notes the new `flexdesk/css/reset` export, and has a "Removed or renamed exports" table. I built that table by diffing esbuild's export lists for all nine entry points, and the package.json exports map, between 7a832ee and HEAD. The diff found only three removed exports, all from `@flexdesk/widgets`: `PanelStateMachine`, `PANEL_STATES` and `PANEL_TRANSITIONS` (STORY-0034). Their replacement is kind `panels` plus `wm.setPanelAvailability`, `isPanelAvailable`, `getPanelAvailability`, `onPanelAvailabilityChange` and `togglePanel`. Nothing was renamed, and no exports specifier was removed (one was added: `./css/reset`). A second table, "Other removed or renamed names", lists the changes that are not exports, each with its replacement:
  - the PlotPopoutWindow cell class changed from `plot-tile-chart` to `twm-plot-grid__cell`;
  - the default `streamEvents` are gone (BUG-0031);
  - the HP subplot keys are gone, replaced by `seriesTransforms`;
  - the toast bus and gallery picker no longer read globals;
  - the state guard defaults no longer carry an application's override;
  - the ecosim storage keys, theme names, drag MIME, export file name and log name became flexdesk defaults;
  - `data-code-max-height` became `maxHeight`;
  - the `?` shortcut is now installed by the shell;
  - the `detail-header__*` classes became `twm-detail-header__*`;
  - confirm text is set as text, not markup;
  - `installCollapsibleScrollbars(root)` takes a root;
  - `.twm-flow-field__kept` was removed.
- **Criterion 3, against the published package:** `npm install flexdesk@0.17.0` into a fresh directory outside the repo (`%TEMP%\fd-0170-verify`). Both runs below used a copy of that installed package, with this repo's tests/ beside it and jsdom borrowed from ../Tables as usual.
  - **Run A (published src):** the repo's barrels, which only `export * from './src/...'`, were put over the package's own src/. All 25 bugs' regression suites passed: BUG-0001 tooltip_visible, BUG-0002 flow_popover_layer, BUG-0003 state_guard_defaults, BUG-0004 bus_listener_teardown, BUG-0005 state_guard_attribution, BUG-0006 collapsible_scrollbars, BUG-0008 keyboard_shortcuts_topic, BUG-0009 help_modal_escaping, BUG-0011 tree_filter, BUG-0012 tree_item_badge and tree_view_escaping, BUG-0013 tree_view_escaping, BUG-0014 confirm_escaping, BUG-0015 detail_header_styles, BUG-0016 sortable_list_reorder, BUG-0017 slide_out_host_resize, BUG-0018 slide_out_panel_zoom, BUG-0019 notification_history_severity, BUG-0020 flow_kit_settings_schema, BUG-0023 monaco_loader_failure and monaco_loader_retry, BUG-0024 diff_editor_models, BUG-0025 editor_panes_css, BUG-0026 help_modal_css, BUG-0027 css_exports and BUG-0031 no_app_globals. None skipped.
  - **BUG-0028 (demo_tokens):** this suite reads demo/, which is not in the package. It passed with the repo's demo/ added beside the published css/, so only the stylesheet side of it comes from the package.
  - **Run B (published dist):** the barrels became `export * from './dist/<entry>.js'`. Every suite that imports a barrel (tooltip_visible, state_guard_attribution, keyboard_shortcuts_topic, slide_out_host_resize, the monaco loader suites, diff_editor_models, editor_panes_css) passed against dist, and so did css_exports. no_app_globals failed only its three checks that a barrel export is the same object as the src module, which cannot hold when one copy comes from dist and the other from src. With its src imports pointed at dist as well, it passed in full against the published dist.
- **Records:** EPIC-0073 stays in-progress, because its STORY-0084 moved to 0.17.1 (STORY-0097). The `assignee:` frontmatter of this record was empty although the claim's History line says norman_agent. The handback line records norman_agent -> norman.
- The release worktree has been removed. The release-0.17.0 branch is kept.

### 2026-10-21T08:31Z · norman_agent (status: review -> done)

Checked by the orchestrating session: `npm view flexdesk@0.17.0 version dist-tags` prints 0.17.0 with latest = 0.17.0, and origin/main holds the release commit 10b3e1a. Done under norman's 2026-10-21 process decision (FlexDesk stories go to done once landed and independently checked).
