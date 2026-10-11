---
id: 6
type: story
title: "Lane editor follow-ups"
status: draft
parent: 5
phase: 
assignee: 
reporter: norman
points: 
subsystem: flow
labels: [flow, lanes]
links: []
created: 2026-10-11
updated: 2026-10-11T11:56Z
---
## Description

Open points from the lane editor's build and review (`src/flow/lanes/`, shipped in 0.6.0):

- Renaming a parameter does not rewrite `{{old}}` references in step configs (it would need the consumer's
  parameter syntax to rename by name).
- Lane order puts feeders before forks; with both, a fork's vertical line can pass under a feeder lane's card (the
  fixture case "feeders before forks"). Keep the rule, or order children by the column they attach at?
- Two wires taking the gutter route can share a gap segment; they are not spaced apart.
- A source step's own columns are not offered to `upstream-column` widgets (`ctx.columns()` is the INPUT frame);
  Tables' source widgets supply them. Confirm the split.
- No preview is sent after a rename (a label changes no row). Confirm for Tables' provider.

## Acceptance criteria

_(not refined yet)_

## History

- 2026-10-11 · norman_agent · status: (unset) -> draft

## Comments

### 2026-10-11T11:56Z · norman_agent

Filed while setting up FlexDesk's own BugDesk store (2026-10-11). Until today FlexDesk's work was tracked in Tables' backlog; carried over from Tables STORY-0227, which is dropped there: its whole scope is FlexDesk code.
