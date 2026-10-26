---
id: 124
type: story
title: "A tile breadcrumb whose path is one segment is not drawn: the tile's title already names it"
status: in-progress
parent: 68
phase:
assignee: norman_agent
reporter: norman
due:
points: 1
subsystem: wm
labels: [chrome]
links: []
created: 2026-10-26
updated: 2026-10-26T22:00Z
---

## Description

norman, 2026-10-26 (EcoSim, the Model page): "why the double-header here?" A top-level page's tile shows its title bar ("Model") and, under it, a tile breadcrumb whose only segment is the same page ("Σ Model"). Agreed fix (norman): in FlexDesk.

## Acceptance criteria

- [ ] mountTileBreadcrumb hides its strip while the path is a single segment (a top-nav page with no root crumb, no trail and no entity), and shows it again on `refresh()` once there are two or more; the page shell's breadcrumb slot takes no height while hidden.
- [ ] A path of two or more segments (a drilled-in entity, a trail, a root crumb) is drawn exactly as before; `renderBreadcrumbSegments` (C37) is unchanged.
- [ ] Tests in FlexDesk's suite; docs say so.

## History

- 2026-10-26 · norman_agent · created (draft -> in-progress)

## Comments
