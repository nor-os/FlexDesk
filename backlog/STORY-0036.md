---
id: 36
type: story
title: "A collapsible section stack for inspector-style panel content"
status: review
parent: 29
phase:
assignee: norman
reporter: norman
due:
points: 5
subsystem: widgets
labels: [widgets, new-component]
links: []
created: 2026-10-17
updated: 2026-10-18T14:54Z
---

## Description

Only tree categories are collapsible today. createSectionStack(container, {sections, stateStore?}) mounts titled sections with header actions that do not toggle, defaultExpanded, persisted expanded state per id (injectable store), a fill section taking remaining height with min-height:0 scrolling, setVisible without losing state, expand/collapse/toggle/isExpanded/dispose and a toggled event. Uses twm-collapsible-* styling.

Related EcoSim records: EcoSim STORY-0040 (`../EcoSim/backlog/STORY-0040.md`).

Filed from the EcoSim -> FlexDesk 0.16 migration analysis (2026-10-17).

## Acceptance criteria

- [x] Clicking a section header toggles it and its arrow; clicking a header action button does not
- [x] Expanded states persist under the given key and are restored on the next mount
- [x] A fill section takes the remaining height and long content scrolls inside it
- [x] setVisible(id,false) hides a section and setVisible(id,true) restores its previous expanded state
- [x] A stateStore that throws on read falls back to each section's defaultExpanded
- [x] dispose() removes every listener and DOM node it created

## History

- 2026-10-17 · norman_agent · status: draft -> refined
- 2026-10-17 · norman_agent · status: refined -> in-progress
- 2026-10-17 · norman_agent · assignee: (none) -> norman_agent
- 2026-10-18 · norman_agent · status: in-progress -> review
- 2026-10-18 · norman_agent · assignee: norman_agent -> norman

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

### 2026-10-18T14:54Z · norman_agent

Landed on main and handed back for review. main is now at 083fbb2.

What was built: `createSectionStack(container, { sections, key, stateStore })` in src/ui/components/section_stack.js, exported from `@flexdesk/widgets` (widgets.js: 48 export lines, '48 modules.'). It draws on the `.twm-collapsible-*` pieces and adds `.twm-section-stack*` rules, kept identical in css/base.css and css/flexdesk.css. A README section documents it, and tests/section_stack.test.mjs covers it. Header actions run their own `onClick(sectionId, event)` and never toggle. Expanded states are written per key through the injected store. A store read may return a promise: writes wait until it settles, and a toggle made in the meantime is kept. A throwing, rejecting or junk read leaves every section on its `defaultExpanded`. One `fill` section takes the remaining height and its body scrolls (`min-height: 0`), and the fill box is never shorter than its header. `setVisible` keeps state. The rest of the API is `expand`/`collapse`/`toggle`/`isExpanded`, a `toggled` event with `{ id, expanded, source }`, and `dispose()`.

Ticked all six criteria. Each one has its own section in tests/section_stack.test.mjs: §2 header vs action click, §3 persist and restore under the key, §4 throwing read, §5 setVisible, §7 fill layout, §8 dispose.

How it landed: I rebased story-0036 onto origin/main locally. Main had gained code since the earlier merge (BUG-0027's ./css/reset export, the SliderField README section). README.md, css/base.css, css/flexdesk.css and widgets.js conflicted on 7a3283c. Both sides only added text, so I kept both. I resolved the CSS files and widgets.js to the approved merge's (019a285) content, and kept main's README sections with the section-stack section after them. Then b497798 applied cleanly. I checked that the rebased tree differs from 019a285 by exactly main's changes since that merge, and nothing else. I fast-forwarded main to the rebased tip: 89657b2 (createSectionStack), then 083fbb2 (write-after-read and fill-box height). origin/story-0036 still holds the pre-rebase history (7a3283c, b497798, merge 019a285). I did not force-push it.

Tests: `node tests/run.mjs` (Linux node v18.19.1) ran in the worktree at 083fbb2 and I watched it finish: 'FLEXDESK TESTS: GREEN — 140 suite(s)', exit 0, no ': SKIPPED' lines and no 'not ok' lines. `node build.mjs` succeeded (flexdesk.css 408.4 kB), and dist/ was restored afterwards, not committed.

App check: no app check in this step. This is a FlexDesk-only component, and nothing in FlexDesk mounts it yet. Using it in EcoSim is EcoSim STORY-0040 (`../EcoSim/backlog/STORY-0040.md`). The fill layout was measured in headless Edge when the component was built, as the README notes.
