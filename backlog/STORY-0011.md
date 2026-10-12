---
id: 11
type: story
title: "openForm: field-change hook, a picker field, a creatable select, and hidden rows that stay hidden"
status: in-progress
parent:
phase:
assignee: norman_agent
reporter: norman
points: 3
subsystem: widgets
labels: [modal, bugdesk-consumer]
links: []
created: 2026-10-12
updated: 2026-10-12T13:06Z
---

## Description

BugDesk ships its own copy of `modal.js` (`bugdesk/ui/js/ui/components/modal.js`)
for four additions to `openForm` that FlexDesk lacks. Its BugDesk STORY-0022
(`../bugdesk/backlog/STORY-0022.md`) deletes the copy once FlexDesk has them:

- `onFieldChange(name, value, api)`, called after any field changes and once
  on open, with `api = { setVisible(name, on), get(name), set(name, value) }`
  addressing fields and named sections. A form whose Type select spans two
  record kinds shows the fields of the chosen kind without being rebuilt.
- a `picker` field: a read-only display and a search button that calls the
  field's `pick()` and shows what it returns
- `create: true` on a select: the user may type a value that is not in the
  list
- a row hidden through `setVisible` stays hidden; a CSS display rule was
  showing it again

All four are opt-in. A form that uses none behaves as in 0.9.1.

## Acceptance criteria

- [ ] `openForm({ onFieldChange })` calls it once on open and after every field change, and its `api` can hide and show fields and named sections and read and set values
- [ ] A `type: 'picker'` field shows its value read-only with a search button; the button awaits the field's `pick()`, and the value it returns is shown and submitted
- [ ] A select with `create: true` accepts a typed value that is not among its options and submits it
- [ ] A row hidden through `setVisible(name, false)` is not displayed, whatever the field type
- [ ] A form using none of these behaves as in 0.9.1; each addition has a test in `tests/`, the README documents it, `tests/run.mjs` is GREEN and `node build.mjs --check` is OK

## History

- 2026-10-12 · norman_agent · status: refined -> in-progress
- 2026-10-12 · norman_agent · assignee: (unset) -> norman_agent
