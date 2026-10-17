---
id: 33
type: story
title: "mountNavPanel can be driven from outside, hide its strip and omit its filter per mode"
status: draft
parent: 29
phase:
assignee:
reporter: norman
due:
points: 3
subsystem: shell
labels: [shell, nav-panel]
links: []
created: 2026-10-17
updated: 2026-10-17T07:55Z
---

## Description

mountNavPanel switches modes only on a strip click and always renders a shared filter. Its handle gains select(modeId) (same lazy mount/activate path, restoring that mode's filter) and active(); options showModeStrip (default true), showFilter and a per-mode filter: false, and initialMode.

Related EcoSim records: EcoSim STORY-0039 (`../EcoSim/backlog/STORY-0039.md`).

Filed from the EcoSim -> FlexDesk 0.16 migration analysis (2026-10-17).

## Acceptance criteria

- [ ] select('b') mounts mode b on first use, calls its activate and resolves after activate runs
- [ ] select of an unknown id is ignored and returns a resolved promise
- [ ] With showModeStrip false no strip is rendered and select still switches panes
- [ ] A mode with filter: false hides the filter box while active, and the next mode with a filter shows its own saved text
- [ ] Existing callers that pass none of the new options render exactly as before
