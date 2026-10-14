---
id: 26
type: story
title: "Custom window chrome in a Photino window: the host says so, and the title-bar buttons and drag area work for any app"
status: draft
parent: 23
phase:
assignee:
reporter: norman
due:
points:
subsystem: host
labels: [desktop]
links: []
created: 2026-10-14
updated: 2026-10-14T17:52Z
---

## Description

FlexDesk can draw a frameless window's chrome: `WindowChromeController`, ported
from EcoSim, draws resize handles, wires minimise, maximise and close buttons,
drags the window by the top bar and syncs the maximised state. Today only the
pywebview host can turn it on. `photino_host.js` answers `chrome()` with a
hardcoded `native` (STORY-0015's criterion), so a Photino app that opens its
window chromeless gets no chrome at all.

BugDesk wants its desktop window frameless (BugDesk STORY-0042,
`../bugdesk/backlog/STORY-0042.md`). For that, FlexDesk needs:

- **The Photino host reports custom chrome when the window is chromeless.** The
  native side has to tell the page, for example in `host.describe` or as a URL
  flag the way the pywebview host's `?frameless=1` does, and it has to be known
  before the shell is built.
- **The window buttons as FlexDesk markup and CSS.** The controller finds
  `#win-minimize`, `#win-maximize` and `#win-close` but nothing in FlexDesk
  draws them; EcoSim had them in its own HTML. An embedder should get the
  buttons (and their maximise/restore icon state) without writing them.
- **The drag area doesn't depend on EcoSim's names.** The no-drag selector lists
  `.menu-item`, `.menu-dropdown`, `.global-search-dropdown`, `.panel-toggles`
  and others from EcoSim's top bar. It should be FlexDesk's own top-bar classes
  plus an opt-out an embedder can put on its controls.
- **Resizing feels native enough** over `getBounds`/`setBounds` round trips
  through Photino's web messages, which are slower than pywebview's calls. That
  may need throttling, or a native drag or resize op the host offers instead
  (Windows can hand a drag or a resize to the OS, which also brings back
  snapping).

The pywebview host and a browser tab behave exactly as today.

## Acceptance criteria

_(not refined yet)_

## History

## Comments

### 2026-10-14T17:52Z · norman_agent

Filed with BugDesk STORY-0042, which needs it. Refinement should follow that
story's trial in WebView2: whether JS-driven resizing is good enough, or the host
needs native drag and resize operations.
