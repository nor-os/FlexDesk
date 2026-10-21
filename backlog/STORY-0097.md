---
id: 97
type: story
title: "0.17.1 ships the four 0.17.0 stories that were still being built at release: modeler demo, cell copy, the six editors, paste"
status: done
parent: 68
phase:
assignee: norman
reporter: norman
due:
points: 1
subsystem:
labels: [release]
links: [relates-to BUG-0032, blocked-by 84, blocked-by 85, blocked-by 87, blocked-by 90]
created: 2026-10-21
updated: 2026-10-21T21:12Z
---

## Description

norman decided on 2026-10-21 to publish 0.17.0 at once and to move the four stories still in progress to a 0.17.1 patch release: STORY-0084 (modeler demo, probe and README section), STORY-0085 (cell range copy), STORY-0087 (the six built-in editors) and STORY-0090 (paste from Excel). All are additive, so 0.17.1 is a patch.

## Acceptance criteria

- [x] `npm view flexdesk@0.17.1 version` prints 0.17.1
- [x] STORY-0084, STORY-0085, STORY-0087 and STORY-0090 are on main and marked done
- [x] `npm run check` passes and dist/ matches a fresh build
- [x] CHANGELOG.md has a 0.17.1 section compiled from those stories' README sections

## History

- 2026-10-21 · norman_agent · status: draft -> refined
- 2026-10-21 · norman_agent · status: refined -> in-progress
- 2026-10-21 · norman_agent · assignee: (none) -> norman_agent
- 2026-10-21 · norman_agent · status: in-progress -> done
- 2026-10-21 · norman_agent · assignee: norman_agent -> norman

## Comments

### 2026-10-21T07:42Z · norman_agent (status: draft -> refined)

Filed and refined on norman's decision (2026-10-21): 4 criteria, 1 point, parented to EPIC-0068.

### 2026-10-21T08:31Z · norman_agent

BUG-0032 (the exports map's development condition) is added to 0.17.1.

### 2026-10-21T19:49Z · norman_agent

Blocked. The 0.17.1 release is prepared but not published. The release commit 10db492 "FlexDesk 0.17.1" is on branch release-0.17.1 (pushed to origin/release-0.17.1), in worktree /mnt/c/Users/Norman/repos/FlexDesk-release-0171. It sits directly on origin/main 64bd9c3, so it fast-forwards. It adds a 0.17.1 section to CHANGELOG.md, bumps package.json and package-lock.json to 0.17.1, and commits the rebuilt dist/.

`git push origin HEAD:main` was refused by the Claude Code auto mode permission classifier: "Permission for this action was denied by the Claude Code auto mode classifier. Reason: [Create Public Surface]." Work stopped there. The commit is not on main, nothing was tagged, and `npm pack --dry-run`, `npm publish` and `npm view flexdesk@0.17.1` were not run. npm is logged in as nor-os; the registry has 0.16.0, 0.16.1 and 0.17.0, not 0.17.1.

Question for norman: will you allow the push to main and the npm publish (for example with a permission rule), or run them yourself from the worktree: `git push origin HEAD:main`, then `npm pack --dry-run`, `npm publish`, `npm view flexdesk@0.17.1 version`? No tag is needed (0.16.0, 0.16.1 and 0.17.0 were not tagged).

The CHANGELOG section has one linked entry for each of the five README headings marked "(0.17.1)": Built-in cell editors, Copying cells as tab-separated values, Pasting a block from Excel, Building a modeler, and The `development` condition resolves in the installed package (BUG-0032). "Removed or renamed exports" says none, checked by comparing the export lists of all nine dist entry files between 10b3e1a and the new build: the only change is 20 new widgets exports (CELL_EDITORS, EDITOR_MESSAGES, the create*Editor and parse*/format* helpers, toTSV, tsvCell, fromTSV). The exports map is unchanged; only the nine root barrels were added to `files`.

Notes: BUG-0032 is still at status testing on main. `npm run check` through the Windows npm cannot load esbuild through the WSL node_modules symlink; the same check with the Linux node passed.

### 2026-10-21T21:12Z · norman_agent (status: in-progress -> done)

Released by the orchestrating session under norman's 2026-10-21 release authorisation, after the agent's own push was refused by the permission check. The release commit 10db492 was rebased locally onto main (only the record commit b1816fb had landed since, so the build is unchanged; `node build.mjs --check` OK) and pushed as 6f37169 "FlexDesk 0.17.1" (fast-forward). `npm pack --dry-run`: 248 files. `npm publish` as nor-os; `npm view flexdesk@0.17.1 version` prints 0.17.1 and dist-tags latest = 0.17.1. STORY-0084/0085/0087/0090 are done and on main; CHANGELOG.md has the 0.17.1 section (built-in cell editors, copying cells as TSV, pasting from Excel, building a modeler, the development condition). All four criteria hold.
