---
id: 30
type: story
title: "A menu bar widget with submenus, check items and accelerators that the shell can mount and the palette can list"
status: review
parent: 29
phase:
assignee: norman
reporter: norman
due:
points: 8
subsystem: shell
labels: [shell, menu, new-component]
links: []
created: 2026-10-17
updated: 2026-10-19T13:41Z
---

## Description

FlexDesk has .twm-menu-bar CSS but no component, and showContextMenu has no submenus or check items, so every embedder hand-builds File/Edit/View menus. A MenuBar is driven by a declarative model ([{id,label,items}], items {id,label,shortcut,disabled,checked,radio group,separator,submenu: items | () => items}), mounted via a createShell chrome option, and the same model can feed palette commands() so both list identical verbs.

Related EcoSim records: EcoSim STORY-0048 (`../EcoSim/backlog/STORY-0048.md`).

Filed from the EcoSim -> FlexDesk 0.16 migration analysis (2026-10-17).

## Acceptance criteria

- [x] Clicking a title opens its menu
- [x] While a menu is open, hovering another title switches to it
- [x] Alt or F10 focuses the bar
- [x] Left and Right move across menus; Up and Down move within one
- [x] Right opens a submenu and Left closes it
- [x] Esc closes one level and the last Esc returns focus to where it was
- [x] A function-valued submenu is rebuilt each time it opens
- [x] setEnabled(id,false) and setChecked(id,true) update an open menu without rebuilding the bar
- [x] Disabled items and separators are skipped by the keyboard and never reach onAction
- [x] Roles menubar, menu, menuitem, menuitemcheckbox and menuitemradio are present (axe check passes)

## History

- 2026-10-17 · norman_agent · status: draft -> refined
- 2026-10-17 · norman_agent · status: refined -> in-progress
- 2026-10-17 · norman_agent · assignee: (none) -> norman_agent
- 2026-10-19 · norman_agent · status: in-progress -> review
- 2026-10-19 · norman_agent · assignee: norman_agent -> norman

## Comments

### 2026-10-17T07:55Z · norman_agent (status: draft -> refined)

Refined: 10 acceptance criteria, 8 points, parented to EPIC-0029. Criteria were drafted from the migration analysis and checked by a coverage and a quality critic; correct them before anything is built against them.

### 2026-10-18T02:20Z · norman_agent

Where this stands: the work is on branch `story-0030` (origin tip 826e0a4). After two fix rounds, an independent review still finds problems, so the branch has not landed. No criteria are ticked here. The axe check still runs by hand, outside the suite. Putting it inside tests/ would need axe-core as a devDependency.

Still open:

- `src/ui/components/menu_bar.js:629-649` (listeners at :151-153 and :232-234): an Alt+Tab round trip focuses the menu bar. When Alt is pressed, `_altArmed` becomes true. The Tab goes to the OS, so no other keydown reaches the page to clear it. There is no window blur listener, so nothing clears it when the window loses focus either. When the user comes back with Alt+Tab, the Alt keyup reaches the page with `_altArmed` still true, and `_toggle()` takes focus from wherever the user was. Reproduced in jsdom against HEAD (keydown Alt, window 'blur', keyup Alt): focus moves from an input to the 'File' title. Alt+F4 and Alt+Space behave the same way. This breaks criterion 3 as the module header states it ("Alt (pressed and released on its own)"). Done looks like this: clear `_altArmed` on the document's window 'blur' (registered in the constructor and removed in dispose(), like the other document listeners), and add a check to `tests/menu_bar.test.mjs` §3 (keydown Alt, window blur, keyup Alt: focus stays on `outside`). That check must fail on the current HEAD.
- `src/ui/components/menu_bar.js:329-330` (minor, fix while there): `_enter` copies its parameter into a local for no reason (`const a = from;`). Use `from` directly.

### 2026-10-19T13:41Z · norman_agent

Landed on main, and handed back for review. main is now at **8f2d3e1**. I rebased branch `story-0030` onto main e46ef1a and fast-forwarded main to the result. `origin/story-0030` still points at 94a2961, the history from before the rebase, which includes three merges of main. I did not force-push it.

What was built: `createMenuBar(el, { menus, onAction })` and the `MenuBar` class in `src/ui/components/menu_bar.js`, exported from `@flexdesk/widgets`. It takes a declarative model of menus `{ id, label, items }`. Items can be plain, check items (`checked`), radio groups (`radio`), separators, or submenus, either as an array or as a function. It follows the WAI-ARIA menubar pattern and offers `setEnabled`, `setChecked`, `open`, `commands()` and `dispose()`. The styles are `.twm-menubar` in css/base.css and css/flexdesk.css. `createShell` gets `menuBar` and `chrome.menuBar`. If either one is passed without the other, that is a boot error. `shell.chrome.menuBar` is the bar, and the bar's enabled items come after the palette's own `commands`, unless `menuBar.palette` is false. The README has a section on it.

The two findings from 2026-10-18T02:20Z are fixed. The window losing focus now disarms Alt, so an Alt+Tab round trip no longer focuses the bar. The check for this in tests/menu_bar.test.mjs §3 fails when the blur listener is removed. `_enter` now uses `from` directly. Commits made after that comment: Up/Down step from the focused item's own place; the README names `MenuBar` and its methods; Left and Esc close a submenu that is open from the focused item; and keyboard moves within a menu close the submenu below it.

The rebase had conflicts with main's toggle, document outline, tag input, keymap and `single` work in css/base.css, css/flexdesk.css, src/tiling/shell.js, widgets.js and README.md. I kept both sides each time. The last commit, 8f2d3e1, restores a blank line and the "menu bars" wording in the widgets barrel header. With it, the landed tree is byte-identical to a clean `git merge-tree` of 94a2961 and main.

Ticked: all 10 criteria. Criteria 1-9 are covered by tests/menu_bar.test.mjs §1-§9. Criterion 10 is covered by §10 (roles and ARIA structure) and by an axe check.

Tests: `node tests/run.mjs` (Linux node) ran on the rebased tree, which is the tree now on main. I waited for it to finish: `FLEXDESK TESTS: GREEN — 148 suite(s)`, exit 0, with no `: SKIPPED` lines and no failures. `node build.mjs` exited 0, and dist/ was restored afterwards, so it is not committed.

App check: there is no app run. The axe check was done **by hand** and is **not part of the suite**, because putting it in tests/ would need axe-core as a devDependency. I ran axe-core 4.10.2, installed only in a scratch folder, in jsdom against main 8f2d3e1. It ran with tags wcag2a, wcag2aa and best-practice. `color-contrast` was off, since jsdom has no layout or canvas, and the probe page had a title, a lang and a landmark. It found 0 violations in each of four states: bar closed, File open, File with its function submenu open, and View open (1 menuitemcheckbox, 2 menuitemradio). The rules aria-required-children, aria-required-parent, aria-allowed-role and aria-valid-attr-value all ran.
