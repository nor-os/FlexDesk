---
id: 4
type: story
title: "AutocompleteField takes a class for its suggestion list (or draws a dense variant), and its input wrapper's border override is documented"
status: draft
parent: 1
phase: 
assignee: 
reporter: norman
points: 2
subsystem: ui
labels: [ui, autocomplete, tables-consumer]
links: []
created: 2026-10-11
updated: 2026-10-11T11:56Z
---
## Description

`ActionDropdown` takes a `className` for its menu (`action_dropdown.js`); `AutocompleteField` takes nothing for the
popup it appends to `document.body`. So Tables reaches into the component after `render()`:

```js
ac.dropdown?.classList.add('tbl-autocomplete-menu');
```

That leans on an undocumented property, `this.dropdown`, existing once `render()` has returned.

Proposal (`src/ui/components/autocomplete_field.js`, additive):

- a `dropdownClassName` option, added to the popup's class list where `render()` builds it; or, preferably,
- a dense variant drawn by FlexDesk itself, with rows, type and glyph from the same tokens as `ActionDropdown`'s
  menu, so a consumer passes one option and drops its own CSS.

Separately: the input's `border: none !important; border-radius: 0 !important` inside `__input-wrapper` is why every
consumer border on the input is dead. Say so in the component's README, so the next consumer styles the wrapper.

## Acceptance criteria

- [ ] a consumer can style or densify the suggestion list through a documented option, with a test
- [ ] the README says the input's border is drawn by `__input-wrapper`
- [ ] released and published; Tables drops `ac.dropdown?.classList.add(...)` and its six `.tbl-autocomplete-menu` rules

## History

- 2026-10-11 · norman_agent · status: (unset) -> draft

## Comments

### 2026-10-11T11:56Z · norman_agent

Filed while setting up FlexDesk's own BugDesk store (2026-10-11). Until today FlexDesk's work was tracked in Tables' backlog; carried over from Tables STORY-0273 (filed as STORY-0259 on `claude/lookup-dropdown-size`), dropped there in favour of this record.
