---
id: 48
type: story
title: "A public tab strip with optional pane host, decoupled from bus names and file paths"
status: done
parent: 40
phase:
assignee: norman
reporter: norman
due:
points: 5
subsystem: widgets
labels: [widgets, new-component, tabs]
links: []
created: 2026-10-17
updated: 2026-10-21T07:42Z
---

## Description

createTabStrip is internal to wm.js, createBottomPanelTabs (STORY-0018, status review) is tied to the bottom panel and its bus event, and NotebookTabBar is keyed by file path. One exported tab strip: items {id,label,icon,title,badge,indicator,closable,dirty}, update(items, activeId), select/active/setBadge/setIndicator, onSelect, optional onClose/onReorder/onContextMenu, lazy pane mounting or strip-only, ARIA tabs with arrows/Home/End, overflow scroll, compact variant. createBottomPanelTabs from STORY-0018 is rebuilt on it once that story is released.

Related EcoSim records: EcoSim STORY-0092 (`../EcoSim/backlog/STORY-0092.md`); EcoSim STORY-0100 (`../EcoSim/backlog/STORY-0100.md`); EcoSim STORY-0069 (`../EcoSim/backlog/STORY-0069.md`); EcoSim STORY-0086 (`../EcoSim/backlog/STORY-0086.md`).

Filed from the EcoSim -> FlexDesk 0.16 migration analysis (2026-10-17).

## Acceptance criteria

- [x] Arrow keys move selection and Home/End jump to the ends
- [x] update() keeps the selection when the active id still exists and selects the first item otherwise
- [x] A pane is mounted only on its first selection
- [x] No bus subscription is made unless the caller passes an event name
- [x] createBottomPanelTabs's tests pass on top of the new strip

## History

- 2026-10-17 · norman_agent · status: draft -> refined
- 2026-10-17 · norman_agent · status: refined -> in-progress
- 2026-10-17 · norman_agent · assignee: (none) -> norman_agent
- 2026-10-19 · norman_agent · status: in-progress -> review
- 2026-10-19 · norman_agent · assignee: norman_agent -> norman
- 2026-10-21 · norman_agent · status: review -> done

## Comments

### 2026-10-17T07:55Z · norman_agent (status: draft -> refined)

Refined: 5 acceptance criteria, 5 points, parented to EPIC-0040. Criteria were drafted from the migration analysis and checked by a coverage and a quality critic; correct them before anything is built against them.

### 2026-10-18T02:19Z · norman_agent

Where this stands: built on branch story-0048 @ 42b21fb, but an independent review still finds problems after two fix rounds, so it has not landed. Status and assignee are unchanged.

What I checked: all five criteria hold when I read the code, but none is ticked yet because the branch has not landed. tests/tabs.test.mjs and tests/bottom_panel_tabs.test.mjs pass. `node tests/run.mjs` is GREEN: 119 suites, none SKIPPED. `node build.mjs` succeeds, and I reverted dist/ afterwards. The diff has no edits under backlog/, bugs/ or dist/, no TODOs and no EcoSim vocabulary. widgets.js exports createTabs, TAB_LEVELS, revealInStrip and wheelStripSideways with no name collisions. The README is updated, and STORY-0018 was released in 0.14.0.

Still open: three problems in behaviour this branch adds and documents.

