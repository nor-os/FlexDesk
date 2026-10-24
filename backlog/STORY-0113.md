---
id: 113
type: story
title: "An embedder can leave out the shell's built-in settings categories it does not use"
status: refined
parent: 40
phase:
assignee: norman
reporter: norman
due:
points: 2
subsystem: core
labels: [settings]
links: [relates-to 101]
created: 2026-10-24
updated: 2026-10-24T17:55Z
---

## Description

The app-global settings store always carries the shell's built-in categories (`CATEGORIES` in `src/core/settings.js`), and `SettingsView` and `SettingsCategories` show every category the store has. An embedder that has no notebook editor, for example, still shows a Notebook category whose settings configure nothing, and has no way to remove it short of building its own settings page.

EcoAgent has exactly this case: since its notebook pages were removed, the Notebook category configures nothing. EcoAgent's owner wants it hidden. The EcoAgent side is EcoAgent STORY-0026 (`../EcoAgent/backlog/STORY-0026.md`), where the settings page becomes FlexDesk's `SettingsView`.

Opt-in and generic: no application vocabulary, and a consumer that uses none of it sees no change.

Filed from the EcoAgent -> FlexDesk 0.17 migration (2026-10-24).

## Acceptance criteria

- [ ] An embedder can name built-in categories to leave out (for example when it configures or registers its settings at boot)
- [ ] A left-out category, and every setting in it, appears nowhere in `SettingsView`, `SettingsCategories` or their filter results
- [ ] `getSetting` on a left-out path still returns its default, and writing other settings does not fail because of it
- [ ] With no such option, the store and both views behave exactly as today
- [ ] The README documents it under the release that carries it

## History

- 2026-10-24 · norman_agent · status: (none) -> refined

## Comments
