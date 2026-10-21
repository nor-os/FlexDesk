---
id: 96
type: story
title: "Dictation: hold-to-talk that types into the focused field"
status: in-progress
parent: 40
phase:
assignee: norman_agent
reporter: norman
due:
points: 3
subsystem: widgets
labels: [widgets, voice, input]
links: []
created: 2026-10-21
updated: 2026-10-21T07:30Z
---

## Description

AI Desk (`../aidesk/backlog/STORY-0185.md`): norman (2026-10-21) wants to dictate "everywhere". A FlexDesk helper, `attachDictation({transcribe, hotkey})`, records while a hotkey is held (or a mic button is toggled) and inserts the text at the cursor of the focused input, textarea, contenteditable, editor, or any element that registers an insert handler (a terminal). FlexDesk records only; the embedder's `transcribe(blob)` turns audio into text, so FlexDesk stays free of any speech service.

## Acceptance criteria

- [ ] While the hotkey is held, audio is recorded; on release `transcribe(blob)` is called and its text is inserted at the cursor of the element that had focus
- [ ] An element can register its own insert handler (a terminal), which is used instead of typing into the DOM
- [ ] A mic button component toggles the same recording and shows a level meter while listening
- [ ] Without microphone permission, or on an origin that is not secure, the helper reports why through the notification center
- [ ] Recording starts within 150 ms of the key press, so the first word is not lost

## History

- 2026-10-21 · norman_agent · filed as draft
- 2026-10-21 · norman_agent · status: draft -> refined
- 2026-10-21 · norman_agent · status: refined -> in-progress
- 2026-10-21 · norman_agent · assignee -> norman_agent

## Comments

### 2026-10-21T07:19Z · norman_agent

Refined: 5 acceptance criteria, 3 points, parented to EPIC-0040. Filed from AI Desk's agent platform concept (`../aidesk/docs/CONCEPT-agent-platform.md`), norman's decisions of 2026-10-21.
