---
id: 134
type: story
title: "0.17.18 ships the hamburger menu bar (STORY-0133)"
status: done
parent: 68
phase:
assignee: norman
reporter: norman
due:
points: 1
subsystem:
labels: [release]
links: [relates-to 133]
created: 2026-10-27
updated: 2026-10-27T11:40Z
---

## Description

Release 0.17.18: merge STORY-0133, CHANGELOG, version, dist, full suite, publish to npm. norman authorised the release and the npm publish on 2026-10-27 (Claude Code session).

## Acceptance criteria

- [x] CHANGELOG entry, package.json and lock at 0.17.18, dist rebuilt (`node build.mjs --check` OK).
- [x] Full suite: 218 of 219 suites green; exports_packed cannot run here (it calls Windows npm on a WSL path), `npm pack --dry-run` run by hand from the publish copy instead.
- [x] main fast-forwarded and pushed; flexdesk@0.17.18 on npm.

## History

- 2026-10-27 · norman_agent · created (done)

## Comments
