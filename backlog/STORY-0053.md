---
id: 53
type: story
title: "NotificationCenter toasts can carry live, collapsible progress"
status: done
parent: 51
phase:
assignee: norman
reporter: norman
due:
points: 3
subsystem: notifications
labels: [notifications, progress]
links: [blocked-by 52]
created: 2026-10-17
updated: 2026-10-21T07:42Z
---

## Description

show() accepts progress (fraction, {value,total} or null for indeterminate), a status line and a counts label; update(id, patch) changes only the affected nodes; progress toasts are persistent, collapsible, keep their state across other toasts' renders, and can finish into success/error with optional auto-dismiss. Interaction with STORY-0014's '+N more' collapse: a running progress toast is never folded into the '+N more' summary; it counts toward maxVisible, and finished progress toasts fold like any other.

Related EcoSim records: EcoSim STORY-0059 (`../EcoSim/backlog/STORY-0059.md`).

Filed from the EcoSim -> FlexDesk 0.16 migration analysis (2026-10-17).

## Acceptance criteria

- [x] update(id, {progress:0.5}) moves the bar without re-rendering other toasts
- [x] A new info toast does not reset a progress toast's collapsed state or bar
- [x] update(id, {progress:1, severity:'success', durationMs:3000}) shows success and dismisses after 3 seconds
- [x] With overflow 'collapse' and four info toasts, a running progress toast stays visible and is not counted in '+N more'
- [x] An action button on a progress toast calls its handler

## History

- 2026-10-17 · norman_agent · status: draft -> refined
- 2026-10-18 · norman_agent · status: refined -> in-progress
- 2026-10-18 · norman_agent · assignee: (none) -> norman_agent
- 2026-10-18 · norman_agent · status: in-progress -> review
- 2026-10-18 · norman_agent · assignee: norman_agent -> norman
- 2026-10-21 · norman_agent · status: review -> done

## Comments

### 2026-10-17T07:55Z · norman_agent (status: draft -> refined)

Refined: 5 acceptance criteria, 3 points, parented to EPIC-0051. Blocked by STORY-0052. Criteria were drafted from the migration analysis and checked by a coverage and a quality critic; correct them before anything is built against them.

### 2026-10-18T05:25Z · norman_agent

Handing back to norman for review.

Built: NotificationCenter progress toasts (src/ui/notification_center.js). show({progress}) takes a 0..1 fraction, {value,total} or null (indeterminate) and draws a ProgressBar, with a status line and a counts label. update(id, patch) patches only that toast's nodes. A progress toast is persistent and collapsible, and keeps its bar and collapsed state when other toasts render. It finishes when a patch gives it success, error or fatal, and a durationMs in that patch auto-dismisses it. With overflow 'collapse', a running progress toast is never held behind '+N more' and is not counted in it. It counts toward maxVisible, and once finished it folds like any other toast. Review fixes in the second commit: show() and update() share #progressFields, so a plain toast upgraded with update() comes out expanded. A finished bar keeps its end state for good (outcome), and a later severity only restyles the toast. A held toast that starts running comes on screen (#rebalance). New §8 covers update() on plain toasts. README updated, and tests/notification_progress.test.mjs added.

Design decision for you: warn no longer finishes a progress toast; only success, error and fatal do. If EcoSim STORY-0059 needs a toast ended by Stop, add a criterion here (or open a follow-up) and map warn to 'cancelled' in OUTCOME_BAR_STATE in src/ui/notification_center.js.

Ticked: all 5 criteria. Each is covered by tests/notification_progress.test.mjs (§2 in-place update without re-rendering other toasts, §3 a new info toast keeps the collapsed state and bar, §4 success plus 3 s dismiss, §5 collapse overflow with four info toasts, §6 action handler).

Branch: story-0053, rebased onto origin/main (conflicts in README.md and notification_center.js with STORY-0039's toast-bus changes, resolved keeping both). Landed on main at 82886bc (fast-forward).

Tests: `node tests/run.mjs` (Linux /usr/bin/node) exited 0, "FLEXDESK TESTS: GREEN — 138 suite(s)", 0 SKIPPED lines. `node build.mjs` exited 0, and dist/ was restored afterwards (not committed).

App check: the app itself was not launched. Behaviour was verified in jsdom by the suite only.

### 2026-10-21T07:42Z · norman_agent (status: review -> done)

norman decided on 2026-10-21 (Claude Code session) to release FlexDesk 0.17.0 now and to accept every story on the 0.17.0 list whose code is on main and whose independent agent review passed, without reviewing each record himself. Its code is on main (audited), so it is done and ships in 0.17.0.
