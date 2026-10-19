---
id: 34
type: story
title: "Panels can be offered or withheld per content kind, with the toggle showing why"
status: review
parent: 29
phase:
assignee: norman
reporter: norman
due:
points: 5
subsystem: shell
labels: [shell, panels]
links: []
created: 2026-10-17
updated: 2026-10-18T15:13Z
---

## Description

Panels are per-desktop booleans that togglePanel flips unconditionally, so an app cannot say 'this page has no console'. A kind declares panels it offers ({bottom: false | {reason}}) and content can override at runtime (wm.setPanelAvailability). Unavailable panels are not inserted, togglePanel returns false, toggles are disabled with the reason, a remembered 'open' state returns when available again, and wm.isPanelAvailable(side) plus a change event exist. The standalone PanelStateMachine is retired.

Related EcoSim records: EcoSim STORY-0040 (`../EcoSim/backlog/STORY-0040.md`); EcoSim STORY-0041 (`../EcoSim/backlog/STORY-0041.md`).

Filed from the EcoSim -> FlexDesk 0.16 migration analysis (2026-10-17).

## Acceptance criteria

- [x] With the primary kind declaring bottom: {reason:'No console here'}, the bottom toggle is disabled with that tooltip
- [x] A shortcut an embedder binds to wm.togglePanel('bottom') and the palette chip do nothing while it is unavailable
- [x] A bottom panel open before switching to such a kind disappears and comes back when switching back
- [x] togglePanel('bottom') returns false while unavailable and changes no persisted state
- [x] With no declarations, every panel is available as today
- [x] A change of availability emits one notification embedders can subscribe to

## History

- 2026-10-17 · norman_agent · status: draft -> refined
- 2026-10-17 · norman_agent · status: refined -> in-progress
- 2026-10-17 · norman_agent · assignee: (none) -> norman_agent
- 2026-10-18 · norman_agent · status: in-progress -> review
- 2026-10-18 · norman_agent · assignee: norman_agent -> norman

## Comments

### 2026-10-17T07:55Z · norman_agent (status: draft -> refined)

Refined: 6 acceptance criteria, 5 points, parented to EPIC-0029. Criteria were drafted from the migration analysis and checked by a coverage and a quality critic; correct them before anything is built against them.

### 2026-10-17T21:46Z · norman_agent

Status: needs_owner. The work is done and pushed as fab9e70 on story-0034. Two things are open. First, the full test run had not finished when I had to report. Second, criterion 2 needs an answer from norman, because FlexDesk has no bottom-panel shortcut.

What was built:
- Panel declarations per kind: KindDef.panels takes {left|right|bottom: true | false | {reason}}, and createTaxonomy rejects bad entries when it starts. A kind that says nothing about a side takes its top-nav kind's setting. taxonomy.panelOffer(kind, side) reads it.
- New WM methods: wm.isPanelAvailable(side), wm.getPanelAvailability(side) returning {available, reason}, wm.setPanelAvailability(side, offer) where null clears the override, and wm.onPanelAvailabilityChange(fn), which returns an unsubscribe.
- Change notification: each change fires one call, also emitted on the bus as 'wm:panels:availability' with {panels, changed}.
- Behaviour while withheld: _canonicalize leaves out panels that are withheld, and _notifyChange keeps the layout and the announcement in step whenever the primary kind changes. desktop.panels still remembers the panel was open, so it comes back open. togglePanel returns false and does nothing while withheld, and true when it flips. isPanelOpen means open and available.
- Toggles and chips: the shell's toggle buttons and the palette chip get aria-disabled="true" with the reason as tooltip (data-tooltip on twm-has-tooltip buttons, title otherwise), and the button's own tooltip comes back afterwards. I used aria-disabled rather than disabled so the tooltip can still be hovered. Added a .twm-chip[aria-disabled] style to overrides.css and flexdesk.css.
- Retired: PanelStateMachine, PANEL_STATES and PANEL_TRANSITIONS are deleted and removed from widgets.js. This breaks that public API, but the record explicitly calls for it, and nothing in the repo used them.
- Docs: new README section "Panels a page does not offer (0.17.0)".
- No application vocabulary added. dist/ is not committed.

