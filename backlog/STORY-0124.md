---
id: 124
type: story
title: "A tile breadcrumb whose path is one segment is not drawn: the tile's title already names it"
status: done
parent: 68
phase:
assignee: norman
reporter: norman
due:
points: 1
subsystem: wm
labels: [chrome]
links: []
created: 2026-10-26
updated: 2026-10-27T00:30Z
---

## Description

norman, 2026-10-26 (EcoSim, the Model page): "why the double-header here?" A top-level page's tile shows its title bar ("Model") and, under it, a tile breadcrumb whose only segment is the same page ("Σ Model"). Agreed fix (norman): in FlexDesk.

## Acceptance criteria

- [x] mountTileBreadcrumb hides its strip while the path is a single segment (a top-nav page with no root crumb, no trail and no entity), and shows it again on `refresh()` once there are two or more; the page shell's breadcrumb slot takes no height while hidden.
- [x] A path of two or more segments (a drilled-in entity, a trail, a root crumb) is drawn exactly as before; `renderBreadcrumbSegments` (C37) is unchanged.
- [x] Tests in FlexDesk's suite; docs say so.

## History

- 2026-10-26 · norman_agent · created (draft -> in-progress)

- 2026-10-27 · norman_agent · status: in-progress -> done (released in 0.17.15 (547c050); independent review, one fix round aff25be)
- 2026-10-27 · norman_agent · assignee: norman_agent -> norman

## Comments
