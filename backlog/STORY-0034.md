---
id: 34
type: story
title: "Panels can be offered or withheld per content kind, with the toggle showing why"
status: in-progress
parent: 29
phase:
assignee: norman_agent
reporter: norman
due:
points: 5
subsystem: shell
labels: [shell, panels]
links: []
created: 2026-10-17
updated: 2026-10-18T09:31Z
---

## Description

Panels are per-desktop booleans that togglePanel flips unconditionally, so an app cannot say 'this page has no console'. A kind declares panels it offers ({bottom: false | {reason}}) and content can override at runtime (wm.setPanelAvailability). Unavailable panels are not inserted, togglePanel returns false, toggles are disabled with the reason, a remembered 'open' state returns when available again, and wm.isPanelAvailable(side) plus a change event exist. The standalone PanelStateMachine is retired.

Related EcoSim records: EcoSim STORY-0040 (`../EcoSim/backlog/STORY-0040.md`); EcoSim STORY-0041 (`../EcoSim/backlog/STORY-0041.md`).

Filed from the EcoSim -> FlexDesk 0.16 migration analysis (2026-10-17).

## Acceptance criteria

- [ ] With the primary kind declaring bottom: {reason:'No console here'}, the bottom toggle is disabled with that tooltip
- [ ] A shortcut an embedder binds to wm.togglePanel('bottom') and the palette chip do nothing while it is unavailable
- [ ] A bottom panel open before switching to such a kind disappears and comes back when switching back
- [ ] togglePanel('bottom') returns false while unavailable and changes no persisted state
- [ ] With no declarations, every panel is available as today
- [ ] A change of availability emits one notification embedders can subscribe to

## History

- 2026-10-17 · norman_agent · status: draft -> refined
- 2026-10-17 · norman_agent · status: refined -> in-progress
- 2026-10-17 · norman_agent · assignee: (none) -> norman_agent

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