1. css/flexdesk.css:8348: `.twm-tabs__tab--dirty:hover .twm-tabs__dirty { display: none; }` applies to every dirty tab, closable or not. The comment at 8346 says it is meant for "a dirty, closable tab". The close mark is drawn only when `item.closable && onClose` (src/ui/components/tabs.js:206). So hovering a dirty tab that cannot be closed hides its unsaved dot and shows nothing in its place. Done looks like: the dot is hidden only when a close mark is present, e.g. `.twm-tabs__tab--dirty:hover:has(.twm-tabs__close) .twm-tabs__dirty { display: none; }` or a `--closable` modifier set in draw(), plus a §10 assertion in tests/tabs.test.mjs that the dot-hiding rule needs the close mark.
2. src/ui/components/tabs.js:346-349, with update() at 405-414: Delete on the focused closable tab calls onClose. When the caller then removes the item with update(), as README.md shows, the focused button is removed and focus falls to <body>. A jsdom probe confirms it: focus on b, press Delete, and document.activeElement is BODY while active() is 'a'. A keyboard user loses their place in the tablist, which breaks the "ARIA tabs pattern" the README claims ('Keys' bullet). Done looks like: if focus was inside the strip and update() removes the focused tab, focus moves to the new active tab, plus a §7 test (focus a closable tab, press Delete, caller calls update() without it, document.activeElement is the new active tab's button).
3. src/ui/components/tabs.js:412 with 280: update() with no items left calls onSelect(null, null). The JSDoc (`(id, item)`) and README.md:1747 ("onSelect hears changes") do not say the id can be null. Either document that an emptied strip reports `onSelect(null, null)`, or skip the call when nothing is in front, and cover the choice in tests/tabs.test.mjs §3.

### 2026-10-19T09:54Z · norman_agent (status: in-progress -> review)

Landed on main at 51ef144 and handed back for review.

What was built: `createTabs` (src/ui/components/tabs.js), a public tab strip keyed by caller ids, with an optional lazy pane host. It has ARIA tabs keys (arrows wrap, Home/End, Delete/middle-click close), `update(items, activeId)`, `select`/`active`/`setBadge`/`setIndicator`, `onSelect`/`onReselect`/`onClose`/`onReorder`/`onContextMenu`, a compact variant and overflow scrolling. Overflow scrolling is shared with NotebookTabBar through src/ui/utils/strip_scroll.js (`revealInStrip`, `wheelStripSideways`). The bus subscription is opt-in: there is none unless both `eventBus` and `selectEvent` are passed. `createBottomPanelTabs` (src/tiling/bottom_panel_tabs.js) is rebuilt on it and keeps its released behaviour. widgets.js exports createTabs, TAB_LEVELS, revealInStrip and wheelStripSideways. The README documents them in "Tabs: `createTabs` (0.17.0)".

The three findings in the 2026-10-18T02:19Z comment are fixed:
1. A dirty tab's dot is hidden on hover only when the tab has the `--closable` modifier (it has a close mark). tests/tabs.test.mjs §10 checks this.
2. If update() removes the focused tab, focus moves to the tab now in front, and focus that a pane took stays in the pane. tests/tabs.test.mjs §7 checks this.
3. An emptied strip reports `onSelect(null, null)`. The JSDoc and README say so, and tests/tabs.test.mjs §3 checks it.

Later commits also cover two more cases: a pane that destroys the strip while it mounts is destroyed once, never shown and leaves no bus subscription, and a pane keeps the focus it takes on show across an update.

Ticked: all five criteria. Arrow keys and Home/End; update() keeping or falling back to the first item; panes mounting on first selection; no bus subscription without an event name; createBottomPanelTabs's tests passing on the new strip. Each one is covered in tests/tabs.test.mjs or tests/bottom_panel_tabs.test.mjs, and I checked each against the code.

Landed tip on main: 51ef144. Before landing, the branch was rebased onto origin/main (4076442). The README and widgets.js conflicts were resolved so that both sides are kept: the Tabs section sits after the Progress section, and the tabs.js export sits next to tag_input.js. The story's diff against main is identical to the one in the earlier merge commit f76edd3. origin/story-0048 still holds the pre-rebase history (up to f76edd3, including that merge). It was not force-pushed.

Tests: `node tests/run.mjs` (Linux /usr/bin/node) on the rebased tip 51ef144 printed "FLEXDESK TESTS: GREEN — 144 suite(s)" and exited 0, with no SKIPPED lines. I watched it finish. `node build.mjs` exited 0, and dist/ was reverted afterwards. The build ran while the suite was running, so I also reran every suite that reads dist/ against the committed dist/, and all passed. tests/tabs.test.mjs and tests/bottom_panel_tabs.test.mjs also pass on their own.

App check: none in this run. The strip was checked only in jsdom; no FlexDesk demo or EcoSim app was launched.

### 2026-10-21T07:42Z · norman_agent (status: review -> done)

norman decided on 2026-10-21 (Claude Code session) to release FlexDesk 0.17.0 now and to accept every story on the 0.17.0 list whose code is on main and whose independent agent review passed, without reviewing each record himself. Its code is on main (audited), so it is done and ships in 0.17.0.
