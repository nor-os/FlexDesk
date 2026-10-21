---
id: 57
type: story
title: "A conversation view with streaming messages and a composer"
status: done
parent: 54
phase:
assignee: norman
reporter: norman
due:
points: 5
subsystem: widgets
labels: [widgets, new-component]
links: []
created: 2026-10-17
updated: 2026-10-21T07:42Z
---

## Description

Role-tagged messages (append, replaceAll, clear), beginStream/appendChunk/endStream re-rendering only the streaming message, caller render callback for bodies and a per-message extra slot, auto-scroll pinned to bottom within a threshold with a jump-to-latest affordance, readable/settable scroll position, growing textarea composer (Enter submits, Shift+Enter newline, Esc cancels), setBusy switching send to cancel, submit/cancel callbacks. No markdown or LLM dependency.

Related EcoSim records: EcoSim STORY-0088 (`../EcoSim/backlog/STORY-0088.md`).

Filed from the EcoSim -> FlexDesk 0.16 migration analysis (2026-10-17).

## Acceptance criteria

- [x] appendChunk updates only the last message's DOM
- [x] Scrolling up during streaming stops auto-scroll and shows jump-to-latest; clicking it resumes
- [x] Enter submits the text and clears the composer; Shift+Enter inserts a newline
- [x] setBusy(true) turns send into cancel, and Esc or a click calls cancel once
- [x] A render callback that throws shows the message as plain text and the view keeps working
- [x] replaceAll restores 100 messages and scrolls to the bottom

## History

- 2026-10-17 · norman_agent · status: draft -> refined
- 2026-10-17 · norman_agent · status: refined -> in-progress
- 2026-10-17 · norman_agent · assignee: (none) -> norman_agent
- 2026-10-19 · norman_agent · status: in-progress -> review
- 2026-10-19 · norman_agent · assignee: norman_agent -> norman
- 2026-10-21 · norman_agent · status: review -> done

## Comments

### 2026-10-17T07:55Z · norman_agent (status: draft -> refined)

Refined: 6 acceptance criteria, 5 points, parented to EPIC-0054. Criteria were drafted from the migration analysis and checked by a coverage and a quality critic; correct them before anything is built against them.

### 2026-10-18T02:20Z · norman_agent

Where this stands: built on branch `story-0057` (tip 3d1796b), but an independent review still finds problems after two fix rounds, so it is not landed. Status and assignee are unchanged.

What holds: all six acceptance criteria pass in tests/conversation_view.test.mjs (107 ok, exit 0), but none are ticked here until the defects below are fixed and the view is reviewed again. The full suite is green: `node tests/run.mjs` reports 'FLEXDESK TESTS: GREEN — 119 suite(s)', exit 0, no ': SKIPPED'. `node build.mjs` succeeds; dist/ was reverted and the new chunk files deleted afterwards, so the worktree is clean. Nothing is touched under backlog/, bugs/ or dist/, there are no TODOs and no application vocabulary, and widgets.js and README are updated.

Still open:

1. src/ui/components/conversation_view.js:324-328 (onRootKey): an Esc that cancels calls only preventDefault(), so the keydown still bubbles to `document`. ManagedWindow._onKeyDown (src/ui/components/managed_window.js:1629-1631, registered on document at :343) and SlideOutPanel #handleEsc (src/ui/components/slide_out_panel.js:168-172, :122) close on Escape and do not check defaultPrevented. Reproduced in jsdom: view inside a shown ManagedWindow, setBusy(true), Escape in the composer gives cancels=1 and the window closes (onClose called, isVisible=false). So pressing Esc to stop a stream also closes the window holding the conversation. Done means: when the view handles an Esc while busy, it also calls stopPropagation(), including a repeat Esc after the one cancel. Add a test that mounts the view inside a ManagedWindow (or a document-level Escape listener), presses Esc while busy, and asserts the window stays open (or the listener is not reached) while onCancel runs once.
2. src/ui/components/conversation_view.js:166 (onWheel): any wheel with deltaY<0 that bubbles to the log unpins at once, even when the log never scrolls, e.g. a wheel over a nested scrollable <pre> or tool-output box (overflow:auto) in a caller-rendered body or the extra slot. No scroll event follows, so onScroll never pins again, and settle() (159-162) never pins again either, since noticeMove can only unpin. Reproduced in jsdom: 20 rows while streaming, WheelEvent deltaY -50 on an inner <pre>, then appendChunk and append: isPinned()=false, jump button shown, scrollTop=640 against max=680, so following stopped. This breaks the documented rule (README and header at 39-45) that only the reader scrolling up stops following. Done means: a wheel unpins only if it really moves the log up (e.g. no scrollable element between e.target and the log can take the scroll), or settle()/noticeMove() re-pins whenever the log is within pinThreshold of the end without having moved up. Add a regression test: wheel on an inner element without changing the log's scrollTop, then a chunk, and assert the view still follows.
3. Minor, src/ui/components/conversation_view.js:258-259: beginStream(null) throws 'Cannot read properties of null (reading 'id')', because the `= {}` default covers only undefined, while append(null) builds an empty assistant message. Use `message?.id` and spread `...(message ?? {})` so both treat null the same.

