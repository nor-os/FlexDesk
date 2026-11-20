---
id: 138
type: story
title: "A secret setting: the settings form draws an API key, password or token whose value the settings never hold"
status: done
parent:
phase:
assignee: norman
reporter: norman_agent
due:
points:
subsystem: flow
labels: [flow, settings-panel, widgets, security]
links: ["EcoSim EPIC-0174"]
created: 2026-11-18
updated: 2026-11-18
---

## Description

The flow kit's settings form (`createSettingsPanel`, `src/flow/kit/settings_panel.js`) reports every field's value to `onChange`, and the consumer writes it into the step's settings: into a file. An API key, a password or a token must not go there. EcoSim's ETL Sources (EcoSim EPIC-0174, `../EcoSim/backlog/EPIC-0174.md`) keep them in the OS credential store; the Source editor draws a source type's connection settings with this panel, and its secret fields had no control (the schema subset has no password format, and a plain text box would write the secret into the file).

A generic widget, `secret`, chosen by `'x-ui-widget': 'secret'`:

1. **The value never enters the settings.** The panel takes a keeper, `secrets: {status(q), store(q, text), clear(q)}` with `q = {stepId, step, key, path}`; the widget asks it whether a secret is stored and hands it what the reader types. It never calls `ctx.set` with a secret, and never asks for or shows the stored one.
2. **What it draws.** *Checking…*, then *Stored* (*Replace*, *Clear*), *Not stored* (*Set*), or *Not known* with the keeper's reason. *Set* opens a password box (`autocomplete="new-password"`) with *Save* and *Cancel*; Enter saves, Escape cancels. The box and its buttons are built once, so a repaint while a save is in flight keeps the focus and the typed text.
3. **Refusals.** A keeper's `{ok: false, error}` or a throw is said under the field; the typed text stays and the box keeps the focus. Without a keeper the field is refused on screen and writes nothing.
4. **A secret already in the settings** (written into a file) is said, with *Remove from the settings*: the one write the widget makes, `undefined`.
5. **The editors hand it on.** The lane, canvas and outline editors take `secrets` and pass it to their panel.
6. **The schema subset is unchanged.** The hint is an `x-` key, which a server checking the subset ignores; `format` stays `"uuid"` only, so the sentence-for-sentence contract with the server's `check_schema` holds.

## Acceptance criteria

- [x] `secret` is the eleventh generic widget; `createSettingsPanel`, `createLaneEditor`, `createCanvasEditor` and `createOutlineEditor` take `secrets`.
- [x] Saving hands the text to the keeper; no `onChange`, the step's config and the panel's working copy untouched; the box emptied (`tests/flow_kit_secret.test.mjs` §2).
- [x] Stored / Not stored / Not known, Replace, Clear, Enter, Escape, refusals and throws, no keeper, read only, a value in the settings (§1, §3–§6).
- [x] Every class it sets has a rule in the kit's section of `css/flexdesk.css` (`flow_kit_css.test.mjs`).
- [x] Documented: `docs/components/flow-editors.md` (Secrets), the lane, canvas and outline editors' options.
- [x] Released as 0.20.0; the CHANGELOG names the widget and the `secrets` option.
- [x] EcoSim's Source editor uses it (EcoSim EPIC-0174 story 5).

## History

- 2026-11-18 · norman_agent · status: (none) -> in-progress
- 2026-11-20 · norman_agent · status: in-progress -> done (EcoSim's Source editor uses it)

## Comments
