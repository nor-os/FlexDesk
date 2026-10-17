---
id: 39
type: story
title: "Toast helpers, the gallery picker and the plot window read nothing from window globals"
status: refined
parent: 29
phase:
assignee:
reporter: norman
due:
points: 3
subsystem: widgets
labels: [injection]
links: [blocked-by 62, relates-to BUG-0022]
created: 2026-10-17
updated: 2026-10-17T07:55Z
---

## Description

toast.js finds its bus via window.__ecoagent, gallery_picker.js calls window.pywebview.api.gallery_list when no entries are passed, and PlotPopoutWindow subscribes to fixed 'streaming:delta'/'streaming:complete' names. The toast helpers get their bus from the mounted NotificationCenter (or an explicit setToastBus), the gallery picker requires entries or a host capability, and the streaming event names become options next to refreshEvent. The HP filter call is removed by STORY-0062.

Related EcoSim records: EcoSim STORY-0071 (`../EcoSim/backlog/STORY-0071.md`).

Filed from the EcoSim -> FlexDesk 0.16 migration analysis (2026-10-17).

## Acceptance criteria

- [ ] `git grep -n -e window.__ecoagent -e window.pywebview -- src` returns nothing outside src/host
- [ ] toastError('x') after NotificationCenter.mount shows a toast with no global set
- [ ] mountGalleryPicker without entries and without a host capability shows its empty label and logs one warning
- [ ] A PlotPopoutWindow given streamEvents {delta:'sim:delta', complete:'sim:done'} re-renders on those events
- [ ] Calling toastError before any NotificationCenter exists logs to the console and throws nothing

## History

- 2026-10-17 · norman_agent · status: draft -> refined

## Comments

### 2026-10-17T07:55Z · norman_agent (status: draft -> refined)

Refined: 5 acceptance criteria, 3 points, parented to EPIC-0029. Blocked by STORY-0062. Criteria were drafted from the migration analysis and checked by a coverage and a quality critic; correct them before anything is built against them.
