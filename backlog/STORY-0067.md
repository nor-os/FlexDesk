---
id: 67
type: story
title: "An optional dialogs.openFile capability and a pickFile helper with browser fallback"
status: refined
parent: 23
phase:
assignee:
reporter: norman
due:
points: 3
subsystem: host
labels: [host, dialogs]
links: []
created: 2026-10-17
updated: 2026-10-17T07:55Z
---

## Description

Adds optional dialogs.openFile({accept, kind, encoding}) -> {ok, name, path?, text|data} | {ok:false, cancelled} | {ok:false, error} | null to HOST_CONTRACT. The pywebview adapter maps it to a bridge method whose name and signature FlexDesk defines and documents in the README host contract next to save_file_dialog; the Photino adapter maps it to request('dialogs','openFile'). pickFile(host, opts) falls back to a transient <input type=file> with the same result shape.

Related EcoSim records: EcoSim STORY-0068 (`../EcoSim/backlog/STORY-0068.md`); EcoSim STORY-0091 (`../EcoSim/backlog/STORY-0091.md`); EcoSim STORY-0061 (`../EcoSim/backlog/STORY-0061.md`).

Filed from the EcoSim -> FlexDesk 0.16 migration analysis (2026-10-17).

## Acceptance criteria

- [ ] pickFile under NULL_HOST opens a browser file chooser and resolves {ok:true, name, text}
- [ ] A host returning null falls back to the browser chooser
- [ ] Cancelling resolves {ok:false, cancelled:true}
- [ ] encoding 'base64' returns data as base64
- [ ] validateCapability accepts a dialogs capability without openFile
- [ ] The README host contract names the pywebview bridge method and its arguments

## History

- 2026-10-17 · norman_agent · status: draft -> refined

## Comments

### 2026-10-17T07:55Z · norman_agent (status: draft -> refined)

Refined: 6 acceptance criteria, 3 points, parented to EPIC-0023. Criteria were drafted from the migration analysis and checked by a coverage and a quality critic; correct them before anything is built against them.
