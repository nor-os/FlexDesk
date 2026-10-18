---
id: 67
type: story
title: "An optional dialogs.openFile capability and a pickFile helper with browser fallback"
status: review
parent: 23
phase:
assignee: norman
reporter: norman
due:
points: 3
subsystem: host
labels: [host, dialogs]
links: []
created: 2026-10-17
updated: 2026-10-18T02:42Z
---

## Description

Adds optional dialogs.openFile({accept, kind, encoding}) -> {ok, name, path?, text|data} | {ok:false, cancelled} | {ok:false, error} | null to HOST_CONTRACT. The pywebview adapter maps it to a bridge method whose name and signature FlexDesk defines and documents in the README host contract next to save_file_dialog; the Photino adapter maps it to request('dialogs','openFile'). pickFile(host, opts) falls back to a transient <input type=file> with the same result shape.

Related EcoSim records: EcoSim STORY-0068 (`../EcoSim/backlog/STORY-0068.md`); EcoSim STORY-0091 (`../EcoSim/backlog/STORY-0091.md`); EcoSim STORY-0061 (`../EcoSim/backlog/STORY-0061.md`).

Filed from the EcoSim -> FlexDesk 0.16 migration analysis (2026-10-17).

## Acceptance criteria

- [x] pickFile under NULL_HOST opens a browser file chooser and resolves {ok:true, name, text}
- [x] A host returning null falls back to the browser chooser
- [x] Cancelling resolves {ok:false, cancelled:true}
- [x] encoding 'base64' returns data as base64
- [x] validateCapability accepts a dialogs capability without openFile
- [x] The README host contract names the pywebview bridge method and its arguments

## History

- 2026-10-17 · norman_agent · status: draft -> refined
- 2026-10-17 · norman_agent · status: refined -> in-progress
- 2026-10-17 · norman_agent · assignee: (none) -> norman_agent
- 2026-10-18 · norman_agent · status: in-progress -> review
- 2026-10-18 · norman_agent · assignee: norman_agent -> norman

## Comments

### 2026-10-17T07:55Z · norman_agent (status: draft -> refined)

Refined: 6 acceptance criteria, 3 points, parented to EPIC-0023. Criteria were drafted from the migration analysis and checked by a coverage and a quality critic; correct them before anything is built against them.

### 2026-10-18T02:42Z · norman_agent (status: in-progress -> review)

Built: an optional `dialogs.openFile({accept, kind, encoding})` capability in the host contract, and `pickFile(host, opts)` in src/host/file_picker.js. pickFile calls `host.dialogs.openFile` as a method when the host provides it, and falls back to a transient browser `<input type=file>` with the same result shape when the host has no openFile or answers null. `accept` may be a list or a comma-separated string; it is normalised by one `acceptList()` helper, so the native host always receives a trimmed list and the browser input gets the same entries joined. The README host contract documents the pywebview bridge method and its arguments, and photino_host.md covers the Photino mapping. After review, two fixes went in (commit ca64fdc before the rebase): openFile is now called bound to its host, and a string `accept` reaches the host as a proper list. Both have new checks in tests/pick_file.test.mjs §2.

Ticked all 6 criteria: pickFile under NULL_HOST opens a browser chooser and resolves {ok:true, name, text}; a host returning null falls back to the browser chooser; cancelling resolves {ok:false, cancelled:true}; encoding 'base64' returns data as base64; validateCapability accepts a dialogs capability without openFile; the README host contract names the pywebview bridge method and its arguments.

Branch `story-0067`, rebased onto origin/main and landed on main by fast-forward at 7168564.

Tests: after the rebase, `node tests/run.mjs` in the worktree exited 0 with "FLEXDESK TESTS: GREEN — 134 suite(s)", and no line matched `: SKIPPED` or `  FAIL `. `node build.mjs` succeeded, and dist/ was reverted afterwards (not committed). App check: none was run. The tests cover the browser fallback and the host paths; no live pywebview or Photino host was exercised.
