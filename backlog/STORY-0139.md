---
id: 139
type: story
title: "A list of records: the settings form draws an array of objects as a card per record, with Add and Remove"
status: done
parent:
phase:
assignee: norman
reporter: norman_agent
due:
points:
subsystem: flow
labels: [flow, settings-panel, widgets]
links: ["EcoSim EPIC-0174"]
created: 2026-11-20
updated: 2026-11-20
---

## Description

The flow kit's settings form drew no control for a setting whose schema is a list of objects (`{type: 'array', items: {type: 'object', properties}}`): the field said *This setting has no control in this editor; its value is kept as it is.* EcoSim's Source editor (EcoSim EPIC-0174) keeps a Source's custom headers in such a list (`{name, secret, value}` each, the value only for a header that is not secret), so its headers could not be added or edited.

A list of records is drawn without a widget name, from the schema, as an object with properties is:

1. **A card per record** of its own fields, drawn by `renderField` from `items.properties`; an `x-ui-when` reads the record's own fields. *Remove* at the card's top right; *Add* (`x-ui-add-label`) appends an empty record and focuses its first control.
2. **Values kept.** Every edit writes the whole list; a record keeps the values no field draws; an entry that is no object is kept and said on its card; the list emptied removes the setting.
3. **Paths.** Record `i`'s fields carry `<key>.<i>.<field>`, in the field's `paths()` and `fieldAt()`, so findings and `focusField` reach them.
4. **Read only:** no *Add* or *Remove*, the cards' controls read only.
5. **The schema subset is unchanged** (`items` was in it).

## Acceptance criteria

- [x] A list of records drawn as cards, Add, Remove, x-ui-when within a record, values kept, paths, read only (`tests/flow_kit_widgets.test.mjs` §13).
- [x] Every class it sets has a rule in the kit's section of `css/flexdesk.css` (`flow_kit_css.test.mjs`).
- [x] Documented: `docs/components/flow-editors.md` (A list of records).
- [x] Released as 0.21.0; the CHANGELOG names it.
- [ ] EcoSim's Source editor draws its custom headers with it (EcoSim EPIC-0174).

## History

- 2026-11-20 · norman_agent · status: (none) -> done

## Comments
