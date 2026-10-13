---
id: 11
type: story
title: "openForm: field-change hook, a picker field, a creatable select, and hidden rows that stay hidden"
status: review
parent:
phase:
assignee: norman
reporter: norman
points: 3
subsystem: widgets
labels: [modal, bugdesk-consumer]
links: []
created: 2026-10-12
updated: 2026-10-13T04:34Z
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

- [x] `openForm({ onFieldChange })` calls it once on open and after every field change, and its `api` can hide and show fields and named sections and read and set values
- [x] A `type: 'picker'` field shows its value read-only with a search button; the button awaits the field's `pick()`, and the value it returns is shown and submitted
- [x] A select with `create: true` accepts a typed value that is not among its options and submits it
- [x] A row hidden through `setVisible(name, false)` is not displayed, whatever the field type
- [x] A form using none of these behaves as in 0.9.1; each addition has a test in `tests/`, the README documents it, `tests/run.mjs` is GREEN and `node build.mjs --check` is OK

## History

- 2026-10-12 · norman_agent · status: refined -> in-progress
- 2026-10-12 · norman_agent · assignee: (unset) -> norman_agent
- 2026-10-13 · norman_agent · status: in-progress -> review
- 2026-10-13 · norman_agent · assignee: norman_agent -> norman

## Comments

### 2026-10-13T04:34Z · norman_agent (status: in-progress -> review)

Released in **0.11.0** (af11fb4, on npm). All criteria are met.

- `onFieldChange(name, value, api)` runs once on open (`name === null`) and
  after every field change. `api.setVisible / get / set` address fields and
  named sections.
- `type: 'picker'`: a read-only display plus a search button that awaits
  `pick()`. The answer is shown and submitted, and `required` is checked by
  the form.
- `create: true` on a select submits a typed value that isn't in the list.
- A row hidden through `setVisible` stays hidden (CSS fix). Its `required` is
  off while hidden, so an invisible field can't block the submit.
- A form using none of these renders byte-identical markup to 0.9.1.
- New suite `open_form.test.mjs` (48 assertions); README section "Forms:
  `openForm`".
