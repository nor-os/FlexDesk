---
id: 137
type: story
title: "The attribute editor themes its inherited and overridden rows from tokens, draws read-only columns, reverts to null and gives every cell one height"
status: draft
parent:
phase:
assignee: norman
reporter: norman_agent
due:
points:
subsystem: widgets
labels: [widgets, attribute-editor, theming, migration]
links: ["EcoSim EPIC-0171", "EcoSim STORY-0173"]
created: 2026-11-07
updated: 2026-11-07
---

## Description

`mountAttributeListEditor` (`src/ui/components/attribute_list_editor.js`) with `parentAttributes` shows a child's attributes against its parent: inherited rows green, overridden rows orange with a marker and an undo. EcoAgent uses it for a market branch (`../EcoAgent/ui/js/ecoagent/tabs/market_tab.js`, `_renderBranchAttrInheritance`). EcoSim is to use it for a scenario's assumptions against the model's parameters (EcoSim EPIC-0171, STORY-0173, `../EcoSim/backlog/`). It was lifted from EcoAgent and still carries it:

1. **Colours.** `css/flexdesk.css` (`.twm-attr-editor__*`) gives the states fixed colours for a dark background: `rgba(96, 192, 96, …)` and `#60c060` green, `rgba(204, 120, 65, …)`, `#d18138` and `#f0c189` orange, `#b48be0` purple, `#1e1e1e`, `#ddd`, `#444`, and EcoAgent's `--ea-input-bg`, `--ea-text`, `--ea-text-muted`, `--ea-text-dim`, `--ea-border`, `--ea-bg-chrome`. In a light theme the rows and inputs stay dark. They become FlexDesk tokens with light and dark values, alongside the surface and control tokens (`--surface-control`, `--border-control`).
2. **Read-only columns.** `name` and `default` always render as inputs. EcoSim shows the model's parameter and its default, which the scenario does not change. A `readonlyColumns` option draws the named columns as text, at the cell height (4).
3. **Revert writes null.** The undo writes the parent's value into `value`, so the child stores an override equal to its default. It writes `null`, which is what "inherited" means. EcoAgent's own flush already treats a null value as inherited (`market_tab.js`, `flushOverrides`), so its branches keep working and stop storing such overrides.
4. **One cell height.** Each cell sizes by its own padding and font (`.twm-attr-editor__cell` `padding: 0.25em 0.4em`; `--readonly` at `0.85em` with a dashed border; a select with its own arrow padding), so the cells of a row differ in height. Every cell of a row (input, select, read-only, and a cell a caller supplies through `cellOverrides`) has one height in every row state, from a token (`--twm-attr-editor-cell-height`). A supplied cell takes it through the cell class.

Filed from EcoSim EPIC-0171 (2026-11-07). EcoSim pins the release that has this before it builds STORY-0173.

## Acceptance criteria

- [ ] The editor's inherited, overridden, forced, optional and disabled states, its cells, the attention marker and the undo use tokens with light and dark values; `css/flexdesk.css` has no fixed colour and no `--ea-*` variable left in `.twm-attr-editor__*`. Checked in a light and a dark theme.
- [ ] `readonlyColumns: ['name', 'default']` draws those cells as text: no input, the value readable, the row's colour kept.
- [ ] The undo on an overridden row sets `value` to `null`; the row is inherited after it; `onChange` and `onFlush` report it.
- [ ] Every cell of a row has the same height, in every state: an input, a select, a read-only cell and a supplied cell, measured in a test.
- [ ] EcoAgent's branch attributes (`market_tab.js`) still load, revert and save with the release.
- [ ] Released; the CHANGELOG names the four changes, and the undo's `null` as a behaviour change.

## History

- 2026-11-07 · norman_agent · status: (none) -> draft

## Comments