Question for norman: FlexDesk's keymap (src/tiling/keymap.js) has no bottom-panel shortcut, and neither does EcoSim. Criterion 2 is therefore only true because togglePanel refuses. My test binds a shortcut the way an embedder would (Alt+J calling wm.togglePanel) and shows it does nothing. Should FlexDesk add its own panel shortcuts? If so, which keys (e.g. Alt+J or Ctrl+J for bottom), and should they go in KEYMAP_SHORTCUTS? Or does the criterion mean the embedder's own shortcut that calls wm.togglePanel?

Branch: story-0034 @ fab9e70. Before closing: finish the full `node tests/run.mjs` and `node build.mjs` in /mnt/c/Users/Norman/repos/FlexDesk-story-0034 (then `git checkout -- dist`). STORY-0035 also edits src/tiling/wm.js (_canonicalize and panel sizes), so expect a merge conflict there. Nothing landed on the default branch. Waiting on norman.

### 2026-10-18T09:31Z · norman_agent

Criterion 2 amended by norman (Claude Code session, 2026-10-18), answering the question above: it means a shortcut the embedder binds to wm.togglePanel, not a new built-in key. FlexDesk adds no panel shortcut (its default keymap stays as it is). Old wording: "The bottom-panel shortcut and palette chip do nothing while it is unavailable".

### 2026-10-18T15:13Z · norman_agent (status: in-progress -> review)

Landed on main and handed back for review. This replaces the needs_owner note of 2026-10-17: the full suite is now green, and the criterion 2 question was answered by the amendment above.

What was built (unchanged from the note above): KindDef.panels per kind ({left|right|bottom: true | false | {reason}}, a side not named is inherited from the top-nav kind, validated by createTaxonomy); wm.isPanelAvailable, getPanelAvailability, setPanelAvailability (null clears the runtime override) and onPanelAvailabilityChange; one announcement per change, also on the bus as 'wm:panels:availability' with {panels, changed}; withheld panels are left out of the layout while desktop.panels keeps the remembered open state; togglePanel returns false and changes nothing while withheld (true when it flips); the shell toggles and the palette chip get aria-disabled="true" with the reason as tooltip; PanelStateMachine, PANEL_STATES and PANEL_TRANSITIONS retired and removed from widgets.js; README section "Panels a page does not offer (0.17.0)". FlexDesk adds no built-in panel shortcut, as amended.

Ticked: all six criteria. Each is driven against a real shell in tests/panel_availability.test.mjs (criterion 2 by an embedder-bound shortcut calling wm.togglePanel, plus the palette chip).

Landing: rebased story-0034 onto origin/main (which had gained STORY-0036 and BUG-0027 code since the last merge). The rebase replayed the one feature commit and conflicted in README.md, src/tiling/kind_taxonomy.js, src/tiling/wm.js and widgets.js; I resolved them to the already-reviewed merge result of 9e8c46c plus main's newer changes (README keeps both sections; widgets.js keeps wizard.js and drops panel_state_machine.js). The rebased tree differs from 9e8c46c by exactly main's delta. Landed tip on main: 4a52761, fast-forward from 5dab00a. origin/story-0034 still holds the pre-rebase history (9e8c46c); it was not pushed again.

Tests: full `node tests/run.mjs` (Linux node) on the rebased tip ran to the end: "FLEXDESK TESTS: GREEN — 141 suite(s)", exit 0, no ': SKIPPED' lines. `node build.mjs` exited 0; dist/ was restored, not committed.

App check: none in the EcoSim app. EcoSim does not use panel availability yet (that is EcoSim STORY-0040/0041), so there is nothing there to observe; the behaviour was checked through the real FlexDesk shell in the test above.

Heads-up: STORY-0035 also edits _canonicalize in src/tiling/wm.js, so it will probably conflict when it lands.
