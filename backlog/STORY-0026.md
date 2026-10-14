---
id: 26
type: story
title: "Custom window chrome in a Photino window: the host says so, and the title-bar buttons and drag area work for any app"
status: review
parent: 23
phase:
assignee: norman
reporter: norman
due:
points: 3
subsystem: host
labels: [desktop]
links: []
created: 2026-10-14
updated: 2026-10-14T18:32Z
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

- [x] In a Photino window whose native side answers `host.describe` with `frame: "custom"`, `host.window.chrome()` resolves to `custom`. Without that field, with any other value, or with no answer within 3 s, it is `native`. An embedder can also fix it with `createPhotinoHost({ chrome })`
- [x] With custom chrome, `WindowChromeController` draws minimise, maximise/restore and close buttons into the top bar the embedder names (an embedder's own `#win-*` buttons are used instead when present), and the maximise icon follows the window's state however it changed
- [x] A drag on an empty part of the top bar, and a press on a resize handle, are handed to the host's native drag and resize (`window.startNativeDrag`, `window.startNativeResize(edge)`), so the window snaps and resizes like a native one. A host without them gets today's JS move and resize
- [x] `flexdesk.css` gives the resize handles their place and size (6px edges, 12px corners, hidden while maximised) and styles the buttons. In a browser tab, or a window with native chrome, none of it is in the page
- [x] The top bar and the controls' container are options, and the drag area's no-drag list is FlexDesk's own (buttons, inputs, links, `.no-drag`, the window controls) plus what an embedder adds, not EcoSim's class names
- [x] `photino_host.md` documents `frame`, `startDrag` and `startResize`, and what the native side does to keep snapping, shadow and rounded corners (the frame styles kept, `WM_NCCALCSIZE`, `WM_NCLBUTTONDOWN`)
- [x] The pywebview host and a browser tab behave as before, and all of the above is covered by tests

## History

- 2026-10-14 · norman_agent · status: draft -> refined
- 2026-10-14 · norman_agent · status: refined -> in-progress
- 2026-10-14 · norman_agent · assignee: (unset) -> norman_agent
- 2026-10-14 · norman_agent · status: in-progress -> review
- 2026-10-14 · norman_agent · assignee: norman_agent -> norman

## Comments

### 2026-10-14T17:52Z · norman_agent

Filed with BugDesk STORY-0042, which needs it. Refinement should follow that
story's trial in WebView2: whether JS-driven resizing is good enough, or the host
needs native drag and resize operations.

### 2026-10-14T18:16Z · norman_agent

Refined: 7 acceptance criteria, 3 points, under EPIC-0023. Written from BugDesk
STORY-0042's trial: the frame kept but not drawn on the native side, and drags
and resizes handed to Windows, which norman confirmed by hand ("all working").
The trial also found the gaps listed here: the resize handles have no CSS, no
buttons are drawn, and the top bar is found only by FlexDesk's class name. Every
mode stays available: browser, an app window with native chrome, and one with
custom chrome.

### 2026-10-14T18:32Z · norman_agent

Built and released as **FlexDesk 0.15.0** (a7bef1b, release f6d751d, on npm).
All 7 criteria ticked:

- `createPhotinoHost` takes `chrome: 'auto' | 'native' | 'custom'`. In `auto`,
  `window.chrome()` asks `host.describe` once, the first time it's needed, and
  resolves `custom` only for `frame: "custom"`. Anything else, or no answer
  within 3 s, is `native`. New `startNativeDrag()` / `startNativeResize(edge)`
  wait for mouse-up with no timeout; a refusal resolves `false`. `host.js`
  lists `startNativeResize` as optional.
- `WindowChromeController.initialize()` is now async (it awaits `chrome()`) and
  resolves `true` only with custom chrome. New options: `topBar`, `controls`
  (where the three buttons are drawn when the page has no `#win-*` buttons of
  its own) and `noDrag`. The no-drag list is now generic (buttons, links,
  inputs, roles, `.no-drag`) instead of EcoSim's class names. A press on a
  handle goes to `startNativeResize` when the host has it, otherwise to the JS
  resize as before. Dispose removes the buttons and body classes too.
- `flexdesk.css`: the handles' place and size, and `.twm-window-controls`.
- `photino_host.md`: the three modes, `describe`'s `frame`, the
  `startDrag`/`startResize` ops, and the Windows recipe (keep the styles,
  `WM_NCCALCSIZE`, `WM_NCACTIVATE`, the DWM margin and corners,
  `WM_NCLBUTTONDOWN`), with why not `SetChromeless`. README section "A window
  with its own chrome (0.15.0)".
- Tests: `photino_host.test.mjs` §6 (frame answers, the pinned option, the
  gestures, no timeout on a drag) and a new `window_chrome_controller.test.mjs`
  (browser and native chrome add nothing, buttons in the named container,
  native gestures, the JS fallback, the icon following a snap, dispose). All 95
  suites pass, none skipped.

Verified for real in BugDesk's desktop window (BugDesk STORY-0042, fdf2598):
custom frame with buttons and handles, a browser tab with none, and
`BUGDESK_DESKTOP_FRAME=native` with none.
