---
id: 13
type: story
title: "Desktop groups and fixed desktops: an embedder's desktops beside the user's (C40)"
status: review
parent:
phase:
assignee: norman
reporter: norman
points: 3
subsystem: tiling
labels: [desktops, tables-consumer, additive]
links: []
created: 2026-10-12
updated: 2026-10-12T14:30Z
---

## Description

Tables keeps one desktop per page and wants users to make desktops of their own beside them (Tables
STORY-0283, `../Tables/backlog/STORY-0283.md`; recorded as C40 in Tables' doc 05). The bar drew one chip per
desktop, so it could only show a copy of Tables' rail. With no `group` or `fixed` set anywhere, nothing changes.

| Option | Does |
|---|---|
| desktop `group` | Desktops sharing it are one chip, labelled by it, returning to the member last on screen; one stop for Ctrl+Left/Right (`DesktopManager.chips()`) |
| desktop `fixed` | No rename or delete on its chip; never a *Move to desktop* target; `removeDesktop` / `moveFocusedToDesktop` / `moveWindowToDesktop` refuse it |
| `createShell({ desktopBar: { switchOnAdd } })` | `+` puts the new desktop on screen; `wm.addDesktop({ switchTo })` answers its index |
| `addDesktop` labels | Numbered among ungrouped desktops |
| *Move to desktop* | Carries every tab of the pane and appends to the target's main pane; replaces only a seed (it used to overwrite the target with the active tab alone) |
| `dispose()` | Removes the bar, whose listeners closed over the old WM |

## Acceptance criteria

- [x] Ungrouped, the bar's markup is unchanged (asserted)
- [x] A group is one chip that returns to its member last on screen; Ctrl+Left/Right steps between chips
- [x] A fixed desktop offers no rename/delete, is no *Move to* target, and the three verbs refuse it
- [x] `group` and `fixed` survive serialize → deserialize; an ungrouped desktop serializes as before
- [x] *Move to desktop* keeps every tab and the target's own
- [x] Released to npm; `tests/run.mjs` green and `build --check` OK

## History

- 2026-10-12 · norman_agent · status: (new) -> in-progress
- 2026-10-12 · norman_agent · status: in-progress -> review
- 2026-10-12 · norman_agent · assignee: norman_agent -> norman

## Comments

### 2026-10-12T16:20Z · norman_agent

Released as 0.10.0 (`00c7fe3`) and pinned in Tables; seen there in headless Edge (Tables STORY-0283).
