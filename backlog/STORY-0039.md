---
id: 39
type: story
title: "Toast helpers, the gallery picker and the plot window read nothing from window globals"
status: done
parent: 29
phase:
assignee: norman
reporter: norman
due:
points: 3
subsystem: widgets
labels: [injection]
links: [blocked-by 62, relates-to BUG-0022]
created: 2026-10-17
updated: 2026-10-21T07:42Z
---

## Description

toast.js finds its bus via window.__ecoagent, gallery_picker.js calls window.pywebview.api.gallery_list when no entries are passed, and PlotPopoutWindow subscribes to fixed 'streaming:delta'/'streaming:complete' names. The toast helpers get their bus from the mounted NotificationCenter (or an explicit setToastBus), the gallery picker requires entries or a host capability, and the streaming event names become options next to refreshEvent. The HP filter call is removed by STORY-0062.

Related EcoSim records: EcoSim STORY-0071 (`../EcoSim/backlog/STORY-0071.md`).

Filed from the EcoSim -> FlexDesk 0.16 migration analysis (2026-10-17).

## Acceptance criteria

- [x] `git grep -n -e window.__ecoagent -e window.pywebview -- src` returns nothing outside src/host
- [x] toastError('x') after NotificationCenter.mount shows a toast with no global set
- [x] mountGalleryPicker without entries and without a host capability shows its empty label and logs one warning
- [x] A PlotPopoutWindow given streamEvents {delta:'sim:delta', complete:'sim:done'} re-renders on those events
- [x] Calling toastError before any NotificationCenter exists logs to the console and throws nothing

## History

- 2026-10-17 · norman_agent · status: draft -> refined
- 2026-10-18 · norman_agent · status: refined -> in-progress
- 2026-10-18 · norman_agent · assignee: (unset) -> norman_agent
- 2026-10-18 · norman_agent · status: in-progress -> review
- 2026-10-18 · norman_agent · assignee: norman_agent -> norman
- 2026-10-21 · norman_agent · status: review -> done

## Comments

### 2026-10-17T07:55Z · norman_agent (status: draft -> refined)

Refined: 5 acceptance criteria, 3 points, parented to EPIC-0029. Blocked by STORY-0062. Criteria were drafted from the migration analysis and checked by a coverage and a quality critic; correct them before anything is built against them.

### 2026-10-18T04:14Z · norman_agent (status: in-progress -> review)

Built on branch `story-0039`, rebased onto origin/main and landed on main as b08e546 (fast-forward). Nothing under src/ outside src/host reads app globals any more.

1. Toasts: src/ui/components/toast.js keeps its bus in the module and exports setToastBus(bus) (returns the bus it replaced) and getToastBus(). NotificationCenter.mount hands its eventBus to the toast helpers; dispose takes it back unless a different bus was set since. With no bus set, the helpers log to the console and throw nothing.
2. Gallery picker: src/ui/components/gallery_picker.js takes `entries`, or `opts.host` with a new optional `gallery: {list(kind)}` capability in HOST_CONTRACT (src/host/host.js). With neither, or when list() throws, it shows emptyLabel and logs one console.warn.
3. Plot window: src/charts/plot_popout_window.js takes `streamEvents: {delta, complete}` next to refreshEvent. Defaults stay 'streaming:delta'/'streaming:complete'; a name passed as null is not listened for.

README: toast bus paragraph in Notifications, `gallery` in the createHost snippet, and a new section "No application globals: the gallery picker and plot-window events (0.17.0)".

Ticked all 5 criteria: the git grep (re-checked on the rebased tip: nothing outside src/host), toastError after NotificationCenter.mount, the gallery picker empty label plus one warning, PlotPopoutWindow re-rendering on custom streamEvents, and toastError with no NotificationCenter logging and not throwing. The last four are covered by the new suite tests/no_app_globals.test.mjs, which fails against the old src.

Decisions to check: (a) the capability is named `gallery` with required ['list']; neither shipped adapter offers it, since gallery_list is an application bridge method, so embedders use createHost({...adapterHost, gallery}). (b) The streamEvents defaults keep the old names so existing callers keep working. (c) A mount given entries never asks the host.

Linked: finishes the rest of BUG-0022 (the bug record was not edited here). The blocker STORY-0062 is already on main.

Tests: `node tests/run.mjs` (Linux node) on the rebased tip: FLEXDESK TESTS: GREEN, 137 suites, 0 lines with ': SKIPPED'. `node build.mjs` exits 0; dist/ was restored and not committed.

App check: the app was not launched. The tests are the only check.

Related EcoSim work: EcoSim STORY-0071 (`../EcoSim/backlog/STORY-0071.md`). Callers should pass streamEvents if their bus names differ from the defaults, and for the gallery picker pass a `host` built with a `gallery` capability, or pass `entries`.

### 2026-10-21T07:42Z · norman_agent (status: review -> done)

norman decided on 2026-10-21 (Claude Code session) to release FlexDesk 0.17.0 now and to accept every story on the 0.17.0 list whose code is on main and whose independent agent review passed, without reviewing each record himself. Its code is on main (audited), so it is done and ships in 0.17.0.
