---
id: 36
type: story
title: "A collapsible section stack for inspector-style panel content"
status: in-progress
parent: 29
phase:
assignee: norman_agent
reporter: norman
due:
points: 5
subsystem: widgets
labels: [widgets, new-component]
links: []
created: 2026-10-17
updated: 2026-10-18T03:29Z
---

## Description

Only tree categories are collapsible today. createSectionStack(container, {sections, stateStore?}) mounts titled sections with header actions that do not toggle, defaultExpanded, persisted expanded state per id (injectable store), a fill section taking remaining height with min-height:0 scrolling, setVisible without losing state, expand/collapse/toggle/isExpanded/dispose and a toggled event. Uses twm-collapsible-* styling.

Related EcoSim records: EcoSim STORY-0040 (`../EcoSim/backlog/STORY-0040.md`).

Filed from the EcoSim -> FlexDesk 0.16 migration analysis (2026-10-17).

## Acceptance criteria

- [ ] Clicking a section header toggles it and its arrow; clicking a header action button does not
- [ ] Expanded states persist under the given key and are restored on the next mount
- [ ] A fill section takes the remaining height and long content scrolls inside it
- [ ] setVisible(id,false) hides a section and setVisible(id,true) restores its previous expanded state
- [ ] A stateStore that throws on read falls back to each section's defaultExpanded
- [ ] dispose() removes every listener and DOM node it created

## History

- 2026-10-17 · norman_agent · status: draft -> refined
- 2026-10-17 · norman_agent · status: refined -> in-progress
- 2026-10-17 · norman_agent · assignee: (none) -> norman_agent

## Comments

### 2026-10-17T07:55Z · norman_agent (status: draft -> refined)

Refined: 6 acceptance criteria, 5 points, parented to EPIC-0029. Criteria were drafted from the migration analysis and checked by a coverage and a quality critic; correct them before anything is built against them.

### 2026-10-18T03:29Z · norman_agent

Approved on story-0036 @ b497798 on origin/story-0036, but landing failed: STORY-0036 has not landed.

I rebased story-0036 onto origin/main in /mnt/c/Users/Norman/repos/FlexDesk-story-0036 and the rebase finished, with the new local tip at 49ccd7e. Four files conflicted, and in each one both sides only added text:

- README.md, css/base.css and css/flexdesk.css: I kept main's sections (SliderField, toggle, document outline, tag input, series transforms) and put the branch's section-stack section after them.
- widgets.js: the module count conflicted, so I set it to '45 modules.' by hand, because scripts/gen_barrels.py is not in the repo. Note that main's comment already undercounts by one: it said 44 with 45 export lines, and now says 45 with 46.

The full run of `node tests/run.mjs` (Linux node) was still going when I had to stop. It had reached notification_bell.test.mjs, with no failures up to that point. Because it had not finished, I did not run `node build.mjs`, push the branch or main, pull the main checkout, hand back the record or remove the worktree.

Nothing has been pushed: origin/story-0036 is still at b497798, and the rebased commits exist only in the worktree. The main checkout is unchanged, and the foreign edit to src/ui/utils/auto_scrollbars.js is untouched.

Open, to resume: in the worktree, run the full tests and the build (then `git checkout -- dist`), push with --force-with-lease to story-0036 and then to main, run `git pull --ff-only` in the main checkout, hand back STORY-0036, and remove the worktree.
