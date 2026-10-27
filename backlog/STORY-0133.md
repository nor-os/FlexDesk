---
id: 133
type: story
title: "The menu bar can be a hamburger button (style: 'hamburger', setStyle)"
status: review
parent: 68
phase:
assignee: norman
reporter: norman
due:
points: 3
subsystem: tiling
labels: [menus]
links: [relates-to 30, relates-to 119]
created: 2026-10-27
updated: 2026-10-27T10:45Z
---

## Description

norman, 2026-10-27: EcoSim and EcoAgent have slightly different top bars. EcoAgent's hamburger menu is preferred over EcoSim's File… menu row, and FlexDesk should support switching between the hamburger and the File… menu.

`createMenuBar` draws one title per menu. An embedder that wants the menus behind one button has to build that itself, and lose the bar's keyboard, ARIA, setEnabled/setChecked and palette rows.

## Acceptance criteria

- [x] `createMenuBar(el, { style: 'hamburger' })` draws one icon button (`icon`, default 'menu', named by `label`); its menu lists the menus and each flies out its items
- [x] The same model: `onAction` fires with the item's own id; `setEnabled`, `setChecked`, `commands()` work as in the bar; `open(menuId)` opens the hamburger with that menu flown out
- [x] Keyboard: Alt/F10 focuses the button, Down opens it, Right/Left fly a menu out and close it, Esc closes one level; Left/Right at the top go nowhere
- [x] `setStyle('bar' | 'hamburger')` switches at run time, keeping state; an unknown style is a TypeError; `createShell`'s `menuBar.style` passes through
- [x] Styled in the MENU BAR section (both sheets), sized as the top bar's other icon buttons; docs and CHANGELOG
- [x] A press inside a menu bar (an open menu's padding or separator) never starts a window drag (`WindowChromeController`)

## History

- 2026-10-27 · norman_agent · created (in-progress)
- 2026-10-27 · norman_agent · status: in-progress -> review
- 2026-10-27 · norman_agent · assignee: norman_agent -> norman

## Comments

### 2026-10-27T10:45Z · norman_agent (status: in-progress -> review)

Built on branch story-0133. `tests/menu_bar.test.mjs` §14 drives the hamburger (pointer, keys, open(), setStyle, createShell); `tests/menu_bar_css.test.mjs` harvests its classes. Full suite: 218 of 219 green; `exports_packed` fails only because it runs Windows npm against a WSL path, unrelated to this change.