Process note: parallel agents were writing the same scratchpad log name (scratchpad/run.log, used by story-0052 and story-0048), so suites run at the same time need a log name unique to the story.

### 2026-10-19T16:22Z · norman_agent

Landed on main and handed back for review. main is now at 5d873ed1daea59906d1c8519d4a3e5768c6c7807 (fast-forward 04265c6..5d873ed).

What was built: `src/ui/components/conversation_view.js`, a conversation view that holds role-tagged messages (append, replaceAll, clear). beginStream/appendChunk/endStream re-render only the streaming message. A caller render callback draws each body, and each message has an extra slot. Auto-scroll stays pinned to the bottom, and any scroll up stops it and shows jump-to-latest. The scroll position can be read and set. The composer is a growing textarea: Enter submits, Shift+Enter inserts a newline, Esc cancels. setBusy turns send into cancel, and there are submit/cancel callbacks. The view has its `.twm-chat*` rules in css/flexdesk.css, is exported from widgets.js and described in README. Tests are in tests/conversation_view.test.mjs. It has no markdown or LLM dependency.

The three open points from my 2026-10-18 comment are fixed on the branch. A cancelling Esc stops at the view, so a window or panel around it stays open. A wheel that a nested scroller takes keeps following. beginStream(null) works like append(null). The review blocker, the stale module count in the widgets.js header, is fixed too: the header says ' * 52 modules.' over 53 `export * from` lines (main's 51 plus conversation_view.js).

Landing: I rebased story-0057 onto origin/main (04265c6) as a linear history of 9 commits, f864661..5d873ed. That dropped the earlier merge 7415793. Conflicts in README.md, css/flexdesk.css and widgets.js were resolved so both sides stay: main's rows and header text, plus the conversation view. The separate header-count commit 45ee964 became empty and was dropped, because the first commit now carries the right count. Compared with the reviewed tree (45ee964 merged with origin/main), the one difference is that the `.twm-chat` CSS block now comes after SECTION STACK instead of before it, with the same rules. origin/story-0057 still holds the pre-rebase history (45ee964); it was not force-pushed.

Ticked: all six criteria: appendChunk updates only the last message's DOM; scrolling up during streaming stops auto-scroll and shows jump-to-latest, and clicking it resumes; Enter submits and clears, Shift+Enter inserts a newline; setBusy(true) turns send into cancel, and Esc or a click calls cancel once; a render callback that throws shows plain text and the view keeps working; replaceAll restores 100 messages and scrolls to the bottom. Each one is covered by tests/conversation_view.test.mjs.

Tests at 5d873ed, watched to the end: `node tests/run.mjs` gives 'FLEXDESK TESTS: GREEN — 157 suite(s)', exit 0, and no ': SKIPPED' lines. `node tests/conversation_view.test.mjs` exits 0 with 'all assertions passed' and no failing assertions. `node build.mjs` succeeds (exit 0); dist/ was reverted afterwards and is not committed.

App check: none. This is a library component that no app uses yet. EcoSim adopts it in EcoSim STORY-0088 (`../EcoSim/backlog/STORY-0088.md`), and the check in a real app belongs there.

### 2026-10-21T07:42Z · norman_agent (status: review -> done)

norman decided on 2026-10-21 (Claude Code session) to release FlexDesk 0.17.0 now and to accept every story on the 0.17.0 list whose code is on main and whose independent agent review passed, without reviewing each record himself. Its code is on main (audited), so it is done and ships in 0.17.0.
